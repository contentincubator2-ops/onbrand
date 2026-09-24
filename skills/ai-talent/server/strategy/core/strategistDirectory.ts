/**
 * strategistDirectory — 「策略總監」人選從 mos_db 的 agents 表真實取得。
 *
 * 2026-09-23（CJ「品牌頁面的右下方，品牌策略總監的三個人選」＋前一輪
 * 「agent的背景，要詳細列出來它的設定和經歷，要直接從mos_db抓取真實描述」）：
 *
 * 上一輪的 client/src/v2/strategy/lib/strategistPersonas.ts 把兩位人設寫死成
 * 佔位資料（isPlaceholder: true），理由寫的是「mos_db 沒有金鑰查不到」。那個
 * 判斷是錯的——mos_db 就是這個 app 自己的 MySQL（agents/skills 表走 localPool，
 * 見 platform/core/mosCatalog.ts 的檔頭），MOS_MANUS_API_KEY 只有「本機 stdio
 * MCP bridge 打外部 HTTP 端點」那條路才需要。server 這一側從來都查得到，所以
 * 這裡直接查真的。
 *
 * ── 三位是怎麼決定的 ────────────────────────────────────────────────
 * CJ 選的是「三位固定 +〈換更多人選〉可搜尋」，人選群用「產業品牌策略師群」
 * （mos_db 裡 `<角色>-<產業>-<語系>-<亂數>` 這批繁中 agent，有 bio_zh、有
 * 【工作經歷】【認證】、頭像是 dicebear）。
 *
 * 固定的是「三個角色（角度）」，不是三個 agent id——因為這批 agent 每一位都
 * 綁一個產業（美妝保養 / 電商 DTC / B2B 製造…）。如果連 id 都寫死，一個文具
 * 品牌會拿到「電商 / DTC 品牌策略師」，關聯性很差。所以：角色固定三個，每個
 * 角色在使用者自己品牌的產業裡找人，找不到才退回該角色的預設 id。兩條路拿到
 * 的都是 mos_db 的真實資料列，不是編的。
 *
 * 三個角度是照「資料上真的不同」挑的，不是照職稱好聽挑的——實測
 * growth_hacker 這個 cohort 的 specialty 欄位跟 brand_strategy 一字不差
 * （種子資料複製貼上），放進來會變成「換了名字但講一樣的話」，所以沒有用它：
 *   品牌定位   brand_strategy   定位 / 差異化 / 訊息架構 / ICP / Brand Voice
 *   定價與價值 pricing_strategy 競爭定價 / 心理定價 / 價格彈性 / 漲價溝通
 *   消費者行為 ux_researcher    用戶行為 / 漏斗 / A/B / CRO / 結帳流程
 *
 * ── 誠實顯示 ────────────────────────────────────────────────────────
 * experienceDetail / bio / specialty 一律原樣帶出來，不改寫、不美化——CJ 要的
 * 就是「mos_db 裡真實的描述」。但 mos_db 有一批 agent 的這些欄位存的是匯入
 * 失敗留下的樣板字串（例如「Details for X are not fully available... The map
 * task for her was incomplete」，實際存在於 id 211480）。那種字串顯示出來
 * 對使用者沒有意義、看起來也像壞掉，所以 sanitizeProse() 會把它濾成 null，
 * 讓 UI 直接不顯示該區塊——是「沒有這段資料」，不是「編一段補上」。
 */
import localPool from "../../localDb.js";

/** UI 要用到的欄位；跟 mosCatalog.ts 的 AGENT_PUBLIC_FIELDS 是同一批公開業務欄位的子集。 */
const DIRECTOR_FIELDS = [
  "id", "slug", "name", "name_zh", "englishName",
  "title", "title_zh", "englishTitle",
  "industry", "avatarUrl",
  "bio", "bio_zh", "bio_en", "experienceDetail",
  "specialty", "specialtySummary", "methodology",
].join(", ");

