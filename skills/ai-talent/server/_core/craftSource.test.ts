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
import { fbPlaybookFor } from "./fbCraft";
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

/**
 * craft key 對不上活卡 = 那張卡默默失去得獎參考。
 *
 * 2026-09-05 實際發生過：fb-60-carousel-5 那 5 張改名成 99s、fb-90-* 那 4 張
 * 併進 99s 時，craft 表的 key 沒跟著改。結果那 9 張卡生成時完全拿不到得獎
 * 參考，同族其他卡有——而且 typecheck、測試、前台全部正常，沒有一處會紅。
 *
 * 下面的 RETIRED 是「卡真的退役了、ref 留著當資產」的白名單。要嘛把 key 改成
 * 現行 id，要嘛明白寫進這裡；不能讓它靜靜地爛在那裡。
 */
describe("craft key 沒有孤兒", () => {
  const RETIRED = new Set([
    "fb-90-carousel-10frame", "fb-90-countdown-series", "fb-90-crisis-full",
    "fb-90-event-launch", "fb-90-livestream-suite", "fb-90-monthly-calendar",
    "fb-90-reels-full", "fb-99-crisis-playbook", "fb-99-launch-toolkit",
    "fb-99-livestream-9seg", "ig-99-30day-calendar", "ig-99-account-reposition",
    "ig-99-reel-series-6",
  ]);

  it("每個 craft key 不是對得上活卡，就是明列為已退役", () => {
    const live = new Set(buildTaskCatalogIndex().map((c) => c.id));
    const orphans = Object.keys(ALL_CRAFT_REFS)
      .filter((k) => !live.has(k) && !RETIRED.has(k));
    expect(
      orphans,
      "這些 craft key 對不上任何活卡——是不是卡改名了 key 沒跟著改？" +
        "若卡真的退役，把 id 加進 RETIRED：" + orphans.join(", "),
    ).toHaveLength(0);
  });

  it("RETIRED 名單本身不能過期——列在裡面的卡必須真的不在目錄", () => {
    const live = new Set(buildTaskCatalogIndex().map((c) => c.id));
    const resurrected = [...RETIRED].filter((id) => live.has(id));
    expect(
      resurrected,
      "這些 id 又活過來了，請從 RETIRED 移除：" + resurrected.join(", "),
    ).toHaveLength(0);
  });

  it("改名過的那 9 張，得獎參考真的進得了 prompt", () => {
    for (const id of [
      "fb-99-carousel-5", "fb-99-serial-3", "fb-99-viral-rewrite",
      "fb-99-trend-rewrite", "fb-99-testimonial-rewrite",
      "fb-99-monthly-calendar-promo", "fb-99-account-reposition",
      "fb-99-quarterly-strategy", "fb-99-monthly-analytics",
    ]) {
      expect(fbPlaybookFor(id), `${id} 的 playbook 沒有得獎參考`).toContain("得獎參考");
    }
  });
});
