/**
 * transcription.ts — real speech-to-text via the azure-canada
 * gpt-4o-mini-transcribe resource. llm.ts's PROVIDERS table already
 * templated this resource's baseUrl for chat-style calls, but transcription
 * is a multipart /audio/transcriptions endpoint, not JSON chat messages —
 * invokeLLM() can't be reused here. Before this file, nothing in the
 * codebase actually called this resource.
 *
 * 2026-08-21 (CJ「很多人，影音就是放在google drive, one drive or youtube上面」
 * / caption-less YouTube + cloud-file training sources).
 */
import { ENV } from "./env";

/** OpenAI-compatible transcription endpoints cap uploads around 25MB —
 *  leave headroom for multipart overhead. */
export const TRANSCRIBE_SIZE_LIMIT_BYTES = 24 * 1024 * 1024;

export class TranscribeTooLargeError extends Error {
  constructor(public sizeBytes: number) {
    super(`檔案過大無法轉錄（${Math.round(sizeBytes / 1024 / 1024)}MB，上限約 24MB）`);
    this.name = "TranscribeTooLargeError";
  }
}

export function isTranscriptionConfigured(): boolean {
  return !!(ENV.AZURE_CANADA_API_KEY && ENV.AZURE_CANADA_ENDPOINT);
}

/**
 * Transcribes an audio/video buffer. Returns plain transcript text, or null
 * if there's no speech / the provider isn't configured (caller treats that
 * as "skip this source", not a hard failure — matches fetchArticleText /
 * fetchVideoTranscript's best-effort-per-source contract).
 */
export async function transcribeBuffer(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string | null> {
  if (buffer.byteLength > TRANSCRIBE_SIZE_LIMIT_BYTES) {
    throw new TranscribeTooLargeError(buffer.byteLength);
  }
  if (!isTranscriptionConfigured()) return null;

  const baseUrl = `${ENV.AZURE_CANADA_ENDPOINT!.replace(/\/$/, "")}/openai/v1`;
  const form = new FormData();
  // Buffer's type (Uint8Array<ArrayBufferLike>) isn't assignable to
  // BlobPart (wants ArrayBufferView<ArrayBuffer>) — wrapping in a fresh
  // Uint8Array copies onto a plain, non-shared ArrayBuffer that satisfies it.
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType || "application/octet-stream" }), filename);
  form.append("model", "gpt-4o-mini-transcribe");

  const resp = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { "api-key": ENV.AZURE_CANADA_API_KEY! },
    body: form as any,
    signal: AbortSignal.timeout(180_000),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`transcription HTTP ${resp.status}: ${errText.slice(0, 300)}`);
  }
  const data = (await resp.json().catch(() => null)) as { text?: string } | null;
  const text = data?.text?.trim();
  return text || null;
}
