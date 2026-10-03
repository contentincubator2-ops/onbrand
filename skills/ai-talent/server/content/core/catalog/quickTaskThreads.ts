/**
 * quickTaskThreads — Threads（th-）任務卡目錄。
 *
 * 2026-09-29 CJ「要為了台灣市場加入 LINE 和 Threads」。在這之前 Threads 只有品牌自建卡；
 * 這一批是第一批全域卡，全部是爆款結構：台灣品牌 2026-08～09 在 Threads 上真的傳開的
 * 回覆與貼文，數字都對照過參考文章（source.url），弱點寫在 source.caveat。
 *
 * 前台只列近 3 個月的爆款卡（sourceVocabulary.isRecentViral），月份滑出去就自動下架，
 * 所以這批卡每月要換。
 *
 * outputDefaults.platform = "threads"：mockup 走 threads:post（RunPage 由 th- 前綴決定）。
 * images 全部 0 —— Threads 的爆款幾乎都是純文字回覆，先把文字這條做對。
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

/** 所有 th- 卡共用的平台底線。接在每張卡 systemPrompt 的最後。 */
const TH_RULES = `

【Threads 平台鐵則】
- 單則 500 字元內；回覆越短越好，爆紅的回覆大多一兩句。
- 語氣像一個真人小編，不是官方公告；可以有梗、有情緒，但不能酸人、不能踩別的品牌。
- 不要放連結、不要推銷、不要 hashtag 堆疊（最多 1 個）。
- 語言、語氣與在地用語一律依照品牌設定的市場與輸出語言。
- 沒有把握的事實不要寫；需要品牌補的資訊用【待補：xxx】標記。`;

