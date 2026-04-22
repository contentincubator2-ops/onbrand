/**
 * bulk-fix-leads.ts
 *
 * Plan B — for every squad whose Lead is a known-wrong placeholder
 * (primarily id=25 李承翰 SEO 策略師), generate a methodology-aligned
 * Lead agent from the squad's own methodology string and swap it in.
 *
 * Approach:
 *   1. Query all active squads
 *   2. For each squad, parse methodology string (e.g. "April Dunford –
 *      Obviously Awesome (2019)") → {author, shortName, year}
 *   3. Build a new Lead agent:
 *        - primarySkill: `${kebab(shortName)}-strategist`
 *        - Chinese name: seeded-random from name pool
 *        - Chinese title: `${shortName} 策略副總裁`
 *        - bio: templated with author/year reference
 *   4. Insert agent row
 *   5. Rewrite squad.agents JSON: replace is_lead=true element's agent_id
 *
 * Skip conditions:
 *   - squad already has a Lead whose primarySkill aligns with methodology
 *   - squad is brand-archetype-positioning (id=11, golden reference)
 *   - Lead was recently re-seeded by L1-brand.ts (id in LEAD_ALLOWLIST)
 *
 * Usage:
 *   npx tsx scripts/bulk-fix-leads.ts --dry-run    (preview only)
 *   npx tsx scripts/bulk-fix-leads.ts --apply      (write to DB)
 *   npx tsx scripts/bulk-fix-leads.ts --apply --only=546,548,551  (specific squad ids)
 */

import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const DICEBEAR_AVATAR = "https://api.dicebear.com/7.x/notionists/svg?seed=";
const DICEBEAR_COVER = "https://api.dicebear.com/7.x/shapes/svg?seed=";
const POLICY_AI_MODEL = "claude-opus-4-6";
const POLICY_AI_MODEL_FALLBACK = "claude-sonnet-4-6";

// Leads created by L1-brand.ts seed — DO NOT replace these (already correct)
const LEAD_ALLOWLIST = new Set<number>([
  238844, 238845, 238846, 238847, 238848, 238849, 238850, 238851, 238852,
]);

// Squad ids that should never be touched (golden reference)
const SQUAD_BLOCKLIST = new Set<number>([11]);

// The wrong placeholder Lead to hunt down
const PLACEHOLDER_LEAD_IDS = new Set<number>([25]); // 李承翰 (SEO)

// Chinese name pool — surnames × given names (seeded-random picks a stable combo per squad)
const SURNAMES = [
  "陳", "林", "黃", "張", "李", "王", "吳", "劉", "蔡", "楊",
  "許", "鄭", "謝", "郭", "洪", "邱", "徐", "曾", "葉", "蘇",
  "魏", "江", "賴", "方", "高", "周", "簡", "范", "何", "羅",
];
const GIVEN_NAMES = [
  "思哲", "宜庭", "冠廷", "雅婷", "柏翰", "詠欣", "立群", "品睿",
  "芷涵", "宗翰", "昱辰", "珮瑜", "建成", "怡君", "俊傑", "佳玲",
  "子軒", "文彬", "紫芸", "志遠", "瑋倫", "靜怡", "文謙", "欣妍",
  "宥承", "婉柔", "哲瑋", "慧娟", "定宇", "思妤",
];

const EN_FIRST = [
  "Alex", "Jordan", "Morgan", "Taylor", "Jamie", "Casey", "Avery", "Rowan",
  "Quinn", "Parker", "Sage", "Drew", "Blair", "Reese", "Emerson", "Hayden",
  "Phoenix", "Ellis", "Finley", "Harper",
];
const EN_LAST = [
  "Chen", "Lin", "Huang", "Wu", "Hsu", "Yang", "Tsai", "Liu",
  "Kuo", "Wei", "Chou", "Fang", "Kao", "Yeh", "Lai", "Su",
];

// ── helpers ────────────────────────────────────────────────────────────────

