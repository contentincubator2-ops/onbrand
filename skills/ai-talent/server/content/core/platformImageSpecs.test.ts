import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  IMAGE_CHANNELS,
  PLATFORM_IMAGE_SPECS,
  canvasPromptBlock,
  gptSizeFor,
  nanoRatioFor,
  ratioError,
} from "./platformImageSpecs";
import { buildImageCardPrompt, finalizeToSpec, normalizeDirections } from "./imageCards";

describe("platform image specs", () => {
  it("ids are unique and every channel has image cards", () => {
    const ids = PLATFORM_IMAGE_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ch of IMAGE_CHANNELS) {
      expect(PLATFORM_IMAGE_SPECS.some((s) => s.channel === ch), ch).toBe(true);
    }
  });

  // 比例在生成當下鎖死：每張卡都要有一個 gpt-image-2 合法、而且比例幾乎一樣的生成尺寸。
  it.each(PLATFORM_IMAGE_SPECS.map((s) => [s.id, s] as const))("%s has a native gpt-image-2 size", (_id, s) => {
    const { w, h } = gptSizeFor(s.width, s.height);
    expect(w % 16).toBe(0);
    expect(h % 16).toBe(0);
    expect(Math.max(w, h)).toBeLessThanOrEqual(3840);
    expect(w * h).toBeGreaterThanOrEqual(655_360);
    expect(w * h).toBeLessThanOrEqual(2560 * 1440);
    expect(w / h).toBeLessThanOrEqual(3);
    expect(w / h).toBeGreaterThanOrEqual(1 / 3);
    expect(ratioError(w / h, s.width / s.height)).toBeLessThanOrEqual(0.005);
  });

  it("offers Nano Banana only where its REAL output ratio matches", () => {
    expect(nanoRatioFor(1080, 1080)).toBe("1:1");
    expect(nanoRatioFor(1040, 1560)).toBe("2:3");
    // 標籤有、但實際輸出比例差太多：9:16 回 768×1344、4:5 回 896×1152、3:4 回 864×1184。
    expect(nanoRatioFor(1080, 1920)).toBeNull();
    expect(nanoRatioFor(1080, 1350)).toBeNull();
    expect(nanoRatioFor(1080, 1440)).toBeNull();
    expect(nanoRatioFor(1200, 630)).toBeNull();
    expect(nanoRatioFor(2500, 1686)).toBeNull();
  });

  it("canvas block states the exact size, the no-crop rule and the safe zone", () => {
    const story = PLATFORM_IMAGE_SPECS.find((s) => s.id === "ig-img-story")!;
    const block = canvasPromptBlock(story);
    expect(block).toContain("1080x1920");
    expect(block).toContain("nothing will be cropped later");
    expect(block).toContain("bottom 35%");
  });
});

describe("image card prompt", () => {
  const spec = PLATFORM_IMAGE_SPECS.find((s) => s.id === "fb-img-feed-portrait")!;
  it("keeps the no-text guard when there is no product photo", () => {
    const p = buildImageCardPrompt({ spec, scenePromptEn: "a cup of coffee", brand: { brandName: "X" }, withProduct: false });
    expect(p).toContain("CANVAS (mandatory)");
    expect(p).toMatch(/NO TEXT|no text/i);
  });
  it("adds the change request and the re-compose rule when refining", () => {
    const p = buildImageCardPrompt({ spec, scenePromptEn: "s", brand: {}, withProduct: false, reference: "previous", instruction: "暖一點" });
    expect(p).toContain("CHANGE REQUEST");
    expect(p).toContain("re-compose it natively");
  });
});

describe("finalizeToSpec", () => {
  const spec = PLATFORM_IMAGE_SPECS.find((s) => s.id === "fb-img-feed-portrait")!; // 1080x1350
  const img = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#c96" } }).png().toBuffer();

  it("scales a same-ratio image to the delivery size", async () => {
    const r = await finalizeToSpec(await img(1024, 1280), spec);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const m = await sharp(r.buffer).metadata();
      expect([m.width, m.height]).toEqual([1080, 1350]);
    }
  });

  it("refuses a wrong ratio instead of cropping it", async () => {
    const r = await finalizeToSpec(await img(1024, 1024), spec);
    expect(r.ok).toBe(false);
  });

  it("compresses under a byte cap (LINE rich menu 1MB)", async () => {
    const menu = PLATFORM_IMAGE_SPECS.find((s) => s.id === "line-img-richmenu-large")!;
    const { w, h } = gptSizeFor(menu.width, menu.height);
    const noisy = await sharp(Buffer.from(Array.from({ length: w * h * 3 }, () => Math.floor(Math.random() * 256))), {
      raw: { width: w, height: h, channels: 3 },
    }).png().toBuffer();
    const r = await finalizeToSpec(noisy, menu);
    if (r.ok) expect(r.bytes).toBeLessThanOrEqual(1024 * 1024);
    else expect(r.reason).toContain("上限");
  }, 60_000);
});

describe("normalizeDirections", () => {
  it("drops incomplete directions and keeps at most three", () => {
    const out = normalizeDirections({
      headlineZh: "秋天第一杯",
      directions: [
        { titleZh: "晨光", sceneZh: "木桌", promptEn: "wooden table" },
        { titleZh: "缺 prompt", sceneZh: "x" },
        { titleZh: "b", sceneZh: "b", promptEn: "b" },
        { titleZh: "c", sceneZh: "c", promptEn: "c" },
        { titleZh: "d", sceneZh: "d", promptEn: "d" },
      ],
    }, "文案");
    expect(out.headlineZh).toBe("秋天第一杯");
    expect(out.directions.map((d) => d.titleZh)).toEqual(["晨光", "b", "c"]);
  });
});
