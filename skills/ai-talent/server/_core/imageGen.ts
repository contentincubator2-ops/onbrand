/**
 * imageGen — Decision AI publish-gate image generation service.
 *
 * Primary:  OpenAI gpt-image-1 (best prompt adherence, brand-context friendly)
 * Fallback: Google Imagen 3 via Gemini REST API
 *
 * Every generation is persisted to `generated_images` for auditability and
 * linked back to the originating decision/option.
 *
 * Brand context is injected into every prompt: positioning, voice, archetype,
 * audience segment — so the image doesn't drift from the approved strategy.
 */

import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { loadLineage } from "./decisionBridge";

export type ImageProvider = "openai" | "google" | "stability" | "piapi";
export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";

// 2026-05-12 (CJ「改圖要給用戶選 model」): user-facing model IDs.
// "auto" = use IMAGE_GEN_PROVIDER_PRIMARY env (currently openai).
// Other values map to specific providers in generateImage's switch.
export type ImageModelChoice =
  | "auto"
  | "flux-schnell"      // PiAPI Flux Schnell — fast (5-10s), 4-step
  | "gpt-image-1"       // OpenAI — best realism
  | "flux-realism"      // PiAPI Flux Dev with realism LoRA
  | "ideogram-v3"       // PiAPI Ideogram — strongest at text-in-image
  | "imagen-3";         // Google Imagen 3

export interface BrandVisualContext {
  brandName?: string;
  positioning?: string;
  voiceTone?: string;
  archetype?: string;
  audience?: string;
  colourHints?: string[];
}

export interface ImageGenInput {
  brandId: number;
  decisionId?: number;
  optionId?: number;
  prompt: string;
  channel?: "fb" | "ig" | "linkedin" | "youtube" | "pr";
  size?: ImageSize;
  brandContext?: BrandVisualContext;
  /** 2026-05-12: user-selected model. "auto" or undefined = env default. */
  modelChoice?: ImageModelChoice;
}

export interface ImageGenResult {
  id: number;
  provider: ImageProvider;
  model: string;
  url: string | null;
  b64: string | null;
  status: "ready" | "failed";
  errorMsg?: string;
}

function channelSize(channel?: string): ImageSize {
  switch (channel) {
    case "ig":
      return "1024x1024"; // square feed
    case "fb":
      return "1024x1024";
    case "linkedin":
      return "1536x1024"; // landscape
    case "youtube":
      return "1536x1024";
    case "pr":
      return "1024x1536"; // portrait
    default:
      return "1024x1024";
  }
}

function buildPrompt(input: ImageGenInput): string {
  const bc = input.brandContext ?? {};
  const lines: string[] = [];
  if (bc.brandName) lines.push(`Brand: ${bc.brandName}`);
  if (bc.positioning) lines.push(`Positioning: ${bc.positioning}`);
  if (bc.archetype) lines.push(`Archetype: ${bc.archetype}`);
  if (bc.voiceTone) lines.push(`Voice: ${bc.voiceTone}`);
  if (bc.audience) lines.push(`Audience: ${bc.audience}`);
  if (bc.colourHints?.length) lines.push(`Colour palette: ${bc.colourHints.join(", ")}`);
  if (input.channel) lines.push(`Channel: ${input.channel.toUpperCase()}`);
  lines.push("");
  lines.push("Scene:");
  lines.push(input.prompt);
  lines.push("");
  lines.push(
    "Rendering: editorial photography, natural light, no text overlays, no watermarks, clean composition."
  );
  return lines.join("\n");
}

