"use strict";

const express = require("express");
const path = require("path");

const app = express();

// ========================================
// SERVER SETTINGS
// ========================================

const PORT = Number(process.env.PORT) || 3000;

const RUNWAY_API_KEY =
    process.env.RUNWAYML_API_SECRET || "";

const RUNWAY_API_URL =
    "https://api.dev.runwayml.com/v1";

const RUNWAY_API_VERSION =
    "2024-11-06";

const RUNWAY_MODEL =
    "seedance2";

// ========================================
// PROJECT SETTINGS
// ========================================

const VIDEO_DURATION = 10;

const MAX_IMAGE_SIZE =
    4 * 1024 * 1024;

const BODY_LIMIT =
    "20mb";

const MAX_IMAGES = 2;

const MAX_PROMPT_LENGTH = 1000;

// ========================================
// MIDDLEWARE
// ========================================

app.use(
    express.json({
        limit: BODY_LIMIT
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: BODY_LIMIT
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
            service: "AK AI Video Studio",
            model: RUNWAY_MODEL,
            duration: VIDEO_DURATION,
            apiVersion: RUNWAY_API_VERSION,
            references: MAX_IMAGES
        });

    }
);

// ========================================
// RUNWAY REQUEST
// ========================================

async function runwayRequest(
    endpoint,
    options = {}
) {

    if (!RUNWAY_API_KEY) {

        const error = new Error(
            "RUNWAYML_API_SECRET is not configured."
        );

        error.status = 500;

        throw error;
    }

    const headers = {
        "Authorization":
            `Bearer ${RUNWAY_API_KEY}`,

        "X-Runway-Version":
            RUNWAY_API_VERSION,

        "Accept":
            "application/json",

        "Content-Type":
            "application/json"
    };

    const response =
        await fetch(
            `${RUNWAY_API_URL}${endpoint}`,
            {
                method:
                    options.method || "GET",

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
                data.detail ||
                data.title ||
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

function isValidImageDataUri(value) {

    return (
        typeof value === "string" &&
        /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(
            value
        )
    );

}

// ========================================
// IMAGE SIZE
// ========================================

function getDataUriSize(dataUri) {

    if (
        typeof dataUri !== "string"
    ) {

        return 0;
    }

    return Buffer.byteLength(
        dataUri,
        "utf8"
    );
}

// ========================================
// LIMIT PROMPT
// ========================================

function limitUtf16(
    value,
    maxLength
) {

    if (
        typeof value !== "string"
    ) {

        return "";
    }

    if (
        value.length <= maxLength
    ) {

        return value;
    }

    return value.slice(
        0,
        maxLength
    );
}

// ========================================
// BUILD CINEMATIC PROMPT
// ========================================

function buildCinematicPrompt(
    prompt,
    imageCount
) {

    let referenceInstructions = "";

    if (
        imageCount === 0
    ) {

        referenceInstructions = `
No character reference images are provided.
Create the requested characters from the story.
Keep character appearance consistent.
`;

    } else if (
        imageCount === 1
    ) {

        referenceInstructions = `
One character reference image is provided.
Use it as the character identity reference.

Preserve the character appearance, colors,
clothing, shape, facial features, proportions,
materials and distinctive details.

Do not redesign the character.
Keep the same identity throughout the scene.
`;

    } else {

        referenceInstructions = `
Two character reference images are provided.

REFERENCE 1 = CHARACTER 1.
REFERENCE 2 = CHARACTER 2.

Use both images as character references
for the same 10-second scene.

They are NOT first-frame and last-frame
keyframes.

Do not create a transition between them.
Do not swap identities.
Do not merge identities.
Do not redesign either character.

CHARACTER 1 remains CHARACTER 1.
CHARACTER 2 remains CHARACTER 2.

Preserve appearance, colors, clothing,
shape, facial features, proportions,
materials and distinctive details.

Show both characters together naturally
when the story requires both.
`;
    }

    const basePrompt = `
Create one coherent cinematic video scene.

STORY:
${prompt}

${referenceInstructions}

Cinematic film composition.
Natural character movement.
Natural body movement.
Natural facial expressions.
Strong emotional acting.
Detailed environment.
Cinematic lighting.
Realistic shadows.
Realistic physics.
Smooth camera movement.
Professional depth of field.
Natural motion blur.
Consistent character identity.
Natural interaction.

Use an appropriate cinematic camera:
wide shot, medium shot, close-up,
slow push-in, tracking shot, dolly,
pan or over-the-shoulder.

If dialogue is included, preserve its meaning
and make the characters naturally speak with
matching facial expressions and mouth movement.

No subtitles.
No captions.
No text overlays.
No watermarks.
No unrelated characters.
No unrelated objects.

Keep the requested location.
Keep the requested characters.
`.trim();

    return limitUtf16(
        basePrompt,
        MAX_PROMPT_LENGTH
    );
}

// ========================================
// GET RUNWAY RATIO
// ========================================

function getRatio(aspect) {

    switch (
        String(aspect || "").trim()
    ) {

        case "16:9":
            return "1280:720";

        case "9:16":
            return "720:1280";

        default:
            return "720:1280";
    }
}

// ========================================
// NORMALIZE IMAGES
// ========================================

function getReferenceImages(images) {

    if (
        images === undefined ||
        images === null
    ) {

        return [];
    }

    if (
        !Array.isArray(images)
    ) {

        const error =
            new Error(
                "images must be an array."
            );

        error.status = 400;

        throw error;
    }

    if (
        images.length > MAX_IMAGES
    ) {

        const error =
            new Error(
                "A maximum of 2 character reference images is allowed."
            );

        error.status = 400;

        throw error;
    }

    for (
        const image of images
    ) {

        if (
            !isValidImageDataUri(
                image
            )
        ) {

            const error =
                new Error(
                    "Invalid reference image. Use PNG, JPEG, JPG, or WEBP."
                );

            error.status = 400;

            throw error;
        }

        if (
            getDataUriSize(image) >
            MAX_IMAGE_SIZE
        ) {

            const error =
                new Error(
                    "Each reference image must be smaller than 4MB."
                );

            error.status = 400;

            throw error;
        }
    }

    return images;
}

// ========================================
// GENERATE VIDEO
// ========================================

app.post(
    "/api/generate",
    async (req, res) => {

        try {

            if (
                !RUNWAY_API_KEY
            ) {

                return res.status(500).json({
                    success: false,
                    error:
                        "RUNWAYML_API_SECRET is not configured."
                });
            }

            const body =
                req.body || {};

            const prompt =
                typeof body.prompt === "string"
                    ? body.prompt.trim()
                    : "";

            const aspect =
                typeof body.aspect === "string"
                    ? body.aspect
                    : "9:16";

            if (!prompt) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Video prompt is required."
                });
            }

            if (
                prompt.length >
                MAX_PROMPT_LENGTH
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Video prompt must be 1000 characters or less."
                });
            }

            const referenceImages =
                getReferenceImages(
                    body.images
                );

            const ratio =
                getRatio(
                    aspect
                );

            const cinematicPrompt =
                buildCinematicPrompt(
                    prompt,
                    referenceImages.length
                );

            // ========================================
            // TEXT TO VIDEO
            // ========================================

            if (
                referenceImages.length === 0
            ) {

                const requestBody = {

                    model:
                        RUNWAY_MODEL,

                    promptText:
                        cinematicPrompt,

                    ratio:
                        ratio,

                    duration:
                        VIDEO_DURATION
                };

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

                    return res.status(502).json({
                        success: false,
                        error:
                            "Runway did not return a task ID.",
                        details:
                            runwayData
                    });
                }

                return res.json({
                    success: true,
                    taskId:
                        runwayData.id,
                    duration:
                        VIDEO_DURATION,
                    charactersReceived:
                        0,
                    referenceMode:
                        "text-to-video"
                });
            }

            // ========================================
            // IMAGE TO VIDEO - SEEDANCE 2
            // IMAGE REFERENCE MODE
            // ========================================

            const requestBody = {

                model:
                    RUNWAY_MODEL,

                promptText:
                    cinematicPrompt,

                // Required primary image.
                // This is the main character reference.
                promptImage:
                    referenceImages[0],

                ratio:
                    ratio,

                duration:
                    VIDEO_DURATION
            };

            // ========================================
            // SECOND CHARACTER REFERENCE
            // ========================================

            if (
                referenceImages.length === 2
            ) {

                requestBody.references = [
                    {
                        type:
                            "image",

                        uri:
                            referenceImages[1]
                    }
                ];
            }

            console.log(
                "Sending Seedance 2 request:",
                {
                    model:
                        requestBody.model,

                    promptLength:
                        requestBody.promptText.length,

                    ratio:
                        requestBody.ratio,

                    duration:
                        requestBody.duration,

                    hasPrimaryImage:
                        Boolean(
                            requestBody.promptImage
                        ),

                    referenceCount:
                        requestBody.references
                            ? requestBody.references.length
                            : 0
                }
            );

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

            if (
                !runwayData.id
            ) {

                console.error(
                    "Unexpected Runway response:",
                    runwayData
                );

                return res.status(502).json({
                    success: false,
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

                duration:
                    VIDEO_DURATION,

                charactersReceived:
                    referenceImages.length,

                referenceMode:
                    referenceImages.length === 2
                        ? "two-character-image-reference"
                        : "single-character-image-reference"
            });

        } catch (error) {

            console.error(
                "Generation error:",
                error
            );

            return res.status(
                Number(error.status) || 500
            ).json({

                success:
                    false,

                error:
                    error.message ||
                    "Server error while starting video generation.",

                details:
                    error.details ||
                    undefined
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

            if (
                !RUNWAY_API_KEY
            ) {

                return res.status(500).json({
                    success: false,
                    error:
                        "RUNWAYML_API_SECRET is not configured."
                });
            }

            const taskId =
                String(
                    req.params.taskId || ""
                ).trim();

            if (!taskId) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Task ID is required."
                });
            }

            const data =
                await runwayRequest(
                    `/tasks/${encodeURIComponent(taskId)}`,
                    {
                        method:
                            "GET"
                    }
                );

            const result = {

                success:
                    true,

                id:
                    data.id ||
                    taskId,

                status:
                    data.status ||
                    "UNKNOWN"
            };

            if (
                data.status ===
                "SUCCEEDED"
            ) {

                if (
                    Array.isArray(
                        data.output
                    )
                ) {

                    const firstVideo =
                        data.output.find(
                            item =>
                                typeof item ===
                                    "string" &&
                                item.trim()
                        );

                    if (
                        firstVideo
                    ) {

                        result.videoUrl =
                            firstVideo;
                    }
                }

                if (
                    !result.videoUrl
                ) {

                    return res.status(502).json({
                        success: false,
                        error:
                            "Video generation succeeded but Runway returned no video URL.",
                        details:
                            data
                    });
                }
            }

            if (
                data.status ===
                "FAILED"
            ) {

                result.success =
                    false;

                result.error =
                    data.failure ||
                    data.failureCode ||
                    data.message ||
                    "Video generation failed.";
            }

            if (
                data.status ===
                "CANCELLED"
            ) {

                result.success =
                    false;

                result.error =
                    "Video generation was cancelled.";
            }

            if (
                data.status ===
                "THROTTLED"
            ) {

                result.message =
                    "Runway is currently processing your task.";
            }

            return res.json(
                result
            );

        } catch (error) {

            console.error(
                "Status error:",
                error
            );

            return res.status(
                Number(error.status) || 500
            ).json({

                success:
                    false,

                error:
                    error.message ||
                    "Server error while checking generation status.",

                details:
                    error.details ||
                    undefined
            });
        }
    }
);

// ========================================
// ROOT ROUTE
// ========================================

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "index.html"
            )
        );
    }
);

// ========================================
// GLOBAL ERROR HANDLER
// ========================================

app.use(
    (err, req, res, next) => {

        console.error(
            "Unhandled server error:",
            err
        );

        if (
            res.headersSent
        ) {

            return next(err);
        }

        return res.status(
            Number(err.status) || 500
        ).json({

            success:
                false,

            error:
                err.message ||
                "Internal server error."
        });
    }
);

// ========================================
// START SERVER
// ========================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "========================================"
        );

        console.log(
            "AK AI Video Studio"
        );

        console.log(
            "========================================"
        );

        console.log(
            `Server running on port ${PORT}`
        );

        console.log(
            `Runway model: ${RUNWAY_MODEL}`
        );

        console.log(
            `Video duration: ${VIDEO_DURATION} seconds`
        );

        console.log(
            "Character references: up to 2"
        );

        console.log(
            "Reference mode: Seedance 2 Image Reference"
        );

        console.log(
            `API Version: ${RUNWAY_API_VERSION}`
        );

        console.log(
            "========================================"
        );
    }
);
