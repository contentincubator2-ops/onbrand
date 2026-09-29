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
import { WEBSITE_30S_TASKS } from "./quickTaskWebsite";
import { X_30S_TASKS } from "./quickTaskX";
import { type TaskSource } from "./taskSource";
import { sourceForTemplate } from "./craftSource";
import { taskCardAddedAt } from "./taskCardDates";

/** 前端 channel 列使用的平台代號。 */
export type CatalogPlatform =
  | "facebook" | "instagram" | "youtube" | "tiktok" | "linkedin"
  | "email" | "pr" | "brand" | "audience" | "kol"
  // 2026-08-29：品牌自己的官網（部落格長文 / 品牌專欄 / 案例 / 產品頁）。
  // 在這之前官網內容只能硬塞進 pr- 或 br-，然後拿到新聞稿版型。
  | "website"
  // 2026-09-10 (CJ「補上 X 通路」)：X（原 Twitter）。mockup twitter:tweet /
  // twitter:thread 早就實作註冊了，這次補的是 server 端的任務定義。
  // 代號用 "x" 而不是 "twitter" —— 平台自己已經改名，而 mockup 那側的
  // "twitter:" 前綴屬於顯示層的既有 key，不動它（改名要付 migration 的錢）。
  | "x"
  // 2026-09-29 (CJ「要為了台灣市場加入 LINE 和 Threads」)：目前只有品牌自建卡
  // （brandTaskCards），全域目錄還沒有這兩個通路的卡。
  | "threads" | "line"
  // 2026-08-29：素材與規劃型頻道，目前只由品牌任務包使用，全域目錄沒有卡。
  //   case     — 案例庫（查找 / 去重 / 提報），持續累積的素材
  //   calendar — 內容行事曆（產出當月各類型的篇數與摘要）
  // 兩者都刻意獨立於「月報」：月報是把它們整理出來的產物，不是它們的容器。
  | "case"
  | "calendar";

export interface CatalogTask {
  id: string;
  platform: CatalogPlatform;
  tier: string;
  postType: string;
  labelZh: string;
  labelEn: string;
  /**
   * 2026-09-05 — 這張卡的結構來源分類。永遠有值（未標記者回 evergreen），
   * 所以 client 不必自己補預設。定義見 taskSource.ts。
   */
  source: TaskSource;
  /**
   * 2026-09-08 — 上架日（YYYY-MM-DD），id 第一次進 git 的日期，由
   * scripts/gen-task-card-dates.ts 產生。目錄卡一定有值（drift test 鎖住）；
   * 型別留 null 是給自建卡那條路走的。
   */
  addedAt: string | null;
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
  if (id.startsWith("web-")) return "website";
  if (id.startsWith("x-")) return "x";
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
    // 未標記的卡一律回長青公式 —— 前台永遠拿得到一個值，不必自己補預設。
    source: sourceForTemplate(t),
    addedAt: taskCardAddedAt(String(t.id)),
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

  // 30s（90s 層已於 2026-07-20 整層退役，2026-09-07 連空索引一併移除）
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
  for (const t of WEBSITE_30S_TASKS) out.push(toTask(t, "website", "30s"));
  for (const t of X_30S_TASKS) out.push(toTask(t, "x", "30s"));

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

/**
 * 最近 `days` 天內上架的目錄卡，新到舊。「本月新卡」與通知都走這裡，
 * 所以「新」的定義只有一個。
 */
export function recentCatalogCards(days: number, now: Date = new Date()): CatalogTask[] {
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  return buildTaskCatalogIndex()
    .filter((t) => !!t.addedAt && t.addedAt >= cutoff && t.addedAt <= today)
    .sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""));
}
