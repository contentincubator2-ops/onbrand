/**
 * 各通路的圖片任務卡——一張卡＝該平台支援的一種圖片規格。
 *
 * 2026-09-29（CJ「每個平台要增加一個圖片的類別，底下的圖片任務卡，是符合該平台裡面
 * 有的不同尺寸」）。規格來源：Meta Ads Guide／Instagram Help／Threads API／
 * LINE 台灣官方手冊與 Messaging API／TikTok API／Mailchimp／Google Search Central／
 * SHOPLINE、Shopify（2026-09 調查，每張卡的 source 是主要依據）。
 *
 * 2026-09-30（CJ「按照這張表所列出的真實尺寸調整」，OnBrand_圖片尺寸漏項清單.xlsx）：
 * 補上表中 P1（一般類、尺寸明確）與 P2（廣告類、官方已確認）的尺寸；P3（官方資料
 * 未取得、依模板而定）不建卡。gpt-image-2 生不出超過 3:1 的比例，TikTok Ad Network
 * 的 640×200／640×100 Banner 改用「方形主體＋背景色補滿」合成（compose）。每通路只預設擺兩張
 * （pinned），其餘由用戶在「新增尺寸」自己加（brands.positioning.__imageTray）。
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

/** 一般（自然觸及）或廣告版位——選尺寸時分兩組列。 */
export type ImagePlacement = "organic" | "ad";

export interface PlatformImageSpec {
  id: string;
  channel: ImageChannel;
  /** 沒寫＝organic。 */
  placement?: ImagePlacement;
  /** 沒挑過的品牌，這個通路預設擺出來的卡（每通路兩張）。 */
  pinned?: true;
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
  /**
   * 合成版型：比例超出模型能力（>3:1）的細長 Banner。模型只生成一塊方形主體圖
   * （單色背景），伺服器把主體放在 side 那一端，其餘用主體圖的背景色補滿——
   * 不裁切，也不拉伸。2026-09-30 CJ 同意 640×200／640×100 用這個方式。
   */
  compose?: { side: "left" | "right" };
  source: string;
}

const STORY_SAFE: SafeZone = { top: 0.14, bottom: 0.35, left: 0.06, right: 0.06 };
const TIKTOK_SAFE: SafeZone = { top: 0.07, bottom: 0.17, left: 0.04, right: 0.13 };

