/**
 * squad-builder / L2-product.ts
 *
 * 10 L2 產品線策略 squad specs.
 * Each creates 1 new lead agent (primarySkill aligned to methodology)
 * and reuses existing agents for 5 specialist roles.
 *
 * NOTE: existing DB has lower-quality product-layer squads (id=2,4,9,97,107,109).
 * We DON'T overwrite them — new slugs avoid collision. Those old ones
 * stay in DB for now (will be tier='defer' / kill later).
 */

import type { SquadSpec } from "./types.js";

function makeLeadAgent(
  name: string,
  englishName: string,
  title: string,
  englishTitle: string,
  bio: string,
  primarySkill: string,
  extraTags: string[],
) {
  return {
    name,
    englishName,
    title,
    englishTitle,
    bio,
    specialtyTags: [primarySkill, ...extraTags],
    jobLevel: "vp" as const,
    industry: "tech",
  };
}

// ── L2 #1  value-proposition-canvas ──────────────────────────────────────
const L2_01_vpcanvas: SquadSpec = {
  slug: "value-proposition-canvas",
  name: "價值主張畫布小組",
  description:
    "以 Alexander Osterwalder《Value Proposition Design》(2014) VP Canvas 工具診斷「產品功能」與「客戶工作 / 痛點 / 收益」的契合度。" +
    "產出 Customer Profile + Value Map + Fit Score，適用於新品上市前驗證 PMF、既有產品重新定位。",
  methodology: "value-proposition-canvas",
  methodologyAuthor: "Alexander Osterwalder",
  methodologyYear: 2014,
  tags: ["value-proposition-canvas", "vp-canvas", "product-positioning", "jtbd", "customer-profile", "pmf"],
  workspace: ["product-positioning"],
  layer: "L2_product",
  tier: "core",
  tokenBudget: 65000,
  members: [
    {
      role: "vp_canvas_strategist",
      order: 0,
      isLead: true,
      primarySkill: "value-proposition-strategist",
      createAgent: makeLeadAgent(
        "許志誠",
        "Jason Reid",
        "產品價值主張副總裁",
        "VP of Value Proposition Design",
        "Osterwalder Strategyzer 認證 VP Canvas 實踐者。為 25+ 個 B2B / D2C 產品完成 VP Canvas 診斷，擅長把抽象功能轉譯為可量化的客戶價值。",
        "value-proposition-strategist",
        ["vp-canvas", "pmf-validation", "customer-profile", "product-positioning"],
      ),
    },
    { role: "customer_researcher", order: 1, isLead: false, primarySkill: "market-research-agent", fallbackSkills: ["consumer-insights"] },
    { role: "jobs_analyst", order: 2, isLead: false, primarySkill: "consumer-insights", fallbackSkills: ["market-research-agent"] },
    { role: "pain_gain_mapper", order: 3, isLead: false, primarySkill: "brand-dna", fallbackSkills: ["marketing-strategy-pmm"] },
    { role: "value_map_designer", order: 4, isLead: false, primarySkill: "marketing-strategy-pmm", fallbackSkills: ["cmo"] },
    { role: "fit_tester", order: 5, isLead: false, primarySkill: "marketing-analytics", fallbackSkills: ["brand-audit"] },
  ],
  workflow: [
    { order: 1, name: "客戶工作 Jobs 盤點", description: "訪談 8–12 位目標客戶，依 JTBD 框架盤點功能性（Functional）、社交性（Social）、情感性（Emotional）、支援性（Supporting）四類 Jobs。", tool: "internal", outputType: "customer-jobs-inventory", requiredSkills: ["market-research", "consumer-insights", "jobs-to-be-done", "qualitative-research"], stepMemberRole: "customer_researcher" },
    { order: 2, name: "痛點 Pains 深度挖掘", description: "為每個 Job 記錄客戶遇到的障礙、負面結果、風險，依痛感強度排序。", tool: "octolens", outputType: "customer-pains-map", requiredSkills: ["consumer-insights", "behavioral-analysis", "qualitative-research", "customer-journey"], stepMemberRole: "jobs_analyst" },
    { order: 3, name: "收益 Gains 期望識別", description: "分辨四類 Gains：Required / Expected / Desired / Unexpected，產出 Customer Profile 完整圖。", tool: "marketing-strategy-pmm", outputType: "customer-profile-canvas", requiredSkills: ["consumer-insights", "brand-dna", "product-marketing", "empathy-mapping"], stepMemberRole: "pain_gain_mapper" },
    { order: 4, name: "Value Map 設計", description: "把產品功能對應到 Pain Relievers 與 Gain Creators，找出多餘功能（浪費）與缺口功能（機會）。產出 Value Map。", tool: "osp_marketing_tools", outputType: "value-map-canvas", requiredSkills: ["product-marketing", "value-proposition", "marketing-strategy-pmm", "brand-strategy"], stepMemberRole: "value_map_designer" },
    { order: 5, name: "Fit 測試 + 定位宣言", description: "計算 Problem-Solution Fit score，找出需強化的點。產出 VP Statement：For [customer] who [pain], Product is the [category] that [benefit].", tool: "marketing-strategy-pmm", outputType: "vp-fit-score-statement", requiredSkills: ["marketing-analytics", "brand-audit", "pmf-validation", "marketing-strategy-pmm"], stepMemberRole: "fit_tester" },
  ],
};

