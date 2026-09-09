/**
 * assetPhotoRoute — 收上傳的品牌／產品照片位元組。
 *
 * 2026-09-10 (CJ「允許用戶上傳照片到品牌或個別產品」)。跟 positioningDocRoute.ts
 * 同一套理由用 express.raw 而不是 multipart：全域 express.json 只吃
 * application/json，binary content-type 會穿過去，內建 express.raw 收位元組
 * 就夠，不必為了單檔上傳引進 multer/busboy。
 *
 * list／setPrimary／remove 走 tRPC（assetPhotoRouter.ts）——只有「收位元組」
 * 這一步不能走 tRPC，其餘沒有理由不用 tRPC 的快取與型別。
 *
 * 端點
 *   POST /api/asset-photo/upload   raw bytes（x-brand-id / x-scope / x-scope-id / x-filename）
 */
import { Router, type Request, type Response } from "express";
import express from "express";
import { jwtVerify } from "jose";
import { join, resolve } from "path";
import { promises as fs } from "fs";
import { getJwtSecret } from "../../platform/core/env";
import localPool from "../../localDb";
import {
  type PhotoScope, MAX_UPLOAD_BYTES, MAX_PHOTOS_PER_SCOPE,
  validateUploadedImage, extForMime, insertPhoto, listPhotos,
} from "../core/assetPhotos";

export const assetPhotoRouter = Router();

export const STORAGE_ROOT =
  process.env.ASSET_PHOTO_DIR ?? join(process.cwd(), "storage", "asset-photos");
const URL_PREFIX = process.env.ASSET_PHOTO_URL_PREFIX ?? "/static/asset-photos";

// ── auth（與 positioningDocRoute 同一套；express 路由不能丟 TRPCError）──
async function userIdOf(req: Request): Promise<number | null> {
  const auth = req.headers.authorization;
  const raw = auth?.startsWith("Bearer ")
    ? auth.slice(7)
    : ((req as any).cookies?.session as string | undefined) ?? null;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, new TextEncoder().encode(getJwtSecret()));
    return payload.sub ? parseInt(String(payload.sub), 10) : null;
  } catch {
    return null;
  }
}

async function canAccessBrand(userId: number, brandId: number): Promise<boolean> {
  const [rows]: any = await localPool.execute(
    `SELECT b.id FROM brands b
       LEFT JOIN brand_members bm ON bm.brandId = b.id AND bm.userId = ?
      WHERE b.id = ? AND (b.userId = ? OR bm.userId IS NOT NULL) LIMIT 1`,
    [userId, brandId, userId],
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function canAccessScope(userId: number, brandId: number, scope: PhotoScope, scopeId: number): Promise<boolean> {
  if (!(await canAccessBrand(userId, brandId))) return false;
  if (scope === "brand") return scopeId === brandId;
  const [rows]: any = await localPool.execute(
    `SELECT id FROM products WHERE id = ? AND userId = ? LIMIT 1`, [scopeId, userId],
  );
  return Array.isArray(rows) && rows.length > 0;
}

function assertInsideStorage(p: string): void {
  const root = resolve(STORAGE_ROOT);
  if (!resolve(p).startsWith(root)) throw new Error("path escapes storage root");
}

function safeFilename(input: string): string {
  const cleaned = String(input || "photo").replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^\.+/, "");
  return (cleaned || "photo").slice(0, 120);
}

assetPhotoRouter.post(
  "/upload",
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES + 1024 }),
  async (req: Request, res: Response) => {
    const userId = await userIdOf(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const brandId = parseInt(String(req.headers["x-brand-id"] ?? ""), 10);
    const scope = String(req.headers["x-scope"] ?? "") as PhotoScope;
    const scopeId = parseInt(String(req.headers["x-scope-id"] ?? ""), 10);
    if (!["brand", "product"].includes(scope)) { res.status(400).json({ error: "scope must be brand | product" }); return; }
    if (!Number.isFinite(brandId) || !Number.isFinite(scopeId)) { res.status(400).json({ error: "brandId / scopeId required" }); return; }
    if (!(await canAccessScope(userId, brandId, scope, scopeId))) { res.status(404).json({ error: "Not found" }); return; }

    const existing = await listPhotos(scope, scopeId);
    if (existing.length >= MAX_PHOTOS_PER_SCOPE) {
      res.status(400).json({ error: `這個${scope === "brand" ? "品牌" : "產品"}已經有 ${MAX_PHOTOS_PER_SCOPE} 張照片，先刪掉幾張再上傳` });
      return;
    }

    const body = req.body as Buffer;
    const check = validateUploadedImage(Buffer.isBuffer(body) ? body : Buffer.alloc(0));
    if ("error" in check) { res.status(400).json({ error: check.error }); return; }

    const ext = extForMime(check.mime);
    const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const dir = join(STORAGE_ROOT, scope, String(scopeId));
    assertInsideStorage(dir);
    await fs.mkdir(dir, { recursive: true });
    const target = join(dir, fileId);
    assertInsideStorage(target);
    await fs.writeFile(target, body);

    const url = `${URL_PREFIX}/${scope}/${scopeId}/${fileId}`;
    const filename = safeFilename(String(req.headers["x-filename"] ?? fileId));
    const photo = await insertPhoto({
      userId, brandId, scope, scopeId, url, filename,
      mimeType: check.mime, sizeBytes: body.length,
    });
    res.json({ ok: true, photo });
  },
);
