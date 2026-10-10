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
import { TRPCError } from "@trpc/server";
import { PLANS, type PlanCode, type PlanQuota } from "./plans";
import { isCustomChannelId } from "../customChannelId";

/**
 * 2026-09-29 CJ「內容任務卡只要留下 Facebook、Instagram、TikTok、電子報、官網
 * 這五個類別」。這四個通路的卡片與程式碼都還在，只是不再列出、不能再被選為
 * 啟用通路——任務目錄、任務托盤、通路選擇、側欄都從這裡讀。要開回來就從這裡拿掉。
 *
 * 2026-10-10 CJ「一定要將官網文章，還有 youtube 加回來」：YouTube 與新聞稿開回來——
 * 這兩個加官網是 AI 搜尋讀得到的通路（見 client sourceVocabulary 的 AEO_CARD_IDS）。
 * LinkedIn、X 維持下架。
 */
// 2026-10-10 稍晚 CJ「我還是想先隱藏 youtube，因為影音還沒有好的解決方案」：YouTube 再收起來，
// 新聞稿留著。影音有解法之後，從這裡與 client 的 navCatalog／AEO_CARD_IDS 一起開回來。
export const HIDDEN_CONTENT_PLATFORMS: ReadonlySet<string> = new Set(["linkedin", "youtube", "x"]);

export function isHiddenContentPlatform(platform: string | null | undefined): boolean {
  return !!platform && HIDDEN_CONTENT_PLATFORMS.has(platform);
}

/**
 * 歷史資料（產出、排程、企劃格…）上的平台欄位寫法不一：missions.workspace
 * 會是 press、路由片段會是 li／yt，X 卡則記成 generic（只能靠 task id 認）。
 * CJ 2026-09-29「前台隱藏，資料保留」—— 讀歷史的地方一律過這支。
 */
const HIDDEN_PLATFORM_ALIASES: ReadonlySet<string> = new Set([
  ...HIDDEN_CONTENT_PLATFORMS, "li", "yt", "twitter",
]);
const HIDDEN_TASK_ID_PREFIXES = ["li-", "yt-", "x-"];

export function isHiddenTaskId(taskId: string | null | undefined): boolean {
  return !!taskId && HIDDEN_TASK_ID_PREFIXES.some((p) => taskId.startsWith(p));
}

export function isHiddenHistoryItem(item: { platform?: string | null; taskId?: string | null }): boolean {
  const p = typeof item.platform === "string" ? item.platform.toLowerCase() : "";
  return (!!p && HIDDEN_PLATFORM_ALIASES.has(p)) || isHiddenTaskId(item.taskId);
}

