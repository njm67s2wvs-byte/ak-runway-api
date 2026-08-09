```javascript
const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

const RUNWAY_API_KEY =
    process.env.RUNWAYML_API_SECRET;

const RUNWAY_API_URL =
    "https://api.dev.runwayml.com/v1";

const RUNWAY_API_VERSION =
    "2024-11-06";


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
            service: "AK AI Video Studio"
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

                /*
                 * Runway data URI maximum:
                 * 5MB per image.
                 */

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
                !Number.isFinite(videoDuration)
            ) {

                videoDuration = 10;

            }


            /*
             * Runway image-to-video:
             * 2 - 10 seconds.
             */

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

            let cinematicPrompt = `
Create a high-quality cinematic AI video.

Story:
${prompt.trim()}

Character instructions:
Use the supplied character reference image or images
to preserve the characters' visual identity, appearance,
colors, clothing, facial features and overall design.

If two character references are supplied, treat them
as two separate characters and keep their identities
consistent throughout the entire scene.

Do not merge the characters.
Do not replace their appearance.
Do not redesign the characters.

Visual direction:
cinematic composition,
realistic natural motion,
expressive character acting,
detailed environment,
dramatic professional lighting,
realistic camera movement,
strong depth and atmosphere,
natural facial expressions,
realistic physics,
smooth motion,
professional film look,
no subtitles,
no text overlays.
        `.trim();


            // ========================================
            // RUNWAY PROMPT LIMIT
            // ========================================

            cinematicPrompt =
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
                    cinematicPrompt,

                ratio:
                    ratio,

                duration:
                    videoDuration

            };


            // ========================================
            // IMAGE INPUT
            // ========================================

            /*
             * With one image:
             * use it as the first frame/reference.
             */

            if (
                referenceImages.length === 1
            ) {

                requestBody.promptImage =
                    referenceImages[0];

            }


            /*
             * With two images:
             *
             * Runway's API version 2024-11-06
             * defines multiple promptImage entries
             * as positional images.
             *
             * "first" = first frame
             * "last"  = last frame
             *
             * Therefore we DO NOT pretend that this
             * means "two character references".
             *
             * We instead use the first image as the
             * actual prompt image and explicitly tell
             * Seedance 2 about the second character
             * through the prompt.
             *
             * The second image is NOT silently sent
             * using an unsupported "references" field.
             */

            if (
                referenceImages.length === 2
            ) {

                requestBody.promptImage =
                    referenceImages[0];

                /*
                 * Keep the second image available
                 * in our own request validation.
                 *
                 * It is intentionally not inserted
                 * into an unsupported Runway field.
                 */

            }


            // ========================================
            // CALL RUNWAY
            // ========================================

            const runwayResponse =
                await fetch(
                    `${RUNWAY_API_URL}/image_to_video`,
                    {

                        method:
                            "POST",

                        headers: {

                            "Authorization":
                                `Bearer ${RUNWAY_API_KEY}`,

                            "Content-Type":
                                "application/json",

                            "X-Runway-Version":
                                RUNWAY_API_VERSION

                        },

                        body:
                            JSON.stringify(
                                requestBody
                            )

                    }
                );


            // ========================================
            // READ RUNWAY RESPONSE
            // ========================================

            const runwayText =
                await runwayResponse.text();


            let runwayData;

            try {

                runwayData =
                    JSON.parse(
                        runwayText
                    );

            } catch {

                runwayData = {
                    message:
                        runwayText
                };

            }


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

                console.error(
                    "Unexpected Runway response:",
                    runwayData
                );


                return res.status(500).json({

                    error:
                        "Runway did not return a task ID.",

                    details:
                        runwayData

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
            // RUNWAY STATUS
            // ========================================

            const response =
                await fetch(
                    `${RUNWAY_API_URL}/tasks/${encodeURIComponent(taskId)}`,
                    {

                        method:
                            "GET",

                        headers: {

                            "Authorization":
                                `Bearer ${RUNWAY_API_KEY}`,

                            "X-Runway-Version":
                                RUNWAY_API_VERSION

                        }

                    }
                );


            // ========================================
            // READ RESPONSE
            // ========================================

            const responseText =
                await response.text();


            let data;

            try {

                data =
                    JSON.parse(
                        responseText
                    );

            } catch {

                data = {
                    message:
                        responseText
                };

            }


            // ========================================
            // ERROR
            // ========================================

            if (
                !response.ok
            ) {

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
                data.status === "SUCCEEDED"
            ) {

                if (
                    Array.isArray(
                        data.output
                    ) &&
                    data.output.length > 0
                ) {

                    result.videoUrl =
                        data.output[0];

                }

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
                    data.message ||
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
