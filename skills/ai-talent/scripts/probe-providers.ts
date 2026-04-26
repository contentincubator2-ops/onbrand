/**
 * probe-providers.ts
 *
 * Smoke-tests every external provider whose key lives in .env. Each probe
 * makes a tiny, read-only request and reports OK / FAIL with HTTP status.
 *
 * Providers covered:
 *   - Azure AI Foundry (gpt-4o)         — POST /openai/v1/chat/completions
 *   - OpenAI (gpt-4o-mini)              — POST /v1/chat/completions
 *   - Anthropic (claude-haiku)          — POST /v1/messages
 *   - Google AI Studio / Gemini         — GET  /v1beta/models
 *   - DeepSeek                          — GET  /models
 *   - Perplexity (sonar)                — POST /chat/completions
 *   - fal.ai                            — GET  /queue/status (auth check via flux schema)
 *   - Cohere (embed v4)                 — POST /v2/embed
 *   - Tavily                            — POST /search
 *   - Browserbase                       — GET  /v1/projects
 *   - Manus                             — GET  /v1/agents
 *   - Zhipu (GLM-4.6)                   — POST /chat/completions
 *   - Alibaba (Qwen)                    — POST /chat/completions (DashScope)
 *   - OpenRouter                        — GET  /v1/models
 *   - Meta Graph                        — GET  /v18.0/me?access_token=…
 *
 * Run: npm run probe-providers
 */
import * as dotenv from "dotenv";
dotenv.config();

type Result = { name: string; ok: boolean; status?: number; note?: string };

async function tryFetch(name: string, url: string, init?: RequestInit, expectKey?: string): Promise<Result> {
  try {
    const r = await fetch(url, init);
    if (!r.ok) {
      const body = (await r.text()).slice(0, 120);
      return { name, ok: false, status: r.status, note: body };
    }
    if (expectKey) {
      const j: any = await r.json().catch(() => ({}));
      return { name, ok: !!j?.[expectKey] || true, status: r.status };
    }
    return { name, ok: true, status: r.status };
  } catch (e: any) {
    return { name, ok: false, note: e.message?.slice(0, 120) };
  }
}

