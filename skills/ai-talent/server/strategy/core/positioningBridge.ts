/**
 * positioningBridge.ts
 *
 * 品牌定位橋接模組 — 整合 sowork_db（enterprise_brands）與 Marketing OS
 *
 * 功能：
 * 1. 查詢 DB 是否已有品牌定位結果（soworkAnalysis）
 * 2. 若有 → 直接回傳（快速路徑）
 * 3. 若無 → 用 AI 執行簡化版 5 步驟品牌定位分析
 * 4. 回傳統一格式：{ tagline, targetAudience, usp, positioningSummary, goldenCircle, valueProposition, brandVoice, differentiators }
 */

import { getDb } from "../../db";
import { brands } from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { invokeLLMWithBilling } from "../../platform/core/llmWithBilling";

export interface PositioningInput {
  userId: number;
  userApiKey: string;
  brandName: string;
  industry?: string;
  description?: string;
  targetMarket?: string;
}

export interface PositioningResult {
  tagline: string;
  targetAudience: string;
  usp: string;                      // Unique Selling Proposition
  positioningSummary: string;        // 一句話定位摘要
  goldenCircle: {
    why: string;                     // 為什麼存在
    how: string;                     // 如何做到
    what: string;                    // 提供什麼
  };
  valueProposition: string;
  brandVoice: string;
  differentiators: string[];
  messagingPillars: string[];
  industry?: string;                 // 產業類別（給 scout / 競品分析 用）
  source: "db" | "ai-generated";    // 來源標記
  brandId?: number;                  // 若有寫入 DB，回傳 brandId
}

/**
 * 主要入口：取得品牌定位分析
 * 優先從 DB 讀取，否則用 AI 生成後存入 DB
 */
