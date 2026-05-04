/**
 * squad-builder / L1-brand.ts
 *
 * 10 L1 品牌策略 squad 完整 SquadSpec。
 *
 * #1 brand-archetype-positioning (id=11) is the golden reference;
 * we do NOT overwrite it here. The other 9 are upserted.
 *
 * Each spec creates exactly 1 new lead agent (primarySkill matches
 * the squad's canonical skill) and reuses existing agents for the
 * 4–5 step-specialist roles.
 */

import type { SquadSpec } from "./types.js";

// ── helper: build a "create new agent" block for the lead role ──────────
function makeLeadAgentCreator(
  name: string,
  englishName: string,
  title: string,
  englishTitle: string,
  bio: string,
  primarySkill: string,
  specialtyTags: string[],
): NonNullable<SquadSpec["members"][number]["createAgent"]> {
  return {
    name,
    englishName,
    title,
    englishTitle,
    bio,
    specialtyTags: [primarySkill, ...specialtyTags],
    jobLevel: "vp",
    industry: "tech",
  };
}

// ── L1 #2  mind-positioning ──────────────────────────────────────────────
const L1_02_mind: SquadSpec = {
  slug: "mind-positioning",
  name: "心智佔位定位小組",
  description:
    "以 Al Ries & Jack Trout《Positioning: The Battle for Your Mind》為核心，找出品牌在目標受眾心中能獨佔的一個字、一個格子。" +
    "透過競爭心智地圖分析，定義心智階梯位置（Leader / Alternative / Niche），打造一句話的品牌心智坐標。" +
    "適用於競爭紅海中尋找認知差異化的成熟品牌。",
  methodology: "mind-positioning",
  methodologyAuthor: "Al Ries & Jack Trout",
  methodologyYear: 1981,
  tags: [
    "brand-positioning", "positioning", "mind-positioning",
    "mental-ladder", "competitive-strategy", "messaging", "brand-strategy",
  ],
  workspace: ["brand-positioning"],
  layer: "L1_brand",
  tier: "core",
  tokenBudget: 70000,
  members: [
    {
      role: "mind_strategist",
      order: 0,
      isLead: true,
      primarySkill: "mind-positioning-strategist",
      createAgent: makeLeadAgentCreator(
        "林品睿",
        "James Holt",
        "心智定位策略副總裁",
        "VP of Mind Positioning Strategy",
        "資深定位策略顧問，專精以 Ries & Trout 心智階梯理論協助品牌在過度競爭市場中找出可防守的認知坐標。服務過 15 個產業的品牌重塑專案。",
        "mind-positioning-strategist",
        [
          "mental-ladder", "positioning-statement", "competitive-framing",
          "one-word-positioning", "brand-strategy", "mind-share-analysis",
        ],
      ),
    },
    {
      role: "competitive_analyst",
      order: 1,
      isLead: false,
      primarySkill: "competitive-intelligence-market-research",
      fallbackSkills: ["marketing-analytics", "brand-dna"],
    },
    {
      role: "market_researcher",
      order: 2,
      isLead: false,
      primarySkill: "market-research-agent",
      fallbackSkills: ["marketing-analytics", "consumer-insights"],
    },
    {
      role: "brand_voice_writer",
      order: 3,
      isLead: false,
      primarySkill: "brand-voice",
      fallbackSkills: ["marketing-strategy-pmm", "copywriting-pro"],
    },
    {
      role: "media_strategist",
      order: 4,
      isLead: false,
      primarySkill: "media-strategy-planner",
      fallbackSkills: ["cmo", "marketing-director"],
    },
    {
      role: "consistency_auditor",
      order: 5,
      isLead: false,
      primarySkill: "brand-audit",
      fallbackSkills: ["marketing-strategy-pmm", "brand-dna"],
    },
  ],
  workflow: [
    {
      order: 1,
      name: "心智市場掃描",
      description:
        "用 octolens 抓取目標類別中前 10 個品牌的公開溝通素材，Madison MarketMind 掃描消費者討論，盤點每個品牌在消費者心中佔據的一個字 / 一個概念，產出心智市場地圖。",
      tool: "octolens",
      outputType: "mental-market-landscape",
      requiredSkills: [
        "competitive-analysis", "brand-perception",
        "consumer-insights", "market-research",
      ],
      stepMemberRole: "competitive_analyst",
    },
    {
      order: 2,
      name: "心智階梯分析",
      description:
        "依 Ries & Trout 心智階梯理論，為目標品類繪製階梯（Leader / #2 / #3 / Niche），定位品牌當前位置與欲達位置，識別對應戰略（Leader 防守戰 / Alternative 攻擊戰 / Niche 側翼戰）。",
      tool: "marketing-strategy-pmm",
      outputType: "mental-ladder-diagnosis",
      requiredSkills: [
        "competitive-positioning", "brand-strategy",
        "market-research", "perceptual-map",
      ],
      stepMemberRole: "market_researcher",
    },
    {
      order: 3,
      name: "心智空位發現",
      description:
        "在已飽和心智地圖上找到「尚未被佔領的單字 / 概念」。分析三類空位：屬性空位（e.g. 最快）、用途空位（e.g. 運動場景）、對立空位（e.g. 反大眾）。產出前 5 名可戰空位排名與佐證。",
      tool: "internal",
      outputType: "mind-space-gap-analysis",
      requiredSkills: [
        "positioning", "competitive-intelligence",
        "brand-strategy", "creative-direction",
      ],
      stepMemberRole: "mind_strategist",
    },
    {
      order: 4,
      name: "一字定位宣言",
      description:
        "把選定空位轉化為可傳播的一句話定位宣言（For [target]... Brand is the [category]... That [differentiator]）。產出 3 個版本，每版附「記憶點測試」與「防守性測試」評分。",
      tool: "osp_marketing_tools",
      outputType: "one-word-positioning-statement",
      requiredSkills: [
        "brand-voice", "brand-narrative",
        "copywriting", "brand-strategy",
      ],
      stepMemberRole: "brand_voice_writer",
    },
    {
      order: 5,
      name: "心智階梯佔領劇本",
      description:
        "依所選戰略（Leader / Alternative / Niche）設計 12 個月佔領劇本：訊息節奏、媒體通路分配、競品反應預判、KPI（心智佔有率、提及率、聯想率）。",
      tool: "marketing-strategy-pmm",
      outputType: "mind-conquest-playbook",
      requiredSkills: [
        "marketing-strategy-pmm", "omnichannel",
        "running-marketing-campaigns", "media-strategy-planner",
      ],
      stepMemberRole: "media_strategist",
    },
    {
      order: 6,
      name: "心智一致性稽核",
      description:
        "用 marketing-strategy-pmm 掃描所有既有觸點（官網、社群、廣告、客服文案），稽核是否字字朝定位宣言聚焦。產出品牌用詞黑白名單與不一致案例清單。",
      tool: "marketing-strategy-pmm",
      outputType: "mental-consistency-audit",
      requiredSkills: [
        "brand-audit", "omnichannel",
        "brand-voice", "content-strategy",
      ],
      stepMemberRole: "consistency_auditor",
    },
  ],
};

