/**
 * quickTaskOrchestra — Plan B 20-second parallel fanout (2026-05-05).
 *
 * For each FB 30s task we run, in parallel:
 *   1. caption_writer (existing template agent) → 1 LLM call → N caption variants
 *   2. image_director (Mandy Cheng / 239184)   → 1 LLM call → N image briefs
 *   3. flux-schnell × N                          → parallel image gen
 *
 * URL fetch + persona loads + brand context all kick off at t=0 alongside.
 *
 * Hard ceiling 20 seconds wall-clock. Per-image budget 7s. If an image
 * doesn't make it, the variant ships with image.status="timeout" and the UI
 * shows a "補完中" chip — orchestra never blocks the whole carousel.
 *
 * Cost ~$0.017 / orchestra (1 LLM call ×2 + Flux Schnell ×5 @ $0.003).
 */
import { callModel, type ModelProvider } from "./multiModelRouter";
import { dispatchGenerate } from "./mediaGen";
import { findFirstUrl, fetchUrlSummary, formatUrlSummaryForPrompt, type UrlSummary } from "./urlContext";
import { buildBrandPrefix as buildBrandContext } from "./brandContext";
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";
import localPool from "../localDb";

const HARD_BUDGET_MS  = 20_000;
const PER_IMAGE_MS    = 10_000; // PiAPI Flux Schnell: 3–7s typical
const LLM_BUDGET_MS   = 10_000;

export interface AgentMeta {
  id: number;
  name: string;
  title: string;
  avatarUrl: string | null;
}

export interface OrchestraStage {
  key: string;
  label: string;
  startedAt: number;
  completedAt?: number;
  status: "pending" | "running" | "done" | "failed";
}

export interface OrchestraVariant {
  label: string;
  caption: string;
  hashtags: string[];
  image: {
    style: string | null;
    url: string | null;
    status: "ready" | "failed" | "skipped" | "timeout";
    errorMsg?: string;
  };
}

