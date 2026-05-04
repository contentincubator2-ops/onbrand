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
  // Note: "openrouter" is deprecated — at runtime it's silently routed to LLM_DEFAULT_PROVIDER.
  provider?: "forge" | "openai" | "zhipu" | "qwen" | "perplexity" | "google" | "cohere" | "openrouter" | "anthropic" | "azure-foundry" | "azure-position" | "azure-claude" | "azure-northcentral" | "azure-canada" | "google-vertex" | "gemini" | "hermes";
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
    defaultModel: "gpt-4o-mini",
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
  // Resource 1: sowork-foundry-claw-api-router / proj-mkt-agent-law
  //   Models: gpt-5.4, gpt-5.4-mini, gpt-5.4-nano, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano,
  //           gpt-4o-mini, o3, o4-mini, grok-4-1-fast, grok-4-20-reasoning,
  //           Kimi-K2.5, Llama-3.3-70B, FW-MiniMax-M2.5, Phi-4-multimodal,
  //           FLUX.2-flex, FLUX.2-pro, MAI-Image-2, MAI-Image-2e,
  //           text-embedding-3-large/small, Cohere-embed-v3-multilingual, Cohere-rerank-v4.0-pro
  //   Key: AZURE_FOUNDRY_API_KEY  Endpoint: AZURE_FOUNDRY_PROJECT_ENDPOINT
  "azure-foundry": {
    baseUrl:      (ENV as any).AZURE_FOUNDRY_PROJECT_ENDPOINT
      ? `${((ENV as any).AZURE_FOUNDRY_PROJECT_ENDPOINT as string).replace(/\/$/, "")}/openai/v1`
      : "https://sowork-foundry-claw-api-router.services.ai.azure.com/api/projects/proj-mkt-agent-law/openai/v1",
    defaultModel: (ENV as any).AZURE_FOUNDRY_MODEL || "gpt-5.4-mini",
    getKey:       () => (ENV as any).AZURE_FOUNDRY_API_KEY ?? "",
  },

  // Resource 2: sowork-ai-position-resource (cognitiveservices endpoint)
  //   Models: claude-sonnet-4-6, claude-haiku-4-5, gpt-5.4-pro, gpt-5.4-nano,
  //           cohere-command-a, FLUX.1-Kontext-pro,
  //           gpt-image-1/1-mini/1.5/2, gpt-4o-mini-tts, gpt-4o-transcribe,
  //           gpt-audio-1.5, whisper
  //   Key: AZURE_POSITION_API_KEY  Endpoint: AZURE_POSITION_ENDPOINT
  "azure-position": {
    baseUrl:      (ENV as any).AZURE_POSITION_ENDPOINT
      ? `${((ENV as any).AZURE_POSITION_ENDPOINT as string).replace(/\/$/, "")}/openai/v1`
      : "https://sowork-ai-position-resource.cognitiveservices.azure.com/openai/v1",
    defaultModel: (ENV as any).AZURE_POSITION_MODEL || "claude-sonnet-4-6",
    getKey:       () => (ENV as any).AZURE_POSITION_API_KEY ?? "",
  },

  // Resource 3: proj-claude-sweden-resource (cognitiveservices endpoint)
  //   Models: claude-sonnet-4-6, claude-haiku-4-5, claude-opus-4-5/4-6 (all variants)
  //   Note: deployments showed 失敗 in portal but may work with correct key
  //   Key: AZURE_CLAUDE_SWEDEN_API_KEY  Endpoint: AZURE_CLAUDE_SWEDEN_ENDPOINT
  "azure-claude": {
    baseUrl:      (ENV as any).AZURE_CLAUDE_SWEDEN_ENDPOINT
      ? `${((ENV as any).AZURE_CLAUDE_SWEDEN_ENDPOINT as string).replace(/\/$/, "")}/openai/v1`
      : "https://proj-claude-sweden-resource.cognitiveservices.azure.com/openai/v1",
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
  // Google Vertex AI — OpenAI-compatible endpoint (uses service account)
  "google-vertex": {
    baseUrl:      "https://us-central1-aiplatform.googleapis.com/v1beta1/projects/ecommerce-483415/locations/us-central1/endpoints/openapi",
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
// project (ecommerce-483415).  Region defaults to us-central1.

const VERTEX_PROJECT = process.env.GOOGLE_VERTEX_PROJECT_ID ?? "ecommerce-483415";
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

  const model = opts.model ?? "gemini-2.0-flash";
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
const DEPRECATED_PROVIDERS = new Set(["openrouter", "perplexity", "openai", "cohere", "forge"]);
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
const AZURE_MODEL_BY_LANG: Record<string, string> = {
  zh: process.env.AZURE_FOUNDRY_MODEL_ZH || "Kimi-K2.5",
  ja: process.env.AZURE_FOUNDRY_MODEL_JA || "Kimi-K2.5",
  ko: process.env.AZURE_FOUNDRY_MODEL_KO || "Kimi-K2.5",
  en: process.env.AZURE_FOUNDRY_MODEL_EN || "gpt-4o",
};

function pickAzureModelForMessages(messages: Message[]): string {
  const lang = detectLanguage(messages);
  return AZURE_MODEL_BY_LANG[lang] ?? "gpt-4o";
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

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
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
  if (looksLikeProviderPrefixed) {
    model = config.defaultModel;
  }
  // Azure Foundry: when the caller didn't pin a model, pick by message language.
  if (providerKey === "azure-foundry" && !params.model) {
    model = pickAzureModelForMessages(params.messages);
  }
  const apiUrl = `${config.baseUrl}/chat/completions`;

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

  // Azure Foundry uses api-key header, others use Bearer token
  const authHeaders: Record<string, string> = providerKey === "azure-foundry"
    ? { "api-key": apiKey }
    : { authorization: `Bearer ${apiKey}` };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
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

  const response = await fetch("https://api.anthropic.com/v1/messages", {
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
  });

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
  const apiUrl = `${config.baseUrl}/chat/completions`;

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

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...streamAuthHeaders,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const primaryErr = `LLM stream failed: ${response.status} ${response.statusText} – ${errorText}`;
    console.warn(`[invokeLLMStream] primary (${providerKey}/${model}) failed: ${primaryErr.slice(0, 200)}`);

    // ── Fallback chain ────────────────────────────────────────────────
    // Primary = Anthropic  → fallback to Azure Foundry gpt-4o
    // Primary = other      → fallback to Anthropic (claude-sonnet-4-6)
    if (providerKey === "anthropic") {
      const foundryKey = (ENV as any).AZURE_FOUNDRY_API_KEY ?? (ENV as any).AZURE_AI_API_KEY ?? "";
      const foundryEndpoint = ((ENV as any).AZURE_FOUNDRY_PROJECT_ENDPOINT ?? "").replace(/\/$/, "");
      if (foundryKey && foundryEndpoint) {
        // Fallback model: set AZURE_FOUNDRY_FALLBACK_MODEL env to any confirmed-deployed model.
        // Confirmed as of 2026-04-25: gpt-4o, Kimi-K2.5, DeepSeek-V3.2, Mistral-Large-3
        // gpt-5-nano was removed; use Kimi-K2.5 as default — strong model, handles zh well.
        const fbModel = (ENV as any).AZURE_FOUNDRY_FALLBACK_MODEL ?? "Kimi-K2.5";
        console.warn(`[invokeLLMStream] Anthropic failed → falling back to Azure Foundry ${fbModel}`);
        const fbUrl = `${foundryEndpoint}/openai/v1/chat/completions`;
        const fbPayload = {
          model: fbModel,
          messages: messages.map(normalizeMessage),
          max_tokens: params.maxTokens ?? params.max_tokens ?? 4000,
          stream: true,
        };
        const fbResp = await fetch(fbUrl, {
          method: "POST",
          headers: { "api-key": foundryKey, "content-type": "application/json" },
          body: JSON.stringify(fbPayload),
        });
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
