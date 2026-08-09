const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "AK Code Protection API is running"
  });
});

// Chat / code endpoint
app.post("/api/chat", (req, res) => {
  try {
    const { message, code } = req.body;

    if (!message && !code) {
      return res.status(400).json({
        success: false,
        message: "Message or code is required"
      });
    }

    res.json({
      success: true,
      reply: "تم استلام رسالتك بنجاح.",
      received: {
        message: message || "",
        code: code || ""
      }
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "حدث خطأ في السيرفر"
    });
  }
});

// Fallback to frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`AK Code Protection running on port ${PORT}`);
});
