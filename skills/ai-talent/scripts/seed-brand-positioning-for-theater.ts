/**
 * seed-brand-positioning-for-theater.ts
 *
 * For every brand whose `soworkAnalysis` lacks `differentiators`,
 * generate a small positioning packet via Haiku and persist it. The
 * Theater (內容企劃台) `runStart` reads exactly this field via
 * positioningBridge.getBrandPositioningById, so once this script runs
 * the brain bar will get real USPs and the cells stop falling back to
 * "核心價值（待品牌定位完成後自動填入）".
 *
 * Run on VM:
 *   cd /opt/marketing-os/app/skills/ai-talent
 *   npx tsx scripts/seed-brand-positioning-for-theater.ts
 *
 * Idempotent: skips brands already containing differentiators.
 * Safe: only writes the missing fields, preserves any existing
 * soworkAnalysis content.
 */
import localPool from "../server/localDb";
import { invokeLLM } from "../server/platform/core/llm";

interface BrandRow {
  id: number;
  name: string;
  description: string | null;
  tagline: string | null;
  industry: string | null;
  targetAudience: string | null;
  brandVoice: string | null;
  soworkAnalysis: any;
}

interface PositioningPacket {
  usp: string;
  differentiators: string[];      // 5-7 entries
  messagingPillars: string[];     // 3-5 entries
  valueProposition: string;
  positioning: string;
}

async function generatePacket(brand: BrandRow): Promise<PositioningPacket | null> {
  const ctx = `品牌名稱：${brand.name}
產業：${brand.industry ?? "（未填）"}
描述：${brand.description ?? "（未填）"}
Tagline：${brand.tagline ?? "（未填）"}
TA：${brand.targetAudience ?? "（未填）"}
品牌語氣：${brand.brandVoice ?? "（未填）"}`;

  try {
    const r = await invokeLLM({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      maxTokens: 800,
      messages: [
        {
          role: "system",
          content: `你是品牌策略總監。為品牌產出小而精的定位資料，輸出嚴格 JSON：
{
  "usp": "一句最核心的差異化主張，20 字以內",
  "differentiators": ["差異化點 1（10-20 字）", "...共 5-7 個", "..."],
  "messagingPillars": ["訊息支柱 1（10-20 字）", "...共 3-5 個", "..."],
  "valueProposition": "完整 value proposition，30-60 字",
  "positioning": "一句定位陳述，30-50 字"
}
規則：
- 全用繁體中文
- 不要 markdown / 註解 / 前後贅述
- differentiators 是「品牌與競品的差異」，不是品牌特色清單
- messagingPillars 是「行銷溝通的內容支柱」，貼文都繞著這幾個主題打轉`,
        },
        { role: "user", content: ctx },
      ],
    });
    const raw = r.choices[0]?.message?.content?.toString().trim() ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as PositioningPacket;
    if (!parsed.differentiators || !Array.isArray(parsed.differentiators) || parsed.differentiators.length === 0) {
      return null;
    }
    return parsed;
  } catch (e) {
    console.error(`  ✗ LLM/parse failed for brand ${brand.id} (${brand.name}):`, (e as Error).message);
    return null;
  }
}

async function main() {
  console.log("=== Seeding brand positioning for Theater ===");
  console.log("");

  // 1. List all brands
  const [rows]: any = await localPool.execute(
    `SELECT id, name, description, tagline, industry, targetAudience, brandVoice, soworkAnalysis
       FROM brands
      WHERE name IS NOT NULL AND name != ''
      ORDER BY id ASC`
  );
  const brands = rows as BrandRow[];
  console.log(`Found ${brands.length} total brands`);

  let skipped = 0;
  let updated = 0;
  let failed = 0;

  for (const b of brands) {
    // Parse existing soworkAnalysis
    let existing: Record<string, unknown> = {};
    try {
      existing = typeof b.soworkAnalysis === "string"
        ? JSON.parse(b.soworkAnalysis)
        : (b.soworkAnalysis ?? {});
    } catch {
      existing = {};
    }

    const hasDiff = Array.isArray(existing.differentiators) && (existing.differentiators as any[]).length > 0;
    if (hasDiff) {
      console.log(`  [${b.id}] ${b.name} — already has differentiators (${(existing.differentiators as any[]).length}), skipping`);
      skipped++;
      continue;
    }

    console.log(`  [${b.id}] ${b.name} — generating…`);
    const packet = await generatePacket(b);
    if (!packet) {
      failed++;
      continue;
    }

    // Merge into existing soworkAnalysis (preserve other fields)
    const merged = {
      ...existing,
      usp: packet.usp,
      differentiators: packet.differentiators,
      messagingPillars: packet.messagingPillars,
      valueProposition: packet.valueProposition,
      positioning: packet.positioning,
      _theaterSeededAt: new Date().toISOString(),
    };

    try {
      await localPool.execute(
        `UPDATE brands SET soworkAnalysis = ? WHERE id = ?`,
        [JSON.stringify(merged), b.id]
      );
      console.log(`    ✓ saved — USP: ${packet.usp.slice(0, 30)}…`);
      console.log(`      differentiators (${packet.differentiators.length}): ${packet.differentiators.slice(0, 2).join(" / ")}…`);
      updated++;
    } catch (e) {
      console.error(`    ✗ DB write failed:`, (e as Error).message);
      failed++;
    }
  }

  console.log("");
  console.log(`=== Done ===`);
  console.log(`  Total:    ${brands.length}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Skipped:  ${skipped} (already had differentiators)`);
  console.log(`  Failed:   ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
