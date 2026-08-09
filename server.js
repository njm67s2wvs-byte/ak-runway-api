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

        const error =
            new Error(
                "RUNWAYML_API_SECRET is not configured."
            );

        error.status = 500;

        throw error;
    }


    const headers = {

        "Authorization":
            `Bearer ${RUNWAY_API_KEY}`,

        "X-Runway-Version":
            RUNWAY_API_VERSION

    };


    if (
        options.body !== undefined
    ) {

        headers["Content-Type"] =
            "application/json";

    }


    const response =
        await fetch(
            `${RUNWAY_API_URL}${endpoint}`,
            {

                method:
                    options.method || "GET",

                headers:
                    headers,

                body:
                    options.body !== undefined
                        ? JSON.stringify(
                            options.body
                        )
                        : undefined

            }
        );


    const responseText =
        await response.text();


    let data = {};


    if (responseText) {

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
// IMAGE DATA URI VALIDATION
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
// IMAGE DATA URI SIZE
// ========================================

function getDataUriSize(
    dataUri
) {

    return dataUri.length;
}


// ========================================
// BUILD CINEMATIC PROMPT
// ========================================

function buildCinematicPrompt(
    prompt,
    imageCount
) {

    let referenceText = "";


    if (
        imageCount === 1
    ) {

        referenceText = `
One character reference image is supplied.

Use this image as the visual identity
of the main character.

Preserve the character's appearance,
colors, clothing, shape, facial features,
body design, proportions, and distinctive details.

Do not redesign the character.
Do not change the character's colors.
Do not change the character's clothing.

Keep the character visually consistent
throughout the entire video.
`;

    }


    if (
        imageCount >= 2
    ) {

        referenceText = `
Two character reference images are supplied.

The first reference image represents Character 1.
The second reference image represents Character 2.

Treat them as two separate characters.

Preserve each character's appearance,
colors, clothing, shape, facial features,
body design, proportions, and distinctive details.

Do not merge their identities.
Do not swap their identities.
Do not redesign them.
Do not change their colors or clothing.

Keep both characters visually consistent
throughout the entire video.
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


    return cinematicPrompt.slice(
        0,
        1000
    );
}


// ========================================
// GET RATIO
// ========================================

function getRatio(
    aspect
) {

    switch (
        aspect
    ) {

        case "16:9":

            return "1280:720";


        case "1:1":

            return "960:960";


        case "9:16":

        default:

            return "720:1280";

    }

}


// ========================================
// GET DURATION
// ========================================

function getDuration(
    duration
) {

    let value =
        Number(duration);


    if (
        !Number.isFinite(value)
    ) {

        return 10;

    }


    /*
     * Seedance 2 supports
     * 4-15 seconds in the
     * current Runway API.
     *
     * The frontend currently
     * sends 5 or 10 seconds.
     */

    value =
        Math.round(
            Math.max(
                4,
                Math.min(
                    15,
                    value
                )
            )
        );


    return value;
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
            } =
                req.body || {};


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

            const MAX_DATA_URI_LENGTH =
                5242880;


            for (
                const image of referenceImages
            ) {

                if (
                    getDataUriSize(image) >
                    MAX_DATA_URI_LENGTH
                ) {

                    return res.status(400).json({

                        error:
                            "Reference image is too large. Please use an image smaller than 5MB."

                    });

                }

            }


            // ========================================
            // DURATION
            // ========================================

            const videoDuration =
                getDuration(
                    duration
                );


            // ========================================
            // RATIO
            // ========================================

            const ratio =
                getRatio(
                    aspect
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
            // BASE REQUEST
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
            // TEXT TO VIDEO
            // ========================================

            if (
                referenceImages.length === 0
            ) {

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
            // IMAGE TO VIDEO
            // ========================================

            /*
             * With character references,
             * Seedance 2 uses image-to-video.
             */

            requestBody.promptImage =
                referenceImages[0];


            // ========================================
            // SECOND CHARACTER REFERENCE
            // ========================================

            if (
                referenceImages.length === 2
            ) {

                /*
                 * Seedance 2 image-reference mode:
                 *
                 * promptImage = primary image
                 *
                 * references = additional image
                 *
                 * This is different from
                 * first/last-frame mode.
                 */

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
            // IMAGE TO VIDEO REQUEST
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
            // GET TASK
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
            // BASIC RESULT
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
                    data.output.length > 0 &&
                    typeof data.output[0] === "string"
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
