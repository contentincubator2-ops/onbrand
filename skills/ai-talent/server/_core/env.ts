export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Twitter OAuth 2.0
  twitterClientId: process.env.TWITTER_CLIENT_ID ?? "",
  twitterClientSecret: process.env.TWITTER_CLIENT_SECRET ?? "",
  // Google OAuth 2.0 (YouTube + Google Ads)
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  // Meta (Facebook + Instagram)
  metaAppId: process.env.META_APP_ID ?? "",
  metaAppSecret: process.env.META_APP_SECRET ?? "",
  // Shopify
  shopifyClientId: process.env.SHOPIFY_CLIENT_ID ?? "",
  shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET ?? "",
  // Zhipu AI (GLM-4)
  zhipuApiKey: process.env.ZHIPU_API_KEY ?? "",
  // Resend (Email)
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  // Multi-model AI providers
  qwenApiKey: process.env.QWEN_API_KEY ?? "",
  perplexityApiKey: process.env.PERPLEXITY_API_KEY ?? "",
  googleAiApiKey: process.env.GOOGLE_AI_API_KEY ?? "",
  cohereApiKey: process.env.COHERE_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  tavilyApiKey: process.env.TAVILY_API_KEY ?? "",
};
