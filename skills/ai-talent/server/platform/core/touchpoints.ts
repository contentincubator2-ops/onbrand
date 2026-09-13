/**
 * touchpoints — 接觸點註冊表：把散落在 publishRouter / bundleConnectRouter /
 * ShellLayout 導覽陣列裡、各自判斷「這個通路能不能真的自動發布」的邏輯，
 * 收成一張查得到的表。
 *
 * 2026-09-13（CJ「把現在寫死在各自檔案裡的隱性規則，變成一張查得到的表」）：
 * 這不是新功能，registry 本身是靜態資料（跟 mediaGen.ts 的 PIAPI_MAP 同一種
 * 「spec table + 通用查詢函式」風格），deployStatus 才是即時算出來的 ——
 * 直接讀 brands.bundleConnectedAt，不额外開表存一份會跟真實狀態脫節的副本。
 *
 * industry / market 只是「顯示用」的標籤：目前沒有任何一條「這個產業/國家
 * 不能用這個通路」的已驗證規則，所以 applicable 一律回 true。等有真的規則
 * （例如某些市場法規禁用特定平台）再把它接進 isApplicable()，不先編假規則。
 */
import localPool from "../../localDb";

export type DeployMethod = "api-publish" | "manual-copy" | "embed-widget";
export type DeployStatus = "connected" | "manual";

export interface TouchpointDef {
  id: string;
  label: string;
  labelEn: string;
  /** 對應哪個人設角色負責這裡的語氣 */
  agentRole: string;
  /** 這個接觸點能用哪些既有任務卡（路由前綴，對應 /tasks/:platform） */
  skillIds: string[];
  deployMethod: DeployMethod;
}

export interface TouchpointCoverage extends TouchpointDef {
  deployStatus: DeployStatus;
  applicable: boolean;
}

export const TOUCHPOINTS: TouchpointDef[] = [
  { id: "facebook",  label: "Facebook",  labelEn: "Facebook",  agentRole: "social-copywriter", skillIds: ["fb"],    deployMethod: "api-publish" },
  { id: "instagram", label: "Instagram", labelEn: "Instagram", agentRole: "social-copywriter", skillIds: ["ig"],    deployMethod: "api-publish" },
  { id: "linkedin",  label: "LinkedIn",  labelEn: "LinkedIn",  agentRole: "b2b-copywriter",    skillIds: ["li"],    deployMethod: "manual-copy" },
  { id: "youtube",   label: "YouTube",   labelEn: "YouTube",   agentRole: "video-copywriter",  skillIds: ["yt"],    deployMethod: "manual-copy" },
  { id: "tiktok",    label: "TikTok",    labelEn: "TikTok",    agentRole: "video-copywriter",  skillIds: ["tt"],    deployMethod: "manual-copy" },
  { id: "x",         label: "X",         labelEn: "X",         agentRole: "social-copywriter", skillIds: ["x"],     deployMethod: "manual-copy" },
  { id: "email",     label: "電子報",     labelEn: "Email",     agentRole: "lifecycle-copywriter", skillIds: ["email"], deployMethod: "manual-copy" },
  { id: "pr",        label: "新聞稿",     labelEn: "PR",        agentRole: "pr-copywriter",     skillIds: ["pr"],    deployMethod: "manual-copy" },
  { id: "website",   label: "官網",       labelEn: "Website",   agentRole: "content-strategist", skillIds: ["web"],  deployMethod: "manual-copy" },
  { id: "brand-agent", label: "品牌即時代理人", labelEn: "Brand live agent", agentRole: "support-agent", skillIds: [], deployMethod: "embed-widget" },
];

interface BrandRow {
  industry: string | null;
  targetCountry: string | null;
  bundleConnectedAt: string | null;
}

async function loadBrandRow(brandId: number): Promise<BrandRow> {
  const [rowsRaw]: any = await localPool.execute(
    `SELECT industry, targetCountry, bundleConnectedAt FROM brands WHERE id = ? LIMIT 1`,
    [brandId],
  );
  const row = Array.isArray(rowsRaw) ? rowsRaw[0] : null;
  return {
    industry: row?.industry ?? null,
    targetCountry: row?.targetCountry ? String(row.targetCountry).toUpperCase() : null,
    bundleConnectedAt: row?.bundleConnectedAt ?? null,
  };
}

function deployStatusFor(def: TouchpointDef, brand: BrandRow): DeployStatus {
  if (def.deployMethod !== "api-publish") return "manual";
  return brand.bundleConnectedAt ? "connected" : "manual";
}

export interface BrandCoverage {
  brandId: number;
  industry: string | null;
  targetCountry: string | null;
  touchpoints: TouchpointCoverage[];
  totalCount: number;
  connectedCount: number;
}

export async function getTouchpointCoverage(brandId: number): Promise<BrandCoverage> {
  const brand = await loadBrandRow(brandId);
  const touchpoints: TouchpointCoverage[] = TOUCHPOINTS.map((def) => ({
    ...def,
    deployStatus: deployStatusFor(def, brand),
    applicable: true,
  }));
  return {
    brandId,
    industry: brand.industry,
    targetCountry: brand.targetCountry,
    touchpoints,
    totalCount: touchpoints.length,
    connectedCount: touchpoints.filter((t) => t.deployStatus === "connected").length,
  };
}
