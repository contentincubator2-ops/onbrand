/**
 * reportTemplateRoute — 粉絲團月報：上傳既有版型，跨月分析出「版型體檢報告」。
 *
 * 產品主張是「自動化的終點是你的檔案，不是我們的儀表板」：使用者上傳自己已經在用
 * 的月報 .pptx（越多個月越準），我們解析出可自動填的欄位，並把跨月比對的發現回報
 * 給他 —— 哪些位置每月都固定（可自動化）、哪些項目數會浮動、哪句洞察只有幾個字的
 * 空間。之後才談把資料填回去。
 *
 * 為什麼是 express.raw 而不是 multipart：
 *   月報動輒 50–90MB，全域的 express.json 上限是 50mb 且只吃 application/json，
 *   binary content-type 會直接穿過。用內建的 express.raw 收位元組就夠了，不必為
 *   了單檔上傳引入 multer/busboy 這種新依賴。
 *
 * 端點
 *   POST   /api/report-template/upload    raw pptx bytes（x-brand-id / x-filename）
 *   GET    /api/report-template/list?brandId=
 *   POST   /api/report-template/analyze   { brandId } → 解析＋體檢報告
 *   DELETE /api/report-template/:brandId/:name
 */
import { Router, type Request, type Response } from "express";
import express from "express";
import { jwtVerify } from "jose";
import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import { join, resolve, basename } from "path";
import { getJwtSecret } from "../_core/env";
import localPool from "../localDb";

export const reportTemplateRouter = Router();

const STORAGE_ROOT =
  process.env.REPORT_TEMPLATE_DIR ?? join(process.cwd(), "storage", "report-templates");
const MAX_BYTES = 150 * 1024 * 1024;         // 五感十築 6 月份是 58MB，留足餘裕
const MAX_DECKS_PER_BRAND = 24;
const PARSE_TIMEOUT_MS = 5 * 60 * 1000;

// ── auth ─────────────────────────────────────────────────────────────────────
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

/**
 * 與 _core/brandAuth.assertBrandAccess 同一條 SQL 的布林版本 —— 那支丟 TRPCError，
 * 在 express 路由裡不能用。擁有者或 brand_members 成員都算有權。
 */
async function canAccessBrand(userId: number, brandId: number): Promise<boolean> {
  const [rows]: any = await localPool.execute(
    `SELECT b.id
       FROM brands b
       LEFT JOIN brand_members bm ON bm.brandId = b.id AND bm.userId = ?
      WHERE b.id = ? AND (b.userId = ? OR bm.userId IS NOT NULL)
      LIMIT 1`,
    [userId, brandId, userId],
  );
  return Array.isArray(rows) && rows.length > 0;
}

// ── helpers ──────────────────────────────────────────────────────────────────
/** 檔名只保留安全字元；路徑穿越（../）在這裡就被切掉。 */
function safeName(input: string): string {
  const base = basename(String(input || "template.pptx"));
  const cleaned = base.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^\.+/, "");
  return (cleaned || "template").slice(0, 120);
}

function brandDir(brandId: number): string {
  return join(STORAGE_ROOT, String(brandId));
}

/** 解析後的目錄一律回到 STORAGE_ROOT 底下，否則拒絕。 */
function assertInsideStorage(p: string): void {
  const root = resolve(STORAGE_ROOT);
  if (!resolve(p).startsWith(root)) throw new Error("path escapes storage root");
}

