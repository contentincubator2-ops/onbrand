/**
 * memoryModel — 「記憶」tray 的純資料層：各區用了多少記憶、存了什麼。
 *
 *   區（品牌／產品／活動／文字／視覺／基本資料，跟策略層 rail 同一套）
 *     → 項目（每個產品、每個活動各一個；其他區只有一個）
 *       → 段落（策略層頁面上的段落標題）→ 欄位（策略層頁面上的欄位名稱）
 *
 * 2026-09-30 CJ 定調：
 *   · 「策略層有品牌、產品、活動、文字、視覺，還有其他真實存入的資料……要精細」→ 存著的逐欄列出，
 *     名稱直接用策略層的 schema（positioningSchema / copyAssets），跟頁面一字不差。
 *   · 「只要看目前各個用量是多少，他再進去決定要不要修改。不要呈現沒讀到、舊版留下的問題，
 *     屬於系統面的問題，不是用戶可以改的」→ 這裡不產生任何狀態標記、清理建議；舊版欄位、
 *     舊版大腦、知識庫也不列。
 *
 * 「用量」＝這一區會被 AI 寫文時讀進記憶的內容字數（用 server 每一行帶的 source 判斷哪些欄位
 * 會被讀）；只存著、AI 不讀的欄位照樣列出，但不算用量。一次寫作只讀一個產品、一個活動，
 * 所以總用量＝品牌＋文字＋基本資料＋最大的產品＋最大的活動。
 *
 * client 不得 value-import server，型別在這裡另寫一份（對應 server/strategy/core/brandMemory.ts）。
 */
import { BRAND_SEGMENTS, PRODUCT_SEGMENTS, EVENT_SEGMENTS, type SegmentSpec } from "../../lib/positioningSchema";
import { COPY_ASSETS, hasContent } from "../../lib/copyAssets";
import type { BrainItem } from "./brainModel";

export interface MemoryBrain { usedChars: number; items: BrainItem[] }

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
}

export interface MemRow {
  id: string;
  label: string;
  /** 存了幾字（圖片、色票這種不算字的是 0，改看 display）。 */
  chars: number;
  /** 不是字數的份量（「5 色」「12 張」）。 */
  display?: string;
  preview: string;
  /** 算不算記憶用量（AI 寫文時會讀）。 */
  counted: boolean;
  /** 在策略層哪一頁改。 */
  href: string;
  /**
   * 到了那一頁直接打開哪一段（BrandsPage 的 section id：定位段落 `seg:<id>`、文字卡 `asset:<key>`）。
   * 2026-09-30（CJ「修改後，要怎麼導引回記憶這個頁面」）：從記憶點過去要落在那一段，不是頁面最上面。
   */
  focus?: string;
}

export interface MemGroup { title: string; rows: MemRow[] }

export interface MemEntity {
  id: string;
  name: string;
  groups: MemGroup[];
  /** 這一項佔的記憶（字）。 */
  usedChars: number;
  fields: number;
}

export type SectionKey = "brand" | "product" | "event" | "copy" | "visual" | "info";

export const SECTION_TEXT: Record<SectionKey, { zh: string; en: string }> = {
  brand: { zh: "品牌", en: "Brand" },
  product: { zh: "產品", en: "Products" },
  event: { zh: "活動", en: "Campaigns" },
  copy: { zh: "文字", en: "Copy" },
  visual: { zh: "視覺", en: "Visual" },
  info: { zh: "基本資料", en: "Info" },
};

export interface MemSection {
  key: SectionKey;
  entities: MemEntity[];
  /** 產品／活動是多個項目，其他區只有一個（點進去直接看段落）。 */
  multi: boolean;
  /** 佔的記憶：單一區是全部加總；產品／活動取最大的那一個（一次只讀一個）。 */
  usedChars: number;
  fields: number;
}

