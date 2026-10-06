/**
 * strategistDirectory 的行為測試。
 *
 * 2026-09-23（CJ「品牌策略總監的三個人選」）：三位總監的來源是 mos_db 的
 * agents 表，而這些測試守的是三件真的會出錯、而且出錯時很難從畫面看出來的事：
 *   1. 產業對得上就用產業的人、對不上才退回預設人選——這條錯了，使用者
 *      看到的是「我做美妝，怎麼配給我一個電商顧問」，但畫面上不會有錯誤。
 *   2. mos_db 有一批 agent 的文字欄位存的是匯入失敗留下的樣板句
 *      （「Details for X are not fully available」，真的存在於 id 211480），
 *      顯示出來像壞掉。sanitizeProse 要把整段濾掉、但不要把正常內容一起丟。
 *   3. 三個角色永遠各出一位，而且帶著自己的招牌問題（換人時問題要跟著換）。
 *
 * localDb 用 vi.mock 頂替——這裡驗的是查詢邏輯與挑人規則，不是 MySQL。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/** 假的 agents 表：兩位品牌策略師（一位美妝、一位電商預設）、定價與 UX 各一位預設。 */
const AGENTS: any[] = [
  {
    id: 900001, slug: "brand_strategy-beauty-tw-0001", name: "Chih-Ming Yang", name_zh: "楊志明",
    title: "Brand Strategist – 美妝保養", title_zh: "品牌策略師｜美妝保養", industry: "beauty",
    avatarUrl: "https://example.test/a.svg", bio_zh: "五年美妝保養品牌策略經驗。", bio: null, bio_en: null,
    experienceDetail: "【工作經歷】\n2023-至今｜資深美妝保養行銷專家", specialty: "美妝保養品牌定位",
    specialtySummary: null, methodology: null,
  },
  {
    id: 900002, slug: "brand_strategy-ecom-tw-6352", name: "Chien-Yu Pan", name_zh: "潘建宇",
    title: "Brand Strategist – 電商 / DTC", title_zh: "品牌策略師｜電商 / DTC", industry: "ecom",
    avatarUrl: "", bio_zh: null, bio: "Brand strategist for DTC.", bio_en: null,
    experienceDetail: "【工作經歷】\n2022-至今｜資深電商 / DTC行銷專家", specialty: "電商 / DTC品牌定位",
    specialtySummary: null, methodology: null,
  },
  {
    id: 900003, slug: "pricing_strategy-ecom-tw-9298", name: "Chien-Yu Chang", name_zh: "張建宇",
    title: "Pricing Strategist – 電商 / DTC", title_zh: "定價策略師｜電商 / DTC", industry: "ecom",
    avatarUrl: "", bio_zh: "八年定價策略經驗。", bio: null, bio_en: null,
    experienceDetail: "【工作經歷】\n2022-至今｜資深電商 / DTC行銷專家", specialty: "競爭定價分析",
    specialtySummary: null, methodology: null,
  },
  {
    id: 900004, slug: "ux_researcher-martech-tw-4718", name: "Chia-Jung Huang", name_zh: "黃佳蓉",
    title: "UX Researcher – MarTech", title_zh: "UX 研究員｜MarTech", industry: "martech",
    avatarUrl: "", bio_zh: "用戶行為研究。", bio: null, bio_en: null,
    experienceDetail: "【工作經歷】\n2023-至今｜資深MarTech行銷專家", specialty: "A/B 測試規劃、GA4 漏斗分析",
    specialtySummary: null, methodology: null,
  },
  {
    // 服飾：tw 沒有人，但 cn 有——備用人選的第一種來源（同產業、別語系）。
    id: 900006, slug: "brand_strategy-fashion-cn-0006", name: "Wu Xinyue", name_zh: "吳欣悅",
    title: "Brand Strategist", title_zh: "品牌策略師｜服裝時尚", industry: "fashion",
    avatarUrl: "", bio_zh: "服裝時尚品牌策略。", bio: null, bio_en: null,
    experienceDetail: "【工作經歷】 2021-至今｜服裝時尚行銷", specialty: "服裝時尚品牌定位",
    specialtySummary: null, methodology: null,
  },
  {
    // 定價／UX 兩個角色各再補一位繁中、但別的產業的人——「產業完全對不到」時
    // 的備用人選就是從這裡來的。真實 cohort 每個角色有 10-12 個產業，假資料
    // 原本一個角色只有一位（就是預設那位），排除掉就沒人可挑了。
    id: 900007, slug: "pricing_strategy-food-tw-0007", name: "Chih-Ming Su", name_zh: "蘇志明",
    title: "Pricing Strategist – 食品飲料", title_zh: "定價策略師｜食品飲料", industry: "food",
    avatarUrl: "", bio_zh: "食品飲料定價策略。", bio: null, bio_en: null,
    experienceDetail: "【工作經歷】 2022-至今｜食品飲料行銷", specialty: "競爭定價分析",
    specialtySummary: null, methodology: null,
  },
  {
    id: 900008, slug: "ux_researcher-beauty-tw-0008", name: "Hsin-Jung Chu", name_zh: "朱欣蓉",
    title: "UX Researcher – 美妝保養", title_zh: "UX 研究員｜美妝保養", industry: "beauty",
    avatarUrl: "", bio_zh: "美妝保養用戶研究。", bio: null, bio_en: null,
    experienceDetail: "【工作經歷】 2023-至今｜美妝保養研究", specialty: "A/B 測試規劃",
    specialtySummary: null, methodology: null,
  },
  {
    // 產品頁的兩位固定人選（方法論族：slug 沒有產業/語系段）
    id: 900010, slug: "value-proposition-canvas-vp-canvas-strategist", name: "Chia-Sen Hsu", name_zh: "許家森",
    title: "VP of Value Proposition", title_zh: "產品價值主張副總裁", industry: null,
    avatarUrl: "", bio_zh: "Osterwalder VPC 實踐者。", bio: null, bio_en: null,
    experienceDetail: "【經驗亮點】 VP Canvas 重構", specialty: "價值主張圖、顧客輪廓、痛點解方",
    specialtySummary: null, methodology: "【價值主張圖】右半顧客輪廓、左半價值地圖，逐條對齊。",
  },
  {
    id: 900011, slug: "kano-product-positioning-kano-strategist", name: "Ya-Ting Li", name_zh: "李雅婷",
    title: "VP of Kano Product Strategy", title_zh: "Kano 產品策略副總裁", industry: null,
    avatarUrl: "", bio_zh: "Kano Model 認證實踐者。", bio: null, bio_en: null,
    experienceDetail: null, specialty: "Kano 模型、品質要素分類、投資排序",
    specialtySummary: null, methodology: "【Kano 模型】當然/一元/魅力/無差異/反轉五類品質要素。",
  },
  {
    // 匯入失敗的那種——文字欄位全是樣板句。
    id: 900005, slug: "brand_strategy-broken-tw-0005", name: "Broken Row", name_zh: "資料壞掉",
    title: "Brand Strategist", title_zh: "品牌策略師｜損壞", industry: "tech",
    avatarUrl: "", bio_zh: null, bio: null, bio_en: null,
    experienceDetail: "【代表案例】\nDetails for this agent are not fully available in the provided JSON.",
    specialty: null, specialtySummary: null, methodology: null,
  },
];

