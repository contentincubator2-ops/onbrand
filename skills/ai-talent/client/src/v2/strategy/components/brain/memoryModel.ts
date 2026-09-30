/**
 * memoryModel — 「記憶」tray 的純資料層：把 brandKnowledge.memory 攤成手機「儲存空間」那樣的樹
 *   區（品牌／產品／活動／文字／視覺／基本資料／會議／其他）
 *     → 項目（每個產品、每個活動各一個；其他區只有一個）
 *       → 段落（策略層頁面上的段落標題）
 *         → 欄位（策略層頁面上的欄位名稱），各自標「AI 讀了沒」
 *
 * 2026-09-30（CJ「策略層當中，有包括品牌、產品、活動、文字還有視覺，還有其他你真實有存入的
 * 資料。你這樣整理，不是很精細」）：以前只列 AI 讀的那幾行；現在**存著的全部列出來**，
 * 沒被讀的標「只存著」，用戶才看得出哪些東西 AI 根本沒在用。
 *
 * 標題與欄位名直接用策略層的 schema（positioningSchema / copyAssets / visualAssets），
 * 跟頁面一字不差。「讀了沒」靠 server 每一行帶的 source 對欄位（brandContext.ts SOURCE_OF）。
 * 任何 AI 讀到、卻對不上欄位的行，會落到「其他 AI 讀到的內容」——讀到的東西絕不隱形。
 *
 * client 不得 value-import server，型別在這裡另寫一份（對應 server/strategy/core/brandMemory.ts）。
 */
import { BRAND_SEGMENTS, PRODUCT_SEGMENTS, EVENT_SEGMENTS, type SegmentSpec } from "../../lib/positioningSchema";
import { COPY_ASSETS, hasContent } from "../../lib/copyAssets";
import type { BrainItem } from "./brainModel";

export interface MemoryBrain { usedChars: number; items: Array<BrainItem & { source?: string }> }

export interface BrandMemoryData {
  capacity: number;
  brand: {
    name: string; industry: string; description: string; tagline: string; positioningSummary: string;
    website: string; socialLinks: Record<string, string>; targetCountry: string; outputLanguage: string;
    positioning: any;
  };
  brandBrain: MemoryBrain;
  products: Array<{ id: number; name: string; positioning: any; photoCount: number; brain: MemoryBrain }>;
  events: Array<{ id: number; name: string; startAt: string | null; endAt: string | null; positioning: any; brain: MemoryBrain }>;
  visual: { swatchCount: number; swatches: string[]; brandPhotoCount: number };
  knowledge: Array<{ id: number; kind: string; title: string; chars: number }>;
  meetings: Array<{ id: number; topic: string; scope: string; runs: number; adopted: number }>;
}

/**
 * 這一欄 AI 怎麼用：
 *   read     寫文時讀（完整）         partial  只讀前段（超過單格上限）
 *   skipped  空間不夠，這次沒讀到     check    不進 prompt，寫完後拿來檢查
 *   image    生圖時讀                 stored   只存著，AI 不讀
 */
export type ReadTag = "read" | "partial" | "skipped" | "check" | "image" | "stored";

export const TAG_TEXT: Record<ReadTag, { zh: string; en: string }> = {
  read:    { zh: "寫文時讀", en: "Read" },
  partial: { zh: "只讀前段", en: "Partly read" },
  skipped: { zh: "沒讀到", en: "Not read" },
  check:   { zh: "寫完後檢查", en: "Checked after" },
  image:   { zh: "生圖時讀", en: "Used for images" },
  stored:  { zh: "只存著", en: "Stored only" },
};

export interface MemRow {
  id: string;
  label: string;
  /** 存了幾字（圖片、色票這種不算字的是 0，改看 display）。 */
  chars: number;
  /** 不是字數的份量說明（「5 色」「12 張」）。 */
  display?: string;
  preview: string;
  tag: ReadTag;
  /** 這一欄實際進到 prompt 的字數。 */
  keptChars: number;
  legacyRowId?: number;
  /** 在策略層哪一頁改。 */
  href: string | null;
  /** 在清理建議裡顯示的出處（「產品 · 12 色水彩筆」）。 */
  context: string;
}

