/**
 * taskRegistry — 收斂前的六條手抄查表鏈換成一支之後，行為必須一模一樣，
 * 而且原本漏掉的那條要補起來。
 *
 * 為什麼值得測：這條鏈在 quickTaskRouter.ts 裡抄了六次（記錄裡一直說五次），
 * 抄第五次時漏了 KOL 的 config —— 一個 KOL 任務按「換人重寫」就丟
 * `no orchestra config`，其他四個入口都好好的。這種錯不會有型別錯誤、不會有
 * 測試紅，只有那個頻道的那個按鈕壞掉。
 */
import { describe, expect, it, afterEach } from "vitest";
import {
  resolveTask, resolveTaskTemplate, resolveOrchestraConfig, resolveTaskOrThrow,
  resolveTaskTemplateSync, taskTierOfSync,
  registerTaskSource, __resetTaskSourcesForTest,
} from "./taskRegistry";
import { KOL_30S_TASKS } from "./quickTaskKOL";
import { FB_30S_TASKS } from "./quickTaskFB";
import { WEBSITE_30S_TASKS } from "./quickTaskWebsite";
import { ALL_99S_TASKS } from "./quickTask100";
import { FB_60S_TASKS_V2 } from "./quickTaskFB60";
import { PACKS } from "../../strategy/core/brandPacks";

afterEach(() => __resetTaskSourcesForTest());

describe("每個頻道的卡都解析得到 template + config", () => {
  // 2026-09-02 迴歸：KOL 原本只在 regenerateVariant 那條鏈裡被漏掉。
  it.each(KOL_30S_TASKS.map((t) => t.id))("KOL %s", async (id) => {
    const r = await resolveTask(id);
    expect(r, `${id} 解析不到 —— regenerateVariant 就是這樣壞的`).toBeTruthy();
    expect(r!.tier).toBe("30s");
  });

  it.each(WEBSITE_30S_TASKS.map((t) => t.id))("官網 %s", async (id) => {
    expect(await resolveTask(id)).toBeTruthy();
  });

  it("30s / 60s / 99s 各抽一張都對得到正確的 tier", async () => {
    expect((await resolveTask(FB_30S_TASKS[0]!.id))?.tier).toBe("30s");
    expect((await resolveTask(FB_60S_TASKS_V2[0]!.id))?.tier).toBe("60s");
    expect((await resolveTask(ALL_99S_TASKS[0]!.id))?.tier).toBe("99s");
  });

  it("brandPack 的自訂卡解析得到，且歸類為 custom", async () => {
    const custom = PACKS.flatMap((p) => p.cards).find((c) => c.kind === "custom");
    expect(custom, "測試需要至少一張 pack 自訂卡").toBeTruthy();
    const id = (custom as any).template.id;
    const r = await resolveTask(id);
    expect(r?.source).toBe("custom");
  });
});

describe("解析不到時的錯誤要說得出原因", () => {
  it("完全不存在的 id", async () => {
    expect(await resolveTask("nope-does-not-exist")).toBeNull();
    await expect(resolveTaskOrThrow("nope-does-not-exist")).rejects.toThrow("未知的任務 id");
  });

  it("有 template 沒 config 時，錯誤訊息要指出是缺 config", async () => {
    registerTaskSource({
      name: "test-template-only",
      template: (id) => (id === "half-baked" ? ({ id, tier: "30s" } as any) : null),
      config: () => null,
    });
    await expect(resolveTaskOrThrow("half-baked")).rejects.toThrow("沒有 orchestra config");
  });
});

describe("外掛來源（用戶自建卡接上來的位置）", () => {
  it("註冊之後六個呼叫點共用的解析器就查得到", async () => {
    registerTaskSource({
      name: "test-custom",
      template: async (id) => (id === "u123-my-card" ? ({ id, tier: "30s", label: "自建卡" } as any) : null),
      config: async (id) => (id === "u123-my-card" ? ({ variants: 3, variantLabels: ["a", "b", "c"] } as any) : null),
    });
    const r = await resolveTask("u123-my-card");
    expect(r?.source).toBe("custom");
    expect(r?.config.variants).toBe(3);
    // 同步版看不到自建卡 —— 這是刻意的，呼叫端要知道自己拿到的是哪一種。
    expect(resolveTaskTemplateSync("u123-my-card")).toBeNull();
  });

  it("同名來源註冊兩次只算一次（模組被 import 兩次時不該重複）", async () => {
    let calls = 0;
    const src = {
      name: "test-dupe",
      template: () => { calls++; return null; },
      config: () => null,
    };
    registerTaskSource(src);
    registerTaskSource(src);
    await resolveTaskTemplate("whatever");
    expect(calls).toBe(1);
  });

  it("程式碼目錄優先於外掛來源 —— 自建卡不可以蓋掉內建卡", async () => {
    const builtin = FB_30S_TASKS[0]!.id;
    registerTaskSource({
      name: "test-hijack",
      template: () => ({ id: builtin, tier: "30s", label: "冒牌貨" } as any),
      config: () => ({ variants: 99 } as any),
    });
    const r = await resolveTask(builtin);
    expect((r!.template as any).label).not.toBe("冒牌貨");
    expect(r!.source).toBe("30s");
  });
});

describe("同步版", () => {
  it("taskTierOfSync 對得上 resolveTask 的 tier", async () => {
    for (const id of [FB_30S_TASKS[0]!.id, FB_60S_TASKS_V2[0]!.id, ALL_99S_TASKS[0]!.id]) {
      expect(taskTierOfSync(id)).toBe((await resolveTask(id))!.tier);
    }
  });

  it("resolveOrchestraConfig 單獨查也拿得到 KOL", async () => {
    expect(await resolveOrchestraConfig(KOL_30S_TASKS[0]!.id)).toBeTruthy();
  });
});
