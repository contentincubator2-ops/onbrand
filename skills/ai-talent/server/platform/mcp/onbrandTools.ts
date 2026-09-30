/**
 * onbrandTools — onBrand Studio 連接器（/api/mcp/onbrand）對 Claude 開放的工具。
 *
 * 2026-09-28（CJ「變成 claude 外掛服務」「用 SoWork 當範例做自主行銷團隊」）。
 *
 * ── IP 邊界（不要「順手」放寬）──────────────────────────────────────
 * 任務卡的 systemPrompt、agent 人設、SKILL 內文一律不出伺服器：Claude 只拿得到
 * 卡片名稱、要問哪幾格、跑完的成品。產稿在伺服器跑，Claude 只負責調度。
 *
 * ── 計費 ──────────────────────────────────────────────────────────
 * run_task 走既有的 quickTask.runOrchestra* mutation（createCaller），所以方案閘門、
 * 必填檢查、成本護欄、扣點全部沿用，不另寫一套；其他工具是讀取或排格子，不扣點。
 *
 * ── 為什麼 run_task 立刻回傳 ─────────────────────────────────────────
 * 30s 要二三十秒、60s/99s 到文案檢查點也要三四十秒，圖片還在後面。MCP 呼叫卡住那麼久，
 * Claude 端會逾時。所以開一筆 mcp_task_runs 在背景跑，Claude 用 get_task_result 查。
 */
import localPool from "../../localDb";
import { assertBrandAccess } from "../core/brandAuth";

export const MCP_TASK_RUNS_DDL = `
  CREATE TABLE IF NOT EXISTS mcp_task_runs (
    id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId     INT          NOT NULL,
    brandId    INT          NOT NULL,
    taskId     VARCHAR(100) NOT NULL,
    taskLabel  VARCHAR(200) NULL,
    tier       VARCHAR(8)   NOT NULL,
    status     VARCHAR(12)  NOT NULL DEFAULT 'running',
    outputId   BIGINT       NULL,
    error      VARCHAR(500) NULL,
    createdAt  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_mcp_task_runs_user (userId, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/** 伺服器重啟會讓背景 promise 消失；超過這個時間還在 running 就當作中斷。 */
const STALE_RUN_MS = 15 * 60 * 1000;

export const UI_APP_URI = "ui://onbrand/app";

export interface ToolCtx { userId: number; baseUrl: string }
export interface ToolOutput { text: string; structured?: Record<string, unknown> }
export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** 有值＝結果在 Claude 對話裡用 MCP App 渲染。 */
  ui?: boolean;
  readOnly?: boolean;
  run: (args: any, ctx: ToolCtx) => Promise<ToolOutput>;
}

export class ToolInputError extends Error {}

const PLATFORM_ZH: Record<string, string> = {
  facebook: "FB", instagram: "IG", youtube: "YouTube", tiktok: "TikTok", linkedin: "LinkedIn",
  email: "Email", press: "新聞稿", threads: "Threads", line: "LINE",
};

function num(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ToolInputError(`${name} 必須是正整數`);
  return n;
}

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v) return String((v as any).zh ?? (v as any).en ?? "");
  return String(v);
}

function parseJson(v: unknown): any {
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } }
  return v ?? null;
}

function abs(base: string, url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${base}${url}`;
  return null;
}

async function checkBrand(userId: number, brandId: number) {
  try { await assertBrandAccess(userId, brandId); }
  catch { throw new ToolInputError(`找不到品牌 ${brandId}，或你沒有這個品牌的權限。先用 list_brands 確認。`); }
}

async function brandName(brandId: number): Promise<string> {
  const [rows]: any = await localPool.execute(`SELECT name FROM brands WHERE id = ? LIMIT 1`, [brandId]);
  return String(rows?.[0]?.name ?? `品牌 ${brandId}`);
}

async function caller(userId: number) {
  const { appRouter } = await import("../../routers");
  return appRouter.createCaller({ user: { id: userId } } as any);
}

