/**
 * interimQuickPulse — synchronous "quick pulse" before background pipeline finishes.
 *
 * CJ direction (2026-05-07):
 *   "interim 當成 fallback。 用戶建立好就背景跑全本，但同時要立刻給
 *    一個 '消費者要 X / 競品給不了 Y / 你能補上 Z' 的暫時定位。"
 *
 * Flow:
 *   1. Perplexity scout: pull 3-5 signals about industry consumer pain
 *      points + competitor positioning gaps (5-8 sec).
 *   2. Single Haiku call to synthesize "wants X / lacks Y / fills Z"
 *      structure plus a tagline / USP / 3 differentiators (~2-3 sec).
 *   3. Persist to <entity>.positioning under `_interim` (namespaced, never
 *      top-level) so 30s/60s/100s/Theater can read it as a fallback.
 *
 * Wall budget: ≤ 12s. If scout fails → still synthesize from prompt only.
 * Stays as fallback even after full pipeline completes (UI may prefer
 * full result but interim never gets cleared).
 */
import localPool from "../../../localDb";
import { invokeLLM } from "../../../platform/core/llm/llm";
import { fetchViralPatterns } from "./socialListeningScout";

/**
 * Read whatever interim or full positioning is stored for an entity, and
 * format the "consumer wants X / competitor lacks Y / brand fills Z"
 * triad as a prompt-injectable block. Used as a fallback when real
 * public content (FB / website) isn't reachable — gives the LLM a
 * coherent positioning frame instead of letting it refuse.
 */
