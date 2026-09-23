import { describe, expect, it } from "vitest";
import { brokenMappings, coverRegulations, overdueCount } from "./regulationCoverage";

const PACKS = {
  TW: ["disclosure", "price", "claims", "evidence", "competitors", "link"],
  US: ["disclosure", "price", "claims", "evidence", "competitors", "link"],
};

const reg = (p: Partial<Parameters<typeof coverRegulations>[0][number]> = {}) => ({
  id: 1, market: "TW", rules: [], status: "applied", effectiveOn: null, ...p,
}) as any;

describe("coverRegulations", () => {
  it("splits the named checks into ones the pack has and ones it does not", () => {
    const c = coverRegulations([reg({ rules: ["price", "nonsense"] })], PACKS, "2026-09-23")[1];
    expect(c.known).toEqual(["price"]);
    expect(c.unknown).toEqual(["nonsense"]);
  });

  it("counts days since a rule took effect while it is still not applied", () => {
    const c = coverRegulations(
      [reg({ status: "review", effectiveOn: "2026-09-01" })],
      PACKS,
      "2026-09-23",
    )[1];
    expect(c.overdueDays).toBe(22);
    expect(c.daysUntil).toBeNull();
  });

  it("says nothing is overdue once the rule is applied", () => {
    const c = coverRegulations(
      [reg({ status: "applied", effectiveOn: "2026-09-01" })],
      PACKS,
      "2026-09-23",
    )[1];
    expect(c.overdueDays).toBeNull();
  });

  it("counts down to a rule that has not taken effect yet", () => {
    const c = coverRegulations(
      [reg({ status: "review", effectiveOn: "2026-10-01" })],
      PACKS,
      "2026-09-23",
    )[1];
    expect(c.daysUntil).toBe(8);
    expect(c.overdueDays).toBeNull();
  });

  it("treats the effective day itself as in effect, not upcoming", () => {
    const c = coverRegulations(
      [reg({ status: "monitoring", effectiveOn: "2026-09-23" })],
      PACKS,
      "2026-09-23",
    )[1];
    expect(c.overdueDays).toBe(0);
    expect(c.daysUntil).toBeNull();
  });

  it("leaves both dates alone when no effective date is published", () => {
    const c = coverRegulations([reg({ status: "monitoring", effectiveOn: null })], PACKS, "2026-09-23")[1];
    expect(c.overdueDays).toBeNull();
    expect(c.daysUntil).toBeNull();
  });

  it("does not look a rule up in the other market's pack", () => {
    const c = coverRegulations(
      [reg({ market: "JP", rules: ["price"] })],
      PACKS,
      "2026-09-23",
    )[1];
    expect(c.unknown).toEqual(["price"]);
  });

  it("rolls up what the page has to say in one line", () => {
    const cov = coverRegulations(
      [
        reg({ id: 1, status: "review", effectiveOn: "2026-09-01" }),
        reg({ id: 2, status: "applied", rules: ["gone"] }),
        reg({ id: 3, status: "applied", rules: ["price"] }),
      ],
      PACKS,
      "2026-09-23",
    );
    expect(overdueCount(cov)).toBe(1);
    expect(brokenMappings(cov).map((c) => c.id)).toEqual([2]);
  });
});
