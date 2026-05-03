/**
 * llmRouter — single chat-completion entry with cross-provider fallback.
 *
 * Provider chain (each can be skipped if its env / key is missing):
 *   1. Anthropic direct (ANTHROPIC_API_KEY [+ BACKUP_1/2])
 *   2. Azure Foundry (AZURE_FOUNDRY_*) — gpt-4o-mini
 *   3. Azure OpenAI (AZURE_IMAGE_ENDPOINT was for image; we reuse same
 *      pattern with text deployment if AZURE_OPENAI_ENDPOINT is set)
 *   4. OpenRouter (OPENROUTER_API_KEY) — last resort
 *
 * Each provider's failure (auth / billing / timeout / 5xx) is logged and
 * we try the next one. callLLM throws only after EVERY provider has
 * failed, so a single key going dark never breaks the system.
 *
 * Usage:
 *   const text = await callLLM({ system: "...", user: "...", maxTokens: 4000 });
 */

interface CallArgs {
  system: string;
  user: string;
  /** Default 4000. */
  maxTokens?: number;
  /** Default 180s per provider. */
  timeoutMs?: number;
  /** Total wall-clock budget across ALL providers. Default 55s — nginx
   *  default upstream timeout is ~60s. Stop trying before nginx returns
   *  HTML (which tRPC then fails to parse as JSON). */
  budgetMs?: number;
}

type Provider = "anthropic" | "azure-foundry" | "azure-openai" | "openrouter";

interface ProviderAttempt {
  provider: Provider;
  key: string;          // for logging context (which key variant)
  ok: boolean;
  durationMs: number;
  error?: string;
}

const ANTHROPIC_KEYS = [
  process.env.ANTHROPIC_API_KEY,
  process.env.ANTHROPIC_API_KEY_BACKUP_1,
  process.env.ANTHROPIC_API_KEY_BACKUP_2,
].filter((k): k is string => !!k);
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const AZURE_FOUNDRY_KEY = process.env.AZURE_FOUNDRY_API_KEY ?? process.env.AZURE_AI_API_KEY ?? "";
const AZURE_FOUNDRY_ENDPOINT = (
  process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT
  ?? process.env.AZURE_AI_ENDPOINT
  ?? ""
).replace(/\/+$/, "");
// Fallback model on Azure Foundry. Confirmed deployed 2026-04-25: gpt-4o, Kimi-K2.5, DeepSeek-V3.2.
// gpt-5-nano was removed. Override via AZURE_FOUNDRY_MODEL env. Default: Kimi-K2.5 (strong, handles zh).
const AZURE_FOUNDRY_MODEL = process.env.AZURE_FOUNDRY_MODEL ?? "Kimi-K2.5";

const AZURE_OPENAI_KEY = process.env.AZURE_OPENAI_API_KEY ?? "";
const AZURE_OPENAI_ENDPOINT = (process.env.AZURE_OPENAI_ENDPOINT ?? "").replace(/\/+$/, "");
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o-mini";

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ?? "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5";

// Provider order: Anthropic direct first (cheapest + best for our use case),
// Azure Foundry second (cheap stable), Azure OpenAI third, OpenRouter last.
const PROVIDER_ORDER: Provider[] = ["anthropic", "azure-foundry", "azure-openai", "openrouter"];

async function callAnthropic(key: string, args: CallArgs): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: args.maxTokens ?? 4000,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    }),
    signal: AbortSignal.timeout(args.timeoutMs ?? 180_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${t.slice(0, 300)}`);
  }
  const data: any = await resp.json();
  const blocks = Array.isArray(data?.content) ? data.content : [];
  return blocks
    .filter((b: any) => b?.type === "text")
    .map((b: any) => String(b?.text ?? ""))
    .join("");
}

async function callAzureFoundry(args: CallArgs): Promise<string> {
  if (!AZURE_FOUNDRY_KEY || !AZURE_FOUNDRY_ENDPOINT) throw new Error("Azure Foundry not configured");
  const isAzureOpenAI = AZURE_FOUNDRY_ENDPOINT.includes("openai.azure.com");
  const path = isAzureOpenAI
    ? `/openai/deployments/${AZURE_FOUNDRY_MODEL}/chat/completions?api-version=2024-10-01-preview`
    : `/openai/v1/chat/completions`;
  const body: any = {
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    max_tokens: args.maxTokens ?? 4000,
    temperature: 0.3,
  };
  if (!isAzureOpenAI) body.model = AZURE_FOUNDRY_MODEL;
  const resp = await fetch(`${AZURE_FOUNDRY_ENDPOINT}${path}`, {
    method: "POST",
    headers: { "api-key": AZURE_FOUNDRY_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(args.timeoutMs ?? 180_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Azure Foundry ${resp.status}: ${t.slice(0, 300)}`);
  }
  const data: any = await resp.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

