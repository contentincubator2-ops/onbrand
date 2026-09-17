/**
 * Sales Hub — compliance contract for a rep's personal-account post.
 *
 * Same shape as adCopyContract / shotListContract: the rules go into the
 * prompt, `findIssues` validates the draft, the generator retries once with the
 * named violations, and `repairPost` deterministically fixes whatever is left.
 * Unlike the brand-rule pass in the orchestra, nothing here fails open: a
 * thrown error surfaces to the caller instead of shipping an unchecked post.
 */

import type { PolicyPack, PolicyRule } from "./policyPacks";

export type RuleId = PolicyRule["id"];

export interface ComplianceContext {
  pack: PolicyPack;
  /** Every amount a post may quote: active catalog prices + approved fact figures. */
  approvedAmounts: number[];
  /** Percentages a post may quote, each valid only next to one of its anchors. */
  approvedPercents: Array<{ value: number; anchors: string[] }>;
  trackedLink: string;
  /** Marketing's banned words (strategy tray) — enforced exactly like the pack's legal claim rules. */
  extraClaims?: Array<[RegExp, string]>;
  /** Marketing's preferred-word swaps, applied after the checks (not a compliance failure). */
  swaps?: Array<[string, string]>;
}

export interface ComplianceIssue {
  rule: RuleId;
  detail: string;
  evidence: string[];
}

export type CheckStatus = "pass" | "fixed" | "flagged";

export interface ComplianceCheck {
  rule: RuleId;
  title: string;
  legalRef: string;
  status: CheckStatus;
  detail: string;
}

export interface ComplianceReport {
  packId: string;
  packName: string;
  market: string;
  verdict: "clean" | "auto_fixed" | "needs_review";
  issuesCaught: number;
  attempts: number;
  checks: ComplianceCheck[];
  /** Preferred-wording swaps applied to the final post. */
  wording?: Array<{ from: string; to: string }>;
}

// ── detection helpers ───────────────────────────────────────────────────────

const URL_RE = /https?:\/\/[^\s)）」』>]+/gi;

interface PriceMention { raw: string; amount: number }