async function listDecks(brandId: number) {
  const dir = brandDir(brandId);
  try {
    const names = await fs.readdir(dir);
    const out = [];
    for (const n of names) {
      if (!n.toLowerCase().endsWith(".pptx")) continue;
      const st = await fs.stat(join(dir, n));
      out.push({ name: n, bytes: st.size, uploadedAt: st.mtime.toISOString() });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

// ── upload ───────────────────────────────────────────────────────────────────
reportTemplateRouter.post(
  "/upload",
  express.raw({ type: () => true, limit: MAX_BYTES }),
  async (req: Request, res: Response) => {
    const userId = await userIdOf(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const brandId = parseInt(String(req.headers["x-brand-id"] ?? ""), 10);
    if (!Number.isFinite(brandId)) { res.status(400).json({ error: "x-brand-id required" }); return; }
    if (!(await canAccessBrand(userId, brandId))) { res.status(404).json({ error: "Brand not found" }); return; }

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "empty body" }); return;
    }
    // .pptx 是 zip；magic bytes 對不上就不是簡報檔，早退比讓 Python 去炸好。
    if (!(body[0] === 0x50 && body[1] === 0x4b)) {
      res.status(400).json({ error: "not a .pptx (zip signature missing)" }); return;
    }

    const existing = await listDecks(brandId);
    if (existing.length >= MAX_DECKS_PER_BRAND) {
      res.status(400).json({ error: `每個品牌最多保留 ${MAX_DECKS_PER_BRAND} 份版型` }); return;
    }

    let name = safeName(String(req.headers["x-filename"] ?? "template.pptx"));
    if (!name.toLowerCase().endsWith(".pptx")) name += ".pptx";
    const dir = brandDir(brandId);
    assertInsideStorage(dir);
    await fs.mkdir(dir, { recursive: true });

    const target = join(dir, name);
    assertInsideStorage(target);
    await fs.writeFile(target, body);

    res.json({ ok: true, name, bytes: body.length, decks: await listDecks(brandId) });
  },
);

// ── list ─────────────────────────────────────────────────────────────────────
reportTemplateRouter.get("/list", async (req: Request, res: Response) => {
  const userId = await userIdOf(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const brandId = parseInt(String(req.query.brandId ?? ""), 10);
  if (!Number.isFinite(brandId)) { res.status(400).json({ error: "brandId required" }); return; }
  if (!(await canAccessBrand(userId, brandId))) { res.status(404).json({ error: "Brand not found" }); return; }
  res.json({ decks: await listDecks(brandId) });
});

// ── delete ───────────────────────────────────────────────────────────────────
reportTemplateRouter.delete("/:brandId/:name", async (req: Request, res: Response) => {
  const userId = await userIdOf(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const brandId = parseInt(String(req.params.brandId ?? ""), 10);
  if (!Number.isFinite(brandId)) { res.status(400).json({ error: "bad brandId" }); return; }
  if (!(await canAccessBrand(userId, brandId))) { res.status(404).json({ error: "Brand not found" }); return; }

  const target = join(brandDir(brandId), safeName(String(req.params.name ?? "")));
  try {
    assertInsideStorage(target);
    await fs.unlink(target);
  } catch { /* already gone — deleting twice is not an error worth surfacing */ }
  res.json({ ok: true, decks: await listDecks(brandId) });
});

// ── analyze ──────────────────────────────────────────────────────────────────
reportTemplateRouter.post("/analyze", async (req: Request, res: Response) => {
  const userId = await userIdOf(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const brandId = parseInt(String((req.body as any)?.brandId ?? ""), 10);
  if (!Number.isFinite(brandId)) { res.status(400).json({ error: "brandId required" }); return; }
  if (!(await canAccessBrand(userId, brandId))) { res.status(404).json({ error: "Brand not found" }); return; }

  const decks = await listDecks(brandId);
  if (decks.length === 0) { res.status(400).json({ error: "尚未上傳任何版型" }); return; }

  const script = join(process.cwd(), "scripts", "report", "parse_template.py");
  const files = decks.map(d => join(brandDir(brandId), d.name));
  files.forEach(assertInsideStorage);

  try {
    const { stdout, stderr } = await promisify(execFile)(
      "python3",
      [script, ...files],
      { timeout: PARSE_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
    );
    if (stderr?.trim()) console.warn("[report-template/analyze] stderr:", stderr.slice(0, 800));
    const parsed = JSON.parse(stdout);
    res.json({ ok: true, deckCount: decks.length, ...parsed });
  } catch (err: any) {
    // 解析失敗要說出是哪一步壞掉 —— 靜靜回一份空報告比壞掉更糟。
    const msg = String(err?.stderr || err?.message || err).slice(0, 1200);
    console.error("[report-template/analyze] failed:", msg);
    res.status(500).json({ error: "版型解析失敗", detail: msg });
  }
});
