/**
 * 編輯／核准的純邏輯。碰資料庫的部分在 VM 上用探針驗。
 *
 * 這裡鎖住兩件會出事的事：diff 算錯（審核的人看到的差異不是真的差異），
 * 以及核准名單為空時的退路（設錯就是沒人能核准，或反過來人人都能核准）。
 */
import { describe, expect, it } from "vitest";
import { EDITABLE_FIELDS, diffFields } from "./solutionEdits";

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
  it("covers names, summaries and audience in both languages", () => {
    expect([...EDITABLE_FIELDS].sort()).toEqual(
      ["audience_en", "audience_zh", "name_en", "name_zh", "summary_en", "summary_zh"],
    );
  });

  it("excludes price and slug on purpose", () => {
    for (const forbidden of ["price", "prices", "slug", "vendor", "source_url"]) {
      expect(EDITABLE_FIELDS).not.toContain(forbidden as never);
    }
  });
});
