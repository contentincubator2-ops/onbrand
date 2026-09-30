/**
 * 2026-09-30（CJ「策略層有品牌、產品、活動、文字、視覺，還有其他真實存入的資料，要精細」）。
 * 這裡守三件事：
 *   1. 存著但 AI 不讀的欄位要列出來、標「只存著」——以前這些完全看不到。
 *   2. 段落與欄位名稱用策略層的 schema，跟頁面一致。
 *   3. AI 讀到的行一定出現在某個欄位上，對不上的落到「其他 AI 讀到的內容」，不會隱形。
 */
import { describe, expect, it } from "vitest";
import { buildMemoryView, cleanupTips, textOf, type BrandMemoryData } from "./memoryModel";

const item = (source: string, category: string, keptChars: number, status: any = "remembered", extra: any = {}) =>
  ({ category, group: "", label: source, storedChars: keptChars, keptChars, status, preview: "", source, ...extra });

const base = (over: Partial<BrandMemoryData> = {}): BrandMemoryData => ({
  capacity: 1000,
  brand: {
    name: "品牌A", industry: "文具", description: "", tagline: "", positioningSummary: "", website: "",
    socialLinks: {}, targetCountry: "TW", outputLanguage: "zh-TW",
    positioning: {
      goldenCircle: { why: "為什麼", how: "怎麼做" },
      trends: { favorable: [{ name: "趨勢一", body: "說明" }] },
      _assets: { hook_library: { items: ["鉤子"] }, banned_words: { items: ["壞字"] }, imagery_style: { text: "柔和" } },
    },
  },
  brandBrain: {
    usedChars: 300,
    items: [
      item("market", "info", 100),
      item("pos:goldenCircle.why", "brand", 3),
      item("pos:goldenCircle.how", "brand", 3, "trimmed"),
      item("asset:hook_library", "copy", 2),
      item("asset:banned_words", "copy", 0, "checkOnly"),
      item("pos:audience.painPoints", "brand", 40),
      item("legacy:9", "legacy", 50, "remembered", { legacyRowId: 9 }),
    ],
  },
  products: [{
    id: 11, name: "水彩筆", photoCount: 3,
    positioning: { facts: { price: "199" }, strategy: { pricing: "中價位" } },
    brain: { usedChars: 900, items: [item("name", "product", 3), item("pos:facts.price", "product", 3)] },
  }],
  events: [],
  visual: { swatchCount: 4, swatches: ["#000"], brandPhotoCount: 0 },
  knowledge: [{ id: 1, kind: "note", title: "筆記", chars: 500 }],
  meetings: [],
  ...over,
});

const rowsOf = (v: ReturnType<typeof buildMemoryView>, key: string) =>
  v.sections.find((s) => s.key === key)!.entities.flatMap((e) => e.groups.flatMap((g) => g.rows));

describe("buildMemoryView", () => {
  const v = buildMemoryView(base(), 5, false);

  it("存著但不讀的欄位也列出來，標「只存著」；段落用策略層的標題", () => {
    const brand = v.sections.find((s) => s.key === "brand")!.entities[0]!;
    expect(brand.groups.map((g) => g.title)).toContain("市場趨勢與機會");
    const trend = rowsOf(v, "brand").find((r) => r.label === "有利趨勢")!;
    expect(trend.tag).toBe("stored");
    const product = v.sections.find((s) => s.key === "product")!.entities[0]!;
    const pricing = product.groups.flatMap((g) => g.rows).find((r) => r.label === "定價策略")!;
    expect(pricing.tag).toBe("stored");
    expect(pricing.href).toBe("/brands/edit?b=5&cat=positioning&p=11");
  });

  it("讀了、只讀前段、寫完後檢查、生圖時讀，各自標對", () => {
    const brand = rowsOf(v, "brand");
    expect(brand.find((r) => r.label === "WHY—品牌願景" || r.id.endsWith("goldenCircle.why"))!.tag).toBe("read");
    expect(brand.find((r) => r.id.endsWith("goldenCircle.how"))!.tag).toBe("partial");
    const copy = rowsOf(v, "copy");
    expect(copy.find((r) => r.id === "copy-hook_library")!.tag).toBe("read");
    expect(copy.find((r) => r.id === "copy-banned_words")!.tag).toBe("check");
    expect(rowsOf(v, "visual").find((r) => r.id === "vis-imagery")!.tag).toBe("image");
    expect(rowsOf(v, "info").find((r) => r.id === "info-market")!.tag).toBe("read");
  });

  it("AI 讀到卻對不上欄位的行不會隱形；舊版品牌大腦可以忘掉", () => {
    expect(rowsOf(v, "brand").some((r) => r.label === "pos:audience.painPoints" && r.tag === "read")).toBe(true);
    const legacy = rowsOf(v, "other").find((r) => r.legacyRowId === 9)!;
    expect(legacy.tag).toBe("read");
    expect(rowsOf(v, "other").find((r) => r.label === "筆記")!.tag).toBe("stored");
  });

  it("最滿的一次寫作是寫產品的那次；快滿就提醒", () => {
    expect(v.maxWrite).toEqual({ chars: 900, name: "水彩筆" });
    expect(v.level).toBe("near");
  });
});

describe("cleanupTips", () => {
  it("有沒讀到的排第一；舊版大腦可忘；只讀前段算出被截掉的字", () => {
    const d = base();
    d.brandBrain.items.push(item("custom:願景", "brand", 0, "overflow", { storedChars: 300 }));
    (d.brand.positioning as any)._customSegments = [{ title: "願景", fields: [{ label: "v", value: "很長的願景" }] }];
    const tips = cleanupTips(buildMemoryView(d, 5, false));
    expect(tips.map((t) => t.kind)).toEqual(["skipped", "legacy", "partial", "large"].filter((k) => tips.some((t) => t.kind === k)));
    expect(tips[0]!.kind).toBe("skipped");
  });

  it("空間夠、沒有問題 → 不給建議", () => {
    const d = base({ products: [] });
    d.brandBrain.items = [item("pos:goldenCircle.why", "brand", 3)];
    expect(cleanupTips(buildMemoryView(d, 5, false))).toEqual([]);
  });
});

describe("textOf", () => {
  it("字串、清單、表格列、巢狀物件都攤成一段", () => {
    expect(textOf([{ name: "A", body: "B" }, "C"])).toBe("A · B · C");
    expect(textOf({ a: "", b: ["x"] })).toBe("x");
  });
});