export interface MemGroup { title: string; rows: MemRow[] }

export interface MemEntity {
  id: string;
  name: string;
  groups: MemGroup[];
  /** 寫這個產品／活動的文時，整份大腦用了多少（含品牌那部分）。只有產品、活動有。 */
  writeChars?: number;
  storedChars: number;
  readChars: number;
  fields: number;
}

export type SectionKey = "brand" | "product" | "event" | "copy" | "visual" | "info" | "meetings" | "other";

export const SECTION_TEXT: Record<SectionKey, { zh: string; en: string }> = {
  brand: { zh: "品牌", en: "Brand" },
  product: { zh: "產品", en: "Products" },
  event: { zh: "活動", en: "Campaigns" },
  copy: { zh: "文字", en: "Copy" },
  visual: { zh: "視覺", en: "Visual" },
  info: { zh: "基本資料", en: "Info" },
  meetings: { zh: "會議", en: "Meetings" },
  other: { zh: "其他存著的", en: "Other stored" },
};

export interface MemSection {
  key: SectionKey;
  entities: MemEntity[];
  /** 產品／活動是多個項目，其他區只有一個（點進去直接看段落）。 */
  multi: boolean;
  storedChars: number;
  /** 佔 AI 記憶的字數：一次寫作只會讀一個產品、一個活動，所以取最多的那個。 */
  readChars: number;
  fields: number;
  skipped: number;
  partial: number;
}

export interface MemoryView {
  capacity: number;
  /** 最滿的那一次寫作用了多少字、是寫哪一個。 */
  maxWrite: { chars: number; name: string | null };
  level: "ok" | "near" | "over";
  sections: MemSection[];
  /** 攤平的全部欄位（清理建議用）。 */
  rows: MemRow[];
  /** 最滿那次寫作的組成（容量條用）。 */
  composition: Array<{ key: SectionKey; chars: number }>;
}

export const NEAR_FULL_RATIO = 0.85;

/* ── 小工具 ─────────────────────────────────────────────────── */

/** 任何形狀的值攤成一段文字：字串、清單、表格列、巢狀物件都行。 */
export function textOf(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join(" · ");
  if (typeof v === "object") return Object.values(v).map(textOf).filter(Boolean).join(" · ");
  return "";
}

const len = (s: string) => [...s].length;

/** 一個 source 對到的所有大腦行，合成一個標記。 */
function tagFrom(items: BrainItem[]): { tag: ReadTag; kept: number } | null {
  if (!items.length) return null;
  const kept = items.reduce((n, i) => n + i.keptChars, 0);
  if (items.some((i) => i.status === "overflow")) return { tag: "skipped", kept };
  if (items.some((i) => i.status === "trimmed")) return { tag: "partial", kept };
  if (items.every((i) => i.status === "checkOnly")) return { tag: "check", kept };
  return { tag: "read", kept };
}

/** 從大腦取出 source 對應的行，並記下已經被欄位認領。 */
class SourceIndex {
  private by = new Map<string, Array<BrainItem & { source?: string }>>();
  private claimed = new Set<string>();
  constructor(private items: Array<BrainItem & { source?: string }>) {
    for (const i of items) {
      if (!i.source) continue;
      const list = this.by.get(i.source) ?? [];
      list.push(i);
      this.by.set(i.source, list);
    }
  }
  take(source: string) {
    this.claimed.add(source);
    return tagFrom(this.by.get(source) ?? []);
  }
  /** 沒被任何欄位認領的行（讀到了但畫面上沒有對應欄位）。 */
  leftovers(filter: (i: BrainItem & { source?: string }) => boolean) {
    return this.items.filter((i) => filter(i) && !(i.source && this.claimed.has(i.source)));
  }
}

interface RowInput {
  id: string; label: string; text?: string; display?: string; tag?: ReadTag; source?: string;
  legacyRowId?: number;
}

