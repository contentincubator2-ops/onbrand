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
    // 匯入失敗的那種——文字欄位全是樣板句。
    id: 900005, slug: "brand_strategy-broken-tw-0005", name: "Broken Row", name_zh: "資料壞掉",
    title: "Brand Strategist", title_zh: "品牌策略師｜損壞", industry: "tech",
    avatarUrl: "", bio_zh: null, bio: null, bio_en: null,
    experienceDetail: "【代表案例】\nDetails for this agent are not fully available in the provided JSON.",
    specialty: null, specialtySummary: null, methodology: null,
  },
];

const calls: Array<{ sql: string; params: any[] }> = [];

vi.mock("../../localDb.js", () => ({
  default: {
    execute: async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      // slug 精準查（fallback 人選）
      const bySlug = /WHERE slug = \?/.test(sql);
      if (bySlug) return [AGENTS.filter((a) => a.slug === params[0])];
      // id 精準查
      if (/WHERE id = \?/.test(sql)) return [AGENTS.filter((a) => a.id === Number(params[0]))];
      // 「換更多人選」：layer='strategy' 的關鍵字搜尋
      if (/layer = 'strategy'/.test(sql)) {
        const kw = String(params[0] ?? "").replace(/%/g, "");
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

const { sanitizeProse, listDirectorsForBrand, getDirectorByAgentId, searchDirectors, industryCodeOf, STRATEGIST_ROLES } =
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
    expect(list).toHaveLength(STRATEGIST_ROLES.length);
    expect(list.map((d) => d.roleId)).toEqual(STRATEGIST_ROLES.map((r) => r.id));
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

describe("getDirectorByAgentId", () => {
  it("認得的 id 回那一位，roleId 依 slug 前綴判定", async () => {
    const d = await getDirectorByAgentId(900003, null);
    expect(d?.name).toBe("張建宇");
    expect(d?.roleId).toBe("pricing_value");
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

  it("關鍵字搜得到人，而且限制在 strategy 層", async () => {
    const out = await searchDirectors("定價");
    expect(out.map((d) => d.agentId)).toContain(900003);
    expect(calls.some((c) => /layer = 'strategy'/.test(c.sql))).toBe(true);
  });
});
