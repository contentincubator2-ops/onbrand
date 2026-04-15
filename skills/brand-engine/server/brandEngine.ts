/**
 * ARCH-1: This file is now a thin re-export shim.
 * The canonical implementation lives in skills/ai-talent/server/brand/brandEngine.ts.
 * This avoids duplicating ~200 lines of brand engine logic.
 */

export {
  analyzeBrandPositioning,
  generateCampaignPositioning,
} from "../../ai-talent/server/brand/brandEngine";

export type { BrandAnalysisInput, BrandPositioningResult } from "../../ai-talent/server/brand/brandEngine";