async function runOpenAI(
  promptText: string,
  size: ImageSize
): Promise<{ url: string | null; b64: string | null; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const model = process.env.IMAGE_GEN_MODEL_OPENAI || "gpt-image-1";

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: promptText,
      size,
      n: 1,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI image gen ${res.status}: ${text.slice(0, 300)}`);
  }
  const json: any = await res.json();
  const item = json?.data?.[0] ?? {};
  return { url: item.url ?? null, b64: item.b64_json ?? null, model };
}

async function runGoogleImagen(
  promptText: string,
  size: ImageSize
): Promise<{ url: string | null; b64: string | null; model: string }> {
  const pool = (process.env.GEMINI_API_KEY_POOL ?? process.env.GEMINI_API_KEY ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!pool.length) throw new Error("GEMINI_API_KEY not set");
  const apiKey = pool[Math.floor(Math.random() * pool.length)];
  const model = process.env.IMAGE_GEN_MODEL_GOOGLE || "imagen-3.0-generate-002";

  const aspect =
    size === "1536x1024" ? "16:9" : size === "1024x1536" ? "9:16" : "1:1";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: promptText }],
        parameters: { sampleCount: 1, aspectRatio: aspect },
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Imagen ${res.status}: ${text.slice(0, 300)}`);
  }
  const json: any = await res.json();
  const b64 =
    json?.predictions?.[0]?.bytesBase64Encoded ??
    json?.predictions?.[0]?.image?.bytesBase64Encoded ??
    null;
  return { url: null, b64, model };
}

// 2026-05-12: PiAPI bridge for user-selectable image models.
// Imports dispatchGenerate from mediaGen which handles PiAPI submit + poll.
async function runPiapi(
  prompt: string,
  size: ImageSize,
  modelId: string,
): Promise<{ url: string | null; b64: string | null; model: string }> {
  const { dispatchGenerate } = await import("./mediaGen");
  // Map our 1024x1024 / 1024x1536 / 1536x1024 sizes to PiAPI aspect ratios
  const aspect: "1:1" | "9:16" | "16:9" =
    size === "1024x1536" ? "9:16" :
    size === "1536x1024" ? "16:9" : "1:1";
  const r = await dispatchGenerate(modelId, { prompt, aspectRatio: aspect });
  if (r.status !== "ready" || !r.url) {
    throw new Error(`PiAPI ${modelId}: ${r.errorMsg ?? `status=${r.status}`}`);
  }
  return { url: r.url, b64: null, model: r.modelId };
}

