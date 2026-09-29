/**
 * 2026-09-29（CJ「圖片卡要讀品牌大腦」）：圖上標題與畫面方向的提案 prompt 要帶到
 * 品牌大腦；沒有大腦時不能多印出空白標題。
 */
import { describe, expect, it, vi } from "vitest";

const seen: any[] = [];
vi.mock("../../platform/core/llm", () => ({
  invokeLLM: async (req: any) => {
    seen.push(req);
    return { choices: [{ message: { content: JSON.stringify({
      headlineZh: "標題",
      directions: [{ id: "a", titleZh: "方向", sceneZh: "場景", paletteZh: "色", whyZh: "因為", promptEn: "scene" }],
    }) } }] };
  },
}));

import { proposeImageDirections } from "./imageCards";

const spec: any = { labelZh: "FB 貼文圖", width: 1080, height: 1080, compositionEn: "centered" };

describe("proposeImageDirections 讀品牌大腦", () => {
  it("有品牌大腦時，使用者訊息帶著它", async () => {
    seen.length = 0;
    await proposeImageDirections({ spec, copy: "文案內容", brand: { brandName: "B" } as any, brainPrefix: "\n[品牌已鎖定屬性]\n- 【Tagline 中】BRAINZZ" });
    const user = seen[0].messages.find((m: any) => m.role === "user").content;
    expect(user).toContain("BRAINZZ");
    expect(user).toContain("品牌大腦");
  });

  it("沒有品牌大腦時不多印大腦段落", async () => {
    seen.length = 0;
    await proposeImageDirections({ spec, copy: "文案內容", brand: { brandName: "B" } as any });
    const user = seen[0].messages.find((m: any) => m.role === "user").content;
    expect(user).not.toContain("品牌大腦");
  });
});
