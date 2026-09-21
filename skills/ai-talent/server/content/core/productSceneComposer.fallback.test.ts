/**
 * 去背拿不到時，合成器要「有圖出、不丟錯」；拿得到時，產品像素不能被動到。
 * 全部用 mock 掉網路的合成素材，不打任何真實服務。
 */
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { obtainMock, genMock, fetchMock } = vi.hoisted(() => ({
  obtainMock: vi.fn(), genMock: vi.fn(), fetchMock: vi.fn(),
}));
vi.mock("./reliableCutout", () => ({ obtainCutout: obtainMock }));
vi.mock("./imageGen", () => ({ generateImage: genMock }));
vi.mock("./imageFetch", () => ({ fetchImageBuffer: fetchMock }));

import { composeProductScene } from "./productSceneComposer";

const W = 400;
let redCutout: Buffer;      // 透明底、中間一顆純紅圓
let greenBgB64: string;     // 純綠背景
let orangePhoto: Buffer;    // 沒去背的原照片：純橘色

async function centerPixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
}

beforeAll(async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><circle cx="150" cy="150" r="140" fill="rgb(200,30,30)"/></svg>`;
  redCutout = await sharp(Buffer.from(svg)).png().toBuffer();
  greenBgB64 = (await sharp({ create: { width: 512, height: 512, channels: 3, background: { r: 20, g: 160, b: 40 } } }).png().toBuffer()).toString("base64");
  orangePhoto = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 240, g: 140, b: 20 } } }).png().toBuffer();
});

beforeEach(() => {
  obtainMock.mockReset(); genMock.mockReset(); fetchMock.mockReset();
  fetchMock.mockResolvedValue({ buffer: orangePhoto, mime: "image/png" });
});

const base = { brandId: 1, productImageUrl: "https://x/p.jpg", width: W, height: W };
const cutoutFails = (reason: string, issues: string[] = []) =>
  obtainMock.mockResolvedValue({ ok: false, attempts: 3, reason, issues });

describe("去背成功 → composite", () => {
  it("回報 composite，並把去背檢查的提醒帶出來", async () => {
    obtainMock.mockResolvedValue({ ok: true, pngBuffer: redCutout, attempts: 2, issues: ["cropped_at_edge"], needsReview: true });
    genMock.mockResolvedValue({ status: "ready", b64: greenBgB64 });
    const r = await composeProductScene(base);
    expect(r).toMatchObject({ method: "composite", hadCutout: true, attempts: 2, needsReview: true, qaIssues: ["cropped_at_edge"] });
    expect(genMock).toHaveBeenCalledOnce();
    expect(genMock.mock.calls[0]![0].subjectImageUrl).toBeUndefined(); // 背景不帶產品參考圖
  });

  it("產品像素不被改動：產品中心是純紅，背景仍是純綠", async () => {
    obtainMock.mockResolvedValue({ ok: true, pngBuffer: redCutout, attempts: 1, issues: [], needsReview: false });
    genMock.mockResolvedValue({ status: "ready", b64: greenBgB64 });
    const r = await composeProductScene(base);
    expect(await centerPixel(r.pngBuffer, W / 2, Math.round(W * 0.55))).toEqual([200, 30, 30]);
    expect(await centerPixel(r.pngBuffer, 5, 5)).toEqual([20, 160, 40]);
  });

  it("用戶確認過的去背圖：不再呼叫去背服務", async () => {
    genMock.mockResolvedValue({ status: "ready", b64: greenBgB64 });
    const r = await composeProductScene({ ...base, approvedCutout: redCutout });
    expect(obtainMock).not.toHaveBeenCalled();
    expect(r).toMatchObject({ method: "composite", attempts: 0, needsReview: false });
  });
});

describe("去背拿不到 → 一定有圖出，不丟錯", () => {
  it("備援一：帶產品參考圖的重繪（generative），並記下原因與嘗試次數", async () => {
    cutoutFails("cutout_failed");
    genMock.mockResolvedValue({ status: "ready", b64: greenBgB64, effectivePrompt: "used prompt" });
    const r = await composeProductScene({ ...base, scenePrompt: "wooden table" });
    expect(r).toMatchObject({ method: "generative", hadCutout: false, attempts: 3, fallbackReason: "cutout_failed" });
    expect(genMock.mock.calls[0]![0].subjectImageUrl).toBe("https://x/p.jpg");
    expect(genMock.mock.calls[0]![0].prompt).toContain("wooden table");
    const meta = await sharp(r.pngBuffer).metadata();
    expect([meta.width, meta.height]).toEqual([W, W]);
  });

  it("備援一失敗（回 failed）→ 備援二：原照片放中性背景，產品像素不動", async () => {
    cutoutFails("cutout_unusable", ["nothing_removed"]);
    genMock.mockResolvedValue({ status: "failed", errorMsg: "quota" });
    const r = await composeProductScene(base);
    expect(r).toMatchObject({ method: "original-on-backdrop", fallbackReason: "cutout_unusable", qaIssues: ["nothing_removed"] });
    expect(await centerPixel(r.pngBuffer, W / 2, Math.round(W * 0.55))).toEqual([240, 140, 20]);
    expect(await centerPixel(r.pngBuffer, 5, 5)).toEqual([244, 243, 240]);
  });

  it("備援一丟例外也一樣落到備援二，不往外丟", async () => {
    cutoutFails("no_cutout_service");
    genMock.mockRejectedValue(new Error("network"));
    await expect(composeProductScene(base)).resolves.toMatchObject({ method: "original-on-backdrop", fallbackReason: "no_cutout_service" });
  });

  it("用戶選擇 AI 重繪版：不呼叫去背服務，原因是 user_choice", async () => {
    genMock.mockResolvedValue({ status: "ready", b64: greenBgB64 });
    const r = await composeProductScene({ ...base, skipCutout: true });
    expect(obtainMock).not.toHaveBeenCalled();
    expect(r).toMatchObject({ method: "generative", fallbackReason: "user_choice" });
  });

  it("連原照片都讀不到，才會丟錯（那是照片本身的問題）", async () => {
    cutoutFails("cutout_failed");
    genMock.mockResolvedValue({ status: "failed" });
    fetchMock.mockRejectedValue(new Error("404"));
    await expect(composeProductScene(base)).rejects.toThrow("404");
  });
});
