/**
 * youtubeContext.ts — YouTube URL → metadata + transcript fetch.
 *
 * Used by YT 30s tasks so users can paste any YouTube URL and get:
 *   - title / description / channelTitle / publishedAt / tags
 *   - thumbnail URLs
 *   - full transcript (concatenated, capped at 5000 chars for prompt budget)
 *
 * No API key required (uses public watch-page HTML + the same timedtext
 * endpoint youtube.com itself uses). Resilient — any failure returns null
 * and caller falls back to user-provided topic.
 *
 * Fragile against YouTube DOM changes. If captions endpoint breaks, swap
 * for npm `youtube-transcript` (already pure-JS, no API key).
 */

const YT_URL_RE =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/i;

const FETCH_TIMEOUT_MS = 8000;
const TRANSCRIPT_MAX_CHARS = 5000;

export interface YouTubeContext {
  videoId: string;
  url: string;
  title: string | null;
  description: string | null;
  channelTitle: string | null;
  publishedAt: string | null;
  thumbnail: string | null;
  durationSeconds: number | null;
  /** Full transcript text (joined, capped). Null if no captions / fetch failed. */
  transcript: string | null;
  /** Segments with start time — used for chapter generation. */
  transcriptSegments: Array<{ start: number; text: string }> | null;
}

export function extractYouTubeId(input: string): string | null {
  const m = input.match(YT_URL_RE);
  return m?.[1] ?? null;
}

/** Strip HTML entities + tags from caption text. */
function decodeHtml(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/** Pull a single field out of the watch-page playerResponse JSON. */
function pluckJson(html: string, key: string): string | null {
  const re = new RegExp(`"${key}":\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`);
  const m = html.match(re);
  if (!m || !m[1]) return null;
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1] ?? null;
  }
}

