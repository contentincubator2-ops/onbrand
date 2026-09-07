/**
 * Sample data for squad mockup gallery + admin lab preview-run mode.
 * Pokemon GO 台灣社群 May 2026 — Deino Community Day Classic 5/17.
 */
import type {
  IntakeFormData, PillarRow, PostBrief, QAReport,
} from "../../../content/components/SquadMockups";

export const SAMPLE_INTAKE: IntakeFormData = {
  systemData: {
    brandName: "Pokemon GO 台灣社群",
    industry: "遊戲 / 社群",
    voice: "活潑、玩家視角、不過度商業化",
    audience: "18-40 歲都會玩家，愛在實體場景活動",
    eventsThisMonth: [
      { name: "Deino Community Day Classic", startAt: "2026-05-17", endAt: "2026-05-17" },
    ],
    products: ["Pokemon GO 主程式"],
    fbHistorySummary: "未連接 FB OAuth — 無法檢測重複主題",
  },
  webSummary: {
    audiencePainsPreview: "玩家最在意：(1) 抓寶熱點分布、(2) 活動時間衝突、(3) 寶可夢稀有度進階指南",
    competitorPillarsPreview: "競品 Niantic 官帳偏官方公告；台灣同好群偏熱點地圖共享 — 有「教學深度」空白",
    primeTime: "週末 11-13 點 + 平日 19-22 點",
  },
  userInput: {
    target_date_start: "2026-05-04",
    target_date_end: "2026-05-31",
    tilt_override: "給台灣寶可夢玩家的「進階遊戲決策指南」— 不只熱點，還有怎麼選、怎麼配的策略空間",
    pillar_count: "4",
    total_posts: 16,
    kpi_focus: "shares",
    event_focus: ["SMP", "creative"],
    date_locks: [{ date: "2026-05-17", theme: "Deino Community Day 攻略總整理" }],
    fb_oauth_token: "",
  },
  gaps: [
    "未授權 FB 掃描 — 無法檢測過去 30 天主題重複",
    "品牌定位 step 「視覺資產」未填 — 視覺方向只能依公開素材推導",
  ],
};

export const SAMPLE_PILLARS: { pillars: PillarRow[]; tilt: string } = {
  tilt: "給台灣寶可夢玩家的「進階遊戲決策指南」",
  pillars: [
    {
      name: "進階攻略",
      hypothesis: "玩家從新手過渡到進階階段最缺『該選哪隻、怎麼配』的決策框架",
      ratio: 35, target_kpi: "saves",
      sample_topics: ["Deino IV 挑選", "PvP 配招", "Mega 進化優先序", "稀有寶可夢追蹤", "Community Day 收益最大化"],
      visualDirection: "深紫 / 金色 / 寶可夢徽章感。資訊圖表為主，配方案組合（A/B/C 對照表）。避免照片，偏向扁平向量 icon 風。",
    },
    {
      name: "玩家故事",
      hypothesis: "社群感建立靠真實玩家故事，不靠官方文宣",
      ratio: 30, target_kpi: "shares",
      sample_topics: ["新北玩家七年", "親子玩家家庭", "退休族訪談", "首次參加 GO Fest", "海外旅行抓圖鑑"],
      visualDirection: "玩家自拍真實感（戶外場景、手機畫面入鏡），暖黃 / 自然光。每篇主視覺 1 張人像 + 1 張遊戲截圖對照。",
    },
    {
      name: "活動懶人包",
      hypothesis: "活動前 24 小時的快速懶人包是最高 share 點",
      ratio: 20, target_kpi: "shares",
      sample_topics: ["Community Day 預備清單", "Raid Hour 流程", "Spotlight Hour 收益", "GO Battle Day", "GO Fest Live"],
      visualDirection: "倒數 / 時間軸 / checklist 視覺。Pokemon GO 藍黃配色，大字醒目；數字最大化（5、3、1 倒數的視覺強度）。",
    },
    {
      name: "台灣在地",
      hypothesis: "在地化內容差異化（vs 官方 / 中國同好群）",
      ratio: 15, target_kpi: "reach",
      sample_topics: ["中正紀念堂熱點", "台南古蹟主題", "夜市玩家文化", "捷運抓寶通勤", "離島稀有點"],
      visualDirection: "地點實拍為主（古蹟 / 街道 / 夜市），配地圖小卡疊加。文字採繁中、保留地名漢字。色調自然飽和。",
    },
  ],
};

