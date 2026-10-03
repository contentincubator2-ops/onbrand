/**
 * 成品頁的資料形狀與純函式：版本資料、換人重寫人設、公關出處對照。
 */


export type Mode = "edit" | "chat" | "image" | "agent" | "regen" | "rewrite" | "publish" | "source" | "vendors";

/* 2026-07-07 (CJ「參數儀表板 technical data 客戶看不懂，乾脆換成可以選擇
 * 不同 agent 幫他重寫」): the settings/telemetry panel is gone from the
 * client UI. In its place: a rewrite-agent picker. Each persona maps to
 * quickTask.refineCaption's existing agentName/agentTitle params (the
 * server builds the system prompt from them), so no new endpoint. */
export const REWRITE_AGENTS: Array<{
  /** Canonical mos_db id. The server resolves all runtime persona data by this id. */
  agentId: number;
  name: string;
  title: string; titleEn: string;          // card subtitle + agentTitle param
  style: string; styleEn: string;          // one-line pitch shown on the card
  instruction: string; instructionEn: string; // sent as userFeedback
}> = [
  {
    agentId: 180006, name: "Grace Wu", title: "感性故事文案", titleEn: "Story-driven Copywriter",
    style: "小故事帶入，品牌溫度", styleEn: "Warm, narrative-led",
    instruction: "請用你最擅長的感性說故事風格完整重寫這篇文案：以一個貼近受眾日常的小情境開場，把產品自然帶進故事，結尾收在情感共鳴加上輕聲的行動呼籲。保留原文的關鍵賣點與事實，不要新增原文沒有的功能或承諾。",
    instructionEn: "Rewrite fully in your signature story-driven style: open with a relatable everyday scene, weave the product in naturally, close with emotional resonance and a soft CTA. Keep every factual selling point; invent nothing.",
  },
  {
    agentId: 180162, name: "Jason Peng", title: "直球促購文案", titleEn: "Direct-response Copywriter",
    style: "第一句就是賣點，轉單導向", styleEn: "Punchy, conversion-first",
    instruction: "請用直球促購風格完整重寫：第一句就丟最強賣點，全篇短句有力、節奏快，營造明確的行動急迫感，結尾一個不囉嗦的行動呼籲。保留原文的關鍵資訊與優惠條件，不得捏造價格、折扣或期限。",
    instructionEn: "Rewrite in direct-response style: strongest hook in the first line, short punchy sentences, clear urgency, one crisp CTA. Keep original facts and offer terms; never invent prices or deadlines.",
  },
  {
    agentId: 180159, name: "Claire Hsu", title: "網感幽默文案", titleEn: "Meme-savvy Copywriter",
    style: "口語有梗，年輕化", styleEn: "Playful, youthful, witty",
    instruction: "請用年輕、有網感的幽默風格完整重寫：口語、有梗、帶一點自嘲或反差，讓人看完想 tag 朋友。梗要新不要老，幽默不能蓋過賣點，品牌的禁用語與事實照舊遵守。",
    instructionEn: "Rewrite with playful internet humor: conversational, witty, tag-a-friend energy. Keep the selling points visible under the humor and respect all brand rules.",
  },
  {
    agentId: 30002, name: "Sarah Liu", title: "專業顧問文案", titleEn: "Expert-authority Copywriter",
    style: "觀點與信任感，專業口吻", styleEn: "Credible, insight-led",
    instruction: "請用專業顧問的口吻完整重寫：以觀點或洞察切入，語氣可信、克制、不浮誇，讓讀者覺得是內行人給的建議。只使用原文已有的數據與事實，沒有數據就用定性描述，不得編造數字。",
    instructionEn: "Rewrite in a credible consultant voice: lead with an insight, restrained and trustworthy. Use only facts present in the original; never fabricate numbers.",
  },
  {
    agentId: 222311, name: "Ming-Han Zhou", title: "極簡俐落文案", titleEn: "Minimalist Copywriter",
    style: "砍到最短，一眼看完", styleEn: "Cut to the bone",
    instruction: "請把這篇文案砍到最精簡：保留一個主賣點加一個行動呼籲，其餘全部拿掉，句子要短，總長度不超過原文的一半。刪減可以，但不能改變原意，也不能遺漏優惠的關鍵條件。",
    instructionEn: "Cut this caption to the bone: one key selling point plus one CTA, short lines, under half the original length. Trim aggressively but never change meaning or drop offer terms.",
  },
];

export interface ImageVersionView {
  url: string;
  prompt?: string | null;
  promptZh?: string | null;
  modelId?: string | null;
  requestedModelId?: string | null;
  savedAt?: string;
}

