import type { TaskEn, TaskEnMap, VariantLabelEnMap } from "./types";

/** 單一 context 輸入的卡：question + placeholder + inputs.<key>.label */
function ctx(question: string, placeholder: string, label: string, key = "context"): TaskEn {
  return { question, placeholder, inputs: { [key]: { label } } };
}

// ── 五感十築：十項標準的英文短名（id = wg-case-1..10，順序同 TEN_STANDARDS）──
const STANDARDS_EN: { zh: string; short: string }[] = [
  { zh: "十築自然", short: "Nature" },
  { zh: "十築好氧", short: "Fresh Air" },
  { zh: "十築舒適", short: "Comfort" },
  { zh: "十築珍惜", short: "Cherish" },
  { zh: "十築友善", short: "Friendly" },
  { zh: "十築健康", short: "Health" },
  { zh: "十築沉靜", short: "Quiet" },
  { zh: "十築安心", short: "Peace of Mind" },
  { zh: "十築好水", short: "Clean Water" },
  { zh: "十築美學", short: "Aesthetics" },
];

const WUGAN_CASES: TaskEnMap = Object.fromEntries(
  STANDARDS_EN.map((s, i) => [
    `wg-case-${i + 1}`,
    ctx(
      `Which ${s.short} cases should we scout this time? Which have you already used, to avoid repeats?`,
      `e.g. ${s.short} cases for housing or schools. Already used: (paste earlier case names to avoid repeats)`,
      "Scouting direction + cases already used",
    ),
  ]),
);

const WUGAN_CAL_Q = "What is this month's theme? Which holidays, seasons or brand events should be included?";
const WUGAN_CAL_PH =
  "Fill in: month + seasonal or holiday context + focus topic + slots already booked (e.g. a mid-month GQ collab)";
const WUGAN_CAL_LABEL = "Month + theme + scheduled items";
const WUGAN_CAL: TaskEnMap = Object.fromEntries(
  [
    "wg-cal-website-long-form",
    "wg-cal-meeting-the-ten",
    "wg-cal-architecture-expo",
    "wg-cal-living-practice",
    "wg-cal-eco-architecture",
    "wg-cal-sustainable-living",
    "wg-cal-sustainable-value",
  ].map((id) => [id, ctx(WUGAN_CAL_Q, WUGAN_CAL_PH, WUGAN_CAL_LABEL)]),
);

const SHARE_LABEL = "Source text / link";

