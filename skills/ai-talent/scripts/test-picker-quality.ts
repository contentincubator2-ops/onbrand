/**
 * test-picker-quality — exercise the SAME prompt build path as
 * squad.stepExecute mode=run for a real (squadSlug, brandId, eventId)
 * combo on prod, then run quality checks against the LLM output:
 *
 *   1. Does the response mention the EVENT NAME (proves scope reached prompt)?
 *   2. Does the response leak "#" markdown headers?
 *   3. Does the response leak internal labels (Jab N: / Step N:)?
 *
 * This is the test CJ asked for: I run it before bothering them.
 *
 * Usage:
 *   SQUAD_SLUG=fb-garyvee-jab-hook \
 *   BRAND_NAME="Pokémon GO" \
 *   EVENT_NAME="2026年五月單首龍經典社群日" \
 *   STEP_ORDER=2 \
 *   npx tsx scripts/test-picker-quality.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { callLLM } from "../server/_core/llmRouter";

const SQUAD_SLUG  = process.env.SQUAD_SLUG  ?? "fb-garyvee-jab-hook";
const BRAND_NAME  = process.env.BRAND_NAME  ?? "Pokémon GO";
const EVENT_NAME  = process.env.EVENT_NAME  ?? "2026年五月單首龍經典社群日";
const STEP_ORDER  = Number(process.env.STEP_ORDER ?? 2);

function safeJsonParse<T>(s: any, fallback: T): T {
  if (s == null) return fallback;
  if (typeof s === "object") return s as T;
  try { return JSON.parse(String(s)) as T; } catch { return fallback; }
}

function stripContentArtifacts(s: string): string {
  return s
    .replace(/^\s*(?:#\s*)?(?:Jab|Step|貼文|Post)\s*\d+\s*[:：][^\n]*\n+/gi, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^(?:以下(?:是|為)|這(?:是|篇是)|我(?:會|將)|這篇貼文(?:的目的)?是)[^\n]*\n+/m, "")
    .trim();
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST ?? "127.0.0.1",
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "mos_db",
  });

  // Resolve squad
  const [sqRows] = await pool.execute(
    `SELECT id, slug, name, agents, steps, methodology FROM squads WHERE slug = ? LIMIT 1`,
    [SQUAD_SLUG],
  ) as any[];
  const squad = (sqRows as any[])?.[0];
  if (!squad) { console.error(`squad ${SQUAD_SLUG} not found`); await pool.end(); process.exit(1); }
  const stepsRaw = safeJsonParse<any[]>(squad.steps, []);
  const step = stepsRaw.find((s: any) => Number(s.order ?? s.step) === STEP_ORDER) ?? stepsRaw[STEP_ORDER - 1];
  if (!step) { console.error(`step ${STEP_ORDER} not found`); await pool.end(); process.exit(1); }

  console.log(`Squad: ${squad.name} (#${squad.id})`);
  console.log(`Step ${STEP_ORDER}: ${step.name}`);
  console.log(`  outputType=${step.outputType ?? step.output ?? "—"}`);

  // Resolve brand
  const [bRows] = await pool.execute(
    `SELECT id, name, industry, description, positioningSummary, positioning
       FROM brands WHERE name = ? LIMIT 1`,
    [BRAND_NAME],
  ) as any[];
  const brand = (bRows as any[])?.[0];
  if (!brand) { console.error(`brand "${BRAND_NAME}" not found`); await pool.end(); process.exit(1); }
  console.log(`Brand: ${brand.name} (#${brand.id})`);

  // Resolve event — exact, then fuzzy LIKE %term% on first 3 chars chunks
  let ev: any = null;
  {
    const [eRows] = await pool.execute(
      `SELECT id, name, brandId, startAt, endAt, positioning FROM events WHERE name = ? LIMIT 1`,
      [EVENT_NAME],
    ) as any[];
    ev = (eRows as any[])?.[0];
  }
  if (!ev) {
    // Fuzzy: pick longest distinctive substring
    const term = EVENT_NAME.replace(/\s+/g, "").slice(0, 8);
    const [eRows] = await pool.execute(
      `SELECT id, name, brandId, startAt, endAt, positioning FROM events WHERE name LIKE ? AND brandId = ? ORDER BY startAt DESC LIMIT 5`,
      [`%${term}%`, brand.id],
    ) as any[];
    const list = eRows as any[];
    if (list.length === 0) {
      // Last resort — list all events for the brand
      const [allRows] = await pool.execute(
        `SELECT id, name, startAt FROM events WHERE brandId = ? ORDER BY startAt DESC LIMIT 10`,
        [brand.id],
      ) as any[];
      console.error(`event "${EVENT_NAME}" not found. Brand "${brand.name}" has these events:`);
      for (const r of (allRows as any[])) console.error(`  #${r.id}  ${r.name}  (${r.startAt})`);
      await pool.end();
      process.exit(1);
    }
    ev = list[0];
    console.log(`(fuzzy match: "${term}" → ${ev.name})`);
  }
  console.log(`Event: ${ev.name} (#${ev.id})`);

  // Build context exactly like stepExecute would
  const contextParts: string[] = [];
  const sub: string[] = [`【品牌】${brand.name}${brand.industry ? `（${brand.industry}）` : ""}`];
  if (brand.positioningSummary) sub.push(`品牌定位：${String(brand.positioningSummary).slice(0, 600)}`);
  else if (brand.description)   sub.push(`品牌描述：${String(brand.description).slice(0, 400)}`);
  else if (brand.positioning) {
    const pos = typeof brand.positioning === "string" ? brand.positioning : JSON.stringify(brand.positioning);
    sub.push(`品牌定位（JSON）：${pos.slice(0, 800)}`);
  }
  contextParts.push(sub.join("\n"));

  const period = ev.startAt ? `${String(ev.startAt).split("T")[0]} ~ ${String(ev.endAt ?? "").split("T")[0]}` : "（無日期）";
  const evPos = typeof ev.positioning === "string" ? ev.positioning : (ev.positioning ? JSON.stringify(ev.positioning) : "");
  contextParts.push(
    `【活動】${ev.name}（期間 ${period}）\n` +
    (evPos ? `活動定位（11-segment）：${evPos.slice(0, 1500)}` : "活動定位：（未填）"),
  );
  contextParts.push(
    `【重要】此 mission 的執行 scope 是上面這個「活動」。所有舉例、產品、受眾、主題、行動呼籲都必須緊扣這個活動本身（時間、主題、目標族群），禁止用品牌的通用範例（例如野生寶可夢一般介紹）取代活動的特定內容。如果你產出的內容換到品牌的其他活動也說得通，就是失敗。`,
  );
  const brandContext = contextParts.join("\n\n");

  const stepName = step.name ?? `Step ${STEP_ORDER}`;
  const stepDesc = step.description ?? "";
  const outputType = step.outputType ?? step.output ?? "";
  const outputLower = (outputType || "").toLowerCase();
  const isContent = /(post|caption|hashtag|content|文案|貼文|reel|腳本)/i.test(outputLower);

  const outputGuide = isContent
    ? `這是「內容類」交付物 — 你交出的東西要可以直接複製貼上到平台發出去。

【嚴格禁止 — 違反任一條都算失敗】
✗ 禁止 markdown 標題符號（# ## ### 等）— 用戶會直接複製到 Facebook 貼文，井字號是雜訊
✗ 禁止內部標籤 / 步驟名稱（例如「Jab 1: 教育型貼文文案」、「Step 3 文案」、「貼文 1：...」）— 那是內部使用，不該出現在貼文內
✗ 禁止前言 / 解釋 / 開場白（「以下是...」、「我會這樣寫：」、「這篇貼文的目的是...」）— 直接交付貼文本體
✗ 禁止 markdown 條列符號（- *）混在文案中 — 用 emoji 或編號，不要 markdown 語法
✗ 禁止 hashtag 出現在貼文上半段 — 結尾才放，純 #tag 列表

【正確輸出 — 直接是 Facebook / IG / TikTok 用戶看到的那行字】
✓ 第一行就是 hook（吸睛句）+ emoji
✓ 中段：產品/活動賣點 + 受眾為什麼在乎
✓ 結尾：CTA + 連結佔位符 + 3-5 個 hashtag
✓ 換行用真實換行符（\\n），不是 <br> 也不是 markdown`
    : `直接寫出成品內容，不要寫「我會...」這種方法論說明。`;

  const systemPrompt = `你是 ${step.assignedAgentName ?? "Squad Agent"}，專長：${step.requiredSkill ?? ""}。
你正在執行「${stepName}」步驟。

【最高優先規則】直接交付完成品本身。

${outputGuide}

用繁體中文。產出類型：${outputType || "適中"}。

【強制】這一步是為以下品牌/活動服務，所有舉例、語氣、產品、受眾都必須緊扣以下 scope，禁止通用範本：
${brandContext}
如果你產出的內容換到別的品牌或別的活動也成立，就是失敗。`;

  const userPrompt = `任務：FB 貼文文案 - ${EVENT_NAME}\n\n${brandContext}\n\n此步驟說明：${stepDesc || stepName}\n預期產出類型：${outputType || "(未指定)"}\n\n請直接交付【成品內容】 — 不是「我會這樣做」的說明。所有舉例必須來自上面這個 scope（活動 > 產品 > 品牌 cascade）的真實內容；如果有【活動】，舉例必須緊扣此活動的時間 / 主題 / TA / 商品 / CTA，不要拿品牌的其他活動或泛用例子代替。\n若產出類型是貼文文案：禁止 markdown 標題符號（#）、禁止內部標籤（Jab 1: / Step 1:）、禁止前言。直接從第一句開始寫貼文本體。`;

  console.log(`\nisContent=${isContent} promptChars=${systemPrompt.length + userPrompt.length}`);
  console.log("Calling callLLM…\n");

  const t0 = Date.now();
  const result = await callLLM({ system: systemPrompt, user: userPrompt, maxTokens: 3000, timeoutMs: 35_000 });
  const dur = Date.now() - t0;
  const raw = result.text;
  const cleaned = isContent ? stripContentArtifacts(raw) : raw;

  console.log(`✓ Total ${dur}ms via ${result.attempts.find(a => a.ok)?.provider}`);
  console.log(`✓ Response: ${raw.length} chars (cleaned: ${cleaned.length})`);

  // Quality checks
  console.log(`\n=== QUALITY CHECKS ===`);
  // 1. Event name appears in output?
  const mentionsEvent = cleaned.includes(EVENT_NAME) || cleaned.includes("龍") || cleaned.includes("社群日") || cleaned.includes("Community Day");
  console.log(`${mentionsEvent ? "✓" : "✗"} Mentions event keywords (${EVENT_NAME}/龍/社群日)`);

  // 2. Markdown headers in raw?
  const hasMdHeader = /^#{1,6}\s+/m.test(raw);
  const hasMdHeaderClean = /^#{1,6}\s+/m.test(cleaned);
  console.log(`${hasMdHeader ? "⚠" : "✓"} raw has markdown # headers: ${hasMdHeader}`);
  console.log(`${hasMdHeaderClean ? "✗" : "✓"} cleaned has markdown # headers: ${hasMdHeaderClean}`);

  // 3. Internal labels in raw?
  const internalLabel = /(Jab|Step|貼文|Post)\s*\d+\s*[:：]/i;
  const hasLabel = internalLabel.test(raw);
  const hasLabelClean = internalLabel.test(cleaned);
  console.log(`${hasLabel ? "⚠" : "✓"} raw has Jab/Step labels: ${hasLabel}`);
  console.log(`${hasLabelClean ? "✗" : "✓"} cleaned has Jab/Step labels: ${hasLabelClean}`);

  // 4. Generic Snorlax mention (the bad pattern)?
  const hasSnorlax = /卡比獸|Snorlax/i.test(cleaned);
  console.log(`${hasSnorlax ? "⚠" : "✓"} mentions generic 卡比獸/Snorlax (off-topic for Dragon CD): ${hasSnorlax}`);

  console.log(`\n=== RAW (first 800) ===\n${raw.slice(0, 800)}\n`);
  if (raw !== cleaned) {
    console.log(`=== CLEANED (first 800) ===\n${cleaned.slice(0, 800)}\n`);
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
