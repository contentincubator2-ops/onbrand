/**
 * 2026-07-23 (CJ:「IRIS GIRL的競爭者，需填上這張圖完整的競爭者，再用市場
 * 數據，補充說明」+ 7/24「繼續補充競爭者」): write the OFFICIAL competitor
 * sets from the 品牌手冊 positioning maps (優雅↔休閒 × 高價位↔低價位) into
 * BOTH brands' positioning.competition, enriched with researched market
 * data. Handbook p.3 = IRIS map (Half half / TOP-DO / 五銅 / Master Max /
 * GINKOO / 銀穗 / JOAN); p.9 = Iris Girls map (0918 / U're / INED / IENA /
 * MK / 8 HAPPY / DITA / b-Club / POONE).
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

const GIRLS_DESAPPEND =
  "\n【官方確認競品（品牌手冊定位圖，優雅↔休閒 × 高價位↔低價位）】" +
  "優雅側：Iris Girls（最優雅、中高價）、0918、U're、INED（最高價）、IENA；" +
  "休閒側：MK MICHEL KLEIN、8 HAPPY、DITA、b-Club、POONE（偏低價）。" +
  "競爭分析必須涵蓋以上全部品牌，不可替換成其他清單。";

const IRIS_DESAPPEND =
  "\n【官方確認競品（品牌手冊定位圖，優雅↔休閒 × 高價位↔低價位）】" +
  "優雅側：IRIS（最優雅、中高價）、Half half、TOP-DO、五銅、Master Max（最高價）；" +
  "休閒側：GINKOO、銀穗、JOAN。低價象限無品牌——此戰場為正價專櫃市場。" +
  "競爭分析必須涵蓋以上全部品牌，不可替換成其他清單。";

const IRIS_COMPETITION = {
  intensity:
    "台灣淑女裝專櫃市場是正價戰場：手冊定位圖的低價象限完全沒有品牌——競爭不在價格，而在質感、版型與百貨櫃位體驗。市場結構上，2024 年台灣百貨商場業營收約 4,491 億元（年增 1.4%），服飾業種在主要百貨營收占比 40–50%；但全台服飾專賣門市自 2019 年以來減少逾 2,300 家（-13.4%），淑女裝品牌集體面臨客群老化與通路收縮的雙重壓力，勝負轉向「誰能把 30–40 歲客群的信任經營成回購」。IRIS 以全台 46 個據點（專櫃 27＋直營 12＋加盟 7）與近 40 年工藝在優雅側佔據最外緣位置。",
  direct: [
    {
      name: "Half half",
      position: "定位圖優雅側、緊貼 IRIS 但價位略低（近橫軸）；台灣品牌，百貨專櫃＋Outlet",
      tone: "汲取日韓流行、強調穿出個人風格而非追逐 logo",
      weakness: "風格路線較混搭、品牌敘事分散，「為什麼是它」的理由不如單一美學清晰",
      ourEdge: "IRIS 只做一件事：修飾身形顯瘦的優雅——單一而清楚的購買理由，加上鳶尾花／彩虹女神的品牌故事縱深",
    },
    {
      name: "TOP-DO",
      position: "定位圖優雅側、價位略高於 IRIS；台灣專櫃女裝（top-do.com.tw）",
      tone: "都會優雅、正式感較重",
      weakness: "正式感強但生活化場景弱，年輕化與數位溝通聲量有限",
      ourEdge: "「優雅是一種從容生活的態度」——IRIS 把優雅帶進日常場景而不只正式場合，價位帶也更易入手",
    },
    {
      name: "五銅（手冊標示）",
      position: "定位圖中央偏優雅、高價帶；百貨通路淑女裝（公開資料有限，建議課堂上與品牌方核對全名與現況）",
      tone: "高價位淑女裝",
      weakness: "公開聲量低、數位存在感弱",
      ourEdge: "IRIS 官網＋電商＋46 據點的全通路可見度，數位時代的觸及優勢明顯",
    },
    {
      name: "Master Max",
      position: "定位圖最高價位（偏優雅中央）；台灣專櫃女裝（mastermax.com.tw、momo 專櫃品牌館）",
      tone: "高價質感淑女裝、針織與套裝見長",
      weakness: "高價帶客群窄，換季與景氣敏感度高",
      ourEdge: "IRIS 以進口素材＋日韓歐流行情報做出「高質感、可負擔」的甜蜜點，量價平衡更穩",
    },
    {
      name: "GINKOO 俊克",
      position: "定位圖休閒側近中央、中高價；新光三越等百貨專櫃（ginkoo.com.tw）",
      tone: "週一到週日、日夜皆宜的舒適質感全場景",
      weakness: "全場景訴求使風格辨識度被稀釋，「想到 GINKOO 想到什麼」不夠尖銳",
      ourEdge: "IRIS 的優雅女性化美學辨識度極高——修身剪裁＋顯瘦是可被具體感知的差異",
    },
    {
      name: "銀穗 EN-SUEY",
      position: "定位圖休閒側、中高價；老牌台灣淑女裝（ensuey.com）",
      tone: "資深淑女裝的質感與版型信任",
      weakness: "品牌年齡感重，客群老化風險最高，年輕接班客群斷層",
      ourEdge: "IRIS 用彩虹好心情的品牌敘事與春夏系列的清新色彩持續補進 30 世代新客",
    },
    {
      name: "JOAN 瓊安",
      position: "定位圖最休閒側、中高價；新光三越 JO-AN THE SHOP 等專櫃（jo-an.com.tw）",
      tone: "「詮釋屬於自己的質感穿著」——舒適、美感、品質的日常休閒",
      weakness: "休閒質感賽道直面快時尚與電商的價格擠壓",
      ourEdge: "IRIS 站穩優雅側不打休閒消耗戰；顯瘦版型工藝是快時尚無法複製的護城河",
    },
  ],
  indirect: [
    {
      name: "快時尚（UNIQLO／ZARA）",
      threat: "中高——基本款價格優勢吸走日常置裝預算",
      response: "以修身顯瘦的版型工藝與專櫃試穿服務對抗均碼化基本款；強調「一件抵三件」的質感投資",
    },
    {
      name: "日系百貨專櫃女裝（例：23 區、組曲等）",
      threat: "中——同在百貨高價帶爭奪優雅客群",
      response: "以在地化身形研究（台灣女性版型資料庫）與 46 據點服務密度差異化",
    },
    {
      name: "電商平價女裝與韓系網拍",
      threat: "中——價格帶低、上新快，侵蝕比價型客群",
      response: "經營官網會員與百貨回購禮遇，把試穿體驗與修改服務做成電商給不了的理由",
    },
  ],
  map:
    "品牌手冊官方定位圖以「優雅↔休閒」為橫軸、「高價位↔低價位」為縱軸：IRIS 位於優雅側最外緣、中高價位帶；Half half 緊貼其右下（優雅、價位略低）、TOP-DO 在其右上（優雅、價位略高）；五銅與 Master Max 佔據高價位頂端（偏優雅中央，Master Max 最高）；休閒側由中央往外依序為 GINKOO、銀穗、JOAN（最休閒）。全圖低價象限沒有任何品牌——這是正價專櫃市場，比的是質感、版型與服務而非價格。白空間判讀：優雅×中高價一帶只有 Half half 真正貼近 IRIS，而其風格路線分散——IRIS 以「顯瘦修身工藝 × 從容生活態度敘事 × 46 據點服務網」構成三重護城河；風險側是整個淑女裝板塊的客群老化，需持續以春夏色彩企劃與數位內容補進 30 世代。",
};

const GIRLS_COMPETITION = {
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

const TARGETS = [
  { brandName: "IRIS", desAppend: IRIS_DESAPPEND, competition: IRIS_COMPETITION },
  { brandName: "Iris Girls", desAppend: GIRLS_DESAPPEND, competition: GIRLS_COMPETITION },
];

async function main() {
  const [uRows]: any = await localPool.execute(
    `SELECT id FROM users WHERE email = ?`, [OWNER_EMAIL],
  );
  if ((uRows as any[]).length !== 1) {
    console.error(`ABORT: ${(uRows as any[]).length} users for ${OWNER_EMAIL}`);
    process.exit(1);
  }
  const userId = (uRows as any[])[0].id;

  for (const t of TARGETS) {
    const [bRows]: any = await localPool.execute(
      `SELECT id, description, positioning FROM brands WHERE userId = ? AND name = ? LIMIT 1`,
      [userId, t.brandName],
    );
    const brand = (bRows as any[])[0];
    if (!brand) { console.error(`ABORT: brand "${t.brandName}" not found`); process.exit(1); }

    // 1. description: append official competitor anchor (idempotent)
    const desc: string = String(brand.description ?? "");
    if (!desc.includes("官方確認競品")) {
      await localPool.execute(
        `UPDATE brands SET description = CONCAT(COALESCE(description,''), ?) WHERE id = ?`,
        [t.desAppend, brand.id],
      );
      console.log(`${t.brandName}: description anchor appended`);
    } else {
      console.log(`${t.brandName}: description anchor already present, skipped`);
    }

    // 2. positioning.competition: replace with the curated official set
    let pos: any = brand.positioning;
    if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
    pos = pos ?? {};
    pos.competition = t.competition;
    await localPool.execute(
      `UPDATE brands SET positioning = ? WHERE id = ?`,
      [JSON.stringify(pos), brand.id],
    );
    console.log(`${t.brandName}: competition written (${t.competition.direct.length} direct + ${t.competition.indirect.length} indirect)`);

    // 3. verify
    const [v]: any = await localPool.execute(
      `SELECT JSON_LENGTH(JSON_EXTRACT(positioning,'$.competition.direct')) AS directN,
              LEFT(JSON_UNQUOTE(JSON_EXTRACT(positioning,'$.competition.map')), 120) AS mapPreview
         FROM brands WHERE id = ?`, [brand.id],
    );
    console.log(`${t.brandName} VERIFY:`, JSON.stringify((v as any[])[0]));
  }
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
