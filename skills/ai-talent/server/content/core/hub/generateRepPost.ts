/**
 * Sales Hub — generate one compliant post for one rep.
 *
 * Deliberately a single post (no variants, no packs): pick a solution, a skill
 * and a channel, write, check, fix. The strategy layer (positioning, approved
 * prices, cited facts) and the policy pack are injected; the compliance
 * contract then validates → retries once with named violations → repairs.
 */

import {
  applySwaps,
  buildReport,
  describeIssuesForRetry,
  findIssues,
  repairPost,
  termPattern,
  type ComplianceContext,
  type ComplianceReport,
} from "./complianceContract";
import { packFor } from "./policyPacks";
import { normaliseProfile, postSafeProfileLines } from "../../../strategy/core/hub/solutionProfile";
import {
  createLink,
  exec,
  formatPrice,
  getOrg,
  getRep,
  listFacts,
  listSkills,
  listSolutions,
  listWording,
  logEvent,
  publicBaseUrl,
  q,
  type HubFact,
  type HubOrg,
  type HubRep,
  type HubSolution,
  type HubWording,
} from "../../../platform/core/hub/hubStore";

export type HubChannel = "linkedin" | "facebook" | "instagram" | "line";
export type HubSource = "web" | "line" | "hermes" | "simulator";

const CHANNEL_CRAFT: Record<HubChannel, { en: string; zh: string }> = {
  linkedin: {
    en: "LinkedIn: the first two lines must earn the click on \"…see more\". Short paragraphs with line breaks. 600–1,200 characters. Up to 3 relevant hashtags at the very end.",
    zh: "LinkedIn：前兩行要讓人想點「查看更多」。短段落、適度換行。300–600 字。結尾最多 3 個相關 hashtag。",
  },
  facebook: {
    en: "Facebook personal profile: conversational, like talking to friends who run businesses. 300–600 characters. At most 2 hashtags and 2 emoji.",
    zh: "Facebook 個人帳號：口語、像跟開店的朋友聊天。120–250 字。最多 2 個 hashtag、2 個 emoji。",
  },
  instagram: {
    en: "Instagram caption: the first line is the hook. 300–600 characters. Up to 5 hashtags at the end.",
    zh: "Instagram 貼文：第一行就是鉤子。120–250 字。結尾最多 5 個 hashtag。",
  },
  line: {
    en: "LINE message to friends and groups: short and warm, 150–300 characters, no hashtags.",
    zh: "LINE 分享給好友或群組：簡短親切，80–150 字，不用 hashtag。",
  },
};

export interface GeneratePostInput {
  repId: number;
  solutionId: number;
  channel: HubChannel;
  skillSlug?: string | null;
  angle?: string | null;
  source: HubSource;
}

export interface GeneratedPost {
  postId: number;
  caption: string;
  firstDraft: string;
  compliance: ComplianceReport;
  shortCode: string;
  trackedLink: string;
  model: string;
  latencyMs: number;
  skill: { slug: string; nameEn: string; nameZh: string };
  solution: { id: number; nameEn: string; nameZh: string };
}

export function complianceContextFor(args: {
  market: string;
  solutions: HubSolution[];
  facts: HubFact[];
  wording: HubWording[];
  trackedLink: string;
}): ComplianceContext {
  const quotable = args.facts.filter((f) => f.confidence !== "needs_verification");
  const amounts = new Set<number>();
  for (const s of args.solutions) for (const p of s.prices) if (p.amount != null) amounts.add(p.amount);
  for (const f of quotable) for (const a of f.figures.amounts ?? []) amounts.add(a);
  const mine = args.wording.filter((w) => w.market === args.market);
  return {
    pack: packFor(args.market),
    approvedAmounts: [...amounts],
    approvedPercents: quotable.flatMap((f) => f.figures.percents ?? []),
    trackedLink: args.trackedLink,
    extraClaims: mine.filter((w) => w.kind === "banned").map((w) => [termPattern(w.term), w.replacement ?? ""] as [RegExp, string]),
    swaps: mine.filter((w) => w.kind === "swap" && w.replacement).map((w) => [w.term, w.replacement as string] as [string, string]),
  };
}