export interface OrchestraResult {
  taskId: string;
  totalLatencyMs: number;
  fetchedUrl: {
    url: string;
    title: string | null;
    chars: number;
    og: UrlSummary["og"];
  } | null;
  captionAgent: AgentMeta | null;
  imageAgent: AgentMeta | null;
  variants: OrchestraVariant[];
  stages: OrchestraStage[];
  ok: boolean;
  errors: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function loadAgent(id: number | null | undefined): Promise<{ meta: AgentMeta | null; persona: string }> {
  if (!id) return { meta: null, persona: "" };
  try {
    const [rows]: any = await localPool.execute(
      `SELECT id, name, title, bio, specialty, methodology, avatarUrl FROM agents WHERE id = ? LIMIT 1`,
      [id],
    );
    const a = (rows as any[])?.[0];
    if (!a) return { meta: null, persona: "" };
    const persona =
      `你是 ${a.name}，${a.title}。\n` +
      (a.bio ? `背景：${a.bio}\n` : "") +
      (a.specialty ? `專長：${a.specialty}\n` : "") +
      (a.methodology ? `方法論：${a.methodology}\n` : "") +
      `用你的口氣寫，不要寫得像通用 AI。\n\n`;
    return {
      meta: { id: a.id, name: a.name, title: a.title, avatarUrl: a.avatarUrl ?? null },
      persona,
    };
  } catch { return { meta: null, persona: "" }; }
}

function tryParseJson(text: string): any {
  let t = (text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = t.search(/[{\[]/);
  if (start > 0) t = t.slice(start);
  const lastBrace = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (lastBrace >= 0) t = t.slice(0, lastBrace + 1);
  try { return JSON.parse(t); } catch { return null; }
}

function timeoutPromise<T>(ms: number, label: string): Promise<T> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms),
  );
}

// ── Caption writer — N parallel LLM calls, one per variant ──────────────
//
// Design (CJ direction 2026-05-05): instead of 1 LLM call producing N JSON
// variants (which truncates / drops a variant when tokens get tight), we
// fan out N small calls. Each writes EXACTLY one variant. Failures are
// isolated; one missing variant gets retried once, rather than poisoning
// the whole batch. Wall time stays the same because they run in parallel.
//
// Each single-variant call is tiny (~150-300 tokens) so it never truncates.

async function callOneVariant(args: {
  template: FBTaskTemplate;
  config: OrchestraConfig;
  label: string;
  captionPersona: string;
  brandPrefix: string;
  urlContext: string;
  userMsg: string;
}): Promise<{ label: string; caption: string; hashtags?: string[] }> {
  const { template, config, label, captionPersona, brandPrefix, urlContext, userMsg } = args;

  const lengthHint =
    config.captionMaxChars > 0
      ? `字數 ${config.captionMinChars}-${config.captionMaxChars} 字。`
      : "字數依任務本身規範。";

  const system =
    captionPersona +
    template.systemPrompt +
    `\n\n【本次任務】只寫 1 個變體：**${label}** 口吻。\n` +
    `${lengthHint}\n` +
    `caption 欄位**絕對不要**寫「${template.label}」、「${label}」或任何任務 / label 名稱 — caption 就是直接發到 FB 的貼文。\n\n` +
    `【格式要求 — 重要】\n` +
    `- 用自然斷行（兩個 newline 分段）。**不要**用「｜」全形管道符號當分隔線（看起來很擠很 AI）。\n` +
    `- emoji 點綴用就好，**不要**每段開頭都塞 emoji（像「💪 xxx｜🌿 yyy」這樣會看起來像範本）。\n` +
    `- hashtag 集中放在文末**最後一行**，不要散落在文中或當分節符號。\n` +
    `- 段落像真人朋友寫的貼文，不要排成「標題｜內文｜hashtag」這種結構化卡片格式。\n\n` +
    `輸出嚴格 JSON 物件（不是陣列）：\n` +
    `{"caption":"<完整貼文>","hashtags":["..."]}\n` +
    `第一個字元就是 {。不要 markdown code fence、不要前言。\n` +
    brandPrefix +
    urlContext;

  const provider: ModelProvider =
    template.preferredModel === "any" ? "qwen" : (template.preferredModel as any);

  // First attempt
  let attempt = 0;
  let lastErr: any = null;
  while (attempt < 2) {
    attempt++;
    try {
      const r = await Promise.race([
        callModel(
          [
            { role: "system", content: system },
            { role: "user", content: userMsg },
          ],
          undefined,
          provider,
        ),
        timeoutPromise<never>(LLM_BUDGET_MS, `caption[${label}]`),
      ]);
      const parsed = tryParseJson(r.content);
      const caption =
        typeof (parsed as any)?.caption === "string" ? (parsed as any).caption.trim() : "";
      if (caption.length > 0) {
        return {
          label,
          caption,
          hashtags: Array.isArray((parsed as any)?.hashtags)
            ? (parsed as any).hashtags.slice(0, 15).map(String)
            : undefined,
        };
      }
      lastErr = new Error(`empty caption for ${label}`);
    } catch (e) {
      lastErr = e;
    }
    // brief backoff before retry
    if (attempt < 2) await new Promise((r) => setTimeout(r, 250));
  }
  throw lastErr ?? new Error(`caption[${label}] exhausted retries`);
}

async function callCaptionWriter(args: {
  template: FBTaskTemplate;
  config: OrchestraConfig;
  captionPersona: string;
  brandPrefix: string;
  urlContext: string;
  userMsg: string;
}): Promise<Array<{ label: string; caption: string; hashtags?: string[] }>> {
  const labels = args.config.variantLabels.slice(0, args.config.variants);
  // Parallel fanout — each variant in its own LLM call.
  // Promise.allSettled so one failure doesn't kill the others.
  const settled = await Promise.allSettled(
    labels.map((label) =>
      callOneVariant({ ...args, label }),
    ),
  );
  return settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : { label: labels[i] ?? `版本 ${i + 1}`, caption: "", hashtags: undefined },
  );
}

// ── Image director LLM call ─────────────────────────────────────────────

