/**
 * demo-guiguan.ts
 *
 * Live end-to-end demo: 桂冠營養研究室 fb-30-caption-short.
 * Loads the assigned agent (Tina Ji) persona from mos_db, composes
 * the full 4-layer prompt (master + agent persona + brand + task),
 * and calls the LLM to produce a real FB post.
 *
 * Usage:
 *   npx tsx scripts/demo-guiguan.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import assignmentsData from "../data/agent-assignments.json" with { type: "json" };
import { getCopywritingMasterPrompt } from "../server/_core/copywritingMaster";

const TASK_ID = "fb-30-caption-short";
const BRAND_NAME = "桂冠營養研究室";
const BRAND_DESC = `桂冠實業（成立 1970）旗下 2023 年創立的營養食品子品牌。
主推「即食、營養均衡、台灣家庭常備」— 全榖雜糧水餃皮、低鈉高湯包、3 分鐘上桌。
母品牌 60 年冷凍食品經驗（湯圓、水餃、火鍋料），子品牌定位健康+便利兼具。`;

const TASK_BRIEF = `母親節即將到來，想推一篇 FB 貼文宣傳「全榖水餃 母親節雙人組」 — 訴求給職業媽媽：下班 20:00 還能 3 分鐘端上一家健康晚餐。`;

async function main() {
  // 1. 抓被指派的 agent ID
  const a = (assignmentsData as any).assignments[TASK_ID];
  const leadId = a?.lead;
  console.log(`\n=== Agent 指派 ===`);
  console.log(`Task: ${TASK_ID}`);
  console.log(`Lead agent_id: ${leadId}`);

  // 2. 從 DB 撈 agent
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "mos_user",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "MUST_SET_LOCAL_DB_PASSWORD",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });
  const [rows]: any = await pool.execute(
    `SELECT name, title, bio, specialty, methodology, experienceDetail FROM agents WHERE id=?`,
    [leadId],
  );
  const agent = rows[0];
  console.log(`Agent: ${agent.name} — ${agent.title}`);
  const persona =
    `你是 ${agent.name}，${agent.title}。\n` +
    (agent.bio ? `背景：${agent.bio}\n` : "") +
    (agent.specialty ? `專長：${agent.specialty}\n` : "") +
    (agent.methodology ? `方法論：\n${agent.methodology}\n` : "") +
    (agent.experienceDetail ? `\n# 你的工作經驗自述\n${agent.experienceDetail}\n` : "") +
    `用你的口氣寫，不要寫得像通用 AI。`;
  console.log(`Persona length: ${persona.length} chars`);

  // 3. 組三層 prompt
  const masterBlock = getCopywritingMasterPrompt({ market: "zh-TW", platform: "facebook" });

  const taskInstruction = `產出單張圖文 FB 貼文 caption，100-200 字。
結構：第 1 句 hook 拉注意 / 中間 1-2 段內容鋪陳 / 最後 1 句 CTA。
語氣要求：自然口語、有 hook、不要 "親愛的客戶" 或 "歡迎購買" 的官腔。
品牌語氣若 system context 已給，務必貼合，不要用罐頭模板。
hashtag 不超過 5 個（FB 觀眾不愛 hashtag 海）。
另外給 1 句 image_style_direction.summary 描述配圖風格方向。`;

  const brandSection = `
# 品牌真實內容（用於 ground 產出，不要捏造跟這份不符的產業）
品牌名：${BRAND_NAME}
品牌簡介：${BRAND_DESC}
本次主題：${TASK_BRIEF}`;

  const system = `${masterBlock}

# 你的角色
${persona}

# 任務
${taskInstruction}
${brandSection}`;

  console.log(`\n=== 完整 system prompt 長度: ${system.length} chars ===\n`);
  console.log(`首 300 字 preview:\n${system.slice(0, 300)}...\n[...]\n`);

  // 4. Call Anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Missing ANTHROPIC_API_KEY");
    await pool.end();
    process.exit(1);
  }

  console.log(`=== 呼叫 LLM (claude-haiku-4-5) ===\n`);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: `請寫這篇 FB 貼文。直接給 caption，不要 markdown 圍籬。` }],
    }),
  });
  const data: any = await r.json();
  const post = data?.content?.[0]?.text ?? JSON.stringify(data);

  console.log(`════════════════════════════════════════`);
  console.log(`  桂冠營養研究室 FB 貼文 — 由 ${agent.name} 寫成`);
  console.log(`════════════════════════════════════════`);
  console.log(post);
  console.log(`════════════════════════════════════════`);

  await pool.end();
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
