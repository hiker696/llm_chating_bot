<script setup>
import { ref, computed } from "vue";

const conversations = ref([
  {
    id: 1,
    name: "系统",
    messages: [{ from: "bot", text: "欢迎，开始新的对话吧。" }],
  },
  {
    id: 2,
    name: "Alice",
    messages: [{ from: "bot", text: "嗨，我是 Alice 的机器人。" }],
  },
  { id: 3, name: "团队讨论", messages: [] },
]);

const selected = ref(0);
const newMessage = ref("");

function select(index) {
  selected.value = index;
}

function send() {
  const text = newMessage.value.trim();
  if (!text) return;
  conversations.value[selected.value].messages.push({ from: "me", text });
  newMessage.value = "";
  setTimeout(() => {
    conversations.value[selected.value].messages.push({
      from: "bot",
      text: "已收到：" + text,
    });
  }, 500);
}

const current = computed(() => conversations.value[selected.value]);
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
                ? c.messages[c.messages.length - 1].text
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
      <header class="chat-header">{{ current.name }}</header>
      <main class="messages">
        <div
          v-for="(m, idx) in current.messages"
          :key="idx"
          :class="['message', m.from === 'me' ? 'me' : 'bot']"
        >
          <div class="message-text">{{ m.text }}</div>
        </div>
      </main>
      <form class="composer" @submit.prevent="send">
        <textarea
          v-model="newMessage"
          placeholder="输入消息，回车发送（或点击发送）"
        ></textarea>
        <div class="composer-actions">
          <button type="button" @click="send">发送</button>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  height: calc(100vh - 4rem);
  gap: 1rem;
}
.sidebar {
  width: 280px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sidebar-header {
  padding: 1rem;
  font-weight: 600;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
  background: rgba(255, 255, 255, 0.02);
}
.conv-list li.active {
  background: rgba(100, 110, 255, 0.12);
}
.conv-name {
  font-weight: 600;
}
.conv-preview {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}
.sidebar-footer {
  padding: 0.6rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.18);
  border-radius: 8px;
  overflow: hidden;
}
.chat-header {
  padding: 1rem;
  font-weight: 700;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.messages {
  flex: 1;
  padding: 1rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.message {
  max-width: 70%;
  padding: 0.6rem 0.8rem;
  border-radius: 12px;
}
.message.me {
  margin-left: auto;
  background: rgba(100, 110, 255, 0.18);
}
.message.bot {
  margin-right: auto;
  background: rgba(0, 0, 0, 0.06);
}
.message-text {
  white-space: pre-wrap;
}

.composer {
  display: flex;
  gap: 0.6rem;
  padding: 0.8rem;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}
.composer textarea {
  flex: 1;
  min-height: 48px;
  max-height: 140px;
  resize: vertical;
  padding: 0.6rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  color: inherit;
  border: 1px solid rgba(255, 255, 255, 0.04);
}
.composer-actions {
  display: flex;
  align-items: center;
}
.composer button {
  padding: 0.5rem 1rem;
}
</style>
