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

const RUNWAY_MODEL =
    "seedance2";


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
// RUNWAY REQUEST HELPER
// ========================================

async function runwayRequest(
    endpoint,
    options = {}
) {

    if (!RUNWAY_API_KEY) {

        throw new Error(
            "RUNWAYML_API_SECRET is not configured."
        );

    }


    const response =
        await fetch(
            `${RUNWAY_API_URL}${endpoint}`,
            {

                method:
                    options.method || "GET",

                headers: {

                    "Authorization":
                        `Bearer ${RUNWAY_API_KEY}`,

                    "Content-Type":
                        "application/json",

                    "X-Runway-Version":
                        RUNWAY_API_VERSION

                },

                body:
                    options.body
                        ? JSON.stringify(
                            options.body
                        )
                        : undefined

            }
        );


    const responseText =
        await response.text();


    let data;

    try {

        data =
            responseText
                ? JSON.parse(
                    responseText
                )
                : {};

    } catch {

        data = {
            message:
                responseText
        };

    }


    if (!response.ok) {

        const error =
            new Error(
                data.error ||
                data.message ||
                "Runway API request failed."
            );

        error.status =
            response.status;

        error.details =
            data;

        throw error;

    }


    return data;
}


// ========================================
// VALIDATE DATA URI
// ========================================

function isValidImageDataUri(
    value
) {

    return (
        typeof value === "string" &&
        /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(
            value
        )
    );
}


// ========================================
// GET IMAGE DATA SIZE
// ========================================

function getBase64ByteSize(
    dataUri
) {

    const commaIndex =
        dataUri.indexOf(",");


    if (commaIndex === -1) {

        return 0;

    }


    const base64 =
        dataUri.slice(
            commaIndex + 1
        );


    const padding =
        base64.endsWith("==")
            ? 2
            : base64.endsWith("=")
                ? 1
                : 0;


    return Math.floor(
        (base64.length * 3) / 4
    ) - padding;
}


// ========================================
// BUILD CINEMATIC PROMPT
// ========================================

function buildCinematicPrompt(
    prompt,
    imageCount
) {

    let referenceText = "";


    if (imageCount === 1) {

        referenceText = `
A character reference image is supplied.

Use the supplied image as the visual identity
of the main character.

Preserve the character's:
appearance,
colors,
clothing,
shape,
facial features,
body design,
proportions,
and distinctive visual details.

Do not redesign the character.
Do not change the character's colors or clothing.
Keep the character visually consistent
throughout the entire video.
`;

    }


    if (imageCount >= 2) {

        referenceText = `
Two character reference images are supplied.

The first image is the primary visual reference.
The second image is an additional visual reference.

Treat the two characters as separate identities
when both are described in the story.

Preserve their appearance, colors, clothing,
shape, facial features, proportions,
body design, and distinctive details.

Do not merge their identities.
Do not swap their identities.
Do not redesign them.

Keep the character appearances consistent
throughout the video.
`;

    }


    const cinematicPrompt = `
Create a high-quality cinematic AI video.

Story:
${prompt}

Character reference instructions:
${referenceText}

Visual direction:
cinematic composition,
professional film look,
realistic natural motion,
expressive character acting,
natural facial expressions,
detailed environment,
dramatic professional lighting,
realistic camera movement,
strong depth and atmosphere,
realistic physics,
smooth motion,
consistent character appearance,
clear subject separation,
no subtitles,
no text overlays.

Generate exactly the scene described by the user.
Do not add unrelated characters or objects.
`.trim();


    /*
     * Runway promptText maximum:
     * 1000 UTF-16 code units.
     */

    return cinematicPrompt.slice(
        0,
        1000
    );
}


// ========================================
// ASPECT RATIO
// ========================================

