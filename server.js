"use strict";

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
// PROJECT SETTINGS
// ========================================

const VIDEO_DURATION = 10;

const MAX_IMAGE_SIZE =
    5 * 1024 * 1024;

const BODY_LIMIT =
    "12mb";

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
            apiVersion: RUNWAY_API_VERSION
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

    if (
        typeof dataUri !== "string"
    ) {

        return 0;
    }

    return dataUri.length;
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
    // ONE CHARACTER
    // ========================================

    if (
        imageCount === 1
    ) {

        referenceInstructions = `
CHARACTER REFERENCE:

The supplied image is a character
identity reference.

Use it to preserve the exact identity
and visual appearance of the character.

Preserve:
appearance, colors, clothing,
shape, facial features, proportions,
materials and distinctive details.

Do not redesign the character.

The image is a character reference,
not a first-frame or last-frame keyframe.

Keep the same character identity
throughout the complete 10-second scene.
`;
    }

    // ========================================
    // TWO CHARACTERS
    // ========================================

    if (
        imageCount >= 2
    ) {

        referenceInstructions = `
TWO CHARACTER REFERENCES:

Reference image 1 represents CHARACTER 1.

Reference image 2 represents CHARACTER 2.

Both images are visual identity references
for the SAME generated scene.

IMPORTANT:

Use BOTH character references together.

They are NOT a beginning frame
and an ending frame.

Do NOT treat image 1 as the start
of the video.

Do NOT treat image 2 as the end
of the video.

Do NOT create a transition
from character 1 into character 2.

Instead, maintain both identities
throughout the same 10-second scene.

Character 1 must remain Character 1.

Character 2 must remain Character 2.

Do not swap their identities.

Do not merge their identities.

Do not redesign either character.

Preserve each character's:
appearance, colors, clothing,
shape, facial features, proportions,
materials and distinctive details.

When the story requires both characters,
show both characters naturally together
in the same scene.

They can walk together,
stand together,
talk together,
look at each other,
react to each other,
or physically interact naturally.

Keep both characters visually consistent
throughout the complete scene.
`;
    }

    const cinematicPrompt = `
Create ONE cinematic video scene.

EXACT DURATION:
10 seconds.

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

Realistic environment.

Cinematic lighting.

Detailed materials.

Realistic shadows.

Realistic physics.

Smooth camera movement.

Professional depth of field.

Natural motion blur.

Consistent character identity.

Clear separation between characters.

Natural interaction between characters.

CAMERA:

Choose the cinematic camera movement
that best matches the story.

Possible movements:

slow dolly,
tracking shot,
slow push-in,
camera pan,
handheld cinematic movement,
close-up,
medium shot,
wide shot,
over-the-shoulder.

DIALOGUE:

If dialogue is included,
characters should naturally speak
with appropriate facial reactions
and mouth movement.

Do not add subtitles.

Do not add captions.

Do not add text overlays.

Do not add watermarks.

Do not add unrelated characters.

Do not add unrelated objects.

Do not change the requested location.

Do not change the requested characters.

Generate ONE coherent cinematic
10-second scene.
`.trim();

    // Runway promptText limit = 1000 chars.
    return cinematicPrompt.slice(
        0,
        1000
    );
}

// ========================================
// GET VIDEO RATIO
// ========================================

function getRatio(
    aspect
) {

    if (
        aspect === "16:9"
    ) {

        return "1280:720";
    }

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
                aspect = "9:16"
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

            if (
                prompt.length > 10000
            ) {

                return res.status(400).json({

                    error:
                        "Video prompt is too long."

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

            for (
                const image of referenceImages
            ) {

                if (
                    getDataUriSize(image) >
                    MAX_IMAGE_SIZE
                ) {

                    return res.status(400).json({

                        error:
                            "Each reference image must be smaller than 5MB."

                    });
                }
            }

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
                    VIDEO_DURATION
            };

            // ========================================
            // NO IMAGES
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

                    duration:
                        VIDEO_DURATION,

                    charactersReceived:
                        0,

                    referenceMode:
                        "text-to-video"

                });
            }

            // ========================================
            // IMAGE REFERENCE MODE
            // ========================================
            //
            // For Seedance 2:
            //
            // promptImage is the main image input.
            //
            // Additional character reference
            // is included in the prompt itself.
            //
            // We NEVER use first/last positions
            // because the user's intended behavior
            // is NOT start/end keyframes.
            //
            // ========================================

            requestBody.promptImage =
                referenceImages[0];

            // ========================================
            // SECOND IMAGE
            // ========================================
            //
            // Seedance 2 supports reference images.
            //
            // The second image is described in
            // the prompt as Character 2 and is
            // sent as a reference asset.
            //
            // ========================================

            if (
                referenceImages.length >= 2
            ) {

                requestBody.referenceImages = [

                    {
                        uri:
                            referenceImages[1]
                    }

                ];
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

                duration:
                    VIDEO_DURATION,

                charactersReceived:
                    referenceImages.length,

                referenceMode:
                    referenceImages.length >= 2
                        ? "two-character-shared-reference"
                        : "single-character-reference"

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
                    data.output.length > 0
                ) {

                    const firstOutput =
                        data.output[0];

                    if (
                        typeof firstOutput ===
                        "string"
                    ) {

                        result.videoUrl =
                            firstOutput;
                    }
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
            // THROTTLED
            // ========================================

            if (
                data.status ===
                "THROTTLED"
            ) {

                result.message =
                    "Runway is currently processing your task.";
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
            "========================================"
        );

        console.log(
            "AK AI Video Studio"
        );

        console.log(
            "========================================"
        );

        console.log(
            `Server: http://localhost:${PORT}`
        );

        console.log(
            `Runway model: ${RUNWAY_MODEL}`
        );

        console.log(
            `Video duration: ${VIDEO_DURATION} seconds`
        );

        console.log(
            "Character mode: Shared references"
        );

        console.log(
            "========================================"
        );

    }
);