// ── L2 #2  benefit-ladder-positioning ────────────────────────────────────
const L2_02_benefit: SquadSpec = {
  slug: "benefit-ladder-product-positioning",
  name: "利益階梯產品定位小組",
  description:
    "以 Means-End Chain Theory 與 Benefit Ladder（Attributes → Functional → Emotional → Values）四層階梯，" +
    "把產品屬性轉譯為消費者深層價值。適用於成熟產品突破訊息同質化、情感性品類（美妝、保健、高端食品）。",
  methodology: "benefit-ladder",
  methodologyAuthor: "Gutman / Reynolds (Means-End Chain)",
  methodologyYear: 1982,
  tags: ["benefit-ladder", "means-end-chain", "product-positioning", "emotional-branding", "laddering"],
  workspace: ["product-positioning"],
  layer: "L2_product",
  tier: "core",
  tokenBudget: 60000,
  members: [
    {
      role: "benefit_ladder_strategist",
      order: 0,
      isLead: true,
      primarySkill: "benefit-ladder-strategist",
      createAgent: makeLeadAgent(
        "莊雅筑",
        "Rachel Kim",
        "產品利益階梯副總裁",
        "VP of Benefit Ladder Strategy",
        "Means-End Chain 理論專家。曾為 8 個美妝品牌、5 個食品品牌完成 4 層利益階梯映射，把「成分」轉化為「自我實現」敘事。",
        "benefit-ladder-strategist",
        ["benefit-ladder", "means-end-chain", "laddering-interview", "emotional-branding"],
      ),
    },
    { role: "attribute_auditor", order: 1, isLead: false, primarySkill: "brand-audit", fallbackSkills: ["brand-dna"] },
    { role: "laddering_interviewer", order: 2, isLead: false, primarySkill: "market-research-agent", fallbackSkills: ["consumer-insights"] },
    { role: "functional_mapper", order: 3, isLead: false, primarySkill: "brand-dna", fallbackSkills: ["marketing-strategy-pmm"] },
    { role: "emotional_writer", order: 4, isLead: false, primarySkill: "brand-voice", fallbackSkills: ["copywriting-pro"] },
    { role: "values_architect", order: 5, isLead: false, primarySkill: "brand-storytelling", fallbackSkills: ["content-strategy"] },
  ],
  workflow: [
    { order: 1, name: "產品屬性盤點", description: "列出產品所有可宣稱屬性（Attributes）：成分、規格、認證、工藝等，分類為 Concrete / Abstract。", tool: "internal", outputType: "product-attributes-matrix", requiredSkills: ["brand-audit", "product-marketing", "competitive-analysis", "brand-dna"], stepMemberRole: "attribute_auditor" },
    { order: 2, name: "Laddering 深度訪談", description: "對 12 位高忠誠客戶進行階梯式訪談（Why is that important to you?）挖掘從屬性往上的 4 層階梯。", tool: "octolens", outputType: "laddering-transcripts", requiredSkills: ["market-research", "consumer-insights", "laddering-interview", "qualitative-research"], stepMemberRole: "laddering_interviewer" },
    { order: 3, name: "Functional Benefits 映射", description: "把屬性轉譯為功能性利益（可計量、可驗證的客戶好處）。每個功能性利益配對 1–2 個屬性 RTB。", tool: "marketing-strategy-pmm", outputType: "functional-benefits-ladder", requiredSkills: ["brand-dna", "product-marketing", "brand-strategy", "marketing-strategy-pmm"], stepMemberRole: "functional_mapper" },
    { order: 4, name: "Emotional Benefits 改寫", description: "把功能性利益升華為情感性利益（感受、狀態、身份認同）。產出 3 個備選情感敘事。", tool: "osp_marketing_tools", outputType: "emotional-benefits-narrative", requiredSkills: ["brand-voice", "emotional-branding", "copywriting", "brand-narrative"], stepMemberRole: "emotional_writer" },
    { order: 5, name: "Values 終極階梯", description: "把情感性利益綁定到消費者終極價值觀（自我實現、歸屬、安全、認可）。產出 4 層完整 Benefit Ladder。", tool: "osp_marketing_tools", outputType: "complete-benefit-ladder", requiredSkills: ["brand-storytelling", "brand-narrative", "content-strategy", "brand-strategy"], stepMemberRole: "values_architect" },
  ],
};

