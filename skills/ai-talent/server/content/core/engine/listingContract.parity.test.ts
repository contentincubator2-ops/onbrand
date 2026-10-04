/**
 * client 的 listingParse（預覽用）與 server 的 listingContract（驗證用）必須拆出一樣的欄位，
 * 否則預覽上顯示的欄位／字數／超標，跟 server 認定的對不上。client 不能 import server，
 * 所以兩邊各留一份，由這支用同一批 caption 鎖住。
 */
import { describe, it, expect } from "vitest";
import { parseListing, sanitizeListingFields, DEFAULT_LISTING_FIELDS, normalizeListing } from "./listingContract";
import {
  parseListingCaption, listingCsv, plainValue, todoItems, bulletItems as clientBullets,
} from "../../../../client/src/v2/content/lib/listingParse";

const SPEC = { fields: sanitizeListingFields([
  { label: "商品標題", kind: "text", maxChars: 10 },
  { label: "賣點條列", kind: "bullets" },
  { label: "商品描述", kind: "long", maxChars: 30 },
  ...DEFAULT_LISTING_FIELDS.slice(2, 3),
]) };

const CAPTIONS = [
  "【商品標題】\n薑母茶暖身沖泡十入裝\n\n【賣點條列】\n・薑味溫潤\n・小包好攜帶\n\n【商品描述】\n天冷泡一杯。\n【注意】請勿併用藥物\n\n【規格資訊】\n・10 入\n\n【待補資料】\n無",
  "【商品標題】薑母茶\n【賣點條列】\n1. 甲\n2. 乙\n【商品描述】短\n【規格資訊】\n- 丙\n- 丁\n【待補資料】\n・成分",
  "【商品標題】\n重複\n\n【商品標題】\n第二份要被忽略\n\n【賣點條列】\n・a\n・b",
  "沒有任何欄位標題的一段話",
  "",
];

describe("client / server 欄位拆解一致", () => {
  for (const [i, cap] of CAPTIONS.entries()) {
    it(`caption #${i + 1}`, () => {
      const s = parseListing(cap, SPEC).fields;
      const c = parseListingCaption(cap, SPEC.fields);
      expect(c.map((r) => [r.key, r.value, r.length, r.over])).toEqual(s.map((r) => [r.key, r.value, r.length, r.over]));
    });
  }

  it("正規化後的標準排版，client 仍拆得出同樣的欄位", () => {
    const n = normalizeListing(CAPTIONS[1]!, SPEC);
    const rows = parseListingCaption(n, SPEC.fields);
    expect(rows.every((r) => r.value != null)).toBe(true);
    expect(clientBullets(rows[1]!.value!)).toEqual(["甲", "乙"]);
  });
});

describe("CSV", () => {
  const rows = parseListingCaption(CAPTIONS[0]!, SPEC.fields);

  it("開頭有 BOM（Excel 才會把 UTF-8 中文當中文開）；第一列是欄位名，之後一列一個商品", () => {
    const csv = listingCsv([{ name: "薑母茶", fields: rows }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("名稱,商品標題,賣點條列,商品描述,規格資訊,待補資料");
  });

  it("含逗號、引號、換行的內容要加引號並跳脫；條列的符號被拿掉、一條一行", () => {
    const csv = listingCsv([{ name: 'a,"b"', fields: rows }]);
    expect(csv).toContain('"a,""b"""');
    expect(csv).toContain('"薑味溫潤\n小包好攜帶"');
    expect(plainValue(rows[1]!)).toBe("薑味溫潤\n小包好攜帶");
  });

  it("沒有資料就回空字串；『待補資料』是「無」代表沒有要補的", () => {
    expect(listingCsv([])).toBe("");
    expect(todoItems(rows.find((r) => r.key === "todo"))).toEqual([]);
    const withTodo = parseListingCaption(CAPTIONS[1]!, SPEC.fields);
    expect(todoItems(withTodo.find((r) => r.key === "todo"))).toEqual(["成分"]);
  });
});
