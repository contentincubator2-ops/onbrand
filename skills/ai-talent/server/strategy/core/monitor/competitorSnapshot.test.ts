import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntelItem } from "../../../platform/core/scouts/types";
import { TOUCHPOINTS } from "../../../platform/core/ops/touchpoints";

const { executeMock, scoutFetchMock, scoutAvailableMock, invokeLLMMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  scoutFetchMock: vi.fn(),
  scoutAvailableMock: vi.fn(),
  invokeLLMMock: vi.fn(),
}));

vi.mock("../../../localDb", () => ({ default: { execute: executeMock } }));
vi.mock("../../../platform/core/llm/llm", () => ({ invokeLLM: invokeLLMMock }));
vi.mock("../../../platform/core/scouts/perplexityScout", () => ({
  perplexityScout: { isAvailable: scoutAvailableMock, fetch: scoutFetchMock },
}));

import { getOrResearchCompetitorSnapshot, parseSnapshotJson } from "./competitorSnapshot";

const CONTENT_CHANNEL_IDS = TOUCHPOINTS.filter((t) => t.deployMethod !== "embed-widget").map((t) => t.id);

const ITEMS: IntelItem[] = [
  { key: "a", type: "competitor_news", title: "綠藤在 FB 開直播賣新品", source: "udn.com", url: "https://udn.com/a", relevanceScore: 0.8, scoutId: "gemini-search" },
  { key: "b", type: "social_trend", title: "綠藤強調零廢棄訴求", source: "ig.com", url: "https://ig.com/b", relevanceScore: 0.7, scoutId: "gemini-search" },
];

describe("competitorSnapshot · parseSnapshotJson", () => {
  it("有證據的通路填 active/formats，情報裡沒提到的通路一律 unknown", () => {
    const raw = JSON.stringify({
      channels: [
        { channel: "facebook", active: "yes", formats: ["organic_post", "live"], evidence: [0] },
      ],
      strategyDiff: { theirAngle: "零廢棄", ourAngle: "天然無添加", difference: "訴求不同", confidence: "known", evidence: [1] },
    });
    const { channels, strategyDiff } = parseSnapshotJson(raw, ITEMS);

    const fb = channels.find((c) => c.channel === "facebook")!;
    expect(fb.active).toBe("yes");
    expect(fb.formats).toEqual(["organic_post", "live"]);
    expect(fb.evidence).toEqual([{ title: ITEMS[0]!.title, url: ITEMS[0]!.url, source: ITEMS[0]!.source }]);

    const others = channels.filter((c) => c.channel !== "facebook");
    for (const c of others) {
      expect(c.active).toBe("unknown");
      expect(c.formats).toEqual([]);
    }
    expect(channels.map((c) => c.channel).sort()).toEqual([...CONTENT_CHANNEL_IDS].sort());
    expect(strategyDiff).toEqual({ theirAngle: "零廢棄", ourAngle: "天然無添加", difference: "訴求不同", confidence: "known", evidence: [{ title: ITEMS[1]!.title, url: ITEMS[1]!.url, source: ITEMS[1]!.source }] });
  });

  it("active 不是 yes/no 一律當 unknown，formats 只收白名單詞", () => {
    const raw = JSON.stringify({
      channels: [{ channel: "instagram", active: "probably", formats: ["organic_post", "sky-writing"], evidence: [0] }],
    });
    const { channels } = parseSnapshotJson(raw, ITEMS);
    const ig = channels.find((c) => c.channel === "instagram")!;
    expect(ig.active).toBe("unknown");
    expect(ig.formats).toEqual([]);
  });

  it("active 是 no 的時候 formats 一定清空，就算 LLM 亂塞了值", () => {
    const raw = JSON.stringify({
      channels: [{ channel: "tiktok", active: "no", formats: ["organic_post"], evidence: [0] }],
    });
    const { channels } = parseSnapshotJson(raw, ITEMS);
    expect(channels.find((c) => c.channel === "tiktok")!.formats).toEqual([]);
  });

  it("evidence 索引超出範圍或不是整數的直接丟棄", () => {
    const raw = JSON.stringify({
      channels: [{ channel: "facebook", active: "yes", formats: ["organic_post"], evidence: [0, 99, "x", 1.5] }],
    });
    const { channels } = parseSnapshotJson(raw, ITEMS);
    expect(channels.find((c) => c.channel === "facebook")!.evidence).toEqual([{ title: ITEMS[0]!.title, url: ITEMS[0]!.url, source: ITEMS[0]!.source }]);
  });

  it("strategyDiff.confidence 不是 known 就整組清空，不留半信半疑的內容", () => {
    const raw = JSON.stringify({
      strategyDiff: { theirAngle: "亂猜的", ourAngle: "亂猜的", difference: "亂猜的", confidence: "unknown", evidence: [0] },
    });
    const { strategyDiff } = parseSnapshotJson(raw, ITEMS);
    expect(strategyDiff).toEqual({ theirAngle: "", ourAngle: "", difference: "", confidence: "unknown", evidence: [] });
  });

  it("吃得下 ```json 圍欄與前言，也吃得下完全壞掉的 JSON（全部回 unknown 不炸）", () => {
    const raw = JSON.stringify({ channels: [{ channel: "facebook", active: "yes", formats: ["live"], evidence: [0] }] });
    const fenced = "這是結果：\n```json\n" + raw + "\n```";
    expect(parseSnapshotJson(fenced, ITEMS).channels.find((c) => c.channel === "facebook")!.active).toBe("yes");

    const broken = parseSnapshotJson("not json at all", ITEMS);
    expect(broken.channels.every((c) => c.active === "unknown")).toBe(true);
    expect(broken.strategyDiff.confidence).toBe("unknown");
  });

  it("未知的通路名稱被忽略，不會混進結果", () => {
    const raw = JSON.stringify({ channels: [{ channel: "myspace", active: "yes", formats: ["organic_post"], evidence: [0] }] });
    const { channels } = parseSnapshotJson(raw, ITEMS);
    expect(channels.map((c) => c.channel)).not.toContain("myspace");
  });
});