export interface MemoryView {
  capacity: number;
  usedChars: number;
  level: "ok" | "near" | "over";
  /** 固定六區，順序跟策略層 rail 一樣；沒存東西的區也列（用量 0）。 */
  sections: MemSection[];
}

export const NEAR_FULL_RATIO = 0.85;

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

interface RowInput { id: string; label: string; text?: string; display?: string; source?: string; focus?: string }

function makeRows(inputs: RowInput[], read: Set<string>, href: string): MemRow[] {
  return inputs
    .filter((r) => (r.text ?? "") || r.display)
    .map((r) => {
      const text = r.text ?? "";
      return {
        id: r.id, label: r.label, chars: len(text), display: r.display, preview: text.slice(0, 90),
        counted: !!r.source && read.has(r.source), href, ...(r.focus ? { focus: r.focus } : {}),
      };
    });
}

/** 大腦裡有哪些 source 會被寫進 prompt（只存著、寫完才檢查的不算）。 */
const readSources = (b: MemoryBrain) =>
  new Set(b.items.filter((i) => i.status !== "checkOnly" && i.source).map((i) => i.source!));

/** 定位 JSON 依 schema 逐段逐欄攤開；自訂卡片與上傳文件接在後面。 */
function positioningGroups(pos: any, segments: SegmentSpec[], read: Set<string>, href: string, en: boolean, prefix: string): MemGroup[] {
  const p = pos && typeof pos === "object" ? pos : {};
  const groups: MemGroup[] = segments.map((seg) => ({
    title: (en && seg.titleEn) || seg.title,
    rows: makeRows(seg.fields.map((f) => ({
      id: `${prefix}-${seg.id}.${f.key}`, label: f.label, text: textOf(p[seg.id]?.[f.key]), source: `pos:${seg.id}.${f.key}`,
      focus: `seg:${seg.id}`,
    })), read, href),
  }));
  const cards = Array.isArray(p._customSegments) ? p._customSegments : [];
  groups.push({
    title: en ? "Custom cards" : "自訂卡片",
    rows: makeRows(cards.map((c: any, i: number) => {
      const title = String(c?.title ?? "").trim();
      const body = (Array.isArray(c?.fields) ? c.fields : [])
        .map((f: any) => [String(f?.label ?? "").trim(), String(f?.value ?? "").trim()].filter(Boolean).join("："))
        .filter(Boolean).join("；");
      return { id: `${prefix}-custom-${i}`, label: title || (en ? "Untitled card" : "未命名卡片"), text: body, source: `custom:${title}` };
    }), read, href),
  });
  groups.push({
    title: en ? "Uploaded positioning doc" : "上傳的定位文件",
    rows: makeRows([{ id: `${prefix}-doc`, label: en ? "Doc supplement" : "定位文件補充", text: textOf(p._sourceDoc?.injectedContext), source: "doc" }], read, href),
  });
  return groups;
}

function entityOf(id: string, name: string, groups: MemGroup[]): MemEntity {
  const kept = groups.filter((g) => g.rows.length);
  const rows = kept.flatMap((g) => g.rows);
  return { id, name, groups: kept, usedChars: rows.reduce((n, r) => n + (r.counted ? r.chars : 0), 0), fields: rows.length };
}

function sectionOf(key: SectionKey, entities: MemEntity[], multi: boolean): MemSection {
  return {
    key, entities, multi,
    usedChars: multi ? Math.max(0, ...entities.map((e) => e.usedChars)) : entities.reduce((n, e) => n + e.usedChars, 0),
    fields: entities.reduce((n, e) => n + e.fields, 0),
  };
}

