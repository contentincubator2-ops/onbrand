import { describe, expect, it } from "vitest";
import {
  BOOK_PRESETS, bookMark, bookPromptCards, bookView, deriveBookCard, effectiveBody, proposalOf,
} from "./positioningBook";

const T1 = "2026-10-10T01:00:00.000Z";
const T2 = "2026-10-10T02:00:00.000Z";

describe("positioningBook", () => {
  it("第一次進來：十張預設卡照預設順序，全部空白", () => {
    const { cards, hidden } = bookView({});
    expect(cards.map((c) => c.id)).toEqual(BOOK_PRESETS.map((p) => p.id));
    expect(cards.at(-1)!.id).toBe("manifesto");
    expect(cards.every((c) => !c.body && !c.derived)).toBe(true);
    expect(hidden).toEqual([]);
  });

  it("跑過定位法或上傳過文件：卡片顯示從原本欄位整理出來的字，而且只搬運不改寫", () => {
    const pos = {
      audience: { primary: "30 歲的新手爸媽", painPoints: ["沒時間", "怕選錯"] },
      tagline: { zhTagline: "陪你長大" },
      differentiation: { summary: "唯一做到 A 的品牌", discriminator: "A" },
    };
    expect(deriveBookCard("audience", pos)).toBe("主受眾：30 歲的新手爸媽\n痛點：沒時間、怕選錯");
    expect(deriveBookCard("tagline", pos)).toBe("陪你長大");
    expect(deriveBookCard("challenge", pos)).toBe("");
    const audience = bookView(pos).cards.find((c) => c.id === "audience")!;
    expect(audience.body).toBe("");
    expect(effectiveBody(audience)).toContain("30 歲的新手爸媽");
  });

  it("顧問寫過的內容優先，寫過之後不再顯示整理出來的字", () => {
    const pos = {
      audience: { primary: "舊的受眾" },
      _book: { cards: { audience: { body: "顧問定稿的受眾", updatedAt: T1 } } },
    };
    const c = bookView(pos).cards.find((x) => x.id === "audience")!;
    expect(c.body).toBe("顧問定稿的受眾");
    expect(c.derived).toBe("");
  });

  it("進品牌大腦的只有顧問寫過的卡——整理出來的字，原本的欄位已經會被讀到", () => {
    const pos = {
      audience: { primary: "舊的受眾" },
      _book: { cards: { proposition: { body: "對新手爸媽來說，我們是…", updatedAt: T1 } } },
    };
    expect(bookPromptCards(pos).map((c) => c.id)).toEqual(["proposition"]);
  });

  it("順序照用戶排的；拿掉的預設卡不在牆上、列在可以加回來的清單；自訂卡留在排的位置", () => {
    const pos = {
      _book: {
        order: ["tagline", "c_1", "challenge"],
        hidden: ["audit"],
        cards: { c_1: { title: "品牌架構", body: "母品牌與子品牌", updatedAt: T1 } },
      },
    };
    const { cards, hidden } = bookView(pos);
    expect(cards.slice(0, 3).map((c) => c.id)).toEqual(["tagline", "c_1", "challenge"]);
    expect(cards.some((c) => c.id === "audit")).toBe(false);
    expect(cards).toHaveLength(BOOK_PRESETS.length);
    expect(hidden.map((p) => p.id)).toEqual(["audit"]);
    expect(cards[1]).toMatchObject({ preset: null, title: "品牌架構" });
  });

  it("前面的卡片在這張之後改過，這張要標出來", () => {
    const pos = {
      _book: {
        cards: {
          audience: { body: "後來改過的受眾", updatedAt: T2 },
          proposition: { body: "先寫好的主張", updatedAt: T1 },
          tagline: { body: "最後寫的標語", updatedAt: T2 },
        },
      },
    };
    const by = Object.fromEntries(bookView(pos).cards.map((c) => [c.id, c.upstreamChanged]));
    expect(by.audience).toBe(false);
    expect(by.proposition).toBe(true);
    expect(by.tagline).toBe(false);
  });

  it("提案寫好之後卡片再改或換順序，提案標成過期", () => {
    const base = { _book: { cards: { audience: { body: "A", updatedAt: T1 } } } } as any;
    const mark = bookMark(bookView(base).cards);
    const withProposal = (book: any) => ({ _book: { ...book, proposal: { text: "# 提案", at: T1, mark } } });
    const same = withProposal(base._book);
    expect(proposalOf(same, bookView(same).cards)!.stale).toBe(false);
    const edited = withProposal({ cards: { audience: { body: "B", updatedAt: T2 } } });
    expect(proposalOf(edited, bookView(edited).cards)!.stale).toBe(true);
    const moved = withProposal({ ...base._book, order: ["tagline", "audience"] });
    expect(proposalOf(moved, bookView(moved).cards)!.stale).toBe(true);
  });

  it("畫面與提示不出現特定代理商的名字", () => {
    expect(JSON.stringify(BOOK_PRESETS)).not.toMatch(/奧美|Ogilvy/i);
  });
});
