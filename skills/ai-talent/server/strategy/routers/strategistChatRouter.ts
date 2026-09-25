/**
 * strategistChatRouter — 「策略總監」對話。
 *
 * 2026-09-23（CJ「現在雖然不錯，但我覺得策略總監的角色，可以幫忙監測市場
 * 環境還有檢查一致性，所以目前的互動方式，會讓我覺得，這兩件事不是他負責
 * 的，也會讓我覺得，沒有跟策略總監互動。要怎麼設計，可以讓策略總監可以
 * 提供用戶，用對話的方式，問策略總監有關於策略的問題？然後，策略總監也
 * 可以引導進行策略監測和健檢？」）：
 *
 * 上一輪把策略總監／策略監測／策略健檢收成三顆平行的 icon，解決了「按鈕
 * 太多」，卻把三件事拆成互不相干的工具——這輪要把「監測」「健檢」重新
 * 收回策略總監的職責範圍：使用者跟總監聊天，總監在對話裡主動建議「要不要
 * 我?guide 你去看看策略監測／做一次策略健檢」，點一下建議就打開對應的
 * 面板（既有的 StrategyAlertsPanel／StrategyWorkbench，這裡不重做一次那
 * 兩塊 UI，只負責「引導過去」——跟這整個 session 一貫的「提案，不自動
 * 套用」紀律一致：總監只建議，實際掃描/健檢還是使用者在那個面板裡自己按）。
 *
 * 架構完全仿照 server/platform/routers/supportRouter.ts（Mia 客服）：
 * 兩張表（conversations/messages）、gatherContext 組系統提示、
 * <<action:kind>>Label 標記協定、per-user rate limit。刻意不共用
 * supportRouter 的程式碼——人設、grounding 內容、action 種類都不同，
 * 硬共用只會讓兩邊互相牽制。也刻意不用 positioning._xxx JSON 欄位存對話
 * ——對話是無界、只增不減的歷史，跟 _workbench/_aiPrompts 那種有界、
 * 少量更新的結構性資料本質不同，硬塞進 positioning 等於每則訊息都要
 * 讀寫整個品牌定位 JSON。
 *
 * 只有兩種 action（比 Mia 少，也刻意少）：
 *   open_monitor     → 前端打開「策略監測」面板（不直接觸發掃描）
 *   open_healthcheck → 前端打開「策略健檢」面板（不直接觸發健檢——
 *                       健檢需要的錨點選擇只存在 StrategyWorkbench 自己
 *                       的 React state，總監這裡拿不到，硬塞會是編的）
 * 「引導進行」= 帶使用者到那個面板，不是總監自己動手。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import localPool from "../../localDb";
import { callModel } from "../../platform/core/multiModelRouter";
import {
  listDirectorsForBrand, getDirectorByAgentId, searchDirectors as searchDirectoryAgents,
  getRole, type StrategistDirector, type StrategistScope,
} from "../core/strategistDirectory";
import { buildBrandPrefix } from "../core/brandContext";
import { buildBrandCatalogBlock } from "../core/brandCatalog";

// ── per-user rate limit（跟 supportRouter 同一套數字，同一個理由：LLM 呼叫要花錢）──
type RateState = { hourCount: number; hourReset: number; minCount: number; minReset: number };
const rateStateByUser = new Map<number, RateState>();
function checkRateLimit(userId: number): { allowed: boolean; reason?: string } {
  const now = Date.now();
  let s = rateStateByUser.get(userId);
  if (!s) { s = { hourCount: 0, hourReset: now + 3600_000, minCount: 0, minReset: now + 60_000 }; rateStateByUser.set(userId, s); }
  if (now >= s.hourReset) { s.hourCount = 0; s.hourReset = now + 3600_000; }
  if (now >= s.minReset)  { s.minCount = 0;  s.minReset  = now + 60_000; }
  if (s.minCount >= 5)  return { allowed: false, reason: "minute_cap" };
  if (s.hourCount >= 20) return { allowed: false, reason: "hour_cap" };
  s.minCount++; s.hourCount++;
  return { allowed: true };
}

// ── helpers ──────────────────────────────────────────────────────────────
async function assertBrandOwned(brandId: number, userId: number): Promise<void> {
  const [rows]: any = await localPool.execute(
    `SELECT id FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [brandId, userId],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "brand not found" });
  }
}

/**
 * 2026-09-23（CJ「每位一串獨立對話」）：對話串是 (userId, brandId, agentId)
 * 三個一組，不再是 (userId, brandId)——換一位總監就換一串對話，各自記各自的
 * 歷史，A 的回答不會混進 B 的口吻裡。
 *
 * agentId IS NULL 的那一串是這個欄位加上去之前留下的舊對話（那時所有人共用
 * 一串）。不硬把它指給某一位總監——那等於替使用者決定「你以前是在跟誰講話」，
 * 而那個答案我們並不知道。舊對話就留在原地，使用者選了任何一位總監都是開新
 * 的一串，舊的不會被看到也不會被刪。
 */
