/**
 * brandContext — single source of truth for "inject brand_brain into LLM prompts".
 *
 * Every router that calls an LLM on behalf of a brand should pull its
 * system-prompt prefix from `buildBrandPrefix(brandId)` so brand voice,
 * positioning, audience, and guardrails are applied uniformly.
 *
 * If brandId is missing or the table query fails, returns "" so the caller
 * can fall back gracefully to a brand-less prompt.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db";

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

// Cache key includes optional product/event so different scopes don't collide.
const CACHE = new Map<string, { prefix: string; expiresAt: number }>();
const TTL_MS = 60_000; // 1-minute cache — brand_brain edits become visible quickly
const cacheKey = (brandId: number, productId?: number | null, eventId?: number | null) =>
  `${brandId}:${productId ?? 0}:${eventId ?? 0}`;

export interface BrandSummary {
  id: number;
  name: string | null;
  prefix: string; // formatted system-prompt suffix (starts with "\n\n[品牌大腦摘要]\n…")
  entryCount: number;
}

/**
 * Returns a system-prompt suffix string ready to append to any LLM system message.
 * Pulls up to 8 most recently updated brand_brain entries, PLUS:
 *   - if productId set → product name + positioning JSON keys layered after brand
 *   - if eventId   set → event name + dates + positioning JSON layered last
 *
 * Precedence (bottom = wins in prompt-following): brand → product → event.
 * This lets LLM honor brand identity while letting product/event narrow it.
 *
 * 2026-05-11 (CJ「選了 product / event 也要 narrow LLM context」).
 */
/**
 * 2026-05-17 (CJ「所有任務的產出，有遵守品牌大腦的規範嗎？」→ 硬檢查
 * + 自動修正): structured brand-rule assets for the orchestra's
 * post-generation enforcement layer. Soft prompt injection alone never
 * guaranteed adherence; this returns the deterministically-checkable
 * rules from positioning._assets so the orchestra can auto-apply
 * substitutions and detect banned words after generation.
 */
export async function getBrandRuleAssets(
  brandId: number | undefined | null,
): Promise<{ banned: string[]; subs: Array<{ from: string; to: string }>; preferred: string[] }> {
  const empty = { banned: [] as string[], subs: [] as Array<{ from: string; to: string }>, preferred: [] as string[] };
  if (!brandId) return empty;
  try {
    const { default: localPool } = await import("../localDb");
    const [rows]: any = await localPool.execute(
      `SELECT positioning FROM brands WHERE id = ? LIMIT 1`,
      [brandId],
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.positioning) return empty;
    const p = typeof row.positioning === "string" ? safeParse(row.positioning) : row.positioning;
    const a = p?._assets ?? {};
    const strArr = (x: any): string[] =>
      Array.isArray(x?.items) ? x.items.map((s: any) => String(s ?? "").trim()).filter(Boolean)
      : Array.isArray(x) ? x.map((s: any) => String(s ?? "").trim()).filter(Boolean) : [];
    const pairs = Array.isArray(a?.term_substitutions?.pairs)
      ? a.term_substitutions.pairs
          .map((pr: any) => ({ from: String(pr?.from ?? "").trim(), to: String(pr?.to ?? "").trim() }))
          .filter((pr: any) => pr.from && pr.to)
      : [];
    return { banned: strArr(a?.banned_words), subs: pairs, preferred: strArr(a?.preferred_terms) };
  } catch { return empty; }
}

/**
 * 2026-05-17 (CJ「重新檢查，是否所有任務都按照規範」): the single
 * deterministic brand-rule enforcement used by EVERY caption-output
 * boundary (quick-task orchestra, Theater cell/polish, refineCaption).
 * Apply term_substitutions (X→Y); if a banned word survives, rewrite
 * once via anthropic with a hard "must not contain" instruction, then
 * re-apply subs. Fail-safe: any error → returns the input unchanged.
 */
export async function enforceBrandRulesOnText(
  brandId: number | undefined | null,
  text: string,
): Promise<string> {
  if (!brandId || !text || !text.trim()) return text;
  try {
    const rules = await getBrandRuleAssets(brandId);
    if (!rules.subs.length && !rules.banned.length) return text;
    const applySubs = (t: string) => {
      let s = t;
      for (const { from, to } of rules.subs) if (from) s = s.split(from).join(to);
      return s;
    };
    const bannedHits = (t: string) => rules.banned.filter((b) => b && t.includes(b));
    let c = applySubs(text);
    if (bannedHits(c).length) {
      try {
        const { invokeLLM } = await import("./llm");
        const r: any = await invokeLLM({
          provider: "anthropic",
          messages: [{ role: "user", content:
            `改寫以下文字。嚴禁出現這些詞：${bannedHits(c).join("、")}。` +
            (rules.subs.length ? `並務必套用替換：${rules.subs.map((s) => `「${s.from}」改說「${s.to}」`).join("、")}。` : "") +
            `保持原意、語氣、長度與換行，只輸出改寫後文字本身，不要前言：\n\n${c}` }],
          maxTokens: 1200,
        });
        const rewritten = String(r?.content ?? r?.text ?? "").trim();
        if (rewritten) c = applySubs(rewritten);
      } catch { /* keep substituted version */ }
    }
    return c || text;
  } catch { return text; }
}

