/**
 * perfAI — 成效層用到模型的三件事：
 *
 *   1. deriveDimensions   從品牌／產品定位推出「族群」「USP」兩個維度的值（範本用）。
 *                         產品維度不用模型，直接列 products 表。
 *   2. proposeLens        「照你原本的報告」「貼 AI 對話串」兩個入口共用：讀一段文字，
 *                         抽出列／欄維度、各維度的值、漏斗階段、判讀指標 → 提議卡。
 *                         只是提議，用戶按確認才寫進 DB（applyProposal 在 router）。
 *   3. autoTag            把還沒標到的事實（貼文內文、廣告名稱）分到某維度的某個值。
 *                         模型只能從既有的值裡挑，挑不出來就留「未歸類」，不准自己發明。
 *
 * 模型輸出一律當不可信：代碼要在允許清單裡、指標鍵要是 METRIC_LABELS 裡的，
 * 其餘丟掉。模型掛了不擋流程 —— deriveDimensions 有確定性的退路。
 */
import localPool from "../../localDb";
import { callModel } from "../../platform/core/llm/multiModelRouter";
import { METRIC_LABELS, JUDGE_LABELS, BUILTIN_DIMS, slugCode, type DimValue, type Dimension, type LensConfig, type Fact } from "./perfPivot";