async function ensureOpenConversation(userId: number, brandId: number, agentId: number, agentSlug: string): Promise<number> {
  const [rows]: any = await localPool.execute(
    `SELECT id FROM strategist_conversations
      WHERE userId = ? AND brandId = ? AND agentId = ? AND status = 'open'
      ORDER BY updatedAt DESC LIMIT 1`,
    [userId, brandId, agentId],
  );
  const existing = (rows as any[])[0]?.id;
  if (existing) return Number(existing);
  const [ins]: any = await localPool.execute(
    `INSERT INTO strategist_conversations (userId, brandId, agentId, agentSlug, status) VALUES (?, ?, ?, ?, 'open')`,
    [userId, brandId, agentId, agentSlug.slice(0, 191)],
  );
  return Number(ins?.insertId ?? 0);
}

async function loadConversation(conversationId: number, userId: number) {
  const [rows]: any = await localPool.execute(
    `SELECT id, userId, brandId, agentId, status FROM strategist_conversations
      WHERE id = ? AND userId = ? LIMIT 1`,
    [conversationId, userId],
  );
  return (rows as any[])[0] ?? null;
}

/** 品牌的產業——決定三位總監從 mos_db 的哪個產業挑人。 */
async function brandIndustry(brandId: number, userId: number): Promise<string | null> {
  const [rows]: any = await localPool.execute(
    `SELECT industry FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [brandId, userId],
  );
  const v = (rows as any[])[0]?.industry;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * 對話串上記的那一位總監。查不到（agentId 是 NULL 的舊對話，或 mos_db 的
 * 那一列被移除了）就回 null，呼叫端退回「沒有指定人設」的通用提示詞——
 * 不是隨便指派一位頂替，那會讓使用者看到的名字跟實際回答的人設對不上。
 */
async function directorForConversation(conv: any, userId: number): Promise<StrategistDirector | null> {
  const agentId = Number(conv?.agentId ?? 0);
  if (!agentId) return null;
  return await getDirectorByAgentId(agentId, await brandIndustry(Number(conv.brandId), userId));
}

async function loadMessages(conversationId: number, limit = 100) {
  // 2026-05-13 於 supportRouter 訂下的紀律，這裡照搬：LIMIT 夾在合理範圍，
  // 避免一個爆量的對話串每次 sendMessage 都要撈幾千則訊息。
  const safe = Math.max(1, Math.min(500, Math.floor(limit)));
  const [rows]: any = await localPool.execute(
    `SELECT id, role, content, contextSnapshot, createdAt FROM strategist_messages
      WHERE conversationId = ?
      ORDER BY id DESC
      LIMIT ${safe}`,
    [conversationId],
  );
  return (rows as Array<{ id: number; role: string; content: string; contextSnapshot: any; createdAt: Date }>).reverse();
}

async function insertMessage(args: {
  conversationId: number;
  role: "user" | "strategist";
  content: string;
  contextSnapshot?: any;
}): Promise<number> {
  const [ins]: any = await localPool.execute(
    `INSERT INTO strategist_messages (conversationId, role, content, contextSnapshot)
     VALUES (?, ?, ?, ?)`,
    [args.conversationId, args.role, args.content,
     args.contextSnapshot ? JSON.stringify(args.contextSnapshot) : null],
  );
  await localPool.execute(
    `UPDATE strategist_conversations SET updatedAt = NOW(3) WHERE id = ?`,
    [args.conversationId],
  );
  return Number(ins?.insertId ?? 0);
}

/**
 * 品牌完整資料——讓總監真的答得出具體問題，不是空話。
 *
 * 2026-09-23（CJ「我希望每一個頁面駐守的總監，都能先讀取該品牌完整的資料，
 * 包括品牌、產品列表等內容，不會出現：不行，我這裡沒有讀取你產品列表的
 * 功能。」）：原本這裡是手寫 SQL 抓 6 個定位欄位（標語 / WHY / 受眾 /
 * 差異化 / 健檢時間），產品與活動一個字都沒有，所以使用者問「我有哪些
 * 產品」時，模型只能照實說它看不到——那不是模型客氣，是 prompt 裡真的
 * 沒有。
 *
 * 改成三段接起來：
 *   1. buildBrandPrefix()——既有的 canonical 品牌大腦入口（定位各段、語氣、
 *      禁用/偏好詞、市場脈絡）。刻意重用而不是自己再抓一次：同一件事有兩份
 *      各自維護的組裝邏輯遲早會漂移（memory 的 taskRegistry 教訓）。使用者
 *      現在正在看某個產品時把 productId 一起傳進去，那個產品的完整定位也會
 *      進來。
 *   2. buildBrandCatalogBlock()——整份產品／活動清單（brandCatalog.ts）。
 *   3. 策略總監自己要用的兩個狀態：上次健檢時間、未讀監測提醒數。
 */
export async function gatherBrandContext(brandId: number, userId: number, productId?: number | null): Promise<string> {
  const ctx: string[] = [];

  // 1) canonical 品牌大腦。失敗不致命——後面兩段還是有價值。
  let hasPrefix = false;
  try {
    const prefix = await buildBrandPrefix(brandId, productId ?? null, null, "full");
    if (prefix && prefix.trim()) { ctx.push(prefix.trim()); hasPrefix = true; }
  } catch { /* non-fatal */ }

  // 2) 產品／活動清單
  try {
    const catalog = await buildBrandCatalogBlock(brandId, userId);
    if (catalog) ctx.push(catalog);
  } catch { /* non-fatal */ }

  // 3) 策略總監專屬狀態（健檢／監測）——這兩件事是他的職責，要知道現況才
  //    建議得準。
  try {
    const [alertRows]: any = await localPool.execute(
      `SELECT COUNT(*) AS c FROM strategy_alerts WHERE brandId = ? AND status = 'new'`, [brandId],
    );
    const unread = Number((alertRows as any[])[0]?.c ?? 0);
    ctx.push(unread > 0 ? `【策略監測】有 ${unread} 則提醒還沒看` : `【策略監測】沒有未讀提醒`);
  } catch { /* non-fatal */ }

  // 4) 只有在品牌大腦整段拿不到時才補這幾個關鍵欄位。品牌大腦裡本來就有標語／
  //    受眾／差異化，兩段都放等於同樣的事實在 prompt 裡講兩遍——多花錢，也會
  //    讓模型以為那是兩個不同的來源。
  if (!hasPrefix) {
    const basics = await gatherBrandBasics(brandId, userId);
    if (basics) ctx.push(basics);
  }
  return ctx.join("\n\n");
}

/** 品牌最關鍵的幾個定位欄位 + 健檢狀態。buildBrandPrefix 整段失敗時，這段
 *  仍然讓總監答得出最基本的問題（標語、受眾、差異化）。 */
async function gatherBrandBasics(brandId: number, userId: number): Promise<string> {
  const ctx: string[] = [];
  try {
    const [rows]: any = await localPool.execute(
      `SELECT name, industry,
              JSON_UNQUOTE(JSON_EXTRACT(positioning, '$.tagline.zhTagline'))          AS tagline,
              JSON_UNQUOTE(JSON_EXTRACT(positioning, '$.goldenCircle.why'))           AS gcWhy,
              JSON_UNQUOTE(JSON_EXTRACT(positioning, '$.audience.primary'))           AS audience,
              JSON_UNQUOTE(JSON_EXTRACT(positioning, '$.differentiation.summary'))    AS diffSummary,
              JSON_UNQUOTE(JSON_EXTRACT(positioning, '$.differentiation.discriminator')) AS discriminator,
              JSON_UNQUOTE(JSON_EXTRACT(positioning, '$._workbench.healthCheck.checkedAt')) AS hcCheckedAt
         FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
      [brandId, userId],
    );
    const b = (rows as any[])[0];
    if (!b) return "";
    ctx.push(`品牌：${b.name}${b.industry ? `（${b.industry}）` : ""}`);
    if (b.tagline && b.tagline !== "null") ctx.push(`標語：${b.tagline}`);
    if (b.gcWhy && b.gcWhy !== "null") ctx.push(`WHY 信念：${String(b.gcWhy).slice(0, 200)}`);
    if (b.audience && b.audience !== "null") ctx.push(`主受眾：${String(b.audience).slice(0, 200)}`);
    const diff = b.discriminator && b.discriminator !== "null" ? b.discriminator : b.diffSummary;
    if (diff && diff !== "null") ctx.push(`差異化：${String(diff).slice(0, 200)}`);
    ctx.push(b.hcCheckedAt && b.hcCheckedAt !== "null"
      ? `上次策略健檢時間：${b.hcCheckedAt}（可以主動問要不要再檢查一次）`
      : `這個品牌還沒做過策略健檢`);
  } catch { /* non-fatal */ }
  return ctx.join("\n");
}

