import type { TaskSource } from "./taskSource";
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

export type IgPublicFormat = "feed" | "carousel" | "reel" | "story" | "live";

export type IgPublicDeliverableRule =
  | {
      id: string;
      kind: "fixed";
      format: IgPublicFormat;
      count: number;
      label: { en: string; zh: string };
      instruction: { en: string; zh: string };
    }
  | {
      id: string;
      kind: "per-input-item";
      format: IgPublicFormat;
      inputKind: "live-session" | "documented-asset" | "authentic-story";
      defaultItems: number;
      maxItems: number;
      multiplier: number;
      label: { en: string; zh: string };
      instruction: { en: string; zh: string };
    }
  | {
      id: string;
      kind: "allocated-bundle";
      formats: IgPublicFormat[];
      inputKind: "live-session";
      defaultItems: number;
      maxItems: number;
      perItemCount: number;
      label: { en: string; zh: string };
      instruction: { en: string; zh: string };
    };

export interface SquadPublicOutputPolicy {
  /** Server-owned public contract. Private squad steps never become variants. */
  presentation: "ig-public-bundle";
  /** Methodology-free title used for mission/output cards. */
  publicTitle: { en: string; zh: string };
  /** Publishable IG deliverables, independent from the private step count. */
  deliverables: IgPublicDeliverableRule[];
  /** Method/author aliases used only for private reasoning and never exposed. */
  privateAliases?: string[];
}

export interface SquadIndexEntry {
  /** Stable task id surfaced in listFB / clicked by user */
  id: string;
  /** Real squad slug in DB — drives /picker workspace selection */
  squad_slug: string;
  /**
   * 2026-09-05 — 這張卡的結構來源。IG 那七張策略卡的歸屬本來就寫在
   * squad_slug 裡（ig-baer-youtility / ig-hormozi-save-worthy…），
   * 只是沒有變成前台看得到的欄位。定義見 taskSource.ts。
   */
  source?: TaskSource;
  /** Platform — drives channel filter on /100s */
  platform: "facebook" | "instagram" | "youtube" | "tiktok" | "linkedin" | "email" | "press" | "brand" | "audience";
  /** Mockup post type (best fit) */
  postType: string;
  /** User-facing card label. 2026-07-17 多市場: bilingual like FBTaskTemplate. */
  label: string | { en: string; zh: string };
  /** 1-line description shown on card. 2026-07-18 多市場: bilingual. */
  description: string | { en: string; zh: string };
  /** Methodology / framework note (subtle text on card) */
  methodology?: string;
  /** Override the generic intake question shown in the modal.
   *  If omitted, quickTaskRouter falls back to the generic "本次想交付什麼？" prompt. */
  primary_question?: string;
  /** Override the generic intake input config. */
  primary_input?: { key: string; placeholder: string; type: "textarea" | "text" };
  /** Optional public-output boundary. Unlisted squads retain their legacy output byte-for-byte. */
  publicOutput?: SquadPublicOutputPolicy;
}

