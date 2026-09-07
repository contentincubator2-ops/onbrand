/**
 * taskFormats —— 七個平台的任務卡「形式分類」(pill) 對照表。
 *
 * 2026-08-23 (CJ「要跟著做」) —— FB 先做了，這次把其餘 6 個平台一起收進來。
 *
 * 這七份表原本埋在 PlatformTaskPage.tsx 裡（162 條手抄），沒有任何東西能
 * 驗證它們跟真實任務目錄對不對得上。實際發生過兩次漂移：
 *   · FB：90s 退役後 11 個 key 全指向不存在的任務、6 張 fb-99 沒被分類，
 *     「貼文」pill 只剩 3 張，「月曆 / 策略」與「輪播」兩個 pill 整個不渲染
 *   · IG：3 個 key 指向被 99s allowlist 濾掉、根本不會出現的任務
 *
 * 現在由 server/_core/taskFormatCoverage.test.ts 對照
 * server/_core/taskCatalogIndex.ts（router 與測試共用的同一份目錄）鎖住：
 *   ① 沒有死 key（每個 key 都對得到真的列得出來的任務）
 *   ② 每張列得出來的卡都被分類，或明確列入 *_UNMAPPED_BY_DESIGN
 *   ③ 每個 pill 至少一張卡（count===0 的 pill 在 UI 上根本不渲染）
 *
 * 「列得出來」的定義以 taskCatalogIndex 為準：存在於 catalog 但被 99s
 * allowlist 濾掉的任務不算，給它們分類等於再造一批死 key。
 *
 * *_UNMAPPED_BY_DESIGN 是 CJ 2026-08-23「這些如果不屬於哪個分類，那就按照
 * 現在的方式顯示，只有點全部才看到」的落點——区分「決定過不分類」與
 * 「漏掉了」。
 *
 * 根治是把 format 變成 server 端任務定義上的欄位，client 動態算 pill；
 * 這一步先把「漂了也沒人知道」改成「漂了就紅」。
 */

export type FBActiveFormat =
  | "all" | "貼文" | "連結貼文" | "廣告" | "輪播 Carousel"
  | "多媒體" | "直播" | "釘選貼文" | "活動 / 系列" | "月曆 / 策略" | "互動 / 工具";

export const FB_FORMAT_TABS: { id: FBActiveFormat; label: string; labelEn: string }[] = [
  { id: "all",            label: "全部",          labelEn: "All"                },
  { id: "貼文",           label: "貼文",          labelEn: "Posts"              },
  { id: "連結貼文",       label: "連結貼文",      labelEn: "Link Posts"         },
  { id: "廣告",           label: "廣告",          labelEn: "Ads"                },
  { id: "輪播 Carousel",  label: "輪播 Carousel", labelEn: "Carousel"           },
  { id: "多媒體",         label: "多媒體",        labelEn: "Media"              },
  { id: "直播",           label: "直播",          labelEn: "Live"               },
  { id: "釘選貼文",       label: "釘選貼文",      labelEn: "Pinned Posts"       },
  { id: "活動 / 系列",    label: "活動 / 系列",   labelEn: "Events & Series"    },
  { id: "月曆 / 策略",    label: "月曆 / 策略",   labelEn: "Calendar & Strategy"},
  { id: "互動 / 工具",    label: "互動 / 工具",   labelEn: "Engagement & Tools" },
];

