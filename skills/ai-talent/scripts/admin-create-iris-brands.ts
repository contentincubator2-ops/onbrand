/**
 * 2026-07-23 (CJ: IRIS/iris girl 7/27 教育訓練): create the two 艾莉詩
 * brands under sowork@sowork.tw, grounded on the official 品牌手冊 —
 * description carries the handbook digest so every positioning step
 * prompt (positioningSteps.ts `描述：` line) reasons from the official
 * brand book, not just the website scrape.
 *
 * Side effects per brand (mirrors brandRouter.create + recalibrate):
 *   1. brands row (+ brand_members owner)
 *   2. startPositioningJob(...) — runs IN THIS PROCESS; we poll until done
 *      because exiting early would kill the detached pipeline.
 *
 * Idempotent: an existing brand with the same name under the owner is
 * reused (positioning re-kicked only if not completed).
 *
 * Usage: npx tsx scripts/admin-create-iris-brands.ts
 */
import * as dotenv from "dotenv";
dotenv.config();
import localPool from "../server/localDb";
import { startPositioningJob } from "../server/strategy/core/positioning/positioningJobRunner";
import { buildBrandPositioningSteps } from "../server/strategy/core/positioning/positioningSteps";
import { looksLikeNonProduct } from "./lib/nonProductNames";

const OWNER_EMAIL = "sowork@sowork.tw";
const WEBSITE = "https://www.iris.com.tw/";
// 2026-07-23: the homepage is a JS storefront with no product list — the
// first discovery pass only found the company name + 春夏新品 labels. The
// curator category page is the real product listing for both lines.
const PRODUCTS_URL = "https://www.iris.com.tw/v2/official/SalePageCategory/582194?sortMode=Curator";
// --discovery-only: skip positioning re-kick (already anchored & completed);
// just clean junk products + re-scan from PRODUCTS_URL.
const DISCOVERY_ONLY = process.argv.includes("--discovery-only");

