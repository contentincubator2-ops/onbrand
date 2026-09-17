/**
 * Sales Hub — seed content for the ASUS ExpertHub concept demo.
 *
 * Everything factual carries a public source. Reps are fictional and flagged
 * is_demo. Solutions live in hubSolutions.json (collected by hand from public
 * solution pages, each with its source URL — ExpertHub's terms forbid bots,
 * so there is no crawler and the formal version needs ASUS's own catalog feed).
 */

export const HUB_ORG = {
  slug: "experthub",
  name: "ASUS ExpertHub",
  disclaimer:
    "Concept demo built by SoWork OnBrand from publicly available information. Not affiliated with, sponsored or endorsed by ASUS.",
  landingUrl: "https://experthub.asus.com/smb",
  positioning: {
    oneLiner: {
      en: "The diagnose-first solutions platform that matches Taiwan's SMBs with the right software partner.",
      zh: "先診斷、再媒合：幫台灣中小企業找到對的數位轉型方案與軟體夥伴。",
    },
    audience: {
      en: "Owners and managers of Taiwan SMBs in manufacturing, services and retail — companies with limited IT resources.",
      zh: "製造、服務、零售業的中小企業老闆與主管——IT 資源有限、不知道從哪裡開始數位轉型的公司。",
    },
    pains: [
      { en: "Too many vendors to evaluate, no time to compare", zh: "廠商太多、沒時間比較" },
      { en: "Unsure where AI actually fits the business", zh: "不確定 AI 能用在哪裡" },
      { en: "No in-house IT team to run a selection project", zh: "沒有 IT 團隊能主導導入" },
    ],
    howItWorks: [
      { en: "Diagnose — a short online diagnosis identifies pain points", zh: "診斷——線上填寫，找出營運痛點" },
      { en: "Match — curated solutions recommended from the diagnosis", zh: "媒合——依診斷結果推薦精選方案" },
      { en: "Consult & assess — expert guidance on fit", zh: "諮詢評估——顧問協助判斷適用性" },
      { en: "Implement — deployment support with the partner", zh: "導入——與夥伴一起完成部署" },
    ],
    pillars: [
      { en: "Start with a diagnosis, not a sales pitch", zh: "從診斷開始，不是從推銷開始" },
      { en: "Curated local software partners in one place", zh: "在地精選軟體夥伴，一站找齊" },
      { en: "Hardware, software and service from a brand SMBs already trust", zh: "硬體、軟體、服務，來自企業熟悉的品牌" },
    ],
    voice: {
      en: "Practical and consultative. Talk like a trusted advisor to a business owner: concrete, calm, no hype.",
      zh: "務實、顧問式。像在跟老闆聊天的可靠顧問：具體、沉穩、不誇大。",
    },
    proofPoints: [
      { en: "100+ curated solutions at launch (July 2026)", zh: "上線時匯集 100+ 精選方案（2026 年 7 月）", source: "https://press.asus.com/news/press-releases/asus-experthub-smb-digital-transformation/" },
      { en: "30+ years in Taiwan's commercial market", zh: "深耕台灣商用市場 30 年以上", source: "https://press.asus.com/news/press-releases/asus-experthub-smb-digital-transformation/" },
    ],
    sources: [
      "https://press.asus.com/news/press-releases/asus-experthub-smb-digital-transformation/",
      "https://experthub.asus.com/",
    ],
  },
};

export interface SeedFact {
  kind: "market" | "subsidy" | "platform" | "competitor" | "regulation";
  market: "TW" | "US";
  statement_en: string;
  statement_zh: string;
  /**
   * Numbers a post may quote. A percentage only counts as sourced when its
   * paragraph also mentions one of the anchors — otherwise "80% of our
   * clients doubled revenue" would borrow the 80% workforce statistic.
   */
  figures: { percents?: Array<{ value: number; anchors: string[] }>; amounts?: number[] };
  source_name: string;
  source_url: string;
  published_on: string | null;
  /** Only official / secondary facts are quotable; needs_verification is HQ-only. */
  confidence: "official" | "secondary" | "needs_verification";
}

