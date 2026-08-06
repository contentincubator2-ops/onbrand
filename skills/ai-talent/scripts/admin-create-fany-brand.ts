/**
 * 2026-08-04 (CJ「重新定義FANY品牌」): create the FANY brand under
 * sowork@sowork.tw, grounded on the 1218_FANY_品牌定位方向.pptx deck
 * (SoWork positioning proposal, 2024/12/18). US-market AI smartwatch
 * for women — no live product website exists (this is a positioning
 * proposal brand, not a scraped storefront), so this script does NOT
 * enqueue product discovery.
 *
 * Slogan lock: CJ explicitly chose "See the Vibe" (the tagline used
 * throughout the deck's converged narrative, slides 20/30/41/47/48/56 —
 * distinct from the two brainstormed-but-unchosen slogan lists on
 * slides 59/60). Protected the same way the 媽爹講故事 tagline overwrite
 * bug was fixed: written into positioning.tagline AND positioning._bookTagline
 * as an immutable anchor AFTER the AI positioning pipeline completes, so a
 * later Strategy Workbench "套用定位" can never silently drift it.
 *
 * Side effects:
 *   1. brands row (+ brand_members owner)
 *   2. startPositioningJob(...) — runs IN THIS PROCESS; we poll until done
 *      because exiting early would kill the detached pipeline.
 *   3. post-completion patch: force positioning.tagline.enTagline +
 *      positioning._bookTagline = "See the Vibe"
 *
 * Idempotent: an existing brand named "FANY" under the owner is reused
 * (positioning re-kicked only if not already completed).
 *
 * Usage: npx tsx scripts/admin-create-fany-brand.ts
 */
import * as dotenv from "dotenv";
dotenv.config();
import localPool from "../server/localDb";
import { startPositioningJob } from "../server/_core/positioningJobRunner";
import { buildBrandPositioningSteps } from "../server/_core/positioningSteps";

const OWNER_EMAIL = "sowork@sowork.tw";

