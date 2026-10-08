import { createZernioClient, ZernioApiError, type ZernioClient, type ZernioAnalyticsPost } from "../../platform/core/connectors/zernio";
import { listConnectedByBrand, type Queryable } from "../../platform/core/connectors/publish/connectionStore";
import { isRuntimeFeatureEnabled } from "../../platform/core/ops/runtimeSafety";
import type { logError } from "../../platform/routers/opsRouter";
import { taipeiDate } from "./perfDates";
import { upsertFacts, type FactInput } from "./perfStore";
import { ownTagsFor } from "./ownTags";

export const ZERNIO_ANALYTICS_PLATFORMS = ["facebook", "instagram", "threads", "linkedin"] as const;
export type AnalyticsPlatform = typeof ZERNIO_ANALYTICS_PLATFORMS[number];
export const SOURCE_BY_PLATFORM = {
  facebook: "fb_page", instagram: "ig_account", threads: "threads_account", linkedin: "linkedin_page",
} as const;
export function isAnalyticsPlatform(platform: string): platform is AnalyticsPlatform {
  return ZERNIO_ANALYTICS_PLATFORMS.some(p => p === platform);
}
export function zernioAnalyticsEnabled(): boolean {
  return isRuntimeFeatureEnabled("SOCIAL_PUBLISH_ENABLED") && !!process.env.ZERNIO_API_KEY?.trim();
}
export class ZernioAnalyticsSyncError extends Error {}

export function analyticsFormatOf(mediaType?: string | null): string {
  switch (mediaType?.toLowerCase()) {
    case "image": return "image";
    case "video": case "reel": return "video";
    case "carousel": return "carousel";
    default: return "text";
  }
}

/** Zernio accountId / postId 都不是平台原生 id，不能拿來當 perf_facts 的 key。 */
function facebookPostId(id: string, pageId?: string): string {
  if (id.includes("_")) return id;
  return pageId ? `${pageId}_${id}` : id;
}

function pageIdFromMeta(meta: unknown): string | undefined {
  try {
    const parsed = typeof meta === "string" ? JSON.parse(meta) : meta;
    const id = parsed && typeof parsed === "object" && "platformUserId" in parsed ? parsed.platformUserId : undefined;
    return typeof id === "string" && id.trim() ? id.trim() : undefined;
  } catch { return undefined; /* 舊連線的 metadata 壞掉仍可使用貼文原生 id。 */ }
}

export function analyticsFact(post: ZernioAnalyticsPost, platform: AnalyticsPlatform, accountId: string,
  tagsByPost: Record<string, Record<string, string>> = {}, ownIds: Set<string> = new Set(),
  pageId?: string): { fact: FactInput; tagged: boolean } | null {
  const targets = post.platformAnalytics?.length ? post.platformAnalytics : post.platforms ?? [];
  const idOf = (value: string | { _id: string } | null | undefined) => typeof value === "string" ? value : value?._id;
  // External posts are flat; the account is already scoped by listAnalytics(accountId).
  const target = targets.length
    ? targets.find(p => p.platform === platform && idOf(p.accountId) === accountId)
    : post.platform === platform && post.platformPostId ? post : undefined;
  if (!target || (target.status && target.status !== "published") || !post.publishedAt) return null;
  if (!Number.isFinite(Date.parse(post.publishedAt))) return null;
  if (!target.platformPostId) return null;
  const permalink = target.platformPostUrl ?? post.platformPostUrl ?? null;
  const entityId = platform === "facebook" ? facebookPostId(target.platformPostId, pageId) : target.platformPostId;
  // 不把跨平台加總的 analytics 寫到單一帳號；只有單一 target 時才可退回 top-level。
  const analytics = target.analytics ?? (targets.length === 1 ? post.analytics : null);
  if (!analytics) return null;
  const metrics: Record<string, number> = {};
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  for (const key of ["reach", "comments", "shares", "views", "saves", "clicks"] as const) {
    if (finite(analytics[key])) metrics[key] = analytics[key];
  }
  if (finite(analytics.likes)) metrics.reactions = analytics.likes;
  const impressions = platform === "threads" ? analytics.views : analytics.impressions;
  if (finite(impressions)) metrics.impressions = impressions;
  const interactions = [analytics.likes, analytics.comments, analytics.shares].filter(finite);
  if (interactions.length) metrics.engagement = interactions.reduce((sum, n) => sum + n, 0);
  // Pending/unavailable data without metrics must not erase an existing snapshot.
  if (!Object.keys(metrics).length) return null;
  const own = tagsByPost[entityId] ?? (platform === "facebook" ? tagsByPost[entityId.split("_").pop()!] : undefined) ?? {};
  const origin = ownIds.has(entityId) || (platform === "facebook" && ownIds.has(entityId.split("_").pop()!))
    || post.isExternal === false || !!post.latePostId ? "onbrand" : "external";
  const content = post.content ?? "";
  return {
    tagged: Object.keys(own).length > 0,
    fact: {
      source: SOURCE_BY_PLATFORM[platform], entityType: "post", entityId,
      entityLabel: content.replace(/\s+/g, " ").trim().slice(0, 60) || "(無文字貼文)",
      text: content, date: taipeiDate(post.publishedAt), permalink,
      tags: { ...own, format: analyticsFormatOf(post.mediaType), origin }, metrics,
    },
  };
}

