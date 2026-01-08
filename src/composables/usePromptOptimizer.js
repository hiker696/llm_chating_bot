import { ref } from "vue";

export function usePromptOptimizer() {
  const isOptimizing = ref(false);
  const optimizationTips = ref([
    "添加具体的背景信息（Who、What、When、Where）",
    "明确期望的输出格式（列表、JSON、表格等）",
    "指定语气和风格（正式、幽默、专业等）",
    "包含具体示例来澄清需求",
    "限制输出长度或深度",
    "要求逐步推理（Chain of Thought）",
  ]);

  // 根据提示词长度和内容给出优化建议
  function analyzePrompt(text) {
    const tips = [];

    if (text.length < 10) {
      tips.push("提示词太短，建议补充更多细节");
    }

    if (!text.includes("?") && !text.includes("？")) {
      tips.push("建议以疑问句形式提问，可获得更清晰的回答");
    }

    if (text.split(" ").length < 3) {
      tips.push("关键词过少，建议用更多描述词丰富提示");
    }

    if (!text.match(/[，。、；：]/)) {
      tips.push("建议使用中文标点符号分隔不同部分");
    }

    // 检查是否包含上下文
    if (!text.match(/背景|背景信息|假设|场景/)) {
      tips.push("可以添加背景说明（如：假设场景）来优化回答");
    }

    return tips.length > 0 ? tips : ["提示词质量不错！"];
  }

  // 优化提示词的模板
  function optimizePromptTemplate(originalPrompt) {
    return `请按如下结构回答：

【任务】
${originalPrompt}

【背景】
（请提供相关背景信息）

【期望输出格式】
（指定输出格式，如：分点列表、JSON、表格等）

【约束条件】
（任何限制条件）`;
  }

  // 模拟优化提示词（实际可连接 AI 优化）
  async function optimizePrompt(originalPrompt) {
    isOptimizing.value = true;
    try {
      // 这里可以调用后端 API 对提示词进行 AI 优化
      // 目前返回优化建议和模板
      return {
        suggestions: analyzePrompt(originalPrompt),
        template: optimizePromptTemplate(originalPrompt),
        score: calculatePromptScore(originalPrompt),
      };
    } finally {
      isOptimizing.value = false;
    }
  }

  // 计算提示词质量评分（0-100）
  function calculatePromptScore(text) {
    let score = 50;

    if (text.length > 20) score += 10;
    if (text.length > 50) score += 10;
    if (text.match(/[？？]/)) score += 10;
    if (text.match(/背景|场景|假设/)) score += 10;
    if (text.match(/格式|形式|输出/)) score += 10;

    return Math.min(score, 100);
  }

  return {
    isOptimizing,
    optimizationTips,
    analyzePrompt,
    optimizePrompt,
    optimizePromptTemplate,
    calculatePromptScore,
  };
}
