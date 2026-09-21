import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { assessCutout } from "./cutoutQuality";

const SIZE = 400;

/** 用 SVG 畫一張帶透明背景的合成遮罩，再轉成 PNG——不用真實照片。 */
async function shape(svgBody: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">${svgBody}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("assessCutout", () => {
  it("乾淨的單一物件：ok，沒有任何提醒", async () => {
    const a = await assessCutout(await shape(`<circle cx="200" cy="200" r="110" fill="#c33"/>`));
    expect(a.ok).toBe(true);
    expect(a.issues).toEqual([]);
  });

  it("整張都不透明（背景根本沒去掉）→ 硬性失敗 nothing_removed", async () => {
    const a = await assessCutout(await shape(`<rect width="${SIZE}" height="${SIZE}" fill="#eee"/>`));
    expect(a.ok).toBe(false);
    expect(a.issues).toEqual(["nothing_removed"]);
  });

  it("整張都透明（產品被去光）→ 硬性失敗 nothing_kept", async () => {
    const a = await assessCutout(await shape(""));
    expect(a.ok).toBe(false);
    expect(a.issues).toEqual(["nothing_kept"]);
  });

  it("沒有 alpha 通道的原圖（passthrough）視為 nothing_removed", async () => {
    const jpg = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#ddd" } }).jpeg().toBuffer();
    expect((await assessCutout(jpg)).issues).toEqual(["nothing_removed"]);
  });

  it("碎成兩塊大小相近的物件 → 軟性提醒 fragmented，但仍 ok", async () => {
    const a = await assessCutout(await shape(
      `<circle cx="110" cy="200" r="70" fill="#333"/><circle cx="290" cy="200" r="70" fill="#333"/>`,
    ));
    expect(a.ok).toBe(true);
    expect(a.issues).toContain("fragmented");
  });

  it("產品貼到照片邊緣 → 軟性提醒 cropped_at_edge", async () => {
    const a = await assessCutout(await shape(`<rect x="0" y="120" width="400" height="160" fill="#333"/>`));
    expect(a.ok).toBe(true);
    expect(a.issues).toContain("cropped_at_edge");
  });

  it("大面積半透明（毛邊、光暈、玻璃）→ 軟性提醒 fuzzy_edges", async () => {
    const a = await assessCutout(await shape(
      `<circle cx="200" cy="200" r="60" fill="#333"/><circle cx="200" cy="200" r="150" fill="#333" fill-opacity="0.5"/>`,
    ));
    expect(a.issues).toContain("fuzzy_edges");
  });

  it("小雜點不會讓一個正常物件被判成碎裂", async () => {
    const a = await assessCutout(await shape(`<circle cx="200" cy="200" r="120" fill="#333"/><circle cx="20" cy="20" r="2" fill="#333"/>`));
    expect(a.issues).not.toContain("fragmented");
  });
});
