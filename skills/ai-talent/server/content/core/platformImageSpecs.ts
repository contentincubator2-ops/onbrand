/**
 * 各通路的圖片任務卡——一張卡＝該平台支援的一種圖片規格。
 *
 * 2026-09-29（CJ「每個平台要增加一個圖片的類別，底下的圖片任務卡，是符合該平台裡面
 * 有的不同尺寸」）。規格來源：Meta Ads Guide／Instagram Help／Threads API／
 * LINE 台灣官方手冊與 Messaging API／TikTok API／Mailchimp／Google Search Central／
 * SHOPLINE、Shopify（2026-09 調查，每張卡的 source 是主要依據）。
 *
 * 鐵律（CJ「不能是生成後依規格精準裁切，因為這通常會切不准，要嚴格限制在指令當中」）：
 *   - 比例在「生成當下」就鎖死：gpt-image-2 用自訂長寬（16 的倍數、1:3–3:1），
 *     Nano Banana 用它原生支援的比例；Nano Banana 沒有的比例，這張卡就不給選。
 *   - 構圖（主體位置、平台 UI 會蓋住的區域、標題留白）寫進 prompt。
 *   - 生成後只做「等比例縮放到交付像素」，比例差超過 1% 視為失敗，絕不裁切。
 *
 * 前台不 import 這支（client 不得 value-import server）——頁面用 imageCards.list 拿。
 */

export type ImageChannel = "facebook" | "instagram" | "threads" | "line" | "tiktok" | "email" | "website";

export const IMAGE_CHANNELS: ImageChannel[] = ["facebook", "instagram", "threads", "line", "tiktok", "email", "website"];

/** 標題疊層放哪裡——同時也是 prompt 要求留白的位置。 */
export type TitleZone = "top" | "center" | "bottom" | "left" | "none";

/** 平台 UI 會蓋住的比例（0–1），要求模型避開放重點。 */
export interface SafeZone { top: number; bottom: number; left: number; right: number }

export interface PlatformImageSpec {
  id: string;
  channel: ImageChannel;
  labelZh: string;
  labelEn: string;
  /** 卡片上的一句話：什麼時候用。 */
  descZh: string;
  descEn: string;
  /** 交付像素。 */
  width: number;
  height: number;
  /** 一次最多幾張（輪播／相簿）。1 = 單張。 */
  maxImages: number;
  safeZone?: SafeZone;
  titleZone: TitleZone;
  /** 給用戶看的構圖提醒。 */
  noteZh: string;
  /** 寫進 prompt 的構圖指令（英文）。 */
  compositionEn: string;
  format: "png" | "jpeg";
  /** 檔案上限（bytes），例如 LINE 圖文選單 1MB。 */
  maxBytes?: number;
  source: string;
}

const STORY_SAFE: SafeZone = { top: 0.14, bottom: 0.35, left: 0.06, right: 0.06 };
const TIKTOK_SAFE: SafeZone = { top: 0.07, bottom: 0.17, left: 0.04, right: 0.13 };

