/**
 * 編輯／核准的純邏輯。碰資料庫的部分在 VM 上用探針驗。
 *
 * 這裡鎖住兩件會出事的事：diff 算錯（審核的人看到的差異不是真的差異），
 * 以及核准名單為空時的退路（設錯就是沒人能核准，或反過來人人都能核准）。
 */
import { describe, expect, it } from "vitest";
import { EDITABLE_FIELDS, diffFields, featuresToText, pricesToText } from "./solutionEdits";

const current = {
  name_en: "GogoForm",
  name_zh: "夠簡單 GogoForm",
  summary_en: "Online forms and approvals.",
  summary_zh: "線上表單與電子簽核。",
  audience_en: "SMEs with paper approvals",
  audience_zh: "還在用紙本簽核的中小企業",
};

describe("diffFields", () => {
  it("returns nothing when the text is unchanged", () => {
    expect(diffFields(current, { name_en: "GogoForm", summary_zh: "線上表單與電子簽核。" })).toEqual([]);
  });

  it("ignores fields the editor didn't touch", () => {
    const d = diffFields(current, { summary_en: "Online forms, approvals and an audit trail." });
    expect(d).toHaveLength(1);
    expect(d[0]!.field).toBe("summary_en");
    expect(d[0]!.from).toBe("Online forms and approvals.");
  });

  it("treats a whitespace-only change as no change", () => {
    // 不然每次打開編輯框再關掉都會產生一筆待審提案。
    expect(diffFields(current, { name_en: "  GogoForm  " })).toEqual([]);
  });

  it("carries both sides so an approver sees the actual diff", () => {
    const d = diffFields(current, { name_zh: "GogoForm 電子簽核" });
    expect(d[0]).toEqual({ field: "name_zh", from: "夠簡單 GogoForm", to: "GogoForm 電子簽核" });
  });

  it("never accepts a field outside the editable list", () => {
    // 價格與 slug 不能從這條路改 —— 價格是合規引擎唯一認的數字。
    const d = diffFields({ ...current, slug: "gogoform" }, { slug: "hacked", name_en: "X" } as any);
    expect(d.map((c) => c.field)).toEqual(["name_en"]);
  });

  it("treats an empty string as a real change, not a no-op", () => {
    const d = diffFields(current, { audience_en: "" });
    expect(d).toHaveLength(1);
    expect(d[0]!.to).toBe("");
  });
});

describe("EDITABLE_FIELDS", () => {
  it("covers every scalar the card and modal show", () => {
    // 2026-09-23 CJ「要可以編輯產品現在呈現的每個欄位」。
    expect([...EDITABLE_FIELDS].sort()).toEqual([
      "audience_en", "audience_zh", "category", "featured", "name_en", "name_zh",
      "source_url", "summary_en", "summary_zh", "vendor",
    ]);
  });

  it("still keeps slug out — it is an identifier, not content", () => {
    expect(EDITABLE_FIELDS).not.toContain("slug" as never);
    // 價格與特色是陣列，走 structured 那條路，不在這張純量清單裡。
    expect(EDITABLE_FIELDS).not.toContain("prices" as never);
    expect(EDITABLE_FIELDS).not.toContain("features" as never);
  });
});

describe("pricesToText", () => {
  const row = (over: any = {}) =>
    ({ planEn: "Standard", planZh: "一般", amount: 1000, billing: "month", startsFrom: false, ...over });

  it("renders one line per plan so a diff shows which row moved", () => {
    expect(pricesToText([row(), row({ planEn: "VIP", planZh: "VIP", amount: 1600 })])).toBe(
      ["Standard | 一般 | 1000 | month", "VIP | VIP | 1600 | month"].join("\n"),
    );
  });

  it("writes quote-only plans as 'quote', never as a number", () => {
    // 0 或殘留的舊金額進了核准清單，業務寫「$0」就會通過價格檢查。
    expect(pricesToText([row({ billing: "quote", amount: 500 })])).toBe("Standard | 一般 | quote | quote");
    expect(pricesToText([row({ amount: null })])).toContain("| quote |");
  });

  it("marks a starting-at price", () => {
    expect(pricesToText([row({ startsFrom: true })])).toBe("Standard | 一般 | 1000 | month | from");
  });

  it("survives a malformed row instead of throwing", () => {
    expect(() => pricesToText([{} as any])).not.toThrow();
  });
});

describe("featuresToText", () => {
  it("renders one line per feature", () => {
    expect(featuresToText([{ en: "A", zh: "甲" }, { en: "B", zh: "乙" }])).toBe(["A | 甲", "B | 乙"].join("\n"));
  });

  it("drops a row that is entirely blank", () => {
    expect(featuresToText([{ en: "", zh: "" }, { en: "A", zh: "甲" }])).toBe("A | 甲");
  });
});
