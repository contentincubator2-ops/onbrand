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
  [key: string]: unknown;
}

export interface StrategyPrivateTerm {
  value?: unknown;
  replacement: { en: string; zh: string };
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
  outputType: "report";
  presentation: "strategy-report";
}

const resolvedPolicies: ResolvedIgStrategyPublicPolicy[] = ALL_99S_SQUADS
  .filter((entry): entry is SquadIndexEntry & { publicOutput: SquadPublicOutputPolicy } =>
    entry.platform === "instagram" && entry.publicOutput?.presentation === "strategy-report")
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

function publicTaskLabel(entry: SquadIndexEntry, isZhTW: boolean): string {
  return typeof entry.label === "string" ? entry.label : (isZhTW ? entry.label.zh : entry.label.en);
}

/** Persistence fields are server-owned so other squads cannot opt themselves into report mode. */
export function getIgStrategyRecordOverrides(
  idOrSlug: string,
  isZhTW = true,
): IgStrategyRecordOverrides | null {
  const resolved = getIgStrategyPublicPolicy(idOrSlug);
  if (!resolved) return null;
  return {
    taskId: resolved.entry.id,
    taskLabel: publicTaskLabel(resolved.entry, isZhTW),
    workspace: "instagram",
    platform: "instagram",
    outputType: "report",
    presentation: "strategy-report",
  };
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function publicSectionLabel(
  policy: SquadPublicOutputPolicy,
  stepIndex: number,
  isZhTW: boolean,
): string {
  const localized = policy.sectionLabels[stepIndex];
  if (localized) return isZhTW ? localized.zh : localized.en;
  return isZhTW ? `策略章節 ${stepIndex + 1}` : `Strategy Section ${stepIndex + 1}`;
}

export function getIgStrategyPublicSectionLabel(
  idOrSlug: string,
  stepIndex: number,
  isZhTW: boolean,
): string | null {
  const resolved = getIgStrategyPublicPolicy(idOrSlug);
  return resolved ? publicSectionLabel(resolved.policy, stepIndex, isZhTW) : null;
}

function replaceExact(text: string, privateTerm: string | null, publicTerm: string): string {
  if (!privateTerm || privateTerm === publicTerm) return text;
  return text.split(privateTerm).join(publicTerm);
}

function replacePrivateTerm(text: string, privateTerm: string | null, publicTerm: string): string {
  if (!privateTerm || privateTerm === publicTerm) return text;
  if (!/[a-z]/i.test(privateTerm)) return replaceExact(text, privateTerm, publicTerm);
  const escaped = privateTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "gi"), publicTerm);
}

function normalizeReportedAudienceMix(text: string): string {
  // Only normalize the unambiguous gendered second person first. If a
  // paragraph still mixes third/second person, rewrite only when an audience
  // noun provides a clear antecedent; otherwise fail closed below.
  const neutralSecondPerson = text
    .replace(/妳們/g, "你們")
    .replace(/妳/g, "你");
  const hasSecondPerson = /你/.test(neutralSecondPerson);
  return neutralSecondPerson
    .split(/(\n{2,})/)
    .map((paragraph) => {
      if (!/[她]/.test(paragraph) || !hasSecondPerson) return paragraph;
      if (/(?:受眾|客群|粉絲|追蹤者|消費者|顧客|讀者)/.test(paragraph)) {
        return paragraph.replace(/她們/g, "這群受眾").replace(/她/g, "受眾");
      }
      if (/(?:創辦人|案例主角|受訪者|女性客戶|團隊成員)[^\n。！？]{0,40}她/.test(paragraph)) {
        return paragraph;
      }
      throw new Error("strategy public perspective validation failed");
    })
    .join("");
}