function makeRows(inputs: RowInput[], idx: SourceIndex | null, href: string | null, context: string): MemRow[] {
  const out: MemRow[] = [];
  for (const r of inputs) {
    const text = r.text ?? "";
    if (!text && !r.display) continue;
    const hit = r.source && idx ? idx.take(r.source) : null;
    out.push({
      id: r.id, label: r.label, chars: len(text), display: r.display, preview: text.slice(0, 90),
      tag: hit?.tag ?? r.tag ?? "stored", keptChars: hit?.kept ?? 0, legacyRowId: r.legacyRowId,
      href, context,
    });
  }
  return out;
}

function leftoverRows(items: BrainItem[], href: string | null, context: string, prefix: string): MemRow[] {
  return items.map((i, n) => {
    const t = tagFrom([i])!;
    return {
      id: `${prefix}-left-${n}`, label: i.label, chars: i.storedChars, preview: i.preview,
      tag: t.tag, keptChars: t.kept, legacyRowId: i.legacyRowId, href: i.legacyRowId ? null : href, context,
    };
  });
}

/** 定位 JSON 依 schema 逐段逐欄攤開；schema 以外的頂層 key 歸到「舊版欄位」。 */
function positioningGroups(
  pos: any, segments: SegmentSpec[], idx: SourceIndex, href: string, context: string, en: boolean, prefix: string,
): MemGroup[] {
  const groups: MemGroup[] = [];
  const p = pos && typeof pos === "object" ? pos : {};
  for (const seg of segments) {
    const segVal = p[seg.id];
    const rows = makeRows(seg.fields.map((f) => ({
      id: `${prefix}-${seg.id}.${f.key}`, label: f.label, text: textOf(segVal?.[f.key]), source: `pos:${seg.id}.${f.key}`,
    })), idx, href, context);
    if (rows.length) groups.push({ title: (en && seg.titleEn) || seg.title, rows });
  }
  const cards = Array.isArray(p._customSegments) ? p._customSegments : [];
  const cardRows = makeRows(cards.map((c: any, i: number) => {
    const title = String(c?.title ?? "").trim();
    const body = (Array.isArray(c?.fields) ? c.fields : [])
      .map((f: any) => [String(f?.label ?? "").trim(), String(f?.value ?? "").trim()].filter(Boolean).join("："))
      .filter(Boolean).join("；");
    return { id: `${prefix}-custom-${i}`, label: title || (en ? "Untitled card" : "未命名卡片"), text: body, source: `custom:${title}` };
  }), idx, href, context);
  if (cardRows.length) groups.push({ title: en ? "Custom cards" : "自訂卡片", rows: cardRows });

  const docs = Array.isArray(p._sourceDocs) ? p._sourceDocs : [];
  const docRows = makeRows([
    { id: `${prefix}-doc`, label: en ? "Positioning doc supplement" : "定位文件補充", text: textOf(p._sourceDoc?.injectedContext), source: "doc" },
    ...docs.map((d: any, i: number) => ({
      id: `${prefix}-docs-${i}`, label: String(d?.name ?? (en ? "Uploaded doc" : "上傳的文件")),
      text: textOf(d?.outline), display: d?.chars ? `${Number(d.chars).toLocaleString("en-US")} ${en ? "chars in file" : "字原文"}` : undefined,
    })),
  ], idx, href, context);
  if (docRows.length) groups.push({ title: en ? "Uploaded positioning docs" : "上傳的定位文件", rows: docRows });

  const known = new Set(segments.map((s) => s.id));
  const legacyRows = makeRows(Object.keys(p)
    .filter((k) => !k.startsWith("_") && !known.has(k))
    .map((k) => ({ id: `${prefix}-old-${k}`, label: k, text: textOf(p[k]) })), idx, href, context);
  if (legacyRows.length) groups.push({ title: en ? "Old-version fields" : "舊版欄位", rows: legacyRows });
  return groups;
}

