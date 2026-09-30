/**
 * 法規合規檢查（2026-09-30 CJ「要多加一道寫完後的合規檢查，也寫在任務卡上的顯示進度，
 * 表示有進行合規檢查」）。
 *
 * 寫手動筆前已經在 prompt 裡讀過法規（brandContext 的法規段）；這一關是寫完之後，
 * 只拿「用戶在策略層加的法規」逐條對照成稿：
 *   · 沒有違規 → compliant（原稿照交）
 *   · 有違規 → 最小幅度修正（只改違規的句子），修正稿過守門 → fixed
 *   · 修正稿過不了守門（長度、語言、連結）→ 保留原稿、標 flagged，成品頁提醒用戶自己改
 *   · LLM 失敗／逾時／沒時間 → skipped，不假裝檢查過
 * 品牌沒有啟用中的法規就整關不跑（不多花一次呼叫）。
 *
 * 跟品牌一致性檢查（brandConsistency.ts）分開：那一關看「像不像這個品牌」，這一關只看
 * 「有沒有違反用戶給的法規」——混在一起，模型會把法規當成風格偏好從寬處理。
 */
import { invokeLLM } from "../../platform/core/llm";
import { acceptRevision } from "./brandConsistency";
import { loadActiveRegulations, regulationLine, type BrandRegulation } from "../../strategy/core/brandRegulations";

export type RegulationComplianceStatus = "compliant" | "fixed" | "flagged" | "skipped";

export interface RegulationIssue {
  /** 違反哪一條（法規卡名稱）。 */
  regulation: string;
  /** 原稿裡違規的那句（原文節錄）。 */
  quote: string;
  /** 為什麼違規（40 字內）。 */
  detail: string;
}

export interface RegulationComplianceResult {
  status: RegulationComplianceStatus;
  issues: RegulationIssue[];
  /** 要交出去的文案：fixed 時是修正稿，其餘是原稿。 */
  caption: string;
  reason?: string;
  /** fixed 時的原稿。 */
  before?: string;
}

/** 存進 metadata 的一筆（每個版本一筆），成品頁與進度讀它。 */
export interface RegulationComplianceRecord {
  variantIndex: number;
  status: RegulationComplianceStatus;
  issues: RegulationIssue[];
  /** 這次對照了幾條法規。 */
  regulationCount: number;
  reason?: string;
  before?: string;
  /** 檢查之後用戶又手改過（或切回舊稿），這一版沒有重新檢查。 */
  editedAfter?: boolean;
}

const SYSTEM = `你是廣告法規合規審查。你只判斷「這篇文案有沒有違反下面列出的法規」，不評文筆、不管品牌風格。

做法：
1. 逐條讀法規，逐句對照文案。
2. 只有「文案的說法落在法規明文禁止的範圍」才算違規；法規沒提到的不要自己延伸。
   但同義改寫、暗示、疑問句包裝（例如「有沒有發現它能幫你入睡？」）一樣算違規。
3. 有違規時做「最小幅度修正」：只改違規的句子，換成合規且意思接近的說法。保留其餘文字、
   段落、換行、長度（±15%）、hashtag、連結、emoji、平台格式。hashtag 本身違規也要改。
4. 修正稿用原文的語言。

只輸出 JSON，不要前言：
{"compliant": true, "issues": [], "revised": ""}
或
{"compliant": false, "issues": [{"regulation": "法規名稱", "quote": "原文違規的那句（照抄）", "detail": "40字內，為什麼違規"}], "revised": "修正後全文"}`;

function textOf(r: any): string {
  const c = r?.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("");
  return String(r?.content ?? r?.text ?? "");
}

function parseJson(raw: string): any {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1]! : raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object");
  return JSON.parse(body.slice(start, end + 1));
}

/** 模型回的 issues 清乾淨；quote 必須真的出現在原稿裡，否則是模型編的，不收。 */
export function cleanIssues(raw: any, original: string): RegulationIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i: any) => i && (i.quote || i.detail))
    .map((i: any) => ({
      regulation: String(i.regulation ?? "").trim().slice(0, 60),
      quote: String(i.quote ?? "").trim().slice(0, 160),
      detail: String(i.detail ?? "").trim().slice(0, 120),
    }))
    .filter((i) => !i.quote || original.includes(i.quote) || original.replace(/\s+/g, "").includes(i.quote.replace(/\s+/g, "")))
    .slice(0, 8);
}

export function regulationsBlock(regs: Pick<BrandRegulation, "title" | "source" | "body">[]): string {
  return regs.map((r) => regulationLine(r, r.body.trim())).join("\n\n");
}

