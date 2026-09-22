import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

// DEBT-1: Add provider + model params for multi-provider routing
export type InvokeParams = {
  messages: Message[];
  /** Optional caller-owned cancellation boundary for long-running requests. */
  signal?: AbortSignal;
  // Note: "openrouter" is deprecated — at runtime it's silently routed to LLM_DEFAULT_PROVIDER.
  provider?: "forge" | "openai" | "zhipu" | "qwen" | "perplexity" | "google" | "cohere" | "openrouter" | "anthropic" | "azure-foundry" | "azure-position" | "azure-claude" | "azure-northcentral" | "azure-canada" | "google-vertex" | "gemini" | "gemma" | "ollama" | "hermes";
  model?: string;
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

// DEBT-1: Provider config map — centralised routing table
const PROVIDER_CONFIG: Record<
  string,
  { baseUrl: string; defaultModel: string; getKey: () => string }
> = {
  forge: {
    baseUrl:      ENV.BUILT_IN_FORGE_API_URL
      ? `${ENV.BUILT_IN_FORGE_API_URL.replace(/\/$/, "")}/v1`
      : "https://forge.manus.im/v1",
    defaultModel: "gemini-2.5-flash",
    getKey:       () => ENV.BUILT_IN_FORGE_API_KEY ?? "",
  },
  openai: {
    baseUrl:      "https://api.openai.com/v1",
    // 2026-05-12: gpt-4.1-mini > gpt-4o-mini for zh brand voice (cleaner phrasing,
    // less clunky 載體/載入 vocabulary). Override via OPENAI_MODEL env if needed.
    defaultModel: (ENV as any).OPENAI_MODEL || "gpt-4.1-mini",
    getKey:       () => ENV.OPENAI_API_KEY ?? "",
  },
  zhipu: {
    baseUrl:      "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    getKey:       () => ENV.ZHIPU_API_KEY ?? "",
  },
  qwen: {
    baseUrl:      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    getKey:       () => ENV.QWEN_API_KEY ?? "",
  },
  perplexity: {
    baseUrl:      "https://api.perplexity.ai",
    defaultModel: "sonar-pro",
    getKey:       () => ENV.PERPLEXITY_API_KEY ?? "",
  },
  google: {
    baseUrl:      "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    getKey:       () => (ENV as any).GEMINI_API_KEY ?? (ENV as any).GOOGLE_AI_API_KEY ?? "",
  },
  anthropic: {
    baseUrl:      "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-6",
    getKey:       () => (ENV as any).ANTHROPIC_API_KEY ?? "",
  },
  cohere: {
    baseUrl:      "https://api.cohere.com/compatibility/v1",
    defaultModel: "command-r-plus",
    getKey:       () => ENV.COHERE_API_KEY ?? "",
  },
  // ─── Azure AI Foundry endpoints ─────────────────────────────────────────────
  //
  // Resource 1: sowork-foundry-claw-api-router / onbrand
  //   Models: gpt-5.4, gpt-5.4-mini, gpt-5.4-nano, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano,
  //           gpt-4o-mini, o3, o4-mini, grok-4-1-fast, grok-4-20-reasoning,
  //           Kimi-K2.5, Llama-3.3-70B, FW-MiniMax-M2.5, Phi-4-multimodal,
  //           FLUX.2-flex, FLUX.2-pro, MAI-Image-2, MAI-Image-2e,
  //           text-embedding-3-large/small, Cohere-embed-v3-multilingual, Cohere-rerank-v4.0-pro
  //   Key: AZURE_FOUNDRY_API_KEY  Endpoint: AZURE_FOUNDRY_PROJECT_ENDPOINT
  "azure-foundry": {
    // 2026-05-19: Azure AI Foundry inference URL format:
    //   https://{resource}.services.ai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=...
    //
    // AZURE_FOUNDRY_PROJECT_ENDPOINT is the *project management* URL which includes
    // "/api/projects/{project-name}" — that suffix must be stripped for inference calls.
    // Example:
    //   env:       https://sowork-foundry-claw-api-router.services.ai.azure.com/api/projects/proj-mkt-agent-law
    //   inference: https://sowork-foundry-claw-api-router.services.ai.azure.com
    //
    // The deployment path (/openai/deployments/{model}/chat/completions?api-version=...)
    // is appended in invokeLLMOnce / invokeLLMStream per-call.
    baseUrl: (() => {
      const raw = ((ENV as any).AZURE_FOUNDRY_PROJECT_ENDPOINT as string | undefined) ?? "";
      if (!raw) return "https://sowork-foundry-claw-api-router.services.ai.azure.com";
      // Strip /api/projects/... suffix to get bare resource root
      return raw.replace(/\/api\/projects\/[^/]+\/?$/, "").replace(/\/$/, "");
    })(),
    defaultModel: (ENV as any).AZURE_FOUNDRY_MODEL || "gpt-4.1",
    getKey:       () => (ENV as any).AZURE_FOUNDRY_API_KEY ?? "",
  },

  // Resource 2: sowork-ai-position-resource (services.ai.azure.com)
  //   2026-05-08 (CJ): correct endpoint is services.ai.azure.com NOT
  //   cognitiveservices.azure.com, and uses Anthropic-style /anthropic/v1/messages
  //   API (NOT OpenAI-compat /chat/completions). Models claude-sonnet-4-6,
  //   claude-haiku-4-5 — both confirmed via /anthropic/v1/messages.
  //   Key: AZURE_POSITION_API_KEY  Endpoint: AZURE_POSITION_ENDPOINT
  "azure-position": {
    baseUrl:      (ENV as any).AZURE_POSITION_ENDPOINT
      ? `${((ENV as any).AZURE_POSITION_ENDPOINT as string).replace(/\/$/, "")}/anthropic/v1`
      : "https://sowork-ai-position-resource.services.ai.azure.com/anthropic/v1",
    defaultModel: (ENV as any).AZURE_POSITION_MODEL || "claude-sonnet-4-6",
    getKey:       () => (ENV as any).AZURE_POSITION_API_KEY ?? "",
  },

  // Resource 3: proj-claude-sweden-resource (cognitiveservices endpoint)
  //   Models: claude-sonnet-4-6, claude-haiku-4-5, claude-opus-4-5/4-6 (all variants)
  //   Note: deployments showed 失敗 in portal but may work with correct key
  //   Key: AZURE_CLAUDE_SWEDEN_API_KEY  Endpoint: AZURE_CLAUDE_SWEDEN_ENDPOINT
  "azure-claude": {
    baseUrl:      (ENV as any).AZURE_CLAUDE_SWEDEN_ENDPOINT
      ? `${((ENV as any).AZURE_CLAUDE_SWEDEN_ENDPOINT as string).replace(/\/$/, "")}/anthropic/v1`
      : "https://proj-claude-sweden-resource.services.ai.azure.com/anthropic/v1",
    defaultModel: "claude-sonnet-4-6",
    getKey:       () => (ENV as any).AZURE_CLAUDE_SWEDEN_API_KEY ?? "",
  },

  // Resource 4: cjwan-mnykipqt-northcentralus (cognitiveservices endpoint)
  //   Models: DeepSeek-R1, DeepSeek-V3.2, Mistral-Large-3
  //   Key: AZURE_NORTHCENTRAL_API_KEY  Endpoint: AZURE_NORTHCENTRAL_ENDPOINT
  "azure-northcentral": {
    baseUrl:      (ENV as any).AZURE_NORTHCENTRAL_ENDPOINT
      ? `${((ENV as any).AZURE_NORTHCENTRAL_ENDPOINT as string).replace(/\/$/, "")}/openai/v1`
      : "https://cjwan-mnykipqt-northcentralus.cognitiveservices.azure.com/openai/v1",
    defaultModel: "DeepSeek-V3.2",
    getKey:       () => (ENV as any).AZURE_NORTHCENTRAL_API_KEY ?? "",
  },

  // Resource 5: cjwan-mnynpm8k-canadacentral (cognitiveservices endpoint)
  //   Models: gpt-4o-mini-transcribe
  //   Key: AZURE_CANADA_API_KEY  Endpoint: AZURE_CANADA_ENDPOINT
  "azure-canada": {
    baseUrl:      (ENV as any).AZURE_CANADA_ENDPOINT
      ? `${((ENV as any).AZURE_CANADA_ENDPOINT as string).replace(/\/$/, "")}/openai/v1`
      : "https://cjwan-mnynpm8k-canadacentral.cognitiveservices.azure.com/openai/v1",
    defaultModel: "gpt-4o-mini-transcribe",
    getKey:       () => (ENV as any).AZURE_CANADA_API_KEY ?? "",
  },
  // Google Gemini — AI Studio / Generative Language API (OpenAI-compatible shim)
  // Endpoint: https://generativelanguage.googleapis.com/v1beta/openai
  // Key: GEMINI_API_KEY (from AI Studio)
  gemini: {
    baseUrl:      "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    getKey:       () => (ENV as any).GEMINI_API_KEY ?? (ENV as any).GOOGLE_AI_API_KEY ?? "",
  },
  // Gemma (Google open-weights, accessed via the same AI Studio endpoint).
  // 2026-05-12: Gemma 4 does not exist yet; current latest is Gemma 3
  // (gemma-3-27b-it / gemma-3-12b-it / gemma-3-4b-it). Override via GEMMA_MODEL env.
  gemma: {
    baseUrl:      "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: (ENV as any).GEMMA_MODEL || "gemma-3-27b-it",
    getKey:       () => (ENV as any).GEMINI_API_KEY ?? (ENV as any).GOOGLE_AI_API_KEY ?? "",
  },
  // Ollama (local on-VM LLM, tier-8 last-resort fallback). 2026-05-12:
  // CPU-only Qwen 2.5 7B q4_K_M @ ~5 tok/s. Slow but always available.
  // Endpoint defaults to http://127.0.0.1:11434/v1; no API key required
  // (Ollama doesn't enforce auth on the loopback by default).
  // Override model via OLLAMA_MODEL env.
  ollama: {
    baseUrl:      (ENV as any).OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1",
    defaultModel: (ENV as any).OLLAMA_MODEL    || "qwen2.5:7b",
    // Returning a dummy string keeps the cascade's "has key" check happy.
    // Real auth (or lack thereof) is handled by Ollama itself.
    getKey:       () => ((ENV as any).OLLAMA_API_KEY || "local"),
  },
  // Google Vertex AI — OpenAI-compatible endpoint (uses service account)
  "google-vertex": {
    baseUrl:      "https://us-central1-aiplatform.googleapis.com/v1beta1/projects/onbrand-498107/locations/us-central1/endpoints/openapi",
    defaultModel: "google/gemini-2.5-flash",
    getKey:       () => "service-account", // sentinel: token fetched dynamically
  },

  // ─── Hermes Agent — self-hosted on VM ────────────────────────────────────────
  // FastAPI wrapper around the Hermes Agent CLI (hermes_api_server.py).
  // Exposes /v1/chat/completions (OpenAI-compatible) on localhost:8765.
  // Loaded with 1,879 sowork skills — carries full persona + working style.
  //
  // Setup:
  //   1. Deploy hermes-deploy-full.tar.gz to VM
  //   2. Start hermes-api systemd service
  //   3. Add to .env:
  //        HERMES_API_URL=http://127.0.0.1:8765
  //        HERMES_API_KEY=<same Bearer token as in hermes-api.service>
  hermes: {
    baseUrl:      ENV.HERMES_API_URL
      ? ENV.HERMES_API_URL.replace(/\/$/, "")
      : "http://127.0.0.1:8765",
    defaultModel: "hermes",
    getKey:       () => ENV.HERMES_API_KEY ?? "local",
  },
};

// ─── Content normalisation helpers ───────────────────────────────────────────

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") return part;
  if (part.type === "image_url") return part;
  if (part.type === "file_url") return part;

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");
    return { role, name, tool_call_id, content };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // Collapse single text content to plain string for wider API compatibility
  if (contentParts.length === 1 && contentParts[0]!.type === "text") {
    return { role, name, content: (contentParts[0] as any).text as string };
  }

  return { role, name, content: contentParts };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") return toolChoice;

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return { type: "function", function: { name: tools[0]!.function.name } };
  }

  if ("name" in toolChoice) {
    return { type: "function", function: { name: toolChoice.name } };
  }

  return toolChoice;
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name:   schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

