import { describe, expect, it } from "vitest";
import { applyVariantImageUpdate, MAX_IMAGE_VERSIONS, selectVariantImageVersion } from "./variantImageUpdate";

const T1 = "2026-09-21T01:00:00.000Z";
const T2 = "2026-09-21T02:00:00.000Z";

describe("applyVariantImageUpdate", () => {
  it("replaces stale flat prompts together with the nested image prompt", () => {
    const result = applyVariantImageUpdate({
      image: {
        style: "既有風格方向",
        prompt: "old nested prompt",
        promptZh: "舊的巢狀指令",
        url: "https://example.com/old.png",
        status: "ready",
      },
      imagePrompt: "old flat prompt",
      imagePromptZh: "舊的平面指令",
      imageUrl: "https://example.com/old.png",
    }, {
      imageUrl: "https://example.com/new.png",
      prompt: "new model prompt",
      promptZh: "新的使用者指令",
      modelId: "gpt-image-2",
      requestedModelId: "gpt-image-2",
    });

    expect(result.image).toMatchObject({
      style: "既有風格方向",
      prompt: "new model prompt",
      promptZh: "新的使用者指令",
      url: "https://example.com/new.png",
      status: "ready",
    });
    expect(result).toMatchObject({
      imagePrompt: "new model prompt",
      imagePromptZh: "新的使用者指令",
      imageUrl: "https://example.com/new.png",
      imageStatus: "ready",
      imageModelId: "gpt-image-2",
      imageRequestedModelId: "gpt-image-2",
    });
  });

  it("preserves legacy flat visual metadata when no replacement is supplied", () => {
    const result = applyVariantImageUpdate({
      imageStyle: "legacy direction",
      imagePrompt: "legacy model prompt",
      imagePromptZh: "舊版中文指令",
    }, {
      imageUrl: "/static/covers/new.png",
    });

    expect(result.image).toMatchObject({
      style: "legacy direction",
      prompt: "legacy model prompt",
      promptZh: "舊版中文指令",
    });
    expect(result.imagePrompt).toBe("legacy model prompt");
  });
});

