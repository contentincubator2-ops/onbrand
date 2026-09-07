/**
 * 2026-07-29 (CJ「先學習 facebook.com/pokemongoapptw 的寫文風格」): the
 * brand's initial voice grounding (admin-build-pokemongo.ts) was inferred
 * from generic web-search patterns — this replaces it with observations
 * grounded in REAL current posts.
 *
 * FB itself hard-walls anonymous browsing after one truncated snippet, but
 * the official account cross-posts the SAME copy to X (twitter.com/
 * PokemonGOappTW — same handle as the FB page), which has no login wall for
 * the first several posts. Read 5 real, complete, current posts there
 * (2026-07-21 – 07-29) and extracted the actual pattern (not fabricated,
 * not verbatim-copied into the DB — paraphrased pattern description, per
 * standard brand-voice research practice).
 *
 * Replaces the 語氣特徵 line in brands.description, then regenerates the
 * facebook + instagram AI 指令庫 text prompts against the corrected
 * grounding (image prompts untouched — the IP-safety rule there is
 * unaffected by this correction).
 *
 * Usage: npx tsx scripts/admin-patch-pokemongo-voice.ts
 */
import * as dotenv from "dotenv";
dotenv.config();
import localPool from "../server/localDb";
import { generateAiPromptForPlatform } from "../server/strategy/routers/brandKnowledgeRouter";

const OWNER_EMAIL = "lucas.lai@sowork.tw";
const BRAND_NAME = "Pokémon GO";

const OLD_VOICE_LINE =
  "語氣特徵（依官方 IG @pokemongoapp、FB 粉專公開發文觀察歸納，非逐字引用）：對訓練家直接喊話（「Trainers!」「準備好了嗎？」）、大量驚嘆號與行動呼籲、遊戲術語直用（Raid／Shiny／Stardust／Community Day）、強調限時急迫感與社群共同參與感、emoji 點綴但不過量、句子短而有節奏感。";

const NEW_VOICE_LINE =
  "語氣特徵（2026-07-29 實際讀取 @PokemonGOappTW 近期 5 篇真實發文歸納，非逐字引用——FB／X 為同一套官方文案）：" +
  "固定以「訓練家，」開頭直接喊話，不用「大家」「玩家們」等其他稱呼；" +
  "短句斷句、驚嘆號使用但不過量；emoji 精簡（全篇通常僅 1–2 個，且語意對應——🔥＝熱血場景、🤩＝驚喜感，不做裝飾性堆疊）；" +
  "活動名稱／寶可夢名／道具名一律用「」直角引號標出，不用其他強調符號或全大寫；" +
  "時間資訊固定格式「台灣時間 X月X日 X:00～X月X日 X:00」；" +
  "語氣是「官方公告＋親切小編」混合——興奮但克制，不走誇張網紅腔、不濫用行動呼籲動詞句；" +
  "結尾常用語助詞「吧！」「囉！」製造邀請感，取代命令式 CTA；連結與 hashtag 固定放在文末。";

async function main() {
  const [uRows]: any = await localPool.execute(`SELECT id FROM users WHERE email = ?`, [OWNER_EMAIL]);
  if ((uRows as any[]).length !== 1) { console.error(`ABORT: ${(uRows as any[]).length} users for ${OWNER_EMAIL}`); process.exit(1); }
  const userId = (uRows as any[])[0].id;

  const [bRows]: any = await localPool.execute(`SELECT id, description FROM brands WHERE userId = ? AND name = ? LIMIT 1`, [userId, BRAND_NAME]);
  const brand = (bRows as any[])[0];
  if (!brand) { console.error(`ABORT: brand "${BRAND_NAME}" not found`); process.exit(1); }
  const brandId = brand.id;

  const desc: string = String(brand.description ?? "");
  if (!desc.includes(OLD_VOICE_LINE)) {
    console.error("ABORT: old voice line not found verbatim — description may have changed since. Aborting to avoid corrupting it.");
    console.error("Current description head:", desc.slice(0, 400));
    process.exit(1);
  }
  const nextDesc = desc.replace(OLD_VOICE_LINE, NEW_VOICE_LINE);
  await localPool.execute(`UPDATE brands SET description = ? WHERE id = ?`, [nextDesc, brandId]);
  console.log("Brand description: voice line replaced with real-post-grounded version");

  for (const platform of ["facebook", "instagram"] as const) {
    console.log(`Regenerating AI 指令庫 text for ${platform}…`);
    const r = await generateAiPromptForPlatform(brandId, userId, platform);
    if (!r.ok) { console.warn(`  FAILED (${platform}): ${r.error}`); continue; }
    const [posRows]: any = await localPool.execute(`SELECT positioning FROM brands WHERE id = ?`, [brandId]);
    let pos: any = posRows[0]?.positioning;
    if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
    pos = pos ?? {};
    pos._aiPrompts = { ...(pos._aiPrompts ?? {}), [platform]: r.value };
    await localPool.execute(`UPDATE brands SET positioning = ? WHERE id = ?`, [JSON.stringify(pos), brandId]);
    console.log(`  OK (${platform}) — text ${r.value.text.length} chars`);
    console.log(`  preview: ${r.value.text.slice(0, 200)}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
