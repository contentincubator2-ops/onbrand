/**
 * 通路角色：存在 positioning.channelRoles，產文時只注入「這次任務所在平台」的那一張。
 *
 * 行為測試（跑真的 buildBrandPrefix），不是檢查原始碼字串——這類功能最容易出的錯是
 * 「存了、畫面也顯示，但產文根本沒讀」或「讀錯平台」，兩種都是 job done、畫面正常、東西平庸。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./marketProfiles", () => ({ buildMarketContext: async () => "" }));
vi.mock("../../../db", () => ({ getDb: async () => ({ execute: async () => [[]] }) }));

const rowsFor = { brand: [] as any[] };
vi.mock("../../../localDb", () => ({
  default: {
    execute: async (sqlText: string) => {
      if (/FROM\s+brands/i.test(sqlText)) return [rowsFor.brand];
      return [[]];
    },
  },
}));

import { buildBrandPrefix, buildBrandBrain, _clearBrandPrefixCache } from "./brandContext";
import {
  normalizeRoleChannel, roleChannelOfTaskId, cleanChannelRole, isEmptyChannelRole,
  channelRolesOf, isVerbatimIn, CHANNEL_ROLE_FIELDS, ROLE_CHANNELS,
} from "./channelRoles";

const IG = { role: "IG-ROLE-SENTINEL", audience: "IG-AUD", coreMessage: "IG-MSG", tone: "IG-TONE", avoid: "IG-AVOID" };
const LINE = { role: "LINE-ROLE-SENTINEL", audience: "LINE-AUD", coreMessage: "LINE-MSG", tone: "LINE-TONE", avoid: "LINE-AVOID" };

beforeEach(() => {
  _clearBrandPrefixCache();
  rowsFor.brand = [{
    name: "測試品牌", tagline: "", positioningSummary: "", positioningReport: null, positioningStatus: "",
    targetCountry: "TW", outputLanguage: "zh-TW", marketContextOverride: null,
    positioning: JSON.stringify({ goldenCircle: { why: "WHY-SENTINEL" }, channelRoles: { instagram: IG, line: LINE } }),
  }];
});

describe("buildBrandPrefix × channel", () => {
  it("帶 instagram → 只注入 IG 的五格，LINE 的不進 prompt", async () => {
    const p = await buildBrandPrefix(1, null, null, "full", "instagram");
    for (const v of Object.values(IG)) expect(p).toContain(v);
    expect(p).not.toContain("LINE-ROLE-SENTINEL");
    expect(p).toContain("WHY-SENTINEL");
  });

  it("沒帶 channel → 任何通路角色都不進 prompt（跟以前完全一樣）", async () => {
    const p = await buildBrandPrefix(1);
    expect(p).not.toContain("IG-ROLE-SENTINEL");
    expect(p).not.toContain("LINE-ROLE-SENTINEL");
  });

  it("channel 對不上七通路（press／youtube）→ 不注入、不報錯", async () => {
    const p = await buildBrandPrefix(1, null, null, "full", "press");
    expect(p).not.toContain("ROLE-SENTINEL");
    expect(p).toContain("WHY-SENTINEL");
  });

  it("該平台沒存過 → 不注入，也不會拿別的平台頂替", async () => {
    const p = await buildBrandPrefix(1, null, null, "full", "tiktok");
    expect(p).not.toContain("ROLE-SENTINEL");
  });

  it("不同 channel 不共用快取", async () => {
    const ig = await buildBrandPrefix(1, null, null, "full", "instagram");
    const line = await buildBrandPrefix(1, null, null, "full", "line");
    expect(ig).toContain("IG-ROLE-SENTINEL");
    expect(line).toContain("LINE-ROLE-SENTINEL");
    expect(line).not.toContain("IG-ROLE-SENTINEL");
  });

  it("大腦清單帶出來源 channel:<id>，且被標在品牌類別的「通路角色」群組", async () => {
    const brain = await buildBrandBrain(1, null, null, "line");
    const item = brain.items.find((i) => i.source === "channel:line");
    expect(item).toBeTruthy();
    expect(item!.group).toBe("通路角色");
    expect(item!.status).toBe("remembered");
  });
});

describe("client 鏡像", () => {
  it("client/lib/channelRoles.ts 的通路清單、欄位 key、單格上限與 server 一致", async () => {
    // 跨邊界的測試放 server 側：client 不得 value-import server，反過來讀 client 的純資料檔沒問題。
    const client = await import("../../../../client/src/v2/strategy/lib/channelRoles");
    expect(client.CHANNELS.map((c) => c.id)).toEqual([...ROLE_CHANNELS]);
    expect(client.CHANNEL_ROLE_FIELDS.map((f) => [f.key, f.max]))
      .toEqual(CHANNEL_ROLE_FIELDS.map((f) => [f.key, f.max]));
  });
});

describe("helpers", () => {
  it("normalizeRoleChannel 吃縮寫與中文，其餘回 null", () => {
    expect(normalizeRoleChannel("FB")).toBe("facebook");
    expect(normalizeRoleChannel("ig")).toBe("instagram");
    expect(normalizeRoleChannel("電子報")).toBe("email");
    expect(normalizeRoleChannel("官網")).toBe("website");
    expect(normalizeRoleChannel("press")).toBeNull();
    expect(normalizeRoleChannel("")).toBeNull();
    for (const c of ROLE_CHANNELS) expect(normalizeRoleChannel(c)).toBe(c);
  });

  it("roleChannelOfTaskId 只認七通路前綴，不像 platformOfTaskId 預設成 facebook", () => {
    expect(roleChannelOfTaskId("ig-99-carousel")).toBe("instagram");
    expect(roleChannelOfTaskId("th-30-hot-take")).toBe("threads");
    expect(roleChannelOfTaskId("ln-60-push")).toBe("line");
    expect(roleChannelOfTaskId("web-99-case")).toBe("website");
    expect(roleChannelOfTaskId("yt-30-script")).toBeNull();
    expect(roleChannelOfTaskId("custom-card-1")).toBeNull();
    expect(roleChannelOfTaskId(undefined)).toBeNull();
  });

  it("cleanChannelRole 截到單格上限、去空白、忽略未知欄位", () => {
    const long = "字".repeat(999);
    const r = cleanChannelRole({ role: `  ${long} `, audience: 5, bogus: "x" });
    const spec = Object.fromEntries(CHANNEL_ROLE_FIELDS.map((f) => [f.key, f.max]));
    expect([...r.role].length).toBe(spec.role);
    expect(r.audience).toBe("");
    expect((r as any).bogus).toBeUndefined();
    expect(isEmptyChannelRole(cleanChannelRole({}))).toBe(true);
  });

  it("channelRolesOf 略過全空的通路", () => {
    const got = channelRolesOf({ channelRoles: { instagram: IG, line: { role: "", audience: " " } } });
    expect(Object.keys(got)).toEqual(["instagram"]);
  });

  it("isVerbatimIn：忽略空白與 markdown，不忽略改寫", () => {
    const src = "我們在 IG 的角色是「被看見」，主要對 **25-35 歲的年輕人** 說話。";
    expect(isVerbatimIn("25-35 歲的年輕人", src)).toBe(true);
    expect(isVerbatimIn("25 到 35 歲的年輕族群", src)).toBe(false);
    expect(isVerbatimIn("a", src)).toBe(false);
  });
});
