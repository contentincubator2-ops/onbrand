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

const ROOT = resolve(__dirname, "../../..");

function readClientFigures(): Record<string, number> {
  const src = readFileSync(join(ROOT, "client/src/v2/platform/lib/catalogFigures.ts"), "utf8");
  const body = src.slice(src.indexOf("export const CATALOG"));
  const out: Record<string, number> = {};
  for (const m of body.matchAll(/^\s*(\w+):\s*(\d+),?\s*$/gm)) out[m[1]!] = Number(m[2]);
  return out;
}

describe("catalogFigures 對得上真實任務卡目錄", () => {
  const all = buildTaskCatalogIndex();
  const count = (type: string) => all.filter((t) => t.source.type === type).length;

  it("總張數、基礎可用張數", () => {
    expect(all.length).toBe(CATALOG_FIGURES.total);
    expect(all.length - count("viral")).toBe(CATALOG_FIGURES.basic);
  });

  it("各來源張數，以及「說得出出處」= 得獎＋標竿＋爆款", () => {
    expect(count("award")).toBe(CATALOG_FIGURES.award);
    expect(count("benchmark")).toBe(CATALOG_FIGURES.benchmark);
    expect(count("viral")).toBe(CATALOG_FIGURES.viral);
    expect(count("evergreen")).toBe(CATALOG_FIGURES.evergreen);
    expect(CATALOG_FIGURES.award + CATALOG_FIGURES.benchmark + CATALOG_FIGURES.viral).toBe(CATALOG_FIGURES.sourced);
    expect(CATALOG_FIGURES.sourced + CATALOG_FIGURES.evergreen).toBe(CATALOG_FIGURES.total);
  });

  it("全域目錄沒有其他來源類型混進來（客製包的 brand-method 不在裡面）", () => {
    const known = new Set(["award", "benchmark", "viral", "evergreen"]);
    expect(all.filter((t) => !known.has(t.source.type)).map((t) => t.id)).toEqual([]);
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
