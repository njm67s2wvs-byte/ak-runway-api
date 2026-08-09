```javascript
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
        limit: "12mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "12mb"
    })
);

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

            // ========================================
            // API KEY
            // ========================================

            if (!RUNWAY_API_KEY) {

                return res.status(500).json({

                    error:
                        "RUNWAYML_API_SECRET is not configured."

                });

            }


            // ========================================
            // REQUEST DATA
            // ========================================

            const {
                prompt,
                images,
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
            // VALIDATE IMAGES
            // ========================================

            let referenceImages = [];

            if (Array.isArray(images)) {

                referenceImages =
                    images
                        .filter(
                            image =>
                                typeof image === "string" &&
                                image.startsWith("data:image/")
                        )
                        .slice(0, 2);

            }


            // ========================================
            // CHECK IMAGE SIZE
            // ========================================

            for (
                const image of referenceImages
            ) {

                if (
                    image.length >
                    5 * 1024 * 1024
                ) {

                    return res.status(400).json({

                        error:
                            "Each reference image must be smaller than 5MB."

                    });

                }

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
accurate character identity,
natural facial expressions,
realistic physics,
professional film look,
smooth motion,
no subtitles,
no text overlays.

Use the supplied character references to maintain
the appearance and identity of the characters.
        `.trim();


            // ========================================
            // RUNWAY PROMPT LIMIT
            // ========================================

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
                    "seedance2",

                promptText:
                    finalPrompt,

                ratio:
                    ratio,

                duration:
                    videoDuration

            };


            // ========================================
            // IMAGES
            // ========================================

            if (
                referenceImages.length === 1
            ) {

                // One image:
                // use it as the main image.

                requestBody.promptImage =
                    referenceImages[0];

            }


            if (
                referenceImages.length === 2
            ) {

                // Two images:
                //
                // First image = main image
                // Second image = character reference

                requestBody.promptImage =
                    referenceImages[0];

                requestBody.references = [

                    {
                        type:
                            "image",

                        uri:
                            referenceImages[1]
                    }

                ];

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


            // ========================================
            // READ RESPONSE
            // ========================================

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
            // TASK ID
            // ========================================

            if (
                !runwayData.id
            ) {

                return res.status(500).json({

                    error:
                        "Runway did not return a task ID."

                });

            }


            // ========================================
            // SUCCESS
            // ========================================

            return res.json({

                success:
                    true,

                taskId:
                    runwayData.id,

                charactersReceived:
                    referenceImages.length

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

            // ========================================
            // API KEY
            // ========================================

            if (!RUNWAY_API_KEY) {

                return res.status(500).json({

                    error:
                        "RUNWAYML_API_SECRET is not configured."

                });

            }


            // ========================================
            // TASK ID
            // ========================================

            const taskId =
                req.params.taskId;


            if (!taskId) {

                return res.status(400).json({

                    error:
                        "Task ID is required."

                });

            }


            // ========================================
            // STATUS REQUEST
            // ========================================

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


            // ========================================
            // READ DATA
            // ========================================

            const data =
                await response.json();


            // ========================================
            // ERROR
            // ========================================

            if (!response.ok) {

                console.error(
                    "Runway status error:",
                    data
                );


                return res.status(
                    response.status
                ).json({

                    error:
                        data.error ||
                        data.message ||
                        "Unable to check task.",

                    details:
                        data

                });

            }


            // ========================================
            // RESULT
            // ========================================

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
                Array.isArray(data.output) &&
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


            // ========================================
            // RETURN
            // ========================================

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
```