/** 台北時間的今天（YYYY-MM-DD）。本週企劃以台北週一為起點。 */
export function todayTaipei(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

// ─── 產出狀態 ────────────────────────────────────────────────────────

type WorkStatus = "running" | "writing" | "imaging" | "ready" | "failed";
const STATUS_ZH: Record<WorkStatus, string> = {
  running: "排隊中", writing: "寫稿中", imaging: "文案好了，配圖中", ready: "完成，待你審", failed: "失敗",
};

function statusOf(progress: string | null | undefined): WorkStatus {
  if (progress === "caption_ready") return "imaging";
  if (progress === "failed") return "failed";
  return "ready";
}

// ─── 工具 ───────────────────────────────────────────────────────────

const listBrands: ToolDef = {
  name: "list_brands",
  title: "列出品牌",
  description: "列出使用者在 onBrand Studio 可以操作的品牌（自己的，以及被邀請加入的）。其他工具都要 brandId，第一步先呼叫這個。",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  run: async (_a, ctx) => {
    const [rows]: any = await localPool.execute(
      `SELECT DISTINCT b.id, b.name, b.industry, b.website
         FROM brands b LEFT JOIN brand_members bm ON bm.brandId = b.id AND bm.userId = ?
        WHERE b.userId = ? OR bm.userId IS NOT NULL
        ORDER BY b.id DESC LIMIT 100`,
      [ctx.userId, ctx.userId],
    );
    const brands = (rows as any[]).map((r) => ({ id: Number(r.id), name: r.name, industry: r.industry ?? null, website: r.website ?? null }));
    const lines = brands.map((b) => `- ${b.name}（brandId ${b.id}${b.industry ? `，${b.industry}` : ""}）`);
    return {
      text: brands.length ? `共 ${brands.length} 個品牌：\n${lines.join("\n")}` : "這個帳號還沒有品牌。請先到 onBrand Studio 建立品牌並完成品牌定位。",
      structured: { brands },
    };
  },
};

/** 定位 JSON 裡 "__" 開頭的是系統欄位（托盤、通路、自建卡），不是品牌內容。 */
export function publicPositioning(p: unknown): Record<string, unknown> {
  const src = parseJson(p);
  if (!src || typeof src !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k.startsWith("_")) continue;
    out[k] = v;
  }
  return out;
}

const getBrandContext: ToolDef = {
  name: "get_brand_context",
  title: "讀取品牌大腦",
  description: "讀取品牌大腦：品牌定位摘要、TA、差異化、語氣、禁用詞等。規劃內容或回答品牌問題前先讀這個；不要自己假設品牌資訊。",
  inputSchema: {
    type: "object",
    properties: { brandId: { type: "integer", description: "品牌 id（list_brands 取得）" } },
    required: ["brandId"], additionalProperties: false,
  },
  readOnly: true,
  run: async (a, ctx) => {
    const brandId = num(a.brandId, "brandId");
    await checkBrand(ctx.userId, brandId);
    const [rows]: any = await localPool.execute(
      `SELECT name, industry, website, positioningSummary, positioning FROM brands WHERE id = ? LIMIT 1`, [brandId],
    );
    const r = rows?.[0] ?? {};
    const positioning = publicPositioning(r.positioning);
    let body = JSON.stringify(positioning);
    if (body.length > 12000) body = body.slice(0, 12000) + "…（已截斷）";
    const filled = Object.keys(positioning).length;
    return {
      text: [
        `品牌：${r.name}${r.industry ? `（${r.industry}）` : ""}${r.website ? ` ${r.website}` : ""}`,
        r.positioningSummary ? `定位摘要：${r.positioningSummary}` : "定位摘要：尚未填寫",
        filled ? `定位內容（JSON）：${body}` : "品牌定位尚未完成。請提醒使用者先到 onBrand Studio 完成品牌定位，產出才會 on-brand。",
      ].join("\n"),
      structured: { brandId, name: r.name, industry: r.industry ?? null, positioningSummary: r.positioningSummary ?? null, positioning },
    };
  },
};

