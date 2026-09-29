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

/**
 * 2026-09-10 (CJ「我要移除自創的類別名稱，例如多媒體、月曆、互動，改成
 * Facebook 真實用語。釘選貼文也改成置頂貼文」)
 *
 * ── 改了什麼 ─────────────────────────────────────────────────────────
 *   多媒體      → 拆成 相簿 / Reels / 限時動態（Meta 是三個不同的東西，
 *                 我們把它們併成一個自己發明的詞）
 *   釘選貼文    → 置頂貼文（Facebook 繁中官方用「置頂」）
 *   輪播 Carousel → 輪播（Meta 繁中就叫輪播，不需要並列英文）
 *   活動 / 系列 → 活動（「系列」是我們的概念，交給 tier 承擔）
 *   月曆 / 策略 → 移除。裡面 2 張是「交付貼文的企劃」→ 歸貼文；
 *                 3 張（帳號定位 / 季策略 / 月報）不是貼文形式 → 不分類
 *   互動 / 工具 → 拆成 留言（Facebook 有）＋ 不分類（主題標籤、跨平台工具）
 *
 * ── 一條原則 ─────────────────────────────────────────────────────────
 * 形式軸只描述**交付物的形式**，數量與規劃層次由 tier（單篇／套組／企劃）
 * 承擔。所以 30 天行事曆歸「貼文」—— 它交付的就是貼文，只是一次 30 篇。
 * 這樣「貼文」會變成最大的一格（15 張），那是誠實的：Facebook 自己也沒有
 * 把貼文再往下分類。
 *
 * ── Facebook 沒有對應詞的卡不要硬塞 ──────────────────────────────────
 * 帳號定位、季策略、月成效報告、主題標籤組、跨平台工具 —— 這五類不是
 * Facebook 的貼文形式。放進 FB_UNMAPPED_BY_DESIGN（只在「全部」出現），
 * 不要為它們發明一個聽起來像 Facebook 的詞。那正是這次要移除的東西。
 *
 * 廣告先保留單一分類。Meta 的廣告是「目標 × 版位 × 格式」三層，而我們只有
 * 6 張廣告卡且全部是欄位卡（標題／主文案／說明／CTA），照搬 6 個行銷活動
 * 目標會有 4 個空分類 —— 開分類要出得了貨，這是 Amazon 與 X 的教訓。
 */
export type FBActiveFormat =
  | "all" | "貼文" | "連結貼文" | "相簿" | "輪播" | "Reels"
  | "限時動態" | "直播" | "置頂貼文" | "活動" | "留言" | "廣告";

export const FB_FORMAT_TABS: { id: FBActiveFormat; label: string; labelEn: string }[] = [
  { id: "all",        label: "全部",       labelEn: "All"         },
  // 順序照粉絲專頁發布工具：先貼文，再各種形式，互動類在後。
  { id: "貼文",       label: "貼文",       labelEn: "Posts"       },
  { id: "連結貼文",   label: "連結貼文",   labelEn: "Link Posts"  },
  { id: "相簿",       label: "相簿",       labelEn: "Albums"      },
  { id: "輪播",       label: "輪播",       labelEn: "Carousel"    },
  // Meta 繁中官方譯名是「連續短片」，但台灣行銷人與使用者實際都講 Reels。
  // 這裡選使用者認得的那個 —— 認得出來比字面正確重要。
  { id: "Reels",      label: "Reels",      labelEn: "Reels"       },
  { id: "限時動態",   label: "限時動態",   labelEn: "Stories"     },
  { id: "直播",       label: "直播",       labelEn: "Live"        },
  { id: "置頂貼文",   label: "置頂貼文",   labelEn: "Pinned Posts"},
  { id: "活動",       label: "活動",       labelEn: "Events"      },
  { id: "留言",       label: "留言",       labelEn: "Comments"    },
  // 廣告放最後 —— 它是另一個軸（Meta 的廣告管理員），不是貼文形式。
  { id: "廣告",       label: "廣告",       labelEn: "Ads"         },
];

