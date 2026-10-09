import { describe, expect, it } from "vitest";
import {
  BLANK, PROPOSAL_SECTIONS, adBudgetTemplate, alignPrompt, cleanAlignment, cleanRevised, revisePrompt, aiSections, budgetTemplate, cleanProposalSections, cleanSavedSections, outputPlainText, phaseNameOf, planMark,
  proposalPrompt, referenceCaseLines, unsourcedNumbers,
} from "./campaignProposal";
import { PROPOSAL_FILL_IDS, PROPOSAL_TAIL_IDS } from "../../../../client/src/v2/strategy/lib/campaign/campaignProposal";

const item = (over: Record<string, any> = {}) => ({
  id: "teaser-2026-10-08-0", phase: "teaser" as const, date: "2026-10-08", platform: "facebook",
  taskId: "fb-30-post", taskLabel: "單篇貼文", angle: "用冷知識口吻講不同流星雨對應不同訪客", enabled: true, ...over,
});
const plan = (over: Record<string, any> = {}) => ({
  smp: "有東西正從遠方朝你飛來", generatedAt: "2026-10-01T00:00:00.000Z",
  items: [item(), item({ id: "launch-2026-10-19-0", phase: "launch", date: "2026-10-19", platform: "instagram", angle: "小隕星墜落，帶著訊息等你接住", outputId: 77 })],
  phaseMessages: { teaser: "有什麼東西正朝你飛來" },
  ...over,
});
const facts = { eventName: "小隕星活動", brandName: "Pokémon GO", startAt: "2026-10-19", endAt: "2026-10-26", mechanic: "活動期間小隕星出現率提升", goal: "", type: "seasonal", products: [], note: "" };

describe("outputPlainText", () => {
  it("版本陣列取第一個版本的本文", () => {
    expect(outputPlainText(JSON.stringify([{ label: "A", caption: "第一版\n第二行" }, { label: "B", caption: "第二版" }]))).toBe("第一版\n第二行");
  });
  it("多卡貼文把每張卡接起來", () => {
    expect(outputPlainText(JSON.stringify([{ caption: "開場", cards: [{ headline: "卡一", body: "內文一" }, { headline: "卡二" }] }])))
      .toBe("開場\n\n卡一\n內文一\n\n卡二");
  });
  it("帶 publicVariants 的物件、純文字、HTML 都讀得出來", () => {
    expect(outputPlainText(JSON.stringify({ publicVariants: [{ caption: "對外版" }], planningArtifacts: [{ caption: "內部" }] }))).toBe("對外版");
    expect(outputPlainText("就是一段文字")).toBe("就是一段文字");
    expect(outputPlainText("<p>第一段</p><p>第二<br>行</p>")).toBe("第一段\n\n第二\n行");
  });
});

describe("unsourcedNumbers", () => {
  const source = "活動期間 2026-10-19～2026-10-26，全站 85 折，共 12 篇，預算 NT$300000";
  it("資料裡有的數字不列（日期補零、千分位、百分比都算同一個）", () => {
    expect(unsourcedNumbers("10/19 開跑、10/26 結束，85% 的價格，預算 300,000 元，共 12 篇", source)).toEqual([]);
  });
  it("資料裡沒有的數字列出來；個位數不看", () => {
    expect(unsourcedNumbers("預計觸及 50,000 人、轉換率 3%，分 3 個階段", source)).toEqual(["50000", "3%"]);
  });
});

describe("planMark", () => {
  it("改了標語、階段名稱、某一篇要講什麼或寫好了，指紋都會變；順序不影響", () => {
    const base = planMark(plan());
    expect(planMark(plan({ smp: "換一句" }))).not.toBe(base);
    expect(planMark(plan({ phaseNames: { teaser: "暖身" } }))).not.toBe(base);
    expect(planMark(plan({ items: [item({ angle: "換個講法" }), plan().items[1]] }))).not.toBe(base);
    expect(planMark(plan({ items: [...plan().items].reverse() }))).toBe(base);
  });
  it("「這篇不做」的那一篇不算", () => {
    expect(planMark(plan({ items: [...plan().items, item({ id: "x", enabled: false })] }))).toBe(planMark(plan()));
  });
});

