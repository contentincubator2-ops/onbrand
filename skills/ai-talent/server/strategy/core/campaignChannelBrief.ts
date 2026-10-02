/**
 * campaignChannelBrief — 活動裡每個通路的「任務說明單」（網紅那張另見 campaignKolBrief.ts）。
 *
 * 2026-10-02（CJ「按照目前策略層活動裡面網紅 Brief 表單的設計，其他平台，你會如何設計
 * 打開後的 Brief 表單？」→ 確認：LINE 要收每月可發則數；異業合作不跟網紅共用，因為
 * 「會因為異業合作對象的不同，而有不同的方案」）。
 *
 * ── 跟網紅說明單一樣的三層 ─────────────────────────────────────────
 *   1. 上面一份清單：每一列是企劃裡的一個對象（FB 發在哪、LINE 哪一波推給誰、電子報哪個
 *      分眾、異業哪一位夥伴…），角度照那一列寫。
 *   2. 下面幾組欄位：全部選填，placeholder 是寫法示範。
 *   3. 寫的時候讀得到：寫這個通路的那幾篇，整張說明單接在寫手的說明後面（campaignItemBrief）；
 *      排企劃時也帶進去（buildCampaignPlan），角度照清單排。
 *
 * ── 跟網紅不一樣的地方 ─────────────────────────────────────────────
 *   · 自有通路（FB／IG／Threads／LINE／TikTok／電子報／官網）是「對內執行單」：給寫手跟小編，
 *     沒有合作條款，換成「平台規則」（rules，系統帶入、使用者不用填，寫手一定讀得到）。
 *     核心訊息、受眾、上線期間這些活動層的東西不在這裡重填——畫面上顯示「沿用活動」，
 *     複製一份到 7 張說明單只會讓它們跟活動對不上。
 *   · 異業合作是「對外需求單」：每一位夥伴先選對象類型（互補品牌／通路店家／媒體／企業福委／
 *     公益機構），再選該類型的合作方案；下面除了共用的四組，還會出現名單上有的類型各自的
 *     那一組（例：通路店家要談陳列與供貨，媒體要談版位與審稿權）。
 *   · 不收預算（2026-10-01 CJ）。LINE 的「每月可發則數」例外：那是使用者自己的方案額度，
 *     不是 AI 估的價格，而且它直接決定能排幾波推播。
 *
 * 規格（標籤、提示、選項）只寫在這裡，畫面透過 campaign.briefSpecs 讀，不在 client 再抄一份。
 * 存在 events.positioning.channelBriefs[通路]（跟活動設定分開：改說明單不讓企劃變成「設定已改」）。
 */

export type BriefChannel = "facebook" | "instagram" | "threads" | "line" | "tiktok" | "email" | "website" | "cobrand";
export const BRIEF_CHANNELS: readonly BriefChannel[] = ["facebook", "instagram", "threads", "line", "tiktok", "email", "website", "cobrand"];
export const COBRAND = "cobrand";

export interface BriefOption { id: string; zh: string; en: string }
/** 平台規則（2026-10-02 CJ：補英文，用最簡潔的英文）。寫手讀中文。 */
export interface BriefRule { zh: string; en: string }
export interface BriefField {
  key: string; zh: string; en: string; ph: string;
  long?: boolean;
  /** 有選項就是下拉選單。 */
  options?: BriefOption[];
  /** 選項依同一列的另一個欄位而定（異業合作：方案依對象類型）。 */
  optionsBy?: { field: string; map: Record<string, BriefOption[]> };
}
export interface BriefGroup {
  zh: string; en: string; fields: BriefField[];
  /** 只有清單裡出現這個類型時才顯示（異業合作的類型專屬那一組）。 */
  whenType?: string;
  /** 這一組附帶的平台／法規提醒。 */
  rules?: BriefRule[];
}
export interface ChannelBriefSpec {
  channel: BriefChannel;
  zh: string; en: string;
  /** 視窗標題下那一句：給誰看、填了會變什麼。 */
  introZh: string; introEn: string;
  audience: "internal" | "external";
  rows: { zh: string; en: string; hintZh: string; hintEn: string; fields: BriefField[]; max: number; addZh: string; addEn: string };
  groups: BriefGroup[];
  /** 平台規則：系統帶入、寫手一定讀得到。 */
  rules: BriefRule[];
}

