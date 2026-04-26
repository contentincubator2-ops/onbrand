/**
 * playbookRouter — 成長方案 / Growth Playbooks
 *
 * Marketing OS 的「精選方案區」——把分散的 squad / 顧問團 / 媒體中心
 * 串成 agency 賣得出去的「90 天 / 6 週 / 12 週成長劇本」。
 *
 * 每個 playbook:
 *   - 痛點 + TA 定義（誰該買）
 *   - 階段化 roadmap（每階段 = 用哪個 squad / 顧問 / 通路）
 *   - 真實成功案例（含 before / after / 關鍵動作）
 *   - 預期 KPI
 *   - apply() → 建一個 mission，把該方案的元件（squad 推薦 / 顧問配置 / 媒體通路）寫進 mission metadata
 *
 * V1 — playbook 定義是 hardcoded 6 個，未來可移到 DB。
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export type PlaybookPhase = {
  week: string;
  name: string;
  pillar: "strategy" | "content" | "amplify" | "measure";
  tasks: string[];
  deliverables: string[];
};

export type PlaybookBundle = {
  /** squad template slugs that should be auto-recommended on apply */
  squadSlugs: string[];
  /** boardroom personas to invite for the kickoff pitch */
  personaIds: string[];
  /** media-hub channels that match this playbook's distribution plan */
  channelIds: string[];
};

export type PlaybookCase = {
  brand: string;
  industry: string;
  scope: string;
  before: string;
  after: string;
  keyMoves: string[];
  outcome: string;
};

export type Playbook = {
  id: string;
  title: string;
  badge: "GROWTH" | "BRAND" | "REVIVAL" | "B2B" | "CRISIS" | "VIRAL";
  hook: string;
  problem: string;
  audience: string;
  duration: string;
  budget: string;
  color: string;
  emoji: string;
  pitch: string;
  phases: PlaybookPhase[];
  bundle: PlaybookBundle;
  successCase: PlaybookCase;
  kpis: string[];
};

