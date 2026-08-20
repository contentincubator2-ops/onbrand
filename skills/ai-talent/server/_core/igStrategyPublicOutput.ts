import {
  ALL_99S_SQUADS,
  type SquadIndexEntry,
  type SquadPublicOutputPolicy,
} from "./quickTask100Squads";
import { normalizeTaskId } from "./tierCompat";

export interface StrategyStepDescriptor {
  name?: unknown;
  title?: unknown;
  outputType?: unknown;
  outputKind?: unknown;
}

export interface StrategyPublicVariant {
  label: string;
  caption: string;
  agent?: unknown;
}

export interface StrategyPrivateTerm {
  value?: unknown;
  replacement: { en: string; zh: string };
}

export function buildIgStrategyPrivateTerms(args: {
  squadName?: unknown;
  methodology?: unknown;
  steps?: ReadonlyArray<{ assignedAgentName?: unknown }>;
  artifactAgentNames?: readonly unknown[];
  agents?: ReadonlyArray<{
    name?: unknown;
    title?: unknown;
    specialty?: unknown;
    methodology?: unknown;
  }>;
}): StrategyPrivateTerm[] {
  const terms: StrategyPrivateTerm[] = [];
  const seen = new Set<string>();
  const add = (value: unknown, replacement: StrategyPrivateTerm["replacement"]) => {
    if (typeof value !== "string" || !value.trim()) return;
    const key = value.trim().toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    terms.push({ value: value.trim(), replacement });
  };
  const team = { zh: "內容團隊", en: "content team" };
  const method = { zh: "內容方法", en: "content approach" };
  add(args.squadName, team);
  add(args.methodology, method);
  for (const step of args.steps ?? []) add(step.assignedAgentName, team);
  for (const name of args.artifactAgentNames ?? []) add(name, team);
  for (const agent of args.agents ?? []) {
    add(agent.name, team);
    add(agent.title, team);
    add(agent.specialty, method);
    add(agent.methodology, method);
  }
  return terms;
}

export interface ResolvedIgStrategyPublicPolicy {
  entry: SquadIndexEntry;
  policy: SquadPublicOutputPolicy;
}

export interface IgStrategyRecordOverrides {
  taskId: string;
  taskLabel: string;
  workspace: "instagram";
  platform: "instagram";
  outputType: "post";
}

interface GenericStrategyLocaleCopy {
  reportTitle: string;
  sectionPrefix: string;
}

/**
 * Safe deterministic labels for the output languages exposed by onboarding.
 * Semantic per-squad labels currently exist in zh-TW/en; other languages use
 * a localized generic report/section label instead of leaking an English one.
 */
const GENERIC_STRATEGY_LOCALE_COPY: Record<string, GenericStrategyLocaleCopy> = {
  "zh-cn": { reportTitle: "Instagram 策略报告", sectionPrefix: "策略章节" },
  ja: { reportTitle: "Instagram 戦略レポート", sectionPrefix: "戦略セクション" },
  ko: { reportTitle: "Instagram 전략 보고서", sectionPrefix: "전략 섹션" },
  th: { reportTitle: "รายงานกลยุทธ์ Instagram", sectionPrefix: "ส่วนกลยุทธ์" },
  vi: { reportTitle: "Báo cáo chiến lược Instagram", sectionPrefix: "Phần chiến lược" },
  id: { reportTitle: "Laporan Strategi Instagram", sectionPrefix: "Bagian strategi" },
  ms: { reportTitle: "Laporan Strategi Instagram", sectionPrefix: "Bahagian strategi" },
  de: { reportTitle: "Instagram-Strategiebericht", sectionPrefix: "Strategieabschnitt" },
  fr: { reportTitle: "Rapport stratégique Instagram", sectionPrefix: "Section stratégique" },
  es: { reportTitle: "Informe de estrategia de Instagram", sectionPrefix: "Sección estratégica" },
  pt: { reportTitle: "Relatório de estratégia do Instagram", sectionPrefix: "Seção estratégica" },
  it: { reportTitle: "Report strategico Instagram", sectionPrefix: "Sezione strategica" },
  ru: { reportTitle: "Стратегический отчёт Instagram", sectionPrefix: "Раздел стратегии" },
  ar: { reportTitle: "تقرير استراتيجية إنستغرام", sectionPrefix: "قسم الاستراتيجية" },
  hi: { reportTitle: "Instagram रणनीति रिपोर्ट", sectionPrefix: "रणनीति अनुभाग" },
  bn: { reportTitle: "Instagram কৌশল প্রতিবেদন", sectionPrefix: "কৌশল বিভাগ" },
  ur: { reportTitle: "Instagram حکمتِ عملی رپورٹ", sectionPrefix: "حکمتِ عملی کا حصہ" },
};