function entityOf(id: string, name: string, groups: MemGroup[], writeChars?: number): MemEntity {
  const rows = groups.flatMap((g) => g.rows);
  return {
    id, name, groups, writeChars,
    storedChars: rows.reduce((n, r) => n + r.chars, 0),
    readChars: rows.reduce((n, r) => n + r.keptChars, 0),
    fields: rows.length,
  };
}

const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/* ── 主函式 ─────────────────────────────────────────────────── */

export function buildMemoryView(d: BrandMemoryData, brandId: number, en: boolean): MemoryView {
  const T = (k: SectionKey) => (en ? SECTION_TEXT[k].en : SECTION_TEXT[k].zh);
  const base = `/brands/edit?b=${brandId}`;
  const pos = d.brand.positioning && typeof d.brand.positioning === "object" ? d.brand.positioning : {};
  const brandIdx = new SourceIndex(d.brandBrain.items);

  // 品牌
  const brandGroups = positioningGroups(pos, BRAND_SEGMENTS, brandIdx, `${base}&cat=positioning`, T("brand"), en, "brand");

  // 文字
  const assets = pos._assets && typeof pos._assets === "object" ? pos._assets : {};
  const copyInputs: RowInput[] = COPY_ASSETS
    .filter((spec) => hasContent(assets[spec.key], spec.shape))
    .map((spec) => {
      const v = assets[spec.key];
      const text = spec.shape === "text" ? textOf(v?.text)
        : spec.shape === "items" ? textOf(v?.items)
        : (Array.isArray(v?.pairs) ? v.pairs.map((x: any) => `${x?.from ?? ""} → ${x?.to ?? ""}`).join(" · ") : "");
      return { id: `copy-${spec.key}`, label: en ? spec.labelEn : spec.labelZh, text, source: `asset:${spec.key}` };
    });
  if (assets.audience) copyInputs.push({ id: "copy-audience", label: en ? "Target audience (old field)" : "目標受眾（舊版文字欄位）", text: textOf(assets.audience), source: "asset:audience" });
  const copyRows = makeRows(copyInputs, brandIdx, `${base}&cat=copy`, T("copy"));

  // 視覺——文字寫手不讀；生圖讀色票與圖像風格描述（server imageGen.ts）。
  const vis = (key: string) => assets[key] ?? {};
  const logo = vis("logo");
  const logoCount = [logo.primaryUrl, logo.darkUrl, logo.iconUrl].filter(Boolean).length;
  const visualHref = `${base}&cat=visual`;
  const visualRows = makeRows([
    { id: "vis-dna", label: en ? "Colour DNA" : "品牌色彩 DNA", display: d.visual.swatchCount ? `${d.visual.swatchCount} ${en ? "colours" : "色"}` : undefined,
      text: d.visual.swatches.join(" "), tag: "image" },
    { id: "vis-logo", label: en ? "Logo files" : "標誌檔案", display: logoCount ? `${logoCount} ${en ? "files" : "個檔案"}` : undefined },
    { id: "vis-logo-rules", label: en ? "Logo guidelines" : "標誌使用規範", text: textOf(logo.guidelines) },
    { id: "vis-imagery", label: en ? "Imagery style" : "圖像風格", text: textOf(vis("imagery_style").text), tag: "image" },
    { id: "vis-imagery-prompt", label: en ? "Imagery style — AI prompt" : "圖像風格 — AI 提示詞", text: textOf(vis("imagery_style").prompt) },
    { id: "vis-icon", label: en ? "Icon style" : "圖示風格", text: textOf([vis("icon_style").text, vis("icon_style").prompt]) },
    { id: "vis-photos", label: en ? "Brand photos" : "品牌照片", display: d.visual.brandPhotoCount ? `${d.visual.brandPhotoCount} ${en ? "photos" : "張"}` : undefined },
    { id: "vis-guidelines", label: en ? "Visual guidelines" : "視覺準則", text: textOf(vis("guidelines").text) },
    { id: "vis-layout", label: en ? "Layout rules" : "排版規範", text: textOf(vis("layout_rules").text) },
    { id: "vis-chart", label: en ? "Chart style" : "圖表風格", text: textOf(vis("chart_style").text) },
    { id: "vis-templates", label: en ? "Templates" : "品牌範本", text: textOf([vis("templates").links, vis("templates").items]) },
  ], null, visualHref, T("visual"));
  const visualLegacy = makeRows([
    { id: "vis-old-colors", label: en ? "Colour list (old)" : "色票清單（舊版）", text: textOf(assets.colors?.list) },
    { id: "vis-old-fonts", label: en ? "Fonts (old)" : "字型（舊版）", text: textOf(assets.fonts) },
  ], null, visualHref, T("visual"));

  // 基本資料
  const b = d.brand;
  const socialCount = Object.values(b.socialLinks ?? {}).filter((v) => typeof v === "string" && v.trim()).length;
  const infoHref = `${base}&cat=info`;
  const infoRows = makeRows([
    { id: "info-name", label: en ? "Brand name" : "品牌名稱", text: b.name },
    { id: "info-industry", label: en ? "Industry" : "產業", text: b.industry },
    { id: "info-desc", label: en ? "What the brand does" : "品牌在做什麼", text: b.description },
    { id: "info-tagline", label: en ? "Tagline (info tab)" : "品牌標語（基本資料）", text: b.tagline, source: "col:tagline" },
    { id: "info-summary", label: en ? "AI positioning summary" : "AI 推導的定位摘要", text: b.positioningSummary, source: "col:positioningSummary" },
    { id: "info-market", label: en ? "Market & language" : "市場與語言",
      text: [b.targetCountry, b.outputLanguage].filter(Boolean).join(" · "), source: "market" },
    { id: "info-web", label: en ? "Website" : "官方網站", text: b.website },
    { id: "info-social", label: en ? "Social links" : "社群連結", display: socialCount ? `${socialCount} ${en ? "links" : "個"}` : undefined },
  ], brandIdx, infoHref, T("info"));

  // 產品
  const productEntities = d.products.map((p) => {
    const idx = new SourceIndex(p.brain.items);
    const href = `${base}&cat=positioning&p=${p.id}`;
    const ctx = `${T("product")} · ${p.name}`;
    const head = makeRows([
      { id: `p${p.id}-name`, label: en ? "Product name" : "產品名稱", text: p.name, source: "name" },
      { id: `p${p.id}-photos`, label: en ? "Product photos" : "產品照片", display: p.photoCount ? `${p.photoCount} ${en ? "photos" : "張"}` : undefined, tag: "image" },
    ], idx, href, ctx);
    const groups = [{ title: en ? "Product card" : "產品卡片", rows: head }, ...positioningGroups(p.positioning, PRODUCT_SEGMENTS, idx, href, ctx, en, `p${p.id}`)];
    const left = leftoverRows(idx.leftovers(() => true), href, ctx, `p${p.id}`);
    if (left.length) groups.push({ title: en ? "Other content the AI reads" : "其他 AI 讀到的內容", rows: left });
    return entityOf(`p${p.id}`, p.name, groups.filter((g) => g.rows.length), p.brain.usedChars);
  });

  // 活動
  const eventEntities = d.events.map((e) => {
    const idx = new SourceIndex(e.brain.items);
    const href = `${base}&cat=positioning&e=${e.id}`;
    const ctx = `${T("event")} · ${e.name}`;
    const head = makeRows([
      { id: `e${e.id}-name`, label: en ? "Campaign name" : "活動名稱", text: e.name, source: "name" },
      { id: `e${e.id}-start`, label: en ? "Start date" : "開始日期", text: fmtDate(e.startAt), source: "startAt" },
      { id: `e${e.id}-end`, label: en ? "End date" : "結束日期", text: fmtDate(e.endAt), source: "endAt" },
    ], idx, href, ctx);
    const groups = [{ title: en ? "Campaign card" : "活動卡片", rows: head }, ...positioningGroups(e.positioning, EVENT_SEGMENTS, idx, href, ctx, en, `e${e.id}`)];
    const left = leftoverRows(idx.leftovers(() => true), href, ctx, `e${e.id}`);
    if (left.length) groups.push({ title: en ? "Other content the AI reads" : "其他 AI 讀到的內容", rows: left });
    return entityOf(`e${e.id}`, e.name, groups.filter((g) => g.rows.length), e.brain.usedChars);
  });

  // 會議——採用的決定已經寫回定位，這裡只列開過幾次、採用幾項。
  const meetingRows: MemRow[] = d.meetings.map((m) => ({
    id: `m${m.id}`, label: m.topic || (en ? "Strategy meeting" : "策略會議"), chars: 0,
    display: en ? `${m.runs} runs · ${m.adopted} adopted` : `開過 ${m.runs} 次 · 採用 ${m.adopted} 項`,
    preview: en ? "Adopted decisions are written into positioning" : "採用的決定已寫進定位，從定位那邊被讀取",
    tag: "stored", keptChars: 0, href: `${base}&cat=meetings`, context: T("meetings"),
  }));

  // 其他：知識庫（隱藏、不讀）、舊版品牌大腦（讀，可忘掉）、人設、自建任務卡、策略工作台。
  const otherCtx = T("other");
  const legacyBrainRows = leftoverRows(brandIdx.leftovers((i) => !!i.legacyRowId), null, otherCtx, "legacy");
  const knowledgeRows: MemRow[] = d.knowledge.map((k) => ({
    id: `k${k.id}`, label: k.title || (en ? "Untitled" : "未命名"), chars: k.chars, preview: k.kind,
    tag: "stored", keptChars: 0, href: null, context: otherCtx,
  }));
  const countRows = makeRows([
    { id: "o-persona", label: en ? "Persona agents" : "人設 Agent", display: countOf(pos._personaAgents, en ? "agents" : "個") },
    { id: "o-cards", label: en ? "Your own task cards" : "自建任務卡", display: countOf(pos._taskCards, en ? "cards" : "張") },
    { id: "o-workbench", label: en ? "Strategy workbench scenarios" : "策略工作台方案", display: countOf(pos._workbench?.scenarios, en ? "scenarios" : "個") },
  ], null, null, otherCtx);

  // 品牌大腦裡讀到、卻沒有對到任何欄位的（例：舊資料的受眾痛點）——放回品牌區，讀到的絕不隱形。
  const brandLeft = leftoverRows(brandIdx.leftovers((i) => !i.legacyRowId && (i.category === "brand" || i.category === "copy" || i.category === "legacy" || i.category === "info")),
    `${base}&cat=positioning`, T("brand"), "brand");
  if (brandLeft.length) brandGroups.push({ title: en ? "Other content the AI reads" : "其他 AI 讀到的內容", rows: brandLeft });

  const single = (key: SectionKey, groups: MemGroup[]): MemSection => section(key, [entityOf(key, T(key), groups.filter((g) => g.rows.length))], false);
  const sections: MemSection[] = [
    single("brand", brandGroups),
    section("product", productEntities, true),
    section("event", eventEntities, true),
    single("copy", [{ title: T("copy"), rows: copyRows }]),
    single("visual", [{ title: T("visual"), rows: visualRows }, { title: en ? "Old-version fields" : "舊版欄位", rows: visualLegacy }]),
    single("info", [{ title: T("info"), rows: infoRows }]),
    single("meetings", [{ title: T("meetings"), rows: meetingRows }]),
    single("other", [
      { title: en ? "Old brand brain (still read)" : "舊版品牌大腦（仍會被讀）", rows: legacyBrainRows },
      { title: en ? "Knowledge base (hidden, not read)" : "知識庫（已隱藏，不會被讀）", rows: knowledgeRows },
      { title: en ? "Other" : "其他", rows: countRows },
    ]),
  ].filter((s) => s.fields > 0);

  const rows = sections.flatMap((s) => s.entities.flatMap((e) => e.groups.flatMap((g) => g.rows)));

  // 最滿的一次寫作：只寫品牌，或寫某個產品／活動（產品＋活動一起寫的組合不列舉）。
  const writes: Array<{ chars: number; name: string | null; extra: Array<{ key: SectionKey; chars: number }> }> = [
    { chars: d.brandBrain.usedChars, name: null, extra: [] },
    ...productEntities.map((p) => ({ chars: p.writeChars ?? 0, name: p.name, extra: [{ key: "product" as SectionKey, chars: p.readChars }] })),
    ...eventEntities.map((e) => ({ chars: e.writeChars ?? 0, name: e.name, extra: [{ key: "event" as SectionKey, chars: e.readChars }] })),
  ];
  const max = writes.reduce((a, w) => (w.chars > a.chars ? w : a), writes[0]!);
  const brandPart = (k: SectionKey) => sections.find((s) => s.key === k)?.readChars ?? 0;
  const composition = [
    { key: "info" as SectionKey, chars: brandPart("info") },
    { key: "brand" as SectionKey, chars: brandPart("brand") },
    { key: "copy" as SectionKey, chars: brandPart("copy") },
    { key: "other" as SectionKey, chars: brandPart("other") },
    ...max.extra,
  ].filter((c) => c.chars > 0);

  const level = rows.some((r) => r.tag === "skipped") ? "over"
    : max.chars >= d.capacity * NEAR_FULL_RATIO ? "near" : "ok";
  return { capacity: d.capacity, maxWrite: { chars: max.chars, name: max.name }, level, sections, rows, composition };
}

