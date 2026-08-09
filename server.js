```javascript
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
// HEALTH
// ========================================

app.get("/api/health", (req, res) => {

    res.json({
        ok: true,
        service: "AK AI Video Studio",
        model: RUNWAY_MODEL,
        duration: VIDEO_DURATION,
        apiVersion: RUNWAY_API_VERSION,
        references: MAX_IMAGES
    });

});


// ========================================
// RUNWAY REQUEST
// ========================================

async function runwayRequest(endpoint, options = {}) {

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

    const response = await fetch(
        `${RUNWAY_API_URL}${endpoint}`,
        {
            method:
                options.method || "GET",

            headers,

            body:
                options.body !== undefined
                    ? JSON.stringify(options.body)
                    : undefined
        }
    );

    const responseText =
        await response.text();

    let data = {};

    if (responseText) {

        try {

            data = JSON.parse(responseText);

        } catch {

            data = {
                message: responseText
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
// IMAGE VALIDATION
// ========================================

function isValidImageDataUri(value) {

    return (
        typeof value === "string" &&
        /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(value)
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
// IMAGE REFERENCES
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
                "Maximum 2 character images are allowed."
            );

        error.status = 400;

        throw error;
    }

    for (
        const image of images
    ) {

        if (
            !isValidImageDataUri(image)
        ) {

            const error =
                new Error(
                    "Invalid image. Use PNG, JPEG, JPG, or WEBP."
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
// PROMPT
// ========================================

function buildPrompt(prompt, imageCount) {

    let references = "";

    if (imageCount === 0) {

        references = `
No character reference image was provided.
Create the characters from the story.
`;

    } else if (imageCount === 1) {

        references = `
One character reference image is provided.
Use the provided image as the character identity.

Preserve:
appearance,
colors,
clothing,
shape,
facial features,
proportions,
materials,
and distinctive details.

Do not redesign the character.
Keep the same character identity.
`;

    } else {

        references = `
Two character reference images were uploaded.

Character 1 is represented by the first uploaded image.
Character 2 is represented by the second uploaded image.

Keep their identities distinct.

Do not merge the characters.
Do not swap their identities.
Do not redesign their appearance.

The story describes both characters.
When both characters are requested,
show them together naturally in the same scene.

Preserve their appearance, colors, clothing,
shape, facial features, proportions,
materials and distinctive details.
`;

    }

    const result = `
Create one coherent cinematic video scene.

Duration: exactly 10 seconds.

STORY:
${prompt}

CHARACTER REFERENCES:
${references}

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

Use the most appropriate cinematic camera movement.

Use combinations of:
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
the characters should naturally speak
with matching facial expressions
and believable mouth movement.

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

    return result.slice(
        0,
        1000
    );

}


// ========================================
// RATIO
// ========================================

function getRatio(aspect) {

    if (
        String(aspect).trim() === "16:9"
    ) {

        return "1280:720";
    }

    return "720:1280";
}


// ========================================
// GENERATE
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

            const promptText =
                buildPrompt(
                    prompt,
                    images.length
                );


            // ====================================
            // TEXT TO VIDEO
            // ====================================

            if (
                images.length === 0
            ) {

                const requestBody = {

                    model:
                        RUNWAY_MODEL,

                    promptText:
                        promptText,

                    ratio:
                        ratio,

                    duration:
                        VIDEO_DURATION

                };

                console.log(
                    "TEXT TO VIDEO REQUEST:",
                    {
                        model:
                            requestBody.model,

                        ratio:
                            requestBody.ratio,

                        duration:
                            requestBody.duration,

                        promptLength:
                            requestBody.promptText.length
                    }
                );

                const data =
                    await runwayRequest(
                        "/text_to_video",
                        {
                            method: "POST",
                            body: requestBody
                        }
                    );

                if (!data.id) {

                    return res.status(502).json({

                        success: false,

                        error:
                            "Runway did not return a task ID.",

                        details:
                            data

                    });

                }

                return res.json({

                    success: true,

                    taskId:
                        data.id,

                    duration:
                        VIDEO_DURATION,

                    charactersReceived:
                        0,

                    referenceMode:
                        "text-to-video"

                });

            }


            // ====================================
            // IMAGE TO VIDEO
            // ====================================

            /*
             * IMPORTANT:
             *
             * Runway API version 2024-11-06
             * accepts promptImage as an image
             * or a PromptImages array.
             *
             * For the normal image-to-video
             * request we use the first uploaded
             * image as the actual prompt image.
             *
             * The second uploaded image is NOT
             * sent through the unsupported
             * "references" field.
             */

            const requestBody = {

                model:
                    RUNWAY_MODEL,

                promptText:
                    promptText,

                promptImage:
                    images[0],

                ratio:
                    ratio,

                duration:
                    VIDEO_DURATION

            };


            console.log(
                "IMAGE TO VIDEO REQUEST:",
                {
                    model:
                        requestBody.model,

                    ratio:
                        requestBody.ratio,

                    duration:
                        requestBody.duration,

                    imageCount:
                        images.length,

                    imageSize:
                        getDataUriSize(images[0]),

                    promptLength:
                        requestBody.promptText.length
                }
            );


            const data =
                await runwayRequest(
                    "/image_to_video",
                    {
                        method: "POST",
                        body: requestBody
                    }
                );


            if (!data.id) {

                return res.status(502).json({

                    success: false,

                    error:
                        "Runway did not return a task ID.",

                    details:
                        data

                });

            }


            return res.json({

                success: true,

                taskId:
                    data.id,

                duration:
                    VIDEO_DURATION,

                charactersReceived:
                    images.length,

                referenceMode:
                    images.length === 2
                        ? "two-images-first-image-sent"
                        : "single-image"

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
                    "Server error while generating video.",

                details:
                    error.details || null

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


            if (
                data.status ===
                "SUCCEEDED"
            ) {

                if (
                    Array.isArray(
                        data.output
                    )
                ) {

                    const video =
                        data.output.find(
                            item =>
                                typeof item === "string" &&
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
                            "Runway completed the task but returned no video URL.",

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
                    "Runway video generation failed.";

                result.details =
                    data;

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

                success: false,

                error:
                    error.message ||
                    "Server error while checking task status.",

                details:
                    error.details || null

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
// START
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
```