function normalizedOutputLanguage(outputLanguage?: string | null): string {
  return (outputLanguage?.trim() || "zh-TW").replace(/_/g, "-").toLowerCase();
}

export function isEnglishOutput(outputLanguage?: string | null): boolean {
  return normalizedOutputLanguage(outputLanguage).split("-")[0] === "en";
}

export function isTraditionalChineseOutput(outputLanguage?: string | null): boolean {
  const language = normalizedOutputLanguage(outputLanguage);
  return language === "zh"
    || language === "zh-tw"
    || language === "zh-hant"
    || language.startsWith("zh-hant-")
    || language === "zh-hk"
    || language === "zh-mo";
}

function genericLocaleCopy(outputLanguage?: string | null): GenericStrategyLocaleCopy | null {
  const language = normalizedOutputLanguage(outputLanguage);
  const baseLanguage = language.split("-")[0] ?? "";
  return GENERIC_STRATEGY_LOCALE_COPY[language]
    ?? GENERIC_STRATEGY_LOCALE_COPY[baseLanguage]
    ?? null;
}

function neutralSectionLabel(stepIndex: number): string {
  return `§${stepIndex + 1}`;
}

const resolvedPolicies: ResolvedIgStrategyPublicPolicy[] = ALL_99S_SQUADS
  .filter((entry): entry is SquadIndexEntry & { publicOutput: SquadPublicOutputPolicy } =>
    entry.platform === "instagram" && entry.publicOutput?.presentation === "ig-public-bundle")
  .map((entry) => ({ entry, policy: entry.publicOutput }));

const policyById = new Map<string, ResolvedIgStrategyPublicPolicy>();
for (const resolved of resolvedPolicies) {
  policyById.set(resolved.entry.id, resolved);
  policyById.set(resolved.entry.squad_slug, resolved);
}

/** Resolve only the explicitly catalogued IG strategy reports. */
export function getIgStrategyPublicPolicy(idOrSlug: string): ResolvedIgStrategyPublicPolicy | null {
  return policyById.get(normalizeTaskId(idOrSlug)) ?? null;
}

/** Resolve a public task id to the DB squad slug used by runSquadAuto. */
export function getIgStrategyExecutionSlug(idOrSlug: string): string {
  return getIgStrategyPublicPolicy(idOrSlug)?.entry.squad_slug ?? normalizeTaskId(idOrSlug);
}

function publicTaskLabel(
  _entry: SquadIndexEntry,
  policy: SquadPublicOutputPolicy,
  outputLanguage: string,
): string {
  if (isTraditionalChineseOutput(outputLanguage)) return policy.publicTitle.zh;
  if (isEnglishOutput(outputLanguage)) return policy.publicTitle.en;
  // No semantic translation is configured for other locales yet. A neutral
  // platform title is safer than reviving the old "strategy report" label.
  return "Instagram Content Deliverables";
}

