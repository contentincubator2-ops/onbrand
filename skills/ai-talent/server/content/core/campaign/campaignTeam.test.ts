/** 英文介面的職稱：夾中文的那一段切掉。 */
import { describe, it, expect } from "vitest";
import { englishTitle } from "./campaignTeam";

describe("englishTitle", () => {
  it("純英文照用；夾中文產業的切掉後半；整個是中文就空字串", () => {
    expect(englishTitle("PR Director")).toBe("PR Director");
    expect(englishTitle("Social Media Strategist – 電商 / DTC")).toBe("Social Media Strategist");
    expect(englishTitle("品牌策略師｜MarTech")).toBe("");
    expect(englishTitle(null)).toBe("");
  });
});
