/**
 * notificationRouter — unified notification feed.
 *
 * 2026-05-13 (CJ「實作左下方通知」): the previous implementation only read
 * an empty `notifications` table that nothing wrote to (UI showed mock
 * data). Rewritten to aggregate real events at query time:
 *
 *   1. Positioning jobs completed in the last 14 days (done / failed)
 *   2. Mission outputs created in the last 14 days
 *   3. Upcoming festivals within the next 14 days (priority ≥ 3)
 *
 * Each item gets a kind + navUrl so the client can jump to the right
 * page. `lastSeenAt` (localStorage on the client) is passed in so the
 * server can mark items as unread.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../../platform/core/trpc";
import localPool from "../../localDb";
import { recentCatalogCards } from "../../content/core/taskCatalogIndex";
import { isHiddenContentPlatform, isHiddenHistoryItem } from "../../platform/core/planGate";
import { isRecentViral } from "../../content/core/taskSource";

export interface NotificationItem {
  id: string;
  kind: "positioning_done" | "positioning_failed" | "task_complete" | "festival_upcoming" | "card_published" | "strategy_alert" | "regulation_review";
  title: string;
  excerpt: string;
  createdAtIso: string;
  navUrl: string;
  unread: boolean;
  /** Avatar initial + colour for the left circle in the UI */
  avatar: string;
  avatarColor: string;
}

const AVATAR_PALETTE: Record<NotificationItem["kind"], { avatar: string; avatarColor: string }> = {
  positioning_done:   { avatar: "✓", avatarColor: "#10b981" },  // green
  positioning_failed: { avatar: "!", avatarColor: "#ef4444" },  // red
  task_complete:      { avatar: "★", avatarColor: "#3b82f6" },  // blue
  festival_upcoming:  { avatar: "🎉", avatarColor: "#f59e0b" }, // amber
  card_published:     { avatar: "＋", avatarColor: "#171717" }, // ink：新卡上架
  strategy_alert:     { avatar: "◆", avatarColor: "#171717" }, // ink：策略提醒
  regulation_review:  { avatar: "§", avatarColor: "#171717" }, // ink：法規審查重點待確認
};

/** /tasks/:platform 的路由代號。與 PlatformTaskPage 的 ROUTE_TO_PLATFORM 反向。 */
const PLATFORM_ROUTE: Record<string, string> = {
  facebook: "fb", instagram: "ig", tiktok: "tt",
  email: "email", website: "web", case: "case", calendar: "calendar",
};
const PLATFORM_ZH: Record<string, string> = {
  facebook: "FB", instagram: "IG", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok",
  email: "Email", pr: "新聞稿", brand: "品牌", audience: "受眾研究", kol: "KOL", website: "官網",
};

/**
 * 4. 新任務卡上架（30 天內），同一天的合成一則。
 *
 * 2026-09-08 (CJ「有新的任務卡上架時，他也可以收到通知，亮出節奏」)。
 * 日期來自 git 歷史（taskCardDates），不是另外維護的公告；所以只要卡真的
 * 進了 repo，這則通知就會自己出現，沒有人需要記得發。
 */
