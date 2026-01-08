// 简单的测试脚本
const testImageBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

async function test() {
  // 等待服务器启动
  await new Promise((r) => setTimeout(r, 3000));

  try {
    console.log("🧪 发送测试请求...");
    const response = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "请分析这张图片",
        provider: "qwen",
        images: [
          {
            name: "test.png",
            data: `data:image/png;base64,${testImageBase64}`,
            size: "0.5 KB",
          },
        ],
      }),
    });

    console.log("✅ 响应状态:", response.status);
    console.log("📡 Content-Type:", response.headers.get("content-type"));

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let chunkCount = 0;
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          chunkCount++;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const json = JSON.parse(data);
            fullText += json.content || "";
          } catch (e) {}
        }
      }
    }

    console.log(`✅ 收到 ${chunkCount} 个数据块`);
    console.log("💬 回复:", fullText.substring(0, 150));
  } catch (e) {
    console.error("❌ 错误:", e.message);
  }
}

test().then(() => process.exit(0));