// ─── Google Service Account token helper ─────────────────────────────────────

let _googleTokenCache: { token: string; expiresAt: number } | null = null;

async function getGoogleServiceAccountToken(scope = "https://www.googleapis.com/auth/cloud-platform"): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_googleTokenCache && _googleTokenCache.expiresAt > now + 60) {
    return _googleTokenCache.token;
  }

  const credPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "");
  if (!credPath) throw new Error("GOOGLE_APPLICATION_CREDENTIALS not set");

  const fs = await import("fs");
  const sa = JSON.parse(fs.readFileSync(credPath, "utf8"));

  const crypto = await import("crypto");
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  })).toString("base64url");

  const msg = `${header}.${payload}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(msg);
  const sig = sign.sign(sa.private_key, "base64url");
  const jwt = `${msg}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json() as { access_token: string };
  _googleTokenCache = { token: data.access_token, expiresAt: now + 3600 };
  return data.access_token;
}

// ─── Vertex AI Grounding (exported) ──────────────────────────────────────────
// Uses Vertex AI's native generateContent API (NOT the OpenAI-compat shim)
// so that googleSearch grounding tool works.
//
// Requirements (any one is enough):
//   GOOGLE_APPLICATION_CREDENTIALS  — path to service account JSON (preferred)
//   GOOGLE_VERTEX_TOKEN             — pre-issued Bearer token (CI / manual)
//
// Project defaults to GOOGLE_VERTEX_PROJECT_ID env var, then the built-in
// project (onbrand-498107).  Region defaults to us-central1.