export interface ChannelBrief {
  rows?: Array<Record<string, string>>;
  values?: Record<string, string>;
}

const o = (id: string, zh: string, en: string): BriefOption => ({ id, zh, en });
const r = (zh: string, en: string): BriefRule => ({ zh, en });
const ANGLE: BriefField = { key: "angle", zh: "這裡要講的角度", en: "Angle", ph: "例：上班族下班後 10 分鐘的用法" };

/** 異業合作的對象類型 → 可以談的方案。 */
export const COBRAND_PARTNER_TYPES: BriefOption[] = [
  o("brand", "互補品牌", "Complementary brand"),
  o("retail", "通路／店家", "Retailer / store"),
  o("media", "媒體／社群", "Media / community"),
  o("corporate", "企業／福委", "Corporate / HR"),
  o("org", "公益／協會／學校", "Non-profit / school"),
];
export const COBRAND_SCHEMES: Record<string, BriefOption[]> = {
  brand: [o("cross", "互相曝光", "Cross-promotion"), o("coproduct", "聯名商品", "Co-branded product"), o("bundle", "組合販售", "Bundle"), o("gift", "共同贈品", "Joint gift"), o("listswap", "交換名單", "List swap")],
  retail: [o("display", "店內陳列", "In-store display"), o("popup", "快閃櫃", "Pop-up"), o("exclusive", "通路獨家組合", "Retail-exclusive bundle"), o("points", "會員點數加碼", "Loyalty points")],
  media: [o("feature", "置入報導", "Sponsored feature"), o("series", "共同專題企劃", "Co-produced series"), o("giveaway", "讀者抽獎", "Reader giveaway"), o("social", "社群互推", "Social cross-post")],
  corporate: [o("perk", "員工福利價", "Employee perk"), o("groupbuy", "企業團購", "Group buy"), o("gifting", "企業贈禮", "Corporate gifting")],
  org: [o("donation", "公益捐贈", "Cause donation"), o("talk", "講座／課程合作", "Talk / workshop"), o("advocacy", "共同倡議", "Joint advocacy")],
};

