/**
 * 從資料庫載入 agent 人設，並依欄位上限裁切。
 */
import localPool from "../../../../localDb";
import { loadAgentKnowledge } from "../../../../platform/core/agents/agentKnowledge";
import { AgentMeta } from "./orchestraTypes";
import { englishFromRow } from "../../../../platform/core/agents/agentEnglish";

/**
 * Field-level char caps so a single huge field can't blow the persona
 * budget. Total persona budget is PERSONA_TOTAL_CAP — we walk fields in
 * priority order and stop when budget hits zero.
 */
export const PERSONA_TOTAL_CAP = 5000;

export const FIELD_CAPS: Record<string, number> = {
  bio:              500,
  specialty:        1500,
  methodology:      1500,
  experienceDetail: 600,
  workingPrinciples:1000,
  specialtySummary: 400,
  tool_instructions:800,
  bio_zh:           300,
  caseStudies:      800,   // applied to JSON-stringified body
  // taskSystemPrompt: see platform/core/agentKnowledge.ts (own budget, not capped here)
};

/** Trim a single string field to its cap, with "…" suffix if cut. */
export function trimField(s: string | null | undefined, cap: number): string {
  if (!s) return "";
  const t = String(s).trim();
  if (t.length <= cap) return t;
  return t.slice(0, cap - 1).trimEnd() + "…";
}

/** Render caseStudies JSON as a human-readable summary chunk. */
export function renderCaseStudies(raw: any): string {
  if (!raw) return "";
  let arr: any;
  try { arr = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return ""; }
  if (!Array.isArray(arr)) return "";
  const lines: string[] = [];
  for (const cs of arr.slice(0, 5)) {
    if (!cs) continue;
    const brand = cs.brand ?? cs.client ?? "";
    const result = cs.result ?? cs.outcome ?? cs.summary ?? "";
    const role = cs.role ?? "";
    const yr = cs.year ?? "";
    const parts = [brand, role, yr].filter(Boolean).join(" · ");
    if (parts || result) lines.push(`- ${parts}${parts ? "：" : ""}${result}`);
  }
  return lines.join("\n");
}

export async function loadAgent(id: number | null | undefined): Promise<{ meta: AgentMeta | null; persona: string; aiModel: string | null }> {
  if (!id) return { meta: null, persona: "", aiModel: null };
  try {
    // 2026-05-12 (CJ「都是有完整經歷的人」+ "我要的是全站任務都同一個標準"):
    // pull ALL 10 rich text fields, not just 4. The agents table has
    // experienceDetail, workingPrinciples, specialtySummary, tool_instructions,
    // bio_zh, caseStudies JSON — previously ignored. Total persona is
    // capped at PERSONA_TOTAL_CAP chars so even the thickest agent
    // (Amy Su, 7811 char) fits within first-token budget (~5000 chars
    // ≈ 1700 tokens ≈ 200-500ms latency add).
    const [rows]: any = await localPool.execute(
      `SELECT id, name, title, bio, specialty, methodology, taskSystemPrompt,
              experienceDetail, workingPrinciples, specialtySummary,
              tool_instructions, bio_zh, caseStudies,
              aiModel, avatarUrl, englishName, englishTitle
       FROM agents WHERE id = ? LIMIT 1`,
      [id],
    );
    const a = (rows as any[])?.[0];
    if (!a) return { meta: null, persona: "", aiModel: null };

    // Build sections in priority order. taskSystemPrompt is most authoritative;
    // workingPrinciples + methodology are second; bio + specialty are identity.
    const sections: Array<{ label: string; body: string }> = [];
    const push = (label: string, body: string) => {
      if (body.trim()) sections.push({ label, body });
    };
    push("背景",         trimField(a.bio,             FIELD_CAPS.bio!));
    push("中文背景",     trimField(a.bio_zh,          FIELD_CAPS.bio_zh!));
    push("專長",         trimField(a.specialty,       FIELD_CAPS.specialty!));
    push("專長摘要",     trimField(a.specialtySummary,FIELD_CAPS.specialtySummary!));
    push("經歷",         trimField(a.experienceDetail,FIELD_CAPS.experienceDetail!));
    push("方法論",       trimField(a.methodology,     FIELD_CAPS.methodology!));
    push("工作原則",     trimField(a.workingPrinciples,FIELD_CAPS.workingPrinciples!));
    push("工具與流程",   trimField(a.tool_instructions,FIELD_CAPS.tool_instructions!));
    push("代表案例",     trimField(renderCaseStudies(a.caseStudies), FIELD_CAPS.caseStudies!));

    // Greedy fill within total cap.
    const header = `你是 ${a.name}，${a.title}。\n`;
    let body = "";
    let usedChars = header.length;
    for (const s of sections) {
      const chunk = `${s.label}：${s.body}\n`;
      if (usedChars + chunk.length > PERSONA_TOTAL_CAP) {
        // Try to squeeze in a trimmed version
        const remaining = PERSONA_TOTAL_CAP - usedChars - s.label.length - 4;
        if (remaining > 80) {
          const cut = trimField(s.body, remaining);
          const partial = `${s.label}：${cut}\n`;
          body += partial;
          usedChars += partial.length;
        }
        break;
      }
      body += chunk;
      usedChars += chunk.length;
    }

    // 工作守則 / 專業執行卡 / 綁定 Skill 由 agentKnowledge 統一組裝，有自己的
    // 額度 —— 以前 taskSystemPrompt 跟身分欄位搶同一個 5000 字額度、排在最後，
    // 前面塞滿時整段被丟掉；agentCard 與綁定 Skill 則完全沒讀。
    const knowledge = await loadAgentKnowledge(a.id, { source: "orchestra.loadAgent" });

    const persona =
      header + body +
      (knowledge ? `\n${knowledge}\n` : "") +
      `\n用你的口氣寫，不要寫得像通用 AI。\n\n`;

    return {
      meta: { id: a.id, name: a.name, title: a.title, ...englishFromRow(a), avatarUrl: a.avatarUrl ?? null },
      persona,
      aiModel: a.aiModel ?? null,
    };
  } catch { return { meta: null, persona: "", aiModel: null }; }
}
