/**
 * 前台「AI 搜尋」那一類卡（client sourceVocabulary.AEO_CARD_IDS）必須對得上真實目錄。
 *
 * 那份名單寫在 client（前台列不列是 client 的事），但 id 與通路是 server 目錄決定的。
 * 卡被改名或刪掉時，client 不會報錯——YouTube／新聞稿頁就悄悄少一張，甚至變空頁。
 */
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";
import { buildTaskCatalogIndex } from "../../../content/core/catalog/taskCatalogIndex";
import { isHiddenContentPlatform } from "./planGate";

const ROOT = resolve(__dirname, "../../../..");

function readAeoIds(): string[] {
  const src = readFileSync(join(ROOT, "client/src/v2/platform/lib/sourceVocabulary.ts"), "utf8");
  const block = /export const AEO_CARD_IDS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(src)?.[1] ?? "";
  return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

describe("AI 搜尋卡名單", () => {
  const ids = readAeoIds();
  const byId = new Map(buildTaskCatalogIndex().map((t) => [t.id, t]));

  it("讀得到名單", () => {
    expect(ids.length).toBeGreaterThan(0);
  });

  it("每一張都在目錄裡", () => {
    expect(ids.filter((id) => !byId.has(id))).toEqual([]);
  });

  it("只落在 AI 搜尋讀得到的通路，而且沒有一個是下架的（YouTube 目前下架，所以不在名單上）", () => {
    const AEO_PLATFORMS = new Set(["website", "pr"]);
    for (const id of ids) {
      const p = byId.get(id)!.platform;
      expect(AEO_PLATFORMS.has(p), `${id} → ${p}`).toBe(true);
      expect(isHiddenContentPlatform(p)).toBe(false);
    }
  });

  it("每個通路各自至少有一張，不會開出空頁", () => {
    const platforms = new Set(ids.map((id) => byId.get(id)!.platform));
    expect([...platforms].sort()).toEqual(["pr", "website"]);
  });
});
