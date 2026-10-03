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
  checkTaskAllowed, isViewerOnly, isHiddenHistoryItem, isHiddenTaskId,
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
      { __channels: { platforms: ["tiktok", "email"], swappedAt: "2026-09-01T00:00:00Z" } },
      Q({ platforms: 2 }),
    );
    expect(sel.platforms).toEqual(["tiktok", "email"]);
    expect(sel.swappedAt).toBe("2026-09-01T00:00:00Z");
  });

  it("降級時多存的會被截掉", () => {
    const sel = resolveChannels(
      { __channels: { platforms: ["a", "b", "c", "d", "e"], swappedAt: null } },
      Q({ platforms: 2 }),
    );
    expect(sel.platforms).toEqual(["a", "b"]);
  });

  it("無限方案拿得到全部（下架的通路除外）", () => {
    const all = resolveChannels(null, Q({ platforms: -1 })).platforms;
    expect(all).toEqual(expect.arrayContaining(["facebook", "instagram", "tiktok", "email", "website"]));
    for (const p of ["linkedin", "youtube", "x", "pr"]) expect(all).not.toContain(p);
  });

  it("存過已下架的通路，讀出來就被濾掉", () => {
    const sel = resolveChannels(
      { __channels: { platforms: ["youtube", "facebook", "linkedin"], swappedAt: null } },
      Q({ platforms: 2 }),
    );
    expect(sel.platforms).toEqual(["facebook"]);
  });

  it("任務目錄不列下架通路的卡（不論方案）", () => {
    const tasks = [{ platform: "facebook" }, { platform: "linkedin" }, { platform: "youtube" }, { platform: "x" }, { platform: "pr" }, { platform: "website" }];
    const out = filterTasksByPlan(tasks, Q({ platforms: -1 }), { platforms: [], swappedAt: null });
    expect(out.map((t) => t.platform)).toEqual(["facebook", "website"]);
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

describe("執行層閘門 —— 列表看不到不等於不能用", () => {
  const basic = Q({ viralTaskCards: false, platforms: 2 });
  const pro = Q({ viralTaskCards: true, platforms: 5 });
  const ch = { platforms: ["facebook", "instagram"], swappedAt: null };

  it("基礎方案直接打爆款卡的 id 也要被擋", () => {
    const v = checkTaskAllowed(basic, ch, { platform: "facebook", sourceType: "viral" });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("viral");
    expect(v.message).toContain("專業方案");
  });

  it("沒開的通路擋下，訊息告訴他去哪裡換", () => {
    const v = checkTaskAllowed(basic, ch, { platform: "tiktok", sourceType: "award" });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("channel");
    expect(v.message).toContain("已開通路");
  });

  it("不知道品牌開了哪些通路時，跳過通路檢查 —— 寧可放過也不誤殺", () => {
    const v = checkTaskAllowed(basic, null, { platform: "tiktok", sourceType: "award" });
    expect(v.ok).toBe(true);
  });

  it("但爆款卡不依賴品牌，即使不知道通路也一律擋", () => {
    const v = checkTaskAllowed(basic, null, { platform: null, sourceType: "viral" });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("viral");
  });

  it("查不到的卡（自建／品牌包客製）兩道檢查都不觸發", () => {
    expect(checkTaskAllowed(basic, ch, { platform: null, sourceType: null }).ok).toBe(true);
  });

  it("專業方案在自己開的通路上跑爆款卡，放行", () => {
    expect(checkTaskAllowed(pro, ch, { platform: "facebook", sourceType: "viral" }).ok).toBe(true);
  });

  it("無限通路的方案不做通路檢查", () => {
    expect(checkTaskAllowed(Q({ platforms: -1, viralTaskCards: true }), ch,
      { platform: "tiktok", sourceType: "award" }).ok).toBe(true);
  });
});

describe("角色閘門 —— viewer 只能看", () => {
  it("只有 viewer 角色就不能動", () => {
    expect(isViewerOnly(["viewer"])).toBe(true);
    expect(isViewerOnly(["viewer", "viewer"])).toBe(true);
  });
  it("有任何 editor 以上的角色就放行", () => {
    expect(isViewerOnly(["viewer", "editor"])).toBe(false);
    expect(isViewerOnly(["admin"])).toBe(false);
    expect(isViewerOnly(["owner"])).toBe(false);
  });
  it("沒有任何 workspace 紀錄（solo 用戶）放行 —— 不能因為沒加入團隊就被鎖", () => {
    expect(isViewerOnly([])).toBe(false);
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

  it("席次：基礎 2、專業 5 —— 5 席是審核工作流要求產出者與放行者分開", () => {
    expect(PLANS.drop_starter.quota.team_members).toBe(2);
    expect(PLANS.drop_pro.quota.team_members).toBe(5);
  });
});

describe("審核工作流閘門", () => {
  it("價目表：審核工作流只在專業（5 席）與企業，基礎（2 席）與試用沒有", () => {
    expect(PLANS.drop_starter.quota.reviewWorkflow).toBe(false);
    expect(PLANS.trial.quota.reviewWorkflow).toBe(false);
    expect(PLANS.drop_pro.quota.reviewWorkflow).toBe(true);
    expect(PLANS.enterprise.quota.reviewWorkflow).toBe(true);
  });
});

describe("策略監測閘門", () => {
  it("價目表 2026-09-08：策略監測定義在專業（9,000）與企業，基礎與試用沒有", () => {
    expect(PLANS.drop_starter.quota.strategyMonitoring).toBe(false);
    expect(PLANS.trial.quota.strategyMonitoring).toBe(false);
    expect(PLANS.drop_pro.quota.strategyMonitoring).toBe(true);
    expect(PLANS.enterprise.quota.strategyMonitoring).toBe(true);
  });
  it("專業方案的 features 說得出策略監測，基礎的沒有", () => {
    expect(PLANS.drop_pro.features.some((f) => f.includes("策略監測"))).toBe(true);
    expect(PLANS.drop_starter.features.some((f) => f.includes("策略監測"))).toBe(false);
  });
});


describe("下架通路（2026-09-29）", () => {
  it("歷史資料的各種寫法都認得：platform 別名與 task id 前綴", () => {
    for (const platform of ["linkedin", "youtube", "x", "pr", "press", "li", "yt", "LinkedIn"]) {
      expect(isHiddenHistoryItem({ platform })).toBe(true);
    }
    // X 的產出記成 generic，只能靠 task id
    expect(isHiddenHistoryItem({ platform: "generic", taskId: "x-thread-hook" })).toBe(true);
    expect(isHiddenTaskId("li-post")).toBe(true);
    expect(isHiddenTaskId("pr-release")).toBe(true);
  });

  it("五個保留通路不誤殺", () => {
    for (const platform of ["facebook", "instagram", "tiktok", "email", "website"]) {
      expect(isHiddenHistoryItem({ platform })).toBe(false);
    }
    for (const taskId of ["fb-99-carousel-5", "ig-reel", "tt-hook", "em-welcome", "web-article", "live-x"]) {
      expect(isHiddenTaskId(taskId)).toBe(false);
    }
  });

  it("執行層：下架通路不論方案都不能跑", () => {
    const v = checkTaskAllowed(Q({ platforms: -1, viralTaskCards: true }), null, { platform: "linkedin", sourceType: "award" });
    expect(v.ok).toBe(false);
  });
});
