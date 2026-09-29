/**
 * 2026-09-29（CJ「檢查大腦……是否超載，還是用戶可以新增更多的記憶」）。
 * 這裡的錯法最傷的是「明明有東西沒被讀到，畫面卻說還有空間」——所以超載一定
 * 優先於用量判斷。
 */
import { describe, expect, it } from "vitest";
import { brainState, categorySummaries, groupsOf, type BrainData, type BrainItem } from "./brainModel";

const cats = [
  { key: "identity", zh: "品牌核心", en: "Brand core" },
  { key: "rules", zh: "文字規則", en: "Copy rules" },
  { key: "custom", zh: "自訂卡片", en: "Custom cards" },
];
const item = (category: string, keptChars: number, status: BrainItem["status"] = "remembered"): BrainItem =>
  ({ category, group: "", label: `${category}-${keptChars}`, storedChars: keptChars, keptChars, status, preview: "" });
const data = (items: BrainItem[], capacity = 1000): BrainData =>
  ({ capacity, usedChars: items.reduce((n, i) => n + i.keptChars, 0), items, categories: cats });

describe("brainState", () => {
  it("用量低、沒有超載 → 還可以記更多，並算出剩餘容量", () => {
    const s = brainState(data([item("identity", 300)]));
    expect(s.level).toBe("ok");
    expect(s.free).toBe(700);
  });

  it("用量超過 85% → 快滿了", () => {
    expect(brainState(data([item("identity", 900)])).level).toBe("near");
  });

  it("只要有一筆超載，就算用量不高也是超載", () => {
    const s = brainState(data([item("identity", 100), item("custom", 0, "overflow")]));
    expect(s.level).toBe("over");
    expect(s.overflowCount).toBe(1);
  });
});

describe("categorySummaries", () => {
  it("照 server 的類別順序分組、空類別不列、各自算超載與只記一部分", () => {
    const out = categorySummaries(data([
      item("custom", 0, "overflow"),
      item("identity", 120),
      item("custom", 200, "trimmed"),
    ]));
    expect(out.map((s) => s.key)).toEqual(["identity", "custom"]);
    const custom = out.find((s) => s.key === "custom")!;
    expect(custom.overflow).toBe(1);
    expect(custom.trimmed).toBe(1);
    expect(custom.keptChars).toBe(200);
  });
});

describe("groupsOf", () => {
  it("依頁面段落分組、保持原順序；沒有段落的歸在同一組", () => {
    const it = (group: string, label: string): BrainItem => ({ category: "brand", group, label, storedChars: 1, keptChars: 1, status: "remembered", preview: "" });
    const out = groupsOf([it("品牌黃金圈", "WHY"), it("品牌核心標語", "中文標語"), it("品牌黃金圈", "HOW")]);
    expect(out.map((g) => g.group)).toEqual(["品牌黃金圈", "品牌核心標語"]);
    expect(out[0]!.items.map((i) => i.label)).toEqual(["WHY", "HOW"]);
    expect(groupsOf([it("", "推薦用詞"), it("", "禁用詞")])).toHaveLength(1);
  });
});
