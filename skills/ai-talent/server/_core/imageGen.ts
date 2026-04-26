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

export type ImageProvider = "openai" | "google" | "stability";
export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";

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

  const run = async (p: ImageProvider) => {
    if (p === "openai") return await runOpenAI(promptText, size);
    if (p === "google") return await runGoogleImagen(promptText, size);
    throw new Error(`Provider ${p} not implemented`);
  };

  let provider: ImageProvider = primary;
  let out: { url: string | null; b64: string | null; model: string } | null = null;
  let errorMsg: string | undefined;
  try {
    out = await run(primary);
  } catch (e: any) {
    errorMsg = `${primary}: ${e?.message ?? e}`;
    try {
      out = await run(fallback);
      provider = fallback;
    } catch (e2: any) {
      errorMsg = `${errorMsg}\n${fallback}: ${e2?.message ?? e2}`;
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