const STRATEGIST_SYSTEM_PROMPT = `你是 OnBrand 的策略總監，繁體中文，口語、直接、不要客套、不要講「親愛的」。

【你手上有什麼】（2026-09-23，CJ 明確要求）
這則對話的最後面附了這個品牌的完整資料：品牌定位各段、語氣與禁用/偏好詞、
市場脈絡、**整份產品列表**、**整份活動列表**、策略監測未讀數、上次健檢時間。
所以：
- **絕對不要說「我沒有讀取你產品列表的功能」「我看不到你的產品」這類話**。
  你看得到，就在下面。使用者問「我有哪些產品」就直接照清單回答。
- 清單上寫「尚未建立」「尚未填寫」是**資料真的是空的**，不是你讀不到。這種
  時候要講清楚是哪一格還沒填、填了會有什麼差別，而不是說自己沒有權限或功能。
- 清單上寫「讀取時發生錯誤」才是真的拿不到，那就照實說這一輪拿不到，不要猜
  產品名字。
- 資料裡沒有的東西（例如某個產品的銷售數字）就說沒有這項資料，不要編——
  「沒有這項資料」跟「我沒有這個功能」也是兩句不同的話，講前者。
- **不要問資料裡已經有的東西。** 下面的品牌資料與產品清單已經寫了的（售價、
  客群、USP、標語、核心定位…），一律直接當事實使用，並在回答裡把你採用的數字
  覆述一次（例如「你這支現在賣 NT$560」），讓使用者知道你確實看到了。要問，
  只問資料裡**沒有**的（例如成本、毛利、實際銷量、庫存）。使用者在畫面上已經
  填過的東西被反問一次，對他來說就是「你根本沒看我的資料」。

你的職責有三件事：
1. 回答用戶關於這個品牌策略的問題——定位、受眾、競爭、差異化、標語、語氣、
   產品組合，任何策略相關的疑問都可以問你。根據下方的品牌資料具體回答，
   講得出「為什麼」，不要講空泛的行銷場面話。資料沒提到的東西，誠實說沒有
   這項資料，不要編。
2. 用戶問「這是什麼方法論」「SoWork 定位法是什麼」「這個系統是怎麼運作的」
   這類問題，用自己的話講清楚（不用照抄），核心事實是：SoWork 品牌定位法
   ——先鎖定你是誰，AI 才知道每篇文章要說什麼；包含 14 步定位、文字／
   視覺／知識資產、AI 指令庫。
   （2026-09-23：這段說明原本是定位頁標題旁一顆常駐的「方法論」按鈕，CJ
   覺得「header太亂了」拿掉了——資訊沒有不見，搬進這裡，用戶直接問你就有。）
3. （工具引導：見下方「你能帶使用者去哪裡」）

回答的最後面，另外附上 2 個使用者接下來可以追問你的問題，每個一行、格式是
  <<ask>>問題（≤20字，用使用者的口吻寫，不是你的口吻）
這兩個問題要是「從你剛才這段回答自然會長出來的下一題」，不是換個話題的
通用問句；也要是你這個角度答得出來的。真的沒有值得追問的就不要附。`;

