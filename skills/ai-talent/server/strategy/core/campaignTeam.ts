/**
 * campaignTeam — 活動頁上的「人」：從 agents 表挑真的人，不是一個職稱。
 *
 * 2026-09-30（CJ「內容企劃應該是一個人，要匹配 AI agent 才可以，不是內容企劃而已」）。
 *
 * 活動頁上有三個人，各管一件事，不重疊：
 *   · 策略總監（右下角，全站共用，見 strategistDirectory.ts）——方向：訴求、主角、對誰說。
 *   · 內容企劃（活動頁左下的對話卡）——執行：哪一天、哪個通路、這篇講什麼、每一段的訊息。
 *   · 投放專家（KPI 與預算視窗）——資源：每一段花多少、看什麼數字、哪幾篇下廣告。
 * 內容企劃被問到方向的問題，不自己改，轉給策略總監（見 campaignChat.ts 的 askDirector）。
 *
 * 挑人的規則跟策略總監同一套：mos_db 的產業 cohort（slug＝職能-產業-市場-編號），
 * 產業對得上的優先、台灣市場（第三段 -tw-）優先、有真實經歷的優先、評分高的優先；
 * 一個都對不上才用預設人選。
 */
import localPool from "../../localDb.js";

export interface TeamAgent { id: number; slug: string; name: string; title: string; avatarUrl: string }

/** 品牌產業 → slug 裡的產業代號。 */
export const INDUSTRY_TOKENS: Array<[RegExp, string]> = [
  [/餐|食|飲|咖啡|烘焙|甜點|牛排|肉|茶|酒|food|restaurant|cafe|coffee|bakery|beverage/i, "food"],
  [/美妝|保養|香氛|香水|彩妝|美容|beauty|cosmetic|skincare|fragrance/i, "beauty"],
  [/保健|醫|營養|健康|health|medical|nutrition|wellness/i, "health"],
  [/教育|課程|學|edu|course/i, "edu"],
  [/旅遊|旅行|飯店|travel|hotel/i, "travel"],
  [/軟體|科技|SaaS|AI|app|平台|顧問|行銷|software|tech|platform|agency|consult/i, "saas"],
  [/電商|網購|零售|服飾|文具|ecom|retail|fashion|stationery/i, "ecom"],
];

export function industryToken(industry: string | null | undefined): string {
  return INDUSTRY_TOKENS.find(([re]) => re.test(String(industry ?? "")))?.[1] ?? "ecom";
}

const toAgent = (r: any): TeamAgent => ({
  id: Number(r.id), slug: String(r.slug ?? ""),
  name: String(r.name_zh || r.name || r.englishName || ""),
  title: String(r.title_zh || r.title || ""), avatarUrl: String(r.avatarUrl ?? ""),
});

/**
 * 在一個 cohort 裡挑一位（WHERE 片段由呼叫端給，只能是常數字串）。
 *
 * 2026-10-01（dev 實測：SoWork 的產業改成「行銷顧問」→ saas，內容企劃 cohort 裡沒有 saas 的人，
 * 原本的排序就掉到評分最高的「金融科技」內容策略師——剛好也叫潘建宇，跟策略總監同名，
 * 一張對話卡出現兩個潘建宇）：
 *   · 只在**產業對得上**的人裡挑；對不上就用固定的預設人選，不再隨便換成別的產業。
 *   · avoidName：同一張卡上已經有的人（策略總監）的名字，不挑同名的。
 */
async function pickFromCohort(cohortWhere: string, industry: string | null | undefined, fallbackSlug: string, avoidName?: string | null): Promise<TeamAgent | null> {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT id, slug, name, name_zh, englishName, title, title_zh, avatarUrl FROM agents
        WHERE isAvailable = 1 AND (${cohortWhere}) AND slug LIKE ?
          AND COALESCE(NULLIF(name_zh, ''), name, '') <> ?
        ORDER BY (slug LIKE '%-tw-%') DESC, (experienceDetail IS NOT NULL) DESC, rating DESC, id ASC
        LIMIT 1`,
      [`%-${industryToken(industry)}-%`, String(avoidName ?? "")],
    );
    if ((rows as any[])[0]) return toAgent((rows as any[])[0]);
    const [fb]: any = await localPool.execute(
      `SELECT id, slug, name, name_zh, englishName, title, title_zh, avatarUrl FROM agents WHERE slug = ? LIMIT 1`,
      [fallbackSlug],
    );
    return (fb as any[])[0] ? toAgent((fb as any[])[0]) : null;
  } catch {
    return null;
  }
}

/** 內容企劃：社群／內容策略的人（會排內容日曆、懂各平台差異）。 */
export function pickPlannerAgent(industry: string | null | undefined, avoidName?: string | null): Promise<TeamAgent | null> {
  return pickFromCohort("slug LIKE 'social_media-%' OR slug LIKE 'content_strategy-%'", industry, "social_media-ecom-tw-1789", avoidName);
}

/** 投放專家：paid-media 的人（會拆預算、定 KPI、挑哪幾篇下廣告）。 */
export function pickKpiAgent(industry: string | null | undefined): Promise<TeamAgent | null> {
  return pickFromCohort("primarySkillBundleKey = 'paid-media-operations'", industry, "meta_ads_tw-ecom-cn-6845");
}

/** 讀品牌產業（挑人用）。 */
export async function brandIndustry(brandId: number): Promise<string> {
  try {
    const [rows]: any = await localPool.execute(`SELECT industry FROM brands WHERE id = ? LIMIT 1`, [brandId]);
    return String((rows as any[])[0]?.industry ?? "");
  } catch {
    return "";
  }
}
