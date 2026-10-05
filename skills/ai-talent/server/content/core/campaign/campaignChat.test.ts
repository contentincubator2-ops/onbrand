/**
 * 活動頁對話的提案檢查（validateCampaignOps）。
 *
 * 模型回什麼都不能直接進企劃：日期要在活動期間附近、通路是前台那七個、卡要是那個
 * 通路真的有的、寫好的不能動。這支是「對話會不會把企劃改壞」的唯一守門員。
 */
import { describe, it, expect } from "vitest";
import { validateCampaignOps, parseChatReply, pickHandoff } from "./campaignChat";
import { rosterRoles } from "./campaignRoster";
import type { CampaignPlan } from "./campaignPlan";
import type { CatalogTask } from "../catalog/taskCatalogIndex";

const card = (id: string, platform: string, tier = "30s"): CatalogTask => ({
  id, platform: platform as any, tier, postType: "post",
  labelZh: `${id} 中文`, labelEn: `${id} en`, source: "evergreen" as any, addedAt: null,
});
const cards = [card("fb-a", "facebook"), card("ig-a", "instagram"), card("ig-b", "instagram", "60s"), card("web-a", "website")];

const plan: CampaignPlan = {
  smp: "原本的訴求",
  generatedAt: "",
  phaseMessages: { launch: "原本的開賣訊息" },
  items: [
    { id: "launch-1", phase: "launch", date: "2026-11-01", platform: "facebook", taskId: "fb-a", taskLabel: "fb-a 中文", angle: "上市公告", enabled: true, outputId: null },
    { id: "launch-2", phase: "launch", date: "2026-11-02", platform: "instagram", taskId: "ig-a", taskLabel: "ig-a 中文", angle: "輪播", enabled: true, outputId: 55 },
  ],
};
const window = { from: "2026-10-18", to: "2026-12-31" };
const newId = (p: string, d: string, n: number) => `${p}-${d}-new${n}`;
const run = (raw: any) => validateCampaignOps({ raw, plan, cards, window, newId });

describe("add", () => {
  it("合法的一篇：換成真的卡、給新 id", () => {
    const out = run({ ops: [{ op: "add", phase: "sustain", date: "2026-11-10", platform: "instagram", taskId: "ig-b", angle: "使用情境：一人行銷團隊的週一" }] });
    expect(out.ops).toEqual([{ op: "add", item: expect.objectContaining({
      id: "sustain-2026-11-10-new0", phase: "sustain", platform: "instagram", taskId: "ig-b", taskLabel: "ig-b 中文", enabled: true,
    }) }]);
  });
  it("卡不存在或不屬於那個通路：換成那個通路的預設卡，標 repaired", () => {
    const out = run({ ops: [{ op: "add", phase: "sustain", date: "2026-11-10", platform: "instagram", taskId: "fb-a", angle: "使用情境一篇" }] });
    expect((out.ops[0] as any).item).toMatchObject({ taskId: "ig-a", repaired: true });
  });
  it("日期超出範圍、通路不在前台、階段亂寫、內容太短：丟掉", () => {
    const out = run({ ops: [
      { op: "add", phase: "sustain", date: "2027-02-01", platform: "instagram", angle: "太晚了這一篇" },
      { op: "add", phase: "sustain", date: "2026-11-10", platform: "linkedin", angle: "隱藏通路這一篇" },
      { op: "add", phase: "hype", date: "2026-11-10", platform: "instagram", angle: "不是階段這一篇" },
      { op: "add", phase: "sustain", date: "2026-11-10", platform: "instagram", angle: "短" },
    ] });
    expect(out.ops).toEqual([]);
  });
});

