import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";

vi.mock("./mediaGen", () => ({ dispatchGenerate: vi.fn() }));

import {
  GPT_IMAGE_2,
  NANO_BANANA,
  classifyImageFailure,
  generateStillImage,
  resolveStillImageModel,
  STILL_IMAGE_MODELS,
  toStillImageChoice,
} from "./stillImageModels";
import type { GenResult } from "./mediaGen";

const ready = (modelId: string): GenResult => ({ status: "ready", modelId, url: "/static/covers/a.png" });
const failed = (modelId: string, errorMsg: string): GenResult => ({ status: "failed", modelId, errorMsg });

describe("兩個模型的政策", () => {
  it("只有 gpt-image-2 與 Nano Banana 兩個模型", () => {
    expect([...STILL_IMAGE_MODELS]).toEqual([GPT_IMAGE_2, NANO_BANANA]);
  });

  it.each([
    [undefined, GPT_IMAGE_2],
    ["auto", GPT_IMAGE_2],
    ["gpt-image-2", GPT_IMAGE_2],
    ["openai/gpt-image-2", GPT_IMAGE_2],
    // 已下架的模型 id（舊分頁、舊變體）一律落回預設，不會悄悄變成 Nano Banana
    ["flux-schnell", GPT_IMAGE_2],
    ["piapi/flux-realism", GPT_IMAGE_2],
    ["ideogram-v3", GPT_IMAGE_2],
    ["gpt-image-1", GPT_IMAGE_2],
    ["azure/gpt-image-2", GPT_IMAGE_2],
    ["google/imagen-4-ultra", GPT_IMAGE_2],
    ["nano-banana", NANO_BANANA],
    ["google/nano-banana", NANO_BANANA],
    // 「imagen-3」這個值早在 2026-08-31 起就是用 Nano Banana 跑、也標成 Nano Banana，用戶選的就是它
    ["imagen-3", NANO_BANANA],
  ])("resolveStillImageModel(%s) → %s", (raw, expected) => {
    expect(resolveStillImageModel(raw as any)).toBe(expected);
  });
});

describe("classifyImageFailure", () => {
  it.each([
    ["Your request was rejected by the safety system", "content_policy"],
    ["OpenAI 400: content_policy_violation", "content_policy"],
    ["You exceeded your current quota, please check your plan and billing details", "quota"],
    ["OpenAI 401: Incorrect API key provided", "auth"],
    ["OPENAI_API_KEY missing", "auth"],
    ["OpenAI 429: Rate limit reached", "rate_limit"],
    ["openai/gpt-image-2 timed out after 35000ms", "timeout"],
    ["OpenAI 500: server error", "provider"],
    ["OpenAI no b64", "provider"],
  ])("%s → %s", (msg, kind) => {
    expect(classifyImageFailure(msg)).toBe(kind);
  });
});