const INTERNAL_MARKER = /\b(?:squads?|agents?|steps?|owners?)\b|\b(?:output\s*[_-]?\s*(?:types?|kinds?))\b|\b(?:prompt|model|database\s+key)\s*(?:[:：=「])|\b(?:the\s+)?model\s+(?:recommends?|suggests?|generated?|created?)\b|\b(?:this\s+)?prompt\s+(?:generated?|created?|produced?)\b|(?:負責人|提示詞|模型|資料庫鍵值)\s*(?:[:：=「])|(?:我是\s*|身為你的\s*|I\s*(?:am|'m|’m)\s+|As your\s+)[^\n。.!?]{0,80}(?:策略顧問|策略師|strategist|consultant)/i;

function sanitizeSystemPrefaces(text: string, isZhTW: boolean): string {
  const sectionWord = isZhTW ? "章節" : "Section";
  const sectionSeparator = isZhTW ? "：" : ":";
  const deliverableWord = isZhTW ? "交付項目" : "deliverable";
  const normalized = text
    .split("\n")
    .filter((line) => !/^\s*(?:#{1,6}\s*)?(?:(?:the\s+)?(?:squad|agent|strategy team)\s+(?:prepared|generated|created)|(?:the\s+)?model\s+(?:recommends?|suggests?|generated?|created?)|(?:this\s+)?prompt\s+(?:generated?|created?|produced?)|(?:我是\s*|身為你的\s*|I\s*(?:am|'m|’m)\s+|As your\s+)[^\n。.!?]{0,80}(?:策略顧問|策略師|strategist|consultant)|(?:squad|agent|owner|prompt|model|database\s+key|負責人|提示詞|模型|資料庫鍵值)\s*(?:[:：=「]|$))/i.test(line))
    .join("\n")
    .replace(/(?:^|\n)\s*(?:我是\s*|身為你的\s*|I\s*(?:am|'m|’m)\s+|As your\s+)[^\n。.!?]{0,80}(?:策略顧問|策略師|strategist|consultant)[^\n。.!?]*[。.!]?/gi, "\n")
    .replace(/(?:^|\n)\s*(?:internal\s+)?step\s*(\d+)\s*[:：-]?/gi, (_match, n) => `\n${sectionWord} ${n}${sectionSeparator}`)
    .replace(/\boutput\s*[_-]?\s*(?:types?|kinds?)\b/gi, deliverableWord)
    .replace(/(?:以下是(?:本(?:步驟|階段))?(?:的)?產出|here(?:'s| is) (?:the )?output)\s*[:：]?\s*/gi, "")
    .replace(/(?:^|\n)\s*(?:我是\s*|I am\s+)(?:the\s+)?(?:策略團隊|strategy team)[^\n。.!?]*[。.!]?/gi, "\n");
  if (isZhTW) {
    return normalized
      .replace(/下一個\s+step\b\s*/gi, "下一個章節")
      .replace(/\b(?:squads?|agents?)\b/gi, "策略團隊")
      .replace(/\bsteps?\b/gi, "行動")
      .replace(/\bowners?\b/gi, "執行角色")
      .replace(/負責人/g, "執行角色");
  }
  return normalized
    .replace(/\bnext\s+step\b\s*/gi, "next section ")
    .replace(/\bsquads?\b/gi, (word) => /s$/i.test(word) ? "strategy teams" : "strategy team")
    .replace(/\bagents?\b/gi, (word) => /s$/i.test(word) ? "strategy teams" : "strategy team")
    .replace(/\bsteps?\b/gi, (word) => /s$/i.test(word) ? "actions" : "action")
    .replace(/\bowners?\b/gi, (word) => /s$/i.test(word) ? "responsible roles" : "responsible role")
    .replace(/負責人/g, "responsible role");
}

export function findIgStrategyInternalLeaks(
  text: string,
  privateTerms: readonly StrategyPrivateTerm[] = [],
): string[] {
  const leaks: string[] = [];
  if (INTERNAL_MARKER.test(text)) leaks.push("internal-marker");
  for (const term of privateTerms) {
    const value = textValue(term.value);
    if (value && text.toLocaleLowerCase().includes(value.toLocaleLowerCase())) leaks.push("private-term");
  }
  return [...new Set(leaks)];
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
    isZhTW?: boolean;
    privateTerms?: readonly StrategyPrivateTerm[];
  },
): T {
  const resolved = getIgStrategyPublicPolicy(idOrSlug);
  if (!resolved) return variant;

  const isZhTW = context.isZhTW ?? true;
  const label = publicSectionLabel(resolved.policy, context.stepIndex, isZhTW);
  let caption = variant.caption;

  // Replace every known step name/key from this run, not only the current one:
  // downstream steps receive upstream artifacts and can repeat their private key.
  context.steps.forEach((step, index) => {
    const replacement = publicSectionLabel(resolved.policy, index, isZhTW);
    caption = replaceExact(caption, textValue(step.name), replacement);
    caption = replaceExact(caption, textValue(step.title), replacement);
    caption = replaceExact(caption, textValue(step.outputType), replacement);
    caption = replaceExact(caption, textValue(step.outputKind), replacement);
    caption = caption.split(`\`${replacement}\``).join(replacement);
  });

  const strategyAliasTerms: StrategyPrivateTerm[] = (resolved.policy.privateAliases ?? []).map((value) => ({
    value,
    replacement: { zh: "策略方法", en: "strategy approach" },
  }));
  const privateTerms = [...(context.privateTerms ?? []), ...strategyAliasTerms];
  for (const term of privateTerms) {
    caption = replacePrivateTerm(
      caption,
      textValue(term.value),
      isZhTW ? term.replacement.zh : term.replacement.en,
    );
  }

  const deliverablePrefix = isZhTW ? "交付項目：" : "Deliverable: ";
  caption = caption
    .replace(/\b(?:outputType|output_type|outputKind|output_kind)\s*[:=：]\s*/gi, deliverablePrefix)
    .replace(/\s*條目已建置\s*[:：]?\s*/g, "：")
    .replace(/[：:]\s*[：:]+/g, "：");
  caption = sanitizeSystemPrefaces(caption, isZhTW);
  caption = normalizeReportedAudienceMix(caption).trim();

  if (findIgStrategyInternalLeaks(caption, privateTerms).length > 0) {
    throw new Error("strategy public output validation failed");
  }

  return { ...variant, label, caption };
}

export function buildIgStrategyPublicPromptRules(sectionLabel: string, isZhTW = true): string {
  if (!isZhTW) {
    return `
[PUBLIC STRATEGY REPORT OUTPUT RULES — HIGHEST PRIORITY]
This is the customer-facing strategy report section “${sectionLabel}”.
▸ Return only publishable strategy content. Never expose or explain internal workflow.
▸ Never output Squad, step, agent, owner, outputType, outputKind, database keys, model, or prompt details.
▸ Refer to the target audience as “the audience” and address the reader consistently as “you”.
▸ Use methodology only for internal reasoning. Never use its name or a code variable as a heading, section name, or data status.
▸ Start with the content. Do not add system-style prefaces such as “I am…”, “created”, or “here is the output”.`;
  }
  return `
【公開策略報告輸出規則 — 最高優先】
這是直接給客戶看的策略報告章節「${sectionLabel}」。
▸ 只輸出可直接閱讀的策略內容，不得輸出或解釋內部工作流程。
▸ 不得輸出 Squad、step、agent、負責人、outputType、outputKind、資料庫鍵值、模型或 prompt。
▸ 談目標客群時使用「受眾」；直接稱呼讀者時只使用中性的「你」，不得混用「她／妳」。
▸ 方法論只作內部思考，不得把方法論名稱或程式變數當標題、章節名或資料狀態。
▸ 直接從內容開始，不要寫「我是…」「已建置」「以下是產出」等系統式前言。`;
}
