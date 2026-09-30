/**
 * 2026-09-30 CJ：「策略層有品牌、產品、活動、文字、視覺……要精細」「只要看目前各個用量是多少，
 * 他再進去決定要不要修改。不要呈現沒讀到、舊版留下的問題」。這裡守：
 *   1. 存著的欄位都列出來（含 AI 不讀的），段落用策略層的標題。
 *   2. 用量只算 AI 寫文會讀的欄位；一次寫作只讀一個產品、一個活動，所以產品／活動取最大的。
 *   3. 固定六區、跟 rail 同順序；不產生任何系統面的狀態（沒讀到、舊版大腦、知識庫）。
 */
import { describe, expect, it } from "vitest";
import { buildMemoryView, editHrefFromMemory, parseMem, textOf, type BrandMemoryData } from "./memoryModel";

const item = (source: string, category: string, status: any = "remembered") =>
  ({ category, group: "", label: source, storedChars: 1, keptChars: 1, status, preview: "", source });

const data = (): BrandMemoryData => ({
  capacity: 100,
  brand: {
    name: "品牌A", industry: "文具", description: "", tagline: "", positioningSummary: "", website: "",
    socialLinks: {}, targetCountry: "TW", outputLanguage: "zh-TW",
    positioning: {
      goldenCircle: { why: "一二三四五", how: "六七八" },
      trends: { favorable: [{ name: "趨勢", body: "說明" }] },
      oldKey: "舊版的東西",
      _assets: { hook_library: { items: ["鉤子"] }, banned_words: { items: ["壞字"] }, imagery_style: { text: "柔和" } },
    },
  },
  brandBrain: {
    usedChars: 0,
    items: [
      item("market", "info"), item("pos:goldenCircle.why", "brand"), item("pos:goldenCircle.how", "brand", "overflow"),
      item("asset:hook_library", "copy"), item("asset:banned_words", "copy", "checkOnly"), item("legacy:9", "legacy"),
    ],
  },
  products: [
    { id: 11, name: "水彩筆", photoCount: 3, positioning: { facts: { price: "199" }, strategy: { pricing: "中價位" } },
      brain: { usedChars: 0, items: [item("name", "product"), item("pos:facts.price", "product")] } },
    { id: 12, name: "禮盒", photoCount: 0, positioning: { facts: { price: "1" } },
      brain: { usedChars: 0, items: [item("pos:facts.price", "product")] } },
  ],
  events: [],
  visual: { swatchCount: 4, swatches: ["#000"], brandPhotoCount: 0 },
});

describe("buildMemoryView", () => {
  const v = buildMemoryView(data(), 5, false);
  const sec = (k: string) => v.sections.find((s) => s.key === k)!;
  const rows = (k: string) => sec(k).entities.flatMap((e) => e.groups.flatMap((g) => g.rows));

  it("固定六區、跟策略層 rail 同順序", () => {
    expect(v.sections.map((s) => s.key)).toEqual(["brand", "product", "event", "copy", "visual", "info"]);
  });

  it("存著但 AI 不讀的欄位也列出來，但不算用量；段落用策略層標題", () => {
    const brand = sec("brand").entities[0]!;
    expect(brand.groups.map((g) => g.title)).toContain("市場趨勢與機會");
    const trend = rows("brand").find((r) => r.label === "有利趨勢")!;
    expect(trend.counted).toBe(false);
    // WHY 5 字 + HOW 3 字（HOW 雖然這次被擠掉，仍是用戶存進記憶的內容）
    expect(sec("brand").usedChars).toBe(8);
  });

  it("產品取最大的那一個；點欄位回到該產品的定位頁", () => {
    expect(sec("product").usedChars).toBe(3 + 3); // 產品名稱「水彩筆」＋售價「199」
    const pricing = rows("product").find((r) => r.label === "定價策略")!;
    expect(pricing.counted).toBe(false);
    expect(pricing.href).toBe("/brands/edit?b=5&cat=positioning&p=11");
  });

  it("寫完才檢查的禁用詞、視覺都不算用量；總用量＝各區加總", () => {
    expect(rows("copy").find((r) => r.id === "copy-banned_words")!.counted).toBe(false);
    expect(sec("visual").usedChars).toBe(0);
    expect(v.usedChars).toBe(v.sections.reduce((n, s) => n + s.usedChars, 0));
  });

  it("不列系統面的東西：舊版欄位、舊版大腦", () => {
    const all = v.sections.flatMap((s) => s.entities.flatMap((e) => e.groups.flatMap((g) => g.rows)));
    expect(all.some((r) => r.label === "oldKey" || r.label.includes("legacy"))).toBe(false);
  });

  it("超過容量就是滿了", () => {
    const d = data();
    d.capacity = 10;
    expect(buildMemoryView(d, 5, false).level).toBe("over");
  });
});

describe("textOf", () => {
  it("字串、清單、表格列、巢狀物件都攤成一段", () => {
    expect(textOf([{ name: "A", body: "B" }, "C"])).toBe("A · B · C");
    expect(textOf({ a: "", b: ["x"] })).toBe("x");
  });
});

describe("從記憶去修改、再回到記憶", () => {
  const v = buildMemoryView(data(), 5, false);
  const rows = (k: string) => v.sections.find((s) => s.key === k)!.entities.flatMap((e) => e.groups.flatMap((g) => g.rows));

  it("產品欄位：去該產品的定位頁、打開那一段，並帶著回程位置", () => {
    const price = rows("product").find((r) => r.label === "售價")!;
    const href = editHrefFromMemory(price, { section: "product", entity: "p11" });
    const q = new URLSearchParams(href.split("?")[1]);
    expect(q.get("cat")).toBe("positioning");
    expect(q.get("p")).toBe("11");
    expect(q.get("focus")).toBe("seg:facts");
    expect(q.get("from")).toBe("memory");
    expect(parseMem(q.get("mem"))).toEqual({ section: "product", entity: "p11" });
  });

  it("文字卡打開那張卡；沒有對應段落的欄位不帶 focus", () => {
    const hook = rows("copy").find((r) => r.id === "copy-hook_library")!;
    expect(new URLSearchParams(editHrefFromMemory(hook, { section: "copy" }).split("?")[1]).get("focus")).toBe("asset:hook_library");
    const market = rows("info").find((r) => r.id === "info-market")!;
    expect(new URLSearchParams(editHrefFromMemory(market, { section: "info" }).split("?")[1]).get("focus")).toBeNull();
  });

  it("網址上亂填的 mem 不會開出不存在的區", () => {
    expect(parseMem("nope.p1")).toBeNull();
    expect(parseMem(null)).toBeNull();
    expect(parseMem("event")).toEqual({ section: "event" });
  });
});
