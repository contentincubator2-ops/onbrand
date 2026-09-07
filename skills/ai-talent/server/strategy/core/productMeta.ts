import { assertUrlSafe } from "../../content/core/urlGuard";

export interface ProductMeta {
  name?: string;
  imageUrl?: string;
  price?: string;
  currency?: string;
  description?: string;
  source: "jsonld" | "og" | "title" | "none";
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;

function decodeHtml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (entity, code: string) => {
    const lower = code.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    const numeric = lower.startsWith("#x")
      ? Number.parseInt(lower.slice(2), 16)
      : Number.parseInt(lower.slice(1), 10);
    return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : entity;
  });
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = decodeHtml(value).replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

/** Price "0" / negative means "call for price" on Shopline-style stores —
 *  treat it as absent rather than persisting a misleading NT$0. */
function cleanPrice(value: unknown): string | undefined {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : cleanText(value);
  if (!text) return undefined;
  const numeric = Number(text.replace(/,/g, ""));
  if (Number.isFinite(numeric) && numeric <= 0) return undefined;
  return text;
}

function normalizeImageUrl(value: unknown, pageUrl: string): string | undefined {
  let raw: unknown = value;
  if (Array.isArray(raw)) raw = raw[0];
  if (raw && typeof raw === "object") {
    const image = raw as Record<string, unknown>;
    raw = image.url ?? image.contentUrl ?? image["@id"];
  }
  const cleaned = cleanText(raw);
  if (!cleaned) return undefined;
  try {
    const parsed = new URL(cleaned, pageUrl);
    if (parsed.protocol === "http:") parsed.protocol = "https:";
    if (parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function findProduct(value: unknown): Record<string, any> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProduct(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const object = value as Record<string, any>;
  const types = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]];
  if (types.some((type) => typeof type === "string" && type.toLowerCase() === "product")) {
    return object;
  }
  if (object["@graph"]) {
    const inGraph = findProduct(object["@graph"]);
    if (inGraph) return inGraph;
  }
  return undefined;
}

function extractJsonLd(html: string, pageUrl: string): Omit<ProductMeta, "source"> | null {
  const scripts = html.matchAll(/<script\b[^>]*type\s*=\s*(?:["']application\/ld\+json["']|application\/ld\+json)[^>]*>([\s\S]*?)<\/script\s*>/gi);
  for (const match of scripts) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1]!.trim()));
      const product = findProduct(parsed);
      if (!product) continue;
      const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
      const price = cleanPrice(offers?.price ?? offers?.lowPrice ?? offers?.highPrice);
      return {
        name: cleanText(product.name),
        imageUrl: normalizeImageUrl(product.image, pageUrl),
        price,
        currency: cleanText(offers?.priceCurrency),
        description: cleanText(product.description),
      };
    } catch {
      // A page may contain several JSON-LD blocks; one malformed block must
      // not hide a valid Product block later in the document.
    }
  }
  return null;
}

function getAttribute(tag: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return cleanText(match?.[1] ?? match?.[2] ?? match?.[3]);
}

function extractMetaTags(html: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = getAttribute(tag, "property") ?? getAttribute(tag, "name");
    const content = getAttribute(tag, "content");
    if (key && content && !result.has(key.toLowerCase())) result.set(key.toLowerCase(), content);
  }
  return result;
}

function extractTitle(html: string): string | undefined {
  return cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]);
}

async function readHtml(response: Response): Promise<string | null> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_HTML_BYTES) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_HTML_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total).toString("utf8");
}

async function fetchHtml(rawUrl: string): Promise<{ html: string; finalUrl: string } | null> {
  const deadline = Date.now() + FETCH_TIMEOUT_MS;
  let current = rawUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertUrlSafe(current);
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return null;
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(remainingMs),
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirects === MAX_REDIRECTS) return null;
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const html = await readHtml(response);
    return html == null ? null : { html, finalUrl: current };
  }
  return null;
}

/** Best-effort product metadata extraction. User-supplied URLs and every
 * redirect hop are SSRF checked; all failures intentionally collapse to none. */
export async function fetchProductMeta(url: string): Promise<ProductMeta> {
  try {
    const page = await fetchHtml(url);
    if (!page) return { source: "none" };

    const jsonLd = extractJsonLd(page.html, page.finalUrl);
    const og = extractMetaTags(page.html);
    const ogFields = {
      name: og.get("og:title"),
      imageUrl: normalizeImageUrl(og.get("og:image"), page.finalUrl),
      price: cleanPrice(og.get("product:price:amount")),
      currency: og.get("product:price:currency"),
      description: og.get("og:description"),
    };
    const title = extractTitle(page.html);

    if (jsonLd) {
      return {
        name: jsonLd.name ?? ogFields.name ?? title,
        imageUrl: jsonLd.imageUrl ?? ogFields.imageUrl,
        price: jsonLd.price ?? ogFields.price,
        currency: jsonLd.currency ?? ogFields.currency,
        description: jsonLd.description ?? ogFields.description,
        source: "jsonld",
      };
    }
    if (Object.values(ogFields).some(Boolean)) {
      return { ...ogFields, name: ogFields.name ?? title, source: "og" };
    }
    return title ? { name: title, source: "title" } : { source: "none" };
  } catch {
    return { source: "none" };
  }
}