// ── L1 #3  category-design-positioning ───────────────────────────────────
const L1_03_category: SquadSpec = {
  slug: "category-design-positioning",
  name: "品類設計定位小組",
  description:
    "以 Play Bigger（Ramadan, Peterson, Lochhead, Maney, 2016）方法論，不爭現有品類市佔，而是設計新品類、定義新問題、" +
    "成為新品類代名詞。透過 Problem / Category / Company 三位一體設計 + Lightning Strike 市場教育。" +
    "適用於技術驅動新創、顛覆者、產業變革期品牌。",
  methodology: "category-design",
  methodologyAuthor: "Ramadan / Peterson / Lochhead / Maney",
  methodologyYear: 2016,
  tags: [
    "category-design", "category-creation", "thought-leadership",
    "brand-strategy", "market-creation", "gtm", "lightning-strike",
  ],
  workspace: ["brand-positioning"],
  layer: "L1_brand",
  tier: "core",
  tokenBudget: 75000,
  members: [
    {
      role: "category_designer",
      order: 0,
      isLead: true,
      primarySkill: "category-design-strategist",
      createAgent: makeLeadAgentCreator(
        "陳冠豪",
        "Kevin Rhodes",
        "品類設計策略副總裁",
        "VP of Category Design",
        "Play Bigger 認證品類設計顧問。曾協助 3 家 B2B SaaS 從「產品改良者」轉型為「新品類定義者」，其中 2 家在 18 個月內被分析師列入新品類 Magic Quadrant。",
        "category-design-strategist",
        [
          "category-design", "category-creation", "lightning-strike",
          "thought-leadership", "brand-strategy", "market-creation",
          "pov-manifesto",
        ],
      ),
    },
    {
      role: "jtbd_researcher",
      order: 1,
      isLead: false,
      primarySkill: "market-research-agent",
      fallbackSkills: ["consumer-insights", "marketing-analytics"],
    },
    {
      role: "naming_specialist",
      order: 2,
      isLead: false,
      primarySkill: "brand-identity",
      fallbackSkills: ["brand-voice", "copywriting-pro"],
    },
    {
      role: "thought_leadership_strategist",
      order: 3,
      isLead: false,
      primarySkill: "content-marketing",
      fallbackSkills: ["marketing-strategy-pmm", "content-strategy"],
    },
    {
      role: "pr_strategist",
      order: 4,
      isLead: false,
      primarySkill: "marketing-director",
      fallbackSkills: ["cmo", "marketing-strategy-pmm"],
    },
    {
      role: "campaign_architect",
      order: 5,
      isLead: false,
      primarySkill: "running-marketing-campaigns",
      fallbackSkills: ["marketing-brand-playbook", "marketing-strategy-pmm"],
    },
  ],
  workflow: [
    {
      order: 1,
      name: "問題重新定義",
      description:
        "用 JTBD 框架訪談 8–12 位目標客戶，找出他們真正想完成的工作與現有解法的痛點。識別「現有品類無法解決的問題」，這就是新品類的起點。",
      tool: "octolens",
      outputType: "problem-reframe",
      requiredSkills: [
        "consumer-insights", "jobs-to-be-done",
        "market-research", "behavioral-analysis",
      ],
      stepMemberRole: "jtbd_researcher",
    },
    {
      order: 2,
      name: "新品類命名",
      description:
        "依 Lochhead 3-word rule 設計新品類名稱（e.g. 'Conversational Marketing' 取代 'Chatbot'）。命名必須能自成解釋、對抗現有類別、易記。產出 5 個候選 + Google 搜尋量預測。",
      tool: "marketing-strategy-pmm",
      outputType: "category-naming-rationale",
      requiredSkills: [
        "brand-strategy", "naming",
        "category-design", "thought-leadership",
      ],
      stepMemberRole: "naming_specialist",
    },
    {
      order: 3,
      name: "POV 宣言",
      description:
        "撰寫 1000 字品類 POV（Point of View）— 為什麼現有世界是錯的、新世界長什麼樣、品牌為何是定義者。這份文件成為後續所有內容的北極星。",
      tool: "osp_marketing_tools",
      outputType: "category-pov-manifesto",
      requiredSkills: [
        "thought-leadership", "brand-narrative",
        "content-strategy", "executive-communication",
      ],
      stepMemberRole: "thought_leadership_strategist",
    },
    {
      order: 4,
      name: "教育市場計畫",
      description:
        "設計 90 天品類教育路線圖：長篇內容（白皮書、研究報告）、中篇（部落格、podcast 訪談）、短篇（社群貼文）。目標是讓分析師（Gartner / Forrester）開始追蹤新品類。",
      tool: "marketing-strategy-pmm",
      outputType: "market-education-roadmap",
      requiredSkills: [
        "content-marketing", "pr-strategy",
        "thought-leadership", "marketing-brand-playbook",
      ],
      stepMemberRole: "pr_strategist",
    },
    {
      order: 5,
      name: "Lightning Strike 活動設計",
      description:
        "設計一場 60–90 天內密集發生的 Lightning Strike：旗艦大會 + 媒體閃電戰 + 內容大規模投放。目標是在消費者心中植入「這個新品類存在」的認知。",
      tool: "marketing-strategy-pmm",
      outputType: "lightning-strike-plan",
      requiredSkills: [
        "running-marketing-campaigns", "pr-strategy",
        "marketing-strategy-pmm", "event-design",
      ],
      stepMemberRole: "campaign_architect",
    },
  ],
};

