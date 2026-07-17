/**
 * brandMarket.ts — resolve a brand's target-market settings for prompt routing.
 *
 * 2026-07-17 (CJ 多市場): brands.targetCountry / outputLanguage were persisted
 * by the onboarding wizard since 2026-05-21 but the copywriting chain still
 * hardcoded market:"zh-TW" and unconditionally ran the zh-TW voice sanitizer.
 * This helper is the single source both the orchestra, squad pipeline and
 * theater use to decide (a) which master persona to inject and (b) whether
 * zh-TW-specific deterministic text hygiene may run.
 *
 * Legacy behavior is preserved: no brandId / no market fields → zh-TW.
 */

import { resolveMarketCode, type MarketCode } from "./copywritingMaster";

export interface BrandMarket {
  /** ISO 3166-1 alpha-2, uppercase. Defaults "TW". */
  targetCountry: string;
  /** BCP 47. Defaults "zh-TW". */
  outputLanguage: string;
  /** true → zh-TW deterministic sanitizers (voiceSanitizeZhTW etc.) may run. */
  isZhTW: boolean;
  /** Closest master persona; null = omit the master block (unmapped language). */
  marketCode: MarketCode | null;
}

export const DEFAULT_BRAND_MARKET: BrandMarket = {
  targetCountry: "TW",
  outputLanguage: "zh-TW",
  isZhTW: true,
  marketCode: "zh-TW",
};

/**
 * Load the brand's market settings. Fail-safe: any error → zh-TW default
 * (never blocks generation).
 */
export async function getBrandMarket(brandId?: number | null): Promise<BrandMarket> {
  if (!brandId) return DEFAULT_BRAND_MARKET;
  try {
    const { default: localPool } = await import("../localDb");
    const [rowsRaw]: any = await localPool.execute(
      `SELECT targetCountry, outputLanguage FROM brands WHERE id = ? LIMIT 1`,
      [brandId],
    );
    const row = Array.isArray(rowsRaw) ? rowsRaw[0] : null;
    const targetCountry = String(row?.targetCountry ?? "TW").toUpperCase() || "TW";
    const outputLanguage = String(row?.outputLanguage ?? "zh-TW") || "zh-TW";
    return {
      targetCountry,
      outputLanguage,
      isZhTW: outputLanguage.toLowerCase() === "zh-tw",
      marketCode: resolveMarketCode(outputLanguage, targetCountry),
    };
  } catch {
    return DEFAULT_BRAND_MARKET;
  }
}
