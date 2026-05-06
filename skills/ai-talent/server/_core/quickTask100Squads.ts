/**
 * 100s tier — REAL SQUAD index (2026-05-06).
 *
 * Per CJ direction: 100s tasks should run via the existing multi-step squad
 * infrastructure (squad.stepExecute → /picker workspace UI) — not orchestra
 * variants. This is because campaign-level deliverables (30-day calendar,
 * launch toolkit, crisis playbook) need:
 *   - calendar-shaped output (date map with theme + product per day),
 *     not 5 caption variants
 *   - multi-step pipeline (research → plan → write → review)
 *   - real-time data (festivals, trending, news) baked in per stage
 *   - existing squad rosters (Joe Pulizzi 內容支柱 / Cialdini Scarcity /
 *     GaryVee Jab-Jab-Right-Hook / Lagadec 4 段 / Trout & Ries Positioning)
 *
 * Each entry maps a /100s task UI card to an existing real squad slug.
 * Frontend handler: when user clicks a kind="squad" task on /100s, navigate
 * to /picker?workspace=ai-talent&slug={squad_slug} → existing squad pipeline.
 *
 * For channels without dedicated squads yet (YT/TT/LI/Email/PR/Brand/Research),
 * the orchestra-based fallback in quickTask100.ts is still used (clearly
 * marked as Phase 2 work in their description).
 */

export interface SquadIndexEntry {
  /** Stable task id surfaced in listFB / clicked by user */
  id: string;
  /** Real squad slug in DB — drives /picker workspace selection */
  squad_slug: string;
  /** Platform — drives channel filter on /100s */
  platform: "facebook" | "instagram" | "youtube" | "tiktok" | "linkedin" | "email" | "press" | "brand" | "audience";
  /** Mockup post type (best fit) */
  postType: string;
  /** User-facing card label */
  label: string;
  /** 1-line description shown on card */
  description: string;
  /** Methodology / framework note (subtle text on card) */
  methodology?: string;
}

// ─── FB 100s squads (11 — all from existing FB_90S_TASK_INDEX) ─────────
// These squads have full agent rosters seeded via seed-fb-additional-squads.ts
// + seed-fb-calendar-variants.ts. They produce calendar-shaped / toolkit /
// strategy outputs (NOT caption variants).
export const FB_100S_SQUADS: SquadIndexEntry[] = [
  {
    id: "fb-100-monthly-calendar",
    squad_slug: "fb-monthly-calendar",
    platform: "facebook", postType: "feed",
    label: "FB 完整月行事曆 30 天",
    description: "真實行事曆呈現：每天主題 + 產品 + 視覺方向 + 配文支柱配比",
    methodology: "Joe Pulizzi 內容支柱法",
  },
  {
    id: "fb-100-monthly-calendar-promo",
    squad_slug: "fb-monthly-calendar-product-promo",
    platform: "facebook", postType: "feed",
    label: "FB 月行事曆（商品促銷型）",
    description: "促銷型內容支柱配比 + 多商品輪轉節奏",
    methodology: "促銷型 Pulizzi 變體",
  },
  {
    id: "fb-100-event-launch",
    squad_slug: "fb-event-launch-kit",
    platform: "facebook", postType: "event",
    label: "FB 活動上線套組",
    description: "GaryVee Jab-Jab-Right-Hook + 預告 + 當日 + 事後完整劇本",
    methodology: "GaryVee Jab-Jab-Right-Hook",
  },
  {
    id: "fb-100-countdown-series",
    squad_slug: "fb-countdown-series",
    platform: "facebook", postType: "feed",
    label: "FB 倒數活動系列 7-14 天",
    description: "Cialdini Scarcity 緊迫倒數法 + 每天獨立 hook 結構",
    methodology: "Cialdini Scarcity",
  },
  {
    id: "fb-100-account-reposition",
    squad_slug: "fb-account-reposition",
    platform: "facebook", postType: "feed",
    label: "FB 帳號重新定位",
    description: "Trout & Ries Positioning + Pulizzi Tilt + 完整轉型 launch posts",
    methodology: "Trout & Ries Positioning",
  },
  {
    id: "fb-100-quarterly-strategy",
    squad_slug: "fb-quarterly-strategy",
    platform: "facebook", postType: "feed",
    label: "FB 季度策略",
    description: "Pulizzi Quarterly Cadence + 12 個 video title + 內容支柱規劃",
    methodology: "Pulizzi Quarterly Cadence",
  },
  {
    id: "fb-100-monthly-analytics",
    squad_slug: "fb-monthly-analytics",
    platform: "facebook", postType: "feed",
    label: "FB 月度成效報告",
    description: "Kaushik Web Analytics 2.0 + Engagement Pyramid 分析",
    methodology: "Kaushik Web Analytics 2.0",
  },
  {
    id: "fb-100-carousel-10frame",
    squad_slug: "fb-carousel",
    platform: "facebook", postType: "carousel",
    label: "FB Carousel 10 卡完整敘事",
    description: "Hook-Build-Turn-Payoff 完整弧 + 10 卡視覺一致",
    methodology: "Hook-Build-Turn-Payoff",
  },
  {
    id: "fb-100-reels-full",
    squad_slug: "fb-reels-script",
    platform: "facebook", postType: "reel",
    label: "FB Reels 完整腳本",
    description: "Hook-Hold-Payoff（含分鏡 + 配樂方向 + 字幕節奏）",
    methodology: "Hook-Hold-Payoff",
  },
  {
    id: "fb-100-livestream-suite",
    squad_slug: "fb-livestream-prep",
    platform: "facebook", postType: "live",
    label: "FB 直播完整套組",
    description: "預告 + 摘要 + 轉錄重點剪（成對敘事）",
    methodology: "Pre-Live + Post-Live 成對敘事",
  },
  {
    id: "fb-100-crisis-full",
    squad_slug: "fb-crisis-comms",
    platform: "facebook", postType: "comment",
    label: "FB 完整危機公關",
    description: "Lagadec 4 段 + 後續追蹤 + 媒體聲明 + 內部 SOP",
    methodology: "Lagadec 4 段",
  },
];

