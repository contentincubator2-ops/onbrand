/**
 * squad-builder / L1-brand-v2.ts
 *
 * Phase 2: upgrade 5 legacy L1/core squads to the Golden Standard format.
 * These 5 squads were recently tagged L1/core but retain old-format
 * agents+steps data. Running this via `npm run db:build-L1-v2` will
 * UPSERT them (by slug) — the existing id is preserved, but the row
 * content is rewritten to:
 *   - 6 members with proper is_lead + order
 *   - 5 workflow steps with assignedAgentId + tool + outputType + requiredSkills
 *   - inline steps JSON on squads.steps
 *   - use_cases / output_formats / showcases / industry_key filled
 *
 * Each also creates 1 new VP lead agent (primarySkill aligned to methodology).
 *
 * Slugs (preserved, upsert target):
 *   - sowork-brand-positioning          (id=546, SoWork 自家品牌定位)
 *   - brand-dunford-positioning         (id=637, April Dunford 2019)
 *   - brand-neumeier-brand-gap          (id=639, Marty Neumeier 2003)
 *   - brand-sharp-how-brands-grow       (id=640, Byron Sharp 2010)
 *   - brand-godin-purple-cow            (id=644, Seth Godin 2003)
 */

import type { SquadSpec } from "./types.js";

function makeLead(
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

// ── L1 v2 #1  sowork-brand-positioning ──────────────────────────────
const SOWORK: SquadSpec = {
  slug: "sowork-brand-positioning",
  name: "SoWork 品牌定位小組",
  description:
    "SoWork 顧問團隊自研的品牌定位流程。融合 CJ 王俊人的奧美 20 年資深策略經驗 + SoWork 的數據驅動方法論。" +
    "適用於企業級客戶進行首次品牌建構、重新定位、集團品牌架構整合。輸出可直接進董事會的品牌策略簡報。",
  methodology: "sowork-brand-positioning",
  methodologyAuthor: "CJ Wang × SoWork Consultancy",
  methodologyYear: 2017,
  tags: [
    "sowork-brand-positioning",
    "brand-strategy",
    "consultative-positioning",
    "data-driven-brand",
    "boardroom-ready",
    "brand-audit",
  ],
  workspace: ["brand-positioning"],
  layer: "L1_brand",
  tier: "core",
  tokenBudget: 80000,
  members: [
    {
      role: "sowork_brand_strategist",
      order: 0,
      isLead: true,
      primarySkill: "sowork-brand-strategist",
      createAgent: makeLead(
        "王俊人 (CJ Wang)",
        "CJ Wang",
        "SoWork 首席品牌策略官",
        "Chief Brand Strategist",
        "SoWork 創辦人 + 首席增長官。前奧美數位行銷負責人，20 年品牌策略經驗，主導過 Pokemon Go、Samsung、Disney+、iCHEF、李錦記等品牌的定位與成長。「數據為王」、「數據紅利」暢銷書作者。",
        "sowork-brand-strategist",
        [
          "consultative-positioning",
          "agency-strategy",
          "data-driven-brand",
          "brand-audit",
        ],
      ),
    },
    { role: "consumer_insight_researcher", order: 1, isLead: false, primarySkill: "consumer-insights", fallbackSkills: ["market-research-agent"] },
    { role: "brand_auditor", order: 2, isLead: false, primarySkill: "brand-audit", fallbackSkills: ["brand-dna"] },
    { role: "value_prop_architect", order: 3, isLead: false, primarySkill: "brand-dna", fallbackSkills: ["marketing-strategy-pmm"] },
    { role: "creative_director", order: 4, isLead: false, primarySkill: "brand-voice", fallbackSkills: ["copywriting-pro"] },
    { role: "activation_planner", order: 5, isLead: false, primarySkill: "marketing-director", fallbackSkills: ["cmo"] },
  ],
  workflow: [
    { order: 1, name: "品牌現況體檢", description: "SoWork 360° 品牌稽核：內部（員工、產品、服務）× 外部（客戶、競品、通路）× 數據（市佔、聲量、感知）三面向盤點。", tool: "octolens", outputType: "brand-360-audit-report", requiredSkills: ["brand-audit", "brand-dna", "competitive-analysis", "data-analysis"], stepMemberRole: "brand_auditor" },
    { order: 2, name: "消費者深度研究", description: "訪談 15–20 位目標客戶 + 定量問卷 N=300+，挖掘決策驅動因素、品牌聯想、未滿足需求。", tool: "internal", outputType: "consumer-insight-report", requiredSkills: ["market-research", "consumer-insights", "qualitative-research", "quantitative-research"], stepMemberRole: "consumer_insight_researcher" },
    { order: 3, name: "價值主張架構", description: "綜合數據與洞察，設計三層價值主張：功能性（Functional）× 情感性（Emotional）× 社會性（Social）。產出 messaging house。", tool: "marketing-strategy-pmm", outputType: "value-proposition-house", requiredSkills: ["brand-dna", "marketing-strategy-pmm", "brand-strategy", "value-proposition"], stepMemberRole: "value_prop_architect" },
    { order: 4, name: "創意表達方向", description: "將價值主張轉譯為品牌聲音（Brand Voice）、視覺原則（Visual Principle）、內容支柱（Content Pillar）。", tool: "osp_marketing_tools", outputType: "creative-direction-deck", requiredSkills: ["brand-voice", "copywriting", "creative-direction", "brand-narrative"], stepMemberRole: "creative_director" },
    { order: 5, name: "上市啟動劇本", description: "設計 90 天品牌上市/重塑啟動計畫：內部宣達 + 客戶溝通 + 媒體節奏 + 績效追蹤指標。", tool: "marketing-strategy-pmm", outputType: "90-day-activation-playbook", requiredSkills: ["marketing-director", "cmo", "marketing-strategy-pmm", "brand-activation"], stepMemberRole: "activation_planner" },
  ],
};

// ── L1 v2 #2  brand-dunford-positioning ─────────────────────────────
const DUNFORD: SquadSpec = {
  slug: "brand-dunford-positioning",
  name: "Dunford Obviously Awesome 定位小組",
  description:
    "April Dunford《Obviously Awesome》(2019) 5 步驟產品定位框架。從 unique attributes → market category → alternative options → target characteristics → value 逐層推導。" +
    "最適合 B2B SaaS、技術型產品、新品類在既有市場不易被看見的困境。",
  methodology: "obviously-awesome",
  methodologyAuthor: "April Dunford",
  methodologyYear: 2019,
  tags: [
    "obviously-awesome",
    "dunford-positioning",
    "b2b-saas",
    "market-category",
    "competitive-alternatives",
    "product-marketing",
  ],
  workspace: ["brand-positioning"],
  layer: "L1_brand",
  tier: "core",
  tokenBudget: 70000,
  members: [
    {
      role: "dunford_strategist",
      order: 0,
      isLead: true,
      primarySkill: "dunford-positioning-strategist",
      createAgent: makeLead(
        "謝宗翰",
        "Brian Hsieh",
        "Dunford 定位策略副總裁",
        "VP of Dunford Positioning Strategy",
        "Obviously Awesome 方法論實戰派。為 12 家 B2B SaaS 走完 Dunford 5 步驟，擅長從「客戶看不懂在賣什麼」的困境中找到清晰 market category 與 compelling value。",
        "dunford-positioning-strategist",
        ["obviously-awesome", "market-category-design", "b2b-saas", "competitive-alternatives"],
      ),
    },
    { role: "attribute_extractor", order: 1, isLead: false, primarySkill: "brand-audit", fallbackSkills: ["brand-dna"] },
    { role: "alternative_mapper", order: 2, isLead: false, primarySkill: "competitive-intelligence-market-research", fallbackSkills: ["market-research-agent"] },
    { role: "market_category_designer", order: 3, isLead: false, primarySkill: "marketing-strategy-pmm", fallbackSkills: ["brand-dna"] },
    { role: "target_profile_builder", order: 4, isLead: false, primarySkill: "consumer-insights", fallbackSkills: ["brand-dna"] },
    { role: "value_articulator", order: 5, isLead: false, primarySkill: "brand-voice", fallbackSkills: ["copywriting-pro"] },
  ],
  workflow: [
    { order: 1, name: "Step 1: Unique Attributes", description: "列出產品所有能在競品中具體驗證的 unique capabilities（不是 features）。篩掉 parity attributes。", tool: "internal", outputType: "unique-attributes-inventory", requiredSkills: ["brand-audit", "product-marketing", "competitive-analysis", "brand-dna"], stepMemberRole: "attribute_extractor" },
    { order: 2, name: "Step 2: Alternatives", description: "識別客戶的「真實替代方案」—— 可能是競品、手工解法、Excel、不做。把 alternatives 分類為 Direct / Proxy / Status Quo。", tool: "octolens", outputType: "alternatives-map", requiredSkills: ["competitive-intelligence", "competitive-analysis", "market-research", "consumer-insights"], stepMemberRole: "alternative_mapper" },
    { order: 3, name: "Step 3: Market Category", description: "選擇或設計最能 make your value obvious 的 market category。Dunford: 「frame of reference 決定客戶如何評斷你」。", tool: "marketing-strategy-pmm", outputType: "market-category-declaration", requiredSkills: ["marketing-strategy-pmm", "brand-dna", "category-design", "brand-strategy"], stepMemberRole: "market_category_designer" },
    { order: 4, name: "Step 4: Target Customer", description: "建立「best-fit customer」profile — 最能從你的 unique attributes 獲益的 segment。產出 segment card + ICP。", tool: "marketing-strategy-pmm", outputType: "best-fit-customer-profile", requiredSkills: ["consumer-insights", "segmentation", "brand-dna", "market-research"], stepMemberRole: "target_profile_builder" },
    { order: 5, name: "Step 5: Value Articulation", description: "撰寫 positioning statement + elevator pitch + website headline。Dunford 公式：We help [target] do [value] because [alternatives] can't [unique attribute].", tool: "osp_marketing_tools", outputType: "dunford-positioning-statement", requiredSkills: ["brand-voice", "copywriting", "brand-narrative", "conversion-copy"], stepMemberRole: "value_articulator" },
  ],
};

// ── L1 v2 #3  brand-neumeier-brand-gap ──────────────────────────────
const NEUMEIER: SquadSpec = {
  slug: "brand-neumeier-brand-gap",
  name: "Neumeier Brand Gap 品牌鴻溝小組",
  description:
    "Marty Neumeier《The Brand Gap》(2003) 5 disciplines 框架：Differentiate → Collaborate → Innovate → Validate → Cultivate。" +
    "協助跨越「策略與創意」之間的 gap，讓品牌有清晰左腦（邏輯）又有充沛右腦（情感）。適用於設計驅動品牌、創意工作室、高端消費品牌。",
  methodology: "brand-gap",
  methodologyAuthor: "Marty Neumeier",
  methodologyYear: 2003,
  tags: [
    "brand-gap",
    "neumeier-method",
    "design-thinking-brand",
    "5-disciplines",
    "strategy-creative-integration",
    "brand-charisma",
  ],
  workspace: ["brand-positioning"],
  layer: "L1_brand",
  tier: "core",
  tokenBudget: 70000,
  members: [
    {
      role: "neumeier_strategist",
      order: 0,
      isLead: true,
      primarySkill: "neumeier-brand-gap-strategist",
      createAgent: makeLead(
        "張語萱",
        "Yuhsuan Chang",
        "Neumeier 品牌鴻溝策略副總裁",
        "VP of Brand Gap Strategy",
        "Neumeier Method 認證實踐者。擅長連結策略與創意，把左腦分析與右腦美學融合成「charismatic brand」。服務過 10+ 個設計驅動品牌。",
        "neumeier-brand-gap-strategist",
        ["brand-gap", "design-thinking-brand", "strategy-creative-integration", "brand-charisma"],
      ),
    },
    { role: "differentiation_analyst", order: 1, isLead: false, primarySkill: "brand-dna", fallbackSkills: ["competitive-intelligence-market-research"] },
    { role: "collaboration_facilitator", order: 2, isLead: false, primarySkill: "marketing-director", fallbackSkills: ["cmo"] },
    { role: "innovation_ideator", order: 3, isLead: false, primarySkill: "brand-storytelling", fallbackSkills: ["creative-direction"] },
    { role: "validation_tester", order: 4, isLead: false, primarySkill: "marketing-analytics", fallbackSkills: ["market-research-agent"] },
    { role: "cultivation_guardian", order: 5, isLead: false, primarySkill: "brand-voice", fallbackSkills: ["content-strategy"] },
  ],
  workflow: [
    { order: 1, name: "Discipline 1: Differentiate", description: "Neumeier 三問：Who are you? What do you do? Why does it matter? 產出 brand commitment statement。", tool: "internal", outputType: "brand-commitment-statement", requiredSkills: ["brand-dna", "brand-audit", "competitive-analysis", "brand-strategy"], stepMemberRole: "differentiation_analyst" },
    { order: 2, name: "Discipline 2: Collaborate", description: "建立跨部門 brand team — strategy / design / product / marketing 共同 working agreement。", tool: "marketing-strategy-pmm", outputType: "brand-collaboration-charter", requiredSkills: ["marketing-director", "cmo", "internal-branding", "brand-strategy"], stepMemberRole: "collaboration_facilitator" },
    { order: 3, name: "Discipline 3: Innovate", description: "Neumeier: 「If everyone zigs, zag」。以 design thinking 產出 5 個 brand innovation 概念，挑 1 個 zag 方向落地。", tool: "osp_marketing_tools", outputType: "brand-innovation-concepts", requiredSkills: ["brand-storytelling", "brand-narrative", "creative-direction", "brand-strategy"], stepMemberRole: "innovation_ideator" },
    { order: 4, name: "Discipline 4: Validate", description: "Test before you invest：小規模 prototype + focus group + social listening 驗證 brand concept 的共鳴度。", tool: "octolens", outputType: "brand-validation-report", requiredSkills: ["marketing-analytics", "market-research", "consumer-insights", "validation-testing"], stepMemberRole: "validation_tester" },
    { order: 5, name: "Discipline 5: Cultivate", description: "Living brand 的持續護衛：brand guideline 維護、員工 onboarding、客戶 touchpoint 稽核。", tool: "osp_marketing_tools", outputType: "brand-cultivation-system", requiredSkills: ["brand-voice", "content-strategy", "brand-strategy", "internal-branding"], stepMemberRole: "cultivation_guardian" },
  ],
};

// ── L1 v2 #4  brand-sharp-how-brands-grow ───────────────────────────
const SHARP: SquadSpec = {
  slug: "brand-sharp-how-brands-grow",
  name: "Sharp How Brands Grow 品牌成長小組",
  description:
    "Byron Sharp《How Brands Grow》(2010) + Ehrenberg-Bass Institute 實證研究。核心論點：品牌成長靠 penetration（提高買家數量）而非 loyalty。" +
    "工具箱：Mental Availability + Physical Availability + Distinctive Brand Assets。適用於 FMCG、D2C、大眾消費品牌。反 niche、反 loyalty program 派。",
  methodology: "mental-physical-availability",
  methodologyAuthor: "Byron Sharp (Ehrenberg-Bass Institute)",
  methodologyYear: 2010,
  tags: [
    "how-brands-grow",
    "ehrenberg-bass",
    "mental-availability",
    "physical-availability",
    "distinctive-brand-assets",
    "penetration-first",
    "fmcg",
  ],
  workspace: ["brand-positioning"],
  layer: "L1_brand",
  tier: "core",
  tokenBudget: 75000,
  members: [
    {
      role: "sharp_strategist",
      order: 0,
      isLead: true,
      primarySkill: "ehrenberg-bass-strategist",
      createAgent: makeLead(
        "郭靜宜",
        "Claire Kuo",
        "Ehrenberg-Bass 品牌成長策略副總裁",
        "VP of Ehrenberg-Bass Brand Growth",
        "How Brands Grow 學派資深顧問。相信「penetration > loyalty」，為 15+ 個 FMCG 品牌做 mental/physical availability 診斷，找出被忽略的購買場景。",
        "ehrenberg-bass-strategist",
        [
          "how-brands-grow",
          "mental-availability",
          "physical-availability",
          "distinctive-brand-assets",
        ],
      ),
    },
    { role: "category_buyer_analyst", order: 1, isLead: false, primarySkill: "marketing-analytics", fallbackSkills: ["market-research-agent"] },
    { role: "mental_availability_mapper", order: 2, isLead: false, primarySkill: "consumer-insights", fallbackSkills: ["brand-dna"] },
    { role: "physical_availability_auditor", order: 3, isLead: false, primarySkill: "brand-audit", fallbackSkills: ["marketing-director"] },
    { role: "dba_identifier", order: 4, isLead: false, primarySkill: "brand-dna", fallbackSkills: ["brand-voice"] },
    { role: "growth_planner", order: 5, isLead: false, primarySkill: "marketing-strategy-pmm", fallbackSkills: ["cmo"] },
  ],
  workflow: [
    { order: 1, name: "Category Buyer Base 分析", description: "盤點全品類的 buyer base 結構：heavy buyer 佔多少％、light buyer 佔多少。Sharp 法則：light buyers drive most growth.", tool: "marketing-strategy-pmm", outputType: "category-buyer-base-analysis", requiredSkills: ["marketing-analytics", "data-analysis", "market-research", "consumer-analytics"], stepMemberRole: "category_buyer_analyst" },
    { order: 2, name: "Mental Availability Mapping", description: "盤點品牌在 8–12 個 category entry points（CEPs）的出現率。找出 under-represented CEPs。", tool: "octolens", outputType: "mental-availability-map", requiredSkills: ["consumer-insights", "brand-dna", "brand-audit", "market-research"], stepMemberRole: "mental_availability_mapper" },
    { order: 3, name: "Physical Availability Audit", description: "稽核品牌在通路、價位、規格、SKU 組合上的 availability 覆蓋。識別未被覆蓋的購買時機。", tool: "marketing-strategy-pmm", outputType: "physical-availability-audit", requiredSkills: ["brand-audit", "marketing-director", "distribution-strategy", "retail-analysis"], stepMemberRole: "physical_availability_auditor" },
    { order: 4, name: "Distinctive Brand Assets 識別", description: "Colors / logos / characters / taglines / shapes — 找出品牌獨特記憶標記並量化其 mental linkage。", tool: "osp_marketing_tools", outputType: "dba-inventory", requiredSkills: ["brand-dna", "brand-voice", "visual-identity", "brand-strategy"], stepMemberRole: "dba_identifier" },
    { order: 5, name: "Growth Mechanism 設計", description: "基於 gap 設計 12 個月 growth playbook：哪些 CEPs 要強化、哪些通路要鋪、哪些 DBAs 要投資。", tool: "marketing-strategy-pmm", outputType: "growth-mechanism-playbook", requiredSkills: ["marketing-strategy-pmm", "cmo", "brand-strategy", "growth-marketing"], stepMemberRole: "growth_planner" },
  ],
};

// ── L1 v2 #5  brand-godin-purple-cow ────────────────────────────────
const GODIN: SquadSpec = {
  slug: "brand-godin-purple-cow",
  name: "Godin Purple Cow 非凡品牌小組",
  description:
    "Seth Godin《Purple Cow》(2003) remarkability 方法論：在 100 隻白牛中做 1 隻紫牛。" +
    "核心：otaku（狂熱粉絲）+ sneezer（傳播者）+ remarkable（值得傳頌）。適用於陷入紅海的成熟品牌、新創想快速建立口碑、缺預算但有創意的小品牌。",
  methodology: "purple-cow",
  methodologyAuthor: "Seth Godin",
  methodologyYear: 2003,
  tags: [
    "purple-cow",
    "remarkability",
    "godin-method",
    "otaku-marketing",
    "word-of-mouth",
    "anti-mass-marketing",
  ],
  workspace: ["brand-positioning"],
  layer: "L1_brand",
  tier: "core",
  tokenBudget: 65000,
  members: [
    {
      role: "godin_strategist",
      order: 0,
      isLead: true,
      primarySkill: "remarkability-strategist",
      createAgent: makeLead(
        "簡柏翰",
        "Brandon Chien",
        "Godin 非凡品牌策略副總裁",
        "VP of Remarkable Brand Strategy",
        "Seth Godin 派系實踐者。相信「普通即消失」，為 8 家新創 + 5 家成熟品牌找到 remarkability hook，把紅海品類的 me-too 轉為 must-talk-about。",
        "remarkability-strategist",
        ["purple-cow", "remarkability", "otaku-marketing", "word-of-mouth"],
      ),
    },
    { role: "white_cow_auditor", order: 1, isLead: false, primarySkill: "brand-audit", fallbackSkills: ["competitive-intelligence-market-research"] },
    { role: "otaku_researcher", order: 2, isLead: false, primarySkill: "consumer-insights", fallbackSkills: ["market-research-agent"] },
    { role: "remarkable_designer", order: 3, isLead: false, primarySkill: "brand-dna", fallbackSkills: ["creative-direction"] },
    { role: "sneezer_planner", order: 4, isLead: false, primarySkill: "content-marketing", fallbackSkills: ["social-media-marketing"] },
    { role: "propagation_tester", order: 5, isLead: false, primarySkill: "marketing-analytics", fallbackSkills: ["marketing-director"] },
  ],
  workflow: [
    { order: 1, name: "White Cow 同質化稽核", description: "盤點本品類所有品牌在訊息、視覺、通路上的「都一樣」之處。列出 50 條 parity 特徵。", tool: "octolens", outputType: "white-cow-audit", requiredSkills: ["brand-audit", "competitive-intelligence", "competitive-analysis", "brand-dna"], stepMemberRole: "white_cow_auditor" },
    { order: 2, name: "Otaku 狂熱粉絲研究", description: "訪談 10 位 category heavy user（不是本品牌），挖掘他們對什麼會狂熱、會主動 share、會重複購買的底層驅動力。", tool: "internal", outputType: "otaku-profile-report", requiredSkills: ["consumer-insights", "market-research", "qualitative-research", "behavioral-analysis"], stepMemberRole: "otaku_researcher" },
    { order: 3, name: "Remarkable Hook 設計", description: "為 otaku 設計 3 個 remarkable 概念 — 產品設計、服務設計、溝通設計三選一。每個概念必須能在 1 句話激起「我要跟別人說」的衝動。", tool: "osp_marketing_tools", outputType: "remarkable-hook-concepts", requiredSkills: ["brand-dna", "brand-voice", "creative-direction", "brand-narrative"], stepMemberRole: "remarkable_designer" },
    { order: 4, name: "Sneezer 擴散計畫", description: "Godin: 「not everyone talks, but sneezers do」。識別 3–5 類 sneezer（KOL、早期使用者、社群版主），設計他們會主動分享的 hook。", tool: "marketing-strategy-pmm", outputType: "sneezer-amplification-plan", requiredSkills: ["content-marketing", "social-media-marketing", "kol-brief", "word-of-mouth-strategy"], stepMemberRole: "sneezer_planner" },
    { order: 5, name: "Propagation A/B Test", description: "用 3 個概念做 small-scale A/B test，量化 share rate / word-of-mouth coefficient。保留 winner、放棄 loser。", tool: "marketing-strategy-pmm", outputType: "propagation-test-results", requiredSkills: ["marketing-analytics", "experiment-design", "conversion-analysis", "cross-channel-analytics"], stepMemberRole: "propagation_tester" },
  ],
};

export const specs: SquadSpec[] = [SOWORK, DUNFORD, NEUMEIER, SHARP, GODIN];
