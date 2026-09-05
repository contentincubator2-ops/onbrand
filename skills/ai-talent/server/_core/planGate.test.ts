/**
 * planGate.test — 方案閘門壞掉不會報錯，只會默默放行。
 *
 * 這正是 2026-09-06 之前的狀況：plans.ts 寫著「Starter 每月 50 次」，
 * 但 runsPerCycle 連一行檢查都沒有，沒有任何測試會紅。所以這裡測的是
 * 「有沒有真的擋」，而不是「函式回傳型別對不對」。
 */
import { describe, it, expect } from "vitest";
import {
  isUnlimited, resolveChannels, daysUntilSwap, filterTasksByPlan, checkCap,
} from "./planGate";
import { PLANS } from "./plans";

const Q = (over: Partial<any> = {}) => ({
  platforms: 2, platformSwapDays: 30, viralTaskCards: false,
  ownTaskCards: 3, products: 0, eventsPerCycle: 0, ...over,
});

describe("isUnlimited", () => {
  it("-1 與未填都算無限", () => {
    expect(isUnlimited(-1)).toBe(true);
    expect(isUnlimited(null)).toBe(true);
    expect(isUnlimited(undefined)).toBe(true);
    expect(isUnlimited(0)).toBe(false);
    expect(isUnlimited(2)).toBe(false);
  });
});

describe("通路選擇", () => {
  it("沒選過時給方案額度內的預設，不是全部開放", () => {
    const sel = resolveChannels(null, Q({ platforms: 2 }));
    expect(sel.platforms).toHaveLength(2);
    expect(sel.platforms).toEqual(["facebook", "instagram"]);
  });

  it("預設全開等於這條線沒生效——所以基礎方案不能拿到 11 個", () => {
    expect(resolveChannels(null, Q({ platforms: 2 })).platforms.length).toBeLessThan(11);
    expect(resolveChannels(null, Q({ platforms: 5 })).platforms).toHaveLength(5);
  });

  it("存過就用存的", () => {
    const sel = resolveChannels(
      { __channels: { platforms: ["tiktok", "youtube"], swappedAt: "2026-09-01T00:00:00Z" } },
      Q({ platforms: 2 }),
    );
    expect(sel.platforms).toEqual(["tiktok", "youtube"]);
    expect(sel.swappedAt).toBe("2026-09-01T00:00:00Z");
  });

  it("降級時多存的會被截掉", () => {
    const sel = resolveChannels(
      { __channels: { platforms: ["a", "b", "c", "d", "e"], swappedAt: null } },
      Q({ platforms: 2 }),
    );
    expect(sel.platforms).toEqual(["a", "b"]);
  });

  it("無限方案拿得到全部", () => {
    expect(resolveChannels(null, Q({ platforms: -1 })).platforms.length).toBeGreaterThanOrEqual(11);
  });
});

describe("換通路冷卻", () => {
  const now = new Date("2026-09-20T00:00:00Z");
  it("從沒換過就可以立刻換", () => {
    expect(daysUntilSwap({ platforms: [], swappedAt: null }, Q(), now)).toBe(0);
  });
  it("30 天內換過就要等", () => {
    const d = daysUntilSwap({ platforms: [], swappedAt: "2026-09-10T00:00:00Z" }, Q(), now);
    expect(d).toBe(20);
  });
  it("超過冷卻期就是 0", () => {
    expect(daysUntilSwap({ platforms: [], swappedAt: "2026-07-01T00:00:00Z" }, Q(), now)).toBe(0);
  });
  it("冷卻設 0 代表隨時可換", () => {
    expect(daysUntilSwap({ platforms: [], swappedAt: "2026-09-19T00:00:00Z" },
      Q({ platformSwapDays: 0 }), now)).toBe(0);
  });
});

describe("目錄過濾", () => {
  const tasks = [
    { id: "a", platform: "facebook", source: { type: "award" } },
    { id: "b", platform: "facebook", source: { type: "viral" } },
    { id: "c", platform: "tiktok", source: { type: "evergreen" } },
    { id: "d", platform: "tiktok", source: { type: "viral" } },
  ];
  const ch = { platforms: ["facebook", "instagram"], swappedAt: null };

  it("基礎方案看不到爆款結構卡——這是 2,250 → 9,000 的升級鉤子", () => {
    const out = filterTasksByPlan(tasks, Q({ viralTaskCards: false, platforms: -1 }), ch);
    expect(out.map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("專業方案看得到爆款卡", () => {
    const out = filterTasksByPlan(tasks, Q({ viralTaskCards: true, platforms: -1 }), ch);
    expect(out).toHaveLength(4);
  });

  it("只留已啟用的通路", () => {
    const out = filterTasksByPlan(tasks, Q({ viralTaskCards: true, platforms: 2 }), ch);
    expect(out.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("兩道濾網會疊加", () => {
    const out = filterTasksByPlan(tasks, Q({ viralTaskCards: false, platforms: 2 }), ch);
    expect(out.map((t) => t.id)).toEqual(["a"]);
  });
});

describe("數量上限", () => {
  it("未達上限放行，訊息帶出用量讓人判斷要不要升級", () => {
    expect(checkCap(2, 3, "張").ok).toBe(true);
    const r = checkCap(3, 3, "張自建卡");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("3");
    expect(r.message).toContain("張自建卡");
  });
  it("無限就永遠放行", () => {
    expect(checkCap(9999, -1, "張").ok).toBe(true);
  });
});

describe("方案表本身", () => {
  it("兩個自助方案的差異真的存在於額度上", () => {
    const basic = PLANS.drop_starter.quota;
    const pro = PLANS.drop_pro.quota;
    expect(basic.platforms).toBe(2);
    expect(pro.platforms).toBe(5);
    expect(basic.viralTaskCards).toBe(false);
    expect(pro.viralTaskCards).toBe(true);
    expect(basic.ownTaskCards).toBe(3);
    expect(pro.ownTaskCards).toBe(10);
    expect(basic.products).toBe(0);
    expect(pro.products).toBe(10);
    expect(basic.eventsPerCycle).toBe(0);
    expect(pro.eventsPerCycle).toBe(1);
  });

  it("功能限制已拿掉：兩級都不限執行次數、都開放企劃", () => {
    for (const p of [PLANS.drop_starter, PLANS.drop_pro]) {
      expect(p.quota.runsPerCycle).toBe(-1);
      expect(p.quota.task_99s).toBe(-1);
      expect(p.quota.team_members).toBeGreaterThanOrEqual(2);
    }
  });
});
