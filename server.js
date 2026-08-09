const express = require("express");
const multer = require("multer");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

// ================================
// Basic configuration
// ================================

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({
  extended: true,
  limit: "50mb"
}));

// ================================
// File upload configuration
// ================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

// ================================
// Static frontend
// ================================

app.use(express.static(path.join(__dirname, "public")));

// ================================
// Health check
// ================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    name: "AK Code Protection"
  });
});

// ================================
// Chat endpoint
// ================================

app.post("/api/chat", upload.array("files", 20), async (req, res) => {
  try {
    const message = req.body.message || "";
    const files = req.files || [];

    const uploadedFiles = files.map((file) => ({
      name: file.originalname,
      size: file.size,
      type: file.mimetype
    }));

    res.json({
      success: true,

      reply:
        "تم استلام رسالتك بنجاح. السيرفر جاهز الآن لاستقبال الأكواد والملفات والصور.",

      message: message,

      files: uploadedFiles
    });

  } catch (error) {
    console.error("Chat error:", error);

    res.status(500).json({
      success: false,
      error: "حدث خطأ أثناء معالجة الطلب."
    });
  }
});

// ================================
// Frontend fallback
// ================================

app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

// ================================
// Start server
// ================================

app.listen(PORT, () => {
  console.log(`AK Code Protection running on port ${PORT}`);
});