describe("generateStillImage：同一個模型、最多重試一次、絕不換模型", () => {
  const fast = { retryDelayMs: 0 };

  it("第一次就成功：只呼叫一次，只用被要求的模型", async () => {
    const dispatch = vi.fn().mockResolvedValue(ready(GPT_IMAGE_2));
    const r = await generateStillImage(undefined, { prompt: "p" }, { dispatch, ...fast });
    expect(r).toMatchObject({ status: "ready", modelId: GPT_IMAGE_2, attempts: 1, url: "/static/covers/a.png" });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]![0]).toBe(GPT_IMAGE_2);
  });

  it("暫時性失敗：用同一個模型自動重試一次，第二次成功就成功", async () => {
    const dispatch = vi.fn()
      .mockResolvedValueOnce(failed(GPT_IMAGE_2, "OpenAI 500: server error"))
      .mockResolvedValueOnce(ready(GPT_IMAGE_2));
    const r = await generateStillImage("gpt-image-2", { prompt: "p" }, { dispatch, ...fast });
    expect(r).toMatchObject({ status: "ready", modelId: GPT_IMAGE_2, attempts: 2 });
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual([GPT_IMAGE_2, GPT_IMAGE_2]);
  });

  it("重試後仍失敗：回報失敗、附上「可改用 Nano Banana」，而且不會自己去跑 Nano Banana", async () => {
    const dispatch = vi.fn().mockResolvedValue(failed(GPT_IMAGE_2, "OpenAI 500: server error"));
    const r = await generateStillImage("gpt-image-2", { prompt: "p" }, { dispatch, ...fast });
    expect(r).toMatchObject({
      status: "failed", modelId: GPT_IMAGE_2, attempts: 2, failureKind: "provider", canSwitchTo: "nano-banana",
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls.every((c) => c[0] === GPT_IMAGE_2)).toBe(true);
  });

  it("丟例外的 adapter 也一樣：不往外丟，當成失敗處理", async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error("network down"));
    const r = await generateStillImage(undefined, { prompt: "p" }, { dispatch, ...fast });
    expect(r).toMatchObject({ status: "failed", attempts: 2, canSwitchTo: "nano-banana" });
    expect(r.errorMsg).toContain("network down");
  });

  it("內容政策／額度／金鑰問題不重試（重試只是再燒一次），仍提供改用 Nano Banana", async () => {
    for (const msg of ["rejected by the safety system", "exceeded your current quota", "OpenAI 401: Incorrect API key"]) {
      const dispatch = vi.fn().mockResolvedValue(failed(GPT_IMAGE_2, msg));
      const r = await generateStillImage(undefined, { prompt: "p" }, { dispatch, ...fast });
      expect(r).toMatchObject({ status: "failed", attempts: 1, canSwitchTo: "nano-banana" });
      expect(dispatch).toHaveBeenCalledTimes(1);
    }
  });

  it("用戶選 Nano Banana：只跑 Nano Banana；它失敗不再提供別的模型", async () => {
    const dispatch = vi.fn().mockResolvedValue(failed(NANO_BANANA, "NanoBanana 500"));
    const r = await generateStillImage("nano-banana", { prompt: "p" }, { dispatch, ...fast });
    expect(r.status).toBe("failed");
    expect(r.modelId).toBe(NANO_BANANA);
    expect(r.canSwitchTo).toBeUndefined();
    expect(dispatch.mock.calls.every((c) => c[0] === NANO_BANANA)).toBe(true);
  });

  it("產品照原樣傳給 adapter（gpt-image-2 靠它走編輯端點）", async () => {
    const dispatch = vi.fn().mockResolvedValue(ready(GPT_IMAGE_2));
    await generateStillImage(undefined, { prompt: "p", imageUrl: "https://x/p.jpg" }, { dispatch, ...fast });
    expect(dispatch.mock.calls[0]![1]).toMatchObject({ imageUrl: "https://x/p.jpg" });
  });

  it("單次逾時：放棄這次呼叫，重試一次，最後回報失敗而不是卡住", async () => {
    const dispatch = vi.fn().mockImplementation(() => new Promise(() => {}));
    const r = await generateStillImage(undefined, { prompt: "p" }, { dispatch, attemptTimeoutMs: 20, retryDelayMs: 0 });
    expect(r).toMatchObject({ status: "failed", attempts: 2, failureKind: "timeout", canSwitchTo: "nano-banana" });
  });
});

// 前端的模型清單（不能 value-import server）跟這裡的政策要對得上——這裡讀原始碼鎖住。
describe("client 模型清單與 server 政策同步", () => {
  const read = (rel: string) => readFileSync(join(__dirname, "../../../../client/src/v2/content/lib", rel), "utf8");

  it("RunPage 選單的值都能對應到 server 的選擇，且順序是預設在前", () => {
    const src = read("runImageModelOptions.ts");
    const values = [...src.matchAll(/value: "([^"]+)"/g)].map((m) => m[1]!);
    expect(values).toEqual(["gpt-image-2", "nano-banana"]);
    expect(values.map((v) => toStillImageChoice(resolveStillImageModel(v)))).toEqual(values);
  });
});
