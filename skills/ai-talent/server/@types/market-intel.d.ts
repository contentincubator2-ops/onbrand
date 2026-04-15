// Type declarations for cross-package market-intel dynamic import
declare module "../../../market-intel/server/marketIntel" {
  export function fetchMarketIntel(params: Record<string, unknown>): Promise<unknown>;
  export function formatMarketIntelForPrompt(intel: unknown): string;
}
declare module "../../../market-intel/server/marketIntel.ts" {
  export function fetchMarketIntel(params: Record<string, unknown>): Promise<unknown>;
  export function formatMarketIntelForPrompt(intel: unknown): string;
}