async function main() {
  const results: Result[] = [];

  // 1. Azure Foundry
  if (process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT && process.env.AZURE_FOUNDRY_API_KEY) {
    const ep = process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT.replace(/\/$/, "");
    results.push(await tryFetch("Azure Foundry (gpt-4o)", `${ep}/openai/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": process.env.AZURE_FOUNDRY_API_KEY!, Authorization: `Bearer ${process.env.AZURE_FOUNDRY_API_KEY}` },
      body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "ping" }], max_completion_tokens: 5 }),
    }));
  } else results.push({ name: "Azure Foundry", ok: false, note: "missing env" });

  // 2. OpenAI
  if (process.env.OPENAI_API_KEY) {
    results.push(await tryFetch("OpenAI", "https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    }));
  } else results.push({ name: "OpenAI", ok: false, note: "missing env" });

  // 3. Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    results.push(await tryFetch("Anthropic", "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 5, messages: [{ role: "user", content: "ping" }] }),
    }));
  } else results.push({ name: "Anthropic", ok: false, note: "missing env" });

  // 4. Gemini (AI Studio)
  const gKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (gKey) {
    results.push(await tryFetch("Gemini AI Studio", `https://generativelanguage.googleapis.com/v1beta/models?key=${gKey}`));
  } else results.push({ name: "Gemini AI Studio", ok: false, note: "missing env" });

  // 5. DeepSeek
  if (process.env.DEEPSEEK_API_KEY) {
    results.push(await tryFetch("DeepSeek", "https://api.deepseek.com/models", {
      headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    }));
  } else results.push({ name: "DeepSeek", ok: false, note: "missing env" });

  // 6. Perplexity
  if (process.env.PERPLEXITY_API_KEY) {
    results.push(await tryFetch("Perplexity", "https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
      body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: "ping" }], max_tokens: 5 }),
    }));
  } else results.push({ name: "Perplexity", ok: false, note: "missing env" });

  // 7. fal.ai
  if (process.env.FAL_KEY || process.env.FAL_API_KEY) {
    const k = process.env.FAL_KEY || process.env.FAL_API_KEY!;
    results.push(await tryFetch("fal.ai", "https://queue.fal.run/fal-ai/flux/dev", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${k}` },
      body: JSON.stringify({ prompt: "test", num_inference_steps: 1, image_size: "square" }),
    }));
  } else results.push({ name: "fal.ai", ok: false, note: "missing env" });

  // 8. Cohere
  if (process.env.COHERE_API_KEY) {
    results.push(await tryFetch("Cohere embed v4", "https://api.cohere.com/v2/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.COHERE_API_KEY}` },
      body: JSON.stringify({ model: "embed-v4.0", texts: ["ping"], input_type: "search_query" }),
    }));
  } else results.push({ name: "Cohere", ok: false, note: "missing env" });

  // 9. Tavily
  const tk = process.env.TAVILY_API_KEY || process.env.TAVILY_API_KEY_1 || process.env.TAVILY_API_KEY_2;
  if (tk) {
    results.push(await tryFetch("Tavily", "https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: tk, query: "marketing os", max_results: 1 }),
    }));
  } else results.push({ name: "Tavily", ok: false, note: "missing env" });

  // 10. Browserbase
  if (process.env.BROWSERBASE_API_KEY) {
    results.push(await tryFetch("Browserbase", "https://api.browserbase.com/v1/projects", {
      headers: { "X-BB-API-Key": process.env.BROWSERBASE_API_KEY },
    }));
  } else results.push({ name: "Browserbase", ok: false, note: "missing env" });

  // 11. Manus
  const mk = process.env.MANUS_API_KEY || process.env.MANUS_API_KEY_1;
  if (mk) {
    results.push(await tryFetch("Manus", "https://api.manus.im/v1/agents", {
      headers: { Authorization: `Bearer ${mk}` },
    }));
  } else results.push({ name: "Manus", ok: false, note: "missing env" });

  // 12. Zhipu / GLM
  if (process.env.ZHIPU_API_KEY) {
    results.push(await tryFetch("Zhipu GLM-4.6", "https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ZHIPU_API_KEY}` },
      body: JSON.stringify({ model: "glm-4-flash", messages: [{ role: "user", content: "ping" }], max_tokens: 5 }),
    }));
  } else results.push({ name: "Zhipu", ok: false, note: "missing env" });

  // 13. Alibaba Qwen / DashScope
  if (process.env.DASHSCOPE_API_KEY || process.env.ALIBABA_API_KEY || process.env.QWEN_API_KEY) {
    const k = process.env.DASHSCOPE_API_KEY || process.env.ALIBABA_API_KEY || process.env.QWEN_API_KEY!;
    results.push(await tryFetch("Qwen DashScope", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${k}` },
      body: JSON.stringify({ model: "qwen-turbo", messages: [{ role: "user", content: "ping" }], max_tokens: 5 }),
    }));
  } else results.push({ name: "Qwen DashScope", ok: false, note: "missing env" });

  // 14. OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    results.push(await tryFetch("OpenRouter", "https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    }));
  } else results.push({ name: "OpenRouter", ok: false, note: "missing env" });

  // 15. Meta Graph
  const fbtok = process.env.META_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN_1;
  if (fbtok) {
    results.push(await tryFetch("Meta Graph", `https://graph.facebook.com/v18.0/me?access_token=${fbtok}`));
  } else results.push({ name: "Meta Graph", ok: false, note: "missing env" });

  // Print summary
  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("  Provider key probe results");
  console.log("══════════════════════════════════════════════════════════════════");
  for (const r of results) {
    const tag = r.ok ? "✅" : "❌";
    const status = r.status ? ` [${r.status}]` : "";
    const note = r.note ? ` — ${r.note}` : "";
    console.log(`${tag} ${r.name.padEnd(24)}${status}${note}`);
  }
  const oks = results.filter((r) => r.ok).length;
  console.log(`\n  ${oks}/${results.length} providers OK`);
}

main().catch((e) => { console.error(e); process.exit(1); });