// ── L1 #4  differentiation-positioning ───────────────────────────────────
const L1_04_diff: SquadSpec = {
  slug: "differentiation-positioning",
  name: "差異化定位小組",
  description:
    "以 Jack Trout《Differentiate or Die》9 路徑（First / Specialty / Preference / How Made / Ingredient / " +
    "Hot Product / Heritage / Leadership / Market Speciality）診斷並強化品牌唯一可防守的差異化點。" +
    "適用於成熟品牌或挑戰者釐清與鞏固單一差異化敘事。",
  methodology: "differentiation",
  methodologyAuthor: "Jack Trout & Steve Rivkin",
  methodologyYear: 2000,
  tags: [
    "differentiation", "positioning", "competitive-strategy",
    "brand-strategy", "battle-card", "unique-value",
  ],
  workspace: ["brand-positioning"],
  layer: "L1_brand",
  tier: "core",
  tokenBudget: 65000,
  members: [
    {
      role: "differentiation_strategist",
      order: 0,
      isLead: true,
      primarySkill: "differentiation-strategist",
      createAgent: makeLeadAgentCreator(
        "黃怡婷",
        "Emily Foster",
        "差異化定位副總裁",
        "VP of Differentiation Strategy",
        "Trout & Rivkin 體系差異化顧問。擅長在 overchoice 市場中協助同質化品牌找出 9 條可防守路徑中的最佳選擇，並建立訊息金字塔與防守戰略。",
        "differentiation-strategist",
        [
          "differentiation", "9-paths-framework", "unique-value",
          "competitive-defense", "brand-strategy", "positioning",
        ],
      ),
    },
    {
      role: "competitive_scanner",
      order: 1,
      isLead: false,
      primarySkill: "competitive-intelligence-market-research",
      fallbackSkills: ["brand-dna", "marketing-analytics"],
    },
    {
      role: "feasibility_analyst",
      order: 2,
      isLead: false,
      primarySkill: "brand-dna",
      fallbackSkills: ["mbb-strategist", "marketing-strategy-pmm"],
    },
    {
      role: "claim_writer",
      order: 3,
      isLead: false,
      primarySkill: "brand-voice",
      fallbackSkills: ["copywriting-pro", "marketing-strategy-pmm"],
    },
    {
      role: "proof_pyramid_builder",
      order: 4,
      isLead: false,
      primarySkill: "content-strategy",
      fallbackSkills: ["content-marketing", "marketing-strategy-pmm"],
    },
    {
      role: "defense_architect",
      order: 5,
      isLead: false,
      primarySkill: "mbb-strategist",
      fallbackSkills: ["marketing-director", "cmo"],
    },
  ],
  workflow: [
    {
      order: 1,
      name: "差異化框架掃描",
      description: "用 Trout 9 路徑框架掃描品牌現況，列出每條路徑當前表現（有 / 部分 / 無）與競品在該路徑的強度。產出 9×N 競爭強度矩陣。",
      tool: "octolens",
      outputType: "differentiation-landscape",
      requiredSkills: ["competitive-analysis", "brand-strategy", "market-research", "brand-audit"],
      stepMemberRole: "competitive_scanner",
    },
    {
      order: 2,
      name: "9 路徑可行性評估",
      description: "對每條可能路徑評估三項：(a) 品牌內部能力支持度 (b) 競品進入難度 (c) 目標受眾共鳴度。用 3×3 評分矩陣排名前 3。",
      tool: "marketing-strategy-pmm",
      outputType: "9-paths-feasibility-matrix",
      requiredSkills: ["brand-strategy", "competitive-intelligence", "brand-positioning", "consumer-insights"],
      stepMemberRole: "feasibility_analyst",
    },
    {
      order: 3,
      name: "差異化 claim 設計",
      description: "把首選路徑轉為 8–12 字差異化 claim（e.g. 'The safest car in the world'）。產出 3 個版本，每版附記憶性與真實性測試。",
      tool: "osp_marketing_tools",
      outputType: "differentiation-claim",
      requiredSkills: ["brand-voice", "copywriting", "brand-narrative", "messaging-strategy"],
      stepMemberRole: "claim_writer",
    },
    {
      order: 4,
      name: "證據金字塔建構",
      description: "為 claim 建立 RTB（Reason to Believe）金字塔：第一層硬證據（數據、認證、專利）、第二層軟證據（案例、證言）、第三層故事（品牌歷史、創辦人故事）。",
      tool: "marketing-strategy-pmm",
      outputType: "evidence-pyramid",
      requiredSkills: ["brand-strategy", "content-strategy", "pr-strategy", "data-storytelling"],
      stepMemberRole: "proof_pyramid_builder",
    },
    {
      order: 5,
      name: "防守戰略",
      description: "預判競品跟進的 3 種最可能方式（抄襲、挑戰、側翼），針對每種情境設計反應劇本。產出 18 個月防守 roadmap。",
      tool: "marketing-strategy-pmm",
      outputType: "differentiation-defense-plan",
      requiredSkills: ["competitive-strategy", "brand-strategy", "marketing-strategy-pmm", "crisis-management"],
      stepMemberRole: "defense_architect",
    },
  ],
};

