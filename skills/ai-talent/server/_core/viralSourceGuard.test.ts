import { describe, it, expect } from "vitest";
import {
  checkViralSource,
  platformLabelOf,
  templateNeedsViralSource,
} from "./viralSourceGuard";
import { TT_60S_TASKS } from "./quickTaskMulti60";

const ttViral = TT_60S_TASKS.find((t) => t.id === "tt-60-viral-rewrite")!;

describe("checkViralSource — 有提供來源就放行", () => {
  it("accepts a pasted TikTok link", () => {
    expect(checkViralSource("https://www.tiktok.com/@someone/video/7412345678901234567").ok).toBe(true);
  });

  it("accepts a bare share link with no protocol", () => {
    expect(checkViralSource("vt.tiktok.com/ZSAbCdEfG/").ok).toBe(true);
  });

  it("accepts a link with a note around it", () => {
    expect(checkViralSource("這支 https://vt.tiktok.com/ZSAbCdEfG/ 我想改成我們的版本").ok).toBe(true);
  });

  it("accepts a described topic (no link) — 主題也算有提供", () => {
    expect(checkViralSource("下班後 10 分鐘快煮那支").ok).toBe(true);
    expect(checkViralSource("超商減脂餐開箱").ok).toBe(true);
  });

  it("accepts an English topic that is specific enough", () => {
    expect(checkViralSource("get ready with me winter edition").ok).toBe(true);
  });

  it("does not reject a long answer that merely starts with 不知道", () => {
    expect(checkViralSource("不知道算不算爆款，就是那支「租屋處小廚房」的影片").ok).toBe(true);
  });
});

describe("checkViralSource — 沒提供就報錯", () => {
  it("flags an empty field", () => {
    const r = checkViralSource("");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issue).toBe("empty");
    expect(r.message.zh).toContain("請貼上");
  });

  it("treats whitespace-only (incl. full-width space) as empty", () => {
    const r = checkViralSource("  　 ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issue).toBe("empty");
  });

  it.each(["無", "沒有", "不知道", "隨便", "你決定", "test", "N/A", "。。。", "跳過"])(
    "flags filler answer %s",
    (v) => {
      const r = checkViralSource(v);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.issue).toBe("filler");
    },
  );

  it("flags echoing the field label back (爆款連結)", () => {
    const r = checkViralSource("爆款連結");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issue).toBe("filler");
  });

  it("flags a CJK answer too short to identify a post", () => {
    const r = checkViralSource("美食");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issue).toBe("too_short");
  });

  it("flags a latin answer too short to identify a post", () => {
    const r = checkViralSource("grwm");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issue).toBe("too_short");
  });

  it("quotes the user's own words back so the message is actionable", () => {
    const r = checkViralSource("隨便");
    if (r.ok) throw new Error("expected rejection");
    expect(r.message.zh).toContain("「隨便」");
  });

  it("names the platform when the caller passes one", () => {
    const r = checkViralSource("", { platformLabel: "TikTok" });
    if (r.ok) throw new Error("expected rejection");
    expect(r.message.zh).toContain("TikTok");
    expect(r.message.en).toContain("TikTok");
  });
});

describe("wiring — tt-60-viral-rewrite", () => {
  it("is recognised as a viral-rewrite task", () => {
    expect(templateNeedsViralSource(ttViral as any)).toBe(true);
  });

  it("resolves its platform label from outputDefaults", () => {
    expect(platformLabelOf(ttViral as any)).toBe("TikTok");
  });

  it("leaves a non-rewrite task alone", () => {
    const foryou = TT_60S_TASKS.find((t) => t.id === "tt-60-foryou-full")!;
    expect(templateNeedsViralSource(foryou as any)).toBe(false);
  });
});