export const FB_TASK_FORMAT_MAP: Record<string, FBActiveFormat> = {
  // 爆款結構卡（2026-09-05）
  "fb-30-ad-viral-monologue":      "廣告",
  "fb-30-reel-self-roast":         "多媒體",
  "fb-30-carousel-data-recap":     "輪播 Carousel",
  "fb-30-album-period-recap":      "多媒體",
  "fb-30-story-serial-event":      "多媒體",
  "fb-30-pinned-stance":           "釘選貼文",
  "fb-30-comment-signal-boost":    "互動 / 工具",
  "fb-30-event-challenge":         "活動 / 系列",
  // ── 貼文 ──────────────────────────────────────────────────────────────
  "fb-30-caption-short":          "貼文",
  "fb-30-pure-text-hook":         "貼文",
  "fb-60-single-full":            "貼文",
  // 2026-08-23：改寫類三張本質上就是貼文（差別在素材來源：爆款 / 客戶
  // 見證 / 時事），退役前沒有 fb-90 對應，是這次新判的。
  "fb-99-viral-rewrite":          "貼文",
  "fb-99-testimonial-rewrite":    "貼文",
  "fb-99-trend-rewrite":          "貼文",
  // 同上，方法論驅動但交付物就是單篇貼文
  "fb-99-offer-first":            "貼文",
  "fb-99-magnetic-marketing":     "貼文",

  // ── 連結貼文 ──────────────────────────────────────────────────────────
  "fb-30-link-caption":           "連結貼文",
  "fb-60-link-full":              "連結貼文",

  // ── 廣告 ──────────────────────────────────────────────────────────────
  "fb-30-ad-headline":            "廣告",
  "fb-30-ad-primary":             "廣告",
  "fb-30-ad-cta":                 "廣告",
  "fb-30-ad-description":         "廣告",
  "fb-60-ad-pack-3":              "廣告",

  // ── 輪播 Carousel ─────────────────────────────────────────────────────
  // 接手已退役的 fb-90-carousel-10frame。這個 pill 先前 count===0 完全不
  // 渲染，等於兩張輪播卡沒有入口。
  "fb-99-carousel-5":             "輪播 Carousel",
  "fb-99-carousel-cvo":           "輪播 Carousel",

  // ── 多媒體（Album + Reels + Story）─────────────────────────────────────
  "fb-60-album-4":                "多媒體",
  "fb-30-story-text":             "多媒體",
  "fb-99-reels-script":           "多媒體",   // 接手 fb-90-reels-full

  // ── 直播 ──────────────────────────────────────────────────────────────
  "fb-30-live-title":             "直播",
  "fb-60-live-suite":             "直播",

  // ── 釘選貼文 ──────────────────────────────────────────────────────────
  "fb-30-pinned-short":           "釘選貼文",
  "fb-60-pinned-suite":           "釘選貼文",

  // ── 活動 / 系列 ───────────────────────────────────────────────────────
  "fb-30-countdown-1day":         "活動 / 系列",
  "fb-60-countdown-5day":         "活動 / 系列",
  "fb-60-launch-kit":             "活動 / 系列",
  "fb-99-14day-countdown":        "活動 / 系列",  // 接手 fb-90-countdown-series
  "fb-99-mass-control":           "活動 / 系列",  // 大型發表會劇本 ≈ 舊 fb-90-event-launch
  "fb-99-serial-3":               "活動 / 系列",  // 3 篇連載＝系列

  // ── 月曆 / 策略 ───────────────────────────────────────────────────────
  // 這個 pill 先前四個 key 全是死的 fb-90-*，count===0 直接不渲染。
  "fb-99-30day-calendar":         "月曆 / 策略",
  "fb-99-monthly-calendar-promo": "月曆 / 策略",
  "fb-99-account-reposition":     "月曆 / 策略",
  "fb-99-quarterly-strategy":     "月曆 / 策略",
  "fb-99-monthly-analytics":      "月曆 / 策略",

  // ── 互動 / 工具 ───────────────────────────────────────────────────────
  "fb-30-comment-reply":          "互動 / 工具",
  "fb-30-hashtag-set":            "互動 / 工具",
  // 2026-08-23: cw-* 是跨平台工具，因為 id 前綴沒有對應規則，在 router 裡
  // fallback 成 facebook（與 platformOfTaskId 一致），所以實際出現在 FB 頁。
  // 它們不是 FB 的貼文「形式」，歸到工具類（與 hashtag-set / comment-reply 同性質）。
  "cw-60-crosspost-4platform":    "互動 / 工具",
  "cw-60-ab-variants":            "互動 / 工具",
};

/**
 * 目錄裡有、但刻意不給分類的任務 —— 只會在「全部」出現。
 *
 * 2026-08-23 CJ：「這些如果不屬於哪個分類，那就按照現在的方式顯示，只有點
 * 全部才看到。」這個集合就是那句話的落點：不是漏掉，是決定過。
 *
 * 目前三張都是 quickTaskRouter.listFB 的 99s allowlist **沒有放行**的任務
 * —— 它們根本不會出現在清單裡，給分類等於再造一批死 key（正是這次要修的
 * 病）。哪天 allowlist 放行了，測試 ② 會逼你回來做決定。
 */
