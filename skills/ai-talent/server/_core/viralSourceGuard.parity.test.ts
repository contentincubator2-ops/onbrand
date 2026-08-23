/**
 * 鏡像防漂移測試 — server/_core/viralSourceGuard.ts 與
 * client/src/v2/lib/viralSourceGuard.ts 必須給出一模一樣的判斷與訊息。
 *
 * 兩份不能互相 import（client 的 vite root 是 client/，跨出去在 dev server
 * 會被 fs.allow 擋掉），所以用測試把它們綁在一起：改了一邊沒改另一邊就會紅。
 * 前例：inferMockup.ts 與 RunPage.tsx 兩份沒同步的關鍵字比對表。
 */
import { describe, it, expect } from "vitest";
import { checkViralSource as serverCheck } from "./viralSourceGuard";
import { checkViralSource as clientCheck } from "../../client/src/v2/lib/viralSourceGuard";

const CASES: Array<string | null | undefined> = [
  "", "   ", "  　 ", null, undefined,
  "無", "沒有", "不知道", "隨便", "都可以", "你決定", "跳過", "test", "N/A", "none", "。。。", "---",
  "爆款", "爆款連結", "主題", "tiktok", "url",
  "美食", "grwm", "abc", "🔥🔥🔥",
  "下班後 10 分鐘快煮那支", "超商減脂餐開箱", "get ready with me winter edition",
  "https://www.tiktok.com/@someone/video/7412345678901234567",
  "vt.tiktok.com/ZSAbCdEfG/",
  "www.instagram.com/reel/Cxyz123/",
  "這支 https://vt.tiktok.com/ZSAbCdEfG/ 我想改成我們的版本",
  "不知道算不算爆款，就是那支「租屋處小廚房」的影片",
];

describe("viralSourceGuard parity (server ↔ client mirror)", () => {
  it.each(CASES)("agrees on %j", (value) => {
    expect(clientCheck(value)).toEqual(serverCheck(value));
  });

  it("agrees on the platform-labelled message too", () => {
    for (const value of CASES) {
      expect(clientCheck(value, { platformLabel: "TikTok" }))
        .toEqual(serverCheck(value, { platformLabel: "TikTok" }));
    }
  });
});
