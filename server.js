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

```
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

const content = [];

if (message.trim()) {
  content.push({
    type: "text",
    text: message
  });
}

for (let i = 0; i < files.length; i++) {
  const file = files[i];

  const mime = file.mimetype || "";
  const fileName = file.originalname || "file";

  if (mime.indexOf("image/") === 0) {
    const base64 = file.buffer.toString("base64");

    content.push({
      type: "image_url",
      image_url: {
        url: "data:" + mime + ";base64," + base64
      }
    });

  } else {
    const text = file.buffer.toString("utf8");

    content.push({
      type: "text",
      text:
        "\n\n===== FILE: " +
        fileName +
        " =====\n\n" +
        text +
        "\n\n===== END FILE ====="
    });
  }
}

if (content.length === 0) {
  return res.status(400).json({
    success: false,
    error: "اكتب رسالة أو أرفق ملفًا."
  });
}

console.log("Sending request to OpenRouter...");

const response = await fetch(
  "https://openrouter.ai/api/v1/chat/completions",
  {
    method: "POST",

    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ak-runway-api-19.onrender.com",
      "X-Title": "AK Code Protection"
    },

    body: JSON.stringify({
      model: "openrouter/free",

      messages: [
        {
          role: "system",
          content:
            "أنت AK Code Protection، مساعد برمجي عربي متخصص. " +
            "ساعد المستخدم في كتابة الأكواد وإصلاحها وشرحها وتحليل الملفات والصور المتعلقة بالبرمجة. " +
            "إذا طلب المستخدم كودًا كاملًا فأرسل الكود كاملًا. " +
            "إذا أرسل ملفًا، اقرأ محتواه وحلله. " +
            "استخدم Markdown عند عرض الأكواد. " +
            "أجب باللغة العربية بشكل واضح ومباشر."
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

const data = await response.json();

if (!response.ok) {
  console.error(
    "OPENROUTER ERROR:",
    JSON.stringify(data, null, 2)
  );

  return res.status(response.status).json({
    success: false,
    error:
      data &&
      data.error &&
      data.error.message
        ? data.error.message
        : "حدث خطأ من OpenRouter."
  });
}

let reply = "لم يصل رد من الذكاء الاصطناعي.";

if (
  data &&
  data.choices &&
  data.choices.length > 0 &&
  data.choices[0].message
) {
  reply = data.choices[0].message.content;
}

console.log("OpenRouter response received.");

return res.json({
  success: true,
  reply: reply,

  files: files.map(function (file) {
    return {
      name: file.originalname,
      size: file.size,
      type: file.mimetype
    };
  })
});
```

} catch (error) {
console.error("SERVER ERROR:", error);

```
return res.status(500).json({
  success: false,
  error:
    error && error.message
      ? error.message
      : "حدث خطأ أثناء الاتصال بالسيرفر."
});
```

}
});

app.listen(PORT, function () {
console.log(
"AK Code Protection is running on port " + PORT
);
});