export const FB_UNMAPPED_BY_DESIGN = new Set<string>([]);

// ── Format category config (IG) ─────────────────────────────────────────────
export type IGActiveFormat =
  | "all" | "Feed 貼文" | "Reels" | "Carousel 輪播"
  | "Story 限時" | "Live 直播" | "個人頁" | "互動 / 工具" | "策略 / 月曆";

export const IG_FORMAT_TABS: { id: IGActiveFormat; label: string; labelEn: string }[] = [
  { id: "all",            label: "全部",          labelEn: "All"                  },
  { id: "Feed 貼文",      label: "Feed 貼文",     labelEn: "Feed Posts"           },
  { id: "Reels",          label: "Reels",         labelEn: "Reels"                },
  { id: "Carousel 輪播",  label: "Carousel 輪播", labelEn: "Carousel"             },
  { id: "Story 限時",     label: "Story 限時",    labelEn: "Stories"              },
  { id: "Live 直播",      label: "Live 直播",     labelEn: "Live"                 },
  { id: "個人頁",         label: "個人頁",        labelEn: "Profile"              },
  { id: "互動 / 工具",    label: "互動 / 工具",   labelEn: "Engagement & Tools"   },
  { id: "策略 / 月曆",    label: "策略 / 月曆",   labelEn: "Strategy & Calendar"  },
];

export const IG_TASK_FORMAT_MAP: Record<string, IGActiveFormat> = {
  // 爆款結構卡（2026-09-05）
  "ig-30-feed-single-object":        "Feed 貼文",
  "ig-30-reel-brand-event":          "Reels",
  "ig-30-carousel-proof-set":        "Carousel 輪播",
  "ig-30-story-one-action":          "Story 限時",
  "ig-30-profile-self-insert":       "個人頁",
  "ig-30-live-host-relay":           "Live 直播",
  "ig-30-post-platform-firstday":    "互動 / 工具",
  // Feed 貼文
  "ig-30-caption-short":         "Feed 貼文",
  "ig-30-pure-text-hook":        "Feed 貼文",
  "ig-30-hashtag-set":           "Feed 貼文",
  "ig-60-feed-full":             "Feed 貼文",
  "ig-60-countdown-5day":        "Feed 貼文",
  "ig-60-serial-3":              "Feed 貼文",
  "ig-60-viral-rewrite":         "Feed 貼文",
  "ig-60-testimonial-rewrite":   "Feed 貼文",
  // Reels
  "ig-30-reel-hook":             "Reels",
  "ig-30-reel-script-full":      "Reels",
  "ig-60-reel-full":             "Reels",
  // Carousel 輪播
  "ig-30-carousel-structure":    "Carousel 輪播",
  "ig-60-carousel-7":            "Carousel 輪播",
  "ig-99-save-worthy":           "Carousel 輪播",
  // Story 限時
  "ig-30-story-text":            "Story 限時",
  "ig-30-story-repost-strategy": "Story 限時",
  "ig-60-story-3frame":          "Story 限時",
  // Live 直播
  "ig-30-live-opening":          "Live 直播",
  "ig-60-live-suite":            "Live 直播",
  "ig-60-live-event":            "Live 直播",
  "ig-60-live-founder":          "Live 直播",
  "ig-60-live-versus":            "Live 直播",
  "ig-60-live-comeback":          "Live 直播",
  "ig-60-live-collab-drop":       "Live 直播",
  "ig-60-live-first-ever":        "Live 直播",
  "ig-60-live-behind-scenes":     "Live 直播",
  "ig-60-live-crew":              "Live 直播",
  // 個人頁
  "ig-30-bio-rewrite":           "個人頁",
  "ig-60-highlight-suite":       "個人頁",
  // 互動 / 工具
  "ig-30-comment-reply":         "互動 / 工具",
  "ig-30-dm-script":             "互動 / 工具",
  "ig-30-threads-cross-post":    "互動 / 工具",
  // 策略 / 月曆
  "ig-99-monthly-calendar":      "策略 / 月曆",
  "ig-99-youtility":             "策略 / 月曆",
  "ig-99-visual-story":          "策略 / 月曆",
  "ig-99-live-first":            "策略 / 月曆",
  "ig-99-document":              "策略 / 月曆",
  "ig-99-radical-transparency":  "策略 / 月曆",
};

