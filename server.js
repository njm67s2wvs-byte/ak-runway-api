const express = require("express");
const multer = require("multer");
const path = require("path");
const OpenAI = require("openai");

const app = express();

const PORT = process.env.PORT || 3000;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ================================
// Express
// ================================

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

// ================================
// File Uploads
// ================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 20
  }
});

// ================================
// Frontend
// ================================

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

// ================================
// Health
// ================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    name: "AK Code Protection"
  });
});

// ================================
// AI CHAT
// ================================

app.post(
  "/api/chat",
  upload.array("files", 20),

  async (req, res) => {

    try {

      const message =
        req.body.message || "";

      const files =
        req.files || [];


      if (
        !message &&
        files.length === 0
      ) {

        return res.status(400).json({
          success: false,
          error: "اكتب رسالة أو أرفق ملفًا."
        });

      }


      // ==========================
      // Build user content
      // ==========================

      const content = [];


      if (message) {

        content.push({
          type: "input_text",
          text: message
        });

      }


      // ==========================
      // Add uploaded files
      // ==========================

      for (const file of files) {

        const mime =
          file.mimetype || "";


        // Images
        if (
          mime.startsWith("image/")
        ) {

          const base64 =
            file.buffer.toString("base64");


          content.push({
            type: "input_image",
            image_url:
              `data:${mime};base64,${base64}`
          });

          continue;
        }


        // Text / code files
        const isTextFile =
          mime.startsWith("text/") ||
          /\.(js|ts|jsx|tsx|lua|py|python|java|cpp|c|h|cs|php|html|css|json|xml|sql|md|txt|sh|bat|yaml|yml)$/i
            .test(file.originalname);


        if (isTextFile) {

          const text =
            file.buffer.toString("utf8");


          content.push({
            type: "input_text",

            text:
              `\n\n===== FILE: ${file.originalname} =====\n\n${text}\n\n===== END FILE =====`
          });

          continue;
        }


        // Unsupported binary files
        content.push({
          type: "input_text",

          text:
            `\n\nتم إرفاق الملف "${file.originalname}" (${file.mimetype}, ${file.size} bytes)، لكن محتواه الثنائي لا يمكن قراءته كنص مباشرة.`
        });

      }


      // ==========================
      // OpenAI
      // ==========================

      const response =
        await client.responses.create({

          model: "gpt-5.6",

          instructions:
            `أنت AK Code Protection، مساعد برمجي متخصص.

ساعد المستخدم في:
- كتابة الأكواد.
- إصلاح الأخطاء.
- شرح الأكواد.
- تطوير المشاريع.
- تحليل الملفات.
- التعامل مع الصور المتعلقة بالبرمجة.
- إعادة كتابة وتحسين الأكواد.

عندما ترسل كودًا للمستخدم، استخدم Markdown code fences مثل:
\`\`\`javascript
الكود
\`\`\`

لا تحذف أجزاء من الكود الطويل بدون سبب.
إذا طلب المستخدم تعديل كود كامل، أعد الكود كاملًا قدر الإمكان.
اجعل إجاباتك واضحة ومباشرة باللغة العربية، ويمكنك استخدام المصطلحات البرمجية الإنجليزية عند الحاجة.`,

          input: [
            {
              role: "user",
              content
            }
          ],

          max_output_tokens: 12000

        });


      // ==========================
      // Response
      // ==========================

      const reply =
        response.output_text ||
        "لم يتم الحصول على رد من النموذج.";


      res.json({

        success: true,

        reply,

        files:
          files.map(file => ({
            name: file.originalname,
            size: file.size,
            type: file.mimetype
          }))

      });


    } catch (error) {

      console.error(
        "OpenAI Error:",
        error
      );


      res.status(500).json({

        success: false,

        error:
          error?.message ||
          "حدث خطأ أثناء الاتصال بالذكاء الاصطناعي."

      });

    }

  }
);

// ================================
// Frontend fallback
// ================================

app.get("*", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );

});

// ================================
// Start Server
// ================================

app.listen(
  PORT,
  () => {

    console.log(
      `AK Code Protection running on port ${PORT}`
    );

  }
);
