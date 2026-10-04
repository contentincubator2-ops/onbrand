/**
 * 商品頁卡（電商／開店平台 tray 底下的卡）：卡 → template/config 要掛上欄位規格、
 * 拿掉整篇字數限制；複製時格式要跟著走。
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../localDb", () => ({ default: { execute: vi.fn() } }));

import { cardTemplate, cardConfig, duplicateCard, listingSpecOf, type BrandTaskCard } from "./brandTaskCards";
import { isListingTemplate, TODO_FIELD_KEY } from "../engine/listingContract";

const base: BrandTaskCard = {
  id: "u7-momo", brandId: 7, name: "momo 商品頁", channel: "c7-momo",
  status: "ready", currentStep: 3, totalSteps: 3, lastError: null,
  samples: ["商品頁範例商品頁範例商品頁範例商品頁範例商品頁範例"],
  primaryQuestion: "這次要寫哪個商品？", primaryPlaceholder: "",
  askFields: [], skill: "標題先寫品牌再寫品名。", measured: { count: 1, minChars: 40, maxChars: 900, medianChars: 500 },
  variants: 1, agentId: null,
  createdAt: "2026-10-04T00:00:00.000Z", updatedAt: "2026-10-04T00:00:00.000Z", createdBy: 1, lastDryRun: null,
};
const listingCard: BrandTaskCard = {
  ...base, format: "listing",
  listingFields: [{ key: "title", label: "商品標題", kind: "text", maxChars: 60 }, { key: "bullets", label: "賣點條列", kind: "bullets" }],
};

describe("商品頁卡", () => {
  it("template 掛上欄位規格（自動補上『待補資料』在最後）；貼文卡沒有", () => {
    const t = cardTemplate(listingCard);
    expect(isListingTemplate(t)).toBe(true);
    const labels = t.listingSpec!.fields.map((f) => f.label);
    expect(labels).toEqual(["商品標題", "賣點條列", "待補資料"]);
    expect(t.listingSpec!.fields.at(-1)!.key).toBe(TODO_FIELD_KEY);
    expect(t.listingSpec!.fields[0]!.maxChars).toBe(60);
    expect(isListingTemplate(cardTemplate(base))).toBe(false);
  });

  it("沒存欄位的商品頁卡用預設欄位", () => {
    const spec = listingSpecOf({ format: "listing" });
    expect(spec!.fields.map((f) => f.label)).toContain("商品描述");
    expect(listingSpecOf({})).toBeNull();
  });

  it("config 不帶整篇字數（≤60 字的第一行截斷會把整份欄位壓成一句）；貼文卡照舊", () => {
    const c = cardConfig(listingCard) as any;
    expect(c.captionMinChars).toBeUndefined();
    expect(c.captionMaxChars).toBeUndefined();
    const post = cardConfig({ ...base, channel: "facebook" }) as any;
    expect(post.captionMaxChars).toBeGreaterThan(0);
  });

  it("maxTokens 下限放寬：短範例也要寫得完五六個欄位", () => {
    const short = { ...listingCard, measured: { count: 1, minChars: 40, maxChars: 80, medianChars: 60 } };
    expect(cardTemplate(short).maxTokens).toBeGreaterThanOrEqual(2200);
    expect(cardTemplate({ ...base, measured: short.measured }).maxTokens).toBeLessThan(2200);
  });

  it("複製：格式與欄位整份帶過去（且是副本，不共用陣列）", () => {
    const c = duplicateCard(listingCard, [listingCard], { channel: "c7-shopee", userId: 2 });
    expect(c.format).toBe("listing");
    expect(c.listingFields).toEqual(listingCard.listingFields);
    expect(c.listingFields).not.toBe(listingCard.listingFields);
    expect(duplicateCard(base, [base], { channel: "facebook", userId: 2 }).format).toBeUndefined();
  });
});