/**
 * 2026-09-25（CJ「他應該要專注在產品相關策略和定位就好，就算是健檢，也是健檢
 * 產品策略」）：工具引導依 scope 分開。
 *
 * 品牌層的策略監測／策略健檢是**品牌**的工具——健檢比對的是品牌故事與策略工作台
 * 錨點，跟「這支產品賣不賣得動」是兩件事。產品總監把使用者帶去那裡，等於答非所問，
 * 而且會讓使用者以為產品問題要靠品牌工具解決。
 *
 * 產品層目前沒有等價的按鈕（產品的「健檢」就是重跑那支產品的定位），所以產品總監
 * **不發任何 action 標記**——寧可用話帶他到產品卡片上的「重新定位／查看」，也不要
 * 給一顆按下去會跳到品牌工具的按鈕。哪天產品層有了自己的面板，再加 action。
 */
const BRAND_TOOLS_BLOCK = `【你能帶使用者去哪裡】
判斷用戶現在適合用哪個工具，主動建議並引導過去（不是你自己動手做）：
- 策略監測：看外部市場——競爭者的新動作、受眾偏好的轉變。適合回答
  「外面是不是有什麼變化該注意」。
- 策略健檢：看內部一致性——不看外面，只憑品牌自己的研究資料獨立判斷，
  跟用戶目前選的策略工作台錨點比對是否一致。適合回答「我自己選的策略，
  跟我品牌的故事是不是同一件事」。

覺得某個工具真的能幫上忙，就在建議句子最後面加一個標記（使用者看到的是
一顆按鈕，不是這串文字本身），標記後面接的是按鈕上要顯示的字（≤12字）：
  <<action:open_monitor>>看看外部有什麼變化
  <<action:open_healthcheck>>帶我去做健檢
沒有工具幫得上忙就正常聊天，不要為了用而用、硬塞標記。一次最多建議一個。`;

