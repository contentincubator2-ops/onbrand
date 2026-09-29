import { describe, expect, it } from "vitest";

// tRPC 在建構期就會拒絕保留字 procedure 名稱（apply/call/bind…），而 tsc 抓不到——
// 所以每個 router 都要有一支真的 import 它的測試。
describe("inspirationRouter", () => {
  it("builds and exposes roster / setLineup / ideateStart / ideatePoll / adopt", async () => {
    const { inspirationRouter } = await import("./inspirationRouter");
    const procs = Object.keys((inspirationRouter as any)._def.procedures);
    expect(procs.sort()).toEqual(["adopt", "ideatePoll", "ideateStart", "resetLineup", "roster", "setLineup"]);
  }, 60_000);
});

describe("inspirationStage", () => {
  it("every thinker has a distinct agent and framework", async () => {
    const { THINKERS, DEFAULT_LINEUP, LINEUP_SIZE } = await import("../core/inspirationStage");
    expect(new Set(THINKERS.map((t) => t.agentId)).size).toBe(THINKERS.length);
    expect(new Set(THINKERS.map((t) => t.framework)).size).toBe(THINKERS.length);
    expect(DEFAULT_LINEUP).toHaveLength(LINEUP_SIZE);
  });

  it("resolveLineup drops junk, fills to five, and never refills a dropped thinker first", async () => {
    const { resolveLineup, DEFAULT_LINEUP } = await import("../core/inspirationStage");
    expect(resolveLineup(null, {})).toEqual(DEFAULT_LINEUP);
    const l = resolveLineup(["story", "bogus", "story", "timing"], { founder: { adopted: 3, dropped: 0 }, direct: { adopted: 0, dropped: 1 } });
    expect(l).toHaveLength(5);
    expect(l.slice(0, 3)).toEqual(["story", "timing", "founder"]);
    expect(l).not.toContain("direct");
  });

  it("parseAngles keeps only requested thinkers, caps per thinker, repairs platform/format", async () => {
    const { parseAngles } = await import("../core/inspirationStage");
    const raw = "好的：\n" + JSON.stringify({ angles: [
      { thinker: "story", answer: "下班後", title: "下雨天的第一杯", hook: "今天台北下雨。", why: "找日常片刻", platform: "tiktok", format: "長文" },
      { thinker: "story", answer: "b", title: "第二個", hook: "第二句", why: "", platform: "facebook", format: "輪播" },
      { thinker: "bogus", answer: "c", title: "不該出現", hook: "不該出現", why: "" },
      { thinker: "direct", answer: "d", title: "x", hook: "" },
      { thinker: "direct", answer: "滿額免運", title: "滿額免運的算法", hook: "兩瓶剛好。", why: "購買理由", platform: "instagram", format: "Reels" },
    ] });
    const out = parseAngles(raw, { keys: ["direct", "story"], platforms: ["facebook", "instagram"], perThinker: 1 });
    expect(out.map((a) => [a.thinker, a.title, a.platform, a.format])).toEqual([
      ["direct", "滿額免運的算法", "instagram", "Reels"],
      ["story", "下雨天的第一杯", "facebook", "貼文"],
    ]);
    expect(out[1]!.answer).toBe("下班後");
    // 只有一位時容許模型漏寫 thinker
    const solo = parseAngles(JSON.stringify({ angles: [{ title: "單一細節", hook: "你注意過瓶蓋嗎？" }] }), { keys: ["detail"], platforms: ["facebook"], perThinker: 3 });
    expect(solo[0]?.thinker).toBe("detail");
    expect(parseAngles("not json", { keys: ["story"], platforms: ["facebook"], perThinker: 1 })).toEqual([]);
  });

  it("completedAngleObjects returns only cards whose closing brace has streamed in", async () => {
    const { completedAngleObjects, parseAngles } = await import("../core/inspirationStage");
    const full = JSON.stringify({ angles: [
      { thinker: "story", title: "括號{不算}", hook: "他說：\"}\" 也不算", why: "" },
      { thinker: "direct", title: "第二張", hook: "第二句", why: "" },
    ] });
    // 串流到第二張寫一半
    const cut = full.indexOf('"第二句"');
    expect(completedAngleObjects("")).toEqual([]);
    expect(completedAngleObjects('{"angles":[{"thinker":"story","title":"寫一')).toEqual([]);
    const partial = completedAngleObjects(full.slice(0, cut));
    expect(partial).toHaveLength(1);
    expect(JSON.parse(partial[0]!).title).toBe("括號{不算}");
    expect(completedAngleObjects(full)).toHaveLength(2);
    // 前言、```json 包裝都不影響
    expect(completedAngleObjects("好的：\n```json\n" + full)).toHaveLength(2);
    const parsed = parseAngles(`{"angles":[${partial.join(",")}]}`, { keys: ["story", "direct"], platforms: ["facebook"], perThinker: 1 });
    expect(parsed.map((a) => a.thinker)).toEqual(["story"]);
  });

  it("unquote strips only a quote pair that wraps the whole hook", async () => {
    const { unquote } = await import("../core/inspirationStage");
    expect(unquote("「啤酒已經開了。」")).toBe("啤酒已經開了。");
    expect(unquote("「你去哪間打包的？」——「我自己煎的。」")).toBe("「你去哪間打包的？」——「我自己煎的。」");
    expect(unquote("沒有引號")).toBe("沒有引號");
  });

  it("slotTopic fits planned_slots.topic and pickCardForFormat prefers a matching card", async () => {
    const { slotTopic, pickCardForFormat } = await import("../core/inspirationStage");
    expect(slotTopic({ title: "t".repeat(40), hook: "h".repeat(300) }).length).toBeLessThanOrEqual(200);
    const cards = [
      { id: "fb-30-post", platform: "facebook", labelZh: "日常貼文" },
      { id: "fb-30-carousel", platform: "facebook", labelZh: "輪播貼文" },
      { id: "ig-30-post", platform: "instagram", labelZh: "貼文" },
    ];
    expect(pickCardForFormat("facebook", "輪播", cards)?.id).toBe("fb-30-carousel");
    expect(pickCardForFormat("facebook", "Reels", cards)?.id).toBe("fb-30-post");
    expect(pickCardForFormat("threads", "貼文", cards)).toBeNull();
  });

  it("one prompt carries every thinker, pins the subject, keeps the occasion as material", async () => {
    const { ideationSystemPrompt, thinkerOf } = await import("../core/inspirationStage");
    const p = ideationSystemPrompt({
      thinkers: [{ thinker: thinkerOf("story"), name: "Grace" }, { thinker: thinkerOf("detail"), name: "周明翰" }],
      brandName: "HOTU", subjectLine: "「HOTU」的產品「色鉛筆」", brandCtx: "", occasion: "開學週",
      platforms: ["facebook"], count: 1, outputLanguage: "en-US", avoid: ["舊切角"],
    });
    expect(p).toContain("■ story｜Grace");
    expect(p).toContain("■ detail｜周明翰");
    expect(p).toContain(thinkerOf("detail").question);
    expect(p).toContain("「HOTU」的產品「色鉛筆」");
    expect(p).toContain("由頭是素材不是題目");
    expect(p).toContain("資料沒有的不要編");
    expect(p).toContain("舊切角");
    expect(p).toContain("en-US");
    expect(p).not.toMatch(/\n\n\n/);
  });
});
