/**
 * 醫師自媒體示範頁（/inspire）的法規清單與事實白名單。
 *
 * 2026-10-07（CJ「醫療內容把關，你要給我你參考的法規來源，過程中我們會審查，並且展現出
 * 正在審查哪些條文」）。這頁沒有品牌，所以不走策略層的 brand_regulations；條文寫死在這裡，
 * 每一條都附官方出處連結與查核日期，畫面上逐條顯示審查進度。
 *
 * 維護規則：
 *   · gist 是我們自己寫的重點摘要，不是條文原文；原文一律以 url 指向的官方頁面為準。
 *   · 新增或修改條文前，先到 url 核對現行條文與修正日期，並更新 checkedAt。
 *   · check 是給審查模型看的判斷標準——只寫條文明文涵蓋的範圍，不要自己延伸。
 */

export type RegulationGroupId = "medical-ad" | "drug" | "food" | "privacy" | "facts";

export interface InspireRegulation {
  id: string;
  group: RegulationGroupId;
  /** 法規名稱。 */
  law: string;
  /** 條號（畫面上顯示）。 */
  article: string;
  /** 這一條在管什麼（12 字內，畫面上的小標）。 */
  title: string;
  /** 我們寫的重點摘要（不是原文）。 */
  gist: string;
  /** 給審查模型的判斷標準。 */
  check: string;
  /** 官方出處。 */
  url: string;
  /** 官方頁面上的修正／發布日期（民國）。 */
  amended: string;
  /** url 不是主管機關的原始頁面（二手出處）——畫面上照實標示，審查人員要另外核對原文。 */
  secondary?: boolean;
}

/** 全部條文最後一次向官方頁面核對的日期。 */
export const REGULATIONS_CHECKED_AT = "2026-10-07";

const MEDICAL_ACT = "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=L0020021";
const PHARMA_ACT = "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=L0030001";
const FOOD_ACT = "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=L0040001";
const PDPA = "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021";

export const REGULATION_GROUPS: Array<{ id: RegulationGroupId; label: string; note: string }> = [
  { id: "medical-ad", label: "醫療法｜醫療廣告", note: "衛教可以寫，招攬病人不行" },
  { id: "drug", label: "藥事法｜藥物廣告", note: "醫師不是藥商，不能替藥品宣傳" },
  { id: "food", label: "食品安全衛生管理法", note: "食品不能講療效" },
  { id: "privacy", label: "個人資料保護法", note: "病人的故事不能認得出是誰" },
  { id: "facts", label: "事實查核", note: "數字只能來自衛教白名單" },
];