const PRODUCT_TOOLS_BLOCK = `【你的守備範圍：產品，不是品牌】
你負責的是**這個品牌的產品**——單支產品的定位、價值主張、賣點、價格與組合、
產品之間的角色分工（誰是入口、誰是主力、誰其實可以砍）。

- **不要**把使用者帶去「策略監測」或「策略健檢」。那兩個是**品牌層**的工具：
  健檢比對的是品牌故事與策略工作台的錨點，跟「這支產品賣不賣得動」是兩件事。
  你也**不要**輸出任何 <<action:...>> 標記——那些按鈕都會跳到品牌工具。
- 需要更深入看一支產品時，用講的帶他過去：產品卡片上的「查看」可以看那支產品
  的完整定位，「重新定位」會重跑那支產品的定位流程。那就是產品層的健檢。
- 使用者問到品牌層的事（品牌標語、品牌差異化、整體市場監測），直接說那要找
  品牌策略總監——在品牌定位頁右下角可以換人——不要硬答。`;

/**
 * 2026-09-23（CJ「品牌策略總監的三個人選」）：人設不再是一段寫死的文字，
 * 而是 mos_db 那一位 agent 的真實資料——名字、職稱、【工作經歷】、專長，
 * 原樣放進系統提示裡。三位總監因此真的會答得不一樣：不只是換頭像，連
 * 「他是誰、做過什麼、從哪個角度看事情」都換了。
 *
 * director 是 null（agentId 還沒寫進去的舊對話）時退回通用提示詞，不硬
 * 指派一位——見 directorForConversation() 的說明。
 */
export function buildSystemPrompt(director: StrategistDirector | null, brandCtx: string): string {
  const parts = [STRATEGIST_SYSTEM_PROMPT];
  // 工具引導依這位總監所屬的 scope 給——產品總監不該把人帶去品牌層的健檢。
  // 沒有指定人設（agentId 是 NULL 的舊對話）時用品牌那套，跟以前的行為一致。
  const scope = director ? getRole(director.roleId).scope : "brand";
  parts.push(scope === "product" ? PRODUCT_TOOLS_BLOCK : BRAND_TOOLS_BLOCK);
  if (director) {
    const role = getRole(director.roleId);
    const persona: string[] = [
      `[你是誰]`,
      `你叫${director.name}，職稱是${director.title}。以第一人稱用這個身分說話，不要自稱「AI」或「助理」。`,
      role.promptAngle,
    ];
    if (director.specialty) persona.push(`你的專長：${director.specialty}`);
    if (director.experience) persona.push(`你的經歷：\n${director.experience}`);
    if (director.methodology) persona.push(`你慣用的方法論：\n${director.methodology.slice(0, 800)}`);
    persona.push(
      `經歷裡沒寫到的事不要編（不要編客戶名字、數字、年份）。使用者問你「你是誰/你做過什麼」`
      + `就照上面這些講，講不出來的部分就說沒有這段資料。`,
    );
    parts.push(persona.join("\n"));
  }
  if (brandCtx) parts.push(`[品牌定位摘要]\n${brandCtx}\n[/品牌定位摘要]`);
  return parts.join("\n\n");
}

const ACTION_RE = /<<action:([a-z_0-9]+)>>\s*([^\n<]*)/gi;
/** 2026-09-23（CJ「對話中持續出現的追問建議」）：回答末尾附的下一題。 */
const ASK_RE = /<<ask>>\s*([^\n<]*)/gi;
export type StrategistAction =
  | { kind: "open_monitor"; label: string }
  | { kind: "open_healthcheck"; label: string };

