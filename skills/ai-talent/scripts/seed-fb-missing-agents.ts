/**
 * seed-fb-missing-agents — close the 2 specialist gaps from
 * audit-agent-fit (2026-05-01):
 *
 *   1. fb-crisis-comms          → fixes task #12 fb-crisis-reply (mismatch)
 *   2. fb-performance-analyst   → fixes squad #730 steps 1+2 (marginal)
 *
 * Each agent is created with:
 *   - Notion-style avatar via gpt-image-1 + sharp resize variants
 *   - Full bio/specialty/skills/methodology
 *   - INSERT into agents table (idempotent: skips if slug exists)
 *
 * After insert:
 *   - task_catalog #12 fb-crisis-reply   .agent_id → fb-crisis-comms
 *   - squad #730 steps 1, 2              .assignedAgentId → fb-performance-analyst
 *
 * Idempotent — re-runnable.
 */
import "dotenv/config";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import mysql from "mysql2/promise";

const COVERS_DIR = process.env.COVERS_DIR ?? "/opt/marketing-os/covers";
const COVERS_URL_PREFIX = process.env.COVERS_URL_PREFIX ?? "/static/covers";
mkdirSync(COVERS_DIR, { recursive: true });

const NOTION_BASE_PROMPT = `Flat 2D vector illustration in Notion-style aesthetic. Head-and-shoulders portrait. Character drawn entirely in solid black silhouette with selective white highlights only for facial features (eyes, nose, mouth, hair detail) — no gradients, no shading complexity. Background is a single solid pastel color filling the entire frame edge to edge. Hand-drawn outline character, friendly and professional. Square 1:1 composition. Modern, clean, approachable. Asian character. Subject takes up most of the frame.`;

const AVATAR_SIZES = [64, 128, 256, 512] as const;

interface AgentSpec {
  slug: string;
  name: string;
  englishName: string;
  title: string;
  englishTitle: string;
  layer: "strategy" | "execution";
  aiModel: string;
  specialty: string;
  bio: string;
  methodology: string;
  skills: string[];
  primarySkill: string;
  preferredModelTags: string[];
  avatarPrompt: string;
  avatarBgHex: string;
}

const AGENTS: AgentSpec[] = [
  {
    slug: "fb-crisis-comms",
    name: "周柏宏",
    englishName: "Brian Chou",
    title: "危機溝通專員",
    englishTitle: "Crisis Communications Specialist",
    layer: "execution",
    aiModel: "claude-opus-4-6",
    specialty: "社群危機回應、客訴公開回覆草稿、品牌信任修復、情緒同理表達。擅長在 30 分鐘內生出『致歉 + 解釋 + 承諾 + 私訊邀請』四段式回覆，避免廣告式空話。",
    bio: "危機溝通專員 Brian Chou，10 年消費品牌 PR 與社群危機處理經驗，曾協助多家品牌在負評風暴中守住信任資產。",
    methodology: "Patrick Lagadec Crisis Comms Framework + Brené Brown Empathy Mapping",
    skills: [
      "crisis-communication", "customer-service-writing", "empathy-messaging",
      "reputation-management", "brand-trust-recovery", "social-listening",
      "public-apology-craft", "tone-de-escalation",
    ],
    primarySkill: "crisis-communication",
    preferredModelTags: ["realism", "professional"],
    avatarPrompt: "Asian man in his late 30s. Short side-parted black hair. Wearing a dark navy collared shirt. Calm, steady expression — neither anxious nor smiling, projecting reliability under pressure. Slightly forward gaze (looking at the audience as if listening attentively).",
    avatarBgHex: "#FFE89A", // 淡黃 — 警示但穩定
  },
  {
    slug: "fb-performance-analyst",
    name: "黃心如",
    englishName: "Hailey Huang",
    title: "Facebook 成效分析師",
    englishTitle: "FB Performance Analyst",
    layer: "strategy",
    aiModel: "claude-opus-4-6",
    specialty: "FB 互動率分析、pillar 比例稽核、受眾洞察反推、KPI 設定與優化建議。把粗糙的 CSV 數據翻譯成『下個月應該怎麼調』的具體動作。",
    bio: "FB 成效分析師 Hailey Huang，前數位行銷顧問公司資料團隊，擅長把後台儀表板的數字變成可動工的內容調整建議。",
    methodology: "Avinash Kaushik Web Analytics 2.0 + Brian Solis Engagement Pyramid",
    skills: [
      "facebook-analytics", "engagement-analysis", "kpi-setting",
      "audience-insight-reverse", "data-storytelling", "performance-optimization",
      "pillar-audit", "monthly-reporting",
    ],
    primarySkill: "facebook-analytics",
    preferredModelTags: ["realism", "professional"],
    avatarPrompt: "Asian woman in her early 30s. Shoulder-length straight black hair tied back. Round glasses. Wearing a light grey blazer over a white shirt. Holding a tablet with a faint chart visible (subtle data reference). Confident, analytical expression.",
    avatarBgHex: "#9AC8FF", // 淡藍 — 分析
  },
];

