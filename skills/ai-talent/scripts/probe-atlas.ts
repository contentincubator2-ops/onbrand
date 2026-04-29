/**
 * probe-atlas.ts — discover Atlas Cloud's API shape so we know if it's
 * usable as a media-gen provider (or LLM-only).
 *
 * Atlas Cloud is sold as a 109-model aggregator. CJ provided an Atlas key
 * (`apikey-...`) but we don't have official docs. This probe tries common
 * endpoint patterns:
 *   - OpenAI-compatible base (most aggregators expose this)
 *   - Models listing
 *   - Image generations endpoint
 *
 * Run on VM (where ATLAS_CLOUD_API is set):
 *   PIAPI_KEY=… ATLAS_CLOUD_API=apikey-… npx tsx skills/ai-talent/scripts/probe-atlas.ts
 *
 * Reports for each combo:
 *   - HTTP status
 *   - Response prefix (200 chars)
 *   - Whether the body looks like a model list / image result / error
 */
const KEY = process.env.ATLAS_CLOUD_API ?? process.env.ATLAS_API_KEY ?? "";
if (!KEY) { console.error("✗ ATLAS_CLOUD_API missing"); process.exit(1); }

console.log(`Atlas key prefix: ${KEY.slice(0, 12)}…  length=${KEY.length}\n`);

interface Probe {
  label: string;
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: any;
}

// Try common base URLs. atlascloud.ai is the most likely; fall back to
// vendor-style alternatives.
const BASES = [
  "https://api.atlascloud.ai/v1",
  "https://atlascloud.ai/api/v1",
  "https://api.atlascloud.com/v1",
  "https://api.atlas.run/v1",
];

const probes: Probe[] = [];
for (const base of BASES) {
  // Bearer auth (OpenAI-compatible)
  probes.push({
    label: `${base}/models GET (Bearer)`,
    url: `${base}/models`,
    method: "GET",
    headers: { Authorization: `Bearer ${KEY}` },
  });
  // Image gen probe — most aggregators expose /v1/images/generations
  // following OpenAI's shape. Use cheapest known model id; if Atlas has
  // a different model namespace we'll see the error message.
  probes.push({
    label: `${base}/images/generations POST (Bearer)`,
    url: `${base}/images/generations`,
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: { model: "dall-e-3", prompt: "test", n: 1, size: "1024x1024" },
  });
}

// Also try x-api-key header style (PiAPI uses this — Atlas might too)
for (const base of BASES) {
  probes.push({
    label: `${base}/models GET (x-api-key)`,
    url: `${base}/models`,
    method: "GET",
    headers: { "x-api-key": KEY },
  });
}

(async () => {
  for (const p of probes) {
    try {
      const resp = await fetch(p.url, {
        method: p.method,
        headers: p.headers,
        body: p.body ? JSON.stringify(p.body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
      const text = await resp.text();
      const snippet = text.slice(0, 240).replace(/\s+/g, " ");
      const status = resp.status;
      const flag = status >= 200 && status < 300 ? "✓"
                 : status === 401 || status === 403 ? "✗ AUTH"
                 : status === 404 ? "✗ NOT FOUND"
                 : `✗ ${status}`;
      console.log(`${flag}  ${p.label}`);
      console.log(`     → ${status}  ${snippet}\n`);
    } catch (e: any) {
      const isDns = /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(e?.message ?? "");
      console.log(`${isDns ? "✗ DNS" : "✗ ERR"}  ${p.label}`);
      console.log(`     → ${e.message}\n`);
    }
  }
  console.log("Pick the row with status 2xx — that's the live base + auth combo.");
  console.log("If only /models works (200) but /images/generations 4xx, Atlas is LLM-only.");
})();
