/**
 * 2026-07-29 (CJ 提供的官方宣傳圖顯示「10週年・Forever Forward」雙 Logo
 * 組合標): research confirms this is the SEASON umbrella (2026-06-02 –
 * 2026-09-08 — Pokémon GO's 10th Anniversary), covering all 6 events this
 * script's sibling (admin-build-pokemongo.ts) already built full 11-segment
 * positioning for. Rather than re-running those (costly, and the core
 * strategy content is still correct), this does a targeted read-modify-write
 * patch: appends the dual-logo requirement to each event's EXISTING
 * `guidelines.mustHaveElements` array (canonical schema field — see
 * positioningSchema.ts EVENT_SEGMENTS "guidelines" segment).
 *
 * Source: pokemongo.com/en/seasons/forever-forward, pokemongohub.net
 * "Forever Forward Season Guide" — season runs 2026-06-02 10:00 to
 * 2026-09-08 10:00 local.
 *
 * Usage: npx tsx scripts/admin-patch-pokemongo-season.ts
 */
import * as dotenv from "dotenv";
dotenv.config();
import localPool from "../server/localDb";

const OWNER_EMAIL = "lucas.lai@sowork.tw";
const BRAND_NAME = "Pokémon GO";

const SEASON_RULE =
  "本檔期落在 Pokémon GO 10 週年「Forever Forward」賽季內（2026/6/2 10:00 – 2026/9/8 10:00 當地時間）——" +
  "所有視覺素材必須同時掛載雙 Logo：Pokémon GO 主標誌 ＋「10th Anniversary／Forever Forward」週年徽章組合標，不可只用單一 Logo；" +
  "文案基調可帶入「十年」「一起走了十年」的懷舊與感謝語氣作為背景音，但不可喧賓奪主蓋過該檔期本身的主題。";

async function main() {
  const [uRows]: any = await localPool.execute(`SELECT id FROM users WHERE email = ?`, [OWNER_EMAIL]);
  if ((uRows as any[]).length !== 1) { console.error(`ABORT: ${(uRows as any[]).length} users for ${OWNER_EMAIL}`); process.exit(1); }
  const userId = (uRows as any[])[0].id;

  const [bRows]: any = await localPool.execute(`SELECT id FROM brands WHERE userId = ? AND name = ? LIMIT 1`, [userId, BRAND_NAME]);
  const brandId = (bRows as any[])[0]?.id;
  if (!brandId) { console.error(`ABORT: brand "${BRAND_NAME}" not found`); process.exit(1); }

  // 1. brand-level: append season context to description (time-bound, dated
  // so future re-derivations know it's season-specific, not permanent).
  const [brRows]: any = await localPool.execute(`SELECT description FROM brands WHERE id = ?`, [brandId]);
  const desc: string = String((brRows as any[])[0]?.description ?? "");
  if (!desc.includes("Forever Forward")) {
    const append =
      `\n\n【當前賽季 — 時效性資訊，2026/9/8 後不再適用】Pokémon GO 10 週年「Forever Forward」賽季（2026/6/2–9/8），` +
      `${SEASON_RULE}`;
    await localPool.execute(`UPDATE brands SET description = CONCAT(description, ?) WHERE id = ?`, [append, brandId]);
    console.log("Brand description: season context appended");
  } else {
    console.log("Brand description: season context already present, skipped");
  }

  // 2. event-level: patch guidelines.mustHaveElements for all events under
  // this brand whose window falls inside the season.
  const [evRows]: any = await localPool.execute(
    `SELECT id, name, positioning FROM events
      WHERE userId = ? AND brandId = ? AND startAt < '2026-09-08 10:00:00' AND endAt > '2026-06-02 10:00:00'`,
    [userId, brandId],
  );
  for (const ev of evRows as any[]) {
    let pos: any = ev.positioning;
    if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
    pos = pos ?? {};
    const guidelines = (pos.guidelines && typeof pos.guidelines === "object") ? pos.guidelines : {};
    const must: any[] = Array.isArray(guidelines.mustHaveElements) ? guidelines.mustHaveElements : [];
    if (must.some((m: any) => typeof m === "string" && m.includes("Forever Forward"))) {
      console.log(`SKIP "${ev.name}" (id ${ev.id}) — already patched`);
      continue;
    }
    must.unshift(SEASON_RULE);
    pos.guidelines = { ...guidelines, mustHaveElements: must };
    await localPool.execute(`UPDATE events SET positioning = ? WHERE id = ?`, [JSON.stringify(pos), ev.id]);
    console.log(`PATCHED "${ev.name}" (id ${ev.id}) — guidelines.mustHaveElements +1`);
  }
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