export const PLATFORM_IMAGE_SPECS: PlatformImageSpec[] = [
  // ── Facebook ────────────────────────────────────────────────────────────
  {
    id: "fb-img-feed-portrait", channel: "facebook",
    labelZh: "貼文直式圖", labelEn: "Feed post · portrait",
    descZh: "動態消息佔版面最大的比例，一般貼文首選。", descEn: "Takes the most feed space — the default for posts.",
    width: 1080, height: 1350, maxImages: 1, titleZone: "top",
    noteZh: "4:5；動態消息最多顯示到 4:5，更長會被截。",
    compositionEn: "Vertical 4:5 feed composition. Main subject in the middle third, generous clean space in the upper area for a headline.",
    format: "jpeg", source: "https://www.facebook.com/business/ads-guide/update/image",
  },
  {
    id: "fb-img-feed-square", channel: "facebook",
    labelZh: "貼文方形圖", labelEn: "Feed post · square",
    descZh: "最通用的貼文圖，轉發到其他平台也不會被切。", descEn: "The most portable post image.",
    width: 1080, height: 1080, maxImages: 1, titleZone: "top",
    noteZh: "1:1。",
    compositionEn: "Square 1:1 composition, subject centred, clean negative space along the top for a headline.",
    format: "jpeg", source: "https://blog.hootsuite.com/social-media-image-sizes-guide/",
  },
  {
    id: "fb-img-link", channel: "facebook",
    labelZh: "連結貼文橫式圖", labelEn: "Link post · landscape",
    descZh: "分享文章、活動頁連結時的預覽大圖。", descEn: "Large preview for link shares.",
    width: 1200, height: 630, maxImages: 1, titleZone: "left",
    noteZh: "1.91:1；低於 600×315 會變成小縮圖。",
    compositionEn: "Wide 1.91:1 landscape. Subject on the right half, calm clean area on the left half for a headline.",
    format: "jpeg", source: "https://developers.facebook.com/docs/sharing/webmasters/images",
  },
  {
    id: "fb-img-album", channel: "facebook",
    labelZh: "多圖貼文／相簿", labelEn: "Multi-photo post",
    descZh: "一次 2–10 張，第一張決定版面，適合活動花絮、產品系列。", descEn: "2–10 photos; the first sets the layout.",
    width: 1080, height: 1080, maxImages: 10, titleZone: "none",
    noteZh: "1:1，2–10 張；第一張放最有代表性的畫面。",
    compositionEn: "Square 1:1 photo that works both as a large lead tile and as a small thumbnail: one clear subject, uncluttered background.",
    format: "jpeg", source: "https://planable.io/blog/how-to-post-a-carousel-on-facebook/",
  },
  {
    id: "fb-img-carousel", channel: "facebook",
    labelZh: "輪播卡", labelEn: "Carousel cards",
    descZh: "每張卡各帶一個連結，適合多商品介紹。", descEn: "Each card has its own link.",
    width: 1080, height: 1080, maxImages: 10, titleZone: "bottom",
    noteZh: "1:1，2–10 張；每張卡下方會有標題列。",
    compositionEn: "Square 1:1 carousel card. Subject centred slightly high; keep the bottom 20% clean for a caption strip. Consistent style across cards.",
    format: "jpeg", source: "https://www.facebook.com/business/ads-guide/update/carousel/facebook-feed",
  },
  {
    id: "fb-img-story", channel: "facebook",
    labelZh: "限時動態", labelEn: "Story",
    descZh: "全螢幕直式，上下會被頭像與回覆框蓋住。", descEn: "Full-screen vertical; top and bottom are covered by UI.",
    width: 1080, height: 1920, maxImages: 1, safeZone: STORY_SAFE, titleZone: "center",
    noteZh: "9:16；上方 14%、下方 35%、左右 6% 不放重點。",
    compositionEn: "Full-screen vertical 9:16. Keep the subject and all important content inside the central safe area.",
    format: "jpeg", source: "https://www.facebook.com/business/ads-guide/update/image/facebook-story",
  },
  {
    id: "fb-img-reels-cover", channel: "facebook",
    labelZh: "Reels 封面", labelEn: "Reels cover",
    descZh: "粉專格狀只顯示中間一塊，標題要放正中。", descEn: "The page grid shows only the middle.",
    width: 1080, height: 1920, maxImages: 1, safeZone: { top: 0.2, bottom: 0.2, left: 0, right: 0 }, titleZone: "center",
    noteZh: "9:16；重點放中間 1080×1080 範圍內。",
    compositionEn: "Vertical 9:16 cover. Everything important sits in the central square; top and bottom fifths are atmospheric background only.",
    format: "jpeg", source: "https://thumbcrafted.com/guide/facebook-reels-cover",
  },
  {
    id: "fb-img-page-cover", channel: "facebook",
    labelZh: "粉專封面", labelEn: "Page cover",
    descZh: "桌機與手機裁切不同，重點放中間。", descEn: "Desktop and mobile crop differently.",
    width: 1640, height: 624, maxImages: 1, safeZone: { top: 0.05, bottom: 0.12, left: 0.12, right: 0.12 }, titleZone: "center",
    noteZh: "上傳 1640×624（820×312 的兩倍）；左下角會被大頭貼蓋住。",
    compositionEn: "Very wide banner. Key subject in the central area; the lower-left corner is covered by the profile picture, keep it plain.",
    format: "jpeg", source: "https://www.facebook.com/help/125379114252045",
  },
  {
    id: "fb-img-event-cover", channel: "facebook",
    labelZh: "活動封面", labelEn: "Event cover",
    descZh: "活動頁頂端大圖，下方會壓活動名稱與日期。", descEn: "Event name and date overlay the bottom.",
    width: 1920, height: 1005, maxImages: 1, safeZone: { top: 0, bottom: 0.2, left: 0, right: 0 }, titleZone: "center",
    noteZh: "1.91:1；下方 20% 會被活動資訊蓋住。",
    compositionEn: "Wide 1.91:1 event banner. Subject centred; the bottom fifth stays plain.",
    format: "jpeg", source: "https://snappa.com/blog/facebook-event-photo-size/",
  },

  // ── Instagram ───────────────────────────────────────────────────────────
  {
    id: "ig-img-feed-34", channel: "instagram",
    labelZh: "貼文直式 3:4", labelEn: "Feed post · 3:4",
    descZh: "2025 起 IG 原生比例，個人頁格狀不會被切。", descEn: "Native IG ratio since 2025; no grid crop.",
    width: 1080, height: 1440, maxImages: 1, titleZone: "top",
    noteZh: "3:4；App 發文用這個。若透過 API 自動發佈請用 4:5。",
    compositionEn: "Vertical 3:4 feed composition. Subject in the middle, clean breathing room in the upper area for a headline.",
    format: "jpeg", source: "https://help.instagram.com/1631821640426723/",
  },
  {
    id: "ig-img-feed-45", channel: "instagram",
    labelZh: "貼文直式 4:5", labelEn: "Feed post · 4:5",
    descZh: "API 自動發佈也支援的直式，廣告通用。", descEn: "Works with API publishing and ads.",
    width: 1080, height: 1350, maxImages: 1, titleZone: "top",
    noteZh: "4:5；格狀會切掉兩側一點點，重點不要貼邊。",
    compositionEn: "Vertical 4:5 feed composition. Keep important elements away from the left and right edges; headline space in the upper area.",
    format: "jpeg", source: "https://www.facebook.com/business/ads-guide/update/image/instagram-feed",
  },
  {
    id: "ig-img-feed-square", channel: "instagram",
    labelZh: "貼文方形", labelEn: "Feed post · square",
    descZh: "經典方形；格狀會切成 3:4，兩側會少一點。", descEn: "Classic square.",
    width: 1080, height: 1080, maxImages: 1, titleZone: "top",
    noteZh: "1:1；重點放中間。",
    compositionEn: "Square 1:1, subject centred and away from the left/right edges.",
    format: "jpeg", source: "https://blog.hootsuite.com/social-media-image-sizes-guide/",
  },
  {
    id: "ig-img-carousel", channel: "instagram",
    labelZh: "輪播貼文", labelEn: "Carousel",
    descZh: "最多 20 張（API 自動發佈最多 10 張），第一張決定所有張的比例。", descEn: "Up to 20 slides (10 via API).",
    width: 1080, height: 1350, maxImages: 20, titleZone: "top",
    noteZh: "4:5；全部張數同比例、同風格。",
    compositionEn: "Vertical 4:5 carousel slide in a consistent series style; headline space in the upper area.",
    format: "jpeg", source: "https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media",
  },
  {
    id: "ig-img-story", channel: "instagram",
    labelZh: "限時動態", labelEn: "Story",
    descZh: "全螢幕直式，上下會被 UI 蓋住。", descEn: "Full-screen vertical.",
    width: 1080, height: 1920, maxImages: 1, safeZone: STORY_SAFE, titleZone: "center",
    noteZh: "9:16；上方 14%、下方 35%、左右 6% 不放重點。",
    compositionEn: "Full-screen vertical 9:16. All important content inside the central safe area.",
    format: "jpeg", source: "https://www.facebook.com/business/ads-guide/update/image/instagram-story",
  },
  {
    id: "ig-img-reels-cover", channel: "instagram",
    labelZh: "Reels 封面", labelEn: "Reels cover",
    descZh: "個人頁只顯示中間 3:4，標題要放在裡面。", descEn: "Grid shows the central 3:4.",
    width: 1080, height: 1920, maxImages: 1, safeZone: { top: 0.125, bottom: 0.125, left: 0, right: 0 }, titleZone: "center",
    noteZh: "9:16；重點放中間 1080×1440。",
    compositionEn: "Vertical 9:16 cover; subject and focal area inside the central 3:4 region.",
    format: "jpeg", source: "https://www.kapwing.com/resources/instagrams-new-grid-layout-size-and-dimensions-2025/",
  },

  // ── Threads ─────────────────────────────────────────────────────────────
  {
    id: "threads-img-portrait", channel: "threads",
    labelZh: "單圖貼文（直式）", labelEn: "Single image · portrait",
    descZh: "Threads 照原比例顯示，直式最顯眼。", descEn: "Shown at original ratio; portrait stands out.",
    width: 1080, height: 1350, maxImages: 1, titleZone: "top",
    noteZh: "4:5；檔案 8MB 內。",
    compositionEn: "Vertical 4:5, conversational and candid feel, subject centred with headline space above.",
    format: "jpeg", maxBytes: 8 * 1024 * 1024, source: "https://developers.facebook.com/docs/threads/overview",
  },
  {
    id: "threads-img-square", channel: "threads",
    labelZh: "單圖貼文（方形）", labelEn: "Single image · square",
    descZh: "方形，適合搭配短句。", descEn: "Square, pairs with short text.",
    width: 1080, height: 1080, maxImages: 1, titleZone: "top",
    noteZh: "1:1；檔案 8MB 內。",
    compositionEn: "Square 1:1, simple and candid, subject centred.",
    format: "jpeg", maxBytes: 8 * 1024 * 1024, source: "https://developers.facebook.com/docs/threads/overview",
  },
  {
    id: "threads-img-carousel", channel: "threads",
    labelZh: "多圖輪播", labelEn: "Carousel",
    descZh: "2–20 張，橫向滑動。", descEn: "2–20 images.",
    width: 1080, height: 1350, maxImages: 20, titleZone: "top",
    noteZh: "4:5，2–20 張；風格一致。",
    compositionEn: "Vertical 4:5 slide in a consistent series style.",
    format: "jpeg", maxBytes: 8 * 1024 * 1024, source: "https://developers.facebook.com/docs/threads/overview",
  },

  // ── LINE 官方帳號 ────────────────────────────────────────────────────────
  {
    id: "line-img-richmsg", channel: "line",
    labelZh: "圖文訊息（方形）", labelEn: "Rich message · square",
    descZh: "推播最常用的點擊圖，後台可切 1–6 個點擊區。", descEn: "Tappable image; 1–6 tap areas.",
    width: 1040, height: 1040, maxImages: 1, titleZone: "top",
    noteZh: "1040×1040；點擊區在 LINE 後台切，重點不要壓在切線上。",
    compositionEn: "Square 1:1 promotional image; one bold focal subject, simple background, clear space in the upper area for a headline, lower area calm enough to host a tap button.",
    format: "jpeg", maxBytes: 10 * 1024 * 1024, source: "https://tw.linebiz.com/manual/line-official-account/oa-manager-richmessage/",
  },
  {
    id: "line-img-richmsg-tall", channel: "line",
    labelZh: "圖文訊息（長版）", labelEn: "Rich message · tall",
    descZh: "在聊天室佔更大版面，適合主打活動。", descEn: "Takes more chat space.",
    width: 1040, height: 1560, maxImages: 1, titleZone: "top",
    noteZh: "1040×1560（2:3）。",
    compositionEn: "Vertical 2:3 promotional image; headline space at top, subject in the middle, calm bottom band for a call-to-action button.",
    format: "jpeg", maxBytes: 10 * 1024 * 1024, source: "https://www.celiasu.com/2021/10/line-rich-message-canva-design.html",
  },
  {
    id: "line-img-richmenu-large", channel: "line",
    labelZh: "圖文選單（大）", labelEn: "Rich menu · large",
    descZh: "聊天室下方常駐選單，最多 6 個按鈕區。", descEn: "Persistent menu, up to 6 tap areas.",
    width: 2500, height: 1686, maxImages: 1, titleZone: "none",
    noteZh: "2500×1686；檔案 1MB 內。按鈕文字請在疊層加，不讓 AI 畫字。",
    compositionEn: "Menu background panel with a soft, even layout that divides naturally into a 3×2 grid of equal cells; no single dominant subject, low contrast, room for labels in every cell.",
    format: "jpeg", maxBytes: 1024 * 1024, source: "https://developers.line.biz/en/docs/messaging-api/rich-menus-overview/",
  },
  {
    id: "line-img-richmenu-small", channel: "line",
    labelZh: "圖文選單（小）", labelEn: "Rich menu · compact",
    descZh: "較矮的常駐選單，1–3 個按鈕區。", descEn: "Compact menu, 1–3 tap areas.",
    width: 2500, height: 843, maxImages: 1, titleZone: "none",
    noteZh: "2500×843；檔案 1MB 內。",
    compositionEn: "Very wide menu background strip that divides naturally into three equal columns; soft, even, low contrast, room for a label in each column.",
    format: "jpeg", maxBytes: 1024 * 1024, source: "https://developers.line.biz/en/docs/messaging-api/rich-menus-overview/",
  },
  {
    id: "line-img-card-product", channel: "line",
    labelZh: "多頁訊息（商品／地點）", labelEn: "Card message · product",
    descZh: "橫向滑動的卡片，最多 9 張，適合商品目錄。", descEn: "Up to 9 swipeable cards.",
    width: 1540, height: 1000, maxImages: 9, titleZone: "none",
    noteZh: "1.54:1，最多 9 張；卡片文字在圖下方，圖上不放字。",
    compositionEn: "Landscape 1.54:1 product card photo, product centred with even margins, clean background, consistent across cards.",
    format: "jpeg", maxBytes: 10 * 1024 * 1024, source: "https://help2.line.me/official_account_tw/web/pc?lang=zh-Hant&contentId=200001327",
  },
  {
    id: "line-img-card-visual", channel: "line",
    labelZh: "多頁訊息（影像）", labelEn: "Card message · visual",
    descZh: "近方形大圖卡，左上有標語、下方有按鈕。", descEn: "Near-square visual card.",
    width: 1110, height: 1000, maxImages: 9, safeZone: { top: 0.15, bottom: 0.2, left: 0, right: 0 }, titleZone: "none",
    noteZh: "1.11:1，最多 9 張；左上角與底部會被標語、按鈕蓋住。",
    compositionEn: "Near-square 1.11:1 visual card; subject centred, top-left corner and bottom band kept plain.",
    format: "jpeg", maxBytes: 10 * 1024 * 1024, source: "https://help2.line.me/official_account_tw/web/pc?lang=zh-Hant&contentId=200001327",
  },

  // ── TikTok ──────────────────────────────────────────────────────────────
  {
    id: "tt-img-photo", channel: "tiktok",
    labelZh: "圖文輪播", labelEn: "Photo carousel",
    descZh: "TikTok 相片模式，最多 35 張，全螢幕直式。", descEn: "Photo Mode, up to 35 images.",
    width: 1080, height: 1920, maxImages: 35, safeZone: TIKTOK_SAFE, titleZone: "top",
    noteZh: "9:16；右側 13% 有按讚列、下方 17% 有文案，避開。",
    compositionEn: "Full-screen vertical 9:16 slide in a consistent series style; right edge and bottom band kept free of important content.",
    format: "jpeg", maxBytes: 20 * 1024 * 1024, source: "https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide",
  },
  {
    id: "tt-img-cover", channel: "tiktok",
    labelZh: "影片封面", labelEn: "Video cover",
    descZh: "個人頁格狀約切成 3:4，標題放中間。", descEn: "Grid crops to ~3:4.",
    width: 1080, height: 1920, maxImages: 1, safeZone: { top: 0.125, bottom: 0.125, left: 0, right: 0 }, titleZone: "center",
    noteZh: "9:16；重點放中間 3:4 範圍。",
    compositionEn: "Vertical 9:16 cover; subject and focal area inside the central 3:4 region.",
    format: "jpeg", source: "https://blog.hootsuite.com/social-media-image-sizes-guide/",
  },

  // ── 電子報 ──────────────────────────────────────────────────────────────
  {
    id: "email-img-hero", channel: "email",
    labelZh: "電子報主視覺", labelEn: "Newsletter hero",
    descZh: "信件最上方的大圖；標題與按鈕請用信件文字，不要做進圖裡。", descEn: "Top banner; keep headline and CTA as live text.",
    width: 1200, height: 600, maxImages: 1, titleZone: "none",
    noteZh: "1200×600（600 寬版型的兩倍解析度）；Outlook 預設擋圖，重要資訊別只放圖上。",
    compositionEn: "Wide 2:1 banner, one clear subject, uncluttered background that reads well small.",
    format: "jpeg", maxBytes: 1024 * 1024, source: "https://mailchimp.com/help/image-requirements-for-templates/",
  },
  {
    id: "email-img-inline", channel: "email",
    labelZh: "內文滿版圖", labelEn: "Inline full-width",
    descZh: "內文段落之間的滿版圖。", descEn: "Full-width image between sections.",
    width: 1200, height: 800, maxImages: 1, titleZone: "none",
    noteZh: "3:2，1200 寬。",
    compositionEn: "Landscape 3:2 editorial image, one clear subject.",
    format: "jpeg", maxBytes: 1024 * 1024, source: "https://mailchimp.com/help/image-requirements-for-templates/",
  },
  {
    id: "email-img-product", channel: "email",
    labelZh: "分欄商品圖", labelEn: "Column product image",
    descZh: "兩欄、三欄商品格用的方形圖。", descEn: "Square images for product grids.",
    width: 600, height: 600, maxImages: 6, titleZone: "none",
    noteZh: "1:1，同一封信風格一致。",
    compositionEn: "Square 1:1 product-grid image, subject centred with even margins, plain background, consistent across the set.",
    format: "jpeg", source: "https://mailchimp.com/help/image-requirements-for-templates/",
  },

  // ── 官網 ────────────────────────────────────────────────────────────────
  {
    id: "web-img-hero-desktop", channel: "website",
    labelZh: "首頁主視覺（桌機）", labelEn: "Homepage hero · desktop",
    descZh: "首頁最上方的寬幅大圖。", descEn: "Wide homepage banner.",
    width: 2400, height: 1000, maxImages: 1, titleZone: "left",
    noteZh: "2.4:1；螢幕較高時兩側會被切，重點放中間偏右，左側留給標題。",
    compositionEn: "Very wide 2.4:1 hero banner. Subject in the centre-right, calm clean area on the left third for a headline.",
    format: "jpeg", source: "https://support.shoplineapp.com/hc/en-us/articles/204884025-Recommended-Image-Dimensions",
  },
  {
    id: "web-img-hero-mobile", channel: "website",
    labelZh: "首頁主視覺（手機）", labelEn: "Homepage hero · mobile",
    descZh: "手機版首頁大圖，和桌機版成對上傳。", descEn: "Mobile pair of the hero.",
    width: 1080, height: 1350, maxImages: 1, titleZone: "top",
    noteZh: "4:5，1080 寬。",
    compositionEn: "Vertical 4:5 hero; headline space at the top, subject in the lower two thirds.",
    format: "jpeg", source: "https://support.shoplineapp.com/hc/en-us/articles/204884025-Recommended-Image-Dimensions",
  },
  {
    id: "web-img-og", channel: "website",
    labelZh: "社群分享圖", labelEn: "Social share (OG) image",
    descZh: "網頁被分享到 FB、LINE、Threads 時的預覽圖。", descEn: "Link preview on FB, LINE, Threads.",
    width: 1200, height: 630, maxImages: 1, titleZone: "left",
    noteZh: "1200×630（1.91:1）。",
    compositionEn: "Wide 1.91:1 share image; subject on the right, clean left half for a headline, readable as a small thumbnail.",
    format: "jpeg", source: "https://developers.facebook.com/docs/sharing/webmasters/images",
  },
  {
    id: "web-img-blog", channel: "website",
    labelZh: "部落格封面", labelEn: "Blog featured image",
    descZh: "文章列表與 Google 探索用的封面。", descEn: "Article cover, Google Discover ready.",
    width: 1200, height: 675, maxImages: 1, titleZone: "none",
    noteZh: "16:9，至少 1200 寬（Google 探索要求）。",
    compositionEn: "Landscape 16:9 editorial cover, one clear subject, balanced composition.",
    format: "jpeg", source: "https://developers.google.com/search/docs/appearance/google-discover",
  },
  {
    id: "web-img-product", channel: "website",
    labelZh: "商品情境圖", labelEn: "Product lifestyle image",
    descZh: "商品頁用的方形情境圖。", descEn: "Square product-page image.",
    width: 2048, height: 2048, maxImages: 8, titleZone: "none",
    noteZh: "1:1，2048×2048（可放大檢視）。",
    compositionEn: "Square 1:1 product lifestyle photo, product as the clear hero with even margins.",
    format: "jpeg", source: "https://help.shopify.com/en/manual/online-store/images/theme-images",
  },
];