export function parseJsonLoose(raw: string): any {
  const cleaned = String(raw ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  const s = cleaned.search(/[[{]/);
  const e = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (s >= 0 && e > s) { try { return JSON.parse(cleaned.slice(s, e + 1)); } catch { /* fallthrough */ } }
  return null;
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
function asObj(v: unknown): Record<string, any> {
  if (!v) return {};
  if (typeof v === "string") { try { return JSON.parse(v) ?? {}; } catch { return {}; } }
  return v as Record<string, any>;
}
function listText(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : x?.label ?? x?.name ?? x?.body ?? "")).map((s) => String(s).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(/[\n、,，;；]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

/** 把一串標籤轉成維度值（代碼唯一、去重、最多 8 個）。 */
export function toValues(labels: string[], max = 8): DimValue[] {
  const taken = new Set<string>();
  const seen = new Set<string>();
  const out: DimValue[] = [];
  for (const raw of labels) {
    const label = raw.replace(/\s+/g, " ").trim().slice(0, 24);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ code: slugCode(label, taken), label });
    if (out.length >= max) break;
  }
  return out;
}

// ─── 1. 定位 → 族群 / USP ─────────────────────────────────────────────

export interface DerivedDims { ta: DimValue[]; usp: DimValue[]; product: DimValue[]; usedModel: boolean }

export async function readPositioningBrief(brandId: number): Promise<{ brief: string; fallbackTa: string[]; fallbackUsp: string[]; products: { id: number; name: string }[] }> {
  const [bRows]: any = await localPool.execute(`SELECT name, positioning FROM brands WHERE id = ? LIMIT 1`, [brandId]);
  const b = (bRows as any[])[0] ?? {};
  const pos = asObj(b.positioning);
  const [pRows]: any = await localPool.execute(
    `SELECT id, name, positioning FROM products WHERE brandId = ? ORDER BY id LIMIT 30`, [brandId],
  ).catch(() => [[]] as any);
  const lines: string[] = [`品牌：${b.name ?? ""}`];
  const fallbackTa: string[] = [];
  const fallbackUsp: string[] = [];

  const aud = pos.audience ?? {};
  if (aud.primary) lines.push(`主受眾：${str(aud.primary, 500)}`);
  if (aud.secondary) lines.push(`次受眾：${str(aud.secondary, 300)}`);
  if (Array.isArray(aud.matrix)) {
    const names = aud.matrix.map((g: any) => str(g?.name, 30)).filter(Boolean);
    if (names.length) lines.push(`族群分組：${names.join("、")}`);
    fallbackTa.push(...names.filter((n: string) => !/^(主|次)受眾$/.test(n)));
  }
  const d = pos.differentiation ?? {};
  if (d.discriminator) { lines.push(`唯一致勝理由：${str(d.discriminator, 200)}`); fallbackUsp.push(str(d.discriminator, 24)); }
  if (d.functional) lines.push(`功能差異化：${str(d.functional, 300)}`);
  if (d.emotional) lines.push(`情感差異化：${str(d.emotional, 300)}`);
  if (pos._interim?.usp) { lines.push(`暫時 USP：${str(pos._interim.usp, 200)}`); fallbackUsp.push(str(pos._interim.usp, 24)); }

  const products: { id: number; name: string }[] = [];
  for (const p of (pRows as any[]) ?? []) {
    products.push({ id: p.id, name: String(p.name ?? "").trim() });
    const pp = asObj(p.positioning);
    const bits: string[] = [];
    if (pp.audience?.primary) bits.push(`目標族群：${str(pp.audience.primary, 200)}`);
    if (Array.isArray(pp.audience?.mots)) {
      const a = pp.audience.mots.map((m: any) => str(m?.audience, 20)).filter(Boolean);
      if (a.length) { bits.push(`MOT 受眾：${a.join("、")}`); fallbackTa.push(...a); }
    }
    if (pp.competition?.uniqueUsp) { bits.push(`獨家賣點：${str(pp.competition.uniqueUsp, 200)}`); fallbackUsp.push(...listText(pp.competition.uniqueUsp).map((s) => s.slice(0, 24))); }
    const adv = listText(pp.value?.advantages);
    if (adv.length) { bits.push(`優勢：${adv.slice(0, 6).join("、")}`); fallbackUsp.push(...adv.map((s) => s.slice(0, 24))); }
    const fn = listText(pp.value?.coreFunctions);
    if (fn.length) bits.push(`核心功能：${fn.slice(0, 6).join("、")}`);
    if (bits.length) lines.push(`產品「${p.name}」— ${bits.join("；")}`);
  }
  return { brief: lines.join("\n").slice(0, 6000), fallbackTa, fallbackUsp, products };
}

export async function deriveDimensions(brandId: number): Promise<DerivedDims> {
  const { brief, fallbackTa, fallbackUsp, products } = await readPositioningBrief(brandId);
  const product = toValues(products.map((p) => p.name).filter(Boolean), 20);
  let ta: string[] = [];
  let usp: string[] = [];
  let usedModel = false;
  if (brief.split("\n").length > 1) {
    try {
      const prompt = `你是成效分析師。下面是一個品牌的定位資料。請整理出兩份清單，用來把廣告與貼文成效分組：
1. 目標族群（3–6 個）：每個是一群可以被投放、會有不同反應的人，用 4–10 個字的名稱（例：雙薪育兒家庭、忙碌上班族）。不要用「主受眾」「次受眾」這種代稱。
2. USP／溝通訴求（3–6 個）：每個是一個可以單獨拿來當廣告主訴求的賣點，用 4–12 個字（例：5 分鐘上桌、免油煙免洗鍋）。彼此要互斥，不要一個包含另一個。
只能根據資料，不要編造資料沒有的族群或賣點。

【定位資料】
${brief}

只輸出 JSON：{"ta":["..."],"usp":["..."]}`;
      const r = await callModel([{ role: "user", content: prompt }], "general");
      const parsed = parseJsonLoose(String(r.content ?? ""));
      ta = listText(parsed?.ta);
      usp = listText(parsed?.usp);
      usedModel = ta.length > 0 || usp.length > 0;
    } catch (e) {
      console.warn("[perfAI.deriveDimensions] model failed, using fallback:", (e as Error)?.message);
    }
  }
  if (!ta.length) ta = fallbackTa;
  if (!usp.length) usp = fallbackUsp;
  return { ta: toValues(ta, 6), usp: toValues(usp, 6), product, usedModel };
}

// ─── 2. 文字 → 視角提議 ───────────────────────────────────────────────

export interface ProposedDim { key: string; label: string; values: DimValue[]; isNew: boolean }
export interface LensProposal {
  name: string;
  rowDim: ProposedDim;
  colDim: ProposedDim | null;
  config: LensConfig;
  /** 模型對「為什麼這樣切」的一句話，給提議卡顯示。 */
  rationale: string;
  /** 原文提到但對不到標準指標的東西（例如「收藏數」），誠實列出來。 */
  unmapped: string[];
}

const METRIC_KEYS = Object.keys(METRIC_LABELS);
const JUDGE_KEYS = [...Object.keys(JUDGE_LABELS), ...METRIC_KEYS];

/** 把模型給的維度對到既有維度（同 key 或同名）；對不到就是新維度。純函式，可測。 */
export function reconcileDim(raw: any, existing: Dimension[], takenKeys: Set<string>): ProposedDim | null {
  const label = str(raw?.label, 30);
  if (!label) return null;
  const rawKey = str(raw?.key, 40).toLowerCase();
  const labels = listText(raw?.values);
  // 內建維度（月份／來源／貼文形式）的值由數據本身決定。模型若自己列了值
  // （例：「素材類型：開箱影片、教學短影音…」被套上 format），那是用戶自訂的維度，
  // 不能被內建維度吃掉，否則那些值就不見了。
  const builtin = labels.length ? null : Object.entries(BUILTIN_DIMS).find(([k, v]) => k === rawKey || v.label === label);
  if (builtin) return { key: builtin[0], label: builtin[1].label, values: [], isNew: false };
  const hit = existing.find((d) => d.key === rawKey || d.label === label);
  if (hit) {
    // 既有維度：沿用既有值（代碼不能變，不然舊標籤全失效），模型多列的值附加在後面。
    const values = [...hit.values];
    const taken = new Set(values.map((v) => v.code));
    for (const l of labels) {
      if (!values.some((v) => v.label === l.slice(0, 24))) values.push({ code: slugCode(l, taken), label: l.slice(0, 24) });
    }
    return { key: hit.key, label: hit.label, values: values.slice(0, 40), isNew: false };
  }
  let key = rawKey;
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(key) || takenKeys.has(key)) {
    let i = 1;
    while (takenKeys.has(`dim${i}`)) i++;
    key = `dim${i}`;
  }
  takenKeys.add(key);
  return { key, label, values: toValues(labels, 12), isNew: true };
}

export function sanitizeProposal(parsed: any, existing: Dimension[]): LensProposal | null {
  if (!parsed || typeof parsed !== "object") return null;
  const takenKeys = new Set<string>([...existing.map((d) => d.key), ...Object.keys(BUILTIN_DIMS)]);
  const row = reconcileDim(parsed.rowDim, existing, takenKeys);
  if (!row) return null;
  const col = parsed.colDim ? reconcileDim(parsed.colDim, existing, takenKeys) : null;
  const stages = (Array.isArray(parsed.stages) ? parsed.stages : [])
    .map((s: any) => ({ metric: str(typeof s === "string" ? s : s?.metric, 30), label: str(s?.label, 20) || undefined }))
    .filter((s: any) => METRIC_KEYS.includes(s.metric))
    .slice(0, 8);
  const judge = JUDGE_KEYS.includes(str(parsed.judge, 30)) ? str(parsed.judge, 30) : (stages.at(-1)?.metric ?? "reach");
  return {
    name: str(parsed.name, 40) || `${row.label}${col ? ` × ${col.label}` : ""}`,
    rowDim: row,
    colDim: col && col.key !== row.key ? col : null,
    config: {
      rowDim: row.key,
      colDim: col && col.key !== row.key ? col.key : null,
      stages: stages.length ? stages : [{ metric: "impressions" }, { metric: "clicks" }, { metric: "orders" }],
      judge,
    },
    rationale: str(parsed.rationale, 300),
    unmapped: listText(parsed.unmapped).slice(0, 10),
  };
}

export async function proposeLens(kind: "chat" | "report", text: string, existing: Dimension[]): Promise<LensProposal | null> {
  const dimList = existing.map((d) => `- ${d.key}「${d.label}」：${d.values.map((v) => v.label).join("、")}`).join("\n") || "（尚無）";
  const src = kind === "chat"
    ? "下面是用戶跟 AI 助理討論分析框架的對話串"
    : "下面是用戶原本在用的成效報告（從檔案抽出的文字與表格）";
  const prompt = `你是成效分析師。${src}。請找出這份${kind === "chat" ? "討論最後定案" : "報告實際使用"}的分析視角，轉成下面的結構：

- rowDim：主要比較的維度（列）。label 是維度名稱，values 是這個維度的各個值（例：維度「族群」，值「雙薪家庭、上班族」）。
- colDim：第二個交叉比較的維度（欄），沒有就給 null。
- stages：漏斗階段，由上而下，只能用這些指標鍵：${METRIC_KEYS.map((k) => `${k}（${METRIC_LABELS[k]}）`).join("、")}。label 可以用原文的叫法。
- judge：用哪個指標判斷好壞，只能是 ${Object.keys(JUDGE_LABELS).join("、")} 或上面任一個指標鍵。
- unmapped：原文有、但對不到上面指標鍵的指標名稱。
- 維度可以沿用品牌既有的（key 照抄）；月份用 key "month"，資料來源用 "source"，貼文形式用 "format"。

【品牌既有維度】
${dimList}

【原文】
${text.slice(0, 12000)}

只輸出 JSON：{"name":"視角名稱（10 字內）","rationale":"一句話說明","rowDim":{"key":"","label":"","values":[]},"colDim":null,"stages":[{"metric":"","label":""}],"judge":"","unmapped":[]}`;
  const r = await callModel([{ role: "user", content: prompt }], "general");
  return sanitizeProposal(parseJsonLoose(String(r.content ?? "")), existing);
}

// ─── 3. 自動補標 ──────────────────────────────────────────────────────

/**
 * 一次最多 40 筆：把每筆的名稱＋內文前 300 字給模型，要它對每個維度挑一個值代碼或 null。
 * 回傳 factId → { dimKey: code }，只包含合法代碼。
 */
export async function autoTag(facts: Fact[], dims: Dimension[]): Promise<Record<string, Record<string, string>>> {
  const usable = dims.filter((d) => d.values.length);
  if (!facts.length || !usable.length) return {};
  const dimSpec = usable.map((d) => `${d.key}（${d.label}）：${d.values.map((v) => `${v.code}=${v.label}`).join("，")}`).join("\n");
  const items = facts.slice(0, 40).map((f) => `#${f.id} ${f.entityLabel ?? ""}｜${String(f.text ?? "").replace(/\s+/g, " ").slice(0, 300)}`).join("\n");
  const prompt = `把每一則內容，對下面每個維度各歸到一個值（填代碼）。內容沒有明顯對應就填 null，不要硬猜。

【維度與可選值】
${dimSpec}

【內容】
${items}

只輸出 JSON：{"<編號>":{"<維度key>":"<代碼或null>"}}`;
  const r = await callModel([{ role: "user", content: prompt }], "general");
  const parsed = parseJsonLoose(String(r.content ?? "")) ?? {};
  const out: Record<string, Record<string, string>> = {};
  for (const f of facts) {
    const row = parsed[String(f.id)] ?? parsed[`#${f.id}`];
    if (!row || typeof row !== "object") continue;
    for (const d of usable) {
      const code = row[d.key];
      if (typeof code === "string" && d.values.some((v) => v.code === code)) {
        (out[String(f.id)] ??= {})[d.key] = code;
      }
    }
  }
  return out;
}
