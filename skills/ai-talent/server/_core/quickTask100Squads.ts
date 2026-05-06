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

// ─── FB 100s squads (11 — slugs verified to exist in DB 2026-05-06) ────
// Each squad has been assigned a DISTINCT lead via admin-squad-leads-100s.yml
// so the cards show 11 different real faces.
export const FB_100S_SQUADS: SquadIndexEntry[] = [
  {
    id: "fb-100-monthly-calendar",
    squad_slug: "fb-monthly-calendar-pulizzi",
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
    squad_slug: "fb-garyvee-jab-hook",
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
    id: "fb-100-carousel-cvo",
    squad_slug: "fb-deiss-cvo",
    platform: "facebook", postType: "carousel",
    label: "FB Carousel 完整 CVO 漏斗敘事",
    description: "Deiss CVO 8 步 + 10 卡輪播完整敘事",
    methodology: "Ryan Deiss CVO",
  },
  {
    id: "fb-100-offer-first",
    squad_slug: "fb-hormozi-offer-first",
    platform: "facebook", postType: "feed",
    label: "FB Offer-First 主打貼文",
    description: "Alex Hormozi Grand Slam Offer + 不可拒絕的提案結構",
    methodology: "Hormozi Offer-First",
  },
  {
    id: "fb-100-magnetic-marketing",
    squad_slug: "fb-kennedy-magnetic",
    platform: "facebook", postType: "feed",
    label: "FB 磁吸式行銷",
    description: "Dan Kennedy Magnetic Marketing + 直效行銷文案",
    methodology: "Kennedy Magnetic Marketing",
  },
  {
    id: "fb-100-mass-control",
    squad_slug: "fb-kern-mass-control",
    platform: "facebook", postType: "feed",
    label: "FB Mass Control 大型發表",
    description: "Frank Kern Mass Control + 多階段預告 → launch → 收束",
    methodology: "Kern Mass Control",
  },
];

// ─── IG 100s squads (7 — slugs verified to exist in DB 2026-05-06) ─────
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
    id: "ig-100-youtility",
    squad_slug: "ig-baer-youtility",
    platform: "instagram", postType: "feed",
    label: "IG Youtility 實用內容策略",
    description: "Jay Baer Youtility 法 + 不推銷而是有用 + 30 天實用內容",
    methodology: "Baer Youtility",
  },
  {
    id: "ig-100-visual-story",
    squad_slug: "ig-chrisdo-visual-story",
    platform: "instagram", postType: "feed",
    label: "IG 視覺敘事策略",
    description: "Chris Do Visual Story + 完整視覺一致性 + brand 識別系統",
    methodology: "Chris Do Visual Story",
  },
  {
    id: "ig-100-live-first",
    squad_slug: "ig-fanzo-live-first",
    platform: "instagram", postType: "live",
    label: "IG Live-First 直播優先策略",
    description: "Brian Fanzo Live-First + 完整直播配套 + 後續 reel 剪輯",
    methodology: "Fanzo Live-First",
  },
  {
    id: "ig-100-document",
    squad_slug: "ig-garyvee-document",
    platform: "instagram", postType: "feed",
    label: "IG Document-Don't-Create 紀錄式內容",
    description: "GaryVee Document Don't Create + 真實感 + 高頻紀錄",
    methodology: "GaryVee Document",
  },
  {
    id: "ig-100-radical-transparency",
    squad_slug: "ig-hollis-radical-transparency",
    platform: "instagram", postType: "feed",
    label: "IG 極致透明品牌敘事",
    description: "Rachel Hollis Radical Transparency + 真實品牌故事",
    methodology: "Hollis Radical Transparency",
  },
  {
    id: "ig-100-save-worthy",
    squad_slug: "ig-hormozi-save-worthy",
    platform: "instagram", postType: "feed",
    label: "IG Save-Worthy 收藏型內容",
    description: "Hormozi Save-Worthy 5 條法則 + 高收藏 carousel + 教學貼文",
    methodology: "Hormozi Save-Worthy",
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