// ── L2 #3  jtbd-product-positioning ──────────────────────────────────────
const L2_03_jtbd: SquadSpec = {
  slug: "jtbd-product-positioning",
  name: "JTBD 產品定位小組",
  description:
    "以 Clayton Christensen《Competing Against Luck》(2016) JTBD + Bob Moesta Switch Interview 框架，" +
    "找出客戶「為了什麼工作而雇用產品」。適用於新品類開發、產品線擴張、舊產品重新定位。",
  methodology: "jtbd",
  methodologyAuthor: "Clayton Christensen + Bob Moesta",
  methodologyYear: 2016,
  tags: ["jtbd", "jobs-to-be-done", "switch-interview", "product-innovation", "product-positioning"],
  workspace: ["product-positioning"],
  layer: "L2_product",
  tier: "core",
  tokenBudget: 65000,
  members: [
    {
      role: "jtbd_strategist",
      order: 0,
      isLead: true,
      primarySkill: "jtbd-strategist",
      createAgent: makeLeadAgent(
        "鄭文淵",
        "Wayne Sullivan",
        "JTBD 產品策略副總裁",
        "VP of JTBD Product Strategy",
        "Innovator's Toolkit 與 Switch Interview 實戰派。協助 10+ 個 SaaS / CPG 產品找到「被雇用的工作」，轉化成 10 倍差異化定位。",
        "jtbd-strategist",
        ["jtbd", "switch-interview", "jobs-to-be-done", "product-innovation"],
      ),
    },
    { role: "switch_interviewer", order: 1, isLead: false, primarySkill: "market-research-agent", fallbackSkills: ["consumer-insights"] },
    { role: "timeline_analyst", order: 2, isLead: false, primarySkill: "consumer-insights", fallbackSkills: ["market-research-agent"] },
    { role: "forces_mapper", order: 3, isLead: false, primarySkill: "brand-dna", fallbackSkills: ["marketing-strategy-pmm"] },
    { role: "job_statement_writer", order: 4, isLead: false, primarySkill: "brand-voice", fallbackSkills: ["copywriting-pro"] },
    { role: "competitor_set_analyst", order: 5, isLead: false, primarySkill: "competitive-intelligence-market-research", fallbackSkills: ["brand-dna"] },
  ],
  workflow: [
    { order: 1, name: "Switch Interview 招募", description: "招募最近 6 個月內切換到本產品的客戶，以及考慮過但沒切換的潛在客戶，各 6–8 位。", tool: "internal", outputType: "switch-interview-roster", requiredSkills: ["market-research", "consumer-insights", "qualitative-research", "jobs-to-be-done"], stepMemberRole: "switch_interviewer" },
    { order: 2, name: "First Thought → Purchase 時間線", description: "以 Moesta 4 forces 訪談法重建從萌生念頭到付款的完整時間線。標記每個決策節點。", tool: "octolens", outputType: "customer-timeline-map", requiredSkills: ["consumer-insights", "jobs-to-be-done", "customer-journey", "behavioral-analysis"], stepMemberRole: "timeline_analyst" },
    { order: 3, name: "Push / Pull / Anxiety / Habit 四力分析", description: "找出推力（現狀痛苦）、拉力（新方案吸引）、焦慮（阻力）、慣性（維持現狀）。產出 4 forces 平衡圖。", tool: "marketing-strategy-pmm", outputType: "forces-of-progress-map", requiredSkills: ["brand-dna", "behavioral-analysis", "consumer-insights", "marketing-strategy-pmm"], stepMemberRole: "forces_mapper" },
    { order: 4, name: "Job Statement 撰寫", description: "以 Christensen 格式撰寫 Job Statement：When [situation], I want to [motivation], so I can [expected outcome].", tool: "osp_marketing_tools", outputType: "job-statement", requiredSkills: ["brand-voice", "brand-narrative", "copywriting", "jobs-to-be-done"], stepMemberRole: "job_statement_writer" },
    { order: 5, name: "Non-obvious 競爭者集合", description: "識別「為同一個 Job 被雇用」的真正競爭者（可能來自不同品類）。產出 JTBD-based competitor set。", tool: "marketing-strategy-pmm", outputType: "jtbd-competitor-set", requiredSkills: ["competitive-analysis", "competitive-intelligence", "brand-strategy", "market-research"], stepMemberRole: "competitor_set_analyst" },
  ],
};

// ── L2 #4  fab-product-positioning ───────────────────────────────────────
const L2_04_fab: SquadSpec = {
  slug: "fab-product-positioning",
  name: "FAB 產品定位小組",
  description:
    "以經典 Features → Advantages → Benefits 三層框架，把產品功能轉譯為消費者 can-do 語言。" +
    "適用於 B2B 複雜產品、工業品、硬體產品的訊息清理與 sales enablement。",
  methodology: "fab-framework",
  methodologyAuthor: "Classic Marketing Framework",
  methodologyYear: 1960,
  tags: ["fab-framework", "features-advantages-benefits", "product-positioning", "sales-enablement", "b2b-messaging"],
  workspace: ["product-positioning"],
  layer: "L2_product",
  tier: "core",
  tokenBudget: 55000,
  members: [
    {
      role: "fab_strategist",
      order: 0,
      isLead: true,
      primarySkill: "fab-strategist",
      createAgent: makeLeadAgent(
        "洪子翔",
        "Tommy Lawson",
        "FAB 產品定位副總裁",
        "VP of FAB Product Positioning",
        "B2B / 硬體產品訊息簡化專家。擅長把工程團隊的 spec sheet 轉譯為 sales team 能直接用的 benefit-first 話術。",
        "fab-strategist",
        ["fab-framework", "sales-enablement", "b2b-messaging", "product-marketing"],
      ),
    },
    { role: "spec_cataloger", order: 1, isLead: false, primarySkill: "brand-audit", fallbackSkills: ["brand-dna"] },
    { role: "advantage_translator", order: 2, isLead: false, primarySkill: "brand-dna", fallbackSkills: ["marketing-strategy-pmm"] },
    { role: "benefit_writer", order: 3, isLead: false, primarySkill: "copywriting-pro", fallbackSkills: ["brand-voice"] },
    { role: "sales_enablement_designer", order: 4, isLead: false, primarySkill: "marketing-strategy-pmm", fallbackSkills: ["marketing-director"] },
    { role: "objection_handler", order: 5, isLead: false, primarySkill: "mbb-strategist", fallbackSkills: ["marketing-director"] },
  ],
  workflow: [
    { order: 1, name: "Features 規格完整盤點", description: "從產品文件 / RD spec / 產品手冊整理全部 Features 並依類別分組（效能、相容、安全、易用）。", tool: "internal", outputType: "features-catalog", requiredSkills: ["brand-audit", "product-marketing", "brand-dna", "technical-writing"], stepMemberRole: "spec_cataloger" },
    { order: 2, name: "Advantages 中繼語轉譯", description: "把每個 Feature 轉為 Advantage（與競品相比的差異化優勢）。用 `which means` 語法橋接。", tool: "marketing-strategy-pmm", outputType: "advantages-translation-table", requiredSkills: ["brand-dna", "product-marketing", "competitive-analysis", "marketing-strategy-pmm"], stepMemberRole: "advantage_translator" },
    { order: 3, name: "Benefits 客戶語改寫", description: "把 Advantage 升華為客戶可感受的 Benefit（財務、情感、時間、風險）。用 `so that you can` 語法橋接。", tool: "osp_marketing_tools", outputType: "benefits-copywriting", requiredSkills: ["copywriting", "brand-voice", "brand-narrative", "conversion-copy"], stepMemberRole: "benefit_writer" },
    { order: 4, name: "Sales Deck + Battle Card", description: "把 FAB 表格變成銷售團隊 enablement 資產：Sales Deck、Battle Card、FAQ。", tool: "marketing-strategy-pmm", outputType: "sales-enablement-kit", requiredSkills: ["marketing-strategy-pmm", "sales-enablement", "marketing-brand-playbook", "content-strategy"], stepMemberRole: "sales_enablement_designer" },
    { order: 5, name: "異議處理劇本", description: "預測客戶對每個 Benefit 可能的異議，準備 3 套反駁話術。產出 Objection Handling Playbook。", tool: "marketing-strategy-pmm", outputType: "objection-handling-playbook", requiredSkills: ["mbb-strategist", "sales-enablement", "brand-strategy", "marketing-strategy-pmm"], stepMemberRole: "objection_handler" },
  ],
};

