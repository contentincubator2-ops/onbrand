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
import { getDb } from "../../db";
import { buildMarketContext } from "./marketProfiles";

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * 2026-09-01 — 依 canonical dot-path 取值並排進 prompt 行。
 *
 * 產品與活動的區塊本來是手寫的 `if (pp.usp) …`，路徑全是 PRODUCT_SEGMENTS /
 * EVENT_SEGMENTS 裡不存在的舊 key，於是那兩層定位從來沒進過 prompt。改成
 * 走登錄表的原因是：路徑寫在一起就看得出對不對，而且能被 positioningDocs 的
 * PROMPT_FIELDS 拿去做落差報告 —— 「哪幾格會影響產出」不能有兩份各自維護的答案。
 *
 * 值可能是字串或字串陣列（canonical 的 array 欄位，例如 audience.pains）。
 * 物件與 tableRows 一律跳過：把它們 String() 出來就是 "[object Object]"，
 * 這正是活動受眾原本在做的事。
 */
function pushFrom(
  lines: string[],
  obj: any,
  specs: [path: string, label: string, max: number][],
): void {
  for (const [path, label, max] of specs) {
    const v = path.split(".").reduce<any>((acc, k) => (acc == null ? acc : acc[k]), obj);
    if (v == null) continue;
    let text = "";
    if (typeof v === "string") text = v.trim();
    else if (Array.isArray(v)) text = v.filter((x) => typeof x === "string" && x.trim()).join(" · ");
    else continue;                       // 物件 / tableRows：沒有安全的一行表示法
    if (!text) continue;
    lines.push(`【${label}】${text.slice(0, max)}`);
  }
}

/**
 * 用戶上傳的定位文件裡，對不到任何 canonical 欄位、但他選擇照樣餵進來的段落。
 *
 * 存在的理由是 CJ 的「按照用戶有的內容呈現，不一定要填完我們設定的題目」——
 * 沒有這條，用戶文件裡我們沒問到的東西就等於白上傳。上限在寫入端就卡死
 * （positioningDocs.MAX_INJECTED_CHARS），這裡不再截，截兩次會把句子切一半。
 */
function pushSourceDoc(lines: string[], pos: any, label: string): void {
  const text = String(pos?._sourceDoc?.injectedContext ?? "").trim();
  if (text) lines.push(`【${label}】
${text}`);
}

/**
 * 2026-09-23（CJ「品牌定位…也可以自訂新增欄位」）：使用者自己開的定位卡片
 * （positioning._customSegments[]，例如「品牌願景」）—— 跟固定欄位一樣要進
 * prompt，不然這張卡就只是畫面上的裝飾，違背了「定位是所有任務的上游」這件事。
 * 每張卡最多帶 3 格，總長度設上限（跟 pushSourceDoc 的補充段落同一個道理：
 * prompt 本來就吃不下太多字，塞多了只會稀釋品牌前綴）。
 */
function pushCustomSegments(lines: string[], pos: any): void {
  const segs = Array.isArray(pos?._customSegments) ? pos._customSegments : [];
  for (const s of segs) {
    const title = String(s?.title ?? "").trim();
    const fields = Array.isArray(s?.fields) ? s.fields : [];
    if (!title || fields.length === 0) continue;
    const body = fields
      .slice(0, 3)
      .map((f: any) => `${String(f?.label ?? "").trim()}：${String(f?.value ?? "").trim()}`)
      .filter((l: string) => l !== "：")
      .join("；");
    if (body) lines.push(`【${title}】${body.slice(0, 500)}`);
  }
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
export interface BrandRuleAssets {
  banned: string[];
  subs: Array<{ from: string; to: string }>;
  preferred: string[];
}

export interface BrandRuleAssetsLoadResult {
  rules: BrandRuleAssets;
  loaded: boolean;
}

export async function getBrandRuleAssetsWithStatus(
  brandId: number | undefined | null,
): Promise<BrandRuleAssetsLoadResult> {
  const empty = { banned: [] as string[], subs: [] as Array<{ from: string; to: string }>, preferred: [] as string[] };
  if (!brandId) return { rules: empty, loaded: true };
  try {
    const { default: localPool } = await import("../../localDb");
    const [rows]: any = await localPool.execute(
      `SELECT id, positioning FROM brands WHERE id = ? LIMIT 1`,
      [brandId],
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.id) return { rules: empty, loaded: false };
    if (!row?.positioning) return { rules: empty, loaded: true };
    const p = typeof row.positioning === "string" ? safeParse(row.positioning) : row.positioning;
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      return { rules: empty, loaded: false };
    }
    const a = p?._assets ?? {};
    const strArr = (x: any): string[] =>
      Array.isArray(x?.items) ? x.items.map((s: any) => String(s ?? "").trim()).filter(Boolean)
      : Array.isArray(x) ? x.map((s: any) => String(s ?? "").trim()).filter(Boolean) : [];
    const pairs = Array.isArray(a?.term_substitutions?.pairs)
      ? a.term_substitutions.pairs
          .map((pr: any) => ({ from: String(pr?.from ?? "").trim(), to: String(pr?.to ?? "").trim() }))
          .filter((pr: any) => pr.from && pr.to)
      : [];
    return {
      rules: { banned: strArr(a?.banned_words), subs: pairs, preferred: strArr(a?.preferred_terms) },
      loaded: true,
    };
  } catch {
    return { rules: empty, loaded: false };
  }
}