const listTasks: ToolDef = {
  name: "list_tasks",
  title: "列出任務卡",
  description:
    "列出這個品牌目前可用的任務卡（onBrand Studio 會持續上新卡，每次都要重新查，不要沿用舊清單）。" +
    "單篇＝30s、套組＝60s、企劃＝99s（跟使用者說話時用「單篇／套組／企劃」，不要說 30s/60s/99s）。" +
    "選定後用 describe_task 看要填哪些欄位，再用 run_task 執行。",
  inputSchema: {
    type: "object",
    properties: {
      brandId: { type: "integer" },
      platform: { type: "string", description: "只列某通路：facebook / instagram / youtube / tiktok / linkedin / email / press …" },
      search: { type: "string", description: "關鍵字（比對卡片名稱）" },
      limit: { type: "integer", minimum: 1, maximum: 200, description: "預設 60" },
    },
    required: ["brandId"], additionalProperties: false,
  },
  readOnly: true,
  run: async (a, ctx) => {
    const brandId = num(a.brandId, "brandId");
    await checkBrand(ctx.userId, brandId);
    const { planQuotaFor, loadBrandPositioning, resolveChannels, filterTasksByPlan } = await import("../core/planGate");
    const { buildTaskCatalogIndex } = await import("../../content/core/taskCatalogIndex");
    const { listBrandTaskCards } = await import("../../strategy/core/brandTaskCards");
    const quota = await planQuotaFor(ctx.userId);
    const positioning = await loadBrandPositioning(brandId);
    const allowed = filterTasksByPlan(buildTaskCatalogIndex() as any[], quota, resolveChannels(positioning, quota)) as any[];
    const own = (await listBrandTaskCards(brandId)).filter((c) => c.status === "ready").map((c) => ({
      id: c.id, platform: c.channel, tier: "30s", labelZh: c.name, labelEn: c.name, addedAt: c.createdAt?.slice(0, 10) ?? null, custom: true,
    }));
    const q = String(a.search ?? "").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(a.limit) || 60, 1), 200);
    const tasks = [...own, ...allowed.map((t) => ({
      id: t.id, platform: t.platform, tier: t.tier, labelZh: t.labelZh, labelEn: t.labelEn, addedAt: t.addedAt ?? null, custom: false,
    }))]
      .filter((t) => !a.platform || t.platform === a.platform)
      .filter((t) => !q || `${t.labelZh} ${t.labelEn} ${t.id}`.toLowerCase().includes(q));
    const TIER_ZH: Record<string, string> = { "30s": "單篇", "60s": "套組", "99s": "企劃" };
    const shown = tasks.slice(0, limit);
    return {
      text: `可用任務卡 ${tasks.length} 張${tasks.length > limit ? `（先列 ${limit} 張，可用 platform／search 縮小）` : ""}：\n` +
        shown.map((t) => `- ${t.id}｜${PLATFORM_ZH[t.platform] ?? t.platform}｜${TIER_ZH[t.tier] ?? t.tier}｜${t.labelZh}${t.custom ? "（品牌自建）" : ""}`).join("\n"),
      structured: { total: tasks.length, tasks: shown },
    };
  },
};

const describeTask: ToolDef = {
  name: "describe_task",
  title: "查看任務卡要填什麼",
  description: "查看一張任務卡的用途，以及執行前要問使用者的欄位（哪些必填）。run_task 前先呼叫，缺必填時先問使用者，不要自己編。",
  inputSchema: {
    type: "object",
    properties: { taskId: { type: "string" } },
    required: ["taskId"], additionalProperties: false,
  },
  readOnly: true,
  run: async (a) => {
    const taskId = String(a.taskId ?? "").trim();
    const { resolveTask } = await import("../../content/core/taskRegistry");
    const { intakeExtraFields, intakePrimaryRequired } = await import("../../content/core/taskIntake");
    const hit = taskId ? await resolveTask(taskId) : null;
    if (!hit) throw new ToolInputError(`找不到任務卡 ${taskId}。用 list_tasks 取得目前的卡片 id。`);
    const t: any = hit.template;
    const primary = t.primary_input?.key
      ? { key: t.primary_input.key, question: text(t.primary_question) || "這篇要寫什麼？", placeholder: t.primary_input.placeholder ?? "", required: intakePrimaryRequired(t) }
      : null;
    const fields = intakeExtraFields(t);
    const lines = [
      `${text(t.label)}（${hit.tier === "30s" ? "單篇" : hit.tier === "60s" ? "套組" : "企劃"}）`,
      text(t.description),
      primary ? `主要輸入 ${primary.key}${primary.required ? "（必填）" : ""}：${primary.question}` : "沒有主要輸入欄位。",
      ...fields.map((f) => `欄位 ${f.key}${f.required ? "（必填）" : "（選填）"}：${f.label}${f.placeholder ? `，例：${f.placeholder}` : ""}`),
      "run_task 的 inputs 用上面的 key 當鍵。",
    ];
    return {
      text: lines.filter(Boolean).join("\n"),
      structured: { taskId, tier: hit.tier, label: text(t.label), description: text(t.description), primary, fields },
    };
  },
};

