/**
 * interview-product-directors — 用真實品牌資料面試「產品頁策略總監」候選人。
 *
 * 2026-09-24（CJ「接下來是產品頁的人選，請列出十個候選名單，我想針對懶得煮的
 * 問題，要怎麼解決，只有牛舌賣得動的問題，進行面試」）：
 *
 * 選人不該只看職稱。這支把 10 位候選人的真實 mos_db 人設（名字／職稱／專長／
 * 【工作經歷】）各自組成 system prompt，配上「懶得煮的Tom老闆」真實的品牌大腦
 * 與產品清單，問同一題，把答案原樣印出來——誰答得出可執行的東西、誰只會講
 * 場面話，看答案就知道，不用猜。
 *
 * 跟正式對話的差別（要誠實講）：正式的策略總監對話走
 * strategistChatRouter.buildSystemPrompt，那裡會依「三個固定角色」加一段角度
 * 指示；這些候選人不屬於那三個 cohort，硬套會讓每個人都被塞成「品牌定位」的
 * 角度、面試就失真了。所以這裡只用「他自己的資料 + 品牌資料 + 題目」，沒有
 * 角色角度指示——面試看的正是「他自己的背景會把他帶到哪個角度」。
 *
 * 唯讀：只 SELECT，不寫任何東西（除了 LLM 呼叫本身會記 usage）。
 *
 * 用法（VM 上）：./node_modules/.bin/tsx scripts/interview-product-directors.ts [brandId]
 */
import localPool from "../server/localDb.js";
import { buildBrandPrefix } from "../server/strategy/core/brandContext.js";
import { buildBrandCatalogBlock } from "../server/strategy/core/brandCatalog.js";
import { callModel } from "../server/platform/core/multiModelRouter.js";

/**
 * 2026-09-24 第二輪（CJ「沒有專長於產品定位的人嗎?」）：第一輪那十位全是
 * 「行銷職能」（PMM/定價/CRM/歸因…），漏掉了 mos_db 裡真正以**產品定位方法論**
 * 命名的那一族（238xxx–239xxx，134 位「策略副總裁」：JTBD／Kano／VPC／FAB／
 * 品類設計／PMF／Dunford…）。這一族的資料特性跟產業族相反——方法論很明確，
 * 但幾乎都沒有【工作經歷】（只有 #238853 有）。兩族各面試一輪才比得出來。
 */