describe("proposalPrompt", () => {
  const text = proposalPrompt({
    facts, plan: plan({ phaseNames: { teaser: "暖身" } }),
    posts: { "launch-2026-10-19-0": { title: "", text: "那道光，\n四天後就要劃過你的天空" } },
    positioning: { audience: { primaryAudience: "回鍋的訓練家" } },
  });
  it("用使用者取的階段名稱，沒取的用預設", () => {
    expect(phaseNameOf({ phaseNames: { teaser: " 暖身 " } }, "teaser")).toBe("暖身");
    expect(text).toContain("- 暖身｜10/08");
    expect(text).toContain("｜開賣｜Instagram｜");
  });
  it("寫好的那一篇帶全文，還沒寫的標出來", () => {
    expect(text).toContain("已寫好的全文：「那道光， ／ 四天後就要劃過你的天空」");
    expect(text).toContain("｜（還沒寫）");
  });
  it("舊的策略依據只當參考，而且只列有寫的格子", () => {
    expect(text).toContain("舊的策略依據（只是參考");
    expect(text).toContain("- 核心受眾：回鍋的訓練家");
    expect(text).not.toContain("（空）");
  });
  it("要模型回的鍵是 AI 寫的那幾段；填空表不問模型；沒有得獎案例就沒有借鏡", () => {
    for (const s of aiSections(false)) expect(text).toContain(`"${s.id}":"`);
    expect(text).not.toContain(`"budget":"`);
    expect(text).not.toContain(`"adBudget":"`);
    expect(text).not.toContain(`"reference":"`);
    expect(text).not.toContain("參考的得獎案例");
  });
  it("有得獎案例就帶進去，並多一段借鏡", () => {
    const withCase = proposalPrompt({
      facts, plan: plan(), posts: {},
      positioning: { creative: { referenceCases: [{ title: "Fearless Girl", award: "Grand Prix", description: "一座銅像對著華爾街銅牛" }] } },
    });
    expect(withCase).toContain("- Fearless Girl｜Grand Prix｜一座銅像對著華爾街銅牛");
    expect(withCase).toContain(`"reference":"`);
  });
});

describe("referenceCaseLines", () => {
  it("沒有、不是陣列、太短的都不算", () => {
    expect(referenceCaseLines({})).toEqual([]);
    expect(referenceCaseLines({ creative: { referenceCases: "x" } })).toEqual([]);
    expect(referenceCaseLines({ creative: { referenceCases: [{ title: "ab" }, null] } })).toEqual([]);
  });
});

describe("填空表", () => {
  it("沒設定預算與 KPI：金額與指標都留空格，階段用使用者取的名稱", () => {
    const b = budgetTemplate(plan({ phaseNames: { teaser: "暖身" } }));
    expect(b).toContain(`・總預算：NT$${BLANK}`);
    expect(b).toContain(`・主要 KPI：${BLANK}`);
    expect(b).toContain(`・暖身：${BLANK}`);
    expect(b).toContain(`・開賣：${BLANK}`);
  });
  it("設定過的帶進來", () => {
    const kpi = { budget: 300000, goals: [{ metric: "reach", target: 50000 }], phases: { teaser: { share: 40, budget: 120000, metrics: [{ metric: "engagement", target: null }], note: "" } } };
    const b = budgetTemplate(plan({ kpi }));
    expect(b).toContain("・總預算：NT$300,000");
    expect(b).toContain("・觸及人數：50,000");
    expect(b).toContain("・預熱：互動數");
    const a = adBudgetTemplate(plan({ kpi }));
    expect(a).toContain("廣告總預算：NT$300,000");
    expect(a).toContain("・預熱：NT$120,000（40%）");
    expect(a).toContain(`・開賣：NT$${BLANK}（${BLANK}%）`);
  });
  it("廣告預算分配：只列可以下廣告的通路，標了廣告的貼文逐篇列出", () => {
    const a = adBudgetTemplate(plan({ items: [item({ paid: true }), item({ id: "e", platform: "email" })] }));
    expect(a).toContain(`・Facebook：NT$${BLANK}（${BLANK}%）`);
    expect(a).not.toContain("電子報：NT$");
    expect(a).toContain(`・10/08 Facebook｜用冷知識口吻講不同流星雨對應不同訪客：NT$${BLANK}`);
    expect(adBudgetTemplate(plan())).toContain("還沒有標記要下廣告的貼文");
  });
});

