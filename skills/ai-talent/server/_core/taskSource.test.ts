/**
 * taskSource.test — 鎖住兩件會靜靜壞掉的事。
 *
 * ① server 的 TaskSourceType 與 client 的 sourceVocabulary 必須同步。
 *    client 不 import server（跨邊界規則），所以那份 union 是手抄的。
 *    抄漏一個值不會有任何編譯錯誤 —— 前台只是把那類卡默默顯示成「長青公式」。
 *
 * ② evergreen 以外的來源必須說得出具體出處。
 *    整個分類的價值就在 pill 上那個出處；標了 award 卻答不出是哪個獎，
 *    比不標更傷。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TASK_SOURCE_TYPES, validateTaskSource, resolveTaskSource,
  fromExemplar, DEFAULT_TASK_SOURCE, type TaskSource,
} from "./taskSource";
import { buildTaskCatalogIndex } from "./taskCatalogIndex";

const CLIENT_VOCAB = path.resolve(
  __dirname, "../../client/src/v2/lib/sourceVocabulary.ts",
);

describe("taskSource ↔ sourceVocabulary 同步", () => {
  it("client 的 union 與 SOURCE_VOCAB 蓋住 server 宣告的每一個類型", () => {
    const src = fs.readFileSync(CLIENT_VOCAB, "utf8");
    for (const t of TASK_SOURCE_TYPES) {
      // union 成員（可能有引號包住的 kebab-case）
      expect(src, `client union 缺少 "${t}"`).toMatch(
        new RegExp(`\\|\\s*"${t}"`),
      );
      // SOURCE_VOCAB 的 key
      expect(src, `SOURCE_VOCAB 缺少 "${t}"`).toMatch(
        new RegExp(`(^|\\s|")${t}"?\\s*:\\s*\\{`, "m"),
      );
      // 篩選列的顯示順序
      expect(src, `SOURCE_ORDER 缺少 "${t}"`).toContain(`"${t}"`);
    }
  });

  it("client 沒有多出 server 不認得的類型", () => {
    const src = fs.readFileSync(CLIENT_VOCAB, "utf8");
    const block = src.match(/export const SOURCE_VOCAB[\s\S]*?\n\};/)?.[0] ?? "";
    const keys = [...block.matchAll(/^\s{2}"?([a-z-]+)"?\s*:\s*\{/gm)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(TASK_SOURCE_TYPES, `client 有 server 沒有的類型 "${k}"`).toContain(k as any);
    }
  });
});

describe("上架檢核", () => {
  it("evergreen 不需要出處", () => {
    expect(validateTaskSource({ type: "evergreen" })).toBeNull();
  });

  it("其餘類型少了 short 一律擋下", () => {
    for (const t of TASK_SOURCE_TYPES.filter((x) => x !== "evergreen")) {
      expect(validateTaskSource({ type: t }), `${t} 應該被擋`).toMatch(/必須填 short/);
      expect(validateTaskSource({ type: t, short: "   " })).toMatch(/必須填 short/);
      expect(validateTaskSource({ type: t, short: "Patagonia Worn Wear" })).toBeNull();
    }
  });

  it("short 太長會擋下 —— pill 放不下", () => {
    expect(validateTaskSource({ type: "award", short: "x".repeat(41) })).toMatch(/過長/);
  });
});

describe("resolveTaskSource", () => {
  it("未標記與不認得的值都回長青公式", () => {
    expect(resolveTaskSource(undefined)).toEqual(DEFAULT_TASK_SOURCE);
    expect(resolveTaskSource(null)).toEqual(DEFAULT_TASK_SOURCE);
    expect(resolveTaskSource({ type: "nope" } as unknown as TaskSource)).toEqual(DEFAULT_TASK_SOURCE);
  });

  it("認得的值原樣回傳", () => {
    const s: TaskSource = { type: "benchmark", short: "Bellroy", takeaway: "差異圖解" };
    expect(resolveTaskSource(s)).toEqual(s);
  });
});

describe("fromExemplar", () => {
  it("award → award；known → benchmark", () => {
    expect(fromExemplar({ short: "A", note: "n", kind: "award" })?.type).toBe("award");
    expect(fromExemplar({ short: "B", note: "n", kind: "known" })?.type).toBe("benchmark");
    expect(fromExemplar(undefined)).toBeUndefined();
  });
});

describe("目錄索引", () => {
  const cards = buildTaskCatalogIndex();

  it("每一張卡都帶得出 source —— 前台不必自己補預設", () => {
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect(c.source, `${c.id} 沒有 source`).toBeTruthy();
      expect(TASK_SOURCE_TYPES).toContain(c.source.type);
    }
  });

  it("已標記的卡全部通過上架檢核", () => {
    const bad = cards
      .map((c) => ({ id: c.id, err: validateTaskSource(c.source) }))
      .filter((r) => r.err);
    expect(bad, `這些卡標了來源卻說不出出處：\n${bad.map((b) => `  ${b.id}: ${b.err}`).join("\n")}`)
      .toHaveLength(0);
  });
});