const PANELS: Record<string, Array<{ id: number; why: string }>> = {
  // 2026-09-27（CJ「請按照順序，執行到官網為止」）：IG → LinkedIn → YouTube → TikTok →
  // 電子報 → 新聞稿 → X → 官網，每頁一組。候選人從 mos_db 依通路關鍵字撈、優先繁中＋
  // 簡介夠長者；「董事會級交付物」套版族與簡介 <60 字的一律不收（X 例外，這一頁根本
  // 沒有像樣的人選，只好放進來比）。
  instagram: [
    { id: 60014, why: "社群行銷 × 餐飲食品 —— 知識庫有餐飲品牌 IG 策略" },
    { id: 60008, why: "社群行銷策略 × 美妝 —— IG 是美妝主戰場" },
    { id: 60021, why: "FB/IG 社群文案 —— 開頭與輪播文字" },
    { id: 27, why: "短影音策略師 —— Reels" },
    { id: 180166, why: "Instagram 行銷專家 —— 簡介最長的 IG 專家" },
    { id: 220584, why: "IG／Facebook 行銷專員 —— 真實課堂照換掉美圖、互動翻倍的經驗" },
    { id: 227648, why: "KOL 策略總監（FMCG）—— IG 的 KOL 合作" },
    { id: 227647, why: "成效分析師（IG KOL，FMCG）—— 看數字的人" },
    { id: 210216, why: "資深短影音行銷專員 —— Reels 腳本" },
  ],
  linkedin: [
    { id: 222943, why: "內容行銷策略師 × B2B SaaS" },
    { id: 223049, why: "內容行銷策略師 × B2B 製造業" },
    { id: 222342, why: "社群行銷策略師 × B2B SaaS" },
    { id: 223656, why: "社群社區經理 × B2B SaaS" },
    { id: 222940, why: "KOL 行銷專員 × B2B SaaS —— 用人帶企業採購" },
    { id: 222499, why: "UGC 內容策略師 × B2B SaaS" },
    { id: 223800, why: "廣告文案師 × B2B 製造業" },
    { id: 222813, why: "成長駭客 × B2B SaaS" },
    { id: 223183, why: "品牌策略師 × B2B SaaS" },
    { id: 222308, why: "Email × CRM 策略師（保健食品 B2B）—— 企業名單經營" },
  ],
  youtube: [
    { id: 224000, why: "YouTube 策略師 × 食品飲料 —— 產業最貼近" },
    { id: 223995, why: "YouTube 策略師 × 電商 / DTC" },
    { id: 223992, why: "YouTube 策略師 × 保健食品" },
    { id: 224003, why: "YouTube 策略師 × 實體零售 O2O" },
    { id: 224001, why: "YouTube 策略師 × 服飾時尚" },
    { id: 222492, why: "YouTube 廣告投手 × 電商" },
    { id: 210252, why: "資深 YouTube 內容創作者 —— 創作者視角" },
    { id: 210175, why: "資深 YouTube 行銷講師" },
    { id: 210216, why: "資深短影音行銷專員 —— Shorts" },
  ],
  tiktok: [
    { id: 223195, why: "TikTok 廣告投手 × 食品飲料" },
    { id: 223521, why: "TikTok 廣告投手 × 保健食品" },
    { id: 223709, why: "TikTok 廣告投手 × 美妝保養" },
    { id: 222720, why: "TikTok 廣告投手 × 電商 / DTC（cn 語系）" },
    { id: 27, why: "短影音策略師 —— 內容面" },
    { id: 220510, why: "短影音企劃製作人（服務業零售）—— 簡介最長" },
    { id: 220508, why: "短影音企劃製作人（科技 3C）" },
    { id: 220509, why: "短影音企劃製作人（傳產製造）" },
    { id: 210216, why: "資深短影音行銷專員" },
  ],
  email: [
    { id: 222332, why: "Email × CRM 策略師 × 綜合電商" },
    { id: 222327, why: "Email × CRM 策略師 × 保健食品" },
    { id: 222329, why: "Email × CRM 策略師 × 美妝電商" },
    { id: 222308, why: "Email × CRM 策略師（保健食品 B2B）—— 簡介最長" },
    { id: 223399, why: "CRM Lifecycle 行銷師 × 食品" },
    { id: 223686, why: "CRM 行銷師 × 電商" },
    { id: 222597, why: "CRM Lifecycle 行銷師 × 電商" },
    { id: 223608, why: "CRM 系統設定專員 × 食品 —— 分眾與自動化設定" },
    { id: 180230, why: "CRM 行銷專員（電商平台背景）" },
  ],
  pr: [
    { id: 223755, why: "公關策略師 × 電商 / DTC" },
    { id: 222665, why: "公關策略師 × 電商" },
    { id: 223191, why: "公關策略師 × 保健食品" },
    { id: 210260, why: "資深新聞稿撰寫師 —— 新聞稿本身" },
    { id: 210254, why: "資深公關總監" },
    { id: 210257, why: "資深媒體關係專員 —— 記者名單與發稿" },
    { id: 210258, why: "資深危機公關顧問 —— 反面：什麼不該發" },
    { id: 210267, why: "資深活動公關執行 —— 活動型新聞" },
    { id: 210181, why: "資深公關行銷顧問" },
  ],
  x: [
    { id: 60022, why: "LINE/Threads 社群文案 —— 台灣實際在用的短文平台" },
    { id: 224293, why: "內容再製跨平台策略師 —— 把別頁內容改寫到 X" },
    { id: 30001, why: "AI 成長駭客 CMO" },
    { id: 230137, why: "內容企劃師｜Twitter/X × FMCG（簡介短，套版族）" },
    { id: 229684, why: "策略 Twitter/X 內容師（簡介短，套版族）" },
    { id: 225199, why: "X 廣告成效分析師（旅遊）" },
    { id: 60021, why: "FB/IG 社群文案 —— 對照組" },
    { id: 60014, why: "社群行銷 × 餐飲食品 —— 對照組" },
  ],
  website: [
    { id: 222351, why: "轉換率優化專員 × 電商" },
    { id: 222348, why: "轉換率優化專員 × 保健食品" },
    { id: 223015, why: "AI SEO 策略師（GEO）× 電商" },
    { id: 223882, why: "國際 SEO 策略師 × 食品飲料" },
    { id: 222310, why: "SEO 技術專員 × 電商" },
    { id: 222309, why: "前端工程師｜Landing Page × 電商官網" },
    { id: 223955, why: "前端工程師｜Landing Page × 食品飲料" },
    { id: 223899, why: "Google Ads 廣告投手 × 食品" },
    { id: 222594, why: "UX 研究員 —— 商品頁與選購流程" },
    { id: 222681, why: "轉換漏斗優化師" },
  ],
  // 2026-09-27（CJ「要陸續更改各頁面右下方的顧問人選，從 fb 開始」→「先面試再選」）：
  // Facebook 頁的候選人。四類各挑幾位，讓答案自己說明誰的角度不重疊：
  // 內容策略／Meta 廣告／文案・社群經營・KOL／方法論族對照。繁中人選少，
  // 所以 meta_ads_tw（cn／en 語系）與 SEA 的社群經營也放進來比。
  facebook: [
    { id: 60014, why: "社群行銷 × 餐飲食品（前麥當勞台灣社群）—— 產業最貼近" },
    { id: 60008, why: "社群行銷策略 × 美妝 —— 同一族別產業，看角度會不會被產業綁住" },
    { id: 222856, why: "社群行銷策略師（電商 / DTC）—— 純電商品牌的 FB 打法" },
    { id: 222338, why: "社群行銷策略師 × 保健食品 —— 繁中社群族，比較答案厚度" },
    { id: 223587, why: "內容行銷策略師 × 食品飲料 —— 文字頁的產業用語總監，看他在 FB 的表現" },
    { id: 26, why: "META 廣告策略師 —— 知識庫是 FB 廣告課程＋Meta 官方課程" },
    { id: 33, why: "META 廣告操手 —— 帳戶結構、受眾分層、出價（執行面）" },
    { id: 222378, why: "Meta 廣告投手 × 食品飲料（cn 語系）—— 產業 cohort 的廣告人" },
    { id: 223493, why: "Meta Ads 績效經理 × 食品飲料（en 語系）—— 同產業、別語系" },
    { id: 223236, why: "Meta 廣告投手 × 電商 / DTC —— 電商導購廣告" },
    { id: 60021, why: "Facebook/Instagram 社群文案 —— 開頭、CTA、語氣（服務過餐飲）" },
    { id: 222841, why: "社群經理 × 電商（SEA）—— 留言、社團、回購互動" },
    { id: 222836, why: "影響者行銷經理 × 電商（SEA）—— 找 KOL／團購主帶貨" },
    { id: 239030, why: "Facebook 流量系統副總裁（Molly Pittman 方法論）—— 方法論族對照；資料有同 slug 兩個名字的問題" },
  ],
  // 產品定位方法論族
  positioning: [
    { id: 238853, why: "產品價值主張副總裁 —— Osterwalder VPC（這族唯一有工作經歷的）" },
    { id: 238857, why: "Kano 產品策略副總裁 —— 必備/魅力/無差異，直接解釋為什麼某些品項不動" },
    { id: 239174, why: "JTBD 產品定位副總裁 —— 牛舌被「雇用」來完成什麼工作" },
    { id: 238855, why: "JTBD 產品策略副總裁 —— 同框架另一位，比較答案穩定度" },
    { id: 238856, why: "FAB 產品定位副總裁 —— 規格翻譯成銷售話術（商品頁寫法）" },
    { id: 238854, why: "產品利益階梯副總裁 —— Means-End，成分→功能→情感" },
    { id: 238861, why: "PMF 產品驗證副總裁 —— 其他品項是不是根本沒有 PMF" },
    { id: 238845, why: "品類設計策略副總裁 —— Play Bigger，你在賣牛舌還是賣「懶得煮」" },
    { id: 238864, why: "Dunford 定位策略副總裁 —— Obviously Awesome，定位的正統" },
    { id: 238878, why: "Segmentation 策略副總裁 —— 分眾，不同品項給不同人" },
  ],
  // 第一輪：行銷職能族（食品/電商 繁中，經歷厚但專長欄位多為 cohort 複製）
  marketing: [
  { id: 222877, why: "產品行銷經理（PMM）—— 產品 GTM 本業" },
  { id: 222873, why: "定價策略師 —— 組合包／搭售／訂閱結構" },
  { id: 223399, why: "CRM Lifecycle —— 買過牛舌的人怎麼帶到第二品項" },
  { id: 223544, why: "廣告歸因分析師 —— 其他品項是沒流量還是沒轉換" },
  { id: 222681, why: "轉換漏斗優化師 —— 漏斗哪一段掉" },
  { id: 222934, why: "競品情報分析師 —— 別家的品項結構怎麼排" },
  { id: 222594, why: "UX 研究員 —— 商品頁與選購流程" },
  { id: 223930, why: "品牌策略師 —— 「懶得煮＝牛舌店」的定位風險" },
  { id: 223909, why: "再行銷策略師 —— 既有客戶的第二次購買" },
  { id: 222875, why: "RevOps 收入營運 —— 客單價與毛利結構" },
  ],
};

