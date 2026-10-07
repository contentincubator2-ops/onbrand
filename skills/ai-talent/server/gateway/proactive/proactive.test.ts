import { describe, it, expect } from "vitest";
import { fmtTaipei, fmtYmd, taipeiMidnight, taipeiParts } from "./proactiveTime";
import { keepFutureAdds, proactiveInstruction, targetWeek, weekKey } from "./weekPlanCheck";
import { publishUnapprovedEvent, reviewOverdueEvent, type OverdueReview, type UnapprovedPost } from "./reviewChecks";
import { inDigestWindow } from "./proactiveEngine";
import type { Op } from "../../content/core/planning/weeklyPlanner";

// 2026-10-05 是週一。台北 = UTC+8。
const taipei = (ymd: string, hh = 9) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() + (hh - 8) * 3_600_000);

describe("proactive · 台北時間", () => {
  it("UTC 的週日晚上在台北已經是週一", () => {
    expect(taipeiParts(new Date("2026-10-04T16:30:00Z"))).toEqual({ ymd: "2026-10-05", dow: 1, hour: 0, minute: 30 });
  });
  it("台北午夜換回絕對時間", () => {
    expect(taipeiMidnight("2026-10-12").toISOString()).toBe("2026-10-11T16:00:00.000Z");
  });
  it("格式", () => {
    expect(fmtTaipei(new Date("2026-10-08T02:00:00Z"))).toBe("10/8（四）10:00");
    expect(fmtYmd("2026-10-07")).toBe("10/7（三）");
  });
});

describe("proactive · 發文節奏：該排哪一週", () => {
  it("週一到週三排這一週，只排今天起的日子", () => {
    expect(targetWeek(taipei("2026-10-05"))).toEqual({ weekStart: "2026-10-05", fromDate: "2026-10-05" });
    expect(targetWeek(taipei("2026-10-07"))).toEqual({ weekStart: "2026-10-05", fromDate: "2026-10-07" });
  });
  it("週四、週五不排", () => {
    expect(targetWeek(taipei("2026-10-08"))).toBeNull();
    expect(targetWeek(taipei("2026-10-09"))).toBeNull();
  });
  it("週六、週日排下一週", () => {
    expect(targetWeek(taipei("2026-10-10"))).toEqual({ weekStart: "2026-10-12", fromDate: "2026-10-12" });
    expect(targetWeek(taipei("2026-10-11"))).toEqual({ weekStart: "2026-10-12", fromDate: "2026-10-12" });
  });
  it("同一個品牌同一週只有一個 key", () => {
    expect(weekKey(2992, "2026-10-05")).toBe("week:2992:2026-10-05");
  });
});

describe("proactive · 發文節奏：主動排的這一版只新增", () => {
  const add = (date: string): Op => ({ op: "add", date, platform: "facebook", taskId: "t", topic: "題目", format: "貼文", reason: "", repaired: false });
  it("丟掉已經過去的日子、改動與刪除，最多留 5 篇", () => {
    const ops: Op[] = [add("2026-10-05"), add("2026-10-07"), { op: "remove", id: 3 }, { op: "update", id: 4, topic: "改" },
      add("2026-10-08"), add("2026-10-09"), add("2026-10-10"), add("2026-10-11"), add("2026-10-11")];
    const kept = keepFutureAdds(ops, "2026-10-07");
    expect(kept).toHaveLength(5);
    expect(kept.every((o) => o.op === "add" && o.date >= "2026-10-07")).toBe(true);
  });
  it("提示詞講明不要問問題、不要開分歧", () => {
    const p = proactiveInstruction("2026-10-07");
    expect(p).toContain("2026-10-07");
    expect(p).toContain("fork 填 null");
  });
});

describe("proactive · 審核與發布", () => {
  const now = new Date("2026-10-07T04:00:00Z");
  const review: OverdueReview = {
    queueId: 11, outputId: 99, brandId: 7, brandName: "媽爹", title: "中秋檔期貼文", platform: "facebook",
    requesterId: 5, requesterName: "Frankie", createdAt: new Date("2026-10-06T01:00:00Z"), scheduledAt: new Date("2026-10-08T02:00:00Z"),
  };
  it("卡住的送審：寫出等了多久、誰送的、什麼時候要發，帶去審核佇列", () => {
    const e = reviewOverdueEvent(review, 42, now);
    expect(e.userId).toBe(42);
    expect(e.dedupeKey).toBe("review:11");
    expect(e.title).toBe("「中秋檔期貼文」等你審核已經 27 小時");
    expect(e.body).toBe("Frankie 送審 · 媽爹 · FB · 預計 10/8（四）10:00 發布");
    expect(e.navUrl).toBe("/review");
  });
  it("等超過兩天改用天數", () => {
    const e = reviewOverdueEvent({ ...review, createdAt: new Date("2026-10-04T03:00:00Z") }, 42, now);
    expect(e.title).toContain("3 天");
  });

  const post: UnapprovedPost = {
    scheduledId: 8, userId: 5, brandId: 7, brandName: "媽爹", outputId: 99, title: "中秋檔期貼文", platform: "instagram",
    scheduledAt: new Date("2026-10-07T14:00:00Z"),
  };
  it("還有十小時：一般事件，講明沒核准不會自己發", () => {
    const e = publishUnapprovedEvent(post, "not_submitted", now);
    expect(e.urgency).toBe("normal");
    expect(e.title).toBe("10/7（三）22:00 要發的 IG 貼文還沒送審");
    expect(e.body).toContain("不會自動發出去");
    expect(e.navUrl).toBe("/run/99");
    expect(e.dedupeKey).toBe("sched:8");
  });
  it("剩不到兩小時：急件", () => {
    const e = publishUnapprovedEvent({ ...post, scheduledAt: new Date("2026-10-07T05:30:00Z") }, "in_review", now);
    expect(e.urgency).toBe("urgent");
    expect(e.title).toContain("還在審核中");
  });
});

describe("proactive · 每日彙整時段", () => {
  it("台北 9 點到中午前", () => {
    expect(inDigestWindow(taipei("2026-10-07", 8))).toBe(false);
    expect(inDigestWindow(taipei("2026-10-07", 9))).toBe(true);
    expect(inDigestWindow(taipei("2026-10-07", 11))).toBe(true);
    expect(inDigestWindow(taipei("2026-10-07", 12))).toBe(false);
  });
});
