/**
 * postFormatScout — 每月掃描各市場的熱門貼文，歸納出「還沒有卡的貼文形式」。
 *
 * 2026-08-23 (CJ「安排定期任務掃描當地熱門的 facebook 貼文，補充為 task」)
 *
 * ── 產品前提：形式即卡 ──────────────────────────────────────────────────
 * 每一種貼文形式都是一張獨立任務卡，不靠改寫 fb-99-trend-rewrite 之類的萬用卡
 * 來容納新形式 —— 卡片目錄本身就是產品價值，藏進 prompt 等於讓客戶看不見。
 *
 * 所以這支掃描器唯一要回答的問題是：
 *   「這個月各市場出現了哪些**現有 37 張卡沒有覆蓋**的貼文形式？」
 *
 * ── 形式 vs 題材（唯一的分流判準）─────────────────────────────────────
 *   形式 format ＝ 可重複的結構。下個月換題材還能照套。
 *                （步驟教學、成果快報、前後對比、幕後、UGC 轉貼…）
 *   題材 topic  ＝「這個月大家在講 XXX」。不可重複，換月就過期。
 *
 * 兩種都存，但只有 format 會進「該不該開新卡」的佇列；topic 是拿去餵既有的
 * fb-99-trend-rewrite / fb-99-viral-rewrite 當輸入素材。混在一起是這條流程
 * 最容易犯的錯 —— 把題材當形式開卡，一個月後那張卡就沒人用了。
 *
 * ── 為什麼沒有 Facebook collector ───────────────────────────────────────
 * Meta 2024-08 關閉 CrowdTangle，接手的 Content Library 僅開放學術單位；
 * Graph API 只給自己管理的粉專。（已於 2026-09-08 隨市場數據層移除的）scouts/orchestrator SCOUT_REGISTRY
 * 11 個 scout 沒有任何一個是 FB，opview / meltwater 是 browser_login 且
 * ToS-risk。所以這裡走 **web-grounded 搜尋**（invokeVertexGrounding，
 * 與 perplexityScout tier-1 同一條路），找的是公開報導與整理文章裡談到的
 * 高互動貼文與其結構。
 *
 * ── 絕不編造 ────────────────────────────────────────────────────────────
 * 沿用（已移除的）marketIntelRouter 的規矩：只回真實、可連結的發現，或誠實地回報沒有。
 *   · 沒有 grounding 憑證 → 整場掃描中止，**不 fallback 到無搜尋的 LLM**。
 *     知識模式的模型答得出東西，但那些 URL 是編的，比沒資料更糟。
 *   · 每個候選至少要有一條可連結的佐證，否則丟掉並計入 dropped。
 *   · dropped 一律回報，不靜默截斷。
 */

import { invokeVertexGrounding } from "../../platform/core/llm";
import { FB_30S_TASKS, labelZh, labelEn } from "./quickTaskFB";
import { FB_60S_TASKS_V2 } from "./quickTaskFB60";
import { ALL_99S_SQUADS } from "./quickTask100Squads";
import { ALL_99S_TASKS } from "./quickTask100";

// ─── 現有目錄快照（去重的基準）────────────────────────────────────────────

export interface CatalogEntry {
  id: string;
  zh: string;
  en: string | null;
  desc: string;
}

function textOf(v: unknown, key: "zh" | "en"): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && key in (v as any)) return String((v as any)[key] ?? "");
  return "";
}

/**
 * 目前線上的 FB 任務卡。掃描時整份丟給模型當「已覆蓋清單」，模型比對後回報
 * duplicateOf；回來的 id 還會在 parseScanResult 再驗一次是否真的存在
 * （模型會編任務 id，編出來的 id 若照單全收，會把真正的新形式誤殺）。
 */
export function buildFbCatalog(): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const t of [...FB_30S_TASKS, ...FB_60S_TASKS_V2]) {
    out.push({ id: t.id, zh: labelZh(t), en: labelEn(t), desc: textOf(t.description, "zh") });
  }
  for (const s of ALL_99S_SQUADS) {
    if (s.platform !== "facebook") continue;
    out.push({ id: s.id, zh: textOf(s.label, "zh"), en: textOf(s.label, "en"), desc: textOf(s.description, "zh") });
  }
  for (const t of ALL_99S_TASKS) {
    if (!t.id.startsWith("fb-")) continue;
    if (out.some((e) => e.id === t.id)) continue;
    out.push({ id: t.id, zh: textOf(t.label, "zh"), en: textOf(t.label, "en"), desc: textOf((t as any).description, "zh") });
  }
  return out;
}

// ─── 市場解析 ───────────────────────────────────────────────────────────────

export interface ScanMarket {
  /** ISO 3166-1 alpha-2，大寫 */
  country: string;
  /** BCP 47，例 zh-TW */
  language: string;
  brandCount: number;
}

/**
 * 只掃「真的有客戶」的市場 —— 2026-08-23 CJ 選的動態模式。固定清單會在你接了
 * 新市場時漏掉，也會為沒客戶的市場白燒 API。
 */