const QUESTIONS: Record<string, string> = {
  instagram: `中秋烤肉黃金組合（橫膈牛排＋厚切牛舌，早鳥 8 折）要在 Instagram 上推。Reels、輪播、限時動態，各自該負責什麼？\n\n請照這個順序回答，每段都要具體：\n1. 你的判斷：這一檔在 IG 上最該做對的一件事是什麼？（只講一件）\n2. 你會看哪三個數字來判斷有沒有做對？（講得出是哪個後台或報表的哪個欄位）\n3. 你會做的第一個動作——寫出第一支 Reels 前 3 秒的畫面與字幕，或第一則輪播的第一張文字。\n限 350 字以內，不要開場白，不要客套。產品名稱、產地、價格、日期一律照品牌資料，資料沒有的不要編。`,
  linkedin: `我們是賣冷凍即食料理的電商品牌。有人建議我用 LinkedIn 開發企業訂單（中秋禮盒、員工福利、尾牙團購）。\n\n請照這個順序回答，每段都要具體：\n1. 你的判斷：這值不值得做？（如果你認為不值得，直接說，並說為什麼）\n2. 你會看哪三個數字來判斷有沒有做對？（講得出是哪個後台或報表的哪個欄位）\n3. 你會做的第一個動作——如果做：寫出第一篇 LinkedIn 貼文的開頭三行，或第一個開發動作的具體做法。\n限 350 字以內，不要開場白，不要客套。產品名稱、產地、價格、日期一律照品牌資料，資料沒有的不要編。`,
  youtube: `我們目前沒有經營 YouTube。這個品牌適不適合開始做？\n\n請照這個順序回答，每段都要具體：\n1. 你的判斷：適不適合、如果做第一年該做哪一種影片？（只選一種）\n2. 你會看哪三個數字來判斷有沒有做對？（講得出是哪個後台或報表的哪個欄位）\n3. 你會做的第一個動作——寫出第一支影片的標題、縮圖上的字、以及開頭 15 秒的腳本。\n限 350 字以內，不要開場白，不要客套。產品名稱、產地、價格、日期一律照品牌資料，資料沒有的不要編。`,
  tiktok: `TikTok 在台灣的受眾跟我們（冷凍即食料理、宅配電商）對得上嗎？\n\n請照這個順序回答，每段都要具體：\n1. 你的判斷：要不要做？如果做，這個品牌在 TikTok 上應該是什麼樣子？\n2. 你會看哪三個數字來判斷有沒有做對？（講得出是哪個後台或報表的哪個欄位）\n3. 你會做的第一個動作——寫出第一支短影音前 3 秒的畫面與字幕，以及整支影片的結構（幾秒做什麼）。\n限 350 字以內，不要開場白，不要客套。產品名稱、產地、價格、日期一律照品牌資料，資料沒有的不要編。`,
  email: `中秋烤肉組合開賣了。我手上有買過的舊客 Email 名單，中秋前想寄電子報。\n\n請照這個順序回答，每段都要具體：\n1. 你的判斷：這封該寄給誰、不該寄給誰？（講得出分眾條件）\n2. 你會看哪三個數字來判斷有沒有做對？（講得出是哪個後台或報表的哪個欄位）\n3. 你會做的第一個動作——寫出這封電子報的主旨、預覽文字、內文開頭三行。\n限 350 字以內，不要開場白，不要客套。產品名稱、產地、價格、日期一律照品牌資料，資料沒有的不要編。`,
  pr: `中秋烤肉組合要不要發新聞稿？\n\n請照這個順序回答，每段都要具體：\n1. 你的判斷：值不值得發？如果發，媒體會買單的角度是什麼？（不是產品介紹）\n2. 你會看哪三個數字來判斷有沒有做對？（講得出是哪個後台或報表的哪個欄位）\n3. 你會做的第一個動作——寫出新聞稿標題、副標，以及第一段（導言）。\n限 350 字以內，不要開場白，不要客套。產品名稱、產地、價格、日期一律照品牌資料，資料沒有的不要編。`,
  x: `有人建議品牌經營 X（Twitter）或 Threads。對一個台灣的冷凍即食料理品牌來說——\n\n請照這個順序回答，每段都要具體：\n1. 你的判斷：該不該做？該選 X 還是 Threads？在上面該扮演什麼角色？\n2. 你會看哪三個數字來判斷有沒有做對？（講得出是哪個後台或報表的哪個欄位）\n3. 你會做的第一個動作——寫出第一週的第一則貼文（完整一則）。\n限 350 字以內，不要開場白，不要客套。產品名稱、產地、價格、日期一律照品牌資料，資料沒有的不要編。`,
  website: `官網上「中秋烤肉黃金組合」這一頁，流量有進來但下單的人很少。\n\n請照這個順序回答，每段都要具體：\n1. 你的判斷：你最先懷疑是哪一個環節出問題？（只講一個）\n2. 你會看哪三個數字來判斷有沒有做對？（講得出是哪個後台或報表的哪個欄位）\n3. 你會做的第一個動作——寫出這一頁第一屏要放的標題、副標與主按鈕文字，或你要改的第一件事的具體做法。\n限 350 字以內，不要開場白，不要客套。產品名稱、產地、價格、日期一律照品牌資料，資料沒有的不要編。`,
  facebook: `中秋前兩週，我要在 Facebook 上推「中秋烤肉黃金組合（橫膈牛排＋厚切牛舌，早鳥 8 折）」。粉專平常按讚留言都不多。接下來兩週，FB 上我該怎麼做才賣得動？

請照這個順序回答，每段都要具體：
1. 你的判斷：這兩週最關鍵的一件事是什麼？（只講一件）
2. 你會看哪三個數字來判斷有沒有做對？（講得出是 Meta 報表或粉專洞察的哪個欄位）
3. 你會做的第一個動作——如果是貼文，直接寫出第一篇的開頭三行；如果是廣告或其他動作，寫出具體設定。
限 350 字以內，不要開場白，不要客套。`,
};

