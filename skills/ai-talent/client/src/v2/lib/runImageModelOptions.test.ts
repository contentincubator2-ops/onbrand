import { describe, expect, it } from "vitest";
import { RUN_IMAGE_MODEL_OPTIONS } from "./runImageModelOptions";

describe("RunPage image model options", () => {
  it("offers GPT Image 2 first and the explicit Nano Banana alternative", () => {
    expect(RUN_IMAGE_MODEL_OPTIONS.map((option) => option.value)).toEqual(["gpt-image-2", "nano-banana"]);
  });

  it("names the model that actually runs, in both languages", () => {
    const [only] = RUN_IMAGE_MODEL_OPTIONS;

    expect(only?.en).toMatch(/gpt image-?2/i);
    expect(only?.zh).toMatch(/GPT Image-?2/i);
  });

  // Every image path appends the system-wide zero-text guard, so no label may
  // promise text rendering (the old Ideogram entry was the offender).
  it("does not promise in-image text", () => {
    for (const option of RUN_IMAGE_MODEL_OPTIONS) {
      expect(option.zh).not.toContain("圖中文字最強");
      expect(option.en).not.toMatch(/strongest at text/i);
    }
  });
});
