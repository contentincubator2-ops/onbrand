/**
 * 品牌大腦（buildBrandBrain）的行為測試。
 *
 * 2026-09-29（CJ「檢查大腦……像手機記憶體的感覺，透明化品牌大腦當中有記到的內容」）：
 * 大腦畫面與產文 prompt 是同一份清單。這裡守的是：
 *   1. 畫面說「記住」的，prompt 裡真的有；說「超載」的，prompt 裡真的沒有。
 *   2. 以前默默截掉的地方（自訂卡片只讀 3 格、清單只讀 8 條）現在會被標出來。
 *   3. core／full 不再是兩份。
 *   4. Hook 庫、文案範本、產品命名、縮寫、品牌術語會進 prompt；禁用詞與替換對照
 *      不進 prompt、標成「產出後檢查」。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./marketProfiles", () => ({ buildMarketContext: async () => "[市場] 台灣繁中\n" }));
vi.mock("../../db", () => ({ getDb: async () => ({ execute: async () => [[]] }) }));

const rowsFor = { brand: [] as any[], product: [] as any[], reg: [] as any[] };

vi.mock("../../localDb", () => ({
  default: {
    execute: async (sqlText: string) => {
      if (/FROM\s+brand_regulations/i.test(sqlText)) return [rowsFor.reg];
      if (/FROM\s+products/i.test(sqlText)) return [rowsFor.product];
      if (/FROM\s+brands/i.test(sqlText))   return [rowsFor.brand];
      return [[]];
    },
  },
}));

import { buildBrandBrain, buildBrandPrefix, BRAIN_CAPACITY } from "./brandContext";

let nextId = 950_001;
const freshId = () => nextId++;

beforeEach(() => { rowsFor.brand = []; rowsFor.product = []; rowsFor.reg = []; });

const withPos = (positioning: any) => {
  const id = freshId();
  rowsFor.brand = [{ id, name: "測試品牌", positioning }];
  return id;
};

describe("大腦清單 = prompt", () => {
  it("每一筆「記住」的內容都在 prompt 裡，市場設定也列在清單上", async () => {
    const id = withPos({ tagline: { zhTagline: "標語ZZ" }, origin: { story: "故事ZZ" } });
    const brain = await buildBrandBrain(id);
    expect(brain.prefix).toContain("標語ZZ");
    expect(brain.prefix).toContain("故事ZZ");
    const labels = brain.items.map((i) => i.label);
    // 畫面用策略層頁面上的名稱，不是 prompt 裡的標籤。
    expect(labels).toContain("中文標語");
    expect(labels).toContain("起源故事");
    expect(labels).toContain("市場與語言設定");
    const tag = brain.items.find((i) => i.label === "中文標語")!;
    expect(tag.category).toBe("brand");
    expect(tag.group).toBe("品牌核心標語");
    expect(brain.items.every((i) => i.status === "remembered")).toBe(true);
    expect(brain.capacity).toBe(BRAIN_CAPACITY);
    expect(brain.usedChars).toBeGreaterThan(0);
  });

  it("core 與 full 是同一份（不再有精簡版）", async () => {
    const id = withPos({ tagline: { zhTagline: "同一份ZZ" }, _customSegments: [{ title: "願景", fields: [{ label: "v", value: "卡片ZZ" }] }] });
    expect(await buildBrandPrefix(id, null, null, "core")).toBe(await buildBrandPrefix(id, null, null, "full"));
    expect(await buildBrandPrefix(id, null, null, "core")).toContain("卡片ZZ");
  });
});

describe("以前默默截掉的地方，現在看得到", () => {
  it("自訂卡片讀全部欄位，不再只讀前 3 格", async () => {
    const fields = Array.from({ length: 6 }, (_, i) => ({ label: `L${i}`, value: `V${i}ZZ` }));
    const id = withPos({ _customSegments: [{ title: "六格卡", fields }] });
    const brain = await buildBrandBrain(id);
    for (let i = 0; i < 6; i++) expect(brain.prefix).toContain(`V${i}ZZ`);
  });

  it("太長的欄位標成「只記住一部分」，並記下存了多少字", async () => {
    const long = "字".repeat(2_000);
    const id = withPos({ origin: { story: long } });
    const item = (await buildBrandBrain(id)).items.find((i) => i.label === "起源故事")!;
    expect(item.status).toBe("trimmed");
    expect(item.storedChars).toBe(2_000);
    expect(item.keptChars).toBeLessThan(2_000);
  });

  it("清單超過上限條數也標成「只記住一部分」", async () => {
    const items = Array.from({ length: 30 }, (_, i) => `用詞${i}`);
    const id = withPos({ _assets: { preferred_terms: { items } } });
    const item = (await buildBrandBrain(id)).items.find((i) => i.label === "推薦用詞")!;
    expect(item.status).toBe("trimmed");
    // 「存了多少」算整份清單、「記住多少」只算內容——記住不可能比存的多。
    expect(item.storedChars).toBe(items.join(" · ").length);
    expect(item.keptChars).toBeLessThan(item.storedChars);
  });
});

describe("容量：超過就從優先度最低的開始擠掉，並標成超載", () => {
  it("總量超過容量時，自訂卡片比品牌核心先被擠掉，被擠掉的不在 prompt 裡", async () => {
    const cards = Array.from({ length: 20 }, (_, i) => ({ title: `卡${i}`, fields: [{ label: "x", value: `CARD${i}ZZ` + "字".repeat(1_100) }] }));
    const id = withPos({ tagline: { zhTagline: "核心標語ZZ" }, _customSegments: cards });
    const brain = await buildBrandBrain(id);
    const overflow = brain.items.filter((i) => i.status === "overflow");
    expect(overflow.length).toBeGreaterThan(0);
    expect(overflow.every((i) => i.category === "brand" && i.group === "自訂卡片")).toBe(true);
    expect(brain.prefix).toContain("核心標語ZZ");
    for (const o of overflow) {
      const n = o.label.replace("卡", "");
      expect(brain.prefix).not.toContain(`CARD${n}ZZ`);
    }
    expect(brain.usedChars).toBeLessThanOrEqual(BRAIN_CAPACITY);
  });
});

describe("文字頁規則", () => {
  it("Hook 庫、文案範本、產品命名、縮寫、品牌術語都進 prompt", async () => {
    const id = withPos({ _assets: {
      hook_library: { items: ["HOOKZZ"] },
      templates_copy: { items: ["TPLZZ"] },
      product_naming: { text: "NAMINGZZ" },
      abbreviations: { pairs: [{ from: "ABBRZZ", to: "全名" }] },
      branded_terms: { items: ["TERMZZ"] },
    } });
    const p = await buildBrandPrefix(id);
    for (const t of ["HOOKZZ", "TPLZZ", "NAMINGZZ", "ABBRZZ", "TERMZZ"]) expect(p).toContain(t);
  });

  it("禁用詞與替換對照不進 prompt，但列在大腦上、標成產出後檢查", async () => {
    const id = withPos({ _assets: {
      banned_words: { items: ["BANNEDZZ"] },
      term_substitutions: { pairs: [{ from: "SUBFROMZZ", to: "SUBTOZZ" }] },
    } });
    const brain = await buildBrandBrain(id);
    expect(brain.prefix).not.toContain("BANNEDZZ");
    expect(brain.prefix).not.toContain("SUBFROMZZ");
    const checks = brain.items.filter((i) => i.status === "checkOnly");
    expect(checks.map((c) => c.label).sort()).toEqual(["替換對照", "禁用詞"].sort());
    expect(checks.every((c) => c.category === "copy")).toBe(true);
    expect(checks.map((c) => c.preview).join()).toContain("BANNEDZZ");
    expect(checks.every((c) => c.keptChars === 0)).toBe(true);
  });
});

describe("產品範圍", () => {
  it("有選產品時，產品定位進 prompt 並列在「產品」類別", async () => {
    const id = withPos({ tagline: { zhTagline: "t" } });
    rowsFor.product = [{ name: "產品A", positioning: { core: { coreStatement: "產品定位ZZ" } } }];
    const brain = await buildBrandBrain(id, 77);
    expect(brain.prefix).toContain("產品定位ZZ");
    expect(brain.items.some((i) => i.category === "product" && i.group === "產品核心定位" && i.label === "核心定位")).toBe(true);
  });
});

describe("大腦畫面的名稱跟策略層一致", () => {
  it("品牌定位與文字頁填滿時，每一筆都歸到策略層的分類與該頁段落，不會露出內部標籤", async () => {
    const id = withPos({
      tagline: { zhTagline: "a", enTagline: "b" },
      goldenCircle: { why: "w", how: "h", what: "x" },
      origin: { story: "s", belief5Layers: [{ body: "b1" }] },
      values: { items: [{ label: "v" }] },
      audience: { primary: "p", painPoints: ["pp"] },
      differentiation: { summary: "d", discriminator: "dd", reasonToBelieve: "r" },
      competition: { intensity: "i", direct: [{ name: "n", ourEdge: "e" }], map: "m" },
      voice: { archetypes: ["a"], tone: ["t"], forbidden: ["f"], samples: [{ ours: "o", generic: "g" }] },
      _customSegments: [{ title: "願景", fields: [{ label: "x", value: "y" }] }],
      _sourceDoc: { injectedContext: "doc" },
      _assets: {
        voice: { text: "v" }, voice_principles: { items: ["p"] }, preferred_terms: { items: ["t"] },
        branded_terms: { items: ["b"] }, abbreviations: { pairs: [{ from: "A", to: "B" }] },
        product_naming: { text: "n" }, cta_library: { items: ["c"] }, hook_library: { items: ["h"] },
        templates_copy: { items: ["tp"] }, banned_words: { items: ["x"] },
        term_substitutions: { pairs: [{ from: "a", to: "b" }] },
      },
    });
    const brain = await buildBrandBrain(id);
    const strategyCats = ["info", "brand", "copy", "product", "event"];
    for (const i of brain.items) {
      expect(strategyCats, `${i.label} 歸到了 ${i.category}`).toContain(i.category);
      if (i.category === "brand") expect(i.group, `${i.label} 沒有對到品牌頁的段落`).not.toBe("");
    }
    const copyLabels = brain.items.filter((i) => i.category === "copy").map((i) => i.label);
    for (const l of ["品牌口吻", "品牌準則", "推薦用詞", "品牌術語", "縮寫對照", "產品名稱規範", "CTA 庫", "Hook 庫", "文案範本", "禁用詞", "替換對照"]) {
      expect(copyLabels).toContain(l);
    }
  });
});

describe("每一行都有出處（「記憶」頁靠它把存著的欄位對到讀了沒）", () => {
  it("品牌、文字、產品、自訂卡片、市場的每一筆都帶 source", async () => {
    const id = withPos({
      tagline: { zhTagline: "標", enTagline: "T" }, goldenCircle: { why: "w", how: "h", what: "x" },
      voice: { archetypes: ["智者"], tone: ["溫暖"], forbidden: ["不"], samples: [{ ours: "我們", generic: "一般" }] },
      origin: { story: "s", belief5Layers: [{ body: "b" }] }, audience: { primary: "p" },
      differentiation: { summary: "d", discriminator: "k", reasonToBelieve: "r" },
      values: { items: [{ label: "誠" }] }, competition: { intensity: "i", direct: [{ name: "A" }], map: "m" },
      _assets: { hook_library: { items: ["h1"] }, voice: { text: "v" }, banned_words: { items: ["壞"] } },
      _customSegments: [{ title: "願景", fields: [{ label: "v", value: "卡" }] }],
      _sourceDoc: { injectedContext: "文件" },
    });
    rowsFor.product = [{ name: "筆", positioning: { facts: { price: "100" }, core: { coreStatement: "c" }, strategy: { pricing: "p" } } }];
    const brain = await buildBrandBrain(id, 77);
    const missing = brain.items.filter((i) => !i.source).map((i) => `${i.category}/${i.label}`);
    expect(missing).toEqual([]);
    const src = (label: string) => brain.items.find((i) => i.label === label)?.source;
    expect(src("WHY — 品牌願景")).toBe("pos:goldenCircle.why");
    expect(src("Hook 庫")).toBe("asset:hook_library");
    expect(src("禁用詞")).toBe("asset:banned_words");
    expect(src("售價")).toBe("pos:facts.price");
    expect(src("核心定位")).toBe("pos:core.coreStatement");
    expect(src("願景")).toBe("custom:願景");
  });
});

describe("法規（寫之前先審查）", () => {
  const reg = (id: number, brandId: number, title: string, body: string, source = "") =>
    ({ id, brandId, title, source, body: `（原文）${body}`, digest: body, enabled: 1, createdAt: new Date(), updatedAt: new Date() });

  it("啟用中的法規放在 prompt 最後一段，清單上歸在「法規」", async () => {
    const id = withPos({ origin: { story: "故事ZZ" } });
    rowsFor.reg = [reg(7, id, "食安法第28條", "條文ZZ不得虛偽誇張", "衛福部")];
    const brain = await buildBrandBrain(id);
    const at = brain.prefix.indexOf("[法規審查");
    expect(at).toBeGreaterThan(brain.prefix.indexOf("故事ZZ"));
    expect(brain.prefix.slice(at)).toContain("【食安法第28條】（來源：衛福部）\n條文ZZ不得虛偽誇張");
    const item = brain.items.find((i) => i.source === "reg:7")!;
    expect(item).toMatchObject({ category: "regulation", group: "法規", label: "食安法第28條", status: "remembered" });
  });

  it("大腦超載時先擠掉別的內容，法規不割捨", async () => {
    const id = withPos({ origin: { story: "故".repeat(1_500) }, _customSegments: Array.from({ length: 20 }, (_, i) => ({ title: `卡${i}`, fields: [{ label: "x", value: "字".repeat(1_200) }] })) });
    rowsFor.reg = [reg(8, id, "化粧品廣告", "法".repeat(800))];
    const brain = await buildBrandBrain(id);
    expect(brain.items.some((i) => i.status === "overflow")).toBe(true);
    expect(brain.items.find((i) => i.source === "reg:8")!.status).toBe("remembered");
    expect(brain.prefix).toContain("法".repeat(800));
    expect(brain.prefix).not.toContain("（原文）");
  });

  it("還沒確認審查重點的法規不進大腦（原文不進）", async () => {
    const id = withPos({ origin: { story: "故事ZZ" } });
    rowsFor.reg = [{ ...reg(9, id, "未萃取", "x"), digest: null }];
    const brain = await buildBrandBrain(id);
    expect(brain.prefix).not.toContain("[法規審查");
    expect(brain.items.some((i) => i.category === "regulation")).toBe(false);
  });

  it("沒有法規就沒有法規段", async () => {
    const id = withPos({ origin: { story: "故事ZZ" } });
    expect((await buildBrandBrain(id)).prefix).not.toContain("[法規審查");
  });
});