// YouTube blocks identified bot UAs aggressively — we need a real Chrome UA
// + cookie-consent state to get the watch page with captionTracks intact.
const REAL_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function fetchWatchPage(videoId: string): Promise<string | null> {
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=zh-TW&persist_hl=1`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": REAL_CHROME_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        // CONSENT cookie skips the EU consent wall that returns a stub page
        Cookie: "CONSENT=YES+cb; SOCS=CAISEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiAlqayBg",
      },
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

/**
 * Extract captionTracks baseUrl, with auto-translate fallback.
 * Returns the URL most likely to give us readable transcript text:
 *   1. Native zh-TW / zh / zh-Hant caption track
 *   2. English native track
 *   3. ANY track + &tlang=zh-Hant for YouTube's auto-translation
 *   4. First available track raw
 */
function findCaptionUrl(html: string): string | null {
  const m = html.match(/"captionTracks":\s*(\[[^\]]+\])/);
  if (!m || !m[1]) return null;
  try {
    const tracks = JSON.parse(m[1]);
    if (!Array.isArray(tracks) || tracks.length === 0) return null;

    // 1. Native zh / en preference
    const nativePrefs = ["zh-TW", "zh", "zh-Hant", "zh-Hans"];
    for (const lang of nativePrefs) {
      const found = tracks.find((t: any) =>
        t?.languageCode === lang || (t?.vssId ?? "").includes(lang),
      );
      if (found?.baseUrl) return found.baseUrl;
    }
    // 2. Native English
    const enTrack = tracks.find((t: any) =>
      t?.languageCode === "en" || (t?.vssId ?? "").startsWith(".en"),
    );
    if (enTrack?.baseUrl) {
      // 3. Auto-translate English → 中文 (YT supports tlang param)
      return `${enTrack.baseUrl}&tlang=zh-Hant`;
    }
    // 4. First available + auto-translate to Chinese
    const first = tracks[0];
    if (first?.baseUrl) {
      return `${first.baseUrl}&tlang=zh-Hant`;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchTranscript(captionUrl: string): Promise<{ text: string; segments: Array<{ start: number; text: string }> } | null> {
  try {
    // YT timedtext also wants a real UA + Origin to avoid bot detection
    const r = await fetch(`${captionUrl}&fmt=json3`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": REAL_CHROME_UA,
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        "Origin": "https://www.youtube.com",
        "Referer": "https://www.youtube.com/",
      },
    });
    if (!r.ok) return null;
    const data: any = await r.json();
    const events: any[] = data?.events ?? [];
    const segments: Array<{ start: number; text: string }> = [];
    for (const ev of events) {
      const segs: any[] = ev?.segs ?? [];
      const text = segs.map((s) => s?.utf8 ?? "").join("").replace(/\n/g, " ").trim();
      if (text.length > 0 && typeof ev?.tStartMs === "number") {
        segments.push({
          start: Math.round(ev.tStartMs / 1000),
          text: decodeHtml(text),
        });
      }
    }
    if (segments.length === 0) return null;
    const fullText = segments.map((s) => s.text).join(" ");
    return {
      text: fullText.slice(0, TRANSCRIPT_MAX_CHARS),
      segments,
    };
  } catch {
    return null;
  }
}

/** Main entry — fetch everything we can about a YouTube URL. */
export async function fetchYouTubeContext(input: string): Promise<YouTubeContext | null> {
  const videoId = extractYouTubeId(input);
  if (!videoId) return null;
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  const html = await fetchWatchPage(videoId);
  if (!html) return null;

  const title = pluckJson(html, "title") ?? null;
  const description =
    pluckJson(html, "shortDescription") ??
    pluckJson(html, "description") ??
    null;
  const channelTitle = pluckJson(html, "author") ?? pluckJson(html, "ownerChannelName") ?? null;
  const publishedAt = pluckJson(html, "publishDate") ?? pluckJson(html, "uploadDate") ?? null;
  const thumbnailRaw = pluckJson(html, "thumbnail") ?? pluckJson(html, "url");
  const thumbnail = thumbnailRaw && thumbnailRaw.startsWith("http")
    ? thumbnailRaw
    : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  const lengthMatch = html.match(/"lengthSeconds":\s*"(\d+)"/);
  const durationSeconds = lengthMatch && lengthMatch[1] ? parseInt(lengthMatch[1], 10) : null;

  // Transcript — best-effort, takes 2-4s
  let transcript: string | null = null;
  let transcriptSegments: Array<{ start: number; text: string }> | null = null;
  const captionUrl = findCaptionUrl(html);
  if (captionUrl) {
    const t = await fetchTranscript(captionUrl);
    if (t) {
      transcript = t.text;
      transcriptSegments = t.segments;
    }
  }

  return {
    videoId,
    url,
    title: title ? decodeHtml(title) : null,
    description: description ? decodeHtml(description).slice(0, 1500) : null,
    channelTitle: channelTitle ? decodeHtml(channelTitle) : null,
    publishedAt,
    thumbnail,
    durationSeconds,
    transcript,
    transcriptSegments,
  };
}

/** Format a YouTubeContext as a prompt-injectable block. */
export function formatYouTubeContextForPrompt(c: YouTubeContext): string {
  const parts: string[] = [`【已抓取 YouTube 影片】${c.url}`];
  if (c.title)        parts.push(`標題：${c.title}`);
  if (c.channelTitle) parts.push(`頻道：${c.channelTitle}`);
  if (c.durationSeconds) parts.push(`長度：${Math.round(c.durationSeconds / 60)} 分鐘`);
  if (c.description)  parts.push(`原 description：${c.description.slice(0, 600)}`);
  if (c.transcript) {
    parts.push(`字幕逐字稿（前 ${c.transcript.length} 字）：\n${c.transcript}`);
  } else {
    parts.push(`（沒有字幕可抓 — 用 title + description 推測內容）`);
  }
  parts.push(`【務必基於以上影片實際內容生成 — 不要寫通用模板】`);
  return parts.join("\n");
}
