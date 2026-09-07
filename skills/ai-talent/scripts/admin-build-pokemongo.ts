/**
 * 2026-07-29 (CJ: lucas.lai@sowork.tw 的 Pokémon GO 品牌「連同未來兩個月
 * 活動定位也要建置好…很嚴格的視覺規範限制」): the brand (id 2869) already
 * exists with completed core positioning (built by a parallel track) — this
 * script fills the gaps CJ actually asked for:
 *   1. description + brand_colors — grounding text + official palette so
 *      every downstream generation (AI 指令庫、活動定位) reasons from real
 *      facts, not guesses.
 *   2. AI 指令庫 for facebook + instagram — text prompt encodes Pokémon GO's
 *      real public voice pattern; IMAGE prompt carries a HARD IP constraint
 *      (never render copyrighted Pokémon character art — abstract/
 *      environmental visuals + official screenshots only). This is the
 *      concrete answer to CJ's "嚴格視覺規範" concern.
 *   3. Six real, researched events spanning Aug–Sep 2026 (dates verified via
 *      web search — pokemongo.com/pokemongohub.net — NOT invented), each
 *      gets the full 11-segment event positioning pipeline, inheriting the
 *      brand's audience anchor automatically.
 *
 * Sources (2026-07-29):
 *   - Colors: brandcolorcode.com / colorswall.com / designpieces.com
 *     (#FFCB05 yellow, #3D7DCA blue, #003A70 navy — official Pokémon brand
 *     hex values; Poké Ball white/black added for compliance completeness)
 *   - Events: pokemongohub.net "Pokémon GO August 2026 Events",
 *     pokemongo.com/en/news/gofest2026-finale-save-the-date
 *
 * Usage: npx tsx scripts/admin-build-pokemongo.ts
 */
import * as dotenv from "dotenv";
dotenv.config();
import localPool from "../server/localDb";
import { startPositioningJob } from "../server/strategy/core/positioningJobRunner";
import { buildEventPositioningSteps } from "../server/strategy/core/positioningSteps";
import { generateAiPromptForPlatform } from "../server/strategy/routers/brandKnowledgeRouter";

const OWNER_EMAIL = "lucas.lai@sowork.tw";
const BRAND_NAME = "Pokémon GO";

const BRAND_DESCRIPTION = [
  "Pokémon GO 是 Niantic 開發、與任天堂／The Pokémon Company 合作推出的擴增實境（AR）手機遊戲，2016 年上線，核心玩法是玩家實際走到真實世界的街道、公園、地標，透過手機 GPS 捕捉寶可夢、旋轉補給站、對戰道館與參與突襲（Raid）。",
  "品牌核心主張：把日常通勤與散步變成冒險，用「走出戶外」驅動健康與真實社交連結，訓練家（Trainers）之間常在活動現場、Discord 戰隊社群互相協作。",
  "官方活動節奏：每月 Community Day（限時 3 小時、特定寶可夢大量出現＋加成＋閃光機率）、週末 Raid Day／Spotlight Hour、季節性 GO Fest（夏季大型全球活動）、Ultra Unlock 連動解鎖企劃。",
  "語氣特徵（依官方 IG @pokemongoapp、FB 粉專公開發文觀察歸納，非逐字引用）：對訓練家直接喊話（「Trainers!」「準備好了嗎？」）、大量驚嘆號與行動呼籲、遊戲術語直用（Raid／Shiny／Stardust／Community Day）、強調限時急迫感與社群共同參與感、emoji 點綴但不過量、句子短而有節奏感。",
  "【視覺規範 — 嚴格遵守，這是授權 IP 客戶最重要的紅線】",
  "寶可夢角色（如皮卡丘等）是任天堂／Game Freak／Creatures 的註冊商標與著作權角色，AI 生成圖片絕對不可繪製、重製或模仿任何具名寶可夢角色的造型——這會構成商標與著作權侵權。",
  "所有含寶可夢角色畫面，必須使用官方釋出的遊戲截圖或素材，不可用 AI 重新繪製角色本身。",
  "AI 生成圖片只能聚焦「環境與情境」：真實戶外場景（公園、街道、地標）、手機畫面握持視角、Poké Ball 抽象幾何造型（圓形二分色塊，不直接複製官方 Logo）、雷達／地圖 UI 風格元素、訓練家隊伍色（Team Instinct 黃／Team Mystic 藍／Team Valor 紅）作為情緒點綴。",
  "品牌色需精準：主色藍 #3D7DCA、亮色黃 #FFCB05、深藍 #003A70；Logo 本身周圍需留白（clear space），不可重新上色或變形。",
].join("\n");

const BRAND_COLORS = {
  swatches: [
    { hex: "#3D7DCA", role: "primary" },   // Pokémon GO 主藍（app UI／地圖介面）
    { hex: "#FFCB05", role: "accent" },    // 品牌黃（CTA／能量感）
    { hex: "#003A70", role: "ink" },       // 深藍（文字／Logo 陰影層）
    { hex: "#FFFFFF", role: "support" },   // Poké Ball 白
    { hex: "#1A1A1A", role: "neutral" },   // Poké Ball 黑帶
  ],
};