const VERTEX_PROJECT = process.env.GOOGLE_VERTEX_PROJECT_ID ?? "onbrand-498107";
const VERTEX_REGION  = process.env.GOOGLE_VERTEX_REGION    ?? "us-central1";

export async function invokeVertexGrounding(opts: {
  query: string;
  system?: string;
  model?: string;
  maxOutputTokens?: number;
}): Promise<string> {
  // Resolve bearer token
  let token = (process.env.GOOGLE_VERTEX_TOKEN ?? "").trim();
  if (!token && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    token = await getGoogleServiceAccountToken("https://www.googleapis.com/auth/cloud-platform");
  }
  if (!token) throw new Error("Vertex AI: no credentials (set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_VERTEX_TOKEN)");

  const model = opts.model ?? "gemini-2.5-flash";
  const url = `https://${VERTEX_REGION}-aiplatform.googleapis.com/v1beta1/projects/${VERTEX_PROJECT}/locations/${VERTEX_REGION}/publishers/google/models/${model}:generateContent`;

  const body: any = {
    contents: [{ role: "user", parts: [{ text: opts.query }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: { maxOutputTokens: opts.maxOutputTokens ?? 2048 },
  };
  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Vertex Grounding ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = await res.json() as any;
  const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text.trim()) throw new Error("Vertex Grounding: empty response");
  return text;
}

// ─── Main invoke function ─────────────────────────────────────────────────────

// Deprecated provider aliases — silently route to the configured default
// so we don't have to edit every legacy call site that hardcoded a now-disabled provider.
//
// 2026-05-04: perplexity added — all 5 keys quota-exhausted (HTTP 401 every call).
// Any caller that still passes provider="perplexity" gets silently rerouted to
// the default provider so we never hit the dead Perplexity endpoint again.
// openai / cohere / forge added for the same reason (keys expired or unavailable).
//
// 2026-05-16 (Option B post-mortem): "openai" REMOVED from this set. Its key
// was re-funded long ago (OPENAI_API_KEY present + working — verified by live
// probe). Leaving it deprecated silently rerouted EVERY provider:"openai"
// call to anthropic, so Option B's intended 25% openai share collapsed back
// onto Claude and the load never actually spread. openai is now a real,
// first-class provider again. (perplexity/openrouter/cohere/forge stay —
// perplexity keys still dead, openrouter is a deprecated alias, cohere/forge
// unused by the current chain.)
const DEPRECATED_PROVIDERS = new Set(["openrouter", "perplexity", "cohere", "forge"]);
function resolveProvider(requested: string | undefined): string {
  // Default: Anthropic (best quality, stable). Override with LLM_DEFAULT_PROVIDER env.
  const def = (process.env.LLM_DEFAULT_PROVIDER as any) || "anthropic";
  if (!requested) return def;
  if (DEPRECATED_PROVIDERS.has(requested)) {
    // Log so we can find legacy call sites and migrate them properly.
    console.warn(`[invokeLLM] provider="${requested}" is deprecated — rerouting to "${def}"`);
    return def;
  }
  return requested;
}

// ─── Language-aware model routing ──────────────────────────────────────────
//
// Heuristic: scan the last 2 user/system messages for CJK / Korean / Japanese.
// If the conversation is mostly Chinese, prefer a model that handles 中文 well
// (Kimi / DeepSeek). For everything else, default to gpt-4o.
//
// Routes can be tuned via env (AZURE_FOUNDRY_MODEL_ZH / AZURE_FOUNDRY_MODEL_EN);
// if those aren't set we fall back to verified-working Azure Foundry deployments.

function detectLanguage(messages: Message[]): "zh" | "ja" | "ko" | "en" {
  const sample = messages
    .slice(-3)
    .map((m) => {
      if (typeof m.content === "string") return m.content;
      if (Array.isArray(m.content)) {
        return m.content
          .map((p) => (typeof p === "string" ? p : (p as TextContent).text ?? ""))
          .join(" ");
      }
      return "";
    })
    .join(" ")
    .slice(0, 2000);

  if (!sample) return "en";

  // Count chars by script
  let zh = 0, ja = 0, ko = 0, total = 0;
  for (const ch of sample) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x80) { total++; continue; }
    total++;
    // CJK Unified Ideographs (Han characters, used by both zh & ja kanji)
    if (code >= 0x4e00 && code <= 0x9fff) zh++;
    // Hiragana / Katakana → Japanese-specific
    else if ((code >= 0x3040 && code <= 0x309f) || (code >= 0x30a0 && code <= 0x30ff)) ja++;
    // Hangul → Korean
    else if ((code >= 0xac00 && code <= 0xd7af) || (code >= 0x1100 && code <= 0x11ff)) ko++;
  }

  // If Hiragana/Katakana present → Japanese (overrides Han count)
  if (ja > 5) return "ja";
  if (ko > 5) return "ko";
  // ≥30% CJK characters → Chinese
  if (total > 0 && zh / total >= 0.3) return "zh";
  return "en";
}

