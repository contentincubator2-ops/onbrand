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
import { advisorLabelOf, channelAdvisorLabel, isAdvisorHiddenPath, scopeFromUrl } from "./strategistDirectors";

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

  // 2026-10-01：視覺、活動改成自己的顧問（見檔尾「逐頁對照」）；其餘品牌層頁面維持品牌情境。
  it("品牌定位這類頁面維持品牌情境", () => {
    for (const cat of ["positioning", "knowledge", "tools", null]) {
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
      ["/tasks/fb", "facebook"], ["/tasks/ig", "instagram"],
      ["/tasks/tt", "tiktok"], ["/tasks/email", "email"], ["/tasks/web", "website"],
    ];
    for (const [path, scope] of cases) expect(scopeFromUrl({ path, p: null, cat: null })).toBe(scope);
  });
  // 2026-09-29（CJ）：內容通路只剩 FB／IG／TikTok／電子報／官網，其餘路由不再有通路顧問。
  it("已下架的通路（LinkedIn／YouTube／新聞稿／X）不再對到通路 scope", () => {
    for (const path of ["/tasks/li", "/tasks/yt", "/tasks/pr", "/tasks/x"]) {
      expect(scopeFromUrl({ path, p: null, cat: null })).toBe("brand");
    }
  });
  // 2026-10-01：案例／行事曆原本落回品牌策略總監，改成內容企劃顧問。
  it("案例、行事曆等不是通路的內容頁走內容企劃顧問", () => {
    expect(scopeFromUrl({ path: "/tasks/case", p: null, cat: null })).toBe("content");
    expect(scopeFromUrl({ path: "/tasks/calendar", p: null, cat: null })).toBe("content");
  });
  it("右下角標籤：英數通路名留空格，中文通路名不留", () => {
    expect(channelAdvisorLabel("facebook", false)).toBe("FB 顧問");
    expect(channelAdvisorLabel("email", false)).toBe("電子報顧問");
    expect(channelAdvisorLabel("website", false)).toBe("官網顧問");
    expect(channelAdvisorLabel("tiktok", true)).toBe("TikTok Advisors");
  });
});

/**
 * 2026-10-01（CJ「檢查每個頁面右下方的 ai agent，都符合該頁面的需求」）：逐頁比對表。
 * 每一列是一個真實路由；改路由或加頁面時這張表會擋住「默默落回品牌策略總監」。
 */
describe("逐頁對照：每頁右下角是哪一組顧問", () => {
  const rows: Array<[string, { path: string; cat?: string; p?: string; e?: string }, string]> = [
    ["品牌定位", { path: "/brands/edit", cat: "positioning" }, "brand"],
    ["基本資料", { path: "/brands/edit", cat: "info" }, "brand"],
    ["記憶", { path: "/brands/edit", cat: "brain" }, "brand"],
    ["產品清單", { path: "/brands/edit", cat: "products" }, "product"],
    ["單一產品", { path: "/brands/edit", p: "152" }, "product"],
    ["文字", { path: "/brands/edit", cat: "copy" }, "copy"],
    ["人設", { path: "/brands/edit", cat: "persona" }, "copy"],
    ["視覺", { path: "/brands/edit", cat: "visual" }, "visual"],
    ["法規", { path: "/brands/edit", cat: "regulations" }, "regulations"],
    ["活動清單", { path: "/brands/edit", cat: "events" }, "events"],
    ["單一活動（綁了產品）", { path: "/brands/edit", e: "41", p: "152" }, "events"],
    ["Threads", { path: "/tasks/threads" }, "threads"],
    ["LINE", { path: "/tasks/line" }, "line"],
    ["本週企劃", { path: "/planner" }, "content"],
    ["靈感舞台", { path: "/inspiration" }, "content"],
    ["網紅切角", { path: "/influencers" }, "influencer"],
    ["專案", { path: "/projects" }, "content"],
    ["我的任務卡", { path: "/my-cards" }, "content"],
    ["產出頁", { path: "/run/123" }, "content"],
    ["圖片卡", { path: "/image/ig-1x1" }, "content"],
    ["審核", { path: "/review" }, "content"],
    ["內容層活動", { path: "/campaigns" }, "events"],
    ["成效總覽", { path: "/performance/overview" }, "performance"],
    ["成效歸因", { path: "/performance/attribution" }, "performance"],
    ["成效活動", { path: "/performance/campaign" }, "performance"],
  ];
  for (const [name, q, want] of rows) {
    it(`${name} → ${want}`, () => {
      expect(scopeFromUrl({ path: q.path, cat: q.cat ?? null, p: q.p ?? null, e: q.e ?? null })).toBe(want);
    });
  }
  it("設定／後台／更新紀錄／品牌連線設定不掛顧問；一般頁面照掛", () => {
    for (const p of ["/settings/account", "/settings/workspace", "/admin/errors", "/admin/user/3", "/changelog", "/brands/settings"]) {
      expect(isAdvisorHiddenPath(p), p).toBe(true);
    }
    for (const p of ["/brands/edit", "/brands", "/tasks/fb", "/performance/overview", "/planner", "/home"]) {
      expect(isAdvisorHiddenPath(p), p).toBe(false);
    }
  });
  it("標籤跟著頁面換字", () => {
    expect(advisorLabelOf("threads", false)).toBe("Threads 顧問");
    expect(advisorLabelOf("line", false)).toBe("LINE 顧問");
    expect(advisorLabelOf("performance", false)).toBe("成效顧問");
    expect(advisorLabelOf("regulations", true)).toBe("Compliance Advisors");
    expect(advisorLabelOf("brand", false)).toBe("策略總監");
  });
});
