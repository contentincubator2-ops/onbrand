import { describe, expect, it } from "vitest";
import { RUN_IMAGE_MODEL_OPTIONS } from "./runImageModelOptions";

// 2026-09-21 (CJ「只留 NANO BANANA 跟 GPT IMAGE 2 兩個選項」)
describe("RunPage image model options", () => {
  it("only offers GPT Image 2 (first = the default) and Nano Banana", () => {
    expect(RUN_IMAGE_MODEL_OPTIONS.map((o) => o.value)).toEqual(["gpt-image-2", "nano-banana"]);
  });

  it("offers nothing retired — no Flux / Ideogram / Imagen / gpt-image-1 / auto", () => {
    const all = RUN_IMAGE_MODEL_OPTIONS.map((o) => `${o.value} ${o.en} ${o.zh}`).join("\n");
    expect(all).not.toMatch(/flux|ideogram|imagen|gpt-image-1|auto|自動/i);
  });

  it("labels Nano Banana as the fallback the user chooses, not something that runs on its own", () => {
    const nano = RUN_IMAGE_MODEL_OPTIONS.find((o) => o.value === "nano-banana");
    expect(nano?.zh).toContain("GPT Image 2 不行時再選");
  });
});
