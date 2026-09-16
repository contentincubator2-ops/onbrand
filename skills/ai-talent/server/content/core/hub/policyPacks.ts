/**
 * Sales Hub — market policy packs.
 *
 * A pack is what "company policy" means for one market: the legal basis HQ
 * points to, the instructions the writer gets up front, and the vocabulary the
 * compliance contract checks after generation. Both packs enforce the same
 * five checks; only the wording and legal references differ, which is the
 * point of the demo — one workflow, market-specific rules.
 *
 * Legal references (verified 2026-09-16):
 *  · TW 公平會「薦證廣告」— an endorser whose relationship with the advertiser
 *    isn't expected by the public must disclose it; the guidance's own example
 *    is an employee recommending the employer's product online.
 *    https://www.ftc.gov.tw/internet/main/doc/docDetail.aspx?uid=165&docid=13021
 *  · TW 公平交易法 §21 (false / misleading claims), 消費者保護法 §22 (ad content
 *    binds the business, so quoted prices must be honoured).
 *  · US FTC Endorsement Guides, 16 CFR Part 255 — employees must disclose the
 *    relationship in the post itself ("listing your employer on your profile
 *    page isn't enough"); the company is responsible for what others do on its
 *    behalf and should train and monitor.
 *    https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking
 */

export type HubMarket = "TW" | "US";

export interface PolicyRule {
  id: "disclosure" | "price" | "claims" | "evidence" | "competitors" | "link";
  title: string;
  description: string;
  legalRef: string;
}

export interface PolicyPack {
  id: string;
  market: HubMarket;
  language: "zh-TW" | "en-US";
  name: string;
  authority: string;
  rules: PolicyRule[];
  /** Line the contract inserts when a post lacks a disclosure. */
  disclosureLine: string;
  /** Any of these counts as a valid disclosure. */
  disclosurePatterns: RegExp[];
  /** Absolute / guarantee wording → safer replacement (null = drop the word). */
  claimReplacements: Array<[RegExp, string]>;
  competitorNames: string[];
  /** Replaces an unapproved price mention. */
  priceFallback: string;
  promptRules: string;
}

const TW: PolicyPack = {
  id: "tw-fair-trade",
  market: "TW",
  language: "zh-TW",
  name: "Taiwan · Fair Trade Act & endorsement rules",
  authority: "公平交易委員會 (Fair Trade Commission, Taiwan)",
  rules: [
    {
      id: "disclosure",
      title: "Disclose the employment relationship",
      description: "Employees recommending the company's products must say they work there, inside the post.",
      legalRef: "公平會 薦證廣告規範說明；公平交易法 §25",
    },
    {
      id: "price",
      title: "Only quote approved, current prices",
      description: "Prices must match the active price list. Quoted prices bind the company.",
      legalRef: "消費者保護法 §22；公平交易法 §21",
    },
    {
      id: "claims",
      title: "No absolute or guaranteed claims",
      description: "No 保證 / 第一 / 最便宜 / 零風險 style wording.",
      legalRef: "公平交易法 §21",
    },
    {
      id: "evidence",
      title: "Statistics need an approved source",
      description: "Any percentage must come from the approved market-facts library.",
      legalRef: "公平交易法 §21",
    },
    {
      id: "competitors",
      title: "No comparisons with named competitors",
      description: "Comparative claims need substantiation HQ has not provided.",
      legalRef: "公平交易法 §21, §24",
    },
    {
      id: "link",
      title: "Use your tracked link",
      description: "Every post carries the rep's tracked link so HQ can attribute results.",
      legalRef: "Company policy",
    },
  ],
  disclosureLine: "（我任職於華碩 ASUS，本文為個人分享）",
  disclosurePatterns: [
    /我(在|任職於|服務於|是)[^。\n]{0,14}(華碩|ASUS)/i,
    /#(華碩|ASUS)\s?(員工|夥伴)/i,
    /(華碩|ASUS)\s?員工/i,
    /任職於華碩/,
  ],
  claimReplacements: [
    [/保證(通過|核准|過件)/g, "協助準備申請"],
    [/保證/g, "協助"],
    [/(全台|台灣|業界)?(最便宜|最低價)(的)?/g, "價格實惠的"],
    [/(全台|台灣|業界|市場)第一(名|品牌)?|第一(名|品牌)/g, "值得信賴"],
    [/唯一/g, "少數"],
    [/零風險/g, "門檻低"],
    [/穩賺(不賠)?/g, "有機會提升營收"],
    [/(一定|絕對|必定)(會|能|可以|有效)/g, "有機會"],
    [/百分之百|100\s?%/g, "高度"],
    [/包過/g, "協助申請"],
  ],
  competitorNames: ["中華電信", "遠傳", "台灣大哥大", "台灣大", "Microsoft", "微軟", "Google"],
  priceFallback: "（最新方案價格請見 ExpertHub 方案頁）",
  promptRules: [
    "你是華碩 ExpertHub 的業務同仁，用自己的名義在個人社群發文。",
    "1. 貼文中必須清楚揭露你任職於華碩（例如「我在華碩 ExpertHub 服務」），不能只靠個人簡介。",
    "2. 價格只能引用下方「核准價目表」中的數字與寫法，沒有列出的價格一律不寫。",
    "3. 不得使用「保證、第一、唯一、最便宜、零風險、一定、100%」等絕對或保證性字眼。",
    "4. 任何百分比或統計數字只能來自下方「核准市場數據」，並簡短註明出處；引用時意思要和原句完全一致，不能擴大範圍（例如「導入 AI」不能改寫成「導入數位工具」）。",
    "5. 不得點名比較競爭對手。",
    "6. 貼文結尾放上你的專屬追蹤連結。",
  ].join("\n"),
};

