/**
 * listingContract.test — 商品頁（電商／開店平台 tray）欄位合約。
 *
 * 這條合約要擋的失敗都是「結構」：欄位標題被擠在同一行、條列黏成一行、JSON 外殼漏出來、
 * 超過平台上限被截成半句話。所以這裡用的是模型真的會吐出來的壞樣子，不是理想輸入。
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_LISTING_FIELDS, TODO_FIELD_KEY, sanitizeListingFields, isListingTemplate, parseListing,
  normalizeListing, validateListing, repairListing, buildListingRule, fieldLength, bulletItems,
  listingRetryReminder, type ListingSpec,
} from "./listingContract";

const SPEC: ListingSpec = { fields: sanitizeListingFields(DEFAULT_LISTING_FIELDS) };
const GOOD = [
  "【商品標題】",
  "薑母茶暖身沖泡 10 入",
  "",
  "【賣點條列】",
  "・薑味溫潤不辛辣",
  "・獨立小包方便攜帶",
  "",
  "【規格資訊】",
  "・內容量：依當次輸入",
  "・保存期限：請看包裝",
  "",
  "【商品描述】",
  "天冷的早晨，泡一杯。",
  "",
  "【搜尋關鍵字】",
  "薑母茶、暖身",
  "",
  "【待補資料】",
  "・成分比例",
].join("\n");

describe("sanitizeListingFields", () => {
  it("沒給＝預設欄位，且『待補資料』永遠在最後", () => {
    const f = sanitizeListingFields(undefined);
    expect(f.map((x) => x.label)).toEqual(["商品標題", "賣點條列", "規格資訊", "商品描述", "搜尋關鍵字", "待補資料"]);
    expect(f[f.length - 1]!.key).toBe(TODO_FIELD_KEY);
  });

  it("去掉空標題與重複標題、拿掉【】與換行、限制數量與上限", () => {
    const f = sanitizeListingFields([
      { label: "標題", kind: "text", maxChars: 60 },
      { label: "標題", kind: "text" },
      { label: "", kind: "text" },
      { label: "【賣點】\n", kind: "bullets", maxChars: -5 },
      { label: "描述", kind: "nope", maxChars: 999999 },
    ]);
    expect(f.map((x) => x.label)).toEqual(["標題", "賣點", "描述", "待補資料"]);
    expect(f[0]!.maxChars).toBe(60);
    expect(f[1]!.maxChars).toBeUndefined();
    expect(f[2]!.kind).toBe("text");
    expect(f[2]!.maxChars).toBe(5000);
    const many = sanitizeListingFields(Array.from({ length: 30 }, (_, i) => ({ label: `欄${i}`, kind: "text" })));
    expect(many.length).toBeLessThanOrEqual(10);
    expect(many[many.length - 1]!.key).toBe(TODO_FIELD_KEY);
  });

  it("用戶不能自己加一個 todo 欄位（key 保留給『待補資料』）", () => {
    const f = sanitizeListingFields([{ key: "todo", label: "我的待辦", kind: "text" }, { label: "標題", kind: "text" }]);
    expect(f.filter((x) => x.key === TODO_FIELD_KEY).length).toBe(1);
    expect(f.some((x) => x.label === "我的待辦")).toBe(false);
  });
});

describe("parse / normalize / validate", () => {
  it("標準輸出：解析出每個欄位並通過驗證", () => {
    const p = parseListing(GOOD, SPEC);
    expect(p.fields.map((f) => f.value != null)).toEqual([true, true, true, true, true, true]);
    expect(p.fields[0]!.value).toBe("薑母茶暖身沖泡 10 入");
    expect(validateListing(normalizeListing(GOOD, SPEC), SPEC)).toBeNull();
  });

  it("欄位標題擠在同一行、條列黏成一行、帶 JSON 外殼 → 正規化後仍合格", () => {
    const messy = '```json\n{"caption":"' + GOOD.replace(/\n/g, "\\n").replace("【賣點條列】\\n・薑味溫潤不辛辣\\n・獨立小包方便攜帶", "【賣點條列】\\n・薑味溫潤不辛辣・獨立小包方便攜帶").replace("\\n\\n【規格資訊】", "【規格資訊】") + '","hashtags":[]}\n```';
    const n = normalizeListing(messy, SPEC);
    expect(n.startsWith("【商品標題】")).toBe(true);
    const issue = validateListing(n, SPEC);
    // 條列黏成一行只剩 1 條 → 要被抓到，而不是默默放行
    expect(issue?.reason).toBe("too_few_items");
  });

  it("標題與內容在同一行（【商品標題】xxx）也能解析", () => {
    const p = parseListing("【商品標題】薑母茶\n【賣點條列】\n・a\n・b", { fields: sanitizeListingFields([{ label: "商品標題", kind: "text" }, { label: "賣點條列", kind: "bullets" }]) });
    expect(p.fields[0]!.value).toBe("薑母茶");
    expect(bulletItems(p.fields[1]!.value!)).toEqual(["a", "b"]);
  });

  it("缺欄位 → missing_field，並點名缺哪個", () => {
    const bad = GOOD.replace(/【搜尋關鍵字】\n薑母茶、暖身\n\n/, "");
    const issue = validateListing(normalizeListing(bad, SPEC), SPEC);
    expect(issue?.reason).toBe("missing_field");
    expect(issue?.detail).toContain("搜尋關鍵字");
  });

  it("空欄位 → empty_field；『待補資料』可以是空的或『無』", () => {
    const empty = GOOD.replace("天冷的早晨，泡一杯。", "");
    expect(validateListing(normalizeListing(empty, SPEC), SPEC)?.reason).toBe("empty_field");
    const noTodo = GOOD.replace("・成分比例", "無");
    expect(validateListing(normalizeListing(noTodo, SPEC), SPEC)).toBeNull();
  });

  it("hashtag → has_hashtags", () => {
    const tagged = GOOD.replace("薑母茶、暖身", "薑母茶 #暖身");
    expect(validateListing(normalizeListing(tagged, SPEC), SPEC)?.reason).toBe("has_hashtags");
  });

  it("不在 spec 裡的【…】行當內容，不會把欄位切斷", () => {
    const withNote = GOOD.replace("天冷的早晨，泡一杯。", "天冷的早晨，泡一杯。\n【注意】請勿與藥物併用");
    const p = parseListing(withNote, SPEC);
    expect(p.fields.find((f) => f.key === "description")!.value).toContain("【注意】請勿與藥物併用");
  });

  it("同一個欄位出現兩次，只取第一次", () => {
    const dup = GOOD + "\n\n【商品標題】\n另一個標題";
    expect(parseListing(dup, SPEC).fields[0]!.value).toBe("薑母茶暖身沖泡 10 入");
  });
});

describe("字數上限：驗證但絕不截斷", () => {
  const withLimit: ListingSpec = { fields: sanitizeListingFields([
    { label: "商品標題", kind: "text", maxChars: 8 },
    { label: "賣點條列", kind: "bullets" },
  ]) };
  const caption = "【商品標題】\n薑母茶暖身沖泡十入裝\n\n【賣點條列】\n・a\n・b\n\n【待補資料】\n無";

  it("超過上限 → over_limit，訊息點名欄位、字數、上限", () => {
    const issue = validateListing(normalizeListing(caption, withLimit), withLimit);
    expect(issue?.reason).toBe("over_limit");
    expect(issue?.detail).toMatch(/商品標題.*上限 8/);
  });

  it("最後一次修補：照實出貨，超長的標題原樣保留（不被切成半句）", () => {
    const repaired = repairListing(caption, withLimit);
    expect(repaired).toContain("薑母茶暖身沖泡十入裝");
    const p = parseListing(repaired, withLimit);
    expect(p.fields[0]!.over).toBe(true);
    expect(p.fields[0]!.length).toBe(10);
  });

  it("條列字數不算符號與換行", () => {
    expect(fieldLength({ kind: "bullets" }, "・ab\n・cd")).toBe(4);
    expect(fieldLength({ kind: "long" }, "ab\ncd")).toBe(4);
  });
});

describe("合約本文", () => {
  it("列出每個欄位、上限、『待補資料』的用途，並明講例外於社群骨架與禁用佔位符", () => {
    const rule = buildListingRule({ fields: sanitizeListingFields([{ label: "商品標題", kind: "text", maxChars: 60 }]) });
    expect(rule).toContain("【商品標題】");
    expect(rule).toContain("上限 60 字");
    expect(rule).toContain("【待補資料】");
    expect(rule).toMatch(/例外/);
    expect(rule).toMatch(/hashtag/);
    expect(rule).toMatch(/不寫、不推測、不編造/);
  });

  it("重試提醒點名違反的內容", () => {
    expect(listingRetryReminder("缺少欄位「商品標題」")).toContain("缺少欄位「商品標題」");
  });

  it("isListingTemplate 只認 listingSpec", () => {
    expect(isListingTemplate({ listingSpec: SPEC })).toBe(true);
    expect(isListingTemplate({})).toBe(false);
    expect(isListingTemplate({ listingSpec: { fields: [] } })).toBe(false);
  });
});