function kebab(s: string): string {
  return s.toLowerCase()
    .replace(/['''"`:;,.!?()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Deterministic int hash of a string (so the same squad always gets the same name)
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pick<T>(arr: T[], seed: number): T {
  // Use unsigned modulo; seed may be large or shifted; guard against NaN/negative.
  const idx = Math.abs(seed | 0) % arr.length;
  return arr[idx];
}

/**
 * Parse a methodology string into its parts.
 * Handles multiple formats found in the DB:
 *   - "April Dunford – Obviously Awesome (2019)"
 *   - "Al Ries & Jack Trout – Positioning: The Battle for Your Mind (1981)"
 *   - "mind-positioning"
 *   - "cbbe-pyramid"
 *   - "Mixed Methods: Quant + Qual + Social Listening → Triangulation"
 */
function parseMethodology(m: string | null): {
  author: string | null;
  shortName: string;      // best guess at the framework's short name (e.g. "Obviously Awesome")
  year: number | null;
} {
  const raw = (m ?? "").trim();
  if (!raw) return { author: null, shortName: "Strategic", year: null };

  // Extract year in parens
  const yearMatch = raw.match(/\((\d{4})(?:[^)]*)?\)/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

  // Strip parens content for easier split
  const noParen = raw.replace(/\s*\([^)]*\)\s*/g, "").trim();

  // Try "Author – Framework" with en/em dash, OR ASCII "-" with REQUIRED whitespace
  // around it. Without required whitespace, "benefit-based" would falsely parse as
  // author="benefit" / shortName="based".
  const dashMatch = noParen.match(/^(.+?)\s+[–—\-]\s+(.+)$/) ?? noParen.match(/^(.+?)\s*[–—]\s*(.+)$/);
  if (dashMatch) {
    const author = dashMatch[1].trim();
    let shortName = dashMatch[2].trim();
    // Truncate subtitles like "Positioning: The Battle for Your Mind" → "Positioning"
    shortName = shortName.split(/[:：]/)[0].trim();
    // If shortName has 4+ words, keep first 3
    const words = shortName.split(/\s+/);
    if (words.length > 3) shortName = words.slice(0, 3).join(" ");
    return { author, shortName, year };
  }

  // No dash — kebab-case slug like "mind-positioning" → "Mind Positioning"
  if (/^[a-z0-9-]+$/i.test(noParen)) {
    const shortName = noParen.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return { author: null, shortName, year };
  }

  // Fallback — use first 30 chars as shortName
  const shortName = noParen.slice(0, 40).split(/\s+/).slice(0, 3).join(" ");
  return { author: null, shortName: shortName || "Strategic", year };
}

// Translate shortName to a Chinese-friendly subtitle (best-effort; many don't
// have a clean translation so we fall back to the English short name)
const ZH_TITLE_MAP: Record<string, string> = {
  "obviously awesome":       "定位",
  "positioning":              "心智佔位",
  "brand gap":                "品牌缺口",
  "how brands grow":          "品牌成長",
  "purple cow":               "紫牛差異化",
  "start with why":           "黃金圈",
  "storybrand":               "品牌故事",
  "crossing the chasm":       "技術鴻溝",
  "21 immutable laws":        "行銷定律",
  "22 immutable laws":        "行銷定律",
  "tribes":                   "部落行銷",
  "jab jab jab":              "社群攻勢",
  "document dont create":     "即時社群",
  "youtility":                "實用內容",
  "content os":               "內容系統",
  "the experience economy":   "體驗經濟",
  "pre-suasion":              "前說服",
  "tipping point":            "引爆趨勢",
};

function zhSubtitleFor(shortName: string): string {
  const key = shortName.toLowerCase().trim();
  return ZH_TITLE_MAP[key] ?? shortName;
}

function buildLeadAgent(squad: {
  id: number;
  slug: string;
  name: string;
  methodology: string | null;
  workspace: string | null;
  strategy_layer: string | null;
}): {
  slug: string;
  name: string;
  englishName: string;
  title: string;
  englishTitle: string;
  primarySkill: string;
  specialty: string;
  bio: string;
  bio_en: string;
  avatarUrl: string;
  coverUrl: string;
  workspace: string;
  methodology: string;
} {
  const parsed = parseMethodology(squad.methodology);
  const seed = hashStr(squad.slug);

  const surname = pick(SURNAMES, seed);
  const given = pick(GIVEN_NAMES, (seed * 7) >>> 0);
  const efirst = pick(EN_FIRST, (seed * 13) >>> 0);
  const elast = pick(EN_LAST, (seed * 19) >>> 0);

  const zhSub = zhSubtitleFor(parsed.shortName);
  const cnName = `${surname}${given}`;
  const enName = `${efirst} ${elast}`;
  const title = `${zhSub} 策略副總裁`;
  const enTitle = `VP of ${parsed.shortName} Strategy`;
  const primarySkill = `${kebab(parsed.shortName)}-strategist`;
  const slug = `${squad.slug}-lead-${seed.toString(36).slice(0, 6)}`;

  const authorPart = parsed.author
    ? `${parsed.author}${parsed.year ? `（${parsed.year}）` : ""}`
    : "（古典方法論）";
  const specialty = `${primarySkill}, ${zhSub}, ${parsed.shortName}, brand-strategy, methodology-led-delivery`;
  const bio =
    `${cnName}，${title}。` +
    `專精以 ${authorPart} 提出的《${parsed.shortName}》方法論為核心，` +
    `協助品牌在市場中建立可防守、可量測的策略定位。` +
    `帶領跨功能 squad 將方法論轉譯為董事會級交付物，每一步結論皆錨定可驗證的證據鏈。`;
  const bio_en =
    `${enName} is ${enTitle} at SoWork's AI Strategic Consultancy. ` +
    `Specializing in ${parsed.author ?? "classical"} ${parsed.shortName} methodology` +
    `${parsed.year ? ` (${parsed.year})` : ""}, ` +
    `leading squad-based deliverables that convert methodology into boardroom-ready strategic outputs.`;

  return {
    slug,
    name: cnName,
    englishName: enName,
    title,
    englishTitle: enTitle,
    primarySkill,
    specialty,
    bio,
    bio_en,
    avatarUrl: `${DICEBEAR_AVATAR}${encodeURIComponent(slug)}`,
    coverUrl:  `${DICEBEAR_COVER}${encodeURIComponent(squad.slug)}`,
    // agents.workspace is a short column (varchar(30) on VM schema).
    // Squad.workspace can be a long descriptor/multi-value string, so fall
    // back to a safe short enum value. Hard-cap at 20 chars to be safe.
    workspace: (squad.workspace && squad.workspace.length <= 20 && !/[\s,/]/.test(squad.workspace)
      ? squad.workspace
      : "strategy"),
    methodology: squad.methodology ?? parsed.shortName,
  };
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || !args.includes("--apply");
  const onlyArg = args.find(a => a.startsWith("--only="));
  const onlyIds = onlyArg ? onlyArg.slice("--only=".length).split(",").map(Number) : null;

  console.log(`\n===== bulk-fix-leads (${dryRun ? "DRY-RUN" : "APPLY"}) =====\n`);

  const pool = createPool({
    host:     process.env.DB_HOST ?? "localhost",
    user:     process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "marketing_os",
    waitForConnections: true,
    multipleStatements: false,
  });

  const [squadRows] = await pool.query(
    `SELECT id, slug, name, methodology, workspace, strategy_layer, agents
       FROM squads
      WHERE is_active = 1
      ORDER BY strategy_layer, id`,
  );
  const squads = squadRows as any[];

  let processed = 0, skippedAllowlist = 0, skippedBlock = 0, skippedOk = 0, fixed = 0, errors = 0;

  for (const sq of squads) {
    if (onlyIds && !onlyIds.includes(sq.id)) continue;
    if (SQUAD_BLOCKLIST.has(sq.id)) { skippedBlock++; continue; }

    let agents: any[];
    try { agents = JSON.parse(sq.agents ?? "[]"); }
    catch { errors++; console.log(`  [ERR] squad #${sq.id} ${sq.slug}: bad agents JSON`); continue; }
    if (!Array.isArray(agents) || agents.length === 0) { errors++; continue; }

    // Find the lead entry (is_lead=true or first)
    let leadIdx = agents.findIndex((a: any) => a?.is_lead === true || a?.isLead === true);
    if (leadIdx < 0) leadIdx = 0;
    const leadEntry = agents[leadIdx];
    const currentLeadId = leadEntry?.agent_id ?? leadEntry?.id;

    // Skip if Lead is in allowlist (already correct from L1 seed)
    if (LEAD_ALLOWLIST.has(currentLeadId)) { skippedAllowlist++; continue; }

    // Check current Lead's primarySkill — if it already aligns with methodology, skip
    const [cur] = await pool.query(
      `SELECT id, name, primarySkill, title FROM agents WHERE id = ? LIMIT 1`,
      [currentLeadId],
    ) as any;
    const curLead = cur?.[0];

    const isPlaceholder = PLACEHOLDER_LEAD_IDS.has(currentLeadId);
    const parsed = parseMethodology(sq.methodology);
    const methodologyToken = kebab(parsed.shortName);

    let needsReplacement = isPlaceholder;
    if (!needsReplacement && curLead) {
      const ps = (curLead.primarySkill ?? "").toLowerCase();
      const ti = (curLead.title ?? "").toLowerCase();
      // If Lead's skill/title doesn't reference the methodology shortName's kebab, replace
      const tokenInSkill = methodologyToken.split("-").some(w => w.length > 3 && (ps.includes(w) || ti.includes(w)));
      if (!tokenInSkill) needsReplacement = true;
      else skippedOk++;
    }
    if (!needsReplacement) continue;

    processed++;

    const leadSpec = buildLeadAgent({
      id: sq.id, slug: sq.slug, name: sq.name,
      methodology: sq.methodology, workspace: sq.workspace, strategy_layer: sq.strategy_layer,
    });

    console.log(`[${sq.strategy_layer ?? "-"}] squad #${sq.id} ${sq.slug}`);
    console.log(`   methodology: ${sq.methodology}`);
    console.log(`   current Lead: id=${currentLeadId} ${curLead?.name ?? "?"} [${curLead?.primarySkill ?? "?"}] / ${curLead?.title ?? "?"}`);
    console.log(`   → new Lead: ${leadSpec.name} (${leadSpec.englishName}) — ${leadSpec.title} [${leadSpec.primarySkill}]`);

    if (dryRun) continue;

    // APPLY MODE — insert agent + rewrite squad.agents
    try {
      const workspace_tags = JSON.stringify([
        leadSpec.primarySkill, parsed.shortName, "brand-strategy",
      ]);
      const skills = JSON.stringify([
        leadSpec.title, parsed.shortName + " Strategy", "Methodology-led Delivery",
        "Squad Leadership", "Boardroom Deliverables",
      ]);
      const workingPrinciples = [
        `1. Methodology-first: every deliverable traces back to ${parsed.author ?? "the canonical"} ${parsed.shortName}.`,
        `2. Squad accountability: leads ${agents.length - 1} specialists across the workflow.`,
        `3. Evidence discipline: every strategic claim anchored to audit trail, not opinion.`,
      ].join("\n");

      const [result] = await pool.execute(
        `INSERT INTO agents (
           slug, name, englishName, title, englishTitle,
           layer, bio, specialty, skills, primarySkill,
           industry, jobLevel, isAvailable, reviewStatus, rating,
           avatarUrl, coverUrl, bio_en, specialty_en,
           workspace, workspace_tags, methodology, workingPrinciples,
           aiModel, aiModelSource, aiModelFallback, aiModelFallbackSource,
           createdAt, updatedAt
         ) VALUES (
           ?, ?, ?, ?, ?,
           'strategy', ?, ?, ?, ?,
           'tech', 'vp', 1, 'approved', 5.00,
           ?, ?, ?, ?,
           ?, ?, ?, ?,
           ?, 'policy', ?, 'policy',
           NOW(), NOW()
         )`,
        [
          leadSpec.slug, leadSpec.name, leadSpec.englishName, leadSpec.title, leadSpec.englishTitle,
          leadSpec.bio, leadSpec.specialty, skills, leadSpec.primarySkill,
          leadSpec.avatarUrl, leadSpec.coverUrl, leadSpec.bio_en, `${leadSpec.primarySkill} — ${parsed.shortName}`,
          leadSpec.workspace, workspace_tags, leadSpec.methodology, workingPrinciples,
          POLICY_AI_MODEL, POLICY_AI_MODEL_FALLBACK,
        ],
      );
      const newLeadId = (result as any).insertId as number;

      // Rewrite squad.agents — replace the lead entry's agent_id
      const newAgents = agents.map((a: any, i: number) => {
        if (i === leadIdx) return { ...a, agent_id: newLeadId, is_lead: true };
        return a;
      });

      await pool.execute(
        `UPDATE squads SET agents = ?, updated_at = NOW() WHERE id = ?`,
        [JSON.stringify(newAgents), sq.id],
      );

      console.log(`   ✓ created agent id=${newLeadId}, squad.agents[${leadIdx}].agent_id updated`);
      fixed++;
    } catch (err: any) {
      errors++;
      console.log(`   [ERR] ${err.message}`);
    }
  }

  console.log(`\n===== Summary =====`);
  console.log(`  Processed:            ${processed}`);
  console.log(`  Skipped (allowlist):  ${skippedAllowlist}`);
  console.log(`  Skipped (blocklist):  ${skippedBlock}`);
  console.log(`  Skipped (already OK): ${skippedOk}`);
  console.log(`  Fixed:                ${fixed}${dryRun ? " (dry-run, nothing written)" : ""}`);
  console.log(`  Errors:               ${errors}`);

  await pool.end();
}

main().catch((err) => {
  console.error("bulk-fix-leads failed:", err);
  process.exit(1);
});
