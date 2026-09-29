/**
 * taskRegistry — 「task id → template + orchestra config」的唯一解析點。
 *
 * 2026-09-02。在這之前，同一條查表鏈在 `quickTaskRouter.ts` 裡**手抄了六次**
 * （runOrchestra60 / polishInput / runOrchestra99 / runOrchestra /
 * regenerateVariant / runQuick），每次十幾個 `??`。後果不是理論上的：
 *
 *   · `regenerateVariant` 的 config 鏈**漏了 KOL** —— KOL 任務按「換人重寫」
 *     直接丟 `no orchestra config`。抄第五次時漏一行，沒人看得出來。
 *   · 「AI 潤稿」取 polishHint 的那條只查了 pack + FB + IG + Website，其他
 *     頻道的 polishHint 寫了也讀不到。
 *
 * 而下一步（用戶自己新增任務卡）要再加一個來源，照舊寫法等於再抄六次、再賭
 * 一次沒漏。所以先收斂成一支 —— 2026-09-04 的自建卡就是靠 registerTaskSource
 * 一行接上來的。
 *
 * ── 為什麼是 async ────────────────────────────────────────────────────
 * 程式碼目錄與 brandPack 都是同步的，但用戶自建的卡會存在 DB（跟
 * personaAgentRouter 的 `brands.positioning._personaAgents[]` 同一個模式），
 * 查表就得是 async。六個呼叫點本來就都在 async mutation 裡，所以成本是零。
 *
 * ── 為什麼來源不吃 brandId ────────────────────────────────────────────
 * `regenerateVariant` 拿不到 brandId（它只有 outputId → taskId）。brandPacks
 * 當初就是靠「卡 id 帶品牌前綴、全域唯一」解掉這件事，自建卡沿用同一招。
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";
import { FB_30S_TASKS, getOrchestraConfig as getFBOrchestraConfig } from "./quickTaskFB";
import { getFB60OrchestraConfig, getFB60Template } from "./quickTaskFB60";
import { getIG60OrchestraConfig, getIG60Template } from "./quickTaskIG60";
import { getYT60OrchestraConfig, getYT60Template } from "./quickTaskYT60";
import { getMulti60OrchestraConfig, getMulti60Template } from "./quickTaskMulti60";
import { get99Template, get99OrchestraConfig } from "./quickTask100";
import { IG_30S_TASKS, getIGOrchestraConfig } from "./quickTaskIG";
import { YT_30S_TASKS, getYTOrchestraConfig } from "./quickTaskYT";
import { TT_30S_TASKS, getTTOrchestraConfig } from "./quickTaskTikTok";
import { LI_30S_TASKS, getLIOrchestraConfig } from "./quickTaskLI";
import { EMAIL_30S_TASKS, getEmailOrchestraConfig } from "./quickTaskEmail";
import { PR_30S_TASKS, getPROrchestraConfig } from "./quickTaskPR";
import { BRAND_30S_TASKS, getBrandOrchestraConfig } from "./quickTaskBrand";
import { RESEARCH_30S_TASKS, getResearchOrchestraConfig } from "./quickTaskResearch";
import { KOL_30S_TASKS, KOL_30S_ORCHESTRA } from "./quickTaskKOL";
import { WEBSITE_30S_TASKS, getWebsiteOrchestraConfig } from "./quickTaskWebsite";
import { X_30S_TASKS, getXOrchestraConfig } from "./quickTaskX";
// 2026-09-29 Threads（th-）與 LINE（ln-）通路的第一批全域卡。
import { TH_30S_TASKS, getThreadsOrchestraConfig } from "./quickTaskThreads";
import { LN_30S_TASKS, getLineOrchestraConfig } from "./quickTaskLine";
import { findPackTemplate, findPackOrchestraConfig } from "../../strategy/core/brandPacks";

export type TaskTier = "30s" | "60s" | "99s";

export interface ResolvedTask {
  template: FBTaskTemplate;
  config: OrchestraConfig;
  tier: TaskTier;
  /** 這張卡從哪裡來的。log 與錯誤訊息用。 */
  source: "99s" | "60s" | "30s" | "custom";
}