export const FB_TASK_FORMAT_MAP: Record<string, FBActiveFormat> = {
  // ── 貼文 ──────────────────────────────────────────────────────────────
  // 最大的一格，而且應該是。Facebook 自己也沒有把貼文再往下分類；
  // 「幾篇」與「是不是企劃」由 tier 表示，不是形式。
  "fb-30-caption-short":          "貼文",
  "fb-30-pure-text-hook":         "貼文",
  "fb-60-single-full":            "貼文",
  // 改寫類：差別在素材來源（爆款 / 客戶見證 / 時事），交付物都是單篇貼文。
  "fb-99-viral-rewrite":          "貼文",
  "fb-99-testimonial-rewrite":    "貼文",
  "fb-99-trend-rewrite":          "貼文",
  // 方法論驅動，交付物仍是貼文。
  "fb-99-offer-first":            "貼文",
  "fb-99-magnetic-marketing":     "貼文",
  // 2026-09-10：以下六張原本散在「活動 / 系列」與「月曆 / 策略」。它們交付
  // 的都是貼文（連載 3 篇、倒數 5 / 14 天、30 天行事曆、發表會劇本），
  // 只是篇數不同 —— 那是 tier 的事，不是形式的事。
  "fb-99-serial-3":               "貼文",
  "fb-30-countdown-1day":         "貼文",
  "fb-60-countdown-5day":         "貼文",
  "fb-99-14day-countdown":        "貼文",
  "fb-99-30day-calendar":         "貼文",
  "fb-99-monthly-calendar-promo": "貼文",
  "fb-99-mass-control":           "貼文",

  // ── 連結貼文 ──────────────────────────────────────────────────────────
  "fb-30-link-caption":           "連結貼文",
  "fb-60-link-full":              "連結貼文",

  // ── 相簿 ──────────────────────────────────────────────────────────────
  "fb-60-album-4":                "相簿",
  "fb-30-album-period-recap":     "相簿",

  // ── 輪播 ──────────────────────────────────────────────────────────────
  "fb-99-carousel-5":             "輪播",
  "fb-99-carousel-cvo":           "輪播",
  "fb-30-carousel-data-recap":    "輪播",

  // ── Reels ─────────────────────────────────────────────────────────────
  // 2025-06 起 Meta 把 Facebook 所有影片統一成 Reels，所以 FB 沒有獨立的
  // 「影片貼文」分類 —— 影片類一律歸這裡。
  "fb-99-reels-script":           "Reels",
  "fb-30-reel-self-roast":        "Reels",

  // ── 限時動態 ──────────────────────────────────────────────────────────
  "fb-30-story-text":             "限時動態",
  "fb-30-story-serial-event":     "限時動態",

  // ── 直播 ──────────────────────────────────────────────────────────────
  "fb-30-live-title":             "直播",
  "fb-60-live-suite":             "直播",

  // ── 置頂貼文 ──────────────────────────────────────────────────────────
  "fb-30-pinned-short":           "置頂貼文",
  "fb-60-pinned-suite":           "置頂貼文",
  "fb-30-pinned-stance":          "置頂貼文",

  // ── 活動 ──────────────────────────────────────────────────────────────
  // 只留真的以「活動」為主體的兩張。倒數與發表會劇本交付的是貼文，見上。
  "fb-30-event-challenge":        "活動",
  // 2026-09-29 近 3 個月爆款結構卡
  "fb-30-reel-character-series":  "Reels",
  "fb-30-event-tiered-challenge": "活動",
  "fb-30-ad-audience-split-test": "廣告",
  "fb-60-launch-kit":             "活動",

  // ── 留言 ──────────────────────────────────────────────────────────────
  "fb-30-comment-reply":          "留言",
  "fb-30-comment-signal-boost":   "留言",

  // ── 廣告 ──────────────────────────────────────────────────────────────
  // 這 6 張全部是「廣告的欄位」（標題／主文案／說明／CTA／完整包／腳本），
  // 跟 Meta 的廣告層一致，但那是第五層。要按行銷活動目標分類得先補卡。
  "fb-30-ad-headline":            "廣告",
  "fb-30-ad-primary":             "廣告",
  "fb-30-ad-cta":                 "廣告",
  "fb-30-ad-description":         "廣告",
  "fb-60-ad-pack-3":              "廣告",
  "fb-30-ad-viral-monologue":     "廣告",
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
/**
 * Meta 廣告格式的顯示名。
 *
 * 2026-09-11 (CJ「還是沒有直接打開，就可以看到那些廣告形式的文字」)
 *
 * 識別碼在 server（quickTaskFB.ts 的 AdFormat），顯示名在這裡 —— 與
 * taskSource / tierVocabulary 同一套分工。client 不 import server（跨邊界
 * 規則），所以這裡是各自宣告的一份，鍵值必須跟 AdFormat 對得上。
 *
 * 四種是 Meta ads-guide 導覽列的全部，不是我們歸納的。
 */
export const AD_FORMAT_LABELS: Record<string, { zh: string; en: string }> = {
  image:      { zh: "圖像",   en: "Image"      },
  video:      { zh: "影片",   en: "Video"      },
  carousel:   { zh: "輪播",   en: "Carousel"   },
  collection: { zh: "精選集", en: "Collection" },
};

/** 卡片上那一行「適用格式：圖像 · 影片 · 輪播 · 精選集」。沒有就回 null。 */
export function adFormatText(formats: unknown, lang: string): string | null {
  if (!Array.isArray(formats) || formats.length === 0) return null;
  const names = formats
    .map((f) => AD_FORMAT_LABELS[String(f)])
    .filter(Boolean)
    .map((l) => (lang === "en" ? l!.en : l!.zh));
  return names.length ? names.join(" · ") : null;
}

/**
 * 刻意不進形式分類的卡（只在「全部」出現）。
 *
 * 2026-09-10：這五類**不是 Facebook 的貼文形式**，硬塞進任何一格都是說謊，
 * 而替它們發明一個聽起來像 Facebook 的詞正是這次要移除的東西。
 *
 *   帳號定位 / 季策略 / 月成效報告 —— 交付物是文件與報告，不是貼文
 *   主題標籤建議組                 —— 是貼文的元件，不是貼文
 *   跨平台一稿四發 / A/B 雙版本     —— 工具，而且不專屬 Facebook
 *
 * 後續選項（不在這次範圍）：把前三張搬到 brand 或規劃型頻道，那裡的產出
 * 形狀本來就是文件。搬頻道比改標籤動得多，所以先只改使用者看到的這一層。
 */
export const FB_UNMAPPED_BY_DESIGN = new Set<string>([
  "fb-99-account-reposition",
  "fb-99-quarterly-strategy",
  "fb-99-monthly-analytics",
  "fb-30-hashtag-set",
  "cw-60-crosspost-4platform",
  "cw-60-ab-variants",
]);

// ── Format category config (IG) ─────────────────────────────────────────────
/**
 * 2026-09-11：比照 FB（1d0849e2）把自創與半吊子的用語換成 Instagram 真實用語。
 *
 *   Feed 貼文     → 貼文（Instagram 就叫貼文；"Feed" 是我們混進來的英文）
 *   Carousel 輪播 → 輪播（不必並列英文）
 *   Story 限時    → 限時動態（「限時」是口語縮寫）
 *   Live 直播     → 直播
 *   個人頁        → 個人檔案（Instagram 繁中官方用詞）
 *   互動 / 工具   → 拆成 留言 ＋ 私訊（Instagram 官方是「Direct 訊息（私訊）」）
 *   策略 / 月曆   → 移除。7 張策略卡依它們**交付什麼**歸位，見下
 *
 * 與 FB 同一條原則：形式軸只描述交付物的形式，「這是一個月的企劃」由 tier
 * 承擔。IG 的 postType 其實已經記著交付形式，所以這次的對應就是照 postType
 * 走：feed→貼文、live→直播、reel→Reels、story→限時動態、carousel→輪播、
 * profile→個人檔案。ig-99-live-first 是 live、ig-99-save-worthy 是 carousel，
 * 它們本來就不該跟其他策略卡擠在同一格。
 *
 * Instagram 沒有對應詞的 3 張放 IG_UNMAPPED_BY_DESIGN，不硬塞。
 */
export type IGActiveFormat =
  | "all" | "貼文" | "輪播" | "Reels" | "限時動態"
  | "直播" | "個人檔案" | "留言" | "私訊";

export const IG_FORMAT_TABS: { id: IGActiveFormat; label: string; labelEn: string }[] = [
  { id: "all",        label: "全部",       labelEn: "All"      },
  { id: "貼文",       label: "貼文",       labelEn: "Posts"    },
  { id: "輪播",       label: "輪播",       labelEn: "Carousel" },
  // 官方譯名是「連續短片」，但使用者實際講 Reels —— 與 FB 同一個取捨。
  { id: "Reels",      label: "Reels",      labelEn: "Reels"    },
  { id: "限時動態",   label: "限時動態",   labelEn: "Stories"  },
  { id: "直播",       label: "直播",       labelEn: "Live"     },
  { id: "個人檔案",   label: "個人檔案",   labelEn: "Profile"  },
  { id: "留言",       label: "留言",       labelEn: "Comments" },
  { id: "私訊",       label: "私訊",       labelEn: "Direct"   },
];

export const IG_TASK_FORMAT_MAP: Record<string, IGActiveFormat> = {
  // ── 貼文 ──────────────────────────────────────────────────────────────
  "ig-30-caption-short":         "貼文",
  "ig-30-feed-single-object":    "貼文",
  "ig-30-pure-text-hook":        "貼文",
  "ig-60-countdown-5day":        "貼文",
  "ig-60-feed-full":             "貼文",
  "ig-60-serial-3":              "貼文",
  "ig-60-testimonial-rewrite":   "貼文",
  "ig-60-viral-rewrite":         "貼文",
  // 2026-09-11：五張 ig-99 策略卡原本在自創的「策略 / 月曆」。它們交付的是
  // 一個月的貼文（風格與選題不同而已），所以歸貼文；「這是企劃」由 tier 說。
  "ig-99-document":              "貼文",
  "ig-99-monthly-calendar":      "貼文",
  "ig-99-radical-transparency":  "貼文",
  "ig-99-visual-story":          "貼文",
  "ig-99-youtility":             "貼文",

  // ── 輪播 ──────────────────────────────────────────────────────────────
  "ig-30-carousel-proof-set":    "輪播",
  "ig-30-carousel-structure":    "輪播",
  "ig-60-carousel-7":            "輪播",
  "ig-99-save-worthy":           "輪播",

  // ── Reels ─────────────────────────────────────────────────────────────
  "ig-30-reel-brand-event":      "Reels",
  "ig-30-reel-hook":             "Reels",
  "ig-30-reel-script-full":      "Reels",
  "ig-60-reel-full":             "Reels",

  // ── 限時動態 ──────────────────────────────────────────────────────────
  "ig-30-story-one-action":      "限時動態",
  "ig-30-story-repost-strategy": "限時動態",
  "ig-30-story-text":            "限時動態",
  "ig-60-story-3frame":          "限時動態",

  // ── 直播 ──────────────────────────────────────────────────────────────
  // IG 直播卡有 12 張，是這個平台最厚的一格 —— 原本有一張（live-first）被
  // 分到「策略 / 月曆」，看不出來直播其實是我們最有供給的形式。
  "ig-30-live-host-relay":       "直播",
  "ig-30-live-opening":          "直播",
  "ig-60-live-behind-scenes":    "直播",
  "ig-60-live-collab-drop":      "直播",
  "ig-60-live-comeback":         "直播",
  "ig-60-live-crew":             "直播",
  "ig-60-live-event":            "直播",
  "ig-60-live-first-ever":       "直播",
  "ig-60-live-founder":          "直播",
  "ig-60-live-suite":            "直播",
  "ig-60-live-versus":           "直播",
  "ig-99-live-first":            "直播",

  // ── 個人檔案 ──────────────────────────────────────────────────────────
  // 限時動態精選就長在個人檔案上，所以精選卡歸這裡，不另開一格。
  "ig-30-bio-rewrite":           "個人檔案",
  "ig-30-profile-self-insert":   "個人檔案",
  "ig-60-highlight-suite":       "個人檔案",

  // ── 留言 ──────────────────────────────────────────────────────────────
  "ig-30-comment-reply":         "留言",

  // ── 私訊 ──────────────────────────────────────────────────────────────
  "ig-30-dm-script":             "私訊",
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
/**
 * 刻意不進形式分類的卡（只在「全部」出現）。
 *
 * 2026-09-11：這 3 張不是 Instagram 的貼文形式。
 *   主題標籤 30 個套組 —— 是貼文的元件，不是貼文（與 FB 的 hashtag 卡同樣處理）
 *   IG → Threads 兩張   —— 交付物是 Threads 貼文。Threads 是另一個 app，
 *                          把它塞進任何一個 Instagram 形式都是說謊。
 *
 * Threads 之後若要有自己的通路，這兩張就是第一批卡。
 */
export const IG_UNMAPPED_BY_DESIGN = new Set<string>([
  "ig-30-hashtag-set",
  "ig-30-post-platform-firstday",
  "ig-30-threads-cross-post",
]);

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
