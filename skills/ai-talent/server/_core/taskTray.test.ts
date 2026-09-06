/**
 * taskTray.test — 托盤最容易壞的地方是「降級之後爆款卡從托盤漏出去」。
 *
 * 目錄那一層擋住了（filterTasksByPlan），但托盤是存下來的 id 清單，
 * 如果直接照存的畫，基礎方案的用戶就會在托盤上看到他不該有的卡。
 * 所以 resolveTray 一定要跟 available 取交集，這裡驗的就是那件事。
 */
import { describe, it, expect } from "vitest";
import { defaultTray, storedTray, resolveTray, SOURCE_RANK } from "./taskTray";
import { buildTaskCatalogIndex } from "./taskCatalogIndex";

const T = (id: string, postType: string, type: string, tier = "30s") => ({
  id, platform: "facebook", postType, tier, source: { type },
});

describe("預設托盤", () => {
  it("每個分類只挑一張", () => {
    const ids = defaultTray(
      [T("a", "feed", "evergreen"), T("b", "feed", "award"), T("c", "ad", "benchmark")],
      "facebook",
    );
    expect(ids).toHaveLength(2);
  });

  it("挑來源最強的，不是長青 —— 長青是我們明講沒出處的那類", () => {
    const ids = defaultTray(
      [T("ever", "feed", "evergreen"), T("award", "feed", "award"), T("viral", "feed", "viral")],
      "facebook",
    );
    expect(ids).toEqual(["award"]);
  });

  it("來源同分時取 tier 小的 —— 門面要點下去馬上有東西", () => {
    const ids = defaultTray(
      [T("big", "feed", "award", "99s"), T("small", "feed", "award", "30s")],
      "facebook",
    );
    expect(ids).toEqual(["small"]);
  });

  it("別的通路的卡不會混進來", () => {
    const ids = defaultTray(
      [T("fb", "feed", "award"), { ...T("ig", "feed", "award"), platform: "instagram" }],
      "facebook",
    );
    expect(ids).toEqual(["fb"]);
  });

  it("來源強度：長青一定是最低的", () => {
    for (const k of Object.keys(SOURCE_RANK)) {
      if (k === "evergreen") continue;
      expect(SOURCE_RANK[k]!).toBeGreaterThan(SOURCE_RANK.evergreen!);
    }
  });
});

describe("讀存下來的托盤", () => {
  it("讀得到", () => {
    expect(storedTray({ __tray: { facebook: ["x", "y"] } }, "facebook")).toEqual(["x", "y"]);
  });
  it("格式壞掉一律當沒設定", () => {
    expect(storedTray(null, "facebook")).toBeNull();
    expect(storedTray({ __tray: "nope" }, "facebook")).toBeNull();
    expect(storedTray({ __tray: { facebook: [] } }, "facebook")).toBeNull();
    expect(storedTray({ __tray: { instagram: ["a"] } }, "facebook")).toBeNull();
  });
});

describe("resolveTray", () => {
  const avail = [T("a", "feed", "award"), T("b", "ad", "benchmark")];

  it("沒挑過就給預設，並標示是預設", () => {
    const r = resolveTray(null, avail, "facebook");
    expect(r.isDefault).toBe(true);
    expect(r.taskIds.sort()).toEqual(["a", "b"]);
  });

  it("挑過就用挑的", () => {
    const r = resolveTray({ __tray: { facebook: ["b"] } }, avail, "facebook");
    expect(r.isDefault).toBe(false);
    expect(r.taskIds).toEqual(["b"]);
  });

  it("降級後，托盤裡看不到的卡要被丟掉 —— 不能從托盤漏出去", () => {
    const r = resolveTray({ __tray: { facebook: ["a", "viralOnly"] } }, avail, "facebook");
    expect(r.taskIds).toEqual(["a"]);
    expect(r.dropped).toEqual(["viralOnly"]);
  });

  it("整批被擋掉就回預設，不要給空畫面", () => {
    const r = resolveTray({ __tray: { facebook: ["gone1", "gone2"] } }, avail, "facebook");
    expect(r.isDefault).toBe(true);
    expect(r.taskIds.length).toBeGreaterThan(0);
    expect(r.dropped).toEqual(["gone1", "gone2"]);
  });
});

describe("套在真實目錄上", () => {
  const cat = buildTaskCatalogIndex() as any[];

  it("FB 的預設托盤等於它的分類數，而不是 47 張", () => {
    const fb = cat.filter((c) => c.platform === "facebook");
    const types = new Set(fb.map((c) => c.postType));
    const tray = defaultTray(fb, "facebook");
    expect(tray).toHaveLength(types.size);
    expect(tray.length).toBeLessThan(fb.length / 3);
  });

  it("每個通路都給得出非空的預設托盤", () => {
    for (const p of [...new Set(cat.map((c) => c.platform))]) {
      expect(defaultTray(cat, p as string).length, `${p} 的預設托盤是空的`).toBeGreaterThan(0);
    }
  });
});