// ── 生成尺寸：比例在生成當下鎖死 ──────────────────────────────────────────

/** gpt-image-2 自訂尺寸的限制（OpenAI 官方文件）。 */
const GPT_MIN_PIXELS = 655_360;
/** 超過 2560×1440 屬實驗性，不用。 */
const GPT_MAX_PIXELS = 2560 * 1440;
const GPT_MAX_EDGE = 3840;

/** 比例容差：生成比例與交付比例差多少以內算「同一個比例」。 */
export const RATIO_TOLERANCE = 0.01;

export function ratioError(a: number, b: number): number {
  return Math.abs(a - b) / b;
}

/**
 * gpt-image-2 要送的 size：寬高都是 16 的倍數、總像素在允許範圍內，
 * 比例盡量貼近交付尺寸（≤0.5%），面積盡量接近交付尺寸（上限 2560×1440）。
 */
export function gptSizeFor(width: number, height: number): { w: number; h: number } {
  const r = width / height;
  const want = Math.min(Math.max(width * height, GPT_MIN_PIXELS * 1.05), GPT_MAX_PIXELS * 0.95);
  let best: { w: number; h: number; err: number; areaGap: number } | null = null;
  for (let h = 256; h <= GPT_MAX_EDGE; h += 16) {
    const w = Math.round((h * r) / 16) * 16;
    if (w < 256 || w > GPT_MAX_EDGE) continue;
    const area = w * h;
    if (area < GPT_MIN_PIXELS || area > GPT_MAX_PIXELS) continue;
    const err = ratioError(w / h, r);
    const areaGap = Math.abs(area - want) / want;
    // 比例誤差在 0.5% 內的候選，挑面積最接近的；都不在的話挑比例最準的。
    const score = (x: { err: number; areaGap: number }) => (x.err <= 0.005 ? x.areaGap : 10 + x.err);
    const cand = { w, h, err, areaGap };
    if (!best || score(cand) < score(best)) best = cand;
  }
  if (!best) throw new Error(`no gpt-image-2 size for ${width}x${height}`);
  return { w: best.w, h: best.h };
}

