/**
 * solutionProfile — 每個產品的 B2B 科技業欄位。
 *
 * 2026-09-23 (CJ)：技術與規格／價值與應用／營運與商務／合規與風險，四組共十一
 * 個欄位。與既有重複的就合併（適合對象、價格本來就有，不重做）。
 *
 * ── 最重要的一件事：不是每個欄位都能進貼文 ──────────────────────────
 * CJ 的清單裡有兩個欄位會直接撞到已經在跑的合規規則：
 *
 *   核心競爭優勢（USP）要求「跟主要競爭對手相比我們憑什麼贏」，而政策包的
 *   competitors 規則就是把貼文裡的競品比較拿掉。
 *
 *   產品藍圖（Roadmap）是未公開的未來功能——那正是緘默期在擋的東西。
 *
 * 所以每個欄位帶一個 `postSafe`。**業務要知道**這些事（談話時用得到），但
 * **貼文不能寫**。postSafe=false 的欄位只出現在後台與業務快查，永遠不會進
 * 寫作指令。這不是保守，是讓兩件本來就不同的事各自待在該待的地方。
 *
 * ROI 也是 false：那一欄天然會出現數字，而數字在這套系統裡只能來自有出處的
 * 市場數據白名單。要讓 ROI 進貼文，正確做法是把那個數字加進 hub_facts。
 *
 * ── 為什麼存成一個 JSON 欄位 ─────────────────────────────────────────
 * 十一個欄位 × 中英兩份 = 二十二個資料表欄位。而這份清單還會長（CJ 的第二三
 * 級還沒做）。JSON 一欄，鍵值就是 FIELD ids，跟 brands.positioning 同一種做法。
 */

export type ProfileGroup = "technical" | "value" | "commercial" | "compliance";

export interface ProfileField {
  key: string;
  group: ProfileGroup;
  label: [en: string, zh: string];
  /** 這一欄要回答什麼。也是 AI 補寫時的題目。 */
  ask: [en: string, zh: string];
  /**
   * 可不可以進貼文的寫作指令。
   * false 的理由一律寫在 whyNotPostSafe，不留「因為比較安全」這種說法。
   */
  postSafe: boolean;
  whyNotPostSafe?: [en: string, zh: string];
  rows?: number;
}

export const PROFILE_GROUPS: Array<{ id: ProfileGroup; label: [en: string, zh: string]; blurb: [en: string, zh: string] }> = [
  {
    id: "technical",
    label: ["Technical & specification", "技術與規格"],
    blurb: ["Builds credibility with a technical buyer.", "面對技術決策者建立信任。"],
  },
  {
    id: "value",
    label: ["Value & application", "價值與應用"],
    blurb: ["Turns the spec sheet into a business case.", "把規格轉成商業價值。"],
  },
  {
    id: "commercial",
    label: ["Operations & commercials", "營運與商務"],
    blurb: ["What it takes to actually ship and support it.", "真的要出貨與支援會碰到的事。"],
  },
  {
    id: "compliance",
    label: ["Compliance & risk", "合規與風險"],
    blurb: ["What enterprise and public-sector buyers ask first.", "中大型企業與公家機關第一個問的。"],
  },
];