// ─── IG 100s squads (7 — from seed-ig-catalog.ts) ──────────────────────
export const IG_100S_SQUADS: SquadIndexEntry[] = [
  {
    id: "ig-100-monthly-calendar",
    squad_slug: "ig-monthly-calendar-pulizzi",
    platform: "instagram", postType: "feed",
    label: "IG 完整月行事曆 30 天",
    description: "真實行事曆：每天 feed/reel/story 配置 + 主題 + 視覺一致性",
    methodology: "Pulizzi 內容支柱型",
  },
  {
    id: "ig-100-account-reposition",
    squad_slug: "ig-account-reposition",
    platform: "instagram", postType: "profile",
    label: "IG 帳號重新定位",
    description: "新 bio + 9 highlight 主題 + launch posts + visual direction",
    methodology: "Trout & Ries Positioning",
  },
  {
    id: "ig-100-quarterly-strategy",
    squad_slug: "ig-quarterly-strategy",
    platform: "instagram", postType: "feed",
    label: "IG 季度策略",
    description: "季度大主題 + 內容支柱配比 + 12 個 reel/post 規劃",
    methodology: "Pulizzi Quarterly Cadence",
  },
  {
    id: "ig-100-event-launch-kit",
    squad_slug: "ig-event-launch-kit",
    platform: "instagram", postType: "feed",
    label: "IG 活動上線套組",
    description: "story + reel + post + collab 規劃 + 完整 launch narrative",
    methodology: "GaryVee Jab-Jab-Right-Hook",
  },
  {
    id: "ig-100-countdown-series",
    squad_slug: "ig-countdown-series",
    platform: "instagram", postType: "feed",
    label: "IG 倒數活動系列",
    description: "倒數 N 天每天獨立 hook + story 配套互動 sticker",
    methodology: "Cialdini Scarcity",
  },
  {
    id: "ig-100-livestream-prep",
    squad_slug: "ig-livestream-prep",
    platform: "instagram", postType: "live",
    label: "IG Live 完整套組",
    description: "預告 + 直播配套 + 摘要回放 + reel 剪輯指南",
    methodology: "Pre/Post-Live",
  },
  {
    id: "ig-100-monthly-analytics",
    squad_slug: "ig-monthly-analytics",
    platform: "instagram", postType: "feed",
    label: "IG 月度成效報告",
    description: "Engagement / Reach / Saves 全方位 + 下月策略建議",
    methodology: "Kaushik Web Analytics",
  },
];

/** Combined index — used by router listFB merge */
export const ALL_100S_SQUADS: SquadIndexEntry[] = [
  ...FB_100S_SQUADS,
  ...IG_100S_SQUADS,
];

export function get100SquadEntry(taskId: string): SquadIndexEntry | null {
  return ALL_100S_SQUADS.find((e) => e.id === taskId) ?? null;
}