function wordingPrompt(wording: HubWording[], market: string, zh: boolean): string {
  const mine = wording.filter((w) => w.market === market);
  const preferred = mine.filter((w) => w.kind === "preferred").map((w) => w.term);
  const banned = mine.filter((w) => w.kind === "banned").map((w) => w.term);
  const swaps = mine.filter((w) => w.kind === "swap").map((w) => `${w.term} → ${w.replacement}`);
  if (!preferred.length && !banned.length && !swaps.length) return "";
  return [
    zh ? "## 品牌用詞（行銷部維護）" : "## Brand wording (maintained by marketing)",
    preferred.length ? `${zh ? "優先使用" : "Prefer"}: ${preferred.join("、")}` : "",
    swaps.length ? `${zh ? "改用" : "Say instead"}: ${swaps.join("；")}` : "",
    banned.length ? `${zh ? "禁用詞" : "Never use"}: ${banned.join("、")}` : "",
  ].filter(Boolean).join("\n");
}

function buildMessages(args: {
  org: HubOrg;
  rep: HubRep;
  solution: HubSolution;
  facts: HubFact[];
  wording: HubWording[];
  skillMd: string;
  channel: HubChannel;
  angle: string | null;
  trackedLink: string;
  identity: Array<{ term: string; wrong: string; note: string }>;
  destinations: Array<{ label: string; url: string; useWhen: string }>;
  quietPeriods: Array<{ label: string; startsOn: string; endsOn: string; topics: string[] }>;
}) {
  const { org, rep, solution, facts, wording, skillMd, channel, angle, trackedLink, identity, destinations, quietPeriods } = args;
  const pack = packFor(rep.market);
  const zh = pack.language === "zh-TW";
  const pos = org.positioning ?? {};
  const pick = (o: any) => (o ? (zh ? o.zh : o.en) : "");
  const quotable = facts.filter((f) => f.confidence !== "needs_verification" && f.kind !== "competitor" && f.kind !== "regulation");
  const profileLines = postSafeProfileLines(normaliseProfile((solution as any).profile), zh);

  const system = [
    pack.promptRules,
    wordingPrompt(wording, rep.market, zh),
    "",
    zh ? "## 品牌定位（ExpertHub）" : "## Brand positioning (ExpertHub)",
    pick(pos.oneLiner),
    `${zh ? "目標對象" : "Audience"}: ${pick(pos.audience)}`,
    `${zh ? "語氣" : "Voice"}: ${pick(pos.voice)}`,
    `${zh ? "訊息支柱" : "Pillars"}: ${(pos.pillars ?? []).map(pick).join(" / ")}`,
    "",
    zh ? "## 寫作技巧（公司核准的 SKILL）" : "## Writing skill (company-approved SKILL)",
    skillMd,
    "",
    zh ? "## 平台寫法" : "## Channel craft",
    zh ? CHANNEL_CRAFT[channel].zh : CHANNEL_CRAFT[channel].en,
    "",
    zh
      ? "只輸出貼文內文本身，不要前言、不要解釋、不要用引號包住。使用繁體中文（台灣用語）。"
      : "Output only the post text itself — no preamble, no explanation, no surrounding quotes. Write in US English.",
  ].join("\n");

  const prices = solution.prices.map((p) => `- ${formatPrice(p, pack.language)}`).join("\n") || (zh ? "- （無公開價格，不得提及價格）" : "- (no public price — do not mention a price)");
  const factLines = quotable
    .map((f) => `- ${zh ? f.statementZh : f.statementEn} (${f.sourceName})`)
    .join("\n");

  const user = [
    zh ? "## 這篇要介紹的方案" : "## Solution to feature",
    `${zh ? solution.nameZh : solution.nameEn} — ${solution.vendor}`,
    zh ? solution.summaryZh : solution.summaryEn,
    ...(solution.features.length ? [zh ? "特色：" : "Features:", ...solution.features.map((f) => `- ${zh ? f.zh : f.en}`)] : []),
    ...(solution.audienceZh || solution.audienceEn ? [`${zh ? "適合" : "Best for"}: ${zh ? solution.audienceZh : solution.audienceEn}`] : []),
    // 2026-09-23: 產品 profile 只送 postSafe 的欄位。USP 是競品比較（政策包會
    // 拿掉）、roadmap 是未公開功能（緘默期在擋）、ROI 的數字要有出處、智財保障
    // 是合約承諾 —— 那四個欄位業務要知道，但貼文不能寫，所以連 prompt 都不給。
    ...(profileLines.length ? ["", zh ? "## 產品資料（可公開的部分）" : "## Product profile (the publishable parts)", ...profileLines] : []),
    "",
    zh ? "## 核准價目表（只能引用這些）" : "## APPROVED PRICE LIST (quote only these)",
    prices,
    "",
    zh ? "## 核准市場數據（統計數字只能來自這裡）" : "## APPROVED MARKET FACTS (statistics may only come from here)",
    factLines,
    "",
    zh ? "## 發文者" : "## Author",
    `${rep.name}, ${rep.title} (${rep.team})`,
    "",
    zh ? `## 專屬追蹤連結（放在結尾）\n${trackedLink}` : `## Tracked link (put it at the end)\n${trackedLink}`,
    // 公司與產品的寫法。法務對商標形式是認真的，而這是模型最常無聲寫錯的地方
    // （Asus、Expert Hub）。目前是 prompt 層的要求，還沒有確定性檢查——卡面上
    // 的說明必須跟這件事一致，不能寫成「自動比對」。
    ...(identity.length
      ? [
          "",
          zh ? "## 公司與產品的正確寫法（逐字照用）" : "## HOW TO WRITE OUR NAMES (use these exact forms)",
          ...identity.map((i) =>
            `- ${i.term}${i.wrong ? zh ? `（不要寫成 ${i.wrong}）` : ` (never ${i.wrong})` : ""}${i.note ? ` — ${i.note}` : ""}`,
          ),
        ]
      : []),
    // 2026-09-22 (CJ 品牌頁): 核准的導流目的地。沒有這張清單，模型就會自己挑
    // 一個連結——通常是去年那個已經下架的活動頁。
    ...(destinations.length
      ? [
          "",
          zh
            ? "## 核准的導流目的地（除了上面的追蹤連結，只能出現這幾個網址）"
            : "## APPROVED DESTINATIONS (besides the tracked link above, no other URL may appear)",
          ...destinations.map((d) => `- ${d.label}: ${d.url}${d.useWhen ? `（${d.useWhen}）` : ""}`),
        ]
      : []),
    // 緘默期是唯一一條依日期開關的規則 —— 政策包那六條是靜態的，表達不了。
    ...(quietPeriods.length
      ? [
          "",
          zh
            ? "## 緘默期生效中 —— 最高優先，牴觸時以這一段為準"
            : "## QUIET PERIOD IN EFFECT — highest priority, overrides anything that conflicts",
          ...quietPeriods.map((p) =>
            zh
              ? `${p.label}（${p.startsOn} 至 ${p.endsOn}）：不得提及 ${p.topics.join("、") || "營收、成長率、未公開的案子、任何預測"}。`
              : `${p.label} (${p.startsOn} to ${p.endsOn}): do not mention ${p.topics.join(", ") || "revenue, growth rates, unannounced deals or any forecast"}.`,
          ),
        ]
      : []),
    ...(angle ? ["", zh ? `## 業務的想法（不違反政策的前提下照做）\n${angle}` : `## Rep's note (follow it unless it conflicts with policy)\n${angle}`] : []),
  ].join("\n");

  return { system, user };
}

