/**
 * positioningJobRunner — fire-and-forget background pipeline runner.
 *
 * CJ direction (2026-05-07):
 *   "用戶建立好我們就背景執行，retry 直到成功，定位流程不用集（可
 *   平行）但要穩定順暢。 完成時左下通知。 計算成本也收費。"
 *
 * Architecture:
 *   - Caller fires startPositioningJob(...) and returns immediately.
 *   - We spawn a detached async loop (setImmediate) that:
 *       1. Marks status=running in positioning_jobs.
 *       2. Runs each step with retry (5 attempts, exponential backoff).
 *       3. Records every LLM call to usage_log for cost tracking.
 *       4. Where steps are independent (no semantic dependency on prior
 *          step output), runs them in parallel batches.
 *       5. On final success → status=done, finishedAt=now.
 *       6. On final fail (5 retries x all 5 backoffs exhausted on a
 *          non-recoverable error) → status=failed, lastError=msg.
 *   - Steps write directly to <entity>.positioning JSON (single source of
 *     truth — same column the 品牌大腦 cards + manual edits use). Brand
 *     steps emit { [segmentId]: <segment obj> } in positioningSchema.ts
 *     shape; merge is a plain top-level spread.
 *
 * Retry schedule (per step, per attempt index):
 *   1: 5s    2: 15s    3: 45s    4: 2min    5: 5min
 *   max wall budget per step ≈ 7-8 minutes
 *
 * Step parallelism:
 *   Brand pipeline (10 steps, = BRAND_SEGMENTS) — partitioned into waves:
 *     wave 1 (parallel): audience, competition, trends, origin
 *     wave 2 (parallel): values, differentiation
 *     wave 3: goldenCircle
 *     wave 4: tagline
 *     wave 5: taglineScore
 *     wave 6: voice
 *
 * Product pipeline (6 steps) — short version, mostly parallel.
 * Event   pipeline (4 steps) — even shorter, all parallel after step 1.
 */
import localPool from "../localDb";
import { isPositioningLocked } from "./positioningLock";

export type EntityKind = "brand" | "product" | "event";
export type JobStatus = "pending" | "running" | "done" | "failed";

const RETRY_SCHEDULE_MS = [5_000, 15_000, 45_000, 120_000, 300_000];

// In-process registry to prevent double-firing the same entity job.
const activeJobs = new Set<string>();
const jobKey = (kind: EntityKind, id: number) => `${kind}:${id}`;

/** Step definition. Each pipeline step has an id, a label, deps (other
 *  step ids), and a runner returning the step's output (will be merged
 *  into positioning JSON). */
export interface PositioningStep {
  id: string;
  label: string;
  deps: string[]; // step ids that must complete before this one
  run: (ctx: StepContext) => Promise<Record<string, any>>;
}

