/**
 * agentApiRoute — 給外部 agent（Hermes）呼叫 OnBrand 任務引擎的 API。
 *
 * 2026-09-18 (CJ「hermes 跑在 onbrand 同一台 VM。你可以開一個 API，讓我用
 * hermes agent 來呼叫 onbrand 裡面，媽爹講故事有關的東西」).
 *
 * ── 為什麼是 API 而不是讓 Hermes 直連資料庫 ────────────────────────────────
 * 「產一篇符合品牌的稿」不是一次查詢，是一整條組裝鏈：定位 → 語氣 → 禁用詞 →
 * 知識庫 → 人設 → 任務卡 → orchestra → 品牌規則後處理。直連資料庫的話，那條鏈
 * 會被複製一份到 Python 那邊，然後兩份開始各自演化 —— 半年後沒有人說得出
 * 「為什麼 LINE 產的跟網站產的不一樣」。
 *
 * 所以邊界劃在這裡：Hermes 負責「跟人對話」，OnBrand 負責「產出符合品牌的內容」。
 * 這條線上只走 taskId + inputs 進、稿子出。
 *
 * ── 為什麼是非同步 ────────────────────────────────────────────────────────
 * 任務要跑 30–130 秒，而 nginx 的 proxy_read_timeout 是 120 秒 —— 同步呼叫會在
 * 最慢的那些任務上被切斷，而且切斷時任務其實還在跑，錢照花但結果拿不到。
 * 改成 POST 拿 jobId、GET 輪詢。這也剛好對上 Hermes LINE adapter 的做法：
 * 它在慢回應時會給使用者一顆按鈕，讓她用新的免費 reply token 去取結果。
 *
 * job 放記憶體不放資料表：壽命只有幾分鐘，重啟遺失的代價是「請再試一次」。
 * 真正的產出本來就已經寫進 mission_outputs，沒有東西真的不見。
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";

export const agentApiRouter = Router();

/* ── 驗證 ─────────────────────────────────────────────────────────────────── */

/** 等長比較，避免用回應時間逐字元猜出金鑰。 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * 沒設 AGENT_API_KEY 就整條路關閉（503），不是「不驗證直接開放」。
 * 這條 API 能花錢產內容，預設開放的後果比壞掉嚴重得多。
 */
function requireKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.AGENT_API_KEY;
  if (!expected) {
    res.status(503).json({ error: "agent API 未啟用（AGENT_API_KEY 未設定）" });
    return;
  }
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !safeEqual(token, expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/**
 * 金鑰能動哪些品牌。
 *
 * 沒有這道閘門的話，金鑰一旦外流就能對「任何」品牌產內容並記在那個品牌的
 * 帳上 —— 而且產出看起來完全正常，只是花的是別人的額度。
 * AGENT_API_BRAND_IDS 是逗號分隔；沒設就一個品牌都不允許。
 */
function allowedBrandIds(): Set<number> {
  const raw = process.env.AGENT_API_BRAND_IDS ?? "";
  return new Set(
    raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0),
  );
}

/* ── job 註冊表 ───────────────────────────────────────────────────────────── */

type JobStatus = "running" | "done" | "failed";
interface Job {
  status: JobStatus;
  taskId: string;
  brandId: number;
  startedAt: number;
  result?: {
    caption: string;
    hashtags: string[];
    imageBrief: string | null;
    images: string[];
    cards: Array<{ headline: string; body: string; imageUrl: string | null }>;
  };
  error?: string;
}

const JOBS = new Map<string, Job>();
const JOB_TTL_MS = 30 * 60_000;

function sweepJobs(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, j] of JOBS) if (j.startedAt < cutoff) JOBS.delete(id);
}

/* ── 路由 ─────────────────────────────────────────────────────────────────── */

agentApiRouter.use(requireKey);

/** 這把金鑰能用的品牌與任務。Hermes 的 skill 靠這個知道自己能做什麼。 */
agentApiRouter.get("/tasks", async (req: Request, res: Response) => {
  const brandId = Number(req.query.brandId);
  if (!allowedBrandIds().has(brandId)) {
    res.status(403).json({ error: "這把金鑰不能存取這個品牌" });
    return;
  }
  try {
    const { listAgentApiTasks } = await import("../_core/agentApiTasks");
    res.json({ brandId, tasks: await listAgentApiTasks(brandId) });
  } catch (e: any) {
    console.error("[agentApi] tasks failed:", e?.message ?? e);
    res.status(500).json({ error: "無法取得任務清單" });
  }
});

/**
 * 跑一個任務。立刻回 jobId，結果用 GET /job/:id 取。
 *
 * 計費對象是「品牌的擁有者」，不是呼叫端說了算 —— 呼叫端只能指定 brandId，
 * 誰付錢由資料庫決定，這樣金鑰外流也沒辦法把帳記到別人頭上。
 */
