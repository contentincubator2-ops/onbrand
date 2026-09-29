/**
 * 對外宣稱的任務卡張數／通路數，必須等於真實目錄。
 *
 * 2026-09-21 的前例：X 通路補上 10 張卡之後，報價頁還寫 249／203／41、11 個通路，
 * 整整十幾天沒有任何東西報錯。這支測試就是那個「東西」。
 */
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";
import { buildTaskCatalogIndex } from "../../content/core/taskCatalogIndex";
import { CATALOG_FIGURES } from "./catalogFigures";
import { isHiddenContentPlatform } from "./planGate";
import { VIRAL_URL_REQUIRED_FROM } from "../../content/core/taskSource";

const ROOT = resolve(__dirname, "../../..");

function readClientFigures(): Record<string, number> {
  const src = readFileSync(join(ROOT, "client/src/v2/platform/lib/catalogFigures.ts"), "utf8");
  const body = src.slice(src.indexOf("export const CATALOG"));
  const out: Record<string, number> = {};
  for (const m of body.matchAll(/^\s*(\w+):\s*(\d+),?\s*$/gm)) out[m[1]!] = Number(m[2]);
  return out;
}

describe("catalogFigures 對得上真實任務卡目錄", () => {
  // 2026-09-29：爆款卡只列當月、每月換，張數不再寫進文案；這裡只鎖通路數。
  const FRONT_CHANNELS = new Set(["facebook", "instagram", "threads", "line", "tiktok", "email", "website"]);
  const all = buildTaskCatalogIndex().filter((t) => FRONT_CHANNELS.has(t.platform));

  it("2026-07 起量測的爆款卡都附參考文章", () => {
    const missing = all.filter((t) => t.source.type === "viral" && (t.source.asOf ?? "") >= VIRAL_URL_REQUIRED_FROM && !t.source.url);
    expect(missing.map((t) => t.id)).toEqual([]);
  });

  it("前台通路沒有一個是被下架的", () => {
    for (const p of FRONT_CHANNELS) expect(isHiddenContentPlatform(p)).toBe(false);
  });

  it("通路數 = 通路選擇畫面（ChannelPicker）實際列出的通路", () => {
    const src = readFileSync(join(ROOT, "client/src/v2/platform/components/plan/ChannelPicker.tsx"), "utf8");
    const block = /const LABEL_ZH[^=]*=\s*\{([\s\S]*?)\};/.exec(src)?.[1] ?? "";
    const keys = [...block.matchAll(/(\w+):\s*"/g)].map((m) => m[1]);
    expect(keys.length).toBe(CATALOG_FIGURES.channels);
  });

  it("client 鏡像與 server 這份完全一致", () => {
    expect(readClientFigures()).toEqual({ ...CATALOG_FIGURES });
  });
});

/**
 * 舊數字不能再手寫回去：這幾個檔案的文案一律引用 catalogFigures。
 * 只擋「張數」用語旁邊的裸數字，避免誤傷其他 249／203（例如色碼、金額）。
 */
describe("面向用戶的文案沒有手寫任務卡張數", () => {
  const FILES = [
    "client/src/pages/auth/LoginPage.tsx",
    "client/src/pages/auth/RegisterPage.tsx",
    "client/src/v2/platform/components/mia/miaNudgeCatalog.ts",
    "client/src/v2/platform/components/PricingInfoModal.tsx",
    "client/src/v2/platform/pages/LandingPage.tsx",
    "client/src/v2/platform/pages/PricingPage.tsx",
    "server/platform/core/plans.ts",
  ];
  const HARDCODED = [
    /\b(?:249|259|203|213|208|41|51)\s*(?:張|task cards|cards|conventions)/,
    /任務卡\s*(?:249|259|203|213)\b/,
    /\b(?:11|12)\s*個通路/,
    /of\s+(?:11|12)\s+channels/,
    /\bof\s+(?:249|259)\b/,
  ];
  for (const f of FILES) {
    it(`${f} 沒有裸數字`, () => {
      const lines = readFileSync(join(ROOT, f), "utf8").split("\n");
      const hits = lines
        .map((l, i) => ({ l, n: i + 1 }))
        // 註解（工程師看的歷史說明）不算面向用戶的文案
        .filter(({ l }) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .filter(({ l }) => HARDCODED.some((re) => re.test(l)))
        .map(({ l, n }) => `${f}:${n}  ${l.trim().slice(0, 100)}`);
      expect(hits).toEqual([]);
    });
  }
});
