/**
 * 2026-07-23 (CJ: IRIS 7/27 訓練): seed real products for IRIS (2956) and
 * Iris Girls (2957) from the official 91APP storefront category pages.
 *
 * WHY SEEDING: iris.com.tw is a client-side-rendered 91APP storefront — the
 * text crawler gets an empty shell (discovery found 0 products from the
 * category URL). This data was extracted from the RENDERED pages:
 *   IRIS       → SalePageCategory/582194 (2026 SS Collection - IRIS)
 *   Iris Girls → SalePageCategory/582195 (2026 SS Collection - Iris Girls)
 * 12 curated items per brand (上衣/洋裝/裙/褲/外套 variety), stable CJK slugs
 * so future discovery re-scans dedupe against them.
 *
 * Also kicks the 6-segment product positioning pipeline for the first
 * DEEP_POSITION_COUNT items per brand — the runner inherits the parent
 * brand's officialAudience anchor, so 目標族群 stays inside the brand-
 * confirmed segment (IRIS 30–40 皇家經典 / Iris Girls 25–35 甜美).
 *
 * Usage: npx tsx scripts/admin-seed-iris-products.ts
 */
import * as dotenv from "dotenv";
dotenv.config();
import localPool from "../server/localDb";
import { startPositioningJob } from "../server/_core/positioningJobRunner";
import { buildProductPositioningSteps } from "../server/_core/positioningSteps";

const OWNER_EMAIL = "sowork@sowork.tw";
const DEEP_POSITION_COUNT = 3;

type SeedProduct = { name: string; price: string; url: string; img: string };