// ── Format category config (LI) ─────────────────────────────────────────────
export type LIActiveFormat =
  | "all" | "貼文" | "Article 長文" | "投票"
  | "Newsletter" | "Document" | "Thought Leadership" | "客戶案例" | "個人頁 / 觸達";

export const LI_FORMAT_TABS: { id: LIActiveFormat; label: string; labelEn: string }[] = [
  { id: "all",                label: "全部",             labelEn: "All"               },
  { id: "貼文",               label: "貼文",             labelEn: "Posts"             },
  { id: "Article 長文",       label: "Article 長文",     labelEn: "Articles"          },
  { id: "投票",               label: "投票",             labelEn: "Polls"             },
  { id: "Newsletter",         label: "Newsletter",       labelEn: "Newsletter"        },
  { id: "Document",           label: "Document",         labelEn: "Documents"         },
  { id: "Thought Leadership", label: "Thought Leadership",labelEn: "Thought Leadership"},
  { id: "客戶案例",           label: "客戶案例",         labelEn: "Case Studies"      },
  { id: "個人頁 / 觸達",      label: "個人頁 / 觸達",    labelEn: "Profile & Outreach"},
];

export const LI_TASK_FORMAT_MAP: Record<string, LIActiveFormat> = {
  // 爆款結構卡（2026-09-05）
  "li-30-feed-cost-of-stance":         "貼文",
  "li-30-article-own-the-failure":     "Article 長文",
  "li-30-document-proof-deck":         "Document",
  "li-30-newsletter-referral-loop":    "Newsletter",
  "li-30-poll-public-wager":           "投票",
  // 貼文
  "li-30-insight-post":            "貼文",
  "li-30-hook-3":                  "貼文",
  "li-30-event-invite":            "貼文",
  // Article 長文
  "li-30-article-opener":          "Article 長文",
  // 投票
  "li-30-poll":                    "投票",
  // Newsletter
  "li-30-newsletter":              "Newsletter",
  "li-60-newsletter":              "Newsletter",
  "li-99-newsletter-quarterly":    "Newsletter",
  // Document
  "li-30-document":                "Document",
  // Thought Leadership
  "li-60-thought-leader":          "Thought Leadership",
  "li-99-30day-thought-leadership":"Thought Leadership",
  // 客戶案例
  "li-60-case-study":              "客戶案例",
  // 個人頁 / 觸達
  "li-30-dm-intro":                "個人頁 / 觸達",
  "li-30-comment":                 "個人頁 / 觸達",
  "li-30-headline":                "個人頁 / 觸達",
};

// ── Format category config (YT) ─────────────────────────────────────────────
// 2026-08-01 (CJ「參考 HeyGen 重新設計 YT 分類」): 舊分類是按「輸出格式」
// 切（縮圖/Community/互動…），跟用戶心裡「我現在有什麼素材」的順序不一致。
// 新分類改按 HeyGen 的成熟度階梯排：純文案（已有影片/腳本，只要文字）→
// 腳本（從零寫可拍的腳本）→ 分鏡圖（腳本拆成逐鏡頭示意圖）→ 影片（AI 真的
// 生成會動的素材）。系列/策略維持獨立分類，因為那些是跨多個階梯的整包產出。
export type YTActiveFormat =
  | "all" | "純文案" | "腳本" | "分鏡圖" | "影片" | "系列 / 策略";

export const YT_FORMAT_TABS: { id: YTActiveFormat; label: string; labelEn: string }[] = [
  { id: "all",         label: "全部",        labelEn: "All"               },
  { id: "純文案",      label: "純文案",      labelEn: "Pure Copy"         },
  { id: "腳本",        label: "腳本",        labelEn: "Script"            },
  { id: "分鏡圖",      label: "分鏡圖",      labelEn: "Storyboard"        },
  { id: "影片",        label: "影片",      labelEn: "Video"           },
  { id: "系列 / 策略", label: "系列 / 策略", labelEn: "Series & Strategy" },
];