// ─── FB 100s squads (11 — slugs verified to exist in DB 2026-05-06) ────
// Each squad has been assigned a DISTINCT lead via admin-squad-leads-100s.yml
// so the cards show 11 different real faces.
export const FB_99S_SQUADS: SquadIndexEntry[] = [
  // 2026-05-18 (CJ「30天行事曆結果很不理想」): the deep-research squad
  // produced a strategy essay, not a usable calendar. Replaced by the
  // structured orchestra task fb-99-30day-calendar (fixed content mix +
  // Calendar mockup), so this squad card is removed from the 99s tab.
  // 2026-05-18 (CJ「促銷月曆也超時」): replaced by the fast structured
  // orchestra task fb-99-monthly-calendar-promo (parallel-by-pillar +
  // Calendar mockup), so this heavy squad card is removed.
  // 2026-05-18 (CJ): fb-99-event-launch (GaryVee Jab-Jab-Right-Hook
  // squad) removed from the catalog per request.
  // 2026-05-18 (CJ 驗收報告「每天當成一個 FB mockup」): replaced by the
  // structured orchestra task fb-99-14day-countdown (per-day variant
  // pills + D-4 CTA rule + 截止日/天數 intake). Squad card removed.
  {
    id: "fb-99-account-reposition",
    squad_slug: "fb-account-reposition",
    source: { type: "benchmark", short: "Trout & Ries《定位》", takeaway: "先決定在心智裡佔哪個位置，再決定說什麼" },
    platform: "facebook", postType: "feed",
    label: { en: "FB Account Repositioning", zh: "FB 帳號重新定位" },
    description: { en: "Trout & Ries Positioning + Pulizzi Tilt + full transformation launch posts", zh: "Trout & Ries Positioning + Pulizzi Tilt + 完整轉型 launch posts" },
    methodology: "Trout & Ries Positioning",
    primary_question: "為什麼想重新定位？想往哪個方向走、或有想參考的品牌？",
    primary_input: {
      key: "topic",
      placeholder: "例：原本太嚴肅想轉輕鬆 / 想對標 XXX 的定位風格 / 客群從 B2B 轉 B2C",
      type: "textarea",
    },
  },
  {
    id: "fb-99-quarterly-strategy",
    squad_slug: "fb-quarterly-strategy",
    source: { type: "benchmark", short: "Joe Pulizzi 季度節奏", takeaway: "用支柱決定一季的節奏，不是逐月想主題" },
    platform: "facebook", postType: "feed",
    label: { en: "FB Quarterly Content Strategy", zh: "FB 一季的內容策略" },
    description: { en: "3-month cadence: monthly themes + 12 flagship post topics + content-pillar mix", zh: "3 個月的整體節奏：每月主題 + 12 個重點貼文題目 + 內容支柱配比" },
    methodology: "Pulizzi Quarterly Cadence",
    primary_question: "這一季的主要目標是什麼？有沒有重要節點、新產品或要主打的方向？",
    primary_input: {
      key: "topic",
      placeholder: "例：Q3 主打夏季保養新品，7 月上市、8 月衝業績、9 月為雙 11 暖身",
      type: "textarea",
    },
  },
  {
    id: "fb-99-monthly-analytics",
    squad_slug: "fb-monthly-analytics",
    source: { type: "benchmark", short: "Avinash Kaushik《Web Analytics 2.0》", takeaway: "指標要能回答決策，不是把數字列完" },
    platform: "facebook", postType: "feed",
    label: { en: "FB Monthly Performance Review", zh: "FB 一個月成效檢討報告" },
    description: { en: "Insights from your data: engagement / reach / saves analysis + next month's optimizations", zh: "看數據找洞察：互動 / 觸及 / 收藏 全面分析 + 下月優化建議" },
    methodology: "Kaushik Web Analytics 2.0",
    primary_question: "這個月的數據大概怎樣？貼上主要指標，agents 會幫你找問題、提建議",
    primary_input: {
      key: "topic",
      placeholder: "例：觸及 12,000、互動率 2.3%、收藏 45、最好的貼文是 XX、感覺 reel 比 feed 差很多",
      type: "textarea",
    },
  },
  {
    id: "fb-99-carousel-cvo",
    squad_slug: "fb-deiss-cvo",
    source: { type: "benchmark", short: "Ryan Deiss CVO 漏斗", takeaway: "一則內容走完認識到下單，不是只做一段" },
    platform: "facebook", postType: "carousel",
    label: { en: "FB Carousel: Awareness-to-Purchase Story", zh: "FB 多卡輪播：從認識到下單的故事" },
    description: { en: "10-card carousel narrative: how a stranger becomes a customer (aware→interest→evaluate→buy)", zh: "10 卡輪播完整敘事：陌生人怎麼一步步變成顧客（認識→興趣→評估→購買）" },
    methodology: "Ryan Deiss CVO 漏斗",
    primary_question: "要把哪個產品或服務從陌生人帶到下單？目標顧客是誰、最大的購買顧慮是什麼？",
    primary_input: {
      key: "topic",
      placeholder: "例：線上課程，目標是想斜槓的上班族，顧慮是「不知道學完有沒有用」",
      type: "textarea",
    },
  },
  {
    id: "fb-99-offer-first",
    squad_slug: "fb-hormozi-offer-first",
    source: { type: "benchmark", short: "Alex Hormozi《$100M Offers》", takeaway: "提案本身要好到讓拒絕變得困難" },
    platform: "facebook", postType: "feed",
    label: { en: "FB Offer-First Post", zh: "FB 直接主打優惠的貼文" },
    description: { en: "Write the offer they can't refuse: value stacking + risk reversal + urgency", zh: "把優惠寫到讓人沒辦法拒絕：價值疊加 + 風險反轉 + 急迫感" },
    methodology: "Hormozi 不可拒絕的提案",
    primary_question: "這次的優惠方案是什麼？包含折扣、贈品、截止日期、或其他讓人心動的條件",
    primary_input: {
      key: "topic",
      placeholder: "例：買課程送 1 對 1 諮詢（價值 3000），只到週日 23:59，不延期",
      type: "textarea",
    },
  },
  {
    id: "fb-99-magnetic-marketing",
    squad_slug: "fb-kennedy-magnetic",
    source: { type: "benchmark", short: "Dan Kennedy Magnetic Marketing", takeaway: "訊息、market、media 三者要先對齊" },
    platform: "facebook", postType: "feed",
    label: { en: "FB Magnetic Marketing: Customer-Pull Posts", zh: "FB 把自己變磁鐵：吸客貼文" },
    description: { en: "Make the right people come to you: sharp positioning, strong appeal, clear CTA", zh: "讓對的人主動找上你：精準定位、強烈訴求、明確行動呼籲" },
    methodology: "Kennedy Magnetic Marketing",
    primary_question: "你最想吸引的是哪種人？他們現在最大的痛點或渴望是什麼？",
    primary_input: {
      key: "topic",
      placeholder: "例：想吸引有品牌但不知道怎麼做內容的中小企業主，最大痛點是「做了都沒人看」",
      type: "textarea",
    },
  },
  {
    id: "fb-99-mass-control",
    squad_slug: "fb-kern-mass-control",
    source: { type: "benchmark", short: "Frank Kern Mass Control", takeaway: "先給到讓人不好意思不買，再開賣" },
    platform: "facebook", postType: "feed",
    label: { en: "FB Big-Launch Marketing Playbook", zh: "FB 大型發表會行銷劇本" },
    description: { en: "Hype-cycle launch: 3-stage teasers → showtime → wind-down (built for annual flagship events)", zh: "造勢式 launch：3 階段預告 → 開場壓軸 → 後續收束（適合年度大事件）" },
    methodology: "Kern Mass Control",
    primary_question: "這次要發表什麼？預計發表日期、目標是什麼（報名 / 銷售 / 知名度）？",
    primary_input: {
      key: "topic",
      placeholder: "例：年度旗艦課程，6/15 正式開賣，目標是 3 天內賣出 200 席",
      type: "textarea",
    },
  },
  // 2026-07-20 (CJ 90s 整層退役 option B): moved here from the retired
  // FB_90S_TASK_INDEX — the only 90s card with no 99s/60s equivalent.
  // Same seeded squad (seed-fb-90s-missing-squads.ts), now running via
  // the async-polling 99s path instead of the sync 60s-timeout one.
  {
    id: "fb-99-reels-script",
    squad_slug: "fb-reels-script",
    platform: "facebook", postType: "reel",
    label: { en: "FB Reels Full Script", zh: "FB Reels 完整腳本" },
    description: { en: "Hook-Hold-Payoff (with storyboard + music direction)", zh: "Hook-Hold-Payoff（含分鏡 + 配樂方向）" },
    methodology: "短影音 Hook-Hold-Payoff 法",
    primary_question: "這支 Reels 要講什麼？主題、想帶出的重點、或想模仿的影片都可以",
    primary_input: {
      key: "topic",
      placeholder: "例：新品開箱 30 秒 / 門市日常幕後 / 3 個常見保養錯誤",
      type: "textarea",
    },
  },
];

