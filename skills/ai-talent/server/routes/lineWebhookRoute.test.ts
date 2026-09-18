import { describe, it, expect } from "vitest";
import { parseCommand, LINE_MENU } from "./lineWebhookRoute";

describe("LINE_MENU", () => {
  it("has no duplicate labels — the prefix is how a message is routed", () => {
    const labels = LINE_MENU.map((m) => m.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("has no label that is a prefix of another (would make routing ambiguous)", () => {
    for (const a of LINE_MENU) {
      for (const b of LINE_MENU) {
        if (a === b) continue;
        expect(b.label.startsWith(a.label)).toBe(false);
      }
    }
  });
});

describe("parseCommand", () => {
  it("splits a full-width-colon command into task + topic", () => {
    const r = parseCommand("FB貼文：中元普渡怎麼跟孩子解釋");
    expect(r?.entry.taskId).toBe("fb-30-caption-short");
    expect(r?.topic).toBe("中元普渡怎麼跟孩子解釋");
  });

  it("accepts the half-width colon too — the IME swaps them freely", () => {
    const r = parseCommand("IG輪播:三個用故事解釋中元的方法");
    expect(r?.entry.taskId).toBe("ig-60-carousel-7");
    expect(r?.topic).toBe("三個用故事解釋中元的方法");
  });

  it("trims whatever the user left around the topic", () => {
    expect(parseCommand("IG貼文：   睡前故事   ")?.topic).toBe("睡前故事");
  });

  it("returns an empty topic (not null) when only the prefix was sent", () => {
    const r = parseCommand("FB貼文：");
    expect(r).not.toBeNull();
    expect(r?.topic).toBe("");
  });

  it("returns null for plain chat so the caller can answer with the menu", () => {
    expect(parseCommand("你好")).toBeNull();
    expect(parseCommand("")).toBeNull();
    expect(parseCommand("   ")).toBeNull();
  });

  it("does not match a label that merely appears mid-sentence", () => {
    expect(parseCommand("我想要一篇 FB貼文：可以嗎")?.entry).toBeUndefined();
  });

  it("carries the tier, because a carousel must run on the 60s budget", () => {
    expect(parseCommand("IG輪播：測試")?.entry.tier).toBe("60s");
    expect(parseCommand("FB貼文：測試")?.entry.tier).toBe("30s");
  });
});
