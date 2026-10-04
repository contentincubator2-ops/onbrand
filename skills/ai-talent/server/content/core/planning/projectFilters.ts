/**
 * projectFilters — /projects 專案頁的篩選、分面計數與分頁。2026-10-02。
 *
 * CJ「難以按照平台、做到哪裡、自己常用的任務，看執行過的專案」。在這之前：
 *   · 伺服器最多回 60 筆、頁面只畫 18 張，舊產出無論怎麼篩都找不到；
 *   · 篩選只有品牌（全站已鎖品牌，等於沒用）、族群（策略工作台已刪，永遠空）；
 *   · 「做到哪裡」散在四處：mission_outputs.progress / .status、
 *     scheduled_posts、planned_slots.outputId，頁面一個都沒讀。
 *
 * 做法：router 撈「輕量索引列」（不含 content），這裡做篩選＋分面＋分頁。
 * 每次執行仍是一張卡（CJ 2026-10-02：多次執行分成多張，可各自刪除）。
 *
 * 分面計數的規則：某一面的數字＝套用「其他所有條件」後的結果，
 * 所以點下去看到的張數一定等於 chip 上的數字。
 */
import { normalizeTaskId } from "../../../platform/core/tierCompat";

/** 前台保留的七個通路（planGate 2026-09-29），順序即篩選列順序。 */
export const PROJECT_PLATFORMS = ["facebook", "instagram", "threads", "line", "tiktok", "email", "website"] as const;
export type ProjectPlatform = (typeof PROJECT_PLATFORMS)[number] | "other";

/** 進度線：由前到後。 */
export const PROJECT_STAGES = ["generating", "failed", "draft", "planned", "scheduled", "published"] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export type ProjectPeriod = "7d" | "30d" | "older";

/** 生成中超過這麼久還沒收尾，就當背景接續已經掛了——文案仍可用，歸草稿。 */
const STALE_GENERATING_MS = 30 * 60_000;

export interface ProjectIndexRow {
  id: number;                    // mission_outputs.id
  missionId: number;
  title: string | null;
  workspace: string | null;
  brandId: number | null;
  brandName: string | null;
  createdAt: Date | string;
  taskId: string | null;         // 已 normalize
  taskLabel: string | null;      // missions.title（建立 mission 時寫的是任務卡名稱）
  taskLabelEn?: string | null;   // 目錄裡的英文卡名（查得到才有），英文介面優先顯示
  productId: number | null;
  productName: string | null;
  progress: string | null;       // caption_ready / done / failed
  status: string | null;         // mission_outputs.status
  spPublished: number | boolean | null;
  spPending: number | boolean | null;
  inPlanner: number | boolean | null;
  thumbnailUrl?: string | null;
}

export interface ProjectFilterInput {
  platform?: string | null;
  stage?: ProjectStage | null;
  taskId?: string | null;
  productId?: number | null;
  period?: ProjectPeriod | null;
  q?: string | null;
  sort?: "new" | "old";
  offset?: number;
  limit?: number;
}

export function platformOf(workspace: string | null | undefined): ProjectPlatform {
  const w = (workspace ?? "").toLowerCase();
  return (PROJECT_PLATFORMS as readonly string[]).includes(w) ? (w as ProjectPlatform) : "other";
}

export function stageOf(r: Pick<ProjectIndexRow, "progress" | "status" | "spPublished" | "spPending" | "inPlanner" | "createdAt">, now = Date.now()): ProjectStage {
  if (r.progress === "failed") return "failed";
  if (r.status === "published" || truthy(r.spPublished)) return "published";
  if (r.status === "scheduled" || truthy(r.spPending)) return "scheduled";
  if (truthy(r.inPlanner)) return "planned";
  if (r.progress === "caption_ready" && now - toMs(r.createdAt) < STALE_GENERATING_MS) return "generating";
  return "draft";
}

/**
 * 舊「七日發布台」的 task id 帶日期（theater-facebook-2026-08-06），每天一個。
 * dev 實測 179 個不同 id 裡 126 個是它，會把「常用任務卡」排行整個洗掉——
 * 一律併成一張；平台已經是另一個篩選面，不用再按通路拆。
 */
export const THEATER_TASK_ID = "theater";
export const THEATER_TASK_LABEL = "七日發布台";

/** 從 metadata.taskId 或舊資料 description 的 [task:<id>] 取出、並 normalize（fb-100-* → fb-99-*）。 */
export function taskIdOf(metaTaskId: unknown, description: unknown): string | null {
  let raw: string | null = null;
  if (typeof metaTaskId === "string" && metaTaskId && metaTaskId !== "null") raw = metaTaskId;
  else if (typeof description === "string") raw = /\[task:([^\]]+)\]/.exec(description)?.[1] ?? null;
  if (raw && raw.startsWith(`${THEATER_TASK_ID}-`)) return THEATER_TASK_ID;
  return raw ? normalizeTaskId(raw) : null;
}

