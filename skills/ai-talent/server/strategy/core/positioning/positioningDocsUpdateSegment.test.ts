/**
 * updateCustomSegment 的行為測試。
 *
 * 2026-09-24（CJ「按下新增卡片時，只是要她編輯該卡片的標題和內容」）：自訂卡片
 * 在這之前只能建立與刪除，改一個字要刪掉重建。這裡守的是「編輯就只是編輯」：
 *   - 改到的是指定那一張，別張不能被動到；
 *   - id / createdAt / sourceDocId 要留著——那還是同一張卡，不是新的一張
 *     （這幾個值被換掉的話，「來自你的定位文件」這個來源標記就會憑空消失）；
 *   - 認不得的 id 不能靜靜改錯一張。
 *
 * 獨立一個檔案是因為這裡要攔 UPDATE 語句，跟 positioningDocs.test.ts 那份
 * 唯讀的 localDb mock 形狀不同，硬合在一起兩邊都會變難讀。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let storedPositioning: any = {};
let lastUpdateSql = "";

vi.mock("../../../localDb", () => ({
  default: {
    execute: async (sql: string, params: any[] = []) => {
      if (/^\s*UPDATE/i.test(sql)) {
        lastUpdateSql = sql;
        storedPositioning = JSON.parse(String(params[0]));
        return [{ affectedRows: 1 }];
      }
      // loadPositioning 的 SELECT（欄位別名是 payload，不是 positioning）
      return [[{ payload: JSON.stringify(storedPositioning) }]];
    },
  },
}));

const { updateCustomSegment, customSegmentsOf } = await import("./positioningDocs");

const seed = () => {
  storedPositioning = {
    tagline: { zhTagline: "別動我" },
    _customSegments: [
      { id: "a", title: "品牌願景", fields: [{ key: "v", label: "願景", value: "舊的願景" }], createdAt: "2026-09-01T00:00:00.000Z", sourceDocId: "doc-1" },
      { id: "b", title: "另一張", fields: [{ key: "x", label: "X", value: "不要動我" }], createdAt: "2026-09-02T00:00:00.000Z", sourceDocId: null },
    ],
  };
};

beforeEach(() => { seed(); lastUpdateSql = ""; });

describe("updateCustomSegment", () => {
  it("改標題與內容，但 id / createdAt / sourceDocId 原封不動（還是同一張卡）", async () => {
    const list = await updateCustomSegment({
      scope: "brand", id: 1, userId: 1, segmentId: "a",
      title: "新的標題",
      fields: [{ key: "v", label: "內容", value: "新的內容" }],
    });
    const a = list.find((s) => s.id === "a")!;
    expect(a.title).toBe("新的標題");
    expect(a.fields).toEqual([{ key: "v", label: "內容", value: "新的內容" }]);
    expect(a.createdAt).toBe("2026-09-01T00:00:00.000Z");
    expect(a.sourceDocId).toBe("doc-1");
  });

  it("別張卡片不能被動到", async () => {
    const list = await updateCustomSegment({
      scope: "brand", id: 1, userId: 1, segmentId: "a",
      title: "新的標題", fields: [{ key: "v", label: "內容", value: "新的內容" }],
    });
    const b = list.find((s) => s.id === "b")!;
    expect(b.title).toBe("另一張");
    expect(b.fields[0]!.value).toBe("不要動我");
  });

  it("positioning 的其他欄位不能被這個動作洗掉", async () => {
    await updateCustomSegment({
      scope: "brand", id: 1, userId: 1, segmentId: "a",
      title: "新的標題", fields: [{ key: "v", label: "內容", value: "新的內容" }],
    });
    expect(storedPositioning.tagline?.zhTagline).toBe("別動我");
    expect(/UPDATE `brands` SET positioning/.test(lastUpdateSql)).toBe(true);
  });

  it("認不得的 id：整份清單原樣回來，不會改錯一張", async () => {
    const list = await updateCustomSegment({
      scope: "brand", id: 1, userId: 1, segmentId: "不存在",
      title: "不該出現", fields: [{ key: "v", label: "內容", value: "不該出現" }],
    });
    expect(list.map((s) => s.title)).toEqual(["品牌願景", "另一張"]);
    expect(customSegmentsOf(storedPositioning).map((s) => s.title)).toEqual(["品牌願景", "另一張"]);
  });
});