export const CHANNEL_BRIEF_SPECS: Record<BriefChannel, ChannelBriefSpec> = {
  facebook: {
    channel: "facebook", zh: "Facebook 任務說明單", en: "Facebook brief", audience: "internal",
    introZh: "給寫手和小編的執行單。發在哪、怎麼互動、要不要投廣告寫清楚，每一篇才不會寫成同一種。",
    introEn: "For the writers. Where it goes, how people engage, whether it's boosted.",
    rows: {
      zh: "要發在哪", en: "Where it goes", max: 6, addZh: "再加一處", addEn: "Add another",
      hintZh: "粉專、社團、廣告各一列；社團寫名稱。每一列在企劃裡會照它的角度排。",
      hintEn: "One row per page, group or ad set.",
      fields: [
        { key: "surface", zh: "位置", en: "Surface", ph: "", options: [o("page", "粉專貼文", "Page post"), o("group", "社團", "Group"), o("ads", "廣告", "Ads"), o("live", "直播", "Live")] },
        { key: "target", zh: "社團或廣告受眾", en: "Group / audience", ph: "例：台北親子共學團；30 天內互動過的人" },
        ANGLE,
      ],
    },
    groups: [{
      zh: "怎麼發", en: "How",
      fields: [
        { key: "formatMix", zh: "形式比例", en: "Format mix", ph: "例：圖文 2、輪播 1、短影音 1" },
        { key: "adPlan", zh: "廣告投放", en: "Ads", ph: "例：開賣日起投 7 天，投給互動過的人＋類似受眾" },
        { key: "engagement", zh: "互動機制", en: "Engagement", ph: "例：留言回答「你最想帶誰去」抽 3 位", long: true },
        { key: "linkPlacement", zh: "連結放法", en: "Links", ph: "例：連結放第一則留言，內文寫「連結在留言」" },
      ],
    }],
    rules: [
      r("抽獎不得要求「分享」或「標記朋友」才能參加（Facebook 規範）。", "Giveaways can't require sharing or tagging friends."),
      r("業配或合作內容要標示「廣告」或「合作」（公平交易委員會）。", "Label sponsored posts as ads."),
    ],
  },
  instagram: {
    channel: "instagram", zh: "Instagram 任務說明單", en: "Instagram brief", audience: "internal",
    introZh: "給寫手和小編的執行單。每種形式寫一列，視覺和 hashtag 先定好，整檔看起來才是同一個活動。",
    introEn: "For the writers. One row per format; set the look and hashtags once.",
    rows: {
      zh: "要發的形式", en: "Formats", max: 6, addZh: "再加一種", addEn: "Add another",
      hintZh: "Reels、輪播、限動、直播各一列，寫數量和角度。",
      hintEn: "One row per format with count and angle.",
      fields: [
        { key: "format", zh: "形式", en: "Format", ph: "", options: [o("reels", "Reels", "Reels"), o("carousel", "輪播", "Carousel"), o("single", "單圖", "Single image"), o("story", "限時動態", "Story"), o("live", "直播", "Live")] },
        { key: "count", zh: "數量", en: "Count", ph: "例：3 支" },
        ANGLE,
      ],
    },
    groups: [{
      zh: "怎麼發", en: "How",
      fields: [
        { key: "visualTone", zh: "視覺調性", en: "Look", ph: "例：自然光、米白底、不用濾鏡" },
        { key: "hashtags", zh: "固定 hashtag", en: "Hashtags", ph: "例：#品牌名 #活動名（每篇都帶）" },
        { key: "storyLink", zh: "限動連結", en: "Story links", ph: "例：每則限動都放連結貼紙，導到活動頁" },
        { key: "collab", zh: "協作貼文", en: "Collab posts", ph: "例：跟合作網紅發協作貼文，雙方帳號同時出現" },
        { key: "pinned", zh: "置頂", en: "Pinned", ph: "例：開賣公告置頂到活動結束" },
      ],
    }],
    rules: [
      r("貼文內文的連結點不了；要帶連結用限動連結貼紙或個人檔案連結。", "Caption links don't work; use story links or the bio link."),
      r("跟網紅的協作或業配貼文要開「品牌合作」標示。", "Turn on the paid partnership label for creator posts."),
    ],
  },
  threads: {
    channel: "threads", zh: "Threads 任務說明單", en: "Threads brief", audience: "internal",
    introZh: "給寫手的執行單。Threads 靠話題，不靠公告——每一列是一串想引出的討論。",
    introEn: "For the writers. Threads runs on conversation — one row per thread.",
    rows: {
      zh: "要開的話題", en: "Threads", max: 6, addZh: "再加一串", addEn: "Add another",
      hintZh: "一列一串：丟出什麼觀點、想讓大家回什麼。",
      hintEn: "One row per thread: the take, and what you want people to reply.",
      fields: [
        { key: "topic", zh: "話題", en: "Topic", ph: "例：你上一次為了品牌熬夜是什麼時候" },
        { key: "angle", zh: "想引出的討論", en: "Reply prompt", ph: "例：請大家分享最崩潰的一次上線" },
      ],
    },
    groups: [{
      zh: "怎麼發", en: "How",
      fields: [
        { key: "voice", zh: "口吻", en: "Voice", ph: "例：小編個人口吻，可以自嘲，不用官方腔" },
        { key: "replyPlan", zh: "回覆策略", en: "Replies", ph: "例：前 2 小時每則留言都回，回不完的挑有故事的回" },
        { key: "linkPlacement", zh: "連結放法", en: "Links", ph: "例：主文不放連結，第二則串文才放" },
        { key: "cadence", zh: "發文密度", en: "Cadence", ph: "例：活動期間每天 1 串" },
      ],
    }],
    rules: [r("Threads 不適合硬廣：一串一個觀點，優惠放在最後一句或串文裡。", "No hard sell: one idea per thread, offer last.")],
  },
  line: {
    channel: "line", zh: "LINE 任務說明單", en: "LINE brief", audience: "internal",
    introZh: "給寫手的推播規劃。每一波推給誰寫清楚，訊息才對得準那群人，也不會推到被封鎖。",
    introEn: "For the writers. Who each push goes to, so it lands and doesn't get blocked.",
    rows: {
      zh: "推播波次", en: "Pushes", max: 6, addZh: "再加一波", addEn: "Add another",
      hintZh: "一波一列：推給哪個分眾標籤、用什麼訊息形式。",
      hintEn: "One row per push: segment and message format.",
      fields: [
        { key: "wave", zh: "哪一波", en: "Push", ph: "例：開賣當天" },
        { key: "segment", zh: "推給誰（分眾標籤）", en: "Segment", ph: "例：買過的老客；全體好友" },
        { key: "format", zh: "訊息形式", en: "Format", ph: "", options: [o("imagemap", "圖文訊息", "Rich message"), o("carousel", "多頁卡片", "Card carousel"), o("video", "影片", "Video"), o("text", "純文字", "Text")] },
        ANGLE,
      ],
    },
    groups: [{
      zh: "額度與設定", en: "Quota & setup",
      fields: [
        { key: "quota", zh: "每月可發則數", en: "Monthly message quota", ph: "例：方案每月 6,000 則、好友 2,000 人→這檔全體最多推 2 次" },
        { key: "richMenu", zh: "圖文選單", en: "Rich menu", ph: "例：活動期間換成活動版，第一格導到活動頁" },
        { key: "coupon", zh: "優惠券／集點", en: "Coupons / points", ph: "例：LINE 好友專屬 9 折券，限用一次" },
        { key: "sendTime", zh: "發送時段", en: "Send time", ph: "例：平日晚上 8 點；週末早上 10 點" },
      ],
    }],
    rules: [
      r("推播則數＝每次發送人數加總，超過方案額度要另外付費。", "Messages = recipients per send, summed. Over quota costs extra."),
      r("同一檔活動全體推播建議不超過 3 次，推太多會被封鎖；能分眾就分眾。", "Max 3 broadcasts per campaign or people block you. Segment when possible."),
    ],
  },
  tiktok: {
    channel: "tiktok", zh: "TikTok 任務說明單", en: "TikTok brief", audience: "internal",
    introZh: "給寫腳本的執行單。每一列是一種腳本，誰出鏡、多長先講好，腳本才拍得出來。",
    introEn: "For the script writer. One row per script type; who's on camera, how long.",
    rows: {
      zh: "要拍的腳本", en: "Scripts", max: 6, addZh: "再加一支", addEn: "Add another",
      hintZh: "一列一種腳本類型，寫想拍的角度。",
      hintEn: "One row per script type.",
      fields: [
        { key: "scriptType", zh: "腳本類型", en: "Type", ph: "", options: [o("unbox", "開箱", "Unboxing"), o("skit", "情境劇", "Skit"), o("dayinlife", "員工日常", "Day in the life"), o("howto", "教學", "How-to"), o("challenge", "挑戰／跟風", "Trend / challenge"), o("talk", "口播", "Talking head")] },
        ANGLE,
      ],
    },
    groups: [{
      zh: "怎麼拍", en: "How",
      fields: [
        { key: "onCamera", zh: "誰出鏡", en: "On camera", ph: "例：老闆本人；或不露臉只拍手" },
        { key: "length", zh: "長度", en: "Length", ph: "例：15–30 秒" },
        { key: "trend", zh: "趨勢音樂或梗", en: "Trend / sound", ph: "例：跟最近的「一天之內」格式" },
        { key: "sparkAds", zh: "加熱", en: "Spark Ads", ph: "例：表現最好的一支用 Spark Ads 加熱 5 天" },
      ],
    }],
    rules: [
      r("找創作者拍的影片要開「品牌合作內容」標示。", "Turn on the branded content label for creator videos."),
      r("商業帳號只能用商用音樂庫的音樂，熱門歌不一定能用。", "Business accounts can only use commercial music."),
    ],
  },
  email: {
    channel: "email", zh: "電子報任務說明單", en: "Email brief", audience: "internal",
    introZh: "給寫手的寄送規劃。每個分眾一列，新訂閱和老客看到的不該是同一封。",
    introEn: "For the writers. One row per segment — new subscribers and past buyers get different emails.",
    rows: {
      zh: "名單分眾", en: "Segments", max: 6, addZh: "再加一群", addEn: "Add another",
      hintZh: "一群一列：誰、什麼時候寄、想講什麼。",
      hintEn: "One row per segment: who, when, what.",
      fields: [
        { key: "segment", zh: "分眾", en: "Segment", ph: "例：近 90 天沒開信的沉睡客" },
        { key: "when", zh: "寄送時機", en: "When", ph: "例：預告、開賣、倒數各一封" },
        ANGLE,
      ],
    },
    groups: [{
      zh: "怎麼寄", en: "How",
      fields: [
        { key: "sender", zh: "寄件者名稱", en: "Sender name", ph: "例：品牌名＋創辦人名字" },
        { key: "subjectDirection", zh: "主旨方向", en: "Subject lines", ph: "例：問句、不用全形驚嘆號、不放「免費」" },
        { key: "cta", zh: "唯一行動呼籲", en: "Single CTA", ph: "例：每封只放一顆「領取試用」按鈕" },
        { key: "listSize", zh: "名單大小", en: "List size", ph: "例：總共 8,000 人，老客 1,200" },
      ],
    }],
    rules: [r("每封都要有退訂連結；只能寄給同意收信的人（個資法）。", "Include an unsubscribe link. Email opted-in contacts only.")],
  },
  website: {
    channel: "website", zh: "官網任務說明單", en: "Website brief", audience: "internal",
    introZh: "給寫手的頁面規劃。每一頁一列，所有貼文最後都導到這裡，這裡要接得住。",
    introEn: "For the writers. One row per page — every post lands here.",
    rows: {
      zh: "要做的頁面", en: "Pages", max: 6, addZh: "再加一頁", addEn: "Add another",
      hintZh: "一頁一列：哪種頁、網址（有的話）、這頁要講什麼。",
      hintEn: "One row per page.",
      fields: [
        { key: "page", zh: "頁面", en: "Page", ph: "", options: [o("landing", "活動頁", "Landing page"), o("product", "商品頁", "Product page"), o("blog", "部落格文章", "Blog post"), o("banner", "首頁橫幅", "Home banner")] },
        { key: "url", zh: "網址", en: "URL", ph: "https://…" },
        ANGLE,
      ],
    },
    groups: [{
      zh: "頁面內容", en: "Content",
      fields: [
        { key: "blocks", zh: "需要的區塊", en: "Sections", ph: "例：主視覺、三個好處、常見問題、倒數計時", long: true },
        { key: "seoKeywords", zh: "SEO 關鍵字", en: "SEO keywords", ph: "例：品牌貼文排程、社群代操費用" },
        { key: "form", zh: "表單或結帳", en: "Form / checkout", ph: "例：試用申請表只問 email 和品牌名" },
        { key: "onOffTime", zh: "上下架時間", en: "Live dates", ph: "例：10/28 晚上 8 點上線、11/8 凌晨下架" },
      ],
    }],
    rules: [r("優惠條款、截止日、數量限制要寫在頁面上（消費者保護法）。", "Show offer terms, deadline and limits on the page.")],
  },
  cobrand: {
    channel: "cobrand", zh: "異業合作任務說明單", en: "Co-brand brief", audience: "external",
    introZh: "要交給合作夥伴的需求單。對象不同，能談的方案就不同——每一位先選類型，下面會出現那一類要談的事。全部選填。",
    introEn: "What you'd hand a partner. Pick each partner's type — the terms to discuss change with it.",
    rows: {
      zh: "合作夥伴", en: "Partners", max: 8, addZh: "再加一位", addEn: "Add another",
      hintZh: "有對象就寫名字；還沒有就只選類型和方案。每一位在企劃裡都會有自己的提案信和合作條件。",
      hintEn: "Name them, or just pick a type and scheme. Each gets their own pitch and terms in the plan.",
      fields: [
        { key: "name", zh: "夥伴名稱", en: "Partner", ph: "例：全家便利商店" },
        { key: "partnerType", zh: "對象類型", en: "Type", ph: "", options: COBRAND_PARTNER_TYPES },
        { key: "scheme", zh: "合作方案", en: "Scheme", ph: "", optionsBy: { field: "partnerType", map: COBRAND_SCHEMES } },
        { key: "angle", zh: "想談的角度", en: "Angle", ph: "例：他們的通勤客＝我們的上班族" },
      ],
    },
    groups: [
      {
        zh: "合作目標與成效", en: "Goals & results",
        fields: [
          { key: "objective", zh: "合作目標", en: "Objective", ph: "例：借對方的會員觸及我們還沒碰到的上班族" },
          { key: "kpi", zh: "成效指標", en: "KPIs", ph: "例：聯合頁面瀏覽 1 萬、兌換 300 次" },
          { key: "audience", zh: "想觸及的人", en: "Audience", ph: "例：雙方受眾重疊的 25–40 歲上班族" },
        ],
      },
      {
        zh: "要說什麼", en: "Messaging",
        fields: [
          { key: "keyMessage", zh: "共同訊息", en: "Shared message", ph: "一句話，雙方貼文都從這句長出來", long: true },
          { key: "mustSay", zh: "必提", en: "Must include", ph: "例：雙方品牌名、活動連結、兌換期限", long: true },
          { key: "mustNotSay", zh: "禁提", en: "Must avoid", ph: "例：不提對方競品、不說「獨家」除非真的獨家", long: true },
        ],
      },
      {
        zh: "跟互補品牌談", en: "With a complementary brand", whenType: "brand",
        fields: [
          { key: "benefitSwap", zh: "雙方各拿到什麼", en: "What each side gets", ph: "例：我們給試用名額，對方給會員電子報版位", long: true },
          { key: "coBrandVisual", zh: "聯名 logo 與視覺規範", en: "Co-brand visuals", ph: "例：雙 logo 等大、對方主色不改" },
          { key: "dataShare", zh: "名單或數據分享", en: "Data sharing", ph: "例：不交換名單，只分享兌換數字" },
          { key: "attribution", zh: "分潤與成效歸屬", en: "Attribution", ph: "例：各用自己的折扣碼，各算各的" },
        ],
        rules: [r("交換或共用會員名單，要先取得當事人同意（個資法）。", "Get consent before sharing customer lists.")],
      },
      {
        zh: "跟通路／店家談", en: "With a retailer", whenType: "retail",
        fields: [
          { key: "shelf", zh: "陳列位置與檔期", en: "Placement & dates", ph: "例：結帳櫃台旁、11/1–11/14" },
          { key: "supply", zh: "進貨與供貨條件", en: "Supply terms", ph: "例：寄賣、首批 200 組、缺貨 3 天內補" },
          { key: "staffScript", zh: "店員怎麼介紹", en: "Staff script", ph: "例：一句話＋試用品，結帳時順口提" },
          { key: "salesReport", zh: "銷售數據回報", en: "Sales reporting", ph: "例：每週一回報各店銷量" },
        ],
      },
      {
        zh: "跟媒體／社群談", en: "With media", whenType: "media",
        fields: [
          { key: "placement", zh: "露出版位與形式", en: "Placement", ph: "例：專題文章 1 篇＋粉專貼文 2 則" },
          { key: "editorial", zh: "審稿權", en: "Editorial control", ph: "例：品牌可確認事實，不改編輯觀點" },
          { key: "giveaway", zh: "抽獎規則與贈品", en: "Giveaway", ph: "例：品牌提供 10 份，媒體負責抽與寄" },
        ],
        rules: [r("置入報導要標示「廣告」或「贊助」（公平交易委員會）。", "Label sponsored articles as ads.")],
      },
      {
        zh: "跟企業／福委談", en: "With a company", whenType: "corporate",
        fields: [
          { key: "eligibility", zh: "適用對象與驗證方式", en: "Eligibility", ph: "例：員工憑公司 email 註冊" },
          { key: "orderFlow", zh: "下單與付款流程", en: "Ordering", ph: "例：福委統一下單、月結" },
          { key: "contact", zh: "對方窗口", en: "Contact", ph: "例：人資部福委會" },
        ],
      },
      {
        zh: "跟公益／協會／學校談", en: "With a non-profit", whenType: "org",
        fields: [
          { key: "commitment", zh: "公益承諾的具體內容", en: "Commitment", ph: "例：每賣一組捐 50 元，活動結束 30 天內公布總額", long: true },
          { key: "nameUse", zh: "名義與 logo 使用", en: "Name & logo use", ph: "例：可寫「與 XX 協會合作」，logo 需對方核可" },
        ],
        rules: [r("公益行銷要寫清楚捐多少、怎麼算、何時公布，不能只寫「部分所得捐出」。", "State how much is donated, how, and when it's reported.")],
      },
      {
        zh: "時程與條款", en: "Timeline & terms",
        fields: [
          { key: "timeline", zh: "時程", en: "Timeline", ph: "例：10/15 前提案 → 10/22 確認 → 11/1 雙方同步上線", long: true },
          { key: "usageRights", zh: "素材使用授權", en: "Usage rights", ph: "例：雙方可互用對方素材 3 個月，不可投廣告" },
          { key: "exclusivity", zh: "競品排他", en: "Exclusivity", ph: "例：活動期間不跟對方同類品牌合作" },
          { key: "review", zh: "審稿流程", en: "Review", ph: "例：對外貼文雙方都看過才發" },
          { key: "reporting", zh: "成效回報", en: "Reporting", ph: "例：活動結束 7 天內互給數字" },
        ],
      },
    ],
    rules: [],
  },
};