export const TASK_EN: TaskEnMap = {
  // ── quickTaskMedia.ts ──
  "media-photo-fb": { question: "Upload a product or event photo" },
  "media-photo-ig": { question: "Upload a photo" },
  "media-photo-tiktok": { question: "Upload a photo" },
  "media-photo-yt": { question: "Upload a YouTube thumbnail" },
  "media-video-fb": { question: "Paste the video's YouTube link" },
  "media-video-ig": { question: "Paste the video's YouTube link" },
  "media-video-tiktok": { question: "Paste the video's YouTube link" },
  "media-video-yt": { question: "Paste the YouTube video link you want to rewrite" },
  "media-doc-rewrite": { question: "Upload the document to rewrite" },

  // ── quickTaskKOL.ts ──
  "kl-30-invite-opener": ctx(
    "Which KOL do you want to work with, on what topic?",
    "e.g. Parenting moms with 10K-50K followers, for a Mother's Day campaign",
    "KOL + collab topic",
  ),
  "kl-30-influencer-brief": ctx(
    "Which brand or campaign is this collab for, and what do you want to achieve?",
    "e.g. Taiwan Fund for Children and Families (家扶基金會) Mother's Day sponsorship drive: KOLs promote NT$700 monthly sponsorships with one warm story post",
    "Brand / campaign + goal",
    "core_message",
  ),
  "kl-30-followup": ctx(
    "Where did your last conversation leave off?",
    "e.g. Invite sent 7 days ago, no reply / Talked terms but nothing confirmed / Collab finished, want to wrap up",
    "Last interaction",
    "last_touch",
  ),
  "kl-30-catch-organic-fan": {
    ...ctx(
      "Who has mentioned you without a partnership?",
      "e.g. A customer who posted an unboxing / someone who featured our product in a video",
      "People who mentioned you on their own",
      "topic",
    ),
    source: {
      short: "Ocean Spray × Nathan Apodaca",
      metric: "Original video: 80M views, 12.9M likes",
      takeaway:
        "The best partner is someone who already mentioned you for free: picking them up builds on trust that already exists instead of buying it from zero.",
    },
  },
  "kl-30-fan-template-kit": {
    ...ctx(
      "What do you want collaborating creators to make with you? Which elements can they reuse?",
      "e.g. A shared opening line / brand-color border / three fixed questions",
      "Elements creators can reuse",
      "topic",
    ),
    source: {
      short: "Barbie selfie generator",
      metric: "Used 13M+ times after the filter launched",
      takeaway:
        "A kit must be wearable by the creator: they stay the star and the brand only lends a frame, and the simpler the frame, the more people use it.",
    },
  },

  // ── quickTaskCobrand.ts ──
  "cb-30-partner-shortlist": ctx(
    "Whose audience do you want to borrow this time? What should the campaign achieve?",
    "e.g. Launch campaign aimed at small-brand owners aged 25-40, wanting one more non-social exposure channel",
    "Campaign + target audience",
  ),
  "cb-30-pitch-letter": ctx(
    "Which type of brand is this going to? What do you want to do together?",
    "e.g. To a bookkeeping SaaS serving small brands: feature our trial campaign in their newsletter, and we give their users an exclusive plan",
    "Recipient + collab idea",
  ),
  "cb-30-followup": ctx(
    "Where are things now? Who is the partner and where did you last leave off?",
    "e.g. Pitch letter sent a week ago, no reply / We spoke by phone, they want to see the split of duties first",
    "Progress + partner",
  ),
  "cb-30-deal-terms": ctx(
    "Who is the partner? What have both sides roughly agreed?",
    "e.g. Swapping newsletter exposure with a bookkeeping SaaS, each giving the other's users an exclusive plan, live 12/1",
    "Partner + what's agreed",
  ),
  "cb-30-joint-post": ctx(
    "Who are you partnering with? What does each side's users get?",
    "e.g. OnBrand Studio × a bookkeeping SaaS: users on both sides can apply for a trial + exclusive plan, 12/1-12/25",
    "Collab details",
  ),

  // ── quickTaskBrand.ts ──
  "br-30-tagline": ctx(
    "What does your brand do, and who should remember it?",
    "Business + audience + the core feeling to convey",
    "Brand + feeling",
  ),
  "br-30-value-prop": ctx(
    "Current value proposition + what do you want to improve?",
    "Current value proposition + pain point",
    "Current value proposition",
  ),
  "br-30-brand-voice": ctx(
    "Who is the brand personality like? Who should it avoid sounding like?",
    "Brand + desired personality + tone to avoid",
    "Brand personality cues",
  ),
  "br-30-archetype": ctx(
    "Core brand belief / relationship with customers",
    "Brand belief + relationship with customers",
    "Belief + relationship",
  ),
  "br-30-positioning": ctx(
    "Target customer + competitive arena + unique differentiator",
    "Target audience + competitive field + what is uniquely yours",
    "Three positioning elements",
  ),
  "br-30-elevator-pitch": ctx(
    "Your brand + who it helps most + why it matters now",
    "Intro + audience + current timing",
    "Pitch material",
  ),
  "br-30-manifesto": ctx(
    "What does your brand believe? What does it oppose?",
    "Brand belief + common practices you oppose",
    "Belief + opposition",
  ),
  "br-30-forbidden-words": ctx(
    "Brand personality + which words do competitors overuse?",
    "Brand + observations of competitor language",
    "Brand + competitors",
  ),
  "br-30-naming": ctx(
    "What should the name convey + preferred style?",
    "Product essence + desired feel + audience",
    "Naming needs",
  ),
  "br-30-competitor-map": ctx(
    "Who are your competitors? Which axes do you want to differentiate on?",
    "Competitor list + candidate axes (price / features / audience / aesthetics)",
    "Competitors + axes",
  ),
  "br-30-stance-manifesto": {
    ...ctx(
      "Which side are you willing to stand on, even if you lose some customers?",
      "e.g. We back repair over replacement / We don't do countdown-pressure sales",
      "The side you'll stand on",
      "topic",
    ),
    source: {
      short: "Nike × Colin Kaepernick",
      metric: "Daily social volume +1,400%, 2.7M brand mentions",
      takeaway:
        "A brand stance is only as strong as the number of people it offends: pick a side and be ready to lose the other, and people will spread it for you.",
    },
  },
  "br-30-stance-cost-statement": {
    ...ctx(
      "What does this statement say? What did doing this cost you?",
      "e.g. Announce we're dropping a product line, losing 20% of annual revenue",
      "Statement + the price you paid",
      "topic",
    ),
    source: {
      short: "Patagonia “Don't Buy This Jacket”",
      metric: "Revenue grew about 30% the next year, to $543M",
      takeaway:
        "A public statement with a stance but no cost reads like a PR release: put the loss in numbers and the statement carries weight.",
    },
  },

  // ── brandPacks/wugan.ts ──
  "wg-web-longform": ctx(
    "Which case or issue should this piece cover? Which of the Ten Standards should it map to?",
    "e.g. Hotel Sonne (Switzerland): automatic flushing of drinking-water lines, mapped to Clean Water (十築好水)",
    "Case / topic + target standard",
  ),
  "wg-web-meetten": ctx(
    "Which of the ten standards is this piece about? Whose viewpoint is it told from?",
    "e.g. Quiet (十築沉靜), from the Chief Innovation Officer's view on why soundproofing is a baseline",
    "Standard + speaker's viewpoint",
  ),
  "wg-web-expo": ctx(
    "Which architecture case will be exhibited? Which standards should it map to?",
    "e.g. De Verwondering primary school (Netherlands), ORGA Architects, timber + bio-based materials, mapped to Nature / Quiet / Cherish / Friendly",
    "Case + target standards",
  ),
  "wg-fb-life-practice": ctx(
    "Which everyday scene is this about? Which of the Ten Standards does it map to?",
    "e.g. The half hour the family tidies up together after dinner, mapped to Health (十築健康): cooking together, after-dinner walks, space at home left for activity",
    "Everyday scene + target standard",
  ),
  "wg-fb-eco-case": ctx(
    "Which building or material case should we feature? Which of the Ten Standards does it map to?",
    "e.g. Manitoba Hydro Place (Canada): double-skin facade and atrium water curtain, mapped to Comfort (十築舒適)",
    "Case + target standard",
  ),
  "wg-fb-sustain-life": ctx(
    "Which international brand, trend or sustainability action should we cover? Which of the Ten Standards should it extend to?",
    "e.g. Danish furniture brand TAKT publishes its carbon footprint and offers parts for self-repair, extended to Cherish (十築珍惜)",
    "Brand / trend / action + target standard",
  ),
  "wg-fb-brand-view": ctx(
    "Which of the Ten Standards or which brand principle is this piece about?",
    "e.g. On Cherish (十築珍惜): why we care whether building materials can be repaired or replaced",
    "Standard / brand principle",
  ),
  "wg-fb-share-gq": ctx(
    "Which GQ column do you want to share? Paste the original.",
    "Paste the original 《五感十築 X GQ》 column, or a summary + URL",
    SHARE_LABEL,
  ),
  "wg-fb-share-meetten": ctx(
    "Which Meeting the Ten (《遇見十築》) piece do you want to share? Paste the original.",
    "Paste the original 《遇見十築》 piece or a summary + website URL",
    SHARE_LABEL,
  ),
  "wg-fb-share-web": ctx(
    "Which website article do you want to share? Paste the original.",
    "Paste the original website long-form or Ten Standards Expo piece + URL",
    SHARE_LABEL,
  ),
  ...WUGAN_CASES,
  ...WUGAN_CAL,
};

