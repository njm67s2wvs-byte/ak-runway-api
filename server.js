const express = require("express");
const multer = require("multer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

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

app.get("/api/health", (req, res) => {
res.json({
success: true,
status: "online"
});
});

app.post("/api/chat", upload.array("files", 20), async (req, res) => {
try {
if (!OPENROUTER_API_KEY) {
return res.status(500).json({
success: false,
error: "OPENROUTER_API_KEY غير موجود في Render."
});
}

```
const message = req.body.message || "";
const files = req.files || [];

if (!message && files.length === 0) {
  return res.status(400).json({
    success: false,
    error: "اكتب رسالة أو أرفق ملفًا."
  });
}

const content = [];

if (message) {
  content.push({
    type: "text",
    text: message
  });
}

for (const file of files) {
  const mime = file.mimetype || "";
  const fileName = file.originalname || "file";

  if (mime.startsWith("image/")) {
    const base64 = file.buffer.toString("base64");
    const imageData = "data:" + mime + ";base64," + base64;

    content.push({
      type: "image_url",
      image_url: {
        url: imageData
      }
    });

    continue;
  }

  const isTextFile =
    mime.startsWith("text/") ||
    /\.(js|ts|jsx|tsx|lua|py|python|java|cpp|c|h|cs|php|html|css|json|xml|sql|md|txt|sh|bat|yaml|yml|toml|ini|config)$/i.test(fileName);

  if (isTextFile) {
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
  } else {
    content.push({
      type: "text",
      text:
        "\n\nتم إرفاق الملف: " +
        fileName +
        "\nنوع الملف: " +
        mime +
        "\nحجم الملف: " +
        file.size +
        " bytes\n"
    });
  }
}

const response = await fetch(
  "https://openrouter.ai/api/v1/chat/completions",
  {
    method: "POST",
    headers: {
      Authorization: "Bearer " + OPENROUTER_API_KEY,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ak-runway-api-9.onrender.com",
      "X-Title": "AK Code Protection"
    },
    body: JSON.stringify({
      model: "openrouter/free",
      messages: [
        {
          role: "system",
          content:
            "أنت AK Code Protection، مساعد برمجي متخصص. " +
            "ساعد المستخدم في كتابة وإصلاح وشرح الأكواد وتحليل الملفات. " +
            "أجب باللغة العربية بشكل واضح. " +
            "عند إرسال كود استخدم Markdown code fences. " +
            "إذا طلب المستخدم ملفًا كاملًا فأرسل الملف كاملًا."
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
    "OpenRouter API Error:",
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

let reply = "لم يتم الحصول على رد من النموذج.";

if (
  data &&
  data.choices &&
  data.choices[0] &&
  data.choices[0].message &&
  data.choices[0].message.content
) {
  reply = data.choices[0].message.content;
}

return res.json({
  success: true,
  reply: reply,
  files: files.map((file) => ({
    name: file.originalname,
    size: file.size,
    type: file.mimetype
  }))
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

app.get("*", (req, res) => {
res.sendFile(
path.join(__dirname, "public", "index.html")
);
});

app.listen(PORT, () => {
console.log(
"AK Code Protection is running on port " + PORT
);
});
