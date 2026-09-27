import { describe, expect, it } from "vitest";
import { diffOf, sanitizePatch, writableAnchor } from "./meetingWriteback";

describe("writableAnchor", () => {
  it("只有策略表達類可以寫；競爭格局（研究證據）不行", () => {
    for (const id of ["audience", "differentiation", "tagline", "voice"]) expect(writableAnchor("brand", id)).not.toBeNull();
    expect(writableAnchor("brand", "competition")).toBeNull();
    expect(writableAnchor("product", "competition")).toBeNull();
    for (const id of ["core", "audience", "value", "strategy"]) expect(writableAnchor("product", id)).not.toBeNull();
  });
  it("品牌受眾寫的是產文實際讀的 audience.primary（buildBrandPrefix 讀這一欄）", () => {
    expect(writableAnchor("brand", "audience")!.fields.map((f) => f.key)).toEqual(["primary", "secondary"]);
  });
  it("每一格都有寫入後的影響提示", () => {
    for (const id of ["audience", "differentiation", "tagline", "voice"]) expect(writableAnchor("brand", id)!.impact.length).toBeGreaterThan(0);
  });
});

describe("sanitizePatch", () => {
  const spec = writableAnchor("brand", "voice")!;
  const current = { tone: ["輕鬆自嘲", "直白"], forbidden: ["精品語氣"], samples: [{ generic: "x", ours: "y" }] };

  it("丟掉白名單外的欄位、型別不對的值、跟目前一樣的值", () => {
    const p = sanitizePatch({
      tone: ["輕鬆自嘲", "直白"],           // 沒變
      forbidden: ["精品語氣", "溫情儀式感"],  // 有變
      archetypes: "應該是陣列",               // 型別錯
      samples: [{ generic: "a" }],           // 不在白名單
    }, spec, current);
    expect(p).toEqual({ forbidden: ["精品語氣", "溫情儀式感"] });
  });

  it("文字欄位去空白、空字串不算", () => {
    const d = writableAnchor("brand", "differentiation")!;
    expect(sanitizePatch({ summary: "  新的總結  ", discriminator: "   " }, d, { summary: "舊的" })).toEqual({ summary: "新的總結" });
  });

  it("不是物件就回空", () => {
    expect(sanitizePatch(null, spec, current)).toEqual({});
    expect(sanitizePatch("x", spec, current)).toEqual({});
  });
});

describe("diffOf", () => {
  it("列出前後值與欄位名稱", () => {
    const spec = writableAnchor("brand", "differentiation")!;
    expect(diffOf({ summary: "新" }, spec, { summary: "舊" })).toEqual([{ key: "summary", label: "差異化總結", before: "舊", after: "新" }]);
  });
});