function parseActions(raw: string): { clean: string; actions: StrategistAction[]; followUps: string[] } {
  if (!raw) return { clean: "", actions: [], followUps: [] };
  const actions: StrategistAction[] = [];
  const followUps: string[] = [];
  let clean = raw.replace(ACTION_RE, (_full, kind: string, label: string) => {
    const trimmedLabel = (label ?? "").trim().slice(0, 24) || _full;
    const lower = kind.toLowerCase();
    if (lower === "open_monitor") actions.push({ kind: "open_monitor", label: trimmedLabel });
    else if (lower === "open_healthcheck") actions.push({ kind: "open_healthcheck", label: trimmedLabel });
    return "";
  });
  clean = clean.replace(ASK_RE, (_full, q: string) => {
    const text = (q ?? "").trim().slice(0, 60);
    // 空的、或只剩標點的就不要——寧可少一顆膠囊，也不要一顆點了沒意義的。
    if (text.replace(/[\s。，、？?!！]/g, "").length >= 4) followUps.push(text);
    return "";
  });
  return {
    clean: clean.replace(/\n{3,}/g, "\n\n").trim(),
    actions: actions.slice(0, 1),
    followUps: followUps.slice(0, 3),
  };
}

/**
 * 2026-09-23（CJ「策略總監也可以...主動發問」）：新對話第一次開啟時，與其
 * 讓使用者面對一個空面板，不如讓總監先開口——用「品牌現在缺什麼」決定
 * 開場白，不叫 LLM（省一次呼叫，也不會因為 LLM 亂猜而失真）：沒做過健檢
 * 就建議健檢，有未讀的策略監測提醒就提一下，兩者都沒有就給一句帶品牌
 * 名字的一般問候。只在對話「第一次建立、還沒有任何訊息」時算一次，之後
 * 不會每次開面板都重講一次開場白。
 */
async function buildProactiveOpening(
  brandId: number, userId: number, brandName: string, en: boolean, director: StrategistDirector | null,
): Promise<{ content: string; actions: StrategistAction[] }> {
  // 2026-09-23：開場白用這位總監自己的名字跟角度自我介紹——三位人選各自
  // 一串對話，開場就該看得出來現在是誰在講話（而不是三串都寫「策略總監」）。
  const en_ = en;
  const who = director
    ? (en_ ? `${director.name}, ${brandName}'s ${director.roleLabelEn} director` : `${director.name}，${brandName}的${director.roleLabel}總監`)
    : (en_ ? `${brandName}'s Strategy Director` : `${brandName}的策略總監`);
  const hi = en_ ? `Hi, I'm ${who}.` : `嗨，我是${who}。`;

  // 2026-09-25（CJ「就算是健檢，也是健檢產品策略」）：產品總監的開場白不能
  // 推銷品牌層的健檢／監測。他要問的是產品的事，而且產品清單就在 prompt 裡，
  // 所以直接用產品數量開場——比「要不要做健檢」具體得多。
  if (director && getRole(director.roleId).scope === "product") {
    let productCount = 0;
    try {
      const [rows]: any = await localPool.execute(
        `SELECT COUNT(*) AS c FROM products p JOIN brands b ON b.id = p.brandId
          WHERE p.brandId = ? AND b.userId = ?`, [brandId, userId],
      );
      productCount = Number((rows as any[])[0]?.c ?? 0);
    } catch { /* 數不到就不提數字 */ }
    const zh = productCount > 0
      ? `${hi}我看的是${director.roleLabel}這一塊。${brandName}目前有 ${productCount} 支產品——想從哪一支開始？或者直接問我「這支賣不動怎麼辦」「這支的價格帶對不對」。`
      : `${hi}我看的是${director.roleLabel}這一塊。這個品牌還沒有建立產品——先新增一支，我就能幫你看它的定位、賣點跟價格。`;
    const en2 = productCount > 0
      ? `${hi} I work on ${director.roleLabelEn}. ${brandName} has ${productCount} product(s) — which one shall we start with? Or just ask me why one of them isn't selling.`
      : `${hi} I work on ${director.roleLabelEn}. This brand has no products yet — add one and I can look at its positioning, selling points and price.`;
    return { content: en_ ? en2 : zh, actions: [] };   // 刻意沒有按鈕：品牌層的按鈕對產品問題沒用
  }

  try {
    const [rows]: any = await localPool.execute(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(positioning, '$._workbench.healthCheck.checkedAt')) AS hcCheckedAt
         FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
      [brandId, userId],
    );
    const hcDone = !!(rows as any[])[0]?.hcCheckedAt && (rows as any[])[0].hcCheckedAt !== "null";
    if (!hcDone) {
      return {
        content: en
          ? `${hi} You haven't run a Strategy Health Check yet — want me to take you there? I'll independently read your brand's own research and see if it agrees with what you picked in the workbench.`
          : `${hi}你還沒做過策略健檢——要我帶你去看看嗎？我會獨立看一次品牌自己的研究資料，看跟你在工作台選的是不是一致。`,
        actions: [{ kind: "open_healthcheck", label: en ? "Take me there" : "帶我去看看" }],
      };
    }
    // brandId（不是 scope/scopeId）——這樣品牌底下的產品層提醒也算得到，
    // 跟 idx_strategy_alerts_brand 這個既有索引對得上。
    const [alertRows]: any = await localPool.execute(
      `SELECT COUNT(*) AS c FROM strategy_alerts WHERE brandId = ? AND status = 'new'`,
      [brandId],
    );
    const unread = Number((alertRows as any[])[0]?.c ?? 0);
    if (unread > 0) {
      return {
        content: en
          ? `${hi} There ${unread === 1 ? "is" : "are"} ${unread} unread strategy alert${unread === 1 ? "" : "s"} waiting — want to take a look?`
          : `${hi}有 ${unread} 則策略監測提醒還沒看——要看一下嗎？`,
        actions: [{ kind: "open_monitor", label: en ? "Show me" : "看一下" }],
      };
    }
  } catch { /* non-fatal — fall through to generic greeting */ }
  return {
    content: en
      ? `${hi} Ask me anything about this brand's strategy from my angle — or I can point you to Strategy Monitoring or a Health Check.`
      : `${hi}${director ? `我看的是${director.roleLabel}這一塊，` : ""}問我任何跟這個品牌策略有關的問題，或者我可以帶你去看看策略監測或做一次健檢。`,
    actions: [],
  };
}