export async function resolveMarkets(): Promise<ScanMarket[]> {
  const { default: localPool } = await import("../../localDb");
  const [rows]: any = await localPool.execute(
    `SELECT UPPER(COALESCE(NULLIF(TRIM(targetCountry), ''), 'TW')) AS country,
            COALESCE(NULLIF(TRIM(outputLanguage), ''), 'zh-TW')    AS language,
            COUNT(*)                                               AS brandCount
       FROM brands
      GROUP BY 1, 2
      ORDER BY brandCount DESC`,
  );
  return (rows as any[]).map((r) => ({
    country: String(r.country),
    language: String(r.language),
    brandCount: Number(r.brandCount) || 0,
  }));
}

// ─── 候選 ───────────────────────────────────────────────────────────────────

export interface CandidateEvidence {
  title: string;
  url: string;
  /** 來源自己標的日期；拿不到就留空，不要猜 */
  observedAt?: string;
}

export type CandidateKind = "format" | "topic";

export interface FormatCandidate {
  platform: "facebook";
  market: string;
  language: string;
  kind: CandidateKind;
  /** 形式名稱（在地語言） */
  name: string;
  nameEn: string;
  /** 這個形式可重複的結構是什麼 —— 開卡時就是 prompt 骨架的起點 */
  mechanism: string;
  /** 為什麼零粉絲的品牌照做也有效 */
  whyItWorks: string;
  evidence: CandidateEvidence[];
  /** 對到現有卡就填 task id；null = 目錄裡沒有 */
  duplicateOf: string | null;
}

export type DropReason =
  | "no_evidence"
  | "bad_shape"
  | "unknown_kind"
  | "phantom_duplicate_id";

export interface ParseResult {
  candidates: FormatCandidate[];
  dropped: Array<{ reason: DropReason; name: string }>;
}

/** 去重鍵：同一個形式跨月、跨措辭都要收斂到同一列。 */
export function candidateKey(name: string, nameEn: string): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[\s　]+/g, "")
      .replace(/[·・:：\-—–_/／、,，.。!！?？()（）「」【】]/g, "");
  // 英文名優先 —— 中文措辭在不同市場語言下浮動較大（貼文/帖文/post）
  const base = norm(nameEn) || norm(name);
  return base.slice(0, 180);
}

// ─── Prompt ─────────────────────────────────────────────────────────────────

export function buildScanPrompt(
  market: ScanMarket,
  catalog: CatalogEntry[],
  opts?: { days?: number; limit?: number },
): { system: string; query: string } {
  const days = opts?.days ?? 45;
  const limit = opts?.limit ?? 8;

  const system = [
    "你是社群內容研究員。你的任務是找出某個市場最近在 Facebook 上高互動的貼文，",
    "並歸納出它們的「形式」——也就是可以重複套用的結構。",
    "",
    "【最重要的區分】",
    "format（形式）＝ 可重複的結構，換一個題材下個月還能照套。",
    "  例：步驟式教學、成果數據快報、前後對比、幕後花絮、UGC 轉貼、清單體。",
    "topic（題材）＝「這個月大家在討論 XXX」。換月就過期，不能重複。",
    "  例：某位藝人的爭議、某個節日、某條時事新聞。",
    "兩者都要回報，但 kind 欄位必須誠實標記。把題材標成形式是最嚴重的錯誤。",
    "",
    "【證據規則 — 不可違反】",
    "· 每一筆都必須附上至少一條真實、可連結的 URL。編造 URL 比不回答更糟。",
    "· 找不到足夠的公開資料，就回傳較少筆數，或空陣列。不要為了湊數而編。",
    "· observedAt 只填來源自己標示的日期；沒有就留空字串，不要推測。",
    "",
    "【零粉絲檢驗】",
    "只回報那些「沒有既有粉絲基礎的品牌照做也會有效」的形式。",
    "名人或大型媒體靠帳號本身流量成立的玩法（自拍配一句話、球隊戰報）不要回報。",
    "",
    "只輸出 JSON，不要任何說明文字：",
    '{"items":[{"kind":"format"|"topic","name":string,"nameEn":string,',
    '"mechanism":string(<=200字，這個形式的可重複結構),',
    '"whyItWorks":string(<=120字，零粉絲為何仍有效),',
    '"duplicateOf":string|null(對到下方已覆蓋清單就填該 task id),',
    '"evidence":[{"title":string,"url":string,"observedAt":"YYYY-MM-DD"|""}]}]}',
    `最多 ${limit} 筆。`,
  ].join("\n");

  const catalogLines = catalog
    .map((c) => `  ${c.id}｜${c.zh}${c.desc ? `｜${c.desc.slice(0, 60)}` : ""}`)
    .join("\n");

  const query = [
    `【市場】${market.country}（在地語言 ${market.language}）`,
    `【平台】Facebook`,
    `【時間範圍】最近 ${days} 天`,
    "",
    "請以在地語言搜尋這個市場最近高互動的 Facebook 貼文與相關的社群觀察整理，",
    "歸納它們用的貼文形式。",
    "",
    "【已覆蓋清單】以下是我們已經有卡的貼文形式。凡是結構上等同於其中任何一項的，",
    "duplicateOf 請填那張卡的 task id；只有結構上真的不同的才填 null：",
    catalogLines,
  ].join("\n");

  return { system, query };
}