describe("update / remove", () => {
  it("改沒寫的那篇：只留真的有變的欄位", () => {
    const out = run({ ops: [{ op: "update", id: "launch-1", angle: "上市公告", date: "2026-11-03", enabled: true }] });
    expect(out.ops).toEqual([{ op: "update", id: "launch-1", patch: { date: "2026-11-03" } }]);
  });
  it("換通路時一併換成那個通路的卡", () => {
    const out = run({ ops: [{ op: "update", id: "launch-1", platform: "website" }] });
    expect(out.ops[0]).toEqual({ op: "update", id: "launch-1", patch: { platform: "website", taskId: "web-a", taskLabel: "web-a 中文", repaired: true } });
  });
  it("已寫好的那篇不能改也不能刪；不存在的 id 丟掉", () => {
    const out = run({ ops: [
      { op: "update", id: "launch-2", angle: "改掉已寫的那篇" },
      { op: "remove", id: "launch-2" },
      { op: "remove", id: "ghost" },
    ] });
    expect(out.ops).toEqual([]);
  });
  it("同一篇只收第一個操作", () => {
    const out = run({ ops: [{ op: "remove", id: "launch-1" }, { op: "update", id: "launch-1", angle: "又想改這一篇" }] });
    expect(out.ops).toEqual([{ op: "remove", id: "launch-1" }]);
  });
});

describe("訊息", () => {
  it("只收套用後企劃裡還有的段，跟原本一樣的不算", () => {
    const out = run({
      ops: [{ op: "add", phase: "sustain", date: "2026-11-10", platform: "instagram", angle: "使用情境一篇" }],
      phaseMessages: { sustain: "新的加溫訊息", launch: "原本的開賣訊息", encore: "沒有返場這段" },
      smp: "新的訴求",
    });
    expect(out.phaseMessages).toEqual({ sustain: "新的加溫訊息" });
    expect(out.smp).toBe("新的訴求");
  });
  it("只是問問題：沒有操作也沒有訊息", () => {
    expect(run({ reply: "好問題", ops: [] })).toEqual({ ops: [] });
  });
});

describe("parseChatReply（回覆被截斷也救得回來）", () => {
  it("完整的 JSON：照常解析，帶 askDirector", () => {
    const r = parseChatReply('{"reply":"好","ops":[{"op":"remove","id":"a"}],"askDirector":"訴求要不要改？"}');
    expect(r).toEqual({ reply: "好", ops: [{ op: "remove", id: "a" }], phaseMessages: undefined, askDirector: "訴求要不要改？", smp: undefined, truncated: false });
  });

  it("策略總監的回覆：帶新的一句話訴求與各段訊息", () => {
    const r = parseChatReply('{"reply":"拿掉免費，改講時機。","smp":"上市期間開放申請","phaseMessages":{"launch":"現在進來剛好"},"ops":[]}')!;
    expect(r.smp).toBe("上市期間開放申請");
    expect(r.phaseMessages).toEqual({ launch: "現在進來剛好" });
  });

  it("被截斷：救回完整的那幾條，最後半條丟掉", () => {
    const cut = '{"reply":"每一段都改了，重點放在「一人行銷」的處境","ops":[{"op":"update","id":"a","angle":"講真實的{週一}"},{"op":"update","id":"b","angle":"第二條"},{"op":"update","id":"c","ang';
    const r = parseChatReply(cut)!;
    expect(r.truncated).toBe(true);
    expect(r.reply).toBe("每一段都改了，重點放在「一人行銷」的處境");
    expect(r.ops).toEqual([{ op: "update", id: "a", angle: "講真實的{週一}" }, { op: "update", id: "b", angle: "第二條" }]);
  });

  // 2026-10-05 dev：Lucas 請總監照 Brief 改策略依據，回覆斷在 basis 中間，修改整包不見。
  it("被截斷在策略依據中間：寫完整的那幾格、訴求、各段訊息都救回來", () => {
    const cut = '{"reply":"我把對不上 Brief 的格子都對齊了。","smp":"十週年，回到曠野","phaseMessages":{"launch":"兩天，兩隻傳說"},"ops":[],"basis":{"audience.keyInsight":"訓練家要的是「一起出門」的理由，不是{獎勵}, 清單","guidelines.forbiddenElements":["免費","保證 [必中]"],"objective.business":"帶動入場券銷';
    const r = parseChatReply(cut)!;
    expect(r.truncated).toBe(true);
    expect(r.smp).toBe("十週年，回到曠野");
    expect(r.phaseMessages).toEqual({ launch: "兩天，兩隻傳說" });
    expect(r.basis).toEqual({
      "audience.keyInsight": "訓練家要的是「一起出門」的理由，不是{獎勵}, 清單",
      "guidelines.forbiddenElements": ["免費", "保證 [必中]"],
    });
  });

  it("被截斷在策略依據的第一格：沒有東西可救，basis 不出現", () => {
    const r = parseChatReply('{"reply":"都改好了。","ops":[],"basis":{"audience.keyInsight":"寫到一')!;
    expect(r.truncated).toBe(true);
    expect(r.basis).toBeUndefined();
    expect(r.ops).toEqual([]);
  });

  it("沒有 JSON：整段當一般回答；什麼都沒有：null", () => {
    expect(parseChatReply("這週先別加篇數比較好。")).toEqual({ reply: "這週先別加篇數比較好。", ops: [], truncated: false });
    expect(parseChatReply("   ")).toBeNull();
  });
});

