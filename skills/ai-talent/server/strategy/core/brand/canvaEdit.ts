/**
 * canvaEdit — 「在 Canva 編輯」的來回：從貼文跳去 Canva 改圖，回來後把最新版帶回貼文。
 *
 * 2026-10-10（CJ「如果增加 Scope 的話，可以讓用戶直接在 onbrand 裡面，使用 CANVA 嗎」）。
 * Canva 不開放把編輯器嵌進別人的畫面，能做的是來回：開編輯連結 → 用戶在 Canva 改 → 回來。
 * 三種起點共用同一段回程：
 *   · 這張圖本來就是從 Canva 匯入的 → 開那份設計（不需要寫入類 scope）
 *   · 這張圖是 AI 畫的或自己上傳的 → 先送進用戶的 Canva，開一張放著它的新設計（要寫入 scope）
 *   · 這篇還沒有圖 → 開一張尺寸設好的空白設計（要寫入 scope）
 *
 * 兩張表：
 *   canva_design_refs    素材庫的哪一張圖來自 Canva 的哪份設計、第幾頁——「這張圖能不能回 Canva 改」靠它。
 *   canva_edit_sessions  一次來回。鑰匙（skey）就是交給 Canva 的 correlation_state；回程不管是
 *                        Canva 的返回按鈕，還是用戶自己切回分頁，都用鑰匙找回「要更新哪一篇的哪一格」。
 *
 * 回程用 Canva 那邊的 updated_at 判斷有沒有改過：沒改就什麼都不做——用戶只是切回來看一眼時，
 * 不該多匯出一次、多存一張圖、多留一個版本。
 */
import crypto from "node:crypto";
import localPool from "../../../localDb";
import {
  CanvaApiError, canvaCanWrite, createCanvaDesign, exportCanvaDesignPng, getCanvaDesign,
  uploadCanvaAsset, withCorrelationState, type CanvaDesignDetail,
} from "../../../platform/core/connectors/canvaClient";
import { fetchImageBuffer } from "../../../platform/core/media/imageFetch";
import { MAX_UPLOAD_BYTES, storePhotoBytes, type AssetPhoto } from "./assetPhotos";

export const CANVA_DESIGN_REFS_DDL = `
  CREATE TABLE IF NOT EXISTS canva_design_refs (
    id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    brandId    INT          NOT NULL,
    actorId    INT          NOT NULL,
    designId   VARCHAR(128) NOT NULL,
    pageNo     INT          NOT NULL DEFAULT 1,
    photoUrl   VARCHAR(500) NOT NULL,
    createdAt  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_canva_refs_photo (brandId, photoUrl(191))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const CANVA_EDIT_SESSIONS_DDL = `
  CREATE TABLE IF NOT EXISTS canva_edit_sessions (
    skey             VARCHAR(40)  NOT NULL PRIMARY KEY,
    actorId          INT          NOT NULL,
    ownerId          INT          NOT NULL,
    brandId          INT          NOT NULL,
    designId         VARCHAR(128) NOT NULL,
    pageNo           INT          NOT NULL DEFAULT 1,
    title            VARCHAR(255) NOT NULL DEFAULT '',
    outputId         INT          NULL,
    locator          JSON         NULL,
    syncedUpdatedAt  BIGINT       NOT NULL DEFAULT 0,
    createdAt        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_canva_sessions_actor (actorId, createdAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export type Queryable = { execute: (sql: string, params?: any[]) => Promise<any> };

/**
 * 要寫回哪一篇的哪一格。形狀跟內容層的 ContentSelector 一樣，但這裡（策略層）只存、只轉交，不解讀——
 * 真正把圖寫進貼文的是內容層（content/core/image/canvaOutputImage.ts），由組裝層（server/routers/index.ts）
 * 註冊進來。策略層不能引用內容層（ARCHITECTURE.md：platform < strategy < content）。
 */
export interface CanvaEditLocator { variantIndex: number; contentKind?: "planning" | "public"; contentIndex?: number }
export type CanvaOutputWriter = (
  args: { ownerId: number; outputId: number; locator: CanvaEditLocator; imageUrl: string }, pool?: Queryable,
) => Promise<boolean>;
let outputWriter: CanvaOutputWriter | null = null;
export function registerCanvaOutputWriter(fn: CanvaOutputWriter): void { outputWriter = fn; }

export interface CanvaRef { designId: string; pageNo: number; actorId: number }

export async function recordCanvaRef(
  args: { brandId: number; actorId: number; designId: string; pageNo: number; photoUrl: string }, pool: Queryable = localPool,
): Promise<void> {
  await pool.execute(
    `INSERT INTO canva_design_refs (brandId, actorId, designId, pageNo, photoUrl) VALUES (?, ?, ?, ?, ?)`,
    [args.brandId, args.actorId, args.designId, Math.max(1, Math.trunc(args.pageNo) || 1), args.photoUrl],
  );
}

/** 這張圖來自 Canva 的哪份設計；不是從 Canva 來的回 null。 */
export async function findCanvaRef(brandId: number, photoUrl: string, pool: Queryable = localPool): Promise<CanvaRef | null> {
  if (!photoUrl) return null;
  const [rows]: any = await pool.execute(
    `SELECT designId, pageNo, actorId FROM canva_design_refs WHERE brandId = ? AND photoUrl = ? ORDER BY id DESC LIMIT 1`,
    [brandId, photoUrl],
  );
  const r = (rows as any[])[0];
  return r ? { designId: String(r.designId), pageNo: Number(r.pageNo) || 1, actorId: Number(r.actorId) } : null;
}

export interface CanvaEditSession {
  skey: string; actorId: number; ownerId: number; brandId: number; designId: string; pageNo: number;
  title: string; outputId: number | null; locator: CanvaEditLocator | null; syncedUpdatedAt: number;
}

export function newSessionKey(): string {
  return crypto.randomBytes(24).toString("base64url"); // 32 個字元，Canva 上限 50
}

export async function loadSession(skey: string, pool: Queryable = localPool): Promise<CanvaEditSession | null> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(skey)) return null;
  const [rows]: any = await pool.execute(`SELECT * FROM canva_edit_sessions WHERE skey = ? LIMIT 1`, [skey]);
  const r = (rows as any[])[0];
  if (!r) return null;
  let locator: any = r.locator;
  if (typeof locator === "string") { try { locator = JSON.parse(locator); } catch { locator = null; } }
  return {
    skey: String(r.skey), actorId: Number(r.actorId), ownerId: Number(r.ownerId), brandId: Number(r.brandId),
    designId: String(r.designId), pageNo: Number(r.pageNo) || 1, title: String(r.title ?? ""),
    outputId: r.outputId == null ? null : Number(r.outputId),
    locator: locator && typeof locator === "object" ? locator as CanvaEditLocator : null,
    syncedUpdatedAt: Number(r.syncedUpdatedAt) || 0,
  };
}

