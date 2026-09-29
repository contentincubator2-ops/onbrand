/**
 * inspirationStage — 「靈感舞台」：主體（品牌／產品／活動）固定，請幾位 agent 各用自己的
 * 思考方式想切角；用戶挑一個採用，才寫全文、生圖，並排進本週企劃。取代七日發布台的入口。
 *
 * 2026-09-29（CJ「七日發布台改成靈感舞台……每個 agent 都有他的思考邏輯。如果採用，再進一步
 * 編輯修改生圖，變成本週企劃當中的內容」→「讓用戶選要哪些 agent 幫忙想」→ 定案：預設陣容＋
 * 事後調整，不做成必經步驟）。
 *
 * 設計取捨：
 *   · 切角卡只放「切角名稱／開場第一句／為什麼這樣切」。人比得出五個標題，比不了五篇全文；
 *     沒被採用的切角也不必花錢寫全文、生圖。
 *   · 多樣性不靠運氣：每位 thinker 綁一種寫死的思考框架＋一個一定要先回答的問題（THINKERS），
 *     一輪只打一次模型、所有人的框架放在同一份提示詞裡（原因見 ideationSystemPrompt）。
 *   · 採用＝新增一格 planned_slots（status planned），接著走既有任務卡流程寫全文——
 *     改稿、換人重寫、生圖、存回本週企劃都沿用，不另做一套。
 *   · 陣容偏好存在 inspiration_prefs：換掉的人不再排進預設，常被採用的人排前面。
 */
import localPool from "../../localDb";