function countOf(v: any, unit: string): string | undefined {
  const n = Array.isArray(v) ? v.length : 0;
  return n ? `${n} ${unit}` : undefined;
}

function section(key: SectionKey, entities: MemEntity[], multi: boolean): MemSection {
  const rows = entities.flatMap((e) => e.groups.flatMap((g) => g.rows));
  return {
    key, entities, multi,
    storedChars: rows.reduce((n, r) => n + r.chars, 0),
    readChars: multi ? Math.max(0, ...entities.map((e) => e.readChars)) : rows.reduce((n, r) => n + r.keptChars, 0),
    fields: rows.length,
    skipped: rows.filter((r) => r.tag === "skipped").length,
    partial: rows.filter((r) => r.tag === "partial").length,
  };
}

/* ── 清理建議 ───────────────────────────────────────────────── */

/**
 * 手機「儲存空間」的建議清單。排序照嚴重度：沒讀到 → 舊版品牌大腦 → 只讀前段 →
 * 最佔空間（只在快滿／超載時出現，空間夠的時候不叫用戶刪東西）。
 */
export type CleanupKind = "skipped" | "legacy" | "partial" | "large";
export interface CleanupTip { kind: CleanupKind; rows: MemRow[]; chars: number }

export const LARGE_ROW_CHARS = 600;