export async function checkRegulationCompliance(args: {
  caption: string;
  regulations: Pick<BrandRegulation, "title" | "source" | "body">[];
  isZhTW: boolean;
  timeoutMs: number;
}): Promise<RegulationComplianceResult> {
  const original = args.caption;
  const skip = (reason: string): RegulationComplianceResult => ({ status: "skipped", issues: [], caption: original, reason });
  if (!original.trim()) return skip("empty caption");
  if (!args.regulations.length) return skip("no active regulations");
  if (args.timeoutMs < 3000) return skip("no time budget left");

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), args.timeoutMs);
  try {
    const r = await invokeLLM({
      signal: ac.signal,
      maxTokens: Math.min(4000, Math.ceil(original.length * 2) + 800),
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `# 法規（用戶提供）\n${regulationsBlock(args.regulations)}\n\n# 待審查的文案\n${original}` },
      ],
    });
    const parsed = parseJson(textOf(r));
    const issues = cleanIssues(parsed?.issues, original);
    if (parsed?.compliant === true || issues.length === 0) {
      return { status: "compliant", issues: [], caption: original };
    }
    const revised = typeof parsed?.revised === "string" ? parsed.revised : "";
    const rejected = acceptRevision(original, revised, { isZhTW: args.isZhTW });
    if (rejected) return { status: "flagged", issues, caption: original, reason: `revision rejected: ${rejected}` };
    // 修正稿還留著違規原句＝沒修到，照 flagged 處理，不假裝修好。
    const leftover = issues.filter((i) => i.quote && revised.includes(i.quote));
    if (leftover.length) return { status: "flagged", issues, caption: original, reason: "revision kept violating sentence" };
    return { status: "fixed", issues, caption: revised.trim(), before: original };
  } catch (e: any) {
    return skip(ac.signal.aborted ? `timeout ${args.timeoutMs}ms` : `llm error: ${String(e?.message ?? e).slice(0, 160)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 一批版本一起檢查（各版本平行）。品牌沒有啟用中的法規回 null——呼叫端就不列這一關。
 * onFixed：修正稿要再過品牌硬規則與格式修補，由呼叫端決定怎麼修。
 */
export async function checkVariantsCompliance(args: {
  brandId: number;
  captions: Array<{ caption?: string } | null | undefined>;
  isZhTW: boolean;
  timeoutMs: number;
  onFixed: (index: number, fixed: string) => Promise<void>;
}): Promise<RegulationComplianceRecord[] | null> {
  const regs = await loadActiveRegulations(args.brandId);
  if (!regs.length) return null;
  const out = await Promise.all(args.captions.map(async (v, vi): Promise<RegulationComplianceRecord | null> => {
    if (!v?.caption || v.caption.length > 6000) return null;
    const res = await checkRegulationCompliance({ caption: v.caption, regulations: regs, isZhTW: args.isZhTW, timeoutMs: args.timeoutMs });
    if (res.status === "fixed") await args.onFixed(vi, res.caption);
    return {
      variantIndex: vi, status: res.status, issues: res.issues, regulationCount: regs.length,
      ...(res.reason ? { reason: res.reason } : {}), ...(res.before ? { before: res.before } : {}),
    };
  }));
  return out.filter((x): x is RegulationComplianceRecord => !!x);
}

/** 看文字本身像不像繁中（單篇路徑沒有 brandMarket 可讀時用）。 */
const looksCJK = (s: string) => ((s.match(/[一-鿿]/g)?.length ?? 0) / Math.max(1, s.replace(/\s/g, "").length)) > 0.3;

/**
 * 寫完之後的後製路徑（換人重寫、對話修改、改寫原文、影片腳本、圖片卡標題、squad 步驟……）
 * 共用的單篇合規檢查。2026-09-30（CJ「要補上」）。
 *
 * 品牌沒有法規 → record 為 null、文字原樣；有法規 → 跑 checkRegulationCompliance，
 * fixed 時交修正稿（呼叫端自己再過品牌硬規則）。任何錯誤都不擋原本的產出。
 */
export async function enforceRegulationsOnText(
  brandId: number | null | undefined,
  text: string,
  opts?: { isZhTW?: boolean; timeoutMs?: number },
): Promise<{ text: string; record: RegulationComplianceRecord | null }> {
  if (!brandId || !text?.trim() || text.length > 20_000) return { text, record: null };
  try {
    const regs = await loadActiveRegulations(brandId);
    if (!regs.length) return { text, record: null };
    const res = await checkRegulationCompliance({
      caption: text, regulations: regs,
      isZhTW: opts?.isZhTW ?? looksCJK(text),
      timeoutMs: opts?.timeoutMs ?? 25_000,
    });
    return {
      text: res.status === "fixed" ? res.caption : text,
      record: {
        variantIndex: 0, status: res.status, issues: res.issues, regulationCount: regs.length,
        ...(res.reason ? { reason: res.reason } : {}), ...(res.before ? { before: res.before } : {}),
      },
    };
  } catch {
    return { text, record: null };
  }
}

/**
 * 把一筆合規紀錄寫進 metadata.regulationCompliance（同一個版本只留最新一筆）。
 * record 為 null（這次沒檢查，例如用戶手改）時：那個版本已有的紀錄標成 editedAfter，
 * 成品頁就會照實說「之後修改過，沒有重新檢查」。
 */
export function mergeComplianceRecord(
  existing: unknown,
  variantIndex: number,
  record: RegulationComplianceRecord | null,
): RegulationComplianceRecord[] {
  const list: RegulationComplianceRecord[] = Array.isArray(existing) ? (existing as any[]).filter(Boolean) : [];
  const others = list.filter((r) => r.variantIndex !== variantIndex);
  const prev = list.find((r) => r.variantIndex === variantIndex);
  if (record) return [...others, { ...record, variantIndex }];
  if (prev) return [...others, { ...prev, editedAfter: true }];
  return list;
}

/**
 * 後製路徑一行搞定：品牌硬規則（禁用詞／替換）→ 法規合規檢查 → 修正稿再過一次硬規則。
 * 取代這些路徑原本單獨呼叫的 enforceBrandRulesOnText。
 */
export async function enforceBrandAndRegulations(
  brandId: number | null | undefined,
  text: string,
  opts?: { isZhTW?: boolean; timeoutMs?: number },
): Promise<{ text: string; record: RegulationComplianceRecord | null }> {
  const { enforceBrandRulesOnText } = await import("../../strategy/core/brandContext");
  const ruled = brandId ? await enforceBrandRulesOnText(brandId, text).catch(() => text) : text;
  const reg = await enforceRegulationsOnText(brandId, ruled, opts);
  if (reg.record?.status !== "fixed") return { text: ruled, record: reg.record };
  const again = await enforceBrandRulesOnText(brandId, reg.text).catch(() => reg.text);
  return { text: again, record: reg.record };
}