const QUESTION = `我的商品裡只有「牛舌」賣得動，其他品項幾乎沒有人買。我該怎麼辦？

請照這個順序回答，每段都要具體：
1. 你的判斷：這到底是不是問題？（如果你認為不是問題，直接說，並說為什麼）
2. 你會先看哪三個數字才敢下判斷？（講得出是哪個報表的哪個欄位）
3. 你會建議的第一步是什麼？（一週內做得完的那種）
限 350 字以內，不要開場白，不要客套。`;

const FIELDS = [
  "id", "slug", "name", "name_zh", "title", "title_zh",
  "bio", "bio_zh", "experienceDetail", "specialty",
].join(", ");

async function loadAgent(id: number): Promise<any | null> {
  const [rows]: any = await localPool.execute(
    `SELECT ${FIELDS} FROM agents WHERE id = ? LIMIT 1`, [id],
  );
  return (rows as any[])[0] ?? null;
}

function personaPrompt(a: any, brandBlock: string): string {
  const name = a.name_zh || a.name;
  const title = a.title_zh || a.title;
  return [
    `你叫${name}，職稱是${title}。以第一人稱用這個身分回答，繁體中文，口語、直接、不要客套。`,
    a.specialty ? `你的專長：${a.specialty}` : "",
    a.experienceDetail ? `你的經歷：\n${a.experienceDetail}` : "",
    `只從你自己的專業角度回答——不是你的專長就說「這題要問誰」，不要硬答。`,
    `不要編客戶名字、數字、年份；經歷裡沒寫到的事不要當成自己做過。`,
    brandBlock ? `\n[品牌資料]\n${brandBlock}\n[/品牌資料]` : "",
  ].filter(Boolean).join("\n");
}