export interface StepContext {
  userId: number;
  entityKind: EntityKind;
  entityId: number;
  brandName: string;
  industry?: string;
  description?: string;
  /** Scraped website/social content for brands, or standard product-page
   *  metadata for products. Injected before wave-1 so all steps are grounded. */
  realContent?: string;
  /** 2026-07-17 多市場: compact market block from buildMarketContext —
   *  scopes competitor / trend / audience research to the brand's
   *  target market. Loaded once per pipeline in runPipelineDetached
   *  (product/event inherit the parent brand's market). */
  marketContext?: string;
  /** Brand's outputLanguage (BCP 47). Steps' SYS language derives from
   *  the builder opts; this is here for ctx-level consumers. */
  outputLanguage?: string;
  /** 2026-07-23 (CJ IRIS 訓練「要確保都是用他們確定的客群…系統做更深入
   *  地描繪」): brands.targetAudience — the brand-confirmed target audience.
   *  When set, it is a HARD ANCHOR: audience-related steps must deepen this
   *  exact segment (persona, pains, needs, MOT), never replace it with an
   *  invented one. Loaded from the parent brand row for product/event too. */
  officialAudience?: string;
  // outputs from already-completed steps in this run, keyed by step id
  prevOutputs: Record<string, any>;
  /** Helper to record cost — runner calls this after each LLM call. */
  recordUsage: (kind: string, model: string, inputTokens: number, outputTokens: number, costUsd: number) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────

async function upsertJob(userId: number, kind: EntityKind, entityId: number, totalSteps: number): Promise<number> {
  const [r]: any = await localPool.execute(
    `INSERT INTO positioning_jobs (userId, entityKind, entityId, status, currentStep, totalSteps, startedAt)
          VALUES (?, ?, ?, 'pending', 0, ?, NOW(3))
       ON DUPLICATE KEY UPDATE
           status = 'pending',
           currentStep = 0,
           retryCount = 0,
           lastError = NULL,
           startedAt = NOW(3),
           finishedAt = NULL,
           totalSteps = VALUES(totalSteps)`,
    [userId, kind, entityId, totalSteps],
  );
  // ON DUP UPDATE returns insertId of original row; fetch via SELECT.
  // MUST include userId to avoid returning another user's job row when
  // entity IDs collide across users (e.g., both have brand id=1).
  const [rows]: any = await localPool.execute(
    `SELECT id FROM positioning_jobs WHERE userId = ? AND entityKind = ? AND entityId = ? ORDER BY id DESC LIMIT 1`,
    [userId, kind, entityId],
  );
  return Number((rows as any[])[0]?.id ?? r?.insertId ?? 0);
}

async function setJobStatus(jobId: number, status: JobStatus, fields: Partial<{
  currentStep: number;
  retryCount: number;
  lastError: string | null;
  finishedAt: boolean; // true → set NOW()
}> = {}): Promise<void> {
  const sets: string[] = ["status = ?"];
  const params: any[] = [status];
  if (fields.currentStep !== undefined) { sets.push("currentStep = ?"); params.push(fields.currentStep); }
  if (fields.retryCount !== undefined)  { sets.push("retryCount = ?");  params.push(fields.retryCount); }
  if (fields.lastError !== undefined)   { sets.push("lastError = ?");   params.push(fields.lastError); }
  if (fields.finishedAt) sets.push("finishedAt = NOW(3)");
  params.push(jobId);
  await localPool.execute(
    `UPDATE positioning_jobs SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );
}

async function recordUsageRow(args: {
  userId: number; entityKind?: EntityKind; entityId?: number;
  kind: string; model: string;
  inputTokens: number; outputTokens: number; costUsd: number;
}): Promise<void> {
  try {
    await localPool.execute(
      `INSERT INTO usage_log (userId, entityKind, entityId, kind, model, inputTokens, outputTokens, costUsd)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [args.userId, args.entityKind ?? null, args.entityId ?? null,
       args.kind, args.model, args.inputTokens, args.outputTokens, args.costUsd],
    );
  } catch (e) {
    // Non-fatal: usage logging shouldn't block the pipeline
    console.warn("[positioningJobRunner] usage_log write failed:", (e as Error).message);
  }
}

/** Read current entity row's positioning JSON, merge `patch` into it,
 *  and write back. Used by step runners to persist their output.
 *
 *  2026-05-17 ROOT-CAUSE FIX: ALL scopes (brand/product/event) now write
 *  the `positioning` column — the single source of truth that the 品牌大腦
 *  cards read (brands.positioning.<segmentId>). Brand previously wrote
 *  `soworkAnalysis` keyed by step ids; that column + key shape never
 *  matched the card schema so cards were always empty. The brand steps
 *  now emit { [segmentId]: <segment obj> } (positioningSchema.ts shape),
 *  so a plain spread-merge into `positioning` is correct.
 *
 *  Spread-merge preserves wizard-written sibling keys: _assets,
 *  _aiPrompts, _interim, and any manually-edited segments not in this run. */
