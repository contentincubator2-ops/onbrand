/**
 * taskCatalogIndex — 「/tasks 頁面實際列得出哪些任務卡」的唯一真相。
 *
 * 2026-08-23 (CJ「要跟著做」——把 FB 那套推到其餘 6 個平台)
 *
 * ── 為什麼需要這個檔案 ─────────────────────────────────────────────────
 * 任務卡分散在 10+ 個 catalog 檔（quickTaskFB / IG / YT / TikTok / LI /
 * Email / PR / Brand / Research / KOL / Multi60 / 100 / 100Squads），而
 * 「哪些會被列出來、算哪個平台」的規則只存在於 quickTaskRouter.listFB 的
 * 函式內部。任何想知道「這個平台有哪些卡」的程式碼——例如 client 那 7 份
 * 手抄的 pill 對照表——只能自己再抄一份，於是就會漂。
 *
 * 這正是 2026-07-20 那個 bug 的成因：90s 退役後 client 的 TASK_FORMAT_MAP
 * 有 11 個 key 指向不存在的任務、16 張 fb-99 卡沒被分類，沒有任何東西會
 * 報錯，使用者只是看到「貼文 pill 只有 3 張」和兩個 pill 整個不見。
 *
 * 所以把「列得出哪些卡」抽成純函式：router 用它，防漂移測試也用它。
 * 兩邊看同一份資料，client 的對照表就再也不能默默漏掉一張卡。
 *
 * ⚠️ 這裡**只管 id / platform / tier / postType / label**。agent 頭像、
 * squad 成員、orchestra config 那些要打 DB 的加值仍然留在 router。
 */

import { listAllFBTasks } from "./quickTaskFB";
import { FB_60S_TASKS_V2 } from "./quickTaskFB60";
import { IG_30S_TASKS } from "./quickTaskIG";
import { IG_60S_TASKS } from "./quickTaskIG60";
import { YT_30S_TASKS } from "./quickTaskYT";
import { YT_60S_TASKS } from "./quickTaskYT60";
import { TT_30S_TASKS } from "./quickTaskTikTok";
import { LI_30S_TASKS } from "./quickTaskLI";
import { EMAIL_30S_TASKS } from "./quickTaskEmail";
import { PR_30S_TASKS } from "./quickTaskPR";
import { BRAND_30S_TASKS } from "./quickTaskBrand";
import { RESEARCH_30S_TASKS } from "./quickTaskResearch";
import { KOL_30S_TASKS } from "./quickTaskKOL";
import { MULTI_60S_TASKS } from "./quickTaskMulti60";
import { ALL_99S_TASKS } from "./quickTask100";
import { ALL_99S_SQUADS } from "./quickTask100Squads";

/** 前端 channel 列使用的平台代號。 */
export type CatalogPlatform =
  | "facebook" | "instagram" | "youtube" | "tiktok" | "linkedin"
  | "email" | "pr" | "brand" | "audience" | "kol";

export interface CatalogTask {
  id: string;
  platform: CatalogPlatform;
  tier: string;
  postType: string;
  labelZh: string;
  labelEn: string;
}

/**
 * 99s orchestra 任務的放行名單。
 *
 * FB / IG 的 99s 原則上走 squad（ALL_99S_SQUADS），只有這幾個是 orchestra
 * 驅動的例外；其他頻道（yt- tt- li- em- pr- br- rs- kl-）因為還沒有 squad，
 * 一律放行。與 quickTaskRouter.listFB 共用同一份，改一處兩邊同步。
 *
 * 2026-05-18 (CJ): fb-99-carousel-5 是唯一走 orchestra 的 FB 多卡輪播。
 */
export const ORCHESTRA_99S_ALLOWLIST = new Set<string>([
  "fb-99-carousel-5",
  "fb-99-serial-3",
  "fb-99-trend-rewrite",
  "fb-99-viral-rewrite",
  "fb-99-testimonial-rewrite",
  "fb-99-30day-calendar",
  "fb-99-monthly-calendar-promo",
  "fb-99-14day-countdown",
]);