const calls: Array<{ sql: string; params: any[] }> = [];

vi.mock("../../../localDb.js", () => ({
  default: {
    execute: async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      // slug 精準查（fallback 人選）
      const bySlug = /WHERE slug = \?/.test(sql);
      if (bySlug) return [AGENTS.filter((a) => a.slug === params[0])];
      // id 精準查
      if (/WHERE id = \?/.test(sql)) return [AGENTS.filter((a) => a.id === Number(params[0]))];
      // 「換更多人選」：layer='strategy'（或產品策略 bundle）的關鍵字搜尋
      if (/layer = 'strategy'/.test(sql)) {
        const kw = String(params.find((p) => String(p).includes("%")) ?? "").replace(/%/g, "");
        return [AGENTS.filter((a) => `${a.name_zh}${a.title_zh}${a.specialty ?? ""}`.includes(kw))];
      }
      // 備用人選①：同產業、排除 tw（slug LIKE ? AND slug NOT LIKE ?）
      if (/slug NOT LIKE \?/.test(sql)) {
        const want = String(params[0] ?? "").replace(/%/g, "");
        const notTw = String(params[1] ?? "").replace(/%/g, "");
        return [AGENTS.filter((a) => a.slug.startsWith(want) && !a.slug.startsWith(notTw))];
      }
      // 備用人選②：同角色、繁中、排除預設那一位（slug <> ?）
      if (/slug <> \?/.test(sql)) {
        const want = String(params[0] ?? "").replace(/%/g, "");
        const exclude = String(params[1] ?? "");
        return [AGENTS.filter((a) => a.slug.startsWith(want) && a.slug.includes("-tw-") && a.slug !== exclude)];
      }
      // 角色 + 產業代碼查詢（主要路徑）：唯一參數是 'brand_strategy-beauty-tw-%'
      if (/slug LIKE \?\s*\n\s*ORDER BY/.test(sql)) {
        const pat = String(params[0] ?? "").replace(/%/g, "");
        return [AGENTS.filter((a) => a.slug.startsWith(pat))];
      }
      // 角色 + 原字串比職稱（退一步的路徑）：第一個參數是 slug 前綴，其餘是產業關鍵字
      if (/slug LIKE \?/.test(sql)) {
        const prefix = String(params[0] ?? "").replace(/%/g, "");
        const kw = String(params[1] ?? "").replace(/%/g, "");
        return [AGENTS.filter((a) =>
          a.slug.startsWith(prefix) && a.slug.includes("-tw-")
          && `${a.title_zh}${a.title}${a.specialty ?? ""}`.includes(kw))];
      }
      return [[]];
    },
  },
}));

