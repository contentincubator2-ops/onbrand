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
    // Reset per-test, or the pinned-imagen case below leaks into later tests.
    vi.stubEnv("IMAGE_GEN_MODEL_GOOGLE", "");
    dispatchGenerateMock.mockResolvedValue({
      status: "ready",
      modelId: "openai/gpt-image-2",
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
        candidates: [{ content: { parts: [{ inlineData: { data: "aW1hZ2U=" } }] } }],
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

  // 2026-09-01 (CJ「open ai 我指定使用 gpt image 2」): IMAGE_GEN_MODEL_OPENAI is
  // unset on the VM, so the literal default in runOpenAI is what actually
  // reaches OpenAI — it must be gpt-image-2, not the older model.
  it("sends gpt-image-2 when nothing overrides the OpenAI model", async () => {
    vi.stubEnv("IMAGE_GEN_MODEL_OPENAI", "");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: "aW1hZ2U=" }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage({ brandId: 1, prompt: "A clean studio scene" });

    expect(result).toMatchObject({ status: "ready", provider: "openai" });
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body.model).toBe("gpt-image-2");
  });

  it("rotates manual Google generation past a quota-exhausted pooled key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY_POOL", "quota-key,working-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { status: "RESOURCE_EXHAUSTED" },
      }), { status: 429, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { data: "aW1hZ2U=" } }] } }],
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

  // 2026-08-31 (CJ「圖片的模型，是否突然都不能使用了」): the prod key lost the
  // Imagen predict surface entirely, so an .env still pinning an imagen model
  // would otherwise take the whole Google fallback down.
  it("hands a 404 imagen model off to the gemini image surface", async () => {
    vi.stubEnv("IMAGE_GEN_MODEL_GOOGLE", "imagen-4.0-generate-001");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: {
          code: 404,
          message: "models/imagen-4.0-generate-001 is not found for API version v1beta",
          status: "NOT_FOUND",
        },
      }), { status: 404, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { data: "aW1hZ2U=" } }] } }],
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage({
      brandId: 1,
      prompt: "A clean studio scene",
      modelChoice: "imagen-3",
    });

    expect(result).toMatchObject({
      status: "ready",
      provider: "google",
      model: "gemini-2.5-flash-image",
    });
    expect(String(fetchMock.mock.calls[0]![0])).toContain("imagen-4.0-generate-001:predict");
    expect(String(fetchMock.mock.calls[1]![0])).toContain("gemini-2.5-flash-image:generateContent");
  });

  it("falls back instead of reporting ready when the gemini surface returns no image part", async () => {
    // A success-shaped response carrying only a text part must not be written
    // as ready — that is the bug that stopped the fallback chain for OpenAI.
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ finishReason: "IMAGE_OTHER", content: { parts: [{ text: "no image" }] } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage({
      brandId: 1,
      prompt: "A clean studio scene",
      modelChoice: "imagen-3",
    });

    expect(result).toMatchObject({ status: "ready", provider: "piapi", usedFallback: true });
  });

  // 2026-09-21 (CJ「生圖，正式環境的生圖，都採用 gpt image 2」): a product run
  // may only fall back to the OTHER model that SEES the real product. Falling
  // back to text-to-image would silently ship a hallucinated product — the
  // whole reason this path had no fallback before.
  it("falls back from gpt-image-2 to Nano Banana, never to text-to-image", async () => {
    dispatchGenerateMock.mockReset();
    dispatchGenerateMock
      .mockResolvedValueOnce({ status: "failed", modelId: "openai/gpt-image-2", errorMsg: "edits 400" })
      .mockResolvedValueOnce({
        status: "ready",
        modelId: "google/nano-banana",
        url: "/uploads/generated/product.png",
      });

    await expect(generateImage({
      brandId: 1,
      prompt: "product on a marble counter",
      subjectImageUrl: "https://example.com/product.png",
    })).resolves.toMatchObject({
      status: "ready",
      provider: "google",
      model: "nano-banana",
      requestedModel: "gpt-image-2",
      usedFallback: true,
    });

    expect(dispatchGenerateMock.mock.calls.map(([modelId]) => modelId))
      .toEqual(["openai/gpt-image-2", "google/nano-banana"]);
    for (const [, options] of dispatchGenerateMock.mock.calls) {
      expect(options.imageUrl).toBe("https://example.com/product.png");
    }
  });

  it("reports both subject models in the error when neither can deliver", async () => {
    dispatchGenerateMock.mockReset();
    dispatchGenerateMock
      .mockResolvedValueOnce({ status: "failed", modelId: "openai/gpt-image-2", errorMsg: "edits 400" })
      .mockRejectedValueOnce(new Error("NanoBanana no image (IMAGE_SAFETY)"));

    const result = await generateImage({
      brandId: 1,
      prompt: "product on a marble counter",
      subjectImageUrl: "https://example.com/product.png",
    });

    expect(result.status).toBe("failed");
    expect(result.errorMsg).toContain("gpt-image-2: edits 400");
    expect(result.errorMsg).toContain("nano-banana: NanoBanana no image");
  });

  it("puts product-reference arbitration before a conflicting scene prompt", async () => {
    const conflictingScene = "A woman wearing a fitted beige shirt with black trousers";

    await expect(generateImage({
      brandId: 1,
      prompt: conflictingScene,
      subjectImageUrl: "https://example.com/real-brown-top.png",
    })).resolves.toMatchObject({ status: "ready", model: "gpt-image-2" });

    expect(dispatchGenerateMock).toHaveBeenCalledOnce();
    // 2026-09-21 (CJ「生圖，正式環境的生圖，都採用 gpt image 2」): subject
    // mode used to be pinned to google/nano-banana — the ONE path that did not
    // run on gpt-image-2.
    const [subjectModelId, options] = dispatchGenerateMock.mock.calls[0]!;
    expect(subjectModelId).toBe("openai/gpt-image-2");
    expect(options.imageUrl).toBe("https://example.com/real-brown-top.png");
    const prompt = String(options.prompt);
    expect(prompt).toContain("attached reference image is the sole source of truth");
    expect(prompt).toContain("ignore that conflicting text and follow the reference image");
    expect(prompt).toContain("Use scene text only for the environment, lighting, composition, pose, and atmosphere");
    expect(prompt.indexOf("PRODUCT REFERENCE OVERRIDES ALL CONFLICTING TEXT"))
      .toBeLessThan(prompt.indexOf(conflictingScene));
  });
});
