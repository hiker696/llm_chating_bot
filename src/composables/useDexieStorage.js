import { ref, computed } from "vue";
import { db } from "../db/database.js";

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
  const storedConversations = ref([]);
  const isLoading = ref(false);
  const error = ref(null);

  /**
   * 从数据库加载所有对话
   */
  async function loadConversations() {
    try {
      isLoading.value = true;
      error.value = null;

      // 尝试加载对话（改用 id 排序，因为 updatedAt 不是索引字段）
      let conversations = await db.conversations
        .orderBy("id")
        .reverse()
        .toArray();

      console.log(
        `📚 加载了 ${conversations.length} 个对话，数据:`,
        conversations.map((c) => ({
          id: c.id,
          conversationId: c.conversationId,
          title: c.title || c.name,
          msgCount: c.messages?.length || 0,
        }))
      );

      // 如果没有对话，创建默认对话
      if (conversations.length === 0) {
        console.log("⚠️ 没有对话记录，创建默认对话");
        const defaultConversation = {
          id: 1,
          conversationId: 1,
          title: "新对话",
          name: "新对话",
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        const savedId = await db.conversations.put(defaultConversation);
        console.log(`✅ 默认对话创建成功，ID: ${savedId}`);

        // 重新加载
        conversations = await db.conversations
          .orderBy("id")
          .reverse()
          .toArray();
      }

      storedConversations.value = conversations;
    } catch (err) {
      error.value = `加载对话失败: ${
        err instanceof Error ? err.message : "未知错误"
      }`;
      console.error("❌ 加载对话错误:", err);

      // 即使失败，也创建一个默认对话在内存中
      storedConversations.value = [
        {
          id: 1,
          conversationId: 1,
          title: "新对话",
          name: "新对话",
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 保存或更新对话
   */
  async function saveConversation(conversation) {
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
  async function addMessageToConversation(conversationId, message) {
    try {
      console.log(`📝 尝试添加消息到对话: ${conversationId}`);

      // 先尝试用 conversationId 查询
      let conversation = await db.conversations
        .where("conversationId")
        .equals(conversationId)
        .first();

      // 如果用 conversationId 查不到，尝试用 id（主键）查
      if (!conversation) {
        console.log(
          `⚠️ 用 conversationId=${conversationId} 查不到，尝试用 id 查询...`
        );
        conversation = await db.conversations.get(conversationId);
      }

      if (!conversation) {
        console.error(
          `❌ 对话不存在: ${conversationId}，已有的对话:`,
          storedConversations.value.map((c) => ({
            id: c.id,
            conversationId: c.conversationId,
          }))
        );
        // 降级处理：在内存中也无法保存消息，但不抛错，只记录日志
        console.warn("⚠️ 数据库保存失败，消息仅保留在内存中");
        return null;
      }

      // 添加消息并更新时间戳
      conversation.messages = conversation.messages || [];
      conversation.messages.push(message);
      conversation.updatedAt = Date.now();

      await db.conversations.update(conversation.id, conversation);
      console.log(
        `✉️ 消息已保存到对话 ${conversationId}，当前消息数: ${conversation.messages.length}`
      );

      return conversation;
    } catch (err) {
      error.value = `添加消息失败: ${
        err instanceof Error ? err.message : "未知错误"
      }`;
      console.error("❌ 添加消息错误:", err);
      console.warn("⚠️ 数据库操作失败，消息仅保留在内存中");
      return null; // 返回 null 而不是抛错
    }
  }

  /**
   * 获取单个对话的所有消息
   */
  async function getConversationMessages(conversationId) {
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
  async function deleteConversation(conversationId) {
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
  async function getOfflineMessages() {
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
  async function addOfflineMessage(message) {
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
  async function updateOfflineMessageStatus(id, status, retryCount) {
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
