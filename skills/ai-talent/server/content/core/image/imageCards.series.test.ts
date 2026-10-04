/**
 * 2026-10-04（CJ「張數可以讓用戶選，AI 再提供每一張的建議」）：整組（輪播／相簿）規劃。
 * 數量一定要恰好是用戶選的張數；對不上就整批當失敗，不補假內容。
 */
import { describe, expect, it, vi } from "vitest";

const seen: any[] = [];
let reply: any = { slides: [] };
vi.mock("../../../platform/core/llm/llm", () => ({
  invokeLLM: async (req: any) => {
    seen.push(req);
    return { choices: [{ message: { content: JSON.stringify(reply) } }] };
  },
}));

import { buildImageCardPrompt, directionsSystemPrompt, normalizeSeriesSlides, planSeriesSlides, seriesSystemPrompt } from "./imageCards";

const spec: any = { labelZh: "輪播貼文", width: 1080, height: 1350, compositionEn: "vertical 4:5" };
const slide = (n: number) => ({ roleZh: `角色${n}`, titleZh: `標題${n}`, sceneZh: `畫面${n}`, promptEn: `scene ${n}` });
const direction = { titleZh: "晨光", sceneZh: "木桌晨光", paletteZh: "暖米色", promptEn: "morning light on a wooden table" };

describe("normalizeSeriesSlides", () => {
  it("張數夠就截成剛好 count 張", () => {
    expect(normalizeSeriesSlides({ slides: [1, 2, 3, 4].map(slide) }, 3)).toHaveLength(3);
  });
  it("張數不夠（或有缺欄位被丟掉）回空，不補假內容", () => {
    expect(normalizeSeriesSlides({ slides: [slide(1), slide(2)] }, 3)).toEqual([]);
    expect(normalizeSeriesSlides({ slides: [slide(1), { titleZh: "只有標題" }, slide(3)] }, 3)).toEqual([]);
    expect(normalizeSeriesSlides(null, 2)).toEqual([]);
  });
});

describe("planSeriesSlides", () => {
  it("把張數、方向與文案都帶進 prompt，並回傳規劃", async () => {
    seen.length = 0; reply = { slides: [1, 2, 3].map(slide) };
    const out = await planSeriesSlides({ spec, copy: "第一點。第二點。第三點。", count: 3, direction, brand: { brandName: "B" } as any });
    expect(out).toHaveLength(3);
    const sys = seen[0].messages.find((m: any) => m.role === "system").content;
    const user = seen[0].messages.find((m: any) => m.role === "user").content;
    expect(sys).toContain("恰好 3 張");
    expect(user).toContain("晨光");
    expect(user).toContain("第二點");
  });
  it("AI 規劃的張數對不上就丟錯", async () => {
    reply = { slides: [slide(1)] };
    await expect(planSeriesSlides({ spec, copy: "文案", count: 3, direction, brand: {} as any })).rejects.toThrow("3 張");
  });
});

describe("prompt", () => {
  it("2 張時系統 prompt 講明封面＋收尾", () => {
    expect(seriesSystemPrompt(spec, 2, false)).toContain("封面＋收尾");
  });
  it("提方向時，組圖要求方向能貫穿整組；單張不提", () => {
    expect(directionsSystemPrompt(spec, false, 5)).toContain("一組 5 張");
    expect(directionsSystemPrompt(spec, false)).not.toContain("一組");
  });
  it("style 參考：只借風格、不抄主體；previous 才要求保持同一主體", () => {
    const base = { spec, scenePromptEn: "a new scene", brand: {} as any, withProduct: false };
    const style = buildImageCardPrompt({ ...base, reference: "style" });
    expect(style).toContain("slide 1 of a multi-image set");
    expect(style).toContain("Do NOT copy its subject");
    const prev = buildImageCardPrompt({ ...base, reference: "previous" });
    expect(prev).toContain("previous version");
    expect(prev).not.toContain("multi-image set");
  });
});