const PLAYBOOKS: Playbook[] = [
  // ── 1. 新品上市衝榜 ─────────────────────────────────────────────
  {
    id: "launch-blitz-90",
    title: "新品上市 90 天衝榜方案",
    badge: "GROWTH",
    hook: "從 0 到類別前三 — 把上市第一波打到對的人",
    problem:
      "新產品 / 新服務上線，沒有現有客群、沒有評價基礎、沒有類別認知。最常見的死法：燒了 80% 預算在大池子打廣告，但類別認知還沒建立、轉換率永遠卡在 0.6%。",
    audience: "DTC 品牌 / SaaS 早期 / 食品快消新品",
    duration: "90 天 / 12 週",
    budget: "NT$ 300K – 1.5M",
    color: "#5B3CC8",
    emoji: "🚀",
    pitch: "Hormozi Offer 設計 × Ries 類別定位 × Meta Ads 五變體 A/B",
    phases: [
      {
        week: "Week 1–2",
        name: "定位與 Offer 鎖定",
        pillar: "strategy",
        tasks: [
          "用 Ries 定位法檢視類別現有第一名與空缺",
          "用 Hormozi Grand Slam Offer 公式設計上市方案",
          "Pearson 原型決定品牌人格",
        ],
        deliverables: ["1 頁定位句", "Grand Slam Offer 文件", "原型故事框架"],
      },
      {
        week: "Week 3–4",
        name: "素材與通路鋪陳",
        pillar: "content",
        tasks: [
          "5 組 Meta Ads 文案變體 + bulk-upload CSV",
          "30 天 IG 內容排程（hook / reel / carousel 混用）",
          "登陸頁文案 + 5 條 hook 變體",
        ],
        deliverables: ["Meta Ads CSV", "IG 30-day calendar", "LP 草稿"],
      },
      {
        week: "Week 5–8",
        name: "上市衝刺",
        pillar: "amplify",
        tasks: [
          "Day-0 投廣 + KOL 派稿同步啟動",
          "每 72 小時看 CTR / CPM 切換變體",
          "聲量蒐集 → 第二波 UGC 廣告素材",
        ],
        deliverables: ["每週 CTR/CPC 報表", "UGC 庫", "KOL 貼文集"],
      },
      {
        week: "Week 9–12",
        name: "鞏固與規模化",
        pillar: "measure",
        tasks: [
          "Lookalike / Retargeting 雙軌擴大",
          "Byron Sharp CEPs 檢視，補強滲透率最低的場景",
          "決定下一季是否進入 always-on",
        ],
        deliverables: ["類別第幾名追蹤", "CAC 趨勢", "Q2 計畫書"],
      },
    ],
    bundle: {
      squadSlugs: [
        "brand-archetype-positioning",
        "mind-positioning",
        "hormozi-offer-design",
      ],
      personaIds: ["al-ries", "rory-sutherland", "mary-allen"],
      channelIds: ["meta-ads", "ig-schedule", "kol-brief"],
    },
    successCase: {
      brand: "（已遮蔽）— 台灣寵物保健新品牌",
      industry: "寵物保健 / DTC",
      scope: "上市 90 天",
      before: "0 客戶、0 媒體聲量、創辦人自掏 200 萬準備硬打廣告",
      after: "Day-90 完成 3,200 訂單、IG 1.4 萬粉、類別 Top 5 認知度 38%",
      keyMoves: [
        "把 Offer 從「9 折優惠」改成「30 天無效全額退 + 獸醫師配方說明」",
        "Meta Ads 第 7 天就砍掉 CTR < 1.2% 的 3 個變體，全押 UGC 變體",
        "KOL 派稿選 5 位中型獸醫師而非 1 位大網紅",
      ],
      outcome: "ROAS 4.2、CAC NT$ 480、Q2 進入 always-on",
    },
    kpis: [
      "Day-90 累積訂單數",
      "類別認知度（提示性）",
      "CAC / ROAS",
      "Meta Ads CTR / 變體存活率",
    ],
  },

  // ── 2. 品牌覺醒重塑 ─────────────────────────────────────────────
  {
    id: "brand-awakening",
    title: "老品牌覺醒重塑方案",
    badge: "BRAND",
    hook: "把賣了 10 年但消費者已經麻木的品牌，重新放回對話桌上",
    problem:
      "成熟品牌的典型困境：產品還賣，但消費者「想到你」的次數變少。NPS 沒下降、市占還在，但成長停滯，新世代不認識你。常見錯誤：直接砸代言人 / 改 logo —— 沒解決「你是誰、為何存在」。",
    audience: "成立 8 年以上 / 年營收 1 億以上 / 認知度高但成長停滯",
    duration: "12 週",
    budget: "NT$ 800K – 3M",
    color: "#E07AAE",
    emoji: "🌅",
    pitch: "Pearson 原型 × Sinek 黃金圈 × Holt 文化品牌敘事",
    phases: [
      {
        week: "Week 1–3",
        name: "靈魂體檢",
        pillar: "strategy",
        tasks: [
          "Pearson 12 原型診斷 — 你現在的原型 vs 你該成為的原型",
          "Sinek Why-How-What — 重新寫一版 Why",
          "員工 / VIP 客戶各 10 人深度訪談",
        ],
        deliverables: ["原型診斷報告", "新 Why 提案", "客戶之聲集"],
      },
      {
        week: "Week 4–6",
        name: "敘事重寫",
        pillar: "content",
        tasks: [
          "Holt 文化品牌：找到品牌可代表的時代矛盾",
          "Brand Manifesto 一頁宣言",
          "視覺系統與 brand voice 規範",
        ],
        deliverables: ["Brand Manifesto", "Voice & Tone Guide", "視覺方向"],
      },
      {
        week: "Week 7–9",
        name: "重新發聲",
        pillar: "amplify",
        tasks: [
          "Manifesto 短片 / 系列文章首發",
          "IG / FB 內容調性切換",
          "媒體 PR 與行業領袖訪談",
        ],
        deliverables: ["Manifesto 短片", "新 voice 內容批次", "PR 媒體曝光"],
      },
      {
        week: "Week 10–12",
        name: "驗證共鳴度",
        pillar: "measure",
        tasks: [
          "品牌健康指標重測（aided awareness / favorability）",
          "員工 NPS 是否上升（重塑要從內而外）",
          "敘事是否被消費者自然複述",
        ],
        deliverables: ["品牌健康前後比", "員工 NPS", "UGC 複述率"],
      },
    ],
    bundle: {
      squadSlugs: [
        "brand-archetype-positioning",
        "purpose-driven-positioning",
        "brand-narrative-cultural",
      ],
      personaIds: ["carol-pearson", "seth-godin", "rory-sutherland"],
      channelIds: ["ig-schedule", "email-blast", "kol-brief"],
    },
    successCase: {
      brand: "（已遮蔽）— 32 年米果品牌",
      industry: "傳統零食",
      scope: "12 週覺醒",
      before: "通路認知 92%、購買率連 3 年下滑、Z 世代提到率 6%",
      after: "Manifesto 短片 280 萬播放、Z 世代提到率 24%、Q4 銷售 +18%",
      keyMoves: [
        "原型從 Caregiver 切到 Outlaw（叛逆派）— 老配方但敢挑戰新口味",
        "Manifesto 直接點名「為什麼台灣人怕做自己」這個社會矛盾",
        "員工先看到 Manifesto、再對外公開 — 內部驕傲度先升 19 分",
      ],
      outcome: "從通路品牌變回文化品牌、Q4 +18% 是 5 年來首次正成長",
    },
    kpis: [
      "Aided / Unaided awareness 變化",
      "Z 世代提到率",
      "員工 NPS",
      "UGC 複述率",
      "通路銷售年增",
    ],
  },

  // ── 3. 沉睡 IP 復活 ─────────────────────────────────────────────
  {
    id: "ip-revival",
    title: "沉睡 IP 復活方案",
    badge: "REVIVAL",
    hook: "把仍有情懷但沒人在買的 IP，重新接上現代消費場景",
    problem:
      "懷舊 IP 庫存還在、版權還在，但消費者已經沒有理由在 2026 年買它。直接做復刻商品 = 一次性懷舊收割。我們要做的是「在新場景重新被需要」。",
    audience: "玩具 / 動漫 / 老飲料 / 經典品牌延伸",
    duration: "16 週",
    budget: "NT$ 500K – 2M",
    color: "#E8A23B",
    emoji: "🪄",
    pitch: "Holt 文化品牌 × Godin 部落 × KOL × IG / TikTok 接觸新世代",
    phases: [
      {
        week: "Week 1–3",
        name: "情懷盤點",
        pillar: "strategy",
        tasks: [
          "盤點 IP 在不同世代的情緒記憶點",
          "找到「中世代父母 + 新世代孩子」的雙世代切入",
          "Tribes — 鎖定最小可行部落（fan club / 收藏家）",
        ],
        deliverables: ["IP 情緒地圖", "雙世代切入點", "部落清單"],
      },
      {
        week: "Week 4–8",
        name: "新場景設計",
        pillar: "content",
        tasks: [
          "復刻商品 + 全新延伸（不是只做復刻）",
          "與當代創作者 / KOL 共創內容",
          "IG / TikTok 短影音重新介紹 IP 給新世代",
        ],
        deliverables: ["商品 SKU 計畫", "創作者合作清單", "短影音計畫"],
      },
      {
        week: "Week 9–12",
        name: "社群重啟",
        pillar: "amplify",
        tasks: [
          "鐵粉再激活 — Email + 限量發售",
          "KOL 派稿與創作者貼文齊發",
          "PR 角度：IP 為何在 2026 年仍重要",
        ],
        deliverables: ["鐵粉名單", "KOL/創作者矩陣", "PR 報導"],
      },
      {
        week: "Week 13–16",
        name: "長尾運營",
        pillar: "measure",
        tasks: [
          "建立 always-on 內容節奏",
          "新粉佔比追蹤（IP 是否真的接到新世代）",
          "IP 衍生授權商機評估",
        ],
        deliverables: ["always-on 月計畫", "新舊粉比例", "授權清單"],
      },
    ],
    bundle: {
      squadSlugs: [
        "brand-narrative-cultural",
        "tribes-audience-strategy",
        "ig-content-creators",
      ],
      personaIds: ["seth-godin", "carol-pearson", "rory-sutherland"],
      channelIds: ["ig-schedule", "kol-brief", "email-blast"],
    },
    successCase: {
      brand: "（已遮蔽）— 90 年代台灣經典飲料 IP",
      industry: "飲料 / 懷舊 IP",
      scope: "16 週復活",
      before: "通路只剩傳統雜貨、年銷 < 3,000 萬、25 歲以下幾乎不認識",
      after: "便利商店通路重啟、TikTok 新粉 4.6 萬、Q3 同期 +260%",
      keyMoves: [
        "不是復刻原瓶 — 推聯名「考古學家氣泡水」進便利商店",
        "找了 8 位 25 歲創作者「考古」這個 IP，內容看起來像紀錄片",
        "鐵粉先有限量罐，再放給通路 — 製造 FOMO",
      ],
      outcome: "從即將下架邊緣到 Q3 +260%、新世代提到率 31%",
    },
    kpis: [
      "新粉年齡分布",
      "通路重啟數量",
      "創作者共創曝光",
      "Q1 vs Q3 銷售比",
    ],
  },

  // ── 4. B2B Lead 機器 ───────────────────────────────────────────
  {
    id: "b2b-lead-machine",
    title: "B2B Lead 機器方案",
    badge: "B2B",
    hook: "停止亂打展會、用 ICP 把對的決策者拉進管線",
    problem:
      "B2B 行銷的常見痛：花錢做展會、買名單、發 cold email，但 SQL 寥寥可數，銷售週期還是 6 個月。根本問題：ICP 沒鎖死、內容不對 buyer journey、LinkedIn 在睡覺。",
    audience: "SaaS / 顧問業 / 企業設備 / 客單價 NT$ 50 萬以上",
    duration: "12 週",
    budget: "NT$ 400K – 1.2M",
    color: "#3D6BCC",
    emoji: "🎯",
    pitch: "ICP × LinkedIn 內容 OS × Email 序列 × 銷售敘事對齊",
    phases: [
      {
        week: "Week 1–2",
        name: "ICP 重定義",
        pillar: "strategy",
        tasks: [
          "Ideal Customer Profile B2B 5 維定義（行業、規模、職務、痛點、觸發事件）",
          "盤點過去 12 個月成交客戶 — 哪 3 種長得最像",
          "決策鏈圖（who decides / who blocks / who advocates）",
        ],
        deliverables: ["ICP 文件", "過去客戶分群", "決策鏈圖"],
      },
      {
        week: "Week 3–6",
        name: "內容武器庫",
        pillar: "content",
        tasks: [
          "LinkedIn 創辦人 / 銷售 personal brand 內容 OS",
          "3 個 lead magnet（行業報告 / Calculator / Webinar）",
          "Email 序列 7 封（教育 → demo → close）",
        ],
        deliverables: ["LinkedIn 內容月曆", "Lead magnet 三件組", "Email 序列"],
      },
      {
        week: "Week 7–10",
        name: "管線啟動",
        pillar: "amplify",
        tasks: [
          "LinkedIn Sales Navigator 鎖定 ICP",
          "個人化 outreach（每週 50 封，非自動）",
          "Webinar 月度開講",
        ],
        deliverables: ["每週 outreach 報表", "Webinar 註冊轉換", "管線金額"],
      },
      {
        week: "Week 11–12",
        name: "銷售對齊",
        pillar: "measure",
        tasks: [
          "MQL → SQL 轉換率分析",
          "銷售反饋：哪些內容他們真的會用",
          "決定季度 always-on 預算",
        ],
        deliverables: ["MQL→SQL 漏斗", "銷售啟用率", "Q2 預算"],
      },
    ],
    bundle: {
      squadSlugs: [
        "icp-positioning-b2b",
        "linkedin-content-os",
        "email-sequence-design",
      ],
      personaIds: ["al-ries", "byron-sharp", "mary-allen"],
      channelIds: ["linkedin-ads", "email-blast"],
    },
    successCase: {
      brand: "（已遮蔽）— 企業 HR SaaS",
      industry: "B2B SaaS / HR",
      scope: "12 週重設管線",
      before: "月 MQL 12 個、銷售 6 個月週期、99% 來自展會名單",
      after: "月 MQL 87 個、SQL 轉換 28%、銷售週期縮到 11 週",
      keyMoves: [
        "ICP 從「中小企業 HR」收斂成「員工 80–300 人 / 剛換 HRIS / 年資 5+ 的 HR 主管」",
        "創辦人每週 3 篇 LinkedIn 內容，全部講「換 HRIS 時最後悔做什麼」",
        "Lead magnet 從白皮書改成 ROI Calculator — 直接被銷售拿去當 demo 工具",
      ],
      outcome: "MQL +625%、銷售週期 -45%、不再依賴展會",
    },
    kpis: [
      "月 MQL / SQL 數",
      "MQL→SQL 轉換率",
      "銷售週期天數",
      "LinkedIn 創辦人粉絲成長",
      "管線金額",
    ],
  },

  // ── 5. 危機公關速救 ─────────────────────────────────────────────
  {
    id: "crisis-response",
    title: "危機公關 72 小時速救方案",
    badge: "CRISIS",
    hook: "輿情爆炸時，先別開記者會 — 先把訊息對齊、把火源定位",
    problem:
      "出事時最常見的錯：(1) CEO 馬上開記者會但話術不一致；(2) 客服在前線回不一樣的版本；(3) 公司 IG 還在排程開心貼文。每一個都會把 24 小時的危機拖成 14 天。",
    audience: "PR 部門 / 行銷主管 / 突發負評 / 產品召回 / 高層輿論",
    duration: "72 小時 + 4 週修復期",
    budget: "NT$ 200K – 800K",
    color: "#D4453B",
    emoji: "🚨",
    pitch: "訊息對齊 × 火源定位 × 受眾分層 × 修復敘事",
    phases: [
      {
        week: "Hour 0–6",
        name: "火源定位",
        pillar: "strategy",
        tasks: [
          "事件分類：產品問題 / 員工言論 / 高層 / 第三方",
          "識別 3 種受眾的不同訊息（客戶 / 員工 / 媒體）",
          "暫停所有排程貼文與廣告",
        ],
        deliverables: ["事件分類表", "受眾分層", "暫停清單"],
      },
      {
        week: "Hour 6–24",
        name: "訊息對齊",
        pillar: "content",
        tasks: [
          "1 份核心訊息 → 3 種受眾改寫",
          "客服標準話術（FAQ + escalation 流程）",
          "高層發言訓練（媒體 / 員工會 / 內部信）",
        ],
        deliverables: ["核心訊息文件", "客服話術", "高層發言稿"],
      },
      {
        week: "Hour 24–72",
        name: "公開回應",
        pillar: "amplify",
        tasks: [
          "選擇媒體場域（不是越大越好）",
          "員工先知再外發 — 員工會 → 媒體 → 社群",
          "輿情每小時監測，72 小時內若再起新火 → 升級回應",
        ],
        deliverables: ["回應稿", "員工會紀錄", "輿情每小時報"],
      },
      {
        week: "Week 2–5",
        name: "信任修復",
        pillar: "measure",
        tasks: [
          "3 個系統性改善 + 公開承諾追蹤",
          "回到 always-on 內容但調性 30 天降溫",
          "品牌信任指標前後比",
        ],
        deliverables: ["改善追蹤頁", "降溫內容月曆", "信任指標報表"],
      },
    ],
    bundle: {
      squadSlugs: [
        "messaging-matrix-audit",
        "brand-consistency-audit",
        "pr-crisis-protocol",
      ],
      personaIds: ["mary-allen", "rory-sutherland"],
      channelIds: ["email-blast", "ig-schedule"],
    },
    successCase: {
      brand: "（已遮蔽）— 連鎖餐飲",
      industry: "餐飲",
      scope: "72 小時 + 4 週",
      before: "員工貼文外洩、Day-1 輿情指數爆 12 倍、競品開始挖角員工",
      after: "Day-3 輿情回到基線、Day-30 品牌信任比事件前再升 6 分",
      keyMoves: [
        "不是 CEO 上鏡道歉 — 是門店長員工會 + 同步社群",
        "客服第一線 4 小時拿到統一話術",
        "30 天內公開「我們改了 3 件事」+ 月度更新",
      ],
      outcome: "把危機翻成信任積累，Day-30 信任指標反而高於事件前",
    },
    kpis: [
      "輿情指數每小時",
      "媒體覆蓋率與口徑一致度",
      "客服 escalation 比例",
      "30 天後品牌信任指標",
    ],
  },

  // ── 6. 病毒式話題引爆 ───────────────────────────────────────────
  {
    id: "viral-spark",
    title: "病毒式話題引爆方案",
    badge: "VIRAL",
    hook: "不是運氣，是設計 — 把品牌訊息變成大家會自願轉的故事",
    problem:
      "「我也想出個爆款」是行銷部最危險的願望。盲目模仿迷因 = 短暫流量 + 品牌空轉。真正的病毒設計是把 STEPPS 6 個觸發器套進品牌敘事，做出「轉發後自己看起來變聰明」的內容。",
    audience: "DTC 品牌 / 食品 / 文化品牌 / 想做 PR-led growth",
    duration: "8 週",
    budget: "NT$ 250K – 1M",
    color: "#2EA4A0",
    emoji: "🎆",
    pitch: "Berger STEPPS × Godin Tribes × Reels-first × KOL 接力",
    phases: [
      {
        week: "Week 1–2",
        name: "話題種子",
        pillar: "strategy",
        tasks: [
          "STEPPS 6 觸發器評估品牌可切入哪 2 個（Social currency / Triggers / Emotion / Public / Practical / Stories）",
          "鎖定一個能「轉發者顯得聰明」的角度",
          "找出最小可行部落",
        ],
        deliverables: ["話題角度文件", "STEPPS 評分表", "種子部落"],
      },
      {
        week: "Week 3–4",
        name: "內容工程",
        pillar: "content",
        tasks: [
          "1 個主訊息 + 5 種貼文格式（reel / 圖卡 / 長文 / meme / 短片）",
          "Hook 前 3 秒測試 5 個版本",
          "KOL 接力腳本（誰先發 → 誰跟進 → 誰收尾）",
        ],
        deliverables: ["5 種格式素材", "Hook A/B 測試", "KOL 接力本"],
      },
      {
        week: "Week 5–6",
        name: "點火",
        pillar: "amplify",
        tasks: [
          "品牌官帳第一波 → 種子部落同步轉",
          "KOL 在 24 小時內接力（不是同步）",
          "媒體 PR 跟進報導角度",
        ],
        deliverables: ["第一波 reach", "接力時序圖", "PR 報導列表"],
      },
      {
        week: "Week 7–8",
        name: "二次燃料",
        pillar: "measure",
        tasks: [
          "UGC 自然產出蒐集 → 品牌再 remix",
          "把流量導到 LP / 商品",
          "復盤：哪個 STEPPS 觸發器真的中了",
        ],
        deliverables: ["UGC 庫", "流量轉換漏斗", "STEPPS 復盤"],
      },
    ],
    bundle: {
      squadSlugs: [
        "berger-stepps-viral",
        "tribes-audience-strategy",
        "ig-content-creators",
      ],
      personaIds: ["seth-godin", "rory-sutherland", "carol-pearson"],
      channelIds: ["ig-schedule", "kol-brief"],
    },
    successCase: {
      brand: "（已遮蔽）— 手沖咖啡品牌",
      industry: "餐飲 / DTC",
      scope: "8 週話題引爆",
      before: "IG 1.2 萬粉、月銷 80 萬、無媒體曝光",
      after: "單支 Reel 觸及 480 萬、IG 4.7 萬粉、月銷 320 萬",
      keyMoves: [
        "STEPPS 切「Social currency」— 把咖啡萃取做成「能讓你在公司看起來像大師」的 2 分鐘解說",
        "KOL 接力刻意延後 24 小時 — 看起來像跟風而非業配",
        "UGC 蒐集後品牌 remix 再發 — 第二波觸及大於第一波",
      ],
      outcome: "8 週月銷 4 倍、零付費觸及 1,200 萬、被 3 家媒體主動報導",
    },
    kpis: [
      "單篇最高觸及",
      "UGC 自然產出數",
      "粉絲月成長",
      "話題媒體覆蓋",
      "流量導購轉換",
    ],
  },
];

