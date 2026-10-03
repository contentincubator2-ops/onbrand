/**
 * fx — daily USD → TWD exchange rate fetch + cache.
 *
 * 2026-05-14 (CJ「美金為準，每天匯率動」).
 *
 * USD is the source of truth for all pricing. TWD prices are derived
 * by multiplying USD by the latest FX rate. This file is the only
 * place that talks to the FX provider.
 *
 * ─── Cache layers ──────────────────────────────────────────
 *   1. In-memory: 6 hours TTL. Survives between requests on the same
 *      process. Lost on restart.
 *   2. DB (`fx_rates` table): persisted snapshot per day. Survives
 *      restart and lets us fall back when the provider is down.
 *   3. Hardcoded fallback: 32.0 — only used if both above are empty
 *      AND the API call fails. Conservative so we don't over-charge
 *      TWD users if FX spikes.
 *
 * ─── Provider ──────────────────────────────────────────────
 * open.er-api.com — free, no API key, daily-refreshed rates.
 * Endpoint: https://open.er-api.com/v6/latest/USD
 *
 * If they ever go down, swap PROVIDER_URL — the rest of the file
 * doesn't care which provider as long as the response has rates.TWD.
 */

const PROVIDER_URL = "https://open.er-api.com/v6/latest/USD";
const MEMORY_TTL_MS = 6 * 3600 * 1000; // 6 hours
const HARDCODED_FALLBACK = 32.0;

let memCache: { rate: number; fetchedAt: number } | null = null;
let inFlight: Promise<number> | null = null;

/**
 * Get the current USD → TWD exchange rate. Cheap to call — uses an
 * in-memory cache. Falls back to the DB snapshot, then to the
 * hardcoded constant if everything fails.
 */
export async function getUsdToTwd(): Promise<number> {
  // 1. Hot in-memory cache
  if (memCache && Date.now() - memCache.fetchedAt < MEMORY_TTL_MS) {
    return memCache.rate;
  }
  // 2. Coalesce concurrent callers to a single fetch
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const fetched = await fetchFromProvider();
      memCache = { rate: fetched, fetchedAt: Date.now() };
      await persistToDb(fetched).catch((e) =>
        console.warn("[fx] persist failed (non-blocking):", e?.message ?? e),
      );
      return fetched;
    } catch (e) {
      console.error("[fx] provider fetch failed, falling back to DB:", (e as Error)?.message);
      const dbRate = await loadFromDb().catch(() => null);
      if (dbRate && dbRate > 0) {
        memCache = { rate: dbRate, fetchedAt: Date.now() };
        return dbRate;
      }
      console.error("[fx] DB fallback empty too — using hardcoded", HARDCODED_FALLBACK);
      memCache = { rate: HARDCODED_FALLBACK, fetchedAt: Date.now() };
      return HARDCODED_FALLBACK;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function fetchFromProvider(): Promise<number> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(PROVIDER_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    const rate = Number(json?.rates?.TWD);
    if (!Number.isFinite(rate) || rate < 20 || rate > 50) {
      // Sanity bounds — USD/TWD has historically been 25-35, anything
      // outside 20-50 is almost certainly garbage from the provider.
      throw new Error(`implausible rate: ${rate}`);
    }
    return rate;
  } finally {
    clearTimeout(timer);
  }
}

async function persistToDb(rate: number): Promise<void> {
  const { default: localPool } = await import("../../../localDb");
  await localPool.execute(
    `INSERT INTO fx_rates (pair, rate, fetchedAt) VALUES ('USD_TWD', ?, NOW(3))`,
    [rate],
  );
}

async function loadFromDb(): Promise<number | null> {
  const { default: localPool } = await import("../../../localDb");
  const [rows]: any = await localPool.execute(
    `SELECT rate FROM fx_rates WHERE pair = 'USD_TWD' ORDER BY id DESC LIMIT 1`,
  );
  const r = (rows as any[])[0]?.rate;
  return r ? Number(r) : null;
}

/** Convert a USD amount to TWD using the live rate. Rounded to integer. */
export async function usdToTwd(usdAmount: number): Promise<number> {
  const rate = await getUsdToTwd();
  return Math.round(usdAmount * rate);
}

