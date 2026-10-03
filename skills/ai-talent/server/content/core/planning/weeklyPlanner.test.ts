import { describe, expect, it } from "vitest";
import { addDays, campaignItemsInWeek, mondayOf, parsePlannerReply, railStatusOf, validateOps, weekDays, type SlotRow } from "./weeklyPlanner";
import { FORK_AXES, PLANNER_AXES, isForkAxis, topicOverlap } from "./plannerAdvisors";
import { plannerRouter } from "../../routers/plannerRouter";

describe("日期", () => {
  it("週一開始的七天；週日算前一週", () => {
    expect(mondayOf("2026-09-27")).toBe("2026-09-21");   // 週日
    expect(mondayOf("2026-09-28")).toBe("2026-09-28");
    expect(weekDays("2026-09-28").map((d) => d.label)).toEqual(["週一 9/28", "週二 9/29", "週三 9/30", "週四 10/1", "週五 10/2", "週六 10/3", "週日 10/4"]);
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("validateOps", () => {
  const cards = [
    { id: "fb-post", platform: "facebook", labelZh: "FB 貼文" },
    { id: "fb-carousel", platform: "facebook", labelZh: "FB 輪播" },
    { id: "ig-reels", platform: "instagram", labelZh: "IG Reels" },
  ];
  const slots: SlotRow[] = [
    { id: 1, slotDate: "2026-09-29", platform: "facebook", taskId: "fb-post", taskLabel: null, topic: "舊題目", format: "貼文", reason: null, status: "draft", outputId: null },
    { id: 2, slotDate: "2026-09-30", platform: "facebook", taskId: "fb-post", taskLabel: null, topic: "已寫", format: "貼文", reason: null, status: "written", outputId: 9 },
  ];
  const base = { weekStart: "2026-09-28", platforms: ["facebook", "instagram"], cards, slots };

  it("日期要在這週、通路要是品牌加入的、題目不能空", () => {
    const ops = validateOps({ ...base, raw: [
      { op: "add", date: "2026-09-30", platform: "facebook", taskId: "fb-carousel", topic: "宴客清單", format: "輪播" },
      { op: "add", date: "2026-10-05", platform: "facebook", taskId: "fb-post", topic: "下週一不在這週" },
      { op: "add", date: "2026-09-30", platform: "tiktok", taskId: "x", topic: "沒加入的通路" },
      { op: "add", date: "2026-09-30", platform: "instagram", taskId: "ig-reels", topic: "" },
    ] });
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: "add", taskId: "fb-carousel", repaired: false });
  });

  it("任務卡不存在或不屬於那個通路 → 換成那個通路的預設卡並標 repaired", () => {
    const ops = validateOps({ ...base, raw: [{ op: "add", date: "2026-10-01", platform: "instagram", taskId: "fb-post", topic: "限動早鳥" }] });
    expect(ops[0]).toMatchObject({ taskId: "ig-reels", repaired: true });
  });

  it("已寫好的格子不能改也不能刪；草稿可以", () => {
    const ops = validateOps({ ...base, raw: [
      { op: "update", id: 2, topic: "想改已寫的" }, { op: "remove", id: 2 },
      { op: "update", id: 1, topic: "宴客角度", date: "2026-09-30" }, { op: "remove", id: 99 },
    ] });
    expect(ops).toEqual([{ op: "update", id: 1, topic: "宴客角度", date: "2026-09-30" }]);
  });
});

describe("parsePlannerReply", () => {
  it("解得開、choices 最多 3 個、沒有 reply 視為失敗", () => {
    const r = parsePlannerReply('```json\n{"reply":"排好了。","choices":["三篇風格一致","風格差異大","篇數少一點","第四個"],"ops":[]}\n```');
    expect(r?.reply).toBe("排好了。");
    expect(r?.choices).toHaveLength(3);
    expect(parsePlannerReply('{"choices":[]}')).toBeNull();
  });
});

describe("plannerRouter", () => {
  it("procedure 名稱沒撞 tRPC 保留字", () => {
    const names = Object.keys((plannerRouter as any)._def.procedures).sort();
    expect(names).toEqual(["commit", "markWritten", "pickFork", "railStatus", "releaseSlot", "removeSlot", "send", "week"]);
    for (const n of names) expect(Object.getOwnPropertyNames(Function.prototype)).not.toContain(n);
  });
});

describe("分歧方案卡", () => {
  it("八位顧問全部不同人，每一對立場不同", () => {
    const slugs = FORK_AXES.flatMap((a) => PLANNER_AXES[a].sides.map((s) => s.slug));
    expect(slugs).toHaveLength(8);
    expect(new Set(slugs).size).toBe(8);
    for (const a of FORK_AXES) expect(PLANNER_AXES[a].sides[0].stance).not.toBe(PLANNER_AXES[a].sides[1].stance);
  });
  it("總監回覆帶 fork；不認得的 fork 不算", () => {
    expect(parsePlannerReply('{"reply":"這題有兩種走法","fork":"conversion","ops":[]}')?.fork).toBe("conversion");
    expect(isForkAxis("conversion")).toBe(true);
    expect(isForkAxis("whatever")).toBe(false);
  });
  it("題目重疊度：一樣的高、不同的低", () => {
    const a = ["中秋烤肉就靠橫膈牛排撐場面", "8折早鳥10/16截止"];
    expect(topicOverlap(a, a)).toBeGreaterThan(0.9);
    expect(topicOverlap(a, ["顧客開箱：牛舌下鍋三分鐘", "Tom老闆的選肉標準"])).toBeLessThan(0.2);
  });
});

describe("一版的篇數上限", () => {
  it("最多 7 篇、同日同通路一篇、remove 全留", async () => {
    const { capAdds } = await import("./plannerAdvisors");
    const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
    const ops: any[] = [{ op: "remove", id: 1 }];
    for (const d of days) for (const p of ["facebook", "instagram"]) ops.push({ op: "add", date: d, platform: p });
    ops.push({ op: "add", date: "2026-10-05", platform: "facebook" });
    const out = capAdds(ops);
    expect(out.filter((o) => o.op === "add")).toHaveLength(7);
    expect(out.filter((o) => o.op === "remove")).toHaveLength(1);
  });
});

describe("railStatusOf（側欄儀表）", () => {
  const slot = (id: number, platform: string, status: SlotRow["status"]): SlotRow =>
    ({ id, slotDate: "2026-09-29", platform, taskId: "x", taskLabel: null, topic: "t", format: null, reason: null, status, outputId: status === "written" ? 1 : null });
  it("草稿不算；已寫算進 written；待寫依側欄 nav id 分平台", () => {
    const r = railStatusOf(
      [slot(1, "facebook", "planned"), slot(2, "facebook", "planned"), slot(3, "instagram", "written"), slot(4, "threads", "draft")],
      [{ eventId: 1, eventName: "e", itemId: "a", date: "2026-09-30", platform: "website", taskId: "x", taskLabel: "", angle: "", outputId: null },
       { eventId: 1, eventName: "e", itemId: "b", date: "2026-09-30", platform: "instagram", taskId: "x", taskLabel: "", angle: "", outputId: 5 }],
    );
    expect(r).toEqual({ total: 5, written: 2, pendingByNav: { fb: 2, web: 1 } });
  });
  it("空的一週", () => {
    expect(railStatusOf([], [])).toEqual({ total: 0, written: 0, pendingByNav: {} });
  });
});

describe("campaignItemsInWeek（活動企劃進本週企劃）", () => {
  const ev = { id: 31, name: "上市活動" };
  const item = (id: string, date: string, extra: any = {}) => ({ id, date, platform: "facebook", taskId: "fb-post", taskLabel: "FB 貼文", angle: id, enabled: true, ...extra });
  const items = [
    item("in", "2026-11-02"),
    item("next-week", "2026-11-09"),
    item("skipped", "2026-11-03", { enabled: false }),
    item("opted-out", "2026-11-04", { inPlanner: false }),
    item("written", "2026-11-05", { outputId: 7 }),
  ];

  it("草稿（還沒定稿）的企劃一篇都不進", () => {
    expect(campaignItemsInWeek(ev, { items }, "2026-11-02")).toEqual([]);
  });

  it("定稿後：只收這一週、要做、而且沒被拿掉的", () => {
    const out = campaignItemsInWeek(ev, { items, lockedAt: "2026-10-01T00:00:00Z" }, "2026-11-02");
    expect(out.map((c) => c.itemId)).toEqual(["in", "written"]);
    expect(out[1]).toMatchObject({ eventId: 31, eventName: "上市活動", outputId: 7 });
  });
});
