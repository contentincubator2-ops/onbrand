/**
 * 活動頁對話的提案檢查（validateCampaignOps）。
 *
 * 模型回什麼都不能直接進企劃：日期要在活動期間附近、通路是前台那七個、卡要是那個
 * 通路真的有的、寫好的不能動。這支是「對話會不會把企劃改壞」的唯一守門員。
 */
import { describe, it, expect } from "vitest";
import { validateCampaignOps, parseChatReply } from "./campaignChat";
import type { CampaignPlan } from "./campaignPlan";
import type { CatalogTask } from "../../content/core/taskCatalogIndex";

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

  it("沒有 JSON：整段當一般回答；什麼都沒有：null", () => {
    expect(parseChatReply("這週先別加篇數比較好。")).toEqual({ reply: "這週先別加篇數比較好。", ops: [], truncated: false });
    expect(parseChatReply("   ")).toBeNull();
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