// Verified-working Azure Foundry deployments (probed 2026-04-25):
// gpt-4o (OpenAI), DeepSeek-R1, DeepSeek-V3.2, Mistral-Large-3, Kimi-K2.5
// NOTE 2026-05-03: gpt-5-nano deployment removed from Foundry project.
// Using Kimi-K2.5 as default — confirmed deployed, strong Chinese support.
// Override per-language via AZURE_FOUNDRY_MODEL_ZH / _JA / _KO / _EN env vars.
// 2026-05-19: Kimi-K2.5 is a marketplace model — it cannot be accessed via
// the Azure OpenAI deployment path (/openai/deployments/{name}/...) and causes
// DeploymentNotFound on every call. Default all languages to gpt-4.1 which is
// confirmed working (HTTP 200 from probe). Override via AZURE_FOUNDRY_MODEL_ZH
// etc. env vars if a different per-language model is needed (must be an Azure
// OpenAI-compatible deployment, not a marketplace/serverless endpoint).
const AZURE_MODEL_BY_LANG: Record<string, string> = {
  zh: process.env.AZURE_FOUNDRY_MODEL_ZH || "gpt-4.1",
  ja: process.env.AZURE_FOUNDRY_MODEL_JA || "gpt-4.1",
  ko: process.env.AZURE_FOUNDRY_MODEL_KO || "gpt-4.1",
  en: process.env.AZURE_FOUNDRY_MODEL_EN || "gpt-4.1",
};

function pickAzureModelForMessages(messages: Message[]): string {
  const lang = detectLanguage(messages);
  return AZURE_MODEL_BY_LANG[lang] ?? "gpt-4.1";
}

// Reasoning-model param translation.
// gpt-5*, o1*, o3*, o4* on Azure / OpenAI reject `max_tokens` and require
// `max_completion_tokens` instead. They also reject `temperature` overrides.
// Apply this to the outbound payload right before fetch().
const REASONING_MODEL_RE = /^(gpt-5|o1|o3|o4)/i;
function isReasoningModel(model: string): boolean {
  return REASONING_MODEL_RE.test(model);
}
function adaptPayloadForModel(payload: Record<string, unknown>, model: string): void {
  if (!isReasoningModel(model)) return;
  if ("max_tokens" in payload) {
    payload.max_completion_tokens = payload.max_tokens;
    delete payload.max_tokens;
  }
  // Reasoning models reject temperature overrides; strip if present
  delete payload.temperature;
  delete payload.top_p;
}

/**
 * 2026-05-12 (CJ「全站 fallback chain」): cascade through every viable
 * provider so a single vendor outage / billing pause doesn't take the
 * site down. Chain only runs when the caller didn't pin a specific
 * provider (i.e. legacy / default Anthropic path). Explicit provider
 * requests still go through invokeLLMOnce directly.
 *
 * Override via env LLM_FALLBACK_CHAIN="anthropic,azure-foundry,openai,gemini"
 */
function getFallbackChain(): string[] {
  const envChain = (process.env.LLM_FALLBACK_CHAIN ?? "").trim();
  if (envChain) return envChain.split(",").map((s) => s.trim()).filter(Boolean);
  // 2026-05-13 (CJ「我要怎麼確保品牌定位會成功」): Anthropic credit balance
  // is currently $0 — every call to anthropic returns 400 "credit balance
  // too low". Demoted to LAST so each LLM step wastes 0 RTTs on a known-
  // bad vendor instead of 1-2. Auto-restores when balance is topped up.
  //
  // Set LLM_PRIMARY=anthropic in .env to revert to anthropic-first.
  if (process.env.LLM_PRIMARY === "anthropic") {
    return ["anthropic", "azure-foundry", "openai", "qwen", "deepseek", "gemini", "ollama"];
  }
  // 2026-05-18: azure-foundry root cause fixed — the model name was
  // hardcoded as "gpt-5.4-mini" which does NOT exist as an Azure deployment
  // (portal shows gpt-4o-mini, gpt-4.1-mini etc. — none named gpt-5.4-mini).
  // Corrected to gpt-4o-mini. azure-foundry re-added to cascade.
  // Non-retryable "DeploymentNotFound" errors now permanently open the
  // circuit breaker (see catch block in invokeLLM) so a mis-configured
  // deployment never wastes RTTs even if a key typo slips in again.
  return ["anthropic", "openai", "azure-claude", "azure-foundry", "gemini", "qwen", "zhipu", "ollama"];
}

function isRetryableLLMError(msg: string): boolean {
  // Billing / availability / rate-limit signals — keep going down the chain.
  // 2026-09-21: attempt timeouts belong here too, or a hung vendor reads as a
  // "hard error" and the chain logs it as unexpected.
  return /credit\s*balance|insufficient|quota|rate.?limit|429|401|402|403|400|404|5\d\d|deployment\s*not\s*found|temporarily.*unavail|connection.*reset|ECONNRESET|ETIMEDOUT|fetch\s*failed|attempt\s*timeout|timed?\s*out|aborted/i
    .test(msg);
}

/**
 * Errors that a retry 30 seconds later cannot fix: wrong key, no credit,
 * missing deployment or model, disabled account. They earn the 1-hour circuit
 * instead of the 30s cooloff — otherwise the cascade pays one probe RTT every
 * 30s, forever, on a vendor nobody has fixed yet.
 *
 * Deliberately NOT here: 429, 5xx and timeouts. Those are transient and must
 * keep the short cooloff so a recovered vendor comes back quickly.
 *
 * `access denied` / `good standing` is qwen's shape, measured on prod
 * 2026-09-21: DashScope answers `400 Bad Request – {"error":{"message":"Access
 * denied, please make sure your account is in good standing…"}}`. It is an
 * account-level block, not a bad request — but because it arrives as a 400 the
 * breaker only gave it the 30s cooloff, so one 99s task re-probed it SEVEN
 * times. Cheap each time, but it is pure noise in every log and it is the
 * reason "N failed providers" looked alarming.
 */
