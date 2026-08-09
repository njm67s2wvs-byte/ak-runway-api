```javascript
const express = require("express");
const multer = require("multer");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error("ERROR: OPENROUTER_API_KEY is missing.");
}

// ========================================
// Express settings
// ========================================

app.use(
  express.json({
    limit: "100mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "100mb"
  })
);

// ========================================
// File upload
// ========================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 20
  }
});

// ========================================
// Frontend
// ========================================

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

// ========================================
// Health check
// ========================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    service: "AK Code Protection"
  });
});

// ========================================
// AI CHAT
// ========================================

app.post(
  "/api/chat",
  upload.array("files", 20),

  async (req, res) => {

    try {

      if (!OPENROUTER_API_KEY) {
        return res.status(500).json({
          success: false,
          error: "OPENROUTER_API_KEY غير موجود في إعدادات السيرفر."
        });
      }

      const message =
        req.body.message || "";

      const files =
        req.files || [];

      if (!message && files.length === 0) {
        return res.status(400).json({
          success: false,
          error: "اكتب رسالة أو أرفق ملفًا."
        });
      }

      // ========================================
      // Build message content
      // ========================================

      const content = [];

      if (message) {
        content.push({
          type: "text",
          text: message
        });
      }

      // ========================================
      // Process uploaded files
      // ========================================

      for (const file of files) {

        const mime =
          file.mimetype || "";

        const fileName =
          file.originalname || "file";

        // ----------------------------------------
        // Images
        // ----------------------------------------

        if (mime.startsWith("image/")) {

          const base64 =
            file.buffer.toString("base64");

          content.push({
            type: "image_url",
            image_url: {
              url:
                `data:${mime};base64,${base64}`
            }
          });

          continue;
        }

        // ----------------------------------------
        // Text / programming files
        // ----------------------------------------

        const isTextFile =
          mime.startsWith("text/") ||
          /\.(js|ts|jsx|tsx|lua|py|python|java|cpp|c|h|cs|php|html|css|json|xml|sql|md|txt|sh|bat|yaml|yml|toml|ini|config)$/i
            .test(fileName);

        if (isTextFile) {

          const text =
            file.buffer.toString("utf8");

          content.push({
            type: "text",

            text:
              `\n\n===== FILE: ${fileName} =====\n\n${text}\n\n===== END FILE =====`
          });

          continue;
        }

        // ----------------------------------------
        // Other files
        // ----------------------------------------

        content.push({
          type: "text",

          text:
            `\n\nتم إرفاق الملف: ${fileName}\nنوع الملف: ${mime}\nحجم الملف: ${file.size} bytes\n`
        });
      }

      // ========================================
      // OpenRouter request
      // ========================================

      const response =
        await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",

            headers: {
              "Authorization":
                `Bearer ${OPENROUTER_API_KEY}`,

              "Content-Type":
                "application/json",

              "HTTP-Referer":
                "https://ak-runway-api-9.onrender.com",

              "X-Title":
                "AK Code Protection"
            },

            body: JSON.stringify({

              model:
                "openrouter/free",

              messages: [

                {
                  role: "system",

                  content:
                    `أنت AK Code Protection، مساعد برمجي متخصص.

مهمتك مساعدة المستخدم في:
- كتابة الأكواد.
- إصلاح الأخطاء.
- شرح الأكواد.
- تطوير المواقع والتطبيقات.
- تحليل ملفات البرمجة.
- مراجعة وتحسين الأكواد.
- قراءة الصور المتعلقة بالبرمجة.
- التعامل مع الأكواد الطويلة والملفات المرفقة.

أجب باللغة العربية بشكل واضح ومباشر.

عندما ترسل كودًا، استخدم Markdown code fences بهذا الشكل:

\`\`\`javascript
الكود هنا
\`\`\`

لا تختصر الكود الذي طلب المستخدم الحصول عليه إلا إذا كان الاختصار ضروريًا.
إذا طلب المستخدم ملفًا كاملًا، أعطه الملف كاملًا.
إذا أرسل المستخدم ملفًا، حلله اعتمادًا على محتواه.
`
                },

                {
                  role: "user",

                  content
                }

              ],

              temperature: 0.2,

              max_tokens: 12000

            })
          }
        );

      // ========================================
      // Read response
      // ========================================

      const data =
        await response.json();

      if (!response.ok) {

        console.error(
          "OpenRouter API Error:",
          JSON.stringify(
            data,
            null,
            2
          )
        );

        return res.status(response.status).json({

          success: false,

          error:
            data?.error?.message ||
            "حدث خطأ من OpenRouter."

        });
      }

      const reply =
        data?.choices?.[0]?.message?.content ||
        "لم يتم الحصول على رد من النموذج.";

      // ========================================
      // Send response
      // ========================================

      res.json({

        success: true,

        reply,

        files:
          files.map(file => ({
            name:
              file.originalname,

            size:
              file.size,

            type:
              file.mimetype
          }))

      });

    } catch (error) {

      console.error(
        "SERVER ERROR:",
        error
      );

      res.status(500).json({

        success: false,

        error:
          error?.message ||
          "حدث خطأ أثناء الاتصال بالسيرفر."

      });

    }

  }
);

// ========================================
// Frontend fallback
// ========================================

app.get("*", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );

});

// ========================================
// Start server
// ========================================

app.listen(
  PORT,

  () => {

    console.log(
      `AK Code Protection is running on port ${PORT}`
    );

  }
);
```
