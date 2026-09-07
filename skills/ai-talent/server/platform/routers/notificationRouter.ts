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
import { router, protectedProcedure } from "../core/trpc";
import localPool from "../../localDb";

export interface NotificationItem {
  id: string;
  kind: "positioning_done" | "positioning_failed" | "task_complete" | "festival_upcoming";
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
};

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
