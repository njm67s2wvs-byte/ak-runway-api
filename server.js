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
    5 * 1024 * 1024;

const BODY_LIMIT =
    "12mb";

const MAX_IMAGES = 2;

const MAX_PROMPT_LENGTH = 10000;

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
            "application/json"
    };

    if (
        options.body !== undefined
    ) {
        headers["Content-Type"] =
            "application/json";
    }

    const response = await fetch(
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
        const error = new Error(
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
// IMAGE DATA URI SIZE
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
// UTF-16 SAFE STRING LIMIT
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

    // ========================================
    // NO CHARACTER REFERENCES
    // ========================================

    if (imageCount === 0) {
        referenceInstructions = `
No character reference images are provided.
Create the requested characters from the story.
Keep character appearance consistent throughout.
`;
    }

    // ========================================
    // ONE CHARACTER REFERENCE
    // ========================================

    else if (imageCount === 1) {
        referenceInstructions = `
One character reference image is provided.
Use it as the character identity reference.

Preserve the character's appearance, colors,
clothing, shape, facial features, proportions,
materials and distinctive details.

Do not redesign or replace the character.
Keep the same identity throughout the scene.
`;
    }

    // ========================================
    // TWO CHARACTER REFERENCES
    // ========================================

    else {
        referenceInstructions = `
Two character reference images are provided.

REFERENCE 1 = CHARACTER 1.
REFERENCE 2 = CHARACTER 2.

Use both images as visual character references
for the same 10-second cinematic scene.

They are character references, not first-frame
and last-frame keyframes.

Do not create a transition between them.

Do not swap identities.
Do not merge identities.
Do not redesign either character.

CHARACTER 1 must remain CHARACTER 1.
CHARACTER 2 must remain CHARACTER 2.

Preserve the appearance, colors, clothing,
shape, facial features, proportions,
materials and distinctive details of both.

When both characters are required by the story,
show them together naturally in the same scene.
`;
    }

    const basePrompt = `
Create one coherent cinematic video scene.

Duration: exactly 10 seconds.

STORY:
${prompt}

${referenceInstructions}

VISUAL STYLE:

High-quality cinematic video.
Professional film composition.
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

CAMERA:

Choose the most appropriate cinematic
camera movement for the story.

Use cinematic combinations of:
wide shot,
medium shot,
close-up,
slow push-in,
tracking shot,
dolly,
pan,
over-the-shoulder.

DIALOGUE:

If dialogue is included, preserve the
dialogue meaning and make characters
naturally speak with matching facial
expressions and mouth movement.

Do not add subtitles.
Do not add captions.
Do not add text overlays.
Do not add watermarks.
Do not add unrelated characters.
Do not add unrelated objects.

Keep the requested location.
Keep the requested characters.

Generate one coherent cinematic scene.
`;

    return limitUtf16(
        basePrompt.trim(),
        1000
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
        const error = new Error(
            "images must be an array."
        );

        error.status = 400;

        throw error;
    }

    if (
        images.length > MAX_IMAGES
    ) {
        const error = new Error(
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
            const error = new Error(
                "Invalid reference image. Use PNG, JPEG, JPG, or WEBP."
            );

            error.status = 400;

            throw error;
        }

        if (
            getDataUriSize(image) >
            MAX_IMAGE_SIZE
        ) {
            const error = new Error(
                "Each reference image must be 5MB or smaller."
            );

            error.status = 400;

            throw error;
        }
    }

    return images.slice(
        0,
        MAX_IMAGES
    );
}

// ========================================
// GENERATE VIDEO
// ========================================

app.post(
    "/api/generate",
    async (req, res) => {
        try {
            if (!RUNWAY_API_KEY) {
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

            // ========================================
            // PROMPT VALIDATION
            // ========================================

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
                        "Video prompt is too long."
                });
            }

            // ========================================
            // IMAGE VALIDATION
            // ========================================

            const referenceImages =
                getReferenceImages(
                    body.images
                );

            // ========================================
            // RATIO
            // ========================================

            const ratio =
                getRatio(aspect);

            // ========================================
            // CINEMATIC PROMPT
            // ========================================

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
            // IMAGE TO VIDEO
            // ========================================
            //
            // Seedance 2 Image Reference mode:
            //
            // promptImage = required primary image
            // references = additional image references
            //
            // This is NOT first/last frame mode.
            // ========================================

            const requestBody = {
                model:
                    RUNWAY_MODEL,

                promptText:
                    cinematicPrompt,

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

            // ========================================
            // RUNWAY REQUEST
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
            // TASK ID VALIDATION
            // ========================================

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

            // ========================================
            // SUCCESS
            // ========================================

            return res.json({
                success: true,

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
                success: false,

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
            if (!RUNWAY_API_KEY) {
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
                success: true,

                id:
                    data.id || taskId,

                status:
                    data.status || "UNKNOWN"
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

            // ========================================
            // FAILED
            // ========================================

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

            // ========================================
            // CANCELLED
            // ========================================

            if (
                data.status ===
                "CANCELLED"
            ) {
                result.success =
                    false;

                result.error =
                    "Video generation was cancelled.";
            }

            // ========================================
            // THROTTLED
            // ========================================

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
                success: false,

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
            success: false,

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
