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
  normalizeRoleChannel, roleChannelOfTaskId, roleChannelOfTemplate, cleanChannelRole, clampField, isEmptyChannelRole,
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

describe("roleChannelOfTemplate", () => {
  it("id 前綴優先；沒有前綴才看 outputDefaults.platform", () => {
    expect(roleChannelOfTemplate({ id: "ig-30-x", outputDefaults: { platform: "facebook" } })).toBe("instagram");
    expect(roleChannelOfTemplate({ id: "u123-my-card", outputDefaults: { platform: "threads" } })).toBe("threads");
  });
  it("兩個都對不上就是 null，不會退回 facebook", () => {
    expect(roleChannelOfTemplate({ id: "u123-my-card" })).toBeNull();
    expect(roleChannelOfTemplate({ id: "yt-30-x", outputDefaults: { platform: "youtube" } })).toBeNull();
    expect(roleChannelOfTemplate(null)).toBeNull();
  });
});

describe("產文入口都有把平台帶進品牌大腦", () => {
  // 行為測試跑不到這些入口（要 DB、LLM、整個 router），所以用最便宜的守門：
  // 這幾支「有任務／squad／圖片卡身分」的產文入口，必須呼叫 roleChannelOf*。
  // 新增產文入口時，要嘛接上、要嘛寫進下面 INTENTIONALLY_WITHOUT 並說明為什麼不需要。
  const root = new URL("../../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const MUST = [
    "content/core/engine/quickTaskOrchestra.ts",
    "content/routers/quickTask/refineProcedures.ts",
    "content/routers/quickTask/runProcedures.ts",
    "content/routers/quickTask/squadAutoProcedures.ts",
    "content/routers/squadTemplate/stepProcedures.ts",
  ];
  it.each(MUST)("%s 讀 roleChannelOf*", async (f) => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(`${root}/${f}`, "utf-8")).toMatch(/roleChannelOf(TaskId|Template)/);
  });
  it("圖片卡 propose 帶 spec.channel", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(`${root}/content/routers/imageCardRouter.ts`, "utf-8")).toMatch(/buildBrandPrefix\([^)]*spec\.channel\)/);
  });
  // INTENTIONALLY_WITHOUT（不帶平台是對的）：
  //  · inspirationRouter —— 一輪同時想多個平台的切角，沒有單一平台
  //  · campaignPlan／campaignChat／campaignKpi —— 整檔活動的跨平台企劃
  //  · rewriteDraft —— 通用文案診斷工具，沒有平台
  //  · agentContextLoader —— 任務對話脈絡，不是某個平台的產文
  //  · generateVideoScript —— YouTube，不在七通路
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

describe("clampField", () => {
  it("沒超過上限原樣回傳", () => {
    expect(clampField("很短的一句。", 200)).toBe("很短的一句。");
  });
  it("超過上限時停在句尾，不攔腰截斷", () => {
    const text = "第一句話在這裡。".repeat(10) + "最後一句沒有寫完所以不該出現在結果裡而且很長很長很長";
    const out = clampField(text, 50);
    expect([...out].length).toBeLessThanOrEqual(50);
    expect(out.endsWith("。")).toBe(true);
  });
  it("句尾落在前半段以前就硬截（不為了句尾丟掉大半內容）", () => {
    const text = "短。" + "字".repeat(300);
    expect([...clampField(text, 100)].length).toBe(100);
  });
  it("cleanChannelRole 也走同一套", () => {
    const r = cleanChannelRole({ avoid: "條款一。".repeat(100) });
    expect(r.avoid.endsWith("。")).toBe(true);
    expect([...r.avoid].length).toBeLessThanOrEqual(300);
  });
});