const PERMANENT_LLM_ERROR_RE =
  /DeploymentNotFound|deployment\s*not\s*found|ResourceNotFound|credit\s*balance|insufficient[_\s]*(quota|credit|fund)|invalid[_\s]*api[_\s]*key|invalid[_\s-]*x-api-key|authentication[_\s]*(error|failed)|unauthorized|permission[_\s]*denied|access\s*denied|good\s*standing|\b40[13]\b|model.*(not\s*found|does\s*not\s*exist)|account.*(suspended|disabled|deactivated)/i;

/**
 * One provider attempt has to give the turn back quickly.
 *
 * 2026-09-21 (CJ「修 LLM cascade」): not one provider fetch had a timeout, so a
 * vendor that accepted the connection and then hung held the whole task. A
 * cascade without a per-attempt deadline is not a cascade — it is a single
 * point of failure with extra steps: a 99s orchestra run lost its entire 150s
 * budget that way (captions 0 chars, images never ran) while the log only said
 * "succeeded with anthropic after 1 failed providers".
 *
 * The timer guards time-to-response-headers and is cleared the moment fetch
 * resolves, so a streaming body can keep arriving afterwards.
 */
// Read per call, not once at import: an ops change to LLM_ATTEMPT_TIMEOUT_MS
// takes effect on the next request instead of the next restart.
function attemptTimeoutMs(): number {
  const raw = Number(process.env.LLM_ATTEMPT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.max(50, raw) : 20_000;
}

async function fetchProvider(
  url: string,
  init: RequestInit,
  opts: { label: string; caller?: AbortSignal; timeoutMs?: number },
): Promise<Response> {
  const budget = opts.timeoutMs ?? attemptTimeoutMs();
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, budget);
  const relayAbort = () => ctl.abort();
  opts.caller?.addEventListener("abort", relayAbort, { once: true });
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch (e: any) {
    if (timedOut) throw new Error(`${opts.label} attempt timeout after ${budget}ms`);
    if (opts.caller?.aborted) throw new Error(`${opts.label} aborted by caller`);
    throw e;
  } finally {
    clearTimeout(timer);
    opts.caller?.removeEventListener("abort", relayAbort);
  }
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  // 2026-05-12 (CJ「all agents should fallback too」): always cascade on
  // failure, regardless of whether the caller pinned a provider. A pinned
  // provider just becomes tier-1 in the chain. The rest of the default
  // chain rescues if the pinned provider fails.
  //
  // Callers with a single-provider authorization boundary must use
  // invokeLLMSingleProvider instead of entering this cascade.

  const defaultChain = getFallbackChain();
  // Build the effective chain: pinned-first (if any), then the rest
  // (de-duped so a pinned provider doesn't repeat).
  const pinned = params.provider && params.provider !== "openrouter" ? params.provider : null;
  const chainSet = new Set<string>();
  const chain: string[] = [];
  if (pinned) { chain.push(pinned); chainSet.add(pinned); }
  for (const p of defaultChain) {
    if (!chainSet.has(p)) { chain.push(p); chainSet.add(p); }
  }

  // 2026-05-15 (P1): per-provider circuit breaker. If a provider has
  // been failing repeatedly, skip it for COOLOFF rather than waste an
  // RTT on every task call. Auto-recovers via HALF_OPEN probe.
  const { shouldAttempt, recordOutcome } = await import("./llmCircuitBreaker");

  const errors: string[] = [];
  // 2026-09-21 (CJ「修 LLM cascade」): count attempts and breaker skips
  // separately. The old summary said "after N failed providers" where N counted
  // free skips too, so a cascade that cost nothing read exactly like one that
  // burned an RTT per call — which is how a 150s budget blowout got blamed on
  // the wrong thing.
  let attempted = 0;
  let skipped = 0;
  for (const provider of chain) {
    // Skip providers whose key isn't configured
    const cfg = PROVIDER_CONFIG[provider];
    if (!cfg || !cfg.getKey()) continue;
    // Skip if circuit breaker is OPEN for this provider
    if (!shouldAttempt(provider)) {
      skipped += 1;
      errors.push(`${provider}: SKIPPED (circuit OPEN)`);
      continue;
    }
    attempted += 1;
    try {
      // When falling to a non-pinned provider, drop the pinned model so each
      // provider uses its own defaultModel (e.g. "claude-sonnet-4-6" doesn't
      // exist on Azure Foundry; we want gpt-5.4 there instead).
      const isOriginalProvider = pinned && provider === pinned;
      const callParams = isOriginalProvider
        ? { ...params, provider: provider as any }
        : { ...params, provider: provider as any, model: undefined };
      const out = await invokeLLMOnce(callParams);
      // Empty content = soft failure (e.g. gpt-5.4 used its budget on
      // reasoning, never emitted final answer). Cascade moves on.
      const text = out?.choices?.[0]?.message?.content;
      if (typeof text !== "string" || text.trim().length === 0) {
        errors.push(`${provider}: empty content`);
        console.warn(`[invokeLLM] ${provider} returned empty content, trying next…`);
        recordOutcome(provider, false);
        continue;
      }
      // CoT leakage detection: if the model dumped its chain-of-thought
      // instead of a clean answer (typical for reasoning models when the
      // user prompt asks for "直接回傳純文字"), treat as failure.
      if (looksLikeChainOfThought(text)) {
        errors.push(`${provider}: CoT leakage`);
        console.warn(`[invokeLLM] ${provider} CoT leaked (first 100 chars: ${text.slice(0,100)}…), trying next…`);
        recordOutcome(provider, false);
        continue;
      }
      if (attempted > 1 || skipped > 0) {
        console.warn(
          `[invokeLLM] succeeded with ${provider} after ${attempted - 1} failed attempt(s)` +
          `, ${skipped} skipped by breaker`,
        );
      }
      recordOutcome(provider, true);
      return out;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      errors.push(`${provider}: ${msg.slice(0, 120)}`);
      // Permanent failures (DeploymentNotFound, invalid endpoint) are NOT
      // transient — retrying in 30s is pointless and burns RTTs under load.
      // Open the circuit for 1 hour so the cascade skips this provider
      // entirely until a human fixes the configuration.
      const isPermanent = PERMANENT_LLM_ERROR_RE.test(msg);
      if (isPermanent) {
        const { permanentFail } = await import("./llmCircuitBreaker");
        permanentFail(provider);
        console.error(`[invokeLLM] ${provider} permanent failure (circuit open 1h): ${msg.slice(0, 200)}`);
      } else {
        recordOutcome(provider, false);
      }
      if (!isRetryableLLMError(msg)) {
        console.warn(`[invokeLLM] ${provider} hard error, continuing chain: ${msg.slice(0, 200)}`);
      } else {
        console.warn(`[invokeLLM] ${provider} retryable error, continuing: ${msg.slice(0, 200)}`);
      }
    }
  }
  throw new Error(`All LLM providers failed. Tried: ${errors.join(" | ").slice(0, 800)}`);
}

