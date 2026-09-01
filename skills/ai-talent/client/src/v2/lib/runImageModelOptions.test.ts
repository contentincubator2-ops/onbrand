import { describe, expect, it } from "vitest";
import { RUN_IMAGE_MODEL_OPTIONS } from "./runImageModelOptions";

describe("RunPage image model labels", () => {
  it("does not promise in-image text while the server enforces a zero-text guard", () => {
    const ideogram = RUN_IMAGE_MODEL_OPTIONS.find((option) => option.value === "ideogram-v3");

    expect(ideogram?.en).toContain("text disabled");
    expect(ideogram?.zh).toContain("不生成圖中文字");
    expect(ideogram?.zh).not.toContain("圖中文字最強");
  });

  // 2026-09-01 (CJ「open ai 我指定使用 gpt image 2」).
  it("offers gpt-image-2 as the only OpenAI choice", () => {
    const values = RUN_IMAGE_MODEL_OPTIONS.map((option) => option.value);

    expect(values).toContain("gpt-image-2");
    expect(values).not.toContain("gpt-image-1");
  });

  // The Google entry keeps the legacy "imagen-3" value because variants
  // already store it; only the label was corrected to the model that runs.
  it("does not advertise Imagen for a choice the key cannot run", () => {
    const google = RUN_IMAGE_MODEL_OPTIONS.find((option) => option.value === "imagen-3");

    expect(google).toBeDefined();
    expect(google?.en).not.toMatch(/imagen/i);
    expect(google?.zh).not.toMatch(/imagen/i);
  });
});