/**
 * 2026-05-17 (CJ「全部塞進每個任務怕拖慢/稀釋品質」→ 蒸餾+分層):
 * Distil the brand essence into a tight ~500-char digest. Short/atomic
 * tasks inject ONLY this (focused context → faster, cheaper, and
 * usually MORE on-brand — avoids "lost in the middle"). Hard rules
 * (banned/substitutions) are NOT here — the post-gen enforcement layer
 * guarantees them deterministically, so they don't need prompt tokens.
 */
function buildBrandCoreDigest(positioning: any): string {
  if (!positioning || typeof positioning !== "object") return "";
  const a = positioning._assets ?? {};
  const firstSentence = (s: any, n: number) =>
    String(s ?? "").split(/[。\n！？!?]/).map((x) => x.trim()).filter(Boolean)[0]?.slice(0, n) ?? "";
  const lines: string[] = [];
  const tagline = positioning.tagline?.zhTagline ?? positioning.tagline?.enTagline;
  if (tagline) lines.push(`標語：${String(tagline).slice(0, 60)}`);
  const posOneLiner = positioning.differentiation?.summary;
  if (posOneLiner) lines.push(`定位：${String(posOneLiner).slice(0, 120)}`);
  const tone = Array.isArray(positioning.voice?.tone) ? positioning.voice.tone.slice(0, 5).join("、") : "";
  if (tone) lines.push(`語氣：${tone}`);
  const aud = firstSentence(positioning.audience?.primary, 100);
  if (aud) lines.push(`主受眾：${aud}`);
  const diff = firstSentence(positioning.differentiation?.emotional, 110)
    || firstSentence(positioning.differentiation?.functional, 110);
  if (diff) lines.push(`核心差異：${diff}`);
  const story = firstSentence(positioning.origin?.story, 110);
  if (story) lines.push(`品牌故事精華：${story}`);
  const pref = Array.isArray(a.preferred_terms?.items)
    ? a.preferred_terms.items.filter((s: any) => String(s ?? "").trim()).slice(0, 8).join("、") : "";
  if (pref) lines.push(`偏好用詞：${pref}`);
  if (!lines.length) return "";
  return "\n\n[品牌核心 — 所有產出必須貼合此精神]\n" + lines.map((l) => `- ${l}`).join("\n") + "\n";
}

/**
 * mode:
 *   "core" — distilled digest only (default for short/atomic tasks:
 *            30s/60s caption, hooks, KOL DM, Theater cells, inline
 *            rewrite). Lean, focused, on-brand without bloat.
 *   "full" — full rich block (strategic/long-form: 100s, document
 *            tasks, manifesto/PR-full) that genuinely need golden
 *            circle / story / competition depth.
 */
