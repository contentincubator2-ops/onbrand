/**
 * 2026-07-29: migrates the hand-verified Pokémon GO voice rules (originally
 * hardcoded into a one-off patch script) into the new GENERAL positioning.
 * _voiceLock mechanism (brandKnowledgeRouter.ts extractVoiceLock/loadVoiceLock)
 * — so they survive future "AI 協助填" regenerations automatically instead
 * of being a fragile one-time text append.
 *
 * Source: 5 real posts read from x.com/PokemonGOappTW (same account/copy as
 * facebook.com/pokemongoapptw) on 2026-07-29, already used to derive these
 * exact rules in admin-patch-pokemongo-voice-rules.ts.
 *
 * Usage: npx tsx scripts/admin-migrate-pokemongo-voicelock.ts
 */
import * as dotenv from "dotenv";
dotenv.config();
import localPool from "../server/localDb";
import { generateAiPromptForPlatform } from "../server/strategy/routers/brandKnowledgeRouter";

const OWNER_EMAIL = "lucas.lai@sowork.tw";
const BRAND_NAME = "Pokémon GO";

const VOICE_LOCK = {
  rules: [
    "開頭稱呼固定用「訓練家，」，且只出現在句首開場，不放在句尾或當結尾金句。",
    "Emoji 每篇僅 1–2 個，且必須語意精準對應情境（例如 🔥＝熱血緊湊、🤩＝驚喜期待），不做裝飾性堆疊。",
    "活動名稱、寶可夢名、道具名一律加「」直角引號標出，不使用其他強調符號（不加粗、不用全大寫）。",
    "出現具體時間時，固定格式為「台灣時間 X月X日 X:00～X月X日 X:00」。",
    "不要自行發明未經證實的「招牌口頭禪」或固定修辭習慣（例如特定破折號轉場句型）；只依循以上已驗證的規則書寫，其餘保持真實、克制、資訊優先的官方語氣，不要過度戲劇化或詩意化。",
  ],
  sourceSummary: "依 2026-07-29 讀取 x.com/PokemonGOappTW（與 FB 粉專同一套官方文案）5 篇真實貼文歸納",
  sampleCount: 5,
  lockedAt: new Date().toISOString(),
};

async function main() {
  const [uRows]: any = await localPool.execute(`SELECT id FROM users WHERE email = ?`, [OWNER_EMAIL]);
  const userId = (uRows as any[])[0]?.id;
  if (!userId) { console.error("ABORT: user not found"); process.exit(1); }

  const [bRows]: any = await localPool.execute(`SELECT id, positioning FROM brands WHERE userId = ? AND name = ? LIMIT 1`, [userId, BRAND_NAME]);
  const brand = (bRows as any[])[0];
  if (!brand) { console.error("ABORT: brand not found"); process.exit(1); }
  const brandId = brand.id;

  let pos: any = brand.positioning;
  if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
  pos = pos ?? {};
  pos._voiceLock = VOICE_LOCK;
  await localPool.execute(`UPDATE brands SET positioning = ? WHERE id = ?`, [JSON.stringify(pos), brandId]);
  console.log(`_voiceLock written to brand ${brandId} (${VOICE_LOCK.rules.length} rules)`);

  // Regenerate FB + IG through the now-general mechanism so the stored
  // _aiPrompts reflect the deterministic (code-level) lock, not the old
  // one-off hardcoded text append.
  for (const platform of ["facebook", "instagram"] as const) {
    const r = await generateAiPromptForPlatform(brandId, userId, platform);
    if (!r.ok) { console.warn(`FAILED (${platform}): ${r.error}`); continue; }
    const [cur]: any = await localPool.execute(`SELECT positioning FROM brands WHERE id = ?`, [brandId]);
    let p2: any = cur[0]?.positioning;
    if (typeof p2 === "string") { try { p2 = JSON.parse(p2); } catch { p2 = {}; } }
    p2 = p2 ?? {};
    p2._aiPrompts = { ...(p2._aiPrompts ?? {}), [platform]: r.value };
    await localPool.execute(`UPDATE brands SET positioning = ? WHERE id = ?`, [JSON.stringify(p2), brandId]);
    console.log(`OK (${platform}) — regenerated via general voice-lock mechanism, ${r.value.text.length} chars`);
    console.log(`  ends with: …${r.value.text.slice(-120)}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