/** 這個人能不能動這一篇（擁有者名下的產出）。 */
async function ownsOutput(ownerId: number, outputId: number, pool: Queryable): Promise<boolean> {
  const [rows]: any = await pool.execute(
    `SELECT o.id FROM mission_outputs o JOIN missions m ON m.id = o.missionId WHERE o.id = ? AND m.userId = ? LIMIT 1`,
    [outputId, ownerId],
  );
  return (rows as any[]).length > 0;
}

export interface StartCanvaEditArgs {
  accessToken: string;
  actorId: number; ownerId: number; brandId: number;
  /** 目前這一格的圖（沒有圖就開空白設計）。 */
  imageUrl?: string | null;
  /** 要寫回哪一篇的哪一格；從素材庫發起的不帶。 */
  outputId?: number | null;
  locator?: CanvaEditLocator | null;
  /** 開新設計用的尺寸與標題。 */
  width?: number; height?: number; title?: string;
}

interface Deps {
  pool?: Queryable;
  getDesign?: typeof getCanvaDesign;
  createDesign?: typeof createCanvaDesign;
  uploadAsset?: typeof uploadCanvaAsset;
  exportPng?: typeof exportCanvaDesignPng;
  fetchBytes?: (url: string) => Promise<Buffer>;
  store?: typeof storePhotoBytes;
  canWrite?: () => boolean;
  setOutputImage?: CanvaOutputWriter;
}

const defaultFetchBytes = async (url: string) =>
  (await fetchImageBuffer(url, { maxBytes: MAX_UPLOAD_BYTES, timeoutMs: 30_000 })).buffer;

/** 寫入類的呼叫被 Canva 以 403 擋下＝這位用戶連接時還沒有那個 scope，要重新連接才拿得到。 */
function asMissingScope(e: unknown): unknown {
  return e instanceof CanvaApiError && e.status === 403 ? new CanvaApiError("missing_scope", e.message, 403) : e;
}

/**
 * 開始一次來回：決定要開哪份設計（既有的／新開的），記一筆 session，回帶著鑰匙的編輯連結。
 */
