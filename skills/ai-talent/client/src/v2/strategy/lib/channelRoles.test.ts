import { describe, expect, it } from "vitest";
import {
  CHANNELS, CHANNEL_ROLE_FIELDS, EMPTY_ROLE, mergeProposal, overwrittenKeys, roleFilledCount, roleHeadline, roleIsEmpty,
} from "./channelRoles";

describe("channelRoles (client)", () => {
  it("七通路、五格，順序與 server 一致", () => {
    expect(CHANNELS.map((c) => c.id)).toEqual(["facebook", "instagram", "threads", "line", "tiktok", "email", "website"]);
    expect(CHANNEL_ROLE_FIELDS.map((f) => [f.key, f.max])).toEqual([
      ["role", 200], ["audience", 200], ["coreMessage", 300], ["tone", 200], ["avoid", 300],
    ]);
  });

  it("mergeProposal 只覆蓋提案有值的格，其餘保留", () => {
    const cur = { ...EMPTY_ROLE, role: "我寫的角色", tone: "我寫的語氣" };
    const next = mergeProposal(cur, { audience: "AI 提的受眾", tone: "" });
    expect(next.role).toBe("我寫的角色");
    expect(next.tone).toBe("我寫的語氣");
    expect(next.audience).toBe("AI 提的受眾");
  });

  it("mergeProposal 截到單格上限", () => {
    const next = mergeProposal(EMPTY_ROLE, { role: "字".repeat(500) });
    expect([...next.role].length).toBe(200);
  });

  it("overwrittenKeys 只列「用戶已寫、且內容不同」的格", () => {
    const cur = { ...EMPTY_ROLE, role: "A", tone: "B", avoid: "C" };
    expect(overwrittenKeys(cur, { role: "A", tone: "不同", audience: "新" })).toEqual(["tone"]);
  });

  it("空判斷與代表句", () => {
    expect(roleIsEmpty(EMPTY_ROLE)).toBe(true);
    expect(roleFilledCount({ ...EMPTY_ROLE, role: "x", tone: " " })).toBe(1);
    expect(roleHeadline({ ...EMPTY_ROLE, role: "角色", coreMessage: "主訊息" })).toBe("主訊息");
    expect(roleHeadline({ ...EMPTY_ROLE, role: "角色" })).toBe("角色");
    expect(roleHeadline(EMPTY_ROLE)).toBeNull();
  });
});