/**
 * 額外的卡片來源。用戶自建目錄接上來時只註冊一次，六個呼叫點全部吃得到 ——
 * 這正是這支檔案存在的理由。
 */
export interface TaskSource {
  name: string;
  template(taskId: string): Promise<FBTaskTemplate | null> | FBTaskTemplate | null;
  config(taskId: string): Promise<OrchestraConfig | null> | OrchestraConfig | null;
}

const SOURCES: TaskSource[] = [];

export function registerTaskSource(src: TaskSource): void {
  if (SOURCES.some((s) => s.name === src.name)) return;   // import 兩次不該註冊兩次
  SOURCES.push(src);
}

/** 測試用：把註冊過的來源清掉，避免案例之間互相污染。 */
export function __resetTaskSourcesForTest(): void {
  SOURCES.length = 0;
}

const THIRTY_S_CATALOGS: FBTaskTemplate[][] = [
  FB_30S_TASKS, IG_30S_TASKS, YT_30S_TASKS, TT_30S_TASKS, LI_30S_TASKS,
  EMAIL_30S_TASKS, PR_30S_TASKS, BRAND_30S_TASKS, RESEARCH_30S_TASKS,
  KOL_30S_TASKS, WEBSITE_30S_TASKS,
  // 2026-09-10 X 通路。漏加這一行的後果是 x- 卡查不到 template，
  // 六個呼叫點同時壞 —— 這正是把查表鏈收斂成一支的理由。
  X_30S_TASKS,
  TH_30S_TASKS, LN_30S_TASKS,
];

function find30sTemplate(taskId: string): FBTaskTemplate | null {
  for (const cat of THIRTY_S_CATALOGS) {
    const hit = cat.find((t) => t.id === taskId);
    if (hit) return hit;
  }
  return null;
}

function get30sConfig(taskId: string): OrchestraConfig | null {
  return getFBOrchestraConfig(taskId)
    ?? getIGOrchestraConfig(taskId)
    ?? getYTOrchestraConfig(taskId)
    ?? getTTOrchestraConfig(taskId)
    ?? getLIOrchestraConfig(taskId)
    ?? getEmailOrchestraConfig(taskId)
    ?? getPROrchestraConfig(taskId)
    ?? getBrandOrchestraConfig(taskId)
    ?? getResearchOrchestraConfig(taskId)
    // 2026-09-02: regenerateVariant 抄這條鏈時漏了 KOL，KOL 任務按「換人重寫」
    // 就丟 no orchestra config。收斂成一支之後這種漏抄不可能再發生。
    ?? (KOL_30S_ORCHESTRA[taskId] ?? null)
    ?? getWebsiteOrchestraConfig(taskId)
    ?? getXOrchestraConfig(taskId)
    ?? getThreadsOrchestraConfig(taskId)
    ?? getLineOrchestraConfig(taskId);
}

function get60sTemplate(taskId: string): FBTaskTemplate | null {
  return getFB60Template(taskId) ?? getIG60Template(taskId)
      ?? getYT60Template(taskId) ?? getMulti60Template(taskId);
}

function get60sConfig(taskId: string): OrchestraConfig | null {
  return getFB60OrchestraConfig(taskId) ?? getIG60OrchestraConfig(taskId)
      ?? getYT60OrchestraConfig(taskId) ?? getMulti60OrchestraConfig(taskId);
}

/**
 * 只查程式碼裡的目錄（含 brandPack）。同步，給拿不到 await 的呼叫端用。
 * 自建卡查不到 —— 要完整結果請用 `resolveTaskTemplate`。
 */
export function resolveTaskTemplateSync(taskId: string): FBTaskTemplate | null {
  return get99Template(taskId)
      ?? get60sTemplate(taskId)
      ?? find30sTemplate(taskId)
      ?? findPackTemplate(taskId);
}

/**
 * 外掛來源查表。**每一支各自 try/catch**：自建卡的來源要讀資料庫，DB 抖一下
 * 就不該讓整個解析器丟一個 mysql 錯誤上去 —— 呼叫端會把它顯示成「任務壞了」，
 * 而真正的原因（連線失敗）只留在 stack 裡。一支壞掉就跳過它繼續問下一支。
 */