async function genAvatarBase(prompt: string, savePath: string, bgHex: string): Promise<void> {
  const key = process.env.OPENAI_API_KEY ?? "";
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const fullPrompt = `${NOTION_BASE_PROMPT}\n\nBackground color: solid ${bgHex} pastel.\n\nSubject details: ${prompt}`;
  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-image-1", prompt: fullPrompt,
      size: "1024x1024", quality: "high", n: 1,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data: any = await resp.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI no b64");
  writeFileSync(savePath, Buffer.from(b64, "base64"));
}

async function makeVariants(basePath: string, slug: string): Promise<void> {
  let sharp: any = null;
  try { sharp = (await import("sharp")).default; } catch { /* */ }
  if (!sharp) { console.warn(`    ⚠ sharp not installed — keeping only 1024 base`); return; }
  for (const size of AVATAR_SIZES) {
    const out = join(COVERS_DIR, `agent-${slug}.${size}.png`);
    try {
      await sharp(basePath).resize(size, size, { fit: "cover", position: "centre" })
        .png({ compressionLevel: 9, palette: size <= 128 }).toFile(out);
    } catch (e: any) { console.warn(`    ⚠ resize ${size}: ${e.message}`); }
  }
}

async function ensureSkillInCatalog(pool: mysql.Pool, slug: string, name: string, category = "fb-team-specialist") {
  await pool.execute(
    `INSERT IGNORE INTO skill_catalog (slug, name, source, boundProvider, category)
     VALUES (?, ?, 'sowork-internal', 'anthropic', ?)`,
    [slug, name, category],
  );
}

async function insertAgent(pool: mysql.Pool, a: AgentSpec, avatarUrl: string): Promise<number> {
  const [existing]: any = await pool.execute(
    `SELECT id FROM agents WHERE slug = ? LIMIT 1`,
    [a.slug],
  );
  if ((existing as any[]).length > 0) {
    const id = Number((existing as any[])[0].id);
    console.log(`  ⚠ slug ${a.slug} already exists at id=${id} — skipping insert`);
    // Still update avatarUrl in case path changed
    await pool.execute(`UPDATE agents SET avatarUrl = ? WHERE id = ?`, [avatarUrl, id]);
    return id;
  }
  const [result]: any = await pool.execute(
    `INSERT INTO agents (
       slug, name, englishName, title, englishTitle, layer,
       avatarUrl, bio, specialty, skills, primarySkill,
       methodology, aiModel,
       name_zh, title_zh, bio_zh,
       preferredModelTags,
       isAvailable, isFeatured, reviewStatus, hireCount, taskEarnCount, totalEarned,
       creatorUserId
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'approved', 0, 0, 0, NULL)`,
    [
      a.slug, a.name, a.englishName, a.title, a.englishTitle, a.layer,
      avatarUrl, a.bio, a.specialty, JSON.stringify(a.skills), a.primarySkill,
      a.methodology, a.aiModel,
      a.name, a.title, a.bio,
      JSON.stringify(a.preferredModelTags),
    ],
  );
  return Number(result.insertId);
}

