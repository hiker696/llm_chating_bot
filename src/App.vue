<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { sendMessage } from "./services/chat";
import { useSpeechToText } from "./composables/useSpeechToText";
import { usePromptOptimizer } from "./composables/usePromptOptimizer";
import { useDexieStorage } from "./composables/useDexieStorage.js";
import { useRequestCache } from "./composables/useRequestCache.js";
import { initializeDatabase } from "./db/database.js";
import { marked } from "marked";

// 配置marked选项
marked.setOptions({
  breaks: true, // 支持换行
  gfm: true, // 支持GitHub风格的Markdown
});

// 自定义链接渲染器 - 在新标签页打开链接
const renderer = new marked.Renderer();
renderer.link = ({ href, text }) => {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
};
marked.setOptions({ renderer });

// 导入 Composables
const {
  transcript,
  isListening,
  isSpeaking,
  startListening,
  stopListening,
  clearTranscript,
  playText,
  stopPlayback,
} = useSpeechToText();
const { analyzePrompt, optimizePrompt, isOptimizing } = usePromptOptimizer();
const {
  storedConversations,
  loadConversations,
  saveConversation,
  addMessageToConversation,
  getOfflineMessages,
  addOfflineMessage,
  updateOfflineMessageStatus,
  getStorageInfo,
} = useDexieStorage();
const { getCachedResponse, cacheResponse } = useRequestCache();

// 本地状态
const isOnline = ref(navigator.onLine);
const conversations = ref([
  {
    id: 1,
    name: "加载中...",
    title: "加载中...",
    messages: [],
  },
]); // 初始化一个占位对话

const selected = ref(0);
const newMessage = ref("");
const uploadedImages = ref([]);
const showOptimizationTips = ref(false);
const optimizationResult = ref(null);

// AI Provider 选择
const providers = [
  { name: "qwen", label: "通义千问" },
  { name: "openai_compat", label: "OpenAI兼容" },
  { name: "mock", label: "模拟模式" },
];
const selectedProvider = ref("qwen");

// 请求状态与中断控制
const inFlight = ref(false);
let controller = null;

// ============ 生命周期与初始化 ============

onMounted(async () => {
  // 初始化数据库
  const dbReady = await initializeDatabase();
  if (!dbReady) {
    console.warn("⚠️ 数据库初始化失败，使用内存存储");
  }

  // 加载本地存储的对话历史
  await loadConversations();

  // 加载成功后，同步到 conversations
  conversations.value = storedConversations.value;
  console.log(`✅ 已同步 ${conversations.value.length} 个对话到 UI`);

  // 重新发送离线消息队列
  await resendOfflineMessages();

  // 监听网络状态变化
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // 输出存储统计信息
  const storageInfo = await getStorageInfo();
  console.log("📊 本地存储统计:", storageInfo);
});

// 网络连接恢复时的处理
async function handleOnline() {
  isOnline.value = true;
  console.log("✅ 网络已连接");
  // 尝试重新发送离线消息
  await resendOfflineMessages();
}

// 网络断开时的处理
function handleOffline() {
  isOnline.value = false;
  console.log("❌ 网络已断开");
}

// 重新发送离线消息队列中的消息
async function resendOfflineMessages() {
  try {
    const offlineMessages = await getOfflineMessages();
    if (offlineMessages.length === 0) return;

    console.log(`🔄 尝试重新发送 ${offlineMessages.length} 条离线消息...`);

    for (const msg of offlineMessages) {
      try {
        // 重新发送消息
        const response = await sendMessage(msg.prompt, {
          provider: msg.provider,
          useMock: false,
          images: msg.images,
        });

        let fullResponse = "";
        for await (const chunk of response.stream()) {
          fullResponse += chunk;
        }

        // 标记为已发送
        await updateOfflineMessageStatus(msg.id, "sent");
        console.log(`✅ 离线消息已发送: ${msg.id}`);
      } catch (err) {
        // 重试次数增加，但保持 pending 状态
        console.error(`❌ 发送失败，将重试: ${msg.id}`);
      }
    }
  } catch (err) {
    console.error("❌ 重新发送离线消息出错:", err);
  }
}

// ============ 对话管理 ============

function select(index) {
  selected.value = index;
}