// 2026-07-29 研究確認的真實活動（來源見檔頭註解），涵蓋 8-9 月
const EVENTS: Array<{
  name: string; slug: string; startAt: string; endAt: string; description: string;
}> = [
  {
    name: "Hatch Day：火與冰",
    slug: "hatch-day-fire-ice-2026-08",
    startAt: "2026-08-08 00:00:00", endAt: "2026-08-08 23:59:59",
    description: "Fire and Ice Hatch Day——限時孵蛋活動，火系與冰系寶可夢孵化機率大幅提升，蛋孵化所需距離縮短。目標：drive 玩家孵蛋道具消耗與當日開啟 App 次數，社群發文聚焦「今天孵到什麼」的曬圖與分享。",
  },
  {
    name: "Community Day：Nickit",
    slug: "community-day-nickit-2026-08",
    startAt: "2026-08-16 14:00:00", endAt: "2026-08-16 17:00:00",
    description: "8/16（日）14:00–17:00 當地時間，Nickit 大量出現＋3 倍星星沙塵加成＋Shiny Nickit 機率。每月固定 IP，是全月最大單日流量高峰與社群集結時刻——玩家常揪團出門、直播、賽後分享戰績。文案需製造「限時 3 小時」急迫感＋出門集合的號召。",
  },
  {
    name: "Ultra Unlock：水之祭典",
    slug: "ultra-unlock-water-festival-2026-08",
    startAt: "2026-08-18 00:00:00", endAt: "2026-08-24 23:59:59",
    description: "Ultra Unlock: Water Festival——為期一週的水系寶可夢慶典企劃，水系出現率提升、限定服裝／造型與主題任務。是 GO Fest 系列解鎖企劃的延伸，強調「全球玩家共同解鎖」的參與感與收藏慾望。",
  },
  {
    name: "Raid Day",
    slug: "raid-day-2026-08",
    startAt: "2026-08-22 00:00:00", endAt: "2026-08-22 23:59:59",
    description: "週末限定 Raid Day，強調突襲道館協作——邀請朋友、戰隊組隊挑戰高星級首領，訓練家之間現場社交與戰術分享是內容重點，適合「揪團」「戰隊招募」角度的貼文。",
  },
  {
    name: "暗影季拉帝納突襲週末",
    slug: "shadow-giratina-raid-weekends-2026",
    startAt: "2026-08-05 00:00:00", endAt: "2026-09-08 23:59:59",
    description: "暗影形態（變形形態）季拉帝納於週末限定於暗影突襲登場，橫跨 8/5–9/8 五個週末，是連續五週的「回訪誘因」——每個週末都是獨立內容檔期，強調稀有神獸與暗影機制的收藏話題。",
  },
  {
    name: "Pokémon GO Fest：Mega 大結局",
    slug: "gofest-mega-finale-2026-09",
    startAt: "2026-09-05 00:00:00", endAt: "2026-09-06 23:59:59",
    description: "Pokémon GO Fest: Mega Finale——一整個夏天 GO Fest 系列活動的全球壓軸場，官方預告聚焦 Mega 寶可夢，是年度最重量級的話題與情感收尾時刻，內容基調從「summer of adventure」過渡到「感謝與回顧」，同時為下一季鋪梗。",
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [uRows]: any = await localPool.execute(`SELECT id FROM users WHERE email = ?`, [OWNER_EMAIL]);
  if ((uRows as any[]).length !== 1) {
    console.error(`ABORT: found ${(uRows as any[]).length} users for ${OWNER_EMAIL}`);
    process.exit(1);
  }
  const userId = (uRows as any[])[0].id;

  const [bRows]: any = await localPool.execute(
    `SELECT id, name FROM brands WHERE userId = ? AND name = ? LIMIT 1`,
    [userId, BRAND_NAME],
  );
  const brand = (bRows as any[])[0];
  if (!brand) { console.error(`ABORT: brand "${BRAND_NAME}" not found for ${OWNER_EMAIL}`); process.exit(1); }
  const brandId = brand.id;
  console.log(`Brand "${BRAND_NAME}" → id ${brandId} (owner ${OWNER_EMAIL}, userId ${userId})`);

  // 1. Grounding: description + brand_colors (only fill if empty — don't
  // clobber anything a human or the parallel track already curated).
  const [curRows]: any = await localPool.execute(
    `SELECT description, brand_colors FROM brands WHERE id = ?`, [brandId],
  );
  const cur = (curRows as any[])[0] ?? {};
  if (!cur.description) {
    await localPool.execute(`UPDATE brands SET description = ? WHERE id = ?`, [BRAND_DESCRIPTION, brandId]);
    console.log("SET: description (brand voice + strict visual-guideline grounding)");
  } else {
    console.log("SKIP: description already set");
  }
  if (!cur.brand_colors) {
    await localPool.execute(`UPDATE brands SET brand_colors = ? WHERE id = ?`, [JSON.stringify(BRAND_COLORS), brandId]);
    console.log("SET: brand_colors (official palette, 5 swatches)");
  } else {
    console.log("SKIP: brand_colors already set");
  }

  // 2. AI 指令庫 — facebook + instagram (CJ 明確點名的兩個平台)
  for (const platform of ["facebook", "instagram"] as const) {
    console.log(`Generating AI 指令庫 for ${platform}…`);
    const r = await generateAiPromptForPlatform(brandId, userId, platform);
    if (!r.ok) { console.warn(`  FAILED (${platform}): ${r.error}`); continue; }
    const [posRows]: any = await localPool.execute(`SELECT positioning FROM brands WHERE id = ?`, [brandId]);
    let pos: any = posRows[0]?.positioning;
    if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
    pos = pos ?? {};
    pos._aiPrompts = { ...(pos._aiPrompts ?? {}), [platform]: r.value };
    await localPool.execute(`UPDATE brands SET positioning = ? WHERE id = ?`, [JSON.stringify(pos), brandId]);
    console.log(`  OK (${platform}) — text ${r.value.text.length} chars, image ${r.value.image.length} chars`);
  }

  // 3. Events — create + kick positioning (parallel-safe: sequential create,
  // pipelines run detached).
  const eventIds: Array<{ id: number; name: string }> = [];
  for (const ev of EVENTS) {
    const [ex]: any = await localPool.execute(
      `SELECT id FROM events WHERE userId = ? AND brandId = ? AND slug = ? LIMIT 1`,
      [userId, brandId, ev.slug],
    );
    let eventId: number;
    if ((ex as any[]).length > 0) {
      eventId = (ex as any[])[0].id;
      console.log(`REUSE: event "${ev.name}" (id ${eventId})`);
    } else {
      const [ins]: any = await localPool.execute(
        `INSERT INTO events (userId, brandId, productId, slug, name, startAt, endAt, positioning)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
        [userId, brandId, ev.slug, ev.name, ev.startAt, ev.endAt, JSON.stringify({ description: ev.description })],
      );
      eventId = (ins as any).insertId;
      console.log(`CREATED: event "${ev.name}" → id ${eventId} (${ev.startAt} – ${ev.endAt})`);
    }
    startPositioningJob({
      userId,
      entityKind: "event",
      entityId: eventId,
      brandName: ev.name,
      description: ev.description,
      steps: buildEventPositioningSteps({ lang: "zh-TW", outputLanguage: "zh-TW" }),
    });
    console.log(`  KICKED positioning pipeline for "${ev.name}"`);
    eventIds.push({ id: eventId, name: ev.name });
    await sleep(1500); // stagger LLM burst across 6 × 11-step pipelines
  }

  // Poll until all 6 event pipelines finish (11 steps each).
  const ids = eventIds.map((e) => e.id);
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(15_000);
    const [rows]: any = await localPool.execute(
      `SELECT pj.entityId, pj.status, pj.currentStep, pj.totalSteps
         FROM positioning_jobs pj
        WHERE pj.entityKind = 'event' AND pj.entityId IN (${ids.map(() => "?").join(",")})
          AND pj.id IN (SELECT MAX(id) FROM positioning_jobs
                         WHERE entityKind = 'event' AND entityId IN (${ids.map(() => "?").join(",")})
                         GROUP BY entityId)`,
      [...ids, ...ids],
    );
    const states = rows as Array<{ entityId: number; status: string; currentStep: number; totalSteps: number }>;
    console.log(states.map((s) => `e${s.entityId}: ${s.status} ${s.currentStep}/${s.totalSteps}`).join(" | "));
    if (states.length >= ids.length && states.every((s) => s.status === "done" || s.status === "failed")) break;
  }

  console.log("===== FINAL =====");
  const [fin]: any = await localPool.execute(
    `SELECT e.id, e.name, e.startAt, e.endAt,
            JSON_LENGTH(JSON_KEYS(e.positioning)) AS segments
       FROM events e WHERE e.id IN (${ids.map(() => "?").join(",")}) ORDER BY e.startAt`,
    ids,
  );
  for (const r of fin as any[]) {
    console.log(`${r.name} (id ${r.id}, ${r.startAt}–${r.endAt}): segments=${r.segments}`);
  }
  const [brandFin]: any = await localPool.execute(
    `SELECT JSON_LENGTH(JSON_KEYS(JSON_EXTRACT(positioning,'$._aiPrompts'))) AS aiPromptPlatforms
       FROM brands WHERE id = ?`, [brandId],
  );
  console.log(`Brand AI 指令庫 platforms set: ${(brandFin as any[])[0]?.aiPromptPlatforms ?? 0}`);
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