export const YT_TASK_FORMAT_MAP: Record<string, YTActiveFormat> = {
  // 爆款結構卡（2026-09-05）
  "yt-30-live-test-demo":              "影片",
  "yt-30-premiere-countdown-room":     "系列 / 策略",
  "yt-30-watch-mirror-test":           "純文案",
  "yt-30-shorts-sound-brand":          "腳本",
  "yt-30-storyboard-one-take":         "分鏡圖",
  "yt-30-thumbnail-one-object":        "純文案",
  "yt-30-community-cliffhanger":       "純文案",
  "yt-30-videocard-single-action":     "純文案",
  // 純文案 — 已有影片/主題，只需要文字（標題/說明/留言/社群貼文）
  "yt-30-title-strategies":  "純文案",
  "yt-30-thumbnail-text":    "純文案",
  "yt-30-description-seo":   "純文案",
  "yt-30-chapter-timeline":  "純文案",
  "yt-30-comment-reply":     "純文案",
  "yt-30-pinned-comment":    "純文案",
  "yt-30-community-post":    "純文案",
  "yt-60-video-package":     "純文案",
  "yt-60-community-post":    "純文案",
  // 腳本 — 從零規劃可拍攝的腳本（口播/字幕/鏡頭指示）
  "yt-30-shorts-script":     "腳本",
  "yt-30-opening-hook":      "腳本",
  "yt-30-end-cta":           "腳本",
  "yt-60-shorts-script":     "腳本",
  "yt-60-viral-rewrite":     "腳本",
  // 分鏡圖 — 腳本拆成逐格 AI 示意圖（縮圖包也算：同一套靜圖引擎產出多格視覺）
  "yt-60-thumbnail-suite":   "分鏡圖",
  "yt-60-storyboard":        "分鏡圖",
  // 影片 — AI 真的生成會動的素材（image-to-video）
  "yt-30-shorts-clip":       "影片",
  // 系列 / 策略 — 跨階梯的整包產出
  "yt-60-series-3ep":        "系列 / 策略",
  "yt-99-series-6ep":        "系列 / 策略",
  "yt-99-quarterly-strategy":"系列 / 策略",
  "yt-99-premiere-kit":      "系列 / 策略",
};

// ── Format category config (TT) ─────────────────────────────────────────────
//
// 2026-07-29 (CJ「重新盤點 tiktok 的任務」): the old tabs were an ad-hoc mix
// of format (腳本 / 字幕), surface (Live / 個人頁) and mechanic (Trend / Duet),
// so users couldn't tell what they'd actually receive from any given card.
//
// Replaced with a PRODUCTION-DEPTH LADDER — each rung is a legitimate place
// to stop, and the order also happens to track cost and wait time
// (文案 ≈ instant/free → 模擬影片 ≈ minutes and real spend), so the category
// itself sets the right expectation before the user clicks:
//
//   選題 → 文案 → 腳本 → 分鏡表 → 模擬影片
//
// 帳號營運 sits deliberately OUTSIDE the ladder: bio / comment replies / live
// openers aren't stages of producing one piece of content, and folding them
// in would blur what the ladder means.
//
// Empty tabs are hidden automatically (see the count===0 guard at render), so
// 分鏡表 stays invisible until its cards land.
export type TTActiveFormat =
  | "all" | "選題" | "文案" | "腳本" | "分鏡表" | "模擬影片" | "帳號營運";

export const TT_FORMAT_TABS: { id: TTActiveFormat; label: string; labelEn: string }[] = [
  { id: "all",        label: "全部",     labelEn: "All"            },
  { id: "選題",       label: "選題",     labelEn: "Ideation"       },
  { id: "文案",       label: "文案",     labelEn: "Copy"           },
  { id: "腳本",       label: "腳本",     labelEn: "Scripts"        },
  { id: "分鏡表",     label: "分鏡表",   labelEn: "Storyboard"     },
  { id: "模擬影片",   label: "模擬影片", labelEn: "Simulated Video" },
  { id: "帳號營運",   label: "帳號營運", labelEn: "Account Ops"    },
];