/** 沒選過通路時的預設。FB / IG 是產品主場，排前面。 */
const DEFAULT_PLATFORM_ORDER = [
  "facebook", "instagram", "tiktok", "linkedin",
  // 2026-09-10 X 通路加在社群段的末尾，不動前五個 —— 這個陣列的順序決定
  // 「沒選過通路的品牌預設開哪幾個」，把 x 插到前面會讓既有品牌的預設值
  // 悄悄改變（基礎方案只取前 2 個）。
  "x",
  "email", "website",
  // 2026-09-29 CJ：台灣市場加 Threads、LINE。接在內容通路最後，不動前面的順序。
  "threads", "line",
  // 2026-10-10 YouTube、新聞稿開回來。刻意排在最後而不是放回原位——下架期間
  // 「沒選過通路」的專業方案品牌預設是 FB／IG／TikTok／電子報／官網，放回第三位
  // 會把 YouTube 擠進去、官網擠出來。
  "youtube", "pr",
  "brand", "audience", "kol",
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
  const { default: localPool } = await import("../../../localDb");
  const [rows]: any = await localPool.execute(
    `SELECT email, planCode FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  const r = (rows as any[])[0];
  const isInternal = typeof r?.email === "string" && /@sowork\.(tw|ai)$/i.test(r.email);
  let code: PlanCode = isInternal ? "enterprise" : ((r?.planCode ?? "trial") as PlanCode);
  // A team member rides on the team owner's plan (seats are part of it).
  if (!isInternal) {
    const { teamPlanFor } = await import("../teamAccess");
    const team = await teamPlanFor(userId);
    const rank: Record<string, number> = { trial: 0, drop_starter: 1, drop_pro: 2, enterprise: 3 };
    if (team && (rank[team.planCode] ?? 0) > (rank[code] ?? 0)) code = team.planCode as PlanCode;
  }
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
    ? raw!.platforms!.filter((p): p is string => typeof p === "string" && !isHiddenContentPlatform(p))
    : null;
  const defaults = DEFAULT_PLATFORM_ORDER.filter((p) => !isHiddenContentPlatform(p));

  if (isUnlimited(quota.platforms)) {
    return { platforms: stored ?? defaults, swappedAt: raw?.swappedAt ?? null };
  }
  const n = Math.max(0, quota.platforms);
  // 存過就用存的（多存的截掉——降級時額度會縮）
  if (stored) return { platforms: stored.slice(0, n), swappedAt: raw?.swappedAt ?? null };
  return { platforms: defaults.slice(0, n), swappedAt: null };
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
 *   ⓪ 不論方案，HIDDEN_CONTENT_PLATFORMS 的卡一律不列。
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
    if (isHiddenContentPlatform(t.platform)) return false;
    if (quota.viralTaskCards === false && t.source?.type === "viral") return false;
    // 2026-10-04：自訂通路不受「7 選 N」通路額度管 —— 底下只有用戶自建卡，已受
    // ownTaskCards 上限約束；不放行的話受限方案的用戶自建的蝦皮 tray 會整個看不到。
    if (allowPlatform && t.platform && !isCustomChannelId(t.platform) && !allowPlatform.has(t.platform)) return false;
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
  // 2026-09-29：下架通路不論方案都不能跑（舊書籤、舊產出的重跑都走到這裡）。
  if (isHiddenContentPlatform(info.platform)) {
    return { ok: false, reason: "channel", message: "這個通路的任務卡已下架。" };
  }
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
    const { default: localPool } = await import("../../../localDb");
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
  // 2026-09-29：下架通路在無限方案也不放行——所以要擋在下面的「無限方案直接放行」之前。
  if (isHiddenContentPlatform(args.info.platform)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "這個通路的任務卡已下架。" });
  }

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
    const { default: localPool } = await import("../../../localDb");
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

/** 審核工作流是專業方案的能力（價目表：專業「其他」列；基礎沒有）。 */
export const REVIEW_BLOCK_MESSAGE =
  "審核工作流屬於專業方案（5 席：產出的人與放行的人分開）。升級後可以送審與放行。";

/**
 * 送審／放行／退回前呼叫。查不到方案（infra 問題）就放行 —— 跟其他閘門一樣
 * fail-open，寧可讓一次審核過去，也不要因為 DB 抖一下把整個工作流卡死。
 */
export async function assertReviewAllowed(userId: number): Promise<void> {
  let quota: PlanQuota;
  try { quota = await planQuotaFor(userId); }
  catch (e) { console.warn("[planGate] assertReviewAllowed: planQuotaFor failed, fail-open", (e as Error)?.message); return; }
  if (!quota.reviewWorkflow) throw new TRPCError({ code: "FORBIDDEN", message: REVIEW_BLOCK_MESSAGE });
}

export const APPROVAL_LINK_BLOCK_MESSAGE =
  "客戶核准連結是付費方案的功能。升級後可以把排好的貼文用一條連結交給客戶核准。";

/**
 * 建立客戶核准連結前呼叫（2026-10-07，所有付費方案都有、試用沒有）。
 * 只擋「建立」：已經發出去的連結，客戶照樣打得開——方案到期不該讓客戶那一頭壞掉。
 * 與 assertReviewAllowed 同一個 fail-open 原則。
 */
export async function assertApprovalLinkAllowed(userId: number): Promise<void> {
  let quota: PlanQuota;
  try { quota = await planQuotaFor(userId); }
  catch (e) { console.warn("[planGate] assertApprovalLinkAllowed: planQuotaFor failed, fail-open", (e as Error)?.message); return; }
  if (!quota.approvalLinks) throw new TRPCError({ code: "FORBIDDEN", message: APPROVAL_LINK_BLOCK_MESSAGE });
}

export const STRATEGY_MONITOR_BLOCK_MESSAGE =
  "策略監測屬於專業方案（品牌、產品與競爭者有變化時提醒你調整）。升級後可以設定監測與手動掃描。";

/**
 * 策略監測閘門（2026-09-08，價目表：專業方案的策略層）。
 * 讀取類的 procedure 不用這支 —— 基礎用戶要看得到「這裡有東西，但要升級」，
 * 所以 list 回 locked:true 而不是丟錯；只有會花錢的 setWatch／scanNow 才擋。
 * 與 assertReviewAllowed 同一個 fail-open 原則。
 */
export async function assertStrategyMonitoringAllowed(userId: number): Promise<void> {
  let quota: PlanQuota;
  try { quota = await planQuotaFor(userId); }
  catch (e) { console.warn("[planGate] assertStrategyMonitoringAllowed: planQuotaFor failed, fail-open", (e as Error)?.message); return; }
  if (!quota.strategyMonitoring) throw new TRPCError({ code: "FORBIDDEN", message: STRATEGY_MONITOR_BLOCK_MESSAGE });
}

