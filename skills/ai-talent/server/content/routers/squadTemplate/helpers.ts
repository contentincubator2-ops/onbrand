/**
 * squadTemplate router 的輔助：JSON 解析、定位脈絡、mockup 資料、工作區標籤。
 */
import { randomBytes } from "crypto";
import { type TaskGateInfo } from "../../../platform/core/billing/planGate";
import { normalizeTaskId } from "../../../platform/core/tierCompat";

export function safeJsonParse<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "object") return val as T;
  if (typeof val === "string") {
    try { return JSON.parse(val) as T; } catch { return fallback; }
  }
  return fallback;
}

/** Sanitize a string for safe use in a SQL LIKE clause (escape %, _, \) */
export function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Parse a positioning JSON column (string or object) safely. */
export function parseJsonField(val: any): any {
  if (val == null) return {};
  if (typeof val === "object") return val;
  try { return JSON.parse(String(val)); } catch { return {}; }
}

/** Format positioning JSON into a context block, stripping noise keys. */
export function formatPositioningContext(positioning: any, description: any, label = "品牌定位"): string {
  const cleaned = { ...(positioning ?? {}) };
  delete cleaned._research;
  delete cleaned._wizardMeta;
  delete cleaned._meta;
  const parts: string[] = [];
  if (description) parts.push(`【描述】${String(description).slice(0, 500)}`);
  if (Object.keys(cleaned).length > 0) {
    parts.push(`【${label}】\n${JSON.stringify(cleaned, null, 2).slice(0, 3000)}`);
  }
  return parts.join("\n");
}

/** Concrete schema example per (outputKind, mockupVariant) so LLM has
 *  a target shape for `conclusion`. Mirrors pipelineRouter's mockConclusion
 *  pattern — specific keys converge faster than free-form. */
export function mockConclusionForStep(outputKind: string, mockupVariant?: string): any {
  switch (outputKind) {
    case "decision":
      // Intake or user-checkpoint outputs
      return {
        eventType: "brand|growth|conversion|hybrid",
        roleThisRound: "（一句話：本次 squad 對品牌的角色）",
        briefSummary: "（200 字內活動策略摘要）",
        gaps: ["（資料缺失項 1）", "（缺失項 2）"],
        confirmedFields: { "（key）": "（value）" },
      };
    case "text_strategic":
      // Research / context analysis
      return {
        keyFindings: ["（觀察 1）", "（觀察 2）", "（觀察 3）"],
        audiencePains: ["（痛點 1）", "（痛點 2）"],
        competitorGaps: ["（競品 pillar 空白 1）"],
        platformSignals: "（FB prime time / 演算法觀察）",
        strategyImplication: "（這些研究對 pillar 設計的啟發）",
      };
    case "structured_table":
      if (mockupVariant === "PillarTableMockup") {
        return {
          tilt: "（一句話 content tilt）",
          pillars: [{
            name: "（pillar 名稱）",
            hypothesis: "（為何這 pillar 適合）",
            ratio: 35,
            target_kpi: "saves|shares|reach|convert",
            sample_topics: ["主題 1", "主題 2", "主題 3", "主題 4", "主題 5"],
            visualDirection: "（這 pillar 的視覺方向，影響 image_brief）",
          }],
        };
      }
      if (mockupVariant === "CalendarGridMockup") {
        return {
          targetDateStart: "YYYY-MM-DD",
          targetDateEnd:   "YYYY-MM-DD",
          pillars: [{ name: "（pillar 名）", ratio: 35 }],
          entries: [{
            date: "YYYY-MM-DD",
            pillarIndex: 0,
            pillarName: "（pillar 名）",
            format: "post|reel|carousel|long-text|story",
            topic: "（主題）",
            eventAnchor: "（活動名，無則省略此欄）",
          }],
        };
      }
      return { items: [{ "（key）": "（value）" }] };
    case "text_content":
      return {
        briefs: [{
          date: "YYYY-MM-DD",
          pillarIndex: 0,
          pillarName: "（pillar）",
          format: "post|reel|carousel|long-text|story",
          hook: "（開場一句吸引眼球）",
          copy: "（200 字內主文）",
          cta: "（行動呼籲）",
          imageDirection: "（依該 pillar 的 visualDirection 寫的視覺方向）",
          eventAnchor: "（活動，無則省略）",
        }],
      };
    case "image_brief":
    case "video_brief":
      return {
        brief: "（視覺/影片 brief）",
        visualDirection: "（風格、色彩、構圖）",
        formatHints: ["1:1", "9:16"],
      };
    case "qa_review":
      return {
        verdict: "approved|needs_revision|pending",
        overallScore: 78,
        pillarChecks: [{ pillarName: "（pillar）", expectedRatio: 35, actualRatio: 33, score: 85, notes: "..." }],
        eventChecks: [{ eventName: "（活動）", posts: 4, expectedPosts: 4, score: 90, notes: "..." }],
        itemChecklist: [{ id: "voice", label: "品牌語氣", status: "pass|warning|fail", detail: "..." }],
      };
    default:
      return {};
  }
}

