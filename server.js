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

      if (mime.startsWith("image/")) {
        const base64 = file.buffer.toString("base64");

        content.push({
          type: "image_url",
          image_url: {
            url: "data:" + mime + ";base64," + base64
          }
        });
      } else {
        const fileText = file.buffer.toString("utf8");

        content.push({
          type: "text",
          text:
            "\n===== FILE: " +
            fileName +
            " =====\n" +
            fileText +
            "\n===== END FILE =====\n"
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
          "HTTP-Referer": "https://ak-runway-api-21.onrender.com",
          "X-Title": "AK Code Protection"
        },
        body: JSON.stringify({
          model: "openrouter/free",
          messages: [
            {
              role: "system",
              content:
                "أنت AK Code Protection، مساعد برمجي متخصص. " +
                "ساعد المستخدم في كتابة الأكواد وإصلاحها وشرحها وتحليل الملفات. " +
                "يمكنك التعامل مع الأكواد الطويلة. " +
                "إذا أرسل المستخدم صورة متعلقة بالكود فحللها. " +
                "إذا أرسل ملفًا نصيًا أو ملف كود فاقرأ محتواه وحلله. " +
                "أجب باللغة العربية. " +
                "عند إرسال الأكواد استخدم Markdown code blocks. " +
                "لا تختصر الكود عندما يطلب المستخدم الكود كاملًا."
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

    console.log("OpenRouter status:", response.status);

    if (!response.ok) {
      console.error(
        "OPENROUTER ERROR:",
        JSON.stringify(data, null, 2)
      );

      return res.status(500).json({
        success: false,
        error:
          data &&
          data.error &&
          data.error.message
            ? data.error.message
            : "OpenRouter رفض الطلب."
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

    console.log("AI response received successfully.");

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

  } catch (error) {
    console.error("SERVER ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "حدث خطأ أثناء الاتصال بالسيرفر."
    });
  }
});

app.listen(PORT, function () {
  console.log(
    "AK Code Protection is running on port " + PORT
  );
});