export function cardPublishedItems(now: Date, lastSeen: Date, isEn: boolean): NotificationItem[] {
  const byDay = new Map<string, Map<string, number>>();
  // 2026-09-29 CJ：前台只列爆款結構＋品牌自建、只留五個通路——通知只算用戶
  // 在任務頁真的看得到的新卡，不然「上架 10 張」點進去一張都找不到。
  for (const c of recentCatalogCards(30, now)) {
    if (isHiddenContentPlatform(c.platform) || !isRecentViral(c.source, now)) continue;
    const day = c.addedAt!;
    const m = byDay.get(day) ?? new Map<string, number>();
    m.set(c.platform, (m.get(c.platform) ?? 0) + 1);
    byDay.set(day, m);
  }
  const out: NotificationItem[] = [];
  for (const [day, perPlatform] of byDay) {
    const total = [...perPlatform.values()].reduce((a, b) => a + b, 0);
    const ranked = [...perPlatform.entries()].sort((a, b) => b[1] - a[1]);
    const iso = `${day}T00:00:00.000Z`;
    const summary = ranked
      .map(([p, n]) => `${isEn ? p : (PLATFORM_ZH[p] ?? p)} ${n}`)
      .join(" · ");
    const firstRoutable = ranked.find(([p]) => PLATFORM_ROUTE[p])?.[0];
    out.push({
      id: `card-${day}`,
      kind: "card_published",
      title: isEn ? `${total} new task cards` : `新任務卡上架 · ${total} 張`,
      excerpt: summary.slice(0, 80),
      createdAtIso: iso,
      navUrl: firstRoutable ? `/tasks/${PLATFORM_ROUTE[firstRoutable]}?new=1` : "/tasks/fb?new=1",
      unread: new Date(iso) > lastSeen,
      ...AVATAR_PALETTE.card_published,
    });
  }
  return out;
}