// ── L1 #5  competitive-perceptual-mapping ────────────────────────────────
const L1_05_perceptual: SquadSpec = {
  slug: "competitive-perceptual-mapping",
  name: "競爭感知定位小組",
  description:
    "以 Kotler 感知地圖方法論，透過消費者對品牌在關鍵屬性上的感知數據，繪製 2D / 3D 感知地圖。" +
    "視覺化呈現品牌相對位置與空白市場。適用於需要用數據向董事會說服定位決策的場景。",
  methodology: "perceptual-mapping",
  methodologyAuthor: "Philip Kotler (and extensions)",
  methodologyYear: 1991,
  tags: [
    "perceptual-map", "brand-positioning", "competitive-analysis",
    "market-research", "data-visualization", "white-space",
  ],
  workspace: ["brand-positioning"],
  layer: "L1_brand",
  tier: "core",
  tokenBudget: 60000,
  members: [
    {
      role: "perceptual_strategist",
      order: 0,
      isLead: true,
      primarySkill: "perceptual-mapping-strategist",
      createAgent: makeLeadAgentCreator(
        "周士豪",
        "Allen Carter",
        "感知地圖策略副總裁",
        "VP of Perceptual Mapping",
        "量化品牌定位研究專家。曾為 20+ 個 FMCG 品牌建立季度感知地圖追蹤系統，將定性洞察轉為可量化、可視覺化的董事會簡報素材。",
        "perceptual-mapping-strategist",
        [
          "perceptual-map", "brand-tracking", "quantitative-research",
          "data-visualization", "competitive-mapping", "brand-strategy",
        ],
      ),
    },
    {
      role: "dimension_selector",
      order: 1,
      isLead: false,
      primarySkill: "marketing-analytics",
      fallbackSkills: ["brand-dna", "cross-channel-analytics"],
    },
    {
      role: "survey_designer",
      order: 2,
      isLead: false,
      primarySkill: "market-research-agent",
      fallbackSkills: ["consumer-insights", "marketing-analytics"],
    },
    {
      role: "data_visualizer",
      order: 3,
      isLead: false,
      primarySkill: "analytics-dashboard",
      fallbackSkills: ["marketing-analytics", "cross-channel-analytics"],
    },
    {
      role: "opportunity_analyst",
      order: 4,
      isLead: false,
      primarySkill: "brand-dna",
      fallbackSkills: ["mbb-strategist", "marketing-strategy-pmm"],
    },
    {
      role: "tracking_designer",
      order: 5,
      isLead: false,
      primarySkill: "brand-audit",
      fallbackSkills: ["marketing-analytics", "analytics-tracking"],
    },
  ],
  workflow: [
    {
      order: 1,
      name: "屬性維度篩選",
      description: "從品牌既有研究、競品訪談、產業報告萃取 30+ 個屬性詞，用因素分析 / MDS 降維找出 2–3 個有差異化力的維度（e.g. 溫度 × 科技感）。",
      tool: "octolens",
      outputType: "perceptual-dimensions",
      requiredSkills: ["market-research", "consumer-insights", "brand-perception", "data-analysis"],
      stepMemberRole: "dimension_selector",
    },
    {
      order: 2,
      name: "消費者感知調研",
      description: "設計 8–12 題量表問卷（李克特 7 點），針對 N=300 目標 TA 收集對品牌 + 6 個競品在選定維度上的評分。輸出 raw dataset。",
      tool: "internal",
      outputType: "perception-data-dataset",
      requiredSkills: ["market-research-agent", "survey-design", "focus-group", "data-collection"],
      stepMemberRole: "survey_designer",
    },
    {
      order: 3,
      name: "感知地圖繪製",
      description: "將 dataset 繪製成 2D 感知地圖（主維度 × 次維度）+ 氣泡大小 = 品牌市佔。輸出 Board-ready 可視化 deck。",
      tool: "marketing-strategy-pmm",
      outputType: "perceptual-map-deck",
      requiredSkills: ["data-visualization", "marketing-analytics", "brand-strategy", "perceptual-map"],
      stepMemberRole: "data_visualizer",
    },
    {
      order: 4,
      name: "空白機會分析",
      description: "識別地圖上「有消費者需求但無品牌佔領」的空白象限，評估每個空白的 (a) 消費者規模 (b) 品牌進入合理性 (c) 競品可能追擊速度。",
      tool: "marketing-strategy-pmm",
      outputType: "white-space-opportunity",
      requiredSkills: ["brand-strategy", "competitive-analysis", "market-research", "creative-direction"],
      stepMemberRole: "opportunity_analyst",
    },
    {
      order: 5,
      name: "季度追蹤計畫",
      description: "設計每季度重跑同一份問卷的 tracking mechanism，設定關鍵 KPI（品牌在目標象限的相對位移）與預警門檻。",
      tool: "osp_marketing_tools",
      outputType: "perception-tracking-plan",
      requiredSkills: ["marketing-analytics", "brand-audit", "omnichannel-consistency-audit", "brand-strategy"],
      stepMemberRole: "tracking_designer",
    },
  ],
};

