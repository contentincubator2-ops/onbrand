import { describe, expect, it } from "vitest";
import { RUN_IMAGE_MODEL_OPTIONS } from "./runImageModelOptions";

describe("RunPage image model labels", () => {
  it("does not promise in-image text while the server enforces a zero-text guard", () => {
    const ideogram = RUN_IMAGE_MODEL_OPTIONS.find((option) => option.value === "ideogram-v3");

    expect(ideogram?.en).toContain("text disabled");
    expect(ideogram?.zh).toContain("不生成圖中文字");
    expect(ideogram?.zh).not.toContain("圖中文字最強");
  });
});
