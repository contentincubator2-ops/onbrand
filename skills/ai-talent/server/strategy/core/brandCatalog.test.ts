/**
 * brandCatalog 的行為測試。
 *
 * 2026-09-23（CJ「不會出現：不行，我這裡沒有讀取你產品列表的功能」）：
 * 這個區塊唯一的工作是「讓 prompt 裡真的有產品清單」，所以測的是三種
 * 會讓總監講錯話的情況，它們在畫面上長得一模一樣（都是總監說不出產品）：
 *   1. 真的沒有產品 → 要說「還沒有建立任何產品」（可以接著建議去建）
 *   2. 有產品但定位沒填 → 要說「尚未填寫」（可以接著建議去填）
 *   3. 查詢爆掉 → 要明講這一輪拿不到，**不能留白**——留白會讓模型以為
 *      這個品牌沒有產品，然後很有自信地講錯話。
 */
import { describe, it, expect, vi } from "vitest";

let productRows: any[] | Error = [];
let eventRows: any[] | Error = [];

vi.mock("../../localDb.js", () => ({
  default: {
    execute: async (sql: string) => {
      if (/FROM products/.test(sql)) {
        if (productRows instanceof Error) throw productRows;
        return [productRows];
      }
      if (/FROM events/.test(sql)) {
        if (eventRows instanceof Error) throw eventRows;
        return [eventRows];
      }
      return [[]];
    },
  },
}));

const { buildBrandCatalogBlock } = await import("./brandCatalog");

const withPositioning = (id: number, name: string) => ({
  id, name,
  positioning: JSON.stringify({ core: { zhTagline: `${name}的標語`, coreStatement: `${name}的核心定位敘述` } }),
});

describe("buildBrandCatalogBlock", () => {
  it("沒有產品時明說「還沒有建立」——不是留白", async () => {
    productRows = []; eventRows = [];
    const out = await buildBrandCatalogBlock(1, 1);
    expect(out).toContain("【產品列表】這個品牌目前還沒有建立任何產品。");
    expect(out).toContain("【活動列表】這個品牌目前還沒有建立任何活動。");
  });

  it("有產品就把名稱、id、Slogan、核心定位放進去", async () => {
    productRows = [withPositioning(11, "晨光筆記本")]; eventRows = [];
    const out = await buildBrandCatalogBlock(1, 1);
    expect(out).toContain("【產品列表】共 1 個");
    expect(out).toContain("晨光筆記本");
    expect(out).toContain("產品 id 11");
    expect(out).toContain("Slogan：晨光筆記本的標語");
    expect(out).toContain("核心定位：晨光筆記本的核心定位敘述");
  });

  it("產品有資料列但定位沒填 → 說「尚未建立/尚未填寫」，不是靜默空白", async () => {
    productRows = [
      { id: 12, name: "無定位產品", positioning: null },
      { id: 13, name: "空殼定位產品", positioning: JSON.stringify({ core: {} }) },
    ];
    eventRows = [];
    const out = await buildBrandCatalogBlock(1, 1);
    expect(out).toContain("無定位產品");
    expect(out).toContain("定位資料：尚未建立");
    expect(out).toContain("空殼定位產品");
    expect(out).toContain("定位資料：有，但核心欄位尚未填寫");
  });

  it("產品很多時前 12 個列細節、其餘只列名字（控 prompt 長度）", async () => {
    productRows = Array.from({ length: 15 }, (_, i) => withPositioning(100 + i, `產品${i + 1}`));
    eventRows = [];
    const out = await buildBrandCatalogBlock(1, 1);
    expect(out).toContain("【產品列表】共 15 個");
    expect(out).toContain("12. 產品12");
    expect(out).toContain("其餘 3 個：產品13、產品14、產品15");
    expect(out).not.toContain("13. 產品13");
  });

  it("查詢爆掉時明講「拿不到」——留白會讓模型以為這個品牌沒有產品", async () => {
    productRows = new Error("db down"); eventRows = [];
    const out = await buildBrandCatalogBlock(1, 1);
    expect(out).toContain("讀取產品清單時發生錯誤");
    expect(out).toContain("不要猜");
    // 產品爆掉不該把活動那段一起拖下水
    expect(out).toContain("【活動列表】");
  });

  it("活動列出期間；沒設期間就說未設定，不是空白或 Invalid Date", async () => {
    productRows = [];
    eventRows = [
      { id: 21, name: "週年慶", startAt: "2026-10-01T00:00:00.000Z", endAt: "2026-10-31T00:00:00.000Z", positioning: null },
      { id: 22, name: "沒排期活動", startAt: null, endAt: null, positioning: null },
    ];
    const out = await buildBrandCatalogBlock(1, 1);
    expect(out).toContain("週年慶（活動 id 21，2026-10-01 ~ 2026-10-31）");
    expect(out).toContain("沒排期活動（活動 id 22，未設定期間）");
    expect(out).not.toContain("Invalid Date");
  });

  it("定位是物件（驅動已經 parse 過）也要吃得下，不是只吃字串", async () => {
    productRows = [{ id: 31, name: "物件定位", positioning: { core: { zhTagline: "直接是物件" } } }];
    eventRows = [];
    const out = await buildBrandCatalogBlock(1, 1);
    expect(out).toContain("Slogan：直接是物件");
  });
});

// 2026-09-25（CJ「明明我在此產品中，有寫價格，但是產品顧問，還是重複問我價格」）：
// 售價是 positioning 頂層的 `price`，不在任何 canonical segment 裡——清單原本只讀
// core.*，所以定價策略師在畫面寫著 NT$560 的情況下還反問售價。
describe("產品清單要帶得出使用者在卡片上看得到的東西", () => {
  it("售價／USP／主客群都要進清單", async () => {
    productRows = [{
      id: 263, name: "美國橫膈牛排",
      positioning: JSON.stringify({
        price: "NT$560",
        core: { zhTagline: "燒肉店的香，今晚在你家" },
        competition: { uniqueUsp: "不修油、不預醃" },
        audience: { primary: "25–45 歲的忙碌都市上班族" },
      }),
    }];
    eventRows = [];
    const out = await buildBrandCatalogBlock(1, 1);
    expect(out).toContain("售價：NT$560");
    expect(out).toContain("USP：不修油、不預醃");
    expect(out).toContain("主客群：25–45 歲的忙碌都市上班族");
  });

  it("舊資料放在別的路徑也撈得到（usp 頂層、targetAudience 頂層）", async () => {
    productRows = [{ id: 9, name: "舊資料產品", positioning: JSON.stringify({ usp: "頂層的賣點", targetAudience: "頂層的客群" }) }];
    eventRows = [];
    const out = await buildBrandCatalogBlock(1, 1);
    expect(out).toContain("USP：頂層的賣點");
    expect(out).toContain("主客群：頂層的客群");
    // 有東西可講就不該再說「尚未填寫」
    expect(out).not.toContain("尚未填寫");
  });

  it("沒有售價就不要生一行空的「售價：」出來", async () => {
    productRows = [{ id: 10, name: "沒填價的產品", positioning: JSON.stringify({ core: { zhTagline: "標語" } }) }];
    eventRows = [];
    const out = await buildBrandCatalogBlock(1, 1);
    expect(out).not.toContain("售價：");
  });
});
