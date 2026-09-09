import { describe, it, expect } from "vitest";
import { buildScenePrompt, productPlacement } from "./productSceneComposer";

describe("productSceneComposer · buildScenePrompt", () => {
  it("uses the caller's scene hint when given", () => {
    const p = buildScenePrompt("淺色木紋桌面，早晨自然光");
    expect(p).toContain("淺色木紋桌面，早晨自然光");
  });

  it("falls back to a sensible default when no hint is given", () => {
    const p = buildScenePrompt(undefined);
    expect(p).toContain("neutral surface");
    const empty = buildScenePrompt("   ");
    expect(empty).toContain("neutral surface");
  });

  it("always states the no-product/no-object rule — this is a background plate, not a photo", () => {
    const p = buildScenePrompt("a marble kitchen counter");
    expect(p).toMatch(/no product/i);
    expect(p).toMatch(/no object/i);
    expect(p).toMatch(/no text/i);
    expect(p).toMatch(/no logo/i);
  });
});

describe("productSceneComposer · productPlacement", () => {
  it("centers a square product and keeps it within the height/width caps", () => {
    const p = productPlacement(1080, 1080, 800, 800);
    expect(p.width).toBeLessThanOrEqual(Math.round(1080 * 0.78));
    expect(p.height).toBeLessThanOrEqual(Math.round(1080 * 0.62));
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.left + p.width).toBeLessThanOrEqual(1080);
  });

  it("never upscales — a tiny product photo stays tiny, not stretched to fill the frame", () => {
    const p = productPlacement(1080, 1080, 100, 100);
    expect(p.width).toBe(100);
    expect(p.height).toBe(100);
  });

  it("preserves aspect ratio for a tall product (a bottle)", () => {
    const p = productPlacement(1080, 1080, 400, 1200);
    expect(Math.abs(p.width / p.height - 400 / 1200)).toBeLessThan(0.01);
  });

  it("sits low in the frame (product on a surface, not floating centered)", () => {
    const p = productPlacement(1080, 1080, 600, 600);
    const verticalCenter = p.top + p.height / 2;
    expect(verticalCenter).toBeGreaterThan(1080 / 2);
  });
});