export const INSPIRE_REGULATIONS: InspireRegulation[] = [
  {
    id: "med-9-87", group: "medical-ad", law: "醫療法", article: "第 9 條、第 87 條",
    title: "衛教與醫療廣告的界線",
    gist: "宣傳醫療業務、目的在招徠患者，就是醫療廣告；內容暗示或影射醫療業務也算。醫學新知、病人衛教沒有招徠醫療業務的，不算醫療廣告。",
    check: "文案是否出現招徠病人就醫的內容：邀請來掛號／預約／諮詢、推薦特定院所或門診、強調自己或院所的治療成果、暗示「來找我就能解決」。純粹說明疾病知識、量測方法、生活調整，並建議「與自己的醫師討論」不算違規。",
    url: MEDICAL_ACT, amended: "115 年 9 月 23 日",
  },
  {
    id: "med-84", group: "medical-ad", law: "醫療法", article: "第 84 條",
    title: "誰可以做醫療廣告",
    gist: "只有醫療機構或醫師可以做醫療廣告；醫師只能替自己執業登記的醫療機構做。",
    check: "文案是否替不是作者本人執業的院所、其他醫師、其他機構的醫療服務做宣傳或推薦。",
    url: MEDICAL_ACT, amended: "115 年 9 月 23 日",
  },
  {
    id: "med-85", group: "medical-ad", law: "醫療法", article: "第 85 條",
    title: "醫療廣告可以寫的範圍",
    gist: "醫療廣告的內容限於院所名稱與聯絡方式、醫師姓名與學經歷、健保特約、診療科別與時間等法定項目；透過網路提供的資訊另依醫療機構網際網路資訊管理辦法。",
    check: "文案是否出現法定項目以外的醫療業務宣傳，例如療程價格、治療人數、成功率、設備或技術的優越性。",
    url: MEDICAL_ACT, amended: "115 年 9 月 23 日",
  },
  {
    id: "med-86", group: "medical-ad", law: "醫療法", article: "第 86 條",
    title: "禁止的宣傳方式",
    gist: "不可以假借他人名義宣傳、公開祖傳秘方、摘錄醫學刊物來宣傳、藉採訪或報導宣傳，或用其他不正當方式宣傳。",
    check: "文案是否假借他人（名人、病人、媒體、其他醫師）的名義替醫療業務背書；是否宣稱秘方、獨門療法；是否摘錄醫學期刊或新聞報導來證明自己的醫療業務比較好。單純引用衛教資料說明疾病知識不算。",
    url: MEDICAL_ACT, amended: "115 年 9 月 23 日",
  },
  {
    id: "med-86-7", group: "medical-ad", law: "衛生福利部令", article: "衛部醫字第 1051667434 號",
    title: "「其他不正當方式」的範圍",
    gist: "衛福部核釋醫療法第 86 條第 7 款：治療前後比較影像用於宣傳、不是親身體驗的分享或未充分揭露的代言推薦、優惠／團購／贈送療程等促銷，都屬於不正當方式。",
    check: "文案是否出現治療前後對比的描述或要求放對比圖；是否有病人見證、代言、推薦；是否有優惠、折扣、贈送、團購、限時、名額等促銷說法。",
    url: "https://www.leeandli.com/TW/Newsletters/5808.htm", amended: "105 年 11 月 17 日", secondary: true,
  },
  {
    id: "med-103", group: "medical-ad", law: "醫療法", article: "第 103 條",
    title: "虛偽、誇張的內容",
    gist: "違反醫療廣告規定處新臺幣五萬元以上二十五萬元以下罰鍰；內容虛偽、誇張、歪曲事實的，可以再處停業或廢止開業執照。",
    check: "文案是否有保證療效或絕對化的說法：根治、治好、保證、一定、百分之百、永不復發、不用吃藥、最有效、第一、唯一、最新最好、保證瘦、快速瘦、躺著瘦、不復胖、幾天或幾週瘦幾公斤。是否誇大單一方法的效果（例如只靠某種食物、運動或單一方法就能瘦下來、不再復胖）。",
    url: MEDICAL_ACT, amended: "115 年 9 月 23 日",
  },
  {
    id: "drug-65-67", group: "drug", law: "藥事法", article: "第 65 條、第 67 條",
    title: "藥物廣告只有藥商能做",
    gist: "不是藥商不可以做藥物廣告；需要醫師處方的藥物，廣告只能登在學術性醫療刊物。",
    check: "文案是否出現任何藥品的商品名、成分名、廠牌或俗稱（例如瘦瘦針、減肥針、GLP-1 這類說法），或推薦、比較、暗示特定藥品或藥物類別可以減重。只說「有需要可以和醫師討論適合的治療方式」不算違規。",
    url: PHARMA_ACT, amended: "115 年 3 月 4 日",
  },
  {
    id: "drug-68", group: "drug", law: "藥事法", article: "第 68 條",
    title: "藥物宣傳的禁止方式",
    gist: "藥物廣告不可以假借他人名義宣傳、不可以利用書刊資料保證效能，也不可以用其他不正當方式宣傳。",
    check: "文案是否替任何藥物保證效果、引用研究或書刊來保證某個藥物有效、或以病人經驗替藥物背書。",
    url: PHARMA_ACT, amended: "115 年 3 月 4 日",
  },
  {
    id: "drug-69-70", group: "drug", law: "藥事法", article: "第 69 條、第 70 條",
    title: "不是藥物不能講療效",
    gist: "不是藥事法所稱的藥物，不可以標示或宣傳醫療效能；採訪、報導或宣傳的內容暗示或影射醫療效能的，視為藥物廣告。",
    check: "文案是否宣稱保健食品、偏方、器材、茶飲、精油等非藥物可以減重、燃脂、消脂、治療肥胖、取代正規治療，包含暗示與疑問句包裝。",
    url: PHARMA_ACT, amended: "115 年 3 月 4 日",
  },
  {
    id: "food-28", group: "food", law: "食品安全衛生管理法", article: "第 28 條",
    title: "食品不能宣稱療效",
    gist: "食品的標示、宣傳或廣告不可以不實、誇張或讓人誤解，也不可以宣稱醫療效能。",
    check: "文案是否說某一種食物、飲品或保健食品能「減重」「燃脂」「消脂」「治療肥胖」「取代藥物」。說明飲食原則（全穀、蔬果、優質蛋白質，少油少鹽少糖）不算；點名單一食物並宣稱療效才算。",
    url: FOOD_ACT, amended: "108 年 6 月 12 日",
  },
  {
    id: "pdpa-6", group: "privacy", law: "個人資料保護法", article: "第 6 條",
    title: "病歷與醫療個資",
    gist: "病歷、醫療、健康檢查等個人資料，除法定例外或當事人書面同意，不可以蒐集、處理或利用。",
    check: "文案是否出現可以認出特定病人的描述：姓名、確切年齡加職業加地點、就診日期、檢查數值搭配個人特徵。泛稱的情境（例如「門診常遇到的狀況」「很多人會問」）不算。",
    url: PDPA, amended: "114 年 11 月 11 日",
  },
];

