/**
 * env.ts — Runtime environment validation via zod
 * SEC-3: Validates all required env vars at startup; exits with clear errors if any are missing.
 */

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // DB — primary DB is mos_db on localhost; these env vars are legacy/optional.
  // Actual connection uses LOCAL_DB_* (see db.ts + localDb.ts).
  DB_HOST:     z.string().optional(),
  DB_USER:     z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_NAME:     z.string().optional(),

  // mos_db local connection (preferred)
  LOCAL_DB_HOST:     z.string().optional(),
  LOCAL_DB_USER:     z.string().optional(),
  LOCAL_DB_PASSWORD: z.string().optional(),
  LOCAL_DB_NAME:     z.string().optional(),

  // JWT — required and minimum length enforced
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),

  // LLM providers — at least one should be set (validated at runtime when needed)
  BUILT_IN_FORGE_API_KEY: z.string().optional(),
  BUILT_IN_FORGE_API_URL: z.string().optional(),
  ZHIPU_API_KEY:          z.string().optional(),
  QWEN_API_KEY:           z.string().optional(),
  PERPLEXITY_API_KEY:     z.string().optional(),
  GOOGLE_AI_API_KEY:      z.string().optional(),
  COHERE_API_KEY:         z.string().optional(),
  OPENAI_API_KEY:         z.string().optional(),
  OPENROUTER_API_KEY:       z.string().optional(),
  ANTHROPIC_API_KEY:        z.string().optional(),
  AZURE_FOUNDRY_API_KEY:    z.string().optional(),
  AZURE_FOUNDRY_PROJECT_ENDPOINT: z.string().url().optional(),
  AZURE_POSITION_API_KEY:   z.string().optional(),
  AZURE_POSITION_ENDPOINT:  z.string().url().optional(),
  AZURE_POSITION_MODEL:     z.string().optional(),
  GOOGLE_VERTEX_API_KEY:    z.string().optional(),
  // 2026-08-21: real ASR wiring (persona-agent training for caption-less
  // video/audio). llm.ts's PROVIDERS["azure-canada"] already templated a
  // baseUrl off this endpoint, but read it via `(ENV as any)` — the key was
  // never in this schema, so it always resolved to undefined until now.
  AZURE_CANADA_API_KEY:     z.string().optional(),
  AZURE_CANADA_ENDPOINT:    z.string().url().optional(),

  // Hermes Agent — self-hosted on VM via FastAPI wrapper
  // Set HERMES_API_URL=http://127.0.0.1:8765 after deploying hermes_api_server.py
  HERMES_API_URL:  z.string().url().optional(),
  HERMES_API_KEY:  z.string().optional(),   // Bearer token set in hermes-api.service

  // Azure Search
  AZURE_SEARCH_ENDPOINT:   z.string().url().optional(),
  AZURE_SEARCH_API_KEY:    z.string().optional(),
  AZURE_SEARCH_INDEX_NAME: z.string().default("brand-knowledge"),

  // OAuth — optional for deployments that don't use them
  OAUTH_SERVER_URL:    z.string().optional(),
  OWNER_OPEN_ID:       z.string().optional(),
  VITE_APP_ID:         z.string().optional(),

  // Social OAuth — optional
  TWITTER_CLIENT_ID:     z.string().optional(),
  TWITTER_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID:      z.string().optional(),
  GOOGLE_CLIENT_SECRET:  z.string().optional(),
  META_APP_ID:           z.string().optional(),
  META_APP_SECRET:       z.string().optional(),
  SHOPIFY_CLIENT_ID:     z.string().optional(),
  SHOPIFY_CLIENT_SECRET: z.string().optional(),
  // 2026-08-21 (CJ「很多人，影音就是放在google drive, one drive」— persona
  // agent cloud-file connect): native OAuth, reuses GOOGLE_CLIENT_ID/SECRET
  // above (same Google Cloud project — just needs Drive API enabled + this
  // redirect URI whitelisted) plus a new Microsoft Entra app registration.
  MICROSOFT_CLIENT_ID:     z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),

  // External services — optional
  RESEND_API_KEY:    z.string().optional(),
  SENDGRID_API_KEY:  z.string().optional(),
  EMAIL_FROM:        z.string().optional(),
  TAVILY_API_KEY:    z.string().optional(),

  // AI Video Generation
  // FAL_API_KEY removed 2026-05-05 — fal.ai disabled site-wide.
  PIAPI_KEY:            z.string().optional(), // PiAPI aggregator (Flux Pro / Kling / Runway / SDXL …)
  ELEVENLABS_API_KEY:   z.string().optional(), // ElevenLabs TTS
  CREATOMATE_API_KEY:   z.string().optional(), // Creatomate video composition

  // App
  PORT: z.coerce.number().default(3101),

  // Authentication
  APP_URL: z.string().url().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "[env] Invalid environment variables:\n",
    parsed.error.flatten().fieldErrors
  );
  process.exit(1);
}

// 2026-05-08 (P0-A): production warnings — log loudly if email config
// missing, but DON'T crash. The runtime registration/forgot-password
// paths now hard-fail their own request when email send errors, which
// gives the actual user a clear message. Crashing startup just means
// the whole site is down (502) until ops fills in keys.
if (parsed.data.NODE_ENV === "production") {
  const hasEmailKey = !!(parsed.data.SENDGRID_API_KEY || parsed.data.RESEND_API_KEY);
  if (!hasEmailKey) {
    console.warn(
      "[env] WARN: production missing SENDGRID_API_KEY / RESEND_API_KEY — email auth (register / forgot password) will hard-fail at runtime."
    );
  }
  if (!parsed.data.EMAIL_FROM) {
    console.warn("[env] WARN: production missing EMAIL_FROM — using default noreply@sowork.ai.");
  }
  if (!parsed.data.APP_URL) {
    console.warn("[env] WARN: production missing APP_URL — verification / reset links will use http://localhost:3001.");
  }

  // 2026-05-08 (P1-6): JWT secret entropy check. Schema enforces ≥ 32
  // chars but doesn't catch low-entropy strings like "aaaaa..." or the
  // dev default. We measure unique-character count — a real random 32+
  // char base64 secret has ~30+ unique characters; padding/repetition
  // brings that down fast.
  const secret = parsed.data.JWT_SECRET ?? "";
  const uniqueChars = new Set(secret).size;
  if (uniqueChars < 16) {
    console.warn(
      `[env] WARN: production JWT_SECRET has only ${uniqueChars} unique chars — likely weak. Generate via: openssl rand -base64 64`,
    );
  }
  if (secret.includes("local-dev") || secret.includes("changeme") || secret.includes("example")) {
    console.warn(
      `[env] WARN: production JWT_SECRET looks like a dev placeholder. Rotate immediately.`,
    );
  }
}

// SEC-7: JWT_SECRET is intentionally excluded from the ENV spread to prevent
// accidental logging (e.g. console.log(ENV), structured log sinks, Sentry breadcrumbs).
// Use getJwtSecret() wherever the secret is needed.
export const ENV = (() => {
  const { JWT_SECRET: _, ...rest } = parsed.data;
  return rest;
})();

/** Read-once secret accessor — prevents accidental logging of the JWT secret. */
let _jwtSecretCallCount = 0;
export function getJwtSecret(): string {
  _jwtSecretCallCount++;
  if (_jwtSecretCallCount > 1 && parsed.data!.NODE_ENV !== "production") {
    console.warn("[env] getJwtSecret() called multiple times — ensure the secret is not being leaked");
  }
  return parsed.data!.JWT_SECRET;
}