agentApiRouter.post("/run", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const brandId = Number(body.brandId);
  const taskId = String(body.taskId ?? "").trim();
  const tier = body.tier === "60s" || body.tier === "99s" ? body.tier : "30s";
  const inputs: Record<string, string> = {};
  if (body.inputs && typeof body.inputs === "object") {
    for (const [k, v] of Object.entries(body.inputs as Record<string, unknown>)) {
      if (typeof v === "string") inputs[k] = v;
    }
  }

  if (!allowedBrandIds().has(brandId)) {
    res.status(403).json({ error: "這把金鑰不能存取這個品牌" });
    return;
  }
  if (!taskId) {
    res.status(400).json({ error: "缺少 taskId" });
    return;
  }
  if (!Object.values(inputs).some((v) => v.trim().length > 0)) {
    // 空白素材餵進去，模型會自己編一個主題 —— 產出看起來完整但跟使用者想講的
    // 無關，而且呼叫端不會察覺。擋在扣款之前。
    res.status(400).json({ error: "inputs 全為空 —— 至少要有一個欄位有內容" });
    return;
  }

  try {
    const { resolveTaskForRun } = await import("../routers/quickTaskRouter");
    const { template, config } = await resolveTaskForRun(taskId);

    const { default: localPool } = await import("../localDb");
    const [rows]: any = await localPool.execute(
      `SELECT userId FROM brands WHERE id = ? LIMIT 1`, [brandId],
    );
    const ownerUserId = Number(rows?.[0]?.userId);
    if (!Number.isFinite(ownerUserId) || ownerUserId <= 0) {
      res.status(409).json({ error: "這個品牌沒有可計費的擁有者" });
      return;
    }

    const { preflightCostCheck } = await import("../llmWithBilling");
    const guard = await preflightCostCheck(ownerUserId);
    if (!guard.ok) {
      // 額度/試用到期用 402，讓 Hermes 可以跟其他錯誤分開處理 ——
      // 這種情況要跟使用者說「方案到期」，不是「系統出錯，請再試一次」。
      res.status(402).json({ error: guard.reason });
      return;
    }

    sweepJobs();
    const jobId = crypto.randomUUID();
    JOBS.set(jobId, { status: "running", taskId, brandId, startedAt: Date.now() });
    res.status(202).json({
      jobId,
      taskId,
      estimatedSeconds: tier === "30s" ? 40 : tier === "60s" ? 70 : 140,
    });

    // 背景跑。這裡刻意不 await —— 回應已經送出去了。
    (async () => {
      try {
        const { runOrchestra } = await import("../_core/quickTaskOrchestra");
        const r = await runOrchestra({
          template, config, inputs, brandId, userId: ownerUserId, tier: tier as any,
        });
        const v = r.variants?.[0];
        const job = JOBS.get(jobId);
        if (!job) return; // 已經被掃掉了
        if (!v?.caption) {
          job.status = "failed";
          job.error = r.errors?.[0] ?? "沒有產出內容";
          return;
        }
        job.status = "done";
        job.result = {
          caption: v.caption,
          hashtags: v.hashtags ?? [],
          imageBrief: (v.image?.style ?? "").trim() || null,
          images: (v.cards?.length ? v.cards.map((c) => c.image?.url) : [v.image?.url])
            .filter((u): u is string => typeof u === "string" && u.startsWith("https://")),
          cards: (v.cards ?? []).map((c) => ({
            headline: c.headline, body: c.body, imageUrl: c.image?.url ?? null,
          })),
        };
      } catch (e: any) {
        const job = JOBS.get(jobId);
        if (job) { job.status = "failed"; job.error = String(e?.message ?? e).slice(0, 300); }
        console.error("[agentApi] run failed:", e?.message ?? e);
      }
    })();
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    // 任務 id 打錯是呼叫端的問題，回 400 讓 Hermes 那邊能直接看到是什麼字打錯。
    if (/Unknown task id|No config for/.test(msg)) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error("[agentApi] run setup failed:", msg);
    res.status(500).json({ error: "無法啟動任務" });
  }
});

agentApiRouter.get("/job/:jobId", (req: Request, res: Response) => {
  const job = JOBS.get(String(req.params.jobId));
  if (!job) {
    // 不存在與已過期分不出來，都回 404。呼叫端的處理方式一樣：請使用者重跑。
    res.status(404).json({ error: "job 不存在或已過期" });
    return;
  }
  if (job.status === "running") {
    res.json({ status: "running", elapsedSeconds: Math.round((Date.now() - job.startedAt) / 1000) });
    return;
  }
  if (job.status === "failed") {
    res.json({ status: "failed", error: job.error ?? "unknown" });
    return;
  }
  res.json({ status: "done", ...job.result });
});

/** 健康檢查：確認金鑰與品牌白名單都設好了（不回傳金鑰內容）。 */
agentApiRouter.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    brands: [...allowedBrandIds()],
    activeJobs: JOBS.size,
  });
});