// ─── 事實白名單 ────────────────────────────────────────────────────────

export interface InspireFact { id: string; text: string }

export const FACT_SOURCE = {
  label: "衛生福利部國民健康署：成人健康體位標準、肥胖防治新聞稿（107 年、115 年）",
  url: "https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=542&pid=9737",
};

/** 白名單每一條的出處頁面（畫面上的「審查依據」逐一列出）。 */
export const FACT_SOURCES: Array<{ label: string; url: string }> = [
  { label: "國民健康署「成人健康體位標準」", url: "https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=542&pid=9737" },
  { label: "衛福部新聞稿「肥胖是慢性疾病！調整飲食及運動生活是最佳處方」（107 年 7 月 4 日，109 年更新）", url: "https://mohw.gov.tw/cp-16-42429-1.html" },
  { label: "衛福部新聞稿「響應世界肥胖日 兩招啟動健康管理」（115 年 3 月 4 日）", url: "https://mohw.gov.tw/cp-16-85702-1.html" },
];

/** 文案裡可以出現的數字與統計，只有這幾條。 */
export const INSPIRE_FACTS: InspireFact[] = [
  { id: "bmi", text: "成人 BMI（體重公斤 ÷ 身高公尺的平方）：未滿 18.5 過輕；18.5 到未滿 24 是健康體重；24 到未滿 27 是過重；27 以上是肥胖。" },
  { id: "waist", text: "腰圍：成人男性 90 公分以上、女性 80 公分以上，屬於腹部肥胖。" },
  { id: "prevalence", text: "2020–2024 年國民營養健康調查：18 歲以上成人有 51.3% 達到過重及肥胖標準。" },
  { id: "global", text: "世界衛生組織：全球成人過重及肥胖的比例，從 1990 年的 25% 上升到 2022 年的 43%。" },
  { id: "risk", text: "肥胖是慢性疾病。與健康體重者相比，肥胖者罹患糖尿病、代謝症候群及血脂異常的風險超過 3 倍，罹患高血壓、心血管疾病、膝關節炎及痛風的風險約 2 倍。" },
  { id: "five-percent", text: "肥胖者減少 5% 以上的體重，就能為健康帶來益處。" },
  { id: "calories", text: "每天減少 500 大卡的熱量，每週約可減重 0.5 公斤；控制體重時，每日攝取熱量不應低於 1,200 大卡。" },
  { id: "exercise", text: "成人每週累計 150 分鐘中等強度運動（稍微喘但還能說話）；過重或肥胖者建議每週累計 250 到 300 分鐘，並搭配飲食調整。" },
  { id: "diet", text: "飲食原則：多選全穀及未精製雜糧、攝取多樣蔬果、補充優質蛋白質，避免高油、高鹽、高糖的食物。" },
];