export type ZernioAnalyticsSyncResult = { platforms: Array<{ platform: AnalyticsPlatform; posts: number; tagged: number; onbrand: number; skipped: number; error?: string }> };
export type ZernioAnalyticsDeps = {
  pool?: Queryable;
  client?: Pick<ZernioClient, "listAnalytics" | "syncExternalPosts">;
  upsert?: typeof upsertFacts;
  log?: typeof logError;
  now?: () => Date;
};

export const AUTO_SYNC_STALE_HOURS = 6;
const AUTO_SYNC_RETRY_MS = 10 * 60_000;
const inFlightBrands = new Set<number>();
const activeSyncCounts = new Map<number, number>();
const lastAttemptMs = new Map<number, number>();

/** 開頁只等待新鮮度檢查，不等待同步；手動同步仍可隨時執行。 */
export async function ensureFreshZernioAnalytics(brandId: number, deps: ZernioAnalyticsDeps = {}): Promise<{
  started: boolean; reason: "disabled" | "no_connection" | "fresh" | "in_flight" | "started";
}> {
  if (!zernioAnalyticsEnabled()) return { started: false, reason: "disabled" };
  // 優先回報執行中，避免新寫入的 facts 或嘗試窗口讓前端提早停止輪詢。
  if (inFlightBrands.has(brandId)) return { started: false, reason: "in_flight" };
  const pool = deps.pool ?? (await import("../../localDb")).default;
  const connections = await listConnectedByBrand(pool, brandId, "zernio");
  if (!connections.some(c => isAnalyticsPlatform(c.platform))) return { started: false, reason: "no_connection" };
  const [rows] = await pool.execute(
    "SELECT MAX(updatedAt) AS lastSync FROM perf_facts WHERE brandId = ? AND source IN (?, ?, ?, ?)",
    [brandId, ...Object.values(SOURCE_BY_PLATFORM)],
  );
  // await 查詢期間可能有另一個開頁或手動同步先啟動；檢查與啟動之間不能再 await。
  if (inFlightBrands.has(brandId)) return { started: false, reason: "in_flight" };
  const now = (deps.now ?? (() => new Date()))().getTime();
  const lastSync = rows[0]?.lastSync;
  const lastAttempt = lastAttemptMs.get(brandId);
  if ((lastSync != null && now - new Date(lastSync).getTime() < AUTO_SYNC_STALE_HOURS * 3_600_000)
    || (lastAttempt !== undefined && now - lastAttempt < AUTO_SYNC_RETRY_MS)) {
    return { started: false, reason: "fresh" };
  }
  lastAttemptMs.set(brandId, now);
  // syncBrand 的共用追蹤器在第一個 await 前加進 Set，並在 finally 清除。
  void syncBrandZernioAnalytics(brandId, 120, deps).catch(async () => {
    try {
      const log = deps.log ?? (await import("../../platform/routers/opsRouter")).logError;
      await log({ source: "zernio.analytics", level: "warn", message: "社群成效開頁同步失敗，請稍後重試。", meta: { brandId } });
    } catch { /* 記錄失敗也不能形成未處理的背景 rejection。 */ }
  });
  return { started: true, reason: "started" };
}

export async function syncBrandZernioAnalytics(brandId: number, days = 120, deps: ZernioAnalyticsDeps = {}): Promise<ZernioAnalyticsSyncResult> {
  inFlightBrands.add(brandId);
  activeSyncCounts.set(brandId, (activeSyncCounts.get(brandId) ?? 0) + 1);
  try {
    return await runBrandZernioAnalytics(brandId, days, deps);
  } finally {
    // 手動同步不受限制；重疊的同步全部結束後才清掉品牌狀態。
    const remaining = activeSyncCounts.get(brandId)! - 1;
    if (remaining) activeSyncCounts.set(brandId, remaining);
    else {
      activeSyncCounts.delete(brandId);
      inFlightBrands.delete(brandId);
    }
  }
}

