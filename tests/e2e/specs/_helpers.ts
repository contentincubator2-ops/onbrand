import { APIRequestContext, expect, request } from "@playwright/test";

export const BASE_URL = process.env.E2E_BASE_URL ?? "https://marketing-os.sowork.ai";
export const USER_EMAIL = process.env.E2E_USER_EMAIL ?? "caesar.chi@sowork.tw";
export const USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "test1234";

export interface LoginResult {
  status: number;
  body: any;
  setCookieHeader?: string;
  durationMs: number;
}

export async function loginViaApi(
  ctx: APIRequestContext,
  email = USER_EMAIL,
  password = USER_PASSWORD,
): Promise<LoginResult> {
  const t0 = Date.now();
  const res = await ctx.post(`${BASE_URL}/api/auth/login`, {
    data: { email, password },
    headers: { "Content-Type": "application/json" },
  });
  const durationMs = Date.now() - t0;
  let body: any = null;
  try { body = await res.json(); } catch { body = await res.text(); }
  const headers = res.headers();
  return {
    status: res.status(),
    body,
    setCookieHeader: headers["set-cookie"],
    durationMs,
  };
}

export async function fetchBrandListByMember(ctx: APIRequestContext): Promise<{
  status: number;
  body: any;
  durationMs: number;
}> {
  const t0 = Date.now();
  const res = await ctx.get(
    `${BASE_URL}/trpc/brand.listByMember?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: null, meta: { values: ["undefined"] } } }))}`,
  );
  const durationMs = Date.now() - t0;
  let body: any;
  try { body = await res.json(); } catch { body = await res.text(); }
  return { status: res.status(), body, durationMs };
}

/**
 * Generic tRPC v11 batch mutation caller.
 * Server runs WITHOUT a data transformer, so the batch envelope is bare:
 *   POST /trpc/<route>?batch=1
 *   Body: {"0": <input>}            (no .json wrapper)
 *   Resp: [{"result":{"data": <output>}}]
 */
export async function trpcMutation<TInput, TOutput = any>(
  ctx: APIRequestContext,
  proc: string,
  input: TInput,
  opts: { timeoutMs?: number } = {},
): Promise<{ status: number; body: any; data: TOutput | null; durationMs: number }> {
  const t0 = Date.now();
  const res = await ctx.post(`${BASE_URL}/trpc/${proc}?batch=1`, {
    data: { "0": input as any },
    headers: { "Content-Type": "application/json" },
    timeout: opts.timeoutMs ?? 90_000,
  });
  const durationMs = Date.now() - t0;
  let body: any;
  try { body = await res.json(); } catch { body = await res.text(); }
  const data: TOutput | null =
    body?.[0]?.result?.data ??
    body?.[0]?.result?.data?.json ??
    null;
  return { status: res.status(), body, data, durationMs };
}

/**
 * Generic tRPC v11 batch query caller (no transformer).
 * GET /trpc/<route>?batch=1&input=<urlencoded {"0":<input>}>
 */
export async function trpcQuery<TInput, TOutput = any>(
  ctx: APIRequestContext,
  proc: string,
  input: TInput,
  opts: { timeoutMs?: number } = {},
): Promise<{ status: number; body: any; data: TOutput | null; durationMs: number }> {
  const t0 = Date.now();
  const inputParam = encodeURIComponent(JSON.stringify({ "0": input as any }));
  const res = await ctx.get(`${BASE_URL}/trpc/${proc}?batch=1&input=${inputParam}`, {
    timeout: opts.timeoutMs ?? 30_000,
  });
  const durationMs = Date.now() - t0;
  let body: any;
  try { body = await res.json(); } catch { body = await res.text(); }
  const data: TOutput | null =
    body?.[0]?.result?.data ??
    body?.[0]?.result?.data?.json ??
    null;
  return { status: res.status(), body, data, durationMs };
}

/** Pick the first brand id for the test user, or throw with a helpful error. */
export async function getFirstBrandId(ctx: APIRequestContext): Promise<{ id: number; name: string }> {
  const r = await fetchBrandListByMember(ctx);
  if (r.status !== 200) {
    throw new Error(`brand.listByMember HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
  }
  const list =
    r.body?.[0]?.result?.data?.json ??
    r.body?.[0]?.result?.data ??
    [];
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`test user has no brands — create one in the UI first`);
  }
  return { id: list[0].id, name: list[0].name };
}

export async function newAuthenticatedContext(): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: BASE_URL, ignoreHTTPSErrors: true });
  const login = await loginViaApi(ctx);
  expect(login.status, `login expected 200, got ${login.status} body=${JSON.stringify(login.body)}`).toBe(200);
  return ctx;
}

export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

export function summarize(
  label: string,
  samples: number[],
  errors: number,
  totalMs: number,
  throttled = 0,
) {
  const total = samples.length + errors + throttled;
  return {
    label,
    requests: total,
    successes: samples.length,
    throttled_429: throttled,
    errors,
    errorRate: total === 0 ? 0 : +(errors / total).toFixed(4),
    throttleRate: total === 0 ? 0 : +(throttled / total).toFixed(4),
    rps: +(total / (totalMs / 1000)).toFixed(2),
    p50_ms: percentile(samples, 50),
    p95_ms: percentile(samples, 95),
    p99_ms: percentile(samples, 99),
    max_ms: samples.length ? Math.max(...samples) : 0,
    min_ms: samples.length ? Math.min(...samples) : 0,
  };
}