/** Per-outputKind LLM maxTokens — bigger steps need more; small steps
 *  shouldn't waste tokens (also reduces server timeout risk). */
export function maxTokensForOutputKind(outputKind: string): number {
  switch (outputKind) {
    case "text_strategic":   return 3000;
    case "structured_table": return 3500;
    case "text_content":     return 6000;  // batch briefs (16-20 篇)
    case "qa_review":        return 2500;
    case "image_brief":
    case "video_brief":      return 1500;
    case "decision":         return 1500;
    default:                 return 2000;
  }
}

/** 3-strategy parser: whole / fenced ```json / greedy {…} */
export function tryParseJson(raw: string): any | null {
  if (!raw) return null;
  // 1) try whole
  try { return JSON.parse(raw); } catch {}
  // 2) try fenced
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  // 3) greedy first {...} block
  const greedy = raw.match(/\{[\s\S]*\}/);
  if (greedy?.[0]) {
    try { return JSON.parse(greedy[0]); } catch {}
  }
  return null;
}

/** Map parsed LLM conclusion → mockup-component-shaped data per outputKind.
 *  thinking + sources come from the envelope (not part of conclusion). */
export function mapToMockupData(
  conclusion: any,
  outputKind: string,
  mockupVariant: string,
  rawText: string,
  thinking: string,
  sources: any[],
): any {
  if (!conclusion) {
    // Fallback so mockup renders something rather than empty
    return outputKind === "text_strategic"
      ? { thinking: thinking || rawText.slice(0, 2000), conclusion: "", sources, budget: { minUrls: 8, minChars: 12000 } }
      : null;
  }
  switch (outputKind) {
    case "text_strategic":
      // Research mockup wants: thinking + conclusion (string) + sources + budget
      // conclusion may itself be a string OR an object with keyFindings etc.
      return {
        thinking,
        conclusion: typeof conclusion === "string"
          ? conclusion
          : (conclusion.strategyImplication ?? formatStrategicConclusion(conclusion)),
        sources,
        budget: { minUrls: 8, minChars: 12000 },
      };
    case "structured_table":
      if (mockupVariant === "PillarTableMockup") {
        return {
          tilt: conclusion.tilt ?? "",
          pillars: Array.isArray(conclusion.pillars) ? conclusion.pillars
                 : Array.isArray(conclusion.items)   ? conclusion.items
                 : [],
        };
      }
      if (mockupVariant === "CalendarGridMockup") {
        return {
          targetDateStart: conclusion.targetDateStart ?? "",
          targetDateEnd:   conclusion.targetDateEnd   ?? "",
          pillars: Array.isArray(conclusion.pillars) ? conclusion.pillars : [],
          entries: Array.isArray(conclusion.entries) ? conclusion.entries
                 : Array.isArray(conclusion.items)   ? conclusion.items
                 : [],
        };
      }
      return conclusion;
    case "text_content":
      return { briefs: Array.isArray(conclusion.briefs) ? conclusion.briefs : [] };
    case "qa_review":
      return conclusion; // shape already matches QAReport
    case "decision":
      // For intake: project conclusion into IntakeFormData
      return {
        systemData: {},
        userInput: conclusion.confirmedFields ?? {},
        gaps: Array.isArray(conclusion.gaps) ? conclusion.gaps : [],
        webSummary: {
          audiencePainsPreview: conclusion.briefSummary ?? "",
        },
      };
    default:
      return conclusion;
  }
}

/** When LLM returns rich strategic conclusion as object, render it readable. */
export function formatStrategicConclusion(c: any): string {
  if (!c || typeof c !== "object") return "";
  const lines: string[] = [];
  if (c.keyFindings)        lines.push(`# 關鍵發現\n- ${(c.keyFindings as string[]).join("\n- ")}`);
  if (c.audiencePains)      lines.push(`# 受眾痛點\n- ${(c.audiencePains as string[]).join("\n- ")}`);
  if (c.competitorGaps)     lines.push(`# 競品空白\n- ${(c.competitorGaps as string[]).join("\n- ")}`);
  if (c.platformSignals)    lines.push(`# 平台訊號\n${c.platformSignals}`);
  if (c.strategyImplication)lines.push(`# 戰略意涵\n${c.strategyImplication}`);
  return lines.join("\n\n");
}

