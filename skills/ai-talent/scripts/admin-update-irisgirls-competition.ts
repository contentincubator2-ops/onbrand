/**
 * 2026-07-23 (CJ:「IRIS GIRL的競爭者，需填上這張圖完整的競爭者，再用市場
 * 數據，補充說明」): write the OFFICIAL competitor set from the 品牌手冊
 * positioning map (優雅↔休閒 × 高價位↔低價位) into Iris Girls (2957)
 * positioning.competition, enriched with researched market data.
 *
 * Also appends the official competitor list to brands.description so any
 * future positioning re-run (recalibrate) regenerates competition from the
 * SAME official set instead of AI-invented competitors.
 *
 * Usage: npx tsx scripts/admin-update-irisgirls-competition.ts
 */
import * as dotenv from "dotenv";
dotenv.config();
import localPool from "../server/localDb";

const OWNER_EMAIL = "sowork@sowork.tw";
const BRAND_NAME = "Iris Girls";

const DESAPPEND =
  "\n【官方確認競品（品牌手冊定位圖，優雅↔休閒 × 高價位↔低價位）】" +
  "優雅側：Iris Girls（最優雅、中高價）、0918、U're、INED（最高價）、IENA；" +
  "休閒側：MK MICHEL KLEIN、8 HAPPY、DITA、b-Club、POONE（偏低價）。" +
  "競爭分析必須涵蓋以上全部品牌，不可替換成其他清單。";

const COMPETITION = {
  intensity:
    "台灣少淑女裝專櫃市場競爭密集且通路正在收縮：2024 年台灣布疋及服飾品零售業營收約 3,529 億元（年增 2.16%），百貨商場業營收約 4,491 億元（年增 1.4%），服飾業種在主要百貨（新光三越南西、SOGO 忠孝等）營收占比達 40–50%——專櫃仍是主戰場；但全台服飾專賣門市自 2019 年以來已減少逾 2,300 家（-13.4%），品牌被迫向百貨專櫃與電商雙軌集中。手冊定位圖的「優雅×中高價」象限品牌密度最高（0918、U're 緊貼 Iris Girls），甜美系客群重疊度高，是最需要差異化敘事的一帶。",
  direct: [
    {
      name: "0918",
      position: "定位圖上最貼近 Iris Girls 的同象限對手（優雅、中高價）；台灣專櫃品牌（南西三越等）",
      tone: "以玫瑰為品牌精神，浪漫甜美帶個性",
      weakness: "符號集中在玫瑰單一意象，故事延展性有限；線上聲量與會員經營相對薄弱",
      ourEdge: "蝴蝶緞帶敘事＋母品牌 IRIS 近 40 年打版縫製工藝，甜美之外多一層「專櫃級精緻」的信任基礎",
    },
    {
      name: "U're",
      position: "同象限次貼近者（優雅、中價位）；北部專櫃＋街邊門市（SOGO 忠孝、新光三越信義 A8 等）",
      tone: "自稱「日系輕熟甜美系名媛」，走名媛感甜美",
      weakness: "名媛路線價格帶與風格偏窄，休閒場景較弱；門市集中北部",
      ourEdge: "Iris Girls 甜美中帶自然休閒的優雅，全台專櫃／門市網覆蓋廣，日常場景通吃",
    },
    {
      name: "INED",
      position: "定位圖高價位頂端（優雅偏中央）；日本 Flandre 集團品牌",
      tone: "知性優雅的成熟大人風，高質感素材與美型剪裁",
      weakness: "價位高、風格成熟，對 25–35 歲「想甜美不想老氣」客群吸引力有限",
      ourEdge: "以專櫃級質感承接「想要質感但還想保有女孩感」的客群，價格帶更好入手",
    },
    {
      name: "IENA",
      position: "定位圖中央偏優雅、中價位；台灣專櫃品牌",
      tone: "女性化職場服飾、質感女裝",
      weakness: "職場定位使非上班場景（約會、聚會、旅行）的情感連結較弱",
      ourEdge: "Iris Girls 覆蓋上班到假日的完整生活場景，甜美元素讓穿搭有記憶點",
    },
    {
      name: "MK MICHEL KLEIN",
      position: "定位圖休閒側高價帶；法籍設計師品牌（日系授權體系），台灣百貨專櫃",
      tone: "都會俐落、個性化的年輕職場時尚",
      weakness: "設計師品牌形象偏冷調，甜美情感元素少",
      ourEdge: "用蝴蝶緞帶與柔和色系直接對話「想被溫柔對待」的情感需求，MK 難以跟進",
    },
    {
      name: "8 HAPPY",
      position: "定位圖最休閒側高價帶；台灣品牌（8happy group），專櫃＋Outlet 雙通路",
      tone: "簡約舒適、做自己的自在休閒",
      weakness: "簡約休閒賽道與快時尚正面撞擊，價格說服力吃緊；Outlet 通路稀釋專櫃形象",
      ourEdge: "同樣舒適，但 Iris Girls 把舒適包進「甜美精緻」的完整風格提案，不打裸價格戰",
    },
    {
      name: "DITA",
      position: "定位圖休閒側中價帶（近軸）；新光三越等百貨專櫃女裝",
      tone: "都會休閒混搭",
      weakness: "品牌辨識度與數位聲量偏低，風格記憶點模糊",
      ourEdge: "蝴蝶緞帶＋公主感故事給出清晰記憶點，社群素材天然有梗",
    },
    {
      name: "b-Club",
      position: "定位圖休閒×中低價象限；新光三越專櫃（B.CLUB）",
      tone: "質感設計＋舒適剪裁的精緻甜美日常",
      weakness: "「精緻甜美」訴求與其中低價位帶互相牽制，質感敘事撐不高",
      ourEdge: "母品牌工藝背書讓 Iris Girls 的「精緻」有實體證據（剪裁、材質、細節），支撐中高價位",
    },
    {
      name: "POONE",
      position: "定位圖休閒×低價象限；1991 年創立的台灣品牌，走「柔美輕時尚」",
      tone: "花卉印花、蕾絲、雪紡的柔美輕時尚",
      weakness: "低價帶利潤薄、與電商平價女裝重疊度高；設計元素與 Iris Girls 部分重疊但質感層級不同",
      ourEdge: "同樣的花卉蕾絲語彙，Iris Girls 以專櫃級布料與版型做出「摸得到的差距」，鎖住願意為質感加價的客群",
    },
  ],
  indirect: [
    {
      name: "快時尚（UNIQLO／ZARA／GU）",
      threat: "高——價格與展店規模碾壓，吸走「先求有」的日常置裝預算",
      response: "不比價格比風格完整度：以「一套穿出甜美精緻」的搭配提案與專櫃試穿體驗對抗單品思維",
    },
    {
      name: "電商原生／韓系網拍女裝（momo、蝦皮、Dcard 團購熱門店）",
      threat: "中高——25–35 歲主客群的滑手機時間都在這裡，價格帶低、上新快",
      response: "把 IG／Dcard 當主戰場經營穿搭內容與口碑，強調實體試穿、版型與退換保障等網拍痛點",
    },
    {
      name: "Outlet／折扣通路（含各品牌過季品）",
      threat: "中——訓練消費者「等折扣」，侵蝕正價銷售",
      response: "以當季限定色與蝴蝶緞帶系列的稀缺感維持正價理由，會員限定服務取代一味折扣",
    },
  ],
  map:
    "品牌手冊官方定位圖以「優雅↔休閒」為橫軸、「高價位↔低價位」為縱軸：Iris Girls 位於優雅側最外緣、中高價位帶，緊鄰 0918 與 U're（同為甜美優雅帶，競爭最貼身）；INED 佔據高價位頂端偏優雅、IENA 居中偏優雅；休閒側由上而下依序為 MK MICHEL KLEIN、8 HAPPY（最休閒）、DITA，低價休閒象限則有 b-Club 與 POONE。白空間判讀：優雅×中高價的「甜美精緻」帶目前僅 0918、U're 貼近，且兩者都缺乏大廠工藝背書——Iris Girls 以「母品牌 IRIS 近 40 年專櫃工藝 × 蝴蝶緞帶甜美敘事」在此帶建立難以複製的記憶點；市場結構上（門市五年收掉 2,300 家、百貨服飾占比仍達 40–50%）勝負將在百貨專櫃體驗＋社群電商雙軌的整合力。",
};

