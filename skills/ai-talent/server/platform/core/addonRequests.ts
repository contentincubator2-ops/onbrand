/**
 * addonRequests — 「電商營運報告」加購申請：試算報價、寫進資料庫、通知業務。
 *
 * 2026-09-21（CJ「請把『可加購成效層』接上真正的購買路徑」）：報價頁寫「可加購」，
 * 但 ADDONS.ecom_reporting 只是一份設定，沒有任何地方接上去 —— 沒有按鈕、沒有
 * 申請、連 mailto 都沒有。
 *
 * 這裡刻意不做 Stripe 自助結帳：這個加購是「建置 NT$48,000 ＋ 月維運」，範圍要
 * 先確認後台資料權限、品項數、LINE 官方帳號，簽約時還有工作說明書（報價頁自己
 * 也寫「以簽約時確認的工作說明書為準」）。所以路徑是：用戶在站內填品項數與後台
 * 平台 → 當場看到試算報價 → 送出申請 → 存進 addon_requests、寄信給業務 → 業務
 * 用登入信箱聯繫、簽約後才開通。一位用戶同一個加購同時只能有一筆進行中的申請。
 */
import localPool from "../../localDb";
import { ADDONS, ecomSkuSurcharge, type AddonId } from "./plans";

export const ADDON_REQUESTS_DDL = `
  CREATE TABLE IF NOT EXISTS addon_requests (
    id               INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId           INT          NOT NULL,
    brandId          INT          NULL,
    addonId          VARCHAR(40)  NOT NULL,
    skus             INT          NOT NULL,
    storePlatform    VARCHAR(60)  NULL,
    notes            TEXT         NULL,
    quotedOneTimeTwd INT          NULL,
    quotedMonthlyTwd INT          NULL,
    projectQuote     TINYINT(1)   NOT NULL DEFAULT 0,
    status           VARCHAR(16)  NOT NULL DEFAULT 'new',
    createdAt        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_addon_requests_user (userId, addonId, status),
    KEY idx_addon_requests_status (status, createdAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/** 還在處理中的狀態 —— 這兩種算「已經有一筆申請在跑」。 */
export const OPEN_STATUSES = ["new", "contacted"] as const;

export interface EcomQuote {
  /** 200 品項以上（或多商店）→ 專案報價，兩個金額都是 null。 */
  projectQuote: boolean;
  oneTimeTwd: number | null;
  monthlyTwd: number | null;
}

export function quoteEcomReporting(skus: number): EcomQuote {
  const base = ADDONS.ecom_reporting;
  const surcharge = ecomSkuSurcharge(skus);
  if (!surcharge) return { projectQuote: true, oneTimeTwd: null, monthlyTwd: null };
  return {
    projectQuote: false,
    oneTimeTwd: base.oneTimeTwd + surcharge.oneTimeTwd,
    monthlyTwd: base.monthlyTwd + surcharge.monthlyTwd,
  };
}

export interface AddonRequest {
  id: number;
  addonId: AddonId;
  brandId: number | null;
  skus: number;
  storePlatform: string | null;
  notes: string | null;
  quotedOneTimeTwd: number | null;
  quotedMonthlyTwd: number | null;
  projectQuote: boolean;
  status: string;
  createdAt: string;
}

function rowToRequest(r: any): AddonRequest {
  return {
    id: Number(r.id),
    addonId: r.addonId as AddonId,
    brandId: r.brandId == null ? null : Number(r.brandId),
    skus: Number(r.skus),
    storePlatform: r.storePlatform ?? null,
    notes: r.notes ?? null,
    quotedOneTimeTwd: r.quotedOneTimeTwd == null ? null : Number(r.quotedOneTimeTwd),
    quotedMonthlyTwd: r.quotedMonthlyTwd == null ? null : Number(r.quotedMonthlyTwd),
    projectQuote: !!r.projectQuote,
    status: String(r.status),
    createdAt: new Date(r.createdAt).toISOString(),
  };
}

export async function listAddonRequests(userId: number, addonId: AddonId): Promise<AddonRequest[]> {
  const [rows]: any = await localPool.execute(
    `SELECT * FROM addon_requests WHERE userId = ? AND addonId = ? ORDER BY createdAt DESC LIMIT 10`,
    [userId, addonId],
  );
  return (rows as any[]).map(rowToRequest);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 寄信給業務。best-effort —— 寄不出去也不能讓用戶的申請失敗，資料庫那筆才是正本。 */
export async function notifySalesNewAddonRequest(args: {
  request: AddonRequest;
  userEmail: string | null;
}): Promise<void> {
  try {
    const to = process.env.SALES_NOTIFY_TO || process.env.SUPPORT_NOTIFY_TO || "sowork@sowork.ai";
    const { sendEmail } = await import("../auth/emailService");
    const r = args.request;
    const label = ADDONS[r.addonId].labelZh;
    const money = r.projectQuote
      ? "專案報價（品項超過 200）"
      : `建置 NT$${(r.quotedOneTimeTwd ?? 0).toLocaleString("en-US")} ＋ 月費 NT$${(r.quotedMonthlyTwd ?? 0).toLocaleString("en-US")}`;
    await sendEmail({
      to,
      subject: `[onBrand Studio] 加購申請 #${r.id}：${label}（${r.skus} 品項）`,
      html: `
        <div style="font-family:-apple-system,sans-serif;line-height:1.6;color:#333">
          <h2 style="margin:0 0 8px">加購申請 #${r.id}：${escapeHtml(label)}</h2>
          <p><b>來自：</b>${escapeHtml(args.userEmail ?? "(未知)")}${r.brandId ? `（brandId ${r.brandId}）` : ""}</p>
          <p><b>品項數：</b>${r.skus}</p>
          <p><b>後台平台：</b>${escapeHtml(r.storePlatform ?? "（未填）")}</p>
          <p><b>試算報價：</b>${escapeHtml(money)}</p>
          ${r.notes ? `<p><b>備註：</b><br>${escapeHtml(r.notes.slice(0, 1500)).replace(/\n/g, "<br>")}</p>` : ""}
          <hr>
          <p>請用上面的信箱聯繫，確認資料權限與工作說明書後再開通。狀態在 addon_requests 表（new → contacted → won/lost）。</p>
        </div>`,
    });
  } catch (e) {
    console.error("[addon] notifySalesNewAddonRequest failed:", e);
  }
}