describe("圖片版本：換掉的圖留著，可以切回去", () => {
  const generated = {
    image: {
      url: "/static/covers/a.png", status: "ready", style: "風格",
      prompt: "prompt A", promptZh: "指令 A", modelId: "openai/gpt-image-2", requestedModelId: "openai/gpt-image-2",
    },
    imageUrl: "/static/covers/a.png", imageStatus: "ready",
  };

  it("換一張新圖：舊圖連同它的 prompt 與模型進版本紀錄，現用圖是新的", () => {
    const b = applyVariantImageUpdate(generated, {
      imageUrl: "/static/covers/b.png", prompt: "prompt B", promptZh: "指令 B",
      modelId: "google/nano-banana", requestedModelId: "google/nano-banana",
    }, T1);
    expect(b.imageUrl).toBe("/static/covers/b.png");
    expect(b.image.versions).toEqual([{
      url: "/static/covers/a.png", prompt: "prompt A", promptZh: "指令 A",
      modelId: "openai/gpt-image-2", requestedModelId: "openai/gpt-image-2", savedAt: T1,
    }]);
    expect(b.imageVersions).toEqual(b.image.versions); // 舊資料讀的平面欄位同步
  });

  it("連續換圖：新的排前面，每張都留著", () => {
    const b = applyVariantImageUpdate(generated, { imageUrl: "/static/covers/b.png" }, T1);
    const c = applyVariantImageUpdate(b, { imageUrl: "/static/covers/c.png" }, T2);
    expect(c.image.versions.map((v: any) => v.url)).toEqual(["/static/covers/b.png", "/static/covers/a.png"]);
  });

  it("切回舊的一張：不用重生，舊圖的 prompt 與模型一起回來，被換下的圖成為版本，可以再切回去", () => {
    const b = applyVariantImageUpdate(generated, {
      imageUrl: "/static/covers/b.png", prompt: "prompt B", promptZh: "指令 B", modelId: "google/nano-banana",
    }, T1);

    const back = selectVariantImageVersion(b, "/static/covers/a.png", T2)!;
    expect(back.imageUrl).toBe("/static/covers/a.png");
    expect(back.image).toMatchObject({
      url: "/static/covers/a.png", status: "ready",
      prompt: "prompt A", promptZh: "指令 A", modelId: "openai/gpt-image-2", style: "風格",
    });
    expect(back).toMatchObject({ imagePrompt: "prompt A", imageModelId: "openai/gpt-image-2", imageStatus: "ready" });
    expect(back.image.versions.map((v: any) => v.url)).toEqual(["/static/covers/b.png"]);
    expect(back.image.versions[0]).toMatchObject({ prompt: "prompt B", modelId: "google/nano-banana" });

    // 再切回 B：兩張圖來回，沒有任何一張消失
    const again = selectVariantImageVersion(back, "/static/covers/b.png", T2)!;
    expect(again.imageUrl).toBe("/static/covers/b.png");
    expect(again.image.versions.map((v: any) => v.url)).toEqual(["/static/covers/a.png"]);
  });

  it("不是這個變體的版本：拒絕（回 null），不會憑空換上任意網址", () => {
    expect(selectVariantImageVersion(generated, "/static/covers/other.png")).toBeNull();
    expect(selectVariantImageVersion(generated, "https://evil.example/x.png")).toBeNull();
  });

  it("同一張圖重複套用不會在版本裡出現兩次，也不會把現用圖放進版本", () => {
    const again = applyVariantImageUpdate(generated, { imageUrl: "/static/covers/a.png" }, T1);
    expect(again.image.versions).toEqual([]);
  });

  it("失敗的格子（沒有圖）被新圖取代：不會把空白放進版本，也清掉失敗狀態", () => {
    const failedSlot = {
      image: { url: null, status: "failed", errorMsg: "boom", canSwitchTo: "nano-banana", prompt: "p" },
      imageStatus: "failed",
    };
    const r = applyVariantImageUpdate(failedSlot, { imageUrl: "/static/covers/n.png", modelId: "google/nano-banana" }, T1);
    expect(r.image.versions).toEqual([]);
    expect(r.image.status).toBe("ready");
    expect(r.image.errorMsg).toBeUndefined();
    expect(r.image.canSwitchTo).toBeUndefined();
  });

  it("失敗後補產出的圖之前，原本成功的舊圖不會被失敗紀錄蓋掉", () => {
    // 現用圖失敗時沒有 url，所以舊圖只存在於版本中；再產一張成功後，舊版本仍在
    const withHistory = { ...generated, image: { ...generated.image, url: null, status: "failed", versions: [{ url: "/static/covers/old.png", prompt: null, promptZh: null, modelId: null, requestedModelId: null, savedAt: T1 }] }, imageUrl: null, imageStatus: "failed" };
    const r = applyVariantImageUpdate(withHistory, { imageUrl: "/static/covers/n.png" }, T2);
    expect(r.image.versions.map((v: any) => v.url)).toEqual(["/static/covers/old.png"]);
  });

  it(`版本最多留 ${MAX_IMAGE_VERSIONS} 張，最舊的先掉`, () => {
    let item: Record<string, any> = generated;
    for (let i = 0; i < MAX_IMAGE_VERSIONS + 5; i++) {
      item = applyVariantImageUpdate(item, { imageUrl: `/static/covers/n${i}.png` }, T1);
    }
    expect(item.image.versions).toHaveLength(MAX_IMAGE_VERSIONS);
    expect(item.image.versions[0].url).toBe(`/static/covers/n${MAX_IMAGE_VERSIONS + 3}.png`);
  });

  it("超大的內嵌 base64 舊圖不複製進版本（避免一列資料膨脹），一般網址照留", () => {
    const huge = { ...generated, imageUrl: `data:image/png;base64,${"A".repeat(1_600_000)}`, image: { ...generated.image, url: `data:image/png;base64,${"A".repeat(1_600_000)}` } };
    const r = applyVariantImageUpdate(huge, { imageUrl: "/static/covers/new.png" }, T1);
    expect(r.image.versions).toEqual([]);
  });
});