/** Currency-marked amounts only; bare numbers ("171.5萬家") are not prices. */
export function findPriceMentions(text: string): PriceMention[] {
  const out: PriceMention[] = [];
  const seen = new Set<string>();
  const push = (raw: string, numeric: string, wan: boolean) => {
    const n = Number(numeric.replace(/,/g, ""));
    if (!Number.isFinite(n)) return;
    const amount = Math.round(wan ? n * 10_000 : n);
    const key = `${raw}@${amount}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ raw, amount });
  };
  const patterns: Array<[RegExp, number, boolean | ((m: RegExpExecArray) => boolean)]> = [
    // NT$1,065 · NT$ 18,000 · NTD 999
    [/(?:NT\$|NTD\s?|TWD\s?)\s?([\d,]+(?:\.\d+)?)(\s?萬)?/gi, 1, (m) => Boolean(m[2])],
    // 新台幣 5 萬元 · 台幣999元
    [/(?:新台幣|台幣)\s?([\d,]+(?:\.\d+)?)\s?(萬)?\s?元?/g, 1, (m) => Boolean(m[2])],
    // 999 元 · 10 萬元  (requires 元)
    [/(?<![\w$.])([\d,]+(?:\.\d+)?)\s?(萬)?\s?元/g, 1, (m) => Boolean(m[2])],
    // $1,065 (not preceded by NT)
    [/(?<!NT)\$\s?([\d,]+(?:\.\d{1,2})?)/g, 1, false],
  ];
  for (const [re, group, wanFlag] of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const wan = typeof wanFlag === "function" ? wanFlag(m) : wanFlag;
      if (m[group] !== undefined) push(m[0].trim(), m[group], wan);
    }
  }
  return out;
}

export function findPercentMentions(text: string): Array<{ raw: string; value: number }> {
  const out: Array<{ raw: string; value: number }> = [];
  const re = /(\d+(?:\.\d+)?)\s?(%|％)|百分之\s?(\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const value = Number(m[1] ?? m[3]);
    if (Number.isFinite(value)) out.push({ raw: m[0], value });
  }
  return out;
}

function hasDisclosure(text: string, pack: PolicyPack): boolean {
  return pack.disclosurePatterns.some((re) => re.test(text));
}

const claimRules = (ctx: ComplianceContext): Array<[RegExp, string]> => [
  ...ctx.pack.claimReplacements,
  ...(ctx.extraClaims ?? []),
];

/** A plain term from the wording table as a matcher: word-bounded and case-insensitive for Latin terms. */
export function termPattern(term: string): RegExp {
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return /^[\x00-\x7F]+$/.test(term) ? new RegExp(`\\b${escaped}\\b`, "gi") : new RegExp(escaped, "g");
}

export function applySwaps(text: string, ctx: ComplianceContext): { text: string; applied: Array<{ from: string; to: string }> } {
  const applied: Array<{ from: string; to: string }> = [];
  let out = text;
  for (const [from, to] of ctx.swaps ?? []) {
    const re = termPattern(from);
    if (re.test(out)) {
      out = out.replace(termPattern(from), to);
      applied.push({ from, to });
    }
  }
  return { text: out, applied };
}

function claimHits(text: string, ctx: ComplianceContext): string[] {
  const hits: string[] = [];
  for (const [re] of claimRules(ctx)) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const matches = text.match(new RegExp(re.source, flags));
    if (matches) hits.push(...matches);
  }
  return [...new Set(hits.map((h) => h.trim()).filter(Boolean))];
}

function competitorHits(text: string, pack: PolicyPack): string[] {
  const lower = text.toLowerCase();
  return pack.competitorNames.filter((name) => lower.includes(name.toLowerCase()));
}

function foreignUrls(text: string, trackedLink: string): string[] {
  return (text.match(URL_RE) ?? []).filter((u) => !u.startsWith(trackedLink));
}

const approxEqual = (a: number, b: number) => Math.abs(a - b) < 0.05;

/**
 * Percent mentions with no approved source in their paragraph. A value only
 * counts as sourced when the same line mentions one of that fact's anchors.
 */
function unsourcedPercents(text: string, ctx: ComplianceContext): Array<{ raw: string; value: number; line: string }> {
  const out: Array<{ raw: string; value: number; line: string }> = [];
  for (const line of text.split("\n")) {
    const lower = line.toLowerCase();
    for (const m of findPercentMentions(line)) {
      const sourced = ctx.approvedPercents.some(
        (p) => approxEqual(p.value, m.value) && p.anchors.some((a) => lower.includes(a.toLowerCase())),
      );
      if (!sourced) out.push({ ...m, line });
    }
  }
  return out;
}

// ── validate ────────────────────────────────────────────────────────────────

export function findIssues(caption: string, ctx: ComplianceContext): ComplianceIssue[] {
  const { pack } = ctx;
  const issues: ComplianceIssue[] = [];

  if (!hasDisclosure(caption, pack)) {
    issues.push({ rule: "disclosure", detail: "No employment disclosure in the post.", evidence: [] });
  }

  const badPrices = findPriceMentions(caption).filter(
    (p) => !ctx.approvedAmounts.some((a) => a === p.amount),
  );
  if (badPrices.length) {
    issues.push({
      rule: "price",
      detail: `Price not on the approved list: ${badPrices.map((p) => p.raw).join(", ")}`,
      evidence: badPrices.map((p) => p.raw),
    });
  }

  const claims = claimHits(caption, ctx);
  if (claims.length) {
    issues.push({ rule: "claims", detail: `Absolute or guaranteed wording: ${claims.join(", ")}`, evidence: claims });
  }

  const badStats = unsourcedPercents(caption, ctx);
  if (badStats.length) {
    issues.push({
      rule: "evidence",
      detail: `Statistic without an approved source: ${badStats.map((s) => s.raw).join(", ")}`,
      evidence: badStats.map((s) => s.raw),
    });
  }

  const competitors = competitorHits(caption, pack);
  if (competitors.length) {
    issues.push({ rule: "competitors", detail: `Names a competitor: ${competitors.join(", ")}`, evidence: competitors });
  }

  const urls = foreignUrls(caption, ctx.trackedLink);
  if (!caption.includes(ctx.trackedLink) || urls.length) {
    issues.push({
      rule: "link",
      detail: urls.length ? `Untracked link: ${urls.join(", ")}` : "Tracked link missing.",
      evidence: urls,
    });
  }

  return issues;
}

/** Plain-language list for the retry prompt. */
export function describeIssuesForRetry(issues: ComplianceIssue[], ctx: ComplianceContext): string {
  const zh = ctx.pack.language === "zh-TW";
  const head = zh ? "上一版違反公司社群政策，請修正後重寫：" : "The previous draft broke company social-media policy. Rewrite it and fix:";
  return [head, ...issues.map((i, n) => `${n + 1}. [${i.rule}] ${i.detail}`)].join("\n");
}

// ── repair ──────────────────────────────────────────────────────────────────

function dropSegments(text: string, shouldDrop: (segment: string) => boolean): { text: string; dropped: string[] } {
  const dropped: string[] = [];
  const lines = text.split("\n").map((line) => {
    // Sentence = text up to CJK/!? punctuation or a period followed by space
    // (so "7.4%" and URLs stay intact); trailing whitespace stays attached so
    // joining with "" preserves the original spacing.
    // CJK clauses also break at ，/；so one bad clause doesn't take the whole
    // Chinese sentence with it (English commas stay inside their sentence).
    const parts = (line.match(/.*?(?:[。！？!?；，]+|\.(?=\s|$)|$)\s*/g) ?? [line]).filter(Boolean);
    const kept = parts.filter((p) => {
      if (p.trim() && shouldDrop(p)) {
        dropped.push(p.trim());
        return false;
      }
      return true;
    });
    return kept.join("").trimEnd();
  });
  return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), dropped };
}

export interface RepairResult {
  text: string;
  fixes: Partial<Record<RuleId, string>>;
}

export function repairPost(caption: string, ctx: ComplianceContext): RepairResult {
  const { pack } = ctx;
  const fixes: Partial<Record<RuleId, string>> = {};
  let text = caption;

  // claims first — "100%" is both a claim and an unsourced statistic.
  const claims = claimHits(text, ctx);
  if (claims.length) {
    for (const [re, replacement] of claimRules(ctx)) {
      const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
      text = text.replace(new RegExp(re.source, flags), replacement);
    }
    fixes.claims = `Softened: ${claims.join(", ")}`;
  }

  const unapprovedPrice = (seg: string) => findPriceMentions(seg).some((p) => !ctx.approvedAmounts.includes(p.amount));
  if (unapprovedPrice(text)) {
    // Splicing a pointer into the middle of "Only $299/month" reads badly, so
    // the whole sentence goes and one pointer line takes its place.
    const r = dropSegments(text, unapprovedPrice);
    text = `${r.text}\n${pack.priceFallback}`;
    fixes.price = `Removed unapproved price (“${r.dropped.join(" ")}”) and pointed to the official price list`;
  }

  const unsourced = unsourcedPercents(text, ctx);
  if (unsourced.length) {
    // Anchors are judged per paragraph, but only the sentence carrying the
    // unsourced number is removed.
    const r = dropSegments(text, (seg) => unsourced.some((u) => seg.includes(u.raw) && u.line.includes(seg.trim())));
    text = r.text;
    fixes.evidence = `Removed unsourced statistic: “${r.dropped.join(" ")}”`;
  }

  const competitors = competitorHits(text, pack);
  if (competitors.length) {
    const r = dropSegments(text, (seg) => competitorHits(seg, pack).length > 0);
    text = r.text;
    fixes.competitors = `Removed competitor comparison (${competitors.join(", ")})`;
  }

  const urls = foreignUrls(text, ctx.trackedLink);
  if (urls.length) {
    for (const u of urls) text = text.split(u).join(ctx.trackedLink);
    fixes.link = `Replaced untracked link with the rep's tracked link`;
  }
  // Collapse duplicates the replacement may have created, then ensure one link.
  const linkCount = text.split(ctx.trackedLink).length - 1;
  if (linkCount > 1) {
    let seen = false;
    text = text.split(ctx.trackedLink).reduce((acc, part, i) => {
      if (i === 0) return part;
      if (!seen) { seen = true; return acc + ctx.trackedLink + part; }
      return acc + part;
    }, "");
  }
  if (!text.includes(ctx.trackedLink)) {
    text = `${text.trimEnd()}\n\n${ctx.trackedLink}`;
    fixes.link = fixes.link ?? "Added the rep's tracked link";
  }

  if (!hasDisclosure(text, pack)) {
    // US: FTC wants it where readers see it before "…see more", so lead with it.
    // TW: a closing note is the local convention, and inserting before the link
    // would split a sentence when the rep wrote the link inline.
    text = pack.market === "US"
      ? `${pack.disclosureLine}\n\n${text}`
      : `${text.trimEnd()}\n${pack.disclosureLine}`;
    fixes.disclosure = `Added disclosure: “${pack.disclosureLine}”`;
  }

  return { text: text.replace(/[ \t]+\n/g, "\n").trim(), fixes };
}