export async function getBrandPositioning(input: PositioningInput): Promise<PositioningResult> {
  const db = await getDb();

  // ── Step 1: 查詢 DB 是否已有此用戶的品牌定位 ──
  if (db) {
    try {
      const existingRows = await db
        .select()
        .from(brands)
        .where(and(eq(brands.userId, input.userId), eq(brands.isDefault, true)))
        .limit(1);

      const existing = existingRows[0];
      if (existing?.soworkAnalysis) {
        const analysis = existing.soworkAnalysis as Record<string, unknown>;

        // 若已有完整分析，直接回傳
        if (analysis.positioning || analysis.tagline) {
          return {
            tagline: (analysis.tagline as string) ?? (analysis.positioning as string) ?? "",
            targetAudience: existing.targetAudience ?? (analysis.targetAudience as string) ?? "",
            usp: (analysis.usp as string) ?? (analysis.differentiators as string[])?.[0] ?? "",
            positioningSummary: (analysis.positioning as string) ?? existing.tagline ?? "",
            goldenCircle: (analysis.goldenCircle as PositioningResult["goldenCircle"]) ?? {
              why: (analysis.valueProposition as string) ?? "",
              how: (analysis.brandVoice as string) ?? "",
              what: existing.name,
            },
            valueProposition: (analysis.valueProposition as string) ?? "",
            brandVoice: existing.brandVoice ?? (analysis.brandVoice as string) ?? "",
            differentiators: (analysis.differentiators as string[]) ?? [],
            messagingPillars: (analysis.messagingPillars as string[]) ?? [],
            source: "db",
            brandId: existing.id,
          };
        }
      }
    } catch { /* fallthrough to AI generation */ }
  }

  // ── Step 2: 用 AI 生成品牌定位（5 步驟簡化版） ──
  const result = await runAIPositioningAnalysis(input);

  // ── Step 3: 儲存到 DB ──
  if (db) {
    try {
      const insertResult = await (db.insert(brands) as any).values({
        userId: input.userId,
        name: input.brandName,
        description: input.description ?? null,
        tagline: result.tagline,
        targetAudience: result.targetAudience,
        brandVoice: result.brandVoice,
        soworkAnalysis: result as unknown as Record<string, unknown>,
        isDefault: true,
        dataSource: "sowork",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      result.brandId = (insertResult as any)[0]?.insertId ?? insertResult.insertId;
    } catch { /* DB write optional */ }
  }

  return result;
}

/**
 * 從 DB 讀取指定 brandId 的定位上下文（供 taskExecutor / Theater 使用）
 *
 * 2026-05-17 ROOT-CAUSE FIX: reads the canonical brands.positioning
 * column (segment-keyed, positioningSchema.ts BRAND_SEGMENTS shape) — NOT
 * the old soworkAnalysis detour. Maps segment objects → the flat
 * PositioningResult shape Theater / taskExecutor expect. Falls back to
 * `_interim` (interimQuickPulse) then brand row columns then empty.
 */
export async function getBrandPositioningById(
  brandId: number,
  userId: number
): Promise<PositioningResult | null> {
  try {
    const { default: localPool } = await import("../../localDb");
    const [rows]: any = await localPool.execute(
      `SELECT id, name, industry, tagline, targetAudience, brandVoice, positioning
         FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
      [brandId, userId],
    );
    const brand = (rows as any[])[0];
    if (!brand) return null;

    let p: any = brand.positioning;
    if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = {}; } }
    p = p ?? {};
    const interim = (p._interim ?? {}) as Record<string, any>;
    const fb = <T>(...vals: T[]): T | undefined =>
      vals.find((v) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0));

    // Map canonical segments → flat PositioningResult.
    const tl   = p.tagline ?? {};
    const gc   = p.goldenCircle ?? {};
    const diff = p.differentiation ?? {};
    const aud  = p.audience ?? {};
    const voice = p.voice ?? {};
    // differentiators: emotional + functional axes, else interim list.
    const diffs: string[] = [diff.emotional, diff.functional]
      .filter((x) => typeof x === "string" && x.trim());

    return {
      tagline: fb<string>(tl.zhTagline, tl.enTagline, brand.tagline ?? "", interim.tagline) ?? brand.name,
      targetAudience: fb<string>(aud.primary, brand.targetAudience ?? "", interim.targetAudience) ?? "",
      usp: fb<string>(diff.summary, diff.functional, interim.usp) ?? "",
      positioningSummary: fb<string>(diff.summary, gc.why, brand.tagline ?? "", interim.positioning) ?? brand.name,
      goldenCircle: (gc.why || gc.how || gc.what)
        ? { why: gc.why ?? "", how: gc.how ?? "", what: gc.what ?? brand.name }
        : { why: interim.brandFills ?? "", how: brand.brandVoice ?? "", what: brand.name },
      valueProposition: fb<string>(diff.summary, gc.why, interim.brandFills) ?? "",
      brandVoice: fb<string>(
        Array.isArray(voice.tone) && voice.tone.length ? voice.tone.join("、") : undefined,
        brand.brandVoice ?? "", interim.brandVoice,
      ) ?? "",
      differentiators: (diffs.length ? diffs : (interim.differentiators ?? [])) as string[],
      messagingPillars: (interim.messagingPillars ?? []) as string[],
      // Industry is read from brands.industry column (used by Theater scout
      // to bound 'this industry's viral patterns' queries).
      industry: brand.industry ?? undefined,
      source: "db",
      brandId: brand.id,
    };
  } catch {
    return null;
  }
}

// ── Internal: AI 品牌定位分析（5 步驟簡化版） ──────────────────────────────

async function runAIPositioningAnalysis(input: PositioningInput): Promise<PositioningResult> {
  const { userId, userApiKey, brandName, industry, description, targetMarket } = input;

  const systemPrompt = `你是一位世界級品牌策略顧問，精通品牌定位、黃金圈分析、USP 萃取。
你需要在 5 個步驟內完成一個品牌的核心定位分析，以繁體中文回應，輸出 JSON 格式。`;

  const userPrompt = `請為以下品牌完成 5 步驟品牌定位分析：

品牌名稱：${brandName}
產業：${industry ?? "未指定"}
品牌描述：${description ?? "（未提供）"}
目標市場：${targetMarket ?? "台灣"}

步驟 1：理解品牌本質（Why/How/What）
步驟 2：目標受眾畫像
步驟 3：差異化優勢萃取
步驟 4：品牌定位語（一句話）
步驟 5：品牌語調與溝通支柱

請輸出以下 JSON（不要包含 markdown code block，直接輸出 JSON）：
{
  "tagline": "品牌標語（15字以內）",
  "positioning": "一句話品牌定位（20字以內）",
  "targetAudience": "目標受眾具體描述（50字）",
  "usp": "核心差異化主張（30字）",
  "valueProposition": "核心價值主張（50字）",
  "brandVoice": "品牌語調（3個形容詞，逗號分隔）",
  "goldenCircle": {
    "why": "品牌存在的根本原因（30字）",
    "how": "如何實現使命（30字）",
    "what": "提供的產品/服務（20字）"
  },
  "differentiators": ["差異化優勢1", "差異化優勢2", "差異化優勢3"],
  "messagingPillars": ["溝通支柱1", "溝通支柱2", "溝通支柱3"]
}`;

  try {
    const raw = await invokeLLMWithBilling({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4-6",
      userId,
      userApiKey,
      actionType: "strategy",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "positioning_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              tagline: { type: "string" },
              positioning: { type: "string" },
              targetAudience: { type: "string" },
              usp: { type: "string" },
              valueProposition: { type: "string" },
              brandVoice: { type: "string" },
              goldenCircle: {
                type: "object",
                properties: {
                  why: { type: "string" },
                  how: { type: "string" },
                  what: { type: "string" },
                },
                required: ["why", "how", "what"],
                additionalProperties: false,
              },
              differentiators: { type: "array", items: { type: "string" } },
              messagingPillars: { type: "array", items: { type: "string" } },
            },
            required: ["tagline", "positioning", "targetAudience", "usp", "valueProposition", "brandVoice", "goldenCircle", "differentiators", "messagingPillars"],
            additionalProperties: false,
          },
        },
      },
    } as any);

    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

    return {
      tagline: parsed.tagline ?? `${brandName} — 精準定位`,
      targetAudience: parsed.targetAudience ?? "",
      usp: parsed.usp ?? "",
      positioningSummary: parsed.positioning ?? parsed.tagline ?? "",
      goldenCircle: parsed.goldenCircle ?? { why: "", how: "", what: brandName },
      valueProposition: parsed.valueProposition ?? "",
      brandVoice: parsed.brandVoice ?? "",
      differentiators: parsed.differentiators ?? [],
      messagingPillars: parsed.messagingPillars ?? [],
      source: "ai-generated",
    };
  } catch (err) {
    // fallback minimal result
    return {
      tagline: `${brandName} — 品牌定位`,
      targetAudience: targetMarket ?? "台灣中小企業行銷人員",
      usp: `${brandName} 的獨特優勢`,
      positioningSummary: `${brandName}：${industry ?? "行銷科技"}領域的領導品牌`,
      goldenCircle: {
        why: `幫助${targetMarket ?? "品牌"}在競爭中脫穎而出`,
        how: `透過 AI 驅動的策略分析`,
        what: brandName,
      },
      valueProposition: `${brandName} 提供智能、高效的行銷解決方案`,
      brandVoice: "專業、創新、親切",
      differentiators: ["AI 驅動分析", "快速交付", "在地化策略"],
      messagingPillars: ["效率", "創新", "信賴"],
      source: "ai-generated",
    };
  }
}