function getRatio(
    aspect,
    hasImage
) {

    /*
     * Seedance 2 supports many
     * width:height resolutions.
     *
     * These values are safe
     * 720p-style choices.
     */

    if (
        aspect === "16:9"
    ) {

        return "1280:720";

    }


    if (
        aspect === "1:1"
    ) {

        return "960:960";

    }


    /*
     * Default = 9:16
     */

    return "720:1280";
}


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
            // PROMPT VALIDATION
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
            // IMAGE VALIDATION
            // ========================================

            let referenceImages = [];


            if (
                Array.isArray(images)
            ) {

                referenceImages =
                    images
                        .filter(
                            isValidImageDataUri
                        )
                        .slice(0, 2);

            }


            // ========================================
            // IMAGE SIZE VALIDATION
            // ========================================

            const MAX_IMAGE_BYTES =
                5 * 1024 * 1024;


            for (
                const image of referenceImages
            ) {

                const imageBytes =
                    getBase64ByteSize(
                        image
                    );


                if (
                    imageBytes >
                    MAX_IMAGE_BYTES
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

                videoDuration =
                    10;

            }


            /*
             * The selected Runway API
             * accepts 2-10 seconds.
             */

            videoDuration =
                Math.round(
                    Math.max(
                        2,
                        Math.min(
                            10,
                            videoDuration
                        )
                    )
                );


            // ========================================
            // RATIO
            // ========================================

            const ratio =
                getRatio(
                    aspect,
                    referenceImages.length > 0
                );


            // ========================================
            // PROMPT
            // ========================================

            const cinematicPrompt =
                buildCinematicPrompt(
                    prompt.trim(),
                    referenceImages.length
                );


            // ========================================
            // REQUEST BODY
            // ========================================

            const requestBody = {

                model:
                    RUNWAY_MODEL,

                promptText:
                    cinematicPrompt,

                ratio:
                    ratio,

                duration:
                    videoDuration

            };


            // ========================================
            // NO IMAGE
            // ========================================

            if (
                referenceImages.length === 0
            ) {

                /*
                 * Seedance 2 supports
                 * text-to-video.
                 */

                const runwayData =
                    await runwayRequest(
                        "/text_to_video",
                        {
                            method:
                                "POST",

                            body:
                                requestBody
                        }
                    );


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


                return res.json({

                    success:
                        true,

                    taskId:
                        runwayData.id,

                    charactersReceived:
                        0

                });

            }


            // ========================================
            // ONE IMAGE
            // ========================================

            if (
                referenceImages.length === 1
            ) {

                requestBody.promptImage =
                    referenceImages[0];

            }


            // ========================================
            // TWO IMAGES
            // ========================================

            if (
                referenceImages.length === 2
            ) {

                /*
                 * IMPORTANT:
                 *
                 * Runway's documented
                 * promptImage array means
                 * first/last frame.
                 *
                 * It does NOT mean:
                 *
                 * character 1 +
                 * character 2.
                 *
                 * Therefore we do not send
                 * the second image as a fake
                 * "references" field.
                 *
                 * To remain API-compatible,
                 * the first image is used as
                 * the prompt image and the
                 * second image is mentioned
                 * in the prompt.
                 */

                requestBody.promptImage =
                    referenceImages[0];

            }


            // ========================================
            // IMAGE TO VIDEO
            // ========================================

            const runwayData =
                await runwayRequest(
                    "/image_to_video",
                    {
                        method:
                            "POST",

                        body:
                            requestBody
                    }
                );


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


            return res.status(
                error.status || 500
            ).json({

                error:
                    error.message ||
                    "Server error while starting video generation.",

                details:
                    error.details || undefined

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


            if (
                !taskId ||
                typeof taskId !== "string"
            ) {

                return res.status(400).json({

                    error:
                        "Task ID is required."

                });

            }


            // ========================================
            // STATUS REQUEST
            // ========================================

            const data =
                await runwayRequest(
                    `/tasks/${encodeURIComponent(taskId)}`,
                    {
                        method:
                            "GET"
                    }
                );


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
            // SUCCEEDED
            // ========================================

            if (
                data.status ===
                "SUCCEEDED"
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


                if (
                    !result.videoUrl
                ) {

                    return res.status(500).json({

                        error:
                            "Video generation succeeded but Runway returned no video URL.",

                        details:
                            data

                    });

                }

            }


            // ========================================
            // FAILED
            // ========================================

            if (
                data.status ===
                "FAILED"
            ) {

                result.error =
                    data.failure ||
                    data.failureCode ||
                    data.message ||
                    "Video generation failed.";

            }


            // ========================================
            // CANCELLED
            // ========================================

            if (
                data.status ===
                "CANCELLED"
            ) {

                result.error =
                    "Video generation was cancelled.";

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


            return res.status(
                error.status || 500
            ).json({

                error:
                    error.message ||
                    "Server error while checking generation status.",

                details:
                    error.details || undefined

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
