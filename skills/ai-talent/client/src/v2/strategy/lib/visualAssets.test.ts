/**
 * 2026-09-26（CJ「一開始也只要呈現出五個任務卡，其他的任務卡，請參考文字和產品的
 * 體驗設計，讓用戶可以自己新增和客製化」）。
 *
 * 跟文字頁同一個最可怕的錯法：**藏掉有資料的卡**。既有品牌填過視覺準則，改版後
 * 看不到那張卡，會以為資料被清掉了——畫面上完全正常，只是少一張。
 */
import { describe, expect, it } from "vitest";
import {
  VISUAL_ASSETS, DEFAULT_VISUAL_KEYS, visualSpecOf, visualHasContent, visibleVisualKeys,
} from "./visualAssets";

describe("預設五張", () => {
  it("就是 CJ 指定的那五張，而且順序固定", () => {
    expect(visibleVisualKeys([], {}, 0)).toEqual([
      "colors_dna", "logo", "imagery_style", "icon_style", "photos",
    ]);
  });

  it("每一張都真的在清單裡", () => {
    for (const k of DEFAULT_VISUAL_KEYS) expect(visualSpecOf(k), k).toBeTruthy();
  });

  it("**沒有字型**——AI 控制不了後續產出，依 CJ 的判準就不做", () => {
    expect(VISUAL_ASSETS.some((a) => a.key === "fonts")).toBe(false);
  });

  it("沒有獨立的「顏色」卡——它跟色彩 DNA 是同一件事", () => {
    expect(VISUAL_ASSETS.some((a) => a.key === "colors")).toBe(false);
  });
});

describe("visibleVisualKeys", () => {
  it("使用者加過的會出現", () => {
    expect(visibleVisualKeys(["guidelines"], {}, 0)).toContain("guidelines");
  });

  it("已經有內容的一定看得見，即使沒被加過", () => {
    expect(visibleVisualKeys([], { layout_rules: { text: "留白 24px" } }, 0)).toContain("layout_rules");
  });

  it("空殼不算有內容", () => {
    expect(visibleVisualKeys([], { guidelines: { text: "   " }, chart_style: { text: "" } }, 0))
      .toEqual([...DEFAULT_VISUAL_KEYS]);
  });

  it("順序照 VISUAL_ASSETS —— 加一張不讓既有卡片跳位", () => {
    const keys = visibleVisualKeys(["chart_style", "guidelines"], {}, 0);
    const order = VISUAL_ASSETS.map((a) => a.key).filter((k) => keys.includes(k));
    expect(keys).toEqual(order);
  });

  it("重複加同一張不會出現兩次", () => {
    expect(visibleVisualKeys(["guidelines", "guidelines"], {}, 0)).toHaveLength(6);
  });
});

describe("visualHasContent 依卡片型態判斷", () => {
  it("色彩 DNA 看的是色票數（它不存在 _assets 裡）", () => {
    expect(visualHasContent("colors_dna", null, 0)).toBe(false);
    expect(visualHasContent("colors_dna", null, 5)).toBe(true);
  });

  it("標誌看的是有沒有檔案", () => {
    expect(visualHasContent("logo", {})).toBe(false);
    expect(visualHasContent("logo", { primaryUrl: "/static/x.png" })).toBe(true);
  });

  it("風格卡：描述或提示詞任一有值就算", () => {
    expect(visualHasContent("imagery_style", { text: "" , prompt: "" })).toBe(false);
    expect(visualHasContent("imagery_style", { prompt: "soft window light" })).toBe(true);
  });

  it("不認得的 key 一律回 false，不要猜", () => {
    expect(visualHasContent("nope", { text: "x" })).toBe(false);
  });
});

describe("卡片資料", () => {
  it("key 不重複", () => {
    const keys = VISUAL_ASSETS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("每張都要說明「填了會影響什麼」", () => {
    for (const a of VISUAL_ASSETS) {
      expect(a.whyZh.length, a.key).toBeGreaterThan(4);
      expect(a.whyEn.length, a.key).toBeGreaterThan(4);
    }
  });
});
