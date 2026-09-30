import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { illustrationPrompt, parseConcepts, ILLUSTRATION_STYLE, fitToFrame, FRAME_W, FRAME_H } from "./taskIllustration";

describe("任務卡插畫 prompt", () => {
  it("畫風固定在前、概念接在後，而且明講不准有字", () => {
    const p = illustrationPrompt("  a clumsy robot bowing  ");
    expect(p.startsWith(ILLUSTRATION_STYLE)).toBe(true);
    expect(p.endsWith("Scene: a clumsy robot bowing")).toBe(true);
    expect(ILLUSTRATION_STYLE).toMatch(/no text/i);
    expect(ILLUSTRATION_STYLE).toContain("#E85D2E");
  });

  it("概念 JSON：只收要的 id、太短的丟掉、前後有雜字也解得出來", () => {
    const text = 'Sure!\n{"concepts":{"a":"two speech bubbles meeting over a gift box","b":"hi","z":"not asked for at all here"}}\nthanks';
    expect(parseConcepts(text, ["a", "b", "c"])).toEqual({ a: "two speech bubbles meeting over a gift box" });
    expect(parseConcepts("no json", ["a"])).toEqual({});
  });
});

describe("插畫裁成內容填滿框", () => {
  it("小小一顆主體被放大到框裡，輸出固定 480x340，而且主體沒被切掉", async () => {
    // 1536x1024 淺藍底，中間偏左下一個 100x100 的深藍方塊
    const bg = { r: 237, g: 242, b: 249 };
    const src = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: bg } })
      .composite([{ input: await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 31, g: 42, b: 68 } } }).png().toBuffer(), left: 500, top: 600 }])
      .png().toBuffer();
    const out = await fitToFrame(src);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([FRAME_W, FRAME_H]);
    let dark = 0, edgeDark = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] < 90) { dark++; if (x < 3 || y < 3 || x > info.width - 4 || y > info.height - 4) edgeDark++; }
    }
    expect(dark / (info.width * info.height)).toBeGreaterThan(0.2); // 原圖只佔 0.6%
    expect(edgeDark).toBe(0);
  });
});

