import Dexie from "dexie";

/**
 * 创建数据库类
 * 管理三个主要的数据表：对话历史、请求缓存、离线消息队列
 */
export class ChatDatabase extends Dexie {
  constructor() {
    super("ChatDatabase");
    // 版本 2: 移除不必要的索引，简化表定义
    this.version(2).stores({
      conversations: "++id, conversationId",
      requestCache: "++id, hash",
      offlineMessages: "++id, conversationId, status",
    });
  }
}

// 创建全局数据库实例
export const db = new ChatDatabase();

// 初始化数据库
export async function initializeDatabase() {
  try {
    // 检查数据库连接
    await db.open();
    console.log("✅ 数据库已打开");

    // 检查表是否存在
    const count = await db.conversations.count();
    console.log(`📊 数据库中有 ${count} 个对话`);

    return true;
  } catch (err) {
    console.error("❌ 数据库初始化失败:", err);
    // 尝试删除旧数据库并重新创建
    try {
      await Dexie.delete("ChatDatabase");
      console.log("🔄 已删除旧数据库，请刷新页面");
      return false;
    } catch (deleteErr) {
      console.error("❌ 删除数据库失败:", deleteErr);
      return false;
    }
  }
}

/**
 * 数据模型说明（用于参考）
 *
 * ConversationHistory {
 *   id?: number;                    // 主键
 *   conversationId: number;          // 对话 ID
 *   messages: Array<{
 *     from: 'me' | 'bot';           // 消息来源
 *     text: string;                  // 消息内容
 *     images?: Array<{               // 附加图片
 *       name: string;
 *       data: string;                // Base64 数据
 *       size: string;
 *     }>;
 *     timestamp: number;             // 时间戳
 *   }>;
 *   name: string;                    // 对话名称
 *   createdAt: number;               // 创建时间
 *   updatedAt: number;               // 更新时间
 * }
 *
 * CachedRequest {
 *   id?: number;
 *   hash: string;                    // 请求哈希（去重用）
 *   prompt: string;
 *   provider: string;
 *   images: Array<{ name, data, size }>;
 *   response: string;                // 完整的 AI 回复
 *   timestamp: number;
 *   ttl?: number;                    // 缓存过期时间（毫秒）
 * }
 *
 * OfflineMessage {
 *   id?: number;
 *   conversationId: number;
 *   prompt: string;
 *   provider: string;
 *   images: Array<{ name, data, size }>;
 *   timestamp: number;
 *   status: 'pending' | 'sent' | 'failed';
 *   retryCount: number;
 * }
 */