const SEEDS: Array<{ brandName: string; line: string; products: SeedProduct[] }> = [
  {
    brandName: "IRIS",
    line: "IRIS 主線（優雅・精緻・女性化）",
    products: [
      { name: "法式藍語刺繡上衣-62950", price: "2,890", url: "https://www.iris.com.tw/SalePage/Index/11858163", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11858163/0/639186442832200000?v=1" },
      { name: "暮海藍灣吊帶洋裝-62646", price: "4,390", url: "https://www.iris.com.tw/SalePage/Index/11858148", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11858148/0/639186442162100000?v=1" },
      { name: "古典花園印花長裙-62230", price: "3,290", url: "https://www.iris.com.tw/SalePage/Index/11850013", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11850013/0/639186435221170000?v=1" },
      { name: "海洋風褲口飾邊長褲-62331", price: "3,290", url: "https://www.iris.com.tw/SalePage/Index/11858123", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11858123/0/639186441693670000?v=1" },
      { name: "輕透舒適西裝外套-62524", price: "3,590", url: "https://www.iris.com.tw/SalePage/Index/11829254", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11829254/0/639166628425030000?v=1" },
      { name: "透雅蕾絲壓飾上衣-62155", price: "2,990", url: "https://www.iris.com.tw/SalePage/Index/11858033", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11858033/0/639186441107000000?v=1" },
      { name: "夏日微風優雅蕾絲洋裝-62630", price: "6,890", url: "https://www.iris.com.tw/SalePage/Index/11859443", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11859443/0/639160776998730000?v=1" },
      { name: "經典修身壓線洋裝-62637", price: "4,990", url: "https://www.iris.com.tw/SalePage/Index/11987021", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11987021/0/639201165342430000?v=1" },
      { name: "都會斜紋修身長褲-62330", price: "3,190", url: "https://www.iris.com.tw/SalePage/Index/11850015", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11850015/0/639158900191270000?v=1" },
      { name: "率性丹寧釦飾短裙-62231", price: "2,990", url: "https://www.iris.com.tw/SalePage/Index/11858052", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11858052/0/639160560516770000?v=1" },
      { name: "天絲亞麻外套-62523", price: "3,690", url: "https://www.iris.com.tw/SalePage/Index/11829189", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11829189/0/639153712447970000?v=1" },
      { name: "V領條紋針織上衣-62815", price: "2,890", url: "https://www.iris.com.tw/SalePage/Index/11830341", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11830341/0/639153752077570000?v=1" },
    ],
  },
  {
    brandName: "Iris Girls",
    line: "Iris Girls 年輕線（甜美・精緻・舒適）",
    products: [
      { name: "水晶鑽蝴蝶上衣-61955", price: "2,690", url: "https://www.iris.com.tw/SalePage/Index/11857592", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11857592/0/639160518899600000?v=1" },
      { name: "初戀花園洋裝-61651", price: "4,990", url: "https://www.iris.com.tw/SalePage/Index/11828329", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11828329/0/639153583834270000?v=1" },
      { name: "月光蕾絲百褶裙-61234", price: "3,190", url: "https://www.iris.com.tw/SalePage/Index/11828283", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11828283/0/639153574116200000?v=1" },
      { name: "香檸珍珠上衣-61956", price: "2,890", url: "https://www.iris.com.tw/SalePage/Index/11857604", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11857604/0/639160521340070000?v=1" },
      { name: "霧藍緞帶洋裝-61637", price: "4,590", url: "https://www.iris.com.tw/SalePage/Index/11766217", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11766217/0/639135493246200000?v=1" },
      { name: "摩卡雪紡百褶裙-61236", price: "3,190", url: "https://www.iris.com.tw/SalePage/Index/11857474", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11857474/0/639160511976300000?v=1" },
      { name: "荷葉邊雪紡上衣-61159", price: "2,990", url: "https://www.iris.com.tw/SalePage/Index/11828201", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11828201/0/639153568525870000?v=1" },
      { name: "天空藍蕾絲拼接上衣-61156", price: "2,990", url: "https://www.iris.com.tw/SalePage/Index/11807657", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11807657/0/639147553513800000?v=1" },
      { name: "小香風條紋上衣-61939", price: "3,090", url: "https://www.iris.com.tw/SalePage/Index/11766285", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11766285/0/639135503248630000?v=1" },
      { name: "可可色休閒短裙-61237", price: "2,590", url: "https://www.iris.com.tw/SalePage/Index/11857552", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11857552/0/639160515830170000?v=1" },
      { name: "絲巾領POLO衫-61940", price: "2,790", url: "https://www.iris.com.tw/SalePage/Index/11766431", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11766431/0/639135508584600000?v=1" },
      { name: "花間綻放六片裙-61232", price: "2,890", url: "https://www.iris.com.tw/SalePage/Index/11783237", img: "https://img.91app.com/webapi/imagesV3/Cropped/SalePage/11783237/0/639140784663770000?v=1" },
    ],
  },
];

// Mirror productDiscovery.toSlug (post CJK fix) so future re-scans dedupe.
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120)
    || `product-${Date.now()}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [uRows]: any = await localPool.execute(
    `SELECT id FROM users WHERE email = ?`, [OWNER_EMAIL],
  );
  if ((uRows as any[]).length !== 1) {
    console.error(`ABORT: found ${(uRows as any[]).length} users for ${OWNER_EMAIL}`);
    process.exit(1);
  }
  const userId = (uRows as any[])[0].id;

  const deepIds: Array<{ id: number; name: string }> = [];

  for (const seed of SEEDS) {
    const [bRows]: any = await localPool.execute(
      `SELECT id FROM brands WHERE userId = ? AND name = ? LIMIT 1`,
      [userId, seed.brandName],
    );
    const brandId = (bRows as any[])[0]?.id;
    if (!brandId) {
      console.error(`ABORT: brand "${seed.brandName}" not found for user ${userId}`);
      process.exit(1);
    }
    console.log(`Brand "${seed.brandName}" → id ${brandId}`);

    let idx = 0;
    for (const p of seed.products) {
      const slug = toSlug(p.name);
      const description =
        `${seed.line} 2026 春夏系列商品「${p.name}」，定價 NT$${p.price}。` +
        `商品頁：${p.url}`;
      const [ex]: any = await localPool.execute(
        `SELECT id FROM products WHERE brandId = ? AND slug = ? LIMIT 1`,
        [brandId, slug],
      );
      let productId: number;
      if ((ex as any[]).length > 0) {
        productId = (ex as any[])[0].id;
        console.log(`  reuse ${p.name} (id ${productId})`);
      } else {
        const posJson = JSON.stringify({ description, imageUrl: p.img, productUrl: p.url, price: `NT$${p.price}` });
        const [ins]: any = await localPool.execute(
          `INSERT INTO products (userId, brandId, slug, name, positioning) VALUES (?, ?, ?, ?, ?)`,
          [userId, brandId, slug, p.name, posJson],
        );
        productId = (ins as any).insertId;
        console.log(`  seeded ${p.name} (id ${productId})`);
      }
      if (idx < DEEP_POSITION_COUNT) {
        startPositioningJob({
          userId,
          entityKind: "product",
          entityId: productId,
          brandName: p.name,
          industry: "服飾",
          description,
          steps: buildProductPositioningSteps({ lang: "zh-TW", outputLanguage: "zh-TW" }),
        });
        deepIds.push({ id: productId, name: p.name });
        console.log(`  KICKED product positioning: ${p.name} (id ${productId})`);
      }
      idx++;
    }
  }

  // Product pipelines run detached in this process — poll until all done.
  const ids = deepIds.map((d) => d.id);
  if (ids.length > 0) {
    const deadline = Date.now() + 20 * 60 * 1000;
    while (Date.now() < deadline) {
      await sleep(15_000);
      const [rows]: any = await localPool.execute(
        `SELECT pj.entityId, pj.status, pj.currentStep, pj.totalSteps
           FROM positioning_jobs pj
          WHERE pj.entityKind = 'product' AND pj.entityId IN (${ids.map(() => "?").join(",")})
            AND pj.id IN (SELECT MAX(id) FROM positioning_jobs
                           WHERE entityKind = 'product' AND entityId IN (${ids.map(() => "?").join(",")})
                           GROUP BY entityId)`,
        [...ids, ...ids],
      );
      const states = rows as Array<{ entityId: number; status: string; currentStep: number; totalSteps: number }>;
      console.log(states.map((s) => `p${s.entityId}: ${s.status} ${s.currentStep}/${s.totalSteps}`).join(" | "));
      if (states.length >= ids.length && states.every((s) => s.status === "done" || s.status === "failed")) break;
    }
  }

  console.log("===== FINAL =====");
  const [fin]: any = await localPool.execute(
    `SELECT p.brandId, p.id, p.name,
            JSON_EXTRACT(p.positioning,'$.core') IS NOT NULL AS hasCore,
            LEFT(JSON_UNQUOTE(JSON_EXTRACT(p.positioning,'$.audience.primary')), 160) AS audiencePreview
       FROM products p WHERE p.brandId IN (2956, 2957) ORDER BY p.brandId, p.id`,
  );
  for (const r of fin as any[]) {
    console.log(`[brand ${r.brandId}] ${r.name} (id ${r.id}) core=${r.hasCore}`);
    if (r.audiencePreview) console.log(`    audience → ${r.audiencePreview}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