export const WORKSPACE_TAGS: Record<string, string[]> & { strategy: string[] } = {
  strategy:          ["brand", "strategy", "gtm", "b2b", "full-funnel", "positioning", "market", "saas"],
  "brand-positioning": ["brand-positioning", "positioning", "brand-strategy", "differentiation", "perceptual-mapping", "category-design", "jtbd", "purpose-driven", "mind-positioning", "segmentation", "value-proposition", "benefit-based"],
  website:           ["seo", "website", "content", "web", "ux", "cro", "copywriting", "conversion"],
  facebook:          ["meta-ads", "facebook", "social", "ads", "community", "ecom", "creative"],
  linkedin:          ["linkedin", "b2b", "thought-leadership", "demand-gen", "b2b_saas"],
  youtube:           ["youtube", "video", "content", "yt", "影片"],
  pr:                ["pr", "公關", "媒體", "新聞", "media"],
  event:             ["event", "活動", "展覽"],
  instore:           ["retail", "門市", "實體"],
  monitoring:        ["monitoring", "social-listening", "sentiment", "intelligence", "輿情", "監測", "情報", "競品", "crisis", "brand-tracking"],
  analytics:         ["analytics", "data", "attribution", "CLV", "LTV", "RFM", "cohort", "A/B", "MMM", "AARRR", "conversion", "experimentation", "North-Star", "Kano", "NPS", "incrementality", "分析", "歸因", "用戶研究"],
};

/**
 * Normalize a workspace key to a known WORKSPACE_TAGS key.
 * Handles user-created workspaces with CJK labels (e.g. "情報監測", "公關通路")
 * or arbitrary slugs that don't map 1:1 to our built-in workspace keys.
 */
export function normalizeWorkspace(ws: string): string {
  if (WORKSPACE_TAGS[ws]) return ws;   // already a known key

  const s = ws.toLowerCase();
  // Brand positioning / methodology signals
  if (/brand.position|品牌定位|品牌策略|定位方法|positioning|differentiat|perceptual|category.design|品類設計|jtbd|jobs.to.be.done|purpose.driven|mind.position|心智定位|segmentation.based|benefit.based|value.proposition/.test(s)) return "brand-positioning";
  // Analytics / data signals
  if (/analytics|數據分析|資料分析|\babi\b|attribution|歸因|clv|ltv|rfm|cohort|同期群|aarrr|north.star|kano|a\/b.test|a\/b測試|mmm|marketing.mix|incrementalit|留存分析|用戶研究|consumer.research/.test(s)) return "analytics";
  // Monitoring / intelligence signals
  if (/監測|情報|輿情|listening|monitor|sentiment|intelligence|追蹤|brand.track/.test(s)) return "monitoring";
  // Social / Facebook
  if (/臉書|facebook|\bfb\b|meta|ig|instagram|社群/.test(s)) return "facebook";
  // LinkedIn
  if (/linkedin/.test(s)) return "linkedin";
  // YouTube / Video
  if (/youtube|\byt\b|影片|video/.test(s)) return "youtube";
  // PR
  if (/公關|媒體關係|\bpr\b|kol|媒體/.test(s)) return "pr";
  // Website / SEO
  if (/官網|website|web|seo|搜尋/.test(s)) return "website";
  // Event
  if (/活動|event|展覽/.test(s)) return "event";
  // In-store / Retail
  if (/門市|實體|retail|instore/.test(s)) return "instore";

  return "strategy"; // final fallback
}

export const FALLBACK_SQUAD_LEAD = {
  // Canonical catalog record — never a display-only invented identity.
  sourceAgentId: 30002,
  agentName: "Sarah Liu",
  agentTitle: "AI 品牌故事 CMO",
  agentRole: "squad_lead",
  model: "claude-sonnet",
  skills: ["品牌定位", "策略規劃", "跨團隊協作"],
};

export function genSquadUid(): string {
  return "sq_" + randomBytes(8).toString("hex");
}

export function genAgentKey(squadUid: string, agentName: string): string {
  return `${squadUid}_${agentName.toLowerCase().replace(/\s+/g, "-")}`;
}

/**
 * squad 的執行前閘門資訊。squad 索引項本身就帶 platform 與 source，
 * 用 slug 查；查不到（DB 裡的自訂 squad）回 null，閘門不觸發。
 */
export async function squadGateInfo(slug: string): Promise<TaskGateInfo> {
  const { ALL_99S_SQUADS } = await import("../../core/catalog/quickTask100Squads");
  const m = ALL_99S_SQUADS.find((x) => x.squad_slug === normalizeTaskId(slug));
  return { platform: m?.platform ?? null, sourceType: (m as any)?.source?.type ?? null };
}
