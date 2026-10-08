import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchImageBufferMock, putMock, getMock, readFileMock } = vi.hoisted(() => ({
  fetchImageBufferMock: vi.fn(),
  putMock: vi.fn(),
  getMock: vi.fn(),
  readFileMock: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ readFile: readFileMock }));
vi.mock("./mediaStore", async (importOriginal) => ({
  ...await importOriginal<typeof import("./mediaStore")>(),
  getMediaStore: () => ({ put: putMock, get: getMock }),
}));

vi.mock("./imageFetch", () => ({
  fetchImageBuffer: fetchImageBufferMock,
}));

import { coverFilePath, dispatchGenerate, readCoverBytes, saveCoverFile } from "./mediaGen";

describe("mediaGen image provider request contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    putMock.mockImplementation(async (name) => `https://media.example.com/covers/${name}`);
    vi.unstubAllGlobals();
    vi.stubEnv("GEMINI_API_KEY", "test-google-key");
    vi.stubEnv("GEMINI_API_KEY_POOL", "");
    vi.stubEnv("GOOGLE_AI_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
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

  // 2026-09-21（CJ「不論是否有產品圖，都只用 gpt image 2」）：有參考圖走 /images/edits，
  // 實測同一張香水瓶照片標籤文字完整；gpt-image-2 不吃 input_fidelity（400）。
  describe("openai/gpt-image-2 with a reference photo", () => {
    const ok = () => new Response(JSON.stringify({ data: [{ b64_json: "aW1hZ2U=" }] }), { status: 200 });

    it("posts multipart to /images/edits with the photo as image[], and never sends input_fidelity or quality", async () => {
      fetchImageBufferMock.mockResolvedValue({ buffer: Buffer.from("not-a-real-image"), mime: "image/webp" });
      const fetchMock = vi.fn(async () => ok());
      vi.stubGlobal("fetch", fetchMock);

      await expect(dispatchGenerate("openai/gpt-image-2", {
        prompt: "put this bottle on a mossy rock", aspectRatio: "16:9",
        imageUrl: "https://example.com/bottle.webp",
      })).resolves.toMatchObject({ status: "ready", modelId: "openai/gpt-image-2" });

      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.openai.com/v1/images/edits");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-openai-key");
      expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined(); // fetch sets the multipart boundary
      const form = init.body as FormData;
      expect(form.get("model")).toBe("gpt-image-2");
      expect(form.get("prompt")).toBe("put this bottle on a mossy rock");
      expect(form.get("size")).toBe("1536x1024");
      expect(form.get("n")).toBe("1");
      expect(form.has("input_fidelity")).toBe(false);
      expect(form.has("quality")).toBe(false);
      const file = form.get("image[]") as File;
      expect(file.name).toBe("reference.webp");
      expect(file.type).toBe("image/webp");
    });

    it("still sends an explicitly requested quality", async () => {
      fetchImageBufferMock.mockResolvedValue({ buffer: Buffer.from("x"), mime: "image/png" });
      const fetchMock = vi.fn(async () => ok());
      vi.stubGlobal("fetch", fetchMock);
      await dispatchGenerate("openai/gpt-image-2", { prompt: "p", imageUrl: "https://e/x.png", quality: "medium" });
      expect(((fetchMock.mock.calls[0] as any)[1].body as FormData).get("quality")).toBe("medium");
    });

    it("surfaces the provider error (e.g. no credits) instead of hiding it", async () => {
      fetchImageBufferMock.mockResolvedValue({ buffer: Buffer.from("x"), mime: "image/png" });
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "You have no credits remaining." } }), { status: 429 })));
      await expect(dispatchGenerate("openai/gpt-image-2", { prompt: "p", imageUrl: "https://e/x.png" }))
        .rejects.toThrow(/OpenAI 429.*no credits/);
    });
  });

  it.each([
    ["openai/gpt-image-2", "4:3", "1536x1024"],
    ["openai/gpt-image-2", "3:4", "1024x1536"],
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

  // 2026-09-21 (CJ「其他的 MODEL 都不需要了」): only gpt-image-2, Nano Banana and the
  // garment try-on task have adapters. A retired id must fail loudly, not run something else.
  it.each([
    "openai/gpt-image-1", "azure/gpt-image-2", "google/imagen-4-default", "hailuo/image",
    "fal/flux-dev", "piapi/flux-schnell", "piapi/flux-realism", "piapi/ideogram-v3", "piapi/sd-3-5-large",
  ])("has no adapter for the retired model %s", async (modelId) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(dispatchGenerate(modelId, { prompt: "scene" }))
      .resolves.toMatchObject({ status: "failed", errorMsg: `Unknown modelId: ${modelId}` });
    expect(fetchMock).not.toHaveBeenCalled();
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

      // 供應商回來的圖要先驗證是真的圖，才存檔
      expect(fetchImageBufferMock).toHaveBeenCalledWith("https://cdn.piapi.ai/tryon-result.png", { timeoutMs: 60_000 });
      expect(putMock).toHaveBeenCalledWith(expect.stringMatching(/^media-img-.*\.png$/), Buffer.from("tryon-image"), "image/png");
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


afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("mediaGen storage", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it.each([["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["webp", "image/webp"], ["mp4", "video/mp4"]])(
    "saves %s through the store and awaits the returned URL", async (ext, mime) => {
      const bytes = Buffer.from("cover");
      const url = `https://media.example.com/covers/sample.${ext}`;
      putMock.mockResolvedValue(url);
      await expect(saveCoverFile(bytes, `sample.${ext}`)).resolves.toBe(url);
      expect(putMock).toHaveBeenCalledWith(`sample.${ext}`, bytes, mime);
    });
  it("saves provider base64 through the store", async () => {
    // Provider auth is supplied at runtime only; no new credential fixtures.
    vi.stubEnv("OPENAI_API_KEY", crypto.randomUUID());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: "aW1hZ2U=" }] }))));
    putMock.mockResolvedValue("https://media.example.com/covers/generated.png");
    await expect(dispatchGenerate("openai/gpt-image-2", { prompt: "scene" })).resolves.toMatchObject({
      url: "https://media.example.com/covers/generated.png",
    });
    expect(putMock).toHaveBeenCalledWith(expect.stringMatching(/^media-img-.*\.png$/), Buffer.from("image"), "image/png");
  });
  it("reads the store first without touching disk", async () => {
    getMock.mockResolvedValue(Buffer.from("blob"));
    await expect(readCoverBytes("https://media.example.com/covers/a.png")).resolves.toEqual(Buffer.from("blob"));
    expect(getMock).toHaveBeenCalledWith("https://media.example.com/covers/a.png");
    expect(readFileMock).not.toHaveBeenCalled();
  });
  it("falls back to the legacy local path only after a store miss", async () => {
    getMock.mockResolvedValue(null);
    readFileMock.mockResolvedValue(Buffer.from("old cover"));
    const url = `${process.env.COVERS_URL_PREFIX ?? "/static/covers"}/old.png`;
    await expect(readCoverBytes(url)).resolves.toEqual(Buffer.from("old cover"));
    expect(readFileMock).toHaveBeenCalledWith(coverFilePath(url));
    expect(getMock.mock.invocationCallOrder[0]).toBeLessThan(readFileMock.mock.invocationCallOrder[0]!);
  });
  it("returns null for unknown URLs and missing legacy files", async () => {
    getMock.mockResolvedValue(null);
    await expect(readCoverBytes("https://other.example.com/a.png")).resolves.toBeNull();
    expect(readFileMock).not.toHaveBeenCalled();
    readFileMock.mockRejectedValue({ code: "ENOENT" });
    await expect(readCoverBytes(`${process.env.COVERS_URL_PREFIX ?? "/static/covers"}/missing.png`)).resolves.toBeNull();
  });
  it("propagates store failures without falling back to stale local bytes", async () => {
    getMock.mockRejectedValue(new Error("storage unavailable"));
    await expect(readCoverBytes("/static/covers/a.png")).rejects.toThrow("storage unavailable");
    expect(readFileMock).not.toHaveBeenCalled();
  });
});