// ── L1 #6  purpose-driven-positioning ────────────────────────────────────
const L1_06_purpose: SquadSpec = {
  slug: "purpose-driven-positioning",
  name: "目的導向定位小組",
  description:
    "以 Simon Sinek《Start With Why》Golden Circle（Why → How → What）挖掘品牌存在意義，將使命感轉化為市場定位。" +
    "適用於 ESG-conscious 品牌、面對年輕世代的傳統品牌、創辦人品牌。Purpose 不是 CSR slogan，" +
    "而是內部員工願意相信、外部消費者願意追隨的信念。",
  methodology: "purpose-driven",
  methodologyAuthor: "Simon Sinek",
  methodologyYear: 2009,
  tags: [
    "purpose-driven", "golden-circle", "brand-strategy",
    "why-how-what", "internal-branding", "esg", "meaning",
  ],
  workspace: ["brand-positioning"],
  layer: "L1_brand",
  tier: "core",
  tokenBudget: 65000,
  members: [
    {
      role: "purpose_strategist",
      order: 0,
      isLead: true,
      primarySkill: "purpose-strategist",
      createAgent: makeLeadAgentCreator(
        "蔡宜庭",
        "Tina Barrett",
        "品牌目的策略副總裁",
        "VP of Purpose Strategy",
        "Sinek 認證 Golden Circle 實踐者。擅長從創辦人深度訪談中萃取品牌 Why，並轉化為 How 組織獨特做法與 What 產品實證，讓 Purpose 不只是 slogan。",
        "purpose-strategist",
        [
          "purpose-driven", "golden-circle", "why-discovery",
          "founder-storytelling", "internal-branding", "brand-strategy",
          "esg-strategist",
        ],
      ),
    },
    {
      role: "founder_interviewer",
      order: 1,
      isLead: false,
      primarySkill: "brand-storytelling",
      fallbackSkills: ["case-story-writer", "brand-narrative"],
    },
    {
      role: "culture_analyst",
      order: 2,
      isLead: false,
      primarySkill: "esg-strategist",
      fallbackSkills: ["brand-dna", "cmo"],
    },
    {
      role: "product_story_linker",
      order: 3,
      isLead: false,
      primarySkill: "content-marketing",
      fallbackSkills: ["marketing-strategy-pmm", "content-strategy"],
    },
    {
      role: "manifesto_writer",
      order: 4,
      isLead: false,
      primarySkill: "brand-voice",
      fallbackSkills: ["copywriting-pro", "marketing-strategy-pmm"],
    },
    {
      role: "activation_designer",
      order: 5,
      isLead: false,
      primarySkill: "marketing-director",
      fallbackSkills: ["cmo", "marketing-strategy-pmm"],
    },
  ],
  workflow: [
    {
      order: 1,
      name: "Why 深掘訪談",
      description: "訪談創辦人 / CEO / 3–5 位資深員工各 60 分鐘，挖掘「為什麼公司存在」的本源動機。用 7 個 Why 遞推法逼近深層信念。產出 Founder Why Document。",
      tool: "internal",
      outputType: "founders-why-document",
      requiredSkills: ["executive-interviewing", "brand-strategy", "organizational-culture", "brand-storytelling"],
      stepMemberRole: "founder_interviewer",
    },
    {
      order: 2,
      name: "How 組織獨特做法",
      description: "盤點組織內部可對外傳播的 How 差異點：流程、文化、治理方式、人才培育。產出 5–7 條 How 清單 + 每條的內外部證據。",
      tool: "marketing-strategy-pmm",
      outputType: "how-differentiator-list",
      requiredSkills: ["organizational-culture", "brand-strategy", "internal-branding", "case-story-writer"],
      stepMemberRole: "culture_analyst",
    },
    {
      order: 3,
      name: "What 產品實證連結",
      description: "把 Why / How 連結到具體 What（產品、服務、案例）。每個 What 標註對應的 Why 子項，確保對外溝通層層呼應。",
      tool: "marketing-strategy-pmm",
      outputType: "what-proof-points",
      requiredSkills: ["product-marketing", "brand-strategy", "content-strategy", "brand-storytelling"],
      stepMemberRole: "product_story_linker",
    },
    {
      order: 4,
      name: "Golden Circle Manifesto",
      description: "撰寫 500 字品牌 Manifesto（Why / How / What 三段式）。產出多通路版本：2 分鐘口頭版（CEO 簡報用）、書面版（官網）、60 秒影片版（社群）。",
      tool: "osp_marketing_tools",
      outputType: "golden-circle-manifesto",
      requiredSkills: ["brand-voice", "brand-narrative", "copywriting", "thought-leadership"],
      stepMemberRole: "manifesto_writer",
    },
    {
      order: 5,
      name: "Purpose 內部啟動計畫",
      description: "設計 90 天內部 Purpose 啟動計畫：全員溝通大會、主管培訓、日常儀式（週會 Why story）、績效考核 Purpose-alignment 指標。",
      tool: "marketing-strategy-pmm",
      outputType: "purpose-activation-roadmap",
      requiredSkills: ["internal-branding", "organizational-culture", "leadership-communication", "change-management"],
      stepMemberRole: "activation_designer",
    },
  ],
};

// ── L1 #7  blue-ocean-positioning ────────────────────────────────────────
const L1_07_blueocean: SquadSpec = {
  slug: "blue-ocean-positioning",
  name: "藍海策略定位小組",
  description:
    "以 Kim & Mauborgne《Blue Ocean Strategy》四行動框架（Eliminate / Reduce / Raise / Create）與策略草圖，找出現有產業邊界外的未爭之地。" +
    "適用於同質化競爭、毛利壓縮的成熟產業品牌。產出 ERRC grid + Value Innovation Canvas + 非顧客三層分析。",
  methodology: "blue-ocean-strategy",
  methodologyAuthor: "W. Chan Kim & Renée Mauborgne",
  methodologyYear: 2005,
  tags: [
    "blue-ocean", "value-innovation", "errc-grid",
    "strategic-planning", "brand-strategy", "non-customer",
  ],
  workspace: ["brand-positioning"],
  layer: "L1_brand",
  tier: "core",
  tokenBudget: 70000,
  members: [
    {
      role: "blue_ocean_strategist",
      order: 0,
      isLead: true,
      primarySkill: "blue-ocean-strategist",
      createAgent: makeLeadAgentCreator(
        "呂思賢",
        "Sean Marsh",
        "藍海策略副總裁",
        "VP of Blue Ocean Strategy",
        "INSEAD 藍海策略認證實踐者。擅長協助成熟產業品牌打破競爭框架，透過四行動框架找出可擴大毛利的新價值曲線。",
        "blue-ocean-strategist",
        [
          "blue-ocean-strategy", "value-innovation", "errc-grid",
          "strategic-canvas", "non-customer-analysis", "brand-strategy",
        ],
      ),
    },
    {
      role: "industry_benchmark_analyst",
      order: 1,
      isLead: false,
      primarySkill: "mbb-strategist",
      fallbackSkills: ["marketing-analytics", "brand-dna"],
    },
    {
      role: "errc_facilitator",
      order: 2,
      isLead: false,
      primarySkill: "brand-dna",
      fallbackSkills: ["mbb-strategist", "marketing-strategy-pmm"],
    },
    {
      role: "non_customer_researcher",
      order: 3,
      isLead: false,
      primarySkill: "market-research-agent",
      fallbackSkills: ["consumer-insights", "marketing-analytics"],
    },
    {
      role: "positioning_writer",
      order: 4,
      isLead: false,
      primarySkill: "brand-voice",
      fallbackSkills: ["marketing-strategy-pmm", "copywriting-pro"],
    },
    {
      role: "gtm_architect",
      order: 5,
      isLead: false,
      primarySkill: "marketing-strategy-pmm",
      fallbackSkills: ["marketing-brand-playbook", "running-marketing-campaigns"],
    },
  ],
  workflow: [
    {
      order: 1,
      name: "產業 value curve 繪製",
      description: "選出產業關鍵競爭因素 6–10 個，為自家品牌與 3–5 個競品在各因素上評分 1–5，繪製策略草圖（Strategy Canvas）。",
      tool: "octolens",
      outputType: "industry-value-curve",
      requiredSkills: ["competitive-analysis", "mbb-strategist", "benchmarking", "market-research"],
      stepMemberRole: "industry_benchmark_analyst",
    },
    {
      order: 2,
      name: "ERRC 四行動分析",
      description: "對產業共識進行四項操作：Eliminate（消除什麼）/ Reduce（降低什麼）/ Raise（提升什麼）/ Create（創造什麼）。產出 ERRC grid + 預期成本與差異化影響。",
      tool: "marketing-strategy-pmm",
      outputType: "errc-grid",
      requiredSkills: ["mbb-strategist", "brand-strategy", "strategic-planning", "cost-structure-analysis"],
      stepMemberRole: "errc_facilitator",
    },
    {
      order: 3,
      name: "Non-customer 三層分析",
      description: "分析三層非顧客（第一層 soon-to-be、第二層 refusers、第三層 unexplored），找出他們不買的共通反對理由，把新策略導向回應這些理由。",
      tool: "octolens",
      outputType: "non-customer-three-tiers",
      requiredSkills: ["consumer-insights", "market-research", "segmentation-analysis", "brand-strategy"],
      stepMemberRole: "non_customer_researcher",
    },
    {
      order: 4,
      name: "藍海定位宣言",
      description: "撰寫藍海定位宣言：既有產業 red ocean 提供的 vs 本品牌 blue ocean 提供的，一張圖對比說明。",
      tool: "osp_marketing_tools",
      outputType: "blue-ocean-positioning-statement",
      requiredSkills: ["brand-positioning", "brand-voice", "brand-strategy", "brand-narrative"],
      stepMemberRole: "positioning_writer",
    },
    {
      order: 5,
      name: "Value Innovation Roadmap",
      description: "設計 12–18 個月 value innovation 實踐路線圖，包含：產品調整、定價策略、通路重新配置、傳播重點。",
      tool: "marketing-strategy-pmm",
      outputType: "value-innovation-roadmap",
      requiredSkills: ["marketing-strategy-pmm", "go-to-market", "brand-strategy", "marketing-brand-playbook"],
      stepMemberRole: "gtm_architect",
    },
  ],
};

