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

import { buildImageCardPrompt, directionsSystemPrompt, normalizeSeriesSlides, planSeriesSlides, proposeImageDirections, seriesSystemPrompt, withSubjectImage } from "./imageCards";

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

describe("主體照片要讓 AI 真的看到（CJ「上傳了照片，三個方向都沒有用到」）", () => {
  it("withSubjectImage：有圖附上 image_url，沒圖維持純文字", () => {
    expect(withSubjectImage("hi")).toBe("hi");
    const m = withSubjectImage("hi", "data:image/jpeg;base64,AAAA");
    expect(m[0]).toEqual({ type: "text", text: "hi" });
    expect(m[1].image_url.url).toContain("base64");
  });
  it("提方向：附了照片，圖進使用者訊息、系統 prompt 要求以主體為主角（即使不是產品清單的產品）", async () => {
    seen.length = 0; reply = { headlineZh: "標題", directions: [{ id: "a", titleZh: "方向", sceneZh: "場景", paletteZh: "色", whyZh: "因", promptEn: "scene" }] };
    await proposeImageDirections({ spec, copy: "文案", brand: {} as any, subjectImageDataUrl: "data:image/jpeg;base64,AAAA" });
    const sys = seen[0].messages.find((m: any) => m.role === "system").content;
    const user = seen[0].messages.find((m: any) => m.role === "user").content;
    expect(sys).toContain("以這個主體為主角");
    expect(Array.isArray(user) && user.some((p: any) => p.type === "image_url")).toBe(true);
  });
  it("沒附照片：維持純文字、不提主體", async () => {
    seen.length = 0;
    await proposeImageDirections({ spec, copy: "文案", brand: {} as any });
    expect(typeof seen[0].messages.find((m: any) => m.role === "user").content).toBe("string");
    expect(seen[0].messages.find((m: any) => m.role === "system").content).not.toContain("以這個主體為主角");
  });
});

describe("fitPhotoToCard：原圖直接用（不經 AI）", () => {
  it("cover 與 contain 都剛好輸出這張卡的交付尺寸", async () => {
    const { mkdtempSync, readFileSync } = await import("fs");
    const { tmpdir } = await import("os");
    const { join } = await import("path");
    const dir = mkdtempSync(join(tmpdir(), "imgcard-"));
    process.env.COVERS_DIR = dir;
    process.env.COVERS_URL_PREFIX = "/static/covers";
    vi.resetModules();
    const { fitPhotoToCard } = await import("./imageCards");
    const sharp = (await import("sharp")).default;
    // 橫式 300×200 的照片放進 4:5 直式畫布。
    const photo = await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 200, g: 40, b: 40 } } }).png().toBuffer();
    const card: any = { id: "ig-test", width: 1080, height: 1350, format: "jpeg", maxImages: 1, compose: undefined };
    for (const fit of ["cover", "contain"] as const) {
      const r = await fitPhotoToCard({ buffer: photo, spec: card, fit });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const file = join(dir, r.url.split("/").pop()!);
      const meta = await sharp(readFileSync(file)).metadata();
      expect([meta.width, meta.height]).toEqual([1080, 1350]);
    }
  }, 60_000);
  it("讀不出來的檔案回失敗，不丟例外", async () => {
    const { fitPhotoToCard } = await import("./imageCards");
    const r = await fitPhotoToCard({ buffer: Buffer.from("not an image"), spec: { width: 100, height: 100, format: "jpeg" } as any, fit: "cover" });
    expect(r.ok).toBe(false);
  });
});

