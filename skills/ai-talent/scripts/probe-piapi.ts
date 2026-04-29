/**
 * probe-piapi.ts — figure out which auth scheme + endpoint PiAPI accepts.
 *
 * Tries 6 combinations against a cheap GET endpoint and the cheapest
 * possible POST (Ideogram txt2img with minimal prompt). Reports which
 * combo returned 2xx so we can update mediaGen.ts to match.
 *
 * Uses no quota beyond whatever the failed POST attempts cost (PiAPI
 * typically only charges on successful task submission).
 */
const KEY = process.env.PIAPI_KEY ?? process.env.PI_API_KEY ?? "";
if (!KEY) { console.error("✗ PIAPI_KEY missing"); process.exit(1); }

console.log(`Key prefix: ${KEY.slice(0, 8)}…  length=${KEY.length}\n`);

interface Probe {
  label: string;
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: any;
}

const TASK_BODY = {
  model: "ideogram",
  task_type: "txt2img",
  input: { prompt: "test", aspect_ratio: "1:1" },
};

// Common PiAPI auth + endpoint combos
const probes: Probe[] = [
  {
    label: "A. unified /api/v1/task POST + x-api-key (lowercase)",
    url: "https://api.piapi.ai/api/v1/task",
    method: "POST",
    headers: { "x-api-key": KEY, "Content-Type": "application/json" },
    body: TASK_BODY,
  },
  {
    label: "B. unified /api/v1/task POST + X-API-Key (capitalized)",
    url: "https://api.piapi.ai/api/v1/task",
    method: "POST",
    headers: { "X-API-Key": KEY, "Content-Type": "application/json" },
    body: TASK_BODY,
  },
  {
    label: "C. unified /api/v1/task POST + Authorization: Bearer",
    url: "https://api.piapi.ai/api/v1/task",
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: TASK_BODY,
  },
  {
    label: "D. legacy /mj/v2/fetch POST + x-api-key",
    url: "https://api.piapi.ai/mj/v2/fetch",
    method: "POST",
    headers: { "x-api-key": KEY, "Content-Type": "application/json" },
    body: { task_id: "probe-noop" },
  },
  {
    label: "E. account info GET + x-api-key",
    url: "https://api.piapi.ai/api/v1/account",
    method: "GET",
    headers: { "x-api-key": KEY },
  },
  {
    label: "F. account info GET + Authorization: Bearer",
    url: "https://api.piapi.ai/api/v1/account",
    method: "GET",
    headers: { Authorization: `Bearer ${KEY}` },
  },
];

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
      const snippet = text.slice(0, 220).replace(/\s+/g, " ");
      const status = resp.status;
      const flag = status >= 200 && status < 300 ? "✓"
                 : status === 401 ? "✗ AUTH"
                 : status === 404 ? "✗ NOT FOUND"
                 : `✗ ${status}`;
      console.log(`${flag}  ${p.label}`);
      console.log(`     → ${status}  ${snippet}\n`);
    } catch (e: any) {
      console.log(`✗ ERR ${p.label}`);
      console.log(`     → ${e.message}\n`);
    }
  }
})();
