/**
 * youtube_fetch tool — fetch a YouTube video's captions + basic metadata.
 *
 * Strategy:
 *   1. Accept either a full watch URL (youtube.com/watch?v=XYZ), youtu.be/XYZ,
 *      or a raw video id.
 *   2. Pull metadata via oEmbed endpoint (no key, returns title/author/thumbnail).
 *   3. Pull captions via the timedtext XML endpoint (no key). Falls back to
 *      auto-generated English if no explicit caption track.
 *
 * No API key required. Rate limits are YouTube's — best-effort.
 */

import { registerTool } from "./registry";
import { addCitation } from "./citationStore";

const TIMEOUT_MS = 10000;
const MAX_TRANSCRIPT_CHARS = 10000;

function parseVideoId(input: string): string | null {
  if (!input) return null;
  const s = input.trim();
  // Raw 11-char id
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace(/^\//, "").slice(0, 11) || null;
    }
    const v = u.searchParams.get("v");
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
  } catch { /* not a URL */ }
  return null;
}

async function fetchMetadata(videoId: string): Promise<{ title?: string; author?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: controller.signal },
    );
    if (!res.ok) return {};
    const data: any = await res.json();
    return { title: data.title, author: data.author_name };
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTranscript(videoId: string): Promise<{ lang: string; text: string } | null> {
  // Try common langs in order: user-provided → en → zh-TW → zh → auto
  const langs = ["en", "zh-TW", "zh-Hant", "zh", "ja"];
  for (const lang of langs) {
    const url = `https://www.youtube.com/api/timedtext?lang=${encodeURIComponent(lang)}&v=${videoId}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const xml = await res.text();
      if (!xml.trim() || !xml.includes("<text")) continue;
      const text = parseTimedtextXml(xml);
      if (text) return { lang, text };
    } catch { /* try next lang */ }
  }
  // Last resort: auto-generated (kind=asr)
  for (const lang of ["en", "zh"]) {
    const url = `https://www.youtube.com/api/timedtext?lang=${lang}&kind=asr&v=${videoId}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const xml = await res.text();
      if (!xml.trim() || !xml.includes("<text")) continue;
      const text = parseTimedtextXml(xml);
      if (text) return { lang: `${lang} (auto)`, text };
    } catch { /* skip */ }
  }
  return null;
}

function parseTimedtextXml(xml: string): string {
  const segments: string[] = [];
  const re = /<text[^>]*>([\s\S]*?)<\/text>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const raw = m[1]!
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (raw) segments.push(raw);
  }
  return segments.join(" ");
}

registerTool({
  name: "youtube_fetch",
  description:
    "Fetch a YouTube video's metadata (title, channel) and transcript/captions. Use this to analyze a brand's voice/tone from their founder talks, explainer videos, podcast episodes. Accepts a full YouTube URL, youtu.be short URL, or an 11-char video id.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "YouTube watch URL, youtu.be short URL, or raw 11-char video id.",
      },
    },
    required: ["url"],
  },
  async execute(args, ctx) {
    const videoId = parseVideoId(String(args.url ?? ""));
    if (!videoId) return "[tool_error] could not parse YouTube video id from url";

    const [meta, transcript] = await Promise.all([
      fetchMetadata(videoId),
      fetchTranscript(videoId),
    ]);

    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    if (ctx.sessionId) {
      addCitation(ctx.sessionId, {
        kind: "youtube_fetch",
        url: watchUrl,
        title: meta.title,
        fetchedAt: new Date().toISOString(),
        excerpt: transcript?.text.slice(0, 300),
        meta: { author: meta.author, lang: transcript?.lang },
      });
    }

    const lines: string[] = [
      `YouTube: ${watchUrl}`,
      meta.title ? `Title: ${meta.title}` : "",
      meta.author ? `Channel: ${meta.author}` : "",
    ];
    if (transcript) {
      lines.push(`Transcript (${transcript.lang}):`, "");
      const body = transcript.text.length > MAX_TRANSCRIPT_CHARS
        ? transcript.text.slice(0, MAX_TRANSCRIPT_CHARS) + "\n\n…（內文過長已截斷）"
        : transcript.text;
      lines.push(body);
    } else {
      lines.push("Transcript: unavailable (no captions found).");
    }
    return lines.filter(Boolean).join("\n");
  },
});