const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function buildMemoryView(d: BrandMemoryData, brandId: number, en: boolean): MemoryView {
  const T = (k: SectionKey) => (en ? SECTION_TEXT[k].en : SECTION_TEXT[k].zh);
  const base = `/brands/edit?b=${brandId}`;
  const pos = d.brand.positioning && typeof d.brand.positioning === "object" ? d.brand.positioning : {};
  const brandRead = readSources(d.brandBrain);

  const brand = entityOf("brand", T("brand"), positioningGroups(pos, BRAND_SEGMENTS, brandRead, `${base}&cat=positioning`, en, "brand"));

  const assets = pos._assets && typeof pos._assets === "object" ? pos._assets : {};
  const copy = entityOf("copy", T("copy"), [{
    title: T("copy"),
    rows: makeRows(COPY_ASSETS.filter((spec) => hasContent(assets[spec.key], spec.shape)).map((spec) => {
      const v = assets[spec.key];
      const text = spec.shape === "text" ? textOf(v?.text)
        : spec.shape === "items" ? textOf(v?.items)
        : (Array.isArray(v?.pairs) ? v.pairs.map((x: any) => `${x?.from ?? ""} → ${x?.to ?? ""}`).join(" · ") : "");
      return { id: `copy-${spec.key}`, label: en ? spec.labelEn : spec.labelZh, text, source: `asset:${spec.key}`, focus: `asset:${spec.key}` };
    }), brandRead, `${base}&cat=copy`),
  }]);

  // 視覺——寫文不讀，不算記憶用量；照樣列出存了什麼。
  const vis = (key: string) => assets[key] ?? {};
  const logo = vis("logo");
  const logoCount = [logo.primaryUrl, logo.darkUrl, logo.iconUrl].filter(Boolean).length;
  const visual = entityOf("visual", T("visual"), [{
    title: T("visual"),
    rows: makeRows([
      { id: "vis-dna", label: en ? "Colour DNA" : "品牌色彩 DNA", display: d.visual.swatchCount ? `${d.visual.swatchCount} ${en ? "colours" : "色"}` : undefined, text: d.visual.swatches.join(" ") },
      { id: "vis-logo", label: en ? "Logo" : "標誌", display: logoCount ? `${logoCount} ${en ? "files" : "個檔案"}` : undefined, text: textOf(logo.guidelines) },
      { id: "vis-imagery", label: en ? "Imagery style" : "圖像風格", text: textOf([vis("imagery_style").text, vis("imagery_style").prompt]) },
      { id: "vis-icon", label: en ? "Icon style" : "圖示風格", text: textOf([vis("icon_style").text, vis("icon_style").prompt]) },
      { id: "vis-photos", label: en ? "Brand photos" : "品牌照片", display: d.visual.brandPhotoCount ? `${d.visual.brandPhotoCount} ${en ? "photos" : "張"}` : undefined },
      { id: "vis-guidelines", label: en ? "Visual guidelines" : "視覺準則", text: textOf(vis("guidelines").text) },
      { id: "vis-layout", label: en ? "Layout rules" : "排版規範", text: textOf(vis("layout_rules").text) },
      { id: "vis-chart", label: en ? "Chart style" : "圖表風格", text: textOf(vis("chart_style").text) },
      { id: "vis-templates", label: en ? "Templates" : "品牌範本", text: textOf([vis("templates").links, vis("templates").items]) },
    ], new Set(), `${base}&cat=visual`),
  }]);

  const b = d.brand;
  const socialCount = Object.values(b.socialLinks ?? {}).filter((v) => typeof v === "string" && v.trim()).length;
  const info = entityOf("info", T("info"), [{
    title: T("info"),
    rows: makeRows([
      { id: "info-name", label: en ? "Brand name" : "品牌名稱", text: b.name },
      { id: "info-industry", label: en ? "Industry" : "產業", text: b.industry },
      { id: "info-desc", label: en ? "What the brand does" : "品牌在做什麼", text: b.description },
      { id: "info-tagline", label: en ? "Tagline" : "品牌標語", text: b.tagline, source: "col:tagline" },
      { id: "info-summary", label: en ? "Positioning summary" : "AI 推導的定位摘要", text: b.positioningSummary, source: "col:positioningSummary" },
      { id: "info-market", label: en ? "Market & language" : "市場與語言", text: [b.targetCountry, b.outputLanguage].filter(Boolean).join(" · "), source: "market" },
      { id: "info-web", label: en ? "Website" : "官方網站", text: b.website },
      { id: "info-social", label: en ? "Social links" : "社群連結", display: socialCount ? `${socialCount} ${en ? "links" : "個"}` : undefined },
    ], brandRead, `${base}&cat=info`),
  }]);

  const products = d.products.map((p) => {
    const read = readSources(p.brain);
    const href = `${base}&cat=positioning&p=${p.id}`;
    return entityOf(`p${p.id}`, p.name, [
      { title: en ? "Product card" : "產品卡片", rows: makeRows([
        { id: `p${p.id}-name`, label: en ? "Product name" : "產品名稱", text: p.name, source: "name" },
        { id: `p${p.id}-photos`, label: en ? "Product photos" : "產品照片", display: p.photoCount ? `${p.photoCount} ${en ? "photos" : "張"}` : undefined },
      ], read, href) },
      ...positioningGroups(p.positioning, PRODUCT_SEGMENTS, read, href, en, `p${p.id}`),
    ]);
  });

  const events = d.events.map((e) => {
    const read = readSources(e.brain);
    const href = `${base}&cat=positioning&e=${e.id}`;
    return entityOf(`e${e.id}`, e.name, [
      { title: en ? "Campaign card" : "活動卡片", rows: makeRows([
        { id: `e${e.id}-name`, label: en ? "Campaign name" : "活動名稱", text: e.name, source: "name" },
        { id: `e${e.id}-start`, label: en ? "Start date" : "開始日期", text: fmtDate(e.startAt), source: "startAt" },
        { id: `e${e.id}-end`, label: en ? "End date" : "結束日期", text: fmtDate(e.endAt), source: "endAt" },
      ], read, href) },
      ...positioningGroups(e.positioning, EVENT_SEGMENTS, read, href, en, `e${e.id}`),
    ]);
  });

  const sections: MemSection[] = [
    sectionOf("brand", [brand], false),
    sectionOf("product", products, true),
    sectionOf("event", events, true),
    sectionOf("copy", [copy], false),
    sectionOf("visual", [visual], false),
    sectionOf("info", [info], false),
  ];
  const usedChars = sections.reduce((n, s) => n + s.usedChars, 0);
  const level = usedChars > d.capacity ? "over" : usedChars >= d.capacity * NEAR_FULL_RATIO ? "near" : "ok";
  return { capacity: d.capacity, usedChars, level, sections };
}