/** 訊息上的 contextSnapshot 是 JSON 欄位，驅動可能回字串也可能回物件。 */
function snapshotOf(raw: any): any {
  if (!raw) return {};
  try { return (typeof raw === "string" ? JSON.parse(raw) : raw) ?? {}; } catch { return {}; }
}

export const strategistChatRouter = router({
  /**
   * 這個品牌的三位策略總監（真實 mos_db agent）。2026-09-23：UI 不再有任何
   * 寫死的人設——名字/職稱/經歷/專長全部從這裡來，見 strategistDirectory.ts。
   */
  listDirectors: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      /**
       * 2026-09-24（自我 debug）：使用者從「換更多人選」搜尋挑的人不在這三位
       * 裡面。前端原本只認這三位，所以挑了之後 current 是 null——畫面變成
       * 「找不到可用的策略總監」，那顆「找他聊」等於沒作用。
       * 解法是讓伺服器把「他選過的那一位」一起回來：前端不需要自己維護一份
       * 額外名單，重新整理之後也還在（localStorage 只存 id）。
       */
      includeAgentId: z.number().int().positive().optional(),
      /**
       * 2026-09-24（CJ「產品定位就用你推薦的那三位人選」）：品牌頁與產品頁
       * 各有自己的三個角色。前端在產品頁（URL 有 ?p=）會送 "product"。
       */
      scope: z.enum(["brand", "product"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandOwned(input.brandId, userId);
      const industry = await brandIndustry(input.brandId, userId);
      const scope: StrategistScope = input.scope ?? "brand";
      const directors = await listDirectorsForBrand(industry, scope);
      if (input.includeAgentId && !directors.some((d) => d.agentId === input.includeAgentId)) {
        const extra = await getDirectorByAgentId(input.includeAgentId, industry);
        // 查不到就當作沒選過（mos_db 那一列可能被移除了），不要塞一個空殼進去。
        if (extra) directors.push(extra);
      }
      return { brandIndustry: industry, scope, directors };
    }),

  /** 「換更多人選」：在 mos_db 的 strategy 層 agent 裡搜。 */
  searchDirectors: protectedProcedure
    .input(z.object({ search: z.string().min(1).max(60), limit: z.number().int().min(1).max(30).optional() }))
    .query(async ({ input }) => {
      return { directors: await searchDirectoryAgents(input.search, input.limit ?? 12) };
    }),

  /** 取得（或建立）這個品牌 × 這位總監的開放對話串 + 歷史訊息，聊天面板開啟時呼叫一次。
   *  全新對話（還沒有任何訊息）會先幫使用者寫好一則開場白——見
   *  buildProactiveOpening()。 */
  getConversation: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      // 2026-09-23：每位總監一串獨立對話，所以要指定是哪一位。沒給的話
      // （舊前端）退回這個品牌的第一位，不會炸。
      agentId: z.number().int().positive().optional(),
      /** 沒給 agentId 時，要從哪一組角色取第一位當預設。 */
      scope: z.enum(["brand", "product"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandOwned(input.brandId, userId);
      const industry = await brandIndustry(input.brandId, userId);
      const director = input.agentId
        ? await getDirectorByAgentId(input.agentId, industry)
        : (await listDirectorsForBrand(industry, input.scope ?? "brand"))[0] ?? null;
      if (!director) throw new TRPCError({ code: "NOT_FOUND", message: "strategy director not found" });

      const conversationId = await ensureOpenConversation(userId, input.brandId, director.agentId, director.slug);
      let messages = await loadMessages(conversationId, 60);
      if (messages.length === 0) {
        const [brandRows]: any = await localPool.execute(
          `SELECT name FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [input.brandId, userId],
        );
        const brandName = (brandRows as any[])[0]?.name ?? "";
        const opening = await buildProactiveOpening(input.brandId, userId, brandName, false, director);
        await insertMessage({
          conversationId, role: "strategist", content: opening.content,
          contextSnapshot: opening.actions.length > 0 ? { actions: opening.actions } : undefined,
        });
        messages = await loadMessages(conversationId, 60);
      }
      return {
        conversationId,
        director,
        messages: messages.map((m) => {
          const snap = snapshotOf(m.contextSnapshot);
          return {
            id: m.id, role: m.role, content: m.content,
            actions: snap.actions ?? [],
            followUps: snap.followUps ?? [],
            createdAt: m.createdAt,
          };
        }),
      };
    }),

  sendMessage: protectedProcedure
    .input(z.object({
      conversationId: z.number().int().positive(),
      brandId: z.number().int().positive(),
      content: z.string().min(1).max(2000),
      /** 使用者目前在看的產品（URL 的 ?p=）——有的話那個產品的完整定位會進 prompt。 */
      productId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const rate = checkRateLimit(userId);
      if (!rate.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: rate.reason === "minute_cap" ? "1 分鐘只能聊 5 次，先喘口氣再問。" : "1 小時上限 20 則，明天再聊。",
        });
      }
      const conv = await loadConversation(input.conversationId, userId);
      if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "conversation not found" });
      if (Number(conv.brandId) !== input.brandId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "conversation belongs to a different brand" });
      }

      const userMsgId = await insertMessage({ conversationId: input.conversationId, role: "user", content: input.content });

      // 使用者現在正在看某個產品時（URL 的 ?p=），把那個產品的完整定位
      // 也一起帶進來——常駐總監要能接得上「我現在看的這個產品」。
      const brandCtx = await gatherBrandContext(input.brandId, userId, input.productId ?? null);
      // 2026-09-23：人設來自這串對話記住的那一位 mos_db agent——所以三位
      // 總監答出來的東西真的不一樣（名字、經歷、看事情的角度都換了）。
      const director = await directorForConversation(conv, userId);
      const history = await loadMessages(input.conversationId);
      const llmMessages = [
        { role: "system" as const, content: buildSystemPrompt(director, brandCtx) },
        ...history.slice(-10).map((m) => ({
          role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
          content: m.content,
        })),
      ];

      let replyRaw = "";
      try {
        const r = await callModel(llmMessages, "general");
        replyRaw = (r.content ?? "").trim();
      } catch (e: any) {
        replyRaw = `我這邊剛剛斷線了（${String(e?.message ?? e).slice(0, 80)}），再問我一次看看。`;
      }
      if (!replyRaw) replyRaw = "這題我答不太上來，換個問法試試？";

      const { clean, actions, followUps } = parseActions(replyRaw);
      const strategistMsgId = await insertMessage({
        conversationId: input.conversationId, role: "strategist", content: clean,
        contextSnapshot: (actions.length > 0 || followUps.length > 0) ? { actions, followUps } : undefined,
      });

      return {
        userMessage: { id: userMsgId, role: "user" as const, content: input.content },
        strategistMessage: {
          id: strategistMsgId, role: "strategist" as const, content: clean, actions, followUps,
        },
      };
    }),
});