export const HUB_FACTS: SeedFact[] = [
  {
    kind: "market", market: "TW",
    statement_en: "Taiwan has more than 1.715 million SMBs — over 98% of all enterprises — employing 9.194 million people, nearly 80% of the workforce.",
    statement_zh: "台灣中小企業超過 171.5 萬家，占全體企業 98% 以上，就業人數 919.4 萬人，約占 80%。",
    figures: { percents: [{ value: 98, anchors: ["中小企業", "SMB", "SME"] }, { value: 80, anchors: ["就業", "workforce", "employ", "jobs"] }] },
    source_name: "MOEA — 2025 White Paper on SMEs (2024 data)",
    source_url: "https://www.moea.gov.tw/Mns/populace/news/News.aspx?kind=1&menu_id=40&news_id=121491",
    published_on: "2025-12-26", confidence: "official",
  },
  {
    kind: "market", market: "TW",
    statement_en: "Only 7.4% of Taiwan SMBs have adopted or are planning AI. Top barriers: no clear use case (63.9%), not understanding AI (26.8%), cost (25.5%).",
    statement_zh: "僅 7.4% 的台灣中小企業已導入或規劃導入 AI；主要障礙為找不到明確需求（63.9%）、不了解 AI（26.8%）、成本（25.5%）。",
    figures: { percents: [{ value: 7.4, anchors: ["中小企業", "SMB", "SME"] }, { value: 63.9, anchors: ["需求", "use case", "need"] }, { value: 26.8, anchors: ["了解", "understand"] }, { value: 25.5, anchors: ["成本", "cost"] }] },
    source_name: "2025 White Paper on SMEs, as summarised by TESA",
    source_url: "https://www.tesa.center/blog/posts/20251227",
    published_on: "2025-12-27", confidence: "secondary",
  },
  {
    kind: "market", market: "TW",
    statement_en: "In a September 2026 MIC survey, 53% of Taiwan companies expect generative AI to be mainstream within three years, and 39% have started using AI agents.",
    statement_zh: "資策會 MIC 2026 年 9 月調查：53% 企業預期生成式 AI 三年內成為主流，39% 已開始使用 AI Agent。",
    figures: { percents: [{ value: 53, anchors: ["生成式", "generative", "GenAI"] }, { value: 39, anchors: ["Agent", "代理"] }] },
    source_name: "MIC survey via UDN Money",
    source_url: "https://money.udn.com/money/story/5612/9742404",
    published_on: "2026-09-08", confidence: "secondary",
  },
  {
    kind: "subsidy", market: "TW",
    statement_en: "Taiwan's Resilience Program subsidises AI and digital tools for merchants: up to NT$100,000 (50%) for a single store and up to NT$3,000,000 for multi-store chains; 2,000+ applications were filed between April and June 2026.",
    statement_zh: "商業發展署「韌性計畫」補助商家導入 AI 與數位工具：單店最高 10 萬元（補助 50%），多店最高 300 萬元；2026 年 4–6 月已有逾 2,000 件申請。",
    figures: { percents: [{ value: 50, anchors: ["補助", "subsid", "co-fund", "韌性", "Resilience"] }], amounts: [100_000, 3_000_000] },
    source_name: "Storm Media; smebiz.org.tw",
    source_url: "https://www.smebiz.org.tw/project-tenacity.php",
    published_on: null, confidence: "secondary",
  },
  {
    kind: "subsidy", market: "TW",
    statement_en: "Cloud Marketplace — Industrial Pavilion (2026): up to NT$50,000 in points per manufacturing SMB; application deadline reported as Sept 29.",
    statement_zh: "雲市集工業館（115 年度）：每家製造業中小企業最高 5 萬點；申請截止日據報為 9/29。",
    figures: { amounts: [50_000] },
    source_name: "Search summaries — not yet verified against the official notice",
    source_url: "https://www.ida.gov.tw/",
    published_on: null, confidence: "needs_verification",
  },
  {
    kind: "platform", market: "TW",
    statement_en: "ASUS ExpertHub launched on July 16, 2026 with 100+ curated solutions, following a diagnose-first model.",
    statement_zh: "華碩 ExpertHub 於 2026 年 7 月 16 日上線，以「先診斷、再媒合」模式匯集 100+ 精選方案。",
    figures: {},
    source_name: "ASUS Pressroom",
    source_url: "https://press.asus.com/news/press-releases/asus-experthub-smb-digital-transformation/",
    published_on: "2026-07-16", confidence: "official",
  },
  {
    kind: "platform", market: "TW",
    statement_en: "ASUS holds roughly 40% of Taiwan's commercial PC market and targets 200+ ISV partners on ExpertHub by the end of 2026.",
    statement_zh: "華碩在台灣商用 PC 市占約 40%，目標 2026 年底 ExpertHub 合作 ISV 超過 200 家。",
    figures: { percents: [{ value: 40, anchors: ["市占", "market share", "commercial PC", "商用"] }] },
    source_name: "cnyes via Yahoo Finance TW",
    source_url: "https://tw.stock.yahoo.com/news/%E8%8F%AF%E7%A2%A9%E6%8E%A8asus-experthub%E5%B9%B3%E5%8F%B0%E6%90%B6%E6%94%BB%E8%BD%89%E5%9E%8B%E7%B4%85%E5%88%A9-%E7%9B%AE%E6%A8%99%E7%AA%81%E7%A0%B4%E5%95%86%E7%94%A840-%E5%B8%82%E5%8D%A0%E5%A4%A9%E8%8A%B1%E6%9D%BF-103410671.html",
    published_on: "2026-07-16", confidence: "secondary",
  },
  {
    kind: "competitor", market: "TW",
    statement_en: "Telecom SMB bundles compete for the same owners: Chunghwa Telecom's 星創家 package and Taiwan Mobile's OP 開市網 AI tools.",
    statement_zh: "電信業者的中小企業方案鎖定同一群老闆：中華電信「星創家」、台灣大哥大「OP 開市網」。",
    figures: {},
    source_name: "Chunghwa Telecom; Taiwan Mobile",
    source_url: "https://opbiz.tw/index.html",
    published_on: null, confidence: "secondary",
  },
  {
    kind: "regulation", market: "TW",
    statement_en: "Taiwan FTC endorsement guidance: an employee recommending the employer's product online must disclose the relationship.",
    statement_zh: "公平會薦證廣告規範：員工於網路推薦自家產品，須揭露與事業之關係。",
    figures: {},
    source_name: "Fair Trade Commission (Taiwan)",
    source_url: "https://www.ftc.gov.tw/internet/main/doc/docDetail.aspx?uid=165&docid=13021",
    published_on: "2016-01-19", confidence: "official",
  },
  {
    kind: "regulation", market: "US",
    statement_en: "US FTC: employees who promote their employer's products on social media must disclose the relationship in the post — a profile bio isn't enough — and companies should train and monitor.",
    statement_zh: "美國 FTC：員工在社群推廣雇主產品須在貼文中揭露關係（只寫在個人簡介不算），企業應建立訓練與監督機制。",
    figures: {},
    source_name: "FTC — Endorsement Guides: What People Are Asking",
    source_url: "https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking",
    published_on: "2023-06-29", confidence: "official",
  },
];