// ── L2 #5  kano-product-positioning ──────────────────────────────────────
const L2_05_kano: SquadSpec = {
  slug: "kano-product-positioning",
  name: "Kano 模型產品定位小組",
  description:
    "以 Noriaki Kano (1984) 三層需求分類：Must-be / Performance / Excitement（+ Indifferent / Reverse）評估產品特性的客戶滿意度貢獻。" +
    "適用於產品路線圖優化、SKU 差異化、功能砍刪決策。",
  methodology: "kano-model",
  methodologyAuthor: "Noriaki Kano",
  methodologyYear: 1984,
  tags: ["kano-model", "customer-satisfaction", "product-positioning", "roadmap-prioritization", "feature-prioritization"],
  workspace: ["product-positioning"],
  layer: "L2_product",
  tier: "core",
  tokenBudget: 60000,
  members: [
    {
      role: "kano_strategist",
      order: 0,
      isLead: true,
      primarySkill: "kano-strategist",
      createAgent: makeLeadAgent(
        "李思妤",
        "Tiffany Drake",
        "Kano 產品策略副總裁",
        "VP of Kano Product Strategy",
        "東京理科大學 Kano Model 認證實踐者。曾為 12 個 B2B SaaS + D2C 硬體產品完成 Kano 問卷與五分類分析，為 roadmap 決策提供量化根據。",
        "kano-strategist",
        ["kano-model", "customer-satisfaction", "feature-prioritization", "roadmap-planning"],
      ),
    },
    { role: "feature_cataloger", order: 1, isLead: false, primarySkill: "brand-audit", fallbackSkills: ["brand-dna"] },
    { role: "kano_survey_designer", order: 2, isLead: false, primarySkill: "market-research-agent", fallbackSkills: ["marketing-analytics"] },
    { role: "satisfaction_analyst", order: 3, isLead: false, primarySkill: "marketing-analytics", fallbackSkills: ["brand-dna"] },
    { role: "roadmap_planner", order: 4, isLead: false, primarySkill: "marketing-strategy-pmm", fallbackSkills: ["marketing-director"] },
    { role: "messaging_architect", order: 5, isLead: false, primarySkill: "brand-voice", fallbackSkills: ["content-strategy"] },
  ],
  workflow: [
    { order: 1, name: "產品功能全列表", description: "盤點 30–50 個可區分的產品功能 / 特性，分類為 Core / Differentiator / Bonus 三組初判。", tool: "internal", outputType: "feature-catalog", requiredSkills: ["brand-audit", "product-marketing", "brand-dna", "feature-inventory"], stepMemberRole: "feature_cataloger" },
    { order: 2, name: "Kano 二維問卷設計", description: "為每個功能設計 Functional / Dysfunctional 兩題（有 / 沒有時感覺），N=300 樣本投放。", tool: "octolens", outputType: "kano-survey-instrument", requiredSkills: ["market-research", "survey-design", "marketing-analytics", "quantitative-research"], stepMemberRole: "kano_survey_designer" },
    { order: 3, name: "五分類統計分析", description: "用 Kano 評估表把每個功能分類為 M / O / A / I / R（Must-be / Performance / Attractive / Indifferent / Reverse）。", tool: "marketing-strategy-pmm", outputType: "kano-classification-matrix", requiredSkills: ["marketing-analytics", "data-analysis", "customer-satisfaction", "survey-analysis"], stepMemberRole: "satisfaction_analyst" },
    { order: 4, name: "Roadmap 優先度排序", description: "把 M / O / A 三類對應到 12 個月 roadmap：M 修補、O 優化、A 首創。Indifferent 可砍，Reverse 必須砍。", tool: "marketing-strategy-pmm", outputType: "kano-roadmap-plan", requiredSkills: ["marketing-strategy-pmm", "feature-prioritization", "product-strategy", "marketing-director"], stepMemberRole: "roadmap_planner" },
    { order: 5, name: "差異化訊息化", description: "把 Attractive 類 feature 包裝為核心訊息，Performance 類為 proof points，Must-be 不對外溝通。", tool: "osp_marketing_tools", outputType: "kano-messaging-architecture", requiredSkills: ["brand-voice", "marketing-strategy-pmm", "messaging-strategy", "content-strategy"], stepMemberRole: "messaging_architect" },
  ],
};