function truthy(v: unknown): boolean {
  return v === true || (typeof v === "number" && v > 0) || v === "1";
}
function toMs(d: Date | string): number {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

type Dim = "platform" | "stage" | "task" | "product" | "period" | "q";

interface Decorated { row: ProjectIndexRow; platform: ProjectPlatform; stage: ProjectStage; period: ProjectPeriod; ms: number }

function matches(d: Decorated, f: ProjectFilterInput, skip: Dim | null): boolean {
  if (skip !== "platform" && f.platform && d.platform !== f.platform) return false;
  if (skip !== "stage" && f.stage && d.stage !== f.stage) return false;
  if (skip !== "task" && f.taskId && d.row.taskId !== f.taskId) return false;
  if (skip !== "product" && f.productId && d.row.productId !== f.productId) return false;
  if (skip !== "period" && f.period && d.period !== f.period) return false;
  if (skip !== "q" && f.q && f.q.trim()) {
    const q = f.q.trim().toLowerCase();
    const hay = [d.row.title, d.row.taskLabel, d.row.taskLabelEn, d.row.brandName, d.row.productName]
      .map((s) => (s ?? "").toLowerCase());
    if (!hay.some((s) => s.includes(q))) return false;
  }
  return true;
}

function count<K>(list: Decorated[], key: (d: Decorated) => K | null): Map<K, number> {
  const m = new Map<K, number>();
  for (const d of list) {
    const k = key(d);
    if (k == null) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function applyProjectFilters(rows: ProjectIndexRow[], f: ProjectFilterInput, now = Date.now()) {
  const decorated: Decorated[] = rows.map((row) => {
    const ms = toMs(row.createdAt);
    const age = now - ms;
    return {
      row, ms,
      platform: platformOf(row.workspace),
      stage: stageOf(row, now),
      period: age < 7 * 86_400_000 ? "7d" : age < 30 * 86_400_000 ? "30d" : "older",
    };
  });

  const hits = decorated.filter((d) => matches(d, f, null));
  hits.sort((a, b) => (f.sort === "old" ? a.ms - b.ms || a.row.id - b.row.id : b.ms - a.ms || b.row.id - a.row.id));

  const limit = Math.min(Math.max(f.limit ?? 24, 1), 60);
  const offset = Math.max(f.offset ?? 0, 0);

  const except = (dim: Dim) => decorated.filter((d) => matches(d, f, dim));

  const platformCounts = count(except("platform"), (d) => d.platform);
  const stageCounts = count(except("stage"), (d) => d.stage);
  const periodCounts = count(except("period"), (d) => d.period);

  const taskBase = except("task");
  const taskCounts = count(taskBase, (d) => d.row.taskId);
  const taskLabels = new Map<string, string>();
  const taskLabelsEn = new Map<string, string>();
  for (const d of taskBase) {
    if (d.row.taskId && d.row.taskLabel && !taskLabels.has(d.row.taskId)) taskLabels.set(d.row.taskId, d.row.taskLabel);
    if (d.row.taskId && d.row.taskLabelEn && !taskLabelsEn.has(d.row.taskId)) taskLabelsEn.set(d.row.taskId, d.row.taskLabelEn);
  }

  const productBase = except("product");
  const productCounts = count(productBase, (d) => d.row.productId);
  const productNames = new Map<number, string>();
  for (const d of productBase) if (d.row.productId && !productNames.has(d.row.productId)) productNames.set(d.row.productId, d.row.productName || `#${d.row.productId}`);

  return {
    total: hits.length,
    items: hits.slice(offset, offset + limit).map((d) => ({ ...d.row, platform: d.platform, stage: d.stage })),
    facets: {
      platform: [...PROJECT_PLATFORMS, "other" as const]
        .map((key) => ({ key, count: platformCounts.get(key) ?? 0 }))
        .filter((x) => x.count > 0),
      stage: PROJECT_STAGES
        .map((key) => ({ key, count: stageCounts.get(key) ?? 0 }))
        .filter((x) => x.count > 0),
      // 用過次數多的在前——「常用」就是前幾名。
      task: [...taskCounts.entries()]
        .map(([key, n]) => ({ key, label: taskLabels.get(key) ?? key, labelEn: taskLabelsEn.get(key) ?? null, count: n }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
      product: [...productCounts.entries()]
        .map(([id, n]) => ({ id, name: productNames.get(id)!, count: n }))
        .sort((a, b) => b.count - a.count),
      period: (["7d", "30d", "older"] as const)
        .map((key) => ({ key, count: periodCounts.get(key) ?? 0 }))
        .filter((x) => x.count > 0),
    },
  };
}