// ─── IG 100s squads (7 — slugs verified to exist in DB 2026-05-06) ─────
export const IG_99S_SQUADS: SquadIndexEntry[] = [
  {
    id: "ig-99-monthly-calendar",
    squad_slug: "ig-monthly-calendar-pulizzi",
    source: { type: "benchmark", short: "Joe Pulizzi 內容行事曆", takeaway: "以支柱主題排月曆，不是逐篇想題目" },
    platform: "instagram", postType: "feed",
    label: { en: "IG × Pulizzi 30-Day Calendar Strategy", zh: "IG × Pulizzi 30 天月曆策略" },
    description: { en: "Daily feed / reel / story allocation + this month's holidays + themes + visual consistency", zh: "每天 feed / reel / story 配置 + 抓本月節慶 + 主題 + 視覺一致性" },
    methodology: "Pulizzi 內容支柱",
    primary_question: "這個月的主要主題或重點是什麼？有特別想主打的產品、活動或節慶嗎？",
    primary_input: {
      key: "topic",
      placeholder: "例：6 月父親節月，主打男性保養新品，想多發 reel 衝觸及",
      type: "textarea",
    },
  },
  {
    id: "ig-99-youtility",
    squad_slug: "ig-baer-youtility",
    source: { type: "benchmark", short: "Jay Baer《Youtility》", takeaway: "有用到讓人想收藏，勝過有趣到讓人想笑" },
    platform: "instagram", postType: "feed",
    label: { en: "IG × Youtility Pure-Utility Strategy", zh: "IG × Youtility 純實用型策略" },
    description: { en: "30 days of genuinely useful content (no selling, pure help) that followers save and share", zh: "30 天「真的能用」的內容（不推銷、純幫忙），讓粉絲收藏分享" },
    methodology: "Baer Youtility",
    primary_question: "你的粉絲最需要學會或解決的是什麼？你能幫他們省什麼麻煩或時間？",
    primary_input: {
      key: "topic",
      placeholder: "例：幫餐廳老闆學拍菜單照、幫健身新手不踩雷、幫 SOHO 族管理時間",
      type: "textarea",
    },
    publicOutput: {
      presentation: "ig-public-bundle",
      publicTitle: { en: "IG Useful Content Deliverables", zh: "IG 實用內容成品" },
      privateAliases: ["Youtility", "Jay Baer", "Baer"],
      deliverables: [
        {
          id: "useful-feed", kind: "fixed", format: "feed", count: 1,
          label: { en: "Useful Post", zh: "實用貼文" },
          instruction: {
            en: "One complete, useful Instagram feed post that helps without selling.",
            zh: "一篇完整、可直接發布的 IG Feed 實用貼文；提供具體幫助，不推銷。",
          },
        },
      ],
    },
  },
  {
    id: "ig-99-visual-story",
    squad_slug: "ig-chrisdo-visual-story",
    source: { type: "benchmark", short: "Chris Do / The Futur", takeaway: "視覺一致性本身就是識別，先定規則再產內容" },
    platform: "instagram", postType: "feed",
    label: { en: "IG × Chris Do Visual-Consistency Strategy", zh: "IG × Chris Do 視覺一致型策略" },
    description: { en: "Full visual identity + palette + composition style + 30-day visually consistent feed", zh: "整套視覺識別 + 配色 + 構圖風格 + 30 天 feed 視覺一致" },
    methodology: "Chris Do Visual Story",
    primary_question: "目前的視覺風格是什麼感覺？希望改成什麼方向、或有想參考的帳號嗎？",
    primary_input: {
      key: "topic",
      placeholder: "例：目前太雜亂，想走極簡日系奶油色系，參考 @xxx 的構圖方式",
      type: "textarea",
    },
    publicOutput: {
      presentation: "ig-public-bundle",
      publicTitle: { en: "IG Visual Story Deliverables", zh: "IG 視覺敘事內容成品" },
      privateAliases: ["Chris Do", "ChrisDo", "The Futur", "TheFutur"],
      deliverables: [
        {
          id: "visual-feed", kind: "fixed", format: "feed", count: 1,
          label: { en: "Visual Story Post", zh: "視覺敘事貼文" },
          instruction: {
            en: "One complete Instagram feed post with a consistent visual direction and publishable caption.",
            zh: "一篇完整、可直接發布的 IG Feed 貼文，包含一致的視覺方向與成品文案。",
          },
        },
      ],
    },
  },
  {
    id: "ig-99-live-first",
    squad_slug: "ig-fanzo-live-first",
    source: { type: "benchmark", short: "Brian Fanzo 直播優先", takeaway: "即時互動的不完美，比剪過的完美更可信" },
    platform: "instagram", postType: "live",
    label: { en: "IG × Live-First Strategy", zh: "IG × Live-First 直播優先型策略" },
    description: { en: "Livestream at the core: teasers + live kit + follow-up reel edits (high-engagement strategy)", zh: "以直播為核心：預告 + 直播配套 + 後續 reel 剪輯（高互動策略）" },
    methodology: "Fanzo Live-First",
    primary_question: "要直播什麼主題？預計幾場、多久一次、目的是漲粉、互動、還是銷售？",
    primary_input: {
      key: "topic",
      placeholder: "例：每週四晚上 8 點直播 45 分鐘，分享品牌經營心得，目的是建立信任感",
      type: "textarea",
    },
    publicOutput: {
      presentation: "ig-public-bundle",
      publicTitle: { en: "IG Live Content Deliverables", zh: "IG 直播內容成品" },
      privateAliases: ["Live-First", "LiveFirst", "Brian Fanzo", "BrianFanzo"],
      deliverables: [
        {
          id: "live-session", kind: "fixed", format: "live", count: 1,
          label: { en: "Live Session", zh: "直播場次" },
          instruction: {
            en: "A complete audience-facing Instagram Live run-of-show and host script.",
            zh: "一份面向觀眾、可直接使用的 IG Live 流程與主持腳本。",
          },
        },
      ],
    },
  },
  {
    id: "ig-99-document",
    squad_slug: "ig-garyvee-document",
    source: { type: "benchmark", short: "Gary Vaynerchuk 紀實法", takeaway: "記錄過程而不是創作內容，產量與真實感一起解決" },
    platform: "instagram", postType: "feed",
    label: { en: "IG × GaryVee Document-Don't-Create Strategy", zh: "IG × GaryVee 紀實型策略" },
    description: { en: "Film real day-to-day work, skip the gloss — build authenticity and trust", zh: "拍真實日常工作場景，不過度包裝，建立品牌真實感與信任" },
    methodology: "GaryVee Document",
    primary_question: "你的日常工作或品牌過程裡，有哪些場景想讓粉絲看到？",
    primary_input: {
      key: "topic",
      placeholder: "例：設計師接案日常、產品從打樣到出貨的過程、客戶見面 / 工作室環境",
      type: "textarea",
    },
    publicOutput: {
      presentation: "ig-public-bundle",
      publicTitle: { en: "IG Documentary Content Deliverables", zh: "IG 紀實內容成品" },
      privateAliases: ["GaryVee", "Gary Vee", "Gary Vaynerchuk", "GaryVaynerchuk", "Document Don't Create", "DocumentDontCreate"],
      deliverables: [
        {
          id: "document-feed", kind: "fixed", format: "feed", count: 1,
          label: { en: "Documentary Post", zh: "紀實貼文" },
          instruction: {
            en: "A complete, publishable feed post created from one documented real-world asset or scene.",
            zh: "由一個真實紀錄素材或場景改寫而成、可直接發布的 feed 成品。",
          },
        },
      ],
    },
  },
  {
    id: "ig-99-radical-transparency",
    squad_slug: "ig-hollis-radical-transparency",
    source: { type: "benchmark", short: "Rachel Hollis 真實透明", takeaway: "先講失敗與代價，信任才會先於銷售建立" },
    platform: "instagram", postType: "feed",
    label: { en: "IG × Hollis Radical-Transparency Strategy", zh: "IG × Hollis 真實透明型策略" },
    description: { en: "Share the behind-the-scenes, failures and growth openly to build deep trust", zh: "把品牌幕後 / 失敗 / 成長過程公開，建立深度信任" },
    methodology: "Hollis Radical Transparency",
    primary_question: "有什麼品牌幕後、挑戰或失敗的故事，是你願意公開分享的？",
    primary_input: {
      key: "topic",
      placeholder: "例：第一年虧損差點收掉、改配方失敗的過程、曾被客戶退單的經驗",
      type: "textarea",
    },
    publicOutput: {
      presentation: "ig-public-bundle",
      publicTitle: { en: "IG Authentic Story Deliverables", zh: "IG 真實故事內容成品" },
      privateAliases: ["Rachel Hollis", "RachelHollis", "Radical Transparency", "RadicalTransparency"],
      deliverables: [
        {
          id: "authentic-story", kind: "fixed", format: "feed", count: 1,
          label: { en: "Authentic Story", zh: "真實故事貼文" },
          instruction: {
            en: "One complete, publishable Instagram feed post based only on a story the user agreed to share.",
            zh: "一篇只根據使用者同意公開的真實故事撰寫、可直接發布的 IG Feed 貼文。",
          },
        },
      ],
    },
  },
  {
    id: "ig-99-save-worthy",
    squad_slug: "ig-hormozi-save-worthy",
    source: { type: "benchmark", short: "Alex Hormozi 高收藏", takeaway: "把價值密度做到讓人不敢滑掉，收藏數優先於按讚" },
    platform: "instagram", postType: "carousel",
    label: { en: "IG × Hormozi Save-Worthy Strategy", zh: "IG × Hormozi 高收藏型策略" },
    description: { en: "Carousel tutorials / checklists / comparison charts followers want to save and share", zh: "用 carousel 教學 / 清單 / 對照表，讓粉絲想收藏分享給朋友" },
    methodology: "Hormozi Save-Worthy",
    primary_question: "你想教粉絲什麼？什麼是你的領域裡、大家最想存起來的知識或清單？",
    primary_input: {
      key: "topic",
      placeholder: "例：IG 演算法避雷清單、5 個讓文案更好讀的格式技巧、選材料前必看的對照表",
      type: "textarea",
    },
  },
];

/** Combined index — used by router listFB merge */
export const ALL_99S_SQUADS: SquadIndexEntry[] = [
  ...FB_99S_SQUADS,
  ...IG_99S_SQUADS,
];

