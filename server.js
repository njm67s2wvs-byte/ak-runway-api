"use strict";

const express = require("express");
const path = require("path");

const app = express();

const PORT = Number(process.env.PORT) || 3000;

const RUNWAY_API_KEY =
    process.env.RUNWAYML_API_SECRET || "";

const RUNWAY_API_URL =
    "https://api.dev.runwayml.com/v1";

const RUNWAY_API_VERSION =
    "2024-11-06";

const RUNWAY_MODEL =
    "seedance2";

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
            references: MAX_IMAGES,
            keyConfigured: Boolean(RUNWAY_API_KEY)
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
// IMAGE VALIDATION
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
// IMAGE SIZE
// ========================================

function getDataUriSize(
    dataUri
) {
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
// NORMALIZE IMAGES
// ========================================

function getReferenceImages(
    images
) {
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
                "Maximum 2 character images allowed."
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
                    "Invalid image. Use PNG, JPEG, JPG or WEBP."
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
                    "Each image must be 5MB or smaller."
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
// PROMPT BUILDER
// ========================================

function buildPrompt(
    prompt,
    imageCount
) {
    let references = "";

    if (
        imageCount === 0
    ) {
        references = `
Create the requested characters from the story.
Keep their appearance consistent.
`;
    }

    if (
        imageCount === 1
    ) {
        references = `
Use the provided image as the main character reference.
Preserve the character identity, appearance, colors,
clothing, shape, facial features and proportions.
`;
    }

    if (
        imageCount === 2
    ) {
        references = `
Two character reference images are provided.

Character 1 is the first uploaded image.
Character 2 is the second uploaded image.

Keep both character identities separate.

Do not merge the characters.
Do not swap their identities.
Do not redesign them.

Preserve their appearance, colors, clothing,
shape, facial features, proportions and details.

When the story requires both characters,
show both characters naturally in the same scene.
`;
    }

    const finalPrompt = `
Create one coherent cinematic video scene.

Duration: exactly 10 seconds.

STORY:
${prompt}

CHARACTER REFERENCES:
${references}

VISUAL STYLE:

High-quality cinematic video.
Professional cinematic composition.
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

Use the most appropriate cinematic camera movement.

Possible movements:
wide shot,
medium shot,
close-up,
slow push-in,
tracking shot,
dolly,
pan,
over-the-shoulder.

DIALOGUE:

If dialogue is included,
characters should naturally speak the requested dialogue
with matching facial expressions and mouth movement.

Do not add subtitles.
Do not add captions.
Do not add text overlays.
Do not add watermarks.
Do not add unrelated characters.
Do not add unrelated objects.

Keep the requested location.
Keep the requested characters.

Generate one coherent cinematic scene.
`.trim();

    // Runway promptText limit = 1000 UTF-16 characters.
    return finalPrompt.slice(
        0,
        1000
    );
}


// ========================================
// RATIO
// ========================================

function getRatio(
    aspect
) {
    const value =
        String(aspect || "").trim();

    switch (value) {

        case "16:9":
            return "1280:720";

        case "9:16":
            return "720:1280";

        case "1:1":
            return "960:960";

        default:
            return "720:1280";
    }
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
                        "Video prompt is too long."
                });
            }

            const images =
                getReferenceImages(
                    body.images
                );

            const ratio =
                getRatio(aspect);

            const cinematicPrompt =
                buildPrompt(
                    prompt,
                    images.length
                );


            // ========================================
            // TEXT TO VIDEO
            // ========================================

            if (
                images.length === 0
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

                console.log(
                    "Sending text-to-video request..."
                );

                const runwayData =
                    await runwayRequest(
                        "/text_to_video",
                        {
                            method: "POST",
                            body:
                                requestBody
                        }
                    );

                console.log(
                    "Runway response:",
                    runwayData
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
                        0
                });
            }


            // ========================================
            // IMAGE TO VIDEO
            // ========================================

            /*
             * IMPORTANT:
             *
             * For the official Runway API,
             * promptImage is the valid image field.
             *
             * We use the first uploaded image
             * as the actual prompt image.
             *
             * The second image is mentioned in
             * the prompt so the model knows about
             * the second character.
             */

            const requestBody = {

                model:
                    RUNWAY_MODEL,

                promptText:
                    cinematicPrompt,

                promptImage:
                    images[0],

                ratio:
                    ratio,

                duration:
                    VIDEO_DURATION
            };


            console.log(
                "Sending image-to-video request..."
            );

            console.log(
                "Images:",
                images.length
            );

            console.log(
                "Ratio:",
                ratio
            );

            const runwayData =
                await runwayRequest(
                    "/image_to_video",
                    {
                        method: "POST",
                        body:
                            requestBody
                    }
                );

            console.log(
                "Runway response:",
                runwayData
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
                    images.length,

                referenceMode:
                    images.length === 2
                        ? "two-character-reference"
                        : "single-character-reference"
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
                    "Server error.",

                details:
                    error.details || undefined
            });
        }
    }
);


// ========================================
// STATUS
// ========================================

app.get(
    "/api/status/:taskId",
    async (req, res) => {

        try {

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
                        method: "GET"
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
                data.status === "SUCCEEDED"
            ) {

                if (
                    Array.isArray(
                        data.output
                    )
                ) {

                    const video =
                        data.output.find(
                            item =>
                                typeof item ===
                                    "string" &&
                                item.trim()
                        );

                    if (video) {
                        result.videoUrl =
                            video;
                    }
                }

                if (
                    !result.videoUrl
                ) {

                    return res.status(502).json({
                        success: false,
                        error:
                            "Generation succeeded but no video URL was returned.",
                        details:
                            data
                    });
                }
            }


            // ========================================
            // FAILED
            // ========================================

            if (
                data.status === "FAILED"
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
                data.status === "CANCELLED"
            ) {

                result.success =
                    false;

                result.error =
                    "Video generation was cancelled.";
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
                    "Server error while checking status.",

                details:
                    error.details || undefined
            });
        }
    }
);


// ========================================
// ROOT
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
// ERROR HANDLER
// ========================================

app.use(
    (err, req, res, next) => {

        console.error(
            "Unhandled error:",
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
            `API Version: ${RUNWAY_API_VERSION}`
        );

        console.log(
            "========================================"
        );
    }
);
