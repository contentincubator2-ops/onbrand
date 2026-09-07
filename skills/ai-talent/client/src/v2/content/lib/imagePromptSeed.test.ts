import { describe, expect, it } from "vitest";
import { isKeywordSlug, pickImagePromptSeed } from "./imagePromptSeed";

/* Regression guard for CJ「右邊的圖片指令，不要顯示英文的，要顯示中文的」:
 * an IG strategy (企劃) run used to seed the editable 你的圖片指令 box with the
 * model's English keyword slug. */
const IG_STRATEGY_SLUG =
  "authentic-lifestyle-photography-warm-natural-light-family-table-scene-mid-autumn-" +
  "gathering-child-eating-limited-food-choices-mother-genuine-expression-home-kitchen-" +
  "setting-real-family-moment-not-staged";

describe("isKeywordSlug", () => {
  it("catches the English keyword chain an IG strategy run produces", () => {
    expect(isKeywordSlug(IG_STRATEGY_SLUG)).toBe(true);
    expect(isKeywordSlug("warm_natural_light_family_table")).toBe(true);
  });

  it("leaves real prose alone in either language", () => {
    expect(isKeywordSlug("陽光灑落在溫暖木桌上，一碗冒著煙的湯。")).toBe(false);
    expect(isKeywordSlug("A warm wooden table in soft natural light.")).toBe(false);
    // Hyphenated prose is not a slug — it has spaces.
    expect(isKeywordSlug("photo-realistic kitchen scene, mid-autumn")).toBe(false);
    // Two segments is an ordinary compound word, not a keyword chain.
    expect(isKeywordSlug("photo-realistic")).toBe(false);
    expect(isKeywordSlug("")).toBe(false);
  });

  it("treats a hyphenated string containing CJK as usable text", () => {
    expect(isKeywordSlug("溫暖木桌-自然光-家庭場景")).toBe(false);
  });
});

describe("pickImagePromptSeed", () => {
  it("drops an IG strategy slug so the caller falls back to a Chinese brief", () => {
    expect(
      pickImagePromptSeed({ imagePromptZh: null, imagePrompt: null, imageStyle: IG_STRATEGY_SLUG }),
    ).toBe("");
  });

  it("still prefers the Chinese counterpart of the real model prompt", () => {
    expect(
      pickImagePromptSeed({
        imagePromptZh: "溫暖自然光下的家庭餐桌。",
        imagePrompt: "A family table in warm natural light.",
        imageStyle: IG_STRATEGY_SLUG,
      }),
    ).toBe("溫暖自然光下的家庭餐桌。");
  });

  it("keeps seeding the real English model prompt when no Chinese one exists", () => {
    // 2026-08-19 behaviour, deliberately preserved: the on-screen text must
    // match the picture that was actually generated.
    expect(
      pickImagePromptSeed({
        imagePromptZh: null,
        imagePrompt: "A family table in warm natural light.",
        imageStyle: IG_STRATEGY_SLUG,
      }),
    ).toBe("A family table in warm natural light.");
  });

  it("keeps a human-written style direction from older quick-task runs", () => {
    expect(
      pickImagePromptSeed({
        imagePromptZh: null,
        imagePrompt: null,
        imageStyle: "寫實生活感，自然光，不刻意擺拍。",
      }),
    ).toBe("寫實生活感，自然光，不刻意擺拍。");
  });

  it("returns an empty seed when the variant carries no visual information", () => {
    expect(pickImagePromptSeed({})).toBe("");
  });
});