export const SAMPLE_CALENDAR = {
  targetDateStart: "2026-05-04",
  targetDateEnd: "2026-05-31",
  pillars: [
    { name: "進階攻略", ratio: 35 },
    { name: "玩家故事", ratio: 30 },
    { name: "活動懶人包", ratio: 20 },
    { name: "台灣在地", ratio: 15 },
  ],
  entries: [
    { date: "2026-05-04", pillarIndex: 0, pillarName: "進階攻略", format: "long-text" as const, topic: "Deino IV 挑選實戰" },
    { date: "2026-05-06", pillarIndex: 1, pillarName: "玩家故事", format: "post" as const, topic: "新北玩家七年" },
    { date: "2026-05-08", pillarIndex: 2, pillarName: "活動懶人包", format: "carousel" as const, topic: "Spotlight 預備" },
    { date: "2026-05-11", pillarIndex: 3, pillarName: "台灣在地", format: "post" as const, topic: "中正紀念堂熱點" },
    { date: "2026-05-13", pillarIndex: 0, pillarName: "進階攻略", format: "reel" as const, topic: "PvP 配招" },
    { date: "2026-05-15", pillarIndex: 2, pillarName: "活動懶人包", format: "carousel" as const, topic: "Deino CD 倒數 2 天", eventAnchor: "Deino CD" },
    { date: "2026-05-16", pillarIndex: 0, pillarName: "進階攻略", format: "post" as const, topic: "Deino 配招最佳化", eventAnchor: "Deino CD" },
    { date: "2026-05-17", pillarIndex: 2, pillarName: "活動懶人包", format: "long-text" as const, topic: "Deino CD 攻略總整理", eventAnchor: "Deino CD" },
    { date: "2026-05-18", pillarIndex: 1, pillarName: "玩家故事", format: "reel" as const, topic: "Deino CD 戰利品分享", eventAnchor: "Deino CD" },
    { date: "2026-05-20", pillarIndex: 3, pillarName: "台灣在地", format: "post" as const, topic: "夜市玩家文化" },
    { date: "2026-05-22", pillarIndex: 0, pillarName: "進階攻略", format: "carousel" as const, topic: "Mega 進化優先序" },
    { date: "2026-05-24", pillarIndex: 1, pillarName: "玩家故事", format: "post" as const, topic: "親子玩家家庭" },
    { date: "2026-05-27", pillarIndex: 0, pillarName: "進階攻略", format: "long-text" as const, topic: "稀有寶可夢追蹤" },
    { date: "2026-05-29", pillarIndex: 2, pillarName: "活動懶人包", format: "carousel" as const, topic: "GO Battle Day" },
    { date: "2026-05-31", pillarIndex: 1, pillarName: "玩家故事", format: "reel" as const, topic: "退休族群玩家" },
  ],
};

export const SAMPLE_BRIEFS: PostBrief[] = [
  {
    date: "2026-05-15", pillarIndex: 2, pillarName: "活動懶人包", format: "carousel",
    hook: "Deino Community Day 還有 2 天 — 這 5 件事漏一個就少抓 3 隻閃光",
    copy: "5/17 (六) 11:00-14:00 才是黃金窗口。準備：1) 巨型蛋孵化器  2) 星塵加速 lure  3) 進化券 ×3  4) 夥伴小箱出 trade pool  5) 手機暖機... 漏一項 share 就少 30% 戰果。",
    cta: "立刻收藏這篇 → 週六出門前再看一次",
    imageDirection: "輪播 5 張：每張 1 件準備物 + Pokemon GO 藍黃色塊 + 大字標數字。pillar 視覺方向：倒數 / checklist 視覺、數字最大化",
    eventAnchor: "Deino CD",
  },
  {
    date: "2026-05-17", pillarIndex: 2, pillarName: "活動懶人包", format: "long-text",
    hook: "Deino Community Day 攻略總整理 — 9 個你可能沒注意的細節",
    copy: "活動進行中。整理 9 個少數人才知道的細節：(1) 閃光率比一般 CD 高 20% (2) Deino 的 IV 落點 ... 完整版 + 每小時更新留言區。",
    cta: "留言區按時間軸更新最新觀察 → 點追蹤不漏",
    imageDirection: "長圖 9 段，每段配玩家貢獻數據圖卡。Deino 紫色配色貫穿。pillar 視覺方向：倒數 / 時間軸 / checklist。",
    eventAnchor: "Deino CD",
  },
  {
    date: "2026-05-22", pillarIndex: 0, pillarName: "進階攻略", format: "carousel",
    hook: "從 Deino 到 Hydreigon — 三隻 Mega 進化哪一隻先做？",
    copy: "Mega 進化材料貴，做錯順序虧 200 顆 candy。3 個維度判斷：(a) PvP 戰力 (b) Raid 主流配對 (c) 圖鑑稀有度。給 3 個玩家原型對照 ...",
    cta: "依你的玩法選一個原型 → 留言告訴我們你選哪隻",
    imageDirection: "三欄對照 carousel。每欄一個玩家原型卡（PvP 紅 / Raid 金 / 收藏紫）。pillar 視覺方向：扁平向量 icon、A/B/C 對照表。",
  },
];

export const SAMPLE_QA: QAReport = {
  verdict: "needs_revision",
  overallScore: 78,
  pillarChecks: [
    { pillarName: "進階攻略",   expectedRatio: 35, actualRatio: 33, score: 85, notes: "差 1 篇微調 OK" },
    { pillarName: "玩家故事",   expectedRatio: 30, actualRatio: 27, score: 82, notes: "兩篇玩家故事都偏新北 — 建議加 1 篇南部" },
    { pillarName: "活動懶人包", expectedRatio: 20, actualRatio: 27, score: 70, notes: "因 Deino CD 拉高比例（合理 over-allocate），但要記得 6 月平衡回來" },
    { pillarName: "台灣在地",   expectedRatio: 15, actualRatio: 13, score: 78, notes: "未涵蓋離島玩家視角（偏北部）" },
  ],
  eventChecks: [
    { eventName: "Deino Community Day Classic (5/17)", posts: 4, expectedPosts: 4, score: 92, notes: "前 2 天倒數 + 當日攻略 + 後 1 天戰利品分享 — 結構好" },
  ],
  itemChecklist: [
    { id: "voice",             label: "品牌語氣一致性",     status: "pass",    detail: "三篇 brief 都保持「玩家視角、不官方化」" },
    { id: "ratio",             label: "Pillar 比例對齊",     status: "warning", detail: "活動懶人包 27% > 預期 20% — Deino CD 集中" },
    { id: "regional",          label: "在地多元覆蓋",        status: "warning", detail: "玩家故事 / 台灣在地共 6 篇均偏北部" },
    { id: "event-integration", label: "Deino CD 整合度",     status: "pass",    detail: "倒數 → 當日 → 後續 share 結構完整" },
    { id: "cta-variety",       label: "CTA 多樣性",          status: "pass",    detail: "5 篇 brief 用了 5 種不同 CTA 類型" },
  ],
};