export const TT_TASK_FORMAT_MAP: Record<string, TTActiveFormat> = {
  // 爆款結構卡（2026-09-05）
  "tt-30-live-relay-host":             "腳本",
  "tt-30-profile-self-aware":          "帳號營運",
  "tt-30-storyboard-catch-wave":       "分鏡表",
  // 選題 — 還沒有內容之前，決定「要做什麼」
  "tt-30-trend-remix":         "選題",
  "tt-30-duet-angle":          "選題",
  "tt-99-trend-week":          "選題",
  "tt-99-30day-foryou":        "選題",
  "tt-60-series-3":            "選題",
  // 文案 — 交付物就是可直接貼上的文字
  "tt-30-caption-description": "文案",
  "tt-30-hashtag-set":         "文案",
  // 腳本 — 交付物是「可以照著拍」的腳本
  "tt-30-opening-hook":        "腳本",
  "tt-30-full-script":         "腳本",
  "tt-30-caption-rhythm":      "腳本",
  "tt-60-foryou-full":         "腳本",
  "tt-60-viral-rewrite":       "腳本",
  // 2026-08-23 高互動機制卡 — 從史上最多讚的 10 支 TikTok 反推出的 5 種
  // 視覺機制，一種機制一張卡，用戶自己挑要拍哪一種。
  "tt-30-visual-illusion":     "腳本",
  "tt-30-process-payoff":      "腳本",
  "tt-30-beat-sync":           "腳本",
  "tt-30-scale-reveal":        "腳本",
  "tt-30-real-reaction":       "腳本",
  // 分鏡表 — 腳本與影片之間的橋
  "tt-30-storyboard":          "分鏡表",
  // 模擬影片 — 真的產出 mp4
  "tt-30-product-hero":        "模擬影片",
  "tt-30-product-asmr":        "模擬影片",
  "tt-30-text-hook-card":      "模擬影片",
  "tt-30-before-after":        "模擬影片",
  // 帳號營運 — 階梯之外，不隸屬於任何單一支內容
  "tt-30-bio-rewrite":         "帳號營運",
  "tt-30-comment-reply":       "帳號營運",
  "tt-30-live-opening":        "帳號營運",
};

// ── Format category config (Email) ──────────────────────────────────────────
export type EMActiveFormat =
  | "all" | "主旨 / 預覽" | "Newsletter / 培育"
  | "促銷 / 發佈" | "歡迎 / Onboarding" | "挽回 / 再活化" | "開發 / 交易";

export const EM_FORMAT_TABS: { id: EMActiveFormat; label: string; labelEn: string }[] = [
  { id: "all",               label: "全部",              labelEn: "All"                        },
  { id: "主旨 / 預覽",       label: "主旨 / 預覽",       labelEn: "Subject & Preview"          },
  { id: "Newsletter / 培育", label: "Newsletter / 培育", labelEn: "Newsletter & Nurture"       },
  { id: "促銷 / 發佈",       label: "促銷 / 發佈",       labelEn: "Promo & Launch"             },
  { id: "歡迎 / Onboarding", label: "歡迎 / Onboarding", labelEn: "Welcome & Onboarding"       },
  { id: "挽回 / 再活化",     label: "挽回 / 再活化",     labelEn: "Win-back & Re-engagement"   },
  { id: "開發 / 交易",       label: "開發 / 交易",       labelEn: "Prospecting & Transactional"},
];

export const EM_TASK_FORMAT_MAP: Record<string, EMActiveFormat> = {
  // 爆款結構卡（2026-09-05）
  "em-30-annual-recap":                "Newsletter / 培育",
  // 主旨 / 預覽
  "em-30-subject-line":    "主旨 / 預覽",
  "em-30-preview-text":    "主旨 / 預覽",
  // Newsletter / 培育
  "em-60-newsletter-full": "Newsletter / 培育",
  "em-30-drip":            "Newsletter / 培育",
  "em-99-4week-nurture":   "Newsletter / 培育",
  // 促銷 / 發佈
  "em-30-promo":           "促銷 / 發佈",
  "em-30-event-invite":    "促銷 / 發佈",
  "em-60-promo-sequence":  "促銷 / 發佈",
  "em-99-launch-sequence": "促銷 / 發佈",
  // 歡迎 / Onboarding
  "em-30-welcome":         "歡迎 / Onboarding",
  "em-60-onboarding-3":    "歡迎 / Onboarding",
  // 挽回 / 再活化
  "em-30-abandoned-cart":  "挽回 / 再活化",
  "em-30-re-engagement":   "挽回 / 再活化",
  // 開發 / 交易
  "em-30-cold-email":      "開發 / 交易",
  "em-30-transactional":   "開發 / 交易",
};

// ── Format category config (PR) ─────────────────────────────────────────────
export type PRActiveFormat =
  | "all" | "新聞稿" | "文件 / 素材" | "媒體關係" | "社群擴散" | "策略 / 發佈";