export async function buildBrandPrefix(
  brandId: number | undefined | null,
  productId?: number | null,
  eventId?: number | null,
  mode: "core" | "full" = "full",
): Promise<string> {
  if (!brandId) return "";

  const ck = `${cacheKey(brandId, productId, eventId)}:${mode}`;
  const cached = CACHE.get(ck);
  if (cached && cached.expiresAt > Date.now()) return cached.prefix;

  try {
    const db = await getDb();
    if (!db) return "";

    // 2026-05-11 (CJ direction「定義儲存/讀取規格」):
    // brand.positioning JSON is the SINGLE SOURCE OF TRUTH. Wizard +
    // positioningJobRunner both write to this column. Older
    // tagline/positioningSummary/positioningReport top-level columns
    // are LEGACY and usually NULL — still read for backward compat
    // but should not be relied on.
    const { default: localPool } = await import("../localDb");
    const [brandRowsRaw]: any = await localPool.execute(
      `SELECT name, tagline, positioningSummary, positioningReport, positioningStatus, positioning
       FROM brands WHERE id = ? LIMIT 1`,
      [brandId],
    );
    const brandRow = Array.isArray(brandRowsRaw) ? brandRowsRaw[0] : null;

    // Parse the canonical positioning JSON.
    const positioning: any = (() => {
      if (!brandRow?.positioning) return null;
      if (typeof brandRow.positioning === "string") return safeParse(brandRow.positioning);
      return brandRow.positioning;
    })();

    // Distilled core — short tasks get this (+ product/event narrowing)
    // instead of the full heavy block. Chosen at final assembly.
    const coreDigest = buildBrandCoreDigest(positioning);

    const [rows] = (await db.execute(
      sql`SELECT category, title, content
          FROM brand_brain
          WHERE brand_id = ${brandId}
          ORDER BY updated_at DESC
          LIMIT 8`
    )) as any;

    // ── BLOCK 1: 鎖定屬性（tagline / archetype / WHY / HOW from positioning JSON） ──
    const brandLocked: string[] = [];

    // tagline can be: legacy top-level string, OR positioning.tagline.{zhTagline,enTagline,story}
    const tlObj = positioning?.tagline;
    if (tlObj && typeof tlObj === "object") {
      if (tlObj.zhTagline) brandLocked.push(`【Tagline 中】${tlObj.zhTagline}`);
      if (tlObj.enTagline) brandLocked.push(`【Tagline EN】${tlObj.enTagline}`);
    } else if (typeof tlObj === "string" && tlObj.trim()) {
      brandLocked.push(`【Tagline】${tlObj}`);
    } else if (brandRow?.tagline) {
      brandLocked.push(`【Tagline (legacy)】${brandRow.tagline}`);
    }

    // archetype: positioning.voice.archetypes (array) OR legacy positioningReport.archetype
    const archetypes = positioning?.voice?.archetypes;
    if (Array.isArray(archetypes) && archetypes.length > 0) {
      brandLocked.push(`【Archetype】${archetypes.join(" / ")}`);
    } else if (brandRow?.positioningReport) {
      try {
        const rep = typeof brandRow.positioningReport === "string" ? JSON.parse(brandRow.positioningReport) : brandRow.positioningReport;
        const arch = rep?.archetype ?? rep?.brandArchetype ?? rep?.archetypePrimary;
        if (arch) brandLocked.push(`【Archetype (legacy)】${typeof arch === "string" ? arch : JSON.stringify(arch).slice(0, 200)}`);
      } catch {}
    }

    // golden circle: positioning.goldenCircle.{why,how,what}
    const gc = positioning?.goldenCircle;
    if (gc && typeof gc === "object") {
      if (gc.why) brandLocked.push(`【WHY (信念)】${String(gc.why).slice(0, 400)}`);
      if (gc.how) brandLocked.push(`【HOW (作法)】${String(gc.how).slice(0, 400)}`);
      if (gc.what) brandLocked.push(`【WHAT (產品/服務)】${String(gc.what).slice(0, 300)}`);
    }

    // positioningSummary (legacy)
    if (brandRow?.positioningSummary) brandLocked.push(`【定位摘要 (legacy)】${brandRow.positioningSummary}`);

    // ── BLOCK 2: VOICE 完整指引 — 這是「中英夾雜變全中文」的關鍵修法 ──
    // CJ direction「你好中文有跑了定位...每個 brand 都是相同處理方式」:
    // positioning.voice 裡有 tone/samples/forbidden，必須完整餵給 LLM。
    const voiceBlock: string[] = [];
    const voice = positioning?.voice;
    if (voice && typeof voice === "object") {
      if (Array.isArray(voice.tone) && voice.tone.length > 0) {
        voiceBlock.push(`tone keywords: ${voice.tone.join(" / ")}`);
      }
      if (Array.isArray(voice.forbidden) && voice.forbidden.length > 0) {
        voiceBlock.push(`✗ 禁用詞彙 / 句式：\n  ${voice.forbidden.slice(0, 8).map((x: string) => `· ${x}`).join("\n  ")}`);
      }
      // SAMPLES are the highest-value training signal (CJ's bilingual / 中英夾雜 use case)
      if (Array.isArray(voice.samples) && voice.samples.length > 0) {
        const samp = voice.samples.slice(0, 4).map((s: any, i: number) => {
          const ours = s.ours ?? s.good ?? s.brand;
          const generic = s.generic ?? s.bad ?? s.wrong;
          if (!ours) return null;
          return `  範例 ${i + 1}：\n    ✓ 我們會寫：${ours}\n    ✗ 不要寫：${generic ?? "(略)"}`;
        }).filter(Boolean).join("\n");
        if (samp) voiceBlock.push(`【模仿這些範例的口吻】\n${samp}`);
      }
    }

    // ── BLOCK 3: _assets — wizard 寫出的具體寫手指引 ──
    const assetsBlock: string[] = [];
    const assets = positioning?._assets;
    if (assets && typeof assets === "object") {
      const grab = (key: string, label: string, max = 300) => {
        const a = assets[key];
        if (!a) return;
        if (typeof a.text === "string" && a.text.trim()) {
          assetsBlock.push(`【${label}】${a.text.trim().slice(0, max)}`);
        } else if (Array.isArray(a.items) && a.items.length > 0) {
          assetsBlock.push(`【${label}】${a.items.slice(0, 8).join(" · ")}`);
        } else if (Array.isArray(a.pairs) && a.pairs.length > 0) {
          const ps = a.pairs.slice(0, 5).map((p: any) => `${p.from ?? "?"} → ${p.to ?? "?"}`).join(" · ");
          assetsBlock.push(`【${label}】${ps}`);
        }
      };
      grab("voice", "聲音指南", 600);
      grab("voice_principles", "聲音原則");
      grab("preferred_terms", "偏好用詞");
      // 2026-05-17: banned_words / term_substitutions removed from the
      // prompt — the post-gen enforcement layer guarantees them
      // deterministically, so they no longer need prompt tokens.
      grab("cta_library", "CTA 範例");
      grab("audience", "目標受眾");
    }

    // ── BLOCK 4: origin 故事 + audience（次要 grounding） ──
    const contextBlock: string[] = [];
    if (positioning?.origin?.story) {
      contextBlock.push(`【品牌故事】${String(positioning.origin.story).slice(0, 400)}`);
    }
    if (positioning?.audience && typeof positioning.audience === "object") {
      const aud = positioning.audience;
      if (aud.primary) contextBlock.push(`【主要受眾】${String(aud.primary).slice(0, 200)}`);
      if (aud.painPoints && Array.isArray(aud.painPoints)) {
        contextBlock.push(`【受眾痛點】${aud.painPoints.slice(0, 3).join(" · ")}`);
      }
    }
    if (positioning?.differentiation) {
      const d = positioning.differentiation;
      if (typeof d === "string") contextBlock.push(`【差異化】${d.slice(0, 300)}`);
      else if (d.summary) contextBlock.push(`【差異化】${String(d.summary).slice(0, 300)}`);
    }

    // ── 2026-05-11 (CJ): product + event positioning overlays ──
    let productSection = "";
    if (productId) {
      try {
        const [prodRows]: any = await localPool.execute(
          `SELECT name, positioning FROM products WHERE id = ? LIMIT 1`,
          [productId],
        );
        const p = Array.isArray(prodRows) ? prodRows[0] : null;
        if (p) {
          const lines: string[] = [`【產品名稱】${p.name ?? "(未命名)"}`];
          if (p.positioning) {
            const pp = typeof p.positioning === "string" ? safeParse(p.positioning) : p.positioning;
            if (pp && typeof pp === "object") {
              if (pp.usp) lines.push(`【產品 USP】${String(pp.usp).slice(0, 300)}`);
              if (pp.target) lines.push(`【產品目標客群】${String(pp.target).slice(0, 200)}`);
              if (pp.tagline) lines.push(`【產品 Slogan】${String(pp.tagline).slice(0, 100)}`);
              if (pp.description) lines.push(`【產品描述】${String(pp.description).slice(0, 400)}`);
              if (pp.keyMessages && Array.isArray(pp.keyMessages)) {
                lines.push(`【產品關鍵訊息】${pp.keyMessages.slice(0, 4).join(" · ")}`);
              }
            }
          }
          productSection = "\n[本次產出聚焦的產品 — 必須圍繞此產品撰寫]\n" + lines.map(l => `- ${l}`).join("\n") + "\n";
        }
      } catch {/* non-fatal */}
    }

    let eventSection = "";
    if (eventId) {
      try {
        const [evRows]: any = await localPool.execute(
          `SELECT name, startAt, endAt, positioning FROM events WHERE id = ? LIMIT 1`,
          [eventId],
        );
        const e = Array.isArray(evRows) ? evRows[0] : null;
        if (e) {
          const lines: string[] = [`【活動名稱】${e.name ?? "(未命名活動)"}`];
          if (e.startAt) {
            const start = new Date(e.startAt);
            lines.push(`【活動開始】${start.toLocaleDateString("zh-TW")}`);
            const now = new Date();
            const daysLeft = Math.ceil((start.getTime() - now.getTime()) / 86400_000);
            if (daysLeft > 0) lines.push(`【倒數】還有 ${daysLeft} 天 — 可以做倒數 hook / 預熱`);
            else if (daysLeft === 0) lines.push(`【倒數】今天就是活動日`);
            else lines.push(`【活動】已開始 ${-daysLeft} 天`);
          }
          if (e.endAt) lines.push(`【活動結束】${new Date(e.endAt).toLocaleDateString("zh-TW")}`);
          if (e.positioning) {
            const ep = typeof e.positioning === "string" ? safeParse(e.positioning) : e.positioning;
            if (ep && typeof ep === "object") {
              if (ep.theme) lines.push(`【活動主軸】${String(ep.theme).slice(0, 200)}`);
              if (ep.cta) lines.push(`【活動 CTA】${String(ep.cta).slice(0, 100)}`);
              if (ep.offer) lines.push(`【活動優惠】${String(ep.offer).slice(0, 200)}`);
              if (ep.audience) lines.push(`【活動受眾】${String(ep.audience).slice(0, 200)}`);
            }
          }
          eventSection = "\n[本次產出對應的活動 — 必須提及活動 / 時程 / 主軸]\n" + lines.map(l => `- ${l}`).join("\n") + "\n";
        }
      } catch {/* non-fatal */}
    }

    const hasAny =
      (rows && rows.length > 0) ||
      brandLocked.length > 0 ||
      voiceBlock.length > 0 ||
      assetsBlock.length > 0 ||
      contextBlock.length > 0 ||
      coreDigest ||
      productSection ||
      eventSection;
    if (!hasAny) {
      CACHE.set(ck, { prefix: "", expiresAt: Date.now() + TTL_MS });
      return "";
    }

    const lockedSection = brandLocked.length > 0
      ? "\n[品牌已鎖定屬性 — 最高優先級，所有產出都要符合]\n" + brandLocked.map(l => `- ${l}`).join("\n") + "\n"
      : "";

    const voiceSection = voiceBlock.length > 0
      ? "\n[品牌聲音指南 — 嚴格遵守，這是品牌的「人聲」]\n" + voiceBlock.join("\n") + "\n"
      : "";

    const assetsSection = assetsBlock.length > 0
      ? "\n[寫手指引 — 用詞 / CTA / 受眾規範]\n" + assetsBlock.map(l => `- ${l}`).join("\n") + "\n"
      : "";

    const contextSection = contextBlock.length > 0
      ? "\n[補充脈絡 — 品牌故事 / 受眾 / 差異化]\n" + contextBlock.map(l => `- ${l}`).join("\n") + "\n"
      : "";

    const brainSection = rows && rows.length > 0
      ? "\n[品牌大腦補充條目]\n" +
        rows.map((r: any) => `- 【${r.category}】${r.title}：${r.content}`).join("\n") + "\n"
      : "";

    // 順序：鎖定屬性 → 聲音指南（含中英夾雜 samples）→ 寫手指引 →
    // 脈絡 → 補充 → product/event narrow。
    // LLM 對「靠後出現」內容更易執行，product/event 放最後。
    const fullPrefix =
      "\n\n" + lockedSection + voiceSection + assetsSection + contextSection + brainSection + productSection + eventSection;
    // mode="core" → distilled digest + product/event narrowing (short
    // tasks). SAFETY: if coreDigest is empty (brand not re-run after the
    // single-source refactor → positioning has no segments yet), fall
    // back to the full block so un-migrated brands don't silently lose
    // ALL brand grounding on short tasks. mode="full" → rich block.
    const prefix = (mode === "core" && coreDigest)
      ? coreDigest + productSection + eventSection
      : fullPrefix;

    CACHE.set(ck, { prefix, expiresAt: Date.now() + TTL_MS });
    return prefix;
  } catch {
    return "";
  }
}

/**
 * Lightweight summary used by procedures that want to log or surface
 * "we did inject brand X" feedback to the client.
 */
export async function getBrandSummary(
  brandId: number | undefined | null
): Promise<BrandSummary | null> {
  if (!brandId) return null;
  try {
    const db = await getDb();
    if (!db) return null;

    const [nameRows] = (await db.execute(
      sql`SELECT name FROM brands WHERE id = ${brandId} LIMIT 1`
    )) as any;
    const [countRows] = (await db.execute(
      sql`SELECT COUNT(*) AS c FROM brand_brain WHERE brand_id = ${brandId}`
    )) as any;

    const prefix = await buildBrandPrefix(brandId);
    return {
      id: brandId,
      name: nameRows?.[0]?.name ?? null,
      prefix,
      entryCount: Number(countRows?.[0]?.c ?? 0),
    };
  } catch {
    return null;
  }
}

/** Test-only: clear the cache. */
export function _clearBrandPrefixCache() {
  CACHE.clear();
}
