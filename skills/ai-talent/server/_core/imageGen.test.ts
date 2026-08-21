import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatchGenerateMock, executeMock } = vi.hoisted(() => ({
  dispatchGenerateMock: vi.fn(),
  executeMock: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({ execute: executeMock })),
}));

vi.mock("./decisionBridge", () => ({ loadLineage: vi.fn(async () => []) }));

vi.mock("./mediaGen", () => ({
  dispatchGenerate: dispatchGenerateMock,
}));

import { generateImage } from "./imageGen";

describe("generateImage provider validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    executeMock.mockResolvedValue([{ insertId: 7 }]);
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("GEMINI_API_KEY", "test-google-key");
    vi.stubEnv("GEMINI_API_KEY_POOL", "");
    vi.stubEnv("GOOGLE_AI_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "");
    vi.stubEnv("IMAGE_GEN_PROVIDER_PRIMARY", "openai");
    vi.stubEnv("IMAGE_GEN_PROVIDER_FALLBACK", "google");
    dispatchGenerateMock.mockResolvedValue({
      status: "ready",
      modelId: "google/nano-banana",
      url: "/uploads/generated/product.png",
    });
  });

  it("falls back instead of reporting ready when OpenAI returns no image", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{}] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        predictions: [{ bytesBase64Encoded: "aW1hZ2U=" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage({
      brandId: 1,
      prompt: "A clean studio scene",
      modelChoice: "gpt-image-2",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      status: "ready",
      provider: "google",
      b64: "aW1hZ2U=",
      requestedModel: "gpt-image-2",
      usedFallback: true,
    });
    expect(fetchMock.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[1]![1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rotates manual Imagen generation past a quota-exhausted pooled key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY_POOL", "quota-key,working-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { status: "RESOURCE_EXHAUSTED" },
      }), { status: 429, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        predictions: [{ bytesBase64Encoded: "aW1hZ2U=" }],
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage({
      brandId: 1,
      prompt: "A clean studio scene",
      modelChoice: "imagen-3",
    });

    expect(result).toMatchObject({ status: "ready", provider: "google" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("puts product-reference arbitration before a conflicting scene prompt", async () => {
    const conflictingScene = "A woman wearing a fitted beige shirt with black trousers";

    await expect(generateImage({
      brandId: 1,
      prompt: conflictingScene,
      subjectImageUrl: "https://example.com/real-brown-top.png",
    })).resolves.toMatchObject({ status: "ready", model: "nano-banana" });

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