const { sanitizeProse, listDirectorsForBrand, getDirectorByAgentId, searchDirectors, industryCodeOf, rolesFor } =
  await import("./strategistDirectory");

beforeEach(() => { calls.length = 0; });

describe("sanitizeProse", () => {
  it("整段都是匯入失敗的樣板句就回 null（不顯示比顯示一段沒意義的字好）", () => {
    expect(sanitizeProse("Details for Jane Wakely are not fully available in the provided JSON.")).toBeNull();
    expect(sanitizeProse("【核心成果指標】\nDetails not explicitly available in provided sources.")).toBeNull();
    expect(sanitizeProse("The map task for her was incomplete.")).toBeNull();
  });

  it("只有其中一行是樣板句時，其餘內容要留著", () => {
    const out = sanitizeProse(
      "【代表案例】\n**Visa**\n*Description:* 用故事轉型品牌。\n\n【核心成果指標】\nDetails not explicitly available.",
    );
    expect(out).toContain("用故事轉型品牌");
    expect(out).not.toContain("not explicitly available");
  });

  it("去掉殘留的 markdown 反引號、空字串與過短字串回 null", () => {
    expect(sanitizeProse("`**Visa** 品牌轉型專案`")).toBe("**Visa** 品牌轉型專案");
    expect(sanitizeProse("")).toBeNull();
    expect(sanitizeProse("  短  ")).toBeNull();
    expect(sanitizeProse(null)).toBeNull();
    expect(sanitizeProse(42)).toBeNull();
  });
});

describe("industryCodeOf", () => {
  // 這幾個字串全部來自 dev 真實品牌的 industry 欄位（op-probe-strategy-directors
  // 實跑結果）——第一版只比字面時這些全部落空，所以這裡用真字串當測資。
  it("真實品牌填的產業字串要對到 cohort 的產業代碼", () => {
    expect(industryCodeOf("冷凍即食料理 / 生鮮宅配電商")).toBe("food");
    expect(industryCodeOf("美妝保養")).toBe("beauty");
    // 2026-10-01：SoWork 填「行銷顧問」，對到 MarTech（品牌策略師｜MarTech 有 -tw- 人選）。
    expect(industryCodeOf("行銷顧問")).toBe("martech");
    expect(industryCodeOf("色彩文具")).toBeNull();
    expect(industryCodeOf("建設開發 / 不動產（住宅建案品牌）")).toBeNull();
  });

  it("長關鍵字先命中：保健食品是 health 不是 food", () => {
    expect(industryCodeOf("保健食品")).toBe("health");
    expect(industryCodeOf("食品飲料")).toBe("food");
    expect(industryCodeOf("醫療器材 / 醫美")).toBe("medical");
    expect(industryCodeOf("製藥")).toBe("pharma");
  });

  it("英文與大小寫也要吃得下，太短或空的回 null", () => {
    expect(industryCodeOf("B2B SaaS")).toBe("b2b_saas");
    expect(industryCodeOf("Beauty & Skincare")).toBe("beauty");
    expect(industryCodeOf(" ")).toBeNull();
    expect(industryCodeOf(null)).toBeNull();
  });
});

