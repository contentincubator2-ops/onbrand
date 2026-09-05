/**
 * craftSource.test — 鎖住「pill 上的出處 = 模型實際被餵的那一則」。
 *
 * 這層是推導的，所以它有一種特別的壞法：解析規則被改壞、或某個 craft 檔
 * 的格式漂掉，結果不是報錯，而是 160 張卡的來源標籤默默退回「長青公式」。
 * 前台看起來一切正常，只是我們最貴的那個賣點不見了。所以這裡驗數量。
 */
import { describe, it, expect } from "vitest";
import {
  ALL_CRAFT_REFS, craftSourceFor, parseCraftRef, shortenCaseName, sourceForTemplate,
} from "./craftSource";
import { validateTaskSource } from "./taskSource";
import { buildTaskCatalogIndex } from "./taskCatalogIndex";

describe("解析得獎工藝參考", () => {
  it("每一則 ref 都解析得出可上架的來源", () => {
    const bad = Object.entries(ALL_CRAFT_REFS)
      .map(([id, text]) => ({ id, s: parseCraftRef(text) }))
      .filter((r) => !r.s || validateTaskSource(r.s));
    expect(bad, `這些 craft ref 解析不出合格來源：\n${bad.map((b) => `  ${b.id}`).join("\n")}`)
      .toHaveLength(0);
  });

  it("括號裡沒有獎項名的一律是 benchmark，不升成 award", () => {
    expect(parseCraftRef("Adam Grant LinkedIn 貼文（LinkedIn 官方評選 Top Voices 多年）：x")?.type)
      .toBe("benchmark");
    expect(parseCraftRef("Old Spice「X」廣告（Cannes Lions Grand Prix 2010）：x")?.type)
      .toBe("award");
  });

  it("takeaway 抓的是冒號後那句心法", () => {
    expect(parseCraftRef("Nike「Just Do It」（Cannes Lions Hall of Fame）：3 個字跨所有受眾皆成立。")?.takeaway)
      .toBe("3 個字跨所有受眾皆成立。");
  });

  it("看不懂的字串回 undefined，不硬湊", () => {
    expect(parseCraftRef("")).toBeUndefined();
    expect(parseCraftRef("ab")).toBeUndefined();
  });
});

describe("pill 縮寫", () => {
  it("寧可只留品牌名，也不把作品名從中間切斷", () => {
    expect(shortenCaseName("Old Spice「The Man Your Man Could Smell Like」Facebook 廣告"))
      .toBe("Old Spice");
    expect(shortenCaseName("Squarespace「Make Your Next Move」Facebook 廣告"))
      .toBe("Squarespace「Make Your Next Move」");
  });

  it("不會把專有名詞砍成半截", () => {
    expect(shortenCaseName("Washington Post @washingtonpost TikTok 完整腳本格式"))
      .toBe("Washington Post @washingtonpost");
  });

  it("沒有一則 short 是斷句或超長", () => {
    for (const [id, text] of Object.entries(ALL_CRAFT_REFS)) {
      const s = parseCraftRef(text);
      if (!s?.short) continue;
      expect([...s.short].length, `${id} 的 short 過長`).toBeLessThanOrEqual(40);
      expect(s.short, `${id} 的 short 有沒收尾的引號：${s.short}`).not.toMatch(/[「『][^」』]*$/);
    }
  });
});

describe("卡片自己標的優先於推導的", () => {
  it("template 有 source 就用 template 的", () => {
    const own = { type: "brand-method", short: "五感十築" } as const;
    expect(sourceForTemplate({ id: "fb-30-ad-headline", source: own })).toEqual(own);
  });

  it("template 沒標才落到 craft 推導", () => {
    expect(sourceForTemplate({ id: "fb-30-ad-headline" })).toEqual(craftSourceFor("fb-30-ad-headline"));
  });

  it("兩者都沒有就是長青公式", () => {
    expect(sourceForTemplate({ id: "不存在的卡" }).type).toBe("evergreen");
  });
});

describe("覆蓋率不能默默崩掉", () => {
  const cat = buildTaskCatalogIndex();
  const marked = cat.filter((c) => c.source.type !== "evergreen");

  it("至少 150 張卡說得出出處", () => {
    // 寫死下限而不是精確值：加卡不該讓測試紅，推導壞掉才該紅。
    expect(marked.length).toBeGreaterThanOrEqual(150);
  });

  it("三種來源都真的出現在目錄裡", () => {
    for (const t of ["award", "benchmark", "evergreen"]) {
      expect(cat.some((c) => c.source.type === t), `目錄裡沒有任何 ${t}`).toBe(true);
    }
  });

  it("canary：這張卡的 pill 必須是 Old Spice 的得獎廣告", () => {
    const t = cat.find((c) => c.id === "fb-30-ad-headline")!;
    expect(t.source.type).toBe("award");
    expect(t.source.short).toBe("Old Spice");
  });
});