// ── L2 #6  product-golden-circle ─────────────────────────────────────────
const L2_06_goldencircle: SquadSpec = {
  slug: "product-golden-circle",
  name: "產品黃金圈定位小組",
  description:
    "將 Simon Sinek Golden Circle（Why → How → What）應用到 **單一產品層級**：挖掘這個產品為什麼存在、" +
    "如何用獨特方式滿足需求、具體做什麼。適用於主打產品 / 旗艦 SKU 的定位重塑，區別於企業層級的品牌 Purpose。",
  methodology: "product-golden-circle",
  methodologyAuthor: "Simon Sinek (adapted to product level)",
  methodologyYear: 2009,
  tags: ["golden-circle", "product-purpose", "why-how-what", "product-positioning", "product-narrative"],
  workspace: ["product-positioning"],
  layer: "L2_product",
  tier: "core",
  tokenBudget: 55000,
  members: [
    {
      role: "product_purpose_strategist",
      order: 0,
      isLead: true,
      primarySkill: "product-purpose-strategist",
      createAgent: makeLeadAgent(
        "王宥均",
        "Leo Wagner",
        "產品使命策略副總裁",
        "VP of Product Purpose Strategy",
        "擅長在產品層級挖掘 Why，把產品從「功能的集合」重新定位為「信念的化身」。服務過 8 個品牌的旗艦產品上市與重塑。",
        "product-purpose-strategist",
        ["product-purpose", "golden-circle", "why-discovery", "product-narrative"],
      ),
    },
    { role: "why_interviewer", order: 1, isLead: false, primarySkill: "brand-storytelling", fallbackSkills: ["case-story-writer"] },
    { role: "how_methodologist", order: 2, isLead: false, primarySkill: "brand-dna", fallbackSkills: ["marketing-strategy-pmm"] },
    { role: "what_lister", order: 3, isLead: false, primarySkill: "content-marketing", fallbackSkills: ["marketing-strategy-pmm"] },
    { role: "manifesto_writer", order: 4, isLead: false, primarySkill: "brand-voice", fallbackSkills: ["copywriting-pro"] },
    { role: "activation_designer", order: 5, isLead: false, primarySkill: "marketing-director", fallbackSkills: ["marketing-strategy-pmm"] },
  ],
  workflow: [
    { order: 1, name: "產品 Why 深度挖掘", description: "訪談產品創造者（PM、RD lead、創辦人），問 7 次「為什麼要做這個產品」，萃取不退讓的本源動機。", tool: "internal", outputType: "product-why-document", requiredSkills: ["brand-storytelling", "executive-interviewing", "brand-narrative", "qualitative-research"], stepMemberRole: "why_interviewer" },
    { order: 2, name: "產品 How 獨特做法", description: "盤點產品在技術、流程、用料、設計哲學上的獨特做法。每條 How 配一個內外部佐證。", tool: "marketing-strategy-pmm", outputType: "product-how-methodology", requiredSkills: ["brand-dna", "product-marketing", "marketing-strategy-pmm", "brand-strategy"], stepMemberRole: "how_methodologist" },
    { order: 3, name: "產品 What 功能連結", description: "每個 What（具體功能）連回 Why 的哪個子點。確保產品每條功能都是 Why 的具象化。", tool: "marketing-strategy-pmm", outputType: "product-what-mapping", requiredSkills: ["content-marketing", "product-marketing", "brand-strategy", "content-strategy"], stepMemberRole: "what_lister" },
    { order: 4, name: "產品 Manifesto 撰寫", description: "撰寫 300 字產品 Manifesto，包含 Why / How / What 三段。產出多通路版本（官網、Deck、影片腳本）。", tool: "osp_marketing_tools", outputType: "product-manifesto", requiredSkills: ["brand-voice", "copywriting", "brand-narrative", "thought-leadership"], stepMemberRole: "manifesto_writer" },
    { order: 5, name: "產品啟動計畫", description: "把 Why 注入產品 onboarding、客服 FAQ、銷售話術、社群溝通，形成 90 天啟動計畫。", tool: "marketing-strategy-pmm", outputType: "product-activation-roadmap", requiredSkills: ["marketing-director", "marketing-strategy-pmm", "internal-branding", "content-strategy"], stepMemberRole: "activation_designer" },
  ],
};