export const PLATFORM_IMAGE_SPECS: PlatformImageSpec[] = [
  // ── Facebook ────────────────────────────────────────────────────────────
  {
    id: "fb-img-feed-portrait", pinned: true, channel: "facebook",
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
    id: "fb-img-story", pinned: true, channel: "facebook",
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
    width: 851, height: 315, maxImages: 1, safeZone: { top: 0.05, bottom: 0.12, left: 0.12, right: 0.12 }, titleZone: "center",
    noteZh: "851×315（2026-09-30 依 CJ 的尺寸表）；手機會切掉左右兩側，左下角會被大頭貼蓋住。",
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
  {
    id: "fb-img-landscape", channel: "facebook",
    labelZh: "橫式貼文", labelEn: "Feed post · landscape",
    descZh: "橫幅照片貼文，適合場景、活動現場、多人合照。", descEn: "Wide photo post for scenes and group shots.",
    width: 1200, height: 628, maxImages: 1, titleZone: "left",
    noteZh: "1200×628（1.91:1）。",
    compositionEn: "Wide 1.91:1 landscape photo. Subject on the right half, calm clean area on the left for a headline.",
    format: "jpeg", source: "OnBrand_圖片尺寸漏項清單（2026-09-30，製作建議）",
  },
  {
    id: "fb-img-avatar", channel: "facebook",
    labelZh: "粉專大頭貼", labelEn: "Profile picture",
    descZh: "粉專頭像，會被裁成圓形。", descEn: "Page profile picture, cropped to a circle.",
    width: 1080, height: 1080, maxImages: 1, titleZone: "none",
    noteZh: "1080×1080；顯示時裁成圓形，四個角看不到。",
    compositionEn: "Square 1:1 profile image that will be displayed inside a circle: one simple centred subject well inside the inscribed circle, plain background, nothing important in the four corners, legible at very small size.",
    format: "png", source: "OnBrand_圖片尺寸漏項清單（2026-09-30，製作建議；圓形裁切）",
  },
  {
    id: "fb-img-group-cover", channel: "facebook",
    labelZh: "社團封面", labelEn: "Group cover",
    descZh: "社團頁頂端的橫幅。", descEn: "Banner at the top of a group.",
    width: 1640, height: 856, maxImages: 1, safeZone: { top: 0, bottom: 0, left: 0.1, right: 0.1 }, titleZone: "center",
    noteZh: "1640×856；手機會切掉左右兩側，重點放中間。",
    compositionEn: "Wide banner. Key subject in the centre; the left and right tenths may be cut on mobile, keep them atmospheric only.",
    format: "jpeg", source: "OnBrand_圖片尺寸漏項清單（2026-09-30，常用規格）",
  },

  // Facebook 廣告（Meta 廣告指南，2026-09-30 查證）
  {
    id: "fb-ad-feed-portrait", channel: "facebook", placement: "ad",
    labelZh: "廣告：動態消息直式", labelEn: "Ad · feed portrait",
    descZh: "動態消息單圖廣告，官方主推的比例。", descEn: "Single-image feed ad, Meta's recommended ratio.",
    width: 1440, height: 1800, maxImages: 1, titleZone: "top",
    noteZh: "1440×1800（4:5）；JPG/PNG、30MB 內。",
    compositionEn: "Vertical 4:5 advertising image. One clear focal subject in the middle, clean space in the upper area for a headline.",
    format: "jpeg", maxBytes: 30 * 1024 * 1024, source: "https://www.facebook.com/business/ads-guide/update/image",
  },
  {
    id: "fb-ad-square", channel: "facebook", placement: "ad",
    labelZh: "廣告：方形單圖", labelEn: "Ad · square",
    descZh: "動態消息、Marketplace、搜尋結果、商家探索、Reels 廣告版位都吃這個比例。", descEn: "Works across feed, Marketplace, search, Business Explore and Reels ad slots.",
    width: 1080, height: 1080, maxImages: 1, titleZone: "top",
    noteZh: "1:1，至少 1080×1080；30MB 內。",
    compositionEn: "Square 1:1 advertising image, subject centred, clean negative space along the top for a headline.",
    format: "jpeg", maxBytes: 30 * 1024 * 1024, source: "https://www.facebook.com/business/ads-guide/update/image",
  },
  {
    id: "fb-ad-carousel", channel: "facebook", placement: "ad",
    labelZh: "廣告：輪播", labelEn: "Ad · carousel",
    descZh: "動態消息、Marketplace、右側欄的輪播廣告，每張卡各帶連結。", descEn: "Carousel ads for feed, Marketplace and right column.",
    width: 1080, height: 1080, maxImages: 10, titleZone: "bottom",
    noteZh: "1:1，至少 1080×1080／張，2–10 張；每張 30MB 內。",
    compositionEn: "Square 1:1 carousel ad card. Subject centred slightly high; keep the bottom 20% clean for a caption strip. Consistent style across cards.",
    format: "jpeg", maxBytes: 30 * 1024 * 1024, source: "https://www.facebook.com/business/ads-guide/update/carousel",
  },
  {
    id: "fb-ad-story", channel: "facebook", placement: "ad",
    labelZh: "廣告：限時動態", labelEn: "Ad · Stories",
    descZh: "限時動態全螢幕單圖廣告。", descEn: "Full-screen Stories image ad.",
    width: 1440, height: 2560, maxImages: 1, safeZone: STORY_SAFE, titleZone: "center",
    noteZh: "1440×2560（9:16）；上 14%、下 35%、左右各 6% 不放重點。",
    compositionEn: "Full-screen vertical 9:16 advertising image. Keep the subject and all important content inside the central safe area.",
    format: "jpeg", maxBytes: 30 * 1024 * 1024, source: "https://www.facebook.com/business/ads-guide/update/image",
  },
  {
    id: "fb-ad-reels", channel: "facebook", placement: "ad",
    labelZh: "廣告：Reels 全螢幕", labelEn: "Ad · Reels full-screen",
    descZh: "Facebook Reels 裡的全螢幕圖片廣告。", descEn: "Full-screen image ad inside Facebook Reels.",
    width: 1440, height: 2560, maxImages: 1, safeZone: STORY_SAFE, titleZone: "center",
    noteZh: "1440×2560（9:16）；Reels「廣告版位」（影片下方那格）請用方形單圖。",
    compositionEn: "Full-screen vertical 9:16 advertising image; subject and focal area inside the central safe area, top and bottom kept as background.",
    format: "jpeg", maxBytes: 30 * 1024 * 1024, source: "https://www.facebook.com/business/ads-guide/update/image",
  },
  {
    id: "fb-ad-right-column", channel: "facebook", placement: "ad",
    labelZh: "廣告：右側欄", labelEn: "Ad · right column",
    descZh: "桌機右側欄，顯示得很小，圖上不要放字。", descEn: "Desktop right column; shown small, no text on image.",
    width: 1080, height: 1080, maxImages: 1, titleZone: "none",
    noteZh: "1:1，至少 1080×1080（最小 254×133）；官方建議圖上不放文字。",
    compositionEn: "Square 1:1 image that must read at thumbnail size: one bold simple subject, high contrast against a plain background, no fine detail.",
    format: "jpeg", maxBytes: 30 * 1024 * 1024, source: "https://www.facebook.com/business/ads-guide/update/image",
  },
  {
    id: "fb-ad-catalog", channel: "facebook", placement: "ad",
    labelZh: "商品目錄圖（動態商品廣告）", labelEn: "Catalog product image",
    descZh: "Commerce Manager 商品目錄用的商品圖，動態商品廣告與商店都會用到。", descEn: "Catalog image for dynamic product ads and Shops.",
    width: 1024, height: 1024, maxImages: 1, titleZone: "none",
    noteZh: "1:1，官方建議 1024×1024（至少 500×500）；JPG/PNG、8MB 內。同一目錄的圖請統一比例。",
    compositionEn: "Square 1:1 catalog product image, product as the clear hero, centred with even margins on a clean plain background.",
    format: "jpeg", maxBytes: 8 * 1024 * 1024, source: "https://www.facebook.com/business/help/686259348512056",
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
    id: "ig-img-feed-45", pinned: true, channel: "instagram",
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
    id: "ig-img-story", pinned: true, channel: "instagram",
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
  {
    id: "ig-img-carousel-square", channel: "instagram",
    labelZh: "方形輪播", labelEn: "Carousel · square",
    descZh: "方形的輪播貼文，第一張決定所有張的比例。", descEn: "Square carousel; the first slide sets the ratio.",
    width: 1080, height: 1080, maxImages: 20, titleZone: "top",
    noteZh: "1:1；全部張數同比例、同風格。",
    compositionEn: "Square 1:1 carousel slide in a consistent series style; subject centred and away from the left/right edges, headline space in the upper area.",
    format: "jpeg", source: "OnBrand_圖片尺寸漏項清單（2026-09-30，製作尺寸）",
  },
  {
    id: "ig-img-landscape", channel: "instagram",
    labelZh: "橫式貼文", labelEn: "Feed post · landscape",
    descZh: "橫幅照片；在動態裡佔的版面最小。", descEn: "Wide photo; smallest footprint in the feed.",
    width: 1080, height: 566, maxImages: 1, titleZone: "left",
    noteZh: "1080×566（約 1.91:1）；個人頁格狀會切掉兩側。",
    compositionEn: "Wide 1.91:1 landscape photo. Subject near the centre (the grid crops the sides), calm area on the left for a headline.",
    format: "jpeg", source: "OnBrand_圖片尺寸漏項清單（2026-09-30）",
  },
  {
    id: "ig-img-avatar", channel: "instagram",
    labelZh: "大頭貼", labelEn: "Profile picture",
    descZh: "帳號頭像，會被裁成圓形。", descEn: "Profile picture, cropped to a circle.",
    width: 1080, height: 1080, maxImages: 1, titleZone: "none",
    noteZh: "1080×1080；顯示時裁成圓形，四個角看不到。",
    compositionEn: "Square 1:1 profile image that will be displayed inside a circle: one simple centred subject well inside the inscribed circle, plain background, nothing important in the four corners, legible at very small size.",
    format: "png", source: "OnBrand_圖片尺寸漏項清單（2026-09-30，製作建議；圓形裁切）",
  },
  {
    id: "ig-img-highlight-cover", channel: "instagram",
    labelZh: "精選動態封面", labelEn: "Highlight cover",
    descZh: "個人頁精選動態的小圓圖，一組要風格一致。", descEn: "Small round highlight icon; keep the set consistent.",
    width: 1080, height: 1080, maxImages: 1, titleZone: "none",
    noteZh: "1080×1080；裁成圓形、顯示很小，只放一個簡單主體。",
    compositionEn: "Square 1:1 highlight cover shown as a tiny circle: a single simple centred motif on a flat plain background, generous margins, no fine detail.",
    format: "png", source: "OnBrand_圖片尺寸漏項清單（2026-09-30，製作建議；圓形裁切）",
  },

  // Instagram 廣告（Meta 廣告指南，2026-09-30 查證）
  {
    id: "ig-ad-feed-portrait", channel: "instagram", placement: "ad",
    labelZh: "廣告：動態消息直式", labelEn: "Ad · feed portrait",
    descZh: "動態消息單圖廣告，官方主推的比例。", descEn: "Single-image feed ad, Meta's recommended ratio.",
    width: 1440, height: 1800, maxImages: 1, titleZone: "top",
    noteZh: "1440×1800（4:5）；JPG/PNG、30MB 內。",
    compositionEn: "Vertical 4:5 advertising image. One clear focal subject in the middle, clean space in the upper area for a headline.",
    format: "jpeg", maxBytes: 30 * 1024 * 1024, source: "https://www.facebook.com/business/ads-guide/update/image",
  },
  {
    id: "ig-ad-feed-square", channel: "instagram", placement: "ad",
    labelZh: "廣告：動態消息方形", labelEn: "Ad · feed square",
    descZh: "方形單圖廣告，在官方比例範圍內（4:5 至 1.91:1）。", descEn: "Square single-image ad.",
    width: 1080, height: 1080, maxImages: 1, titleZone: "top",
    noteZh: "1:1，建議至少 1080×1080；30MB 內。",
    compositionEn: "Square 1:1 advertising image, subject centred, clean negative space along the top for a headline.",
    format: "jpeg", maxBytes: 30 * 1024 * 1024, source: "https://www.facebook.com/business/ads-guide/update/image",
  },
  {
    id: "ig-ad-carousel", channel: "instagram", placement: "ad",
    labelZh: "廣告：輪播", labelEn: "Ad · carousel",
    descZh: "純圖片輪播廣告；含影片的輪播只能用方形。", descEn: "Image-only carousel ad.",
    width: 1080, height: 1350, maxImages: 10, titleZone: "top",
    noteZh: "4:5，2–10 張；每張 30MB 內。要混影片的輪播請改用方形。",
    compositionEn: "Vertical 4:5 carousel ad slide in a consistent series style; headline space in the upper area.",
    format: "jpeg", maxBytes: 30 * 1024 * 1024, source: "https://www.facebook.com/business/ads-guide/update/carousel",
  },
  {
    id: "ig-ad-story", channel: "instagram", placement: "ad",
    labelZh: "廣告：限時動態", labelEn: "Ad · Stories",
    descZh: "限時動態全螢幕單圖廣告。", descEn: "Full-screen Stories image ad.",
    width: 1440, height: 2560, maxImages: 1, safeZone: STORY_SAFE, titleZone: "center",
    noteZh: "1440×2560（9:16）；上 14%、下 35%、左右各 6% 不放重點。",
    compositionEn: "Full-screen vertical 9:16 advertising image. Keep the subject and all important content inside the central safe area.",
    format: "jpeg", maxBytes: 30 * 1024 * 1024, source: "https://www.facebook.com/business/ads-guide/update/image",
  },
  {
    id: "ig-ad-story-carousel", channel: "instagram", placement: "ad",
    labelZh: "廣告：限時動態輪播", labelEn: "Ad · Stories carousel",
    descZh: "限時動態裡連續播放的多張圖廣告。", descEn: "Multi-card ad in Stories.",
    width: 1080, height: 1920, maxImages: 10, safeZone: STORY_SAFE, titleZone: "center",
    noteZh: "至少 1080×1920（9:16）／張；上 14%、下 35%、左右各 6% 不放重點。",
    compositionEn: "Full-screen vertical 9:16 slide in a consistent series style; all important content inside the central safe area.",
    format: "jpeg", maxBytes: 30 * 1024 * 1024, source: "https://www.facebook.com/business/ads-guide/update/carousel",
  },
  {
    id: "ig-ad-reels", channel: "instagram", placement: "ad",
    labelZh: "廣告：Reels", labelEn: "Ad · Reels",
    descZh: "Reels 裡的全螢幕圖片廣告。", descEn: "Full-screen image ad inside Reels.",
    width: 1440, height: 2560, maxImages: 1, safeZone: STORY_SAFE, titleZone: "center",
    noteZh: "1440×2560（9:16）；安全區同限時動態（上 14%、下 35%、左右 6%）。",
    compositionEn: "Full-screen vertical 9:16 advertising image; subject and focal area inside the central safe area.",
    format: "jpeg", maxBytes: 30 * 1024 * 1024, source: "https://www.facebook.com/business/ads-guide/update/image",
  },
  {
    id: "ig-ad-explore-home", channel: "instagram", placement: "ad",
    labelZh: "廣告：探索首頁", labelEn: "Ad · Explore home",
    descZh: "探索頁首頁格狀裡的廣告。", descEn: "Ad in the Explore home grid.",
    width: 1440, height: 1800, maxImages: 1, titleZone: "top",
    noteZh: "1440×1800（4:5）；30MB 內。",
    compositionEn: "Vertical 4:5 advertising image that stands out in a busy grid: one bold subject, simple background, headline space in the upper area.",
    format: "jpeg", maxBytes: 30 * 1024 * 1024, source: "https://www.facebook.com/business/ads-guide/update/image",
  },
  {
    id: "ig-ad-profile-feed", channel: "instagram", placement: "ad",
    labelZh: "廣告：個人檔案動態", labelEn: "Ad · profile feed",
    descZh: "出現在別人個人檔案貼文之間的廣告。", descEn: "Ad shown between posts on profiles.",
    width: 1440, height: 1800, maxImages: 1, titleZone: "top",
    noteZh: "官方沒有獨立規格：這個版位沿用動態消息的素材，所以用 4:5、1440×1800。",
    compositionEn: "Vertical 4:5 advertising image, one clear focal subject in the middle, headline space in the upper area.",
    format: "jpeg", maxBytes: 30 * 1024 * 1024, source: "https://www.facebook.com/business/help/2163679757136292",
  },
  {
    id: "ig-ad-search", channel: "instagram", placement: "ad",
    labelZh: "廣告：搜尋結果", labelEn: "Ad · search results",
    descZh: "IG 搜尋結果頁裡的廣告。", descEn: "Ad inside Instagram search results.",
    width: 1440, height: 1800, maxImages: 1, titleZone: "top",
    noteZh: "官方支援 1.91:1、16:9、1:1、4:5（圖片建議 4:5），不支援 2:3；像素沿用動態消息 1440×1800。",
    compositionEn: "Vertical 4:5 advertising image that stands out among search results: one bold subject, simple background, headline space in the upper area.",
    format: "jpeg", maxBytes: 30 * 1024 * 1024, source: "https://www.facebook.com/business/help/682655495435254",
  },
  {
    id: "ig-ad-catalog", channel: "instagram", placement: "ad",
    labelZh: "商品目錄圖（方形）", labelEn: "Catalog image · square",
    descZh: "購物廣告與 IG 商店用的商品圖（與 FB 共用同一份目錄）。", descEn: "Catalog image for shopping ads and IG Shops.",
    width: 1024, height: 1024, maxImages: 1, titleZone: "none",
    noteZh: "1:1，官方建議 1024×1024（至少 500×500）；JPG/PNG、8MB 內。",
    compositionEn: "Square 1:1 catalog product image, product as the clear hero, centred with even margins on a clean plain background.",
    format: "jpeg", maxBytes: 8 * 1024 * 1024, source: "https://www.facebook.com/business/help/686259348512056",
  },
  {
    id: "ig-ad-catalog-45", channel: "instagram", placement: "ad",
    labelZh: "商品目錄圖（直式 4:5）", labelEn: "Catalog image · 4:5",
    descZh: "只用目錄圖的輪播購物廣告可用 4:5，版面更大。", descEn: "4:5 for catalog-only carousel ads.",
    width: 1080, height: 1350, maxImages: 1, titleZone: "none",
    noteZh: "4:5，至少 1080 寬；同一目錄請統一比例，否則輪播會自動調整。",
    compositionEn: "Vertical 4:5 catalog product image, product as the clear hero, centred with even margins on a clean plain background.",
    format: "jpeg", maxBytes: 8 * 1024 * 1024, source: "https://www.facebook.com/business/ads-guide/update/carousel/instagram-feed/outcome-sales",
  },

  // ── Threads ─────────────────────────────────────────────────────────────
  {
    id: "threads-img-portrait", pinned: true, channel: "threads",
    labelZh: "單圖貼文（直式）", labelEn: "Single image · portrait",
    descZh: "Threads 照原比例顯示，直式最顯眼。", descEn: "Shown at original ratio; portrait stands out.",
    width: 1080, height: 1350, maxImages: 1, titleZone: "top",
    noteZh: "4:5；檔案 8MB 內。",
    compositionEn: "Vertical 4:5, conversational and candid feel, subject centred with headline space above.",
    format: "jpeg", maxBytes: 8 * 1024 * 1024, source: "https://developers.facebook.com/docs/threads/overview",
  },
  {
    id: "threads-img-square", pinned: true, channel: "threads",
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
  {
    id: "threads-img-landscape", channel: "threads",
    labelZh: "橫式貼文", labelEn: "Single image · landscape",
    descZh: "橫幅照片，適合場景與現場照。", descEn: "Wide photo for scenes.",
    width: 1200, height: 628, maxImages: 1, titleZone: "left",
    noteZh: "1200×628（1.91:1）；檔案 8MB 內。",
    compositionEn: "Wide 1.91:1 landscape, candid feel, subject on the right half, calm area on the left for a headline.",
    format: "jpeg", maxBytes: 8 * 1024 * 1024, source: "OnBrand_圖片尺寸漏項清單（2026-09-30，製作建議）",
  },
  {
    id: "threads-img-link", channel: "threads",
    labelZh: "分享連結預覽圖", labelEn: "Link preview image",
    descZh: "貼連結時自動帶出的預覽圖（取自網頁的分享圖）。", descEn: "Preview shown when a link is shared.",
    width: 1200, height: 630, maxImages: 1, titleZone: "left",
    noteZh: "1200×630；實際顯示可能被裁，重點放中間。",
    compositionEn: "Wide 1.91:1 share image, subject near the centre, readable as a small thumbnail, calm left area for a headline.",
    format: "jpeg", source: "OnBrand_圖片尺寸漏項清單（2026-09-30，實際顯示可能裁切）",
  },
  {
    id: "threads-img-avatar", channel: "threads",
    labelZh: "大頭貼", labelEn: "Profile picture",
    descZh: "帳號頭像，會被裁成圓形（與 IG 共用）。", descEn: "Profile picture, circle crop (shared with IG).",
    width: 1080, height: 1080, maxImages: 1, titleZone: "none",
    noteZh: "1080×1080；顯示時裁成圓形。",
    compositionEn: "Square 1:1 profile image that will be displayed inside a circle: one simple centred subject well inside the inscribed circle, plain background, nothing important in the four corners.",
    format: "png", source: "OnBrand_圖片尺寸漏項清單（2026-09-30，製作建議）",
  },

  // Threads 廣告：官方沒有另訂尺寸，沿用 Meta 既有單圖創意。
  {
    id: "threads-ad-portrait", channel: "threads", placement: "ad",
    labelZh: "廣告：直式單圖", labelEn: "Ad · portrait",
    descZh: "Threads 動態消息廣告，沿用 Meta 單圖廣告創意。", descEn: "Threads feed ad, reusing Meta single-image creative.",
    width: 1440, height: 1800, maxImages: 1, titleZone: "top",
    noteZh: "1440×1800（4:5）；台灣是否已開放 Threads 廣告，請先在廣告管理員確認。",
    compositionEn: "Vertical 4:5 advertising image, conversational feel, subject centred with headline space above.",
    format: "jpeg", source: "https://www.facebook.com/business/help/655859553779869",
  },
  {
    id: "threads-ad-square", channel: "threads", placement: "ad",
    labelZh: "廣告：方形單圖", labelEn: "Ad · square",
    descZh: "Threads 動態消息廣告的方形版本。", descEn: "Square Threads feed ad.",
    width: 1080, height: 1080, maxImages: 1, titleZone: "top",
    noteZh: "1080×1080（1:1）；台灣是否已開放 Threads 廣告，請先在廣告管理員確認。",
    compositionEn: "Square 1:1 advertising image, simple and candid, subject centred, headline space along the top.",
    format: "jpeg", source: "https://www.facebook.com/business/help/655859553779869",
  },

  // ── LINE 官方帳號 ────────────────────────────────────────────────────────
  {
    id: "line-img-richmsg", pinned: true, channel: "line",
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
    noteZh: "1040×1560（2:3），屬官方「自訂版型」1040×520–2080 範圍；自訂版型只能設一個點擊區。",
    compositionEn: "Vertical 2:3 promotional image; headline space at top, subject in the middle, calm bottom band for a call-to-action button.",
    format: "jpeg", maxBytes: 10 * 1024 * 1024, source: "https://www.lycbiz.com/jp/manual/OfficialAccountManager/rich-messages/",
  },
  {
    id: "line-img-richmenu-large", pinned: true, channel: "line",
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
    descZh: "大圖卡，左上有標語、下方有按鈕。", descEn: "Visual card with a label and button.",
    width: 1540, height: 1000, maxImages: 9, safeZone: { top: 0.15, bottom: 0.2, left: 0, right: 0 }, titleZone: "none",
    noteZh: "1.54:1（官方手冊；網路常見的 1.11:1 查無官方出處），最多 9 張；左上角與底部會被標語、按鈕蓋住。",
    compositionEn: "Landscape 1.54:1 visual card; subject centred, top-left corner and bottom band kept plain.",
    format: "jpeg", maxBytes: 10 * 1024 * 1024, source: "https://tw.linebiz.com/manual/line-official-account/20200515elearning05/",
  },
  ...([
    [350, "短橫幅", "Short banner", "Wide banner strip; one subject, calm and simple."],
    [585, "橫式", "Landscape", "Landscape image; subject centred, headline space on top."],
    [700, "中型", "Medium", "Landscape image; subject centred, headline space on top."],
    [1300, "直式", "Portrait", "Vertical image; headline space at top, subject in the middle, calm bottom band for a button."],
    [1850, "長版", "Extra tall", "Very tall image; headline at top, subject in the middle, calm bottom band for a button."],
  ] as const).map(([h, zh, en, comp]): PlatformImageSpec => ({
    id: `line-img-richmsg-${h}`, channel: "line",
    labelZh: `圖文訊息（${zh} 1040×${h}）`, labelEn: `Rich message · ${en}`,
    descZh: "官方圖文訊息版型之一，可在後台切點擊區。", descEn: "An official rich-message template.",
    width: 1040, height: h, maxImages: 1, titleZone: h <= 700 ? "left" : "top",
    noteZh: `1040×${h}；10MB 內。點擊區在 LINE 後台切，重點不要壓在切線上。`,
    compositionEn: comp,
    format: "jpeg", maxBytes: 10 * 1024 * 1024, source: "https://www.lycbiz.com/jp/manual/OfficialAccountManager/rich-messages/",
  })),
  {
    id: "line-img-card-person", channel: "line",
    labelZh: "多頁訊息（人物）", labelEn: "Card message · person",
    descZh: "介紹講師、店員、設計師的人物卡。", descEn: "Card introducing a person.",
    width: 1080, height: 1080, maxImages: 9, titleZone: "none",
    noteZh: "官方未限制比例，這裡做 1:1；JPG/PNG、10MB 內，最多 9 張。",
    compositionEn: "Square 1:1 portrait-style image, one person or persona-representing subject centred, plain background, consistent across cards.",
    format: "jpeg", maxBytes: 10 * 1024 * 1024, source: "https://tw.linebiz.com/manual/line-official-account/20200515elearning05/",
  },
  {
    id: "line-img-broadcast", channel: "line",
    labelZh: "一般圖片推播", labelEn: "Image broadcast",
    descZh: "直接推播一張圖片（不切點擊區）。", descEn: "Plain image message, no tap areas.",
    width: 1080, height: 1080, maxImages: 1, titleZone: "top",
    noteZh: "1080×1080；LINE 也收其他比例，方形在聊天室最穩。",
    compositionEn: "Square 1:1 image message, one clear focal subject, simple background, headline space in the upper area.",
    format: "jpeg", maxBytes: 10 * 1024 * 1024, source: "OnBrand_圖片尺寸漏項清單（2026-09-30）",
  },
  {
    id: "line-img-voom", channel: "line",
    labelZh: "VOOM 圖片貼文", labelEn: "LINE VOOM post",
    descZh: "LINE VOOM 動態上的圖片貼文。", descEn: "Image post on LINE VOOM.",
    width: 1080, height: 1080, maxImages: 1, titleZone: "top",
    noteZh: "1080×1080。",
    compositionEn: "Square 1:1 social post image, subject centred, clean space along the top for a headline.",
    format: "jpeg", source: "OnBrand_圖片尺寸漏項清單（2026-09-30，製作建議）",
  },
  {
    id: "line-img-avatar", channel: "line",
    labelZh: "官方帳號大頭貼", labelEn: "OA profile picture",
    descZh: "官方帳號頭像，會被裁成圓形。", descEn: "OA profile picture, circle crop.",
    width: 640, height: 640, maxImages: 1, titleZone: "none",
    noteZh: "640×640；顯示時裁成圓形。",
    compositionEn: "Square 1:1 profile image that will be displayed inside a circle: one simple centred subject well inside the inscribed circle, plain background, nothing important in the four corners.",
    format: "png", source: "OnBrand_圖片尺寸漏項清單（2026-09-30，製作建議；圓形裁切）",
  },
  {
    id: "line-img-cover", channel: "line",
    labelZh: "官方帳號封面", labelEn: "OA cover",
    descZh: "官方帳號主頁最上方的封面圖。", descEn: "Cover image on the OA profile page.",
    width: 1080, height: 878, maxImages: 1, safeZone: { top: 0, bottom: 0.2, left: 0, right: 0 }, titleZone: "center",
    noteZh: "1080×878（官方建議）；下緣會接到大頭貼與帳號名稱，重點放中間偏上。",
    compositionEn: "Near-square 1.23:1 cover, subject slightly above centre; the bottom fifth meets the profile picture and name, keep it plain.",
    format: "jpeg", source: "OnBrand_圖片尺寸漏項清單（2026-09-30，官方建議尺寸）",
  },

  // LINE 廣告（LAP Media Guide 2024／頭版 MVP 與 TODAY 官方素材規範，2026-09-30 查證）
  {
    id: "line-ad-lap-square", channel: "line", placement: "ad",
    labelZh: "LAP：正方形圖片", labelEn: "LAP · square",
    descZh: "LINE 廣告平台最通用的圖片素材。", descEn: "The most common LINE Ads image.",
    width: 1080, height: 1080, maxImages: 1, titleZone: "top",
    noteZh: "1080×1080；JPG/PNG、10MB 內。",
    compositionEn: "Square 1:1 advertising image, one clear focal subject, clean space along the top for a headline.",
    format: "jpeg", maxBytes: 10 * 1024 * 1024, source: "LAP Media Guide 2024（tw.linebiz.com/download/line-guaranteed-ads）",
  },
  {
    id: "line-ad-lap-landscape", channel: "line", placement: "ad",
    labelZh: "LAP：橫式圖片", labelEn: "LAP · landscape",
    descZh: "LINE 廣告平台的橫式圖片素材。", descEn: "Landscape LINE Ads image.",
    width: 1200, height: 628, maxImages: 1, titleZone: "left",
    noteZh: "1200×628；JPG/PNG、10MB 內。",
    compositionEn: "Wide 1.91:1 advertising image; subject on the right half, calm clean area on the left for a headline.",
    format: "jpeg", maxBytes: 10 * 1024 * 1024, source: "LAP Media Guide 2024（tw.linebiz.com/download/line-guaranteed-ads）",
  },
  {
    id: "line-ad-lap-small", channel: "line", placement: "ad",
    labelZh: "LAP：小圖片／Smart Channel", labelEn: "LAP · small / Smart Channel",
    descZh: "聊天列表頂端的 Smart Channel 等小版位。", descEn: "Small slots such as Smart Channel.",
    width: 600, height: 400, maxImages: 1, titleZone: "none",
    noteZh: "600×400；JPG/PNG、10MB 內；不支援 VOOM、錢包版位。",
    compositionEn: "Small 3:2 image that must read at thumbnail size: one bold simple subject, high contrast, plain background, no fine detail.",
    format: "jpeg", maxBytes: 10 * 1024 * 1024, source: "LAP Media Guide 2024（tw.linebiz.com/download/line-guaranteed-ads）",
  },
  {
    id: "line-ad-lap-carousel", channel: "line", placement: "ad",
    labelZh: "LAP：輪播", labelEn: "LAP · carousel",
    descZh: "TODAY、VOOM、錢包、主頁、點數版位的輪播廣告。", descEn: "Carousel for TODAY, VOOM, Wallet, Home, Points.",
    width: 1080, height: 1080, maxImages: 10, titleZone: "none",
    noteZh: "1080×1080／張，2–10 張（動態商品廣告最多 20 張）；JPG/PNG。",
    compositionEn: "Square 1:1 carousel card, subject centred with even margins, consistent style across cards.",
    format: "jpeg", maxBytes: 10 * 1024 * 1024, source: "LAP Media Guide 2024（tw.linebiz.com/download/line-guaranteed-ads）",
  },
  {
    id: "line-ad-mvp-image", channel: "line", placement: "ad",
    labelZh: "頭版 MVP：純圖片", labelEn: "Front-page MVP · image",
    descZh: "聊天列表頂端的大版位，只有中間一條一定看得到。", descEn: "Top-of-chat banner; only the central band is always visible.",
    width: 1280, height: 720, maxImages: 1, safeZone: { top: 0.24, bottom: 0.24, left: 0, right: 0 }, titleZone: "center",
    noteZh: "1280×720（16:9）；一定看得到的只有中間 1280×376，避開廣告標示與關閉鈕；10MB 內。",
    compositionEn: "Wide 16:9 banner whose guaranteed-visible area is only the central horizontal band (about the middle half): put the subject and focal detail in that band; the top and bottom quarters are background only.",
    format: "jpeg", maxBytes: 10 * 1024 * 1024, source: "LINE 頭版 MVP 純圖片素材規範 v8（官方 PDF）",
  },
  {
    id: "line-ad-mvp-fullscreen-banner", channel: "line", placement: "ad",
    labelZh: "全螢主打星：Banner", labelEn: "Full-screen MVP · banner",
    descZh: "全螢主打星點擊前看到的 Banner。", descEn: "The banner before the full-screen MVP opens.",
    width: 1280, height: 720, maxImages: 1, safeZone: { top: 0.24, bottom: 0.24, left: 0, right: 0 }, titleZone: "center",
    noteZh: "1280×720；10MB 內。點進去的聊天頁素材是另一張卡。",
    compositionEn: "Wide 16:9 banner; subject and focal detail in the central horizontal band, top and bottom quarters background only.",
    format: "jpeg", maxBytes: 10 * 1024 * 1024, source: "LINE 全螢主打星素材規範 v2（官方 PDF）",
  },
  {
    id: "line-ad-mvp-fullscreen-chat", channel: "line", placement: "ad",
    labelZh: "全螢主打星：聊天頁", labelEn: "Full-screen MVP · chat page",
    descZh: "點開全螢主打星後的直式滿版素材。", descEn: "Tall full-screen creative after tapping.",
    width: 640, height: 1284, maxImages: 1, safeZone: { top: 0.04, bottom: 0, left: 0, right: 0 }, titleZone: "center",
    noteZh: "640×1284；頂部 40px 固定黑底「AD provided by」；5MB 內。",
    compositionEn: "Tall 1:2 full-screen creative; the top strip is covered by a fixed black ad label, keep it plain; subject in the centre.",
    format: "jpeg", maxBytes: 5 * 1024 * 1024, source: "LINE 全螢主打星素材規範 v2（官方 PDF）",
  },
  {
    id: "line-ad-mvp-desktop", channel: "line", placement: "ad",
    labelZh: "電腦版頭版 MVP", labelEn: "Desktop front-page MVP",
    descZh: "LINE 電腦版的頭版大圖，主視覺只有中間一條。", descEn: "Desktop MVP; key visual is a central band.",
    width: 1280, height: 720, maxImages: 1, safeZone: { top: 0.31, bottom: 0.31, left: 0.094, right: 0.094 }, titleZone: "center",
    noteZh: "1280×720；主視覺區 1280×270（最大顯示 1280×338）；左右各留 120px 安全邊界。",
    compositionEn: "Wide 16:9 canvas whose visible key-visual area is only a thin central horizontal band: place the subject inside that band and away from the left/right edges; everything else is soft background.",
    format: "jpeg", source: "LINE 電腦版圖片規範 260228（官方 PDF）",
  },
  {
    id: "line-ad-today-billboard", channel: "line", placement: "ad",
    labelZh: "TODAY：大看板", labelEn: "TODAY · Billboard",
    descZh: "LINE TODAY 首頁的大看板單圖。", descEn: "LINE TODAY Billboard single image.",
    width: 1200, height: 600, maxImages: 1, titleZone: "left",
    noteZh: "1200×600（2:1）；JPG/PNG/GIF、950KB 內。",
    compositionEn: "Wide 2:1 billboard, subject on the right half, calm clean area on the left for a headline.",
    format: "jpeg", maxBytes: 950 * 1024, source: "LINE TODAY Billboard Sales Kit（官方 PDF）",
  },
  {
    id: "line-ad-today-collection-main", channel: "line", placement: "ad",
    labelZh: "TODAY：集合型主圖", labelEn: "TODAY · collection main",
    descZh: "集合型大看板的主圖，搭配 3 張方形副圖。", descEn: "Main image of a collection billboard.",
    width: 1200, height: 628, maxImages: 1, titleZone: "left",
    noteZh: "1200×628；950KB 內。副圖請用「集合型副圖」卡。",
    compositionEn: "Wide 1.91:1 hero image; subject on the right half, calm left area for a headline.",
    format: "jpeg", maxBytes: 950 * 1024, source: "LINE TODAY Billboard Sales Kit（官方 PDF）",
  },
  {
    id: "line-ad-today-collection-sub", channel: "line", placement: "ad",
    labelZh: "TODAY：集合型副圖", labelEn: "TODAY · collection tiles",
    descZh: "集合型大看板下方的 3 張方形副圖。", descEn: "Three square tiles under the main image.",
    width: 1080, height: 1080, maxImages: 3, titleZone: "none",
    noteZh: "1080×1080 × 3 張；950KB 內；三張風格一致。",
    compositionEn: "Square 1:1 product tile, subject centred with even margins, plain background, consistent across the three tiles.",
    format: "jpeg", maxBytes: 950 * 1024, source: "LINE TODAY Billboard Sales Kit（官方 PDF）",
  },
  {
    id: "line-ad-today-focus-cover", channel: "line", placement: "ad",
    labelZh: "TODAY：焦點大看板封面", labelEn: "TODAY · focus billboard cover",
    descZh: "焦點大看板的 16:9 封面。", descEn: "16:9 cover of the focus billboard.",
    width: 1920, height: 1080, maxImages: 1, titleZone: "left",
    noteZh: "1920×1080；2MB 內。",
    compositionEn: "Wide 16:9 cover; subject centre-right, calm left third for a headline.",
    format: "jpeg", maxBytes: 2 * 1024 * 1024, source: "LINE TODAY Billboard Sales Kit（官方 PDF）",
  },
  {
    id: "line-ad-today-floating", channel: "line", placement: "ad",
    labelZh: "TODAY：浮動 Banner", labelEn: "TODAY · floating banner",
    descZh: "文章頁側邊的直式浮動 Banner。", descEn: "Tall floating banner beside articles.",
    width: 300, height: 600, maxImages: 1, titleZone: "top",
    noteZh: "300×600（1:2）；950KB 內。",
    compositionEn: "Tall 1:2 skyscraper banner; headline space at the top, subject in the lower half, reads well at small size.",
    format: "jpeg", maxBytes: 950 * 1024, source: "LINE TODAY Billboard Sales Kit（官方 PDF）",
  },
  {
    id: "line-ad-today-scroller", channel: "line", placement: "ad",
    labelZh: "TODAY：Scroller", labelEn: "TODAY · Scroller",
    descZh: "文章捲動時出現的橫式素材。", descEn: "Landscape creative revealed while scrolling.",
    width: 1200, height: 628, maxImages: 1, titleZone: "left",
    noteZh: "1200×628；JPG/PNG、950KB 內（依 2025-08 上架表；舊版素材指南寫 1125×588）。",
    compositionEn: "Wide 1.91:1 image; subject on the right half, calm left area for a headline.",
    format: "jpeg", maxBytes: 950 * 1024, source: "LINE TODAY Ad Publication Form 2508（tw.linebiz.com/download/line-guaranteed-ads）",
  },
  {
    id: "line-ad-today-backdrop", channel: "line", placement: "ad",
    labelZh: "TODAY：Backdrop", labelEn: "TODAY · Backdrop",
    descZh: "文章頁背景滿版的直式圖片版位。", descEn: "Tall full-bleed backdrop behind articles.",
    width: 1080, height: 1620, maxImages: 1, safeZone: { top: 0.1, bottom: 0.1, left: 0.08, right: 0.08 }, titleZone: "center",
    noteZh: "1080×1620（2:3）；JPG/PNG、950KB 內、不可透明。官方上架表有標安全區，重點放中間。",
    compositionEn: "Vertical 2:3 backdrop; subject and focal detail in the central area, edges atmospheric only.",
    format: "jpeg", maxBytes: 950 * 1024, source: "LINE TODAY Ad Publication Form 2508（tw.linebiz.com/download/line-guaranteed-ads）",
  },
  {
    id: "line-ad-today-masthead", channel: "line", placement: "ad",
    labelZh: "TODAY：Masthead 橫幅", labelEn: "TODAY · Masthead banner",
    descZh: "頁首的細長橫幅；右側主體、左側品牌色底可疊標題。", descEn: "Thin masthead banner.",
    width: 1125, height: 294, maxImages: 1, titleZone: "left", compose: { side: "right" },
    noteZh: "1125×294（3.83:1 超出 AI 原生比例：方形主體放右端＋同色背景補滿）；950KB 內。另需 144×144 圓形 logo 與 11 字內標題，請用品牌 logo 原檔。",
    compositionEn: "One bold, simple subject that reads at a small size.",
    format: "jpeg", maxBytes: 950 * 1024, source: "LINE TODAY Ad Publication Form 2508（tw.linebiz.com/download/line-guaranteed-ads）",
  },
  {
    id: "line-ad-today-inread", channel: "line", placement: "ad",
    labelZh: "TODAY：In-read 圖片", labelEn: "TODAY · In-read image",
    descZh: "文章內文中間出現的圖片廣告。", descEn: "Image ad inside article text.",
    width: 1200, height: 628, maxImages: 1, titleZone: "left",
    noteZh: "1200×628；JPG/PNG、950KB 內。",
    compositionEn: "Wide 1.91:1 image; subject on the right half, calm left area for a headline.",
    format: "jpeg", maxBytes: 950 * 1024, source: "LINE TODAY Ad Publication Form 2508（tw.linebiz.com/download/line-guaranteed-ads）",
  },
  {
    id: "line-ad-visionbox-banner", channel: "line", placement: "ad",
    labelZh: "TODAY：Vision Box 底部橫幅", labelEn: "TODAY · Vision Box banner",
    descZh: "Vision Box 收合時的底部細長橫幅。", descEn: "Collapsed bottom banner of Vision Box.",
    width: 1125, height: 294, maxImages: 1, titleZone: "left", compose: { side: "right" },
    noteZh: "1125×294（安全區 1000×236；左上 50%×35% 是 AD 標示）。3.83:1 超出 AI 原生比例：方形主體放右端＋同色背景補滿。",
    compositionEn: "One bold, simple subject that reads at a small size.",
    format: "jpeg", maxBytes: 950 * 1024, source: "LINE TODAY Vision Box 設計規範 260320（官方 PDF）",
  },
  {
    id: "line-ad-visionbox-full", channel: "line", placement: "ad",
    labelZh: "TODAY：Vision Box 全螢幕", labelEn: "TODAY · Vision Box full-screen",
    descZh: "Vision Box 展開後的直式全螢幕圖。", descEn: "Expanded full-screen Vision Box image.",
    width: 640, height: 1280, maxImages: 1, safeZone: { top: 0.07, bottom: 0.3, left: 0.055, right: 0.055 }, titleZone: "center",
    noteZh: "640×1280（安全區 570×768）；小螢幕會切掉下方 640×384，左上 AD 標示、右上關閉鈕要避開；不建議透明 PNG。",
    compositionEn: "Tall 1:2 full-screen image; subject and focal detail in the upper-middle area, the bottom third may be hidden on small phones, keep corners plain.",
    format: "jpeg", maxBytes: 950 * 1024, source: "LINE TODAY Vision Box 設計規範 260320（官方 PDF）",
  },
  {
    id: "line-ad-oap-cover", channel: "line", placement: "ad",
    labelZh: "TODAY 官方帳號推播：封面", labelEn: "TODAY OAP · cover",
    descZh: "LINE TODAY 官方帳號推播（主 OA）的封面圖。", descEn: "Cover image of a LINE TODAY OA push.",
    width: 520, height: 336, maxImages: 1, titleZone: "none",
    noteZh: "520×336、2MB 內（官方規範表 2023-04 版，送件前請再核對）。屬性 OA 封面要用官方 PSD 範本。",
    compositionEn: "Small landscape cover, one clear subject, simple background, reads well as a thumbnail.",
    format: "jpeg", maxBytes: 2 * 1024 * 1024, source: "OAP 情報快遞廣編文規範表 v230424（官方 xlsx）",
  },
  {
    id: "line-ad-oap-article", channel: "line", placement: "ad",
    labelZh: "TODAY 官方帳號推播：內文圖", labelEn: "TODAY OAP · article images",
    descZh: "推播文章內的圖片，最多 5 張。", descEn: "Up to 5 images inside the OA push article.",
    width: 1920, height: 1080, maxImages: 5, titleZone: "none",
    noteZh: "1920×1080，最多 5 張、每張 2MB 內（官方規範表 2023-04 版）。",
    compositionEn: "Wide 16:9 editorial image, one clear subject, consistent style across the set.",
    format: "jpeg", maxBytes: 2 * 1024 * 1024, source: "OAP 情報快遞廣編文規範表 v230424（官方 xlsx）",
  },
  {
    id: "line-ad-wallet-popup", channel: "line", placement: "ad",
    labelZh: "錢包蓋板", labelEn: "Wallet popup",
    descZh: "LINE 錢包分頁跳出的蓋板廣告圖。", descEn: "Popup ad on the LINE Wallet tab.",
    width: 1125, height: 960, maxImages: 1, safeZone: { top: 0.08, bottom: 0.15, left: 0.07, right: 0.07 }, titleZone: "top",
    noteZh: "1125×960 PNG、400–600KB；左上 AD 標示、分級標示與法定文字（≥21pt）會佔位；主標 10 字、按鈕 18 字內。",
    compositionEn: "Near-square 1.17:1 popup visual; subject centred, corners and the bottom band kept plain for badges and a button.",
    format: "png", maxBytes: 600 * 1024, source: "Wallet Tab Popup AD Guide v7（官方 PDF，2025-09）",
  },
  {
    id: "line-ad-desktop-community", channel: "line", placement: "ad",
    labelZh: "電腦版社群廣告", labelEn: "Desktop community ad",
    descZh: "LINE 電腦版社群的圖片廣告。", descEn: "Image ad in LINE desktop communities.",
    width: 1280, height: 720, maxImages: 1, titleZone: "left",
    noteZh: "1280×720、PNG/JPG、10MB 內（官方上架表 2025-12）；製作規範未公開，重點放中間。",
    compositionEn: "Wide 16:9 image; subject centre-right, calm left third for a headline.",
    format: "jpeg", maxBytes: 10 * 1024 * 1024, source: "LINE Desktop Ad 廣告上架表－社群 2512（官方 xlsx）",
  },

  // ── TikTok ──────────────────────────────────────────────────────────────
  {
    id: "tt-img-photo", pinned: true, channel: "tiktok",
    labelZh: "圖文輪播", labelEn: "Photo carousel",
    descZh: "TikTok 相片模式，最多 35 張，全螢幕直式。", descEn: "Photo Mode, up to 35 images.",
    width: 1080, height: 1920, maxImages: 35, safeZone: TIKTOK_SAFE, titleZone: "top",
    noteZh: "9:16；右側 13% 有按讚列、下方 17% 有文案，避開。",
    compositionEn: "Full-screen vertical 9:16 slide in a consistent series style; right edge and bottom band kept free of important content.",
    format: "jpeg", maxBytes: 20 * 1024 * 1024, source: "https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide",
  },
  {
    id: "tt-img-cover", pinned: true, channel: "tiktok",
    labelZh: "影片封面", labelEn: "Video cover",
    descZh: "個人頁格狀約切成 3:4，標題放中間。", descEn: "Grid crops to ~3:4.",
    width: 1080, height: 1920, maxImages: 1, safeZone: { top: 0.125, bottom: 0.125, left: 0, right: 0 }, titleZone: "center",
    noteZh: "9:16；重點放中間 3:4 範圍。",
    compositionEn: "Vertical 9:16 cover; subject and focal area inside the central 3:4 region.",
    format: "jpeg", source: "https://blog.hootsuite.com/social-media-image-sizes-guide/",
  },
  {
    id: "tt-img-avatar", channel: "tiktok",
    labelZh: "大頭貼", labelEn: "Profile picture",
    descZh: "帳號頭像，會被裁成圓形。", descEn: "Profile picture, circle crop.",
    width: 400, height: 400, maxImages: 1, titleZone: "none",
    noteZh: "400×400（官方最低 20×20）；顯示時裁成圓形。",
    compositionEn: "Square 1:1 profile image that will be displayed inside a circle: one simple centred subject well inside the inscribed circle, plain background, nothing important in the four corners.",
    format: "png", source: "https://support.tiktok.com/en/getting-started/setting-up-your-profile/adding-a-profile-photo-or-video",
  },

  // TikTok 廣告（TikTok Ads 官方說明頁；動態內廣告頁失效，尺寸以 Ad Network 頁旁證，2026-09-30）
  {
    id: "tt-ad-carousel-vertical", channel: "tiktok", placement: "ad",
    labelZh: "廣告：輪播直式", labelEn: "Ad · carousel vertical",
    descZh: "標準輪播廣告的直式圖；也適用 Ad Network 插頁／獎勵型輪播。", descEn: "Vertical carousel ad; also Ad Network carousels.",
    width: 720, height: 1280, maxImages: 10, safeZone: TIKTOK_SAFE, titleZone: "top",
    noteZh: "720×1280（9:16）；右側 13%、下方 17% 避開。張數依廣告後台（Ad Network 最多 50 張）。",
    compositionEn: "Vertical 9:16 carousel ad slide in a consistent series style; right edge and bottom band kept free of important content.",
    format: "jpeg", source: "https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets",
  },
  {
    id: "tt-ad-carousel-square", channel: "tiktok", placement: "ad",
    labelZh: "廣告：輪播方形", labelEn: "Ad · carousel square",
    descZh: "標準輪播廣告的方形圖；也適用 Ad Network 輪播。", descEn: "Square carousel ad.",
    width: 640, height: 640, maxImages: 10, titleZone: "top",
    noteZh: "640×640（1:1）；JPG/PNG。",
    compositionEn: "Square 1:1 carousel ad slide, subject centred, consistent series style.",
    format: "jpeg", source: "https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets",
  },
  {
    id: "tt-ad-carousel-landscape", channel: "tiktok", placement: "ad",
    labelZh: "廣告：輪播橫式", labelEn: "Ad · carousel landscape",
    descZh: "標準輪播廣告的橫式圖；也適用 Ad Network 輪播。", descEn: "Landscape carousel ad.",
    width: 1200, height: 628, maxImages: 10, titleZone: "left",
    noteZh: "1200×628（1.91:1）；JPG/PNG。",
    compositionEn: "Wide 1.91:1 carousel ad slide; subject on the right half, calm left area for a headline, consistent series style.",
    format: "jpeg", source: "https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets",
  },
  {
    id: "tt-ad-catalog", channel: "tiktok", placement: "ad",
    labelZh: "廣告：購物商品圖", labelEn: "Ad · shopping catalog image",
    descZh: "商品目錄與購物廣告直接使用的商品圖。", descEn: "Catalog image used by shopping ads.",
    width: 1080, height: 1080, maxImages: 1, titleZone: "none",
    noteZh: "官方只規定最小 500×500、JPEG/PNG；這裡做 1080×1080 方形。",
    compositionEn: "Square 1:1 catalog product image, product as the clear hero, centred with even margins on a clean plain background.",
    format: "jpeg", source: "https://ads.tiktok.com/help/article/best-practices-for-a-high-quality-catalog",
  },
  {
    id: "tt-an-vertical", channel: "tiktok", placement: "ad",
    labelZh: "Ad Network：直式單圖", labelEn: "Ad Network · vertical",
    descZh: "插頁、開屏、原生、Banner 版位的直式單圖。", descEn: "Interstitial, splash, native, banner.",
    width: 720, height: 1280, maxImages: 1, titleZone: "top",
    noteZh: "720×1280；JPG/PNG、100MB 內。",
    compositionEn: "Vertical 9:16 advertising image, subject in the middle, headline space in the upper area.",
    format: "jpeg", source: "https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets",
  },
  {
    id: "tt-an-square", channel: "tiktok", placement: "ad",
    labelZh: "Ad Network：方形單圖", labelEn: "Ad Network · square",
    descZh: "插頁、開屏、原生、Banner 版位的方形單圖。", descEn: "Square single image.",
    width: 640, height: 640, maxImages: 1, titleZone: "top",
    noteZh: "640×640；JPG/PNG。",
    compositionEn: "Square 1:1 advertising image, subject centred, headline space along the top.",
    format: "jpeg", source: "https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets",
  },
  {
    id: "tt-an-landscape", channel: "tiktok", placement: "ad",
    labelZh: "Ad Network：橫式單圖", labelEn: "Ad Network · landscape",
    descZh: "插頁、開屏、原生、Banner 版位的橫式單圖。", descEn: "Landscape single image.",
    width: 1200, height: 628, maxImages: 1, titleZone: "left",
    noteZh: "1200×628；JPG/PNG。",
    compositionEn: "Wide 1.91:1 advertising image; subject on the right half, calm left area for a headline.",
    format: "jpeg", source: "https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets",
  },
  {
    id: "tt-an-banner", channel: "tiktok", placement: "ad",
    labelZh: "Ad Network：專用 Banner", labelEn: "Ad Network · banner",
    descZh: "Ad Network 專用 Banner 版位。", descEn: "Dedicated Ad Network banner.",
    width: 600, height: 500, maxImages: 1, titleZone: "none",
    noteZh: "600×500；JPG/PNG。",
    compositionEn: "Near-square 1.2:1 banner that reads at small size: one bold subject, plain background, no fine detail.",
    format: "jpeg", source: "https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets",
  },
  {
    id: "tt-an-banner-640x200", channel: "tiktok", placement: "ad",
    labelZh: "Ad Network：Banner 640×200", labelEn: "Ad Network · banner 640×200",
    descZh: "細長 Banner：右側放主體，左側是品牌色底，可疊標題。", descEn: "Thin banner: subject on the right, flat colour on the left.",
    width: 640, height: 200, maxImages: 1, titleZone: "left", compose: { side: "right" },
    noteZh: "3.2:1 超出 AI 原生比例：生成方形主體後，放在右端、其餘補上同色背景（不裁切）。",
    compositionEn: "One bold, simple subject that reads at a tiny size.",
    format: "jpeg", source: "https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets",
  },
  {
    id: "tt-an-banner-640x100", channel: "tiktok", placement: "ad",
    labelZh: "Ad Network：Banner 640×100", labelEn: "Ad Network · banner 640×100",
    descZh: "最細的 Banner：右側小主體，左側是品牌色底，可疊短標題。", descEn: "Thinnest banner: small subject right, colour on the left.",
    width: 640, height: 100, maxImages: 1, titleZone: "left", compose: { side: "right" },
    noteZh: "6.4:1 超出 AI 原生比例：生成方形主體後，放在右端、其餘補上同色背景（不裁切）。",
    compositionEn: "One bold, very simple subject that still reads at icon size.",
    format: "jpeg", source: "https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets",
  },

  // ── 電子報 ──────────────────────────────────────────────────────────────
  {
    id: "email-img-hero", pinned: true, channel: "email",
    labelZh: "電子報主視覺", labelEn: "Newsletter hero",
    descZh: "信件最上方的大圖；標題與按鈕請用信件文字，不要做進圖裡。", descEn: "Top banner; keep headline and CTA as live text.",
    width: 1200, height: 600, maxImages: 1, titleZone: "none",
    noteZh: "1200×600（600 寬版型的兩倍解析度）；Outlook 預設擋圖，重要資訊別只放圖上。",
    compositionEn: "Wide 2:1 banner, one clear subject, uncluttered background that reads well small.",
    format: "jpeg", maxBytes: 1024 * 1024, source: "https://mailchimp.com/help/image-requirements-for-templates/",
  },
  {
    id: "email-img-inline", pinned: true, channel: "email",
    labelZh: "內文滿版圖", labelEn: "Inline full-width",
    descZh: "內文段落之間的滿版圖。", descEn: "Full-width image between sections.",
    width: 1200, height: 800, maxImages: 1, titleZone: "none",
    noteZh: "3:2，1200 寬。",
    compositionEn: "Landscape 3:2 editorial image, one clear subject.",
    format: "jpeg", maxBytes: 1024 * 1024, source: "https://mailchimp.com/help/image-requirements-for-templates/",
  },
  {
    id: "email-img-product", channel: "email",
    labelZh: "雙欄商品圖", labelEn: "Two-column product image",
    descZh: "兩欄商品格用的方形圖。", descEn: "Square images for a two-column grid.",
    width: 600, height: 600, maxImages: 6, titleZone: "none",
    noteZh: "600×600（欄寬約 300 的兩倍）；同一封信風格一致。",
    compositionEn: "Square 1:1 product-grid image, subject centred with even margins, plain background, consistent across the set.",
    format: "jpeg", source: "https://mailchimp.com/help/image-requirements-for-templates/",
  },
  {
    id: "email-img-product-3col", channel: "email",
    labelZh: "三欄商品圖", labelEn: "Three-column product image",
    descZh: "三欄商品格用的小方圖。", descEn: "Small squares for a three-column grid.",
    width: 400, height: 400, maxImages: 9, titleZone: "none",
    noteZh: "400×400（600–660 版型扣掉欄距後，欄寬約 180–200 的兩倍）。",
    compositionEn: "Small square 1:1 product-grid image that reads at thumbnail size: product centred with even margins, plain background, consistent across the set.",
    format: "jpeg", source: "OnBrand_圖片尺寸漏項清單（2026-09-30，各欄顯示尺寸的 2 倍）",
  },
  {
    id: "email-img-footer", channel: "email",
    labelZh: "頁尾圖片", labelEn: "Footer image",
    descZh: "信件最下方的滿版橫幅（品牌形象、門市、社群導流）。", descEn: "Full-width banner at the bottom of the email.",
    width: 1200, height: 480, maxImages: 1, titleZone: "none",
    noteZh: "寬 1200（600 版型的兩倍）；高度依內容，這裡預設 2.5:1。",
    compositionEn: "Wide 2.5:1 footer banner, quiet and atmospheric, one simple subject, reads well small.",
    format: "jpeg", maxBytes: 1024 * 1024, source: "OnBrand_圖片尺寸漏項清單（2026-09-30，配合 600–660 px 模板）",
  },

  // ── 官網 ────────────────────────────────────────────────────────────────
  {
    id: "web-img-hero-desktop", pinned: true, channel: "website",
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
    id: "web-img-og", pinned: true, channel: "website",
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

/**
 * 模型實際要生成的尺寸。一般卡＝交付尺寸；合成版型（compose）只生成方形主體，
 * 邊長＝交付高度。
 */
export function generationSize(spec: Pick<PlatformImageSpec, "width" | "height" | "compose">): { width: number; height: number } {
  return spec.compose ? { width: spec.height, height: spec.height } : { width: spec.width, height: spec.height };
}

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

/** Nano Banana 可以指定的比例（Gemini image generation 文件）。 */
export const NANO_BANANA_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"] as const;
export type NanoBananaRatio = (typeof NANO_BANANA_RATIOS)[number];

/**
 * 每個比例標籤 Nano Banana 實際回傳的像素（gemini-2.5-flash-image）。標籤只是「最接近的桶」：
 * 2026-09-29 實測 "9:16" 回 768×1344（其實是 4:7，差 1.6%）。所以能不能給 Nano Banana，
 * 看的是實際輸出比例，不是標籤。
 */
export const NANO_BANANA_OUTPUT: Record<NanoBananaRatio, [number, number]> = {
  "1:1": [1024, 1024], "2:3": [832, 1248], "3:2": [1248, 832], "3:4": [864, 1184], "4:3": [1184, 864],
  "4:5": [896, 1152], "5:4": [1152, 896], "9:16": [768, 1344], "16:9": [1344, 768], "21:9": [1536, 672],
};

/** 這個交付尺寸 Nano Banana 的實際輸出比例是否一致（≤1%）——不一致回 null，卡片不給選 Nano Banana。 */
export function nanoRatioFor(width: number, height: number): NanoBananaRatio | null {
  const r = width / height;
  for (const label of NANO_BANANA_RATIOS) {
    const [w, h] = NANO_BANANA_OUTPUT[label];
    if (ratioError(w / h, r) <= RATIO_TOLERANCE) return label;
  }
  return null;
}

/** 顯示用的比例標籤。 */
function niceRatio(width: number, height: number): string | null {
  const r = width / height;
  for (const label of NANO_BANANA_RATIOS) {
    const [a = 0, b = 1] = label.split(":").map(Number);
    if (ratioError(a / b, r) <= 0.005) return label;
  }
  return null;
}

export function ratioLabel(width: number, height: number): string {
  const nice = niceRatio(width, height);
  if (nice) return nice;
  return `${(width / height).toFixed(2).replace(/\.?0+$/, "")}:1`;
}

export function getImageSpec(id: string): PlatformImageSpec | undefined {
  return PLATFORM_IMAGE_SPECS.find((s) => s.id === id);
}

// ── 圖片托盤：每通路預設兩張，其餘用戶自己加 ─────────────────────────────
// 2026-09-30（CJ「圖片類別的任務卡不需要一次全部列出，只要列出兩張後，用戶可以
// 自己新增該平台的不同尺寸圖片進去」）。存法沿用任務托盤：
// brands.positioning.__imageTray[channel] = string[]。

/** 單一通路最多擺幾張。 */
export const MAX_IMAGE_TRAY = 12;

export function defaultImageTray(channel: string): string[] {
  return PLATFORM_IMAGE_SPECS.filter((s) => s.channel === channel && s.pinned).map((s) => s.id);
}

/**
 * 這個品牌在這個通路擺哪幾張。存過的要跟現有規格交集（卡退役或改通路就濾掉）；
 * 沒存過或交集後一張不剩 → 系統預設兩張，不給空畫面。
 */
export function resolveImageTray(positioning: unknown, channel: string): { ids: string[]; isDefault: boolean } {
  const tray = positioning && typeof positioning === "object" ? (positioning as any).__imageTray : null;
  const raw = tray && typeof tray === "object" ? (tray as any)[channel] : null;
  const valid = new Set(PLATFORM_IMAGE_SPECS.filter((s) => s.channel === channel).map((s) => s.id));
  const ids = Array.isArray(raw)
    ? [...new Set(raw.filter((x): x is string => typeof x === "string" && valid.has(x)))].slice(0, MAX_IMAGE_TRAY)
    : [];
  return ids.length ? { ids, isDefault: false } : { ids: defaultImageTray(channel), isDefault: true };
}

/**
 * 寫進 prompt 的畫布與構圖指令——比例限制在這裡講死，而不是事後裁。
 */
export function canvasPromptBlock(spec: PlatformImageSpec): string {
  const lines: string[] = [];
  if (spec.compose) {
    lines.push(
      `CANVAS (mandatory): square 1:1 subject tile. It will sit at the ${spec.compose.side} end of a very wide ${spec.width}x${spec.height} banner; ` +
      `the rest of that banner is filled with this image's background colour. So: one subject, centred with comfortable margins, ` +
      `on a single plain flat solid-colour background (use a brand colour if given) — no gradient, no vignette, no texture, ` +
      `no shadow or object touching any edge. Nothing will be cropped.`,
    );
    lines.push(`FRAMING: ${spec.compositionEn}`);
    return lines.join("\n");
  }
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
