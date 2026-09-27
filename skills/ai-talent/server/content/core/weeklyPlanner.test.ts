import { describe, expect, it } from "vitest";
import { addDays, mondayOf, parsePlannerReply, validateOps, weekDays, type SlotRow } from "./weeklyPlanner";
import { plannerRouter } from "../routers/plannerRouter";

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
    expect(names).toEqual(["commit", "markWritten", "removeSlot", "send", "week"]);
    for (const n of names) expect(Object.getOwnPropertyNames(Function.prototype)).not.toContain(n);
  });
});
