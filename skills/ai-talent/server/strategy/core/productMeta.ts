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
/**
 * 2026-09-10 — 從 1MB 提到 4MB。
 *
 * 1MB 的後果不是「截斷」而是**整頁丟掉**（readHtml 超過上限直接回 null），
 * 而 Shopify 的商品頁常態 1.5–2.5MB。當天實測：
 *
 *   gymshark.com/products/…   2.1MB → 原本 source:"none"（其實有完整 Product JSON-LD）
 *   allbirds.com/products/…   1.8MB → 原本 source:"none"
 *
 * 也就是說「官網抓取不穩」在最主流的獨立電商平台上，成因是我們自己的上限，
 * 不是對方的站。4MB 是實測 Shopify / WooCommerce 商品頁的安全水位；
 * onboarding 一次最多 8 個網址、併發 3，最壞情況約 12MB 常駐，可接受。
 */
const MAX_HTML_BYTES = 4 * 1024 * 1024;
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

/**
 * 讀取回應內容，最多 MAX_HTML_BYTES。
 *
 * 2026-09-10 兩處修正，都是「部分好過沒有」：
 *
 * ① 超過上限時回**已讀到的部分**，不再回 null。整頁丟掉等於這個網址完全
 *    讀不到；而 name / og / JSON-LD 幾乎都在文件前段，讀到 4MB 還沒看到的
 *    機率遠低於「因為第 4MB+1 個 byte 而放棄整頁」。
 * ② 不再用 content-length 提前放棄。宣告長度超標時照樣讀到上限為止 ——
 *    理由同上，而且 content-length 在 chunked 回應裡根本不存在。
 */
async function readHtml(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      total += value.byteLength;
      if (total >= MAX_HTML_BYTES) {
        // 讀滿就停，但保留已讀的部分。
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) return null;
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
