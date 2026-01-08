// 简单的请求层封装：默认使用 mock，可通过参数切换到真实 fetch
export function sendMessage(prompt, options = {}) {
  const useMock = options.useMock ?? true;
  const provider = options.provider || "qwen"; // 支持指定 provider

  console.log("📤 sendMessage 调用:", {
    prompt: prompt.substring(0, 30),
    provider,
    useMock,
  });

  if (useMock) {
    // Mock模式也返回流式接口
    console.log("🎭 使用 Mock 模式");
    return Promise.resolve({
      async *stream() {
        const mockReply = `模拟回复：${prompt}`;
        const delayPerChar = 50; // 每个字符延迟50ms，模拟流式效果

        for (const char of mockReply) {
          await new Promise((resolve) => setTimeout(resolve, delayPerChar));

          // 检查是否被中止
          if (options.signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }

          yield char;
        }
      },
    });
  }

  // 流式响应处理
  console.log("🌐 连接后端 API...");
  const fetchUrl = "/api/chat";
  const fetchBody = JSON.stringify({
    prompt,
    provider,
    images: options.images || [],
  });

  console.log("📡 POST", fetchUrl);
  console.log("📋 Request body:", fetchBody.substring(0, 100) + "...");

  return fetch(fetchUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: fetchBody,
    signal: options.signal,
  })
    .then(async (res) => {
      console.log("✅ 收到响应:", {
        status: res.status,
        contentType: res.headers.get("content-type"),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("❌ 错误响应:", { status: res.status, body: errorText });
        throw new Error(res.statusText || "Network error");
      }

      // 返回一个异步生成器，用于流式处理
      return {
        async *stream() {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let chunkCount = 0;

          try {
            while (true) {
              const { done, value } = await reader.read();
              console.log(
                `📡 read 返回: done=${done}, valueLength=${value?.length || 0}`
              );

              if (done) {
                // 处理 buffer 中剩余的内容
                if (buffer.trim()) {
                  console.log(`📋 done=true，处理剩余 buffer: "${buffer}"`);
                  const lines = buffer.split("\n").filter((l) => l.trim());
                  for (const line of lines) {
                    if (line.startsWith("data: ")) {
                      const data = line.slice(6).trim();
                      if (data && data !== "[DONE]") {
                        try {
                          const parsed = JSON.parse(data);
                          if (parsed.content) {
                            chunkCount++;
                            console.log(
                              `📥 最后数据块 #${chunkCount}: ${parsed.content.substring(
                                0,
                                50
                              )}`
                            );
                            yield parsed.content;
                          }
                        } catch (e) {
                          console.error("❌ 解析最后数据失败:", e.message);
                        }
                      }
                    }
                  }
                }
                console.log(`✅ 流式响应完成，共 ${chunkCount} 个数据块`);
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              // 保留最后一个可能不完整的行
              buffer = lines[lines.length - 1];

              // 处理所有完整的行（除了最后一行）
              for (let i = 0; i < lines.length - 1; i++) {
                const line = lines[i].trim();
                if (line === "") continue; // 跳过空行

                if (line.startsWith("data: ")) {
                  const data = line.slice(6).trim();
                  console.log(
                    `📥 接收到 data: "${data.substring(0, 60)}${
                      data.length > 60 ? "..." : ""
                    }"`
                  );

                  if (data === "[DONE]") {
                    console.log("🛑 收到 [DONE] 信号");
                    break;
                  }

                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.content) {
                      chunkCount++;
                      console.log(
                        `📥 数据块 #${chunkCount}: "${parsed.content.substring(
                          0,
                          50
                        )}..."`
                      );
                      yield parsed.content;
                    }
                    if (parsed.error) {
                      throw new Error(parsed.error);
                    }
                  } catch (e) {
                    console.error(
                      "❌ 解析数据失败:",
                      e.message,
                      "原始:",
                      data.substring(0, 100)
                    );
                  }
                }
              }
            }
          } finally {
            reader.releaseLock();
          }
        },
      };
    })
    .catch((err) => {
      console.error("❌ fetch 错误:", err);
      throw err;
    });
}

export default sendMessage;
