# 📚 本地持久化与历史管理指南

## 功能概览

### ✨ 核心功能

#### 1️⃣ **Dexie 数据库集成** (`src/db/database.ts`)
- 使用 IndexedDB 存储对话历史、请求缓存和离线消息
- 自动索引优化查询性能
- 支持大规模数据存储（通常可达 GB 级别）

```
数据库表：
├── conversations（对话历史）
│   ├── id（主键）
│   ├── conversationId（对话ID）
│   ├── messages（消息数组）
│   ├── name（对话名称）
│   ├── createdAt / updatedAt
│
├── requestCache（请求缓存）
│   ├── id（主键）
│   ├── hash（请求哈希）
│   ├── prompt / provider / images
│   ├── response（完整回复）
│   ├── timestamp
│   └── ttl（缓存过期时间）
│
└── offlineMessages（离线消息队列）
    ├── id（主键）
    ├── conversationId
    ├── prompt / provider / images
    ├── timestamp
    ├── status（pending/sent/failed）
    └── retryCount（重试次数）
```

---

#### 2️⃣ **useDexieStorage Composable** (`src/composables/useDexieStorage.ts`)

**主要功能：**
- 保存和加载对话历史
- 添加消息到对话（自动持久化）
- 删除对话
- 管理离线消息队列

**关键方法：**
```javascript
// 加载所有对话
await loadConversations();

// 保存对话
await saveConversation(conversation);

// 添加消息（自动保存）
await addMessageToConversation(conversationId, message);

// 离线消息管理
const offlineMessages = await getOfflineMessages();
await addOfflineMessage(messageData);
await updateOfflineMessageStatus(id, 'sent');
```

---

#### 3️⃣ **useRequestCache Composable** (`src/composables/useRequestCache.ts`)

**功能：**
- 缓存相同的请求，避免重复调用 API
- 支持自定义缓存过期时间（TTL）
- 智能去重（基于请求哈希）

**关键方法：**
```javascript
// 检查缓存
const cached = await getCachedResponse(prompt, provider, images);

// 保存缓存
await cacheResponse(prompt, provider, images, response);

// 管理缓存
await cleanExpiredCache();  // 清除过期缓存
await getCacheStats();      // 获取统计信息
await clearAllCache();      // 清空所有缓存

// 配置
setCacheTTL(24 * 60 * 60 * 1000);  // 24小时
toggleCache(false);  // 禁用缓存
```

---

## 🌐 离线与重连机制

### 网络状态检测
```javascript
// 自动监听网络变化
window.addEventListener('online', handleOnline);
window.addEventListener('offline', handleOffline);

// UI 显示网络状态
<span v-if="!isOnline" class="offline-badge">🔴 离线模式</span>
<span v-else class="online-badge">🟢 在线</span>
```

### 断线重连流程
```
1. 检测网络断开 → 将消息加入离线队列
2. 等待网络恢复
3. 网络恢复时自动触发 handleOnline()
4. 自动重新发送离线队列中的所有消息
5. 标记已发送的消息，清除队列
```

### 离线消息队列
- **pending**: 等待发送
- **sent**: 已成功发送
- **failed**: 失败（可重试）

---

## 📊 使用示例

### 场景1：保存对话历史

```javascript
// 自动集成到 send() 函数中
const messageWithImages = { from: 'me', text, images, timestamp: Date.now() };

// 1. 保存用户消息
await addMessageToConversation(conversationId, messageWithImages);

// 2. 发送并获取响应
const response = await sendMessage(text, options);

// 3. 保存 bot 回复
await addMessageToConversation(conversationId, {
  from: 'bot',
  text: fullResponse,
  timestamp: Date.now()
});
```

### 场景2：缓存与离线模式

```javascript
// 1. 先查找缓存
const cached = await getCachedResponse(prompt, provider, images);
if (cached) {
  // 使用缓存，快速显示
  display(cached.response);
  return;
}

// 2. 网络不可用？加入离线队列
if (!isOnline) {
  await addOfflineMessage({
    conversationId,
    prompt,
    provider,
    images,
    timestamp: Date.now()
  });
  return;
}

// 3. 正常调用 API
const response = await callAPI(...);

// 4. 缓存响应
await cacheResponse(prompt, provider, images, response);
```

### 场景3：重连后自动恢复

```javascript
// 应用启动时
onMounted(async () => {
  // 加载历史对话
  await loadConversations();
  
  // 尝试重新发送离线消息
  await resendOfflineMessages();
});

// 网络恢复时
async function handleOnline() {
  isOnline.value = true;
  await resendOfflineMessages();  // 自动重试
}
```

---

## 🔧 调试与管理

### 查看存储信息

```javascript
// 获取存储统计
const info = await getStorageInfo();
console.log('对话:', info.conversations);
console.log('缓存请求:', info.cachedRequests);
console.log('离线消息:', info.offlineMessages);

// 获取缓存统计
const stats = await getCacheStats();
console.log('有效缓存:', stats.valid);
console.log('过期缓存:', stats.expired);
console.log('大小:', stats.approximateSize);
```

### 清理数据

```javascript
// 清除过期缓存
await cleanExpiredCache();

// 清空所有缓存
await clearAllCache();

// 删除单个对话
await deleteConversation(conversationId);
```

---

## 🚀 性能优化建议

| 优化策略     | 说明                                 |
| ------------ | ------------------------------------ |
| **缓存 TTL** | 设置合理的过期时间（默认24小时）     |
| **定期清理** | 定期清除过期缓存                     |
| **分批操作** | 加载大量数据时分页处理               |
| **索引优化** | 根据查询需求优化数据库索引           |
| **文件大小** | 图片压缩后再存储（减小 Base64 大小） |

---

## 📝 浏览器兼容性

| 浏览器      | IndexedDB 支持 |
| ----------- | -------------- |
| Chrome/Edge | ✅ 完全支持     |
| Firefox     | ✅ 完全支持     |
| Safari      | ✅ 14+支持      |
| IE          | ❌ 不支持       |

---

## 🎯 下一步优化

1. **数据同步**：实现云端备份与同步
2. **加密存储**：敏感数据加密
3. **数据导出**：支持对话导出为 JSON/PDF
4. **智能压缩**：自动压缩大型数据
5. **版本管理**：数据库升级策略

---

## 🐛 常见问题

**Q: 离线模式下消息会丢失吗？**  
A: 不会。所有消息都会存储到 IndexedDB，网络恢复后自动重新发送。

**Q: 缓存对隐私有影响吗？**  
A: 缓存是本地存储，不会上传到服务器。可随时清除。

**Q: 支持多设备同步吗？**  
A: 当前不支持。可实现登录后的云端同步（后续功能）。

**Q: 数据存储有大小限制吗？**  
A: 通常 50MB-100MB+，取决于浏览器和设备。
