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
    label: "FB 30 天內容行事曆",
    description: "真實行事曆：抓本月節慶 + 安排每日主題 + 產品 + 視覺方向（教學/故事/促銷配比）",
    methodology: "Joe Pulizzi 內容支柱法",
  },
  {
    id: "fb-100-monthly-calendar-promo",
    squad_slug: "fb-monthly-calendar-product-promo",
    platform: "facebook", postType: "feed",
    label: "FB 30 天促銷月曆（多商品）",
    description: "多商品輪轉的促銷節奏，每天主推一支重點商品，搭配檔期",
    methodology: "促銷型內容支柱變體",
  },
  {
    id: "fb-100-event-launch",
    squad_slug: "fb-garyvee-jab-hook",
    platform: "facebook", postType: "event",
    label: "FB 活動上線完整劇本",
    description: "預告期養粉絲 → 當日大力推 → 事後追蹤的完整節奏（先給價值、最後才出手）",
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
    label: "FB 一季的內容策略",
    description: "3 個月的整體節奏：每月主題 + 12 個重點貼文題目 + 內容支柱配比",
    methodology: "Pulizzi Quarterly Cadence",
  },
  {
    id: "fb-100-monthly-analytics",
    squad_slug: "fb-monthly-analytics",
    platform: "facebook", postType: "feed",
    label: "FB 一個月成效檢討報告",
    description: "看數據找洞察：互動 / 觸及 / 收藏 全面分析 + 下月優化建議",
    methodology: "Kaushik Web Analytics 2.0",
  },
  {
    id: "fb-100-carousel-cvo",
    squad_slug: "fb-deiss-cvo",
    platform: "facebook", postType: "carousel",
    label: "FB 多卡輪播：從認識到下單的故事",
    description: "10 卡輪播完整敘事：陌生人怎麼一步步變成顧客（認識→興趣→評估→購買）",
    methodology: "Ryan Deiss CVO 漏斗",
  },
  {
    id: "fb-100-offer-first",
    squad_slug: "fb-hormozi-offer-first",
    platform: "facebook", postType: "feed",
    label: "FB 直接主打優惠的貼文",
    description: "把優惠寫到讓人沒辦法拒絕：價值疊加 + 風險反轉 + 急迫感",
    methodology: "Hormozi 不可拒絕的提案",
  },
  {
    id: "fb-100-magnetic-marketing",
    squad_slug: "fb-kennedy-magnetic",
    platform: "facebook", postType: "feed",
    label: "FB 把自己變磁鐵：吸客貼文",
    description: "讓對的人主動找上你：精準定位、強烈訴求、明確 CTA",
    methodology: "Kennedy Magnetic Marketing",
  },
  {
    id: "fb-100-mass-control",
    squad_slug: "fb-kern-mass-control",
    platform: "facebook", postType: "feed",
    label: "FB 大型發表會行銷劇本",
    description: "造勢式 launch：3 階段預告 → 開場壓軸 → 後續收束（適合年度大事件）",
    methodology: "Kern Mass Control",
  },
];

// ─── IG 100s squads (7 — slugs verified to exist in DB 2026-05-06) ─────
export const IG_100S_SQUADS: SquadIndexEntry[] = [
  {
    id: "ig-100-monthly-calendar",
    squad_slug: "ig-monthly-calendar-pulizzi",
    platform: "instagram", postType: "feed",
    label: "IG 30 天內容行事曆",
    description: "每天 feed / reel / story 配置 + 抓本月節慶 + 主題 + 視覺一致性",
    methodology: "Pulizzi 內容支柱",
  },
  {
    id: "ig-100-youtility",
    squad_slug: "ig-baer-youtility",
    platform: "instagram", postType: "feed",
    label: "IG 純實用型內容策略",
    description: "30 天「真的能用」的內容（不推銷、純幫忙），讓粉絲收藏分享",
    methodology: "Baer Youtility",
  },
  {
    id: "ig-100-visual-story",
    squad_slug: "ig-chrisdo-visual-story",
    platform: "instagram", postType: "feed",
    label: "IG 視覺一致型品牌貼文",
    description: "整套視覺識別 + 配色 + 構圖風格 + 30 天 feed 視覺一致",
    methodology: "Chris Do Visual Story",
  },
  {
    id: "ig-100-live-first",
    squad_slug: "ig-fanzo-live-first",
    platform: "instagram", postType: "live",
    label: "IG 直播優先型內容策略",
    description: "以直播為核心：預告 + 直播配套 + 後續 reel 剪輯（高互動策略）",
    methodology: "Fanzo Live-First",
  },
  {
    id: "ig-100-document",
    squad_slug: "ig-garyvee-document",
    platform: "instagram", postType: "feed",
    label: "IG 紀實型內容（不刻意製作）",
    description: "拍真實日常工作場景，不過度包裝，建立品牌真實感與信任",
    methodology: "GaryVee Document",
  },
  {
    id: "ig-100-radical-transparency",
    squad_slug: "ig-hollis-radical-transparency",
    platform: "instagram", postType: "feed",
    label: "IG 真實透明型品牌貼文",
    description: "把品牌幕後 / 失敗 / 成長過程公開，建立深度信任",
    methodology: "Hollis Radical Transparency",
  },
  {
    id: "ig-100-save-worthy",
    squad_slug: "ig-hormozi-save-worthy",
    platform: "instagram", postType: "feed",
    label: "IG 高收藏型實用貼文",
    description: "用 carousel 教學 / 清單 / 對照表，讓粉絲想收藏分享給朋友",
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
