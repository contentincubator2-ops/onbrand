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

const rowsFor = { brand: [] as any[], product: [] as any[] };

vi.mock("../../localDb", () => ({
  default: {
    execute: async (sqlText: string) => {
      if (/FROM\s+products/i.test(sqlText)) return [rowsFor.product];
      if (/FROM\s+brands/i.test(sqlText))   return [rowsFor.brand];
      return [[]];
    },
  },
}));

import { buildBrandBrain, buildBrandPrefix, BRAIN_CAPACITY } from "./brandContext";

let nextId = 950_001;
const freshId = () => nextId++;

beforeEach(() => { rowsFor.brand = []; rowsFor.product = []; });

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
    expect(labels).toContain("Tagline 中");
    expect(labels).toContain("品牌故事");
    expect(labels).toContain("市場與語言設定");
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
    const item = (await buildBrandBrain(id)).items.find((i) => i.label === "品牌故事")!;
    expect(item.status).toBe("trimmed");
    expect(item.storedChars).toBe(2_000);
    expect(item.keptChars).toBeLessThan(2_000);
  });

  it("清單超過上限條數也標成「只記住一部分」", async () => {
    const items = Array.from({ length: 30 }, (_, i) => `用詞${i}`);
    const id = withPos({ _assets: { preferred_terms: { items } } });
    const item = (await buildBrandBrain(id)).items.find((i) => i.label === "偏好用詞")!;
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
    expect(overflow.every((i) => i.category === "custom")).toBe(true);
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
    expect(brain.items.some((i) => i.category === "product" && i.label === "產品核心定位")).toBe(true);
  });
});