export const PROFILE_FIELDS: ProfileField[] = [
  // ── 1. 技術與規格 ────────────────────────────────────────────────────
  {
    key: "specs",
    group: "technical",
    label: ["Core specs & performance", "核心規格與效能"],
    ask: [
      "Throughput, capacity, accuracy, power draw, yield — the numbers a technical buyer checks.",
      "運算速度、頻寬、容量、精準度、功耗、良率——技術決策者會核對的數字。",
    ],
    postSafe: true,
    rows: 4,
  },
  {
    key: "compatibility",
    group: "technical",
    label: ["Compatibility & ecosystem", "相容性與生態系"],
    ask: [
      "Which operating systems, software, interfaces or clouds it works with, and which industry standards it meets.",
      "支援哪些作業系統、軟體、硬體接口或雲端平台，符合哪些業界標準協定。",
    ],
    postSafe: true,
    rows: 3,
  },
  {
    key: "roadmap",
    group: "technical",
    label: ["Roadmap", "產品藍圖"],
    ask: [
      "Current version, and what lands in the next six months.",
      "目前版本，以及未來半年的更新計畫。",
    ],
    postSafe: false,
    whyNotPostSafe: [
      "Unannounced future features are exactly what a quiet period blocks. Reps may say this in a conversation; a public post may not.",
      "未公開的未來功能正是緘默期在擋的東西。業務談話時可以講，公開貼文不行。",
    ],
    rows: 3,
  },

  // ── 2. 價值與應用 ────────────────────────────────────────────────────
  {
    key: "useCases",
    group: "value",
    label: ["Use cases — the pain it removes", "痛點解決（應用場景）"],
    ask: [
      "Which situations it shines in, and what problem it takes off the customer's desk.",
      "在哪些場景最能發揮，替客戶解決了什麼問題。",
    ],
    postSafe: true,
    rows: 4,
  },
  {
    key: "usp",
    group: "value",
    label: ["Why we win", "核心競爭優勢"],
    ask: [
      "Against the alternatives a buyer is actually weighing — what makes this the answer?",
      "面對客戶真的在比較的其他選項，我們憑什麼贏？",
    ],
    postSafe: false,
    whyNotPostSafe: [
      "The policy pack strips competitor comparisons out of posts. This is what a rep says in the room, not what goes on LinkedIn.",
      "政策包會把貼文裡的競品比較拿掉。這是業務在會議室裡講的話，不是放上 LinkedIn 的內容。",
    ],
    rows: 4,
  },
  {
    key: "roi",
    group: "value",
    label: ["Return on investment", "投資報酬率"],
    ask: [
      "What it saves (headcount, power, time) or earns, and over what period.",
      "能省下多少成本（人力、電費、時間）或帶來多少營收，時間範圍是多久。",
    ],
    postSafe: false,
    whyNotPostSafe: [
      "Any figure in a post has to come from the sourced market-facts list. To publish an ROI number, add it there with its source.",
      "貼文裡的任何數字都必須來自有出處的市場數據白名單。要讓 ROI 數字上貼文，就把它連同出處加進那張表。",
    ],
    rows: 3,
  },

  // ── 3. 營運與商務 ────────────────────────────────────────────────────
  {
    key: "licensing",
    group: "commercial",
    label: ["Pricing & licensing model", "定價與授權模式"],
    ask: [
      "Perpetual, subscription or usage-based? Volume breaks? What a seat or unit actually covers.",
      "買斷、訂閱還是按用量計費？有沒有量大折扣？一個席次或一個單位到底包含什麼。",
    ],
    postSafe: true,
    rows: 3,
  },
  {
    key: "leadTime",
    group: "commercial",
    label: ["Lead time & capacity", "交期與產能"],
    ask: [
      "Current capacity, and how long from order to delivery.",
      "目前產能狀況，下單後多久能交貨。",
    ],
    postSafe: true,
    rows: 2,
  },
  {
    key: "sla",
    group: "commercial",
    label: ["Support & warranty (SLA)", "售後服務與保固"],
    ask: [
      "Hours of cover, response targets, on-site or remote, and what the warranty actually covers.",
      "服務時段、回應時間、到場還是遠端、保固涵蓋什麼。",
    ],
    postSafe: true,
    rows: 3,
  },

  // ── 4. 合規與風險 ────────────────────────────────────────────────────
  {
    key: "certifications",
    group: "compliance",
    label: ["Security & compliance certifications", "資安與合規認證"],
    ask: [
      "ISO 27001, SOC 2, AEC-Q100, medical clearances, GDPR — with the date each was issued or renewed.",
      "ISO 27001、SOC 2、車規 AEC-Q100、醫療認證、GDPR——連同取得或更新的日期。",
    ],
    postSafe: true,
    rows: 3,
  },
  {
    key: "ipIndemnity",
    group: "compliance",
    label: ["IP & indemnity", "專利與智財權"],
    ask: [
      "Infringement exposure, and whether the company indemnifies the customer.",
      "侵權風險，以及公司是否提供智財權保障。",
    ],
    postSafe: false,
    whyNotPostSafe: [
      "A public statement about indemnity is a contractual commitment. It belongs in the contract, not in a rep's post.",
      "公開談智財權保障等於做出合約承諾。那屬於合約，不屬於業務的貼文。",
    ],
    rows: 3,
  },
];

export const PROFILE_KEYS = PROFILE_FIELDS.map((f) => f.key);
export const POST_SAFE_KEYS = PROFILE_FIELDS.filter((f) => f.postSafe).map((f) => f.key);

export const profileField = (key: string) => PROFILE_FIELDS.find((f) => f.key === key) ?? null;

/** 一格的內容：中英各一份，加上它是實際刊登資料還是示範內容。 */
export interface ProfileEntry {
  en: string;
  zh: string;
  /** listing = 由該產品在 ExpertHub 的實際頁面整理；demo = 示範用，不是真的。 */
  source?: "listing" | "demo";
}

export type SolutionProfile = Record<string, ProfileEntry>;

/** 把任何形狀的 JSON 收斂成乾淨的 profile，壞掉的鍵值直接丟掉。 */
export function normaliseProfile(raw: any): SolutionProfile {
  const out: SolutionProfile = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of PROFILE_KEYS) {
    const v = raw[key];
    if (!v || typeof v !== "object") continue;
    const en = String(v.en ?? "").trim();
    const zh = String(v.zh ?? "").trim();
    if (!en && !zh) continue;
    const source = v.source === "listing" || v.source === "demo" ? v.source : undefined;
    out[key] = source ? { en, zh, source } : { en, zh };
  }
  return out;
}

/** 一行一筆的可讀形式，給 diff 與變更紀錄用。 */
export function profileToText(p: SolutionProfile): string {
  return PROFILE_KEYS.filter((k) => p[k])
    .map((k) => `${k}: ${p[k]!.en} / ${p[k]!.zh}`)
    .join("\n");
}

/**
 * 寫作指令要用的那幾段。只有 postSafe 的欄位，而且一定要走這支——
 * 直接把整個 profile 丟進 prompt，USP 與 roadmap 就會跟著上貼文。
 */
export function postSafeProfileLines(p: SolutionProfile, zh: boolean): string[] {
  const lines: string[] = [];
  for (const f of PROFILE_FIELDS) {
    if (!f.postSafe) continue;
    const e = p[f.key];
    const text = zh ? e?.zh : e?.en;
    if (!text) continue;
    lines.push(`- ${zh ? f.label[1] : f.label[0]}: ${text}`);
  }
  return lines;
}
