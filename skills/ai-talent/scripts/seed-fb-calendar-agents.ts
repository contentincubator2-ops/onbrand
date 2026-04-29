/**
 * seed-fb-calendar-agents.ts
 *
 * One-shot script: generate 5 Notion-style avatars via OpenAI gpt-image-1
 * and INSERT 5 new agents into the `agents` table for the FB Monthly
 * Calendar squad (Joe Pulizzi Content Pillar method).
 *
 * Run on VM:
 *   cd /opt/marketing-os/app/skills/ai-talent
 *   OPENAI_API_KEY=sk-... npx tsx scripts/seed-fb-calendar-agents.ts
 *
 * Idempotent: skips agents whose slug already exists.
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import localPool from "../server/localDb";

const COVERS_DIR = process.env.COVERS_DIR ?? "/opt/marketing-os/covers";
const COVERS_URL_PREFIX = process.env.COVERS_URL_PREFIX ?? "/static/covers";
mkdirSync(COVERS_DIR, { recursive: true });

const NOTION_BASE_PROMPT = `Flat 2D vector illustration in Notion-style aesthetic. Head-and-shoulders portrait. Character drawn entirely in solid black silhouette with selective white highlights only for facial features (eyes, nose, mouth, hair detail) — no gradients, no shading complexity. Background is a single solid pastel color filling the entire frame edge to edge. Hand-drawn outline character, friendly and professional. Square 1:1 composition. Modern, clean, approachable. Asian character. Subject takes up most of the frame.`;

interface AgentSpec {
  slug: string;
  name: string;          // 中文姓名
  englishName: string;
  title: string;         // 中文 title
  englishTitle: string;
  layer: "strategy" | "execution";
  aiModel: string;
  specialty: string;
  bio: string;
  methodology: string;
  skills: string[];
  preferredModelTags: string[];
  primarySkill: string;
  avatarPrompt: string;     // role-specific addition to NOTION_BASE_PROMPT
  avatarBgHex: string;      // for the prompt + future UI tinting
}

const AGENTS: AgentSpec[] = [
  {
    slug: "audience-insight-lead",
    name: "林靜怡",
    englishName: "Stacy Lin",
    title: "受眾洞察研究員",
    englishTitle: "Audience Insight Lead",
    layer: "strategy",
    aiModel: "claude-opus-4-6",
    specialty: "從社群討論、論壇、廣告數據中萃取可行動的受眾洞察。擅長 Jobs-to-be-Done、Persona、心理 reframe 框架。",
    bio: "受眾洞察研究員 Stacy Lin。擅長把零散的社群訊號轉成清晰的受眾故事，並用 reframe 找出品牌可介入的縫隙。",
    methodology: "Indi Young Listening + Clayton Christensen JTBD",
    skills: ["audience-strategy", "social-listening", "persona-design", "jtbd-research", "web-research", "behavior-analysis"],
    preferredModelTags: ["realism", "lifestyle"],
    primarySkill: "audience-strategy",
    avatarPrompt: "Asian woman in her late 20s. Shoulder-length straight black hair. Round wire-frame glasses. Wearing a turtleneck sweater. Slight thoughtful smile. Headphones resting around her neck (subtle listening reference). Looking slightly to the side with attentive eyes.",
    avatarBgHex: "#B89AFF", // 淡紫
  },
  {
    slug: "content-pillar-architect",
    name: "沈澤霖",
    englishName: "Vincent Shen",
    title: "內容支柱架構師（Pulizzi 派）",
    englishTitle: "Content Pillar Architect (Pulizzi School)",
    layer: "strategy",
    aiModel: "claude-opus-4-6",
    specialty: "把品牌定位翻譯成 3-5 根可長期經營的內容支柱。精通 Joe Pulizzi Content Tilt + Latane Conant Pillar/Cluster 操作化。",
    bio: "Pulizzi 派內容支柱架構師。把零散的內容靈感收進可壟斷的語意空間，讓品牌在自己的 tilt 上 compound。",
    methodology: "Joe Pulizzi - Content Inc. (2nd ed. 2021) + Latane Conant Pillar/Cluster",
    skills: ["content-pillar-design", "topic-clustering", "content-tilt-discovery", "editorial-strategy", "content-marketing", "atomization-strategy"],
    preferredModelTags: ["brand-system"],
    primarySkill: "content-pillar-design",
    avatarPrompt: "Asian man in his mid 30s. Short black hair with a side part. Light beard stubble. No glasses. Wearing a collared shirt with rolled-up sleeves. Holding a fountain pen near his chin in a thoughtful pose. Slight upward gaze. Calm confident expression like an architect reviewing a blueprint.",
    avatarBgHex: "#9FD89F", // 草綠
  },
  {
    slug: "editorial-calendar-architect",
    name: "楊珮蓉",
    englishName: "Phoebe Yang",
    title: "編輯行事曆策劃師",
    englishTitle: "Editorial Calendar Lead",
    layer: "execution",
    aiModel: "gpt-4.1",
    specialty: "把 pillar 定義 + 活動 peak + 節慶轉成可執行的月度排程。擅長 cadence design、format mix、prime-time 演算法配對。",
    bio: "編輯行事曆策劃師 Phoebe。讓內容支柱真的長腳走進日曆，把 pillar 比例、event peak、TW 節慶、FB prime-time 整合成可執行的 5 列 7 天月曆。",
    methodology: "Pillar-anchored monthly cadence + Meta posting prime-time signals",
    skills: ["editorial-calendar", "content-calendar", "social-media-planning", "fb-best-practices", "schedule-optimization", "json-output"],
    preferredModelTags: ["fast"],
    primarySkill: "editorial-calendar",
    avatarPrompt: "Asian woman in her early 30s. Long wavy black hair tied loosely back. No glasses. Wearing a button-up shirt. Energetic warm smile showing teeth slightly. Holding an open paper planner with visible date grid lines. Dynamic confident posture, like she's about to mark a date.",
    avatarBgHex: "#FFB870", // 暖橘
  },
  {
    slug: "fb-brief-writer",
    name: "許祺安",
    englishName: "Aiden Hsu",
    title: "FB 簡介撰寫師",
    englishTitle: "FB Content Brief Writer",
    layer: "execution",
    aiModel: "claude-sonnet-4-5",
    specialty: "把 pillar 主題 + calendar slot 轉成可直接拍片或設計的 brief。擅長 hook 寫作、品牌語氣保留、批量產出一致性。",
    bio: "FB 簡介撰寫師 Aiden。負責把策略翻譯成可執行的內容卡 — 每一張卡含 hook、引言、CTA、視覺方向，給後段製作直接拿去用。",
    methodology: "Atomization-first brief writing + brand voice preservation",
    skills: ["fb-copywriting", "hook-writing", "brand-voice-consistency", "social-copy", "atomized-content", "brief-writing"],
    preferredModelTags: ["fast", "social-reel"],
    primarySkill: "fb-copywriting",
    avatarPrompt: "Asian man in his late 20s. Short messy black hair. Round glasses. Wearing a zip-up hoodie over a t-shirt. Casual creative vibe. Slight head tilt. Focused expression, like he's about to type the perfect opening line. Laptop edge visible at the bottom of the frame.",
    avatarBgHex: "#7BB7FF", // FB 藍
  },
  {
    slug: "fb-visual-director",
    name: "鄭曼婷",
    englishName: "Mandy Cheng",
    title: "FB 視覺方向總監",
    englishTitle: "FB Visual Direction Lead",
    layer: "strategy",
    aiModel: "claude-opus-4-6",
    specialty: "把品牌視覺系統翻譯成 FB 平台原生的視覺方向。擅長 art direction、brand consistency、平台適配。",
    bio: "FB 視覺方向總監 Mandy。守護品牌視覺在 social feed 裡的辨識度 — 從 KV 延伸到 carousel、Reels、story 全 format 一致。",
    methodology: "Brand Visual System × Platform-native Atomization",
    skills: ["visual-direction", "art-direction", "brand-visual-system", "fb-platform-visual", "image-brief-writing", "creative-direction"],
    preferredModelTags: ["brand-kv", "ad-banner", "premium", "asian-face", "lifestyle"],
    primarySkill: "visual-direction",
    avatarPrompt: "Asian woman in her early 30s. Short bob haircut with bangs. Statement geometric earrings. No glasses. Wearing an artist's apron over a shirt. A paintbrush tucked behind one ear. Confident creative smile. Looking directly at camera with art-director presence.",
    avatarBgHex: "#FF8FB1", // 桃紅
  },
];

// Avatar render sizes — pre-render so frontend can pick the right one
// per context (chip / list / card / hero). Picking 1024 to display at
// 32px wastes 200kb per request; pre-rendering 4 variants saves bandwidth.
//
// Convention: base path = `agent-<slug>.png` (1024 — back-compat),
// variants = `agent-<slug>.<size>.png` (64 / 128 / 256 / 512).
// Frontend resolveAvatarUrl(base, size) → swaps .png → .<size>.png.
const AVATAR_SIZES = [64, 128, 256, 512] as const;

async function genAvatarBase(prompt: string, savePath: string): Promise<void> {
  const key = process.env.OPENAI_API_KEY ?? "";
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const fullPrompt = `${NOTION_BASE_PROMPT}\n\nSubject details: ${prompt}`;
  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: fullPrompt,
      size: "1024x1024",
      quality: "high",
      n: 1,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${t.slice(0, 300)}`);
  }
  const data: any = await resp.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI no b64 in response");
  writeFileSync(savePath, Buffer.from(b64, "base64"));
}

/**
 * Resize source PNG to multiple sizes. Tries `sharp` first (best quality);
 * falls back to ImageMagick `convert`; if neither available logs warning
 * and keeps only the 1024 base. Frontend gracefully degrades to base.
 */
