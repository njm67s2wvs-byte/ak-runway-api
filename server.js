const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const RUNWAY_API_KEY = process.env.RUNWAYML_API_SECRET;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve index.html and other website files
app.use(express.static(__dirname));


// ==============================
// HEALTH CHECK
// ==============================

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        service: "AK AI Video Studio"
    });
});


// ==============================
// GENERATE VIDEO
// ==============================

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
            duration = 10
        } = req.body;


        // Check prompt
        if (!prompt || !prompt.trim()) {
            return res.status(400).json({
                error: "Video prompt is required."
            });
        }


        // ==============================
        // DURATION
        // ==============================

        let videoDuration = Number(duration);

        if (!Number.isFinite(videoDuration)) {
            videoDuration = 10;
        }

        videoDuration = Math.max(
            2,
            Math.min(10, Math.round(videoDuration))
        );


        // ==============================
        // ASPECT RATIO
        // ==============================

        const ratioMap = {
            "9:16": "720:1280",
            "16:9": "1280:720",
            "1:1": "960:960"
        };

        const ratio =
            ratioMap[aspect] || "720:1280";


        // ==============================
        // CINEMATIC PROMPT
        // ==============================

        const cinematicPrompt = `
Create a high-quality cinematic AI video.

Story:
${prompt.trim()}

Visual direction:
cinematic composition,
realistic natural motion,
expressive character acting,
detailed environment,
dramatic professional lighting,
realistic camera movement,
strong depth and atmosphere,
consistent character appearance,
professional film look,
smooth motion,
natural facial expressions,
realistic physics,
no subtitles,
no text overlays.
        `.trim();


        // Runway prompt limit
        const finalPrompt =
            cinematicPrompt.slice(0, 1000);


        // ==============================
        // RUNWAY REQUEST
        // ==============================

        const body = {
            model: "gen4.5",
            promptText: finalPrompt,
            ratio: ratio,
            duration: videoDuration
        };


        // ==============================
        // CHARACTER IMAGE
        // ==============================

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


        // ==============================
        // SEND TO RUNWAY
        // ==============================

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


        // ==============================
        // RUNWAY ERROR
        // ==============================

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

                details:
                    runwayData

            });

        }


        // ==============================
        // SUCCESS
        // ==============================

        res.json({

            success: true,

            taskId:
                runwayData.id

        });


    } catch (error) {

        console.error(
            "Generation error:",
            error
        );

        res.status(500).json({

            error:
                "Server error while starting video generation."

        });

    }

});


// ==============================
// CHECK VIDEO STATUS
// ==============================

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


        const response =
            await fetch(

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

            id:
                data.id,

            status:
                data.status

        };


        // ==============================
        // VIDEO READY
        // ==============================

        if (
            data.status === "SUCCEEDED" &&
            Array.isArray(data.output)
        ) {

            result.videoUrl =
                data.output[0];

        }


        // ==============================
        // VIDEO FAILED
        // ==============================

        if (
            data.status === "FAILED"
        ) {

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

            error:
                "Server error while checking generation status."

        });

    }

});


// ==============================
// START SERVER
// ==============================

app.listen(PORT, () => {

    console.log(
        `AK AI Video Studio running on port ${PORT}`
    );

});