async function main() {
  const brandId = Number(process.argv[2] || 2972);   // 預設：懶得煮的Tom老闆
  // 2026-09-27：可以一次面試多組（逗號分隔），每組內 4 位同時答——8 組 70 多位
  // 一位一位跑要半小時以上，GitHub job 會逾時。
  const panelNames = String(process.argv[3] || "marketing").split(",").map((x) => x.trim()).filter(Boolean);
  for (const n of panelNames) {
    if (!PANELS[n]) {
      console.error(`沒有這組名單：${n}（可用：${Object.keys(PANELS).join(" / ")}）`);
      process.exit(1);
    }
  }
  const [brandRows]: any = await localPool.execute(
    `SELECT id, name, userId, industry FROM brands WHERE id = ? LIMIT 1`, [brandId],
  );
  const brand = (brandRows as any[])[0];
  if (!brand) { console.error(`brand ${brandId} not found`); process.exit(1); }

  console.log(`面試題目所用品牌：#${brand.id} ${brand.name}（${brand.industry ?? "未填產業"}）`);
  let brandBlock = "";
  try { brandBlock = (await buildBrandPrefix(brandId, null, null, "full")).trim(); } catch { /* 拿不到就空手面試 */ }
  try { brandBlock += `

${await buildBrandCatalogBlock(brandId, Number(brand.userId))}`; } catch { /* 同上 */ }
  console.log(`品牌資料長度：${brandBlock.length} 字`);

  for (const panelName of panelNames) {
    const candidates = PANELS[panelName]!;
    const question = QUESTIONS[panelName] ?? QUESTION;
    console.log(`
${"#".repeat(78)}
面試名單：${panelName}（${candidates.length} 位）`);
    console.log(`題目：
${question}`);
    console.log("=".repeat(78));
    const answers = await mapLimit(candidates, 4, (c) => interviewOne(c, question, brandBlock));
    for (const a of answers) console.log(a);
  }

  await localPool.end();
  process.exit(0);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]!); }
  }));
  return out;
}