export interface SeedSkill {
  slug: string;
  name_en: string;
  name_zh: string;
  channels: Array<"linkedin" | "facebook" | "instagram" | "line">;
  markets: Array<"TW" | "US">;
  status: "approved" | "draft";
  skill_md: string;
}

const skill = (front: { name: string; description: string; tags: string[] }, body: string) =>
  `---\nname: ${front.name}\ndescription: ${front.description}\nversion: 1.0.0\nmetadata:\n  hermes:\n    tags: [${front.tags.join(", ")}]\n    category: sales-social\n---\n\n${body.trim()}\n`;

export const HUB_SKILLS: SeedSkill[] = [
  {
    slug: "owner-pain-story", name_en: "Owner pain-point story", name_zh: "老闆痛點故事",
    channels: ["facebook", "line"], markets: ["TW"], status: "approved",
    skill_md: skill(
      { name: "owner-pain-story", description: "A short first-person story about an SMB owner's everyday problem, ending with a low-pressure invitation to the free diagnosis.", tags: ["facebook", "storytelling", "smb"] },
      `
## When to use
Facebook or LINE posts to a rep's personal network of business owners.

## Procedure
1. Open with one concrete scene an owner will recognise (orders on paper, staff re-typing data, stock counted by hand). 1–2 sentences.
2. Name the real cost in plain words (time, mistakes, lost customers). No statistics unless they are in the approved facts.
3. Introduce ONE solution from the approved catalog as "what I've seen help", with 2 concrete features.
4. Mention the approved price only if it helps the owner judge fit.
5. Close with the diagnosis invitation and the tracked link.

## Style
- 120–220 characters for zh-TW, conversational, like talking to a friend who runs a shop.
- At most 2 emoji. No hashtags walls (max 2).

## Pitfalls
- Don't lecture about "digital transformation" in the abstract.
- Don't imply the diagnosis leads to a subsidy approval.
`),
  },
  {
    slug: "market-insight", name_en: "Market insight → solution", name_zh: "市場洞察帶方案",
    channels: ["linkedin", "facebook"], markets: ["TW", "US"], status: "approved",
    skill_md: skill(
      { name: "market-insight", description: "Lead with one approved, cited market fact, explain what it means for a business owner, then connect it to one solution.", tags: ["linkedin", "thought-leadership"] },
      `
## When to use
LinkedIn (primary) or Facebook when the rep wants to sound like an advisor, not a seller.

## Procedure
1. Hook: one approved market fact, stated precisely, with a short source mention (e.g. "per the 2025 SME White Paper").
2. So what: 2–3 sentences on what this means for an owner's next quarter.
3. Bridge: one solution from the catalog and why it fits that insight (2 features).
4. Soft CTA to the diagnosis + tracked link.

## Style
- LinkedIn: short paragraphs, line breaks, 600–1,200 characters, 3 relevant hashtags at the end.
- Facebook: shorter, 150–300 characters.

## Pitfalls
- Never round or "update" a statistic. Quote it exactly as approved.
`),
  },
  {
    slug: "solution-spotlight", name_en: "Solution spotlight", name_zh: "方案亮點介紹",
    channels: ["facebook", "instagram", "linkedin"], markets: ["TW", "US"], status: "approved",
    skill_md: skill(
      { name: "solution-spotlight", description: "Introduce one catalog solution: who it's for, three features in plain language, the approved price, and the next step.", tags: ["product", "catalog"] },
      `
## Procedure
1. One line on who this is for (industry + situation).
2. Three features, each translated into an owner benefit ("so you can…").
3. Approved price exactly as listed (keep 起 / "starting at" if listed that way). If the plan is quote-only, say pricing depends on the setup.
4. Next step: free diagnosis + tracked link.

## Style
- Instagram: first line must work as a hook; 5 hashtags max.
- Keep claims factual; features must come from the catalog entry.
`),
  },
  {
    slug: "subsidy-explainer", name_en: "Subsidy explainer", name_zh: "補助計畫說明",
    channels: ["facebook", "line"], markets: ["TW"], status: "approved",
    skill_md: skill(
      { name: "subsidy-explainer", description: "Explain a government subsidy in plain words using only approved figures, and position the diagnosis as a way to prepare — never as a guarantee.", tags: ["subsidy", "facebook"] },
      `
## Procedure
1. Name the program and the single most useful fact (maximum amount or co-funding %) — approved figures only.
2. Who typically qualifies, in one sentence, hedged ("may be eligible").
3. How ExpertHub's diagnosis helps an owner get their plan ready.
4. Tracked link.

## Pitfalls
- Never say or imply approval is guaranteed (保證通過 / 包過 are banned).
- Don't state deadlines unless they are in the approved facts.
`),
  },
  {
    slug: "ai-myth-buster", name_en: "AI myth-buster", name_zh: "AI 迷思破解",
    channels: ["linkedin"], markets: ["US", "TW"], status: "approved",
    skill_md: skill(
      { name: "ai-myth-buster", description: "Take one common myth about AI for small businesses and correct it with an approved fact and a practical first step.", tags: ["linkedin", "ai"] },
      `
## Procedure
1. State the myth in the audience's words ("AI is only for big companies").
2. Counter with one approved fact and one concrete, small first step.
3. Show how a diagnose-first approach lowers the risk of choosing wrong.
4. Tracked link.

## Style
Confident, friendly, no jargon. 500–900 characters.
`),
  },
  {
    slug: "event-invite", name_en: "Consultation day invite", name_zh: "顧問諮詢日邀請",
    channels: ["facebook", "line"], markets: ["TW"], status: "draft",
    skill_md: skill(
      { name: "event-invite", description: "Invite owners to a consultation session. Draft — waiting for marketing to confirm dates and venue before approval.", tags: ["event", "invite"] },
      `
## Procedure
1. What the session is and what an owner walks away with.
2. Date / venue — ONLY from the approved event record (none approved yet).
3. Tracked link to register.

## Status
Draft: marketing must add the event record before this skill can be approved.
`),
  },
];