export const TH_30S_TASKS: FBTaskTemplate[] = [
  {
    id: "th-30-reply-mock-statement",
    tier: "30s",
    postType: "post",
    label: { en: "Reply: The Mock Official Statement", zh: "Threads 回覆：假聲明稿" },
    description: { en: "Answer a joke complaint with a formal statement starring your product", zh: "把網友的玩笑客訴，寫成一份正式的企業聲明" },
    agent_id: 60022, // 沿用 Threads 改寫現役 agent
    skill_slug: "threads-copywriter",
    source: {
      type: "viral",
      short: "錢都 蛤蜊「道歉聲明」",
      metric: "官方回覆逾 16 萬讚（原 PO 貼文超過 21 萬讚）",
      asOf: "2026-08",
      url: "https://udn.com/news/story/120912/9685999",
      takeaway:
        "網友開玩笑客訴「我的蛤蜊在偷吃我的培根牛」，品牌用正式聲明稿的格式回：「錢都在此代表蛤蜊，向同事培根牛鄭重致歉」——把產品寫成犯錯的員工。",
    },
    primary_question: "網友開了你們產品什麼玩笑？（原句照貼）",
    primary_input: { key: "topic", placeholder: "例：「你們的珍珠是不是在罷工，一杯只有五顆」", type: "textarea" },
    inputs: [
      { key: "topic", label: "網友的玩笑客訴原句", type: "textarea", required: true },
    ],
    systemPrompt: `你要幫品牌在 Threads 上回覆一則網友的玩笑客訴，用「假聲明稿」的格式。

結構：
1. 標題感的開頭：「【○○聲明】」或「本公司在此代表＿＿」。
2. 把產品（或食材、零件）寫成一位員工，犯了網友說的錯。
3. 鄭重致歉的口吻，但內容荒謬（「已約談當事蛤蜊」「將加強職場倫理教育」）。
4. 最後一句內部處分或改善承諾，要荒謬但具體。

產出 3 個版本（每則 40–120 字）。
另外給一句判斷：這則客訴如果其實是真的品質問題（例如衛生、安全），就不要用玩笑回，改寫一版正經道歉。${TH_RULES}`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "threads", post_type: "post" },
  },
  {
    id: "th-30-reply-one-word-magic",
    tier: "30s",
    postType: "post",
    label: { en: "Reply: Play Coy in One Word", zh: "Threads 回覆：裝神秘一字神回" },
    description: { en: "When users marvel at how it works, don't explain", zh: "網友驚嘆「這怎麼做到的」，不解釋、只回一兩個字" },
    agent_id: 60022,
    skill_slug: "threads-copywriter",
    source: {
      type: "viral",
      short: "UNIQLO 自助結帳「Magic～」",
      metric: "官方回覆 14 萬人按愛心",
      asOf: "2026-08",
      url: "https://www.ettoday.net/news/20260814/3219305.htm",
      takeaway:
        "網友問自助結帳機怎麼一秒認出整籃衣服，UNIQLO 只回「Magic～」——不解釋保住了神奇感，懂的網友自己在留言區補答案。",
    },
    primary_question: "你們有什麼讓顧客驚嘆「這怎麼做到的」的地方？",
    primary_input: { key: "topic", placeholder: "例：外送 15 分鐘就到 / 蛋糕切面每一層都一樣厚", type: "textarea" },
    inputs: [
      { key: "topic", label: "讓人驚嘆的地方 + 真正的原理（給你參考，不會寫出來）", type: "textarea", required: true },
    ],
    systemPrompt: `你要幫品牌在 Threads 上回覆「這怎麼做到的？」這類提問，用「裝神秘」的一字神回。

產出：
1. 5 個回覆候選，每個 1–6 個字（例：「Magic～」「秘密」「是愛」），附一句說明它為什麼好笑。
2. 選 1 個最推薦的，說明理由。
3. 備用的第二則（30–60 字）：如果留言區有人猜對了原理，品牌可以怎麼「半承認」接梗。

硬規則：
- 不要真的把原理寫出來。
- 如果提問其實是在抱怨（例如「為什麼每次都缺貨」），不要用這張卡。${TH_RULES}`,
    preferredModel: "qwen",
    maxTokens: 400,
    outputDefaults: { platform: "threads", post_type: "post" },
  },
  {
    id: "th-30-post-self-deprecating-ask",
    tier: "30s",
    postType: "post",
    label: { en: "Post: Ask Why They Don't Come", zh: "Threads 貼文：自嘲求問" },
    description: { en: "Ask your audience, half-joking, what's wrong — and be ready", zh: "半開玩笑問大家「為什麼不來」，並先準備好接批評" },
    agent_id: 60022,
    skill_slug: "threads-copywriter",
    source: {
      type: "viral",
      short: "松屋「為什麼大家都不來吃松屋呢？」",
      metric: "近 7 千讚、1,700 多則留言",
      asOf: "2026-08",
      caveat: "湧入大量負評；要先準備好接批評，報導未見後續回應",
      url: "https://udn.com/news/story/120911/9677151",
      takeaway:
        "品牌自己示弱、半開玩笑地問「為什麼大家都不來？我們真的比較貴嗎」，留言量爆發——但進來的多是真實批評，所以這張卡的重點是事後怎麼接。",
    },
    primary_question: "你們最想知道顧客「為什麼不來／不買」的是哪件事？",
    primary_input: { key: "topic", placeholder: "例：為什麼大家平日晚上都不來 / 我們的便當真的比較貴嗎", type: "textarea" },
    inputs: [
      { key: "topic", label: "想問顧客的一件事", type: "textarea", required: true },
    ],
    systemPrompt: `你要幫品牌在 Threads 上發一則「自嘲求問」，並準備好接住批評。

產出：
1. 主貼文 3 個版本（每則 20–80 字）：示弱、半開玩笑、帶一個表情符號，問一個具體的問題。
2. 預判留言區最可能出現的 3 種批評，每種寫一則品牌回覆（40 字內）：承認、不辯解、說出會怎麼做。
3. 48 小時內的「我們聽到了」後續貼文（80–150 字）：列出收到的前 3 名意見，以及各自的處理（已改／會改／暫時不會改＋原因）。

硬規則：
- 只有在品牌真的準備改善時才用這張卡；主貼文前面加一句給用戶的提醒。
- 不要刪負評、不要跟網友吵。${TH_RULES}`,
    preferredModel: "qwen",
    maxTokens: 800,
    outputDefaults: { platform: "threads", post_type: "post" },
  },
  {
    id: "th-30-reply-verse",
    tier: "30s",
    postType: "post",
    label: { en: "Reply: Turn Their Numbers Into Verse", zh: "Threads 回覆：文青詩體回覆" },
    description: { en: "Rewrite the user's own comparison as a three-line verse", zh: "把網友自己說的數字對比，改寫成三句排比詩" },
    agent_id: 60022,
    skill_slug: "threads-copywriter",
    source: {
      type: "viral",
      short: "台鐵 三句詩回覆（被火車誤點的徐志摩）",
      metric: "3.8 萬讚",
      asOf: "2026-08",
      caveat: "只有一家媒體報數字",
      url: "https://tw.news.yahoo.com/%E5%8F%B0%E9%90%B5%E5%B0%8F%E7%B7%A83%E5%8F%A5%E7%A5%9E%E5%9B%9E%E8%A6%86-%E7%B6%B2%E8%AE%9A-%E8%A2%AB%E7%81%AB%E8%BB%8A%E8%AA%A4%E9%BB%9E%E7%9A%84%E5%BE%90%E5%BF%97%E6%91%A9-104301949.html",
      takeaway:
        "網友說「騎車 40 分鐘、坐火車只要 4 分鐘」，台鐵用他自己的數字寫成三句排比詩，把產品的好處（快、能休息）藏在中間那句，網友封小編「被火車誤點的徐志摩」。",
    },
    primary_question: "網友貼文裡有什麼跟你們有關的數字對比？（原句照貼）",
    primary_input: { key: "topic", placeholder: "例：「自己煮要 1 小時，叫你們外送 20 分鐘就到」", type: "textarea" },
    inputs: [
      { key: "topic", label: "網友的原句（含數字對比）", type: "textarea", required: true },
    ],
    systemPrompt: `你要幫品牌在 Threads 上用「三句排比詩」回覆一則網友貼文。

規則：
1. 一定要用網友原句裡的數字，不要換成別的。
2. 三句排比：每句同樣的句型（動詞＋數字＋意象），第一句講網友原本的辛苦，第二句講用了品牌之後，第三句把差距昇華成一個感受。
3. 產品的好處只能藏在第二句，不能直接說「選我們」。
4. 每句 10–20 字，整則 60 字內。

產出 3 個版本，另附一句判斷：這則貼文如果是在抱怨品牌，就不要用詩回。${TH_RULES}`,
    preferredModel: "qwen",
    maxTokens: 400,
    outputDefaults: { platform: "threads", post_type: "post" },
  },
  {
    id: "th-30-reply-celebrity-pile-on",
    tier: "30s",
    postType: "post",
    label: { en: "Reply: Join the Celebrity Pile-On", zh: "Threads 回覆：名人點名品類時搶先接龍" },
    description: { en: "When a celebrity names your category, reply fast in a fan's voice", zh: "名人發文提到你的品類，用粉絲口吻搶先回覆" },
    agent_id: 60022,
    skill_slug: "threads-copywriter",
    source: {
      type: "viral",
      short: "始源 × 農業部／各地農會搶人",
      metric: "始源貼文 1 天 14 萬讚，各地農會小編接龍搶合作",
      asOf: "2026-09",
      caveat: "數字是始源的貼文，不是品牌回覆的",
      url: "https://www.nownews.com/news/6873419",
      takeaway:
        "始源貼了台灣水果，農業部回「收到哩，我來去問問老闆」、梧棲農會拿應援棒拍影片——名人點名整個品類時，第一個用粉絲口吻回的品牌吃到最多流量，後面的接龍又把聲量推得更遠。",
    },
    primary_question: "最近哪位名人或 KOL 發文提到你們的品類？他說了什麼？",
    primary_input: { key: "topic", placeholder: "例：某韓星說很想吃台灣的鳳梨酥 / 某 YouTuber 說找不到好喝的豆漿", type: "textarea" },
    inputs: [
      { key: "topic", label: "名人是誰 + 他說了什麼", type: "textarea", required: true },
    ],
    systemPrompt: `你要幫品牌在名人的 Threads 貼文底下搶先回覆，用粉絲口吻。

產出：
1. 第一則回覆 3 個版本（每則 15–50 字）：粉絲口吻、帶一個跟品類有關的具體道具或承諾（「我們準備好了一箱」「私訊你了」）。
2. 邀請同業或在地單位一起接龍的第二則（30 字內），點名方式要友善。
3. 如果名人回覆了，品牌的第三則要怎麼接（30 字內）。

硬規則：
- 不要冒充名人的合作方；沒有談好的合作，不能說「已經合作」。
- 不要在名人的負面新聞或私事貼文底下用這招。${TH_RULES}`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "threads", post_type: "post" },
  },
  {
    id: "th-30-reply-personified-apology-deal",
    tier: "30s",
    postType: "post",
    label: { en: "Reply: Personified Apology → Island-Wide Deal", zh: "Threads 回覆：擬人化道歉＋全台優惠" },
    description: { en: "Give the product a personality, fix it privately, then turn it into a deal", zh: "道歉時讓產品有個性，私下補救，再把事件變成限時優惠" },
    agent_id: 60022,
    skill_slug: "threads-copywriter",
    source: {
      type: "viral",
      short: "達美樂「美乃滋很有自己的想法」",
      metric: "客訴貼文近萬讚、近百萬人觀看",
      asOf: "2026-08",
      caveat: "數字是客訴貼文的，不是品牌回覆的",
      url: "https://tw.news.yahoo.com/%E6%8A%AB%E8%96%A9%E7%BE%8E%E4%B9%83%E6%BB%8B%E8%AE%8A-%E8%B6%85%E5%A4%A7s%E5%9E%8B-%E9%81%94%E7%BE%8E%E6%A8%82%E9%81%93%E6%AD%89%E5%8A%A0%E7%A2%BC%E5%85%A8%E5%8F%B0%E5%84%AA%E6%83%A0%E7%B6%B2%E5%A4%A7%E8%AE%9A-065942063.html",
      takeaway:
        "網友貼出美乃滋擠成巨大 S 的披薩，達美樂回「這個美乃滋很有自己的想法…」，私訊補一個新披薩，再推出以事件命名的全台限時優惠碼——客訴變成全民話題。",
    },
    primary_question: "網友抱怨了什麼？（原句照貼）你們能給什麼補償和限時優惠？",
    primary_input: { key: "topic", placeholder: "例：「奶茶的珍珠全部黏在一起」/ 補一杯新的＋全台第二杯 5 折到週日", type: "textarea" },
    inputs: [
      { key: "topic", label: "客訴原句 + 補償 + 可以給的限時優惠", type: "textarea", required: true },
    ],
    systemPrompt: `你要幫品牌在 Threads 上回覆一則客訴，把它變成一次全民話題。

產出：
1. 公開回覆（20–60 字）×3 版：先道歉，再把出錯的產品擬人化（「這杯珍珠今天比較黏人」），最後說「私訊你了」。
2. 私訊補救文案（60 字內）：具體補償，不要推託。
3. 全台限時優惠貼文（80–150 字）：用事件命名的優惠碼（例：「黏人珍珠」），寫清楚內容、期限（日期）、使用方式。
4. 判斷：如果客訴涉及食安、受傷或衛生，不要擬人化、不要做優惠，改寫一版正經道歉。

硬規則：
- 優惠內容只能用用戶給的，沒給就寫【待補】。
- 不要嘲笑客訴的人。${TH_RULES}`,
    preferredModel: "qwen",
    maxTokens: 700,
    outputDefaults: { platform: "threads", post_type: "post" },
  },
  {
    id: "th-30-post-reverse-seasonal",
    tier: "30s",
    postType: "post",
    label: { en: "Post: The Seasonal 'Not This Year'", zh: "Threads 貼文：反向節慶公告（今年不賣）" },
    description: { en: "Skip the seasonal product and point demand to a cause", zh: "大家以為你會出的節慶商品，今年不出，把需求導給更需要的地方" },
    agent_id: 60022,
    skill_slug: "threads-copywriter",
    source: {
      type: "viral",
      short: "Danyaoshi 今年不出中秋禮盒",
      metric: "超過 2.6 萬讚",
      asOf: "2026-08",
      caveat: "搭上政治爭議（庇護工場禮盒預算），多數品牌不宜照搬理由",
      url: "https://www.ettoday.net/news/20260826/3225941.htm",
      takeaway:
        "大家預期會出的中秋禮盒，品牌宣布今年不做，並請大家改買庇護工場的——放棄一次節慶生意，換到的好感比賣掉禮盒還多。",
    },
    primary_question: "大家以為你們今年一定會出的節慶商品是什麼？你想把需求導到哪裡？",
    primary_input: { key: "topic", placeholder: "例：年節禮盒 / 請大家改買附近小農或社福單位的", type: "textarea" },
    inputs: [
      { key: "topic", label: "今年不出的節慶商品 + 想導去的地方", type: "textarea", required: true },
    ],
    systemPrompt: `你要幫品牌在 Threads 上發一則「反向節慶公告」：今年不賣大家以為會賣的節慶商品。

結構（80–200 字）：
1. 第一句：「今年我們不做＿＿了。」
2. 一個清楚、具體的理由（一句話）。理由要是品牌真的相信的，不要蹭爭議。
3. 請大家改去哪裡買：給明確的去處（名稱、地點或列表），品牌自己不抽成。
4. 收尾：「明年再見」或下一檔預告，保住期待。

另外寫一則置頂留言（40 字內），整理推薦去處的清單。

硬規則：
- 不批評特定政黨、政治人物或其他品牌。
- 推薦的去處要真實存在，不確定就寫【待補】。${TH_RULES}`,
    preferredModel: "qwen",
    maxTokens: 600,
    outputDefaults: { platform: "threads", post_type: "post" },
  },
];

