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

  // 2026-09-23 (CJ「備援要禁掉」): every one of these used to assert a
  // fallback — OpenAI → Google → PiAPI Flux, and subject mode → Nano Banana.
  // Production images are gpt-image-2 or they are a visible failure, so the
  // tests now guard the opposite property: nothing else may ever be called.
  it("reports a failure instead of reaching for another model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{}] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage({
      brandId: 1,
      prompt: "A clean studio scene",
      modelChoice: "gpt-image-2",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]![0])).toContain("api.openai.com");
    expect(result).toMatchObject({
      status: "failed",
      provider: "openai",
      requestedModel: "gpt-image-2",
      usedFallback: false,
    });
  });

  // A content-policy refusal was the one case that jumped STRAIGHT to Flux,
  // because Flux's policy is loosest. That is exactly the silent substitution
  // CJ asked to stop; imageRouter turns this into a readable message instead.
  it("does not reroute a safety block to another provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "Your request was rejected by the safety system" },
    }), { status: 400, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage({ brandId: 1, prompt: "Pikachu holding a drink" });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(dispatchGenerateMock).not.toHaveBeenCalled();
    expect(result.status).toBe("failed");
    expect(result.errorMsg).toMatch(/safety system/i);
  });

  // 2026-09-01 (CJ「open ai 我指定使用 gpt image 2」): the literal default in
  // runOpenAI is what reaches OpenAI.
  // 2026-09-21 (CJ「正式環境的生圖，都採用 gpt image 2」): stub the env to the
  // value the .env template actually ships (gpt-image-1) — it must NOT win.
  it("sends gpt-image-2 even when the .env pins the older model", async () => {
    vi.stubEnv("IMAGE_GEN_MODEL_OPENAI", "gpt-image-1");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: "aW1hZ2U=" }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage({ brandId: 1, prompt: "A clean studio scene" });

    expect(result).toMatchObject({ status: "ready", provider: "openai" });
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body.model).toBe("gpt-image-2");
  });

  // Old variants still carry ids the picker no longer offers. They must be
  // accepted (no 400 for an old client) and run gpt-image-2 anyway.
  it.each(["auto", "flux-schnell", "flux-realism", "ideogram-v3", "imagen-3"] as const)(
    "collapses the legacy choice %s onto gpt-image-2",
    async (modelChoice) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        data: [{ b64_json: "aW1hZ2U=" }],
      }), { status: 200, headers: { "content-type": "application/json" } }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await generateImage({ brandId: 1, prompt: "scene", modelChoice });

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(String(fetchMock.mock.calls[0]![0])).toContain("api.openai.com");
      expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)).model).toBe("gpt-image-2");
      expect(result).toMatchObject({ status: "ready", requestedModel: modelChoice });
    },
  );

  it("fails a product-reference run rather than handing it to Nano Banana", async () => {
    dispatchGenerateMock.mockReset();
    dispatchGenerateMock.mockResolvedValue({
      status: "failed",
      modelId: "openai/gpt-image-2",
      errorMsg: "edits 400",
    });

    const result = await generateImage({
      brandId: 1,
      prompt: "product on a marble counter",
      subjectImageUrl: "https://example.com/product.png",
    });

    expect(dispatchGenerateMock.mock.calls.map(([modelId]) => modelId)).toEqual(["openai/gpt-image-2"]);
    expect(result).toMatchObject({
      status: "failed",
      model: "gpt-image-2",
      usedFallback: false,
    });
    expect(result.errorMsg).toContain("edits 400");
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