async function callImageDirector(args: {
  template: FBTaskTemplate;
  config: OrchestraConfig;
  imagePersona: string;
  brandPrefix: string;
  urlContext: string;
  userMsg: string;
}): Promise<string[]> {
  const { template, config, imagePersona, brandPrefix, urlContext, userMsg } = args;
  if (!config.imageDirectorId || config.images === 0) return [];

  const variantSpec = config.variantLabels.slice(0, config.images).map((l, i) => `  ${i + 1}. ${l}`).join("\n");

  const system =
    imagePersona +
    `任務：你是 FB 視覺方向設計師。為 ${config.images} 個不同口吻的 caption 各寫 1 條 Flux Schnell 用的英文 image prompt。\n\n` +
    `每個 prompt 的口吻順序：\n${variantSpec}\n\n` +
    `比例：${config.aspectRatio ?? "1:1"}（畫面構圖要明確支撐這個比例）\n\n` +
    `規則：\n` +
    `- 每條 prompt 30-60 字英文（不要中文）\n` +
    `- 描述 subject + composition + lighting + color palette + mood\n` +
    `- 不要寫文字疊圖（Flux 不擅長文字）\n` +
    `- 不要用品牌 logo（除非用戶有明確要求）\n` +
    `- 風格要呼應該口吻（情感版=溫暖光線/柔色，數據版=clean infographic 感，故事版=生活感場景）\n\n` +
    `輸出嚴格 JSON 陣列：["prompt 1", "prompt 2", ...]（${config.images} 條）\n` +
    `不要 markdown code fence。直接 JSON。\n` +
    brandPrefix +
    urlContext;

  const r = await Promise.race([
    callModel(
      [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      undefined,
      "qwen", // fast model for visual briefs
    ),
    timeoutPromise<never>(LLM_BUDGET_MS, "image_director LLM"),
  ]);

  const parsed = tryParseJson(r.content);
  if (!Array.isArray(parsed)) {
    throw new Error("image_director LLM did not return a JSON array");
  }
  return parsed.slice(0, config.images).map((p: any) => (typeof p === "string" ? p : String(p ?? "")).trim()).filter(Boolean);
}

// ── Single image gen with per-image timeout ─────────────────────────────

async function genOneImage(prompt: string, config: OrchestraConfig): Promise<OrchestraVariant["image"]> {
  if (!prompt) return { style: null, url: null, status: "skipped" };
  try {
    // 2026-05-05: switched from fal/flux-schnell to piapi/flux-pro
    // (CJ direction — fal.ai account was billing-locked, refund irrecoverable;
    // PiAPI Flux Pro is sync, ~5–13s per image, no fal dependency).
    const r = await Promise.race([
      dispatchGenerate("piapi/flux-schnell", {
        prompt,
        aspectRatio: (config.aspectRatio === "1.91:1" ? "16:9" : config.aspectRatio) as any,
        quality: config.imageQualitySteps >= 8 ? "high" : "medium",
      }),
      timeoutPromise<never>(PER_IMAGE_MS, "piapi-flux-schnell"),
    ]);
    if (r.status === "ready" && r.url) {
      return { style: prompt, url: r.url, status: "ready" };
    }
    return { style: prompt, url: null, status: "failed", errorMsg: r.errorMsg ?? "no url returned" };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return { style: prompt, url: null, status: msg.includes("exceeded") ? "timeout" : "failed", errorMsg: msg };
  }
}

// ── Main entry ───────────────────────────────────────────────────────────

export async function runOrchestra(args: {
  template: FBTaskTemplate;
  config: OrchestraConfig;
  inputs: Record<string, string>;
  brandId?: number;
}): Promise<OrchestraResult> {
  const startedAt = Date.now();
  const stages: OrchestraStage[] = [];
  const errors: string[] = [];

  function stage(key: string, label: string): OrchestraStage {
    const s: OrchestraStage = { key, label, startedAt: Date.now() - startedAt, status: "running" };
    stages.push(s);
    return s;
  }

  const userMsg =
    Object.entries(args.inputs)
      .map(([k, v]) => `[${k}] ${v}`)
      .join("\n") || "(no extra inputs)";

  // Wrap in 20s hard budget
  const orchestra = (async (): Promise<OrchestraResult> => {
    // ── Stage 1: parallel pre-work (URL fetch, persona loads, brand) ──
    const stPre = stage("pre", "URL / persona / brand");

    const [captionLoad, imageLoad, urlSummary, brandPrefix] = await Promise.all([
      loadAgent(args.template.agent_id),
      loadAgent(args.config.imageDirectorId),
      (async () => {
        for (const v of Object.values(args.inputs)) {
          if (typeof v !== "string") continue;
          const url = findFirstUrl(v);
          if (url) {
            try { return await fetchUrlSummary(url); } catch { return null; }
          }
        }
        return null;
      })(),
      buildBrandContext(args.brandId).catch(() => ""),
    ]);
    stPre.status = "done";
    stPre.completedAt = Date.now() - startedAt;

    const fetchedUrl = urlSummary
      ? { url: urlSummary.url, title: urlSummary.title, chars: urlSummary.fetched_chars, og: urlSummary.og }
      : null;
    const urlContext = urlSummary ? "\n\n" + formatUrlSummaryForPrompt(urlSummary) + "\n\n" : "";

    // ── Stage 2: caption + image briefs in parallel ───────────────────
    const stCap = stage("caption", `${captionLoad.meta?.name ?? "Caption agent"} 寫 ${args.config.variants} 個變體`);
    const stImg = args.config.imageDirectorId
      ? stage("brief", `${imageLoad.meta?.name ?? "Mandy Cheng"} 寫 ${args.config.images} 條視覺 brief`)
      : null;

    const [captions, briefs] = await Promise.all([
      callCaptionWriter({
        template: args.template,
        config: args.config,
        captionPersona: captionLoad.persona,
        brandPrefix,
        urlContext,
        userMsg,
      }).then((c) => { stCap.status = "done"; stCap.completedAt = Date.now() - startedAt; return c; }).catch((e) => {
        stCap.status = "failed";
        stCap.completedAt = Date.now() - startedAt;
        errors.push(`caption: ${String(e?.message ?? e)}`);
        return [];
      }),
      args.config.imageDirectorId
        ? callImageDirector({
            template: args.template,
            config: args.config,
            imagePersona: imageLoad.persona,
            brandPrefix,
            urlContext,
            userMsg,
          }).then((b) => { if (stImg) { stImg.status = "done"; stImg.completedAt = Date.now() - startedAt; } return b; }).catch((e) => {
            if (stImg) { stImg.status = "failed"; stImg.completedAt = Date.now() - startedAt; }
            errors.push(`brief: ${String(e?.message ?? e)}`);
            return [];
          })
        : Promise.resolve<string[]>([]),
    ]);

    // ── Stage 3: parallel image gen — only when runImageGen=true ───────
    // 30s tier: runImageGen=false → briefs are written but no Flux call.
    // The carousel renders style direction text in the mockup image slot;
    // user clicks "用此風格生圖" per variant to opt into MediaGenFlow.
    const willRender = args.config.runImageGen && args.config.images > 0;
    const stGen = willRender
      ? stage("gen", `Flux Schnell ×${args.config.images} 平行生圖`)
      : null;

    const images: OrchestraVariant["image"][] = willRender && briefs.length
      ? await Promise.all(briefs.map((b) => genOneImage(b, args.config)))
      : briefs.length
        ? briefs.map((b) => ({ style: b, url: null, status: "skipped" as const }))
        : Array.from({ length: args.config.images }, () => ({ style: null, url: null, status: "skipped" as const }));

    if (stGen) {
      const ok = images.filter((i) => i.status === "ready").length;
      stGen.status = ok > 0 ? "done" : "failed";
      stGen.completedAt = Date.now() - startedAt;
    }

    // ── Assemble variants ──────────────────────────────────────────────
    // Hook-task post-processing: each variant's caption from the LLM is
    // just the hook (30-60 chars) — orchestra appends the user's original
    // article verbatim. This keeps each LLM call tiny (high reliability)
    // and preserves the article exactly as user wrote it.
    //
    // No silent quality-fallback: if a variant LLM call failed both
    // attempts, the variant ships with empty caption + the per-slide
    // warning UI tells the user to retry. We never hide the failure with
    // a clone of another variant.
    const isHookTask = args.template.id === "fb-30-pure-text-hook";
    const articleBody =
      isHookTask
        ? (args.inputs["article_body"] ?? args.inputs["topic"] ?? "").trim()
        : "";

    const variants: OrchestraVariant[] = [];
    const N = args.config.variants;
    for (let i = 0; i < N; i++) {
      const cap = captions[i];
      const label = cap?.label ?? args.config.variantLabels[i] ?? `版本 ${i + 1}`;
      let caption = (cap?.caption ?? "").trim();
      if (caption && isHookTask && articleBody) {
        caption = `${caption}\n\n${articleBody}`;
      }
      if (!caption) {
        errors.push(`variant ${i} (${label}) caption 兩次嘗試都失敗`);
      }
      variants.push({
        label,
        caption,
        hashtags: cap?.hashtags ?? [],
        image: images[i] ?? { style: briefs[i] ?? null, url: null, status: args.config.images > 0 ? "failed" : "skipped" },
      });
    }

    return {
      taskId: args.template.id,
      totalLatencyMs: Date.now() - startedAt,
      fetchedUrl,
      captionAgent: captionLoad.meta,
      imageAgent: imageLoad.meta,
      variants,
      stages,
      ok: variants.some((v) => v.caption.length > 0),
      errors,
    };
  })();

  // Hard 20s budget — whatever's done by then is what we ship
  try {
    return await Promise.race([
      orchestra,
      new Promise<OrchestraResult>((resolve) =>
        setTimeout(() => {
          resolve({
            taskId: args.template.id,
            totalLatencyMs: HARD_BUDGET_MS,
            fetchedUrl: null,
            captionAgent: null,
            imageAgent: null,
            variants: args.config.variantLabels.slice(0, args.config.variants).map((l) => ({
              label: l,
              caption: "",
              hashtags: [],
              image: { style: null, url: null, status: "timeout" },
            })),
            stages,
            ok: false,
            errors: ["orchestra: hard 20s budget exceeded"],
          });
        }, HARD_BUDGET_MS),
      ),
    ]);
  } catch (e: any) {
    return {
      taskId: args.template.id,
      totalLatencyMs: Date.now() - startedAt,
      fetchedUrl: null,
      captionAgent: null,
      imageAgent: null,
      variants: [],
      stages,
      ok: false,
      errors: [String(e?.message ?? e)],
    };
  }
}
