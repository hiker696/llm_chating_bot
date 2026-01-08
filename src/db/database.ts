import Dexie, { type Table } from "dexie";

// 对话历史数据类型
export interface ConversationHistory {
  id?: number; // 主键
  conversationId: number; // 对话 ID
  messages: Array<{
    from: "me" | "bot";
    text: string;
    images?: Array<{ name: string; data: string; size: string }>;
    timestamp: number;
  }>;
  name: string; // 对话名称
  createdAt: number;
  updatedAt: number;
}

// 请求缓存数据类型
export interface CachedRequest {
  id?: number;
  hash: string; // 请求内容的 hash
  prompt: string;
  provider: string;
  images: Array<{ name: string; data: string; size: string }>;
  response: string; // 完整的 AI 回复
  timestamp: number;
  ttl?: number; // 缓存过期时间（毫秒）
}

// 离线消息队列
export interface OfflineMessage {
  id?: number;
  conversationId: number;
  prompt: string;
  provider: string;
  images: Array<{ name: string; data: string; size: string }>;
  timestamp: number;
  status: "pending" | "sent" | "failed"; // pending 等待发送, sent 已发送, failed 失败
  retryCount: number;
}

// 创建数据库
export class ChatDatabase extends Dexie {
  conversations!: Table<ConversationHistory>;
  requestCache!: Table<CachedRequest>;
  offlineMessages!: Table<OfflineMessage>;

  constructor() {
    super("ChatDatabase");
    this.version(1).stores({
      conversations: "++id, conversationId, createdAt",
      requestCache: "++id, hash, timestamp",
      offlineMessages: "++id, conversationId, timestamp, status",
    });
  }
}

// 创建全局数据库实例
export const db = new ChatDatabase();
