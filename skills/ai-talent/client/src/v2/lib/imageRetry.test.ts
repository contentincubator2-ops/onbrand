import { describe, it, expect } from "vitest";
import { failedImageSlots } from "./imageRetry";

describe("failed image recovery targets", () => {
  it("offers old failures without needing newly added metadata", () => {
    expect(failedImageSlots({ imageStatus: "failed", imagePromptZh: "桌面", caption: "文案" }))
      .toEqual([{ prompt: "桌面" }]);
  });
  it("does not flag pending, skipped text-only tasks, or a usable old image", () => {
    for (const imageStatus of [undefined, "pending", "skipped", "ready"]) {
      expect(failedImageSlots({ imageStatus, caption: "文案" })).toEqual([]);
    }
    expect(failedImageSlots({ imageStatus: "failed", imageUrl: "/static/old.png" })).toEqual([]);
  });
  it("allows a retry when the task budget skipped a requested image", () => {
    expect(failedImageSlots({ imageStatus: "skipped", imageErrorMsg: "任務預算已用盡", imagePrompt: "Desk" }))
      .toEqual([{ prompt: "Desk" }]);
  });
  it("targets only failed frames with their own prompts, not the cover", () => {
    expect(failedImageSlots({ imageStatus: "ready", imageUrl: "/static/cover.png", cards: [
      { image: { status: "ready", url: "/static/good.png" } },
      { headline: "Scene 2", image: { status: "failed", prompt: "Desk" } },
      { headline: "Scene 3", body: "Notes", image: { status: "timeout" } },
      { image: { status: "pending" } },
    ] })).toEqual([{ cardIndex: 1, prompt: "Desk" }, { cardIndex: 2, prompt: "Scene 3 Notes" }]);
  });
});