/** 面試一位，回一整段要印的文字（併發時各自組好再依序印，才不會交錯）。 */
async function interviewOne(c: { id: number; why: string }, question: string, brandBlock: string): Promise<string> {
  const a = await loadAgent(c.id);
  if (!a) return `
#${c.id} —— 這個 agent 不在 mos_db 裡了，跳過`;
  const name = a.name_zh || a.name;
  const title = a.title_zh || a.title;
  const head = [`
── #${a.id} ${name}｜${title} ──`, `   入選理由：${c.why}`];
  const t0 = Date.now();
  try {
    const r = await callModel(
      [
        { role: "system" as const, content: personaPrompt(a, brandBlock) },
        { role: "user" as const, content: question },
      ],
      "general",
    );
    const text = String(r?.content ?? "").trim();
    return [...head, `   （${((Date.now() - t0) / 1000).toFixed(1)}s，${text.length} 字）`,
      text.split(String.fromCharCode(10)).map((l) => `   ${l}`).join(String.fromCharCode(10))].join(String.fromCharCode(10));
  } catch (e: any) {
    return [...head, `   ✗ 這位答不出來（LLM 呼叫失敗）：${String(e?.message ?? e).slice(0, 160)}`].join(String.fromCharCode(10));
  }
}

main().catch((e) => { console.error("interview failed:", e); process.exit(1); });