export async function startCanvaEdit(args: StartCanvaEditArgs, deps: Deps = {}): Promise<{ editUrl: string; skey: string; created: boolean }> {
  const pool = deps.pool ?? localPool;
  const getDesign = deps.getDesign ?? getCanvaDesign;
  const createDesign = deps.createDesign ?? createCanvaDesign;
  const uploadAsset = deps.uploadAsset ?? uploadCanvaAsset;
  const fetchBytes = deps.fetchBytes ?? defaultFetchBytes;
  const canWrite = deps.canWrite ?? (() => canvaCanWrite());

  if (args.outputId != null && !(await ownsOutput(args.ownerId, args.outputId, pool))) {
    throw new CanvaApiError("output_not_found", "output not found");
  }

  const imageUrl = (args.imageUrl ?? "").trim();
  const ref = imageUrl ? await findCanvaRef(args.brandId, imageUrl, pool) : null;

  let design: CanvaDesignDetail;
  let pageNo = 1;
  let created = false;
  // 編輯連結只有當初匯入的那個人打得開——別人匯入的圖，對這位用戶來說等同「不是從 Canva 來的」。
  if (ref && ref.actorId === args.actorId) {
    design = await getDesign(args.accessToken, ref.designId);
    pageNo = ref.pageNo;
  } else {
    if (!canWrite()) throw new CanvaApiError("write_not_enabled", "creating designs is not enabled");
    try {
      let assetId: string | undefined;
      if (imageUrl) {
        const bytes = await fetchBytes(imageUrl);
        assetId = await uploadAsset(args.accessToken, { bytes, name: args.title || "onBrand" });
      }
      design = await createDesign(args.accessToken, {
        width: args.width ?? 1080, height: args.height ?? 1080, title: args.title, assetId,
      });
    } catch (e) { throw asMissingScope(e); }
    created = true;
  }

  const skey = newSessionKey();
  await pool.execute(
    `INSERT INTO canva_edit_sessions (skey, actorId, ownerId, brandId, designId, pageNo, title, outputId, locator, syncedUpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [skey, args.actorId, args.ownerId, args.brandId, design.id, pageNo, (design.title || args.title || "").slice(0, 255),
     args.outputId ?? null, args.locator ? JSON.stringify(args.locator) : null, design.updatedAt],
  );
  return { editUrl: withCorrelationState(design.editUrl, skey), skey, created };
}

export interface CanvaSyncResult {
  /** Canva 那邊有沒有比上次新——沒有就什麼都沒做。 */
  changed: boolean;
  photo: AssetPhoto | null;
  outputId: number | null;
  /** 圖抓回來了，但貼文那一格沒寫成功（那一篇被刪了）。圖仍在素材庫。 */
  outputUpdated: boolean;
}

/**
 * 回程：Canva 那邊改過就匯出那一頁、存進素材庫、寫回貼文。
 * 由兩個入口呼叫——Canva 的返回按鈕（/api/oauth/canva/return）與用戶切回分頁（assetPhoto.syncCanvaEdit）。
 */
export async function syncCanvaEdit(
  args: { skey: string; actorId: number; accessToken: string; storageRoot?: string }, deps: Deps = {},
): Promise<CanvaSyncResult> {
  const pool = deps.pool ?? localPool;
  const getDesign = deps.getDesign ?? getCanvaDesign;
  const exportPng = deps.exportPng ?? exportCanvaDesignPng;
  const fetchBytes = deps.fetchBytes ?? defaultFetchBytes;
  const store = deps.store ?? storePhotoBytes;

  const session = await loadSession(args.skey, pool);
  if (!session || session.actorId !== args.actorId) throw new CanvaApiError("session_not_found", "edit session not found");
  const none: CanvaSyncResult = { changed: false, photo: null, outputId: session.outputId, outputUpdated: false };

  const design = await getDesign(args.accessToken, session.designId);
  if (design.updatedAt <= session.syncedUpdatedAt) return none;

  // 先占住這一版：同一時間「返回按鈕」和「切回分頁」可能一起到，只讓一個去匯出。
  const [claim]: any = await pool.execute(
    `UPDATE canva_edit_sessions SET syncedUpdatedAt = ? WHERE skey = ? AND syncedUpdatedAt < ?`,
    [design.updatedAt, session.skey, design.updatedAt],
  );
  if (!Number(claim?.affectedRows)) return none;

  try {
    const pageNo = Math.min(session.pageNo, Math.max(1, design.pageCount || 1));
    const urls = await exportPng(args.accessToken, { designId: session.designId, pages: [pageNo] });
    const bytes = await fetchBytes(urls[0]!);
    const base = (design.title || session.title || "Canva").trim().slice(0, 80) || "Canva";
    const stored = await store({
      userId: session.ownerId, brandId: session.brandId, scope: "brand", scopeId: session.brandId,
      bytes, filename: `${base}.png`, storageRoot: args.storageRoot, uploadedBy: session.actorId,
    });
    if ("error" in stored) throw new CanvaApiError("store_failed", stored.error);
    await recordCanvaRef({ brandId: session.brandId, actorId: session.actorId, designId: session.designId, pageNo, photoUrl: stored.url }, pool);

    let outputUpdated = false;
    if (session.outputId != null && session.locator) {
      const setOutputImage = deps.setOutputImage ?? outputWriter;
      // 沒註冊＝組裝點漏接；圖已經進素材庫，只是沒寫回貼文——留紀錄，不讓整次同步失敗。
      if (!setOutputImage) console.error("[canva] output writer not registered — image saved to library only");
      else outputUpdated = await setOutputImage(
        { ownerId: session.ownerId, outputId: session.outputId, locator: session.locator, imageUrl: stored.url }, pool,
      );
    }
    return { changed: true, photo: stored, outputId: session.outputId, outputUpdated };
  } catch (e) {
    // 沒帶回來就把占位退掉，下一次回來還能再試。
    await pool.execute(
      `UPDATE canva_edit_sessions SET syncedUpdatedAt = ? WHERE skey = ? AND syncedUpdatedAt = ?`,
      [session.syncedUpdatedAt, session.skey, design.updatedAt],
    ).catch(() => {});
    throw e;
  }
}