// 2026-10-02：分工由伺服器擋——策略總監只能改切角，排程交給內容企劃（askPlanner）。
describe("策略總監只能改切角", () => {
  const asDirector = (raw: any) => validateCampaignOps({ raw, plan, cards, window, newId, role: "director" });
  it("加篇、刪篇丟掉；update 只留 angle，日期／通路／開關不收", () => {
    const out = asDirector({ ops: [
      { op: "add", phase: "sustain", date: "2026-11-10", platform: "instagram", taskId: "ig-b", angle: "總監想自己加一篇" },
      { op: "remove", id: "launch-1" },
      { op: "update", id: "launch-1", angle: "拿掉免費，改講上市時機", date: "2026-11-05", platform: "website", enabled: false },
    ] });
    expect(out.ops).toEqual([{ op: "update", id: "launch-1", patch: { angle: "拿掉免費，改講上市時機" } }]);
  });
  it("只改日期沒改切角：整條丟掉；已寫好的那篇照樣不能動", () => {
    expect(asDirector({ ops: [{ op: "update", id: "launch-1", date: "2026-11-05" }] }).ops).toEqual([]);
    expect(asDirector({ ops: [{ op: "update", id: "launch-2", angle: "改掉已寫的那篇" }] }).ops).toEqual([]);
  });
  it("一句話訴求與各段訊息照收", () => {
    const out = asDirector({ smp: "上市期間開放申請", phaseMessages: { launch: "現在進來剛好" }, ops: [] });
    expect(out).toEqual({ ops: [], smp: "上市期間開放申請", phaseMessages: { launch: "現在進來剛好" } });
  });
});

describe("parseChatReply：總監交回內容企劃", () => {
  it("帶 askPlanner", () => {
    const r = parseChatReply('{"reply":"方向定了，排程請企劃接手。","smp":"新訴求","ops":[],"askPlanner":"倒數週加兩篇 IG，照新訴求寫"}')!;
    expect(r.askPlanner).toBe("倒數週加兩篇 IG，照新訴求寫");
    expect(r.askDirector).toBeUndefined();
  });
});

import { humanizeIds } from "./campaignChat";
describe("humanizeIds（回覆裡的企劃 id 換成日期＋通路）", () => {
  it("認得的換成「10/27 Facebook」，認不得的換成「那一篇」", () => {
    const plan = { items: [{ id: "teaser-2026-10-27-0", date: "2026-10-27", platform: "facebook" }] } as any;
    expect(humanizeIds("掃了一遍，teaser-2026-10-27-0 沒碰到免費；launch-2026-11-01-c9x 也沒有", plan))
      .toBe("掃了一遍，10/27 Facebook 沒碰到免費；那一篇 也沒有");
  });
});

