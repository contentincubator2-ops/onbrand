import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;
let store: typeof import("./generatedImageStore");

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "genimg-"));
  process.env.GENERATED_IMAGE_DIR = dir;
  process.env.GENERATED_IMAGE_URL_PREFIX = "/static/generated-images";
  store = await import("./generatedImageStore");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("readGeneratedImage — 只讀得到自己這個品牌、自己存的檔", () => {
  it("寫進去的檔用回傳的網址讀得回來", async () => {
    const url = await store.writeGeneratedImage(7, Buffer.from("png-bytes"));
    expect((await store.readGeneratedImage(7, url))?.toString()).toBe("png-bytes");
  });

  it("別的品牌的網址讀不到", async () => {
    const url = await store.writeGeneratedImage(7, Buffer.from("x"));
    expect(await store.readGeneratedImage(8, url)).toBeNull();
  });

  it.each([
    "/static/generated-images/7/../8/a.png",
    "/static/generated-images/7/..%2F8%2Fa.png",
    "/static/generated-images/7/a.png/../../x.png",
    "/static/generated-images/7/sub/a.png",
    "/static/generated-images/7/a.txt",
    "https://evil.example/static/generated-images/7/a.png",
    "/etc/passwd",
    "",
  ])("不合形狀的網址一律回 null：%s", async (u) => {
    expect(await store.readGeneratedImage(7, u)).toBeNull();
  });

  it("形狀對但檔案不存在回 null，不丟例外", async () => {
    expect(await store.readGeneratedImage(7, "/static/generated-images/7/123-abcdef12.png")).toBeNull();
  });
});