export function cleanupTips(v: MemoryView): CleanupTip[] {
  const tips: CleanupTip[] = [];
  const sum = (rs: MemRow[], f: (r: MemRow) => number) => rs.reduce((n, r) => n + f(r), 0);
  const skipped = v.rows.filter((r) => r.tag === "skipped");
  if (skipped.length) tips.push({ kind: "skipped", rows: skipped, chars: sum(skipped, (r) => r.chars) });
  const legacy = v.rows.filter((r) => r.legacyRowId);
  if (legacy.length) tips.push({ kind: "legacy", rows: legacy, chars: sum(legacy, (r) => r.keptChars) });
  const partial = v.rows.filter((r) => r.tag === "partial");
  if (partial.length) tips.push({ kind: "partial", rows: partial, chars: sum(partial, (r) => Math.max(0, r.chars - r.keptChars)) });
  if (v.level !== "ok") {
    const large = v.rows
      .filter((r) => r.tag === "read" && !r.legacyRowId && r.href && r.keptChars >= LARGE_ROW_CHARS)
      .sort((a, b) => b.keptChars - a.keptChars)
      .slice(0, 3);
    if (large.length) tips.push({ kind: "large", rows: large, chars: sum(large, (r) => r.keptChars) });
  }
  return tips;
}

export function fmtChars(n: number): string {
  return n.toLocaleString("en-US");
}
