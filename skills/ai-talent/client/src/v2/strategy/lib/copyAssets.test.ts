/**
 * 2026-09-26（CJ「一開始，只要出現推薦用詞、禁用詞與縮寫對照就好，其他的欄位，
 * 都提供新增的卡片的選項，讓用戶自己加」）。
 *
 * 這裡的錯法最可怕的一種是**藏掉有資料的卡片**：既有品牌打開文字頁，發現自己填過
 * 的品牌口吻不見了。畫面上看起來完全正常（就是少一張卡），但使用者會以為資料被
 * 清掉。所以顯示規則要被釘死。
 */
import { describe, expect, it } from "vitest";
import {
  visibleKeys, hasContent, countOf, previewOf, specOf, COPY_ASSETS, DEFAULT_COPY_KEYS,
} from "./copyAssets";

describe("visibleKeys", () => {
  it("什麼都沒有時，就是那三張", () => {
    expect(visibleKeys([], {})).toEqual(["preferred_terms", "banned_words", "abbreviations"]);
  });

  it("使用者加過的會出現", () => {
    const keys = visibleKeys(["hook_library"], {});
    expect(keys).toContain("hook_library");
    expect(keys).toHaveLength(4);
  });

  it("**已經有內容的一定看得見**，即使沒被加過（舊品牌的資料不能被藏起來）", () => {
    const keys = visibleKeys([], { voice: { text: "像鄰居大哥在講話" } });
    expect(keys).toContain("voice");
  });

  it("空殼不算有內容（空字串、空陣列、只填一半的 pair）", () => {
    const keys = visibleKeys([], {
      voice: { text: "   " },
      cta_library: { items: ["", "  "] },
      term_substitutions: { pairs: [{ from: "A", to: "" }] },
    });
    expect(keys).toEqual(["preferred_terms", "banned_words", "abbreviations"]);
  });

  it("順序照 COPY_ASSETS —— 加一張卡不該讓既有卡片跳位", () => {
    const keys = visibleKeys(["voice", "cta_library"], {});
    const order = COPY_ASSETS.map((a) => a.key).filter((k) => keys.includes(k));
    expect(keys).toEqual(order);
  });

  it("重複加同一張不會出現兩次", () => {
    expect(visibleKeys(["banned_words", "banned_words"], {})).toHaveLength(3);
  });
});

describe("卡片資料", () => {
  it("預設三張都真的在 COPY_ASSETS 裡", () => {
    for (const k of DEFAULT_COPY_KEYS) expect(specOf(k), k).toBeTruthy();
  });

  it("每張卡都有「填了會影響什麼」——只有名稱的話使用者無從判斷要不要加", () => {
    for (const a of COPY_ASSETS) {
      expect(a.whyZh.length, a.key).toBeGreaterThan(4);
      expect(a.whyEn.length, a.key).toBeGreaterThan(4);
    }
  });

  it("key 不重複", () => {
    const keys = COPY_ASSETS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("卡片上顯示的內容", () => {
  it("計數依形狀而不同", () => {
    expect(countOf({ items: ["a", "b", " "] }, "items")).toBe(2);
    expect(countOf({ pairs: [{ from: "a", to: "b" }, { from: "c", to: "" }] }, "pairs")).toBe(1);
    expect(countOf({ text: "x" }, "text")).toBe(1);
    expect(countOf(null, "items")).toBe(0);
  });

  it("預覽顯示實際內容，不是「已填寫」這種沒資訊的字", () => {
    expect(previewOf({ items: ["真材實料", "不預醃"] }, "items")).toBe("真材實料、不預醃");
    expect(previewOf({ pairs: [{ from: "CP值", to: "划算" }] }, "pairs")).toBe("CP值 → 划算");
    expect(previewOf({ text: "像鄰居大哥" }, "text")).toBe("像鄰居大哥");
    expect(previewOf(undefined, "text")).toBe("");
  });

  it("hasContent 與 countOf 對同一份資料的判斷一致", () => {
    for (const v of [{ items: ["a"] }, { items: [] }, { text: "" }, { pairs: [{ from: "a", to: "b" }] }, null]) {
      for (const shape of ["items", "text", "pairs"] as const) {
        expect(hasContent(v, shape), `${JSON.stringify(v)}/${shape}`).toBe(countOf(v, shape) > 0);
      }
    }
  });
});
