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
  /** 從 slug 推出來的語系段（tw/cn/sea/en/my/sg/th…）。UI 用它誠實標示「這位的資料是哪個市場的」。 */
  locale: string | null;
  /**
   * 2026-09-24（CJ「服飾 → fallback、不動產 → 對不到…這各狀況要提共備用的人選」）：
   * 對不上產業時的備用人選。只有 primary 會帶，備用人選自己不再往下長。
   */
  alternatives: StrategistDirector[];
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

/** slug 的產業段：`brand_strategy-fashion-cn-7197` → "fashion"。 */
function industrySegmentOf(slug: string): string | null {
  const m = /^[a-z_]+-([a-z0-9_]+)-[a-z]+-/.exec(slug);
  return m ? m[1]! : null;
}

/** slug 的語系段：`brand_strategy-fashion-cn-7197` → "cn"。 */
function localeOf(slug: string): string | null {
  const m = /^[a-z_]+-[a-z0-9_]+-([a-z]+)-/.exec(slug);
  return m ? m[1]! : null;
}

function toDirector(
  row: any, role: StrategistRole, isFallback: boolean,
  alternatives: StrategistDirector[] = [],
): StrategistDirector {
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
    locale: localeOf(String(row.slug ?? "")),
    alternatives,
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
 * 品牌產業（自由文字）→ mos_db cohort 的產業代碼。
 *
 * 2026-09-23 第一版是「直接拿品牌的 industry 去 LIKE 比 agent 的職稱」，
 * 想法是這批 agent 職稱本來就寫著產業名，不必維護對照表。**在真實資料上
 * 幾乎全部落空**（op-probe-strategy-directors 實跑 dev 5 個品牌，5 個全部
 * fallback）。兩個原因：
 *   1. 品牌自己填的字跟 agent 職稱用詞不同：「服飾」vs「服裝時尚」、
 *      「冷凍即食料理 / 生鮮宅配電商」vs「食品飲料」。
 *   2. 有些 cohort 成員的 title_zh 根本沒寫產業（實測 brand_strategy 的
 *      beauty/food/pharma 那幾位職稱只寫「品牌策略師」）。
 * 所以改成兩段：先用這張表把中文產業詞對到 cohort 的產業代碼，再拿代碼去
 * 比 **slug**（slug 一定帶產業段，例如 brand_strategy-beauty-tw-8146），
 * 比職稱可靠得多。
 *
 * 表只有一份、只在這裡（memory 的教訓：同一件事兩個不同步的關鍵字比對器
 * 遲早會各自漂移）。沒對到就退回預設人選——cohort 沒有那個產業的人時
 * （例如服飾/時尚在 tw 這批沒有、不動產完全沒有）誠實 fallback，不硬塞
 * 一個不相干的產業顧問。
 * 關鍵字刻意由長到短比：「保健食品」要先於「食品」命中，否則保健品牌會被
 * 歸到食品飲料。
 */
const INDUSTRY_KEYWORDS: Array<[string, string[]]> = [
  ["health",     ["保健食品", "保健", "健康食品", "營養補充", "膠原", "益生菌", "supplement"]],
  ["medical",    ["醫療器材", "醫美", "醫療", "診所", "牙醫", "醫學", "clinic", "aesthetic"]],
  ["pharma",     ["製藥", "藥品", "藥廠", "處方", "pharma"]],
  ["beauty",     ["美妝", "保養", "彩妝", "護膚", "美容", "香氛", "beauty", "skincare", "cosmetic"]],
  ["food",       ["食品", "飲料", "餐飲", "冷凍", "生鮮", "料理", "烘焙", "食材", "咖啡", "茶飲", "餐廳", "food", "beverage", "restaurant"]],
  // fashion：三個 cohort 目前都沒有 -tw- 的人（實測 dev），所以對到也會
  // 落空、走 fallback。留著是為了將來補了人就自動生效，不是現在有效。
  ["fashion",    ["服飾", "服裝", "時尚", "鞋款", "配件", "apparel", "fashion"]],
  ["retail_o2o", ["實體零售", "門市", "零售", "百貨", "連鎖店", "o2o", "retail"]],
  ["ecom",       ["電商", "dtc", "d2c", "網購", "購物網", "網路商店", "ecommerce", "e-commerce", "shopify"]],
  ["b2b_saas",   ["b2b saas", "saas", "軟體服務", "雲端服務", "訂閱軟體"]],
  ["b2b_mfg",    ["製造", "工業", "代工", "oem", "odm", "零組件", "模具", "工廠", "manufacturing"]],
  ["education",  ["教育", "補習", "課程", "學習", "培訓", "edtech", "education"]],
  ["fintech",    ["金融科技", "金融", "保險", "支付", "銀行", "證券", "fintech"]],
  ["travel",     ["旅遊", "觀光", "飯店", "旅宿", "民宿", "旅行", "travel", "hotel", "hospitality"]],
  ["martech",    ["martech", "行銷科技", "廣告科技", "adtech"]],
  ["hr_tech",     ["人資", "招募", "人力資源", "hr tech", "hrtech"]],
];

export function industryCodeOf(industry: string | null | undefined): string | null {
  const raw = (industry ?? "").trim().toLowerCase();
  if (raw.length < 2) return null;
  for (const [code, words] of INDUSTRY_KEYWORDS) {
    for (const w of words) if (raw.includes(w)) return code;
  }
  return null;
}

/**
 * 找這個角色在「使用者品牌的產業」裡的人。兩條路都試：先用產業代碼比 slug
 * （主要路徑），再退一步用原字串比職稱/專長（品牌剛好填了跟職稱一樣的詞時
 * 會中，例如「美妝保養」）。都沒有就回 null，由呼叫端退回預設人選。
 * 一律限制 -tw-：這是繁中使用者看的人設，簡中／東南亞那批的敘述語言不同。
 */
async function findByIndustry(role: StrategistRole, industry: string | null): Promise<any | null> {
  const code = industryCodeOf(industry);
  if (code) {
    const [rows]: any = await localPool.execute(
      `SELECT ${DIRECTOR_FIELDS} FROM agents
        WHERE ${AVAILABLE}
          AND slug LIKE ?
        ORDER BY CHAR_LENGTH(COALESCE(experienceDetail, '')) DESC, id ASC
        LIMIT 1`,
      [`${role.slugPrefix}${code}-tw-%`],
    );
    const hit = (rows as any[])[0];
    if (hit) return hit;
  }
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

async function findAgentById(agentId: number): Promise<any | null> {
  const [rows]: any = await localPool.execute(
    `SELECT ${DIRECTOR_FIELDS} FROM agents WHERE id = ? AND ${AVAILABLE} LIMIT 1`, [agentId],
  );
  return (rows as any[])[0] ?? null;
}

/**
 * 同一個產業、但不是繁中的人選（cn / sea / en / my / sg / th…）。
 *
 * 2026-09-24（CJ「服飾 → fallback、不動產 → 對不到…這各狀況要提共備用的人選」）：
 * 實測「服飾」在 tw 這批確實沒有人，但 cn/sea/en 有 6 位真的做服飾的（而且 bio
 * 是中文）。與其丟一位電商顧問給服飾品牌、還不給第二個選擇，不如把這些人當
 * 備用列出來，語系標清楚讓使用者自己決定——「同產業但別的市場」通常比
 * 「同市場但別的產業」有用。
 */
async function findSameIndustryOtherLocale(
  role: StrategistRole, code: string, limit: number,
): Promise<any[]> {
  const safe = Math.max(1, Math.min(5, Math.floor(limit)));
  const [rows]: any = await localPool.execute(
    `SELECT ${DIRECTOR_FIELDS} FROM agents
      WHERE ${AVAILABLE}
        AND slug LIKE ?
        AND slug NOT LIKE ?
      ORDER BY CHAR_LENGTH(COALESCE(experienceDetail, '')) DESC, id ASC
      LIMIT ${safe}`,
    [`${role.slugPrefix}${code}-%`, `${role.slugPrefix}${code}-tw-%`],
  );
  return (rows as any[]) ?? [];
}

/**
 * 同角色、繁中、但別的產業的人選——給「產業完全對不到」的品牌用
 * （實測：不動產、文具在 cohort 裡根本沒有對應產業）。
 * 讓使用者自己挑一個最接近的，比我們替他猜一個誠實。
 */
async function findRoleOtherIndustryTw(
  role: StrategistRole, excludeSlug: string, limit: number,
): Promise<any[]> {
  const safe = Math.max(1, Math.min(5, Math.floor(limit)));
  const [rows]: any = await localPool.execute(
    `SELECT ${DIRECTOR_FIELDS} FROM agents
      WHERE ${AVAILABLE}
        AND slug LIKE ?
        AND slug LIKE '%-tw-%'
        AND slug <> ?
      ORDER BY CHAR_LENGTH(COALESCE(experienceDetail, '')) DESC, id ASC
      LIMIT ${safe * 6}`,
    [`${role.slugPrefix}%`, excludeSlug],
  );
  // 一個產業只留一位。這批 agent 每個產業有好幾位、彼此差異極小，照「經歷長度」
  // 排下來很容易三位都是同一個產業（實測不動產拿到兩位醫療器材/醫美）——那等於
  // 只給了兩個選擇。三位分屬不同產業，使用者才挑得到「最接近我的那個」。
  const seenIndustry = new Set<string>();
  const out: any[] = [];
  for (const r of (rows as any[]) ?? []) {
    const ind = industrySegmentOf(String(r.slug ?? ""));
    if (!ind || seenIndustry.has(ind)) continue;
    seenIndustry.add(ind);
    out.push(r);
    if (out.length >= safe) break;
  }
  return out;
}

/**
 * 這個品牌的三位策略總監。一定回三位（每個角色一位）；某個角色連預設人選
 * 都查不到（mos_db 資料被改動過）就跳過那一位，不塞假的頂替。
 *
 * 產業對不上時（isFallback）會附上備用人選，兩種來源依序取：
 *   1. 同產業、別的語系——「你的產業真的有人，只是不是繁中的」；
 *   2. 同角色、繁中、別的產業——連產業代碼都對不到時（不動產那種），讓使用者
 *      自己挑一個最接近的。
 * 對得上產業的那一位不附備用：他就是最好的答案，多給選項只是雜訊。
 */
export async function listDirectorsForBrand(industry: string | null): Promise<StrategistDirector[]> {
  const out: StrategistDirector[] = [];
  const code = industryCodeOf(industry);
  for (const role of STRATEGIST_ROLES) {
    const matched = await findByIndustry(role, industry);
    if (matched) { out.push(toDirector(matched, role, false)); continue; }

    const fallback = await findBySlug(role.fallbackSlug);
    if (!fallback) continue;

    const altRows: any[] = [];
    if (code) altRows.push(...await findSameIndustryOtherLocale(role, code, 3));
    if (altRows.length < 3) {
      const seen = new Set([String(fallback.slug), ...altRows.map((r) => String(r.slug))]);
      for (const r of await findRoleOtherIndustryTw(role, role.fallbackSlug, 5)) {
        if (altRows.length >= 3) break;
        if (seen.has(String(r.slug))) continue;
        altRows.push(r);
      }
    }
    const alternatives = altRows.map((r) => toDirector(r, role, true));
    out.push(toDirector(fallback, role, true, alternatives));
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
  //
  // isFallback 的判斷跟 findByIndustry 用同一個依據（產業代碼 vs slug 的
  // 產業段），否則「怎麼挑的」跟「UI 怎麼說明」會各講一套。使用者自己從
  // 搜尋挑的人不標 fallback——那是他主動選的，不是我們替他退而求其次。
  const code = industryCodeOf(industry);
  const isOneOfRoleCohort = slug.startsWith(role.slugPrefix);
  const isFallback = !!code && isOneOfRoleCohort && !slug.includes(`-${code}-`);
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
