/**
 * agentEnglish — 英文介面上「人」的英文名字與職稱（2026-10-04 CJ：英文版要同時顯示英文名與中文原名）。
 *
 * 原本在 campaignTeam.ts，抽到 platform 層讓所有回傳 agent 的 payload 共用。
 * 只用 mos_db 已有的 englishName / name（純拉丁字）與 englishTitle / title；沒有就給空字串，
 * 畫面退回中文原文，不自己猜拼音。
 */
import localPool from "../../../localDb.js";

const CJK = /[㐀-鿿]/;

/** 只收不含中文的字串；有中文就視為「沒有英文版」。 */
export const latinOnly = (s: unknown): string => (s && !CJK.test(String(s)) ? String(s).trim() : "");

/**
 * mos_db 的 title 欄位多半是英文，但有些夾著中文產業（「Social Media Strategist – 電商 / DTC」）：
 * 夾中文的那一段切掉。純函式。
 */
export function englishTitle(title: string | null | undefined): string {
  const t = String(title ?? "").trim();
  if (!t) return "";
  if (!CJK.test(t)) return t;
  const head = t.split(/\s+[–—-]\s+|｜|\|/)[0]!.trim();
  return CJK.test(head) ? "" : head;
}

export interface AgentEnglish { nameEn: string; titleEn: string }

/** 從一列 agents 資料直接算（呼叫端已經查過那一列時用，不另外查）。 */
export function englishFromRow(r: { name?: unknown; englishName?: unknown; title?: unknown; englishTitle?: unknown } | null | undefined): AgentEnglish {
  if (!r) return { nameEn: "", titleEn: "" };
  return {
    nameEn: latinOnly(r.englishName) || latinOnly(r.name),
    titleEn: englishTitle(r.englishTitle as string) || englishTitle(r.title as string),
  };
}

/** 一次查一批人的英文名字與職稱：id → { nameEn, titleEn }。查不到的不給。 */
export async function englishOf(ids: number[]): Promise<Map<number, AgentEnglish>> {
  const out = new Map<number, AgentEnglish>();
  const list = [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))];
  if (!list.length) return out;
  try {
    const [rows]: any = await localPool.query(`SELECT id, name, englishName, title, englishTitle FROM agents WHERE id IN (?)`, [list]);
    for (const r of rows as any[]) out.set(Number(r.id), englishFromRow(r));
  } catch { /* 查不到就照中文顯示 */ }
  return out;
}

/** 同上，以 slug 查：slug → { nameEn, titleEn }。 */
export async function englishOfSlugs(slugs: string[]): Promise<Map<string, AgentEnglish>> {
  const out = new Map<string, AgentEnglish>();
  const list = [...new Set(slugs.filter(Boolean))];
  if (!list.length) return out;
  try {
    const [rows]: any = await localPool.query(`SELECT slug, name, englishName, title, englishTitle FROM agents WHERE slug IN (?)`, [list]);
    for (const r of rows as any[]) out.set(String(r.slug), englishFromRow(r));
  } catch { /* 查不到就照中文顯示 */ }
  return out;
}

/** 批次替一串帶 id 的 agent 物件補上 nameEn / titleEn（一次查詢）。 */
export async function attachEnglish<T extends { id: number }>(list: T[]): Promise<Array<T & AgentEnglish>> {
  const en = await englishOf(list.map((a) => a.id));
  return list.map((a) => ({ ...a, nameEn: en.get(a.id)?.nameEn ?? "", titleEn: en.get(a.id)?.titleEn ?? "" }));
}
