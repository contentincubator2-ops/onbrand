import { describe, expect, it } from "vitest";
import { dueToday, readPushSettings, type PushSettings } from "./factPush";

const TODAY = "2026-09-23";
const base = (p: Partial<PushSettings> = {}): PushSettings =>
  ({ cadence: "weekly", audience: [], lastPushedAt: null, ...p });

const call = (settings: PushSettings, p: Partial<Parameters<typeof dueToday>[0]> = {}) =>
  dueToday({ settings, autoAudience: [1, 2], expiresOn: null, forwardable: true, today: TODAY, ...p });

describe("readPushSettings", () => {
  it("defaults to off when nothing is set", () => {
    expect(readPushSettings({})).toEqual({ cadence: "off", audience: [], lastPushedAt: null });
  });

  it("rejects a cadence it does not know rather than trusting it", () => {
    expect(readPushSettings({ push_cadence: "hourly" }).cadence).toBe("off");
  });

  it("reads a named audience from JSON or an array", () => {
    expect(readPushSettings({ push_audience: "[3,4]" }).audience).toEqual([3, 4]);
    expect(readPushSettings({ push_audience: [5] }).audience).toEqual([5]);
  });

  // 壞掉的 JSON 退回自動比對，不要讓整則消息消失。
  it("falls back to automatic matching when the stored audience is broken", () => {
    expect(readPushSettings({ push_audience: "{oops" }).audience).toEqual([]);
  });
});

describe("dueToday", () => {
  it("uses the industry match when nobody was named", () => {
    expect(call(base()).audience).toEqual([1, 2]);
  });

  it("prefers the people the author named", () => {
    expect(call(base({ audience: [9] })).audience).toEqual([9]);
  });

  it("never sends when the cadence is off", () => {
    expect(call(base({ cadence: "off" })).due).toBe(false);
  });

  // 指名不能繞過時效 —— 過期的補助推出去是業務要對客戶吞的難堪。
  it("refuses to send past the deadline even to a named audience", () => {
    const r = call(base({ audience: [9] }), { expiresOn: "2026-09-22" });
    expect(r.due).toBe(false);
    expect(r.reason).toContain("deadline");
  });

  it("never sends something HQ-only or unverified", () => {
    expect(call(base(), { forwardable: false }).due).toBe(false);
  });

  it("does not send when there is nobody to send to", () => {
    expect(call(base(), { autoAudience: [] }).due).toBe(false);
  });

  describe("once", () => {
    it("sends the first time and never again", () => {
      expect(call(base({ cadence: "once" })).due).toBe(true);
      expect(call(base({ cadence: "once", lastPushedAt: "2026-01-01" })).due).toBe(false);
    });
  });

  describe("weekly", () => {
    it("waits seven days between sends", () => {
      expect(call(base({ lastPushedAt: "2026-09-16" })).due).toBe(true);  // 7 天
      expect(call(base({ lastPushedAt: "2026-09-18" })).due).toBe(false); // 5 天
    });
  });

  describe("before_deadline", () => {
    const d = (expiresOn: string, lastPushedAt: string | null = null) =>
      call(base({ cadence: "before_deadline", lastPushedAt }), { expiresOn });

    it("only fires on the reminder days", () => {
      expect(d("2026-10-23").due).toBe(true);  // 30 天
      expect(d("2026-09-30").due).toBe(true);  // 7 天
      expect(d("2026-09-24").due).toBe(true);  // 1 天
      expect(d("2026-10-01").due).toBe(false); // 8 天，不是提醒日
    });

    it("does not send twice on the same day", () => {
      expect(d("2026-09-30", "2026-09-23T02:00:00.000Z").due).toBe(false);
    });

    // 沒有截止日就沒有意義，不能退化成每天送。
    it("does nothing without a deadline", () => {
      const r = call(base({ cadence: "before_deadline" }), { expiresOn: null });
      expect(r.due).toBe(false);
      expect(r.reason).toContain("no deadline");
    });
  });
});