export interface SeedRep {
  market: "TW" | "US";
  name: string;
  title: string;
  team: string;
  seed: string;
  networkSize: number;
  linkedin: "connected" | "pending" | "none";
  instagram: "connected" | "none";
  facebook: "self_report" | "none";
  consent: boolean;
}

/** Fictional reps for the demo. */
export const HUB_REPS: SeedRep[] = [
  { market: "TW", name: "陳怡君 Amy Chen", title: "Senior Account Manager", team: "North · Commercial", seed: "amy", networkSize: 1840, linkedin: "connected", instagram: "connected", facebook: "self_report", consent: true },
  { market: "TW", name: "林志豪 Kevin Lin", title: "Account Manager", team: "North · Commercial", seed: "kevin", networkSize: 960, linkedin: "connected", instagram: "none", facebook: "self_report", consent: true },
  { market: "TW", name: "王雅婷 Tina Wang", title: "Channel Partner Manager", team: "North · Channel", seed: "tina", networkSize: 2310, linkedin: "connected", instagram: "connected", facebook: "self_report", consent: true },
  { market: "TW", name: "張家瑋 Jay Chang", title: "Account Manager", team: "Central · Commercial", seed: "jay", networkSize: 740, linkedin: "pending", instagram: "none", facebook: "self_report", consent: true },
  { market: "TW", name: "黃詩涵 Grace Huang", title: "Solutions Consultant", team: "Central · Commercial", seed: "grace", networkSize: 1320, linkedin: "connected", instagram: "connected", facebook: "self_report", consent: true },
  { market: "TW", name: "吳承恩 Leo Wu", title: "Account Manager", team: "South · Commercial", seed: "leo", networkSize: 610, linkedin: "none", instagram: "none", facebook: "self_report", consent: true },
  { market: "TW", name: "劉佳穎 Joyce Liu", title: "Senior Account Manager", team: "South · Commercial", seed: "joyce", networkSize: 1580, linkedin: "connected", instagram: "none", facebook: "self_report", consent: true },
  { market: "TW", name: "蔡宗翰 Hank Tsai", title: "Channel Partner Manager", team: "South · Channel", seed: "hank", networkSize: 890, linkedin: "none", instagram: "none", facebook: "none", consent: false },
  { market: "US", name: "Jordan Miller", title: "Partner Development Manager", team: "North America · Partners", seed: "jordan", networkSize: 2750, linkedin: "connected", instagram: "none", facebook: "none", consent: true },
  { market: "US", name: "Priya Patel", title: "Solutions Sales Lead", team: "North America · Partners", seed: "priya", networkSize: 3920, linkedin: "connected", instagram: "connected", facebook: "none", consent: true },
  { market: "US", name: "Marcus Reed", title: "Account Executive", team: "North America · SMB", seed: "marcus", networkSize: 1210, linkedin: "pending", instagram: "none", facebook: "none", consent: true },
];