const runTask: ToolDef = {
  name: "run_task",
  title: "交辦任務",
  description:
    "把一張任務卡交給 onBrand Studio 團隊執行（伺服器端的專屬寫手＋設計執行，會扣使用者 onBrand Studio 方案點數）。" +
    "立刻回傳 runId；大約 30–90 秒後用 get_task_result 查結果。不要重複送同一件事。",
  inputSchema: {
    type: "object",
    properties: {
      brandId: { type: "integer" },
      taskId: { type: "string", description: "list_tasks 取得的任務卡 id" },
      inputs: { type: "object", additionalProperties: { type: "string" }, description: "describe_task 列出的欄位 key → 值" },
      productId: { type: "integer", description: "選填：只針對某個產品" },
      eventId: { type: "integer", description: "選填：只針對某個活動" },
    },
    required: ["brandId", "taskId"], additionalProperties: false,
  },
  run: async (a, ctx) => {
    const brandId = num(a.brandId, "brandId");
    await checkBrand(ctx.userId, brandId);
    const taskId = String(a.taskId ?? "").trim();
    const inputs: Record<string, string> = {};
    for (const [k, v] of Object.entries(a.inputs ?? {})) if (typeof v === "string") inputs[k] = v.slice(0, 8000);

    const { resolveTask } = await import("../../content/core/taskRegistry");
    const { missingRequiredInputs } = await import("../../content/core/taskIntake");
    const hit = taskId ? await resolveTask(taskId) : null;
    if (!hit) throw new ToolInputError(`找不到任務卡 ${taskId}。用 list_tasks 取得目前的卡片 id。`);
    // 缺必填在這裡就擋，不開紀錄、不扣點（mutation 也會擋，但那時已經背景化了，Claude 看不到原因）。
    const missing = missingRequiredInputs(hit.template as any, inputs);
    if (missing.length) throw new ToolInputError(`還缺必填欄位：${missing.map((f) => `${f.key}（${f.label}）`).join("、")}。請先問使用者。`);

    const label = text((hit.template as any).label) || taskId;
    const [ins]: any = await localPool.execute(
      `INSERT INTO mcp_task_runs (userId, brandId, taskId, taskLabel, tier, status) VALUES (?, ?, ?, ?, ?, 'running')`,
      [ctx.userId, brandId, taskId, label.slice(0, 200), hit.tier],
    );
    const runId = Number(ins.insertId);

    void executeRun({ runId, userId: ctx.userId, brandId, taskId, tier: hit.tier, inputs, productId: a.productId ?? null, eventId: a.eventId ?? null });

    const eta = hit.tier === "30s" ? "約 30 秒" : "文案約 40 秒、配圖再 1–2 分鐘";
    return {
      text: `已交辦「${label}」，runId ${runId}，${eta}。用 get_task_result(runId: ${runId}) 查結果。`,
      structured: { runId, taskId, tier: hit.tier, status: "running" },
    };
  },
};

export async function executeRun(args: {
  runId: number; userId: number; brandId: number; taskId: string; tier: string;
  inputs: Record<string, string>; productId: number | null; eventId: number | null;
}) {
  const setRow = (status: string, outputId: number | null, error: string | null) =>
    localPool.execute(`UPDATE mcp_task_runs SET status = ?, outputId = ?, error = ? WHERE id = ?`,
      [status, outputId, error?.slice(0, 500) ?? null, args.runId]);
  try {
    const c: any = await caller(args.userId);
    const payload = {
      taskId: args.taskId, inputs: args.inputs, brandId: args.brandId,
      productId: args.productId, eventId: args.eventId,
    };
    const res: any = args.tier === "99s" ? await c.quickTask.runOrchestra99({ ...payload, asyncMode: true })
      : args.tier === "60s" ? await c.quickTask.runOrchestra60({ ...payload, asyncMode: true })
      : await c.quickTask.runOrchestra(payload);
    const outputId = Number(res?.outputId) || null;
    if (!outputId) {
      const why = Array.isArray(res?.errors) && res.errors.length ? String(res.errors[0]) : "沒有產出可用的內容";
      await setRow("failed", null, why);
      return;
    }
    await setRow("done", outputId, null);
  } catch (err: any) {
    await setRow("failed", null, String(err?.message ?? err)).catch(() => {});
  }
}

