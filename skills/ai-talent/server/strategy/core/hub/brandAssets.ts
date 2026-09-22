/**
 * brandAssets — 品牌頁上那幾類「操作性」品牌資料。
 *
 * 2026-09-22 (CJ「在品牌的頁面，通常高科技的公司，需要加入甚麼品牌資訊」)。
 * 排序的標準是：**這一欄不填，AI 寫那篇貼文的時候會不會自己編**。照這個標準，
 * 第一級是每篇都會用到的三項，加上科技業代價最高的客戶白名單與緘默期。
 *
 * 原本的品牌頁只有 positioning（我們說什麼），一項操作性資料都沒有——沒有
 * 網址、沒有官方帳號、沒有商標寫法。業務要導流的時候就自己找一個連結貼。
 *
 * ── 為什麼五類共用一張表 ─────────────────────────────────────────────
 * 五類的形狀其實一樣：一個 kind、一筆 JSON、一個排序。分五張表就要分五套
 * CRUD 與五個 router procedure，而它們的差別只在表單欄位——那是前端的事。
 * hub_wording 當初分成 preferred/swap/banned 三個 kind 共用一張表，同一個道理。
 *
 * ── payload 為什麼不強制 schema ──────────────────────────────────────
 * 強制了就得為每一類寫一份 zod，而這幾類還在長（CJ 的清單裡第二三四級還沒做）。
 * 進出兩端都在這支檔案裡收斂，讀的時候給預設值，壞掉的列就跳過不讓它炸整頁。
 */
import localPool from "../../../localDb";

const TAIL = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

export const BRAND_ASSET_KINDS = [
  "destination",  // 核准的導流目的地
  "identity",     // 公司／品牌／產品的寫法規範
  "account",      // 官方社群帳號
  "customer",     // 可公開提及的客戶（白名單）
  "quiet",        // 緘默期：依日期開關的額外限制
] as const;
export type BrandAssetKind = (typeof BRAND_ASSET_KINDS)[number];

export const isBrandAssetKind = (k: string): k is BrandAssetKind =>
  (BRAND_ASSET_KINDS as readonly string[]).includes(k);

export interface BrandAsset {
  id: number;
  kind: BrandAssetKind;
  payload: Record<string, any>;
  sortOrder: number;
}

const DDL = `CREATE TABLE IF NOT EXISTS hub_brand_assets (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id      INT          NOT NULL,
  kind        VARCHAR(20)  NOT NULL,
  payload     JSON         NOT NULL,
  sort_order  INT          NOT NULL DEFAULT 0,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_org_kind (org_id, kind, sort_order)
) ${TAIL}`;

export async function ensureBrandAssetTable(): Promise<void> {
  await localPool.execute(DDL);
}

export async function listBrandAssets(orgId: number, kind?: BrandAssetKind): Promise<BrandAsset[]> {
  const [rows]: any = kind
    ? await localPool.execute(
        `SELECT id, kind, payload, sort_order FROM hub_brand_assets WHERE org_id = ? AND kind = ? ORDER BY sort_order, id`,
        [orgId, kind],
      )
    : await localPool.execute(
        `SELECT id, kind, payload, sort_order FROM hub_brand_assets WHERE org_id = ? ORDER BY kind, sort_order, id`,
        [orgId],
      );
  const out: BrandAsset[] = [];
  for (const r of rows as any[]) {
    const payload = typeof r.payload === "string" ? safeJson(r.payload) : (r.payload ?? {});
    // 壞掉的一列不該讓整頁掛掉——跳過它，其餘照常顯示。
    if (!payload || typeof payload !== "object") continue;
    if (!isBrandAssetKind(r.kind)) continue;
    out.push({ id: r.id, kind: r.kind, payload, sortOrder: Number(r.sort_order ?? 0) });
  }
  return out;
}