describe("cleanProposalSections", () => {
  const body = "這是一段夠長的內容，用來確認這一段會被留下來而不是被當成空的。";
  const full = Object.fromEntries(aiSections(true).map((s) => [s.id, body]));
  it("照固定順序回每一段（含填空表），標題照介面語言；沒有得獎案例就沒有借鏡", () => {
    const zh = cleanProposalSections("```json\n" + JSON.stringify(full) + "\n```", false, { plan: plan() })!;
    expect(zh.map((s) => s.id)).toEqual(PROPOSAL_SECTIONS.filter((s) => s.id !== "reference").map((s) => s.id));
    expect(zh[0]!.title).toBe("一頁摘要");
    expect(zh[zh.length - 1]!.id).toBe("recap");
    expect(zh.find((s) => s.id === "adBudget")!.body).toContain("廣告總預算");
    const en = cleanProposalSections(JSON.stringify(full), true, { plan: plan(), hasCases: true })!;
    expect(en.map((s) => s.id)).toEqual(PROPOSAL_SECTIONS.map((s) => s.id));
    expect(en[1]!.title).toBe("Background & challenge");
  });
  it("模型空著的那一段照樣留著（空的，讓使用者填）", () => {
    const s = cleanProposalSections(JSON.stringify({ ...full, competitors: "" }), false, { plan: plan() })!;
    expect(s.find((x) => x.id === "competitors")).toEqual({ id: "competitors", title: "競爭者分析", body: "" });
  });
  it("重新草擬：填空表裡使用者填過的沿用，AI 寫的換新", () => {
    const prev = [{ id: "adBudget", title: "廣告預算分配", body: "廣告總預算：NT$80,000" }, { id: "background", title: "活動背景", body: "舊的背景" }];
    const s = cleanProposalSections(JSON.stringify(full), false, { plan: plan(), prev })!;
    expect(s.find((x) => x.id === "adBudget")!.body).toBe("廣告總預算：NT$80,000");
    expect(s.find((x) => x.id === "budget")!.body).toContain("總預算");
    expect(s.find((x) => x.id === "background")!.body).toBe(body);
  });
  it("拿掉 Markdown 記號，條列改成「・」", () => {
    const s = cleanProposalSections(JSON.stringify({ ...full, channels: "## 通路\n- **Facebook** 負責預熱的說明，把來龍去脈講清楚\n* Instagram 負責倒數" }), false)!;
    expect(s.find((x) => x.id === "channels")!.body).toBe("通路\n・Facebook 負責預熱的說明，把來龍去脈講清楚\n・Instagram 負責倒數");
  });
  it("讀不成 JSON、或有寫的段落太少，就當作沒寫成", () => {
    expect(cleanProposalSections("抱歉，我沒辦法", false)).toBeNull();
    expect(cleanProposalSections(JSON.stringify({ background: body, strategy: body }), false, { plan: plan() })).toBeNull();
  });
});

describe("段落語彙 client ↔ server", () => {
  it("排在排程後面的段落、填空表的 id 兩邊一致", () => {
    expect(PROPOSAL_TAIL_IDS).toEqual(PROPOSAL_SECTIONS.filter((s) => "tail" in s && s.tail).map((s) => s.id));
    expect(PROPOSAL_FILL_IDS).toEqual(PROPOSAL_SECTIONS.filter((s) => s.kind === "fill").map((s) => s.id));
  });
});

describe("cleanSavedSections", () => {
  const prev = [{ id: "background", title: "活動背景", body: "舊的" }, { id: "strategy", title: "傳播策略", body: "舊策略" }];
  it("只收原本就有的段落，順序不變；標題清空就用原本的", () => {
    const next = cleanSavedSections([{ id: "strategy", title: "  ", body: " 新策略 " }, { id: "hack", title: "x", body: "y" }], prev);
    expect(next).toEqual([{ id: "background", title: "活動背景", body: "舊的" }, { id: "strategy", title: "傳播策略", body: "新策略" }]);
  });
});

