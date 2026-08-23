/**
 * TikTok 任務池結構檢查。
 *
 * 2026-08-23：新增 5 張「高互動機制」腳本卡時寫的。這裡驗的是整個池子的
 * 不變量，不是那 5 張的內容 —— 任何人之後再加卡，漏掉 orchestra config 或
 * 把 variantLabels 數量寫錯，都會在這裡被擋下來（那兩種漏法在 UI 上的
 * 症狀是「任務跑完只出 1 版」或「分頁點下去是空的」，很難回溯）。
 */
import { describe, it, expect } from "vitest";
import { TT_30S_TASKS, TT_30S_ORCHESTRA, getTTOrchestraConfig } from "./quickTaskTikTok";

const MECHANIC_CARDS = [
  "tt-30-visual-illusion",
  "tt-30-process-payoff",
  "tt-30-beat-sync",
  "tt-30-scale-reveal",
  "tt-30-real-reaction",
] as const;

describe("TikTok task pool invariants", () => {
  it.each(TT_30S_TASKS.map((t) => t.id))("%s has an orchestra config", (id) => {
    expect(getTTOrchestraConfig(id)).toBeTruthy();
  });

  it.each(TT_30S_TASKS.map((t) => t.id))("%s declares one label per variant", (id) => {
    const c = TT_30S_ORCHESTRA[id]!;
    expect(c.variantLabels?.length).toBe(c.variants);
  });

  it("every config key still maps to a real task (no orphan configs)", () => {
    const ids = new Set(TT_30S_TASKS.map((t) => t.id));
    for (const key of Object.keys(TT_30S_ORCHESTRA)) expect(ids.has(key)).toBe(true);
  });

  it.each(TT_30S_TASKS.map((t) => t.id))("%s asks exactly one question", (id) => {
    // intake 只送 primary_input 一格，宣告更多 required 欄位等於把任務擋死。
    const t = TT_30S_TASKS.find((x) => x.id === id)!;
    const extraRequired = (t.inputs ?? [])
      .filter((f: any) => f.required)
      .map((f: any) => f.key)
      .filter((k: string) => k !== t.primary_input?.key);
    expect(extraRequired).toEqual([]);
  });
});

describe("卡片命名 — 使用者掃過卡牆時要看得出「這會給我一份腳本」", () => {
  // 2026-08-23 (CJ 看到上線後的卡牆：「看起來也不像是腳本類型，一秒反轉、
  // 從無到有滿足短片，看起來都不好懂」)。同一面牆上好懂的卡長這樣：
  //   TikTok 完整腳本（30-60s） / hook → reveal → 3 段內容 → CTA
  //   IG 直播 30 分鐘流程腳本   / 6 個時間段的完整直播範本：…
  // 規則 = 標題寫「平台 + 交付物（規格）」，副標寫「裡面有什麼」。
  // 原本的命名是機制的比喻（一秒反轉短片），副標在講原理（觀眾為了看懂而
  // 重播）—— 整張卡沒有一個字說「你會拿到腳本」。
  it.each(MECHANIC_CARDS)("%s names the platform and the deliverable", (id) => {
    const t = TT_30S_TASKS.find((x) => x.id === id)!;
    const zh = typeof t.label === "string" ? t.label : t.label.zh;
    expect(zh.startsWith("TikTok ")).toBe(true);
    expect(zh).toContain("腳本");
  });

  it.each(MECHANIC_CARDS)("%s says what is inside the deliverable", (id) => {
    const t = TT_30S_TASKS.find((x) => x.id === id)!;
    const zh = typeof t.description === "string" ? t.description : t.description.zh;
    // 副標必須點出交付物的組成（畫面／動作／字卡…），不能只描述原理。
    expect(zh).toMatch(/畫面|拍點|字卡/);
  });
});

describe("高互動機制腳本卡", () => {
  it.each(MECHANIC_CARDS)("%s exists in the 30s pool", (id) => {
    expect(TT_30S_TASKS.some((t) => t.id === id)).toBe(true);
  });

  it.each(MECHANIC_CARDS)("%s is written for the person holding the phone", (id) => {
    // 2026-08-23 (CJ「我要」— 要求產出比照 IG 直播腳本的可執行程度)。
    // 直播腳本好用是因為它有「開播前 24 小時預熱」與「3 個備答」這種
    // 拿了就能做的東西。無台詞短片的對應物 = 開拍前準備清單 + 失敗點。
    const t = TT_30S_TASKS.find((x) => x.id === id)!;
    expect(t.systemPrompt).toContain("讀的人是誰");
    expect(t.systemPrompt).toContain("【開拍前準備】");
    expect(t.systemPrompt).toContain("【最容易拍壞的地方】");
    // 器材／場地／道具／人力 四項缺一項，拍的人就得自己補，等於不能照做
    for (const item of ["器材", "場地", "道具", "人力"]) {
      expect(t.systemPrompt).toContain(item);
    }
  });

  it.each(MECHANIC_CARDS)("%s caps the shot count so the two blocks fit", (id) => {
    // 2026-08-23 VM probe：沒有格數上限時模型寫了 10-12 格，token 燒光，
    // 兩個新區塊一個都沒寫出來，變體 0 還在句子中間被截斷、變體 1 直接
    // 超過 40 秒預算。格數上限是這批卡能不能交付完整的前提。
    const t = TT_30S_TASKS.find((x) => x.id === id)!;
    expect(t.systemPrompt).toContain("5-7 格");
    expect(t.maxTokens).toBeGreaterThanOrEqual(2000);
  });

  it.each(MECHANIC_CARDS)("%s shows what 'specific enough' looks like", (id) => {
    // 光說「要具體」沒有用，實測模型會寫「畫面：廚房場景」。要給好壞對照。
    const t = TT_30S_TASKS.find((x) => x.id === id)!;
    expect(t.systemPrompt).toMatch(/✗[\s\S]*✓/);
  });

  it.each(MECHANIC_CARDS)("%s writes a shot list, not a voiceover script", (id) => {
    const t = TT_30S_TASKS.find((x) => x.id === id)!;
    // 這五條鐵律是這批卡的全部價值所在（零台詞 / 視覺鉤子 / 單一滿足點 /
    // 卡拍點 / 可循環）。少了共用區塊，模型會退回寫旁白稿。
    expect(t.systemPrompt).toContain("零台詞");
    expect(t.systemPrompt).toContain("可循環");
    expect(t.systemPrompt).toContain("字卡：");
    expect(t.systemPrompt).toContain("{label}"); // per-variant 切角有被帶入
  });

  it.each(MECHANIC_CARDS)("%s costs nothing in image credits", (id) => {
    const c = TT_30S_ORCHESTRA[id]!;
    expect(c.runImageGen).toBe(false);
    expect(c.images).toBe(0);
  });

  it("uses ids that route to the TikTok For You mockup", () => {
    // RunPage.formatFromTaskId / inferMockup 都是關鍵字比對，命中任何一個
    // 早期規則就會把腳本渲染成 Stories、直播、輪播…。這些字串是那兩份
    // 比對表裡會搶在 `tt-` 之前命中的，新 id 不能踩到。
    const HIJACKING_SUBSTRINGS = [
      "story", "reel", "live", "carousel", "profile", "bio", "comment", "pinned",
      "calendar", "thumbnail", "shorts", "community", "article", "newsletter",
      "poll", "document", "speech", "faq", "about",
    ];
    for (const id of MECHANIC_CARDS) {
      const hits = HIJACKING_SUBSTRINGS.filter((kw) => id.includes(kw));
      expect(hits, `${id} would be routed away from the TikTok mockup`).toEqual([]);
    }
  });
});