export const isBriefChannel = (c: unknown): c is BriefChannel => BRIEF_CHANNELS.includes(c as BriefChannel);

const TEXT_MAX = 600;
const ROW_MAX = 160;
const t = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

const optionIds = (f: BriefField, row: Record<string, string>): string[] | null => {
  if (f.options) return f.options.map((x) => x.id);
  if (f.optionsBy) return (f.optionsBy.map[row[f.optionsBy.field] ?? ""] ?? []).map((x) => x.id);
  return null;
};

/** 收進來的說明單 → 乾淨的（空的不留、選項不在清單裡的丟掉）。純函式。 */
export function cleanChannelBrief(channel: BriefChannel, raw: any): ChannelBrief {
  const spec = CHANNEL_BRIEF_SPECS[channel];
  const out: ChannelBrief = {};
  const values: Record<string, string> = {};
  for (const g of spec.groups) for (const f of g.fields) {
    const v = t(raw?.values?.[f.key], TEXT_MAX);
    if (v) values[f.key] = v;
  }
  if (Object.keys(values).length) out.values = values;
  const rows = (Array.isArray(raw?.rows) ? raw.rows : [])
    .map((r: any) => {
      const row: Record<string, string> = {};
      // 先收沒有相依的欄位，方案的選項才查得到類型。
      for (const f of [...spec.rows.fields].sort((a, b) => Number(!!a.optionsBy) - Number(!!b.optionsBy))) {
        const v = t(r?.[f.key], ROW_MAX);
        if (!v) continue;
        const ids = optionIds(f, row);
        if (ids && !ids.includes(v)) continue;
        row[f.key] = v;
      }
      return row;
    })
    .filter((r: Record<string, string>) => Object.keys(r).length > 0)
    .slice(0, spec.rows.max);
  if (rows.length) out.rows = rows;
  return out;
}

