import { describe, expect, it } from "vitest";
import {
  PROPOSAL_SECTIONS, cleanProposalSections, cleanSavedSections, outputPlainText, phaseNameOf, planMark, proposalPrompt, unsourcedNumbers,
} from "./campaignProposal";

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
  it("要模型回的鍵就是提案的每一段", () => {
    for (const s of PROPOSAL_SECTIONS) expect(text).toContain(`"${s.id}":"`);
  });
});

describe("cleanProposalSections", () => {
  const body = "這是一段夠長的內容，用來確認這一段會被留下來而不是被當成空的。";
  const full = Object.fromEntries(PROPOSAL_SECTIONS.map((s) => [s.id, body]));
  it("讀得出來就照固定順序回每一段，標題照介面語言", () => {
    const zh = cleanProposalSections("```json\n" + JSON.stringify(full) + "\n```", false)!;
    expect(zh.map((s) => s.id)).toEqual(PROPOSAL_SECTIONS.map((s) => s.id));
    expect(zh[0]!.title).toBe("活動背景");
    expect(cleanProposalSections(JSON.stringify(full), true)![0]!.title).toBe("Background");
  });
  it("拿掉 Markdown 記號，條列改成「・」", () => {
    const s = cleanProposalSections(JSON.stringify({ ...full, channels: "## 通路\n- **Facebook** 負責預熱的說明，把來龍去脈講清楚\n* Instagram 負責倒數" }), false)!;
    expect(s.find((x) => x.id === "channels")!.body).toBe("通路\n・Facebook 負責預熱的說明，把來龍去脈講清楚\n・Instagram 負責倒數");
  });
  it("讀不成 JSON、或大部分段落是空的，就當作沒寫成", () => {
    expect(cleanProposalSections("抱歉，我沒辦法", false)).toBeNull();
    expect(cleanProposalSections(JSON.stringify({ background: body, strategy: body }), false)).toBeNull();
  });
});

describe("cleanSavedSections", () => {
  const prev = [{ id: "background", title: "活動背景", body: "舊的" }, { id: "strategy", title: "傳播策略", body: "舊策略" }];
  it("只收原本就有的段落，順序不變；標題清空就用原本的", () => {
    const next = cleanSavedSections([{ id: "strategy", title: "  ", body: " 新策略 " }, { id: "hack", title: "x", body: "y" }], prev);
    expect(next).toEqual([{ id: "background", title: "活動背景", body: "舊的" }, { id: "strategy", title: "傳播策略", body: "新策略" }]);
  });
});