const BRAND_SPEC = {
  name: "FANY",
  slugBase: "fany",
  industry: "智慧穿戴 / AI 智能手錶",
  tagline: "See the Vibe",
  targetAudience:
    "美國市場、35–44 歲女性為主，涵蓋三種分眾人格（Global Web Index 2023Q3-2024Q2 美國消費市調）：" +
    "品牌忠誠型「Emma」（醫療業資深、已婚有子女、市場規模約 6.8M，重視划算與客製化、理性消費 89%）；" +
    "健康衛士型「Sophia」（營養/管理職、已婚有子女、市場規模約 7.3M，重視健身自煮與客製化、個人護理 85%）；" +
    "科技運動型「Megan」（醫療業資深、已婚有子女、市場規模約 5.4M，重視平權主義與情緒健康、音樂與個人護理 82%）。" +
    "三者共通渴望：從資訊碎片化與盲目跟風的焦慮中，透過 AI 主動預判生活氛圍，重新掌握選擇主導權，展現真實自我、活出生活熱情。",
  description: [
    "FANY 是一款鎖定美國市場女性消費者的 AI 智能手錶品牌（SoWork 品牌定位方向簡報，2024/12/18）。",
    "核心差異化：市面智能手錶（Apple Watch、Samsung Galaxy Watch、Fitbit、Withings、Mobvoi TicWatch、Coros）多聚焦健康監測場景，" +
      "屬於被動、reactive 的數據回饋——用戶要主動查看才會得到答案，較少延伸至穿搭、社交、行程等日常生活場景，設計語言多主打經典時尚、極簡永恆。" +
      "FANY 的核心概念是「主動預判」：不是被動給數字，而是真心感受用戶生活的氛圍，提前一步在用戶開口之前就先給出貼心提醒與建議——" +
      "例如出門前先推薦適合天氣的穿搭色彩、開會前主動推播該公司最新消息、PMS 情緒低落前先播放舒壓音樂、猶豫要不要多運動幾分鐘時先告知還能消耗多少熱量、" +
      "深夜滑手機的偏好被默默記錄藉此更懂使用者、行程間隙提前叫車。",
    "品牌 Slogan：「See the Vibe」——強調用大數據 + AI 模型主動覺察（Aware）使用者當下的生活氛圍與情緒狀態，" +
      "幫助使用者從資訊碎片化與盲目跟風中重新找回選擇的主導權，認清自己真正想要什麼，進而展現真我、活出生活熱情。" +
      "核心敘事：「我們不是 reactively 的給你數字，是真心感受你生活的氛圍，提前提醒你，才能打造出最佳的氛圍，在每一刻，創造你最想要的當下（Master Every Moment）。」",
    "兩條探索方向收斂為 See the Vibe 的兩大情感支柱：" +
      "①展現真我 Express the Real You（F.A.N.Y：Freedom 自由展現／Authenticity 忠於本心／Now 活在當下／You 一切以你為中心；產品承諾＝預判，情感承諾＝主宰）；" +
      "②生活熱情 Life Passion（Awaken／Fuel 框架：喚醒真實感知、點燃熱情與動力；產品承諾＝助燃劑，情感承諾＝看見）。",
    "品牌原型三支柱（收攏共識）：自信（源自追求真我）、熱情（源自熱愛生活）、創新（源自突破現狀）。" +
      "品牌希望透過手錶讓女性從自卑中解放、變得熱情、對生活充滿活力；並且如同 Popmart 的收藏概念，" +
      "讓消費者覺得每一支入手的 FANY 手錶都值得——支援客製化錶面設計，讓用戶依心情、場合搭配不同外觀。",
    "功能亮點（突破性差異化功能）：孕期追蹤（判斷是否懷孕、胎兒健康、卵子品質監測）、情緒／PMS 監測與舒壓建議、" +
      "多元運動模式（不受限於單一運動類型）、AI 大數據驅動的主動場景建議（穿搭色彩、行程規劃、新聞快報、社交約會、追星、飲食建議）、可客製化錶面設計。",
    "競品研究對象：Apple Watch、Samsung Galaxy Watch、Fitbit、Withings、Mobvoi（TicWatch）、Coros。",
  ].join("\n"),
};