/** 所有通路的說明單（events.positioning.channelBriefs）→ 乾淨的。 */
export function cleanChannelBriefs(raw: any): Partial<Record<BriefChannel, ChannelBrief>> {
  const out: Partial<Record<BriefChannel, ChannelBrief>> = {};
  for (const c of BRIEF_CHANNELS) {
    const b = cleanChannelBrief(c, raw?.[c]);
    if (b.rows || b.values) out[c] = b;
  }
  return out;
}

const optLabel = (f: BriefField, row: Record<string, string>, v: string): string => {
  const list = f.options ?? (f.optionsBy ? f.optionsBy.map[row[f.optionsBy.field] ?? ""] : undefined);
  return list?.find((x) => x.id === v)?.zh ?? v;
};

/**
 * 一列給人看的名字。異業合作：「全家便利商店（通路／店家・店內陳列）」；
 * 其他通路：第一個有填的欄位＋其餘（不含角度）。
 */
export function briefRowLabel(channel: BriefChannel, row: Record<string, string>): string {
  const fields = CHANNEL_BRIEF_SPECS[channel].rows.fields.filter((f) => f.key !== "angle" && row[f.key]);
  if (!fields.length) return "";
  if (channel === COBRAND) {
    const type = row.partnerType ? optLabel(CHANNEL_BRIEF_SPECS.cobrand.rows.fields[1]!, row, row.partnerType) : "";
    const scheme = row.scheme ? optLabel(CHANNEL_BRIEF_SPECS.cobrand.rows.fields[2]!, row, row.scheme) : "";
    const head = row.name || (type ? `${type}夥伴` : "合作夥伴");
    const bits = [row.name ? type : "", scheme].filter(Boolean);
    return bits.length ? `${head}（${bits.join("・")}）` : head;
  }
  const [first, ...rest] = fields.map((f) => optLabel(f, row, row[f.key]!));
  return rest.length ? `${first}（${rest.join("・")}）` : first!;
}

