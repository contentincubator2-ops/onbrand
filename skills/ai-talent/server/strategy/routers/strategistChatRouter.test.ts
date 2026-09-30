/**
 * router 建得起來 —— 這是啟動期的第一道門。見 workbenchRouter.test.ts 的
 * 長註解：procedure 名稱撞到 Function.prototype 成員（apply/call/bind…）
 * 時，tRPC 在 router({}) 建構當下就炸，但 tsc 與單元測試不會發現，直到
 * 伺服器實際啟動才會現形。所以測法是「真的 import 一次，看得到 procedure
 * 名字」。
 */
import { describe, expect, it } from "vitest";
import { strategistChatRouter, buildSystemPrompt, copyOpeningText, isStaleOpening } from "./strategistChatRouter";
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
  it("品牌總監才拿得到策略監測的按鈕標記", () => {
    const p = buildSystemPrompt(director("brand_positioning", "品牌定位"), "");
    expect(p).toContain("<<action:open_monitor>>");
  });

  // 2026-09-30（CJ「我要刪除策略健檢的功能」）：功能刪了，總監就不能再推銷它。
  it("任何總監都不再給策略健檢的按鈕", () => {
    for (const roleId of ["brand_positioning", "product_kano", "copy_terms"]) {
      expect(buildSystemPrompt(director(roleId, "測試"), "")).not.toContain("open_healthcheck");
    }
    expect(buildSystemPrompt(null, "")).not.toContain("open_healthcheck");
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
    expect(p).toContain("<<action:open_monitor>>");
  });

  // 2026-09-26：總監在 mos_db 的工作守則／執行卡／Skill 要真的進 prompt，
  // 後台把 agent 補強，產品頁總監才會跟著變強。
  it("帶入這位總監在 mos_db 的工作守則與 Skill", () => {
    const p = buildSystemPrompt(director("product_kano", "產品"), "", "# 工作守則（必讀）\nKANO-守則");
    expect(p).toContain("KANO-守則");
    expect(buildSystemPrompt(null, "", "不該出現")).not.toContain("不該出現");
  });
});

describe("strategistChatRouter", () => {
  it("router 建得起來，而且沒有用到 tRPC 保留字", () => {
    const names = Object.keys((strategistChatRouter as any)._def.procedures);
    // 2026-09-23：加了 listDirectors / searchDirectors（三位真實 mos_db
    // 策略總監的人選清單與搜尋，見 strategistDirectory.ts）。
    expect(names.sort()).toEqual(["getConversation", "history", "listDirectors", "searchDirectors", "sendMessage", "startNew"]);
  });

  it("procedure 名稱不可以撞 Function.prototype 上的東西", () => {
    const names = Object.keys((strategistChatRouter as any)._def.procedures);
    for (const n of names) {
      expect(Object.getOwnPropertyNames(Function.prototype), `「${n}」是 Function.prototype 的成員，tRPC 會拒絕`)
        .not.toContain(n);
    }
  });
});

