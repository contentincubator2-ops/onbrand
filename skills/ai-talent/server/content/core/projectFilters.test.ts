import { describe, expect, it } from "vitest";
import { applyProjectFilters, stageOf, taskIdOf, platformOf, type ProjectIndexRow } from "./projectFilters";

const NOW = new Date("2026-10-02T12:00:00Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000);

function row(p: Partial<ProjectIndexRow> & { id: number }): ProjectIndexRow {
  return {
    missionId: p.id, title: `t${p.id}`, workspace: "facebook", brandId: 1, brandName: "B",
    createdAt: daysAgo(1), taskId: "fb-30-single-post", taskLabel: "FB 短貼文",
    productId: null, productName: null, progress: "done", status: "draft",
    spPublished: 0, spPending: 0, inPlanner: 0, ...p,
  };
}

describe("stageOf", () => {
  const base = { progress: "done", status: "draft", spPublished: 0, spPending: 0, inPlanner: 0, createdAt: new Date(NOW) };
  it("progress=failed 永遠是失敗", () => expect(stageOf({ ...base, progress: "failed", status: "published" }, NOW)).toBe("failed"));
  it("已發布優先於排程與企劃", () => {
    expect(stageOf({ ...base, spPublished: 1, spPending: 1, inPlanner: 1 }, NOW)).toBe("published");
    expect(stageOf({ ...base, status: "published" }, NOW)).toBe("published");
  });
  it("排程優先於企劃", () => expect(stageOf({ ...base, spPending: 1, inPlanner: 1 }, NOW)).toBe("scheduled"));
  it("只排進企劃", () => expect(stageOf({ ...base, inPlanner: 1 }, NOW)).toBe("planned"));
  it("caption_ready 30 分鐘內是生成中，之後當草稿", () => {
    expect(stageOf({ ...base, progress: "caption_ready", createdAt: new Date(NOW - 5 * 60_000) }, NOW)).toBe("generating");
    expect(stageOf({ ...base, progress: "caption_ready", createdAt: new Date(NOW - 60 * 60_000) }, NOW)).toBe("draft");
  });
  it("其他是草稿", () => expect(stageOf(base, NOW)).toBe("draft"));
});

describe("taskIdOf / platformOf", () => {
  it("metadata 優先、'null' 字串不算、舊資料讀 description 標籤", () => {
    expect(taskIdOf("ig-60-carousel", "[task:fb-30-x]")).toBe("ig-60-carousel");
    expect(taskIdOf("null", "[task:fb-30-x] 30s 任務")).toBe("fb-30-x");
    expect(taskIdOf(null, "no tag")).toBeNull();
  });
  it("舊 fb-100 id 併入 fb-99", () => expect(taskIdOf("fb-100-carousel-5", null)).toBe(taskIdOf("fb-99-carousel-5", null)));
  it("七通路以外歸其他", () => {
    expect(platformOf("Threads")).toBe("threads");
    expect(platformOf("generic")).toBe("other");
    expect(platformOf(null)).toBe("other");
  });
});

describe("applyProjectFilters", () => {
  const rows = [
    row({ id: 1, workspace: "facebook", createdAt: daysAgo(1) }),
    row({ id: 2, workspace: "facebook", createdAt: daysAgo(2), spPending: 1 }),
    row({ id: 3, workspace: "instagram", taskId: "ig-60-carousel", taskLabel: "IG 輪播", createdAt: daysAgo(10), productId: 7, productName: "香氛蠟燭" }),
    row({ id: 4, workspace: "threads", taskId: "th-x", taskLabel: "Threads 串文", createdAt: daysAgo(40), progress: "failed" }),
    row({ id: 5, workspace: "facebook", createdAt: daysAgo(50) }),
  ];

  it("不設條件：全部、新到舊", () => {
    const r = applyProjectFilters(rows, {}, NOW);
    expect(r.total).toBe(5);
    expect(r.items.map((x) => x.id)).toEqual([1, 2, 3, 4, 5]);
    expect(r.items[1]!.stage).toBe("scheduled");
  });

  it("舊到新排序", () => expect(applyProjectFilters(rows, { sort: "old" }, NOW).items[0]!.id).toBe(5));

  it("分頁：舊產出不會被上限吃掉", () => {
    const many = Array.from({ length: 130 }, (_, i) => row({ id: i + 1, createdAt: daysAgo(i) }));
    const p = applyProjectFilters(many, { offset: 120, limit: 24 }, NOW);
    expect(p.total).toBe(130);
    expect(p.items.map((x) => x.id)).toEqual([121, 122, 123, 124, 125, 126, 127, 128, 129, 130]);
  });

  it("分面計數＝套用其他條件後的結果，點下去張數一致", () => {
    const r = applyProjectFilters(rows, { platform: "facebook" }, NOW);
    expect(r.total).toBe(3);
    // 平台面不受自己的條件影響
    expect(r.facets.platform).toEqual([
      { key: "facebook", count: 3 }, { key: "instagram", count: 1 }, { key: "threads", count: 1 },
    ]);
    // 進度面只算 facebook
    expect(r.facets.stage).toEqual([{ key: "draft", count: 2 }, { key: "scheduled", count: 1 }]);
    for (const s of r.facets.stage) {
      expect(applyProjectFilters(rows, { platform: "facebook", stage: s.key }, NOW).total).toBe(s.count);
    }
  });

  it("任務卡面依使用次數排序（常用在前）並帶名稱", () => {
    const r = applyProjectFilters(rows, {}, NOW);
    expect(r.facets.task[0]).toEqual({ key: "fb-30-single-post", label: "FB 短貼文", count: 3 });
    expect(applyProjectFilters(rows, { taskId: "ig-60-carousel" }, NOW).items.map((x) => x.id)).toEqual([3]);
  });

  it("產品、時間、搜尋", () => {
    expect(applyProjectFilters(rows, {}, NOW).facets.product).toEqual([{ id: 7, name: "香氛蠟燭", count: 1 }]);
    expect(applyProjectFilters(rows, { productId: 7 }, NOW).total).toBe(1);
    expect(applyProjectFilters(rows, { period: "7d" }, NOW).total).toBe(2);
    expect(applyProjectFilters(rows, { period: "older" }, NOW).total).toBe(2);
    expect(applyProjectFilters(rows, { q: "輪播" }, NOW).items.map((x) => x.id)).toEqual([3]);
    expect(applyProjectFilters(rows, { q: "蠟燭" }, NOW).total).toBe(1);
  });
});
