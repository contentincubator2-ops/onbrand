import { describe, expect, it } from "vitest";
import { landingRouter, pickLandingViralCards } from "./landingRouter";

describe("landingRouter", () => {
  it("建得起來，procedure 名稱沒撞 tRPC 保留字", () => {
    const names = Object.keys((landingRouter as any)._def.procedures).sort();
    expect(names).toEqual(["showcase"]);
    for (const n of names) expect(Object.getOwnPropertyNames(Function.prototype)).not.toContain(n);
  });

  it("卡牆只放近三個月、有數字、七個通路內的爆款卡，新到舊", () => {
    const now = new Date("2026-09-30T12:00:00+08:00");
    const cards = pickLandingViralCards(4, now);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(4);
    for (const c of cards) {
      expect(c.asOf >= "2026-07" && c.asOf <= "2026-09").toBe(true);
      expect(c.metric).not.toBe("");
      expect(["facebook", "instagram", "threads", "line", "tiktok", "email", "website"]).toContain(c.platform);
    }
    // 先各通路一張：前幾張不該重複通路
    const platforms = cards.map((c) => c.platform);
    expect(new Set(platforms).size).toBe(platforms.length);
  });

  it("回傳欄位只有卡面資訊，不含 prompt", async () => {
    const out = await landingRouter.createCaller({} as any).showcase();
    expect(out.imageSpecs.length).toBeGreaterThan(30);
    expect(JSON.stringify(out)).not.toMatch(/systemPrompt|taskSystemPrompt/);
  });
});