// ─── 解析 ───────────────────────────────────────────────────────────────────

/** 取出最外層 JSON，忽略前後雜訊（與 perplexityScout 同做法）。 */
function extractJsonStr(raw: string): string {
  const s = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const first = s.search(/[{[]/);
  if (first === -1) return s;
  const open = s[first] as string;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = first; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close) {
      depth--;
      if (depth === 0) return s.slice(first, i + 1);
    }
  }
  return s.slice(first);
}

function cleanUrl(u: unknown): string | null {
  const s = String(u ?? "").trim();
  if (!/^https?:\/\/\S+$/i.test(s)) return null;
  return s;
}

/** 只收 YYYY-MM-DD；其餘（含模型愛編的「約兩週前」）一律丟掉不猜。 */
function cleanDate(d: unknown): string | undefined {
  const s = String(d ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

export function parseScanResult(
  raw: string,
  market: ScanMarket,
  catalog: CatalogEntry[],
): ParseResult {
  const catalogIds = new Set(catalog.map((c) => c.id));
  const candidates: FormatCandidate[] = [];
  const dropped: ParseResult["dropped"] = [];

  let items: any[] = [];
  try {
    const parsed = JSON.parse(extractJsonStr(raw));
    items = Array.isArray(parsed) ? parsed : (parsed?.items ?? []);
  } catch {
    return { candidates, dropped: [{ reason: "bad_shape", name: "(整份回應不是 JSON)" }] };
  }
  if (!Array.isArray(items)) {
    return { candidates, dropped: [{ reason: "bad_shape", name: "(items 不是陣列)" }] };
  }

  for (const it of items) {
    const name = String(it?.name ?? "").trim();
    if (!it || typeof it !== "object" || !name) {
      dropped.push({ reason: "bad_shape", name: name || "(無名稱)" });
      continue;
    }

    const kind = String(it.kind ?? "").trim();
    if (kind !== "format" && kind !== "topic") {
      dropped.push({ reason: "unknown_kind", name });
      continue;
    }

    const evidence: CandidateEvidence[] = [];
    for (const e of Array.isArray(it.evidence) ? it.evidence : []) {
      const url = cleanUrl(e?.url);
      if (!url) continue;
      evidence.push({
        title: String(e?.title ?? "").trim().slice(0, 300) || url,
        url,
        observedAt: cleanDate(e?.observedAt),
      });
    }
    if (evidence.length === 0) {
      // 沒有可連結的佐證就不是「發現」，是模型的印象。
      dropped.push({ reason: "no_evidence", name });
      continue;
    }

    // 模型會編任務 id。編出來的 id 若照單全收，真正的新形式會被誤判成重複而消失。
    let duplicateOf: string | null = null;
    const claimed = String(it.duplicateOf ?? "").trim();
    if (claimed && claimed.toLowerCase() !== "null") {
      if (catalogIds.has(claimed)) {
        duplicateOf = claimed;
      } else {
        dropped.push({ reason: "phantom_duplicate_id", name: `${name} → ${claimed}` });
        // 當成沒重複繼續收，讓人去判斷 —— 不因為一個假 id 就丟掉候選
      }
    }

    candidates.push({
      platform: "facebook",
      market: market.country,
      language: market.language,
      kind,
      name: name.slice(0, 200),
      nameEn: String(it.nameEn ?? "").trim().slice(0, 200),
      mechanism: String(it.mechanism ?? "").trim().slice(0, 1000),
      whyItWorks: String(it.whyItWorks ?? "").trim().slice(0, 600),
      evidence: evidence.slice(0, 6),
      duplicateOf,
    });
  }

  return { candidates, dropped };
}

// ─── 掃描 ───────────────────────────────────────────────────────────────────

export interface MarketScanResult {
  market: ScanMarket;
  candidates: FormatCandidate[];
  dropped: ParseResult["dropped"];
  error?: string;
}

/**
 * 掃一個市場。grounding 失敗就回 error —— 不 fallback 到無搜尋的 LLM，
 * 那條路只會產出編造的 URL。
 */
export async function scanOneMarket(
  market: ScanMarket,
  catalog: CatalogEntry[],
  opts?: { days?: number; limit?: number; timeoutMs?: number },
): Promise<MarketScanResult> {
  const { system, query } = buildScanPrompt(market, catalog, opts);
  const timeoutMs = opts?.timeoutMs ?? 90_000;

  try {
    const raw = await Promise.race([
      invokeVertexGrounding({ query, system, maxOutputTokens: 4096 }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`grounding timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    const { candidates, dropped } = parseScanResult(raw, market, catalog);
    return { market, candidates, dropped };
  } catch (e: any) {
    return {
      market,
      candidates: [],
      dropped: [],
      error: String(e?.message ?? e).slice(0, 300),
    };
  }
}
