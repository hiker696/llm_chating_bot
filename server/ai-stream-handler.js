// 统一的 SSE 流式输出
export async function sseStreamFromProvider(
  res,
  provider,
  { messages, model, maxTokens } = {}
) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    let count = 0;
    for await (const piece of provider.streamChat(messages, {
      model,
      maxTokens,
    })) {
      count++;
      res.write(`data: ${JSON.stringify({ content: piece })}\n\n`);
    }
    res.write("data: [DONE]\n\n");
    res.end();
    return { chunks: count };
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
    res.end();
    throw err;
  }
}