export interface StrategistDirector {
  agentId: number;
  slug: string;
  /** 顯示用姓名——優先繁中。 */
  name: string;
  /** 顯示用職稱——優先繁中。 */
  title: string;
  avatarUrl: string;
  /** 一句話介紹（mos_db 原文，繁中優先）。查不到就是 null。 */
  bio: string | null;
  /** 【工作經歷】【認證】這一段（mos_db 原文）。查不到就是 null。 */
  experience: string | null;
  /** 專長清單（mos_db 原文）。 */
  specialty: string | null;
  /** 方法論框架（mos_db 原文，這批 agent 多半沒有）。 */
  methodology: string | null;
  industry: string | null;
  /** 這位是用哪個角色的條件找到的。 */
  roleId: StrategistRoleId;
  roleLabel: string;
  roleLabelEn: string;
  /** 這個角色的「招牌問題」——換人時問題跟著換，見 STRATEGIST_ROLES。 */
  signatureQuestions: string[];
  signatureQuestionsEn: string[];
  /** true = 沒找到品牌產業對得上的人，用的是這個角色的預設人選。 */
  isFallback: boolean;
}

export type StrategistRoleId = "brand_positioning" | "pricing_value" | "consumer_behavior";

interface StrategistRole {
  id: StrategistRoleId;
  label: string;
  labelEn: string;
  /** mos_db slug 前綴——這個角色的 cohort。 */
  slugPrefix: string;
  /** 找不到品牌產業對得上的人時，用這一位（mos_db 真實 id，繁中、資料完整）。 */
  fallbackSlug: string;
  /** 寫進 system prompt 的角度指示——讓三位真的答得不一樣。 */
  promptAngle: string;
  /** 使用者不知道能問什麼時，面板上直接給的問題（CJ:「每位總監各自的招牌問題」）。 */
  signatureQuestions: string[];
  signatureQuestionsEn: string[];
}

/**
 * 固定三個角色。要換角色/換預設人選就改這裡——刻意集中在一個常數，
 * 不散落在各處（跟 project_per_brand_task_tray 那次「查表鏈手抄六處」的
 * 教訓同一個理由）。
 */
export const STRATEGIST_ROLES: StrategistRole[] = [
  {
    id: "brand_positioning",
    label: "品牌定位",
    labelEn: "Brand Positioning",
    slugPrefix: "brand_strategy-",
    fallbackSlug: "brand_strategy-ecom-tw-6352",
    promptAngle:
      "你看事情的角度是品牌定位：市場地圖、競品訊息矩陣、差異化、ICP 與 Persona、訊息架構、Brand Voice。"
      + "被問到定價或轉換率的問題，你也從「這個決定會怎麼影響品牌的定位與認知」切入，而不是硬答不是你專長的部分。",
    signatureQuestions: [
      "我的差異化夠強嗎？競品也講得出同一句話嗎？",
      "我的主受眾描述會不會太廣，該怎麼收窄？",
      "我的標語有沒有講到別人講不出來的事？",
    ],
    signatureQuestionsEn: [
      "Is my differentiation strong enough, or could a competitor claim it too?",
      "Is my primary audience too broad — how should I narrow it?",
      "Does my tagline say something only my brand can say?",
    ],
  },
  {
    id: "pricing_value",
    label: "定價與價值",
    labelEn: "Pricing & Value",
    slugPrefix: "pricing_strategy-",
    fallbackSlug: "pricing_strategy-ecom-tw-9298",
    promptAngle:
      "你看事情的角度是定價與價值感：競爭定價、心理定價（錨點、損失厭惡）、價格彈性、方案結構、漲價的溝通方式。"
      + "被問到定位或內容的問題，你從「這件事撐不撐得起現在的價格」切入。",
    signatureQuestions: [
      "我的價格撐得起我想要的品牌定位嗎？",
      "想漲價的話，該怎麼跟現有客人說？",
      "要不要做方案分層？分幾層比較合理？",
    ],
    signatureQuestionsEn: [
      "Does my price support the brand position I'm aiming for?",
      "If I raise prices, how do I tell existing customers?",
      "Should I tier my offer — and how many tiers make sense?",
    ],
  },
  {
    id: "consumer_behavior",
    label: "消費者行為",
    labelEn: "Consumer Behavior",
    slugPrefix: "ux_researcher-",
    fallbackSlug: "ux_researcher-martech-tw-4718",
    promptAngle:
      "你看事情的角度是消費者實際的行為：用戶旅程、漏斗哪一段在漏、A/B 測試怎麼設計、落地頁與結帳流程的轉換、"
      + "行為數據（GA4/Hotjar 那類）怎麼讀。被問到定位的問題，你從「這個說法在行為數據上看得出效果嗎」切入。",
    signatureQuestions: [
      "我的客人卡在哪一段流程沒買單？",
      "這個改動值得做 A/B 測試嗎？怎麼設計？",
      "怎麼知道我的訊息有沒有真的被看懂？",
    ],
    signatureQuestionsEn: [
      "Where in the journey are people dropping off?",
      "Is this change worth A/B testing — and how would I design it?",
      "How do I know whether my message actually lands?",
    ],
  },
];