/** 99s orchestra 任務是否會被列出來。 */
export function is99sOrchestraListed(id: string): boolean {
  if (ORCHESTRA_99S_ALLOWLIST.has(id)) return true;
  // fb- / ig- 以外的頻道還沒有 squad，orchestra 版本就是它們唯一的 99s
  return !id.startsWith("fb-") && !id.startsWith("ig-");
}

/** id 前綴 → 平台。與 router 的 inference 同一套規則。 */
export function platformOfTaskId(id: string): CatalogPlatform {
  if (id.startsWith("ig-")) return "instagram";
  if (id.startsWith("yt-")) return "youtube";
  if (id.startsWith("tt-")) return "tiktok";
  if (id.startsWith("li-")) return "linkedin";
  if (id.startsWith("em-")) return "email";
  if (id.startsWith("pr-")) return "pr";
  if (id.startsWith("br-")) return "brand";
  if (id.startsWith("rs-")) return "audience";
  if (id.startsWith("kl-")) return "kol";
  return "facebook";
}

function pick(v: unknown, key: "zh" | "en"): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && key in (v as any)) return String((v as any)[key] ?? "");
  return "";
}

function toTask(t: any, platform: CatalogPlatform, tier: string): CatalogTask {
  return {
    id: String(t.id),
    platform,
    tier: String(t.tier ?? tier),
    postType: String(t.postType ?? "feed"),
    labelZh: pick(t.label, "zh"),
    labelEn: pick(t.label, "en"),
  };
}

/**
 * 所有「使用者在 /tasks 底下真的看得到」的任務卡。
 *
 * 不含 media 任務（MEDIA_PHOTO/VIDEO/DOC）—— 它們 isMediaTask:true，直接
 * 導到上傳頁，不吃 pill 分類。
 */
export function buildTaskCatalogIndex(): CatalogTask[] {
  const out: CatalogTask[] = [];

  // 30s + 已退役的 90s（FB_90S_TASK_INDEX 目前是空陣列）
  for (const t of listAllFBTasks()) out.push(toTask(t, "facebook", "30s"));
  for (const t of IG_30S_TASKS) out.push(toTask(t, "instagram", "30s"));
  for (const t of YT_30S_TASKS) out.push(toTask(t, "youtube", "30s"));
  for (const t of TT_30S_TASKS) out.push(toTask(t, "tiktok", "30s"));
  for (const t of LI_30S_TASKS) out.push(toTask(t, "linkedin", "30s"));
  for (const t of EMAIL_30S_TASKS) out.push(toTask(t, "email", "30s"));
  for (const t of PR_30S_TASKS) out.push(toTask(t, "pr", "30s"));
  for (const t of BRAND_30S_TASKS) out.push(toTask(t, "brand", "30s"));
  for (const t of RESEARCH_30S_TASKS) out.push(toTask(t, "audience", "30s"));
  for (const t of KOL_30S_TASKS) out.push(toTask(t, "kol", "30s"));

  // 60s
  for (const t of FB_60S_TASKS_V2) out.push(toTask(t, "facebook", "60s"));
  for (const t of IG_60S_TASKS) out.push(toTask(t, "instagram", "60s"));
  for (const t of YT_60S_TASKS) out.push(toTask(t, "youtube", "60s"));
  for (const t of MULTI_60S_TASKS) out.push(toTask(t, platformOfTaskId(String(t.id)), "60s"));

  // 99s squads（自帶 platform 欄位）
  for (const s of ALL_99S_SQUADS) out.push(toTask(s, s.platform as CatalogPlatform, "99s"));

  // 99s orchestra（放行名單過濾）
  for (const t of ALL_99S_TASKS as any[]) {
    const id = String(t.id);
    if (!is99sOrchestraListed(id)) continue;
    if (out.some((e) => e.id === id)) continue;
    out.push(toTask(t, platformOfTaskId(id), "99s"));
  }

  return out;
}

/** 單一平台的任務卡。 */
export function tasksForPlatform(platform: CatalogPlatform): CatalogTask[] {
  return buildTaskCatalogIndex().filter((t) => t.platform === platform);
}