async function generateAvatarVariants(basePath: string, slug: string): Promise<void> {
  const baseDir = COVERS_DIR;
  // Try sharp (cleanest, best-quality bilinear resize)
  let sharp: any = null;
  try { sharp = (await import("sharp")).default; } catch { /* not installed */ }
  if (sharp) {
    for (const size of AVATAR_SIZES) {
      const outPath = join(baseDir, `agent-${slug}.${size}.png`);
      try {
        await sharp(basePath)
          .resize(size, size, { fit: "cover", position: "centre" })
          .png({ compressionLevel: 9, palette: size <= 128 })
          .toFile(outPath);
      } catch (e: any) {
        console.warn(`    ⚠ sharp resize ${size}px failed: ${e.message}`);
      }
    }
    console.log(`    ✓ generated ${AVATAR_SIZES.length} variants via sharp`);
    return;
  }
  // Fallback: ImageMagick `convert` shell-out
  const { execSync } = await import("child_process");
  let imAvailable = false;
  try {
    execSync("which convert", { stdio: "ignore" });
    imAvailable = true;
  } catch { /* not available */ }
  if (imAvailable) {
    for (const size of AVATAR_SIZES) {
      const outPath = join(baseDir, `agent-${slug}.${size}.png`);
      try {
        execSync(`convert "${basePath}" -resize ${size}x${size} "${outPath}"`, { stdio: "ignore" });
      } catch (e: any) {
        console.warn(`    ⚠ convert ${size}px failed: ${e.message}`);
      }
    }
    console.log(`    ✓ generated ${AVATAR_SIZES.length} variants via ImageMagick`);
    return;
  }
  console.warn(`    ⚠ neither sharp nor ImageMagick available — keeping only 1024 base`);
}

