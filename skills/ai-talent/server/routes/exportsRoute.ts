/**
 * exportsRoute.ts — Mission Exports API
 * GET /api/exports?brandId={brandId}   — 取得該品牌所有產出列表
 */

import { Router, type Request, type Response } from "express";
import { jwtVerify } from "jose";
import { getJwtSecret } from "../_core/env";
import mysql from "mysql2/promise";

export const exportsRouter = Router();

// ── mos_db Pool ───────────────────────────────────────────────────────────────
let _pool: mysql.Pool | null = null;
function getPool(): mysql.Pool {
  if (!_pool) {
    _pool = mysql.createPool({
      host:     process.env.LOCAL_DB_HOST     || "localhost",
      user:     process.env.LOCAL_DB_USER     || "mos_user",
      password: process.env.LOCAL_DB_PASSWORD || "mos_secure_2026",
      database: process.env.LOCAL_DB_NAME     || "mos_db",
      connectionLimit: 5,
    });
  }
  return _pool;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function verifyToken(req: Request): Promise<number | null> {
  // Support both Bearer token (old) and Cookie session (new)
  const auth = req.headers.authorization;
  let raw: string | null = null;
  if (auth?.startsWith("Bearer ")) {
    raw = auth.slice(7);
  } else if ((req as any).cookies?.session) {
    raw = (req as any).cookies.session;
  }
  if (!raw) return null;
  try {
    const secret = new TextEncoder().encode(getJwtSecret());
    const { payload } = await jwtVerify(raw, secret);
    return payload.sub ? parseInt(String(payload.sub), 10) : null;
  } catch { return null; }
}

// ── GET /api/exports ──────────────────────────────────────────────────────────
exportsRouter.get("/", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const brandId = req.query.brandId ? parseInt(String(req.query.brandId), 10) : null;
  const missionId = req.query.missionId ? parseInt(String(req.query.missionId), 10) : null;

  if (!brandId && !missionId) {
    res.status(400).json({ error: "brandId or missionId required" });
    return;
  }

  try {
    const pool = getPool();
    let query = `SELECT id, brand_id, mission_id, export_type, title, file_path, file_size, created_at
                 FROM mission_exports WHERE 1=1`;
    const params: any[] = [];

    if (brandId) { query += " AND brand_id = ?"; params.push(brandId); }
    if (missionId) { query += " AND mission_id = ?"; params.push(missionId); }
    query += " ORDER BY created_at DESC LIMIT 100";

    const [rows] = await pool.execute(query, params) as any[];

    const exports = (rows as any[]).map(row => ({
      id: row.id,
      brandId: row.brand_id,
      missionId: row.mission_id,
      type: row.export_type,
      title: row.title,
      filePath: row.file_path,
      fileSize: row.file_size,
      createdAt: row.created_at ? new Date(row.created_at).toISOString().split("T")[0] : null,
    }));

    res.json({ exports });
  } catch (err: any) {
    console.error("[exportsRoute] GET error:", err?.message);
    res.status(500).json({ error: err?.message });
  }
});

// ── Internal helper: record an export ────────────────────────────────────────
export async function recordMissionExport(params: {
  brandId: number;
  missionId: number;
  exportType?: "pptx" | "pdf" | "markdown" | "text";
  title: string;
  filePath?: string;
  fileSize?: number;
}): Promise<number> {
  try {
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO mission_exports (brand_id, mission_id, export_type, title, file_path, file_size)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        params.brandId,
        params.missionId,
        params.exportType ?? "pptx",
        params.title,
        params.filePath ?? null,
        params.fileSize ?? null,
      ]
    ) as any[];
    const insertId = (result as any).insertId;
    console.log(`[exportsRoute] recorded export id=${insertId} missionId=${params.missionId}`);
    return insertId;
  } catch (err: any) {
    console.error("[exportsRoute] recordMissionExport error:", err?.message);
    return 0;
  }
}
