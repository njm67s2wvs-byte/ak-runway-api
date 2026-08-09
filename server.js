const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

const RUNWAY_API_KEY = process.env.RUNWAYML_API_SECRET;

const RUNWAY_API_URL = "https://api.dev.runwayml.com/v1";

const RUNWAY_API_VERSION = "2024-11-06";

const RUNWAY_MODEL = "seedance2";

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

app.use(
    express.static(__dirname)
);

// ========================================
// HEALTH CHECK
// ========================================

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        service: "AK AI Video Studio",
        model: RUNWAY_MODEL,
        apiVersion: RUNWAY_API_VERSION,
        runwayConfigured: Boolean(RUNWAY_API_KEY)
    });
});

// ========================================
// RUNWAY REQUEST HELPER
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
        "Authorization": `Bearer ${RUNWAY_API_KEY}`,
        "X-Runway-Version": RUNWAY_API_VERSION
    };

    if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(
        `${RUNWAY_API_URL}${endpoint}`,
        {
            method: options.method || "GET",
            headers,
            body:
                options.body !== undefined
                    ? JSON.stringify(options.body)
                    : undefined
        }
    );

    const responseText = await response.text();

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

        error.status = response.status;
        error.details = data;

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

    if (typeof dataUri !== "string") {
        return 0;
    }

    return dataUri.length;
}

// ========================================
// CINEMATIC PROMPT
// ========================================

function buildCinematicPrompt(prompt, imageCount) {

    let referenceText = "";

    if (imageCount === 1) {

        referenceText = `
One character reference image is provided.

Use it as the exact visual identity of the main character.

Preserve appearance, colors, clothing, shape, facial features,
body design, proportions and distinctive details.

Do not redesign the character.
Do not change the character's colors or clothing.
Keep the character visually consistent throughout the video.
`;
    }

    if (imageCount >= 2) {

        referenceText = `
Two character reference images are provided.

Character 1 is represented by the first image.
Character 2 is represented by the second image.

Treat them as separate characters.

Preserve the visual identity of each character:
appearance, colors, clothing, shape, facial features,
body design, proportions and distinctive details.

Do not merge their identities.
Do not swap their identities.
Do not redesign them.

When both characters appear in the story,
keep their identities visually distinct and consistent.
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
clear subject separation.

Dialogue:
If dialogue is included in the story,
show natural speaking expressions,
appropriate mouth movement and believable acting.

Do not add subtitles.
Do not add text overlays.
Do not add unrelated characters.
Do not add unrelated objects.

Generate exactly the scene described by the user.
`.trim();

    /*
     * Runway promptText maximum:
     * 1000 UTF-16 code units.
     */

    return cinematicPrompt.slice(0, 1000);
}

// ========================================
// RATIO
// ========================================

function getRatio(aspect) {

    switch (aspect) {

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
// DURATION
// ========================================

function getDuration(duration) {

    let value = Number(duration);

    if (!Number.isFinite(value)) {
        return 10;
    }

    /*
     * Seedance 2:
     * 4-15 seconds.
     */

    value = Math.round(
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

app.post("/api/generate", async (req, res) => {

    try {

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
        } = req.body || {};

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

        if (Array.isArray(images)) {

            referenceImages = images
                .filter(isValidImageDataUri)
                .slice(0, 2);
        }

        // ========================================
        // IMAGE SIZE
        // ========================================

        const MAX_DATA_URI_LENGTH =
            5 * 1024 * 1024;

        for (const image of referenceImages) {

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
        // SETTINGS
        // ========================================

        const videoDuration =
            getDuration(duration);

        const ratio =
            getRatio(aspect);

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
            model: RUNWAY_MODEL,
            promptText: cinematicPrompt,
            ratio: ratio,
            duration: videoDuration
        };

        // ========================================
        // TEXT TO VIDEO
        // ========================================

        if (referenceImages.length === 0) {

            /*
             * Text-to-video supports
             * portrait and landscape.
             */

            if (aspect === "1:1") {
                requestBody.ratio = "1280:720";
            }

            const runwayData =
                await runwayRequest(
                    "/text_to_video",
                    {
                        method: "POST",
                        body: requestBody
                    }
                );

            if (!runwayData.id) {

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
                success: true,
                taskId: runwayData.id,
                charactersReceived: 0
            });
        }

        // ========================================
        // ONE CHARACTER IMAGE
        // ========================================

        if (referenceImages.length === 1) {

            requestBody.promptImage =
                referenceImages[0];
        }

        // ========================================
        // TWO CHARACTER IMAGES
        // ========================================

        if (referenceImages.length === 2) {

            /*
             * Runway's promptImage keyframe format
             * supports first and last positions.
             *
             * IMPORTANT:
             * This means the first image is used
             * as the opening frame and the second
             * image as the ending frame.
             */

            requestBody.promptImage = [
                {
                    uri: referenceImages[0],
                    position: "first"
                },
                {
                    uri: referenceImages[1],
                    position: "last"
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
                    method: "POST",
                    body: requestBody
                }
            );

        // ========================================
        // TASK ID
        // ========================================

        if (!runwayData.id) {

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
            success: true,
            taskId: runwayData.id,
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
});

// ========================================
// CHECK VIDEO STATUS
// ========================================

app.get("/api/status/:taskId", async (req, res) => {

    try {

        if (!RUNWAY_API_KEY) {

            return res.status(500).json({
                error:
                    "RUNWAYML_API_SECRET is not configured."
            });
        }

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
                    method: "GET"
                }
            );

        const result = {
            id: data.id,
            status: data.status
        };

        // ========================================
        // SUCCEEDED
        // ========================================

        if (
            data.status === "SUCCEEDED"
        ) {

            if (
                Array.isArray(data.output) &&
                data.output.length > 0 &&
                typeof data.output[0] === "string"
            ) {

                result.videoUrl =
                    data.output[0];
            }

            if (!result.videoUrl) {

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
            data.status === "FAILED"
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
            data.status === "CANCELLED"
        ) {

            result.error =
                "Video generation was cancelled.";
        }

        return res.json(result);

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
});

// ========================================
// START SERVER
// ========================================

app.listen(
    PORT,
    () => {

        console.log(
            `AK AI Video Studio running on port ${PORT}`
        );

        console.log(
            `Runway model: ${RUNWAY_MODEL}`
        );

        console.log(
            `Runway API version: ${RUNWAY_API_VERSION}`
        );
    }
);