async function fromSources<T>(
  pick: (s: TaskSource) => Promise<T | null> | T | null,
  what: string,
  taskId: string,
): Promise<T | null> {
  for (const s of SOURCES) {
    try {
      const hit = await pick(s);
      if (hit) return hit;
    } catch (err: any) {
      console.warn(`[taskRegistry] source "${s.name}" 查 ${what}(${taskId}) 失敗：${String(err?.message ?? err).slice(0, 200)}`);
    }
  }
  return null;
}

export async function resolveTaskTemplate(taskId: string): Promise<FBTaskTemplate | null> {
  const sync = resolveTaskTemplateSync(taskId);
  if (sync) return sync;
  return await fromSources((s) => s.template(taskId), "template", taskId);
}

export async function resolveOrchestraConfig(taskId: string): Promise<OrchestraConfig | null> {
  const code = get99OrchestraConfig(taskId)
    ?? get60sConfig(taskId)
    ?? get30sConfig(taskId)
    ?? findPackOrchestraConfig(taskId);
  if (code) return code;
  return await fromSources((s) => s.config(taskId), "config", taskId);
}

/**
 * 完整解析。tier 由**哪一層同時給得出 template 與 config** 決定 —— 這是原本
 * 六個呼叫點的共同語意：99s 的 template 配不到 99s 的 config 時要往下掉到
 * 60s，而不是拿 99s 的 template 硬配 30s 的 config。
 *
 * pack 卡與自建卡歸類為 "custom"，tier 取 template.tier（沒宣告就當 30s）。
 */
export async function resolveTask(taskId: string): Promise<ResolvedTask | null> {
  const t99 = get99Template(taskId), c99 = get99OrchestraConfig(taskId);
  if (t99 && c99) return { template: t99, config: c99, tier: "99s", source: "99s" };

  const t60 = get60sTemplate(taskId), c60 = get60sConfig(taskId);
  if (t60 && c60) return { template: t60, config: c60, tier: "60s", source: "60s" };

  const t30 = find30sTemplate(taskId), c30 = get30sConfig(taskId);
  if (t30 && c30) return { template: t30, config: c30, tier: "30s", source: "30s" };

  const tPack = findPackTemplate(taskId), cPack = findPackOrchestraConfig(taskId);
  if (tPack && cPack) {
    return { template: tPack, config: cPack, tier: tierOfTemplate(tPack), source: "custom" };
  }

  for (const s of SOURCES) {
    try {
      const [tpl, cfg] = await Promise.all([s.template(taskId), s.config(taskId)]);
      if (tpl && cfg) return { template: tpl, config: cfg, tier: tierOfTemplate(tpl), source: "custom" };
    } catch (err: any) {
      console.warn(`[taskRegistry] source "${s.name}" 解析 ${taskId} 失敗：${String(err?.message ?? err).slice(0, 200)}`);
    }
  }
  return null;
}

function tierOfTemplate(t: FBTaskTemplate): TaskTier {
  return t.tier === "99s" || t.tier === "60s" ? t.tier : "30s";
}

/** 只要 tier，不需要 config（RunPage 與計費分層在問這個）。 */
export function taskTierOfSync(taskId: string): TaskTier | null {
  if (get99Template(taskId)) return "99s";
  if (get60sTemplate(taskId)) return "60s";
  const t = find30sTemplate(taskId) ?? findPackTemplate(taskId);
  return t ? tierOfTemplate(t) : null;
}

/**
 * 解析不到就丟一個說得出原因的錯。原本五個呼叫點各自丟不同措辭
 * （`Unknown task id:` / `Unknown 30s quick task id:` / `未知 task:`），
 * 查 log 時要記三種寫法。
 */
export async function resolveTaskOrThrow(taskId: string): Promise<ResolvedTask> {
  const hit = await resolveTask(taskId);
  if (hit) return hit;
  const tpl = await resolveTaskTemplate(taskId);
  const cfg = await resolveOrchestraConfig(taskId);
  if (tpl && !cfg) throw new Error(`任務「${taskId}」有 template 但沒有 orchestra config`);
  if (!tpl && cfg) throw new Error(`任務「${taskId}」有 orchestra config 但沒有 template`);
  throw new Error(`未知的任務 id：${taskId}`);
}