export const FACTS_REGULATION: InspireRegulation = {
  id: "facts", group: "facts", law: "衛教事實白名單", article: "國民健康署肥胖防治資料",
  title: "數字與統計的出處",
  gist: "文案裡的數字、統計、標準值只能來自白名單；白名單沒有的，只能用不帶數字的說法。",
  check: "文案是否出現白名單以外的數字、百分比、統計、研究結論、標準值、熱量或減重幅度；是否把白名單的數字寫錯（例如 BMI 24 與 27、腰圍 90 與 80、5%、500 大卡、150 分鐘）。",
  url: FACT_SOURCE.url, amended: "115 年 3 月 4 日",
};

export const ALL_REVIEW_ITEMS: InspireRegulation[] = [...INSPIRE_REGULATIONS, FACTS_REGULATION];

export function itemsOfGroup(group: RegulationGroupId): InspireRegulation[] {
  return ALL_REVIEW_ITEMS.filter((r) => r.group === group);
}

// ─── 不用模型也抓得到的高風險用語 ──────────────────────────────────────

/** 明顯違規的用語：寫完先掃一次，命中的句子直接交給審查當線索。 */
export const RISK_TERMS: Array<{ re: RegExp; regulationId: string; why: string }> = [
  { re: /根治|治癒|治好|保證|百分之百|100\s*%|永不復發|藥到病除/, regulationId: "med-103", why: "保證療效或絕對化的說法" },
  { re: /最有效|最好的(?:治療|方法|藥)|第一名|唯一(?:有效|方法)|不用(?:再)?吃藥|擺脫藥物|告別(?:藥物|肥胖)/, regulationId: "med-103", why: "誇大效果" },
  { re: /(?:歡迎|快來|立即|馬上)?(?:預約|掛號)(?:我的|門診|諮詢)?|私訊(?:我)?(?:預約|諮詢|看診)|來(?:我的)?門診找我/, regulationId: "med-9-87", why: "招徠病人就醫" },
  { re: /優惠|折扣|免費(?:諮詢|檢測|體驗)|團購|限時|名額有限|贈送/, regulationId: "med-86-7", why: "促銷說法" },
  { re: /治療前後|術前術後|見證|親身分享/, regulationId: "med-86-7", why: "前後比較或見證" },
  { re: /瘦瘦針|減肥針|減重針|週纖達|胰妥讚|善纖達|猛健樂|wegovy|ozempic|saxenda|mounjaro|rybelsus|semaglutide|tirzepatide|liraglutide|司美格魯|GLP-?1|腸泌素|減肥藥|減重藥/i, regulationId: "drug-65-67", why: "出現藥品名稱、成分或俗稱" },
  { re: /保證瘦|快速瘦|躺著瘦|不復胖|不會復胖|(?:\d+|幾|一|兩|三)\s*(?:天|週|周|個月|月)(?:內)?(?:就)?(?:瘦|減|甩)(?:掉|了)?\s*(?:\d+|幾)\s*公斤/, regulationId: "med-103", why: "保證或誇大減重效果" },
  { re: /減重前後|瘦身前後|前後對比|before\s*(?:and|&)?\s*after/i, regulationId: "med-86-7", why: "減重前後比較" },
  { re: /祖傳|秘方|獨門/, regulationId: "med-86", why: "秘方宣傳" },
];

export interface RiskHit { regulationId: string; quote: string; why: string }

/** 回傳命中的句子（以句為單位，同一句同一條只記一次）。 */
export function scanRiskTerms(text: string): RiskHit[] {
  const sentences = String(text ?? "").split(/(?<=[。！？!?\n])/).map((s) => s.trim()).filter(Boolean);
  const out: RiskHit[] = [];
  for (const s of sentences) {
    for (const t of RISK_TERMS) {
      if (t.re.test(s) && !out.some((o) => o.quote === s && o.regulationId === t.regulationId)) {
        out.push({ regulationId: t.regulationId, quote: s.slice(0, 160), why: t.why });
      }
    }
  }
  return out.slice(0, 12);
}