async function main() {
  const [uRows]: any = await localPool.execute(
    `SELECT id, email FROM users WHERE email = ?`,
    [OWNER_EMAIL],
  );
  const users = uRows as Array<{ id: number; email: string }>;
  if (users.length !== 1) {
    console.error(`ABORT: found ${users.length} users for ${OWNER_EMAIL} (need exactly 1)`);
    process.exit(1);
  }
  const userId = users[0].id;
  console.log(`Owner: ${OWNER_EMAIL} → userId ${userId}`);

  const [exRows]: any = await localPool.execute(
    `SELECT id, positioningStatus FROM brands WHERE userId = ? AND name = ? LIMIT 1`,
    [userId, BRAND_SPEC.name],
  );
  const existing = (exRows as any[])[0];
  let brandId: number;
  let alreadyCompleted = false;

  if (existing) {
    brandId = existing.id;
    alreadyCompleted = existing.positioningStatus === "completed";
    console.log(`REUSE: brand "${BRAND_SPEC.name}" (id ${brandId}, positioning=${existing.positioningStatus})`);
  } else {
    const slug = `${BRAND_SPEC.slugBase}-${Math.random().toString(36).slice(2, 7)}`;
    const [res]: any = await localPool.execute(
      `INSERT INTO brands
         (userId, createdBy, slug, name, industry, tagline,
          targetAudience, description, soworkAnalysis,
          targetCountry, outputLanguage, dataSource, isDefault, positioningStatus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 0, 'pending')`,
      [
        userId, userId, slug, BRAND_SPEC.name, BRAND_SPEC.industry, BRAND_SPEC.tagline,
        BRAND_SPEC.targetAudience, BRAND_SPEC.description,
        JSON.stringify({ competitors: ["Apple Watch", "Samsung Galaxy Watch", "Fitbit", "Withings", "Mobvoi", "Coros"], targetMarket: "US", contentLanguage: "en" }),
        "US", "en",
      ],
    );
    brandId = (res as any).insertId;
    console.log(`CREATED: brand "${BRAND_SPEC.name}" → id ${brandId} (slug ${slug})`);
    try {
      await localPool.execute(
        `INSERT INTO brand_members (brandId, userId, role, addedBy) VALUES (?, ?, 'owner', ?)`,
        [brandId, userId, userId],
      );
    } catch (e: any) {
      console.warn(`brand_members seed failed (non-fatal): ${e?.message}`);
    }
  }

  if (!alreadyCompleted) {
    await localPool.execute(
      `UPDATE brands SET positioningStatus = 'in_progress' WHERE id = ?`,
      [brandId],
    );
    startPositioningJob({
      userId,
      entityKind: "brand",
      entityId: brandId,
      brandName: BRAND_SPEC.name,
      industry: BRAND_SPEC.industry,
      description: BRAND_SPEC.description,
      steps: buildBrandPositioningSteps({ lang: "en", outputLanguage: "en" }),
    });
    console.log(`KICKED: positioning pipeline for "${BRAND_SPEC.name}" (id ${brandId})`);

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const deadline = Date.now() + 25 * 60 * 1000;
    while (Date.now() < deadline) {
      await sleep(15_000);
      const [rows]: any = await localPool.execute(
        `SELECT b.positioningStatus,
                (SELECT CONCAT(pj.status, ' ', pj.currentStep, '/', pj.totalSteps)
                   FROM positioning_jobs pj
                  WHERE pj.entityKind = 'brand' AND pj.entityId = b.id
                  ORDER BY pj.id DESC LIMIT 1) AS job
           FROM brands b WHERE b.id = ?`,
        [brandId],
      );
      const state = (rows as any[])[0];
      console.log(`FANY: ${state.positioningStatus} (job ${state.job ?? "—"})`);
      if (state.positioningStatus === "completed" || String(state.job ?? "").startsWith("failed")) break;
    }
  }

  // ── Tagline anchor lock (mirrors the 媽爹講故事 book-tagline fix) ──
  // Force the CHOSEN slogan into positioning.tagline + the immutable
  // _bookTagline anchor so no future "套用定位＋設此標語" can drift it.
  const [posRows]: any = await localPool.execute(
    `SELECT positioning FROM brands WHERE id = ?`, [brandId],
  );
  let positioning: any = (posRows as any[])[0]?.positioning;
  if (typeof positioning === "string") positioning = JSON.parse(positioning || "{}");
  positioning = positioning ?? {};
  positioning.tagline = {
    ...(positioning.tagline ?? {}),
    enTagline: BRAND_SPEC.tagline,
    zhTagline: positioning.tagline?.zhTagline ?? BRAND_SPEC.tagline,
  };
  positioning._bookTagline = BRAND_SPEC.tagline;
  await localPool.execute(
    `UPDATE brands SET tagline = ?, positioning = ? WHERE id = ?`,
    [BRAND_SPEC.tagline, JSON.stringify(positioning), brandId],
  );
  console.log(`LOCKED: tagline anchor "${BRAND_SPEC.tagline}" for brand ${brandId}`);

  // Final report
  console.log("===== FINAL =====");
  const [fin]: any = await localPool.execute(
    `SELECT b.id, b.name, b.positioningStatus,
            JSON_LENGTH(JSON_KEYS(b.positioning)) AS segments,
            JSON_UNQUOTE(JSON_EXTRACT(b.positioning, '$.tagline.enTagline')) AS enTagline,
            LEFT(JSON_UNQUOTE(JSON_EXTRACT(b.positioning, '$.audience.primary')), 300) AS audiencePreview
       FROM brands b WHERE b.id = ?`,
    [brandId],
  );
  const r = (fin as any[])[0];
  console.log(`${r.name} (id ${r.id}): positioning=${r.positioningStatus}, segments=${r.segments}, enTagline="${r.enTagline}"`);
  console.log(`  audience.primary → ${r.audiencePreview ?? "(empty)"}`);
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
