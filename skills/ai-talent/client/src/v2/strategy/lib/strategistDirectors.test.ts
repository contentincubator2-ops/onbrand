/**
 * scopeFromUrl 的測試。
 *
 * 2026-09-24（CJ：「右下方，還是寫著策略總監，沒有更換成產品的專家」）：第一版
 * 只認 `?p=`（單一產品頁），所以站在**產品清單頁**（`cat=products`）時，右下角
 * 掛的還是品牌定位總監——那一頁從頭到尾在談產品，配一位品牌策略師就是答非所問。
 *
 * 這個判斷錯了，畫面上不會有任何錯誤訊息（只是換了個人回答），所以要測。
 */
import { describe, it, expect } from "vitest";
import { channelAdvisorLabel, scopeFromUrl } from "./strategistDirectors";

describe("scopeFromUrl", () => {
  it("單一產品頁（?p=）是產品情境", () => {
    expect(scopeFromUrl({ p: "152", cat: "positioning" })).toBe("product");
  });

  it("產品清單頁（cat=products）也是產品情境 —— 這就是 CJ 回報的那一頁", () => {
    expect(scopeFromUrl({ p: null, cat: "products" })).toBe("product");
  });

  // 2026-09-26（CJ「要從 mos_db 當中，選擇三個負責這一頁的 agent」）：文字頁
  // 從此有自己的三位（語氣／用詞規範／產業用語），不再借用品牌那三位。
  it("文字頁（cat=copy）是用詞情境", () => {
    expect(scopeFromUrl({ p: null, cat: "copy" })).toBe("copy");
  });

  it("文字頁即使網址上還留著 ?p= 也還是用詞情境（使用者剛從產品頁切過來）", () => {
    expect(scopeFromUrl({ p: "152", cat: "copy" })).toBe("copy");
  });

  it("品牌定位、視覺這些頁面維持品牌情境", () => {
    for (const cat of ["positioning", "visual", "knowledge", "events", "tools", null]) {
      expect(scopeFromUrl({ p: null, cat })).toBe("brand");
    }
  });

  it("壞掉的 ?p= 不能被當成產品情境（0、負數、非數字）", () => {
    for (const p of ["0", "-1", "abc", "", null, undefined]) {
      expect(scopeFromUrl({ p, cat: "positioning" })).toBe("brand");
    }
  });

  it("兩個條件同時成立也還是產品情境（不會互相抵消）", () => {
    expect(scopeFromUrl({ p: "152", cat: "products" })).toBe("product");
  });
});

describe("scopeFromUrl — Facebook 任務頁", () => {
  it("/tasks/fb 是 facebook，就算網址上留著 ?p= 或 cat", () => {
    expect(scopeFromUrl({ path: "/tasks/fb", p: null, cat: null })).toBe("facebook");
    expect(scopeFromUrl({ path: "/tasks/fb", p: "152", cat: "copy" })).toBe("facebook");
  });
  it("其他內容頁與品牌頁照舊", () => {
    expect(scopeFromUrl({ path: "/brands/edit", p: null, cat: "copy" })).toBe("copy");
  });
});

describe("通路頁 scope 與標籤（2026-09-27：FB 到官網）", () => {
  it("每個內容層通路路由都對到自己的 scope", () => {
    const cases: Array<[string, string]> = [
      ["/tasks/fb", "facebook"], ["/tasks/ig", "instagram"], ["/tasks/li", "linkedin"], ["/tasks/yt", "youtube"],
      ["/tasks/tt", "tiktok"], ["/tasks/email", "email"], ["/tasks/pr", "pr"], ["/tasks/x", "x"], ["/tasks/web", "website"],
    ];
    for (const [path, scope] of cases) expect(scopeFromUrl({ path, p: null, cat: null })).toBe(scope);
  });
  it("案例、行事曆等不是通路的內容頁照舊", () => {
    expect(scopeFromUrl({ path: "/tasks/case", p: null, cat: null })).toBe("brand");
    expect(scopeFromUrl({ path: "/tasks/calendar", p: null, cat: null })).toBe("brand");
  });
  it("右下角標籤：英數通路名留空格，中文通路名不留", () => {
    expect(channelAdvisorLabel("facebook", false)).toBe("FB 顧問");
    expect(channelAdvisorLabel("email", false)).toBe("電子報顧問");
    expect(channelAdvisorLabel("website", false)).toBe("官網顧問");
    expect(channelAdvisorLabel("pr", true)).toBe("PR Advisors");
  });
});