describe("competitorSnapshot · getOrResearchCompetitorSnapshot caching", () => {
  beforeEach(() => {
    executeMock.mockReset();
    scoutFetchMock.mockReset();
    scoutAvailableMock.mockReset();
    invokeLLMMock.mockReset();
  });

  it("14 天內的快取直接回傳，不呼叫 scout 或 LLM", async () => {
    const fresh = new Date();
    executeMock.mockResolvedValueOnce([[{
      brandId: 42, competitorName: "綠藤", channels: JSON.stringify([]), strategyDiff: JSON.stringify({}),
      note: "ok：2 則情報", researchedAt: fresh,
    }]]);

    const snap = await getOrResearchCompetitorSnapshot(42, "綠藤");

    expect(snap.stale).toBe(false);
    expect(scoutFetchMock).not.toHaveBeenCalled();
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it("超過 14 天的快取視為過期，重新研究並寫回快取", async () => {
    const stale = new Date(Date.now() - 20 * 86_400_000);
    executeMock
      .mockResolvedValueOnce([[{ brandId: 42, competitorName: "綠藤", channels: "[]", strategyDiff: "{}", note: "old", researchedAt: stale }]])
      .mockResolvedValueOnce([[{ name: "十築", industry: "有機保養", positioning: null }]])
      .mockResolvedValueOnce([{}]);
    scoutAvailableMock.mockResolvedValue(true);
    scoutFetchMock.mockResolvedValue(ITEMS);
    invokeLLMMock.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ channels: [], strategyDiff: {} }) } }] });

    const snap = await getOrResearchCompetitorSnapshot(42, "綠藤");

    expect(scoutFetchMock).toHaveBeenCalledOnce();
    expect(invokeLLMMock).toHaveBeenCalledOnce();
    expect(snap.stale).toBe(false);
    expect(snap.note).toContain("ok");
  });

  it("沒有設定 scout 的 API key 時，誠實回 unknown 而不是憑空生成", async () => {
    executeMock
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{}]);
    scoutAvailableMock.mockResolvedValue(false);

    const snap = await getOrResearchCompetitorSnapshot(7, "某競爭者");

    expect(scoutFetchMock).not.toHaveBeenCalled();
    expect(snap.channels.every((c) => c.active === "unknown")).toBe(true);
    expect(snap.note).toContain("no_scout");
  });
});
