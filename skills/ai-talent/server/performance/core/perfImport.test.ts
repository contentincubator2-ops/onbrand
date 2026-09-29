import { describe, it, expect } from "vitest";
import { parseTable, guessSource, guessMapping, buildFacts, parseDate, parseUtmTags, ROWCOUNT } from "./perfImport";

const META = `\uFEFF"Reporting starts","Ad name","Amount spent (TWD)","Cost per result","Impressions","Link clicks","Purchases","Purchases conversion value"
2026-09-01,"FAM_nomess_v1 ta.family~usp.nomess","1,200",300,"50,000",800,4,"5,520"
2026-09-01,"OFFICE_fast",800,,30000,500,2,"2,100"
2026-09-01,"FAM_nomess_v1 ta.family~usp.nomess",300,,10000,100,1,1380
,Total,2300,,90000,1400,7,9000
`;

describe("perfImport", () => {
  it("parses a Meta export, maps headers, skips totals, merges same-day rows", () => {
    const t = parseTable(META);
    expect(guessSource(t.headers)).toBe("meta_ads");
    const m = guessMapping(t.headers, "meta_ads");
    expect(m["Amount spent (TWD)"]).toBe("spend");
    expect(m["Cost per result"]).toBe("");
    expect(m["Purchases conversion value"]).toBe("revenue");
    expect(m["Purchases"]).toBe("orders");
    const r = buildFacts(t, m, "meta_ads", "2026-09-30");
    expect(r.facts).toHaveLength(2);
    const fam = r.facts.find((f) => f.entityLabel!.startsWith("FAM"))!;
    expect(fam.metrics).toMatchObject({ spend: 1500, impressions: 60000, orders: 5, revenue: 6900 });
    expect(fam.tags).toEqual({ ta: "family", usp: "nomess" });
    expect(r.skipped).toBe(1);
  });

  it("counts rows as orders for order exports and reads tag columns", () => {
    const t = parseTable("訂單號碼\t訂單日期\t訂單合計\t族群\n#1\t2026/09/02 10:00\tNT$1,200\t雙薪家庭\n#2\t2026/09/02\t800\t雙薪家庭\n");
    expect(guessSource(t.headers)).toBe("shopline");
    const m = { ...guessMapping(t.headers, "shopline"), "族群": "tag:ta" };
    expect(m[ROWCOUNT]).toBe("orders");
    const r = buildFacts(t, m, "shopline", "2026-09-30");
    expect(r.facts).toHaveLength(1);
    expect(r.facts[0].metrics).toEqual({ revenue: 2000, orders: 2 });
    expect(r.facts[0].tags).toEqual({ ta: "雙薪家庭" });
  });

  it("parses date variants", () => {
    expect(parseDate("20260901")).toBe("2026-09-01");
    expect(parseDate("2026年9月3日")).toBe("2026-09-03");
    expect(parseDate("46266")).toBe("2026-09-01");
    expect(parseDate("9/5/2026")).toBe("2026-09-05");
    expect(parseDate("")).toBeNull();
  });

  it("extracts utm tags anywhere in a string", () => {
    expect(parseUtmTags("utm_content=ta.office~usp.fast-2")).toEqual({ ta: "office", usp: "fast-2" });
    expect(parseUtmTags("plain name")).toEqual({});
  });
});

import { utmContent, withUtm } from "./perfUtm";
import { parseUtmTags as parseBack } from "./perfImport";
describe("perfUtm", () => {
  it("round-trips through parseUtmTags", () => {
    const tags = { usp: "nomess", ta: "family" };
    expect(utmContent(tags)).toBe("ta.family~usp.nomess");
    const url = withUtm("https://shop.example.com/p/1?x=1", { source: "facebook", campaign: "fall", tags });
    const content = new URL(url).searchParams.get("utm_content")!;
    expect(parseBack(content)).toEqual(tags);
    expect(new URL(url).searchParams.get("x")).toBe("1");
  });
});