describe("listDirectorsForBrand", () => {
  it("三個角色各出一位，帶著自己的角度標籤與招牌問題", async () => {
    const list = await listDirectorsForBrand(null);
    expect(list).toHaveLength(rolesFor("brand").length);
    expect(list.map((d) => d.roleId)).toEqual(rolesFor("brand").map((r) => r.id));
    // 招牌問題三組互不相同——換人時問題要跟著換，這是「換了一位真的不一樣
    // 的人」在 UI 上唯一看得出來的線索之一。
    const sets = list.map((d) => d.signatureQuestions.join("|"));
    expect(new Set(sets).size).toBe(sets.length);
    for (const d of list) expect(d.signatureQuestions.length).toBeGreaterThan(0);
  });

  it("產業對得上就用那個產業的人，而且不算 fallback", async () => {
    const list = await listDirectorsForBrand("美妝保養");
    const brand = list.find((d) => d.roleId === "brand_positioning")!;
    expect(brand.agentId).toBe(900001);
    expect(brand.isFallback).toBe(false);
  });

  it("產業對不上就退回該角色的預設人選，而且標成 fallback（UI 才能誠實說明）", async () => {
    const list = await listDirectorsForBrand("色彩文具");
    const brand = list.find((d) => d.roleId === "brand_positioning")!;
    expect(brand.agentId).toBe(900002);          // brand_strategy-ecom-tw-6352
    expect(brand.isFallback).toBe(true);
  });

  it("產業字串太短（1 個字或空白）不拿去比對，直接用預設人選", async () => {
    const list = await listDirectorsForBrand(" ");
    // 不該拿空字串去比職稱／專長（那會比到全部）。
    // 2026-09-24：原本這裡斷言「完全不出現 slug LIKE 查詢」，那個假設在加了
    // 備用人選之後過期了——即使沒填產業，現在也會去撈同角色的其他人當備用。
    // 真正要守的是「沒有拿空字串去做產業比對」，所以改看那條兩段式查詢。
    expect(calls.some((c) => /title_zh LIKE \?/.test(c.sql))).toBe(false);
    for (const d of list) expect(d.isFallback).toBe(true);
  });

  it("顯示欄位優先繁中；bio_zh 沒有就退到 bio，不會變成空白", async () => {
    const list = await listDirectorsForBrand("色彩文具");
    const brand = list.find((d) => d.roleId === "brand_positioning")!;
    expect(brand.name).toBe("潘建宇");
    expect(brand.title).toBe("品牌策略師｜電商 / DTC");
    expect(brand.bio).toBe("Brand strategist for DTC.");
  });
});

// 2026-09-24（CJ「服飾 → fallback、不動產 → 對不到…這各狀況要提共備用的人選」）
describe("對不上產業時的備用人選", () => {
  it("同產業、別語系的人要被列為備用（服飾在 tw 沒人，但 cn 有）", async () => {
    const list = await listDirectorsForBrand("服飾");
    const brand = list.find((d) => d.roleId === "brand_positioning")!;
    expect(brand.isFallback).toBe(true);
    expect(brand.alternatives.map((a) => a.agentId)).toContain(900006);
    const alt = brand.alternatives.find((a) => a.agentId === 900006)!;
    expect(alt.locale).toBe("cn");          // UI 要能誠實標「這位是簡中市場的」
  });

  it("產業代碼完全對不到（不動產）也要有備用——同角色、繁中、別的產業", async () => {
    const list = await listDirectorsForBrand("建設開發 / 不動產（住宅建案品牌）");
    for (const d of list) {
      expect(d.isFallback).toBe(true);
      expect(d.alternatives.length).toBeGreaterThan(0);
      // 備用不能把預設那一位再列一次
      expect(d.alternatives.some((a) => a.agentId === d.agentId)).toBe(false);
    }
  });

  it("產業對得上的那一位不附備用（他就是答案，多給選項只是雜訊）", async () => {
    const list = await listDirectorsForBrand("美妝保養");
    const brand = list.find((d) => d.roleId === "brand_positioning")!;
    expect(brand.isFallback).toBe(false);
    expect(brand.alternatives).toEqual([]);
  });

  it("備用人選自己不再往下長第二層", async () => {
    const list = await listDirectorsForBrand("服飾");
    for (const d of list) for (const a of d.alternatives) expect(a.alternatives).toEqual([]);
  });
});

