/**
 * PROMPT_FIELDS 必須真的會進 prompt。
 *
 * 這張表是「上傳定位文件」整個功能的地基：對映提案照它挑目標，落差報告照它
 * 告訴用戶少了什麼會有什麼代價。如果表上寫著某格會影響產出、buildBrandPrefix
 * 其實沒讀它，我們就是在對用戶說謊 —— 他補了那格，產出一個字都不會變。
 *
 * 所以測法刻意不是「檢查原始碼有沒有出現這個字串」，而是**行為測試**：把每
 * 一格填上獨一無二的哨兵字串，真的跑一次 buildBrandPrefix，然後要求每個哨兵
 * 都出現在輸出裡。這正是 2026-09-01 抓到的那個 bug 的形狀 —— 產品定位的
 * reader 讀 pp.usp（canonical 裡不存在），路徑寫在那裡看起來很合理，實際上
 * 一個字都沒進 prompt。文字比對抓不到，行為測試一測就紅。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./marketProfiles", () => ({ buildMarketContext: async () => "" }));
vi.mock("../../db", () => ({ getDb: async () => ({ execute: async () => [[]] }) }));

const rowsFor = { brand: [] as any[], product: [] as any[], event: [] as any[] };

vi.mock("../../localDb", () => ({
  default: {
    execute: async (sqlText: string) => {
      if (/FROM\s+products/i.test(sqlText)) return [rowsFor.product];
      if (/FROM\s+events/i.test(sqlText))   return [rowsFor.event];
      if (/FROM\s+brands/i.test(sqlText))   return [rowsFor.brand];
      return [[]];
    },
  },
}));

import { buildBrandPrefix } from "./brandContext";
import {
  BRAND_PROMPT_FIELDS, PRODUCT_PROMPT_FIELDS, EVENT_PROMPT_FIELDS,
  coverageOf, readPath, customSegmentsOf, type PromptField,
} from "./positioningDocs";

/** 依欄位宣告的形狀塞一個好認的哨兵值。 */
function sentinelFor(f: PromptField, token: string): any {
  if (f.shape === "text") return token;
  if (f.shape === "list") return [token];
  return [{ generic: "一般說法", ours: token }];
}

/** 把 dot-path 寫進巢狀物件。 */
function setPath(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  let cur = obj;
  for (const k of keys.slice(0, -1)) cur = (cur[k] ??= {});
  cur[keys[keys.length - 1]!] = value;
}

function fullyPopulated(fields: PromptField[], prefix: string): { pos: any; tokens: Map<string, string> } {
  const pos: any = {};
  const tokens = new Map<string, string>();
  fields.forEach((f, i) => {
    const token = `${prefix}${i}ZZ`;          // 不可能自然出現在 prompt 樣板裡
    tokens.set(f.path, token);
    setPath(pos, f.path, sentinelFor(f, token));
  });
  return { pos, tokens };
}

// 模組層有 prefix 快取，所以每個案例都得用不同的 brandId。
let nextId = 900_001;
const freshId = () => nextId++;

beforeEach(() => {
  rowsFor.brand = [];
  rowsFor.product = [];
  rowsFor.event = [];
});

describe("BRAND_PROMPT_FIELDS 每一格都會進 prompt", () => {
  it("填滿之後，每一格的值都出現在品牌前綴裡", async () => {
    const { pos, tokens } = fullyPopulated(BRAND_PROMPT_FIELDS, "BRANDTOK");
    const brandId = freshId();
    rowsFor.brand = [{ id: brandId, name: "測試品牌", positioning: pos }];

    const prefix = await buildBrandPrefix(brandId);

    const absent = [...tokens].filter(([, token]) => !prefix.includes(token)).map(([path]) => path);
    expect(absent, `這些欄位宣稱會進 prompt，實際上沒有：${absent.join(", ")}`).toEqual([]);
  });
});

