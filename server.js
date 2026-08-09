const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const RUNWAY_API_KEY = process.env.RUNWAYML_API_SECRET;

app.use(express.json({ limit: "7mb" }));
app.use(express.urlencoded({ extended: true, limit: "7mb" }));

// Serve the website
app.use(express.static(path.join(__dirname)));


// Health check
app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        service: "AK AI Video Studio"
    });
});


// Generate video
app.post("/api/generate", async (req, res) => {

    try {

        if (!RUNWAY_API_KEY) {
            return res.status(500).json({
                error: "RUNWAYML_API_SECRET is not configured."
            });
        }

        const {
            prompt,
            image,
            aspect = "9:16",
            duration = 5
        } = req.body;


        if (!prompt || !prompt.trim()) {
            return res.status(400).json({
                error: "Video prompt is required."
            });
        }


        // Runway Gen-4.5 supports 2-10 seconds.
        let videoDuration = Number(duration);

        if (!Number.isFinite(videoDuration)) {
            videoDuration = 5;
        }

        videoDuration = Math.max(
            2,
            Math.min(10, Math.round(videoDuration))
        );


        // Convert the UI aspect ratio into Runway's required ratio.
        const ratioMap = {
            "9:16": "720:1280",
            "16:9": "1280:720",
            "1:1": "960:960"
        };

        const ratio =
            ratioMap[aspect] || "720:1280";


        // Build a cinematic prompt.
        const cinematicPrompt = `
Create a high-quality cinematic AI video.

Story:
${prompt.trim()}

Visual direction:
- cinematic composition
- realistic natural motion
- expressive character acting
- detailed environment
- dramatic professional lighting
- realistic camera movement
- strong depth and atmosphere
- consistent character appearance
- professional film look
- smooth motion
- no subtitles
- no text overlays
`.trim();


        // Runway allows prompts up to 1000 UTF-16 characters.
        const finalPrompt =
            cinematicPrompt.slice(0, 1000);


        const body = {
            model: "gen4.5",
            promptText: finalPrompt,
            ratio,
            duration: videoDuration
        };


        // If the user uploaded a character reference,
        // use it as the first frame.
        if (image) {

            if (
                typeof image !== "string" ||
                !image.startsWith("data:image/")
            ) {
                return res.status(400).json({
                    error: "Invalid image format."
                });
            }

            body.promptImage = image;
        }


        const runwayResponse = await fetch(
            "https://api.dev.runwayml.com/v1/image_to_video",
            {
                method: "POST",

                headers: {
                    "Authorization":
                        `Bearer ${RUNWAY_API_KEY}`,

                    "Content-Type":
                        "application/json",

                    "X-Runway-Version":
                        "2024-11-06"
                },

                body: JSON.stringify(body)
            }
        );


        const runwayData =
            await runwayResponse.json();


        if (!runwayResponse.ok) {

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

                details: runwayData
            });
        }


        res.json({
            success: true,
            taskId: runwayData.id
        });


    } catch (error) {

        console.error(
            "Generation error:",
            error
        );

        res.status(500).json({
            error: "Server error while starting video generation."
        });
    }

});


// Check generation status
app.get("/api/status/:taskId", async (req, res) => {

    try {

        if (!RUNWAY_API_KEY) {
            return res.status(500).json({
                error: "RUNWAYML_API_SECRET is not configured."
            });
        }


        const taskId =
            req.params.taskId;


        const response = await fetch(
            `https://api.dev.runwayml.com/v1/tasks/${encodeURIComponent(taskId)}`,
            {
                method: "GET",

                headers: {
                    "Authorization":
                        `Bearer ${RUNWAY_API_KEY}`,

                    "X-Runway-Version":
                        "2024-11-06"
                }
            }
        );


        const data =
            await response.json();


        if (!response.ok) {

            return res.status(
                response.status
            ).json({
                error:
                    data.error ||
                    data.message ||
                    "Unable to check task."
            });
        }


        const result = {
            id: data.id,
            status: data.status
        };


        if (
            data.status === "SUCCEEDED" &&
            Array.isArray(data.output)
        ) {
            result.videoUrl =
                data.output[0];
        }


        if (data.status === "FAILED") {
            result.error =
                data.failure ||
                data.failureCode ||
                "Video generation failed.";
        }


        res.json(result);


    } catch (error) {

        console.error(
            "Status error:",
            error
        );

        res.status(500).json({
            error: "Server error while checking generation status."
        });
    }

});


// Start server
app.listen(PORT, () => {

    console.log(
        `AK AI Video Studio running on port ${PORT}`
    );

});
