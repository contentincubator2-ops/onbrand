/**
 * test-fb-all-tasks-with-pokemon — batch QA harness for all 14 active
 * FB tasks against the Pokemon GO brand + Dragon Community Day event.
 *
 * For each task:
 *   - SQUAD impl: run the FIRST CONTENT-PRODUCING step (auto-detected
 *     by outputKind in {text_strategic, text_content, structured_table})
 *     so we exercise the prompt-build + scope-injection without paying
 *     for the full multi-step chain.
 *   - ATOMIC impl: run runAtomic with same scope.
 *
 * Quality checks per task:
 *   ✓ event keyword appears (proves scope reached prompt)
 *   ✓ no markdown # headers leaked
 *   ✓ no internal labels (Jab/Step/貼文 N:)
 *   ✓ no generic 卡比獸/Snorlax (off-topic for Dragon CD)
 *   ✓ no preface text (以下是 / 我會這樣...)
 *
 * Output: /tmp/fb-qa-report.md — one section per task with verdict +
 * raw output preview. CJ reviews then proceeds to UI verification.
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import mysql from "mysql2/promise";
import { callLLM } from "../server/_core/llmRouter";

const BRAND_NAME = process.env.BRAND_NAME ?? "Pokémon GO";
const EVENT_NAME_HINT = process.env.EVENT_NAME ?? "單首龍經典社群日";

function safeJsonParse<T>(s: any, fb: T): T {
  if (!s) return fb;
  if (typeof s === "object") return s as T;
  try { return JSON.parse(String(s)) as T; } catch { return fb; }
}

function maxTokensForOutputKind(k: string): number {
  switch (k) {
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

function stripContent(s: string): string {
  return s
    .replace(/^\s*(?:#\s*)?(?:Jab|Step|貼文|Post)\s*\d+\s*[:：][^\n]*\n+/gi, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^(?:以下(?:是|為)|這(?:是|篇是)|我(?:會|將)|這篇貼文(?:的目的)?是)[^\n]*\n+/m, "")
    .trim();
}

interface QualityCheck { label: string; pass: boolean; note?: string; }
function runChecks(raw: string, opts: { eventName: string; isContent: boolean }): QualityCheck[] {
  const cleaned = opts.isContent ? stripContent(raw) : raw;
  return [
    {
      label: "提到活動關鍵字",
      pass: cleaned.includes(opts.eventName) || /龍|社群日|Dragon|Community Day/i.test(cleaned),
    },
    {
      label: "無 markdown # 標題",
      pass: !/^#{1,6}\s+/m.test(cleaned),
    },
    {
      label: "無 Jab/Step 內部標籤",
      pass: !/(Jab|Step|貼文|Post)\s*\d+\s*[:：]/i.test(cleaned),
    },
    {
      label: "無泛用卡比獸/Snorlax 范本",
      pass: !/卡比獸|Snorlax/i.test(cleaned),
    },
    {
      label: "無前言/客套話開場",
      pass: !/^(?:以下(?:是|為)|這(?:是|篇是)|我(?:會|將)|這篇貼文(?:的目的)?是)/m.test(cleaned),
    },
  ];
}

async function runStepLive(args: {
  squad: any; step: any;
  brand: any; event: any;
}): Promise<{ raw: string; durationMs: number; provider: string; error?: string }> {
  // Build context exactly like squadTemplateRouter.runStepLive
  const contextParts: string[] = [];
  const sub = [`【品牌】${args.brand.name}${args.brand.industry ? `（${args.brand.industry}）` : ""}`];
  if (args.brand.positioningSummary) sub.push(`品牌定位：${String(args.brand.positioningSummary).slice(0, 600)}`);
  else if (args.brand.description)   sub.push(`品牌描述：${String(args.brand.description).slice(0, 400)}`);
  contextParts.push(sub.join("\n"));
  if (args.event) {
    const period = args.event.startAt ? `${String(args.event.startAt).split("T")[0]} ~ ${String(args.event.endAt ?? "").split("T")[0]}` : "（無日期）";
    const pos = typeof args.event.positioning === "string" ? args.event.positioning : (args.event.positioning ? JSON.stringify(args.event.positioning) : "");
    contextParts.push(`【活動】${args.event.name}（期間 ${period}）\n${pos ? `活動定位（11-segment）：${pos.slice(0, 1500)}` : "活動定位：（未填）"}`);
    contextParts.push("【重要】此 mission 的執行 scope 是上面這個「活動」。所有舉例、產品、受眾、主題、行動呼籲都必須緊扣這個活動本身，禁止用品牌的通用範例。");
  }
  const scopeContext = contextParts.join("\n\n");

  const systemPrompt = `你是 ${args.step.assignedAgentName ?? "Squad Agent"}（zh-TW）。Squad「${args.squad.name}」步驟「${args.step.name}」負責人。

【方法論】${args.squad.methodology ?? "N/A"}
【步驟說明】${args.step.description ?? ""}

【輸出格式 — 嚴格 JSON，不要任何前綴/後綴/markdown code fence】
回應必須是合法 JSON，三個 top-level keys：
- "thinking" (string, 200-600 字推理過程，繁中)
- "conclusion" (object, 結構符合此 outputKind 的標準 schema)
- "sources" (array of {url,title,charCount,excerpt}，無研究時可空陣列)

直接 raw JSON，不要 \`\`\`json 圍籬，不要 prose 前綴。`;

  const userPrompt = `【執行 Scope】
${scopeContext}

請執行此步驟，輸出 thinking + conclusion + sources JSON。`;

  const t0 = Date.now();
  try {
    const result = await callLLM({
      system: systemPrompt,
      user: userPrompt,
      maxTokens: maxTokensForOutputKind(args.step.outputKind),
      timeoutMs: 35_000,
    });
    return {
      raw: result.text,
      durationMs: Date.now() - t0,
      provider: result.attempts.find((a) => a.ok)?.provider ?? "?",
    };
  } catch (e) {
    return { raw: "", durationMs: Date.now() - t0, provider: "—", error: e instanceof Error ? e.message : String(e) };
  }
}

async function runAtomic(args: { task: any; agent: any; brand: any; event: any }) {
  const contextParts: string[] = [];
  const sub = [`【品牌】${args.brand.name}${args.brand.industry ? `（${args.brand.industry}）` : ""}`];
  if (args.brand.positioningSummary) sub.push(`品牌定位：${String(args.brand.positioningSummary).slice(0, 600)}`);
  else if (args.brand.description)   sub.push(`品牌描述：${String(args.brand.description).slice(0, 400)}`);
  contextParts.push(sub.join("\n"));
  if (args.event) {
    const period = args.event.startAt ? `${String(args.event.startAt).split("T")[0]} ~ ${String(args.event.endAt ?? "").split("T")[0]}` : "（無日期）";
    const pos = typeof args.event.positioning === "string" ? args.event.positioning : (args.event.positioning ? JSON.stringify(args.event.positioning) : "");
    contextParts.push(`【活動】${args.event.name}（期間 ${period}）\n${pos ? `活動定位：${pos.slice(0, 1500)}` : ""}`);
    contextParts.push("【重要】所有舉例必須緊扣此活動，禁止泛用範例。");
  }
  const scopeContext = contextParts.join("\n\n");

  const isContent = /(post|caption|hashtag|content|文案|貼文|reel|腳本)/i.test(args.task.slug + " " + args.task.description);
  const guide = isContent
    ? `【嚴格禁止】markdown # 標題、Jab/Step 內部標籤、前言客套話、上半段 hashtag。
【正確】emoji + hook 第一行 + 主體 + CTA + 結尾 hashtag。`
    : `直接交付完成品本身，不要寫「我會這樣做」的方法論說明。`;

  const systemPrompt = `你是 ${args.agent?.name ?? "Squad Agent"}（${args.agent?.title ?? ""}），專長：${args.agent?.primarySkill ?? ""}。
任務：${args.task.name_zh}
描述：${args.task.description}

${guide}
用繁體中文。`;
  const userPrompt = `${scopeContext}\n\n請直接交付【成品內容】 — atomic 任務，第一句就開始寫成品本身。`;

  const t0 = Date.now();
  try {
    const result = await callLLM({
      system: systemPrompt, user: userPrompt,
      maxTokens: 1500, timeoutMs: 35_000,
    });
    return {
      raw: result.text, durationMs: Date.now() - t0,
      provider: result.attempts.find((a) => a.ok)?.provider ?? "?",
    };
  } catch (e) {
    return { raw: "", durationMs: Date.now() - t0, provider: "—", error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  // Resolve brand
  const [bRows]: any = await pool.execute(
    `SELECT id, name, industry, description, positioningSummary, positioning
       FROM brands WHERE name = ? LIMIT 1`,
    [BRAND_NAME],
  );
  const brand = (bRows as any[])?.[0];
  if (!brand) { console.error(`brand "${BRAND_NAME}" not found`); await pool.end(); process.exit(1); }
  console.log(`Brand: ${brand.name} (#${brand.id})`);

  // Resolve event (fuzzy)
  const [eRows]: any = await pool.execute(
    `SELECT id, name, startAt, endAt, positioning FROM events
      WHERE name LIKE ? AND brandId = ? ORDER BY startAt DESC LIMIT 1`,
    [`%${EVENT_NAME_HINT}%`, brand.id],
  );
  const event = (eRows as any[])?.[0];
  if (event) console.log(`Event: ${event.name} (#${event.id})`);
  else       console.log(`(no event matching "${EVENT_NAME_HINT}" — running brand-only)`);

  // Load all active FB tasks
  const [taskRows]: any = await pool.execute(
    `SELECT t.id, t.slug, t.name_zh, t.description, t.impl_kind, t.squad_id, t.agent_id,
            s.slug AS squad_slug, s.name AS squad_name, s.steps AS squad_steps, s.methodology,
            a.name AS agent_name, a.title AS agent_title, a.primarySkill AS agent_skill
       FROM task_catalog t
  LEFT JOIN squads s ON s.id = t.squad_id
  LEFT JOIN agents a ON a.id = t.agent_id
      WHERE t.workspace = 'facebook' AND t.status = 'active'
      ORDER BY t.id`,
  );
  console.log(`\n${(taskRows as any[]).length} active FB tasks to test\n`);

  const lines: string[] = [`# Pokemon GO × FB 全任務 QA 報告 (${new Date().toISOString()})\n`];
  lines.push(`Brand: **${brand.name}** (#${brand.id})  ·  Event: **${event?.name ?? "—"}**\n`);

  let pass = 0, partial = 0, fail = 0;

  for (const t of (taskRows as any[])) {
    console.log(`\n=== task #${t.id} ${t.slug} (${t.impl_kind}) ===`);
    lines.push(`\n## #${t.id} ${t.name_zh} \`${t.slug}\` — ${t.impl_kind}\n`);

    let result: { raw: string; durationMs: number; provider: string; error?: string };
    let isContent = false;

    if (t.impl_kind === "squad") {
      const steps = safeJsonParse<any[]>(t.squad_steps, []);
      // Pick first content-producing step (skip intake / checkpoint)
      const target = steps.find((s) =>
        s.outputKind && ["text_strategic", "text_content", "structured_table"].includes(s.outputKind)
        && s.aiModel !== "n/a"
      ) ?? steps[0];
      if (!target) {
        console.log(`  ✗ no testable step found`);
        lines.push(`- ✗ **no testable step**\n`);
        fail++;
        continue;
      }
      console.log(`  testing step ${target.order}: ${target.name}`);
      lines.push(`- squad: \`${t.squad_slug}\` (#${t.squad_id})`);
      lines.push(`- testing step ${target.order}: \`${target.name}\` (outputKind=\`${target.outputKind}\`)`);
      isContent = target.outputKind === "text_content";
      result = await runStepLive({ squad: t, step: target, brand, event });
    } else {
      console.log(`  testing atomic task with agent ${t.agent_name ?? t.agent_id}`);
      lines.push(`- atomic agent: **${t.agent_name ?? "—"}** (\`${t.agent_skill ?? "—"}\`)`);
      isContent = /(post|caption|文案|貼文|reel|腳本|carousel)/i.test(t.slug);
      result = await runAtomic({
        task: t,
        agent: { name: t.agent_name, title: t.agent_title, primarySkill: t.agent_skill },
        brand, event,
      });
    }

    if (result.error) {
      console.log(`  ✗ ERROR: ${result.error}`);
      lines.push(`- ✗ **LLM error**: ${result.error}\n`);
      fail++;
      continue;
    }

    const checks = runChecks(result.raw, { eventName: EVENT_NAME_HINT, isContent });
    const failedChecks = checks.filter((c) => !c.pass).length;
    const verdict = failedChecks === 0 ? "✓ PASS" : failedChecks <= 1 ? "⚠ PARTIAL" : "✗ FAIL";
    if (verdict === "✓ PASS") pass++;
    else if (verdict === "⚠ PARTIAL") partial++;
    else fail++;

    console.log(`  ${verdict}  (${result.durationMs}ms via ${result.provider})`);
    lines.push(`- duration: ${result.durationMs}ms via \`${result.provider}\``);
    lines.push(`- **${verdict}** (${5 - failedChecks}/5 checks pass)`);
    for (const c of checks) {
      lines.push(`  - ${c.pass ? "✓" : "✗"} ${c.label}`);
    }
    const cleaned = isContent ? stripContent(result.raw) : result.raw;
    lines.push(`\n<details><summary>output preview (first 600 chars)</summary>\n\n\`\`\`\n${cleaned.slice(0, 600)}\n\`\`\`\n\n</details>`);
  }

  lines.push(`\n## Summary\n`);
  lines.push(`- ✓ pass:    ${pass}`);
  lines.push(`- ⚠ partial: ${partial}`);
  lines.push(`- ✗ fail:    ${fail}`);
  lines.push(`- total:    ${(taskRows as any[]).length}`);

  console.log(`\n=== summary === pass=${pass} partial=${partial} fail=${fail}`);

  writeFileSync("/tmp/fb-qa-report.md", lines.join("\n"));
  console.log(`\nFull report → /tmp/fb-qa-report.md`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
