const express = require("express");

const app = express();

const PORT =
    process.env.PORT || 3000;

const RUNWAY_API_KEY =
    process.env.RUNWAYML_API_SECRET;


// ========================================
// MIDDLEWARE
// ========================================

app.use(
    express.json({
        limit: "15mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "15mb"
    })
);


// Serve website
app.use(
    express.static(__dirname)
);


// ========================================
// HEALTH CHECK
// ========================================

app.get(
    "/api/health",
    (req, res) => {

        res.json({
            ok: true,
            service:
                "AK AI Video Studio"
        });

    }
);


// ========================================
// GENERATE VIDEO
// ========================================

app.post(
    "/api/generate",
    async (req, res) => {

        try {

            if (!RUNWAY_API_KEY) {

                return res.status(500).json({

                    error:
                        "RUNWAYML_API_SECRET is not configured."

                });

            }


            const {
                prompt,
                image,
                aspect = "9:16",
                duration = 10
            } = req.body;


            // ========================================
            // VALIDATE PROMPT
            // ========================================

            if (
                typeof prompt !== "string" ||
                !prompt.trim()
            ) {

                return res.status(400).json({

                    error:
                        "Video prompt is required."

                });

            }


            // ========================================
            // DURATION
            // ========================================

            let videoDuration =
                Number(duration);


            if (
                !Number.isFinite(
                    videoDuration
                )
            ) {

                videoDuration = 10;

            }


            videoDuration =
                Math.max(
                    2,
                    Math.min(
                        10,
                        Math.round(
                            videoDuration
                        )
                    )
                );


            // ========================================
            // RATIO
            // ========================================

            const ratioMap = {

                "9:16":
                    "720:1280",

                "16:9":
                    "1280:720",

                "1:1":
                    "960:960"

            };


            const ratio =
                ratioMap[aspect] ||
                "720:1280";


            // ========================================
            // CINEMATIC PROMPT
            // ========================================

            const cinematicPrompt = `
Create a high-quality cinematic AI video.

Story:
${prompt.trim()}

Visual direction:
cinematic composition,
realistic natural motion,
expressive character acting,
detailed environment,
dramatic professional lighting,
realistic camera movement,
strong depth and atmosphere,
consistent character appearance,
professional film look,
smooth motion,
natural facial expressions,
realistic physics,
accurate character identity,
no subtitles,
no text overlays.
            `.trim();


            // Runway accepts up to 1000
            // UTF-16 characters.
            const finalPrompt =
                cinematicPrompt.slice(
                    0,
                    1000
                );


            // ========================================
            // REQUEST BODY
            // ========================================

            const requestBody = {

                model:
                    "gen4.5",

                promptText:
                    finalPrompt,

                ratio:
                    ratio,

                duration:
                    videoDuration

            };


            // ========================================
            // REFERENCE IMAGE
            // ========================================

            if (image) {

                if (
                    typeof image !== "string"
                ) {

                    return res.status(400).json({

                        error:
                            "Invalid image format."

                    });

                }


                if (
                    !image.startsWith(
                        "data:image/"
                    )
                ) {

                    return res.status(400).json({

                        error:
                            "Reference image must be a valid data URI."

                    });

                }


                requestBody.promptImage =
                    image;

            }


            // ========================================
            // RUNWAY API
            // ========================================

            const runwayResponse =
                await fetch(
                    "https://api.dev.runwayml.com/v1/image_to_video",
                    {

                        method:
                            "POST",

                        headers: {

                            "Authorization":
                                `Bearer ${RUNWAY_API_KEY}`,

                            "Content-Type":
                                "application/json",

                            "X-Runway-Version":
                                "2024-11-06"

                        },

                        body:
                            JSON.stringify(
                                requestBody
                            )

                    }
                );


            const runwayData =
                await runwayResponse.json();


            // ========================================
            // RUNWAY ERROR
            // ========================================

            if (
                !runwayResponse.ok
            ) {

                console.error(
                    "Runway API error:",
                    runwayData
                );


                return res.status(
                    runwayResponse.status
                ).json({

                    error:
                        runwayData.error ||
                        runwayData.message ||
                        "Runway API request failed.",

                    details:
                        runwayData

                });

            }


            // ========================================
            // SUCCESS
            // ========================================

            if (
                !runwayData.id
            ) {

                return res.status(500).json({

                    error:
                        "Runway did not return a task ID."

                });

            }


            return res.json({

                success:
                    true,

                taskId:
                    runwayData.id

            });


        } catch (error) {

            console.error(
                "Generation error:",
                error
            );


            return res.status(500).json({

                error:
                    "Server error while starting video generation."

            });

        }

    }
);


// ========================================
// CHECK VIDEO STATUS
// ========================================

app.get(
    "/api/status/:taskId",
    async (req, res) => {

        try {

            if (!RUNWAY_API_KEY) {

                return res.status(500).json({

                    error:
                        "RUNWAYML_API_SECRET is not configured."

                });

            }


            const taskId =
                req.params.taskId;


            if (!taskId) {

                return res.status(400).json({

                    error:
                        "Task ID is required."

                });

            }


            const response =
                await fetch(

                    `https://api.dev.runwayml.com/v1/tasks/${encodeURIComponent(taskId)}`,

                    {

                        method:
                            "GET",

                        headers: {

                            "Authorization":
                                `Bearer ${RUNWAY_API_KEY}`,

                            "X-Runway-Version":
                                "2024-11-06"

                        }

                    }

                );


            const data =
                await response.json();


            if (!response.ok) {

                return res.status(
                    response.status
                ).json({

                    error:
                        data.error ||
                        data.message ||
                        "Unable to check task."

                });

            }


            const result = {

                id:
                    data.id,

                status:
                    data.status

            };


            // ========================================
            // SUCCESS
            // ========================================

            if (
                data.status === "SUCCEEDED" &&
                Array.isArray(
                    data.output
                ) &&
                data.output.length > 0
            ) {

                result.videoUrl =
                    data.output[0];

            }


            // ========================================
            // FAILED
            // ========================================

            if (
                data.status === "FAILED"
            ) {

                result.error =
                    data.failure ||
                    data.failureCode ||
                    "Video generation failed.";

            }


            return res.json(
                result
            );


        } catch (error) {

            console.error(
                "Status error:",
                error
            );


            return res.status(500).json({

                error:
                    "Server error while checking generation status."

            });

        }

    }
);


// ========================================
// START SERVER
// ========================================

app.listen(
    PORT,
    () => {

        console.log(
            `AK AI Video Studio running on port ${PORT}`
        );

    }
);