export interface VariantData {
  id?: string;
  label: string;
  format?: "feed" | "carousel" | "reel" | "story" | "live";
  caption: string;
  hashtags?: string[];
  imageStyle?: string;
  /** 2026-08-19: the prompt the image model actually received (see
   *  quickTaskOrchestra OrchestraVariant.image.prompt). Older runs don't
   *  have it — callers fall back to imageStyle. */
  imagePrompt?: string;
  /** Traditional Chinese display/edit counterpart of imagePrompt. */
  imagePromptZh?: string;
  imageModelId?: string;
  imageRequestedModelId?: string;
  /** Why a failed image failed, and whether the UI may offer Nano Banana (never run automatically). */
  imageErrorMsg?: string;
  imageCanSwitchTo?: "nano-banana";
  /** Earlier images of this slot, newest first — selectable without regenerating. */
  imageVersions?: ImageVersionView[];
  imageUrl?: string | null;
  imageStatus?: string;
  qa?: any;
  extras?: any;
  /** 2026-09-29 換人寫：每位寫過的稿（server writerDrafts.ts）與目前是誰的稿。 */
  writerDrafts?: Record<string, { name: string; title?: string; agentId?: number; caption: string }>;
  activeWriter?: string;
  // 2026-05-18 (CJ): carousel / album — N cards, each its own image
  cards?: Array<{
    headline: string;
    body: string;
    image: {
      style: string | null;
      prompt?: string | null;
      promptZh?: string | null;
      modelId?: string | null;
      requestedModelId?: string | null;
      url: string | null;
      status: string;
      errorMsg?: string;
    };
  }>;
}

/* 2026-05-18 (CJ「還有 \n\n 的符號」): models sometimes emit the literal
 * two-char sequence backslash-n instead of a real newline (double-escaped
 * JSON). Normalize to real line breaks + collapse runs so every mockup
 * renders clean paragraphs. */
