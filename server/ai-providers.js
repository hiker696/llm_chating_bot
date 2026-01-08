import OpenAI from "openai";

function ensure(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function makeOpenAIClient(apiKey, baseURL) {
  return new OpenAI({ apiKey, baseURL });
}

// 统一的 Provider 接口：
// provider = {
//   name: string,
//   defaultModel: string,
//   streamChat: async function* (messages, { model, maxTokens }) { yield content }
// }

function buildQwenProvider(env) {
  const apiKey = ensure(
    env.QWEN_API_KEY,
    "QWEN_API_KEY is required for Qwen provider"
  );
  const baseURL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const client = makeOpenAIClient(apiKey, baseURL);
  // 默认模型：qwen-turbo (文本)，如需视觉可用 qwen-vl-plus (图文)
  const defaultModel = "qwen-turbo";

  return {
    name: "qwen",
    defaultModel,
    async *streamChat(
      messages,
      { model = defaultModel, maxTokens = 800 } = {}
    ) {
      // 检查是否有图片内容，自动切换到视觉模型
      let finalModel = model;
      const hasImages = messages.some(
        (msg) =>
          Array.isArray(msg.content) &&
          msg.content.some((c) => c.type === "image_url")
      );

      // 如果消息中包含图片且没有指定特殊模型，使用视觉模型
      if (hasImages && model === defaultModel) {
        finalModel = "qwen-vl-plus";
        console.log("[Qwen] 检测到图片，自动切换到视觉模型:", finalModel);
      }

      const stream = await client.chat.completions.create({
        model: finalModel,
        messages,
        max_tokens: maxTokens,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk?.choices?.[0]?.delta?.content;
        if (content) yield content;
      }
    },
  };
}

function buildOpenAICompatProvider(env) {
  const apiKey = ensure(
    env.OPENAI_COMPAT_API_KEY,
    "OPENAI_COMPAT_API_KEY is required for openai_compat provider"
  );
  const baseURL = env.OPENAI_COMPAT_BASE_URL || "https://api.openai.com/v1";
  const defaultModel = env.OPENAI_COMPAT_MODEL || "gpt-3.5-turbo";
  const client = makeOpenAIClient(apiKey, baseURL);

  return {
    name: "openai_compat",
    defaultModel,
    async *streamChat(
      messages,
      { model = defaultModel, maxTokens = 800 } = {}
    ) {
      const stream = await client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk?.choices?.[0]?.delta?.content;
        if (content) yield content;
      }
    },
  };
}

function buildMockProvider() {
  const defaultModel = "mock";
  return {
    name: "mock",
    defaultModel,
    async *streamChat(messages, { model = defaultModel } = {}) {
      const last = messages[messages.length - 1]?.content || "";
      const reply = `模拟回复：${last}`;
      for (const ch of reply) {
        await new Promise((r) => setTimeout(r, 20));
        yield ch;
      }
    },
  };
}

export function getProvider(name, env = process.env) {
  const key = (name || env.AI_PROVIDER || "qwen").toLowerCase();
  if (key === "qwen") return buildQwenProvider(env);
  if (key === "openai_compat" || key === "openai-compat" || key === "openai")
    return buildOpenAICompatProvider(env);
  if (key === "mock") return buildMockProvider();
  throw new Error(`Unknown AI provider: ${name}`);
}