// ── wording (strategy tray: preferred terms · word swaps · banned words) ─────

export interface SeedWording {
  market: "TW" | "US";
  kind: "preferred" | "swap" | "banned";
  term: string;
  replacement?: string;
  note?: string;
}

export const HUB_WORDING: SeedWording[] = [
  // preferred — what the brand says; goes into every writing prompt
  { market: "TW", kind: "preferred", term: "先診斷、再媒合", note: "Core promise — use when explaining how ExpertHub works" },
  { market: "TW", kind: "preferred", term: "數位轉型夥伴", note: "How we describe ExpertHub's role" },
  { market: "TW", kind: "preferred", term: "精選方案", note: "Solutions are curated, not a directory" },
  { market: "TW", kind: "preferred", term: "在地軟體夥伴", note: "ISVs are Taiwan partners" },
  { market: "TW", kind: "preferred", term: "免費線上診斷", note: "The call to action" },
  { market: "US", kind: "preferred", term: "diagnose-first", note: "Core promise" },
  { market: "US", kind: "preferred", term: "curated software partners", note: "Solutions are curated, not a directory" },
  { market: "US", kind: "preferred", term: "free online diagnosis", note: "The call to action" },
  { market: "US", kind: "preferred", term: "implementation support", note: "We stay after the match" },
  // swaps — applied to every post after the compliance checks
  { market: "TW", kind: "swap", term: "便宜", replacement: "價格實惠", note: "Avoid sounding like a discount pitch" },
  { market: "TW", kind: "swap", term: "系統商", replacement: "軟體夥伴", note: "Partners, not vendors" },
  { market: "TW", kind: "swap", term: "廠商", replacement: "合作夥伴", note: "Partners, not vendors" },
  { market: "TW", kind: "swap", term: "限時搶購", replacement: "歡迎了解", note: "No pressure selling" },
  { market: "US", kind: "swap", term: "cheap", replacement: "affordable", note: "Avoid sounding like a discount pitch" },
  { market: "US", kind: "swap", term: "vendor", replacement: "software partner", note: "Partners, not vendors" },
  { market: "US", kind: "swap", term: "buy now", replacement: "learn more", note: "No pressure selling" },
  // banned — company list on top of the legal rules in the policy packs; blocking
  { market: "TW", kind: "banned", term: "秒殺", replacement: "熱門", note: "Scarcity pressure" },
  { market: "TW", kind: "banned", term: "業界最強", replacement: "值得參考", note: "Unsubstantiated superlative" },
  { market: "TW", kind: "banned", term: "包你", replacement: "協助你", note: "Implied guarantee" },
  { market: "TW", kind: "banned", term: "立即見效", replacement: "逐步看到成效", note: "Outcome promise" },
  { market: "US", kind: "banned", term: "game-changer", replacement: "practical step", note: "Hype" },
  { market: "US", kind: "banned", term: "revolutionary", replacement: "new", note: "Hype" },
  { market: "US", kind: "banned", term: "instant results", replacement: "measurable progress", note: "Outcome promise" },
  { market: "US", kind: "banned", term: "no-brainer", replacement: "worth a look", note: "Pressure" },
];

