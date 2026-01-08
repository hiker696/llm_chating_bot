// 测试前后端连接
async function testBackend() {
  console.log("🧪 开始测试后端连接...\n");

  try {
    console.log("1️⃣ 测试基本连接");
    const response = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "你好",
        provider: "qwen",
      }),
    });

    console.log(`📡 响应状态: ${response.status}`);
    console.log(`📄 Content-Type: ${response.headers.get("content-type")}`);

    if (!response.ok) {
      const error = await response.text();
      console.log("❌ 错误响应:", error);
      return;
    }

    console.log("\n2️⃣ 测试流式响应");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let chunkCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      fullText += text;

      // 解析 SSE 格式
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          chunkCount++;
          const data = line.slice(6);
          console.log(`📦 数据块 ${chunkCount}:`, data.substring(0, 50));
        }
      }
    }

    console.log(`\n✅ 成功接收 ${chunkCount} 个数据块`);
    console.log(`📝 总长度: ${fullText.length} 字符`);
  } catch (err) {
    console.error("❌ 错误:", err.message);
    console.error("🔍 确保后端在 http://localhost:3000 运行");
  }
}

// 立即执行
testBackend();
