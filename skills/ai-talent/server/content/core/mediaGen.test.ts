import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchImageBufferMock, writeFileSyncMock } = vi.hoisted(() => ({
  fetchImageBufferMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
}));

vi.mock("fs", () => ({
  mkdirSync: vi.fn(),
  writeFileSync: writeFileSyncMock,
}));

vi.mock("./imageFetch", () => ({
  fetchImageBuffer: fetchImageBufferMock,
}));

import { dispatchGenerate } from "./mediaGen";

describe("mediaGen image provider request contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubEnv("GEMINI_API_KEY", "test-google-key");
    vi.stubEnv("GEMINI_API_KEY_POOL", "");
    vi.stubEnv("GOOGLE_AI_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("AZURE_IMAGE_API_KEY", "test-azure-key");
    vi.stubEnv("HAILUO_API_KEY", "test-hailuo-key");
  });

  it("sends the requested portrait ratio to Imagen 4", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      predictions: [{ bytesBase64Encoded: "aW1hZ2U=" }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(dispatchGenerate("google/imagen-4-default", {
      prompt: "portrait scene",
      aspectRatio: "9:16",
    })).resolves.toMatchObject({ status: "ready" });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body.parameters).toMatchObject({ sampleCount: 1, aspectRatio: "9:16" });
  });

  // 2026-09-01: quality="high" made gpt-image-2 take 73.8s instead of 14.1s
  // for a smaller image, past genOneImage's 35s cap — so openai-pinned tasks
  // silently shipped Flux output. Omit the parameter unless asked.
  it("omits quality from the OpenAI request when the caller does not set one", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [{ b64_json: "aW1hZ2U=" }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(dispatchGenerate("openai/gpt-image-2", {
      prompt: "scene",
      aspectRatio: "16:9",
    })).resolves.toMatchObject({ status: "ready" });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body).not.toHaveProperty("quality");
    expect(body.model).toBe("gpt-image-2");
  });

  it("still sends an explicitly requested quality", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [{ b64_json: "aW1hZ2U=" }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(dispatchGenerate("openai/gpt-image-2", {
      prompt: "scene",
      aspectRatio: "16:9",
      quality: "low",
    })).resolves.toMatchObject({ status: "ready" });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body.quality).toBe("low");
  });

  it.each([
    ["openai/gpt-image-2", "4:3", "1536x1024"],
    ["azure/gpt-image-2", "3:4", "1024x1536"],
  ] as const)("maps %s ratio %s to supported size %s", async (modelId, aspectRatio, expectedSize) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [{ b64_json: "aW1hZ2U=" }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(dispatchGenerate(modelId, {
      prompt: "scene",
      aspectRatio,
    })).resolves.toMatchObject({ status: "ready" });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body.size).toBe(expectedSize);
  });

  it("validates a provider's remote image before persisting it", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: { image_urls: ["https://cdn.example.com/generated.png"] },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    fetchImageBufferMock.mockResolvedValue({
      buffer: Buffer.from("valid-image"),
      mime: "image/png",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(dispatchGenerate("hailuo/image", { prompt: "scene" }))
      .resolves.toMatchObject({ status: "ready" });

    expect(fetchImageBufferMock).toHaveBeenCalledWith(
      "https://cdn.example.com/generated.png",
      { timeoutMs: 60_000 },
    );
    expect(writeFileSyncMock).toHaveBeenCalledOnce();
  });

  it("uses GEMINI_API_KEY_POOL for Imagen and rotates past a quota-exhausted key", async () => {
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

    await expect(dispatchGenerate("google/imagen-4-default", {
      prompt: "scene",
      aspectRatio: "1:1",
    })).resolves.toMatchObject({ status: "ready" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("key=quota-key");
    expect(String(fetchMock.mock.calls[1]![0])).toContain("key=working-key");
  });

  it("rotates Nano Banana keys on quota exhaustion without text-to-image fallback", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY_POOL", "quota-key,working-key");
    fetchImageBufferMock.mockResolvedValue({
      buffer: Buffer.from("product-image"),
      mime: "image/png",
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { status: "RESOURCE_EXHAUSTED" },
      }), { status: 429, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { data: "aW1hZ2U=" } }] } }],
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(dispatchGenerate("google/nano-banana", {
      prompt: "product scene",
      imageUrl: "https://example.com/product.png",
    })).resolves.toMatchObject({ status: "ready", modelId: "google/nano-banana" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // 2026-09-10 (CJ「model 跟衣服要分開的」)：garment try-on 送給 PiAPI Kling
  // 的兩張圖必須各自進對的欄位——衣服跟模特的身份不能在請求層就先搞混。
  describe("piapi/kling-try-on", () => {
    beforeEach(() => {
      vi.stubEnv("PIAPI_KEY", "test-piapi-key");
    });

    function stubSubmitThenPoll(extraInputAssertions?: (input: any) => void) {
      const fetchMock = vi.fn()
        .mockImplementationOnce(async (_url: string, opts: any) => {
          const body = JSON.parse(String(opts.body));
          expect(body.model).toBe("kling");
          expect(body.task_type).toBe("ai_try_on");
          extraInputAssertions?.(body.input);
          return new Response(JSON.stringify({ data: { task_id: "tryon-task-1" } }), { status: 200 });
        })
        .mockImplementationOnce(async () => new Response(JSON.stringify({
          data: { status: "completed", output: { image_url: "https://cdn.piapi.ai/tryon-result.png" } },
        }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      fetchImageBufferMock.mockResolvedValue({ buffer: Buffer.from("tryon-image"), mime: "image/png" });
      return fetchMock;
    }

    it("puts the model photo in model_input and the garment in dress_input by default", async () => {
      stubSubmitThenPoll((input) => {
        expect(input.model_input).toBe("https://cdn.example.com/model.jpg");
        expect(input.dress_input).toBe("https://cdn.example.com/garment.jpg");
        expect(input.upper_input).toBeUndefined();
        expect(input.lower_input).toBeUndefined();
      });

      await expect(dispatchGenerate("piapi/kling-try-on", {
        prompt: "",
        imageUrl: "https://cdn.example.com/model.jpg",
        garmentImageUrl: "https://cdn.example.com/garment.jpg",
      })).resolves.toMatchObject({ status: "ready" });
    });

    it("routes garmentSlot upper/lower to the matching field, never dress_input", async () => {
      stubSubmitThenPoll((input) => {
        expect(input.upper_input).toBe("https://cdn.example.com/garment.jpg");
        expect(input.dress_input).toBeUndefined();
      });

      await expect(dispatchGenerate("piapi/kling-try-on", {
        prompt: "",
        imageUrl: "https://cdn.example.com/model.jpg",
        garmentImageUrl: "https://cdn.example.com/garment.jpg",
        garmentSlot: "upper",
      })).resolves.toMatchObject({ status: "ready" });
    });

    it("rejects (no network call) when the model photo is missing — caller (imageRouter) turns this into a friendly error", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(dispatchGenerate("piapi/kling-try-on", {
        prompt: "",
        garmentImageUrl: "https://cdn.example.com/garment.jpg",
      })).rejects.toThrow(/model_input/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects (no network call) when the garment photo is missing", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(dispatchGenerate("piapi/kling-try-on", {
        prompt: "",
        imageUrl: "https://cdn.example.com/model.jpg",
      })).rejects.toThrow(/衣服照片/);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
