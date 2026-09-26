/**
 * campaignPlan 的行為測試。
 *
 * 2026-09-25（CJ 的活動企劃改版）：這支核心有兩件事會直接毀掉使用者體驗，
 * 而且兩件都不該靠「再跑一次模型」來修：
 *
 *   1. 日期排錯（預熱排在活動開始之後、三天的快閃硬塞五個階段）——使用者
 *      一眼看得出來，看到就不信任整份企劃了。
 *   2. 企劃上的格子指向不存在的任務卡——那顆「去寫這篇」按下去會什麼都沒有，
 *      企劃就退回成另一份沒用的文件，而文件正是這次要取代的東西。
 */
import { describe, it, expect } from "vitest";
import {
  planBeats, reconcileItems, candidateCards, isPartCard, kolBlock, cobrandBlock,
  CAMPAIGN_PHASE_IDS,
} from "./campaignPlan";
import type { CatalogTask } from "../../content/core/taskCatalogIndex";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const card = (id: string, platform: string, tier = "30s"): CatalogTask => ({
  id, platform: platform as any, tier, postType: "post",
  labelZh: `${id} 中文`, labelEn: `${id} en`, source: "evergreen" as any, addedAt: null,
});

describe("planBeats", () => {
  it("正常檔期：預熱在開賣前、倒數在結束前、返場在結束後一天", () => {
    const beats = planBeats({ startAt: d("2026-10-10"), endAt: d("2026-10-23"), today: d("2026-10-01") });
    const first = beats[0]!;
    const last = beats[beats.length - 1]!;
    expect(first.phase).toBe("teaser");
    expect(first.date < "2026-10-10").toBe(true);
    expect(last.phase).toBe("encore");
    expect(last.date).toBe("2026-10-24");
    // 每個階段都出現，而且日期是遞增的
    expect(new Set(beats.map((b) => b.phase))).toEqual(new Set(CAMPAIGN_PHASE_IDS));
    const dates = beats.map((b) => b.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("活動已經開始了就不排預熱 —— 叫人期待一個已經開賣的東西很奇怪", () => {
    const beats = planBeats({ startAt: d("2026-10-01"), endAt: d("2026-10-14"), today: d("2026-10-03") });
    expect(beats.some((b) => b.phase === "teaser")).toBe(false);
    expect(beats[0]!.phase).toBe("launch");
  });

  it("三天的快閃不硬塞中段加溫", () => {
    const beats = planBeats({ startAt: d("2026-10-10"), endAt: d("2026-10-12"), today: d("2026-10-01") });
    expect(beats.some((b) => b.phase === "sustain")).toBe(false);
    expect(beats.length).toBeLessThanOrEqual(7);
  });

  it("沒有填日期也要排得出來（預設從三天後開始的兩週檔期）", () => {
    const beats = planBeats({ startAt: null, endAt: null, today: d("2026-10-01") });
    expect(beats.length).toBeGreaterThan(3);
    expect(beats.every((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.date))).toBe(true);
  });

  it("同一天同一階段不會出現兩格", () => {
    const beats = planBeats({ startAt: d("2026-10-10"), endAt: d("2026-10-10"), today: d("2026-10-09") });
    const keys = beats.map((b) => `${b.phase}:${b.date}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("reconcileItems —— 企劃上的每一格都必須按得下去", () => {
  const cards = [card("fb-30-a", "facebook"), card("fb-30-b", "facebook"), card("ig-30-a", "instagram")];
  const beats = planBeats({ startAt: d("2026-10-10"), endAt: d("2026-10-23"), today: d("2026-10-01") });

  it("模型挑了清單上的卡就照用", () => {
    const raw = { items: beats.map((_, i) => ({ beat: i, platform: "facebook", taskId: "fb-30-b", angle: `切角${i}` })) };
    const items = reconcileItems({ beats, raw, cards, channels: ["facebook", "instagram"] });
    expect(items).toHaveLength(beats.length);
    expect(items.every((x) => x.taskId === "fb-30-b")).toBe(true);
    expect(items.every((x) => !x.repaired)).toBe(true);
    expect(items[0]!.angle).toBe("切角0");
  });

  it("模型編了一張不存在的卡 → 換成該通路的預設卡，並標記修補過（不是默默吞掉）", () => {
    const raw = { items: [{ beat: 0, platform: "facebook", taskId: "fb-30-不存在", angle: "x" }] };
    const items = reconcileItems({ beats, raw, cards, channels: ["facebook"] });
    expect(items[0]!.taskId).toBe("fb-30-a");
    expect(items[0]!.repaired).toBe(true);
    // 每一格的 taskId 都真的在候選清單裡
    expect(items.every((x) => cards.some((c) => c.id === x.taskId))).toBe(true);
  });

  it("模型少給了幾格也要補滿 —— 企劃的格子數由日期決定，不由模型決定", () => {
    const items = reconcileItems({ beats, raw: { items: [] }, cards, channels: ["facebook"] });
    expect(items).toHaveLength(beats.length);
    expect(items.every((x) => x.enabled)).toBe(true);
  });

  it("沒寫切角時用這個階段的目的當預設，不留白", () => {
    const raw = { items: [{ beat: 0, platform: "facebook", taskId: "fb-30-a", angle: "   " }] };
    const items = reconcileItems({ beats, raw, cards, channels: ["facebook"] });
    expect(items[0]!.angle.length).toBeGreaterThan(5);
  });

  it("這個通路一張卡都沒有時寧可少一格，也不放一個按不下去的格子", () => {
    const items = reconcileItems({ beats, raw: { items: [] }, cards: [], channels: ["facebook"] });
    expect(items).toHaveLength(0);
  });
});

describe("candidateCards", () => {
  it("只給使用者選的通路，而且不含 99s（那是整包企劃級，不排進日更節奏）", () => {
    const cards = candidateCards(["facebook"]);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.platform === "facebook")).toBe(true);
    expect(cards.every((c) => c.tier === "30s" || c.tier === "60s")).toBe(true);
  });

  // 2026-09-26：企劃是一張發布時間表，每一行代表「這天要發這個」。素材零件
  // （廣告 CTA、標籤組、開場鉤子）自己佔一行，使用者就得分辨哪幾行不是貼文，
  // 而且那些產出放進貼文版型一定長得很怪——CJ 看到的「顯示很奇怪」就是這樣來的。
  it("零件卡不進企劃：廣告欄位、標籤組、開場鉤子、留言回覆、個人檔案", () => {
    const ids = candidateCards(["facebook", "instagram"]).map((c) => c.id);
    for (const part of [
      "fb-30-ad-cta", "fb-30-ad-headline", "fb-30-ad-primary", "fb-30-ad-description",
      "fb-30-hashtag-set", "ig-30-hashtag-set", "fb-30-pure-text-hook", "ig-30-reel-hook",
      "fb-30-comment-reply", "ig-30-comment-reply", "ig-30-bio-rewrite", "ig-30-dm-script",
    ]) expect(ids, part).not.toContain(part);
  });

  it("整篇可以發的卡要留著（別誤殺）", () => {
    const ids = candidateCards(["facebook", "instagram"]).map((c) => c.id);
    for (const post of [
      "fb-30-caption-short", "fb-60-single-full", "fb-30-story-text", "fb-60-launch-kit",
      "ig-30-caption-short", "ig-60-feed-full", "ig-30-reel-script-full",
    ]) expect(ids, post).toContain(post);
  });

  it("isPartCard 只看 id，不需要整個目錄", () => {
    expect(isPartCard("fb-30-ad-cta")).toBe(true);
    expect(isPartCard("fb-30-caption-short")).toBe(false);
  });

  it("通路名稱亂填不會炸，只是沒有卡", () => {
    expect(candidateCards(["不存在的通路"])).toHaveLength(0);
  });
});

describe("合作段落", () => {
  it("網紅合作每一步都接到真實存在的 KOL 卡", () => {
    const b = kolBlock("買二送一", candidateCards(["facebook"]));
    expect(b.steps.length).toBeGreaterThanOrEqual(3);
    expect(b.steps.every((s) => !!s.taskId)).toBe(true);
  });

  it("異業合作目前沒有對應的卡，所以只給步驟、不假裝有卡可以按", () => {
    const b = cobrandBlock("買二送一", "懶得煮");
    expect(b.steps.length).toBeGreaterThanOrEqual(3);
    expect(b.steps.every((s) => !s.taskId)).toBe(true);
  });
});
