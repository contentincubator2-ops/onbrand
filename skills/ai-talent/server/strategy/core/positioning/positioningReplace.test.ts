/**
 * 上傳定位後「完全取代」產品定位：舊內容要清掉、圖片／手動詞彙／系統資料要留下，
 * 被清掉的內容放進 _replacedBackup。
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../localDb", () => ({ default: { execute: async () => [[]] } }));

import { replacedBase } from "./positioningDocs";

describe("replacedBase", () => {
  const cur = {
    tagline: "舊標語", usp: "舊賣點", targetAudience: "舊受眾",
    core: { zhTagline: "舊核心標語" }, audience: { pains: ["舊痛點"] },
    imageUrl: "/static/asset-photos/product/1/a.jpg",
    preferredWords: ["a"], forbiddenWords: ["b"],
    _sourceDocs: [{ id: "d1" }], _customSegments: [{ id: "s1" }], _interim: { tagline: "x" }, _sourceDoc: { docId: "old" },
  };

  it("清掉舊定位內容、保留圖片／詞彙／系統資料", () => {
    const base = replacedBase(cur);
    expect(base.tagline).toBeUndefined();
    expect(base.core).toBeUndefined();
    expect(base.audience).toBeUndefined();
    expect(base.imageUrl).toBe(cur.imageUrl);
    expect(base.preferredWords).toEqual(["a"]);
    expect(base.forbiddenWords).toEqual(["b"]);
    expect(base._sourceDocs).toEqual(cur._sourceDocs);
    expect(base._customSegments).toEqual(cur._customSegments);
    expect(base._interim).toBeUndefined();
    expect(base._sourceDoc).toBeUndefined();
  });

  it("被清掉的內容備份在 _replacedBackup", () => {
    const base = replacedBase(cur);
    expect(base._replacedBackup.positioning.tagline).toBe("舊標語");
    expect(base._replacedBackup.positioning.core).toEqual({ zhTagline: "舊核心標語" });
    expect(base._replacedBackup.positioning.imageUrl).toBeUndefined();
  });

  it("本來就空的定位不產生備份", () => {
    expect(replacedBase({ _sourceDocs: [] })._replacedBackup).toBeUndefined();
  });
});
