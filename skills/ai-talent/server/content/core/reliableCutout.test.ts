import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { obtainCutout } from "./reliableCutout";
import type { CutoutResult } from "./productImageCutout";

let good: Buffer;
let opaque: Buffer;

beforeAll(async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><circle cx="150" cy="150" r="90" fill="#c33"/></svg>`;
  good = await sharp(Buffer.from(svg)).png().toBuffer();
  opaque = await sharp({ create: { width: 300, height: 300, channels: 4, background: "#eee" } }).png().toBuffer();
});

const ok = (buf: Buffer): CutoutResult => ({ pngBuffer: buf, hadAlpha: true, provider: "replicate-birefnet" });
const passthrough = (buf: Buffer): CutoutResult => ({ pngBuffer: buf, hadAlpha: false, provider: "passthrough" });
const base = { hasService: () => true, sleep: async () => {} };

describe("obtainCutout", () => {
  it("第一次就成功：不重試", async () => {
    const remove = vi.fn().mockResolvedValue(ok(good));
    const r = await obtainCutout("u", { ...base, remove });
    expect(r).toMatchObject({ ok: true, attempts: 1, needsReview: false });
    expect(remove).toHaveBeenCalledOnce();
  });

  it("暫時性失敗（退成 passthrough）會重試，下一次成功就用", async () => {
    const remove = vi.fn()
      .mockResolvedValueOnce(passthrough(opaque))
      .mockResolvedValueOnce(ok(good));
    const sleep = vi.fn(async () => {});
    const r = await obtainCutout("u", { hasService: () => true, remove, sleep });
    expect(r).toMatchObject({ ok: true, attempts: 2 });
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("remove 直接丟例外也算失敗、會重試", async () => {
    const remove = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(ok(good));
    expect(await obtainCutout("u", { ...base, remove })).toMatchObject({ ok: true, attempts: 2 });
  });

  it("遮罩不可用（整張都不透明）也會重試，耗盡後回 ok:false、cutout_unusable，不丟例外", async () => {
    const remove = vi.fn().mockResolvedValue(ok(opaque));
    const r = await obtainCutout("u", { ...base, remove });
    expect(r).toMatchObject({ ok: false, attempts: 3, reason: "cutout_unusable", issues: ["nothing_removed"] });
    expect(remove).toHaveBeenCalledTimes(3);
  });

  it("每次都失敗 → ok:false、cutout_failed，呼叫端可以走備援出圖", async () => {
    const remove = vi.fn().mockResolvedValue(passthrough(opaque));
    expect(await obtainCutout("u", { ...base, remove })).toMatchObject({ ok: false, attempts: 3, reason: "cutout_failed" });
  });

  it("沒設去背服務：不浪費重試，直接 no_cutout_service", async () => {
    const remove = vi.fn();
    const r = await obtainCutout("u", { hasService: () => false, remove });
    expect(r).toEqual({ ok: false, attempts: 0, reason: "no_cutout_service", issues: [] });
    expect(remove).not.toHaveBeenCalled();
  });

  it("遮罩有軟性問題時仍回 ok:true，但標 needsReview 並帶出問題", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect x="0" y="90" width="300" height="120" fill="#333"/></svg>`;
    const cropped = await sharp(Buffer.from(svg)).png().toBuffer();
    const r = await obtainCutout("u", { ...base, remove: async () => ok(cropped) });
    expect(r).toMatchObject({ ok: true, needsReview: true });
    expect((r as any).issues).toContain("cropped_at_edge");
  });
});