interface Variant { label: string; caption: string; hashtags: string[]; imageUrl: string | null; imageStatus: string | null }

function variantsFrom(content: unknown, base: string): Variant[] {
  const arr = parseJson(content);
  if (!Array.isArray(arr)) return [];
  return arr.map((v: any, i: number) => ({
    label: String(v?.label ?? `版本 ${i + 1}`),
    caption: String(v?.caption ?? ""),
    hashtags: Array.isArray(v?.hashtags) ? v.hashtags.map(String) : [],
    imageUrl: abs(base, v?.image?.url ?? null),
    imageStatus: v?.image?.status ?? null,
  }));
}

const getTaskResult: ToolDef = {
  name: "get_task_result",
  title: "查看成品",
  description:
    "查詢 run_task 的進度與成品（貼文文案、hashtag、配圖），並在對話中顯示貼文預覽。" +
    "status=running/writing 表示還在做，稍後再查；imaging 表示文案已好、配圖中。" +
    "把成品交給使用者時照原文呈現，不要自行改寫——要修改請使用者在 onBrand Studio 用「換人重寫」，或再交辦一次。",
  inputSchema: {
    type: "object",
    properties: {
      runId: { type: "integer", description: "run_task 回傳的 runId" },
      outputId: { type: "integer", description: "或直接給 onBrand Studio 的成品 id" },
    },
    additionalProperties: false,
  },
  ui: true,
  readOnly: true,
  run: async (a, ctx) => {
    let outputId: number | null = a.outputId ? num(a.outputId, "outputId") : null;
    let run: any = null;
    if (!outputId) {
      const runId = num(a.runId, "runId");
      const [rows]: any = await localPool.execute(
        `SELECT *, TIMESTAMPDIFF(SECOND, createdAt, NOW(3)) AS ageS FROM mcp_task_runs WHERE id = ? AND userId = ? LIMIT 1`,
        [runId, ctx.userId],
      );
      run = rows?.[0];
      if (!run) throw new ToolInputError(`找不到 runId ${runId}`);
      if (run.status === "running" && Number(run.ageS) * 1000 > STALE_RUN_MS) {
        await localPool.execute(`UPDATE mcp_task_runs SET status='failed', error='執行中斷（伺服器重新啟動），請重新交辦' WHERE id = ?`, [runId]);
        run.status = "failed"; run.error = "執行中斷（伺服器重新啟動），請重新交辦";
      }
      if (run.status === "failed") {
        return {
          text: `「${run.taskLabel}」失敗：${run.error ?? "未知原因"}`,
          structured: { view: "post", status: "failed", runId, taskLabel: run.taskLabel, error: run.error },
        };
      }
      if (!run.outputId) {
        return {
          text: `「${run.taskLabel}」還在寫（已 ${run.ageS} 秒）。請等 20–30 秒再查一次。`,
          structured: { view: "post", status: "writing", runId, taskLabel: run.taskLabel },
        };
      }
      outputId = Number(run.outputId);
    }
    const c: any = await caller(ctx.userId);
    const out: any = await c.output.getById({ id: outputId }).catch(() => null);
    if (!out) throw new ToolInputError(`找不到成品 ${outputId}，或你沒有權限。`);
    const status = statusOf(out.progress);
    const variants = variantsFrom(out.content, ctx.baseUrl);
    const md = parseJson(out.metadata) ?? {};
    const agent = md.captionAgent ? { name: md.captionAgent.name, title: md.captionAgent.title ?? null, avatarUrl: abs(ctx.baseUrl, md.captionAgent.avatarUrl) } : null;
    const link = `${ctx.baseUrl}/run/${outputId}`;
    const platform = String(out.mission?.workspace ?? out.platform ?? "");
    const body = variants.map((v, i) =>
      `【${v.label || `版本 ${i + 1}`}】\n${v.caption}${v.hashtags.length ? `\n${v.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}` : ""}${v.imageUrl ? `\n配圖：${v.imageUrl}` : v.imageStatus && v.imageStatus !== "skipped" ? `\n配圖：${v.imageStatus}` : ""}`,
    ).join("\n\n");
    return {
      text: `「${out.mission?.taskLabel ?? out.title}」${STATUS_ZH[status]}${agent ? `（${agent.name}${agent.title ? `・${agent.title}` : ""} 執筆）` : ""}。\n在 onBrand Studio 開啟：${link}\n\n${body}`,
      structured: {
        view: "post", status, outputId, runId: run ? Number(run.id) : null,
        taskLabel: out.mission?.taskLabel ?? out.title, platform,
        brand: out.brand ? { name: out.product?.name ?? out.brand.name, logoUrl: abs(ctx.baseUrl, out.product?.logoUrl ?? out.brand.logoUrl) } : null,
        agent, variants, link,
      },
    };
  },
};

