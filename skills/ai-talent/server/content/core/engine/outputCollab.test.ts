import { describe, it, expect, vi } from "vitest";

vi.mock("../../../localDb.js", () => ({ default: { execute: vi.fn(async () => [[]]) } }));

import localPool from "../../../localDb.js";
import { addEditLog, displayNameOf, isRealChange, listComments, listEditLog, setCommentResolved } from "./outputCollab";

const exec = (localPool as any).execute as ReturnType<typeof vi.fn>;

describe("isRealChange", () => {
  it("只差頭尾空白不算一次修改", () => {
    expect(isRealChange("今天開賣", "今天開賣  ")).toBe(false);
    expect(isRealChange("今天開賣", "明天開賣")).toBe(true);
  });
});

describe("displayNameOf", () => {
  it("有名字用名字，沒有就用信箱 @ 前面那段", () => {
    expect(displayNameOf({ name: " Laila ", email: "laila@sowork.tw" })).toBe("Laila");
    expect(displayNameOf({ name: null, email: "celine@sowork.tw" })).toBe("celine");
    expect(displayNameOf(null)).toBeNull();
  });
});

describe("addEditLog", () => {
  it("文字沒變就不留紀錄", async () => {
    exec.mockClear();
    await addEditLog({ outputId: 1, variantKey: "legacy:0", actorId: 9, kind: "chat", before: "同一句", after: "同一句 " });
    expect(exec).not.toHaveBeenCalled();
  });
  it("有變就寫一列，帶改之前與改之後的全文", async () => {
    exec.mockClear();
    exec.mockResolvedValueOnce([[{ name: "CJ", email: "cj@sowork.tw" }]]).mockResolvedValueOnce([{ insertId: 5 }]);
    await addEditLog({ outputId: 1, variantKey: "legacy:0", actorId: 9, kind: "restyle", ask: "反差開場", before: "舊稿", after: "新稿" });
    const insert = exec.mock.calls[1]!;
    expect(String(insert[0])).toContain("INSERT INTO caption_edit_log");
    expect(insert[1]).toEqual([1, "legacy:0", 9, "CJ", "restyle", "反差開場", null, "舊稿", "新稿"]);
  });
  it("寫入失敗不往外丟（存檔不能因為紀錄壞掉而失敗）", async () => {
    exec.mockClear();
    exec.mockResolvedValueOnce([[]]).mockRejectedValueOnce(new Error("table missing"));
    await expect(addEditLog({ outputId: 1, variantKey: "legacy:0", actorId: 9, kind: "chat", before: "a", after: "b" })).resolves.toBeUndefined();
  });
});

describe("listEditLog／listComments", () => {
  it("紀錄：不認得的 kind 當成請他改；讀取失敗回空陣列", async () => {
    exec.mockResolvedValueOnce([[{ id: 3, actorName: null, kind: "weird", ask: "短一點", explanation: null, captionBefore: "舊", createdAt: new Date("2026-10-09T02:00:00Z") }]]);
    const rows = await listEditLog(1, "legacy:0");
    expect(rows[0]).toMatchObject({ id: 3, kind: "chat", ask: "短一點", captionBefore: "舊", createdAt: "2026-10-09T02:00:00.000Z" });
    exec.mockRejectedValueOnce(new Error("down"));
    expect(await listEditLog(1, "legacy:0")).toEqual([]);
  });
  it("留言：舊的在前，resolvedAt 有值就是已處理", async () => {
    exec.mockResolvedValueOnce([[
      { id: 8, authorId: 2, authorName: "Laila", body: "第二段太長", resolvedAt: null, createdAt: "2026-10-09 10:05:00" },
      { id: 7, authorId: 3, authorName: "Celine", body: "標題 OK", resolvedAt: new Date(), createdAt: "2026-10-09 10:00:00" },
    ]]);
    const rows = await listComments(1, "legacy:0");
    expect(rows.map((r) => [r.id, r.resolved])).toEqual([[7, true], [8, false]]);
  });
});

describe("setCommentResolved", () => {
  it("重新開啟時把處理人一起清掉", async () => {
    exec.mockClear();
    exec.mockResolvedValue([{}]);
    await setCommentResolved(8, false, 2);
    expect(String(exec.mock.calls[0]![0])).toContain("resolvedBy = NULL");
    expect(exec.mock.calls[0]![1]).toEqual([8]);
  });
});
