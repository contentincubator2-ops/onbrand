/**
 * fbTaskFormats — FB 任務卡的形式分類（pill）與 task id 的對照。
 *
 * 2026-08-23 — 從 PlatformTaskPage.tsx 抽出來，為的是能被測試 import。
 *
 * ── 為什麼要抽出來 ─────────────────────────────────────────────────────
 * 這份對照表爛過一次，而且沒人發現：2026-07-20「90s 整層退役」把
 * FB_90S_TASK_INDEX 清成空陣列之後，表上 11 個 `fb-90-*` key 全部指向不
 * 存在的任務，接手的 16 張 `fb-99-*` 一個都沒補進來。後果是
 *   · 貼文 pill 只剩 3 張（爆款改寫、客戶見證改寫、時事改寫等 5 張貼文
 *     類的卡全部掉出去）
 *   · 「月曆 / 策略」與「輪播 Carousel」兩個 pill 因為 count===0 直接不
 *     渲染 —— 使用者連分類存在都不知道
 *   · 點任何 pill 都會讓 16 張 99s 卡消失
 *
 * 手抄的對照表一定會再爛，所以 fbTaskFormats.test.ts 把兩件事鎖住：
 *   ① 表上的每個 key 都必須對到真實存在的 FB 任務（擋死 key）
 *   ② 每一張 FB 任務卡都必須「被分類」或「明確列為不分類」
 *      —— 新增卡片時被迫做一次決定，不能默默漏掉
 *
 * 根治的做法是把 format 變成 server 端任務定義上的欄位，由 listFB 一起送
 * 出，client 動態算 pill（IG/LI/YT/TT/EM/PR 也各有一份手抄表，共 162 條）。
 * 那是另一件事，CJ 2026-08-23 決定先不做。
 */

export type ActiveFormat =
  | "all" | "貼文" | "連結貼文" | "廣告" | "輪播 Carousel"
  | "多媒體" | "直播" | "釘選貼文" | "活動 / 系列" | "月曆 / 策略" | "互動 / 工具";

export const FORMAT_TABS: { id: ActiveFormat; label: string; labelEn: string }[] = [
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

export const TASK_FORMAT_MAP: Record<string, ActiveFormat> = {
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
export const UNMAPPED_BY_DESIGN = new Set<string>([
  "fb-99-launch-toolkit",
  "fb-99-livestream-9seg",
  "fb-99-crisis-playbook",
]);