export function getRole(roleId: string | null | undefined): StrategistRole {
  return STRATEGIST_ROLES.find((r) => r.id === roleId) ?? STRATEGIST_ROLES[0]!;
}

/**
 * mos_db 有一批 agent 的文字欄位存的是匯入失敗留下的樣板句（「Details ...
 * not fully available」「The map task ... was incomplete」），也有零星殘留的
 * markdown 反引號。這些顯示出來只會像壞掉，所以濾掉整段——寧可少顯示一個
 * 區塊，也不要顯示一段沒有意義的字。
 */
export function sanitizeProse(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/`/g, "").trim();
  if (cleaned.length < 8) return null;
  if (/not (fully |explicitly )?available|was incomplete|no data available/i.test(cleaned)) {
    // 整段都是樣板句才丟；只是夾了一句的話，把那幾行挑掉、其餘留著。
    const kept = cleaned
      .split("\n")
      .filter((line) => !/not (fully |explicitly )?available|was incomplete|no data available/i.test(line))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    // 只剩區塊標題（【代表案例】之類）就等於沒東西。
    return kept.replace(/【[^】]*】/g, "").trim().length < 8 ? null : kept;
  }
  return cleaned;
}

function toDirector(row: any, role: StrategistRole, isFallback: boolean): StrategistDirector {
  return {
    agentId: Number(row.id),
    slug: String(row.slug ?? ""),
    name: String(row.name_zh || row.name || row.englishName || "策略總監"),
    title: String(row.title_zh || row.title || row.englishTitle || role.label),
    avatarUrl: String(row.avatarUrl ?? ""),
    bio: sanitizeProse(row.bio_zh) ?? sanitizeProse(row.bio) ?? sanitizeProse(row.bio_en),
    experience: sanitizeProse(row.experienceDetail),
    specialty: sanitizeProse(row.specialty) ?? sanitizeProse(row.specialtySummary),
    methodology: sanitizeProse(row.methodology),
    industry: typeof row.industry === "string" ? row.industry : null,
    roleId: role.id,
    roleLabel: role.label,
    roleLabelEn: role.labelEn,
    signatureQuestions: role.signatureQuestions,
    signatureQuestionsEn: role.signatureQuestionsEn,
    isFallback,
  };
}

const AVAILABLE = "reviewStatus = 'approved' AND isAvailable = 1";

/**
 * 找這個角色在「使用者品牌的產業」裡的人。品牌的 industry 是自由文字
 * （沒有固定選項清單），所以不另外維護一張關鍵字對照表——直接拿這串文字
 * 去 LIKE 比 agent 的職稱/專長，因為這批 agent 的職稱本來就寫著產業名
 * （「品牌策略師｜電商 / DTC」）。對不上就回 null，由呼叫端退回預設人選。
 */
async function findByIndustry(role: StrategistRole, industry: string | null): Promise<any | null> {
  const q = (industry ?? "").trim();
  if (q.length < 2) return null;
  const like = `%${q}%`;
  const [rows]: any = await localPool.execute(
    `SELECT ${DIRECTOR_FIELDS} FROM agents
      WHERE ${AVAILABLE}
        AND slug LIKE ?
        AND slug LIKE '%-tw-%'
        AND (title_zh LIKE ? OR title LIKE ? OR specialty LIKE ?)
      ORDER BY CHAR_LENGTH(COALESCE(experienceDetail, '')) DESC, id ASC
      LIMIT 1`,
    [`${role.slugPrefix}%`, like, like, like],
  );
  return (rows as any[])[0] ?? null;
}

async function findBySlug(slug: string): Promise<any | null> {
  const [rows]: any = await localPool.execute(
    `SELECT ${DIRECTOR_FIELDS} FROM agents WHERE slug = ? AND ${AVAILABLE} LIMIT 1`, [slug],
  );
  return (rows as any[])[0] ?? null;
}

export async function findAgentById(agentId: number): Promise<any | null> {
  const [rows]: any = await localPool.execute(
    `SELECT ${DIRECTOR_FIELDS} FROM agents WHERE id = ? AND ${AVAILABLE} LIMIT 1`, [agentId],
  );
  return (rows as any[])[0] ?? null;
}

/**
 * 這個品牌的三位策略總監。一定回三位（每個角色一位）；某個角色連預設人選
 * 都查不到（mos_db 資料被改動過）就跳過那一位，不塞假的頂替。
 */
export async function listDirectorsForBrand(industry: string | null): Promise<StrategistDirector[]> {
  const out: StrategistDirector[] = [];
  for (const role of STRATEGIST_ROLES) {
    const matched = await findByIndustry(role, industry);
    if (matched) { out.push(toDirector(matched, role, false)); continue; }
    const fallback = await findBySlug(role.fallbackSlug);
    if (fallback) out.push(toDirector(fallback, role, true));
  }
  return out;
}

/** 已經選好的那一位（換人之後重新載入用）。認不得的 id 回 null，呼叫端自己退回預設。 */
export async function getDirectorByAgentId(
  agentId: number, industry: string | null,
): Promise<StrategistDirector | null> {
  const row = await findAgentById(agentId);
  if (!row) return null;
  const slug = String(row.slug ?? "");
  const role = STRATEGIST_ROLES.find((r) => slug.startsWith(r.slugPrefix)) ?? STRATEGIST_ROLES[0]!;
  // 從「換更多人選」搜來的人不屬於這三個角色的 cohort，roleId 會落在
  // 第一個角色上——這只影響 promptAngle 用哪一段，不影響顯示的真實資料。
  const matchedIndustry = (industry ?? "").trim();
  const isFallback = matchedIndustry.length >= 2
    && !`${row.title_zh ?? ""}${row.title ?? ""}${row.specialty ?? ""}`.includes(matchedIndustry);
  return toDirector(row, role, isFallback);
}

/**
 * 「換更多人選」：在 strategy 層的 agent 裡搜。刻意限制在 layer='strategy'
 * ——這個入口找的是策略總監，不是所有 16,000 位 agent。
 */
export async function searchDirectors(search: string, limit = 12): Promise<StrategistDirector[]> {
  const q = search.trim();
  if (q.length < 1) return [];
  const safe = Math.max(1, Math.min(30, Math.floor(limit)));
  const like = `%${q}%`;
  const [rows]: any = await localPool.execute(
    `SELECT ${DIRECTOR_FIELDS} FROM agents
      WHERE ${AVAILABLE}
        AND layer = 'strategy'
        AND (name_zh LIKE ? OR name LIKE ? OR title_zh LIKE ? OR title LIKE ? OR specialty LIKE ?)
      ORDER BY (slug LIKE '%-tw-%') DESC, CHAR_LENGTH(COALESCE(experienceDetail, '')) DESC, id ASC
      LIMIT ${safe}`,
    [like, like, like, like, like],
  );
  return (rows as any[]).map((row) => {
    const slug = String(row.slug ?? "");
    const role = STRATEGIST_ROLES.find((r) => slug.startsWith(r.slugPrefix)) ?? STRATEGIST_ROLES[0]!;
    return toDirector(row, role, false);
  });
}
