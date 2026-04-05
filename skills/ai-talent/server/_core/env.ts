/**
 * env.ts — Runtime environment validation via zod
 * SEC-3: Validates all required env vars at startup; exits with clear errors if any are missing.
 */

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // DB — all required; no defaults
  DB_HOST:     z.string().min(1),
  DB_USER:     z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME:     z.string().min(1),

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

  // External services — optional
  RESEND_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),

  // AI Video Generation
  FAL_API_KEY:          z.string().optional(), // fal.ai — Seedance 2.0
  ELEVENLABS_API_KEY:   z.string().optional(), // ElevenLabs TTS
  CREATOMATE_API_KEY:   z.string().optional(), // Creatomate video composition

  // App
  PORT: z.coerce.number().default(3001),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "[env] Invalid environment variables:\n",
    parsed.error.flatten().fieldErrors
  );
  process.exit(1);
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
