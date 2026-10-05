/**
 * customChannels.test — 自訂 mission tray 的 id 規則、平台範本資料、各處放行。
 *
 * 這條線的風險不在單一函式，而在「好幾處各自寫死通路清單」：id 形狀改了一邊、另一邊
 * 還認舊的，用戶的 tray 就會在某一層靜靜消失（側欄濾掉、方案閘門濾掉、路由導回 FB）。
 * 所以這裡把各處的放行行為一起鎖住。
 */
import { describe, it, expect, vi } from "vitest";

// localDb 會在載入時建連線池；這支只測純函式，不需要資料庫。
vi.mock("../../../localDb", () => ({ default: { execute: vi.fn() } }));

import {
  CHANNEL_PRESETS, MAX_CUSTOM_CHANNELS_PER_BRAND, buildChannel, presetByKey, slugifyChannelName,
} from "./customChannels";
import { CUSTOM_CHANNEL_RE, brandIdOfChannelId, isCustomChannelId } from "../../../platform/core/customChannelId";
import { CUSTOM_CHANNEL_RE as CLIENT_RE, isCustomChannelId as clientIs } from "../../../../client/src/v2/content/lib/customChannelId";
import { sanitizeNavItems } from "../../../platform/routers/navPrefsRouter";
import { filterTasksByPlan } from "../../../platform/core/billing/planGate";
import { customChannelRouter } from "../../routers/customChannelRouter";

describe("自訂通路 id", () => {
  it("形狀：c<brandId>-<slug>，並能剖出 brandId", () => {
    expect(isCustomChannelId("c12-shopee")).toBe(true);
    expect(brandIdOfChannelId("c12-shopee")).toBe(12);
    for (const bad of ["shopee", "u12-shopee", "c-shopee", "c12-", "c12-Shopee", "c12_shopee", "facebook", "", null, 12]) {
      expect(isCustomChannelId(bad as any)).toBe(false);
    }
    expect(brandIdOfChannelId("facebook")).toBeNull();
  });

  it("不會跟自建卡 id（u<brandId>-…）或內建通路撞", () => {
    expect(isCustomChannelId("u12-shopee")).toBe(false);
    for (const p of ["facebook", "instagram", "threads", "line", "tiktok", "email", "website", "kol", "cobrand"]) {
      expect(isCustomChannelId(p)).toBe(false);
    }
  });

  it("client 鏡像與 server 同一份（client 不能 import server，所以靠這支鎖）", () => {
    expect(CLIENT_RE.source).toBe(CUSTOM_CHANNEL_RE.source);
    for (const s of ["c12-shopee", "c1-a", "u12-x", "c12-", "facebook"]) expect(clientIs(s)).toBe(isCustomChannelId(s));
  });
});

describe("平台範本", () => {
  it("key 不重複；每筆都有中英文名稱與說明", () => {
    const keys = CHANNEL_PRESETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of CHANNEL_PRESETS) {
      expect(p.zh.length).toBeGreaterThan(0);
      expect(p.en.length).toBeGreaterThan(0);
      expect(p.note.zh.length).toBeGreaterThan(0);
      expect(p.note.en.length).toBeGreaterThan(0);
    }
  });

  it("每個範本都能蓋出合法 id（slug 取 key）", () => {
    for (const p of CHANNEL_PRESETS) {
      const ch = buildChannel(2992, [], { preset: p.key, userId: 1 });
      expect(CUSTOM_CHANNEL_RE.test(ch.id)).toBe(true);
      expect(ch.id).toBe(`c2992-${p.key}`);
      expect(ch.format).toBe(p.format);
    }
  });

  it("2026-10-04 查證結果：蝦皮／露天／SHOPLINE／Cyberbiz 官方 API；momo／PChome 沒找到；Yahoo 超級商城不在清單", () => {
    for (const k of ["shopee", "ruten", "shopline", "cyberbiz"]) expect(presetByKey(k)?.api).toBe("official");
    for (const k of ["momo", "pchome"]) expect(presetByKey(k)?.api).toBe("none-found");
    expect(presetByKey("91app")?.api).toBe("partner-key");
    expect(CHANNEL_PRESETS.some((p) => /超級商城/.test(p.zh))).toBe(false);
  });

  it("電商與開店平台是商品頁（listing），網紅合作是 partner", () => {
    for (const p of CHANNEL_PRESETS.filter((p) => p.group === "marketplace" || p.group === "storefront")) expect(p.format).toBe("listing");
    expect(presetByKey("influencer")?.format).toBe("partner");
  });
});