function fmtRelative(iso: string, isEn: boolean): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return isEn ? "just now" : "剛剛";
  if (m < 60) return isEn ? `${m}m ago` : `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return isEn ? `${h}h ago` : `${h} 小時前`;
  const day = Math.floor(h / 24);
  if (day < 7) return isEn ? `${day}d ago` : `${day} 天前`;
  return d.toLocaleDateString(isEn ? "en-US" : "zh-TW");
}

export const notificationRouter = router({
  /** Aggregated feed. Returns last `limit` items across all kinds. */
  list: protectedProcedure
    .input(
      z.object({
        unreadOnly: z.boolean().default(false),
        limit:      z.number().min(1).max(50).default(20),
        lastSeenIso: z.string().nullable().optional(),
        lang:       z.enum(["zh-TW", "en"]).default("zh-TW"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const isEn = input.lang === "en";
      const lastSeen = input.lastSeenIso ? new Date(input.lastSeenIso) : new Date(0);
      const items: NotificationItem[] = [];

      // 1. Positioning jobs (done / failed within 14 days)
      try {
        const [rows]: any = await localPool.execute(
          `SELECT pj.id, pj.entityKind, pj.entityId, pj.status, pj.finishedAt, pj.lastError,
                  COALESCE(b.name, p.name, e.name, CONCAT(pj.entityKind, ' #', pj.entityId)) AS entityName
             FROM positioning_jobs pj
             LEFT JOIN brands b   ON pj.entityKind = 'brand'   AND b.id = pj.entityId
             LEFT JOIN products p ON pj.entityKind = 'product' AND p.id = pj.entityId
             LEFT JOIN events e   ON pj.entityKind = 'event'   AND e.id = pj.entityId
            WHERE pj.userId = ?
              AND pj.status IN ('done', 'failed')
              AND pj.finishedAt > NOW() - INTERVAL 14 DAY
            ORDER BY pj.finishedAt DESC
            LIMIT 30`,
          [userId],
        );
        for (const r of rows as any[]) {
          const done = r.status === "done";
          const iso = new Date(r.finishedAt).toISOString();
          const slugBase = r.entityKind === "brand" ? `/brands/edit?b=${r.entityId}`
                         : r.entityKind === "product" ? `/brands/edit?p=${r.entityId}`
                         : `/brands/edit?e=${r.entityId}`;
          items.push({
            id: `pj-${r.id}`,
            kind: done ? "positioning_done" : "positioning_failed",
            title: done
              ? (isEn ? `Positioning ready · ${r.entityName}` : `定位完成 · ${r.entityName}`)
              : (isEn ? `Positioning failed · ${r.entityName}` : `定位失敗 · ${r.entityName}`),
            excerpt: done
              ? (isEn ? "14 steps complete — tap to review" : "14 步完成 — 點擊查看")
              : (String(r.lastError ?? (isEn ? "Tap to retry" : "點擊重試")).slice(0, 80)),
            createdAtIso: iso,
            navUrl: slugBase,
            unread: new Date(iso) > lastSeen,
            ...AVATAR_PALETTE[done ? "positioning_done" : "positioning_failed"],
          });
        }
      } catch (e) {
        console.warn("[notifications] positioning_jobs query failed:", (e as Error).message);
      }

      // 2. Mission outputs (created within 14 days)
      try {
        const [rows]: any = await localPool.execute(
          `SELECT o.id, o.title, o.platform, o.createdAt,
                  JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.tier')) AS tier,
                  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.taskId')), 'null') AS taskId,
                  m.workspace AS workspace,
                  m.title AS missionTitle, m.brandId,
                  b.name AS brandName
             FROM mission_outputs o
             JOIN missions m ON m.id = o.missionId
             LEFT JOIN brands b ON b.id = m.brandId
            WHERE m.userId = ?
              AND o.createdAt > NOW() - INTERVAL 14 DAY
            ORDER BY o.createdAt DESC
            LIMIT 20`,
          [userId],
        );
        for (const r of rows as any[]) {
          // 2026-09-29「前台隱藏，資料保留」：下架通路的產出不發通知。
          if (isHiddenHistoryItem({ platform: r.workspace, taskId: r.taskId })
            || isHiddenHistoryItem({ platform: r.platform })) continue;
          const iso = new Date(r.createdAt).toISOString();
          const brand = r.brandName ? `${r.brandName} · ` : "";
          items.push({
            id: `mo-${r.id}`,
            kind: "task_complete",
            title: isEn
              ? `New ${r.tier ?? "task"} output${r.brandName ? ` · ${r.brandName}` : ""}`
              : `${r.tier ?? "任務"} 產出完成${r.brandName ? ` · ${r.brandName}` : ""}`,
            excerpt: String(r.missionTitle ?? r.title ?? r.platform ?? "").slice(0, 80),
            createdAtIso: iso,
            navUrl: `/run/${r.id}`,
            unread: new Date(iso) > lastSeen,
            ...AVATAR_PALETTE.task_complete,
          });
          void brand;
        }
      } catch (e) {
        console.warn("[notifications] mission_outputs query failed:", (e as Error).message);
      }

      // 3. Upcoming festivals (next 14 days, priority ≥ 3)
      try {
        const [rows]: any = await localPool.execute(
          `SELECT f.id, f.slug, f.name_zh, f.name_en, f.emoji, f.date, f.priority
             FROM festivals f
             LEFT JOIN festival_dismissals fd
                    ON fd.festivalId = f.id AND fd.userId = ?
            WHERE f.date BETWEEN CURDATE() AND CURDATE() + INTERVAL 14 DAY
              AND f.priority >= 3
              AND fd.festivalId IS NULL
            ORDER BY f.date ASC
            LIMIT 5`,
          [userId],
        );
        for (const r of rows as any[]) {
          const iso = new Date(r.date).toISOString();
          const days = Math.ceil(
            (new Date(r.date).getTime() - Date.now()) / 86_400_000,
          );
          const name = isEn ? (r.name_en ?? r.name_zh) : r.name_zh;
          items.push({
            id: `fest-${r.id}`,
            kind: "festival_upcoming",
            title: isEn
              ? `${r.emoji ?? "🎉"} ${name} in ${days}d`
              : `${r.emoji ?? "🎉"} ${name}　還有 ${days} 天`,
            excerpt: isEn ? "Tap to prep content" : "點擊準備內容",
            createdAtIso: iso,
            navUrl: `/calendar`,
            unread: new Date(iso) > lastSeen,
            ...AVATAR_PALETTE.festival_upcoming,
          });
        }
      } catch (e) {
        console.warn("[notifications] festivals query failed:", (e as Error).message);
      }

      // 5. 策略提醒（2026-09-08 策略監測，專業方案）：14 天內、還沒看的
      try {
        const [rows]: any = await localPool.execute(
          `SELECT a.id, a.brandId, a.kind, a.title, a.summary, a.createdAt, b.name AS brandName
             FROM strategy_alerts a LEFT JOIN brands b ON b.id = a.brandId
            WHERE a.userId = ? AND a.status = 'new' AND a.createdAt > NOW() - INTERVAL 14 DAY
            ORDER BY a.createdAt DESC LIMIT 10`,
          [userId],
        );
        for (const r of rows as any[]) {
          const iso = new Date(r.createdAt).toISOString();
          items.push({
            id: `sa-${r.id}`,
            kind: "strategy_alert",
            title: isEn ? `Strategy alert · ${r.brandName ?? ""}` : `策略提醒 · ${r.brandName ?? ""}`,
            excerpt: String(r.title ?? "").slice(0, 80),
            createdAtIso: iso,
            navUrl: `/brands/edit?b=${r.brandId}&cat=positioning`,
            unread: new Date(iso) > lastSeen,
            ...AVATAR_PALETTE.strategy_alert,
          });
        }
      } catch (e) {
        console.warn("[notifications] strategy_alerts query failed:", (e as Error).message);
      }

      // 6. 法規審查重點萃取好了、等用戶確認（2026-09-30 CJ「萃取好以後請用戶回來確認」）。
      // 只列還沒確認的；確認或捨棄後 jobStatus 離開 review，這則就消失。
      try {
        const [rows]: any = await localPool.execute(
          `SELECT r.id, r.brandId, r.title, r.updatedAt, b.name AS brandName
             FROM brand_regulations r JOIN brands b ON b.id = r.brandId
             LEFT JOIN brand_members bm ON bm.brandId = r.brandId AND bm.userId = ?
            WHERE r.jobStatus = 'review' AND (b.userId = ? OR bm.userId IS NOT NULL)
            ORDER BY r.updatedAt DESC LIMIT 10`,
          [userId, userId],
        );
        for (const r of rows as any[]) {
          const iso = new Date(r.updatedAt).toISOString();
          items.push({
            id: `reg-${r.id}-${iso}`,
            kind: "regulation_review",
            title: isEn ? `Regulation ready to confirm · ${r.brandName ?? ""}` : `法規審查重點待確認 · ${r.brandName ?? ""}`,
            excerpt: isEn ? `“${r.title}” review points are ready — please check and confirm.` : `「${r.title}」的審查重點萃取好了，請回來確認。`,
            createdAtIso: iso,
            navUrl: `/brands/edit?b=${r.brandId}&cat=regulations&focus=reg:${r.id}`,
            unread: new Date(iso) > lastSeen,
            ...AVATAR_PALETTE.regulation_review,
          });
        }
      } catch (e) {
        console.warn("[notifications] brand_regulations query failed:", (e as Error).message);
      }

      // 4. 新任務卡上架（純計算，不打 DB）
      try { items.push(...cardPublishedItems(new Date(), lastSeen, isEn)); }
      catch (e) { console.warn("[notifications] card_published failed:", (e as Error).message); }

      // Sort by createdAt DESC, slice to limit
      items.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
      const sliced = items.slice(0, input.limit);
      const filtered = input.unreadOnly ? sliced.filter((i) => i.unread) : sliced;

      const unreadCount = items.filter((i) => i.unread).length;
      return {
        items: filtered.map((i) => ({
          ...i,
          relativeTime: fmtRelative(i.createdAtIso, isEn),
        })),
        unreadCount,
        total: items.length,
      };
    }),

  /** Mark all as read by recording lastSeenAt. Client also stores in localStorage. */
  markAllRead: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async () => {
      // Server is stateless w.r.t. read state; client localStorage drives it.
      // Endpoint exists so UI mutation pipeline doesn't have to special-case
      // 'no-op' mutations. Returns the timestamp client should persist.
      return { lastSeenAtIso: new Date().toISOString() };
    }),
});
