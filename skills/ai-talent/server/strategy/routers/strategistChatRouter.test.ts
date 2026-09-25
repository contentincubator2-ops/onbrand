/**
 * router 建得起來 —— 這是啟動期的第一道門。見 workbenchRouter.test.ts 的
 * 長註解：procedure 名稱撞到 Function.prototype 成員（apply/call/bind…）
 * 時，tRPC 在 router({}) 建構當下就炸，但 tsc 與單元測試不會發現，直到
 * 伺服器實際啟動才會現形。所以測法是「真的 import 一次，看得到 procedure
 * 名字」。
 */
import { describe, expect, it } from "vitest";
import { strategistChatRouter, buildSystemPrompt } from "./strategistChatRouter";
import type { StrategistDirector } from "../core/strategistDirectory";

/** 最小可用的假總監——只有 roleId 會影響工具引導那一段。 */
const director = (roleId: string, roleLabel: string): StrategistDirector => ({
  agentId: 1, slug: "x", name: "測試", title: "測試", avatarUrl: "",
  bio: null, experience: null, specialty: null, methodology: null,
  industry: null, locale: "tw", alternatives: [],
  roleId: roleId as any, roleLabel, roleLabelEn: roleLabel,
  signatureQuestions: [], signatureQuestionsEn: [], isFallback: false,
});

// 2026-09-25（CJ「他應該要專注在產品相關策略和定位就好，就算是健檢，也是健檢
// 產品策略」）：產品總監把人帶去品牌層的策略健檢＝答非所問，而且畫面上看不出
// 是錯的——只有讀 prompt 才知道。所以這兩條要測。
describe("工具引導依 scope 分開", () => {
  it("品牌總監才拿得到策略監測／健檢的按鈕標記", () => {
    const p = buildSystemPrompt(director("brand_positioning", "品牌定位"), "");
    expect(p).toContain("<<action:open_healthcheck>>");
    expect(p).toContain("<<action:open_monitor>>");
  });

  it("產品總監完全不給那兩顆按鈕，而且被明確擋住", () => {
    for (const roleId of ["product_value_prop", "product_kano", "product_pricing"]) {
      const p = buildSystemPrompt(director(roleId, "產品"), "");
      expect(p).not.toContain("<<action:open_healthcheck>>");
      expect(p).not.toContain("<<action:open_monitor>>");
      expect(p).toContain("不要");      // 「不要把使用者帶去…」那段在
      expect(p).toContain("品牌策略總監");  // 品牌層問題要轉介給誰
    }
  });

  // 2026-09-25（CJ「明明我在此產品中，有寫價格，但是產品顧問，還是重複問我價格，
  // 這不應該發生」）：光把售價塞進脈絡不夠，模型照樣會禮貌性地再問一次。
  it("prompt 明講不要問資料裡已經有的東西", () => {
    for (const roleId of ["brand_positioning", "product_pricing"]) {
      const p = buildSystemPrompt(director(roleId, "測試"), "");
      expect(p).toContain("不要問資料裡已經有的東西");
      expect(p).toContain("覆述");   // 要把採用的數字講回來，使用者才知道他讀到了
    }
  });

  it("沒有指定人設（舊對話）維持品牌那套，不要突然什麼工具都沒有", () => {
    const p = buildSystemPrompt(null, "");
    expect(p).toContain("<<action:open_healthcheck>>");
  });
});

describe("strategistChatRouter", () => {
  it("router 建得起來，而且沒有用到 tRPC 保留字", () => {
    const names = Object.keys((strategistChatRouter as any)._def.procedures);
    // 2026-09-23：加了 listDirectors / searchDirectors（三位真實 mos_db
    // 策略總監的人選清單與搜尋，見 strategistDirectory.ts）。
    expect(names.sort()).toEqual(["getConversation", "listDirectors", "searchDirectors", "sendMessage"]);
  });

  it("procedure 名稱不可以撞 Function.prototype 上的東西", () => {
    const names = Object.keys((strategistChatRouter as any)._def.procedures);
    for (const n of names) {
      expect(Object.getOwnPropertyNames(Function.prototype), `「${n}」是 Function.prototype 的成員，tRPC 會拒絕`)
        .not.toContain(n);
    }
  });
});