export interface CreateAddonRequestInput {
  userId: number;
  userEmail: string | null;
  brandId: number | null;
  skus: number;
  storePlatform?: string | null;
  notes?: string | null;
}

/**
 * 送出加購申請。已經有進行中的申請就直接回那一筆（alreadyOpen: true），不重複寫、
 * 不重複寄信 —— 否則按兩次就是業務收到兩封。
 */
export async function createEcomReportingRequest(
  input: CreateAddonRequestInput,
): Promise<{ request: AddonRequest; alreadyOpen: boolean }> {
  const [openRows]: any = await localPool.execute(
    `SELECT * FROM addon_requests WHERE userId = ? AND addonId = 'ecom_reporting' AND status IN ('new','contacted')
      ORDER BY createdAt DESC LIMIT 1`,
    [input.userId],
  );
  const open = (openRows as any[])[0];
  if (open) return { request: rowToRequest(open), alreadyOpen: true };

  const quote = quoteEcomReporting(input.skus);
  const [res]: any = await localPool.execute(
    `INSERT INTO addon_requests
       (userId, brandId, addonId, skus, storePlatform, notes, quotedOneTimeTwd, quotedMonthlyTwd, projectQuote, status)
     VALUES (?, ?, 'ecom_reporting', ?, ?, ?, ?, ?, ?, 'new')`,
    [
      input.userId, input.brandId, input.skus,
      input.storePlatform?.trim() || null, input.notes?.trim() || null,
      quote.oneTimeTwd, quote.monthlyTwd, quote.projectQuote ? 1 : 0,
    ],
  );
  const [rows]: any = await localPool.execute(`SELECT * FROM addon_requests WHERE id = ? LIMIT 1`, [res.insertId]);
  const request = rowToRequest((rows as any[])[0]);
  await notifySalesNewAddonRequest({ request, userEmail: input.userEmail });
  return { request, alreadyOpen: false };
}
