/**
 * test-atomic-task — exercise the SAME prompt build path as
 * taskCatalog.runAtomic for a real (taskSlug, brandId, eventId)
 * combo on prod. Lets me verify atomic flow end-to-end without
 * going through the picker UI.
 *
 * Usage:
 *   TASK_SLUG=fb-single-post-text BRAND_NAME="Pokémon GO" \
 *   EVENT_NAME="單首龍經典社群日" \
 *   npx tsx scripts/test-atomic-task.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { callLLM } from "../server/platform/core/llmRouter";

const TASK_SLUG  = process.env.TASK_SLUG  ?? "fb-single-post-text";
const BRAND_NAME = process.env.BRAND_NAME ?? "Pokémon GO";
const EVENT_NAME = process.env.EVENT_NAME ?? "";  // optional

function stripContentArtifacts(s: string): string {
  return s
    .replace(/^\s*(?:#\s*)?(?:Jab|Step|貼文|Post)\s*\d+\s*[:：][^\n]*\n+/gi, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^(?:以下(?:是|為)|這(?:是|篇是)|我(?:會|將)|這篇貼文(?:的目的)?是)[^\n]*\n+/m, "")
    .trim();
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  // Resolve task
  const [tRows]: any = await pool.execute(
    `SELECT t.*, a.name AS agent_name, a.title AS agent_title,
            a.primarySkill AS agent_skill, a.aiModel AS agent_model
       FROM task_catalog t LEFT JOIN agents a ON a.id = t.agent_id
      WHERE t.slug = ? LIMIT 1`,
    [TASK_SLUG],
  );
  const task = (tRows as any[])?.[0];
  if (!task) { console.error(`task ${TASK_SLUG} not found`); await pool.end(); process.exit(1); }
  if (task.impl_kind !== "atomic") {
    console.error(`task ${TASK_SLUG} is impl_kind=${task.impl_kind}, not atomic`);
    await pool.end(); process.exit(1);
  }
  console.log(`Task: ${task.name_zh} (#${task.id}, slug=${task.slug})`);
  console.log(`  agent: ${task.agent_name} (${task.agent_title ?? "—"})`);
  console.log(`  estimated_minutes: ${task.estimated_minutes}, bypassable: ${task.bypassable}`);

  // Resolve brand
  const [bRows]: any = await pool.execute(
    `SELECT id, name, industry, description, positioningSummary, positioning
       FROM brands WHERE name = ? LIMIT 1`,
    [BRAND_NAME],
  );
  const brand = (bRows as any[])?.[0];
  if (!brand) { console.error(`brand ${BRAND_NAME} not found`); await pool.end(); process.exit(1); }
  console.log(`Brand: ${brand.name} (#${brand.id})`);

  // Optional event
  let event: any = null;
  if (EVENT_NAME) {
    const [eRows]: any = await pool.execute(
      `SELECT id, name, startAt, endAt, positioning
         FROM events WHERE name LIKE ? AND brandId = ? ORDER BY startAt DESC LIMIT 1`,
      [`%${EVENT_NAME}%`, brand.id],
    );
    event = (eRows as any[])?.[0];
    if (event) console.log(`Event: ${event.name} (#${event.id})`);
  }

  // Build context (taskCatalogRouter 已於 2026-09-07 移除；此處自行組 context)
  const contextParts: string[] = [];
  const sub = [`【品牌】${brand.name}${brand.industry ? `（${brand.industry}）` : ""}`];
  if (brand.positioningSummary) sub.push(`品牌定位：${String(brand.positioningSummary).slice(0, 600)}`);
  else if (brand.description)   sub.push(`品牌描述：${String(brand.description).slice(0, 400)}`);
  else if (brand.positioning) {
    const pos = typeof brand.positioning === "string" ? brand.positioning : JSON.stringify(brand.positioning);
    sub.push(`品牌定位（JSON）：${pos.slice(0, 800)}`);
  }
  contextParts.push(sub.join("\n"));
  if (event) {
    const period = event.startAt ? `${String(event.startAt).split("T")[0]} ~ ${String(event.endAt ?? "").split("T")[0]}` : "（無日期）";
    const pos = typeof event.positioning === "string" ? event.positioning : (event.positioning ? JSON.stringify(event.positioning) : "");
    contextParts.push(`【活動】${event.name}（期間 ${period}）\n${pos ? `活動定位（11-segment）：${pos.slice(0, 1500)}` : "活動定位：（未填）"}`);
    contextParts.push(`【重要】此任務的 scope 是上面這個「活動」，所有舉例必須緊扣活動本身，禁止用品牌通用範例。`);
  }
  const scopeContext = contextParts.join("\n\n");

  const isContent = /(post|caption|hashtag|content|文案|貼文|reel|腳本)/i.test(task.slug + " " + task.description);
  const guide = isContent
    ? `【嚴格禁止 — 違反任一條都算失敗】
✗ 禁止 markdown 標題符號（# ## ### 等）
✗ 禁止內部標籤（Jab 1: / Step N: / 貼文 1：等）
✗ 禁止前言（「以下是」「我會這樣寫」）
【正確輸出】直接是 Facebook 用戶看到的那行字。emoji + hook + CTA + 結尾 hashtag。`
    : `直接交付完成品本身，不要寫「我會這樣做」的方法論說明。`;

  const systemPrompt = `你是 ${task.agent_name}（${task.agent_title ?? ""}），專長：${task.agent_skill ?? ""}。
你正在執行「${task.name_zh}」這個 atomic 任務（單 agent 直接交付，不分多步驟）。

任務描述：${task.description}

${guide}

用繁體中文。`;

  const userPrompt = `${scopeContext}\n\n請直接交付【成品內容】 — atomic 任務，第一句就開始寫成品本身，不要前言。`;

  console.log(`\nisContent=${isContent} promptChars=${systemPrompt.length + userPrompt.length}`);
  console.log("Calling callLLM…\n");

  const t0 = Date.now();
  const result = await callLLM({ system: systemPrompt, user: userPrompt, maxTokens: 1500, timeoutMs: 35_000 });
  const dur = Date.now() - t0;
  const raw = result.text;
  const cleaned = isContent ? stripContentArtifacts(raw) : raw;

  console.log(`✓ Total ${dur}ms via ${result.attempts.find(a => a.ok)?.provider}`);
  console.log(`✓ Response: ${raw.length} chars (cleaned: ${cleaned.length})\n`);

  // Quality checks
  const hasMd = /^#{1,6}\s+/m.test(cleaned);
  const hasLabel = /(Jab|Step|貼文|Post)\s*\d+\s*[:：]/i.test(cleaned);
  console.log(`=== QUALITY ===`);
  console.log(`${hasMd ? "✗" : "✓"} no markdown # headers in cleaned`);
  console.log(`${hasLabel ? "✗" : "✓"} no Jab/Step labels in cleaned`);
  if (event) {
    const evMatch = cleaned.includes(event.name) || event.name.split("").some((c: string) => /[龍社群日]/.test(c) && cleaned.includes(c));
    console.log(`${evMatch ? "✓" : "⚠"} mentions event content`);
  }

  console.log(`\n=== CLEANED OUTPUT ===\n${cleaned}\n`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