describe("PRODUCT_PROMPT_FIELDS 每一格都會進 prompt", () => {
  it("填滿之後，每一格的值都出現在產品區塊裡", async () => {
    const { pos, tokens } = fullyPopulated(PRODUCT_PROMPT_FIELDS, "PRODTOK");
    const brandId = freshId();
    rowsFor.brand = [{ id: brandId, name: "測試品牌", positioning: {} }];
    rowsFor.product = [{ name: "測試產品", positioning: pos }];

    const prefix = await buildBrandPrefix(brandId, 555);

    const absent = [...tokens].filter(([, token]) => !prefix.includes(token)).map(([path]) => path);
    expect(absent, `這些產品欄位沒進 prompt：${absent.join(", ")}`).toEqual([]);
  });

  it("2026-09-01 迴歸：舊的 pp.usp / pp.target 形狀不再被當成產品定位", async () => {
    const brandId = freshId();
    rowsFor.brand = [{ id: brandId, name: "測試品牌", positioning: {} }];
    rowsFor.product = [{
      name: "測試產品",
      positioning: { usp: "LEGACYUSP", target: "LEGACYTARGET", keyMessages: ["LEGACYMSG"] },
    }];

    const prefix = await buildBrandPrefix(brandId, 556);

    // 舊 key 早就沒有 writer 會產出了；還讀它只會讓真正的 canonical 欄位看起來
    // 「有東西」而其實沒有。產品名稱仍然要在。
    expect(prefix).not.toContain("LEGACYUSP");
    expect(prefix).toContain("測試產品");
  });
});

describe("EVENT_PROMPT_FIELDS 每一格都會進 prompt", () => {
  it("填滿之後，每一格的值都出現在活動區塊裡", async () => {
    const { pos, tokens } = fullyPopulated(EVENT_PROMPT_FIELDS, "EVENTTOK");
    const brandId = freshId();
    rowsFor.brand = [{ id: brandId, name: "測試品牌", positioning: {} }];
    rowsFor.event = [{ name: "測試活動", startAt: null, endAt: null, positioning: pos }];

    const prefix = await buildBrandPrefix(brandId, null, 777);

    const absent = [...tokens].filter(([, token]) => !prefix.includes(token)).map(([path]) => path);
    expect(absent, `這些活動欄位沒進 prompt：${absent.join(", ")}`).toEqual([]);
  });

  it("2026-09-01 迴歸：canonical 的 audience 是物件，不可以變成 [object Object]", async () => {
    const brandId = freshId();
    rowsFor.brand = [{ id: brandId, name: "測試品牌", positioning: {} }];
    rowsFor.event = [{
      name: "測試活動", startAt: null, endAt: null,
      positioning: { audience: { primaryAudience: "三十五歲雙薪家庭", keyInsight: "沒時間但不將就" } },
    }];

    const prefix = await buildBrandPrefix(brandId, null, 778);

    expect(prefix).not.toContain("[object Object]");
    expect(prefix).toContain("三十五歲雙薪家庭");
  });
});

describe("上傳文件的補充段落會進 prompt", () => {
  it("_sourceDoc.injectedContext 出現在品牌前綴裡", async () => {
    const brandId = freshId();
    rowsFor.brand = [{
      id: brandId, name: "測試品牌",
      positioning: { _sourceDoc: { docId: "d", name: "手冊.docx", appliedAt: "", filled: [], missing: [], injectedContext: "INJECTEDBLOCK 我們拒接的案子類型" } },
    }];

    const prefix = await buildBrandPrefix(brandId);

    expect(prefix).toContain("INJECTEDBLOCK");
  });

  it("沒有補充段落時不會多出一個空標題", async () => {
    const brandId = freshId();
    rowsFor.brand = [{
      id: brandId, name: "測試品牌",
      positioning: { _sourceDoc: { docId: "d", name: "手冊.docx", appliedAt: "", filled: [], missing: [], injectedContext: "" } },
    }];

    const prefix = await buildBrandPrefix(brandId);

    expect(prefix).not.toContain("品牌定位文件補充");
  });
});

describe("coverageOf", () => {
  it("空的 positioning = 每一格都缺，而且每格都說得出代價", () => {
    const { filled, missing } = coverageOf({}, "brand");
    expect(filled).toEqual([]);
    expect(missing).toHaveLength(BRAND_PROMPT_FIELDS.length);
    for (const f of missing) expect(f.cost.length).toBeGreaterThan(8);
  });

  it("空字串與空陣列算「沒填」，不是「填了」", () => {
    const pos = { tagline: { zhTagline: "   " }, voice: { tone: [] }, origin: { story: "有內容" } };
    expect(readPath(pos, "tagline.zhTagline")).toBeUndefined();
    expect(readPath(pos, "voice.tone")).toBeUndefined();
    expect(readPath(pos, "origin.story")).toBe("有內容");

    const { filled } = coverageOf(pos, "brand");
    expect(filled.map((f) => f.path)).toEqual(["origin.story"]);
  });

  it("三個 scope 的路徑都是 segment.field 兩層，且沒有重複", () => {
    for (const fields of [BRAND_PROMPT_FIELDS, PRODUCT_PROMPT_FIELDS, EVENT_PROMPT_FIELDS]) {
      const paths = fields.map((f) => f.path);
      expect(new Set(paths).size).toBe(paths.length);
      for (const p of paths) expect(p.split(".")).toHaveLength(2);
    }
  });
});