const BRAND_SPECS = [
  {
    name: "IRIS",
    slugBase: "iris",
    industry: "服飾",
    tagline: "優雅，不只是穿著，而是一種從容生活的態度。",
    targetAudience:
      "心理年齡 30–40 歲女性，流行意識心態，崇尚皇家經典品味，追求優雅時尚，充滿知性與感性的流行女性化族群",
    socialLinks: {
      facebook: "https://www.facebook.com/irisroyalfamily",
      instagram: "https://www.instagram.com/iris_la_mode/",
    },
    description: [
      "IRIS 艾莉詩，1987 年創立的台灣專櫃女裝品牌（艾莉詩服飾股份有限公司）。",
      "品牌名取自希臘神話彩虹女神 Iris 與法國國花鳶尾花——春天最早綻放的花，象徵豐富而敏銳的藝術感受力；設計團隊的共同使命是創造令人有彩虹般好心情的衣裳，「帶給女性裝扮的喜悅與感動」。",
      "秉持進口素材與優雅時尚的完美結合，40 年來持續吸收日本、韓國、歐洲流行資訊與素材，注重每一件衣服的設計、打版、縫製細節；只做能修飾女性身形並顯瘦的服飾，讓顧客顯現優雅迷人的氣質。",
      "目標客群：心理年齡 30–40 歲、流行意識心態、崇尚皇家經典品味、追求優雅時尚、充滿知性與感性的女性。",
      "品牌關鍵字：Elegant 優雅、Refined 精緻、Feminine 女性化。",
      "品牌態度：「優雅，不只是穿著，而是一種從容生活的態度。」",
      "通路：全台百貨專櫃 27 間、直營門市 12 間、加盟門市 7 間。",
    ].join("\n"),
  },
  {
    name: "Iris Girls",
    slugBase: "iris-girls",
    industry: "服飾",
    tagline: null as string | null,
    targetAudience: "心理年齡 25–35 歲女性，喜歡甜美色系，注重質感，追求小小流行性",
    socialLinks: {
      facebook: "https://www.facebook.com/iloveirisgirls/",
      instagram: "https://www.instagram.com/iris_girls/",
    },
    description: [
      "Iris Girls 是艾莉詩服飾（1987 年創立的台灣專櫃女裝公司）旗下的年輕線品牌。",
      "蝴蝶緞帶是甜美女孩 Iris Girls 的象徵——隨風飄逸的緞帶有如女性的甜美與清新特質。",
      "妝扮輕鬆中帶有俏麗的甜美，塑造自然又輕鬆休閒的優雅風格；重視剪裁、材質上強調穿著舒適感，簡潔設計中加入流行元素的細節點綴，讓女孩化身公主般甜蜜幸福。",
      "目標客群：心理年齡 25–35 歲女性，喜歡甜美色系、注重質感、追求小小流行性。",
      "品牌關鍵字：Sweet 甜美、Refined 精緻、Comfortable 舒適。",
      "與主線 IRIS 共用「帶給女性裝扮的喜悅與感動」的企業使命與全台專櫃／門市通路，但以更年輕、甜美、舒適的路線區隔。",
    ].join("\n"),
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  const targets: Array<{ id: number; name: string }> = [];

  for (const spec of BRAND_SPECS) {
    const [exRows]: any = await localPool.execute(
      `SELECT id, positioningStatus FROM brands WHERE userId = ? AND name = ? LIMIT 1`,
      [userId, spec.name],
    );
    const existing = (exRows as any[])[0];
    let brandId: number;

    if (existing) {
      brandId = existing.id;
      // 2026-07-23 anchor rerun: ALWAYS re-kick positioning on reuse — the
      // officialAudience anchor (brands.targetAudience → every step prompt)
      // must overwrite the pre-anchor first pass. mergePositioning replaces
      // segments wholesale, so this is a clean regeneration.
      console.log(`REUSE: brand "${spec.name}" (id ${brandId}, positioning=${existing.positioningStatus}) — re-kicking positioning with official-audience anchor`);
    } else {
      const slug = `${spec.slugBase}-${Math.random().toString(36).slice(2, 7)}`;
      const [res]: any = await localPool.execute(
        `INSERT INTO brands
           (userId, createdBy, slug, name, website, industry, tagline,
            targetAudience, description, socialLinks, soworkAnalysis,
            targetCountry, outputLanguage, dataSource, isDefault, positioningStatus)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 0, 'pending')`,
        [
          userId, userId, slug, spec.name, WEBSITE, spec.industry, spec.tagline,
          spec.targetAudience, spec.description,
          JSON.stringify(spec.socialLinks),
          JSON.stringify({ competitors: null, targetMarket: "Taiwan", contentLanguage: "zh-TW" }),
          "TW", "zh-TW",
        ],
      );
      brandId = (res as any).insertId;
      console.log(`CREATED: brand "${spec.name}" → id ${brandId} (slug ${slug})`);
      try {
        await localPool.execute(
          `INSERT INTO brand_members (brandId, userId, role, addedBy) VALUES (?, ?, 'owner', ?)`,
          [brandId, userId, userId],
        );
      } catch (e: any) {
        console.warn(`brand_members seed failed (non-fatal): ${e?.message}`);
      }
    }

    // Clean junk rows from earlier scans (company legal name, standalone
    // seasonal labels, CJK-slug duplicates) before re-scanning.
    const [pRows]: any = await localPool.execute(
      `SELECT id, name FROM products WHERE brandId = ?`, [brandId],
    );
    const junkIds = (pRows as Array<{ id: number; name: string }>)
      .filter((p) => looksLikeNonProduct(String(p.name ?? "")))
      .map((p) => p.id);
    if (junkIds.length > 0) {
      await localPool.execute(
        `DELETE FROM products WHERE brandId = ? AND id IN (${junkIds.map(() => "?").join(",")})`,
        [brandId, ...junkIds],
      );
      console.log(`CLEANED: ${junkIds.length} non-product rows for "${spec.name}"`);
    }

    // 2026-09-24（CJ「刪除AI掃描官網的功能」）：這裡原本會排一個「爬官網找
    // 產品」的工作。功能已移除，產品改由使用者自己新增——這支腳本現在只負責
    // 建立品牌、清掉舊掃描留下的垃圾列，以及跑品牌定位。

    if (!DISCOVERY_ONLY) {
      await localPool.execute(
        `UPDATE brands SET positioningStatus = 'in_progress' WHERE id = ?`,
        [brandId],
      );
      startPositioningJob({
        userId,
        entityKind: "brand",
        entityId: brandId,
        brandName: spec.name,
        industry: spec.industry,
        description: spec.description,
        steps: buildBrandPositioningSteps({ lang: "zh-TW", outputLanguage: "zh-TW" }),
      });
      console.log(`KICKED: positioning pipeline for "${spec.name}" (id ${brandId})`);
    }
    targets.push({ id: brandId, name: spec.name });
  }

  const ids = targets.map((t) => t.id);
  if (!DISCOVERY_ONLY) {
    // The positioning pipelines run detached in THIS process — poll until done.
    const deadline = Date.now() + 25 * 60 * 1000;
    while (Date.now() < deadline) {
      await sleep(15_000);
      const [rows]: any = await localPool.execute(
        `SELECT b.id, b.name, b.positioningStatus,
                (SELECT CONCAT(pj.status, ' ', pj.currentStep, '/', pj.totalSteps)
                   FROM positioning_jobs pj
                  WHERE pj.entityKind = 'brand' AND pj.entityId = b.id
                  ORDER BY pj.id DESC LIMIT 1) AS job
           FROM brands b WHERE b.id IN (${ids.map(() => "?").join(",")})`,
        ids,
      );
      const states = rows as Array<{ id: number; name: string; positioningStatus: string; job: string | null }>;
      console.log(states.map((s) => `${s.name}: ${s.positioningStatus} (job ${s.job ?? "—"})`).join(" | "));
      if (states.every((s) => s.positioningStatus === "completed" || String(s.job ?? "").startsWith("failed"))) break;
    }
  } else {
    // Discovery jobs are processed by the pm2 server worker — poll the queue.
    const deadline = Date.now() + 12 * 60 * 1000;
    while (Date.now() < deadline) {
      await sleep(10_000);
      const [rows]: any = await localPool.execute(
        `SELECT dj.brandId, dj.status, dj.phase FROM product_discovery_jobs dj
          WHERE dj.brandId IN (${ids.map(() => "?").join(",")})
            AND dj.id IN (SELECT MAX(id) FROM product_discovery_jobs WHERE brandId IN (${ids.map(() => "?").join(",")}) GROUP BY brandId)`,
        [...ids, ...ids],
      );
      const states = rows as Array<{ brandId: number; status: string; phase: string }>;
      console.log(states.map((s) => `brand ${s.brandId}: ${s.status}/${s.phase}`).join(" | "));
      if (states.length > 0 && states.every((s) => s.status === "done" || s.status === "failed")) break;
    }
  }

  // Final report
  console.log("===== FINAL =====");
  const [fin]: any = await localPool.execute(
    `SELECT b.id, b.name, b.positioningStatus,
            JSON_LENGTH(JSON_KEYS(b.positioning)) AS segments,
            LEFT(JSON_UNQUOTE(JSON_EXTRACT(b.positioning, '$.audience.primary')), 260) AS audiencePreview,
            (SELECT COUNT(*) FROM products p WHERE p.brandId = b.id) AS products,
            (SELECT CONCAT(dj.status, '/', dj.phase) FROM product_discovery_jobs dj
              WHERE dj.brandId = b.id ORDER BY dj.id DESC LIMIT 1) AS discovery
       FROM brands b WHERE b.id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  for (const r of fin as any[]) {
    console.log(`${r.name} (id ${r.id}): positioning=${r.positioningStatus}, segments=${r.segments}, products=${r.products}, discovery=${r.discovery ?? "not-queued"}`);
    console.log(`  audience.primary → ${r.audiencePreview ?? "(empty)"}`);
  }
  const [plist]: any = await localPool.execute(
    `SELECT p.brandId, p.name FROM products p
      WHERE p.brandId IN (${ids.map(() => "?").join(",")}) ORDER BY p.brandId, p.id`,
    ids,
  );
  for (const p of plist as any[]) console.log(`  product[${p.brandId}] ${p.name}`);
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
