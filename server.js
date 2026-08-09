const express = require("express");
const multer = require("multer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 20
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", function (req, res) {
  res.json({
    success: true,
    message: "SERVER OK"
  });
});

app.post("/api/chat", upload.any(), async function (req, res) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "OPENROUTER_API_KEY غير موجود في Render."
      });
    }

    let message = "";

    if (req.body && req.body.message) {
      message = String(req.body.message);
    }

    const files = req.files || [];

    return res.json({
      success: true,
      reply: "تم استقبال الرسالة بنجاح: " + message,
      files: files.map(function (file) {
        return {
          name: file.originalname,
          size: file.size,
          type: file.mimetype
        };
      })
    });

  } catch (error) {
    console.error("SERVER ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "حدث خطأ في السيرفر."
    });
  }
});

app.listen(PORT, function () {
  console.log("AK Code Protection is running on port " + PORT);
});
