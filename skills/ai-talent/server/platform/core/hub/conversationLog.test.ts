import { beforeEach, describe, expect, it, vi } from "vitest";

const rows: any[] = [];
const inserts: any[][] = [];
vi.mock("./hubStore", () => ({
  q: vi.fn(async (sql: string) => {
    if (/FROM hub_messages WHERE rep_id/.test(sql)) return [...rows].reverse(); // query is DESC
    if (/FROM hub_reps/.test(sql)) return [{ id: 7, avatar_seed: "priya" }];
    if (/FROM hub_solutions/.test(sql)) {
      return [
        { id: 1, slug: "zynkr", name_en: "Zynkr AI Sales Follow-up", name_zh: "Zynkr", vendor: "V" },
        { id: 2, slug: "lightning-order", name_en: "Lightning Order", name_zh: "閃電下單", vendor: "V" },
        { id: 3, slug: "gogoform", name_en: "GogoForm e-Approvals", name_zh: "GogoForm", vendor: "V" },
      ];
    }
    return [];
  }),
  exec: vi.fn(async (_sql: string, params: any[]) => {
    inserts.push(params);
    return { insertId: 1, affectedRows: 1 };
  }),
}));

const { listRepConversations, postbackLabel, recordOutbound, seedDemoConversations } = await import("./conversationLog");

const at = (min: number) => new Date(Date.UTC(2026, 9, 4, 9, 0) + min * 60_000);
const carousel = {
  type: "carousel",
  cards: [{ title: "Zynkr", buttons: [{ kind: "postback", label: "LinkedIn", data: "a=gen&s=1&c=linkedin", displayText: "LinkedIn post: Zynkr" }] }],
};

beforeEach(() => {
  rows.length = 0;
  inserts.length = 0;
});

describe("postbackLabel", () => {
  it("prefers what the rep saw on the button they tapped", () => {
    expect(postbackLabel("a=gen&s=1&c=linkedin", [carousel as any], "US")).toBe("LinkedIn post: Zynkr");
  });
  it("falls back to the rich-menu name, then to the raw data", () => {
    expect(postbackLabel("a=stats", null, "US")).toBe("My results");
    expect(postbackLabel("a=stats", null, "TW")).toBe("我的成效");
    expect(postbackLabel("a=weird", null, "US")).toBe("a=weird");
  });
});

describe("listRepConversations", () => {
  it("splits on long gaps and on channel changes, newest session first", async () => {
    rows.push(
      { id: 1, channel: "whatsapp", direction: "in", kind: "text", text: "Write a post", created_at: at(0) },
      { id: 2, channel: "whatsapp", direction: "out", kind: "bot", payload: [{ type: "text", text: "Which one?" }], created_at: at(1) },
      { id: 3, channel: "whatsapp", direction: "in", kind: "text", text: "Ask AI", created_at: at(120) },
      { id: 4, channel: "simulator", direction: "in", kind: "text", text: "hi", created_at: at(121) },
    );
    const s = await listRepConversations(7, "US");
    expect(s.map((x) => [x.channel, x.count, x.preview])).toEqual([
      ["simulator", 1, "hi"],
      ["whatsapp", 1, "Ask AI"],
      ["whatsapp", 2, "Write a post"],
    ]);
  });

  it("renders bot turns through the real WhatsApp converter and labels taps", async () => {
    rows.push(
      { id: 1, channel: "whatsapp", direction: "out", kind: "bot", payload: JSON.stringify([carousel]), created_at: at(0) },
      { id: 2, channel: "whatsapp", direction: "in", kind: "postback", text: "a=gen&s=1&c=linkedin", created_at: at(1) },
    );
    const [s] = await listRepConversations(7, "US");
    const out = s!.lines[0]!;
    // carousel has no WhatsApp equivalent → list message, with no recipient fields leaking out
    expect(out.whatsapp?.[0]?.type).toBe("interactive");
    expect(out.whatsapp?.[0]?.interactive.type).toBe("list");
    expect(out.whatsapp?.[0]?.interactive.action.button).toBe("Choose");
    expect(out.whatsapp?.[0]).not.toHaveProperty("to");
    expect(s!.lines[1]).toMatchObject({ direction: "in", text: "LinkedIn post: Zynkr", tapped: true });
    expect(s!.preview).toBe("Zynkr"); // the session opens with the bot's list, so that is the preview
  });
});

describe("recording", () => {
  it("never throws when the database does", async () => {
    const store = await import("./hubStore");
    vi.mocked(store.exec).mockRejectedValueOnce(new Error("db down"));
    await expect(recordOutbound({ orgId: 1, repId: 7, channel: "line", messages: [{ type: "text", text: "x" }] })).resolves.toBeUndefined();
  });

  it("seeds a demo rep's transcript in time order", async () => {
    const n = await seedDemoConversations(1);
    expect(n).toBeGreaterThan(10);
    const times = inserts.map((p) => (p[p.length - 1] as Date).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times.slice().sort((a, b) => a - b));
    expect(inserts.every((p) => p[1] === 7)).toBe(true);
  });
});