// 消息撤回功能
function retractMessage(messageIndex) {
  const currentConversation = conversations.value[selected.value];
  if (!currentConversation || !currentConversation.id) {
    console.error("❌ 无效的对话，无法撤回消息");
    return;
  }
  currentConversation.messages.splice(messageIndex, 1);
}

// 消息重发功能
async function resendMessage(messageIndex) {
  const currentConversation = conversations.value[selected.value];
  if (!currentConversation || !currentConversation.id) {
    console.error("❌ 无效的对话，无法重发消息");
    return;
  }

  const msg = currentConversation.messages[messageIndex];
  if (msg.from !== "me") return;

  newMessage.value = msg.text;
  retractMessage(messageIndex);
  // 延迟发送，确保 UI 更新
  setTimeout(() => send());
}

// 图片上传处理
function handleImageUpload(event) {
  const files = Array.from(event.target.files || []);
  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedImages.value.push({
        name: file.name,
        src: e.target.result,
        size: (file.size / 1024).toFixed(2) + " KB",
      });
    };
    reader.readAsDataURL(file);
  });
}

// 移除上传的图片
function removeImage(index) {
  uploadedImages.value.splice(index, 1);
}

// 语音识别集成到消息输入
function handleSpeechInput() {
  if (isListening.value) {
    stopListening();
    if (transcript.value) {
      newMessage.value = (newMessage.value + " " + transcript.value).trim();
      clearTranscript();
    }
  } else {
    startListening();
  }
}

// 提示优化功能
async function optimizeCurrentPrompt() {
  if (!newMessage.value.trim()) return;
  const result = await optimizePrompt(newMessage.value);
  optimizationResult.value = result;
  showOptimizationTips.value = true;
}

// 应用优化模板
function applyOptimizationTemplate() {
  if (optimizationResult.value?.template) {
    newMessage.value = optimizationResult.value.template;
    showOptimizationTips.value = false;
  }
}

function abort() {
  if (controller) {
    controller.abort();
    controller = null;
    inFlight.value = false;
  }
}

// 处理 Enter 键：Enter 发送，Shift+Enter 换行
function handleEnterKey(event) {
  if (!event.shiftKey) {
    // 单独按 Enter：发送消息
    event.preventDefault();
    send();
  }
  // Shift+Enter：默认行为（换行）
}

