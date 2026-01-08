import { ref, computed } from "vue";
import { db } from "../db/database.js";

/**
 * useRequestCache: 管理 AI 请求的缓存和离线查看
 * 功能：
 * - 缓存相同的请求，避免重复调用 API
 * - 支持离线查看缓存的响应
 * - 自动过期管理
 * - 计算请求 hash 用于去重
 */

export function useRequestCache() {
  const cacheEnabled = ref(true);
  const cacheTTL = ref(24 * 60 * 60 * 1000); // 默认缓存 24 小时
  const error = ref(null);

  /**
   * 计算请求的哈希值（用于缓存键）
   */
  function computeRequestHash(prompt, provider, images) {
    const imageHashes = images
      .map((img) => img.data.substring(0, 50)) // 只使用前50个字符
      .join("|");

    const content = `${prompt}|${provider}|${imageHashes}`;

    // 浏览器环境中使用 SubtleCrypto，Node 环境使用 crypto
    if (typeof window !== "undefined" && window.crypto) {
      // 浏览器环境：支持中文的 Base64 编码
      try {
        // 用 encodeURIComponent + btoa 支持 UTF-8（包括中文）
        return btoa(encodeURIComponent(content))
          .replace(/=/g, "")
          .substring(0, 32); // 简化 hash
      } catch (err) {
        // 如果还是失败，就用简单的字符编码
        console.warn("❌ Base64 编码失败，使用简化哈希:", err);
        return content
          .split("")
          .map((c) => c.charCodeAt(0).toString(16))
          .join("")
          .substring(0, 32);
      }
    } else {
      // Node 环境（虽然通常缓存只在浏览器，这里为了兼容性）
      try {
        return require("crypto")
          .createHash("sha256")
          .update(content)
          .digest("hex")
          .substring(0, 32);
      } catch {
        return btoa(content).substring(0, 32);
      }
    }
  }

  /**
   * 检查缓存中是否存在相同的请求
   */
  async function getCachedResponse(prompt, provider, images) {
    if (!cacheEnabled.value) return null;

    try {
      const hash = computeRequestHash(prompt, provider, images);
      const cached = await db.requestCache.where("hash").equals(hash).first();

      if (!cached) return null;

      // 检查缓存是否过期
      const now = Date.now();
      if (cached.ttl && now > cached.timestamp + cached.ttl) {
        // 缓存已过期，删除它
        await db.requestCache.delete(cached.id);
        console.log("🔄 缓存已过期，已删除");
        return null;
      }

      console.log("✅ 命中缓存！");
      return cached;
    } catch (err) {
      console.error("❌ 获取缓存错误:", err);
      return null;
    }
  }

  /**
   * 保存请求响应到缓存
   */
  async function cacheResponse(prompt, provider, images, response) {
    if (!cacheEnabled.value) return null;

    try {
      const hash = computeRequestHash(prompt, provider, images);
      const cached = {
        hash,
        prompt,
        provider,
        images,
        response,
        timestamp: Date.now(),
        ttl: cacheTTL.value,
      };

      const id = await db.requestCache.add(cached);
      console.log(`💾 响应已缓存，ID: ${id}`);
      return id;
    } catch (err) {
      console.error("❌ 缓存响应错误:", err);
      return null;
    }
  }

  /**
   * 清除所有过期的缓存
   */
  async function cleanExpiredCache() {
    try {
      const now = Date.now();
      const allCached = await db.requestCache.toArray();

      let deletedCount = 0;
      for (const cached of allCached) {
        if (cached.ttl && now > cached.timestamp + cached.ttl) {
          await db.requestCache.delete(cached.id);
          deletedCount++;
        }
      }

      console.log(`🧹 清除了 ${deletedCount} 条过期缓存`);
      return deletedCount;
    } catch (err) {
      console.error("❌ 清除过期缓存错误:", err);
      return 0;
    }
  }

  /**
   * 获取所有缓存（用于调试和管理）
   */
  async function getAllCached() {
    try {
      return await db.requestCache.toArray();
    } catch (err) {
      console.error("❌ 获取所有缓存错误:", err);
      return [];
    }
  }

  /**
   * 删除指定的缓存
   */
  async function deleteCached(id) {
    try {
      await db.requestCache.delete(id);
      console.log(`🗑️ 缓存已删除，ID: ${id}`);
    } catch (err) {
      console.error("❌ 删除缓存错误:", err);
    }
  }

  /**
   * 清空所有缓存
   */
  async function clearAllCache() {
    try {
      const count = await db.requestCache.count();
      await db.requestCache.clear();
      console.log(`🧹 已清空所有 ${count} 条缓存`);
    } catch (err) {
      console.error("❌ 清空缓存错误:", err);
    }
  }

  /**
   * 获取缓存统计信息
   */
  async function getCacheStats() {
    try {
      const count = await db.requestCache.count();
      const allCached = await db.requestCache.toArray();
      const now = Date.now();

      let expiredCount = 0;
      let validCount = 0;
      let totalSize = 0;

      for (const cached of allCached) {
        if (cached.ttl && now > cached.timestamp + cached.ttl) {
          expiredCount++;
        } else {
          validCount++;
        }
        // 粗略计算大小（字节）
        totalSize += (cached.response?.length || 0) * 2; // UTF-16
      }

      return {
        total: count,
        valid: validCount,
        expired: expiredCount,
        approximateSize: (totalSize / 1024 / 1024).toFixed(2) + " MB",
      };
    } catch (err) {
      console.error("❌ 获取缓存统计错误:", err);
      return null;
    }
  }

  /**
   * 设置缓存 TTL（生存时间）
   */
  function setCacheTTL(ttl) {
    cacheTTL.value = ttl;
    console.log(`⏱️ 缓存 TTL 已设置为: ${(ttl / 1000 / 60).toFixed(0)} 分钟`);
  }

  /**
   * 启用/禁用缓存
   */
  function toggleCache(enabled) {
    cacheEnabled.value = enabled;
    console.log(`${enabled ? "✅" : "❌"} 缓存已${enabled ? "启用" : "禁用"}`);
  }

  return {
    // 状态
    cacheEnabled: computed(() => cacheEnabled.value),
    cacheTTL: computed(() => cacheTTL.value),
    error: computed(() => error.value),

    // 核心功能
    getCachedResponse,
    cacheResponse,

    // 管理方法
    cleanExpiredCache,
    getAllCached,
    deleteCached,
    clearAllCache,
    getCacheStats,
    setCacheTTL,
    toggleCache,

    // 工具方法
    computeRequestHash,
  };
}