// 2026-09-24（CJ「產品定位就用你推薦的那三位人選」）
describe("產品頁的三個角色", () => {
  it("產品 scope 回的是產品那三個角色，不是品牌那三個", async () => {
    const list = await listDirectorsForBrand("食品飲料", "product");
    expect(list.map((d) => d.roleId)).toEqual(["product_value_prop", "product_kano", "product_pricing"]);
  });

  it("方法論族那兩位是固定人選：不比產業、也不標 fallback、不附備用", async () => {
    // 同一位不管品牌產業是什麼都一樣——他們本來就沒有產業分身。
    for (const industry of ["食品飲料", "美妝保養", "建設開發 / 不動產"]) {
      const list = await listDirectorsForBrand(industry, "product");
      const vp = list.find((d) => d.roleId === "product_value_prop")!;
      const kano = list.find((d) => d.roleId === "product_kano")!;
      expect(vp.agentId).toBe(900010);
      expect(kano.agentId).toBe(900011);
      for (const d of [vp, kano]) {
        expect(d.isFallback).toBe(false);      // 「沒有你產業的人選」對他們不成立
        expect(d.alternatives).toEqual([]);
      }
    }
  });

  it("定價那位照品牌產業挑（有產業分身的角色照舊）", async () => {
    const hit = await listDirectorsForBrand("食品飲料", "product");
    const pricing = hit.find((d) => d.roleId === "product_pricing")!;
    expect(pricing.agentId).toBe(900007);      // pricing_strategy-food-tw-0007
    expect(pricing.isFallback).toBe(false);

    const miss = await listDirectorsForBrand("建設開發 / 不動產", "product");
    const fallbackPricing = miss.find((d) => d.roleId === "product_pricing")!;
    expect(fallbackPricing.isFallback).toBe(true);
    expect(fallbackPricing.alternatives.length).toBeGreaterThan(0);
  });

  it("產品三位的招牌問題互不相同，也跟品牌那三位不同", async () => {
    const product = await listDirectorsForBrand("食品飲料", "product");
    const brand = await listDirectorsForBrand("食品飲料", "brand");
    const sets = product.map((d) => d.signatureQuestions.join("|"));
    expect(new Set(sets).size).toBe(sets.length);
    for (const q of sets) expect(brand.map((d) => d.signatureQuestions.join("|"))).not.toContain(q);
  });
});

describe("getDirectorByAgentId", () => {
  it("認得的 id 回那一位，roleId 依 slug 前綴判定", async () => {
    const d = await getDirectorByAgentId(900003, null);
    expect(d?.name).toBe("張建宇");
    expect(d?.roleId).toBe("pricing_value");
  });

  it("固定人選的 slug 要對到產品角色，不是落回第一個品牌角色", async () => {
    const d = await getDirectorByAgentId(900011, "食品飲料");
    expect(d?.roleId).toBe("product_kano");
    expect(d?.isFallback).toBe(false);
  });

  it("不存在的 id 回 null（呼叫端自己退回預設，不會假裝找到人）", async () => {
    expect(await getDirectorByAgentId(123456789, null)).toBeNull();
  });

  it("壞掉的資料列：經歷是樣板句，就不帶經歷出去", async () => {
    const d = await getDirectorByAgentId(900005, null);
    expect(d).not.toBeNull();
    expect(d!.experience).toBeNull();
    expect(d!.bio).toBeNull();
  });
});