// ── L2 #7  crossing-the-chasm ────────────────────────────────────────────
const L2_07_chasm: SquadSpec = {
  slug: "crossing-the-chasm-positioning",
  name: "鴻溝跨越定位小組",
  description:
    "以 Geoffrey Moore《Crossing the Chasm》(1991 / 2014 rev.)Technology Adoption Lifecycle，" +
    "幫助技術型新產品從 Early Adopter 跨越到 Early Majority。核心工具：Beachhead Segment + Whole Product + Compelling Reason to Buy。",
  methodology: "crossing-the-chasm",
  methodologyAuthor: "Geoffrey Moore",
  methodologyYear: 2014,
  tags: ["crossing-the-chasm", "tech-adoption-lifecycle", "b2b-saas", "beachhead", "whole-product"],
  workspace: ["product-positioning"],
  layer: "L2_product",
  tier: "core",
  tokenBudget: 70000,
  members: [
    {
      role: "chasm_strategist",
      order: 0,
      isLead: true,
      primarySkill: "gtm-strategist",
      createAgent: makeLeadAgent(
        "高彥均",
        "Jack Brennan",
        "跨越鴻溝 GTM 副總裁",
        "VP of Chasm Crossing GTM",
        "Geoffrey Moore 方法論實戰派。為 5 家 B2B SaaS 從 Early Adopter 階段進入 Early Majority 擬定 beachhead + whole product 策略。",
        "gtm-strategist",
        ["crossing-the-chasm", "gtm-strategy", "b2b-saas", "beachhead-strategy"],
      ),
    },
    { role: "tal_scanner", order: 1, isLead: false, primarySkill: "competitive-intelligence-market-research", fallbackSkills: ["market-research-agent"] },
    { role: "beachhead_selector", order: 2, isLead: false, primarySkill: "brand-dna", fallbackSkills: ["mbb-strategist"] },
    { role: "whole_product_architect", order: 3, isLead: false, primarySkill: "marketing-strategy-pmm", fallbackSkills: ["marketing-director"] },
    { role: "crb_writer", order: 4, isLead: false, primarySkill: "brand-voice", fallbackSkills: ["copywriting-pro"] },
    { role: "reference_customer_builder", order: 5, isLead: false, primarySkill: "case-story-writer", fallbackSkills: ["brand-storytelling"] },
  ],
  workflow: [
    { order: 1, name: "TAL 階段診斷", description: "用 Moore TAL 5 階段（Innovator / Early Adopter / Early Majority / Late Majority / Laggard）定位當前客戶池，識別鴻溝邊緣症狀。", tool: "marketing-strategy-pmm", outputType: "tal-stage-diagnosis", requiredSkills: ["competitive-intelligence", "market-research", "b2b-saas", "customer-analytics"], stepMemberRole: "tal_scanner" },
    { order: 2, name: "Beachhead Segment 選擇", description: "在跨過鴻溝後的潛在市場中，選擇單一 beachhead（相對小但可全面主導的目標區隔）。Target Customer Characterization 8 張 profile。", tool: "octolens", outputType: "beachhead-target-profile", requiredSkills: ["brand-dna", "segmentation", "consumer-insights", "market-research"], stepMemberRole: "beachhead_selector" },
    { order: 3, name: "Whole Product 設計", description: "為 beachhead 設計完整產品（core + generic + expected + augmented + potential）。識別需合作夥伴補的部分。", tool: "marketing-strategy-pmm", outputType: "whole-product-plan", requiredSkills: ["marketing-strategy-pmm", "product-marketing", "partnership-strategy", "go-to-market"], stepMemberRole: "whole_product_architect" },
    { order: 4, name: "Compelling Reason to Buy", description: "撰寫 beachhead 客戶的 CRB — 不立即購買會面對的具體痛苦。一句話 elevator pitch + 3 個 proof points。", tool: "osp_marketing_tools", outputType: "compelling-reason-to-buy", requiredSkills: ["brand-voice", "copywriting", "brand-narrative", "conversion-copy"], stepMemberRole: "crb_writer" },
    { order: 5, name: "Reference Customer 策略", description: "識別 3–5 個可作為 reference 的 beachhead 客戶，設計 case study 產出計畫與 PR 放大策略。", tool: "marketing-strategy-pmm", outputType: "reference-customer-playbook", requiredSkills: ["case-story-writer", "pr-strategy", "marketing-strategy-pmm", "content-strategy"], stepMemberRole: "reference_customer_builder" },
  ],
};

// ── L2 #8  four-p-marketing-mix ──────────────────────────────────────────
const L2_08_4p: SquadSpec = {
  slug: "four-p-marketing-mix",
  name: "4P 行銷組合定位小組",
  description:
    "以 E. Jerome McCarthy 4P 經典框架（Product / Price / Place / Promotion）為基礎，" +
    "針對單一產品線做全面市場組合診斷與重新設計。適用於成熟產品績效下滑、新市場進入規劃。",
  methodology: "4p-marketing-mix",
  methodologyAuthor: "E. Jerome McCarthy",
  methodologyYear: 1960,
  tags: ["4p-marketing-mix", "product-mix", "pricing-strategy", "distribution", "promotion-strategy"],
  workspace: ["product-positioning"],
  layer: "L2_product",
  tier: "core",
  tokenBudget: 65000,
  members: [
    {
      role: "marketing_mix_strategist",
      order: 0,
      isLead: true,
      primarySkill: "marketing-mix-strategist",
      createAgent: makeLeadAgent(
        "潘彥廷",
        "Ethan Cole",
        "4P 行銷組合副總裁",
        "VP of Marketing Mix Strategy",
        "Kotler 派系資深 4P 顧問。為 20+ 個 FMCG / 零售品牌重整 Product / Price / Place / Promotion 四向度平衡，修復 underperforming 產品線。",
        "marketing-mix-strategist",
        ["4p-marketing-mix", "product-strategy", "pricing-strategy", "distribution-strategy"],
      ),
    },
    { role: "product_auditor", order: 1, isLead: false, primarySkill: "brand-audit", fallbackSkills: ["brand-dna"] },
    { role: "price_analyst", order: 2, isLead: false, primarySkill: "marketing-analytics", fallbackSkills: ["mbb-strategist"] },
    { role: "place_distribution_planner", order: 3, isLead: false, primarySkill: "marketing-strategy-pmm", fallbackSkills: ["marketing-director"] },
    { role: "promotion_designer", order: 4, isLead: false, primarySkill: "running-marketing-campaigns", fallbackSkills: ["marketing-brand-playbook"] },
    { role: "mix_harmonizer", order: 5, isLead: false, primarySkill: "cmo", fallbackSkills: ["marketing-director"] },
  ],
  workflow: [
    { order: 1, name: "Product 現狀稽核", description: "盤點產品組合（SKU、變體、包裝、命名、生命週期階段）。識別高貢獻 / 低貢獻 / 應退場品項。", tool: "internal", outputType: "product-portfolio-audit", requiredSkills: ["brand-audit", "product-marketing", "brand-dna", "portfolio-analysis"], stepMemberRole: "product_auditor" },
    { order: 2, name: "Price 定價策略分析", description: "分析定價結構（list / promo / channel-specific / bundle）、競品定價、彈性係數。產出 pricing architecture 建議。", tool: "marketing-strategy-pmm", outputType: "pricing-strategy-map", requiredSkills: ["marketing-analytics", "competitive-analysis", "pricing-strategy", "mbb-strategist"], stepMemberRole: "price_analyst" },
    { order: 3, name: "Place 通路配置", description: "盤點通路（direct / retail / e-commerce / B2B channel）貢獻與成本，設計通路組合最佳化方案。", tool: "marketing-strategy-pmm", outputType: "channel-distribution-plan", requiredSkills: ["marketing-strategy-pmm", "distribution-strategy", "omnichannel", "marketing-director"], stepMemberRole: "place_distribution_planner" },
    { order: 4, name: "Promotion 推廣組合", description: "規劃 IMC 推廣矩陣：Advertising / PR / Sales Promotion / Direct Marketing / Personal Selling 的分配與節奏。", tool: "marketing-strategy-pmm", outputType: "promotion-mix-plan", requiredSkills: ["running-marketing-campaigns", "marketing-brand-playbook", "content-marketing", "media-strategy-planner"], stepMemberRole: "promotion_designer" },
    { order: 5, name: "4P 協調性檢核", description: "確認 4P 彼此支持無內部矛盾（e.g. 高端定價 + 高端通路 + 高端推廣）。產出整合行銷組合劇本。", tool: "marketing-strategy-pmm", outputType: "integrated-4p-playbook", requiredSkills: ["cmo", "marketing-strategy-pmm", "brand-strategy", "marketing-director"], stepMemberRole: "mix_harmonizer" },
  ],
};