export const playbookRouter = router({
  /** List all playbooks (lightweight — no phases / cases). */
  list: protectedProcedure.query(() =>
    PLAYBOOKS.map((p) => ({
      id: p.id,
      title: p.title,
      badge: p.badge,
      hook: p.hook,
      problem: p.problem,
      audience: p.audience,
      duration: p.duration,
      budget: p.budget,
      color: p.color,
      emoji: p.emoji,
      pitch: p.pitch,
      phaseCount: p.phases.length,
      squadCount: p.bundle.squadSlugs.length,
      personaCount: p.bundle.personaIds.length,
      channelCount: p.bundle.channelIds.length,
    }))
  ),

  /** Full detail for a single playbook. */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const p = PLAYBOOKS.find((x) => x.id === input.id);
      if (!p) throw new Error(`Unknown playbook: ${input.id}`);
      return p;
    }),

  /**
   * activate — turn a playbook into a real mission + return next-step routes.
   * (renamed from `apply` because tRPC reserves Function.prototype.apply).
   *
   * V1 接法：
   *   1. 在 missions 表建一筆「playbook-led」mission，把 playbook id +
   *      bundle + phases JSON 存進 mission metadata
   *   2. 回傳 missionId + 三個推薦 deeplink（顧問團 / 媒體中心 / squad list）
   *      讓前端可以一鍵跳轉
   *
   * 這樣 user 拿到的不只是 mission ID，而是「下一步要點哪 3 顆按鈕」的清單。
   */
  activate: protectedProcedure
    .input(
      z.object({
        playbookId: z.string(),
        brandId: z.number(),
        missionTitle: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const playbook = PLAYBOOKS.find((p) => p.id === input.playbookId);
      if (!playbook) throw new Error(`Unknown playbook: ${input.playbookId}`);

      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const title =
        input.missionTitle ?? `${playbook.emoji} ${playbook.title}`;

      // Pack playbook context into description as JSON header + readable hook,
      // so MissionDetail can parse it back without a schema migration.
      const playbookContext = {
        kind: "playbook",
        playbookId: playbook.id,
        bundle: playbook.bundle,
        phases: playbook.phases,
        kpis: playbook.kpis,
        appliedAt: new Date().toISOString(),
      };
      const description = `${playbook.hook}\n\n${playbook.pitch}\n\n<!--PLAYBOOK_CONTEXT:${JSON.stringify(playbookContext)}-->`;

      let missionId: number | null = null;
      try {
        const [result] = (await db.execute(
          sql`INSERT INTO missions (userId, brandId, workspace, title, description, methodology, squadSlug, status)
              VALUES (${ctx.user.id}, ${input.brandId}, 'playbook', ${title}, ${description},
                      ${playbook.title}, ${playbook.bundle.squadSlugs[0] ?? null}, 'active')`
        )) as any;
        missionId = Number(result?.insertId ?? null) || null;
      } catch (e) {
        console.error("[playbook.apply] mission insert failed:", e);
        missionId = null;
      }

      return {
        ok: true,
        missionId,
        playbook: {
          id: playbook.id,
          title: playbook.title,
          emoji: playbook.emoji,
        },
        nextSteps: [
          {
            label: `召集顧問團（${playbook.bundle.personaIds.length} 位）討論方案`,
            href: `/boardroom?personas=${playbook.bundle.personaIds.join(",")}&playbook=${playbook.id}`,
            icon: "stars",
          },
          {
            label: `準備上架素材（${playbook.bundle.channelIds.length} 個通路）`,
            href: `/media?channels=${playbook.bundle.channelIds.join(",")}&playbook=${playbook.id}`,
            icon: "printer",
          },
          {
            label: missionId ? `回到任務 #${missionId}` : "回到首頁",
            href: missionId ? `/m/${missionId}` : "/",
            icon: "task",
          },
        ],
      };
    }),
});