export const PR_FORMAT_TABS: { id: PRActiveFormat; label: string; labelEn: string }[] = [
  { id: "all",         label: "全部",         labelEn: "All"                    },
  { id: "新聞稿",      label: "新聞稿",       labelEn: "Press Releases"         },
  { id: "文件 / 素材", label: "文件 / 素材",  labelEn: "Docs & Assets"          },
  { id: "媒體關係",    label: "媒體關係",     labelEn: "Media Relations"        },
  { id: "社群擴散",    label: "社群擴散",     labelEn: "Social Amplification"   },
  { id: "策略 / 發佈", label: "策略 / 發佈",  labelEn: "Strategy & Launch"      },
];

export const PR_TASK_FORMAT_MAP: Record<string, PRActiveFormat> = {
  // 爆款結構卡（2026-09-05）
  "pr-30-stunt-release":               "新聞稿",
  "pr-30-media-own-mistake":           "媒體關係",
  // 新聞稿
  "pr-30-headline":          "新聞稿",
  "pr-30-subhead":           "新聞稿",
  "pr-30-lead-paragraph":    "新聞稿",
  "pr-60-news-release-full": "新聞稿",
  // 文件 / 素材
  "pr-30-boilerplate":       "文件 / 素材",
  "pr-30-fact-sheet":        "文件 / 素材",
  "pr-30-ceo-quote":         "文件 / 素材",
  // 媒體關係
  "pr-30-media-pitch":       "媒體關係",
  "pr-30-spokesperson-qa":   "媒體關係",
  // 社群擴散
  "pr-30-launch-social":     "社群擴散",
  // 策略 / 發佈
  "pr-30-news-hook":         "策略 / 發佈",
  "pr-99-launch-toolkit":    "策略 / 發佈",
  "pr-99-newsjack":          "策略 / 發佈",
};

// ── 官網 (web-) ─────────────────────────────────────────────────────────
// 2026-08-29 (CJ「官網長文會新增一個官網類別，裡面有長文還有產品描述的
// 不同類別的任務」)。品牌自己的官網，不是社群通路。
export type WEBActiveFormat = "all" | "長文" | "產品描述";

export const WEB_FORMAT_TABS: { id: WEBActiveFormat; label: string; labelEn: string }[] = [
  { id: "all",      label: "全部",     labelEn: "All"          },
  { id: "長文",     label: "長文",     labelEn: "Long-form"    },
  { id: "產品描述", label: "產品描述", labelEn: "Product Copy" },
];

export const WEB_TASK_FORMAT_MAP: Record<string, WEBActiveFormat> = {
  // 爆款結構卡（2026-09-05）
  "web-30-longform-open-books":        "長文",
  "web-30-product-page-plain-talk":    "產品描述",
  // 長文
  "web-30-longform":     "長文",
  "web-30-column":       "長文",
  "web-30-case-study":   "長文",
  // 產品描述
  "web-30-product-desc": "產品描述",
  "web-30-product-faq":  "產品描述",
};

/** WEB: 目前沒有刻意不分類的卡。新卡不想進 pill 就加進來。 */
export const WEB_UNMAPPED_BY_DESIGN = new Set<string>([]);

/** IG: 目前沒有刻意不分類的卡。新卡不想進 pill 就加進來。 */
export const IG_UNMAPPED_BY_DESIGN = new Set<string>([]);

/** LI: 目前沒有刻意不分類的卡。新卡不想進 pill 就加進來。 */
export const LI_UNMAPPED_BY_DESIGN = new Set<string>([]);

/** YT: 目前沒有刻意不分類的卡。新卡不想進 pill 就加進來。 */
export const YT_UNMAPPED_BY_DESIGN = new Set<string>([]);

/** TT: 目前沒有刻意不分類的卡。新卡不想進 pill 就加進來。 */
export const TT_UNMAPPED_BY_DESIGN = new Set<string>([]);

/** EM: 目前沒有刻意不分類的卡。新卡不想進 pill 就加進來。 */
export const EM_UNMAPPED_BY_DESIGN = new Set<string>([]);

/** PR: 目前沒有刻意不分類的卡。新卡不想進 pill 就加進來。 */
export const PR_UNMAPPED_BY_DESIGN = new Set<string>([]);