const teamBoard: ToolDef = {
  name: "team_board",
  title: "團隊看板",
  description:
    "在對話中顯示這個品牌的 onBrand Studio 行銷團隊看板：本週企劃、每位成員正在做的事、待審成品。" +
    "使用者問「團隊在忙什麼」「這週進度」「有什麼要我審」時呼叫。",
  inputSchema: {
    type: "object",
    properties: {
      brandId: { type: "integer" },
      weekStart: { type: "string", description: "選填：週一日期 YYYY-MM-DD，預設本週" },
    },
    required: ["brandId"], additionalProperties: false,
  },
  ui: true,
  readOnly: true,
  run: async (a, ctx) => {
    const brandId = num(a.brandId, "brandId");
    await checkBrand(ctx.userId, brandId);
    const { mondayOf, isYmd, loadWeekSlots, weekDays } = await import("../../content/core/weeklyPlanner");
    const weekStart = isYmd(a.weekStart) ? mondayOf(a.weekStart) : mondayOf(todayTaipei());
    const [name, slots] = await Promise.all([brandName(brandId), loadWeekSlots(brandId, weekStart)]);

    const [outRows]: any = await localPool.execute(
      `SELECT o.id, o.title, o.progress, o.platform, o.createdAt, o.metadata, m.title AS taskLabel, m.workspace
         FROM mission_outputs o JOIN missions m ON m.id = o.missionId
        WHERE m.brandId = ? AND m.userId = ?
        ORDER BY o.id DESC LIMIT 12`,
      [brandId, ctx.userId],
    );
    const [runRows]: any = await localPool.execute(
      `SELECT id, taskLabel, status, error, createdAt FROM mcp_task_runs
        WHERE brandId = ? AND userId = ? AND outputId IS NULL AND createdAt > DATE_SUB(NOW(3), INTERVAL 1 DAY)
        ORDER BY id DESC LIMIT 6`,
      [brandId, ctx.userId],
    );

    const work = [
      ...(runRows as any[]).map((r) => ({
        key: `run-${r.id}`, runId: Number(r.id), outputId: null, title: r.taskLabel, taskLabel: r.taskLabel, platform: null,
        status: (r.status === "failed" ? "failed" : "writing") as WorkStatus, agent: null, thumbnailUrl: null,
        createdAt: new Date(r.createdAt).toISOString(), link: null, error: r.error ?? null,
      })),
      ...(outRows as any[]).map((r) => {
        const md = parseJson(r.metadata) ?? {};
        const ag = md.captionAgent;
        return {
          key: `out-${r.id}`, runId: null, outputId: Number(r.id), title: r.title, taskLabel: r.taskLabel, platform: r.workspace ?? r.platform ?? null,
          status: statusOf(r.progress), agent: ag ? { name: ag.name, title: ag.title ?? null, avatarUrl: abs(ctx.baseUrl, ag.avatarUrl) } : null,
          thumbnailUrl: abs(ctx.baseUrl, md.thumbnailUrl ?? null), createdAt: new Date(r.createdAt).toISOString(),
          link: `${ctx.baseUrl}/run/${r.id}`, error: null,
        };
      }),
    ];

    const planned = slots.filter((s) => s.status !== "dismissed");
    const writtenN = planned.filter((s) => s.status === "written").length;
    const inFlight = work.filter((w) => w.status === "writing" || w.status === "imaging").length;
    const toReview = work.filter((w) => w.status === "ready").slice(0, 5);

    return {
      text: [
        `${name} 本週（${weekStart} 起）：企劃 ${planned.length} 格、已寫 ${writtenN} 格；進行中 ${inFlight} 件。`,
        planned.length ? planned.map((s) => `- ${s.slotDate} ${PLATFORM_ZH[s.platform] ?? s.platform}｜${s.topic}｜${s.status === "written" ? "已寫" : "未寫"}`).join("\n") : "本週還沒有企劃。可以用 add_plan_slots 排。",
        toReview.length ? `最近的成品：\n${toReview.map((w) => `- ${w.taskLabel ?? w.title}（outputId ${w.outputId}）`).join("\n")}` : "",
      ].filter(Boolean).join("\n"),
      structured: {
        view: "board", brand: { id: brandId, name }, weekStart, days: weekDays(weekStart),
        slots: planned.map((s) => ({ ...s, platformZh: PLATFORM_ZH[s.platform] ?? s.platform })),
        work, links: { planner: `${ctx.baseUrl}/planner?b=${brandId}`, onbrand: ctx.baseUrl },
      },
    };
  },
};