describe("searchDirectors", () => {
  it("空字串不查（避免一進畫面就掃整張表）", async () => {
    expect(await searchDirectors("   ")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  // 2026-09-26：範圍＝strategy 層「或」綁了產品策略 Skill 的 agent
  // （Sandra Roberts 180837 是 execution 層，舊條件會把她排除）。
  it("關鍵字搜得到人，範圍是 strategy 層或產品策略 agent", async () => {
    const out = await searchDirectors("定價");
    expect(out.map((d) => d.agentId)).toContain(900003);
    const search = calls.find((c) => /layer = 'strategy'/.test(c.sql));
    expect(search?.sql).toMatch(/layer = 'strategy' OR primarySkillBundleKey = \?/);
    expect(search?.params).toContain("product-strategy-agent-card-v1");
  });
});

// 2026-09-26（CJ「要從 mos_db 當中，選擇三個負責這一頁的 agent，作為右下角的
// 詢問人選」）：文字頁的三位。三個 slug 都在 mos_db 查過存在；這裡測的是「角色
// 設定本身不要寫歪」——scope 分對、三個角度不重複、固定人選不要配 fallback
// （配了的話畫面會說「沒有你產業的人選」，但那句話對固定人選不成立）。
describe("文字頁（copy scope）的三位", () => {
  const roles = rolesFor("copy");

  it("剛好三位，而且不會混進品牌／產品的角色", () => {
    expect(roles.map((r) => r.id)).toEqual(["copy_voice", "copy_terms", "copy_industry"]);
    expect(rolesFor("brand").some((r) => r.scope !== "brand")).toBe(false);
    expect(rolesFor("product").some((r) => r.scope !== "product")).toBe(false);
  });

  it("固定人選用實際存在的 slug，而且不配 fallback", () => {
    const fixed = roles.filter((r) => r.fixedSlug);
    expect(fixed.map((r) => r.fixedSlug)).toEqual(["exec-brand-k3", "exec-copywriter-senior"]);
    for (const r of fixed) expect(r.fallbackSlug, r.id).toBeUndefined();
  });

  it("產業角色走既有的 <prefix><code>-tw- 比對，而且 fallback 真的長那樣", () => {
    const ind = roles.find((r) => r.id === "copy_industry")!;
    expect(ind.slugPrefix).toBe("content_strategy-");
    expect(ind.fallbackSlug).toMatch(/^content_strategy-[a-z_]+-tw-\d+$/);
  });

  it("三個角度不重複，而且每位都有自己的引導問題", () => {
    const angles = roles.map((r) => r.promptAngle);
    expect(new Set(angles).size).toBe(3);
    for (const r of roles) {
      expect(r.signatureQuestions.length, r.id).toBeGreaterThanOrEqual(3);
      expect(r.signatureQuestionsEn.length, r.id).toBe(r.signatureQuestions.length);
    }
  });
});

describe("Facebook 頁（facebook scope）的三位", () => {
  it("三個角色、三個面試選出來的固定人選，而且不混進別的 scope", () => {
    const roles = rolesFor("facebook");
    expect(roles.map((r) => r.id)).toEqual(["fb_social_proof", "fb_retargeting", "fb_ads_cadence"]);
    expect(roles.map((r) => r.fixedSlug)).toEqual(["social_media-ecom-tw-1789", "meta_ads_tw-ecom-cn-6845", "meta_ads_tw-food-cn-1427"]);
    expect(rolesFor("brand").some((r) => r.scope === "facebook")).toBe(false);
    for (const r of roles) expect(r.signatureQuestions.length).toBe(3);
  });
});

describe("通路頁（IG 到官網）的三位", () => {
  it("每個通路都有三個角色、都是固定人選、角色 id 不重複", () => {
    const all = new Set<string>();
    for (const sc of ["facebook", "instagram", "linkedin", "youtube", "tiktok", "email", "pr", "x", "website"] as const) {
      const roles = rolesFor(sc);
      expect(roles, sc).toHaveLength(3);
      for (const r of roles) {
        expect(r.fixedSlug, r.id).toBeTruthy();
        expect(r.signatureQuestions).toHaveLength(3);
        expect(r.signatureQuestionsEn).toHaveLength(3);
        expect(all.has(r.id)).toBe(false);
        all.add(r.id);
      }
    }
  });
});

describe("固定人選不可以同時掛在兩個角色", () => {
  it("fixedSlug 全站唯一——getDirectorByAgentId 用 slug 反查角色，重複的話另一頁的對話會拿到錯的角色與守則", async () => {
    const { STRATEGIST_ROLES } = await import("./strategistDirectory");
    const slugs = STRATEGIST_ROLES.map((r: any) => r.fixedSlug).filter(Boolean);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

/**
 * 2026-10-01（CJ「檢查每個頁面右下方的 ai agent，都符合該頁面的需求」）：Threads／LINE／
 * 活動／視覺／法規／成效／內容企劃原本都落回品牌那三位，現在各有自己的三位。
 */
describe("逐頁補上的顧問（Threads 到內容企劃）", () => {
  const NEW_SCOPES = ["threads", "line", "events", "visual", "regulations", "performance", "content", "influencer"] as const;

  it("每頁剛好三位、角色 id 全站不重複、每位都有中英三題招牌問題", async () => {
    const { STRATEGIST_ROLES } = await import("./strategistDirectory");
    const ids = STRATEGIST_ROLES.map((r: any) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const sc of NEW_SCOPES) {
      const roles = rolesFor(sc);
      expect(roles, sc).toHaveLength(3);
      for (const r of roles) {
        expect(r.fixedSlug || (r.slugPrefix && r.fallbackSlug), r.id).toBeTruthy();
        expect(r.signatureQuestions).toHaveLength(3);
        expect(r.signatureQuestionsEn).toHaveLength(3);
        expect(r.promptAngle.length).toBeGreaterThan(40);
      }
    }
  });

  it("有產業分身的角色，fallback 本身就在那個 cohort 裡（不然產業比對與預設人選會是兩批人）", () => {
    for (const sc of NEW_SCOPES) {
      for (const r of rolesFor(sc)) {
        if (!r.slugPrefix) continue;
        // meta_ads- 的電商那位 slug 用連字號（meta-ads-ecom-…），是 mos_db 原樣，刻意例外。
        if (r.id === "rg_platform") continue;
        expect(r.fallbackSlug!.startsWith(r.slugPrefix), r.id).toBe(true);
      }
    }
  });
});

describe("resolveRoleForSlug：同一個人是兩頁的人選時，用哪一頁的角色", () => {
  it("roleId 對得上就用它", async () => {
    const { resolveRoleForSlug } = await import("./strategistDirectory");
    expect(resolveRoleForSlug("copywriter-ecom-tw-4328", { roleId: "rg_rewrite", scope: "regulations" })?.id).toBe("rg_rewrite");
    expect(resolveRoleForSlug("copywriter-ecom-tw-4328", { roleId: "ct_copy", scope: "content" })?.id).toBe("ct_copy");
  });
  it("roleId 跟 scope 對不起來時不採信 roleId，改在這一頁的角色裡找", async () => {
    const { resolveRoleForSlug } = await import("./strategistDirectory");
    expect(resolveRoleForSlug("copywriter-ecom-tw-4328", { roleId: "ct_copy", scope: "regulations" })?.id).toBe("rg_rewrite");
  });
  it("只有 scope：依 slug 前綴在這一頁找；找不到（搜尋挑來的人）就掛這一頁的第一個角色", async () => {
    const { resolveRoleForSlug } = await import("./strategistDirectory");
    expect(resolveRoleForSlug("meta-ads-beauty-tw2-0047", { scope: "regulations" })?.id).toBe("rg_platform");
    expect(resolveRoleForSlug("su-tingwei-social-writer", { scope: "threads" })?.id).toBe("th_replies");
    expect(resolveRoleForSlug("someone-random", { scope: "performance" })?.id).toBe("pf_analyst");
  });
  it("沒有 hint 回 undefined——呼叫端照舊用全域反查，舊前端不會壞", async () => {
    const { resolveRoleForSlug } = await import("./strategistDirectory");
    expect(resolveRoleForSlug("pricing_strategy-ecom-tw-9298", {})).toBeUndefined();
  });
  it("getDirectorByAgentId 帶 scope：產品頁的定價那位拿到產品角色（原本一律落在品牌的定價角色）", async () => {
    const d = await getDirectorByAgentId(900003, null, { scope: "product" });
    expect(d?.roleId).toBe("product_pricing");
  });
});

describe("2026-10-01 第二輪換人", () => {
  it("產生器沒填完的佔位符（{ri(2,3)}、{ind_label}）不會進 prompt", () => {
    expect(sanitizeProse("跑 {ri(2,3)} 週、{ri(1000,3000)} 轉換數，{ind_label} 產業")).toBe("跑  週、 轉換數， 產業");
  });
  it("平台廣告審核比對的是 tw2 那批（上線前逐句預審），不是一般 tw 投手", async () => {
    const { STRATEGIST_ROLES } = await import("./strategistDirectory");
    const r = STRATEGIST_ROLES.find((x: any) => x.id === "rg_platform") as any;
    expect(r.slugPrefix).toBe("meta-ads-");
    expect(r.localeSeg).toBe("tw2");
  });
  it("Threads 留言經營的守則明令禁止帶風向與假帳號（那位人選的專長裡有這些）", () => {
    const r = rolesFor("threads").find((x) => x.id === "th_replies")!;
    expect(r.fixedSlug).toBe("su-tingwei-social-writer");
    expect(r.promptAngle).toMatch(/絕不建議開分身帳號/);
    expect(r.promptAngle).toMatch(/帶風向/);
  });
});
