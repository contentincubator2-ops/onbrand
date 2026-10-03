import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  IMAGE_CHANNELS,
  PLATFORM_IMAGE_SPECS,
  MAX_IMAGE_TRAY,
  canvasPromptBlock,
  defaultImageTray,
  generationSize,
  gptSizeFor,
  nanoRatioFor,
  ratioError,
  resolveImageTray,
} from "./platformImageSpecs";
import { buildImageCardPrompt, finalizeToSpec, normalizeDirections } from "../../../content/core/image/imageCards";

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
    const gen = generationSize(s);
    const { w, h } = gptSizeFor(gen.width, gen.height);
    expect(w % 16).toBe(0);
    expect(h % 16).toBe(0);
    expect(Math.max(w, h)).toBeLessThanOrEqual(3840);
    expect(w * h).toBeGreaterThanOrEqual(655_360);
    expect(w * h).toBeLessThanOrEqual(2560 * 1440);
    expect(w / h).toBeLessThanOrEqual(3);
    expect(w / h).toBeGreaterThanOrEqual(1 / 3);
    expect(ratioError(w / h, gen.width / gen.height)).toBeLessThanOrEqual(0.005);
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

  // 2026-09-30 CJ：每通路只預設擺兩張，其餘用戶自己加。
  it.each(IMAGE_CHANNELS)("%s shows exactly two image cards by default", (ch) => {
    const ids = defaultImageTray(ch);
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(PLATFORM_IMAGE_SPECS.find((s) => s.id === id)?.channel).toBe(ch);
  });

  // 對照 OnBrand_圖片尺寸漏項清單.xlsx（2026-09-30）的 P1／P2 尺寸，每一個都要有卡。
  it.each([
    ["facebook", 1080, 1080], ["facebook", 851, 315], ["facebook", 1640, 856], ["facebook", 1200, 628], ["facebook", 1440, 1800], ["facebook", 1440, 2560],
    ["instagram", 1080, 566], ["instagram", 1440, 1800], ["instagram", 1440, 2560], ["instagram", 1080, 1920],
    ["line", 640, 640], ["line", 1080, 878], ["line", 1080, 1080], ["line", 1040, 1040], ["line", 2500, 1686], ["line", 2500, 843],
    ["line", 1200, 628], ["line", 600, 400], ["line", 1280, 720], ["line", 640, 1284], ["line", 1200, 600], ["line", 1920, 1080],
    ["line", 300, 600],
    ["threads", 1080, 1080], ["threads", 1200, 628], ["threads", 1200, 630], ["threads", 1440, 1800],
    ["email", 1200, 480], ["email", 400, 400],
    ["tiktok", 400, 400], ["tiktok", 1080, 1920], ["tiktok", 720, 1280], ["tiktok", 640, 640], ["tiktok", 1200, 628], ["tiktok", 600, 500], ["tiktok", 640, 200], ["tiktok", 640, 100],
    // 9/30 第二輪：Excel P3 經官方資料查證後補上的。
    ["facebook", 1024, 1024], ["instagram", 1024, 1024], ["instagram", 1080, 1350],
    ["line", 1040, 350], ["line", 1040, 585], ["line", 1040, 700], ["line", 1040, 1300], ["line", 1040, 1850],
    ["line", 1540, 1000], ["line", 1080, 1620], ["line", 1125, 294], ["line", 640, 1280], ["line", 520, 336],
    ["line", 1920, 1080], ["line", 1125, 960],
  ] as const)("%s has a %i×%i card", (ch, w, h) => {
    expect(PLATFORM_IMAGE_SPECS.some((s) => s.channel === ch && s.width === w && s.height === h)).toBe(true);
  });

  it("ad cards are marked as ads", () => {
    for (const s of PLATFORM_IMAGE_SPECS) {
      if (/-ad-|^tt-an-/.test(s.id)) expect(s.placement, s.id).toBe("ad");
      else expect(s.placement ?? "organic", s.id).toBe("organic");
    }
  });

  it("resolves a brand's saved image tray and falls back to the two defaults", () => {
    expect(resolveImageTray(null, "facebook")).toEqual({ ids: defaultImageTray("facebook"), isDefault: true });
    const saved = { __imageTray: { facebook: ["fb-ad-story", "nope", "ig-img-story", "fb-ad-story", "fb-img-avatar"] } };
    // 未知的、別通路的、重複的都濾掉。
    expect(resolveImageTray(saved, "facebook")).toEqual({ ids: ["fb-ad-story", "fb-img-avatar"], isDefault: false });
    // 存的全失效 → 回預設，不給空畫面。
    expect(resolveImageTray({ __imageTray: { line: ["gone"] } }, "line").isDefault).toBe(true);
    const many = { __imageTray: { facebook: PLATFORM_IMAGE_SPECS.filter((s) => s.channel === "facebook").map((s) => s.id) } };
    expect(resolveImageTray(many, "facebook").ids.length).toBeLessThanOrEqual(MAX_IMAGE_TRAY);
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

  // 2026-09-30：>3:1 的 Banner 用合成——方形主體放右端，其餘補主體的背景色。
  it("composes a thin banner from a square subject without cropping", async () => {
    const banner = PLATFORM_IMAGE_SPECS.find((s) => s.id === "tt-an-banner-640x200")!;
    // 1024 方形：藍底，中間一塊紅色主體。
    const tile = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#1e40af" } })
      .composite([{ input: await sharp({ create: { width: 400, height: 400, channels: 3, background: "#dc2626" } }).png().toBuffer(), top: 312, left: 312 }])
      .png().toBuffer();
    const r = await finalizeToSpec(tile, banner);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { data, info } = await sharp(r.buffer).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([640, 200]);
    const px = (x: number, y: number) => { const i = (y * info.width + x) * info.channels; return [data[i]!, data[i + 1]!, data[i + 2]!]; };
    const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) < 24);
    expect(near(px(20, 100), [0x1e, 0x40, 0xaf])).toBe(true);   // 左側補的是主體的背景色
    expect(near(px(540, 100), [0xdc, 0x26, 0x26])).toBe(true);  // 主體在右端正中
    // 方形以外的比例一樣擋下。
    expect((await finalizeToSpec(await img(1024, 1536), banner)).ok).toBe(false);
  });

  it("squeezes a photographic PNG under the LINE Wallet popup cap by palette quantisation", async () => {
    const popup = PLATFORM_IMAGE_SPECS.find((s) => s.id === "line-ad-wallet-popup")!;
    const { w, h } = gptSizeFor(popup.width, popup.height);
    const noisy = await sharp(Buffer.from(Array.from({ length: w * h * 3 }, (_, i) => (i * 7 + Math.floor(Math.random() * 40)) % 256)), {
      raw: { width: w, height: h, channels: 3 },
    }).png().toBuffer();
    const r = await finalizeToSpec(noisy, popup);
    if (r.ok) {
      expect(r.bytes).toBeLessThanOrEqual(600 * 1024);
      const m = await sharp(r.buffer).metadata();
      expect([m.format, m.width, m.height]).toEqual(["png", 1125, 960]);
    } else expect(r.reason).toContain("上限");
  }, 180_000); // 單獨跑約 60 秒，整套並行時更久，60 秒上限會間歇逾時

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
  }, 180_000); // 單獨跑約 60 秒，整套並行時更久，60 秒上限會間歇逾時
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
