/**
 * planGate — 「這個方案能用什麼」的唯一判斷點。
 *
 * 2026-09-06 定價改版。在這之前 plans.ts 的額度欄位幾乎全是宣告用的：
 * 只有 brands（brandRouter）與 team_members（tenantRouter）真的會擋，
 * runsPerCycle / task_99s 連一行檢查都沒有 —— 註解寫著「Starter 每月 50 次」，
 * 實際上不限。賣兩級卻擋不住任何一條線，升級就沒有理由。
 *
 * 所以這支把閘門收成一處：新的限制加在這裡，不要再散到各個 router。
 *
 * ── 兩個刻意的設計 ───────────────────────────────────────────────────
 * ① 通路選擇存在 `brands.positioning.__channels`，不開新欄位。
 *    這沿用 brandTaskCards 的存法（同一種 brands.positioning.<key> 慣例），
 *    省掉一次 migration；positioning 本來就是這個品牌的設定袋。
 * ② -1 一律代表無限，與 PlanQuota 其他欄位同義；enterprise 與 @sowork.tw|ai
 *    內部帳號直接拿 enterprise 額度（與 billingRouter.loadUserPlan 同一條規則，
 *    否則自己人會被自己的閘門擋住）。
 */
import { PLANS, type PlanCode, type PlanQuota } from "./plans";

/** 沒選過通路時的預設。FB / IG 是產品主場，排前面。 */
const DEFAULT_PLATFORM_ORDER = [
  "facebook", "instagram", "youtube", "tiktok", "linkedin",
  "email", "website", "pr", "brand", "audience", "kol",
];

export interface ChannelSelection {
  /** 已啟用的通路代號。 */
  platforms: string[];
  /** 上次更換的時間（ISO）。null = 從未更換過，可立即更換。 */
  swappedAt: string | null;
}

/**
 * 這個用戶的方案額度。
 *
 * @sowork.tw / @sowork.ai 一律回 enterprise —— 與 billingRouter 同一條規則。
 * 找不到用戶就回 trial，不要回 enterprise（預設要往嚴格的方向錯）。
 */
export async function planQuotaFor(userId: number): Promise<PlanQuota> {
  const { default: localPool } = await import("../localDb");
  const [rows]: any = await localPool.execute(
    `SELECT email, planCode FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  const r = (rows as any[])[0];
  const isInternal = typeof r?.email === "string" && /@sowork\.(tw|ai)$/i.test(r.email);
  const code: PlanCode = isInternal ? "enterprise" : ((r?.planCode ?? "trial") as PlanCode);
  return (PLANS[code] ?? PLANS.trial).quota;
}

/** -1 = 無限。給 null/undefined 也視為無限（欄位還沒填的舊方案不該被擋死）。 */
export function isUnlimited(n: number | null | undefined): boolean {
  return n === -1 || n === null || n === undefined;
}

/**
 * 這個品牌目前啟用的通路。
 *
 * 沒選過就依方案額度取預設的前 N 個，而不是「全部開放」——
 * 預設全開等於這條線從來沒生效過，那是最容易被忽略的漏收。
 */
export function resolveChannels(
  positioning: unknown,
  quota: Pick<PlanQuota, "platforms">,
): ChannelSelection {
  const raw = (positioning && typeof positioning === "object"
    ? (positioning as any).__channels
    : null) as Partial<ChannelSelection> | null;

  const stored = Array.isArray(raw?.platforms)
    ? raw!.platforms!.filter((p): p is string => typeof p === "string")
    : null;

  if (isUnlimited(quota.platforms)) {
    return { platforms: stored ?? [...DEFAULT_PLATFORM_ORDER], swappedAt: raw?.swappedAt ?? null };
  }
  const n = Math.max(0, quota.platforms);
  // 存過就用存的（多存的截掉——降級時額度會縮）
  if (stored) return { platforms: stored.slice(0, n), swappedAt: raw?.swappedAt ?? null };
  return { platforms: DEFAULT_PLATFORM_ORDER.slice(0, n), swappedAt: null };
}

/** 還要幾天才能換通路。0 = 現在就可以換。 */
export function daysUntilSwap(
  sel: ChannelSelection,
  quota: Pick<PlanQuota, "platformSwapDays">,
  now: Date = new Date(),
): number {
  const cooldown = quota.platformSwapDays ?? 0;
  if (cooldown <= 0 || !sel.swappedAt) return 0;
  const last = new Date(sel.swappedAt).getTime();
  if (!Number.isFinite(last)) return 0;
  const elapsedDays = (now.getTime() - last) / 86_400_000;
  return Math.max(0, Math.ceil(cooldown - elapsedDays));
}

/**
 * 依方案濾掉這個用戶不該看到的任務卡。
 *
 * 兩道濾網：
 *   ① 爆款結構卡 —— viralTaskCards=false 就整批拿掉。這是 2,250 → 9,000
 *      的主要升級鉤子，靠的正是 taskSource 那層分類。
 *   ② 通路 —— 只留已啟用的通路。
 *
 * 刻意接受 `{ platform, source }` 這種最小形狀，讓 router 與測試都好餵。
 */
export function filterTasksByPlan<
  T extends { platform?: string | null; source?: { type?: string } | null },
>(
  tasks: T[],
  quota: Pick<PlanQuota, "platforms" | "viralTaskCards">,
  channels: ChannelSelection,
): T[] {
  const allowPlatform = isUnlimited(quota.platforms)
    ? null
    : new Set(channels.platforms);
  return tasks.filter((t) => {
    if (quota.viralTaskCards === false && t.source?.type === "viral") return false;
    if (allowPlatform && t.platform && !allowPlatform.has(t.platform)) return false;
    return true;
  });
}

/** 上限檢查的結果。ok=false 時 message 是要直接給用戶看的中文。 */
export interface CapCheck { ok: boolean; message?: string; limit?: number; used?: number }

/**
 * 通用的「還能不能再加一個」。
 *
 * 訊息刻意寫出目前用量與上限，而不只是「已達上限」——用戶要知道差多少
 * 才決定得了要不要升級。
 */
export function checkCap(used: number, limit: number, noun: string): CapCheck {
  if (isUnlimited(limit)) return { ok: true };
  if (used < limit) return { ok: true, limit, used };
  return {
    ok: false,
    limit,
    used,
    message: `你的方案最多 ${limit} ${noun}（目前 ${used}）。升級後可以增加。`,
  };
}
