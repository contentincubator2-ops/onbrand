import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatchGenerateMock, executeMock } = vi.hoisted(() => ({
  dispatchGenerateMock: vi.fn(),
  executeMock: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => ({ execute: executeMock })),
}));

vi.mock("../../strategy/core/decisionBridge", () => ({ loadLineage: vi.fn(async () => []) }));

vi.mock("./mediaGen", () => ({
  dispatchGenerate: dispatchGenerateMock,
}));

import { generateImage } from "./imageGen";

const ok = (modelId: string) => ({ status: "ready", modelId, url: "/static/covers/media-img-1.png" });
const fail = (modelId: string, errorMsg: string) => ({ status: "failed", modelId, errorMsg });

describe("generateImage — 只有 gpt-image-2 與 Nano Banana，不換模型", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeMock.mockResolvedValue([{ insertId: 7 }]);
    dispatchGenerateMock.mockResolvedValue(ok("openai/gpt-image-2"));
  });

  it("沒有指定模型：一律 gpt-image-2", async () => {
    const r = await generateImage({ brandId: 1, prompt: "A clean studio scene" });
    expect(r).toMatchObject({ status: "ready", provider: "openai", model: "gpt-image-2", requestedModel: "gpt-image-2" });
    expect(dispatchGenerateMock).toHaveBeenCalledOnce();
    expect(dispatchGenerateMock.mock.calls[0]![0]).toBe("openai/gpt-image-2");
  });

  it.each(["auto", "flux-schnell", "flux-realism", "ideogram-v3", "gpt-image-1"])(
    "已下架的選項 %s 落回 gpt-image-2，不會變成別的模型", async (choice) => {
      const r = await generateImage({ brandId: 1, prompt: "p", modelChoice: choice });
      expect(r.model).toBe("gpt-image-2");
      expect(dispatchGenerateMock.mock.calls.every((c) => c[0] === "openai/gpt-image-2")).toBe(true);
    },
  );

  it("用戶選 Nano Banana：才跑 Nano Banana", async () => {
    dispatchGenerateMock.mockResolvedValue(ok("google/nano-banana"));
    const r = await generateImage({ brandId: 1, prompt: "p", modelChoice: "nano-banana" });
    expect(r).toMatchObject({ status: "ready", provider: "google", model: "nano-banana", requestedModel: "nano-banana" });
    expect(dispatchGenerateMock.mock.calls[0]![0]).toBe("google/nano-banana");
  });

  it("有產品照也用 gpt-image-2：把照片當參考圖交給它（編輯端點）", async () => {
    await generateImage({ brandId: 1, prompt: "on a mossy rock", subjectImageUrl: "https://example.com/bottle.png" });
    const [modelId, options] = dispatchGenerateMock.mock.calls[0]!;
    expect(modelId).toBe("openai/gpt-image-2");
    expect(options.imageUrl).toBe("https://example.com/bottle.png");
  });

  it("結果存成網址（不是塞進資料庫的 base64），這樣每一張圖都能留著讓用戶切回去", async () => {
    const r = await generateImage({ brandId: 1, prompt: "p" });
    expect(r.url).toBe("/static/covers/media-img-1.png");
    expect(r).not.toHaveProperty("b64");
  });

  it("gpt-image-2 失敗：同一個模型重試一次，再失敗就回報失敗並提供「改用 Nano Banana」，不自己換", async () => {
    dispatchGenerateMock.mockResolvedValue(fail("openai/gpt-image-2", "OpenAI 500: upstream error"));
    const r = await generateImage({ brandId: 1, prompt: "p" });
    expect(r).toMatchObject({
      status: "failed", url: null, model: "gpt-image-2", failureKind: "provider", canSwitchTo: "nano-banana",
    });
    expect(dispatchGenerateMock).toHaveBeenCalledTimes(2);
    expect(dispatchGenerateMock.mock.calls.every((c) => c[0] === "openai/gpt-image-2")).toBe(true);
  });

  it("內容政策擋下：不重試，也不自己換模型", async () => {
    dispatchGenerateMock.mockResolvedValue(fail("openai/gpt-image-2", "Your request was rejected by the safety system"));
    const r = await generateImage({ brandId: 1, prompt: "p" });
    expect(r).toMatchObject({ status: "failed", failureKind: "content_policy", canSwitchTo: "nano-banana" });
    expect(dispatchGenerateMock).toHaveBeenCalledTimes(1);
  });

  it("失敗訊息裡的金鑰會被遮掉再存進資料庫", async () => {
    dispatchGenerateMock.mockResolvedValue(fail("openai/gpt-image-2", "OpenAI 401: bad key=AIzaSyA1234567890123456789012345"));
    const r = await generateImage({ brandId: 1, prompt: "p" });
    expect(r.errorMsg).not.toContain("AIzaSy");
  });

  // 2026-07-25 product-faithful：參考圖的優先序守則要放在任何場景描述之前
  it("puts product-reference arbitration before a conflicting scene prompt", async () => {
    const conflictingScene = "A woman wearing a fitted beige shirt with black trousers";

    await expect(generateImage({
      brandId: 1,
      prompt: conflictingScene,
      subjectImageUrl: "https://example.com/real-brown-top.png",
    })).resolves.toMatchObject({ status: "ready", model: "gpt-image-2" });

    expect(dispatchGenerateMock).toHaveBeenCalledOnce();
    const [, options] = dispatchGenerateMock.mock.calls[0]!;
    const prompt = String(options.prompt);
    expect(prompt).toContain("attached reference image is the sole source of truth");
    expect(prompt).toContain("ignore that conflicting text and follow the reference image");
    expect(prompt).toContain("Use scene text only for the environment, lighting, composition, pose, and atmosphere");
    expect(prompt.indexOf("PRODUCT REFERENCE OVERRIDES ALL CONFLICTING TEXT"))
      .toBeLessThan(prompt.indexOf(conflictingScene));
  });
});