// 2026-09-26（CJ「用詞總監的第一句歡迎詞，還是…你還沒做過策略健檢——要我帶你
// 去看看嗎？…這一句應該要根據不同頁面調整」）：開場白錯了不會壞畫面，只會讓
// 使用者覺得這個角色根本沒在看他的資料——所以三位的開場要看得出差別，而且
// 一律不准把人帶去品牌層的健檢／監測。
describe("文字頁的開場白", () => {
  const base = { hi: "嗨，我是周佳穎。", en: false, roleLabel: "用詞規範", roleLabelEn: "Word Rules" };
  const counts = (o: Partial<{ preferred: number; banned: number; abbr: number; voice: boolean }> = {}) =>
    ({ preferred: 0, banned: 0, abbr: 0, voice: false, ...o });

  it("三個角色開口講的不是同一件事", () => {
    const out = ["copy_voice", "copy_terms", "copy_industry"].map((roleId) =>
      copyOpeningText({ ...base, roleId, counts: counts() }));
    expect(new Set(out).size).toBe(3);
  });

  it("一律不推銷品牌層的健檢／監測（那是別頁的事，這一頁也沒有那顆按鈕）", () => {
    for (const roleId of ["copy_voice", "copy_terms", "copy_industry"]) {
      for (const c of [counts(), counts({ preferred: 3, banned: 2, abbr: 1, voice: true })]) {
        const t = copyOpeningText({ ...base, roleId, counts: c });
        expect(t, roleId).not.toContain("策略健檢");
        expect(t, roleId).not.toContain("策略監測");
      }
    }
  });

  it("全空時給的是「從禁用詞開始」這種具體起手式，不是通用問候", () => {
    const t = copyOpeningText({ ...base, roleId: "copy_terms", counts: counts() });
    expect(t).toContain("禁用詞");
    expect(t).toContain("三個");
  });

  it("只有禁用詞、沒有推薦用詞時，點出「只禁不給替代」這個缺口", () => {
    const t = copyOpeningText({ ...base, roleId: "copy_terms", counts: counts({ banned: 4 }) });
    expect(t).toContain("4");
    expect(t).toContain("推薦用詞");
  });

  it("三張都有內容時改成「拿你的文案來對一遍」，而且數字是真的", () => {
    const t = copyOpeningText({ ...base, roleId: "copy_terms", counts: counts({ preferred: 5, banned: 3, abbr: 2 }) });
    for (const n of ["5", "3", "2"]) expect(t).toContain(n);
  });

  it("語氣總監看的是 voice 有沒有寫，不是用詞條數", () => {
    const empty = copyOpeningText({ ...base, roleId: "copy_voice", counts: counts({ preferred: 9 }) });
    const filled = copyOpeningText({ ...base, roleId: "copy_voice", counts: counts({ voice: true }) });
    expect(empty).toContain("像哪一種人");
    expect(filled).not.toBe(empty);
  });

  it("英文版也走同一套分支", () => {
    const t = copyOpeningText({ ...base, en: true, roleId: "copy_terms", counts: counts({ banned: 2 }) });
    expect(t).toContain("2");
    expect(t).not.toContain("禁用詞");
  });
});

// 2026-09-26：舊對話裡已經存著品牌版的開場白，改程式不會動到它。重寫的判斷
// 要夠保守——寬鬆一點就會把使用者自己的對話內容也改掉。
describe("舊開場白的重寫判斷", () => {
  const copyDir = director("copy_terms", "用詞規範");
  const brandDir = director("brand_positioning", "品牌定位");
  const msg = (content: string, role = "strategist") => ({ role, content });

  it("用詞總監開口講品牌健檢＝舊版，要重寫", () => {
    expect(isStaleOpening(msg("嗨，我是周佳穎。你還沒做過策略健檢——要我帶你去看看嗎？"), copyDir)).toBe(true);
    expect(isStaleOpening(msg("有 2 則策略監測提醒還沒看——要看一下嗎？"), copyDir)).toBe(true);
  });

  // 2026-09-30：策略健檢刪除後，品牌總監的健檢開場白也過期了；監測那句仍然有效。
  it("品牌總監講健檢＝舊版要重寫，講監測不要動", () => {
    expect(isStaleOpening(msg("你還沒做過策略健檢——要我帶你去看看嗎？"), brandDir)).toBe(true);
    expect(isStaleOpening(msg("有 2 則策略監測提醒還沒看——要看一下嗎？"), brandDir)).toBe(false);
  });

  it("新版的用詞開場白不會被誤判", () => {
    const fresh = copyOpeningText({
      hi: "嗨，我是周佳穎。", en: false, roleId: "copy_terms",
      roleLabel: "用詞規範", roleLabelEn: "Word Rules",
      counts: { preferred: 0, banned: 0, abbr: 0, voice: false },
    });
    expect(isStaleOpening(msg(fresh), copyDir)).toBe(false);
  });

  it("使用者自己的訊息一律不動，沒有訊息也不炸", () => {
    expect(isStaleOpening(msg("幫我看策略健檢的結果", "user"), copyDir)).toBe(false);
    expect(isStaleOpening(undefined, copyDir)).toBe(false);
    expect(isStaleOpening(msg("任何內容"), null)).toBe(false);
  });
});