const addPlanSlots: ToolDef = {
  name: "add_plan_slots",
  title: "排進本週企劃",
  description:
    "把內容排進 onBrand Studio 的本週企劃（planned_slots，使用者在 onBrand Studio 的「本週企劃」也看得到）。" +
    "每格＝一天×一個通路×一張任務卡×一個題目。日期必須在該週內、通路必須是品牌已加入的；不符的格子會被略過並回報。",
  inputSchema: {
    type: "object",
    properties: {
      brandId: { type: "integer" },
      weekStart: { type: "string", description: "選填：週一 YYYY-MM-DD，預設本週" },
      slots: {
        type: "array", maxItems: 14,
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD" },
            platform: { type: "string", description: "facebook / instagram / …" },
            taskId: { type: "string" },
            topic: { type: "string", description: "題目，60 字內" },
            reason: { type: "string", description: "為什麼這天排這篇，120 字內" },
          },
          required: ["date", "platform", "taskId", "topic"],
        },
      },
    },
    required: ["brandId", "slots"], additionalProperties: false,
  },
  run: async (a, ctx) => {
    const brandId = num(a.brandId, "brandId");
    await checkBrand(ctx.userId, brandId);
    const wp = await import("../../content/core/weeklyPlanner");
    const weekStart = wp.isYmd(a.weekStart) ? wp.mondayOf(a.weekStart) : wp.mondayOf(todayTaipei());
    const platforms = await wp.brandPlatforms(brandId);
    const cards = wp.cardsFor(platforms);
    const slots = await wp.loadWeekSlots(brandId, weekStart);
    const raw = (Array.isArray(a.slots) ? a.slots : []).map((s: any) => ({ op: "add", ...s }));
    const ops = wp.validateOps({ raw, weekStart, platforms, cards, slots });
    const ids = await wp.applyOps({ userId: ctx.userId, brandId, ops, cards });
    const skipped = raw.length - ops.length;
    const repaired = ops.filter((o: any) => o.repaired).length;
    return {
      text: `已排入 ${ids.length} 格${skipped ? `，略過 ${skipped} 格（日期不在 ${weekStart} 這週、通路未加入，或題目太短）` : ""}` +
        `${repaired ? `；${repaired} 格的任務卡不屬於該通路，已換成該通路的預設卡` : ""}。品牌已加入的通路：${platforms.join("、")}。`,
      structured: { weekStart, added: ids, skipped, platforms },
    };
  },
};

export const TOOLS: ToolDef[] = [listBrands, getBrandContext, listTasks, describeTask, runTask, getTaskResult, teamBoard, addPlanSlots];
