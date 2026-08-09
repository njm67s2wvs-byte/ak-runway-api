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

app.post("/api/chat", upload.any(), function (req, res) {
console.log("CHAT REQUEST RECEIVED");

var message = "";

if (req.body && req.body.message) {
message = String(req.body.message);
}

var files = [];

if (req.files && Array.isArray(req.files)) {
files = req.files;
}

console.log("MESSAGE:", message);
console.log("FILES:", files.length);

return res.json({
success: true,
reply:
"السيرفر استقبل طلبك بنجاح. الرسالة: " +
message,
files: files.map(function (file) {
return {
name: file.originalname,
size: file.size,
type: file.mimetype
};
})
});
});

app.listen(PORT, function () {
console.log(
"AK Code Protection is running on port " + PORT
);
});
