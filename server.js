import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { getProvider } from "./server/ai-providers.js";
import { sseStreamFromProvider } from "./server/ai-stream-handler.js";

dotenv.config();

// 可通过 AI_PROVIDER 指定默认 Provider（qwen / openai_compat / mock）
if (
  !process.env.QWEN_API_KEY &&
  (process.env.AI_PROVIDER || "qwen").toLowerCase() === "qwen"
) {
  console.warn(
    "Warning: QWEN_API_KEY is not set. Qwen provider will fail without it."
  );
}

const app = express();
app.use(cors());
// 增加请求体大小限制到 50MB，支持较大的图片文件
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

// 简单的转发接口，接收 { prompt, images }
app.post("/api/chat", async (req, res) => {
  const prompt = req.body?.prompt || "";
  const images = req.body?.images || [];
  const providerName = (
    req.body?.provider ||
    process.env.AI_PROVIDER ||
    "qwen"
  ).toLowerCase();
  const modelOverride = req.body?.model;
  const maxTokens = req.body?.max_tokens || 800;

  try {
    if (!prompt && !Array.isArray(req.body?.messages) && images.length === 0) {
      return res.status(400).json({ error: "prompt or images required" });
    }

    const provider = getProvider(providerName, process.env);

    // 构建消息：如果有图片，将其转换为内容数组
    let messages;
    if (Array.isArray(req.body?.messages)) {
      messages = req.body.messages;
    } else {
      const userContent = [];

      // 添加文本内容
      if (prompt) {
        userContent.push({ type: "text", text: prompt });
      }

      // 添加图片内容
      if (images.length > 0) {
        images.forEach((img) => {
          userContent.push({
            type: "image_url",
            image_url: {
              url: img.data, // Base64编码的数据URL
            },
          });
        });
      }

      messages = [
        {
          role: "user",
          content: userContent.length === 1 ? userContent[0].text : userContent,
        },
      ];
    }

    console.log(
      `[AI] provider=${provider.name}, model=${
        modelOverride || provider.defaultModel
      }, images=${images.length}`
    );
    await sseStreamFromProvider(res, provider, {
      messages,
      model: modelOverride || provider.defaultModel,
      maxTokens,
    });
  } catch (err) {
    console.error("/api/chat error:", err);
    // 如果头还没发，fallback 为 JSON 错误
    try {
      if (!res.headersSent) {
        return res.status(500).json({ error: String(err) });
      }
    } catch {}
    if (!res.writableEnded) {
      res.end();
    }
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`OpenAI proxy server listening on http://localhost:${port}`);
});