export function sanitizeCaption(s: unknown): string {
  let t = typeof s === "string" ? s : (s == null ? "" : String(s));
  t = t.replace(/\\r\\n|\\n|\\r/g, "\n").replace(/\\t/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

export function normalizeVariantData(v: any): VariantData {
  const img = v?.image ?? {};
  return {
    id: typeof v?.id === "string" ? v.id : undefined,
    label: v?.label,
    format: ["feed", "carousel", "reel", "story", "live"].includes(v?.format) ? v.format : undefined,
    caption: sanitizeCaption(v?.caption),
    hashtags: v?.hashtags ?? [],
    imageUrl: v?.imageUrl ?? img.url ?? null,
    imageStatus: v?.imageStatus ?? img.status ?? undefined,
    imageStyle: v?.imageStyle ?? img.style ?? undefined,
    imagePrompt: v?.imagePrompt ?? img.prompt ?? undefined,
    imagePromptZh: v?.imagePromptZh ?? img.promptZh ?? undefined,
    imageModelId: v?.imageModelId ?? img.modelId ?? undefined,
    imageRequestedModelId: v?.imageRequestedModelId ?? img.requestedModelId ?? undefined,
    imageErrorMsg: typeof img.errorMsg === "string" ? img.errorMsg : undefined,
    imageCanSwitchTo: (v?.image?.canSwitchTo ?? img.canSwitchTo) === "nano-banana" ? "nano-banana" : undefined,
    imageVersions: Array.isArray(v?.imageVersions) ? v.imageVersions
      : Array.isArray(img.versions) ? img.versions : undefined,
    qa: v?.qa,
    extras: v?.extras,
    cards: Array.isArray(v?.cards) ? v.cards : undefined,
    writerDrafts: v?.writerDrafts && typeof v.writerDrafts === "object" ? v.writerDrafts : undefined,
    activeWriter: typeof v?.activeWriter === "string" ? v.activeWriter : undefined,
  };
}

/* 2026-05-17 (CJ「把得獎工藝依據展示在前台」): per-task craft reference.
 * Mirrors the 【得獎工藝參考】 baked into each PR task's systemPrompt.
 * Wording is deliberately "工藝原則參考，非案例背書" — we apply the
 * transferable craft principle, NOT a claim of award/endorsement. */
export const PR_CRAFT_REF: Record<string, {
  case: string; award: string; principle: string;
  caseEn: string; awardEn: string; principleEn: string;
}> = {
  "pr-30-headline":        {
    case: "The Tampon Book", award: "Cannes Lions 2019 PR 全場大獎", principle: "用一個「重新框架」把舊事實變成不可忽視的新聞——標題＝reframe＋具體數字。",
    caseEn: "The Tampon Book", awardEn: "Cannes Lions 2019 PR Grand Prix", principleEn: "One reframe turns an old fact into unmissable news — headline = reframe + specific number.",
  },
  "pr-30-subhead":         {
    case: "Project Revoice", award: "Cannes Lions 2018 健康類全場大獎", principle: "副標扛起標題扛不動的「人的代價/影響」，補上利害關係，不是重述標題。",
    caseEn: "Project Revoice", awardEn: "Cannes Lions 2018 Health & Wellness Grand Prix", principleEn: "The subhead carries what the headline can't — the human cost, the stakes. It adds context, not a restatement.",
  },
  "pr-30-lead-paragraph":  {
    case: "The Lost Class", award: "Cannes Lions 2022", principle: "第一句就是一個讓人重新理解全局的事實揭露，不鋪陳。",
    caseEn: "The Lost Class", awardEn: "Cannes Lions 2022", principleEn: "First sentence = a fact that reframes everything. No buildup. No preamble.",
  },
  "pr-30-ceo-quote":       {
    case: "Patagonia「Earth is now our only shareholder」", award: "2022 全球 earned-media 典範", principle: "高層發言＝行動＋價值，每句可被記者原句引用，不是場面話。",
    caseEn: "Patagonia — \"Earth is now our only shareholder\"", awardEn: "2022 global earned-media benchmark", principleEn: "Executive quotes = action + values. Every sentence quotable as-is. Not corporate filler.",
  },
  "pr-30-boilerplate":     {
    case: "PR Awards 評審準則 + Dove 長青一致性", award: "業界評審共通準則", principle: "用可驗證事實＋第三方背書建立可信度，能長期沿用不過期。",
    caseEn: "PR Awards judging criteria + Dove long-term consistency", awardEn: "Industry standard", principleEn: "Verifiable facts + third-party proof = credibility that doesn't expire.",
  },
  "pr-30-fact-sheet":      {
    case: "Spotify Wrapped", award: "全球 earned / 多獎", principle: "把資料變成「10 秒看懂、想分享」的數字，掃描性 > 完整性。",
    caseEn: "Spotify Wrapped", awardEn: "Global earned media + multiple awards", principleEn: "Turn data into numbers people grasp in 10 seconds and want to share. Scannable beats comprehensive.",
  },
  "pr-30-media-pitch":     {
    case: "Whopper Detour", award: "Cannes Lions 2019", principle: "賣「記者的讀者會在乎的角度」與不可抗拒的鉤，不是賣品牌。",
    caseEn: "Whopper Detour", awardEn: "Cannes Lions 2019", principleEn: "Sell the angle the journalist's readers will care about — and an irresistible hook. Not the brand.",
  },
  "pr-30-spokesperson-qa": {
    case: "KFC「FCK」", award: "Cannes Lions 2019 多項金獅 + D&AD", principle: "危機回應：立刻 own it＋坦誠＋機智＋馬上講怎麼修，化攻擊為信任。",
    caseEn: "KFC \"FCK\"", awardEn: "Cannes Lions 2019 multiple Gold Lions + D&AD", principleEn: "Crisis response: own it immediately + be honest + use wit + say what you're fixing. Turn attack into trust.",
  },
  "pr-30-launch-social":   {
    case: "Spotify Wrapped 社群擴散", award: "全球 earned", principle: "被分享的是「有觀點、有梗、與我有關」，不是公告。",
    caseEn: "Spotify Wrapped — social amplification", awardEn: "Global earned media", principleEn: "What gets shared: has a POV, has a hook, feels personal. Not an announcement.",
  },
  "pr-100-launch-toolkit": {
    case: "Whopper Detour（整合 earned）", award: "Cannes Lions 2019", principle: "一個新聞鉤貫穿所有素材，互相加乘而非各說各話。",
    caseEn: "Whopper Detour (integrated earned)", awardEn: "Cannes Lions 2019", principleEn: "One news hook threads through every asset — each amplifies the others instead of going solo.",
  },
  "pr-99-launch-toolkit":  {
    case: "Whopper Detour（整合 earned）", award: "Cannes Lions 2019", principle: "一個新聞鉤貫穿所有素材，互相加乘而非各說各話。",
    caseEn: "Whopper Detour (integrated earned)", awardEn: "Cannes Lions 2019", principleEn: "One news hook threads through every asset — each amplifies the others instead of going solo.",
  },
  "pr-30-news-hook":       {
    case: "The Tampon Book + Whopper Detour", award: "Cannes Lions 2019 PR", principle: "得獎不是把公告寫好，而是先找到「記者會主動報、群眾會主動傳」的角度（earned idea）。",
    caseEn: "The Tampon Book + Whopper Detour", awardEn: "Cannes Lions 2019 PR", principleEn: "Awards don't go to well-written press releases. They go to the angle journalists want to cover and audiences want to share — the earned idea.",
  },
  "pr-99-newsjack":        {
    case: "Oreo「Dunk in the Dark」", award: "2013 即時 newsjack 經典", principle: "在對的時刻、用對的角度、夠快且自然地把品牌接上正在發燒的話題——不硬蹭。",
    caseEn: "Oreo \"Dunk in the Dark\"", awardEn: "2013 real-time newsjack classic", principleEn: "Right moment, right angle, fast and natural — attach the brand to a trending story. Never force it.",
  },
};

// 2026-05-18 (CJ「承諾是完整貼文 → 圖完成才展示 mockup」): tasks whose
// deliverable is a complete post (copy + image). For these, while the
// orchestra is still on the caption_ready checkpoint (image pending) we
// hold the mockup and show a "generating" state, then reveal the full
// post once images finish. Mirrors OrchestraConfig.holdForImages server-side.
export const HOLD_FOR_IMAGES = new Set<string>(["fb-60-single-full", "fb-99-carousel-5"]);

// 2026-08-22 (CJ「IG 直播配套應該是完整直播範本」): >4 變體預設走 pool
// 漸進揭露（headline pool：變體是可互換的角度，先給 3 個）。但序列型任務
// 的每個變體是「流程的一段」，藏起後半段等於把流程表切一半 —— 這類任務
// 一次全部攤開。用明列 id 而不是關鍵字猜（見 inferMockup 的教訓）。
export const SEQUENCE_TASKS = new Set<string>([
  "ig-60-live-suite", "ig-60-live-event", "ig-60-live-founder",
  "ig-60-live-versus", "ig-60-live-comeback", "ig-60-live-collab-drop",
  "ig-60-live-first-ever", "ig-60-live-behind-scenes", "ig-60-live-crew",
]);

/**
 * Convert a Nano-Banana JSON prompt template into a clean natural-language
 * image prompt, substituting the original product/brand with the user's brand.
 *
 * Nano-Banana templates store the brand name in `concept_id` (e.g.
 * "iron_man_coke") and multiple nested fields (focus_object, character_element,
 * artistic_direction, etc.). Passing the raw JSON to an image model causes it
 * to generate the original brand's product even when focus_object is replaced.
 *
 * This function extracts only the visual/compositional elements (environment,
 * character, lighting, mood, style) and synthesizes a clean English prompt
 * that never mentions any competitor brand name.
 */
export function nanoBananaJsonToPrompt(rawJson: string, brandLabel: string): string | null {
  let obj: any;
  try { obj = JSON.parse(rawJson); } catch { return null; }
  if (Array.isArray(obj)) obj = obj[0];
  if (!obj || typeof obj !== "object") return null;

  // Recursively find the first non-empty string value for any of the given keys.
  const find = (node: any, ...keys: string[]): string | undefined => {
    if (!node || typeof node !== "object") return undefined;
    for (const k of keys) {
      if (typeof node[k] === "string" && node[k].trim()) return node[k].trim();
    }
    for (const v of Object.values(node)) {
      const r = find(v, ...keys);
      if (r) return r;
    }
    return undefined;
  };

  const subject   = brandLabel ? `${brandLabel} product` : "product";
  const charEl    = find(obj, "character_element", "character", "hand_element");
  const env       = find(obj, "environment", "setting", "background", "scene");
  const lighting  = find(obj, "lighting", "light", "illumination");
  const mood      = find(obj, "mood", "atmosphere", "emotion", "feeling");
  const style     = find(obj, "style", "aesthetic", "render_style", "rendering", "visual_style");
  const camera    = find(obj, "camera_angle", "camera", "shot_type", "framing", "perspective");
  const texture   = find(obj, "texture", "material", "surface");

  const parts: string[] = [
    subject,
    charEl   ? `featuring ${charEl}` : undefined,
    env      ? `set in ${env}` : undefined,
    camera   ? camera : undefined,
    lighting ? `${lighting} lighting` : undefined,
    mood     ? `${mood} atmosphere` : undefined,
    style    ? `${style} render` : undefined,
    texture  ? texture : undefined,
  ].filter((x): x is string => Boolean(x));

  return parts.join(", ");
}

export function sanitizeProviderErrorForToast(input: unknown): string {
  const raw = String(input ?? "");
  const redacted = raw
    .replace(/api_key:[A-Za-z0-9_\-]+/g, "api_key:[REDACTED]")
    .replace(/key=([A-Za-z0-9_\-]+)/g, "key=[REDACTED]")
    .replace(/API KEY\s*:?\s*[A-Za-z0-9_\-]+/gi, "API KEY:[REDACTED]")
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, "[REDACTED_GOOGLE_KEY]");
  if (/key|unauthorized|api_key|permission_denied|suspended|consumer|forbidden|403/i.test(redacted)) {
    return "AI 圖片服務的金鑰異常，SoWork 已收到通知正在處理。";
  }
  return redacted;
}