describe("反白一段請內容企劃改", () => {
  const section = { id: "competitors", title: "競爭者分析", body: "・A 牌主打便宜。\n・B 牌主打聯名。" };
  it("提示詞帶著那一段、反白的那幾句、使用者說的話", () => {
    const t = revisePrompt({ context: "【活動】小隕星", section, quote: "B 牌主打聯名", instruction: "B 牌拿掉" });
    expect(t).toContain("═══ 要改的這一段：競爭者分析 ═══");
    expect(t).toContain("【使用者反白的那幾句】「B 牌主打聯名」");
    expect(t).toContain("【使用者說】B 牌拿掉");
    expect(revisePrompt({ context: "", section, quote: " ", instruction: "縮短" })).toContain("指的是整段");
  });
  it("讀得出來就回改好的全文；讀不出來回 null", () => {
    expect(cleanRevised('{"reply":"拿掉了 B 牌","body":"- A 牌主打便宜。"}')).toEqual({ reply: "拿掉了 B 牌", body: "・A 牌主打便宜。" });
    expect(cleanRevised("好的")).toBeNull();
    expect(cleanRevised('{"reply":"x"}')).toBeNull();
  });
});

describe("梳理整份", () => {
  const sections = [
    { id: "summary", title: "一頁摘要", body: "舊的摘要，還在講 B 牌。" },
    { id: "competitors", title: "競爭者分析", body: "・A 牌主打便宜。" },
    { id: "budget", title: "預算與 KPI", body: "・總預算：NT$＿＿" },
  ];
  const p = plan();   // teaser-… 還沒寫、launch-… 已寫（outputId 77）
  const open = p.items[0]!.id, done = p.items[1]!.id;
  it("提示詞標出使用者定案的段落，貼文分成還沒寫／已寫好，填空表不給模型", () => {
    const t = alignPrompt({ context: "【活動】小隕星", sections, touched: ["competitors"], plan: p, locked: false });
    expect(t).toContain("【competitors｜競爭者分析｜使用者定案】");
    expect(t).toContain("【summary｜一頁摘要】");
    expect(t).not.toContain("預算與 KPI");
    expect(t).toMatch(new RegExp(`還沒寫的貼文[^]*${open}`));
    expect(t).toMatch(new RegExp(`已寫好的貼文[^]*${done}`));
  });
  const raw = JSON.stringify({
    reply: "摘要跟著拿掉 B 牌。",
    sections: { summary: "新的摘要，只講 A 牌的差異。", competitors: "我偷改使用者定案的", budget: "我偷改填空表", nope: "不存在的段落" },
    smp: "換一句標語",
    items: [{ id: open, angle: "改成對比 A 牌的講法" }, { id: done, angle: "寫好的不能改方向" }, { id: "ghost", angle: "不存在的" }],
    rewrite: [{ id: done, reason: "開頭還在提 B 牌，拿掉" }, { id: open, reason: "還沒寫的不用列" }],
  });
  it("只留可以動的：使用者定案的段落、填空表、不存在的 id 都丟掉；寫了沒寫分對邊", () => {
    const a = cleanAlignment(raw, { sections, touched: ["competitors"], plan: p, locked: false })!;
    expect(a.sections).toEqual({ summary: "新的摘要，只講 A 牌的差異。" });
    expect(a.smp).toBe("換一句標語");
    expect(a.items).toEqual([{ id: open, angle: "改成對比 A 牌的講法" }]);
    expect(a.rewrite).toEqual([{ id: done, reason: "開頭還在提 B 牌，拿掉" }]);
  });
  it("企劃定稿後，標語與貼文方向都不動，只梳理提案與建議重寫", () => {
    const a = cleanAlignment(raw, { sections, touched: ["competitors"], plan: p, locked: true })!;
    expect(a.smp).toBeUndefined();
    expect(a.items).toEqual([]);
    expect(Object.keys(a.sections)).toEqual(["summary"]);
    expect(a.rewrite).toHaveLength(1);
    expect(alignPrompt({ context: "", sections, touched: [], plan: p, locked: true })).toContain("【企劃已定稿】");
  });
  it("讀不成 JSON 回 null", () => {
    expect(cleanAlignment("抱歉", { sections, touched: [], plan: p, locked: false })).toBeNull();
  });
});