describe("畫面樣式與純色底（CJ「底圖的樣式要多點選擇」）", () => {
  it("樣式清單 id 不重複，且每個都有名稱與 prompt", async () => {
    const { IMAGE_STYLES } = await import("./imageStyles");
    expect(IMAGE_STYLES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(IMAGE_STYLES.map((s) => s.id)).size).toBe(IMAGE_STYLES.length);
    for (const s of IMAGE_STYLES) { expect(s.labelZh && s.labelEn && s.promptEn).toBeTruthy(); }
  });
  it("指定樣式會進 prompt；沒指定就沒有；重新上風格的參考圖寫明保留內容", () => {
    const base = { spec, scenePromptEn: "a scene", brand: {} as any, withProduct: false };
    expect(buildImageCardPrompt({ ...base, styleId: "watercolor" })).toContain("ART STYLE");
    expect(buildImageCardPrompt({ ...base, styleId: "watercolor" })).toContain("watercolour");
    expect(buildImageCardPrompt(base)).not.toContain("ART STYLE");
    expect(buildImageCardPrompt({ ...base, styleId: "film", reference: "restyle" })).toContain("Keep the same subject, scene content and composition");
    expect(buildImageCardPrompt({ ...base, styleId: "不存在的樣式" })).not.toContain("ART STYLE");
  });
  it("用戶的風格參考圖：只學畫風、不照抄內容，且不再疊預設樣式", () => {
    const base = { spec, scenePromptEn: "a doctor at a desk", brand: {} as any, withProduct: false };
    expect(buildImageCardPrompt(base)).not.toContain("STYLE REFERENCE");
    const one = buildImageCardPrompt({ ...base, styleRefCount: 1, styleId: "watercolor" });
    expect(one).toContain("The attached image is a STYLE REFERENCE");
    expect(one.indexOf("STYLE REFERENCE")).toBeLessThan(one.indexOf("CANVAS"));
    expect(one).toContain("FINAL CHECK — style");
    expect(one).toContain("do NOT copy its subject");
    expect(one).not.toContain("ART STYLE (applies");
    // 有產品照時要講清楚哪一張是主體、哪幾張是風格參考。
    const withPhoto = buildImageCardPrompt({ ...base, withProduct: true, styleRefCount: 2 });
    expect(withPhoto).toContain("Images 2–3 are STYLE REFERENCES");
    expect(withPhoto).toContain("Image 1 is the REAL product/subject photo");
    expect(withPhoto).toContain("stays exactly as photographed");
    // 照參考圖重畫：內容與構圖留著，只換畫風。
    const restyle = buildImageCardPrompt({ ...base, reference: "restyle", styleRefCount: 1 });
    expect(restyle).toContain("Image 1 is the current visual. Image 2 is a STYLE REFERENCE");
    expect(restyle).toContain("change only how it is rendered");
  });
  it("帶產品照時樣式要提醒主體保真", () => {
    const p = buildImageCardPrompt({ spec, scenePromptEn: "s", brand: {} as any, withProduct: true, styleId: "illustration" });
    expect(p).toContain("faithful");
  });
  it("solidBackgroundForCard：單色與漸層都輸出交付尺寸；顏色格式不對直接拒絕", async () => {
    const { mkdtempSync, readFileSync } = await import("fs");
    const { tmpdir } = await import("os");
    const { join } = await import("path");
    const dir = mkdtempSync(join(tmpdir(), "imgcard-solid-"));
    process.env.COVERS_DIR = dir;
    process.env.COVERS_URL_PREFIX = "/static/covers";
    vi.resetModules();
    const { solidBackgroundForCard } = await import("./imageCards");
    const sharp = (await import("sharp")).default;
    const card: any = { id: "ig-test", width: 1080, height: 1350, format: "jpeg", maxImages: 1 };
    for (const c2 of [undefined, "#F5EFE6"]) {
      const r = await solidBackgroundForCard({ spec: card, color: "#F26522", color2: c2 });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const meta = await sharp(readFileSync(join(dir, r.url.split("/").pop()!))).metadata();
      expect([meta.width, meta.height]).toEqual([1080, 1350]);
    }
    expect((await solidBackgroundForCard({ spec: card, color: "red" })).ok).toBe(false);
    expect((await solidBackgroundForCard({ spec: card, color: "#FFFFFF", color2: "#zzzzzz" })).ok).toBe(false);
  }, 60_000);
});