// ── L1 #8  brand-equity-cbbe ─────────────────────────────────────────────
const L1_08_cbbe: SquadSpec = {
  slug: "brand-equity-cbbe",
  name: "品牌權益金字塔小組",
  description:
    "以 Kevin Lane Keller CBBE（Customer-Based Brand Equity）金字塔：Salience → Performance/Imagery → Judgments/Feelings → Resonance，" +
    "系統性診斷品牌權益弱點與強化路徑。適用於需量化品牌健康度、向投資人/董事會說明品牌投資 ROI 的企業。",
  methodology: "cbbe-pyramid",
  methodologyAuthor: "Kevin Lane Keller",
  methodologyYear: 2013,
  tags: [
    "brand-equity", "cbbe", "brand-pyramid",
    "brand-health", "brand-tracking", "brand-strategy",
  ],
  workspace: ["brand-positioning"],
  layer: "L1_brand",
  tier: "core",
  tokenBudget: 65000,
  members: [
    {
      role: "equity_strategist",
      order: 0,
      isLead: true,
      primarySkill: "brand-equity-strategist",
      createAgent: makeLeadAgentCreator(
        "廖曉雯",
        "Rebecca Stone",
        "品牌權益副總裁",
        "VP of Brand Equity",
        "Keller CBBE 金字塔資深實踐者。為 12 個消費品牌建立季度品牌健康 tracker，把品牌投資與商業表現連結，證明品牌是可量化資產。",
        "brand-equity-strategist",
        [
          "brand-equity", "cbbe-pyramid", "brand-tracking",
          "brand-health-scorecard", "quantitative-brand-research", "brand-strategy",
        ],
      ),
    },
    {
      role: "salience_researcher",
      order: 1,
      isLead: false,
      primarySkill: "market-research-agent",
      fallbackSkills: ["marketing-analytics", "consumer-insights"],
    },
    {
      role: "performance_imagery_analyst",
      order: 2,
      isLead: false,
      primarySkill: "brand-audit",
      fallbackSkills: ["brand-dna", "marketing-analytics"],
    },
    {
      role: "judgment_feeling_researcher",
      order: 3,
      isLead: false,
      primarySkill: "consumer-insights",
      fallbackSkills: ["market-research-agent", "brand-dna"],
    },
    {
      role: "resonance_community_analyst",
      order: 4,
      isLead: false,
      primarySkill: "social-media-marketing",
      fallbackSkills: ["content-marketing", "brand-dna"],
    },
    {
      role: "uplift_planner",
      order: 5,
      isLead: false,
      primarySkill: "marketing-strategy-pmm",
      fallbackSkills: ["cmo", "marketing-director"],
    },
  ],
  workflow: [
    {
      order: 1,
      name: "Salience 品牌認知度診斷",
      description: "測量品牌未提示認知（unaided awareness）、提示認知（aided awareness）、top-of-mind 排名。對比產業標準，找出認知缺口。",
      tool: "octolens",
      outputType: "salience-diagnostic",
      requiredSkills: ["brand-audit", "market-research", "brand-tracking", "survey-design"],
      stepMemberRole: "salience_researcher",
    },
    {
      order: 2,
      name: "Performance / Imagery 評估",
      description: "量化品牌在 Performance（實際產品表現）與 Imagery（形象、使用者、場景）兩面的消費者感知。產出 8 項屬性 scorecard。",
      tool: "marketing-strategy-pmm",
      outputType: "performance-imagery-scorecard",
      requiredSkills: ["brand-audit", "consumer-insights", "brand-perception", "competitive-analysis"],
      stepMemberRole: "performance_imagery_analyst",
    },
    {
      order: 3,
      name: "Judgments / Feelings 分析",
      description: "訪談 12 位目標 TA，挖掘對品牌的 4 種判斷（品質、可信度、考慮度、優越感）和 6 種情緒（溫暖、樂趣、興奮、安全、社會認可、自我尊重）。",
      tool: "internal",
      outputType: "judgment-feeling-report",
      requiredSkills: ["consumer-insights", "brand-audit", "emotional-branding", "qualitative-research"],
      stepMemberRole: "judgment_feeling_researcher",
    },
    {
      order: 4,
      name: "Resonance 忠誠度地圖",
      description: "分析品牌社群的行為忠誠（重複購買、推薦）與態度忠誠（情感承諾、認同感）。找出最高 resonance 的小眾並分析其特徵。",
      tool: "octolens",
      outputType: "resonance-loyalty-map",
      requiredSkills: ["social-media-marketing", "brand-audit", "behavioral-analysis", "community-building"],
      stepMemberRole: "resonance_community_analyst",
    },
    {
      order: 5,
      name: "CBBE 提升路線圖",
      description: "依金字塔診斷結果標出優先缺口，設計 6 / 12 / 24 個月提升計畫。把品牌投資支出分配到每個金字塔層級，產出可向 CFO 報告的 ROI 模型。",
      tool: "marketing-strategy-pmm",
      outputType: "cbbe-uplift-roadmap",
      requiredSkills: ["brand-strategy", "marketing-strategy-pmm", "brand-audit", "marketing-director"],
      stepMemberRole: "uplift_planner",
    },
  ],
};