/** Nano Banana 原生支援的比例（Gemini image generation 文件）。 */
export const NANO_BANANA_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"] as const;
export type NanoBananaRatio = (typeof NANO_BANANA_RATIOS)[number];

/** 這個交付尺寸 Nano Banana 能不能原生產出——不能就回 null，卡片不給選 Nano Banana。 */
export function nanoRatioFor(width: number, height: number): NanoBananaRatio | null {
  const r = width / height;
  for (const label of NANO_BANANA_RATIOS) {
    const [a = 0, b = 1] = label.split(":").map(Number);
    if (ratioError(a / b, r) <= RATIO_TOLERANCE) return label;
  }
  return null;
}

export function ratioLabel(width: number, height: number): string {
  const nano = nanoRatioFor(width, height);
  if (nano) return nano;
  return `${(width / height).toFixed(2).replace(/\.?0+$/, "")}:1`;
}

export function getImageSpec(id: string): PlatformImageSpec | undefined {
  return PLATFORM_IMAGE_SPECS.find((s) => s.id === id);
}

/**
 * 寫進 prompt 的畫布與構圖指令——比例限制在這裡講死，而不是事後裁。
 */
export function canvasPromptBlock(spec: PlatformImageSpec): string {
  const lines: string[] = [];
  const orient = spec.width > spec.height ? "landscape" : spec.width < spec.height ? "portrait" : "square";
  lines.push(
    `CANVAS (mandatory): ${spec.width}x${spec.height} pixels, aspect ratio ${ratioLabel(spec.width, spec.height)}, ${orient}. ` +
    `Compose natively for exactly this frame. The image will be used as-is — nothing will be cropped later — ` +
    `so every element must sit fully inside the frame with comfortable margins; do not let the subject touch or be cut by an edge.`,
  );
  lines.push(`FRAMING: ${spec.compositionEn}`);
  if (spec.safeZone) {
    const z = spec.safeZone;
    const pct = (n: number) => `${Math.round(n * 100)}%`;
    lines.push(
      `PLATFORM UI SAFE ZONE: the platform overlays its own interface on the top ${pct(z.top)}, bottom ${pct(z.bottom)}` +
      `${z.left ? `, left ${pct(z.left)}` : ""}${z.right ? `, right ${pct(z.right)}` : ""} of the frame. ` +
      `Place no faces, product, or focal detail there — only background.`,
    );
  }
  if (spec.titleZone !== "none") {
    const where = { top: "upper area", center: "central area", bottom: "lower area", left: "left side" }[spec.titleZone];
    lines.push(`HEADLINE SPACE: a headline will be overlaid later in the ${where}. Keep that area visually calm and uncluttered (soft background, no busy detail), but do NOT draw any text, box, or placeholder there.`);
  }
  if (spec.maxImages > 1) {
    lines.push("SERIES: this image belongs to a multi-image set; keep lighting, palette and style consistent so the set reads as one series.");
  }
  return lines.join("\n");
}