// 去掉Markdown符号，提取纯文本用于预览
function stripMarkdown(text) {
  if (!text) return "";
  return (
    text
      .replace(/^#+\s+/gm, "") // 去掉标题符号
      .replace(/\*\*(.+?)\*\*/g, "$1") // 去掉粗体
      .replace(/\*(.+?)\*/g, "$1") // 去掉斜体
      .replace(/`(.+?)`/g, "$1") // 去掉行内代码
      .replace(/\[(.+?)\]\(.+?\)/g, "$1") // 去掉链接，保留文字
      .replace(/^[-*+]\s+/gm, "") // 去掉列表符号
      .replace(/^\d+\.\s+/gm, "") // 去掉有序列表
      .replace(/^>\s+/gm, "") // 去掉引用
      .replace(/\n+/g, " ") // 多行变成一行
      .trim()
      .substring(0, 40) + (text.length > 40 ? "..." : "")
  ); // 限制40字符
}

async function send() {
  const text = newMessage.value.trim();
  console.log("🔄 send() 被调用，文本长度:", text.length);

  if (!text && uploadedImages.value.length === 0) {
    console.log("⚠️ 消息为空，返回");
    return;
  }

  // 获取当前对话，注意占位对话 id 为 1（名称为 "加载中..."）
  const currentConvAtStart = conversations.value[selected.value];
  if (currentConvAtStart && currentConvAtStart.name === "加载中...") {
    console.log("⚠️ 对话还在加载中，请稍候...");
    return;
  }

  if (inFlight.value) {
    console.log("⚠️ 已有请求在进行中，返回");
    return; // 防止重复发送
  }

  // 本地先显示用户消息（包含图片和时间戳）
  const messageWithImages = {
    from: "me",
    text,
    images: uploadedImages.value.map((img) => ({
      name: img.name,
      data: img.src,
      size: img.size,
    })),
    timestamp: Date.now(),
  };
  const currentConversation = conversations.value[selected.value];

  // 验证对话有效性
  if (!currentConversation || !currentConversation.id) {
    console.error("❌ 无效的对话，无法发送消息");
    return;
  }

  currentConversation.messages.push(messageWithImages);
  console.log("✅ 用户消息已添加到 UI");

  // 保存用户消息到本地存储
  await addMessageToConversation(currentConversation.id, messageWithImages);
  console.log("✅ 用户消息已保存到数据库");

  newMessage.value = "";
  uploadedImages.value = [];

  inFlight.value = true;
  controller = new AbortController();

  try {
    console.log("🚀 开始发送消息:", {
      text: text.substring(0, 30),
      图片数: messageWithImages.images.length,
      provider: selectedProvider.value,
      isOnline: isOnline.value,
    });

    // 检查缓存中是否有相同的请求
    const cachedResponse = await getCachedResponse(
      text,
      selectedProvider.value,
      messageWithImages.images
    );

    // 添加初始的bot消息（用于流式更新）
    const botMessageIndex = currentConversation.messages.length;
    currentConversation.messages.push({
      from: "bot",
      text: "",
      timestamp: Date.now(),
    });
    console.log("✅ Bot 消息占位符已添加");

    let fullResponse = "";

    // 如果命中缓存，直接使用缓存的响应
    if (cachedResponse) {
      console.log("📦 使用缓存响应，长度:", cachedResponse.response.length);
      fullResponse = cachedResponse.response;

      // 流式显示缓存的响应（模拟效果）
      for (const char of fullResponse) {
        currentConversation.messages[botMessageIndex].text += char;
        await new Promise((r) => setTimeout(r, 10));
      }
    } else {
      // 网络可用，调用 API
      if (isOnline.value) {
        console.log("🌐 网络在线，准备调用 sendMessage()...");
        const res = await sendMessage(text, {
          signal: controller.signal,
          provider: selectedProvider.value,
          useMock: false,
          images: messageWithImages.images,
        });
        console.log("✅ sendMessage() 返回流对象");

        // 流式处理回复
        let chunkCount = 0;
        for await (const chunk of res.stream()) {
          chunkCount++;
          if (chunkCount % 10 === 0) {
            console.log(
              `📥 收到第 ${chunkCount} 个数据块, 长度: ${chunk.length}`
            );
          }
          currentConversation.messages[botMessageIndex].text += chunk;
          fullResponse += chunk;
        }
        console.log(`✅ 流式响应完成，共 ${chunkCount} 个数据块`);

        // 将响应缓存起来
        await cacheResponse(
          text,
          selectedProvider.value,
          messageWithImages.images,
          fullResponse
        );
      } else {
        // 网络不可用，将消息加入离线队列
        console.log("⏳ 网络离线，消息已加入离线队列");
        const botMessage = {
          from: "bot",
          text: "[离线模式] 消息已保存，待网络恢复后自动发送。",
          timestamp: Date.now(),
        };
        currentConversation.messages[botMessageIndex] = botMessage;

        await addOfflineMessage({
          conversationId: currentConversation.id,
          prompt: text,
          provider: selectedProvider.value,
          images: messageWithImages.images,
          timestamp: Date.now(),
        });

        return; // 离线模式不继续
      }
    }

    // 保存 bot 响应到本地存储
    await addMessageToConversation(currentConversation.id, {
      from: "bot",
      text: fullResponse,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error("发送消息出错:", err);
    if (currentConversation) {
      if (err && err.name === "AbortError") {
        currentConversation.messages.push({
          from: "bot",
          text: "已取消请求",
        });
      } else {
        currentConversation.messages.push({
          from: "bot",
          text: "请求出错：" + (err && err.message ? err.message : String(err)),
        });
      }
    }
  } finally {
    inFlight.value = false;
    controller = null;
    console.log("发送流程结束");
  }
}

const current = computed(() => {
  const conversation = conversations.value[selected.value];
  if (!conversation) {
    // 如果数据还没加载，返回一个占位对话
    return {
      id: 1,
      name: "加载中...",
      title: "加载中...",
      messages: [],
    };
  }
  return conversation;
});

// 通过后端（OpenAI SDK）发送（已废弃，直接用send函数）
async function sendWithOpenAI() {
  // 直接调用 send 函数，统一使用流式处理
  return send();
}
</script>

<template>
  <div class="app-container">
    <aside class="sidebar">
      <div class="sidebar-header">会话</div>
      <ul class="conv-list">
        <li
          v-for="(c, i) in conversations"
          :key="c.id"
          :class="{ active: i === selected }"
          @click="select(i)"
        >
          <div class="conv-name">{{ c.name }}</div>
          <div class="conv-preview">
            {{
              c.messages.length
                ? stripMarkdown(c.messages[c.messages.length - 1].text)
                : "无消息"
            }}
          </div>
        </li>
      </ul>
      <div class="sidebar-footer">
        <button
          @click="
            conversations.push({ id: Date.now(), name: '新会话', messages: [] })
          "
        >
          新建会话
        </button>
      </div>
    </aside>

    <section class="chat-area">
      <header class="chat-header">
        <div class="header-left">
          {{ current.name }}
          <span v-if="!isOnline" class="offline-badge">🔴 离线模式</span>
          <span v-else class="online-badge">🟢 在线</span>
        </div>
        <div class="header-right">
          <select v-model="selectedProvider" class="provider-select">
            <option v-for="p in providers" :key="p.name" :value="p.name">
              {{ p.label }}
            </option>
          </select>
        </div>
      </header>
      <main class="messages">
        <div
          v-for="(m, idx) in current.messages"
          :key="idx"
          :class="['message', m.from === 'me' ? 'me' : 'bot']"
        >
          <div class="message-text" v-html="marked(m.text || '')"></div>
          <div v-if="m.from === 'me' || true" class="message-actions">
            <button
              v-if="m.from === 'me'"
              title="撤回"
              @click="retractMessage(idx)"
              class="action-btn"
            >
              🗑️
            </button>
            <button
              v-if="m.from === 'me'"
              title="重发"
              @click="resendMessage(idx)"
              class="action-btn"
            >
              🔄
            </button>
            <button
              v-if="m.from === 'bot'"
              title="播放"
              @click="playText(m.text)"
              class="action-btn"
            >
              🔊
            </button>
            <button
              v-if="isSpeaking"
              title="停止播放"
              @click="stopPlayback"
              class="action-btn"
            >
              ⏹️
            </button>
          </div>
        </div>
      </main>
      <form class="composer" @submit.prevent="send">
        <div class="input-area">
          <textarea
            v-model="newMessage"
            placeholder="输入消息，回车发送（或点击发送）"
            :disabled="inFlight"
            @keydown.enter="handleEnterKey"
          ></textarea>
          <!-- 上传的图片预览 -->
          <div v-if="uploadedImages.length" class="image-preview">
            <div
              v-for="(img, idx) in uploadedImages"
              :key="idx"
              class="preview-item"
            >
              <img :src="img.src" :title="img.name" />
              <button
                type="button"
                @click="removeImage(idx)"
                class="remove-btn"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
        <div class="composer-controls">
          <div class="composer-actions">
            <!-- 语音识别按钮 -->
            <button
              type="button"
              @click="handleSpeechInput"
              :class="['voice-btn', { listening: isListening }]"
              title="点击开始语音输入"
            >
              {{ isListening ? "🎙️ 听中..." : "🎤" }}
            </button>
            <!-- 图片上传按钮 -->
            <label class="image-btn" title="上传图片">
              📷
              <input
                type="file"
                multiple
                accept="image/*"
                @change="handleImageUpload"
                style="display: none"
              />
            </label>
            <!-- 提示优化按钮 -->
            <button
              type="button"
              @click="optimizeCurrentPrompt"
              :disabled="!newMessage.trim() || isOptimizing"
              class="optimize-btn"
              title="优化提示词质量"
            >
              {{ isOptimizing ? "优化中..." : "✨ 优化" }}
            </button>
            <!-- 发送按钮 -->
            <button type="button" @click="send" :disabled="inFlight">
              {{ inFlight ? "发送中..." : "发送" }}
            </button>
            <button v-if="inFlight" type="button" @click="abort">取消</button>
          </div>
        </div>
      </form>

      <!-- 优化建议弹窗 -->
      <div v-if="showOptimizationTips" class="optimization-modal">
        <div class="modal-content">
          <button @click="showOptimizationTips = false" class="close-btn">
            ✕
          </button>
          <h3>📝 提示词优化建议</h3>
          <div class="score-bar">
            <div
              class="score-fill"
              :style="{ width: optimizationResult?.score + '%' }"
            ></div>
            <span>质量评分: {{ optimizationResult?.score }}/100</span>
          </div>
          <h4>建议:</h4>
          <ul>
            <li
              v-for="(tip, idx) in optimizationResult?.suggestions"
              :key="idx"
            >
              {{ tip }}
            </li>
          </ul>
          <button @click="applyOptimizationTemplate" class="apply-btn">
            应用优化模板
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  width: 100%;
  height: 100%;
  gap: 0;
  margin: 0;
  padding: 0;
}
.sidebar {
  width: 280px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid rgba(0, 0, 0, 0.06);
}
.sidebar-header {
  padding: 1rem;
  font-weight: 600;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.conv-list {
  list-style: none;
  margin: 0;
  padding: 0.5rem;
  overflow-y: auto;
  flex: 1;
}
.conv-list li {
  padding: 0.6rem;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 0.4rem;
}
.conv-list li:hover {
  background: rgba(0, 0, 0, 0.03);
}
.conv-list li.active {
  background: rgba(100, 110, 255, 0.12);
}
.conv-name {
  font-weight: 600;
}
.conv-preview {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.6);
}
.sidebar-footer {
  padding: 0.6rem;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 0;
  overflow: hidden;
}
.chat-header {
  padding: 1rem;
  font-weight: 700;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-left {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.8rem;
}
.offline-badge {
  font-size: 0.75em;
  padding: 0.3rem 0.6rem;
  background: rgba(255, 68, 68, 0.1);
  color: #ff4444;
  border-radius: 4px;
  font-weight: 500;
  animation: pulse-red 1s infinite;
}
.online-badge {
  font-size: 0.75em;
  padding: 0.3rem 0.6rem;
  background: rgba(68, 170, 68, 0.1);
  color: #44aa44;
  border-radius: 4px;
  font-weight: 500;
}
@keyframes pulse-red {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}
.header-right {
  display: flex;
  gap: 0.5rem;
}
.provider-select {
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #ffffff;
  color: inherit;
  font-size: 0.9em;
  cursor: pointer;
}
.provider-select:hover {
  border-color: rgba(0, 0, 0, 0.12);
}
.provider-select:focus {
  outline: none;
  border-color: #646cff;
  box-shadow: 0 0 0 2px rgba(100, 110, 255, 0.1);
}
.messages {
  flex: 1;
  padding: 1rem;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.message {
  max-width: 70%;
  padding: 0.6rem 0.8rem;
  border-radius: 12px;
  position: relative;
  group: "message";
}
.message.me {
  margin-left: auto;
  background: rgba(100, 110, 255, 0.18);
}
.message.bot {
  margin-right: auto;
  background: rgba(0, 0, 0, 0.04);
}
.message-actions {
  display: none;
  position: absolute;
  top: -2.5rem;
  right: 0;
  gap: 0.3rem;
  padding: 0.3rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.message:hover .message-actions {
  display: flex;
}
.action-btn {
  background: none;
  border: none;
  padding: 0.3rem;
  font-size: 0.9em;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;
}
.action-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}
.message-text {
  /* 使用正常换行，避免尾部出现额外空白行 */
  white-space: normal;
  line-height: 1.6;
}

/* Markdown样式 */
.message-text :deep(h1),
.message-text :deep(h2),
.message-text :deep(h3),
.message-text :deep(h4) {
  margin: 0.8em 0 0.5em;
  font-weight: 600;
}
.message-text :deep(h1) {
  font-size: 1.5em;
}
.message-text :deep(h2) {
  font-size: 1.3em;
}
.message-text :deep(h3) {
  font-size: 1.15em;
}
.message-text :deep(h4) {
  font-size: 1em;
}

.message-text :deep(p) {
  margin: 0.5em 0;
}
/* 去掉首尾元素额外外边距，避免气泡底部留白 */
.message-text :deep(p:first-child),
.message-text :deep(pre:first-child),
.message-text :deep(ul:first-child),
.message-text :deep(ol:first-child),
.message-text :deep(blockquote:first-child),
.message-text :deep(h1:first-child),
.message-text :deep(h2:first-child),
.message-text :deep(h3:first-child),
.message-text :deep(h4:first-child) {
  margin-top: 0;
}
.message-text :deep(p:last-child),
.message-text :deep(pre:last-child),
.message-text :deep(ul:last-child),
.message-text :deep(ol:last-child),
.message-text :deep(blockquote:last-child),
.message-text :deep(h1:last-child),
.message-text :deep(h2:last-child),
.message-text :deep(h3:last-child),
.message-text :deep(h4:last-child) {
  margin-bottom: 0;
}
.message-text :deep(code) {
  background: rgba(0, 0, 0, 0.08);
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-family: "Consolas", "Monaco", monospace;
  font-size: 0.9em;
}
.message-text :deep(pre) {
  background: rgba(0, 0, 0, 0.05);
  padding: 0.8em;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0.5em 0;
}
.message-text :deep(pre code) {
  background: none;
  padding: 0;
}
.message-text :deep(ul),
.message-text :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}
.message-text :deep(li) {
  margin: 0.3em 0;
}
.message-text :deep(blockquote) {
  border-left: 3px solid rgba(0, 0, 0, 0.2);
  padding-left: 1em;
  margin: 0.5em 0;
  color: rgba(0, 0, 0, 0.7);
}
.message-text :deep(a) {
  color: #646cff;
  text-decoration: none;
}
.message-text :deep(a:hover) {
  text-decoration: underline;
}
.message-text :deep(strong) {
  font-weight: 600;
}
.message-text :deep(em) {
  font-style: italic;
}

.composer {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.8rem;
  border-top: 1px solid rgba(0, 0, 0, 0.04);
}
.input-area {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.composer textarea {
  flex: 1;
  min-height: 48px;
  max-height: 140px;
  resize: vertical;
  padding: 0.6rem;
  border-radius: 6px;
  background: #ffffff;
  color: inherit;
  border: 1px solid rgba(0, 0, 0, 0.08);
  font-family: inherit;
}
.image-preview {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.5rem 0;
}
.preview-item {
  position: relative;
  width: 60px;
  height: 60px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.1);
}
.preview-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.remove-btn {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #ff4444;
  color: white;
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.composer-controls {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.composer-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.voice-btn {
  padding: 0.5rem 0.8rem;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #ffffff;
  color: inherit;
  cursor: pointer;
  transition: background 0.2s;
}
.voice-btn.listening {
  background: #ff4444;
  color: white;
  animation: pulse 1s infinite;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}
.image-btn {
  padding: 0.5rem 0.8rem;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #ffffff;
  color: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}
.image-btn:hover {
  background: rgba(0, 0, 0, 0.03);
}
.optimize-btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #f0f0f0;
  color: inherit;
  cursor: pointer;
  transition: background 0.2s;
}
.optimize-btn:hover:not(:disabled) {
  background: rgba(100, 110, 255, 0.1);
}
.optimize-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.composer button {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #ffffff;
  cursor: pointer;
  transition: background 0.2s;
}
.composer button:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.03);
}
.composer button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 优化建议弹窗 */
.optimization-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  position: relative;
}
.close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: rgba(0, 0, 0, 0.5);
}
.close-btn:hover {
  color: rgba(0, 0, 0, 0.8);
}
.modal-content h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1.2em;
}
.modal-content h4 {
  margin: 1rem 0 0.5rem;
  font-size: 1em;
}
.modal-content ul {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0;
}
.modal-content li {
  padding: 0.4rem 0;
  color: rgba(0, 0, 0, 0.7);
  font-size: 0.9em;
}
.modal-content li:before {
  content: "• ";
  color: #646cff;
  margin-right: 0.5rem;
  font-weight: bold;
}
.score-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1rem 0;
}
.score-fill {
  width: 100%;
  height: 8px;
  background: linear-gradient(90deg, #ff4444, #ffaa00, #44aa44);
  border-radius: 4px;
  position: relative;
}
.apply-btn {
  width: 100%;
  padding: 0.8rem;
  margin-top: 1rem;
  background: #646cff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s;
}
.apply-btn:hover {
  background: #5558dd;
}
</style>
