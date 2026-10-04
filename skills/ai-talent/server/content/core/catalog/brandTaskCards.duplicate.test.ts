/**
 * duplicateCard —— 把自建卡複製一份（可換通路）。2026-10-04「我的任務卡」的「複製到…」。
 */
import { describe, expect, it } from "vitest";
import { duplicateCard, CARD_ID_RE, type BrandTaskCard } from "./brandTaskCards";

const source: BrandTaskCard = {
  id: "u7-promo", brandId: 7, name: "促購文", channel: "facebook",
  status: "ready", currentStep: 3, totalSteps: 3, lastError: null,
  samples: ["範例一範例一範例一範例一範例一範例一範例一"],
  primaryQuestion: "這次要推什麼？", primaryPlaceholder: "例：薑茶",
  askFields: [{ key: "price", label: "售價", type: "text", required: false, placeholder: "" }],
  skill: "開頭用問句。結尾放 CTA。", measured: { count: 1, minChars: 40, maxChars: 120, medianChars: 80 },
  variants: 2, agentId: 123, scene: "shop",
  illustrationUrl: "/covers/u7-promo.webp", illustrationStatus: "ready",
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z", createdBy: 1,
  lastDryRun: { at: "2026-09-02T00:00:00.000Z", caption: "試寫內容" },
};

describe("duplicateCard", () => {
  it("換通路：沿用原名、SKILL 與範例整份帶過去、狀態跟原卡", () => {
    const c = duplicateCard(source, [source], { channel: "instagram", userId: 9, now: "2026-10-04T00:00:00.000Z" });
    expect(c.channel).toBe("instagram");
    expect(c.name).toBe("促購文");
    expect(c.skill).toBe(source.skill);
    expect(c.samples).toEqual(source.samples);
    expect(c.measured).toEqual(source.measured);
    expect(c.askFields).toEqual(source.askFields);
    expect(c.status).toBe("ready");
    expect(c.createdBy).toBe(9);
    expect(c.createdAt).toBe("2026-10-04T00:00:00.000Z");
  });

  it("同通路：名字加「（副本）」，才分得出哪張是哪張", () => {
    expect(duplicateCard(source, [source], { channel: "facebook", userId: 1 }).name).toBe("促購文（副本）");
  });

  it("id 是合法的自建卡 id、屬於同一個品牌、不跟現有的撞", () => {
    const first = duplicateCard(source, [source], { channel: "instagram", name: "promo", userId: 1 });
    expect(first.id).toBe("u7-promo-2");                       // u7-promo 已經被原卡用掉
    expect(CARD_ID_RE.test(first.id)).toBe(true);
    const second = duplicateCard(source, [source, first], { channel: "line", name: "promo", userId: 1 });
    expect(second.id).toBe("u7-promo-3");
  });

  it("試寫紀錄與替原卡畫的插畫不帶；現成場景帶", () => {
    const c = duplicateCard(source, [source], { channel: "line", userId: 1 });
    expect(c.lastDryRun).toBeNull();
    expect(c.illustrationUrl).toBeUndefined();
    expect(c.scene).toBe("shop");
  });

  it("原卡還沒上架（或沒有 SKILL），副本也不上架", () => {
    expect(duplicateCard({ ...source, status: "drafting" }, [source], { channel: "line", userId: 1 }).status).toBe("drafting");
    expect(duplicateCard({ ...source, skill: "" }, [source], { channel: "line", userId: 1 }).status).toBe("drafting");
  });

  it("副本是獨立的：改副本的範例或欄位不會動到原卡", () => {
    const c = duplicateCard(source, [source], { channel: "line", userId: 1 });
    c.samples.push("新的");
    c.askFields[0]!.label = "改過";
    expect(source.samples).toHaveLength(1);
    expect(source.askFields[0]!.label).toBe("售價");
  });
});