// ── regulation updates (strategy tray) ──────────────────────────────────────

export interface SeedRegulation {
  market: "TW" | "US";
  authority: string;
  title: string;
  summary: string;
  impact: string;
  rules: Array<"disclosure" | "price" | "claims" | "evidence" | "competitors" | "link">;
  status: "applied" | "review" | "monitoring";
  effective_on: string | null;
  published_on: string | null;
  source_url: string;
}

export const HUB_REGULATIONS: SeedRegulation[] = [
  {
    market: "US", authority: "Federal Trade Commission",
    title: "Consumer Reviews and Testimonials Rule (16 CFR Part 465) takes effect",
    summary: "Bans fake reviews and testimonials, buying reviews, and insiders — including officers and employees — writing reviews or testimonials without clearly disclosing the relationship. Civil penalties apply.",
    impact: "Reps may not post reviews of company solutions; any testimonial-style post must carry the employee disclosure.",
    rules: ["disclosure", "claims"], status: "applied",
    effective_on: "2024-10-21", published_on: "2024-08-22",
    source_url: "https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials",
  },
  {
    market: "US", authority: "Federal Trade Commission",
    title: "Endorsement Guides revised — employee endorsements",
    summary: "The revised Guides add an example on employee endorsements: employers can limit liability by training employees and, where they know about the endorsements, monitoring them. A material connection includes employment.",
    impact: "Disclosure is mandatory in every rep post; HQ monitoring (this dashboard) documents the training-and-monitoring program.",
    rules: ["disclosure"], status: "applied",
    effective_on: "2023-06-29", published_on: "2023-06-29",
    source_url: "https://www.ftc.gov/news-events/news/press-releases/2023/06/federal-trade-commission-announces-updated-advertising-guides-combat-deceptive-reviews-endorsements",
  },
  {
    market: "TW", authority: "公平交易委員會 Fair Trade Commission",
    title: "公平交易法第 21 條案件處理原則修正 — social media groups and sales talk count as advertising",
    summary: "The amended handling principles list social media, messaging-app group chats and salespeople's pitches as ways of making representations to the public.",
    impact: "Posts reps share to LINE groups are held to the same accuracy rules as ads: approved prices and sourced statistics only.",
    rules: ["price", "evidence", "claims"], status: "applied",
    effective_on: "2025-07-01", published_on: "2025-07-01",
    source_url: "https://www.ftc.gov.tw/internet/main/doc/docDetail.aspx?uid=165&docid=13937",
  },
  {
    market: "TW", authority: "公平交易委員會 Fair Trade Commission",
    title: "網路廣告案件處理原則修正 — frequent sellers online are advertisers",
    summary: "Bloggers and influencers who frequently post to sell are treated as advertisers and must clearly disclose conditions and limits.",
    impact: "Reps posting regularly about solutions are covered; conditions such as \"starting at\" and contract terms must stay in the post.",
    rules: ["price", "disclosure"], status: "applied",
    effective_on: "2023-02-21", published_on: "2023-02-21",
    source_url: "https://law.ftc.gov.tw/law/LawContent.aspx?id=GL000222",
  },
  {
    market: "TW", authority: "公平交易委員會 Fair Trade Commission",
    title: "薦證廣告規範說明 — employees must disclose their relationship",
    summary: "An endorser whose relationship with the advertiser isn't expected by the public must disclose it; the guidance's example is an employee recommending the employer's product online.",
    impact: "Every Taiwan post carries 「我在華碩服務」 or the standard disclosure line.",
    rules: ["disclosure"], status: "applied",
    effective_on: "2016-01-19", published_on: "2016-01-19",
    source_url: "https://www.ftc.gov.tw/internet/main/doc/docDetail.aspx?uid=165&docid=13021",
  },
  {
    market: "TW", authority: "個人資料保護委員會 PDPC (preparatory office)",
    title: "個人資料保護法 amendment promulgated — effective date not yet set",
    summary: "Adds breach-notification duties for private companies and creates an independent regulator.",
    impact: "Rep social-account data and consent records need a breach-response owner before the amendment takes effect.",
    rules: [], status: "monitoring",
    effective_on: null, published_on: "2025-11-11",
    source_url: "https://www.pdpc.gov.tw/News_Content/20/1001/",
  },
];
