/**
 * productImageCutout — produce a transparent-background PNG of a product.
 *
 * Riverflow uses BiRefNet for this step. We delegate to Replicate's hosted
 * BiRefNet endpoint when REPLICATE_API_TOKEN is available; otherwise we
 * gracefully fall back to passing the original image through (no cutout,
 * but the composition pipeline still produces brand-colored output —
 * just on top of the source background instead of a transparent layer).
 *
 * Why Replicate over self-hosted rembg:
 *   - rembg requires Python + a GPU container to be quick
 *   - Replicate's `851-labs/background-remover` runs in ~3 sec at $0.0023/image
 *   - Zero infra cost during early days
 *
 * 2026-06-21 (CJ「按 riverflow 標準」brand DNA sprint) — created.
 */
import sharp from "sharp";

export interface CutoutResult {
  /** PNG buffer; transparent background if a cutout provider was available,
   *  otherwise the original image bytes unchanged. */
  pngBuffer: Buffer;
  /** True when an actual cutout happened. False = passthrough fallback. */
  hadAlpha: boolean;
  /** Provider used, for telemetry. */
  provider: "replicate-birefnet" | "passthrough" | "error-fallback";
}

/**
 * Strip the background from a product image. Always returns a Buffer
 * (PNG-encoded); callers can safely pipe into sharp again.
 */
export async function removeProductBackground(
  imageUrl: string,
): Promise<CutoutResult> {
  // Try Replicate if token is set
  const replicateToken = process.env.REPLICATE_API_TOKEN;
  if (replicateToken) {
    try {
      const cutoutUrl = await callReplicateBiRefNet(imageUrl, replicateToken);
      const cutoutBuf = await fetchToBuffer(cutoutUrl);
      // Validate it's actually a transparent PNG
      const meta = await sharp(cutoutBuf).metadata();
      const hasAlpha = meta.hasAlpha === true || meta.channels === 4;
      if (hasAlpha) {
        return { pngBuffer: cutoutBuf, hadAlpha: true, provider: "replicate-birefnet" };
      }
      // Replicate returned something but no alpha — fall through to passthrough
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[cutout] Replicate failed, falling back:", (e as Error).message);
    }
  }

  // Passthrough: download original, re-encode as PNG so downstream `sharp`
  // pipelines have a consistent input format. No cutout.
  try {
    const buf = await fetchToBuffer(imageUrl);
    const png = await sharp(buf).png().toBuffer();
    return { pngBuffer: png, hadAlpha: false, provider: "passthrough" };
  } catch (e) {
    // Last-ditch: return a tiny transparent placeholder so callers don't crash
    const blank = await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
    return { pngBuffer: blank, hadAlpha: true, provider: "error-fallback" };
  }
}

// ── Replicate BiRefNet adapter ──────────────────────────────────────────

/** Calls Replicate's hosted BiRefNet, polls until done, returns output URL. */
async function callReplicateBiRefNet(imageUrl: string, token: string): Promise<string> {
  // Model: 851-labs/background-remover — fast, well-rated, $0.0023/run
  // Docs: https://replicate.com/851-labs/background-remover
  const startRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Prefer": "wait", // synchronous response up to 60 sec
    },
    body: JSON.stringify({
      version: "a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc",
      input: { image: imageUrl, format: "png" },
    }),
  });
  if (!startRes.ok) throw new Error(`Replicate ${startRes.status}: ${await startRes.text()}`);
  const startBody = await startRes.json();

  // If "Prefer: wait" gave us a finished prediction, output is already there
  if (startBody.status === "succeeded" && startBody.output) {
    return Array.isArray(startBody.output) ? startBody.output[0] : startBody.output;
  }

  // Otherwise poll the get-prediction endpoint until succeeded / failed
  const id = startBody.id;
  if (!id) throw new Error("Replicate response missing prediction id");
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1200));
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!pollRes.ok) continue;
    const pollBody = await pollRes.json();
    if (pollBody.status === "succeeded" && pollBody.output) {
      return Array.isArray(pollBody.output) ? pollBody.output[0] : pollBody.output;
    }
    if (pollBody.status === "failed" || pollBody.status === "canceled") {
      throw new Error(`Replicate prediction ${pollBody.status}: ${pollBody.error ?? ""}`);
    }
  }
  throw new Error("Replicate prediction timed out after 90 sec");
}

async function fetchToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "user-agent": "OnBrandCutout/1.0 (+sowork.ai)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 100)}`);
  return Buffer.from(await res.arrayBuffer());
}
