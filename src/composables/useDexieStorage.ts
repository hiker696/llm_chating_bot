import { ref, computed } from "vue";
import {
  db,
  type ConversationHistory,
  type OfflineMessage,
} from "../db/database";

/**
 * useDexieStorage: 管理对话历史的持久化存储
 * 功能：
 * - 保存新对话到 IndexedDB
 * - 加载对话历史
 * - 删除对话
 * - 支持断线重连时恢复状态
 */

export function useDexieStorage() {
  // 状态
  const storedConversations = ref<ConversationHistory[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  /**
   * 从数据库加载所有对话
   */
  async function loadConversations() {
    try {
      isLoading.value = true;
      error.value = null;
      const conversations = await db.conversations
        .orderBy("updatedAt")
        .reverse()
        .toArray();
      storedConversations.value = conversations;
      console.log(`📚 加载了 ${conversations.length} 个对话`);
    } catch (err) {
      error.value = `加载对话失败: ${
        err instanceof Error ? err.message : "未知错误"
      }`;
      console.error("❌ 加载对话错误:", err);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 保存或更新对话
   */
  async function saveConversation(conversation: ConversationHistory) {
    try {
      const now = Date.now();
      const toSave = {
        ...conversation,
        updatedAt: now,
      };

      const id = await db.conversations.put(toSave);
      console.log(`💾 保存对话成功，ID: ${id}`);

      // 重新加载对话列表
      await loadConversations();
      return id;
    } catch (err) {
      error.value = `保存对话失败: ${
        err instanceof Error ? err.message : "未知错误"
      }`;
      console.error("❌ 保存对话错误:", err);
      throw err;
    }
  }

  /**
   * 添加消息到对话
   */
  async function addMessageToConversation(
    conversationId: number,
    message: ConversationHistory["messages"][0]
  ) {
    try {
      const conversation = await db.conversations
        .where("conversationId")
        .equals(conversationId)
        .first();

      if (!conversation) {
        throw new Error(`对话不存在: ${conversationId}`);
      }

      // 添加消息并更新时间戳
      conversation.messages.push(message);
      conversation.updatedAt = Date.now();

      await db.conversations.update(conversation.id!, conversation);
      console.log(`✉️ 消息已保存到对话 ${conversationId}`);

      return conversation;
    } catch (err) {
      error.value = `添加消息失败: ${
        err instanceof Error ? err.message : "未知错误"
      }`;
      console.error("❌ 添加消息错误:", err);
      throw err;
    }
  }

  /**
   * 获取单个对话的所有消息
   */
  async function getConversationMessages(conversationId: number) {
    try {
      const conversation = await db.conversations
        .where("conversationId")
        .equals(conversationId)
        .first();

      return conversation?.messages || [];
    } catch (err) {
      console.error("❌ 获取消息错误:", err);
      return [];
    }
  }

  /**
   * 删除对话
   */
  async function deleteConversation(conversationId: number) {
    try {
      const conversation = await db.conversations
        .where("conversationId")
        .equals(conversationId)
        .first();

      if (conversation?.id) {
        await db.conversations.delete(conversation.id);
        console.log(`🗑️ 对话已删除: ${conversationId}`);
        await loadConversations();
      }
    } catch (err) {
      error.value = `删除对话失败: ${
        err instanceof Error ? err.message : "未知错误"
      }`;
      console.error("❌ 删除对话错误:", err);
    }
  }

  /**
   * 获取离线消息队列（未发送的消息）
   */
  async function getOfflineMessages(): Promise<OfflineMessage[]> {
    try {
      return await db.offlineMessages
        .where("status")
        .equals("pending")
        .toArray();
    } catch (err) {
      console.error("❌ 获取离线消息错误:", err);
      return [];
    }
  }

  /**
   * 添加消息到离线队列
   */
  async function addOfflineMessage(
    message: Omit<OfflineMessage, "id" | "status" | "retryCount">
  ) {
    try {
      const id = await db.offlineMessages.add({
        ...message,
        status: "pending",
        retryCount: 0,
      });
      console.log(`⏳ 消息已加入离线队列，ID: ${id}`);
      return id;
    } catch (err) {
      console.error("❌ 添加离线消息错误:", err);
      throw err;
    }
  }

  /**
   * 更新离线消息状态
   */
  async function updateOfflineMessageStatus(
    id: number,
    status: OfflineMessage["status"],
    retryCount?: number
  ) {
    try {
      await db.offlineMessages.update(id, {
        status,
        retryCount: retryCount !== undefined ? retryCount : undefined,
      });
      console.log(`📤 离线消息状态更新: ${status}`);
    } catch (err) {
      console.error("❌ 更新离线消息状态错误:", err);
    }
  }

  /**
   * 清除已发送的离线消息
   */
  async function clearSentOfflineMessages() {
    try {
      const deleted = await db.offlineMessages
        .where("status")
        .equals("sent")
        .delete();
      console.log(`🧹 清除了 ${deleted} 条已发送的离线消息`);
    } catch (err) {
      console.error("❌ 清除离线消息错误:", err);
    }
  }

  /**
   * 获取本地存储大小（用于调试）
   */
  async function getStorageInfo() {
    try {
      const convCount = await db.conversations.count();
      const cacheCount = await db.requestCache.count();
      const offlineCount = await db.offlineMessages.count();

      return {
        conversations: convCount,
        cachedRequests: cacheCount,
        offlineMessages: offlineCount,
        totalRecords: convCount + cacheCount + offlineCount,
      };
    } catch (err) {
      console.error("❌ 获取存储信息错误:", err);
      return null;
    }
  }

  return {
    // 状态
    storedConversations: computed(() => storedConversations.value),
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),

    // 对话操作
    loadConversations,
    saveConversation,
    addMessageToConversation,
    getConversationMessages,
    deleteConversation,

    // 离线消息操作
    getOfflineMessages,
    addOfflineMessage,
    updateOfflineMessageStatus,
    clearSentOfflineMessages,

    // 工具方法
    getStorageInfo,
  };
}
