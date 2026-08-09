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
status: "online"
});
});

app.post("/api/chat", upload.array("files", 20), async function (req, res) {
try {
var apiKey = process.env.OPENROUTER_API_KEY;

```
if (!apiKey) {
  return res.status(500).json({
    success: false,
    error: "OPENROUTER_API_KEY غير موجود في Render."
  });
}

var message = req.body.message || "";
var files = req.files || [];
var content = [];

if (message) {
  content.push({
    type: "text",
    text: message
  });
}

for (var i = 0; i < files.length; i++) {
  var file = files[i];
  var mime = file.mimetype || "";
  var name = file.originalname || "file";

  if (mime.indexOf("image/") === 0) {
    var base64 = file.buffer.toString("base64");

    content.push({
      type: "image_url",
      image_url: {
        url: "data:" + mime + ";base64," + base64
      }
    });

  } else {
    var text = file.buffer.toString("utf8");

    content.push({
      type: "text",
      text:
        "\n===== FILE: " +
        name +
        " =====\n" +
        text +
        "\n===== END FILE =====\n"
    });
  }
}

if (content.length === 0) {
  return res.status(400).json({
    success: false,
    error: "اكتب رسالة أو أرفق ملف."
  });
}

var response = await fetch(
  "https://openrouter.ai/api/v1/chat/completions",
  {
    method: "POST",

    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ak-runway-api-18.onrender.com",
      "X-Title": "AK Code Protection"
    },

    body: JSON.stringify({
      model: "openrouter/free",

      messages: [
        {
          role: "system",
          content:
            "أنت مساعد برمجي عربي. " +
            "اكتب واشرح وأصلح الأكواد. " +
            "حلل الملفات والصور المتعلقة بالبرمجة. " +
            "إذا طلب المستخدم كودًا كاملًا فأرسله كاملًا. " +
            "استخدم Markdown عند عرض الأكواد."
        },
        {
          role: "user",
          content: content
        }
      ],

      temperature: 0.2,
      max_tokens: 12000
    })
  }
);

var data = await response.json();

if (!response.ok) {
  console.error("OPENROUTER ERROR:", data);

  return res.status(response.status).json({
    success: false,
    error:
      data &&
      data.error &&
      data.error.message
        ? data.error.message
        : "OpenRouter رفض الطلب."
  });
}

var reply = "لم يصل رد من النموذج.";

if (
  data &&
  data.choices &&
  data.choices[0] &&
  data.choices[0].message
) {
  reply = data.choices[0].message.content;
}

return res.json({
  success: true,
  reply: reply
});
```

} catch (error) {
console.error("SERVER ERROR:", error);

```
return res.status(500).json({
  success: false,
  error: error.message || "حدث خطأ في السيرفر."
});
```

}
});

app.listen(PORT, function () {
console.log("AK Code Protection is running on port " + PORT);
});
