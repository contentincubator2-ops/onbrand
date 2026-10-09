import { describe, it, expect } from "vitest";
import { canRestyleWith, restyleBlock, restyleRequest, MAX_RULES_CHARS } from "./restyleContract";

describe("canRestyleWith", () => {
  it("內建卡誰都能用", () => {
    expect(canRestyleWith("fb-30-caption-short", 12)).toBe(true);
    expect(canRestyleWith("fb-30-caption-short", null)).toBe(true);
  });
  it("自建卡只有同一個品牌能用", () => {
    expect(canRestyleWith("u2992-boss-unboxing", 2992)).toBe(true);
    expect(canRestyleWith("u2992-boss-unboxing", 2964)).toBe(false);
    expect(canRestyleWith("u2992-boss-unboxing", undefined)).toBe(false);
  });
});

describe("restyleBlock", () => {
  it("沒有規則就不產生段落", () => {
    expect(restyleBlock({ label: "反差開場", rules: "  " })).toBe("");
  });
  it("帶卡名、規則、參考案例，事實規則排在最後", () => {
    const out = restyleBlock({ label: "反差開場", rules: "第一句先講反話。", reference: "某案例：先破後立" });
    expect(out).toContain("「反差開場」");
    expect(out).toContain("第一句先講反話。");
    expect(out).toContain("某案例：先破後立");
    expect(out.indexOf("事實規則")).toBeGreaterThan(out.indexOf("第一句先講反話。"));
    expect(out).toContain("目前的文案是唯一的事實來源");
  });
  it("規則太長會截斷", () => {
    const out = restyleBlock({ rules: "字".repeat(MAX_RULES_CHARS + 500) });
    expect(out).toContain("字".repeat(MAX_RULES_CHARS) + "…");
    expect(out).not.toContain("字".repeat(MAX_RULES_CHARS + 1));
  });
});

describe("restyleRequest", () => {
  it("有卡名就帶卡名", () => {
    expect(restyleRequest("三點清單")).toContain("「三點清單」");
    expect(restyleRequest(null)).toContain("任務卡");
  });
});