/**
 * Invoke exactly the requested provider once. This is the privacy boundary for
 * payloads whose owner authorized one destination only; it must never enter
 * the normal provider cascade.
 */
export async function invokeLLMSingleProvider(params: InvokeParams): Promise<InvokeResult> {
  const provider = resolveProvider(params.provider as any);
  const config = PROVIDER_CONFIG[provider];
  if (!config || !config.getKey()) throw new Error("LLM provider not configured");

  const { shouldAttempt, recordOutcome } = await import("./llmCircuitBreaker");
  if (!shouldAttempt(provider)) {
    throw new Error(`LLM provider ${provider} is temporarily unavailable`);
  }
  try {
    const out = await invokeLLMOnce({ ...params, provider: provider as any });
    const text = out?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("LLM provider returned empty content");
    }
    if (looksLikeChainOfThought(text)) {
      throw new Error("LLM provider returned unsafe reasoning content");
    }
    recordOutcome(provider, true);
    return out;
  } catch (error) {
    recordOutcome(provider, false);
    throw error;
  }
}

async function invokeLLMOnce(params: InvokeParams): Promise<InvokeResult> {
  // DEBT-1: Real multi-provider routing
  const providerKey = resolveProvider(params.provider as any);
  const config = PROVIDER_CONFIG[providerKey];
  if (!config) throw new Error(`Unknown LLM provider: ${providerKey}`);

  // For Google providers, use service account token if available
  let apiKey: string;
  if (providerKey === "google" && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    apiKey = await getGoogleServiceAccountToken("https://www.googleapis.com/auth/generative-language");
  } else if (providerKey === "google-vertex" && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    apiKey = await getGoogleServiceAccountToken("https://www.googleapis.com/auth/cloud-platform");
  } else {
    apiKey = config.getKey();
  }
  // SEC-4: Obfuscate error — don't leak key names in logs/responses
  if (!apiKey) throw new Error("LLM provider not configured");

  // Model remapping: legacy callers pass OpenRouter-style strings ("anthropic/claude-sonnet-4-6").
  // Since we no longer use OpenRouter, remap any of those to the active provider's defaultModel.
  let model = params.model ?? config.defaultModel;
  const looksLikeProviderPrefixed = model.includes("/") || /^(claude|anthropic|google|gemini|meta|mistral)/i.test(model);
  if (looksLikeProviderPrefixed && providerKey !== "anthropic" && providerKey !== "azure-position") {
    model = config.defaultModel;
  }
  // Azure Foundry: when the caller didn't pin a model, pick by message language.
  if (providerKey === "azure-foundry" && !params.model) {
    model = pickAzureModelForMessages(params.messages);
  }

  // ─ Anthropic-shape providers: native /messages API ────────────────────
  // Both anthropic-direct (api.anthropic.com) and azure-position
  // (services.ai.azure.com/anthropic) use Anthropic's /v1/messages shape:
  //   request:  { system, messages: [{role,content}], model, max_tokens }
  //   headers:  x-api-key + anthropic-version
  //   response: { content: [{type:"text",text:"..."}] }
  if (providerKey === "anthropic" || providerKey === "azure-position") {
    // Convert OpenAI-style message content to Anthropic format.
    // Critical for vision: image_url → { type:"image", source:{type:"base64",...} }
    // Previously, arrays were JSON.stringify'd → Claude never saw the image.
    const toAnthropicContent = (content: any): any => {
      if (typeof content === "string") return content;
      if (!Array.isArray(content)) return JSON.stringify(content);
      const parts = (content as any[]).map((part: any) => {
        if (typeof part === "string") return { type: "text", text: part };
        if (part.type === "text") return { type: "text", text: String(part.text ?? "") };
        if (part.type === "image_url") {
          const url: string = part.image_url?.url ?? "";
          const dataMatch = url.match(/^data:([^;]+);base64,(.+)$/s);
          if (dataMatch) {
            // Base64-encoded image — Anthropic requires source.type=base64
            return {
              type: "image",
              source: { type: "base64", media_type: dataMatch[1], data: dataMatch[2] },
            };
          }
          // Remote URL image
          return { type: "image", source: { type: "url", url } };
        }
        return { type: "text", text: JSON.stringify(part) };
      });
      // Single-text optimisation: Anthropic accepts plain string too
      if (parts.length === 1 && parts[0] && parts[0].type === "text") return (parts[0] as any).text;
      return parts;
    };

    const anthropicMessages: Array<{ role: string; content: any }> = [];
    let systemPrompt = "";
    for (const m of params.messages) {
      const content = toAnthropicContent(m.content);
      if (m.role === "system") {
        const text = typeof content === "string" ? content : JSON.stringify(content);
        systemPrompt += (systemPrompt ? "\n\n" : "") + text;
      } else {
        anthropicMessages.push({ role: m.role, content });
      }
    }
    const anthropicPayload: Record<string, unknown> = {
      model,
      max_tokens: params.maxTokens ?? params.max_tokens ?? 4096,
      messages: anthropicMessages,
    };
    if (systemPrompt) anthropicPayload.system = systemPrompt;

    const apiUrl = `${config.baseUrl}/messages`;
    const r = await fetchProvider(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicPayload),
    }, { label: `${providerKey}/${model}`, caller: params.signal });
    if (!r.ok) {
      const txt = await r.text();
      // 2026-05-12: removed the inner Anthropic→Azure Kimi-K2.5 fallback.
      // The OUTER cascade (invokeLLM wrapper) handles all fallback now —
      // and it does so with the configured AZURE_FOUNDRY_MODEL (gpt-4.1)
      // instead of the hard-coded Kimi-K2.5 which returned reasoning_content
      // only (empty content) and broke /theater for hours.
      throw new Error(`LLM invoke failed (${providerKey}): ${r.status} – ${txt.slice(0, 400)}`);
    }
    const j: any = await r.json();
    const text = (j.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    // Convert to OpenAI-compat shape so callers don't care about provider
    return {
      id: j.id ?? "",
      model: j.model ?? model,
      choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: j.stop_reason ?? "stop" }],
      usage: {
        prompt_tokens: j.usage?.input_tokens ?? 0,
        completion_tokens: j.usage?.output_tokens ?? 0,
        total_tokens: (j.usage?.input_tokens ?? 0) + (j.usage?.output_tokens ?? 0),
      },
    } as any;
  }

  // Azure Northcentral (DeepSeek): per-deployment path + api-version query.
  // Probe 2026-05-08 confirmed this pattern works (DeepSeek-V3.2 200 OK 1.5s).
  // The /openai/v1/chat/completions pattern times out for this resource.
  //
  // Azure AI Foundry also requires deployment name in URL path (not just body):
  // /openai/deployments/{deployment}/chat/completions?api-version=...
  const apiUrl = providerKey === "azure-northcentral"
    ? `${(((ENV as any).AZURE_NORTHCENTRAL_ENDPOINT as string) ?? "https://cjwan-mnykipqt-northcentralus.cognitiveservices.azure.com").replace(/\/$/, "")}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=2024-10-21`
    : providerKey === "azure-foundry"
    ? `${config.baseUrl}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=2024-12-01-preview`
    : `${config.baseUrl}/chat/completions`;

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model,
    messages: messages.map(normalizeMessage),
    max_tokens: params.maxTokens ?? params.max_tokens ?? 8192,
  };

  // 2026-05-12: pass through temperature + penalty for non-reasoning models.
  // gpt-4.1 locks into template phrasing without these; bumps creativity for
  // brand-voice copy without hurting determinism for structured output.
  const anyP = params as any;
  if (typeof anyP.temperature === "number")        payload.temperature       = anyP.temperature;
  if (typeof anyP.presence_penalty === "number")   payload.presence_penalty  = anyP.presence_penalty;
  if (typeof anyP.frequency_penalty === "number")  payload.frequency_penalty = anyP.frequency_penalty;
  // Qwen/DashScope: disable thinking for non-streaming calls (prevents 400 error)
  if (providerKey === "qwen") payload.enable_thinking = false;

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  adaptPayloadForModel(payload, model);

  // Azure providers use api-key header, others use Bearer token
  const authHeaders: Record<string, string> =
    (providerKey === "azure-foundry" || providerKey === "azure-northcentral" || providerKey === "azure-claude" || providerKey === "azure-canada")
      ? { "api-key": apiKey }
      : { authorization: `Bearer ${apiKey}` };

  const response = await fetchProvider(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  }, { label: `${providerKey}/${model}`, caller: params.signal });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  // 2026-05-12 (CJ「Chun-Hao Chen 自我對話」):
  // DO NOT copy reasoning_content into content. For gpt-5*/o3/o4 reasoning
  // models, reasoning_content is the model's internal chain-of-thought,
  // NOT the final answer. Leaking it gives the user "讓我分析一下..." dumps.
  // If content is empty but reasoning_content has text, treat as soft
  // failure → leave content empty and let the cascade fall to the next
  // provider (which will return a clean answer).
  const j: any = await response.json();
  return j as InvokeResult;
}

