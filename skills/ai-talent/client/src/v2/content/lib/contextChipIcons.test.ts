import { describe, expect, it } from "vitest";
import { CONTEXT_CHIP_ICONS, contextChipIcon } from "./contextChipIcons";

// 任務 modal 會用到的所有脈絡路徑：PlatformTaskPage 的 BRAND／PRODUCT／EVENT
// 預設三組＋任務卡 contextSources 實際出現過的路徑（2026-09-30 盤點）。
// 少一條，那條在 modal 裡就會變成通用圓點圖示。
const KNOWN_SOURCES = [
  "brand.name", "brand.industry",
  "brand.positioning.goldenCircle", "brand.positioning.goldenCircle.why",
  "brand.positioning.tagline.zhTagline",
  "brand.positioning.audience.primary", "brand.positioning.audience.matrix",
  "brand.positioning.competition.direct", "brand.positioning.competition.indirect",
  "brand.positioning.differentiation", "brand.positioning.differentiation.summary",
  "brand.positioning.voice", "brand.positioning.voice.archetypes",
  "brand.positioning.voice.tone", "brand.positioning.voice.forbidden",
  "brand.positioning.values", "brand.positioning.trends",
  "brand.positioning.core.coreStatement", "brand.positioning.core.oneLineValueProp",
  "brand.positioning.value.userFeeling", "brand.positioning.value.primaryEmotion",
  "brand.positioning.competition.uniqueUsp",
  "brand.positioning.marketing.tone", "brand.positioning.marketing.style",
  "product.positioning.coreStatement", "product.positioning.usp",
  "brand.positioning.audience.primaryAudience",
  "brand.positioning.smp.singleMindedProposition",
  "brand.positioning.messaging.coreMessage",
  "brand.positioning.creative.coreTranslation",
  "brand.positioning.context.coreProblem",
];

describe("contextChipIcons", () => {
  it("每條已知脈絡路徑都有專屬圖示與短名", () => {
    for (const src of KNOWN_SOURCES) {
      const m = CONTEXT_CHIP_ICONS[src];
      expect(m, src).toBeDefined();
      expect(m!.short.length, src).toBeGreaterThan(0);
    }
  });

  // 圖示名是 IconName 型別，拼錯 tsc 就過不了，不在這裡重驗（測試環境載不進 icons.tsx 的 React）。

  it("語氣不是笑臉、WHY 不是燈泡（CJ 2026-09-30）", () => {
    expect(CONTEXT_CHIP_ICONS["brand.positioning.voice.tone"]!.icon).toBe("tone");
    expect(CONTEXT_CHIP_ICONS["brand.positioning.goldenCircle.why"]!.icon).toBe("why");
    expect(CONTEXT_CHIP_ICONS["brand.positioning.goldenCircle.why"]!.icon).not.toBe("ideas");
  });

  it("沒登記的路徑退回通用圖示，短名用欄位名", () => {
    expect(contextChipIcon("brand.positioning.somethingNew", "新欄位")).toEqual({ icon: "dot", short: "新欄位", shortEn: "新欄位" });
  });
});