// ── report ──────────────────────────────────────────────────────────────────

export function buildReport(args: {
  ctx: ComplianceContext;
  firstDraftIssues: ComplianceIssue[];
  afterRetryIssues: ComplianceIssue[];
  finalIssues: ComplianceIssue[];
  fixes: Partial<Record<RuleId, string>>;
  attempts: number;
}): ComplianceReport {
  const { ctx, firstDraftIssues, afterRetryIssues, finalIssues, fixes, attempts } = args;
  const byRule = (list: ComplianceIssue[], rule: RuleId) => list.find((i) => i.rule === rule);

  const checks: ComplianceCheck[] = ctx.pack.rules.map((rule) => {
    const first = byRule(firstDraftIssues, rule.id);
    const final = byRule(finalIssues, rule.id);
    let status: CheckStatus = "pass";
    let detail = "Passed on the first draft.";
    if (final) {
      status = "flagged";
      detail = final.detail;
    } else if (first) {
      status = "fixed";
      const fixedByRetry = !byRule(afterRetryIssues, rule.id);
      detail = fixedByRetry
        ? `${first.detail} → rewritten by the AI writer after policy feedback.`
        : `${first.detail} → ${fixes[rule.id] ?? "removed together with the clause that contained it."}`;
    }
    return { rule: rule.id, title: rule.title, legalRef: rule.legalRef, status, detail };
  });

  return {
    packId: ctx.pack.id,
    packName: ctx.pack.name,
    market: ctx.pack.market,
    verdict: finalIssues.length ? "needs_review" : firstDraftIssues.length ? "auto_fixed" : "clean",
    issuesCaught: firstDraftIssues.length,
    attempts,
    checks,
  };
}
