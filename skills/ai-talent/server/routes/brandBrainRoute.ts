/**
 * brandBrainRoute.ts — Brand Brain API
 * GET    /api/brand-brain/:brandId    — 取得該品牌所有 brain entries（依 category 分組）
 * POST   /api/brand-brain/:brandId    — 新增一筆 brain entry
 * PUT    /api/brand-brain/entry/:id   — 更新一筆 entry
 * DELETE /api/brand-brain/entry/:id   — 刪除一筆 entry
 */

import { Router, type Request, type Response } from "express";
import { jwtVerify } from "jose";
import { getJwtSecret } from "../_core/env";
import localPool from "../localDb";

export const brandBrainRouter = Router();

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

// ── GET /api/brand-brain/:brandId ─────────────────────────────────────────────
brandBrainRouter.get("/:brandId", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const brandId = parseInt(req.params.brandId ?? "0", 10);
  if (!brandId) { res.status(400).json({ error: "Invalid brandId" }); return; }

  try {
    const [rows] = await localPool.execute(
      `SELECT id, brand_id, category, title, content, source_mission_id, created_at, updated_at
       FROM brand_brain
       WHERE brand_id = ?
       ORDER BY category, updated_at DESC`,
      [brandId]
    ) as any[];

    const entries: Record<string, any[]> = {
      positioning: [],
      audience: [],
      voice: [],
      competitors: [],
      custom: [],
    };

    for (const row of rows as any[]) {
      const cat = row.category as string;
      if (entries[cat]) {
        entries[cat].push({
          id: row.id,
          title: row.title,
          content: row.content,
          sourceMissionId: row.source_mission_id,
          updatedAt: row.updated_at,
        });
      }
    }

    res.json({ brandId, entries });
  } catch (err: any) {
    console.error("[brandBrainRoute] GET error:", err?.message);
    res.status(500).json({ error: err?.message ?? "伺服器錯誤" });
  }
});

// ── POST /api/brand-brain/:brandId ────────────────────────────────────────────
brandBrainRouter.post("/:brandId", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const brandId = parseInt(req.params.brandId ?? "0", 10);
  if (!brandId) { res.status(400).json({ error: "Invalid brandId" }); return; }

  const { category, title, content, sourceMissionId } = req.body as {
    category: string;
    title: string;
    content: string;
    sourceMissionId?: number;
  };

  const validCategories = ["positioning", "audience", "voice", "competitors", "custom"];
  if (!validCategories.includes(category)) {
    res.status(400).json({ error: "Invalid category. Must be one of: " + validCategories.join(", ") });
    return;
  }
  if (!title || !content) {
    res.status(400).json({ error: "title and content required" });
    return;
  }

  try {
    const [result] = await localPool.execute(
      `INSERT INTO brand_brain (brand_id, category, title, content, source_mission_id)
       VALUES (?, ?, ?, ?, ?)`,
      [brandId, category, title, content, sourceMissionId ?? null]
    ) as any[];

    res.status(201).json({
      ok: true,
      id: (result as any).insertId,
      brandId,
      category,
      title,
    });
  } catch (err: any) {
    console.error("[brandBrainRoute] POST error:", err?.message);
    res.status(500).json({ error: err?.message ?? "伺服器錯誤" });
  }
});

// ── PUT /api/brand-brain/entry/:id ────────────────────────────────────────────
brandBrainRouter.put("/entry/:id", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id ?? "0", 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const { title, content, category } = req.body as {
    title?: string;
    content?: string;
    category?: string;
  };

  if (!title && !content && !category) {
    res.status(400).json({ error: "At least one of title, content, category required" });
    return;
  }

  try {
    const updates: string[] = [];
    const values: any[] = [];

    if (title) { updates.push("title = ?"); values.push(title); }
    if (content) { updates.push("content = ?"); values.push(content); }
    if (category) {
      const validCategories = ["positioning", "audience", "voice", "competitors", "custom"];
      if (!validCategories.includes(category)) {
        res.status(400).json({ error: "Invalid category" });
        return;
      }
      updates.push("category = ?");
      values.push(category);
    }

    values.push(id);
    const [result] = await localPool.execute(
      `UPDATE brand_brain SET ${updates.join(", ")}, updated_at = NOW() WHERE id = ?`,
      values
    ) as any[];

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }

    res.json({ ok: true, id });
  } catch (err: any) {
    console.error("[brandBrainRoute] PUT error:", err?.message);
    res.status(500).json({ error: err?.message ?? "伺服器錯誤" });
  }
});

// ── DELETE /api/brand-brain/entry/:id ─────────────────────────────────────────
brandBrainRouter.delete("/entry/:id", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id ?? "0", 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [result] = await localPool.execute(
      `DELETE FROM brand_brain WHERE id = ?`,
      [id]
    ) as any[];

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }

    res.json({ ok: true, id });
  } catch (err: any) {
    console.error("[brandBrainRoute] DELETE error:", err?.message);
    res.status(500).json({ error: err?.message ?? "伺服器錯誤" });
  }
});

// ── Internal helper: auto-write from positioning flow ─────────────────────────
export async function writeBrandBrainEntry(params: {
  brandId: number;
  category: "positioning" | "audience" | "voice" | "competitors" | "custom";
  title: string;
  content: string;
  sourceMissionId?: number;
}): Promise<void> {
  try {
    await localPool.execute(
      `INSERT INTO brand_brain (brand_id, category, title, content, source_mission_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content), updated_at = NOW()`,
      [params.brandId, params.category, params.title, params.content, params.sourceMissionId ?? null]
    );
    console.log(`[brandBrain] wrote entry: brandId=${params.brandId} category=${params.category}`);
  } catch (err: any) {
    console.error("[brandBrain] writeBrandBrainEntry error:", err?.message);
  }
}
