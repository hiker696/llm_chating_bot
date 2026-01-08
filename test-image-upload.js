// 测试图片上传功能（使用内置 fetch）

const TEST_API = "http://localhost:3000/api/chat";

// 创建一个简单的测试图片（1x1像素的白色PNG）
const testImageBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

async function testImageUpload() {
  try {
    console.log("🧪 开始测试图片上传功能...\n");

    // 测试1: 文本 + 图片
    console.log("📸 测试1: 发送文本 + 图片");
    const response = await fetch(TEST_API, {
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

    if (response.ok) {
      console.log("✅ 请求发送成功 (200 OK)");
      console.log("📡 响应内容类型:", response.headers.get("content-type"));

      // 读取流式响应
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            chunkCount++;
            const data = line.slice(6);
            if (data === "[DONE]") {
              console.log(`✅ 流式响应完成，共收到 ${chunkCount} 个数据块\n`);
              break;
            }
            try {
              const json = JSON.parse(data);
              fullResponse += json.content || "";
            } catch (e) {
              // 解析失败，忽略
            }
          }
        }
      }

      console.log("💬 AI 回复内容 (前200字符):");
      console.log(fullResponse.substring(0, 200));
    } else {
      console.log("❌ 请求失败:", response.status, response.statusText);
      const errorText = await response.text();
      console.log("错误详情:", errorText);
    }

    // 测试2: 仅文本（对比）
    console.log("\n📝 测试2: 发送仅文本（对比测试）");
    const response2 = await fetch(TEST_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "hello",
        provider: "qwen",
      }),
    });

    if (response2.ok) {
      console.log("✅ 仅文本请求发送成功");
    } else {
      console.log("❌ 仅文本请求失败:", response2.status);
    }
  } catch (error) {
    console.error("❌ 测试过程出错:", error.message);
  }

  console.log("\n✅ 测试完成！");
  process.exit(0);
}

// 等待服务器启动
setTimeout(testImageUpload, 1000);