describe("名冊上其他人能改的（照 campaignRoster.ROLES）", () => {
  const p2: CampaignPlan = {
    ...plan,
    items: [
      ...plan.items,
      { id: "kol-1", phase: "teaser", date: "2026-10-25", platform: "kol", taskId: "kl-a", taskLabel: "邀約", angle: "邀約三位微網紅", enabled: true, outputId: null },
    ],
  };
  const runAs = (role: any, raw: any) => validateCampaignOps({ raw, plan: p2, cards, window, newId, role });
  it("投放專家：只收 paid，而且只有能下廣告的通路", () => {
    const out = runAs("kpi", { ops: [
      { op: "update", id: "launch-1", paid: true, angle: "投放專家亂改的切角" },
      { op: "update", id: "kol-1", paid: true },
      { op: "add", phase: "sustain", date: "2026-11-10", platform: "instagram", taskId: "ig-a", angle: "加一篇廣告貼文" },
    ] });
    expect(out.ops).toEqual([{ op: "update", id: "launch-1", patch: { paid: true } }]);
  });
  it("網紅合作：只能改網紅那條線的切角", () => {
    const out = runAs("kol", { ops: [
      { op: "update", id: "launch-1", angle: "網紅想改 FB 的切角" },
      { op: "update", id: "kol-1", angle: "邀約五位母嬰微網紅" },
    ] });
    expect(out.ops).toEqual([{ op: "update", id: "kol-1", patch: { angle: "邀約五位母嬰微網紅" } }]);
  });
  it("話題公關：切角可以改，訴求與各段訊息不收", () => {
    const out = runAs("pr", { ops: [{ op: "update", id: "launch-1", angle: "改成可以被轉述的說法" }], smp: "公關改的訴求", phaseMessages: { launch: "公關改的訊息" } });
    expect(out).toEqual({ ops: [{ op: "update", id: "launch-1", patch: { angle: "改成可以被轉述的說法" } }] });
  });
  it("內容企劃：一句話訴求不收", () => {
    expect(runAs("planner", { ops: [], smp: "企劃改的訴求" }).smp).toBeUndefined();
  });
});

describe("pickHandoff（交給名冊上的另一位）", () => {
  const on = new Set<any>(["director", "planner", "kpi", "pr"]);
  it("handoffTo＋ask", () => expect(pickHandoff({ handoffTo: "kpi", ask: "這三篇值得下廣告嗎" }, "planner", on)).toEqual({ to: "kpi", question: "這三篇值得下廣告嗎" }));
  it("舊鍵 askDirector／askPlanner 照收", () => {
    expect(pickHandoff({ askDirector: "訴求要不要改" }, "planner", on)).toEqual({ to: "director", question: "訴求要不要改" });
    expect(pickHandoff({ askPlanner: "倒數加兩篇" }, "director", on)).toEqual({ to: "planner", question: "倒數加兩篇" });
  });
  it("不在名冊上、交給自己、沒寫問題：不交", () => {
    expect(pickHandoff({ handoffTo: "kol", ask: "找網紅" }, "planner", on)).toBeNull();
    expect(pickHandoff({ handoffTo: "planner", ask: "自己" }, "planner", on)).toBeNull();
    expect(pickHandoff({ handoffTo: "kpi" }, "planner", on)).toBeNull();
    expect(pickHandoff({ handoffTo: "boss", ask: "?" }, "planner", on)).toBeNull();
  });
});

describe("rosterRoles（誰上名冊）", () => {
  const items = (chs: string[]) => chs.map((platform, k) => ({ id: `x${k}`, phase: "launch", date: "2026-11-01", platform, taskId: "t", taskLabel: "t", angle: "一篇", enabled: true, outputId: null })) as any;
  it("基本班底：總監、內容企劃、投放、公關；沒有網紅／異業線就不列", () => {
    expect(rosterRoles({ plan: { items: items(["facebook", "instagram"]) }, positioning: {}, directorId: 1 }).map((r) => r.role))
      .toEqual(["director", "planner", "kpi", "pr"]);
  });
  it("定位是別人寫的、有網紅與異業線：都列上", () => {
    const r = rosterRoles({ plan: { items: items(["facebook", "kol", "cobrand"]) }, positioning: { _director: { agentId: 60001 } }, directorId: 1 });
    expect(r.map((x) => x.role)).toEqual(["director", "author", "planner", "kpi", "kol", "cobrand", "pr"]);
    expect(r.find((x) => x.role === "author")?.authorId).toBe(60001);
  });
  it("定位撰寫者就是總監：不重複列", () => {
    expect(rosterRoles({ plan: { items: [] }, positioning: { _director: { agentId: 7 } }, directorId: 7 }).some((r) => r.role === "author")).toBe(false);
  });
});