async function mergePositioning(kind: EntityKind, id: number, userId: number, patch: Record<string, any>): Promise<void> {
  // Defense-in-depth: even if a pipeline was already mid-flight when the
  // user locked 定位, don't let a step that finishes afterwards overwrite
  // it. The real guard is upstream (startPositioningJob / resumeInterrupted
  // PositioningJobs / the router mutations skip firing locked brands at
  // all) — this is the last line so no write path can slip through.
  if (await isPositioningLocked(kind, id, userId)) {
    console.warn(`[positioningJobRunner] skip merge — ${kind} ${id} positioning is locked`);
    return;
  }
  const table = kind === "brand" ? "brands" : kind === "product" ? "products" : "events";
  const col = "positioning";
  const [rows]: any = await localPool.execute(
    `SELECT \`${col}\` AS payload FROM \`${table}\` WHERE id = ? AND userId = ? LIMIT 1`,
    [id, userId],
  );
  const row = (rows as any[])[0];
  if (!row) throw new Error(`${kind} ${id} not found`);
  let cur: any = row.payload;
  if (typeof cur === "string") { try { cur = JSON.parse(cur); } catch { cur = {}; } }
  cur = cur ?? {};
  // Top-level spread: { ...prior segments + _assets/_aiPrompts/_interim, ...new segments }
  const next = { ...cur, ...patch };
  await localPool.execute(
    `UPDATE \`${table}\` SET \`${col}\` = ? WHERE id = ? AND userId = ?`,
    [JSON.stringify(next), id, userId],
  );
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget. Returns immediately; pipeline runs in background.
 * Caller never awaits; status is queryable via getPositioningJob.
 */
export function startPositioningJob(args: {
  userId: number;
  entityKind: EntityKind;
  entityId: number;
  brandName: string;
  industry?: string;
  description?: string;
  website?: string;
  steps: PositioningStep[];
}): void {
  const k = jobKey(args.entityKind, args.entityId);
  if (activeJobs.has(k)) {
    console.log(`[positioningJobRunner] already running for ${k}, skip`);
    return;
  }
  activeJobs.add(k);
  // Detached execution — does NOT block caller
  setImmediate(() => runPipelineDetached(args).finally(() => activeJobs.delete(k)));
}

/**
 * Call once at server startup. Scans positioning_jobs for any rows with
 * status='pending' or status='running' (i.e. the in-process setImmediate
 * pipeline was killed by a pm2 restart). Re-queues each one so they
 * resume automatically without the user needing to click "re-analyze".
 *
 * Skips rows whose finishedAt is already set (should not exist for those
 * statuses, but guards against data corruption).
 *
 * Does NOT crash the server if the DB is unavailable — failures are
 * logged and swallowed so startup completes.
 */
export async function resumeInterruptedPositioningJobs(): Promise<void> {
  try {
    // 2026-07-19 (CJ「目標受眾一直被改回去」root cause): zombie rows from
    // June were stuck in 'running' forever, so EVERY pm2 restart re-queued
    // them → each deploy silently re-ran 12 pipelines and overwrote those
    // brands' positioning (including manual edits). Only jobs interrupted
    // RECENTLY (≤2h) are worth resuming; anything older is a zombie →
    // mark failed so it never auto-runs again (user can re-trigger manually).
    await localPool.execute(
      `UPDATE positioning_jobs
          SET status = 'failed',
              lastError = COALESCE(lastError, 'stale job — not auto-resumed after restart (>2h old)'),
              finishedAt = NOW(3)
        WHERE status IN ('pending','running')
          AND finishedAt IS NULL
          AND startedAt < NOW() - INTERVAL 2 HOUR`,
    );

    const [rows]: any = await localPool.execute(
      `SELECT pj.userId, pj.entityKind, pj.entityId, pj.totalSteps,
              COALESCE(b.brandName, p.name, e.name) AS entityName,
              b.industry                             AS brandIndustry,
              p.positioning                          AS productPositioning,
              COALESCE(b.outputLanguage, pb.outputLanguage, eb.outputLanguage) AS outputLanguage
         FROM positioning_jobs pj
         LEFT JOIN brands   b ON pj.entityKind = 'brand'   AND b.id = pj.entityId AND b.userId   = pj.userId
         LEFT JOIN products p ON pj.entityKind = 'product' AND p.id = pj.entityId AND p.userId   = pj.userId
         LEFT JOIN events   e ON pj.entityKind = 'event'   AND e.id = pj.entityId AND e.userId   = pj.userId
         LEFT JOIN brands  pb ON pb.id = p.brandId
         LEFT JOIN brands  eb ON eb.id = e.brandId
        WHERE pj.status IN ('pending', 'running')
          AND pj.finishedAt IS NULL`,
    );

    const interrupted = rows as any[];
    if (interrupted.length === 0) {
      console.log("[positioningJobRunner] startup: no interrupted jobs found");
      return;
    }

    console.log(`[positioningJobRunner] startup: resuming ${interrupted.length} interrupted job(s)`);

    // Import step builders lazily to avoid circular-import issues at module load.
    const { buildBrandPositioningSteps, buildProductPositioningSteps, buildEventPositioningSteps } =
      await import("./positioningSteps");

    for (const row of interrupted) {
      const kind = String(row.entityKind) as EntityKind;
      const entityId = Number(row.entityId);
      const userId   = Number(row.userId);
      const name     = String(row.entityName ?? "");

      if (!name || !entityId || !userId) {
        console.warn(`[positioningJobRunner] startup: skip orphan job (no entity row) kind=${kind} entityId=${entityId}`);
        continue;
      }

      // 2026-08-21: a job that was legitimately in-flight when the user
      // locked 定位 mid-run must not resume after a restart and overwrite
      // the now-finalized content. Mark it failed (not silently dropped)
      // so it's visible instead of looking like it vanished.
      if (await isPositioningLocked(kind, entityId, userId)) {
        console.log(`[positioningJobRunner] startup: skip resume for locked ${kind}:${entityId}`);
        await localPool.execute(
          `UPDATE positioning_jobs SET status = 'failed', lastError = ?, finishedAt = NOW(3)
            WHERE userId = ? AND entityKind = ? AND entityId = ? AND status IN ('pending','running')`,
          ["定位已鎖定，未重新推導", userId, kind, entityId],
        );
        continue;
      }

      // Extract product page context from positioning JSON if present.
      let description: string | undefined;
      let website: string | undefined;
      if (kind === "product" && row.productPositioning) {
        try {
          const pos = typeof row.productPositioning === "string"
            ? JSON.parse(row.productPositioning)
            : row.productPositioning;
          description = pos?.description ?? pos?._interim?.description ?? pos?.summary ?? undefined;
          website = pos?.productUrl ?? pos?.website ?? undefined;
        } catch { /* ignore */ }
      }

      // 2026-07-17 多市場: resume with the brand's outputLanguage (was
      // hardcoded zh-TW — a US brand's interrupted job resumed in Chinese).
      const stepOpts = { lang: "zh-TW", outputLanguage: row.outputLanguage ?? undefined };
      const steps =
        kind === "brand"   ? buildBrandPositioningSteps(stepOpts) :
        kind === "product" ? buildProductPositioningSteps(stepOpts) :
                             buildEventPositioningSteps(stepOpts);

      console.log(`[positioningJobRunner] startup: re-queuing ${kind}:${entityId} "${name}"`);
      startPositioningJob({
        userId,
        entityKind: kind,
        entityId,
        brandName: name,
        industry: row.brandIndustry ?? undefined,
        description,
        website,
        steps,
      });
    }
  } catch (err) {
    // Non-fatal: startup recovery failure must not block the server.
    console.error("[positioningJobRunner] startup: recovery scan failed:", (err as Error).message);
  }
}

export async function getPositioningJob(entityKind: EntityKind, entityId: number, userId: number): Promise<{
  status: JobStatus;
  currentStep: number;
  totalSteps: number;
  retryCount: number;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
} | null> {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT status, currentStep, totalSteps, retryCount, lastError, startedAt, finishedAt
         FROM positioning_jobs
        WHERE userId = ? AND entityKind = ? AND entityId = ?
        ORDER BY id DESC LIMIT 1`,
      [userId, entityKind, entityId],
    );
    const row = (rows as any[])[0];
    if (!row) return null;
    let status = String(row.status) as JobStatus;
    let lastError: string | null = row.lastError ?? null;
    // 2026-05-13 (CJ「分析中 13/14，但內容沒有產出」): if status='running'
    // but startedAt is older than 10 min, the runner process was killed
    // (server restart mid-run is the usual cause). Auto-mark failed so the
    // user can re-trigger instead of staring at a phantom progress bar.
    if (status === "running" && row.startedAt) {
      const ageMs = Date.now() - new Date(row.startedAt).getTime();
      if (ageMs > 10 * 60_000) {
        try {
          await localPool.execute(
            `UPDATE positioning_jobs
                SET status = 'failed',
                    lastError = COALESCE(lastError, 'auto-marked failed: runner appeared crashed (>10min since startedAt)'),
                    finishedAt = NOW()
              WHERE userId = ? AND entityKind = ? AND entityId = ?
                AND status = 'running'`,
            [userId, entityKind, entityId],
          );
          status = "failed";
          lastError = lastError ?? "runner appeared crashed (server restarted mid-run)";
        } catch { /* best-effort */ }
      }
    }
    return {
      status,
      currentStep: Number(row.currentStep),
      totalSteps:  Number(row.totalSteps),
      retryCount:  Number(row.retryCount),
      lastError,
      startedAt:   row.startedAt ? new Date(row.startedAt).toISOString() : null,
      finishedAt:  row.finishedAt ? new Date(row.finishedAt).toISOString() : null,
    };
  } catch {
    return null;
  }
}

/** Pull recent jobs that just transitioned to done/failed since `since`.
 *  Used by the notification center to surface "X 完整定位完成" toasts. */
export async function getRecentJobCompletions(userId: number, since: string): Promise<Array<{
  id: number;
  entityKind: EntityKind;
  entityId: number;
  status: JobStatus;
  finishedAt: string;
}>> {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT id, entityKind, entityId, status, finishedAt
         FROM positioning_jobs
        WHERE userId = ? AND status IN ('done','failed') AND finishedAt > ?
        ORDER BY finishedAt DESC LIMIT 20`,
      [userId, since],
    );
    return (rows as any[]).map((r) => ({
      id:         Number(r.id),
      entityKind: String(r.entityKind) as EntityKind,
      entityId:   Number(r.entityId),
      status:     String(r.status) as JobStatus,
      finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString() : "",
    }));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────
// Internal pipeline runner
// ─────────────────────────────────────────────────────────────────────

async function runPipelineDetached(args: {
  userId: number;
  entityKind: EntityKind;
  entityId: number;
  brandName: string;
  industry?: string;
  description?: string;
  website?: string;
  steps: PositioningStep[];
}): Promise<void> {
  const jobId = await upsertJob(args.userId, args.entityKind, args.entityId, args.steps.length);
  await setJobStatus(jobId, "running");

  // Fetch real website/social content BEFORE wave execution so every step
  // can ground its output in actual brand content (not hallucinated from name).
  // Only meaningful for brand entities (getBrandRealContent reads brands table).
  let realContent: string | undefined;
  if (args.entityKind === "brand") {
    try {
      const { getBrandRealContent } = await import("./brandRealContent");
      const content = await getBrandRealContent(args.entityId);
      if (content.hasContent && content.context) {
        realContent = content.context;
        console.log(`[positioningJobRunner] fetched real content for brand ${args.entityId}: ${realContent.slice(0, 80)}...`);
      } else {
        console.log(`[positioningJobRunner] no real content available for brand ${args.entityId} (website may be empty or bot-blocked)`);
      }
    } catch (e: any) {
      console.warn(`[positioningJobRunner] getBrandRealContent failed for brand ${args.entityId}:`, e?.message ?? e);
    }
  } else if (args.entityKind === "product" && args.website) {
    try {
      const { fetchProductMeta } = await import("./productMeta");
      const meta = await fetchProductMeta(args.website);
      if (meta.source !== "none") {
        realContent = [
          "【商品頁資訊】",
          meta.name ? `名稱：${meta.name}` : "",
          meta.price ? `價格：${meta.currency ? `${meta.currency} ` : ""}${meta.price}` : "",
          meta.description ? `說明：${meta.description}` : "",
          `商品頁：${args.website}`,
        ].filter(Boolean).join("\n");
        console.log(`[positioningJobRunner] fetched product metadata for product ${args.entityId} from ${meta.source}`);
      }
    } catch (e: any) {
      console.warn(`[positioningJobRunner] fetchProductMeta failed for product ${args.entityId}:`, e?.message ?? e);
    }
  }

  // 2026-07-17 多市場: load the entity's market ONCE per pipeline and inject
  // into every step's ctx so competitor / trend / audience research is
  // scoped to the brand's target market (product/event inherit from the
  // parent brand). Fail-safe: no market fields → empty context (= legacy).
  let marketContext: string | undefined;
  let outputLanguage: string | undefined;
  let officialAudience: string | undefined;
  try {
    const brandIdForMarket = args.entityKind === "brand"
      ? args.entityId
      : await (async () => {
          const table = args.entityKind === "product" ? "products" : "events";
          const [r]: any = await localPool.execute(
            `SELECT brandId FROM \`${table}\` WHERE id = ? LIMIT 1`, [args.entityId]);
          return Number((r as any[])[0]?.brandId ?? 0) || null;
        })();
    if (brandIdForMarket) {
      const [br]: any = await localPool.execute(
        `SELECT targetCountry, outputLanguage, marketContextOverride, targetAudience FROM brands WHERE id = ? LIMIT 1`,
        [brandIdForMarket],
      );
      const b = (br as any[])[0];
      if (b?.targetCountry) {
        const { buildMarketContext } = await import("./marketProfiles");
        marketContext = await buildMarketContext(b.targetCountry, b.outputLanguage, b.marketContextOverride) || undefined;
        outputLanguage = b.outputLanguage ?? undefined;
      }
      // 2026-07-23: brand-confirmed audience = hard anchor for all audience
      // reasoning (brand steps + product/event steps inherit it).
      const ta = typeof b?.targetAudience === "string" ? b.targetAudience.trim() : "";
      if (ta) officialAudience = ta;
    }
  } catch (e: any) {
    console.warn(`[positioningJobRunner] market load failed (non-fatal):`, e?.message ?? e);
  }

  // Build adjacency: id → step
  const stepMap = new Map(args.steps.map((s) => [s.id, s]));
  const completed = new Set<string>();
  const outputs: Record<string, any> = {};
  let currentStepNum = 0;

  // Topo-execute in waves — each wave = all steps whose deps are satisfied
  while (completed.size < args.steps.length) {
    const ready = args.steps.filter((s) =>
      !completed.has(s.id) && s.deps.every((d) => completed.has(d)),
    );
    if (ready.length === 0) {
      // Should not happen if deps are well-formed
      const err = `[positioningJobRunner] no ready steps but ${completed.size}/${args.steps.length} done — graph cycle?`;
      console.error(err);
      await setJobStatus(jobId, "failed", { lastError: err, finishedAt: true });
      return;
    }

    // Run this wave in parallel
    const recordUsage = async (kind: string, model: string, inputTokens: number, outputTokens: number, costUsd: number) => {
      await recordUsageRow({
        userId: args.userId, entityKind: args.entityKind, entityId: args.entityId,
        kind, model, inputTokens, outputTokens, costUsd,
      });
    };

    const results = await Promise.all(ready.map(async (step) => {
      // Per-step retry loop
      for (let attempt = 0; attempt < RETRY_SCHEDULE_MS.length; attempt++) {
        try {
          const ctx: StepContext = {
            userId: args.userId,
            entityKind: args.entityKind,
            entityId: args.entityId,
            brandName: args.brandName,
            industry: args.industry,
            description: args.description,
            realContent,
            marketContext,
            outputLanguage,
            officialAudience,
            prevOutputs: outputs,
            recordUsage,
          };
          const result = await step.run(ctx);
          // Persist this step's output into positioning JSON
          await mergePositioning(args.entityKind, args.entityId, args.userId, result);
          return { step, result, ok: true as const };
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          console.warn(`[positioningJobRunner] step ${step.id} attempt ${attempt+1}/${RETRY_SCHEDULE_MS.length} failed: ${msg}`);
          await setJobStatus(jobId, "running", {
            currentStep: currentStepNum,
            retryCount: attempt + 1,
            lastError: msg,
          });
          if (attempt < RETRY_SCHEDULE_MS.length - 1) {
            await new Promise((r) => setTimeout(r, RETRY_SCHEDULE_MS[attempt]));
          } else {
            return { step, result: null, ok: false as const, error: msg };
          }
        }
      }
      return { step, result: null, ok: false as const, error: "exhausted" };
    }));

    // Mark successes; if any failed after all retries → mark job failed but keep going for other steps
    let anyFailedFinal = false;
    for (const r of results) {
      if (r.ok) {
        completed.add(r.step.id);
        outputs[r.step.id] = r.result;
        currentStepNum++;
        await setJobStatus(jobId, "running", { currentStep: currentStepNum });
      } else {
        anyFailedFinal = true;
        // Still mark as completed in graph sense so dependent steps can attempt
        // (they may or may not work — pragmatic: try them)
        completed.add(r.step.id);
        outputs[r.step.id] = null;
      }
    }

    if (anyFailedFinal && completed.size === args.steps.length) {
      await setJobStatus(jobId, "failed", {
        currentStep: currentStepNum,
        lastError: "one or more steps exhausted retries",
        finishedAt: true,
      });
      return;
    }
  }

  // 2026-05-17: brands.positioning.<segment> is now the single source of
  // truth (cards read it directly — no projection needed for the UI). But
  // several downstream readiness checks + verifyAndFinalize still gate on
  // the legacy flat columns + positioningStatus. Keep a MINIMAL finalize
  // that DERIVES those columns from the new positioning.<segment> shape
  // (NOT from soworkAnalysis). Goal: one canonical shape, flat columns are
  // a derived convenience only.
  if (args.entityKind === "brand") {
    try {
      await finalizeBrandAfterPipeline(args.userId, args.entityId);
    } catch (e) {
      console.error("[positioningJobRunner] finalize step failed:", e);
      // positioning.<segment> data is already persisted (the cards work);
      // only the derived flat columns may be stale. User can re-run
      // finalize via positioningJobs.verifyAndFinalize. Don't fail the job.
    }
  }
  await setJobStatus(jobId, "done", { currentStep: args.steps.length, finishedAt: true });
}

/* ─────────────────────────────────────────────────────────────────────
 *  Brand finalization: DERIVE legacy flat columns from the canonical
 *  brands.positioning.<segment> structure (positioningSchema.ts shape).
 *  The 品牌大腦 cards read positioning.<segment> directly and do NOT
 *  depend on this — these columns are a derived convenience for legacy
 *  readiness checks (positioningStatus / onboardingStep / isEstimate)
 *  and the few consumers still on flat columns.
 * ───────────────────────────────────────────────────────────────────── */

/** Extract the first non-empty string from a list of candidate paths.
 *  Each candidate is a chain of property accessors as a dot-path. */
function pickStr(obj: any, ...paths: string[]): string | null {
  for (const p of paths) {
    let cur: any = obj;
    for (const key of p.split(".")) {
      if (cur == null) break;
      cur = cur[key];
    }
    if (typeof cur === "string" && cur.trim()) return cur.trim();
    if (Array.isArray(cur) && cur.length > 0) {
      const first = cur[0];
      if (typeof first === "string" && first.trim()) return first.trim();
      if (first && typeof first === "object") {
        const s = (first.text ?? first.title ?? first.headline ?? first.name
          ?? first.label ?? first.body ?? "")
          .toString().trim();
        if (s) return s;
      }
    }
  }
  return null;
}

/** Read brands.positioning, derive legacy flat columns, mark complete. */
export async function finalizeBrandAfterPipeline(userId: number, brandId: number): Promise<{
  updated: number;
  filled: Record<string, boolean>;
}> {
  const [rows]: any = await localPool.execute(
    `SELECT positioning FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
    [brandId, userId],
  );
  const row = (rows as any[])[0];
  if (!row) throw new Error(`brand ${brandId} not found for user ${userId}`);
  let a: any = row.positioning;
  if (typeof a === "string") { try { a = JSON.parse(a); } catch { a = {}; } }
  a = a ?? {};

  // Derive from positioning.<segment> using the canonical field keys
  // (positioningSchema.ts BRAND_SEGMENTS).
  const tagline = pickStr(a,
    "tagline.zhTagline",
    "tagline.enTagline",
  );
  const valueProposition = pickStr(a,
    "differentiation.summary",
    "goldenCircle.why",
    "differentiation.functional",
  );
  const targetMarket = pickStr(a,
    "audience.primary",
  );
  const audienceA = pickStr(a,
    "audience.primary",
  );
  const audienceB = pickStr(a,
    "audience.secondary",
  );
  const emotionalDiff = pickStr(a,
    "differentiation.emotional",
  );
  const functionalDiff = pickStr(a,
    "differentiation.functional",
  );

  // Build COALESCE-style UPDATE: only overwrite columns where we extracted
  // a non-null value. Existing manual edits stay put.
  const sets: string[] = [];
  const params: any[] = [];
  const filled: Record<string, boolean> = {};
  // 2026-05-17: derived values come from the new positioning.<segment>
  // prose which is far longer than these LEGACY varchar columns →
  // "Data too long for column 'audienceB'" threw and aborted finalize
  // (status never flipped to completed). These columns are legacy
  // fallbacks (agentContextLoader); a trimmed value is sufficient.
  // 2026-07-19 (CJ「基本資料頁 vs 定位頁 標語不一致」): was
  // COALESCE(NULLIF(col,''), ?) — only wrote when the column was EMPTY.
  // But runInterim populates these columns EARLY with the quick-pulse
  // draft, so the final canonical value (e.g. tagline from the full
  // pipeline) never landed and 基本資料頁 showed the stale interim draft
  // forever. Canonical positioning JSON is the single source of truth →
  // these legacy mirror columns now ALWAYS follow it on finalize.
  // (Manual tagline edits stay safe: brand.update now writes the edit
  // into positioning.tagline.zhTagline too, so finalize re-mirrors it.)
  const maybeSet = (col: string, val: string | null) => {
    const v = val ? String(val).slice(0, 180) : val;
    filled[col] = !!v;
    if (v) { sets.push(`${col} = ?`); params.push(v); }
  };
  maybeSet("tagline", tagline);
  maybeSet("valueProposition", valueProposition);
  maybeSet("targetMarket", targetMarket);
  maybeSet("audienceA", audienceA);
  maybeSet("audienceB", audienceB);
  maybeSet("emotionalDiff", emotionalDiff);
  maybeSet("functionalDiff", functionalDiff);

  // 2026-07-19 (CJ「基本資料頁：產業/品牌在做什麼/AI 定位摘要 在定位完成後
  // 仍空白」): mirror the two 基本資料 text fields too. Unlike tagline these
  // are user-editable ground-truth fields with NO write-back into the
  // positioning JSON, so overwriting would clobber manual corrections —
  // fill-if-empty only (COALESCE(NULLIF(col,''))).
  const fillIfEmpty = (col: string, val: string | null, cap = 2000) => {
    const v = val ? String(val).slice(0, cap) : null;
    filled[col] = !!v;
    if (v) { sets.push(`${col} = COALESCE(NULLIF(${col}, ''), ?)`); params.push(v); }
  };
  fillIfEmpty("positioningSummary", pickStr(a, "differentiation.summary", "goldenCircle.why"));
  fillIfEmpty("description", pickStr(a, "goldenCircle.what", "differentiation.summary"));

  // Always flip status + step + isEstimate, regardless of whether we found
  // every field. Pipeline successfully completed → user shouldn't be told
  // "not ready" just because one column couldn't be picked.
  sets.push("positioningStatus = 'completed'");
  sets.push("onboardingStep = 11");
  sets.push("isEstimate = 0");

  const sql = `UPDATE brands SET ${sets.join(", ")} WHERE id = ? AND userId = ?`;
  params.push(brandId, userId);
  try {
    const [res]: any = await localPool.execute(sql, params);
    return { updated: Number(res?.affectedRows ?? 0), filled };
  } catch (e) {
    // Never let a legacy-column write block completion. The canonical
    // data already lives in brands.positioning.<segment>; flip status
    // so the user isn't told "not ready" over a legacy fallback column.
    console.error("[positioningJobRunner] finalize flat-column UPDATE failed; status-only fallback:", (e as Error)?.message);
    await localPool.execute(
      `UPDATE brands SET positioningStatus='completed', onboardingStep=11, isEstimate=0 WHERE id = ? AND userId = ?`,
      [brandId, userId],
    );
    return { updated: 1, filled };
  }
}