const US: PolicyPack = {
  id: "us-ftc-endorsement",
  market: "US",
  language: "en-US",
  name: "United States · FTC Endorsement Guides",
  authority: "Federal Trade Commission (16 CFR Part 255)",
  rules: [
    {
      id: "disclosure",
      title: "Disclose the employment relationship",
      description: "A material connection must be disclosed clearly in the post itself — a profile bio is not enough.",
      legalRef: "16 CFR §255.5; FTC Endorsement Guides FAQ",
    },
    {
      id: "price",
      title: "Only quote approved, current prices",
      description: "Prices must match the active price list; no invented discounts.",
      legalRef: "FTC Act §5 (deceptive pricing)",
    },
    {
      id: "claims",
      title: "No absolute or guaranteed claims",
      description: "No guaranteed / best / #1 / risk-free style wording.",
      legalRef: "FTC Act §5",
    },
    {
      id: "evidence",
      title: "Statistics need substantiation",
      description: "Any percentage must come from the approved market-facts library.",
      legalRef: "FTC Policy Statement on Substantiation",
    },
    {
      id: "competitors",
      title: "No comparisons with named competitors",
      description: "Comparative claims require substantiation HQ has not provided.",
      legalRef: "FTC Statement on Comparative Advertising",
    },
    {
      id: "link",
      title: "Use your tracked link",
      description: "Every post carries the rep's tracked link so HQ can attribute results.",
      legalRef: "Company policy",
    },
  ],
  disclosureLine: "Disclosure: I work at ASUS. Views are my own.",
  disclosurePatterns: [
    /\bI (work|am) (at|for|with) ASUS\b/i,
    /#ASUS\s?Employee\b/i,
    /\bASUS employee\b/i,
    /\bDisclosure: I work at ASUS\b/i,
  ],
  claimReplacements: [
    [/\bguaranteed? to\b/gi, "designed to"],
    [/\bguaranteed?\b/gi, "potential"],
    [/\b(the )?best\b(?![- ]practice)/gi, "a strong"],
    [/#1\b|\bnumber one\b/gi, "a leading"],
    [/\b(the )?(cheapest|lowest[- ]priced?)\b/gi, "competitively priced"],
    [/\brisk[- ]free\b/gi, "low-commitment"],
    [/\b100\s?%/g, "highly"],
    [/\balways\b/gi, "often"],
    [/\bnever fails?\b/gi, "is dependable"],
  ],
  competitorNames: ["Chunghwa Telecom", "Far EasTone", "Taiwan Mobile", "Microsoft", "Google"],
  priceFallback: "(see current pricing on the solution page)",
  promptRules: [
    "You are an ASUS ExpertHub sales rep posting on your own personal social account.",
    "1. Clearly disclose in the post that you work at ASUS (e.g. start with \"I work at ASUS\"). A profile bio is not enough.",
    "2. Only quote prices exactly as listed in the APPROVED PRICE LIST below. If a price is not listed, do not mention one.",
    "3. Never use absolute or guaranteed wording: guaranteed, best, #1, cheapest, risk-free, 100%, always.",
    "4. Any percentage or statistic must come from the APPROVED MARKET FACTS below, with a short source mention, and keep exactly the same meaning — never broaden it (e.g. \"adopted AI\" must not become \"adopted digital tools\").",
    "   Say \"starting at\" only for prices the list marks as starting at.",
    "5. Do not compare against or name competitors.",
    "6. End with your tracked link.",
  ].join("\n"),
};

export const POLICY_PACKS: Record<HubMarket, PolicyPack> = { TW, US };

export function packFor(market: string): PolicyPack {
  return market === "US" ? US : TW;
}

/** JSON-safe view for the admin UI (RegExps stripped). */
export function publicPack(pack: PolicyPack) {
  return {
    id: pack.id,
    market: pack.market,
    language: pack.language,
    name: pack.name,
    authority: pack.authority,
    rules: pack.rules,
    disclosureLine: pack.disclosureLine,
    blockedWording: pack.claimReplacements.map(([re, to]) => ({ pattern: re.source, replacement: to })),
    competitorNames: pack.competitorNames,
  };
}