async function callWriter(system: string, user: string, extra?: { draft: string; feedback: string }) {
  const { invokeLLM } = await import("../../../platform/core/llm");
  const messages: any[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  if (extra) {
    messages.push({ role: "assistant", content: extra.draft });
    messages.push({ role: "user", content: extra.feedback });
  }
  const res = await invokeLLM({
    messages,
    provider: "anthropic",
    model: process.env.HUB_WRITER_MODEL || "claude-sonnet-5",
    maxTokens: 1200,
    signal: AbortSignal.timeout(60_000),
  });
  const content = res.choices?.[0]?.message?.content;
  const text = (typeof content === "string" ? content : (content ?? []).map((c: any) => c.text ?? "").join(""))
    .replace(/^["“「]|["”」]$/g, "")
    .trim();
  if (!text) throw new Error("writer returned an empty post");
  return { text, model: res.model || process.env.HUB_WRITER_MODEL || "claude-sonnet-5" };
}

export async function generateRepPost(input: GeneratePostInput): Promise<GeneratedPost> {
  const started = Date.now();
  const rep = await getRep(input.repId);
  if (!rep) throw new Error(`rep ${input.repId} not found`);
  const org = await getOrg();
  const [solutions, facts, skills, wording] = await Promise.all([
    listSolutions(org.id), listFacts(org.id), listSkills(org.id), listWording(org.id),
  ]);
  const solution = solutions.find((s) => s.id === input.solutionId);
  if (!solution) throw new Error(`solution ${input.solutionId} not found`);

  const approved = skills.filter((s) => s.status === "approved");
  const skill =
    approved.find((s) => s.slug === input.skillSlug) ??
    approved.find((s) => s.channels.includes(input.channel) && s.markets.includes(rep.market)) ??
    approved[0];
  if (!skill) throw new Error("no approved skill available");

  const shortCode = await createLink(org.id, rep.id, input.channel);
  const trackedLink = `${publicBaseUrl()}/r/${shortCode}`;
  const ctx = complianceContextFor({ market: rep.market, solutions, facts, wording, trackedLink });
  const { approvedDestinations, activeQuietPeriods, namingRules } = await import("../../../strategy/core/hub/brandAssets");
  // 品牌資料是選填的：表還沒建或一筆都沒填，就當成沒有這兩段，不該讓寫作失敗。
  const [identity, destinations, quietPeriods] = await Promise.all([
    namingRules(org.id).catch(() => []),
    approvedDestinations(org.id).catch(() => []),
    activeQuietPeriods(org.id).catch(() => []),
  ]);
  const { system, user } = buildMessages({
    org, rep, solution, facts, wording, skillMd: skill.skillMd, channel: input.channel,
    angle: input.angle?.trim() || null, trackedLink, identity, destinations, quietPeriods,
  });

  const first = await callWriter(system, user);
  const firstDraftIssues = findIssues(first.text, ctx);
  let attempts = 1;
  let current = first.text;
  let model = first.model;
  let afterRetryIssues = firstDraftIssues;
  if (firstDraftIssues.length) {
    attempts = 2;
    const retry = await callWriter(system, user, { draft: first.text, feedback: describeIssuesForRetry(firstDraftIssues, ctx) });
    current = retry.text;
    model = retry.model;
    afterRetryIssues = findIssues(current, ctx);
  }
  const { text: fixed, fixes } = afterRetryIssues.length ? repairPost(current, ctx) : { text: current, fixes: {} };
  // Preferred wording last, so a swap can't reintroduce a phrase the checks removed.
  const { text: repaired, applied: wordingApplied } = applySwaps(fixed, ctx);
  const finalIssues = findIssues(repaired, ctx);
  const compliance = { ...buildReport({ ctx, firstDraftIssues, afterRetryIssues, finalIssues, fixes, attempts }), wording: wordingApplied };
  const latencyMs = Date.now() - started;

  const { insertId: postId } = await exec(
    `INSERT INTO hub_posts (org_id, rep_id, solution_id, skill_id, channel, market, angle, first_draft, caption,
       compliance, verdict, short_code, source, model, latency_ms, is_demo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [org.id, rep.id, solution.id, skill.id, input.channel, rep.market, input.angle?.slice(0, 600) ?? null,
     first.text, repaired, JSON.stringify(compliance), compliance.verdict, shortCode, input.source, model, latencyMs],
  );
  await exec(`UPDATE hub_links SET post_id = ? WHERE code = ?`, [postId, shortCode]);
  await logEvent(org.id, rep.id, "post_generated",
    `${input.channel} · ${solution.nameEn} · ${compliance.verdict}${compliance.issuesCaught ? ` (${compliance.issuesCaught} caught)` : ""}`);

  return {
    postId, caption: repaired, firstDraft: first.text, compliance, shortCode, trackedLink, model, latencyMs,
    skill: { slug: skill.slug, nameEn: skill.nameEn, nameZh: skill.nameZh },
    solution: { id: solution.id, nameEn: solution.nameEn, nameZh: solution.nameZh },
  };
}

/**
 * Check a post the rep wrote themselves — no AI, instant. This is the "paste
 * your own draft" path, and the easiest way to show the rules working live.
 */
export async function checkOwnDraft(args: { repId: number; text: string }) {
  const rep = await getRep(args.repId);
  if (!rep) throw new Error(`rep ${args.repId} not found`);
  const org = await getOrg();
  const [solutions, facts, wording] = await Promise.all([listSolutions(org.id), listFacts(org.id), listWording(org.id)]);
  const [link] = await q(`SELECT code FROM hub_links WHERE rep_id = ? AND post_id IS NULL ORDER BY created_at DESC LIMIT 1`, [rep.id]);
  const code = link?.code ?? (await createLink(org.id, rep.id, null));
  const trackedLink = `${publicBaseUrl()}/r/${code}`;
  const ctx = complianceContextFor({ market: rep.market, solutions, facts, wording, trackedLink });
  const firstDraftIssues = findIssues(args.text, ctx);
  const { text: fixed, fixes } = firstDraftIssues.length ? repairPost(args.text, ctx) : { text: args.text, fixes: {} };
  const { text, applied: wordingApplied } = applySwaps(fixed, ctx);
  const finalIssues = findIssues(text, ctx);
  const compliance = {
    ...buildReport({ ctx, firstDraftIssues, afterRetryIssues: firstDraftIssues, finalIssues, fixes, attempts: 0 }),
    wording: wordingApplied,
  };
  await logEvent(org.id, rep.id, "draft_checked", `${compliance.verdict}${compliance.issuesCaught ? ` (${compliance.issuesCaught} caught)` : ""}`);
  return { original: args.text, fixed: text, compliance, trackedLink };
}