export async function generateImage(input: ImageGenInput): Promise<ImageGenResult> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const size = input.size ?? channelSize(input.channel);
  const promptText = buildPrompt(input);

  // Pre-insert a pending row so we can retrieve it even if provider crashes.
  const [ins] = (await db.execute(sql`
    INSERT INTO generated_images
      (brandId, decisionId, optionId, provider, model, prompt, sizeSpec, status)
    VALUES
      (${input.brandId}, ${input.decisionId ?? null}, ${input.optionId ?? null},
       ${"openai"}, ${"pending"}, ${promptText}, ${size}, 'pending')
  `)) as any;
  const id = Number(ins?.insertId ?? 0);

  const primary = (process.env.IMAGE_GEN_PROVIDER_PRIMARY || "openai") as ImageProvider;
  const fallback = (process.env.IMAGE_GEN_PROVIDER_FALLBACK || "google") as ImageProvider;

  // 2026-05-12: model choice override. When user picks a specific model,
  // it becomes "primary" and the env default becomes "fallback".
  const choice = input.modelChoice ?? "auto";
  let effectivePrimary: ImageProvider = primary;
  let primaryModelId: string | null = null;
  switch (choice) {
    case "flux-schnell":   effectivePrimary = "piapi";  primaryModelId = "piapi/flux-schnell"; break;
    case "gpt-image-1":    effectivePrimary = "openai"; break;
    case "flux-realism":   effectivePrimary = "piapi";  primaryModelId = "piapi/flux-realism"; break;
    case "ideogram-v3":    effectivePrimary = "piapi";  primaryModelId = "piapi/ideogram-v3"; break;
    case "imagen-3":       effectivePrimary = "google"; break;
    case "auto":
    default:               /* keep env default */ break;
  }

  const run = async (p: ImageProvider, modelId?: string | null) => {
    if (p === "openai") return await runOpenAI(promptText, size);
    if (p === "google") return await runGoogleImagen(promptText, size);
    if (p === "piapi")  return await runPiapi(promptText, size, modelId ?? "piapi/flux-schnell");
    throw new Error(`Provider ${p} not implemented`);
  };

  let provider: ImageProvider = effectivePrimary;
  let out: { url: string | null; b64: string | null; model: string } | null = null;
  let errorMsg: string | undefined;
  try {
    out = await run(effectivePrimary, primaryModelId);
  } catch (e: any) {
    errorMsg = `${effectivePrimary}: ${e?.message ?? e}`;
    // 2026-05-14 (CJ「生圖生不出來」— Pokémon 角色被 OpenAI safety
    // system 拒絕): when the primary failure is a content-policy /
    // safety-system block, jump STRAIGHT to PiAPI Flux Schnell instead
    // of the env default fallback. Flux has the loosest content policy
    // and is the most likely to succeed for branded characters.
    const isSafetyBlock = /safety system|content_policy|rejected by the safety|content policy|moderation/i.test(errorMsg);
    // Build a 2-step fallback list:
    //   1) preferred fallback (PiAPI if safety-block, else env default)
    //   2) other half of the env default
    const fallbacks: Array<{ p: ImageProvider; modelId?: string | null }> = isSafetyBlock
      ? [{ p: "piapi", modelId: "piapi/flux-schnell" }, { p: fallback }, { p: primary }]
      : [{ p: effectivePrimary === fallback ? primary : fallback }, { p: "piapi", modelId: "piapi/flux-schnell" }];
    // De-duplicate (skip the one we already tried)
    const tried = new Set<string>([`${effectivePrimary}:${primaryModelId ?? ""}`]);
    for (const fb of fallbacks) {
      const key = `${fb.p}:${fb.modelId ?? ""}`;
      if (tried.has(key)) continue;
      tried.add(key);
      try {
        out = await run(fb.p, fb.modelId);
        provider = fb.p;
        break;
      } catch (e2: any) {
        errorMsg = `${errorMsg}\n${fb.p}: ${String(e2?.message ?? e2).slice(0, 200)}`;
      }
    }
  }

  if (out) {
    await db.execute(sql`
      UPDATE generated_images
      SET provider = ${provider}, model = ${out.model},
          url = ${out.url}, b64DataKey = ${out.b64 ? `inline:${id}` : null},
          status = 'ready', errorMsg = NULL
      WHERE id = ${id}
    `);
    return { id, provider, model: out.model, url: out.url, b64: out.b64, status: "ready" };
  }
  await db.execute(sql`
    UPDATE generated_images
    SET status = 'failed', errorMsg = ${errorMsg ?? "unknown"}
    WHERE id = ${id}
  `);
  return {
    id,
    provider: primary,
    model: "unknown",
    url: null,
    b64: null,
    status: "failed",
    errorMsg,
  };
}

/**
 * Helper: fetch brand visual context (positioning/voice/archetype/audience)
 * from Brand Brain + upstream decision lineage to inject into prompts.
 */
export async function resolveBrandVisualContext(
  brandId: number,
  upstreamDecisionId?: number
): Promise<BrandVisualContext> {
  const db = await getDb();
  if (!db) return {};
  const [rows] = (await db.execute(sql`
    SELECT name FROM brands WHERE id = ${brandId} LIMIT 1
  `)) as any;
  const brandName = Array.isArray(rows) ? rows[0]?.name : undefined;

  let positioning: string | undefined;
  let archetype: string | undefined;
  let voiceTone: string | undefined;
  let audience: string | undefined;

  if (upstreamDecisionId) {
    const chain = await loadLineage(upstreamDecisionId);
    for (const d of chain) {
      const p = typeof d.payload === "string" ? safeParse(d.payload) : d.payload;
      if (d.decisionType.includes("positioning") && p) {
        positioning = positioning ?? (p.positioningStatement || p.statement || d.summary || undefined);
      }
      if (d.decisionType.includes("archetype") && p) {
        archetype = archetype ?? (p.archetype || p.name || d.title || undefined);
        voiceTone = voiceTone ?? p.voiceTone ?? p.tone ?? undefined;
      }
      if (d.decisionType.includes("stp") || d.decisionType.includes("audience")) {
        audience = audience ?? (p?.targetSegment || p?.persona || d.summary || undefined);
      }
    }
  }
  return { brandName, positioning, archetype, voiceTone, audience };
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