/** Threads 回覆短、便宜，一律 3 個 variant；純文字，不產圖。 */
const cfg = (labels: string[], min: number, max: number): OrchestraConfig => ({
  variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
  aspectRatio: null, variantLabels: labels, captionMinChars: min, captionMaxChars: max,
});

export const TH_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "th-30-reply-mock-statement":           cfg(["正式聲明版", "內部處分版", "公關部長版"], 40, 120),
  "th-30-reply-one-word-magic":           cfg(["一字版", "兩字版", "表情符號版"], 1, 60),
  "th-30-post-self-deprecating-ask":      cfg(["示弱版", "撒嬌版", "認真問版"], 20, 150),
  "th-30-reply-verse":                    cfg(["排比版", "新詩版", "對聯版"], 20, 60),
  "th-30-reply-celebrity-pile-on":        cfg(["粉絲版", "官方版", "接龍版"], 15, 50),
  "th-30-reply-personified-apology-deal": cfg(["擬人版", "自嘲版", "正經版"], 20, 150),
  "th-30-post-reverse-seasonal":          cfg(["公益版", "惜福版", "品質版"], 80, 200),
};

export function getThreadsOrchestraConfig(taskId: string): OrchestraConfig | null {
  return TH_30S_ORCHESTRA[taskId] ?? null;
}
