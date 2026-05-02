/**
 * audit-mockup-fit — LLM-judged check that each squad step's
 * mockupVariant actually matches what the step delivers.
 *
 * E.g. a step described as "Post / Carousel / Story / Reels 混合 brief"
 * tagged mockupVariant=IGPostBriefMockup is a MISMATCH (one variant
 * can't render four formats). The judge calls those out.
 *
 * Output: /tmp/mockup-fit-audit.md with verdict per step + suggestion
 * for the right variant (or "needs new component").
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import mysql from "mysql2/promise";
import { callLLM } from "../server/_core/llmRouter";

const KNOWN_VARIANTS = [
  "IntakeFormMockup",
  "ResearchPanelMockup",
  "PillarTableMockup",
  "CalendarGridMockup",
  "FBPostBriefMockup",
  "FBCarouselMockup",
  "FBReelsMockup",
  "IGPostBriefMockup",
  "IGStoryMockup",
  "IGReelsMockup",
  "QAReportMockup",
];

const VARIANT_PURPOSE: Record<string, string> = {
  IntakeFormMockup:    "intake form — collects user inputs / shows scope",
  ResearchPanelMockup: "research output — thinking + conclusion + sources",
  PillarTableMockup:   "content pillars table with ratios + sample topics",
  CalendarGridMockup:  "month-calendar grid (date × pillar × format)",
  FBPostBriefMockup:   "single FB post brief (caption + visual direction)",
  FBCarouselMockup:    "FB multi-slide carousel deck with arc tagging",
  FBReelsMockup:       "FB Reels script with shot timeline",
  IGPostBriefMockup:   "IG single 1:1 post / carousel preview",
  IGStoryMockup:       "IG Story 9:16 with stickers (3-7 slides)",
  IGReelsMockup:       "IG Reels 9:16 with audio attribution",
  QAReportMockup:      "QA scorecard with verdict + checks",
};

interface Verdict {
  fit: "good" | "marginal" | "mismatch";
  reason: string;
  suggested_variant?: string;
}

async function judge(stepName: string, stepDesc: string, outputKind: string, currentVariant: string): Promise<Verdict> {
  const sys = `你是 SoWork 的 squad 設計審核員。判斷一個 squad step 的 deliverable 跟它 tagged 的 mockupVariant 是否真的合適。\n\n可用的 mockup variants 與用途：\n${Object.entries(VARIANT_PURPOSE).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n\n判斷規則：\n- good: variant 完全符合 deliverable 的視覺呈現需求\n- marginal: 大致適合，但有更好的選項\n- mismatch: variant 跟 deliverable 完全不對（例：產 Reels 腳本卻 tag CalendarGridMockup）\n- 如果 deliverable 是「混合多種格式」（例：Post + Carousel + Story + Reels 都要），單一 variant 無法呈現 → mismatch，建議改成「動態變體」或拆 step\n\n嚴格回 JSON：\n{"fit":"good"|"marginal"|"mismatch","reason":"<25 字內，繁中>","suggested_variant":"<KNOWN_VARIANTS 之一，或 'split-step' / 'needs-new-component'>"}`;
  const user = `Step name: ${stepName}\nStep description: ${stepDesc}\nOutput kind: ${outputKind}\nCurrent mockupVariant: ${currentVariant}`;
  try {
    const r = await callLLM({ system: sys, user, maxTokens: 200, timeoutMs: 25_000 });
    const txt = r.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const j = JSON.parse(txt);
    return {
      fit: ["good", "marginal", "mismatch"].includes(j.fit) ? j.fit : "marginal",
      reason: String(j.reason ?? "").slice(0, 100),
      suggested_variant: j.suggested_variant ? String(j.suggested_variant) : undefined,
    };
  } catch (e) {
    return { fit: "marginal", reason: `judge failed: ${e instanceof Error ? e.message.slice(0, 50) : "—"}` };
  }
}

const ICON: Record<Verdict["fit"], string> = { good: "✓", marginal: "⚠", mismatch: "✗" };

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  const [squadRows]: any = await pool.execute(
    `SELECT s.id, s.slug, s.name, s.steps, s.workspace
       FROM squads s JOIN task_catalog t ON t.squad_id = s.id
      WHERE t.status IN ('active','coming_soon') AND t.workspace IN ('facebook','instagram')
      ORDER BY s.id`,
  );

  const lines: string[] = [`# Mockup-fit audit (${new Date().toISOString().split("T")[0]})\n`];
  let counts = { good: 0, marginal: 0, mismatch: 0 };

  for (const sq of (squadRows as any[])) {
    let steps: any[] = [];
    try { steps = typeof sq.steps === "string" ? JSON.parse(sq.steps) : sq.steps; } catch {}
    if (!Array.isArray(steps)) continue;
    console.log(`\n=== squad #${sq.id} ${sq.slug} ===`);
    lines.push(`\n## #${sq.id} ${sq.name}\n`);
    lines.push(`| step | name | outputKind | variant | fit | reason | suggested |`);
    lines.push(`|---|---|---|---|---|---|---|`);

    for (const s of steps) {
      if (!s.mockupVariant) continue;
      if (s.aiModel === "n/a") continue; // UI-only, skip
      const v = await judge(s.name ?? `Step ${s.order}`, s.description ?? "", s.outputKind ?? "?", s.mockupVariant);
      counts[v.fit]++;
      const sug = v.suggested_variant ?? "";
      console.log(`  step ${s.order} ${s.name}: ${ICON[v.fit]} ${v.reason} ${sug ? `→ ${sug}` : ""}`);
      lines.push(`| ${s.order} | ${s.name} | \`${s.outputKind}\` | \`${s.mockupVariant}\` | ${ICON[v.fit]} | ${v.reason} | ${sug ? `\`${sug}\`` : ""} |`);
    }
  }

  lines.push(`\n## Summary\n`);
  lines.push(`- ✓ good:     ${counts.good}`);
  lines.push(`- ⚠ marginal: ${counts.marginal}`);
  lines.push(`- ✗ mismatch: ${counts.mismatch}`);

  console.log(`\n=== summary === good=${counts.good} marginal=${counts.marginal} mismatch=${counts.mismatch}`);
  writeFileSync("/tmp/mockup-fit-audit.md", lines.join("\n"));
  console.log(`Full report → /tmp/mockup-fit-audit.md`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
