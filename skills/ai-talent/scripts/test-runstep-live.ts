/**
 * test-runstep-live — exercise callLLM with the EXACT prompt that
 * runStepLive would build for a given (squadId, stepIndex). Runs on
 * the VM with the same env (Anthropic / Azure / OpenRouter keys), so
 * we can verify squad execution end-to-end without going through the
 * tRPC HTTP path.
 *
 * Usage:  SQUAD_ID=726 STEP_INDEX=1 npx tsx scripts/test-runstep-live.ts
 *
 * Reports per-provider attempts, total duration, parse success, and
 * the conclusion's top-level keys so we can spot truncation / format drift.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { callLLM } from "../server/platform/core/llmRouter";

const SQUAD_ID = Number(process.env.SQUAD_ID ?? 726);
const STEP_INDEX = Number(process.env.STEP_INDEX ?? 1);
const SCOPE_KIND = process.env.SCOPE_KIND ?? "brand";
const SCOPE_ID = Number(process.env.SCOPE_ID ?? 0);

function maxTokensForOutputKind(outputKind: string): number {
  switch (outputKind) {
    case "text_strategic":   return 3000;
    case "structured_table": return 3500;
    case "text_content":     return 6000;
    case "qa_review":        return 2500;
    case "image_brief":
    case "video_brief":      return 1500;
    case "decision":         return 1500;
    default:                 return 2000;
  }
}

function safeJsonParse<T>(s: any, fallback: T): T {
  if (s == null) return fallback;
  if (typeof s === "object") return s as T;
  try { return JSON.parse(String(s)) as T; } catch { return fallback; }
}

function tryParseJson(raw: string): any | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const greedy = raw.match(/\{[\s\S]*\}/);
  if (greedy) { try { return JSON.parse(greedy[0]); } catch {} }
  return null;
}

function mockConclusionForStep(outputKind: string, mockup: string): any {
  if (mockup === "PillarTableMockup") {
    return {
      tilt: "（從品牌定位抓出的策略傾斜）",
      pillars: [
        { name: "受眾教育", ratio: 40, description: "...", visualDirection: "...", topics: ["..."] },
        { name: "競品差異化", ratio: 30, description: "...", visualDirection: "...", topics: ["..."] },
      ],
    };
  }
  if (mockup === "ResearchPanelMockup") {
    return { summary: "...", findings: ["..."], implications: ["..."] };
  }
  return { summary: "..." };
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST ?? "127.0.0.1",
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "mos_db",
  });

  const [sqRows] = await pool.execute(
    `SELECT id, slug, name, methodology, steps FROM squads WHERE id = ? LIMIT 1`,
    [SQUAD_ID],
  ) as any[];
  const squad = (sqRows as any[])?.[0];
  if (!squad) { console.error(`squad ${SQUAD_ID} not found`); process.exit(1); }

  const steps = safeJsonParse<any[]>(squad.steps, []);
  const step = steps[STEP_INDEX];
  if (!step) { console.error(`step ${STEP_INDEX} not found`); process.exit(1); }

  console.log(`Squad: ${squad.name} (#${SQUAD_ID})`);
  console.log(`\n--- All steps ---`);
  steps.forEach((s, i) => {
    console.log(`  [${i}] ${s.name} (${s.outputKind}/${s.mockupVariant ?? "—"}/${s.aiModel ?? "—"})`);
  });
  console.log(`\nTesting Step ${STEP_INDEX}: ${step.name}`);
  console.log(`  outputKind=${step.outputKind} mockup=${step.mockupVariant} aiModel=${step.aiModel}`);

  // Resolve scope
  let scopeLabel = "未綁定 scope";
  let scopeContext = "";
  if (SCOPE_ID > 0) {
    if (SCOPE_KIND === "brand") {
      const [r] = await pool.execute(
        `SELECT id, name, industry, description, positioning FROM brands WHERE id = ? LIMIT 1`,
        [SCOPE_ID],
      ) as any[];
      const row = (r as any[])?.[0];
      if (row) {
        scopeLabel = `品牌：${row.name}（${row.industry ?? ""}）`;
        scopeContext = `${row.description ?? ""}\n定位：${typeof row.positioning === "string" ? row.positioning : JSON.stringify(row.positioning)}`.slice(0, 2000);
      }
    }
  }
  console.log(`Scope: ${scopeLabel}`);

  const maxTokens = maxTokensForOutputKind(step.outputKind);
  const schemaExample = JSON.stringify(mockConclusionForStep(step.outputKind, step.mockupVariant), null, 2);

  const systemPrompt = `你是 ${step.assignedAgentName ?? "Squad Agent"}（zh-TW）。Squad「${squad.name}」步驟「${step.name}」負責人。

【方法論】${squad.methodology ?? "N/A"}
【步驟說明】${step.description ?? ""}

【輸出格式 — 嚴格 JSON】
- thinking (string, 200-600 字)
- conclusion (object, 必須符合範例 keys)
- sources (array)

conclusion 範例（${step.outputKind}, ${step.mockupVariant ?? ""}）：
${schemaExample}`;

  const userPrompt = `【Scope】${scopeLabel}\n${scopeContext}\n\n請執行此步驟，輸出 thinking + conclusion + sources JSON。`;

  console.log(`\nmaxTokens=${maxTokens} promptChars=${systemPrompt.length + userPrompt.length}`);
  console.log("Calling callLLM…\n");

  const t0 = Date.now();
  try {
    const result = await callLLM({ system: systemPrompt, user: userPrompt, maxTokens, timeoutMs: 35_000 });
    const dur = Date.now() - t0;
    console.log(`✓ Total ${dur}ms`);
    console.log(`✓ Attempts:`);
    for (const a of result.attempts) {
      console.log(`   - ${a.provider}/${a.key}: ${a.ok ? "OK" : "FAIL"} (${a.durationMs}ms) ${a.error ?? ""}`);
    }
    console.log(`✓ Response: ${result.text.length} chars`);
    console.log(`\n--- raw text (first 400) ---\n${result.text.slice(0, 400)}\n`);

    const parsed = tryParseJson(result.text);
    if (!parsed) {
      console.log("✗ JSON parse FAILED");
    } else {
      console.log(`✓ Parsed envelope keys: [${Object.keys(parsed).join(", ")}]`);
      if (parsed.conclusion) {
        console.log(`✓ Conclusion keys: [${Object.keys(parsed.conclusion).join(", ")}]`);
      }
      if (parsed.thinking) {
        console.log(`✓ Thinking: ${String(parsed.thinking).slice(0, 200)}…`);
      }
    }
  } catch (e) {
    const dur = Date.now() - t0;
    console.log(`✗ FAILED after ${dur}ms`);
    console.log(`✗ Error: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