// 2026-09-23（CJ「品牌定位…也可以自訂新增欄位，或是輸入 chatgpt 針對不同產品或品牌的討論」）：
// 使用者自己開的定位卡片（_customSegments[]）要跟固定欄位一樣真的進 prompt，不然只是裝飾。
describe("customSegmentsOf", () => {
  it("讀不到就回空陣列，不是 undefined／丟例外", () => {
    expect(customSegmentsOf({})).toEqual([]);
    expect(customSegmentsOf({ _customSegments: "not-an-array" })).toEqual([]);
  });

  it("讀得到就原樣回傳", () => {
    const segs = [{ id: "s1", title: "品牌願景", fields: [], createdAt: "", sourceDocId: null }];
    expect(customSegmentsOf({ _customSegments: segs })).toBe(segs);
  });
});

describe("自訂卡片會進 buildBrandPrefix（跟固定欄位同一條規矩：畫面上有的東西一定要進得了 prompt）", () => {
  it("品牌的自訂卡片標題與欄位值都出現在品牌前綴裡", async () => {
    const brandId = freshId();
    rowsFor.brand = [{
      id: brandId, name: "測試品牌",
      positioning: {
        _customSegments: [{
          id: "s1", title: "CUSTOMTITLEZZ",
          fields: [{ key: "why", label: "為什麼", value: "CUSTOMVALUEZZ" }],
          createdAt: "", sourceDocId: null,
        }],
      },
    }];

    const prefix = await buildBrandPrefix(brandId);

    expect(prefix).toContain("CUSTOMTITLEZZ");
    expect(prefix).toContain("CUSTOMVALUEZZ");
  });

  it("產品與活動的自訂卡片也各自進得了對應區塊", async () => {
    const brandId = freshId();
    rowsFor.brand = [{ id: brandId, name: "測試品牌", positioning: {} }];
    rowsFor.product = [{
      name: "測試產品",
      positioning: { _customSegments: [{ id: "p1", title: "PRODCARDZZ", fields: [{ key: "a", label: "A", value: "PRODVALZZ" }], createdAt: "", sourceDocId: null }] },
    }];
    rowsFor.event = [{
      name: "測試活動", startAt: null, endAt: null,
      positioning: { _customSegments: [{ id: "e1", title: "EVENTCARDZZ", fields: [{ key: "a", label: "A", value: "EVENTVALZZ" }], createdAt: "", sourceDocId: null }] },
    }];

    const productPrefix = await buildBrandPrefix(brandId, 601);
    expect(productPrefix).toContain("PRODCARDZZ");
    expect(productPrefix).toContain("PRODVALZZ");

    const eventPrefix = await buildBrandPrefix(brandId, null, 602);
    expect(eventPrefix).toContain("EVENTCARDZZ");
    expect(eventPrefix).toContain("EVENTVALZZ");
  });

  it("沒有標題或沒有欄位的殘缺卡片不會被塞進 prompt（例如寫壞的資料）", async () => {
    const brandId = freshId();
    rowsFor.brand = [{
      id: brandId, name: "測試品牌",
      positioning: { _customSegments: [{ id: "s1", title: "", fields: [{ key: "a", label: "A", value: "SHOULDNOTAPPEARZZ" }], createdAt: "", sourceDocId: null }] },
    }];

    const prefix = await buildBrandPrefix(brandId);
    expect(prefix).not.toContain("SHOULDNOTAPPEARZZ");
  });

  it("沒有自訂卡片時不會多印出任何東西", async () => {
    const brandId = freshId();
    rowsFor.brand = [{ id: brandId, name: "測試品牌", positioning: { _customSegments: [] } }];
    const prefix = await buildBrandPrefix(brandId);
    expect(prefix).not.toContain("undefined");
  });
});