/** Persistence fields are server-owned so other squads cannot opt themselves into report mode. */
export function getIgStrategyRecordOverrides(
  idOrSlug: string,
  outputLanguage = "zh-TW",
): IgStrategyRecordOverrides | null {
  const resolved = getIgStrategyPublicPolicy(idOrSlug);
  if (!resolved) return null;
  return {
    taskId: resolved.entry.id,
    taskLabel: publicTaskLabel(resolved.entry, resolved.policy, outputLanguage),
    workspace: "instagram",
    platform: "instagram",
    outputType: "post",
  };
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function publicSectionLabel(
  _policy: SquadPublicOutputPolicy,
  stepIndex: number,
  outputLanguage: string,
): string {
  if (isTraditionalChineseOutput(outputLanguage)) return `內容分析 ${stepIndex + 1}`;
  if (isEnglishOutput(outputLanguage)) return `Content Analysis ${stepIndex + 1}`;
  const generic = genericLocaleCopy(outputLanguage);
  if (generic) return `${generic.sectionPrefix} ${stepIndex + 1}`;
  return neutralSectionLabel(stepIndex);
}

export function getIgStrategyPublicSectionLabel(
  idOrSlug: string,
  stepIndex: number,
  outputLanguage = "zh-TW",
): string | null {
  const resolved = getIgStrategyPublicPolicy(idOrSlug);
  return resolved ? publicSectionLabel(resolved.policy, stepIndex, outputLanguage) : null;
}

function replaceExact(text: string, privateTerm: string | null, publicTerm: string): string {
  if (!privateTerm || privateTerm === publicTerm) return text;
  return text.split(privateTerm).join(publicTerm);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Dynamic Latin identities often reappear as hashtags or style tokens with
 * separators removed. Enable compact matching only for two-or-more Latin
 * tokens with a sufficiently long fingerprint, avoiding short-name matches
 * such as `Li Na` → `#Lina`.
 */
function compactPrivateTermPattern(privateTerm: string): string | null {
  const tokens = privateTerm.trim().split(/[\s._'’\-]+/).filter(Boolean);
  if (
    tokens.length < 2 ||
    tokens.some((token) => !/^[A-Za-z0-9]+$/.test(token) || !/[A-Za-z]/.test(token)) ||
    tokens.join("").length < 7
  ) return null;
  const body = tokens.map(escapeRegex).join(String.raw`[\s._'’\-]*`);
  return String.raw`(^|[^A-Za-z0-9])${body}(?=$|[^A-Za-z0-9])`;
}

function replacePrivateTerm(text: string, privateTerm: string | null, publicTerm: string): string {
  if (!privateTerm || privateTerm === publicTerm) return text;
  if (!/[a-z]/i.test(privateTerm)) return replaceExact(text, privateTerm, publicTerm);
  let next = text.replace(new RegExp(escapeRegex(privateTerm), "gi"), () => publicTerm);
  const compactPattern = compactPrivateTermPattern(privateTerm);
  if (compactPattern) {
    next = next.replace(new RegExp(compactPattern, "gi"), (_match, prefix: string) => `${prefix}${publicTerm}`);
  }
  return next;
}

function normalizeReportedAudienceMix(text: string): string {
  // The prompt chooses one reader address from explicit audience context.
  // Keep that choice intact here; deterministic replacement of 妳 → 你 would
  // erase a valid audience-aware decision. This boundary only rejects mixed
  // choices and normalizes an audience-analysis "她" when its antecedent is
  // unambiguous.
  const addressForms = new Set(text.match(/妳們|你們|您|妳|你/g) ?? []);
  if (addressForms.size > 1) {
    throw new Error("strategy public audience address validation failed");
  }

  const hasDirectAddress = addressForms.size === 1;
  return text
    .split(/(\n{2,})/)
    .map((paragraph) => {
      if (!/[她]/.test(paragraph)) return paragraph;
      // Preserve a genuine third-person subject even when the same paragraph
      // also mentions the audience (for example, a founder telling her story).
      if (/(?:創辦人|案例主角|受訪者|女性客戶|團隊成員)[^\n。！？]{0,40}她/.test(paragraph)) {
        return paragraph;
      }
      if (/(?:受眾|客群|粉絲|追蹤者|消費者|顧客|讀者)/.test(paragraph)) {
        return paragraph.replace(/她們/g, "這群受眾").replace(/她/g, "受眾");
      }
      throw new Error("strategy public perspective validation failed");
    })
    .join("");
}

const INTERNAL_LINE_PREFIX = String.raw`(?:^|\n)[^\S\r\n]*(?:(?:#{1,6}|[-*+>]|[0-9]+[.)])[^\S\r\n]*)*`;
const SYSTEM_PREFACE_PREFIX = String.raw`^[^\S\r\n]*(?:(?:#{1,6}|[-*+>]|[0-9]+[.)])[^\S\r\n]*)*`;
const INTERNAL_EMPHASIS_CLOSE = String.raw`(?:\*\*|__)?`;
const INTERNAL_FIELD_SUFFIX = String.raw`[^\S\r\n]*(?:[:：=「])`;
const INTERNAL_MODEL_TOKEN = String.raw`(?:(?:(?:AI|LLM|language|system)[^\S\r\n]+)?model|(?:系統|語言)?模型)`;
const INTERNAL_PROMPT_TOKEN = String.raw`(?:(?:system[^\S\r\n]+)?prompt|(?:系統)?提示詞)`;
const INTERNAL_DATABASE_KEY_TOKEN = String.raw`(?:database[^\S\r\n]+key|database_key|databaseKey|db[^\S\r\n]+key|資料庫鍵值)`;
const INTERNAL_NARRATIVE_VERBS = String.raw`(?:recommends?|suggests?|generated?|created?|produced?)`;

const INTERNAL_MARKER = new RegExp([
  String.raw`\b(?:squads?|agents?|steps?|owners?)\b`,
  String.raw`\b(?:output\s*[_-]?\s*(?:types?|kinds?))\b`,
  String.raw`\b(?:database[^\S\r\n]+key|database_key|databaseKey|db[^\S\r\n]+key)${INTERNAL_EMPHASIS_CLOSE}${INTERNAL_FIELD_SUFFIX}`,
  String.raw`資料庫鍵值${INTERNAL_EMPHASIS_CLOSE}${INTERNAL_FIELD_SUFFIX}`,
  `${INTERNAL_LINE_PREFIX}${INTERNAL_MODEL_TOKEN}${INTERNAL_EMPHASIS_CLOSE}${INTERNAL_FIELD_SUFFIX}`,
  `${INTERNAL_LINE_PREFIX}${INTERNAL_PROMPT_TOKEN}${INTERNAL_EMPHASIS_CLOSE}${INTERNAL_FIELD_SUFFIX}`,
  String.raw`\b(?:the|this)[^\S\r\n]+model${INTERNAL_EMPHASIS_CLOSE}${INTERNAL_FIELD_SUFFIX}`,
  String.raw`\b(?:AI|LLM|language|system)[^\S\r\n]+model(?:${INTERNAL_EMPHASIS_CLOSE}${INTERNAL_FIELD_SUFFIX}|[^\S\r\n]+${INTERNAL_NARRATIVE_VERBS}\b)`,
  String.raw`\bsystem[^\S\r\n]+prompt(?:${INTERNAL_EMPHASIS_CLOSE}${INTERNAL_FIELD_SUFFIX}|[^\S\r\n]+${INTERNAL_NARRATIVE_VERBS}\b)`,
  String.raw`\b(?:the|this)[^\S\r\n]+model[^\S\r\n]+${INTERNAL_NARRATIVE_VERBS}\b`,
  `${INTERNAL_LINE_PREFIX}${INTERNAL_MODEL_TOKEN}[^\S\r\n]+${INTERNAL_NARRATIVE_VERBS}\\b`,
  String.raw`\b(?:the|this)[^\S\r\n]+prompt[^\S\r\n]+${INTERNAL_NARRATIVE_VERBS}\b`,
  `${INTERNAL_LINE_PREFIX}${INTERNAL_PROMPT_TOKEN}[^\S\r\n]+${INTERNAL_NARRATIVE_VERBS}\\b`,
  String.raw`負責人\s*(?:[:：=「])`,
  String.raw`(?:我是\s*|身為你的\s*|I\s*(?:am|'m|’m)\s+|As your\s+)[^\n。.!?]{0,80}(?:策略顧問|策略師|strategist|consultant)`,
].join("|"), "i");

const SYSTEM_PREFACE_LINE = new RegExp(
  `${SYSTEM_PREFACE_PREFIX}(?:`
    + String.raw`(?:the[^\S\r\n]+)?(?:squad|agent|strategy[^\S\r\n]+team)[^\S\r\n]+(?:prepared|generated|created)`
    + String.raw`|(?:the|this)[^\S\r\n]+model[^\S\r\n]+${INTERNAL_NARRATIVE_VERBS}\b`
    + String.raw`|(?:the|this)[^\S\r\n]+prompt[^\S\r\n]+${INTERNAL_NARRATIVE_VERBS}\b`
    + String.raw`|(?:the|this)[^\S\r\n]+model${INTERNAL_EMPHASIS_CLOSE}${INTERNAL_FIELD_SUFFIX}`
    + String.raw`|(?:(?:the|this|our)[^\S\r\n]+)?(?:AI|LLM|language|system)[^\S\r\n]+model(?:${INTERNAL_EMPHASIS_CLOSE}${INTERNAL_FIELD_SUFFIX}|[^\S\r\n]+${INTERNAL_NARRATIVE_VERBS}\b)`
    + String.raw`|(?:(?:the|this|our)[^\S\r\n]+)?system[^\S\r\n]+prompt(?:${INTERNAL_EMPHASIS_CLOSE}${INTERNAL_FIELD_SUFFIX}|[^\S\r\n]+${INTERNAL_NARRATIVE_VERBS}\b)`
    + `|${INTERNAL_MODEL_TOKEN}(?:${INTERNAL_EMPHASIS_CLOSE}${INTERNAL_FIELD_SUFFIX}|[^\\S\\r\\n]+${INTERNAL_NARRATIVE_VERBS}\\b)`
    + `|${INTERNAL_PROMPT_TOKEN}(?:${INTERNAL_EMPHASIS_CLOSE}${INTERNAL_FIELD_SUFFIX}|[^\\S\\r\\n]+${INTERNAL_NARRATIVE_VERBS}\\b)`
    + `|${INTERNAL_DATABASE_KEY_TOKEN}${INTERNAL_EMPHASIS_CLOSE}${INTERNAL_FIELD_SUFFIX}`
    + String.raw`|(?:squad|agent|owner|負責人)\s*(?:[:：=「]|$)`
    + String.raw`|(?:我是\s*|身為你的\s*|I\s*(?:am|'m|’m)\s+|As your\s+)[^\n。.!?]{0,80}(?:策略顧問|策略師|strategist|consultant)`
    + ")",
  "i",
);

function sanitizeSystemPrefaces(text: string, outputLanguage: string): string {
  const isZh = isTraditionalChineseOutput(outputLanguage);
  const isEnglish = isEnglishOutput(outputLanguage);
  const sectionSeparator = isZh ? "：" : ":";
  const deliverableWord = isZh ? "交付項目" : isEnglish ? "deliverable" : "";
  const normalized = text
    .split("\n")
    .filter((line) => !SYSTEM_PREFACE_LINE.test(line))
    .join("\n")
    .replace(/(?:^|\n)\s*(?:我是\s*|身為你的\s*|I\s*(?:am|'m|’m)\s+|As your\s+)[^\n。.!?]{0,80}(?:策略顧問|策略師|strategist|consultant)[^\n。.!?]*[。.!]?/gi, "\n")
    .replace(/(?:^|\n)\s*(?:internal\s+)?step\s*(\d+)\s*[:：-]?/gi, (_match, n) => {
      const stepIndex = Math.max(0, Number(n) - 1);
      const generic = genericLocaleCopy(outputLanguage);
      const sectionLabel = isZh
        ? `章節 ${n}`
        : isEnglish
          ? `Section ${n}`
          : generic
            ? `${generic.sectionPrefix} ${n}`
            : neutralSectionLabel(stepIndex);
      return `\n${sectionLabel}${sectionSeparator}`;
    })
    .replace(/\boutput\s*[_-]?\s*(?:types?|kinds?)\b/gi, deliverableWord)
    .replace(/(?:以下是(?:本(?:步驟|階段))?(?:的)?產出|here(?:'s| is) (?:the )?output)\s*[:：]?\s*/gi, "")
    .replace(/(?:^|\n)\s*(?:我是\s*|I am\s+)(?:the\s+)?(?:策略團隊|strategy team)[^\n。.!?]*[。.!]?/gi, "\n");
  if (isZh) {
    return normalized
      .replace(/下一個\s+step\b\s*/gi, "下一個章節")
      .replace(/\b(?:squads?|agents?)\b/gi, "策略團隊")
      .replace(/\bsteps?\b/gi, "行動")
      .replace(/\bowners?\b/gi, "執行角色")
      .replace(/負責人/g, "執行角色");
  }
  if (isEnglish) {
    return normalized
      .replace(/\bnext\s+step\b\s*/gi, "next section ")
      .replace(/\bsquads?\b/gi, (word) => /s$/i.test(word) ? "strategy teams" : "strategy team")
      .replace(/\bagents?\b/gi, (word) => /s$/i.test(word) ? "strategy teams" : "strategy team")
      .replace(/\bsteps?\b/gi, (word) => /s$/i.test(word) ? "actions" : "action")
      .replace(/\bowners?\b/gi, (word) => /s$/i.test(word) ? "responsible roles" : "responsible role")
      .replace(/負責人/g, "responsible role");
  }
  // Unknown/non-English locales are validate-only. Do not inject English
  // cleanup words into otherwise localized customer-facing copy.
  return normalized;
}

export function findIgStrategyInternalLeaks(
  text: string,
  privateTerms: readonly StrategyPrivateTerm[] = [],
): string[] {
  const leaks: string[] = [];
  if (INTERNAL_MARKER.test(text)) leaks.push("internal-marker");
  for (const term of privateTerms) {
    const value = textValue(term.value);
    if (!value) continue;
    const exactHit = text.toLocaleLowerCase().includes(value.toLocaleLowerCase());
    const compactPattern = compactPrivateTermPattern(value);
    const compactHit = compactPattern ? new RegExp(compactPattern, "i").test(text) : false;
    if (exactHit || compactHit) leaks.push("private-term");
  }
  return [...new Set(leaks)];
}

/**
 * Final customer-facing caption boundary. The synthesis model receives only
 * redacted conclusions, and its output is still untrusted until this
 * deterministic validator removes known private terms and rejects anything
 * that looks like execution metadata.
 */
export function sanitizeIgStrategyPublicCaption(
  idOrSlug: string,
  rawCaption: string,
  context: {
    steps: readonly StrategyStepDescriptor[];
    outputLanguage?: string;
    privateTerms?: readonly StrategyPrivateTerm[];
  },
): string {
  const resolved = getIgStrategyPublicPolicy(idOrSlug);
  if (!resolved) return rawCaption;

  const outputLanguage = context.outputLanguage ?? "zh-TW";
  const isZh = isTraditionalChineseOutput(outputLanguage);
  const isEnglish = isEnglishOutput(outputLanguage);
  const publicTerm = isZh ? "內容" : isEnglish ? "content" : "§";
  let caption = rawCaption;

  for (const step of context.steps) {
    caption = replacePrivateTerm(caption, textValue(step.name), publicTerm);
    caption = replacePrivateTerm(caption, textValue(step.title), publicTerm);
    caption = replacePrivateTerm(caption, textValue(step.outputType), publicTerm);
    caption = replacePrivateTerm(caption, textValue(step.outputKind), publicTerm);
  }

  const aliasTerms: StrategyPrivateTerm[] = (resolved.policy.privateAliases ?? []).map((value) => ({
    value,
    replacement: { zh: "內容方法", en: "content approach" },
  }));
  const privateTerms = [...(context.privateTerms ?? []), ...aliasTerms];
  if (isZh || isEnglish) {
    for (const term of privateTerms) {
      caption = replacePrivateTerm(
        caption,
        textValue(term.value),
        isZh ? term.replacement.zh : term.replacement.en,
      );
    }
  }

  const deliverablePrefix = isZh ? "內容：" : isEnglish ? "Content: " : "";
  caption = caption
    .replace(/\b(?:outputType|output_type|outputKind|output_kind)\s*[:=：]\s*/gi, deliverablePrefix)
    .replace(/\s*條目已建置\s*[:：]?\s*/g, "：")
    .replace(/[：:]\s*[：:]+/g, "：");
  caption = sanitizeSystemPrefaces(caption, outputLanguage);
  caption = (isZh ? normalizeReportedAudienceMix(caption) : caption).trim();

  if (!caption || findIgStrategyInternalLeaks(caption, privateTerms).length > 0) {
    throw new Error("strategy public output validation failed");
  }
  return caption;
}

/**
 * Redact execution metadata before private analysis conclusions are supplied
 * to the final model. The unredacted artifact remains only in the private DB
 * table; the external model receives content conclusions without names/keys.
 */
export function redactIgStrategySynthesisContext(
  idOrSlug: string,
  rawText: string,
  context: {
    steps: readonly StrategyStepDescriptor[];
    outputLanguage?: string;
    privateTerms?: readonly StrategyPrivateTerm[];
  },
): string {
  const resolved = getIgStrategyPublicPolicy(idOrSlug);
  if (!resolved) return rawText;
  const outputLanguage = context.outputLanguage ?? "zh-TW";
  const isZh = isTraditionalChineseOutput(outputLanguage);
  const isEnglish = isEnglishOutput(outputLanguage);
  const publicTerm = isZh ? "內容" : isEnglish ? "content" : "§";
  let text = rawText;
  for (const step of context.steps) {
    text = replacePrivateTerm(text, textValue(step.name), publicTerm);
    text = replacePrivateTerm(text, textValue(step.title), publicTerm);
    text = replacePrivateTerm(text, textValue(step.outputType), publicTerm);
    text = replacePrivateTerm(text, textValue(step.outputKind), publicTerm);
  }
  const privateTerms = [
    ...(context.privateTerms ?? []),
    ...(resolved.policy.privateAliases ?? []).map((value) => ({
      value,
      replacement: { zh: "內容方法", en: "content approach" },
    })),
  ];
  if (isZh || isEnglish) {
    for (const term of privateTerms) {
      text = replacePrivateTerm(
        text,
        textValue(term.value),
        isZh ? term.replacement.zh : term.replacement.en,
      );
    }
  }
  text = sanitizeSystemPrefaces(text, outputLanguage)
    .replace(/\b(?:outputType|output_type|outputKind|output_kind)\s*[:=：]\s*/gi, "")
    .trim();
  return findIgStrategyInternalLeaks(text, privateTerms).length === 0 ? text : "";
}

/**
 * Convert one internal squad step into a customer-facing report section.
 * Non-target squads return the original object reference unchanged.
 */
export function applyIgStrategyPublicBoundary<T extends StrategyPublicVariant>(
  idOrSlug: string,
  variant: T,
  context: {
    stepIndex: number;
    steps: readonly StrategyStepDescriptor[];
    outputLanguage?: string;
    privateTerms?: readonly StrategyPrivateTerm[];
  },
): T | Omit<T, "agent"> {
  const resolved = getIgStrategyPublicPolicy(idOrSlug);
  if (!resolved) return variant;

  const outputLanguage = context.outputLanguage ?? "zh-TW";
  const label = publicSectionLabel(resolved.policy, context.stepIndex, outputLanguage);
  const caption = sanitizeIgStrategyPublicCaption(idOrSlug, variant.caption, context);

  // Agent identity is execution metadata, not part of the customer-facing
  // report content persisted in mission_outputs.content.
  const { agent: _privateAgent, ...publicVariant } = variant;
  return { ...publicVariant, label, caption };
}

export function buildIgStrategyPublicPromptRules(
  _sectionLabel: string,
  outputLanguage = "zh-TW",
): string {
  if (!isTraditionalChineseOutput(outputLanguage)) {
    const visibleLanguageRule = isEnglishOutput(outputLanguage)
      ? "Write every customer-visible word and heading in English."
      : `Write every customer-visible word and heading in ${outputLanguage}; do not mix in English labels.`;
    return `
[PUBLIC INSTAGRAM CONTENT RULES — HIGHEST PRIORITY]
This is finished Instagram content intended for publishing.
▸ ${visibleLanguageRule}
▸ Return only publishable strategy content. Never expose or explain internal workflow.
▸ Never output Squad, step, agent, owner, outputType, outputKind, database keys, model, or prompt details.
▸ Use neutral, idiomatic audience terms in the output language and address the reader consistently in that same language.
▸ Use methodology only for internal reasoning. Never use its name or a code variable as a heading, section name, or data status.
▸ Start with the content. Do not add system-style prefaces such as “I am…”, “created”, or “here is the output”.`;
  }
  return `
【公開 IG 成品輸出規則 — 最高優先】
這是要直接對受眾發布的 Instagram 內容成品，不是策略報告。
▸ 只輸出可直接發布的貼文內容，不得輸出、摘要或解釋內部策略與工作流程。
▸ 不得輸出 Squad、step、agent、負責人、outputType、outputKind、資料庫鍵值、模型或 prompt。
▸ 先依「任務主題」與注入的目標受眾、溝通情境、品牌語氣，在「您／你／妳／你們／妳們」中選擇最合適的一種讀者稱呼；只在心中判定，不得輸出判定過程。
▸ 選擇原則：明確女性受眾才可用「妳／妳們」，正式專業關係使用「您」，一般個人溝通使用「你」；只有明確對群體共同喊話時才用複數。不得只憑產品品類或刻板印象推測性別，資料不足時使用中性的「你」。
▸ 選定後，直接稱呼讀者時全文只用該一種稱呼，不得混用其他稱呼。談受眾輪廓而非直接對話時使用「受眾」；「她／她們」只能指向文中另一位有明確先行詞的人物，不得代稱正在溝通的讀者。
▸ 方法論只作內部思考，不得把方法論名稱或程式變數當標題、章節名或資料狀態。
▸ 直接從內容開始，不要寫「我是…」「已建置」「以下是產出」等系統式前言。`;
}