describe("buildChannel", () => {
  it("用戶自己命名：中文名取不出 ascii 時 slug 退回時間戳，id 仍合法", () => {
    const ch = buildChannel(7, [], { name: "蝦皮賣場二館", userId: 1 });
    expect(CUSTOM_CHANNEL_RE.test(ch.id)).toBe(true);
    expect(ch.name).toBe("蝦皮賣場二館");
    expect(ch.preset).toBeNull();
    expect(ch.format).toBe("post");
  });

  it("自己命名時可以選型態：商品頁（listing）或貼文（預設）；範本以範本自己的型態為準", () => {
    expect(buildChannel(7, [], { name: "Pinkoi 賣場", format: "listing", userId: 1 }).format).toBe("listing");
    expect(buildChannel(7, [], { name: "Pinkoi 賣場", userId: 1 }).format).toBe("post");
    expect(buildChannel(7, [], { name: "x1", format: "post", userId: 1 }).format).toBe("post");
    // 帶了 preset 就以範本為準，不被 format 蓋掉
    expect(buildChannel(7, [], { preset: "shopee", format: "post", userId: 1 }).format).toBe("listing");
  });

  it("英文名取 slug；撞名加序號", () => {
    const a = buildChannel(7, [], { name: "Pinkoi Shop", userId: 1 });
    expect(a.id).toBe("c7-pinkoi-shop");
    const b = buildChannel(7, [a], { name: "Pinkoi Shop", userId: 1 });
    expect(b.id).toBe("c7-pinkoi-shop-2");
  });

  it("沒給名字也沒給範本、或範本不存在，都丟錯", () => {
    expect(() => buildChannel(7, [], { userId: 1 })).toThrow();
    expect(() => buildChannel(7, [], { preset: "nope", userId: 1 })).toThrow();
  });

  it("slugifyChannelName 不產生非法字元", () => {
    for (const n of ["蝦皮", "Shop!!", "  a b  ", "x"]) expect(/^[a-z0-9][a-z0-9-]*$/.test(slugifyChannelName(n))).toBe(true);
    expect(MAX_CUSTOM_CHANNELS_PER_BRAND).toBeGreaterThan(CHANNEL_PRESETS.length - 1);
  });
});

describe("各處放行自訂通路", () => {
  it("側欄偏好：認得自己品牌的自訂 id，不認得別的品牌的", () => {
    expect(sanitizeNavItems(["fb", "c12-shopee", "c99-shopee"], 12)).toEqual(["fb", "c12-shopee"]);
    expect(sanitizeNavItems(["c12-shopee", "nope"])).toEqual(["c12-shopee"]);
  });

  it("方案閘門：受限方案只開 2 個內建通路，自訂通路的卡仍看得到；其他內建通路照擋", () => {
    const quota = { platforms: 2, viralTaskCards: false };
    const channels = { platforms: ["facebook", "instagram"], swappedAt: null };
    const tasks = [
      { id: "a", platform: "facebook" },
      { id: "b", platform: "tiktok" },
      { id: "c", platform: "c12-shopee" },
    ];
    expect(filterTasksByPlan(tasks, quota, channels).map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("router：procedure 名稱不撞 tRPC 保留字，且包含 presets/list/create/rename/remove", () => {
    const names = Object.keys((customChannelRouter as any)._def.procedures).sort();
    expect(names).toEqual(["create", "list", "presets", "remove", "rename"]);
    for (const n of names) expect(Object.getOwnPropertyNames(Function.prototype)).not.toContain(n);
  });
});
