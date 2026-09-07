/**
 * shapeValue 的回歸測試。
 *
 * 2026-08-31 (CJ「context 當中，values 出現了 items" body 等程式碼文案」):
 * 任務開啟時的「我會用 X 來跑這個任務」context chips 會把 positioning 的
 * 欄位轉成一句預覽。positioning.values 的形狀是 { items: [{ label, body }] }，
 * 不含 summary / text / statement 這些鍵，於是掉進 JSON fallback，把整段
 * JSON 當成文案顯示給使用者。
 *
 * 測試放 server 側是因為跨邊界規則：server 可以 import client，反向不行
 * （同 taskFormatCoverage.test.ts）。
 */
import { describe, it, expect } from "vitest";
import { shapeValue } from "../../../client/src/v2/content/lib/taskContextResolver";

/** 品牌 2840 positioning.values 的真實形狀。 */
const REAL_VALUES = {
  items: [
    { label: "挑剔即責任", body: "五感十築的嚴苛標準不是姿態，而是對居住者一生積累的尊重。" },
    { label: "以土為根的時間觀", body: "宏國建設相信一棟建築可以比任何人住得更久。" },
    { label: "感知即標準", body: "把抽象的健康建築標準轉化為可被身體感知的日常體驗。" },
    { label: "品味是底氣", body: "真正的高端居住是一種知根知底的底氣。" },
  ],
};

describe("shapeValue", () => {
  it("不把 { items: [...] } 直接 JSON stringify 給使用者看", () => {
    const out = shapeValue(REAL_VALUES);
    expect(out).not.toContain("items");
    expect(out).not.toContain("body");
    expect(out).not.toContain("{");
    expect(out).not.toContain('"');
  });

  it("挑出 items 裡的 label 當預覽", () => {
    const out = shapeValue(REAL_VALUES);
    expect(out).toContain("挑剔即責任");
    expect(out).toContain("以土為根的時間觀");
  });

  it("items 是字串陣列時直接串起來", () => {
    expect(shapeValue({ items: ["空氣", "水質", "隔音"] })).toBe("空氣、水質、隔音");
  });

  it("items 為空時不會回傳 JSON 殘骸", () => {
    const out = shapeValue({ items: [] });
    expect(out).not.toContain("items");
  });

  it("voice 不會漏出 JSON —— 挑 tone 當預覽", () => {
    // 2026-09-01 CJ 截圖：CONTEXT 那排出現 Voice · {"tone":["嚴謹而溫潤",…
    const voice = {
      tone: ["嚴謹而溫潤", "有底氣的克制", "感知導向", "不疾不徐的自信"],
      archetypes: ["創造者", "智者"],
      forbidden: ["用話術堆疊的促銷語氣"],
      samples: [{ ours: "…", generic: "…" }],
    };
    const out = shapeValue(voice);
    expect(out).not.toContain("{");
    expect(out).not.toContain('"');
    expect(out).not.toContain("tone");
    expect(out).toContain("嚴謹而溫潤");
  });

  it("任何抽不出內容的物件都回空字串，絕不回 JSON", () => {
    for (const raw of [{}, { a: 1 }, { nested: { deep: true } }, { items: [] }, { arr: [] }]) {
      const out = shapeValue(raw);
      expect(out, `${JSON.stringify(raw)} 洩漏了 JSON`).not.toContain("{");
      expect(out).not.toContain('"');
    }
  });

  it("既有行為不變 —— 字串、字串陣列、帶 summary 的物件", () => {
    expect(shapeValue("  純文字  ")).toBe("純文字");
    expect(shapeValue(["A", "B"])).toBe("A、B");
    expect(shapeValue({ summary: "定位總結" })).toBe("定位總結");
    expect(shapeValue({ primary: "主要受眾" })).toBe("主要受眾");
  });

  it("有 summary 時優先用 summary，不被 items 蓋掉", () => {
    expect(shapeValue({ summary: "總結", items: [{ label: "X" }] })).toBe("總結");
  });

  it("null / undefined 回空字串", () => {
    expect(shapeValue(null)).toBe("");
    expect(shapeValue(undefined)).toBe("");
  });
});
