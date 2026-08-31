/**
 * brandPacks.test — 鎖住客製任務包的不變條件。
 *
 * 這些是「寫錯了不會當掉，但客戶會看到壞掉的頁面」那一類錯誤：pill 點下去
 * 是空的、卡片跑起來說找不到 config、兩個客戶的 task id 撞在一起。用 Claude
 * Code 幫新客戶加包時，這支測試就是安全網。
 */
import { describe, it, expect } from "vitest";
import { PACKS, resolveBrandPack, findPackTemplate, findPackOrchestraConfig, packCardId } from "./index";
import { MONTHLY_QUOTA, TEN_STANDARDS } from "./wugan";
import { buildTaskCatalogIndex, type CatalogPlatform } from "../taskCatalogIndex";

const GLOBAL_IDS = new Set(buildTaskCatalogIndex().map((t) => t.id));

const VALID_PLATFORMS: CatalogPlatform[] = [
  "facebook", "instagram", "youtube", "tiktok", "linkedin",
  "email", "pr", "brand", "audience", "kol", "website", "case", "calendar",
];

describe("brandPacks 註冊表", () => {
  it("至少有一個包（基準壞掉要先紅在這裡）", () => {
    expect(PACKS.length).toBeGreaterThan(0);
  });

  it("pack key 不重複", () => {
    const keys = PACKS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("自訂卡的 task id 全域唯一 —— 跨包撞名會讓查表拿到別的客戶的卡", () => {
    const ids = PACKS.flatMap((p) => p.cards.map(packCardId));
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it("自訂卡的 id 不可與全域目錄相同 —— 否則全域那張會永遠贏（查表順序在前）", () => {
    for (const pack of PACKS) {
      for (const card of pack.cards) {
        if (card.kind !== "custom") continue;
        expect(
          GLOBAL_IDS.has(card.template.id),
          `${pack.key}: ${card.template.id} 與全域目錄撞名`,
        ).toBe(false);
      }
    }
  });

  it("每個品牌只會命中一個包", () => {
    for (const pack of PACKS) {
      for (const id of pack.match.brandIds ?? []) {
        expect(resolveBrandPack({ brandId: id })?.key).toBe(pack.key);
      }
      for (const name of pack.match.brandNames ?? []) {
        expect(resolveBrandPack({ brandName: name })?.key).toBe(pack.key);
      }
    }
  });

  it("沒有包的品牌回 null（= 走全域目錄，行為不變）", () => {
    expect(resolveBrandPack({ brandId: -1, brandName: "不存在的品牌" })).toBeNull();
    expect(resolveBrandPack({})).toBeNull();
  });
});

describe.each(PACKS)("$brandName ($key)", (pack) => {
  it("宣告的頻道都是合法的 CatalogPlatform", () => {
    for (const ch of pack.channels) {
      expect(VALID_PLATFORMS, `未知頻道 ${ch.key}`).toContain(ch.key);
    }
  });

  it("頻道 key 不重複", () => {
    const keys = pack.channels.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("每張卡的 channel 都有被宣告", () => {
    const declared = new Set(pack.channels.map((c) => c.key));
    for (const card of pack.cards) {
      expect(declared, `${packCardId(card)} 掛在未宣告的頻道 ${card.channel}`).toContain(card.channel);
    }
  });

  it("每張卡的 format 都存在於該頻道的 formats", () => {
    for (const card of pack.cards) {
      const ch = pack.channels.find((c) => c.key === card.channel)!;
      const ids = ch.formats.map((f) => f.id);
      expect(ids, `${packCardId(card)} 的分類 ${card.format} 不在 ${card.channel} 的 pill 清單裡`).toContain(card.format);
    }
  });

  it("每個 pill 至少一張卡 —— 空 pill 在 UI 上點下去是白畫面", () => {
    for (const ch of pack.channels) {
      for (const fmt of ch.formats) {
        const n = pack.cards.filter((c) => c.channel === ch.key && c.format === fmt.id).length;
        expect(n, `${ch.key} / ${fmt.id} 沒有任何卡`).toBeGreaterThan(0);
      }
    }
  });

  it("ref 卡指向的全域任務真的存在", () => {
    for (const card of pack.cards) {
      if (card.kind !== "ref") continue;
      expect(GLOBAL_IDS, `${pack.key}: ref ${card.ref} 在全域目錄裡找不到`).toContain(card.ref);
    }
  });

  it("自訂卡都查得到 template 與 config —— 少一邊執行期就會拋錯", () => {
    for (const card of pack.cards) {
      if (card.kind !== "custom") continue;
      expect(findPackTemplate(card.template.id), `${card.template.id} 查不到 template`).toBeTruthy();
      expect(findPackOrchestraConfig(card.template.id), `${card.template.id} 查不到 config`).toBeTruthy();
    }
  });

  it("自訂卡的 variantLabels 數量對得上 variants —— 對不上會讓部分變體沒有標題", () => {
    for (const card of pack.cards) {
      if (card.kind !== "custom") continue;
      expect(
        card.config.variantLabels.length,
        `${card.template.id}: variants=${card.config.variants} 但只有 ${card.config.variantLabels.length} 個標題`,
      ).toBeGreaterThanOrEqual(card.config.variants);
    }
  });

  it("自訂卡都有必填的 primary_input，且 inputs 至少一項 required", () => {
    for (const card of pack.cards) {
      if (card.kind !== "custom") continue;
      expect(card.template.primary_input, `${card.template.id} 沒有 primary_input`).toBeTruthy();
      const hasRequired = (card.template.inputs ?? []).some((f: any) => f.required);
      expect(hasRequired, `${card.template.id} 沒有任何 required 欄位`).toBe(true);
    }
  });
});

describe("五感十築 pack 的內容規則", () => {
  const wugan = PACKS.find((p) => p.key === "wugan")!;

  it("存在", () => expect(wugan).toBeTruthy());

  it("只有這四個頻道 —— 不該冒出 TikTok / LinkedIn / KOL", () => {
    expect(wugan.channels.map((c) => c.key).sort()).toEqual(["calendar", "case", "facebook", "website"]);
  });

  it("官網三種文章各自成類（CJ 要求十築建築展獨立）", () => {
    const web = wugan.channels.find((c) => c.key === "website")!;
    expect(web.formats.map((f) => f.id)).toEqual(["原創文章", "遇見十築", "十築建築展"]);
  });

  it("FB 四個內容分類 ＋ 分享文", () => {
    const fb = wugan.channels.find((c) => c.key === "facebook")!;
    expect(fb.formats.map((f) => f.id)).toEqual(["生活實踐", "生態健築", "永續生活", "永續價值", "分享文"]);
  });

  it("三種分享文齊全（GQ / 遇見十築 / 原創官網）", () => {
    const shares = wugan.cards.filter((c) => c.channel === "facebook" && c.format === "分享文");
    expect(shares.map(packCardId).sort()).toEqual(
      ["wg-fb-share-gq", "wg-fb-share-meetten", "wg-fb-share-web"],
    );
  });

  it("十項標準各一張案例卡", () => {
    const cases = wugan.cards.filter((c) => c.channel === "case");
    expect(cases.length).toBe(10);
    const formats = cases.map((c) => c.format).sort();
    expect(new Set(formats).size).toBe(10);
  });

  it("行事曆卡是單一產出 —— 篇數靠 prompt 控制，不能用變體拆", () => {
    // 2026-08-29 實跑證明：變體是獨立呼叫，彼此看不到，所以「N 篇之間標準
    // 不重複」無法用 variants=N 達成，而且每個變體會各自把整月寫一遍。
    const cal = wugan.cards.filter((c) => c.channel === "calendar");
    expect(cal.length).toBeGreaterThan(0);
    for (const c of cal) {
      if (c.kind !== "custom") continue;
      expect(c.config.variants, `${c.template.id} 不該用變體拆篇數`).toBe(1);
    }
  });

  it("行事曆卡的標題篇數對得上 MONTHLY_QUOTA，prompt 也宣告了同一個數字", () => {
    for (const c of wugan.cards) {
      if (c.kind !== "custom" || c.channel !== "calendar") continue;
      const zh = (c.template.label as any).zh as string;
      const type = zh.split("｜")[0] as keyof typeof MONTHLY_QUOTA;
      const quota = MONTHLY_QUOTA[type];
      expect(quota, `${c.template.id} 的類型 ${type} 不在 MONTHLY_QUOTA 裡`).toBeGreaterThan(0);
      const labelled = Number(zh.match(/（(\d+) 篇）/)?.[1]);
      expect(labelled, `${c.template.id} 標題篇數與 MONTHLY_QUOTA 不符`).toBe(quota);
      expect(
        c.template.systemPrompt,
        `${c.template.id} 的 prompt 沒有宣告要產出 ${quota} 篇`,
      ).toContain(`一次輸出 ${quota} 篇的完整大綱`);
      // 大綱格式的三個必要區塊 —— 少任何一個就不是月報那份格式了
      for (const block of ["關聯度", "收尾金句", "**重點：**"]) {
        expect(
          c.template.systemPrompt,
          `${c.template.id} 的大綱格式缺少「${block}」`,
        ).toContain(block);
      }
    }
  });

  it("每張自訂卡都帶了第一鐵律：禁止「不是⋯而是⋯」句型", () => {
    // skill 01 的 Hard Rules 第 1 條。2026-08-31 發現資料庫裡品牌 2840 的
    // voice.samples 本身就在示範這個被禁的句型，等於一直在教模型寫錯 ——
    // 所以規則必須由 pack 強制注入每一張卡，不能依賴 DB 的語氣範例。
    for (const card of wugan.cards) {
      if (card.kind !== "custom") continue;
      expect(
        card.template.systemPrompt,
        `${card.template.id} 沒有帶到禁用句型規則`,
      ).toContain("嚴禁否定轉折句型");
    }
  });

  it("十項標準的定義用的是 skill 的原文，不是自行歸納的版本", () => {
    const meixue = TEN_STANDARDS.find((s) => s.name === "十築美學")!;
    // 這一項我先前寫成「光影、比例、材質觸感」，跟 skill 定義完全不同。
    expect(meixue.core).toContain("地方文化");
    expect(meixue.taboo).toContain("不能只寫好看");
    const haoyang = TEN_STANDARDS.find((s) => s.name === "十築好氧")!;
    expect(haoyang.taboo).toContain("不能只寫開窗通風");
    expect(TEN_STANDARDS.length).toBe(10);
    for (const s of TEN_STANDARDS) {
      expect(s.core.length, `${s.name} 缺核心定義`).toBeGreaterThan(5);
      expect(s.taboo.length, `${s.name} 缺禁忌`).toBeGreaterThan(3);
    }
  });

  it("案例卡只掛一項標準 —— 月報製作 skill 的硬性規則", () => {
    for (const card of wugan.cards) {
      if (card.kind !== "custom" || card.channel !== "case") continue;
      expect(
        card.template.systemPrompt,
        `${card.template.id} 沒有寫明只掛一項標準`,
      ).toContain("只掛一項標準");
      expect(
        card.template.systemPrompt.includes("可延伸的十築價值"),
        `${card.template.id} 還留著「可延伸的十築價值」，與一對一規則衝突`,
      ).toBe(false);
    }
  });

  it("每張自訂卡的 systemPrompt 都帶了品牌語氣紅線（禁豪宅語言那條）", () => {
    for (const card of wugan.cards) {
      if (card.kind !== "custom") continue;
      expect(
        card.template.systemPrompt,
        `${card.template.id} 沒有帶到品牌語氣規則`,
      ).toContain("不用抽象空洞的豪宅語言");
    }
  });

  it("每張自訂卡的 id 都帶 wg- 前綴，避免跟其他客戶或全域撞名", () => {
    for (const card of wugan.cards) {
      expect(packCardId(card).startsWith("wg-")).toBe(true);
    }
  });
});
