/**
 * 任務 modal 開頭插畫：依卡片題目挑一個場景（2026-09-29，CJ：「每張卡的圖都一樣」）。
 *
 * 先看「題材」再看「形式」——「IG Reels：用對方的母語笨拙地講一個好康」要畫的是
 * 兩種語言的對話框，不是一支場記板；題材都沒命中才退到形式（直播／輪播／留言…）。
 * 規則由上往下，第一個命中的就是答案，所以越具體的放越前面。
 * 新增場景：這裡加一條規則＋TaskIllustration.tsx 的 SCENES 加一張圖。
 */

export type TaskScene =
  // 題材
  | "language" | "apology" | "mascot" | "poll" | "trophy" | "countdown" | "gift"
  | "data" | "idea" | "stance" | "local" | "research" | "audio" | "announce"
  | "kol" | "voice"
  // 形式
  | "live" | "story" | "video" | "carousel" | "chat" | "mail" | "profile" | "menu"
  | "calendar" | "photo" | "hashtag" | "web"
  // 做法（題材、形式都沒命中時）
  | "rewrite" | "strategy"
  // 什麼都沒命中
  | "brief";

const RULES: Array<[TaskScene, RegExp]> = [
  ["language", /母語|語言|外語|翻譯|觀光客|language|translat|native tongue/],
  ["apology", /道歉|翻車|更正|出包|負評|危機|自嘲|apolog|crisis|correction/],
  ["mascot", /吉祥物|擬人|可愛|局外人|接管|角色|人格|mascot|takeover|character/],
  ["poll", /投票|淘汰|問卷|poll|vote|survey/],
  ["trophy", /挑戰|比賽|競標|打分數|challenge|contest|auction/],
  ["countdown", /倒數|限時(?!動態)|到期|限量|countdown|limited/],
  ["gift", /好康|優惠|促銷|試用|贈|送|折扣|抽獎|offer|promo|gift|discount|free trial/],
  ["data", /數據|成績|成效|實測|證據|數字|報告|data|report|proof|stats/],
  ["idea", /冷知識|你有沒有發現|點子|實用|技巧|trivia|tips?\b/],
  ["stance", /立場|主張|宣言|聲明|不同意|代價|取捨|stance|manifesto|statement/],
  ["local", /地方|在地|地標|驕傲|local|landmark/],
  ["research", /研究|訪談|競品|洞察|research|interview|competitor/],
  ["audio", /聲音|asmr|音樂|卡點|sound|audio|music/],
  ["announce", /公告|上線|發表|新聞|首賣|launch|announce|press/],
  ["kol", /kol|網紅|influencer|創作者|合拍|creator/],
  ["voice", /語氣|口吻|話術|講稿|致辭|tone|voice|speech/],
  ["live", /直播|首播|首映|\blive\b|premiere/],
  ["video", /reels?|短片|影片|腳本|分鏡|shorts|tiktok|video|\bscripts?\b|storyboard/],
  ["carousel", /輪播|多卡|相簿|文件貼文|carousel|album/],
  ["chat", /留言|回覆|私訊|\bdm\b|threads|comment|repl/],
  ["mail", /email|電子報|edm|newsletter|主旨|[封請訪顧迎銷發回]信/],
  ["story", /限時動態/],
  ["profile", /個人檔案|簡介|帳號|人設|\bbio\b|profile/],
  ["menu", /\bline\b|選單|分眾/],
  ["calendar", /月曆|行事曆|系列|連載|calendar|series/],
  ["photo", /照片|縮圖|photo|thumbnail/],
  ["hashtag", /標籤|hashtag/],
  ["web", /官網|長文|專欄|產品頁|案例|問答|website|article|landing|faq/],
  ["rewrite", /改寫|一稿|rewrite|repurpose|remix/],
  ["strategy", /策略|定位|企劃|劇本|工具包|strategy|playbook|position/],
];

/** 自建卡讓用戶自己挑場景時的選單順序與名稱。 */
export const SCENE_OPTIONS: Array<{ scene: TaskScene; zh: string; en: string }> = [
  { scene: "brief", zh: "便條", en: "Note" },
  { scene: "language", zh: "語言", en: "Language" },
  { scene: "gift", zh: "好康", en: "Offer" },
  { scene: "countdown", zh: "倒數", en: "Countdown" },
  { scene: "announce", zh: "公告", en: "Announcement" },
  { scene: "data", zh: "數據", en: "Data" },
  { scene: "idea", zh: "冷知識", en: "Tip" },
  { scene: "stance", zh: "立場", en: "Stance" },
  { scene: "apology", zh: "道歉", en: "Apology" },
  { scene: "mascot", zh: "角色", en: "Mascot" },
  { scene: "poll", zh: "投票", en: "Poll" },
  { scene: "trophy", zh: "挑戰", en: "Challenge" },
  { scene: "local", zh: "在地", en: "Local" },
  { scene: "research", zh: "研究", en: "Research" },
  { scene: "audio", zh: "聲音", en: "Sound" },
  { scene: "kol", zh: "KOL", en: "Creator" },
  { scene: "voice", zh: "語氣", en: "Voice" },
  { scene: "live", zh: "直播", en: "Live" },
  { scene: "story", zh: "限時動態", en: "Stories" },
  { scene: "video", zh: "短影音", en: "Video" },
  { scene: "carousel", zh: "輪播", en: "Carousel" },
  { scene: "chat", zh: "留言", en: "Comments" },
  { scene: "mail", zh: "Email", en: "Email" },
  { scene: "profile", zh: "個人檔案", en: "Profile" },
  { scene: "menu", zh: "LINE 選單", en: "LINE menu" },
  { scene: "calendar", zh: "月曆", en: "Calendar" },
  { scene: "photo", zh: "照片", en: "Photo" },
  { scene: "hashtag", zh: "標籤", en: "Hashtag" },
  { scene: "web", zh: "官網", en: "Website" },
  { scene: "rewrite", zh: "改寫", en: "Rewrite" },
  { scene: "strategy", zh: "策略", en: "Strategy" },
];

const KNOWN = new Set<string>(SCENE_OPTIONS.map((o) => o.scene));

export function isTaskScene(v: unknown): v is TaskScene {
  return typeof v === "string" && KNOWN.has(v);
}

/** 卡片上有人選過場景（自建卡）就用那個；不認得或沒選就依題目自動挑。 */
export function resolveTaskScene(card: Parameters<typeof pickTaskScene>[0] & { scene?: string | null }): TaskScene {
  return isTaskScene(card.scene) ? card.scene : pickTaskScene(card);
}

export function pickTaskScene(card: {
  label?: string | null;
  label_zh?: string | null;
  label_en?: string | null;
  primary_question?: string | null;
}): TaskScene {
  const text = [card.label_zh, card.label, card.label_en, card.primary_question]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  for (const [scene, re] of RULES) if (re.test(text)) return scene;
  return "brief";
}