async function callAzureOpenAI(args: CallArgs): Promise<string> {
  if (!AZURE_OPENAI_KEY || !AZURE_OPENAI_ENDPOINT) throw new Error("Azure OpenAI not configured");
  const path = `/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-10-01-preview`;
  const resp = await fetch(`${AZURE_OPENAI_ENDPOINT}${path}`, {
    method: "POST",
    headers: { "api-key": AZURE_OPENAI_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      max_tokens: args.maxTokens ?? 4000,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(args.timeoutMs ?? 180_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Azure OpenAI ${resp.status}: ${t.slice(0, 300)}`);
  }
  const data: any = await resp.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

async function callOpenRouter(args: CallArgs): Promise<string> {
  if (!OPENROUTER_KEY) throw new Error("OpenRouter not configured");
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://marketing-os.sowork.ai",
      "X-Title": "SoWork Marketing OS",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      max_tokens: args.maxTokens ?? 4000,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(args.timeoutMs ?? 180_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenRouter ${resp.status}: ${t.slice(0, 300)}`);
  }
  const data: any = await resp.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

/**
 * callLLM — try providers in order (Anthropic direct → Azure Foundry →
 * Azure OpenAI → OpenRouter). Returns the first successful text. Throws
 * only after every available provider has failed.
 */
export async function callLLM(args: CallArgs): Promise<{ text: string; attempts: ProviderAttempt[] }> {
  const attempts: ProviderAttempt[] = [];
  const startedAt = Date.now();
  const budgetMs = args.budgetMs ?? 55_000;
  // Per-provider cap: 45s. Anthropic Sonnet 4.5 generates ~80 tok/s,
  // so 3000-token outputs (text_strategic) need ~35-40s end-to-end.
  // 25s was too aggressive — caused systematic timeout on real workloads.
  const perProviderCap = 45_000;

  const remainingBudget = () => Math.max(0, budgetMs - (Date.now() - startedAt));

  const tryProvider = async (
    provider: Provider,
    keyLabel: string,
    fn: (timeoutMs: number) => Promise<string>,
  ): Promise<string | null> => {
    const remaining = remainingBudget();
    if (remaining < 2000) {
      attempts.push({ provider, key: keyLabel, ok: false, durationMs: 0, error: "skipped: budget exhausted" });
      return null;
    }
    const perProviderTimeout = Math.min(args.timeoutMs ?? perProviderCap, perProviderCap, remaining);
    const t0 = Date.now();
    try {
      const text = await fn(perProviderTimeout);
      attempts.push({ provider, key: keyLabel, ok: true, durationMs: Date.now() - t0 });
      return text;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      attempts.push({ provider, key: keyLabel, ok: false, durationMs: Date.now() - t0, error: msg });
      // eslint-disable-next-line no-console
      console.warn(`[llmRouter] ${provider}/${keyLabel} failed: ${msg}`);
      return null;
    }
  };

  for (const provider of PROVIDER_ORDER) {
    if (remainingBudget() < 2000) break;
    if (provider === "anthropic") {
      for (let i = 0; i < ANTHROPIC_KEYS.length; i++) {
        const text = await tryProvider("anthropic", `key-${i + 1}`, (t) =>
          callAnthropic(ANTHROPIC_KEYS[i]!, { ...args, timeoutMs: t }),
        );
        if (text) return { text, attempts };
        // Backup keys help against auth/billing failures, NOT timeouts.
        // A slow request on Anthropic infra won't get faster on key-2.
        // Bail to next provider after first timeout.
        const last = attempts[attempts.length - 1];
        if (last?.error?.toLowerCase().includes("timeout") || last?.error?.toLowerCase().includes("aborted")) break;
        if (remainingBudget() < 2000) break;
      }
    } else if (provider === "azure-foundry") {
      const text = await tryProvider("azure-foundry", "default", (t) => callAzureFoundry({ ...args, timeoutMs: t }));
      if (text) return { text, attempts };
    } else if (provider === "azure-openai") {
      const text = await tryProvider("azure-openai", "default", (t) => callAzureOpenAI({ ...args, timeoutMs: t }));
      if (text) return { text, attempts };
    } else if (provider === "openrouter") {
      const text = await tryProvider("openrouter", "default", (t) => callOpenRouter({ ...args, timeoutMs: t }));
      if (text) return { text, attempts };
    }
  }

  const summary = attempts.map((a) => `${a.provider}/${a.key}: ${a.ok ? "OK" : a.error ?? "fail"}`).join(" | ");
  throw new Error(`All LLM providers failed — ${summary}`);
}
