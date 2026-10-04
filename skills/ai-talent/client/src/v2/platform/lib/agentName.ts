/**
 * agentName — 英文介面上「人」的顯示格式（2026-10-04 CJ：英文版要同時看得到英文名與中文原名）。
 *
 * 英文介面：「English Name (中文原名)」；位置緊的地方用 agentShortName 只放英文名，
 * 並把 agentLabel 放進 title/aria-label，中文原名一定點得到。職稱英文介面只放英文職稱
 * （沒有英文職稱就退回原文，不自己翻）。中文介面完全不變。
 * server 端 nameEn / titleEn 來自 platform/core/agents/agentEnglish.ts。
 */
export interface AgentNameFields {
  name?: string | null;
  nameEn?: string | null;
  title?: string | null;
  titleEn?: string | null;
}

type Lang = string | undefined;

const CJK = /[㐀-鿿]/;
const clean = (s: unknown) => String(s ?? "").trim();

/** 英文名；只有英文介面、有英文名、且跟原名不同才回傳，否則空字串。 */
function englishNameOf(a: AgentNameFields | null | undefined, lang: Lang): string {
  if (lang !== "en" || !a) return "";
  const en = clean(a.nameEn);
  return en && en !== clean(a.name) ? en : "";
}

/** 完整標籤：英文介面「English (中文)」；原名本來就是英文、或沒有英文名就只給原名。 */
export function agentLabel(a: AgentNameFields | null | undefined, lang: Lang): string {
  if (!a) return "";
  const name = clean(a.name);
  const en = englishNameOf(a, lang);
  if (!en) return name;
  return CJK.test(name) ? `${en} (${name})` : en;
}

/** 短名：英文介面只放英文名（沒有就原名）；中文介面原名。完整版放 title / aria-label。 */
export function agentShortName(a: AgentNameFields | null | undefined, lang: Lang): string {
  if (!a) return "";
  return englishNameOf(a, lang) || clean(a.name);
}

/** 職稱：英文介面只放英文職稱，沒有就退回原文。 */
export function agentTitle(a: AgentNameFields | null | undefined, lang: Lang): string {
  if (!a) return "";
  return lang === "en" && clean(a.titleEn) ? clean(a.titleEn) : clean(a.title);
}

/** tooltip：完整名字＋原文職稱（中文介面不需要，回傳 undefined）。 */
export function agentTooltip(a: AgentNameFields | null | undefined, lang: Lang): string | undefined {
  if (lang !== "en" || !a) return undefined;
  const t = clean(a.title);
  const label = agentLabel(a, lang);
  return t && CJK.test(t) ? `${label} · ${t}` : label || undefined;
}