export const VARIANT_LABEL_EN: VariantLabelEnMap = {
  // KOL
  真誠版: "Sincere",
  互惠版: "Reciprocal",
  新聞點切入版: "News-hook angle",
  完整正式版: "Full formal",
  精簡重點版: "Short highlights",
  活動主題版: "Campaign theme",
  輕觸版: "Light touch",
  推進版: "Move forward",
  收尾版: "Wrap-up",
  回禮版: "Gift-back",
  放大版: "Amplify",
  長期版: "Long-term",
  模板版: "Template",
  句型版: "Phrase pattern",
  濾鏡版: "Filter",
  // Cobrand
  受眾重疊版: "Audience overlap",
  通路互補版: "Complementary channels",
  內容共創版: "Co-created content",
  時機切入版: "Timing angle",
  收斂版: "Narrow down",
  完整版: "Full",
  精簡版: "Short",
  第一次合作版: "First collaboration",
  用戶好處版: "User benefit",
  故事版: "Story",
  期限版: "Deadline",
  // Brand
  功能訴求: "Functional appeal",
  情感訴求: "Emotional appeal",
  反差訴求: "Contrast appeal",
  智慧訴求: "Wit appeal",
  行動訴求: "Action appeal",
  "X 不再 Y": "X, no more Y",
  "唯一 X": "The only X",
  專業派: "Professional",
  親民派: "Approachable",
  玩味派: "Playful",
  "Hero/Magician 類": "Hero/Magician type",
  "Sage/Caregiver 類": "Sage/Caregiver type",
  "Outlaw/Jester 類": "Outlaw/Jester type",
  "TA 聚焦": "Audience focus",
  差異化聚焦: "Differentiation focus",
  結果聚焦: "Outcome focus",
  問題切入: "Problem angle",
  故事切入: "Story angle",
  數據切入: "Data angle",
  立場式: "Stance",
  對抗式: "Confrontational",
  邀請式: "Invitation",
  "過時 buzzword": "Outdated buzzwords",
  競品用語: "Competitor jargon",
  業界陳腔: "Industry clichés",
  描述型: "Descriptive",
  暗喻型: "Metaphorical",
  創造詞型: "Coined word",
  "價格 vs 功能": "Price vs features",
  "大眾 vs 利基": "Mass vs niche",
  "工具 vs 文化": "Tool vs culture",
  宣言版: "Manifesto",
  對立版: "Us vs them",
  承諾版: "Pledge",
  數字版: "By the numbers",
  時間表版: "Timeline",
  公開承諾版: "Public commitment",
  // Wugan
  情境鉤子: "Scene hook",
  反差鉤子: "Contrast hook",
  提問鉤子: "Question hook",
  當月排程: "Monthly schedule",
  官網長文: "Website long-form",
  遇見十築: "Meeting the Ten",
  十築建築展: "Ten Standards Expo",
  生活場景切入: "Daily-scene angle",
  身體感受切入: "Bodily-sensation angle",
  季節時令切入: "Seasonal angle",
  技術切入: "Technical angle",
  使用者感受切入: "User-experience angle",
  問題意識切入: "Problem-awareness angle",
  做法解析: "How-to breakdown",
  趨勢觀察: "Trend watch",
  價值反思: "Value reflection",
  破除誤解: "Myth-busting",
  標準定義: "Standard definition",
  長期價值: "Long-term value",
  ...Object.fromEntries(STANDARDS_EN.map((s) => [s.zh, `Ten Standards: ${s.short}`])),
};
