/**
 * 2026-07-29: the voice-patch generation (admin-patch-pokemongo-voice.ts)
 * still diluted/invented details despite corrected grounding — it widened
 * "1-2 個 emoji" to "2-4 個", and invented UNVERIFIED signature habits
 * (訓練家 as a sentence-closer, a specific 破折號 transition habit) that
 * were never observed in the real @PokemonGOappTW posts. Same lesson as
 * the tagline fix: enforce verified facts in code, don't just hope the
 * LLM carries them faithfully through free-form writing.
 *
 * Appends a non-negotiable, hard-coded rules block (from the actual 5
 * verified posts) to both facebook.text and instagram.text — read-modify,
 * no further LLM call.
 *
 * Usage: npx tsx scripts/admin-patch-pokemongo-voice-rules.ts
 */
import * as dotenv from "dotenv";
dotenv.config();
import localPool from "../server/localDb";

const OWNER_EMAIL = "lucas.lai@sowork.tw";
const BRAND_NAME = "Pokémon GO";

const VERIFIED_RULES =
  "\n\n【真實觀察規則 — 務必遵守，優先於上方人設風格描述】\n" +
  "- 開頭稱呼固定用「訓練家，」，且只出現在句首開場，不放在句尾或當結尾金句。\n" +
  "- Emoji 每篇僅 1–2 個（不是 2–4 個），且必須語意精準對應情境（例如 🔥＝熱血緊湊、🤩＝驚喜期待），不做裝飾性堆疊。\n" +
  "- 活動名稱、寶可夢名、道具名一律加「」直角引號標出，不使用其他強調符號（不加粗、不用全大寫）。\n" +
  "- 出現具體時間時，固定格式為「台灣時間 X月X日 X:00～X月X日 X:00」。\n" +
  "- 不要自行發明未經證實的「招牌口頭禪」或固定修辭習慣（例如特定破折號轉場句型）；只依循以上已驗證的規則書寫，其餘保持真實、克制、資訊優先的官方語氣，不要過度戲劇化或詩意化。";

async function main() {
  const [uRows]: any = await localPool.execute(`SELECT id FROM users WHERE email = ?`, [OWNER_EMAIL]);
  if ((uRows as any[]).length !== 1) { console.error(`ABORT: ${(uRows as any[]).length} users`); process.exit(1); }
  const userId = (uRows as any[])[0].id;

  const [bRows]: any = await localPool.execute(`SELECT id, positioning FROM brands WHERE userId = ? AND name = ? LIMIT 1`, [userId, BRAND_NAME]);
  const brand = (bRows as any[])[0];
  if (!brand) { console.error(`ABORT: brand not found`); process.exit(1); }

  let pos: any = brand.positioning;
  if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
  pos = pos ?? {};
  const prompts = (pos._aiPrompts && typeof pos._aiPrompts === "object") ? pos._aiPrompts : {};

  for (const platform of ["facebook", "instagram"] as const) {
    const cur = prompts[platform];
    if (!cur?.text) { console.warn(`SKIP ${platform}: no text prompt found`); continue; }
    if (cur.text.includes("真實觀察規則")) { console.log(`SKIP ${platform}: already patched`); continue; }
    prompts[platform] = { ...cur, text: cur.text + VERIFIED_RULES };
    console.log(`PATCHED ${platform}: verified-rules block appended`);
  }
  pos._aiPrompts = prompts;
  await localPool.execute(`UPDATE brands SET positioning = ? WHERE id = ?`, [JSON.stringify(pos), brand.id]);
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