export async function getBrandRuleAssets(
  brandId: number | undefined | null,
): Promise<BrandRuleAssets> {
  return (await getBrandRuleAssetsWithStatus(brandId)).rules;
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
  const r = await enforceBrandRulesOnTextWithReport(brandId, text);
  return r.text;
}

/**
 * 2026-06-05 (CJ「不阻擋，事後解釋」): same enforcement logic but ALSO
 * returns what was fixed so the UI layer can surface a friendly nudge
 * ("我發現你寫了「X」，但你品牌定位裡標為禁用詞，已自動改寫成「Y」。
 *   想調整定位？") instead of silently rewriting.
 */
export async function enforceBrandRulesOnTextWithReport(
  brandId: number | undefined | null,
  text: string,
): Promise<{
  text: string;
  bannedHits: string[];
  subsApplied: Array<{ from: string; to: string }>;
  rewrittenByLLM: boolean;
}> {
  const empty = { text, bannedHits: [] as string[], subsApplied: [] as Array<{ from: string; to: string }>, rewrittenByLLM: false };
  if (!brandId || !text || !text.trim()) return empty;
  try {
    const rules = await getBrandRuleAssets(brandId);
    if (!rules.subs.length && !rules.banned.length) return empty;

    // Detect which subs actually apply to this text (for reporting)
    const subsApplied = rules.subs.filter(({ from }) => from && text.includes(from));
    const applySubs = (t: string) => {
      let s = t;
      for (const { from, to } of rules.subs) if (from) s = s.split(from).join(to);
      return s;
    };
    const findBannedHits = (t: string) => rules.banned.filter((b) => b && t.includes(b));

    // Detect banned words BEFORE applying subs (subs may already neutralize some)
    const bannedHits = findBannedHits(text);

    let c = applySubs(text);
    let rewrittenByLLM = false;
    const surviving = findBannedHits(c);

    if (surviving.length) {
      try {
        const { invokeLLM } = await import("../../platform/core/llm");
        const r: any = await invokeLLM({
          provider: "anthropic",
          messages: [{ role: "user", content:
            `改寫以下文字。嚴禁出現這些詞：${surviving.join("、")}。` +
            (rules.subs.length ? `並務必套用替換：${rules.subs.map((s) => `「${s.from}」改說「${s.to}」`).join("、")}。` : "") +
            `保持原意、語氣、長度與換行，只輸出改寫後文字本身，不要前言：\n\n${c}` }],
          maxTokens: 1200,
        });
        const rewritten = String(r?.content ?? r?.text ?? "").trim();
        if (rewritten) {
          c = applySubs(rewritten);
          rewrittenByLLM = true;
        }
      } catch { /* keep substituted version */ }
    }
    return {
      text: c || text,
      bannedHits,
      subsApplied,
      rewrittenByLLM,
    };
  } catch { return empty; }
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
  // 2026-09-23（缺口稽核 — CJ「品牌定位內容是否為 AI 能清楚解析的格式」）：
  // 核心價值觀是「為什麼」層次的判斷準則，短任務也用得上，只放標籤（不放
  // 說明），跟語氣關鍵詞同一個精簡等級——完整版（含說明）在 full mode 的
  // contextBlock 裡。belief5Layers / competition 屬於策略深挖，留給 full
  // mode，不進這份精簡 digest。
  const values = Array.isArray(positioning.values?.items)
    ? positioning.values.items.filter((v: any) => v?.label).slice(0, 5).map((v: any) => v.label).join("、")
    : "";
  if (values) lines.push(`核心價值觀：${values}`);
  const aud = firstSentence(positioning.audience?.primary, 100);
  if (aud) lines.push(`主受眾：${aud}`);
  const diff = firstSentence(positioning.differentiation?.emotional, 110)
    || firstSentence(positioning.differentiation?.functional, 110);
  if (diff) lines.push(`核心差異：${diff}`);
  // 2026-09-23：discriminator 是唯一一條、比 summary 更尖銳的致勝理由——
  // 短任務尤其需要一句夠尖的 hook，值得跟標語同級放進精簡 digest。
  const discriminator = positioning.differentiation?.discriminator;
  if (discriminator) lines.push(`致勝理由：${String(discriminator).slice(0, 60)}`);
  const story = firstSentence(positioning.origin?.story, 110);
  if (story) lines.push(`品牌故事精華：${story}`);
  const pref = Array.isArray(a.preferred_terms?.items)
    ? a.preferred_terms.items.filter((s: any) => String(s ?? "").trim()).slice(0, 8).join("、") : "";
  if (pref) lines.push(`偏好用詞：${pref}`);

  // 2026-06-03 (CJ): 加回 voice sample 和聲音原則到短任務 digest。
  // voice samples（真實貼文範例）是最高價值的語氣訊號，之前被切掉了。
  // 只取第一個範例，控制 token 使用量。
  const posVoice = positioning?.voice;
  const voiceSamples: any[] = [
    // positioning.voice.samples (top-level, manual + FB import)
    ...(Array.isArray(posVoice?.samples) ? posVoice.samples : []),
    // _assets.voice.items (FB import alternative path)
    ...(Array.isArray(a.voice?.items) ? a.voice.items : []),
  ];
  const bestSample = voiceSamples.find((s: any) => s?.ours && String(s.ours).trim().length > 10);
  if (bestSample?.ours) {
    lines.push(`語氣示範 ✓「${String(bestSample.ours).slice(0, 100)}」`);
  }

  // 聲音原則（前 3 條）
  const vp = Array.isArray(a.voice_principles?.items)
    ? a.voice_principles.items.filter((s: any) => String(s ?? "").trim()).slice(0, 3).join(" · ")
    : "";
  if (vp) lines.push(`聲音原則：${vp}`);

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
    const { default: localPool } = await import("../../localDb");
    const [brandRowsRaw]: any = await localPool.execute(
      `SELECT name, tagline, positioningSummary, positioningReport, positioningStatus, positioning,
              targetCountry, outputLanguage, marketContextOverride
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
      // 2026-09-23：唯一致勝理由跟支撐證據分開列——長任務有空間讓 AI 真的
      // 引用證據撐起主張，不是只複述一句總結。
      if (d && typeof d === "object" && d.discriminator) contextBlock.push(`【唯一致勝理由】${String(d.discriminator).slice(0, 100)}`);
      if (d && typeof d === "object" && d.reasonToBelieve) contextBlock.push(`【支撐證據】${String(d.reasonToBelieve).slice(0, 300)}`);
    }
    // 2026-09-23（缺口稽核）：values / origin.belief5Layers / competition 三個
    // segment 原本就在 schema 裡、writer 也會生成內容，但三個 reader 都沒讀過
    // ——tableRows 型態被 pushFrom() 直接跳過，也沒有手動補寫。使用者填了這幾
    // 格，AI 寫文案時完全看不到。這裡補上，跟 discriminator/reasonToBelieve
    // 走同一條「發現落差 → brandContext + aiBrief + positioningDocs 三處同步」
    // 的路。只挑對文案最有用的子欄位（競爭的 indirect / trends / matrix 這類
    // 純策略規劃用的表格，仍刻意不塞進 prompt，避免稀釋品牌前綴）。
    if (positioning?.values?.items && Array.isArray(positioning.values.items)) {
      const vals = positioning.values.items
        .filter((v: any) => v?.label)
        .slice(0, 5)
        .map((v: any) => (v.body ? `${v.label}（${String(v.body).slice(0, 60)}）` : v.label))
        .join("、");
      if (vals) contextBlock.push(`【核心價值觀】${vals}`);
    }
    if (positioning?.origin?.belief5Layers && Array.isArray(positioning.origin.belief5Layers)) {
      const layers = positioning.origin.belief5Layers
        .filter((l: any) => l?.body)
        .slice(0, 5)
        .map((l: any) => String(l.body).slice(0, 90))
        .join(" → ");
      if (layers) contextBlock.push(`【信念五層深挖】${layers}`);
    }
    if (positioning?.competition && typeof positioning.competition === "object") {
      const comp = positioning.competition;
      if (comp.intensity) contextBlock.push(`【競爭強度】${String(comp.intensity).slice(0, 150)}`);
      if (Array.isArray(comp.direct) && comp.direct.length) {
        const d2 = comp.direct
          .slice(0, 3)
          .map((x: any) => {
            const edge = x.ourEdge ? `我方優勢：${String(x.ourEdge).slice(0, 60)}`
              : x.weakness ? `對方弱點：${String(x.weakness).slice(0, 60)}` : "";
            return [x.name, edge].filter(Boolean).join(" — ");
          })
          .filter(Boolean)
          .join("；");
        if (d2) contextBlock.push(`【直接競品】${d2}`);
      }
      if (comp.map) contextBlock.push(`【競爭定位地圖】${String(comp.map).slice(0, 200)}`);
    }
    // 用戶自己上傳的品牌定位文件裡，我們沒有對應欄位可放、但他要求照樣帶進來
    // 的段落。放在 contextBlock 最後 —— 它是補充，不該蓋過上面那些鎖定屬性。
    pushSourceDoc(contextBlock, positioning, "品牌定位文件補充");
    pushCustomSegments(contextBlock, positioning);

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
              // 2026-09-01: 這裡本來讀 pp.usp / pp.target / pp.tagline /
              // pp.description / pp.keyMessages —— PRODUCT_SEGMENTS 裡一個都
              // 沒有。產品定位的 writer 早就改成 canonical（core / audience /
              // value / competition / strategy / marketing，commit 60c9323b），
              // 但這個 reader 沒跟著改，所以**產品定位從來沒進過 prompt**，
              // 只有產品名稱進去了。定位頁滿的、任務卻寫得像沒選產品。
              //
              // 記憶裡記的是「三個 reader 要同步」；這是第四個，而且是唯一
              // 一個真的影響產出品質的。
              pushFrom(lines, pp, [
                // 2026-09-25（CJ「明明我在此產品中，有寫價格，但是產品顧問，還是
                // 重複問我價格」）：售價在 positioning 頂層的 `price`（不在任何
                // segment 裡），所以下面那串 canonical 路徑一個都撈不到它。
                // 上面 2026-09-23 那次寫「pricing/channel 這類純策略規劃欄位不補」
                // ——**售價不是策略規劃，是事實**，而且這份 prefix 現在還餵給產品
                // 策略總監（strategistChatRouter），他看不到價格就只能反問。
                ["price",                    "產品售價",     60],
                ["core.coreStatement",       "產品核心定位", 400],
                ["core.zhTagline",           "產品 Slogan",  100],
                // 2026-09-23（缺口稽核 — 同一套手法再對一次產品定位）：
                // writer（positioningSteps.ts buildProductPositioningSteps）
                // 一直都會產出以下欄位，但這個 reader 沒跟著讀，等於白寫。
                // 只挑高價值的（跟品牌那次一樣的判準：直接影響文案語氣/賣點
                // 論述的才補，pricing/channel 這類純策略規劃欄位不補）。
                ["core.enTagline",           "產品英文標語", 100],
                ["core.oneLineValueProp",    "一句話價值主張", 200],
                ["audience.primary",         "產品目標客群", 250],
                ["audience.pains",           "客群痛點",     250],
                ["value.coreFunctions",      "核心功能",     250],
                ["value.primaryEmotion",     "主要情緒價值", 150],
                ["value.personality",        "產品個性",     150],
                ["value.userFeeling",        "使用者感受",   200],
                ["competition.uniqueUsp",    "獨家賣點",     300],
                ["competition.rareUsp",      "次級賣點",     200],
                ["competition.commonUsp",    "普遍賣點",     200],
                ["marketing.tone",           "產品語氣",     200],
                ["marketing.style",          "溝通風格",     200],
                ["marketing.keywords",       "關鍵詞彙",     200],
              ]);
              // competitors 是 tableRows（[{name,position}]），pushFrom 對物件
              // 陣列沒有安全的單行寫法，手動摘要——跟品牌 competition.direct
              // 同一招。
              if (pp?.competition?.competitors && Array.isArray(pp.competition.competitors)) {
                const comps = pp.competition.competitors
                  .filter((c: any) => c?.name)
                  .slice(0, 3)
                  .map((c: any) => (c.position ? `${c.name}（${String(c.position).slice(0, 40)}）` : c.name))
                  .join("、");
                if (comps) lines.push(`【競品】${comps.slice(0, 250)}`);
              }
              pushSourceDoc(lines, pp, "產品定位文件補充");
              pushCustomSegments(lines, pp);
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
              // 2026-09-01: 同產品那段的 bug，但這裡還多壞一層 —— 舊碼讀
              // ep.theme / ep.cta / ep.offer / ep.audience，EVENT_SEGMENTS 一個
              // 都沒有，而 canonical 的 `audience` 是**物件**，所以
              // `String(ep.audience)` 會把字串 "[object Object]" 直接餵給模型。
              pushFrom(lines, ep, [
                ["brief.briefSummary",             "活動定位摘要", 400],
                ["brief.eventType",                "活動類型",     60],
                ["context.coreProblem",            "核心問題",     250],
                ["audience.primaryAudience",       "活動核心受眾", 300],
                ["audience.keyInsight",            "關鍵洞察",     200],
                ["objectives.marketingGoal",       "行銷目標",     200],
                ["smp.singleMindedProposition",    "SMP 單一主張", 200],
                ["messaging.coreMessage",          "核心訊息",     250],
                ["messaging.supportingPoints",     "支撐訊息",     300],
                ["creative.creativeTheme",         "創意主題",     200],
              ]);
              pushSourceDoc(lines, ep, "活動定位文件補充");
              pushCustomSegments(lines, ep);
            }
          }
          eventSection = "\n[本次產出對應的活動 — 必須提及活動 / 時程 / 主軸]\n" + lines.map(l => `- ${l}`).join("\n") + "\n";
        }
      } catch {/* non-fatal */}
    }

    // ── Market context (2026-05-21 global localisation) ──────────────────
    // Injected FIRST so it's the outer constraint all other brand rules sit
    // inside. Tier A = hand-crafted static. Tier B = LLM cached. Tier C = override.
    let marketSection = "";
    try {
      marketSection = await buildMarketContext(
        brandRow?.targetCountry,
        brandRow?.outputLanguage,
        brandRow?.marketContextOverride,
      );
    } catch { /* non-fatal: market context is best-effort */ }

    const hasAny =
      (rows && rows.length > 0) ||
      brandLocked.length > 0 ||
      voiceBlock.length > 0 ||
      assetsBlock.length > 0 ||
      contextBlock.length > 0 ||
      coreDigest ||
      marketSection ||
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

    // 順序：市場設定（最外層約束）→ 鎖定屬性 → 聲音指南 → 寫手指引 →
    // 脈絡 → 補充 → product/event narrow。
    // LLM 對「靠後出現」內容更易執行，product/event 放最後。
    // marketSection 放最前：所有後續指令都要在此市場框架內執行。
    const fullPrefix =
      "\n\n" + marketSection + lockedSection + voiceSection + assetsSection + contextSection + brainSection + productSection + eventSection;
    // mode="core" → market context + distilled digest + product/event narrowing
    // (short tasks). SAFETY: if coreDigest is empty (brand not re-run after the
    // single-source refactor → positioning has no segments yet), fall
    // back to the full block so un-migrated brands don't silently lose
    // ALL brand grounding on short tasks. mode="full" → rich block.
    // Market context is ALWAYS prepended — even for core mode — because
    // "write in Japanese for the JP market" must never be skipped.
    const prefix = (mode === "core" && coreDigest)
      ? marketSection + coreDigest + productSection + eventSection
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
