/**
 * brandFullContext — total context block for a brand.
 *
 * CJ direction (2026-05-07):
 *   "撰寫測試應該掃描過品牌定位；文字、視覺還有知識以及 interim 定位
 *    後，也就是該 brandId 有的所有資料。"
 *
 * Flow this assembles in priority order (most authoritative first):
 *   1. Full pipeline positioning (positioning.<segment>, positioningSchema.ts)
 *   2. Interim quick-pulse (positioning._interim)
 *   3. _assets — 文字 tab content (voice / principles / banned / preferred /
 *      CTA / hook libraries, etc.)
 *   4. Visual assets (logo / colors / fonts) summary
 *
 * Does NOT include real public content (官網 / FB) or knowledge base —
 * those are fetched separately and concatenated by the caller.
 */
import localPool from "../../localDb";

export interface FullBrandContext {
  block: string;             // prompt-injectable text
  hasFullPositioning: boolean;
  hasInterim: boolean;
  hasTextAssets: boolean;
  hasVisualAssets: boolean;
}

const EMPTY: FullBrandContext = {
  block: "",
  hasFullPositioning: false,
  hasInterim: false,
  hasTextAssets: false,
  hasVisualAssets: false,
};

function fmtItems(label: string, items: any): string | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const filtered = items.filter((x: any) => typeof x === "string" && x.trim());
  if (!filtered.length) return null;
  return `${label}：${filtered.join(" / ")}`;
}

function fmtPairs(label: string, pairs: any): string | null {
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  const filtered = pairs
    .filter((p: any) => p && typeof p.from === "string" && typeof p.to === "string" && p.from.trim() && p.to.trim())
    .map((p: any) => `${p.from} → ${p.to}`);
  if (!filtered.length) return null;
  return `${label}：${filtered.join(" / ")}`;
}

export type EntityKind = "brand" | "product" | "event";

/**
 * CJ 2026-05-07: "應用在品牌的規則和設計，也同樣應用在產品和活動"
 * Same context-scan logic applies to product / event scopes — they
 * have their own positioning JSON column.
 * 2026-05-17: brand now also reads the canonical `positioning` column
 * (segment-keyed, positioningSchema.ts shape) — no more soworkAnalysis.
 */