async function rebindings(pool: mysql.Pool, ids: Record<string, number>) {
  // 1. task_catalog #12 fb-crisis-reply → fb-crisis-comms
  if (ids["fb-crisis-comms"]) {
    const [r1]: any = await pool.execute(
      `UPDATE task_catalog SET agent_id = ? WHERE slug = 'fb-crisis-reply'`,
      [ids["fb-crisis-comms"]],
    );
    console.log(`✓ fb-crisis-reply → agent #${ids["fb-crisis-comms"]} (${(r1 as any).affectedRows} row)`);
  }

  // 2. squad #730 steps 1 + 2 → fb-performance-analyst
  if (ids["fb-performance-analyst"]) {
    const [sq]: any = await pool.execute(`SELECT steps FROM squads WHERE id = 730 LIMIT 1`);
    const row = (sq as any[])?.[0];
    if (row) {
      const steps = typeof row.steps === "string" ? JSON.parse(row.steps) : row.steps;
      if (Array.isArray(steps)) {
        let changed = 0;
        for (const s of steps) {
          if (s.order === 1 || s.order === 2) {
            s.assignedAgentId = ids["fb-performance-analyst"];
            s.assignedAgentName = "Hailey Huang";
            changed++;
          }
        }
        if (changed > 0) {
          await pool.execute(`UPDATE squads SET steps = ? WHERE id = 730`, [JSON.stringify(steps)]);
          console.log(`✓ squad #730: re-assigned ${changed} step(s) to agent #${ids["fb-performance-analyst"]}`);
        }
        // Also add the analyst to squad #730's agents JSON if not already there
        const [agentsRow]: any = await pool.execute(`SELECT agents FROM squads WHERE id = 730 LIMIT 1`);
        const agentsArr = typeof agentsRow[0]?.agents === "string" ? JSON.parse(agentsRow[0].agents) : agentsRow[0]?.agents;
        if (Array.isArray(agentsArr) && !agentsArr.find((a: any) => a.id === ids["fb-performance-analyst"])) {
          agentsArr.push({ id: ids["fb-performance-analyst"], name: "Hailey Huang", role: "Specialist", is_lead: false });
          await pool.execute(`UPDATE squads SET agents = ? WHERE id = 730`, [JSON.stringify(agentsArr)]);
          console.log(`✓ squad #730: added Hailey Huang to crew`);
        }
      }
    }
  }
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  const ids: Record<string, number> = {};
  console.log(`Seeding ${AGENTS.length} FB-team specialist agents…\n`);

  for (const a of AGENTS) {
    console.log(`→ ${a.englishName} (${a.slug})`);
    const basePath = join(COVERS_DIR, `agent-${a.slug}.png`);
    const avatarUrl = `${COVERS_URL_PREFIX}/agent-${a.slug}.png`;
    if (!existsSync(basePath) || (await import("fs")).statSync(basePath).size < 50_000) {
      try {
        await genAvatarBase(a.avatarPrompt, basePath, a.avatarBgHex);
        await makeVariants(basePath, a.slug);
        console.log(`    ✓ avatar generated + ${AVATAR_SIZES.length} variants`);
      } catch (e: any) {
        console.warn(`    ⚠ avatar failed (${e.message}) — proceeding without avatar`);
      }
    } else {
      console.log(`    ↪ avatar already exists, skipping gen`);
    }
    for (const skill of a.skills) {
      await ensureSkillInCatalog(pool, skill, skill);
    }
    const id = await insertAgent(pool, a, avatarUrl);
    ids[a.slug] = id;
    console.log(`    ✓ agent inserted at id=${id}`);
  }

  console.log(`\n→ Rebinding tasks/squads to new agents…`);
  await rebindings(pool, ids);

  console.log(`\n=== Final agent IDs ===`);
  for (const [slug, id] of Object.entries(ids)) console.log(`  ${slug.padEnd(28)} → #${id}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