// ── L2 #9  product-market-fit ────────────────────────────────────────────
const L2_09_pmf: SquadSpec = {
  slug: "product-market-fit-validation",
  name: "產品市場契合驗證小組",
  description:
    "以 Marc Andreessen 原始定義 + Rahul Vohra PMF Score（40% rule）量化驗證產品是否找到 PMF。" +
    "產出 Sean Ellis survey + Retention curve + Qualitative pivot roadmap。適用於 seed–Series A 新創、新品類產品早期。",
  methodology: "product-market-fit",
  methodologyAuthor: "Andreessen / Ellis / Vohra",
  methodologyYear: 2007,
  tags: ["product-market-fit", "pmf", "sean-ellis-survey", "retention", "pivot", "startup"],
  workspace: ["product-positioning"],
  layer: "L2_product",
  tier: "core",
  tokenBudget: 65000,
  members: [
    {
      role: "pmf_strategist",
      order: 0,
      isLead: true,
      primarySkill: "pmf-strategist",
      createAgent: makeLeadAgent(
        "葉宜芳",
        "Felicia Hart",
        "PMF 產品驗證副總裁",
        "VP of Product-Market Fit",
        "早期新創 PMF 驗證專家。為 15 家 Seed-A 新創完成 Sean Ellis survey + retention cohort 分析，幫助決策 pivot / persevere / scale。",
        "pmf-strategist",
        ["pmf", "sean-ellis-survey", "retention-analysis", "startup-growth"],
      ),
    },
    { role: "sean_ellis_surveyor", order: 1, isLead: false, primarySkill: "market-research-agent", fallbackSkills: ["marketing-analytics"] },
    { role: "retention_analyst", order: 2, isLead: false, primarySkill: "marketing-analytics", fallbackSkills: ["cross-channel-analytics"] },
    { role: "qualitative_analyst", order: 3, isLead: false, primarySkill: "consumer-insights", fallbackSkills: ["market-research-agent"] },
    { role: "segment_slicer", order: 4, isLead: false, primarySkill: "brand-dna", fallbackSkills: ["marketing-strategy-pmm"] },
    { role: "pivot_planner", order: 5, isLead: false, primarySkill: "mbb-strategist", fallbackSkills: ["cmo"] },
  ],
  workflow: [
    { order: 1, name: "Sean Ellis Survey 執行", description: "對活躍用戶投放關鍵問題：「如果這個產品明天消失，你會有多失望？」(Very / Somewhat / Not) + 其他 3 題。計算 Very 比例。", tool: "octolens", outputType: "sean-ellis-survey-result", requiredSkills: ["market-research", "survey-design", "marketing-analytics", "pmf-methodology"], stepMemberRole: "sean_ellis_surveyor" },
    { order: 2, name: "Retention Cohort 分析", description: "繪製月 / 週 cohort retention curve，識別是否有 flat line plateau（PMF 的必要條件）。", tool: "marketing-strategy-pmm", outputType: "retention-cohort-analysis", requiredSkills: ["marketing-analytics", "data-analysis", "cross-channel-analytics", "retention-analysis"], stepMemberRole: "retention_analyst" },
    { order: 3, name: "Qualitative Why 訪談", description: "訪談 Very disappointed 與 Not disappointed 各 8 人，找出核心價值與 churn 原因。", tool: "internal", outputType: "qualitative-pmf-insights", requiredSkills: ["consumer-insights", "qualitative-research", "customer-interviewing", "behavioral-analysis"], stepMemberRole: "qualitative_analyst" },
    { order: 4, name: "High-Love Segment 分離", description: "從 Very disappointed 群體找出共同特徵（職業、產業、使用場景），定義「黃金 ICP」。", tool: "marketing-strategy-pmm", outputType: "high-love-icp-profile", requiredSkills: ["brand-dna", "segmentation-analysis", "consumer-insights", "marketing-strategy-pmm"], stepMemberRole: "segment_slicer" },
    { order: 5, name: "Pivot / Persevere / Scale 決策", description: "若 PMF score < 40%：建議 pivot 路徑（Zoom-in / Zoom-out / Customer Segment / Customer Need 等 10 種 pivot）。若 ≥ 40%：scale 劇本。", tool: "marketing-strategy-pmm", outputType: "pmf-decision-roadmap", requiredSkills: ["mbb-strategist", "marketing-strategy-pmm", "startup-strategy", "brand-strategy"], stepMemberRole: "pivot_planner" },
  ],
};

