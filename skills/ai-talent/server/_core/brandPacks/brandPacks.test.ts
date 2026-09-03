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
import { GUSHENG_FACTS } from "./gusheng";
import { validateWuganVoice } from "../wuganVoiceContract";
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

  it("長文件卡的預算撐得住 —— caption 預算必須裝得進 job 總預算", () => {
    // 2026-08-31：案例卡 caption 開 90s，但 30s 層的 job 總預算只有 100s，
    // 加上 strategist 與 context 抓取就爆掉，任務以
    // 「orchestra: hard 100s budget exceeded」失敗。
    for (const card of wugan.cards) {
      if (card.kind !== "custom") continue;
      const cap = card.config.captionBudgetMs;
      if (!cap) continue;
      const hard = card.config.hardBudgetMs ?? 100_000;
      expect(
        hard - cap,
        `${card.template.id}: job 總預算 ${hard}ms 只比 caption ${cap}ms 多 ${hard - cap}ms，不夠跑其他階段`,
      ).toBeGreaterThanOrEqual(50_000);
      // nginx /trpc 230s、Node 220s，30s 層同步回應，留餘裕
      expect(hard, `${card.template.id} 的總預算過高`).toBeLessThanOrEqual(150_000);
    }
  });

  it("placeholder 與提問本身不得示範禁用句型", () => {
    // 2026-09-01 CJ 截圖後發現：遇見十築的 placeholder 寫「隔音是基本條件
    // 而不是加價選配」、品牌觀點寫「而不是只看它新的時候多好看」——
    // 這是給使用者看的「好輸入範例」，卻在示範品牌最嚴格禁止的句型。
    for (const card of wugan.cards) {
      if (card.kind !== "custom") continue;
      for (const [field, text] of [
        ["primary_question", card.template.primary_question],
        ["placeholder", card.template.primary_input?.placeholder],
      ] as [string, string | undefined][]) {
        if (!text) continue;
        const issue = validateWuganVoice(text);
        expect(issue, `${card.template.id} 的 ${field} 用了禁用句型：${text}`).toBeNull();
      }
    }
  });

  it("placeholder 不綁特定節慶 —— 會過時", () => {
    // 生活實踐卡原本寫「父親節前的一餐飯」，到了九月就是過期範例。
    const DATED = ["父親節", "母親節", "中秋", "端午", "春節", "農曆年", "聖誕", "情人節", "國慶"];
    for (const card of wugan.cards) {
      if (card.kind !== "custom") continue;
      const ph = card.template.primary_input?.placeholder ?? "";
      for (const d of DATED) {
        expect(ph.includes(d), `${card.template.id} 的 placeholder 綁了「${d}」，會過時`).toBe(false);
      }
    }
  });

  it("每張卡都帶 polishHint，且列出十項標準的正式名稱", () => {
    // 2026-09-01：沒有這個，AI 潤稿會自己編出「光線、通風、材質、空間機能、
    // 人文連結」這種不存在的標準去問使用者。
    for (const card of wugan.cards) {
      if (card.kind !== "custom") continue;
      const hint = card.template.polishHint;
      expect(hint, `${card.template.id} 沒有 polishHint`).toBeTruthy();
      for (const std of TEN_STANDARDS) {
        expect(hint, `${card.template.id} 的 polishHint 缺少 ${std.name}`).toContain(std.name);
      }
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

describe("盛全工業 pack 的內容規則", () => {
  const gs = PACKS.find((p) => p.key === "gusheng")!;

  it("存在", () => expect(gs).toBeTruthy());

  it("只有這五個頻道 —— 不該冒出 TikTok / YouTube / KOL", () => {
    expect(gs.channels.map((c) => c.key).sort()).toEqual(
      ["email", "facebook", "instagram", "linkedin", "website"],
    );
  });

  it("官網六種文章：CJ 原本開的三種 ＋ 2026-09-03 補的漏斗中段三種", () => {
    const web = gs.channels.find((c) => c.key === "website")!;
    expect(web.formats.map((f) => f.id)).toEqual([
      "craft", "care", "guide", "case", "buyer-questions", "product-page",
    ]);
  });

  it("電子報的 pill 順序是 B2B 漏斗順序，開發信排第一", () => {
    // 2026-09-03：原本三張卡都預設「名單上已經有人」（新品／回購／產業新知），
    // 而盛全在美國近乎零知名度 —— 名單本身才是缺的東西。順序本身是給客戶看
    // 的說明，所以鎖住它。
    const em = gs.channels.find((c) => c.key === "email")!;
    expect(em.formats.map((f) => f.id)).toEqual([
      "cold-outreach", "enquiry-reply", "sample-followup",
      "new-product", "reorder", "reactivation", "show-invite", "industry-news",
    ]);
  });

  it("LinkedIn 一個頻道裝下公司 4 種 ＋ CMO 5 種", () => {
    // 不能拆成兩個頻道：PlatformTaskPage 用 channels.find(c => c.key === platform)
    // 找頻道，同一個 CatalogPlatform 出現兩次時第二個永遠拿不到。
    const li = gs.channels.find((c) => c.key === "linkedin")!;
    expect(li.formats.length).toBe(9);
    expect(li.formats.filter((f) => f.id.startsWith("co-")).length).toBe(4);
    expect(li.formats.filter((f) => f.id.startsWith("cmo-")).length).toBe(5);
  });

  it("task id 的第一段對得上頻道 —— 這是 mockup 路由的唯一依據", () => {
    // RunPage.tsx:1789 的 idPrefixMap 查的是 taskId.split("-")[0]。前綴錯了
    // 不會拋錯，只會靜默掉到 Layer 2 fallback 拿到別的版型。
    const EXPECTED: Record<string, string> = {
      website: "web", email: "em", instagram: "ig", linkedin: "li", facebook: "fb",
    };
    for (const card of gs.cards) {
      const id = packCardId(card);
      expect(
        id.split("-")[0],
        `${id} 掛在 ${card.channel} 頻道，前綴卻不是 ${EXPECTED[card.channel]}`,
      ).toBe(EXPECTED[card.channel]);
    }
  });

  it("task id 對 formatFromTaskId 的關鍵字路由是刻意的，不是碰巧的", () => {
    // formatFromTaskId 在前綴之後還會掃關鍵字，掃到就決斷。這件事有兩面：
    // 碰到不想要的關鍵字會拿到錯的版型（「品牌故事」若命名為 -brand-story，
    // ig-/fb- 卡會被判成限時動態而不是貼文）；但有些卡就是要那個版型 ——
    // 輪播卡要 carousel、LI 文件卡要 document、產品頁卡要 product-page。
    //
    // 2026-09-03 從「一律禁止」改成「每張卡自己宣告」。無條件禁止會讓
    // 三張新卡為了避開關鍵字而拿到錯的版型 —— 規則本身會造成它要防的 bug。
    // 這裡不重新實作 formatFromTaskId（那就是 client 手抄 server 知識的老毛病，
    // 而且它在 RunPage.tsx 裡，跨了 client/server 邊界不能 import），
    // 只鎖住「哪張卡允許命中哪個關鍵字」這個決定。
    const INTENTIONAL: Record<string, string> = {
      "ig-gs-carousel-compare": "carousel",   // → instagram:carousel，config 也是輪播形狀
      "li-gs-co-document": "document",        // → linkedin:document，8 頁用 --- 分隔
      "web-gs-product-page": "product",       // → web:product-page，這張就是產品頁文案
    };
    const TRAPS = [
      "story", "live", "profile", "bio", "carousel", "comment", "pinned",
      "poll", "reel", "shorts", "community", "thumbnail", "calendar",
      "speech", "factsheet", "about", "faq", "landing", "document",
    ];
    for (const card of gs.cards) {
      const id = packCardId(card);
      const allowed = INTENTIONAL[id];
      for (const trap of TRAPS) {
        if (trap === allowed) continue;
        expect(id.includes(trap), `${id} 含關鍵字「${trap}」，mockup 會被判錯`).toBe(false);
      }
      // 獨立的 ad 段會被判成廣告版型（lead-paragraph 那種子字串則不會）
      expect(/(?:^|-)ad(?:-|$)/.test(id), `${id} 有獨立的 ad 段`).toBe(false);
      // 官網卡走 web- 前綴分支，含 product 會被判成產品頁而不是部落格長文
      if (card.channel === "website" && allowed !== "product") {
        expect(id.includes("product"), `${id} 是官網長文，含 product 會拿到產品頁版型`).toBe(false);
      }
    }
    // 宣告了刻意路由的卡，必須真的含那個關鍵字 —— 否則哪天改了 id
    // 就會靜默失去它要的版型，而這張白名單還在說它有。
    for (const [id, kw] of Object.entries(INTENTIONAL)) {
      const card = gs.cards.find((c) => packCardId(c) === id);
      expect(card, `INTENTIONAL 列了不存在的卡 ${id}`).toBeTruthy();
      expect(id.includes(kw), `${id} 宣告要命中「${kw}」卻不含它`).toBe(true);
    }
  });

  it("輪播卡的 config 是輪播形狀 —— 版型對了但 config 沒對是這個專案的雙層 bug", () => {
    // 一則貼文由 N 張卡組成 = variants:1 + cardsPerVariant:N。寫成 variants:N
    // 會得到 N 個各自完整的貼文版本，而不是一組 N 張的輪播；而版型那一層
    // 仍然會渲染成輪播，所以畫面看起來像對的，內容是錯的。
    const carousel = gs.cards.find((c) => packCardId(c) === "ig-gs-carousel-compare")!;
    expect(carousel).toBeTruthy();
    if (carousel.kind !== "custom") throw new Error("ig-gs-carousel-compare 應為自訂卡");
    expect(carousel.config.variants, "輪播不能用變體拆卡").toBe(1);
    expect(carousel.config.cardsPerVariant, "沒有 cardsPerVariant 就只會出一張").toBe(5);
    // holdForImages 是叫 UI 等圖算完；30s 層 runImageGen=false 不算圖，
    // 開了會等一個永遠不會到的東西。
    expect(carousel.config.runImageGen).toBe(false);
    expect(carousel.config.holdForImages ?? false).toBe(false);
  });

  it("每張自訂卡都帶事實白名單 —— 少了模型就會自己編認證與設備", () => {
    // 官網的 OEM流程／製作流程兩頁幾乎全是圖片，線上沒有任何文字來源可以
    // 支撐「盛全有什麼設備」，所以白名單是唯一的防線。
    for (const card of gs.cards) {
      if (card.kind !== "custom") continue;
      expect(
        card.template.systemPrompt,
        `${card.template.id} 沒有帶事實白名單`,
      ).toContain("the ONLY things you may assert");
      expect(
        card.template.systemPrompt,
        `${card.template.id} 的白名單漏了 MOQ`,
      ).toContain("240 pieces per style");
    }
  });

  it("每張自訂卡都禁止公開價格 —— 報價寫進內容就變成承諾", () => {
    for (const card of gs.cards) {
      if (card.kind !== "custom") continue;
      expect(
        card.template.systemPrompt,
        `${card.template.id} 沒有帶價格禁令`,
      ).toContain("Never publish a price");
    }
  });

  it("prompt 與 placeholder 自己不得示範被禁的價格語言", () => {
    // 五感十築踩過同型的坑：placeholder 是給使用者看的「好範例」，卻在
    // 示範品牌最嚴格禁止的寫法。
    const BANNED = ["affordable", "competitive pricing", "cost-effective", "best price"];
    for (const card of gs.cards) {
      if (card.kind !== "custom") continue;
      const texts = [
        card.template.primary_question ?? "",
        card.template.primary_input?.placeholder ?? "",
        ...(card.template.inputs ?? []).map((i: any) => i.placeholder ?? ""),
      ];
      for (const t of texts) {
        for (const b of BANNED) {
          expect(t.toLowerCase().includes(b), `${card.template.id} 的提示語用了「${b}」`).toBe(false);
        }
      }
    }
  });

  it("每張自訂卡都有 polishHint，且列出十個產品家族", () => {
    // 沒有這個，AI 潤稿只拿得到通用 digest，會編出盛全沒有的產品線去問使用者。
    const FAMILIES = ["Beret", "Fedora", "Flat Cap", "Ball Cap", "Blocked Hat",
      "Children's Hat", "Beanie", "Casquette", "Accessories", "Uniform Headwear"];
    for (const card of gs.cards) {
      if (card.kind !== "custom") continue;
      const hint = card.template.polishHint;
      expect(hint, `${card.template.id} 沒有 polishHint`).toBeTruthy();
      for (const f of FAMILIES) {
        expect(hint, `${card.template.id} 的 polishHint 缺少 ${f}`).toContain(f);
      }
    }
  });

  it("講工法卡照 CJ 的規格：三個版本 = 三種不同的既有文章結構", () => {
    // CJ 2026-09-02:「輸入想溝通的工法後，agent 根據國際知名案例或熱門類似
    // 文章結構的 skill，幫忙撰寫出三個版本」。變體是各自獨立的 LLM 呼叫、
    // 彼此看不見，所以結構必須由 variantLabels 指派，不能讓模型自己挑 ——
    // 否則三個變體會各自挑到同一種結構。
    const craft = gs.cards.find((c) => packCardId(c) === "web-gs-craft")!;
    expect(craft).toBeTruthy();
    if (craft.kind !== "custom") throw new Error("web-gs-craft 應為自訂卡");
    expect(craft.config.variants).toBe(3);
    expect(craft.config.variantLabels.length).toBe(3);
    for (const s of ["Process Walkthrough", "Single Detail Deep-Dive", "Myth Correction"]) {
      expect(craft.template.systemPrompt, `講工法卡缺少結構 ${s}`).toContain(s);
    }
  });

  it("官網長文的預算撐得住 —— caption 預算要裝得進 job 總預算", () => {
    // 預設 caption 預算 40s 是照「一則貼文」訂的。800–1200 字的長文會逾時
    // 兩次然後回空字串：任務顯示成功、產出空白。
    for (const card of gs.cards) {
      if (card.kind !== "custom" || card.channel !== "website") continue;
      const cap = card.config.captionBudgetMs;
      expect(cap, `${card.template.id} 是長文卡卻沒有加大 caption 預算`).toBeGreaterThan(40_000);
      const hard = card.config.hardBudgetMs ?? 100_000;
      expect(
        hard - cap!,
        `${card.template.id}: job 總預算只比 caption 多 ${hard - cap!}ms，不夠跑其他階段`,
      ).toBeGreaterThanOrEqual(50_000);
      // nginx /trpc 230s、Node 220s，30s 層是同步回應，要留餘裕
      expect(hard, `${card.template.id} 的總預算過高`).toBeLessThanOrEqual(150_000);
    }
  });

  it("CMO 四張卡都帶第二代經營者的發言者設定", () => {
    // CJ 2026-09-02 指定「用第二代經營者的視角」。這是內容的素材來源而不是
    // 稱謂設定 —— 少了它，「挑戰市場觀點」寫出來就是沒有立足點的空泛評論。
    const cmo = gs.cards.filter((c) => c.channel === "linkedin" && c.format.startsWith("cmo-"));
    expect(cmo.length).toBe(5); // 2026-09-03 加了私訊開場，也是第二代在發言
    for (const card of cmo) {
      if (card.kind !== "custom") continue;
      expect(
        card.template.systemPrompt,
        `${card.template.id} 沒有帶第二代經營者設定`,
      ).toContain("second-generation operator");
    }
  });

  it("每張卡綁不同的 agent —— 同一個人寫完十九張卡，語氣會塌成一種", () => {
    const ids = gs.cards
      .filter((c) => c.kind === "custom")
      .map((c) => (c as any).template.agent_id);
    expect(ids.every((v) => typeof v === "number")).toBe(true);
    expect(new Set(ids).size, `agent 重複：${ids.join(",")}`).toBe(ids.length);
  });

  it("事實白名單每一條都有實質內容", () => {
    expect(GUSHENG_FACTS.length).toBeGreaterThanOrEqual(12);
    for (const f of GUSHENG_FACTS) expect(f.length).toBeGreaterThan(20);
    expect(GUSHENG_FACTS.join(" ")).toContain("1984");
    expect(GUSHENG_FACTS.join(" ")).toContain("240 pieces per style");
  });

  it("三十二張卡：CJ 原本開的 19 張 ＋ 2026-09-03 補漏斗的 13 張", () => {
    // CJ 2026-09-03「是否還應該有新的任務類型」。盤點後補的 13 張全部落在
    // 漏斗中下段 —— 原本 19 張幾乎都是品牌與認知內容，買家詢價之後到下單
    // 之前一張都沒有。
    expect(gs.cards.length).toBe(32);
    const byChannel = (k: string) => gs.cards.filter((c) => c.channel === k).length;
    expect(byChannel("website")).toBe(6);   // 工法/保養/指南 + 案例/FAQ/產品頁
    expect(byChannel("email")).toBe(8);     // 新品/回購/產業 + 開發/詢價/寄樣/展會/喚回
    expect(byChannel("instagram")).toBe(4); // 成品/故事 + 製程/輪播
    expect(byChannel("linkedin")).toBe(9);  // 公司 4（含文件）+ CMO 5（含私訊）
    expect(byChannel("facebook")).toBe(5);  // 故事/參展/活動/新品 + 製程
  });

  it("補的每一張卡都對得上一個 pill，沒有孤兒也沒有空 pill", () => {
    // 這條在通用區已經雙向鎖過，這裡再點名 13 張新卡，是為了讓「加卡時漏了
    // 更新 channels」這個最容易犯的錯誤直接指名道姓地紅。
    const ADDED = [
      "web-gs-case", "web-gs-buyer-questions", "web-gs-product-page",
      "em-gs-cold-outreach", "em-gs-enquiry-reply", "em-gs-sample-followup",
      "em-gs-show-invite", "em-gs-reactivation",
      "ig-gs-process", "ig-gs-carousel-compare",
      "li-gs-co-document", "li-gs-cmo-dm-intro",
      "fb-gs-process",
    ];
    expect(ADDED.length).toBe(13);
    for (const id of ADDED) {
      const card = gs.cards.find((c) => packCardId(c) === id);
      expect(card, `新卡 ${id} 不在 pack 裡`).toBeTruthy();
      const ch = gs.channels.find((c) => c.key === card!.channel)!;
      expect(
        ch.formats.map((f) => f.id),
        `${id} 的 pill「${card!.format}」沒有宣告在 ${card!.channel}`,
      ).toContain(card!.format);
    }
  });
});