// ── L1 #9  brand-story-positioning ───────────────────────────────────────
const L1_09_storybrand: SquadSpec = {
  slug: "brand-story-positioning",
  name: "品牌故事定位小組",
  description:
    "以 Donald Miller《Building a StoryBrand》SB7 框架（Character → Problem → Guide → Plan → Call to Action → Success → Failure）" +
    "將品牌重新定位為「消費者故事的嚮導」而非主角。適用於 messaging 混亂、官網訊息模糊的中小品牌。",
  methodology: "storybrand-sb7",
  methodologyAuthor: "Donald Miller",
  methodologyYear: 2017,
  tags: [
    "storybrand", "sb7", "brand-story",
    "narrative", "messaging", "customer-centric", "conversion-copy",
  ],
  workspace: ["brand-positioning"],
  layer: "L1_brand",
  tier: "core",
  tokenBudget: 60000,
  members: [
    {
      role: "storybrand_strategist",
      order: 0,
      isLead: true,
      primarySkill: "storybrand-strategist",
      createAgent: makeLeadAgentCreator(
        "方志翔",
        "Henry Blake",
        "品牌敘事策略副總裁",
        "VP of Brand Story Strategy",
        "StoryBrand 認證導師。專精將模糊訊息轉化為 SB7 七步清晰敘事，為中小品牌打造官網 BrandScript 與 Sales Funnel Messaging。",
        "storybrand-strategist",
        [
          "storybrand-sb7", "brand-story", "narrative-design",
          "conversion-copy", "one-liner-crafting", "brand-strategy",
          "brand-storytelling",
        ],
      ),
    },
    {
      role: "hero_persona_mapper",
      order: 1,
      isLead: false,
      primarySkill: "consumer-insights",
      fallbackSkills: ["market-research-agent", "brand-dna"],
    },
    {
      role: "problem_architect",
      order: 2,
      isLead: false,
      primarySkill: "market-research-agent",
      fallbackSkills: ["consumer-insights", "brand-dna"],
    },
    {
      role: "guide_positioner",
      order: 3,
      isLead: false,
      primarySkill: "brand-voice",
      fallbackSkills: ["marketing-strategy-pmm", "copywriting-pro"],
    },
    {
      role: "plan_designer",
      order: 4,
      isLead: false,
      primarySkill: "content-strategy",
      fallbackSkills: ["content-marketing", "marketing-strategy-pmm"],
    },
    {
      role: "brandscript_writer",
      order: 5,
      isLead: false,
      primarySkill: "copywriting-pro",
      fallbackSkills: ["brand-voice", "marketing-strategy-pmm"],
    },
  ],
  workflow: [
    {
      order: 1,
      name: "Character 消費者英雄定義",
      description: "把消費者當故事主角，定義他的渴望（external / internal / philosophical want）、當前狀態與理想狀態之差距。",
      tool: "internal",
      outputType: "customer-as-hero-profile",
      requiredSkills: ["consumer-insights", "empathy-mapping", "brand-storytelling", "market-research"],
      stepMemberRole: "hero_persona_mapper",
    },
    {
      order: 2,
      name: "Problem 三層問題架構",
      description: "定義消費者三層問題：External（外部實際問題）、Internal（情緒感受）、Philosophical（這個問題為什麼不該存在）。",
      tool: "marketing-strategy-pmm",
      outputType: "three-layer-problem-map",
      requiredSkills: ["consumer-insights", "jobs-to-be-done", "behavioral-analysis", "customer-journey"],
      stepMemberRole: "problem_architect",
    },
    {
      order: 3,
      name: "Guide 品牌嚮導定位",
      description: "把品牌從「主角」重新定位為「嚮導」。展現 Empathy（同理心）+ Authority（權威）。Empathy 透過認同陳述，Authority 透過 credentials / social proof。",
      tool: "osp_marketing_tools",
      outputType: "guide-authority-positioning",
      requiredSkills: ["brand-voice", "brand-narrative", "positioning", "brand-storytelling"],
      stepMemberRole: "guide_positioner",
    },
    {
      order: 4,
      name: "Plan 三步路徑設計",
      description: "為消費者設計簡單的三步行動路徑（Step 1 / Step 2 / Step 3），降低「我不知道要做什麼」的焦慮。每步不超過 6 個字。",
      tool: "marketing-strategy-pmm",
      outputType: "three-step-plan-framework",
      requiredSkills: ["customer-journey", "content-strategy", "copywriting", "ux-writing"],
      stepMemberRole: "plan_designer",
    },
    {
      order: 5,
      name: "One-Liner + BrandScript",
      description: "輸出兩份核心產物：(1) One-liner 一句話定位（For [who]..., Brand helps them [achieve what]...），(2) 完整 BrandScript 套用到官網 hero、about、CTA 區塊。",
      tool: "osp_marketing_tools",
      outputType: "storybrand-brandscript",
      requiredSkills: ["copywriting", "brand-voice", "brand-narrative", "conversion-copy"],
      stepMemberRole: "brandscript_writer",
    },
  ],
};