// ── L2 #10  anti-market-behavioral ───────────────────────────────────────
const L2_10_antimarket: SquadSpec = {
  slug: "behavioral-anti-market-positioning",
  name: "行為經濟反市場定位小組",
  description:
    "以 Rory Sutherland《Alchemy: The Dark Art and Curious Science of Creating Magic in Brands》(2019)，" +
    "運用行為經濟學找出「理性上不合理，但心理上極有效」的反直覺定位。適用於同質化紅海、廣告疲勞、消費者 skeptic 高的品類。",
  methodology: "behavioral-positioning",
  methodologyAuthor: "Rory Sutherland (Ogilvy)",
  methodologyYear: 2019,
  tags: ["behavioral-economics", "anti-market", "alchemy", "psychology-of-choice", "counterintuitive-positioning"],
  workspace: ["product-positioning"],
  layer: "L2_product",
  tier: "core",
  tokenBudget: 60000,
  members: [
    {
      role: "behavioral_strategist",
      order: 0,
      isLead: true,
      primarySkill: "behavioral-strategist",
      createAgent: makeLeadAgent(
        "紀承勳",
        "Calvin Moss",
        "行為經濟行銷副總裁",
        "VP of Behavioral Economics Marketing",
        "Kahneman / Ariely / Sutherland 行為經濟學實踐派。擅長把心理學 bias（loss aversion / decoy effect / endowment）轉為可執行的行銷動作。",
        "behavioral-strategist",
        ["behavioral-economics", "alchemy", "psychology-of-choice", "counterintuitive-marketing"],
      ),
    },
    { role: "rationality_auditor", order: 1, isLead: false, primarySkill: "brand-audit", fallbackSkills: ["brand-dna"] },
    { role: "bias_hunter", order: 2, isLead: false, primarySkill: "consumer-insights", fallbackSkills: ["marketing-analytics"] },
    { role: "frame_shifter", order: 3, isLead: false, primarySkill: "brand-voice", fallbackSkills: ["copywriting-pro"] },
    { role: "experiment_designer", order: 4, isLead: false, primarySkill: "marketing-analytics", fallbackSkills: ["cross-channel-analytics"] },
    { role: "storyteller", order: 5, isLead: false, primarySkill: "brand-storytelling", fallbackSkills: ["content-strategy"] },
  ],
  workflow: [
    { order: 1, name: "現有理性訴求稽核", description: "盤點品牌現有所有「訴諸理性」的訊息（規格、CP 值、功能列表）。檢查哪些消費者根本不在乎。", tool: "octolens", outputType: "rational-claims-audit", requiredSkills: ["brand-audit", "brand-dna", "competitive-analysis", "consumer-insights"], stepMemberRole: "rationality_auditor" },
    { order: 2, name: "認知 Bias 機會掃描", description: "用 50+ 條認知 bias 清單（Kahneman / Ariely）掃描本品類消費者常見不理性決策點。列出 5 個最適合被利用的 bias。", tool: "internal", outputType: "cognitive-bias-opportunity-map", requiredSkills: ["consumer-insights", "behavioral-analysis", "psychology-of-choice", "market-research"], stepMemberRole: "bias_hunter" },
    { order: 3, name: "反直覺 Frame 設計", description: "為選定的 bias 設計反直覺框架（e.g. decoy product / anchor price / loss framing）。產出 3 個實驗概念。", tool: "osp_marketing_tools", outputType: "counterintuitive-frames", requiredSkills: ["brand-voice", "copywriting", "behavioral-economics", "brand-narrative"], stepMemberRole: "frame_shifter" },
    { order: 4, name: "A/B 測試設計", description: "為每個概念設計可執行的 A/B 測試：樣本量、轉換指標、勝出門檻。", tool: "marketing-strategy-pmm", outputType: "behavioral-ab-test-plan", requiredSkills: ["marketing-analytics", "cross-channel-analytics", "experiment-design", "conversion-analysis"], stepMemberRole: "experiment_designer" },
    { order: 5, name: "故事化與擴散", description: "若實驗勝出，把 winning frame 包裝為可複製的品牌故事（e.g. Heinz 紅酒醋價格錨點故事），持續擴散到其他通路。", tool: "osp_marketing_tools", outputType: "behavioral-brand-story", requiredSkills: ["brand-storytelling", "brand-narrative", "content-strategy", "brand-voice"], stepMemberRole: "storyteller" },
  ],
};

// ── Export ───────────────────────────────────────────────────────────────
export const specs: SquadSpec[] = [
  L2_01_vpcanvas,
  L2_02_benefit,
  L2_03_jtbd,
  L2_04_fab,
  L2_05_kano,
  L2_06_goldencircle,
  L2_07_chasm,
  L2_08_4p,
  L2_09_pmf,
  L2_10_antimarket,
];