async function main() {
  const [uRows]: any = await localPool.execute(
    `SELECT id FROM users WHERE email = ?`, [OWNER_EMAIL],
  );
  if ((uRows as any[]).length !== 1) {
    console.error(`ABORT: ${(uRows as any[]).length} users for ${OWNER_EMAIL}`);
    process.exit(1);
  }
  const userId = (uRows as any[])[0].id;
  const [bRows]: any = await localPool.execute(
    `SELECT id, description, positioning FROM brands WHERE userId = ? AND name = ? LIMIT 1`,
    [userId, BRAND_NAME],
  );
  const brand = (bRows as any[])[0];
  if (!brand) { console.error(`ABORT: brand "${BRAND_NAME}" not found`); process.exit(1); }

  // 1. description: append official competitor anchor (idempotent)
  const desc: string = String(brand.description ?? "");
  if (!desc.includes("官方確認競品")) {
    await localPool.execute(
      `UPDATE brands SET description = CONCAT(COALESCE(description,''), ?) WHERE id = ?`,
      [DESAPPEND, brand.id],
    );
    console.log("description: official competitor anchor appended");
  } else {
    console.log("description: anchor already present, skipped");
  }

  // 2. positioning.competition: replace with the curated official set
  let pos: any = brand.positioning;
  if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
  pos = pos ?? {};
  pos.competition = COMPETITION;
  await localPool.execute(
    `UPDATE brands SET positioning = ? WHERE id = ?`,
    [JSON.stringify(pos), brand.id],
  );
  console.log(`positioning.competition written: ${COMPETITION.direct.length} direct + ${COMPETITION.indirect.length} indirect`);

  // 3. verify
  const [v]: any = await localPool.execute(
    `SELECT JSON_LENGTH(JSON_EXTRACT(positioning,'$.competition.direct')) AS directN,
            LEFT(JSON_UNQUOTE(JSON_EXTRACT(positioning,'$.competition.map')), 120) AS mapPreview
       FROM brands WHERE id = ?`, [brand.id],
  );
  console.log("VERIFY:", JSON.stringify((v as any[])[0]));
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