export const INSPIRATION_PREFS_DDL = `
  CREATE TABLE IF NOT EXISTS inspiration_prefs (
    brandId     INT          NOT NULL PRIMARY KEY,
    lineup      JSON         NULL,
    stats       JSON         NULL,
    updatedAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export type ThinkerKey =
  | "story" | "direct" | "contrarian" | "insight"
  | "customer" | "founder" | "timing" | "detail";

export interface Thinker {
  key: ThinkerKey;
  /** mos_db agents.id——顯示名稱與頭像從資料庫讀，查不到就用 fallbackName。 */
  agentId: number;
  fallbackName: string;
  /** 卡片上的派別名（6 字內）。 */
  school: string; schoolEn: string;
  /** 一句話說這一派怎麼想（卡片副標）。 */
  pitch: string; pitchEn: string;
  /** 這一派一定要先回答的問題——答案就是切角的錨，逼不同派別想出不同的東西。 */
  question: string;
  /** 給模型的思考框架：先問什麼、怎麼切、什麼不做。 */
  framework: string;
}

export const THINKERS: Thinker[] = [
  {
    key: "story", agentId: 180006, fallbackName: "Grace Wu",
    school: "情境故事派", schoolEn: "Story",
    pitch: "先找一個受眾的日常片刻，再讓主角走進去", pitchEn: "Starts from one everyday moment",
    question: "受眾在哪一個具體片刻（時間＋地點＋正在做的事）會需要它？",
    framework: "你先問：受眾在什麼時間、什麼地點、做什麼事的時候，會需要這個主體？找到一個具體片刻（有時間、有動作），切角就是那個片刻。你不從產品規格開始，也不用「你有沒有遇過」這種泛問句。",
  },
  {
    key: "direct", agentId: 180162, fallbackName: "Jason Peng",
    school: "購買理由派", schoolEn: "Reason to buy",
    pitch: "只問一件事：為什麼是現在、為什麼是這個", pitchEn: "Why this, why now",
    question: "已經在考慮的人，還差哪一個理由就會下單？",
    framework: "你先問：已經在考慮的人，還差哪一個理由就會下單？切角就是那個理由（價格、組合、到貨、限量、比較後的差異）——但只能用品牌資料裡真的有的條件，沒有優惠就不要編優惠，改用「比較後的差異」切。",
  },
  {
    key: "contrarian", agentId: 180159, fallbackName: "Claire Hsu",
    school: "反差網感派", schoolEn: "Contrarian",
    pitch: "找大家以為對、其實不對的那件事", pitchEn: "Breaks a common assumption",
    question: "這個品類大家普遍相信、但其實不完全對的是哪一件事？",
    framework: "你先問：這個品類大家普遍相信什麼？哪一個常見說法其實不完全對、或這個主體剛好反過來？切角是一個讓人想停下來看的反差或自嘲，語氣可以好笑，但反差背後的事實要站得住。",
  },
  {
    key: "insight", agentId: 30002, fallbackName: "Sarah Liu",
    school: "專業洞察派", schoolEn: "Expert insight",
    pitch: "給一個內行人才知道的判斷方法", pitchEn: "Teaches an insider's rule of thumb",
    question: "買或用這類東西，外行人最常看錯的是哪裡？",
    framework: "你先問：買這類東西，外行人最常看錯哪裡？切角是一個可以帶走的判斷方法或知識（怎麼挑、怎麼看、怎麼用），主體是示範而不是主角。不編數據，沒有數據就用定性描述。",
  },
  {
    key: "customer", agentId: 222856, fallbackName: "朱怡君",
    school: "顧客視角派", schoolEn: "Customer voice",
    pitch: "讓用過的人當主角，品牌退到後面", pitchEn: "Puts the customer up front",
    question: "用過的人會怎麼跟朋友講它？",
    framework: "你先問：用過的人會怎麼跟朋友講這個主體？切角以顧客為主角（使用情境、送禮、分享、提問）。品牌資料裡沒有真實評價就不要編顧客說過的話，改成「邀請大家分享」或「最常被問的問題」。",
  },
  {
    key: "founder", agentId: 220510, fallbackName: "柯品瑜",
    school: "幕後人設派", schoolEn: "Behind the scenes",
    pitch: "讓做這件事的人出來說話", pitchEn: "Lets the maker speak",
    question: "有什麼選擇、堅持或麻煩，是只有做的人才知道的？",
    framework: "你先問：這個主體背後有什麼選擇、堅持或麻煩，是只有做的人才知道的？切角是老闆或團隊的第一人稱幕後（選料、試做、被退件、為什麼不做另一種）。原生、不精緻，但不能編品牌資料裡沒有的經歷。",
  },
  {
    key: "timing", agentId: 222378, fallbackName: "侯沐陽",
    school: "時機檔期派", schoolEn: "Timing",
    pitch: "先看日曆，再決定這週該說什麼", pitchEn: "Starts from the calendar",
    question: "這週哪一個時間點，讓它特別值得被提起？",
    framework: "你先問：這一週有什麼時間點（節日、季節、天氣、發薪日、開學、活動檔期、用戶給的由頭）讓這個主體特別適合被提起？切角要綁在那個時間點上，並寫出確切日期；沒有合適的時間點就綁季節或生活節奏，不要硬湊節日。",
  },
  {
    key: "detail", agentId: 222311, fallbackName: "Ming-Han Zhou",
    school: "單一細節派", schoolEn: "One detail",
    pitch: "整篇只講一個細節，講到透", pitchEn: "One detail, fully explained",
    question: "它最小、最容易被忽略、但最能證明用心的細節是什麼？",
    framework: "你先問：這個主體最小、最容易被忽略、但最能證明用心的一個細節是什麼（一個材質、一道工序、一個設計、一句條款）？切角就只講這一個細節，其他全部不提。細節必須來自品牌資料。",
  },
];

export const THINKER_KEYS = THINKERS.map((t) => t.key);
export const DEFAULT_LINEUP: ThinkerKey[] = ["story", "direct", "contrarian", "insight", "customer"];
export const LINEUP_SIZE = 5;

export function isThinkerKey(s: unknown): s is ThinkerKey {
  return typeof s === "string" && (THINKER_KEYS as string[]).includes(s);
}
export function thinkerOf(key: ThinkerKey): Thinker {
  return THINKERS.find((t) => t.key === key)!;
}

// ─── 陣容偏好 ────────────────────────────────────────────────────────

export interface ThinkerStats { adopted: number; dropped: number }
export type StatsMap = Partial<Record<ThinkerKey, ThinkerStats>>;

const parseJson = (v: unknown): any => {
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } }
  return v ?? null;
};

/** 存過的陣容去掉無效 key、補滿到 5 位；沒存過用預設。補位時常被採用、沒被換掉的排前面。 */
export function resolveLineup(saved: unknown, stats: StatsMap): ThinkerKey[] {
  const out: ThinkerKey[] = [];
  for (const k of Array.isArray(saved) ? saved : []) {
    if (isThinkerKey(k) && !out.includes(k)) out.push(k);
    if (out.length >= LINEUP_SIZE) return out;
  }
  if (out.length === 0) out.push(...DEFAULT_LINEUP);
  const score = (k: ThinkerKey) => (stats[k]?.adopted ?? 0) - 2 * (stats[k]?.dropped ?? 0);
  const rest = THINKER_KEYS.filter((k) => !out.includes(k))
    .sort((a, b) => score(b) - score(a) || THINKER_KEYS.indexOf(a) - THINKER_KEYS.indexOf(b));
  while (out.length < LINEUP_SIZE && rest.length) out.push(rest.shift()!);
  return out.slice(0, LINEUP_SIZE);
}

export async function loadPrefs(brandId: number): Promise<{ lineup: ThinkerKey[]; stats: StatsMap }> {
  let saved: unknown = null; let stats: StatsMap = {};
  try {
    const [rows]: any = await localPool.execute(`SELECT lineup, stats FROM inspiration_prefs WHERE brandId = ? LIMIT 1`, [brandId]);
    const r = (rows as any[])[0];
    if (r) { saved = parseJson(r.lineup); stats = (parseJson(r.stats) ?? {}) as StatsMap; }
  } catch { /* 表還沒建：用預設 */ }
  return { lineup: resolveLineup(saved, stats), stats };
}

export async function savePrefs(brandId: number, lineup: ThinkerKey[], stats: StatsMap): Promise<void> {
  await localPool.execute(
    `INSERT INTO inspiration_prefs (brandId, lineup, stats) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE lineup = VALUES(lineup), stats = VALUES(stats)`,
    [brandId, JSON.stringify(lineup), JSON.stringify(stats)],
  );
}

export function bump(stats: StatsMap, key: ThinkerKey, field: keyof ThinkerStats): StatsMap {
  const cur = stats[key] ?? { adopted: 0, dropped: 0 };
  return { ...stats, [key]: { ...cur, [field]: cur[field] + 1 } };
}

// ─── 顯示資料 ────────────────────────────────────────────────────────

export interface ThinkerCard {
  key: ThinkerKey; agentId: number; name: string; title: string; avatarUrl: string;
  school: string; schoolEn: string; pitch: string; pitchEn: string;
}

export async function loadThinkerCards(): Promise<ThinkerCard[]> {
  const byId = new Map<number, any>();
  try {
    const ids = THINKERS.map((t) => t.agentId);
    const [rows]: any = await localPool.execute(
      `SELECT id, name, name_zh, englishName, title, title_zh, avatarUrl FROM agents WHERE id IN (${ids.map(() => "?").join(",")})`, ids,
    );
    for (const r of rows as any[]) byId.set(Number(r.id), r);
  } catch { /* 查不到就用預設名稱 */ }
  return THINKERS.map((t) => {
    const r = byId.get(t.agentId);
    return {
      key: t.key, agentId: t.agentId,
      name: String(r?.name_zh || r?.name || r?.englishName || t.fallbackName),
      title: String(r?.title_zh || r?.title || ""),
      avatarUrl: String(r?.avatarUrl ?? ""),
      school: t.school, schoolEn: t.schoolEn, pitch: t.pitch, pitchEn: t.pitchEn,
    };
  });
}

// ─── 提示詞與解析 ────────────────────────────────────────────────────

export interface Angle {
  /** 那一派問題的答案——切角的錨。採用時寫進格子的 reason，寫手看得到這篇的判斷依據。 */
  answer: string;
  title: string;
  hook: string;
  why: string;
  platform: string;
  format: string;
}

export const FORMATS_ZH = ["貼文", "輪播", "Reels", "限時動態"];

/**
 * 一輪只打一次模型：陣容裡每一位的思考框架都放進同一份提示詞，讓模型看得到別人想了什麼。
 * 2026-09-29 實測：五位各自平行呼叫、再比字元重疊度，結果五個切角全在講用戶給的由頭
 * （「中秋剛過來杯冷泡」），而字元重疊度算出 0.00——換句話說就騙過檢查。所以改成同一次呼叫
 * ＋每位先用一句話回答自己那一派的問題（answer），再從答案長出切角。
 */
export function ideationSystemPrompt(args: {
  thinkers: Array<{ thinker: Thinker; name: string }>;
  brandName: string; subjectLine: string; brandCtx: string;
  occasion?: string; platforms: string[]; count: number;
  outputLanguage: string; avoid?: string[]; direction?: string;
}): string {
  const lang = args.outputLanguage || "zh-TW";
  const solo = args.thinkers.length === 1;
  const roster = args.thinkers.map(({ thinker: t, name }) =>
    `■ ${t.key}｜${name}｜${t.school}\n  先回答：${t.question}\n  思考方式：${t.framework}`).join("\n");
  const hasTiming = args.thinkers.some((x) => x.thinker.key === "timing");
  return [
    `你要替「${args.brandName}」想社群貼文的切角——只想切角，不寫全文。`,
    solo
      ? `這次只有一位在想，照他的思考方式想 ${args.count} 個不同的切角。`
        + `每個切角的 answer 都要是那個問題的另一個答案——同一個答案換句話說不算（2026-09-29 實測：「你醃掉的是最香的部分」被改寫成「你醃掉的是最貴的部分」又交回來）：`
      : `下面每一位用自己的思考方式各想 ${args.count} 個切角：`,
    roster,
    ``,
    `【這次固定講的主體】${args.subjectLine}——每個切角都必須在講這個主體，不能換題目。`,
    args.occasion
      ? `【這週的由頭（用戶給的素材）】${args.occasion}\n`
        + (hasTiming
          ? `由頭是素材不是題目：只有 timing 一定要用它；其他人只有在它剛好符合自己那一派的問題時才用，而且不能拿它當開場。`
          : `由頭是素材不是題目：只有在它剛好符合某一派的問題時才用，而且不能每個切角都用。`)
      : "",
    `【可以放的通路】${args.platforms.join("、")}`,
    args.direction ? `【用戶希望往這個方向再想】${args.direction}` : "",
    args.avoid?.length ? `【畫面上已經有的切角——不要重複，也不要換句話說；新切角的 answer 必須跟這些切角背後的答案不同】\n${args.avoid.map((a) => `- ${a}`).join("\n")}` : "",
    args.brandCtx ? `【品牌資料】\n${args.brandCtx.slice(0, 6000)}` : "",
    ``,
    `做法：`,
    `1. answer：先用一句話回答那一派的問題（25 字內），答案要具體到只屬於這個主體，不能是「天氣轉涼」「品質很好」這種誰都能說的話。`,
    `2. 從 answer 長出切角。title：切角名稱，20 字內，說清楚這篇講什麼（不是口號）；hook：貼文第一句，40 字內，可以直接用；why：用那一派的邏輯說為什麼這樣切，60 字內。`,
    `3. 寫完自己檢查：任兩個切角如果拿掉人名後可以互換、或是講同一件事，就重想其中一個。`,
    `4. platform 從可以放的通路挑最適合的一個；format 是 ${FORMATS_ZH.join("、")} 其中一個。`,
    `- 產品名稱、價格、產地、成分、活動日期照品牌資料寫，資料沒有的不要編；不要編顧客說過的話、評價或數字。`,
    `- answer、title、hook、why 用 ${lang} 寫。`,
    `只輸出 JSON，不要前言：{"angles":[{"thinker":"${args.thinkers[0]?.thinker.key ?? "story"}","answer":"…","title":"…","hook":"…","why":"…","platform":"…","format":"…"}]}`,
  ].filter(Boolean).join("\n");
}

const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
/** 開場句卡片會自己加「」；模型常自己也包一層，變成「「…」」。只拿掉包住整句的那一對。 */
export function unquote(s: string): string {
  const pairs: Array<[string, string]> = [["「", "」"], ["『", "』"], ["“", "”"], ['"', '"']];
  for (const [o, c] of pairs) {
    if (s.startsWith(o) && s.endsWith(c) && s.length > 2 && !s.slice(1, -1).includes(o)) return s.slice(1, -1).trim();
  }
  return s;
}

/**
 * 模型回覆 → 每位的切角；只收要求的 thinker，每位最多 perThinker 個。通路不在清單就換成
 * 第一個，形式不在清單就當「貼文」。只有一位時容許模型漏寫 thinker。解析不了回空陣列。
 */
export function parseAngles(raw: string, args: { keys: ThinkerKey[]; platforms: string[]; perThinker: number }): Array<Angle & { thinker: ThinkerKey }> {
  const cleaned = String(raw ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let obj: any = null;
  try { obj = JSON.parse(cleaned); } catch {
    const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}");
    if (s >= 0 && e > s) { try { obj = JSON.parse(cleaned.slice(s, e + 1)); } catch { obj = null; } }
  }
  const list: any[] = Array.isArray(obj?.angles) ? obj.angles : Array.isArray(obj) ? obj : [];
  const out: Array<Angle & { thinker: ThinkerKey }> = [];
  const per = new Map<ThinkerKey, number>();
  for (const a of list) {
    const raw = String(a?.thinker ?? "").trim();
    const key = (args.keys as string[]).includes(raw) ? (raw as ThinkerKey) : args.keys.length === 1 ? args.keys[0]! : null;
    if (!key || (per.get(key) ?? 0) >= args.perThinker) continue;
    const title = clip(a?.title, 40);
    const hook = unquote(clip(a?.hook, 80));
    if (title.length < 2 || hook.length < 2) continue;
    const p = String(a?.platform ?? "").toLowerCase();
    const f = clip(a?.format, 12);
    out.push({
      thinker: key, answer: clip(a?.answer, 60), title, hook, why: clip(a?.why, 120),
      platform: args.platforms.includes(p) ? p : (args.platforms[0] ?? "facebook"),
      format: FORMATS_ZH.includes(f) ? f : "貼文",
    });
    per.set(key, (per.get(key) ?? 0) + 1);
  }
  // 依陣容順序排，同一位的放在一起。
  return out.sort((x, y) => args.keys.indexOf(x.thinker) - args.keys.indexOf(y.thinker));
}

/**
 * 串流中的半截 JSON → 已經寫完整的那幾個切角物件（原文字串）。邊想邊顯示用：模型一寫完
 * 一張卡的 `}` 就能先交出去，不必等整段 JSON 收尾。字串裡的括號與跳脫字元不算。
 */
export function completedAngleObjects(buf: string): string[] {
  const start = buf.indexOf("[", Math.max(0, buf.indexOf('"angles"')));
  if (start < 0) return [];
  const out: string[] = [];
  let depth = 0, inStr = false, esc = false, objStart = -1;
  for (let i = start + 1; i < buf.length; i++) {
    const ch = buf[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") { if (depth === 0) objStart = i; depth++; }
    else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart >= 0) { out.push(buf.slice(objStart, i + 1)); objStart = -1; }
      if (depth < 0) break;
    } else if (ch === "]" && depth === 0) break;
  }
  return out;
}

/**
 * 採用後寫進本週企劃格子的題目。任務卡會把它預填成主要輸入，所以要讓寫手一眼看懂
 * 切角與開場；planned_slots.topic 是 VARCHAR(200)。
 */
export function slotTopic(a: Pick<Angle, "title" | "hook">): string {
  const s = `${a.title}｜開場：${a.hook}`;
  return s.length <= 200 ? s : s.slice(0, 199) + "…";
}

/** 依形式挑任務卡：卡名含形式關鍵字的優先，否則用該通路第一張。 */
export function pickCardForFormat(
  platform: string, format: string, cards: Array<{ id: string; platform: string; labelZh: string }>,
): { id: string; labelZh: string } | null {
  const own = cards.filter((c) => c.platform === platform);
  if (!own.length) return null;
  const kw: Record<string, RegExp> = {
    "輪播": /輪播|carousel/i, "Reels": /reels?|短影音|影片/i, "限時動態": /限時|stor(y|ies)/i, "貼文": /貼文|post/i,
  };
  const re = kw[format];
  return (re && own.find((c) => re.test(c.labelZh) || re.test(c.id))) || own[0]!;
}