// ── L1 #10  cultural-branding ────────────────────────────────────────────
const L1_10_cultural: SquadSpec = {
  slug: "cultural-branding",
  name: "文化符號品牌小組",
  description:
    "以 Douglas Holt《How Brands Become Icons: The Principles of Cultural Branding》解讀當代文化張力（ideological contradictions），" +
    "將品牌定位為回應社會焦慮的文化符號。歷經 Coca-Cola、Nike、Harley 等 icon 品牌驗證。" +
    "適用於希望從「產品品牌」升級為「文化 icon」的長青品牌。",
  methodology: "cultural-branding",
  methodologyAuthor: "Douglas Holt",
  methodologyYear: 2004,
  tags: [
    "cultural-branding", "icon-myth", "cultural-tension",
    "brand-narrative", "ideology", "sociological-branding",
  ],
  workspace: ["brand-positioning"],
  layer: "L1_brand",
  tier: "core",
  tokenBudget: 75000,
  members: [
    {
      role: "cultural_strategist",
      order: 0,
      isLead: true,
      primarySkill: "cultural-strategist",
      createAgent: makeLeadAgentCreator(
        "洪詩婷",
        "Shirley Grant",
        "文化品牌策略副總裁",
        "VP of Cultural Brand Strategy",
        "Harvard Business School《How Brands Become Icons》方法論深耕者。結合社會學、人類學、品牌敘事，為長青品牌打造可回應世代焦慮的 icon myth。",
        "cultural-strategist",
        [
          "cultural-branding", "icon-myth", "cultural-tension-analysis",
          "sociological-research", "brand-narrative", "brand-strategy",
          "myth-market-making",
        ],
      ),
    },
    {
      role: "cultural_tension_scanner",
      order: 1,
      isLead: false,
      primarySkill: "content-strategy",
      fallbackSkills: ["brand-storytelling", "consumer-insights"],
    },
    {
      role: "identity_group_analyst",
      order: 2,
      isLead: false,
      primarySkill: "consumer-insights",
      fallbackSkills: ["market-research-agent", "brand-dna"],
    },
    {
      role: "myth_narrative_writer",
      order: 3,
      isLead: false,
      primarySkill: "brand-storytelling",
      fallbackSkills: ["case-story-writer", "brand-voice"],
    },
    {
      role: "icon_strategist",
      order: 4,
      isLead: false,
      primarySkill: "brand-dna",
      fallbackSkills: ["cmo", "marketing-strategy-pmm"],
    },
    {
      role: "cultural_activation_designer",
      order: 5,
      isLead: false,
      primarySkill: "marketing-director",
      fallbackSkills: ["running-marketing-campaigns", "cmo"],
    },
  ],
  workflow: [
    {
      order: 1,
      name: "文化張力掃描",
      description: "掃描當代社會 3–5 個主要 ideological contradictions（e.g. 科技進步 vs 疏離焦慮、全球化 vs 在地認同）。評估每個張力對目標 TA 的影響強度。",
      tool: "octolens",
      outputType: "cultural-tension-map",
      requiredSkills: ["cultural-research", "sociological-analysis", "trend-analysis", "consumer-insights"],
      stepMemberRole: "cultural_tension_scanner",
    },
    {
      order: 2,
      name: "族群身份連結",
      description: "找出哪一類身份族群（identity group）最感受這個文化張力。研究他們的儀式、語言、符號、焦慮。品牌要成為「為這個族群發聲」的代言者。",
      tool: "octolens",
      outputType: "identity-group-linkage",
      requiredSkills: ["consumer-insights", "brand-community", "cultural-research", "segmentation-analysis"],
      stepMemberRole: "identity_group_analyst",
    },
    {
      order: 3,
      name: "品牌神話 narrative 設計",
      description: "為品牌設計 myth narrative：面對這個文化張力，品牌相信什麼、做什麼、拒絕什麼。narrative 要有英雄、有對立、有啟示。",
      tool: "osp_marketing_tools",
      outputType: "brand-myth-narrative",
      requiredSkills: ["brand-storytelling", "brand-narrative", "cultural-research", "brand-voice"],
      stepMemberRole: "myth_narrative_writer",
    },
    {
      order: 4,
      name: "Icon myth 3-year strategy",
      description: "規劃 3 年 icon myth strategy：Year 1 建立敘事、Year 2 擴大認同、Year 3 成為族群代言。每年設 2–3 個 milestone（旗艦 campaign、文化事件）。",
      tool: "marketing-strategy-pmm",
      outputType: "icon-myth-strategy",
      requiredSkills: ["brand-strategy", "brand-narrative", "content-strategy", "marketing-strategy-pmm"],
      stepMemberRole: "icon_strategist",
    },
    {
      order: 5,
      name: "文化活動矩陣",
      description: "設計 12 個月文化活動矩陣：旗艦大會、PR 大事件、社群 ritual、KOL 聯盟。每項活動明確對應一段 myth narrative。",
      tool: "marketing-strategy-pmm",
      outputType: "cultural-activation-matrix",
      requiredSkills: ["running-marketing-campaigns", "pr-strategy", "content-marketing", "marketing-director"],
      stepMemberRole: "cultural_activation_designer",
    },
  ],
};

// ── Export all L1 specs ──────────────────────────────────────────────────
// Note: L1 #1 (brand-archetype-positioning) is the golden reference and
// is NOT included here to avoid overwriting it.
export const specs: SquadSpec[] = [
  L1_02_mind,
  L1_03_category,
  L1_04_diff,
  L1_05_perceptual,
  L1_06_purpose,
  L1_07_blueocean,
  L1_08_cbbe,
  L1_09_storybrand,
  L1_10_cultural,
];