// 2026-05-12: CoT leakage detector. If a model returns "thinking" output
// instead of a clean answer (despite our prompt asking for direct output),
// flag it so the cascade can fall through.
const COT_LEAK_PATTERNS = [
  /^讓我(分析|想|看看|理解|思考|檢查)/m,
  /^我(需要|應該|來|先)(分析|想想|看看|理解|思考)/m,
  /^用戶(要|想|希望|讓我)/m,
  /^(等等|嗯|好的|讓我重新)/m,
  /^Let me (analyze|think|check|see|understand)/im,
  /<thinking>|<\/thinking>|<reasoning>|<\/reasoning>/i,
];
export function looksLikeChainOfThought(text: string): boolean {
  if (!text || text.length < 40) return false;
  // Heuristic: leading 200 chars look like self-narration
  const head = text.slice(0, 400);
  let hits = 0;
  for (const re of COT_LEAK_PATTERNS) {
    if (re.test(head)) hits++;
  }
  return hits >= 1;
}


// ─── Anthropic native streaming fallback ────────────────────────────────────
/**
 * Stream tokens from Anthropic's native API (different SSE format to OpenAI).
 * Used as fallback when the primary provider fails with a deployment error.
 */
async function* anthropicStream(
  messages: Message[],
  maxTokens: number,
): AsyncGenerator<string> {
  const key = (ENV as any).ANTHROPIC_API_KEY ?? "";
  if (!key) throw new Error("Anthropic not configured");
  // Primary model: claude-sonnet-4-6. Override via ANTHROPIC_MODEL env.
  const model = (ENV as any).ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  // Split system message from conversation
  const systemMsgs = messages.filter((m) => m.role === "system");
  const chatMsgs   = messages.filter((m) => m.role !== "system");
  const systemText = systemMsgs
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n");

  const response = await fetchProvider("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      stream: true,
      ...(systemText ? { system: systemText } : {}),
      messages: chatMsgs.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })),
    }),
  }, { label: `anthropic-stream/${model}` });

  if (!response.ok) {
    const t = await response.text();
    throw new Error(`Anthropic stream ${response.status}: ${t.slice(0, 200)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body from Anthropic");
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      try {
        const json = JSON.parse(trimmed.slice(6)) as any;
        // Anthropic SSE: event type=content_block_delta, delta.type=text_delta
        if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
          const text = json.delta?.text;
          if (text) yield text;
        }
      } catch { /* skip malformed lines */ }
    }
  }
}

// ─── Streaming invoke function ──────────────────────────────────────────────
export async function* invokeLLMStream(params: InvokeParams): AsyncGenerator<string> {
  const providerKey = resolveProvider(params.provider as any);
  const config = PROVIDER_CONFIG[providerKey];
  if (!config) throw new Error(`Unknown LLM provider: ${providerKey}`);

  let apiKey: string;
  if (providerKey === "google" && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    apiKey = await getGoogleServiceAccountToken("https://www.googleapis.com/auth/generative-language");
  } else if (providerKey === "google-vertex" && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    apiKey = await getGoogleServiceAccountToken("https://www.googleapis.com/auth/cloud-platform");
  } else {
    apiKey = config.getKey();
  }
  if (!apiKey) throw new Error("LLM provider not configured");

  // Model remapping: legacy callers pass provider-prefixed strings; remap to the active provider's defaultModel.
  let model = params.model ?? config.defaultModel;
  const looksLikeProviderPrefixed = model.includes("/") || /^(claude|anthropic|google|gemini|meta|mistral)/i.test(model);
  if (looksLikeProviderPrefixed) {
    model = config.defaultModel;
  }
  if (providerKey === "azure-foundry" && !params.model) {
    model = pickAzureModelForMessages(params.messages);
  }
  // Azure AI Foundry requires the deployment name in the URL path:
  // /openai/deployments/{deployment}/chat/completions?api-version=...
  // All other providers use the OpenAI-style /chat/completions with model in body.
  const apiUrl = providerKey === "azure-foundry"
    ? `${config.baseUrl}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=2024-12-01-preview`
    : `${config.baseUrl}/chat/completions`;

  const { messages, tools, toolChoice, tool_choice } = params;
  const payload: Record<string, unknown> = {
    model,
    messages: messages.map(normalizeMessage),
    max_tokens: params.maxTokens ?? params.max_tokens ?? 8192,
    stream: true,
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(toolChoice || tool_choice, tools);
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  adaptPayloadForModel(payload, model);

  // Azure Foundry uses api-key header, others use Bearer token
  const streamAuthHeaders: Record<string, string> = providerKey === "azure-foundry"
    ? { "api-key": apiKey }
    : { authorization: `Bearer ${apiKey}` };

  const response = await fetchProvider(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...streamAuthHeaders,
    },
    body: JSON.stringify(payload),
  }, { label: `${providerKey}-stream/${model}`, caller: params.signal });

  if (!response.ok) {
    const errorText = await response.text();
    const primaryErr = `LLM stream failed: ${response.status} ${response.statusText} – ${errorText}`;
    console.warn(`[invokeLLMStream] primary (${providerKey}/${model}) failed: ${primaryErr.slice(0, 200)}`);

    // ── Fallback chain ────────────────────────────────────────────────
    // Primary = Anthropic  → fallback to Azure Foundry gpt-4.1
    // Primary = other      → fallback to Anthropic (claude-sonnet-4-6)
    if (providerKey === "anthropic") {
      const foundryKey = (ENV as any).AZURE_FOUNDRY_API_KEY ?? (ENV as any).AZURE_AI_API_KEY ?? "";
      // Strip /api/projects/... from the project management URL to get bare resource root
      const foundryEndpoint = ((ENV as any).AZURE_FOUNDRY_PROJECT_ENDPOINT ?? "")
        .replace(/\/api\/projects\/[^/]+\/?$/, "").replace(/\/$/, "");
      if (foundryKey && foundryEndpoint) {
        // 2026-05-12: was hard-coded to Kimi-K2.5 (reasoning model that returns
        // empty content for streaming) — broke /theater. Now defaults to gpt-4.1
        // (non-reasoning, deterministic clean output).
        const fbModel = (ENV as any).AZURE_FOUNDRY_FALLBACK_MODEL ?? "gpt-4.1";
        console.warn(`[invokeLLMStream] Anthropic failed → falling back to Azure Foundry ${fbModel}`);
        // Azure AI Foundry: deployment name must be in URL path, not just body
        const fbUrl = `${foundryEndpoint}/openai/deployments/${encodeURIComponent(fbModel)}/chat/completions?api-version=2024-12-01-preview`;
        const fbPayload = {
          model: fbModel,
          messages: messages.map(normalizeMessage),
          max_tokens: params.maxTokens ?? params.max_tokens ?? 4000,
          stream: true,
        };
        const fbResp = await fetchProvider(fbUrl, {
          method: "POST",
          headers: { "api-key": foundryKey, "content-type": "application/json" },
          body: JSON.stringify(fbPayload),
        }, { label: `azure-foundry-stream/${fbModel}` });
        if (!fbResp.ok) {
          const fbErr = await fbResp.text();
          throw new Error(`All stream providers failed. Anthropic: ${primaryErr.slice(0, 120)} | Azure Foundry: ${fbErr.slice(0, 120)}`);
        }
        const fbReader = fbResp.body?.getReader();
        if (!fbReader) throw new Error("No response body from Azure Foundry fallback");
        const fbDec = new TextDecoder();
        let fbBuf = "";
        while (true) {
          const { done, value } = await fbReader.read();
          if (done) break;
          fbBuf += fbDec.decode(value, { stream: true });
          const fbLines = fbBuf.split("\n");
          fbBuf = fbLines.pop() ?? "";
          for (const line of fbLines) {
            const t = line.trim();
            if (!t || t === "data: [DONE]" || !t.startsWith("data: ")) continue;
            try {
              const j = JSON.parse(t.slice(6)) as any;
              const d = j.choices?.[0]?.delta?.content;
              if (d) yield d;
            } catch { /* skip */ }
          }
        }
        return;
      }
    } else {
      // Primary was not Anthropic → try Anthropic as fallback
      const anthropicKey = (ENV as any).ANTHROPIC_API_KEY ?? "";
      if (anthropicKey) {
        console.warn("[invokeLLMStream] primary failed → falling back to Anthropic claude-sonnet-4-6");
        yield* anthropicStream(messages, params.maxTokens ?? params.max_tokens ?? 4000);
        return;
      }
    }
    throw new Error(primaryErr);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;
      try {
        const json = JSON.parse(trimmed.slice(6)) as any;
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch { /* skip malformed SSE lines */ }
    }
  }
}