export async function loadFullContext(
  entityKind: EntityKind,
  entityId: number,
): Promise<FullBrandContext> {
  if (!entityId) return EMPTY;
  const table = entityKind === "brand" ? "brands" : entityKind === "product" ? "products" : "events";
  const col   = "positioning";
  try {
    // Brand has many extra columns; product/event have fewer. Select common
    // columns explicitly to avoid Drizzle/MySQL column-mismatch errors.
    const [rows]: any = await localPool.execute(
      entityKind === "brand"
        ? `SELECT \`${col}\` AS payload, name, industry, description, tagline, targetAudience, brandVoice, valueProposition, audienceA, audienceB, emotionalDiff, functionalDiff FROM \`${table}\` WHERE id = ? LIMIT 1`
        : `SELECT \`${col}\` AS payload, name FROM \`${table}\` WHERE id = ? LIMIT 1`,
      [entityId],
    );
    const row = (rows as any[])[0];
    if (!row) return EMPTY;

    let pos: any = row.payload;
    if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
    pos = pos ?? {};

    const lines: string[] = [];

    // ── 1. Entity basics ─────────────────────────────────────────
    const kindLabel = entityKind === "brand" ? "品牌" : entityKind === "product" ? "產品" : "活動";
    lines.push(`【${kindLabel}資訊】`);
    lines.push(`名稱：${row.name ?? ""}`);
    if (row.industry)        lines.push(`產業：${row.industry}`);
    if (row.description)     lines.push(`描述：${row.description}`);
    if (row.tagline)         lines.push(`標語：${row.tagline}`);
    if (row.targetAudience)  lines.push(`目標受眾：${row.targetAudience}`);
    if (row.valueProposition) lines.push(`價值主張：${row.valueProposition}`);
    if (row.brandVoice)      lines.push(`品牌語氣（粗）：${row.brandVoice}`);
    if (row.audienceA || row.audienceB) lines.push(`受眾 A/B：${row.audienceA ?? ""} / ${row.audienceB ?? ""}`);
    if (row.emotionalDiff)   lines.push(`情感差異化：${row.emotionalDiff}`);
    if (row.functionalDiff)  lines.push(`功能差異化：${row.functionalDiff}`);

    // ── 2. Full positioning sections ────────────────────────────────
    // 2026-05-17: canonical positioning.<segment> shape (positioningSchema.ts
    // BRAND_SEGMENTS). Brand & product/event all read this column now.
    const seg: Record<string, any> = pos;
    const hasFullPositioning =
      !!(seg.goldenCircle || seg.differentiation || seg.tagline || seg.voice
        || seg.values || seg.audience || seg.competition);

    if (hasFullPositioning) {
      lines.push("\n【完整定位（品牌定位 pipeline 產出）】");
      if (seg.goldenCircle) {
        const gc = seg.goldenCircle;
        if (gc.why || gc.how || gc.what) {
          lines.push(`Why/How/What：${gc.why ?? ""} / ${gc.how ?? ""} / ${gc.what ?? ""}`);
        }
      }
      if (seg.tagline) {
        const t = seg.tagline;
        if (t.zhTagline) lines.push(`標語（中）：${t.zhTagline}`);
        if (t.enTagline) lines.push(`標語（EN）：${t.enTagline}`);
        if (t.story)     lines.push(`標語故事：${t.story}`);
      }
      if (seg.differentiation) {
        const d = seg.differentiation;
        if (d.emotional)  lines.push(`情感差異化：${d.emotional}`);
        if (d.functional) lines.push(`功能差異化：${d.functional}`);
        if (d.summary)    lines.push(`定位總結：${d.summary}`);
      }
      if (seg.values && Array.isArray(seg.values.items)) {
        const cv = seg.values.items
          .map((it: any) => it?.label).filter((x: any) => typeof x === "string" && x.trim());
        if (cv.length) lines.push(`核心價值：${cv.join(" / ")}`);
      }
      if (seg.voice) {
        const v = seg.voice;
        const ar = fmtItems("品牌原型", v.archetypes); if (ar) lines.push(ar);
        const tn = fmtItems("語調", v.tone);           if (tn) lines.push(tn);
        const fb = fmtItems("溝通禁區", v.forbidden);   if (fb) lines.push(fb);
      }
      if (seg.audience) {
        const ta = seg.audience;
        if (ta.primary)   lines.push(`主要受眾：${String(ta.primary).slice(0, 400)}`);
        if (ta.secondary) lines.push(`次要受眾：${String(ta.secondary).slice(0, 300)}`);
      }
      if (seg.origin?.story) lines.push(`品牌故事：${String(seg.origin.story).slice(0, 400)}`);
    }

    // ── 3. Interim positioning (wants / lacks / fills) ───────────────
    const interim = pos._interim ?? null;
    const hasInterim = !!(interim && (interim.consumerWants || interim.brandFills));
    if (hasInterim) {
      lines.push("\n【臨時定位（消費者想要 / 競品給不了 / 品牌補上）】");
      if (interim.consumerWants)   lines.push(`消費者想要：${interim.consumerWants}`);
      if (interim.competitorLacks) lines.push(`競品給不了：${interim.competitorLacks}`);
      if (interim.brandFills)      lines.push(`品牌補上：${interim.brandFills}`);
      if (interim.tagline && !row.tagline) lines.push(`暫時標語：${interim.tagline}`);
      if (interim.usp)             lines.push(`暫時 USP：${interim.usp}`);
    }

    // ── 4. _assets (文字 tab) ────────────────────────────────────────
    const assets: Record<string, any> = pos._assets ?? {};
    const textAssetLines: string[] = [];
    if (assets.voice?.text)              textAssetLines.push(`整體語氣：${assets.voice.text}`);
    {
      const v = fmtItems("Do/Don't 規則", assets.voice_principles?.items); if (v) textAssetLines.push(v);
    }
    {
      const v = fmtItems("推薦用詞", assets.preferred_terms?.items); if (v) textAssetLines.push(v);
    }
    {
      const v = fmtItems("禁用詞", assets.banned_words?.items); if (v) textAssetLines.push(v);
    }
    {
      const v = fmtPairs("替換對照", assets.term_substitutions?.pairs); if (v) textAssetLines.push(v);
    }
    {
      const v = fmtItems("品牌術語", assets.branded_terms?.items); if (v) textAssetLines.push(v);
    }
    if (assets.product_naming?.text) textAssetLines.push(`產品命名規範：${assets.product_naming.text}`);
    {
      const v = fmtPairs("縮寫對照", assets.abbreviations?.pairs); if (v) textAssetLines.push(v);
    }
    {
      const v = fmtItems("CTA 範本", assets.cta_library?.items); if (v) textAssetLines.push(v);
    }
    {
      const v = fmtItems("Hook 範本", assets.hook_library?.items); if (v) textAssetLines.push(v);
    }
    {
      const v = fmtItems("文案範本", assets.templates_copy?.items); if (v) textAssetLines.push(v);
    }
    const hasTextAssets = textAssetLines.length > 0;
    if (hasTextAssets) {
      lines.push("\n【文字資產（user 自訂）】");
      lines.push(...textAssetLines);
    }

    // ── 5. Visual assets (summary only — full URLs not needed in caption prompt) ─
    const visualLines: string[] = [];
    if (assets.logo?.primaryUrl)   visualLines.push(`Logo：已上傳`);
    if (assets.colors?.primary)    visualLines.push(`主色：${assets.colors.primary}`);
    if (assets.colors?.secondary)  visualLines.push(`輔色：${assets.colors.secondary}`);
    if (assets.fonts?.zh)          visualLines.push(`中文字型：${assets.fonts.zh}`);
    if (assets.fonts?.en)          visualLines.push(`英文字型：${assets.fonts.en}`);
    if (assets.guidelines?.text)   visualLines.push(`設計準則：${String(assets.guidelines.text).slice(0, 200)}`);
    if (assets.imagery_style?.text) visualLines.push(`攝影風格：${String(assets.imagery_style.text).slice(0, 200)}`);
    const hasVisualAssets = visualLines.length > 0;
    if (hasVisualAssets) {
      lines.push("\n【視覺資產】");
      lines.push(...visualLines);
    }

    return {
      block: `\n\n${lines.join("\n")}`,
      hasFullPositioning,
      hasInterim,
      hasTextAssets,
      hasVisualAssets,
    };
  } catch {
    return EMPTY;
  }
}

/** Backwards-compat alias for callers that still pass brandId only. */
export const loadBrandFullContext = (brandId: number) => loadFullContext("brand", brandId);