async function runBrandZernioAnalytics(brandId: number, days: number, deps: ZernioAnalyticsDeps): Promise<ZernioAnalyticsSyncResult> {
  if (!zernioAnalyticsEnabled()) throw new ZernioAnalyticsSyncError("此環境尚未啟用社群成效同步。");
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new ZernioAnalyticsSyncError("同步天數須介於 1 至 365 天。");
  const pool = deps.pool ?? (await import("../../localDb")).default;
  const client = deps.client ?? createZernioClient({ apiKey: process.env.ZERNIO_API_KEY! });
  const write = deps.upsert ?? upsertFacts;
  const log = deps.log ?? (await import("../../platform/routers/opsRouter")).logError;
  const connections = (await listConnectedByBrand(pool, brandId, "zernio")).filter(c => isAnalyticsPlatform(c.platform));
  const { tags, ownIds } = await ownTagsFor(brandId, pool);
  const now = (deps.now ?? (() => new Date()))();
  const toDate = taipeiDate(now.toISOString());
  const fromDate = taipeiDate(new Date(now.getTime() - days * 86_400_000).toISOString());
  const result: ZernioAnalyticsSyncResult = { platforms: [] };
  for (const connection of connections) {
    const platform = connection.platform as AnalyticsPlatform;
    let skipped = 0;
    try {
      const readAll = async () => {
        const posts: ZernioAnalyticsPost[] = [];
        for (let page = 1; ; page++) {
          const data = await client.listAnalytics({ accountId: connection.accountId, fromDate, toDate, source: "all", page, limit: 100 });
          posts.push(...data.posts);
          if (page >= (data.pagination?.pages ?? 1) || !data.posts.length) return posts;
        }
      };
      let posts = await readAll();
      if (!posts.length) {
        const [existing] = await pool.execute("SELECT 1 FROM perf_facts WHERE brandId = ? AND source = ? LIMIT 1", [brandId, SOURCE_BY_PLATFORM[platform]]);
        if (!existing.length) {
          await client.syncExternalPosts({ accountId: connection.accountId });
          posts = await readAll();
        }
      }
      const pageId = platform === "facebook" ? pageIdFromMeta(connection.meta) : undefined;
      const converted: Array<{ fact: FactInput; tagged: boolean }> = [];
      for (const post of posts) {
        try {
          const entry = analyticsFact(post, platform, connection.accountId, tags, ownIds, pageId);
          if (entry) converted.push(entry);
          else skipped++;
        } catch { skipped++; /* 單篇轉換失敗不影響同平台其他貼文，也不記錄原始回應。 */ }
      }
      await write(brandId, converted.map(p => p.fact));
      result.platforms.push({ platform, posts: converted.length, tagged: converted.filter(p => p.tagged).length,
        onbrand: converted.filter(p => p.fact.tags?.origin === "onbrand").length, skipped });
    } catch (error) {
      // 不記錄供應商回應、原始 exception 或憑證；保留安全的 HTTP 狀態供排查。
      const message = error instanceof ZernioApiError
        ? error.status === 402 ? "發布服務的方案尚未開通這項功能（需要在 Zernio 綁定付款方式），請聯絡 sowork@sowork.ai。"
          : `社群成效同步失敗（HTTP ${error.status}），請確認帳號授權後重試。`
        : error instanceof ZernioAnalyticsSyncError ? error.message : "社群成效同步失敗，請稍後重試。";
      await log({ source: "zernio.analytics", level: "warn", message, meta: { brandId, platform } });
      result.platforms.push({ platform, posts: 0, tagged: 0, onbrand: 0, skipped, error: message });
    }
  }
  return result;
}

let ticking = false;
/** 一拍一品牌：建過視角、四平台有 Zernio 連線，且最晚回填已超過 20 小時。 */
export async function tickZernioAnalyticsSync(deps: ZernioAnalyticsDeps & {
  sync?: typeof syncBrandZernioAnalytics;
} = {}): Promise<void> {
  if (!zernioAnalyticsEnabled() || ticking) return;
  ticking = true;
  try {
    const pool = deps.pool ?? (await import("../../localDb")).default;
    const [rows] = await pool.execute(
      `SELECT b.id AS brandId, MAX(f.updatedAt) AS lastSync
         FROM brands b
         JOIN (SELECT DISTINCT brandId FROM perf_lenses) l ON l.brandId = b.id
         JOIN (SELECT DISTINCT brandId FROM brand_publish_connections
                WHERE provider = 'zernio' AND status = 'connected'
                  AND platform IN (?, ?, ?, ?)) c ON c.brandId = b.id
         LEFT JOIN perf_facts f ON f.brandId = b.id AND f.source IN (?, ?, ?, ?)
        GROUP BY b.id
       HAVING lastSync IS NULL OR lastSync < NOW() - INTERVAL 20 HOUR
        ORDER BY lastSync IS NOT NULL, lastSync, b.id
        LIMIT 1`,
      [...ZERNIO_ANALYTICS_PLATFORMS, ...Object.values(SOURCE_BY_PLATFORM)],
    );
    if (!rows[0]) return;
    await (deps.sync ?? syncBrandZernioAnalytics)(Number(rows[0].brandId), 120, deps);
  } catch {
    const log = deps.log ?? (await import("../../platform/routers/opsRouter")).logError;
    await log({ source: "zernio.analytics", level: "warn", message: "社群成效背景同步失敗，下次排程重試。" });
  } finally {
    ticking = false;
  }
}
