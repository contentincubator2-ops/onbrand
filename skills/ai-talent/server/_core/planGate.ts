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

// ── 執行層閘門 ─────────────────────────────────────────────────────────
//
// 2026-09-07。列表層（listFB）擋了爆款卡與未開通路，但那只是 UI 閘門：
// 基礎用戶拿一個舊書籤、或直接打任務 id，五個執行入口（runOrchestra /
// runOrchestra60 / runOrchestra99 / squad runStepLive / stepExecute）
// 全部沒過方案檢查。列表看不到不等於不能用 —— 2,250 → 9,000 的升級理由
// 在執行層是漏的。這一段補的就是那個洞。

export interface TaskGateInfo {
  /** 卡的通路代號（facebook / instagram / …）。不知道就給 null。 */
  platform: string | null;
  /** 結構來源類型（viral / award / …）。不知道就給 null。 */
  sourceType: string | null;
}

export interface GateVerdict { ok: boolean; reason?: "viral" | "channel"; message?: string }

/**
 * 純判斷：這個方案、這組已開通路，能不能跑這張卡。無 I/O，方便測。
 *
 * channels 給 null 代表「不知道這個品牌開了哪些通路」—— 那就**跳過通路檢查**
 * 而不是用方案預設去擋。預設通路是 FB+IG，一個明明選了 TikTok 的合法用戶
 * 若因為執行 input 少帶 brandId 就被擋，是誤殺；寧可放過也不誤殺。
 * 爆款卡的檢查不依賴品牌，一律做。
 */
export function checkTaskAllowed(
  quota: Pick<PlanQuota, "platforms" | "viralTaskCards">,
  channels: ChannelSelection | null,
  info: TaskGateInfo,
): GateVerdict {
  if (quota.viralTaskCards === false && info.sourceType === "viral") {
    return {
      ok: false, reason: "viral",
      message: "這張是爆款結構卡，屬於專業方案。升級後即可使用（方案與定價）。",
    };
  }
  if (channels && !isUnlimited(quota.platforms) && info.platform) {
    if (!channels.platforms.includes(info.platform)) {
      return {
        ok: false, reason: "channel",
        message: `這個通路（${info.platform}）目前沒有開通。到任務頁的「已開通路」更換，或升級方案增加通路數。`,
      };
    }
  }
  return { ok: true };
}

/** 讀一個品牌的 positioning JSON。讀不到回 null —— 呼叫端會跳過通路檢查。 */
export async function loadBrandPositioning(brandId: number | null | undefined): Promise<unknown> {
  if (!brandId) return null;
  try {
    const { default: localPool } = await import("../localDb");
    const [rows]: any = await localPool.execute(
      `SELECT positioning FROM brands WHERE id = ? LIMIT 1`, [brandId],
    );
    const raw = (rows as any[])[0]?.positioning;
    return typeof raw === "string" ? JSON.parse(raw) : raw ?? null;
  } catch { return null; }
}

/**
 * 執行前的方案檢查。不通過就丟 FORBIDDEN，訊息直接給用戶看。
 *
 * info 由呼叫端提供（quickTask 從目錄索引查、squad 從 slug 查）。
 * 查不到的卡（用戶自建、品牌任務包客製）本來就是品牌專屬，呼叫端傳
 * platform/sourceType 都 null 即可 —— 兩道檢查自然都不會觸發。
 */
export async function assertTaskAllowed(args: {
  userId: number;
  brandId?: number | null;
  info: TaskGateInfo;
}): Promise<void> {
  // 基礎設施錯誤（DB 連不上、users 表讀失敗）一律 fail-open：記 warn 然後放行。
  // 這一層是縱深防禦，列表層的閘門仍在；若在這裡 fail-closed，DB 一抖動就把
  // 所有付費用戶擋在執行入口外，那比讓極少數人多跑一次爆款卡糟得多。
  // 注意：「查到用戶但是 trial」不是基礎設施錯誤，那會正常走到下面被擋。
  // 角色先於方案：viewer 不論方案都不能執行。五個執行入口都經過這裡，
  // 所以在這裡擋一次就全部擋到，不必再各接一次。
  await assertCanAct(args.userId);

  let quota: PlanQuota;
  let positioning: unknown = null;
  try {
    quota = await planQuotaFor(args.userId);
    if (args.brandId) positioning = await loadBrandPositioning(args.brandId);
  } catch (err) {
    console.warn("[planGate] 讀取方案失敗，執行層閘門放行：", (err as Error)?.message);
    return;
  }
  if (isUnlimited(quota.platforms) && quota.viralTaskCards !== false) return; // 無限方案直接放行
  const channels = args.brandId ? resolveChannels(positioning, quota) : null;
  const v = checkTaskAllowed(quota, channels, args.info);
  if (!v.ok) {
    const { TRPCError } = await import("@trpc/server");
    throw new TRPCError({ code: "FORBIDDEN", message: v.message! });
  }
}

// ── 角色閘門：viewer 只能看，不能產出或發布 ──────────────────────────────
//
// 2026-09-07。報價單的 5 席寫著「成效人員 —— 看數據」，但 workspace_members
// 的 viewer 在執行層沒有任何地方檢查：viewer 跑任務、發布、建卡跟 editor
// 一模一樣，它只是個標籤。這裡讓它變成真的。
//
// 規則：這個用戶在所有 workspace 裡「只有 viewer」→ 不能執行、發布、建卡。
// 沒有任何 workspace 紀錄（solo 用戶）→ 放行。有一個 editor 以上 → 放行。

/** 純判斷，方便測。 */
export function isViewerOnly(roles: readonly string[]): boolean {
  return roles.length > 0 && roles.every((r) => r === "viewer");
}

/** 這個用戶在各 workspace 的角色。讀不到回 []（fail-open，理由同執行閘門）。 */
export async function memberRolesFor(userId: number): Promise<string[]> {
  try {
    const { default: localPool } = await import("../localDb");
    const [rows]: any = await localPool.execute(
      `SELECT role FROM workspace_members WHERE userId = ?`, [userId],
    );
    return (rows as any[]).map((r) => String(r.role ?? ""));
  } catch { return []; }
}

export const VIEWER_BLOCK_MESSAGE =
  "你的角色是檢視者，只能查看內容與成效，不能產出、建卡或發布。請管理者調整你的權限。";

/** 產出／發布／建卡前的角色檢查。viewer-only 丟 FORBIDDEN。 */
export async function assertCanAct(userId: number): Promise<void> {
  const roles = await memberRolesFor(userId);
  if (isViewerOnly(roles)) {
    const { TRPCError } = await import("@trpc/server");
    throw new TRPCError({ code: "FORBIDDEN", message: VIEWER_BLOCK_MESSAGE });
  }
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
