import { describe, expect, it } from "vitest";
import { END_STAGE, stageTimes, summarizeFunnel } from "./activationFunnel";

const t = (min: number) => new Date(Date.UTC(2026, 8, 30, 0, min));

describe("activationFunnel", () => {
  it("TTFV ends at the first adopted angle", () => {
    expect(END_STAGE.id).toBe("activation.first_angle_adopted");
  });

  it("counts old 七日發布台 events as the same stages, taking the earliest", () => {
    const st = stageTimes({
      "activation.register_completed": t(0),
      "activation.first_theater_arrived": t(5),
      "activation.first_inspiration_arrived": t(9),
      "activation.first_week_generated": t(20),
    });
    expect(st["activation.first_inspiration_arrived"]).toEqual(t(5));
    expect(st["activation.first_angle_adopted"]).toEqual(t(20));
  });

  it("mixes legacy and new users in one funnel without double counting", () => {
    const byUser = new Map<number, Record<string, Date>>([
      // 改版前：走七日發布台
      [1, { "activation.register_completed": t(0), "activation.first_theater_arrived": t(3), "activation.first_week_generated": t(10) }],
      // 改版後：走靈感舞台
      [2, { "activation.register_completed": t(0), "activation.first_inspiration_arrived": t(2), "activation.first_angle_adopted": t(6) }],
      // 兩種都有（跨改版）：只算一次，終點取最早
      [3, { "activation.register_completed": t(0), "activation.first_week_generated": t(30), "activation.first_angle_adopted": t(12) }],
      // 還沒到終點
      [4, { "activation.register_completed": t(0), "activation.first_brand_created": t(1) }],
    ]);
    const s = summarizeFunnel(byUser);
    const users = Object.fromEntries(s.funnel.map((f) => [f.id, f.users]));
    expect(users["activation.register_completed"]).toBe(4);
    expect(users["activation.first_inspiration_arrived"]).toBe(2);
    expect(users["activation.first_angle_adopted"]).toBe(3);
    expect(s.ttfvMs.count).toBe(3);
    expect(s.recent.find((r) => r.userId === 3)?.ttfvMs).toBe(12 * 60_000);
    expect(s.ttfvMs.p50).toBe(10 * 60_000);
    expect(s.funnel[0]!.pctOfRegistered).toBe(100);
  });
});