async function genAvatar(prompt: string, savePath: string, slug: string): Promise<void> {
  await genAvatarBase(prompt, savePath);
  await generateAvatarVariants(savePath, slug);
}

async function ensureSkillInCatalog(slug: string, name: string, category = "fb-calendar-squad") {
  await localPool.execute(
    `INSERT IGNORE INTO skill_catalog (slug, name, source, boundProvider, category)
     VALUES (?, ?, 'sowork-internal', 'anthropic', ?)`,
    [slug, name, category],
  );
}

async function insertAgent(a: AgentSpec, avatarUrl: string): Promise<number> {
  // Check if slug already exists (idempotent re-run)
  const [existing]: any = await localPool.execute(
    `SELECT id FROM agents WHERE slug = ? LIMIT 1`,
    [a.slug],
  );
  if ((existing as any[]).length > 0) {
    const id = Number((existing as any[])[0].id);
    console.log(`  ⚠ slug ${a.slug} already exists at id=${id} — skipping insert`);
    return id;
  }
  const [result]: any = await localPool.execute(
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

(async () => {
  console.log(`Seeding ${AGENTS.length} FB Calendar squad agents...\n`);
  const summary: Array<{ id: number; slug: string; name: string; avatarUrl: string }> = [];

  for (const a of AGENTS) {
    console.log(`▸ ${a.englishName} (${a.slug})`);

    // 1. Skip avatar gen if file already exists (idempotent re-run)
    const filename = `agent-${a.slug}.png`;
    const filePath = join(COVERS_DIR, filename);
    const avatarUrl = `${COVERS_URL_PREFIX}/${filename}`;
    let avatarGenerated = false;
    try {
      const fs = await import("fs/promises");
      await fs.access(filePath);
      console.log(`  ✓ avatar already on disk: ${filePath}`);
    } catch {
      const promptWithBg = `${a.avatarPrompt} Background color: solid ${a.avatarBgHex} pastel filling the entire frame.`;
      console.log(`  generating avatar (bg ${a.avatarBgHex})...`);
      try {
        await genAvatar(promptWithBg, filePath, a.slug);
        avatarGenerated = true;
        console.log(`  ✓ saved ${filePath}`);
      } catch (e: any) {
        console.error(`  ✗ avatar gen failed: ${e.message}`);
        // Continue — agent gets inserted with empty avatarUrl
      }
    }

    // 2. Insert agent row
    let agentId = 0;
    try {
      agentId = await insertAgent(a, avatarUrl);
      console.log(`  ✓ agent id=${agentId}`);
    } catch (e: any) {
      console.error(`  ✗ insert failed: ${e.message}`);
      continue;
    }

    // 3. Ensure primary skill is in skill_catalog
    try {
      await ensureSkillInCatalog(a.primarySkill, a.englishTitle);
      for (const s of a.skills) {
        if (s !== a.primarySkill) {
          await ensureSkillInCatalog(s, s);
        }
      }
    } catch (e: any) {
      console.error(`  ✗ skill_catalog seed failed: ${e.message}`);
    }

    summary.push({ id: agentId, slug: a.slug, name: a.englishName, avatarUrl });
    console.log("");
  }

  console.log("\n=== Summary ===");
  for (const s of summary) {
    console.log(`  id=${s.id}  ${s.slug.padEnd(34)}  ${s.name.padEnd(16)}  ${s.avatarUrl}`);
  }
  console.log(`\n${summary.length} / ${AGENTS.length} agents seeded.`);
  process.exit(0);
})();
