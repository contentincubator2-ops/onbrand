/**
 * 任務卡英文旁路（client 鏡像 server/content/core/catalog/en/types.ts 的 TaskEn）。
 * 目錄存中文；server 在 list／cardDetail 附上 `en`。英文介面優先用英文，
 * 沒有就退回中文，絕不回傳空字串。
 */
export interface TaskEn {
  question?: string;
  placeholder?: string;
  inputs?: Record<string, { label?: string; placeholder?: string }>;
  source?: { short?: string; metric?: string; caveat?: string; takeaway?: string };
}

type WithEn = { en?: TaskEn | null } | null | undefined;
const isEn = (lang: string) => lang === "en";
const pick = (en: string | undefined | null, zh: string): string => (en && en.trim() ? en : zh);

export function taskQuestion<T extends string | null | undefined>(task: WithEn, zh: T, lang: string): T | string {
  if (!isEn(lang) || !zh) return zh;
  return pick(task?.en?.question, zh);
}

export function taskPlaceholder(task: WithEn, zh: string | undefined, lang: string): string {
  const z = zh ?? "";
  return isEn(lang) ? pick(task?.en?.placeholder, z) : z;
}

export function taskInputText(
  task: WithEn, key: string, field: "label" | "placeholder", zh: string, lang: string,
): string {
  return isEn(lang) ? pick(task?.en?.inputs?.[key]?.[field], zh) : zh;
}

/** 把 source 的 short／metric／caveat／takeaway 換成英文（有才換）。 */
export function localizeSource<S extends Record<string, any>>(src: S, task: WithEn, lang: string): S {
  const e = isEn(lang) ? task?.en?.source : undefined;
  if (!e || !src) return src;
  const out: Record<string, any> = { ...src };
  for (const k of ["short", "metric", "caveat", "takeaway"] as const) {
    if (e[k] && e[k]!.trim() && out[k]) out[k] = e[k];
  }
  return out as S;
}