export async function loadInterimPositioningBlock(
  entityKind: "brand" | "product" | "event",
  entityId: number,
): Promise<string> {
  const table = entityKind === "brand" ? "brands" : entityKind === "product" ? "products" : "events";
  // 2026-05-17: brand reads the canonical `positioning` column too.
  const col = "positioning";
  try {
    const [rows]: any = await localPool.execute(
      `SELECT \`${col}\` AS payload, name FROM \`${table}\` WHERE id = ? LIMIT 1`,
      [entityId],
    );
    const row = (rows as any[])[0];
    if (!row) return "";
    let cur: any = row.payload;
    if (typeof cur === "string") { try { cur = JSON.parse(cur); } catch { cur = {}; } }
    cur = cur ?? {};
    const interim = cur._interim ?? null;

    // Prefer canonical positioning.<segment> shape, fall back to interim
    const wants  = interim?.consumerWants;
    const lacks  = interim?.competitorLacks;
    const fills  = interim?.brandFills;
    const usp    = cur.differentiation?.summary ?? cur.differentiation?.functional ?? interim?.usp;
    const audience = cur.audience?.primary ?? interim?.targetAudience;
    const positioning = cur.differentiation?.summary ?? cur.goldenCircle?.why ?? interim?.positioning;
    const tagline = cur.tagline?.zhTagline ?? cur.tagline?.enTagline ?? interim?.tagline;

    const lines: string[] = [];
    if (wants || lacks || fills) {
      lines.push("【臨時定位 — wants / lacks / fills】");
      if (wants) lines.push(`消費者想要：${wants}`);
      if (lacks) lines.push(`競品給不了：${lacks}`);
      if (fills) lines.push(`品牌可補上：${fills}`);
    }
    if (positioning) lines.push(`一句話定位：${positioning}`);
    if (tagline)     lines.push(`標語：${tagline}`);
    if (usp)         lines.push(`核心 USP：${usp}`);
    if (audience)    lines.push(`目標受眾：${audience}`);
    if (lines.length === 0) return "";
    return `\n\n【品牌定位（用於 ground 產出）】\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

export interface InterimPulse {
  _interim: true;
  generatedAt: string;
  tagline: string;
  positioning: string;
  positioningSummary: string;
  usp: string;
  targetAudience: string;
  differentiators: string[];
  messagingPillars: string[];
  brandVoice: string;
  // Structured "wants X / lacks Y / fills Z" view
  consumerWants: string;
  competitorLacks: string;
  brandFills: string;
}

const COST_INPUT_PER_MTOK  = 1.0;   // Haiku 4.5 ish
const COST_OUTPUT_PER_MTOK = 5.0;
const cost = (i: number, o: number) => (i * COST_INPUT_PER_MTOK + o * COST_OUTPUT_PER_MTOK) / 1_000_000;

async function logUsage(userId: number, entityKind: string, entityId: number, model: string, inTok: number, outTok: number) {
  try {
    await localPool.execute(
      `INSERT INTO usage_log (userId, entityKind, entityId, kind, model, inputTokens, outputTokens, costUsd)
            VALUES (?, ?, ?, 'interim_pulse', ?, ?, ?, ?)`,
      [userId, entityKind, entityId, model, inTok, outTok, cost(inTok, outTok)],
    );
  } catch {/* non-fatal */}
}

export async function generateInterimPulse(args: {
  userId: number;
  entityKind: "brand" | "product" | "event";
  entityId: number;
  brandName: string;
  industry?: string;
  description?: string;
  website?: string;
}): Promise<InterimPulse> {
  // Stage 0 — fetch real website content for brand entities (best effort)
  let websiteBlock = "";
  if (args.entityKind === "brand") {
    try {
      const { getBrandRealContent } = await import("../brand/brandRealContent");
      const content = await getBrandRealContent(args.entityId);
      if (content.hasContent && content.context) {
        websiteBlock = `\n【官網 / 社群真實內容】\n${content.context.slice(0, 1500)}`;
      }
    } catch { /* non-fatal */ }
  } else if (args.entityKind === "product" && args.website) {
    try {
      const { fetchProductMeta } = await import("../entities/productMeta");
      const meta = await fetchProductMeta(args.website);
      if (meta.source !== "none") {
        const details = [
          meta.name ? `名稱：${meta.name}` : "",
          meta.price ? `價格：${meta.currency ? `${meta.currency} ` : ""}${meta.price}` : "",
          meta.description ? `說明：${meta.description}` : "",
          `商品頁：${args.website}`,
        ].filter(Boolean);
        websiteBlock = `\n【商品頁資訊】\n${details.join("\n")}`;
      }
    } catch { /* non-fatal */ }
  }

  // Stage 1 — scout (best effort, may return null)
  const patterns = await fetchViralPatterns({
    channel: "facebook",
    topic: args.brandName + " " + (args.industry ?? ""),
    industry: args.industry,
    kind: "trending",
  }).catch(() => null);

  const scoutBlock = patterns
    ? patterns.patterns.slice(0, 4).map((p, i) => `${i + 1}. ${p.title}：${p.excerpt}`).join("\n")
    : "（scout 未能取得即時資料，請依產業常識合理推估）";

  // Stage 2 — single Haiku synthesis
  const sys = `你是品牌定位顧問。輸出純 JSON，繁體中文。
任務：生成 interim「快速定位」— 8-10 秒內給出可用的暫時定位，等背景全本完成後會被覆寫。
核心結構：
  consumerWants：消費者真正想要什麼（具體痛點 / 渴望）
  competitorLacks：競品做不到什麼（缺口）
  brandFills：本品牌可以補上什麼（差異化價值）
重要：若有提供官網內容，請以官網資料為定位基礎，不可無中生有。`;

  const user = `品牌：${args.brandName}
產業：${args.industry ?? "未指定"}
描述：${args.description ?? ""}${websiteBlock}

【產業即時訊號】
${scoutBlock}

請輸出 JSON：
{
  "tagline": "8 字以內品牌標語",
  "positioning": "20 字以內一句話定位",
  "consumerWants": "30 字消費者真正要的（觀察 + 痛點）",
  "competitorLacks": "30 字競品給不了的（市場缺口）",
  "brandFills": "30 字本品牌補上的（差異化價值）",
  "usp": "30 字核心 USP",
  "targetAudience": "50 字目標受眾畫像",
  "differentiators": ["差異化點1", "差異化點2", "差異化點3"],
  "messagingPillars": ["訊息支柱1", "訊息支柱2", "訊息支柱3"],
  "brandVoice": "3 個形容詞，逗號分隔"
}`;

  let parsed: any = null;
  try {
    const r = await invokeLLM({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      maxTokens: 1200,
    });
    const content = r.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const inTok  = r.usage?.prompt_tokens ?? 0;
    const outTok = r.usage?.completion_tokens ?? 0;
    await logUsage(args.userId, args.entityKind, args.entityId, r.model || "anthropic/claude-haiku-4-5", inTok, outTok);

    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    parsed = JSON.parse(m ? m[1]!.trim() : text);
  } catch {
    parsed = null;
  }

  const fallback = {
    tagline: `${args.brandName}`,
    positioning: `${args.industry ?? "市場"}中的差異化選擇`,
    consumerWants: "更高效、更值得信賴的解決方案",
    competitorLacks: "個性化體驗 / 在地化深度",
    brandFills: `${args.brandName} 用獨特方法補上這些缺口`,
    usp: `${args.brandName} 的獨特優勢`,
    targetAudience: "重視品質、追求效率的核心用戶",
    differentiators: ["差異化點 1（暫時）", "差異化點 2（暫時）", "差異化點 3（暫時）"],
    messagingPillars: ["品質", "效率", "信賴"],
    brandVoice: "專業, 親切, 自信",
  };

  const p = parsed ?? fallback;

  const pulse: InterimPulse = {
    _interim: true,
    generatedAt: new Date().toISOString(),
    tagline: p.tagline ?? fallback.tagline,
    positioning: p.positioning ?? fallback.positioning,
    positioningSummary: p.positioning ?? fallback.positioning,
    usp: p.usp ?? fallback.usp,
    targetAudience: p.targetAudience ?? fallback.targetAudience,
    differentiators: Array.isArray(p.differentiators) ? p.differentiators : fallback.differentiators,
    messagingPillars: Array.isArray(p.messagingPillars) ? p.messagingPillars : fallback.messagingPillars,
    brandVoice: p.brandVoice ?? fallback.brandVoice,
    consumerWants: p.consumerWants ?? fallback.consumerWants,
    competitorLacks: p.competitorLacks ?? fallback.competitorLacks,
    brandFills: p.brandFills ?? fallback.brandFills,
  };

  // Persist to entity's payload column (brand uses soworkAnalysis;
  // product/event use positioning). Merge under `_interim` key so the
  // full pipeline's outputs at top level take precedence in readers but
  // interim stays available as fallback.
  await persistInterim(args.entityKind, args.entityId, args.userId, pulse);

  return pulse;
}

async function persistInterim(kind: "brand"|"product"|"event", id: number, userId: number, pulse: InterimPulse): Promise<void> {
  const table = kind === "brand" ? "brands" : kind === "product" ? "products" : "events";
  // 2026-05-17: brand writes the canonical `positioning` column too.
  const col   = "positioning";
  try {
    const [rows]: any = await localPool.execute(
      `SELECT \`${col}\` AS payload FROM \`${table}\` WHERE id = ? AND userId = ? LIMIT 1`,
      [id, userId],
    );
    const row = (rows as any[])[0];
    if (!row) return;
    let cur: any = row.payload;
    if (typeof cur === "string") { try { cur = JSON.parse(cur); } catch { cur = {}; } }
    cur = cur ?? {};
    // 2026-05-17: interim is namespaced STRICTLY under `_interim`. We must
    // NOT write top-level string keys (tagline/positioning/usp/...) — in
    // the canonical `positioning` column those top-level keys are reserved
    // for segment OBJECTS (positioningSchema.ts). Writing a string there
    // would corrupt the 品牌大腦 cards. Readers fall back to `_interim`.
    const next: any = { ...cur };
    next._interim = pulse;
    await localPool.execute(
      `UPDATE \`${table}\` SET \`${col}\` = ? WHERE id = ? AND userId = ?`,
      [JSON.stringify(next), id, userId],
    );
    // Brand also has dedicated tagline column — surface tagline there too
    // so the header search-bar (Batch 6) can show it without parsing JSON.
    if (kind === "brand") {
      try {
        await localPool.execute(
          `UPDATE brands SET tagline = COALESCE(NULLIF(tagline, ''), ?) WHERE id = ? AND userId = ?`,
          [pulse.tagline, id, userId],
        );
      } catch {/* non-fatal */}
    }
  } catch (e) {
    console.warn("[interimQuickPulse] persist failed:", (e as Error).message);
  }
}
