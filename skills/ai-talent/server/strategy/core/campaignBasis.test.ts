/**
 * 策略依據的改法：只收允許的格子、跟現在一樣的不算、清單整理、清空只給使用者。
 */
import { describe, it, expect } from "vitest";
import { validateBasis, applyBasis, basisLines, basisSnapshot, BASIS_FIELDS } from "./campaignBasis";

const pos = {
  audience: { primaryAudience: "台灣中小品牌主", keyInsight: "怕品牌走調" },
  guidelines: { forbiddenElements: ["誇大"] },
  awards: { selectedAwards: [{ name: "x" }] },
  campaignPlan: { smp: "不能被動到" },
};

describe("validateBasis", () => {
  it("只收列出的格子；表格、計畫、亂寫的路徑都不收", () => {
    const p = validateBasis({
      "audience.keyInsight": "品牌走調比想的更常發生",
      "awards.selectedAwards": [],
      "campaignPlan.smp": "x",
      "audience": "x",
    }, pos);
    expect(p).toEqual({ "audience.keyInsight": "品牌走調比想的更常發生" });
  });
  it("跟現在一樣的不算改；清單從字串或陣列都整理成陣列", () => {
    expect(validateBasis({ "audience.primaryAudience": " 台灣中小品牌主 " }, pos)).toEqual({});
    expect(validateBasis({ "guidelines.forbiddenElements": "誇大\n免費" }, pos)).toEqual({ "guidelines.forbiddenElements": ["誇大", "免費"] });
  });
  it("清空：模型的改法不收；使用者編輯（allowClear）才收", () => {
    expect(validateBasis({ "audience.keyInsight": "" }, pos)).toEqual({});
    expect(validateBasis({ "audience.keyInsight": "" }, pos, { allowClear: true })).toEqual({ "audience.keyInsight": null });
  });
});

describe("applyBasis", () => {
  it("只動那幾格，同段其他欄位與別段原封不動；null 清掉", () => {
    const next = applyBasis(pos, { "audience.keyInsight": "新的", "smp.singleMindedProposition": "一句話" });
    expect(next.audience).toEqual({ primaryAudience: "台灣中小品牌主", keyInsight: "新的" });
    expect(next.smp).toEqual({ singleMindedProposition: "一句話" });
    expect(next.awards).toBe(pos.awards);
    expect(next.campaignPlan).toBe(pos.campaignPlan);
    expect(pos.audience.keyInsight).toBe("怕品牌走調");
    expect(applyBasis(pos, { "audience.keyInsight": null }).audience).toEqual({ primaryAudience: "台灣中小品牌主" });
  });
});

describe("給總監看的與給畫面的", () => {
  it("每一格都列，空的標（空）；畫面快照涵蓋全部欄位", () => {
    const lines = basisLines(pos);
    expect(lines).toContain("- audience.keyInsight｜關鍵洞察｜怕品牌走調");
    expect(lines).toContain("- smp.singleMindedProposition｜SMP（單一核心命題）｜（空）");
    expect(Object.keys(basisSnapshot(pos))).toEqual(Object.keys(BASIS_FIELDS));
  });
});
