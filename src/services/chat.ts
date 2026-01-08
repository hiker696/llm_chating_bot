// 简单的请求层封装：默认使用 mock，可通过参数切换到真实 fetch
export type SendOptions = {
  signal?: AbortSignal;
  useMock?: boolean;
};

const DEFAULT_USE_MOCK = true;

export function sendMessage(prompt: string, options: SendOptions = {}) {
  const useMock = options.useMock ?? DEFAULT_USE_MOCK;
  if (useMock) {
    return new Promise<{ text: string }>((resolve, reject) => {
      const t = setTimeout(() => {
        resolve({ text: `模拟回复：${prompt}` });
      }, 700 + Math.random() * 600);

      if (options.signal) {
        options.signal.addEventListener("abort", () => {
          clearTimeout(t);
          // DOMException('AbortError') 更贴近浏览器中断行为
          reject(new DOMException("Aborted", "AbortError"));
        });
      }
    });
  }

  // 真正对接后端 LLM 的示例实现（可根据后端接口调整）
  return fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
    signal: options.signal,
  }).then(async (res) => {
    if (!res.ok) throw new Error(res.statusText || "Network error");
    const data = await res.json();
    // 假设后端返回 { text: '...' }
    return { text: data?.text ?? String(data) };
  });
}

export default sendMessage;