/** 異業合作名單上出現的類型。 */
const typesIn = (b: ChannelBrief) => new Set((b.rows ?? []).map((r) => r.partnerType).filter(Boolean));

/** 這張說明單要顯示、要給寫手的組（異業合作只留名單上有的類型那組）。 */
export function activeGroups(channel: BriefChannel, brief: ChannelBrief): BriefGroup[] {
  const types = typesIn(brief);
  return CHANNEL_BRIEF_SPECS[channel].groups.filter((g) => !g.whenType || types.has(g.whenType));
}

/** 給寫手的說明單（只列有填的；平台規則一定附上）。完全空白又沒有規則就回空字串。 */
export function channelBriefText(channel: BriefChannel, brief: ChannelBrief | null | undefined): string {
  const spec = CHANNEL_BRIEF_SPECS[channel];
  const b = brief ?? {};
  const lines: string[] = [];
  if (b.rows?.length) {
    lines.push(`- ${spec.rows.zh}：${b.rows.map((r) => {
      const label = briefRowLabel(channel, r);
      return `${label}${r.angle ? `${label ? "，" : ""}角度：${r.angle}` : ""}`;
    }).filter(Boolean).join("；")}`);
  }
  const groups = activeGroups(channel, b);
  for (const g of groups) for (const f of g.fields) if (b.values?.[f.key]) lines.push(`- ${f.zh}：${b.values[f.key]}`);
  const rules = [...spec.rules, ...groups.flatMap((g) => g.rules ?? [])];
  if (!lines.length && !rules.length) return "";
  if (rules.length) lines.push(`- 平台規則：${rules.map((x) => x.zh).join(" ")}`);
  return `[${spec.zh}]\n${lines.join("\n")}`;
}

/** 企劃那條線要的對象：每一列一位（label＋角度）。 */
export function briefPartners(channel: BriefChannel, brief: ChannelBrief | null | undefined): Array<{ label: string; angle?: string }> {
  return (brief?.rows ?? [])
    .map((r) => ({ label: briefRowLabel(channel, r), ...(r.angle ? { angle: r.angle } : {}) }))
    .filter((p) => p.label);
}