export async function saveBrandAsset(args: {
  orgId: number;
  kind: BrandAssetKind;
  id?: number | null;
  payload: Record<string, any>;
}): Promise<number> {
  const json = JSON.stringify(args.payload ?? {});
  if (args.id) {
    await localPool.execute(
      `UPDATE hub_brand_assets SET payload = ? WHERE id = ? AND org_id = ? AND kind = ?`,
      [json, args.id, args.orgId, args.kind],
    );
    return args.id;
  }
  const [next]: any = await localPool.execute(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM hub_brand_assets WHERE org_id = ? AND kind = ?`,
    [args.orgId, args.kind],
  );
  const [ins]: any = await localPool.execute(
    `INSERT INTO hub_brand_assets (org_id, kind, payload, sort_order) VALUES (?, ?, ?, ?)`,
    [args.orgId, args.kind, json, Number((next as any[])[0]?.n ?? 1)],
  );
  return ins.insertId;
}

export async function removeBrandAsset(orgId: number, id: number): Promise<void> {
  await localPool.execute(`DELETE FROM hub_brand_assets WHERE id = ? AND org_id = ?`, [id, orgId]);
}

// ── 給寫作端用的兩個讀取器 ───────────────────────────────────────────────

/** 核准的導流目的地，寫進 prompt 讓 AI 只從這幾個裡面挑。 */
export async function approvedDestinations(orgId: number): Promise<Array<{ label: string; url: string; useWhen: string }>> {
  const rows = await listBrandAssets(orgId, "destination");
  return rows
    .map((r) => ({
      label: String(r.payload.label ?? "").trim(),
      url: String(r.payload.url ?? "").trim(),
      useWhen: String(r.payload.useWhen ?? "").trim(),
    }))
    .filter((d) => d.label && d.url);
}

export interface ActiveQuietPeriod {
  label: string;
  startsOn: string;
  endsOn: string;
  topics: string[];
}

/**
 * 今天落在哪一段緘默期裡。
 *
 * 這是政策包做不到的那一類規則：六條規則是靜態的，緘默期**依日期開關**。
 * 上市公司財報前業務在個人社群講營收、成長率、剛簽的大單，那是證券法層級的
 * 問題，不是行銷問題。
 *
 * 用當地日期字串比較而不是 Date 物件：兩邊都是 YYYY-MM-DD，字串比較就對，
 * 而且不會被時區推掉一天（這個坑在 hubStore.ymd 已經踩過一次）。
 */
export async function activeQuietPeriods(orgId: number, today = localToday()): Promise<ActiveQuietPeriod[]> {
  const rows = await listBrandAssets(orgId, "quiet");
  return rows.map(toQuietPeriod).filter((p) => isQuietOn(p, today));
}

/** payload → 型別化的區間。topics 允許陣列或逗號字串，因為表單送的是字串。 */
export function toQuietPeriod(r: { payload: Record<string, any> }): ActiveQuietPeriod {
  const raw = r.payload.topics;
  const topics = Array.isArray(raw)
    ? raw.map((x: any) => String(x).trim()).filter(Boolean)
    : String(raw ?? "").split(/[,、]/).map((x) => x.trim()).filter(Boolean);
  return {
    label: String(r.payload.label ?? "").trim(),
    startsOn: String(r.payload.startsOn ?? "").slice(0, 10),
    endsOn: String(r.payload.endsOn ?? "").slice(0, 10),
    topics,
  };
}

/**
 * 今天在不在這段區間內。兩端都含。
 *
 * 用 YYYY-MM-DD 字串直接比較，不轉 Date：兩邊格式一樣，字典序就是時序，
 * 而且不會被時區推掉一天。這個坑 hubStore.ymd 已經踩過一次，不再踩第二次。
 * 缺頭或缺尾的區間一律不生效——寧可漏掉，也不要一個沒有結束日的緘默期把
 * 之後每一篇貼文都綁死。
 */
export function isQuietOn(p: ActiveQuietPeriod, today: string): boolean {
  if (!p.startsOn || !p.endsOn) return false;
  if (p.endsOn < p.startsOn) return false;
  return p.startsOn <= today && today <= p.endsOn;
}

export function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}
