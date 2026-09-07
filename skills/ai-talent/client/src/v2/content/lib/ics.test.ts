import { describe, it, expect } from "vitest";
import { buildAllDayIcs, foldLine } from "./ics";

const NOW = new Date("2026-08-19T03:04:05.678Z");

describe("buildAllDayIcs", () => {
  const ics = buildAllDayIcs(
    [{
      uid: "3837-series-0@onbrand.sowork.ai",
      date: new Date(2026, 7, 14),
      summary: "小安素 · 預告",
      description: "第一行\n第二行; 有逗號, 和反斜線\\",
    }],
    { now: NOW },
  );

  it("emits DTSTAMP in every VEVENT — Outlook rejects the file without it", () => {
    expect(ics).toContain("DTSTAMP:20260819T030405Z");
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(ics.match(/DTSTAMP:/g)?.length);
  });

  it("declares METHOD:PUBLISH so double-click imports instead of subscribing", () => {
    expect(ics).toContain("METHOD:PUBLISH");
  });

  it("writes the local calendar day, with DTEND one day after DTSTART", () => {
    expect(ics).toContain("DTSTART;VALUE=DATE:20260814");
    expect(ics).toContain("DTEND;VALUE=DATE:20260815");
  });

  it("escapes TEXT values per RFC 5545 §3.3.11", () => {
    expect(ics).toContain("DESCRIPTION:第一行\\n第二行\\; 有逗號\\, 和反斜線\\\\");
  });

  it("uses CRLF line endings and closes the calendar", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.includes("\n\n")).toBe(false);
  });

  it("keeps every content line within the 75-octet limit", () => {
    const long = buildAllDayIcs(
      [{
        uid: "u@onbrand.sowork.ai",
        date: new Date(2026, 7, 14),
        summary: "標題",
        description: "孩子今年暑假，是不是越來越難把正餐吃完？".repeat(8),
      }],
      { now: NOW },
    );
    const encoder = new TextEncoder();
    for (const line of long.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("emits a valid, empty calendar when there is nothing to export", () => {
    expect(buildAllDayIcs([], { now: NOW })).not.toContain("BEGIN:VEVENT");
  });
});

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:hi")).toBe("SUMMARY:hi");
  });

  it("never splits a multi-byte character across the fold", () => {
    const folded = foldLine("DESCRIPTION:" + "字".repeat(60));
    for (const part of folded.split("\r\n")) {
      expect(part).not.toContain("�");
    }
    expect(folded.split("\r\n").slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe("DESCRIPTION:" + "字".repeat(60));
  });
});