export type MemScreen = { section: SectionKey; entity?: string } | null;

/**
 * 點進去的位置寫在網址 ?mem=（`product` / `product.p11`）。
 * 2026-09-30（CJ「當他修改後，要怎麼導引回記憶這個頁面」）：從記憶點欄位去原頁修改時，網址帶
 * from=memory＋mem，原頁上的「回到記憶」按鈕照 mem 回到剛剛那一層，不用重新點進來。
 */
const SECTION_KEYS: SectionKey[] = ["brand", "product", "event", "copy", "visual", "info"];
export function parseMem(raw: string | null): MemScreen {
  if (!raw) return null;
  const [section, entity] = raw.split(".");
  if (!SECTION_KEYS.includes(section as SectionKey)) return null;
  return entity ? { section: section as SectionKey, entity } : { section: section as SectionKey };
}
export const memKey = (s: MemScreen) => (s ? (s.entity ? `${s.section}.${s.entity}` : s.section) : "");

/** 從記憶去原頁修改的網址：帶著回程（from/mem）與要打開的段落（focus）。 */
export function editHrefFromMemory(row: MemRow, s: MemScreen): string {
  const q = new URLSearchParams({ from: "memory" });
  const m = memKey(s);
  if (m) q.set("mem", m);
  if (row.focus) q.set("focus", row.focus);
  return `${row.href}&${q.toString()}`;
}

export function fmtChars(n: number): string {
  return n.toLocaleString("en-US");
}
