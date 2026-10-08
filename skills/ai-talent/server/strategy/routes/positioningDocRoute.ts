/**
 * positioningDocRoute — 上傳「用戶自己格式」的品牌／產品／活動定位文件。
 *
 * 2026-09-01 (CJ「讓用戶自己上傳自己格式的品牌定位、產品定位和活動定位…
 * 按照用戶有的內容呈現品牌定位，不一定要填完我們設定的題目」)。
 *
 * ── 這裡只做「如實讀出來」──────────────────────────────────────────────
 * 抽取器輸出的是文件本來的標題階層，不是我們的 10 個 segment。對映到
 * canonical 欄位是下一步（positioningDocRouter.propose，走 LLM 且要用戶
 * 確認）。順序反過來的話，用戶上傳完看到的會是我們的表格而不是他的文件。
 *
 * ── 為什麼全文不進 positioning JSON ────────────────────────────────────
 * buildBrandPrefix 在「每一次任務執行」都會 SELECT 這個欄位。把一份 120K
 * 字的品牌手冊塞進去，等於每跑一張卡就多讀一次它。所以：
 *   · 原檔 + 完整抽取結果 → 磁碟（storage/positioning-docs/…）
 *   · 只有輕量大綱（標題 + 字數）→ positioning._sourceDocs[]
 *   · 真正要餵進 prompt 的那幾千字 → 由 propose/apply 挑出來另存
 *
 * ── 為什麼是 express.raw 而不是 multipart ─────────────────────────────
 * 跟 reportTemplateRoute 同一個理由：全域 express.json 只吃 application/json，
 * binary content-type 會穿過去。內建 express.raw 收位元組就夠，不必為了單檔
 * 上傳引進 multer/busboy。
 *
 * 端點
 *   POST   /api/positioning-doc/upload   raw bytes（x-brand-id / x-scope / x-scope-id / x-filename）
 *   POST   /api/positioning-doc/paste    { brandId, scope, scopeId, title, text }
 *   GET    /api/positioning-doc/list?brandId=&scope=&scopeId=
 *   GET    /api/positioning-doc/doc?brandId=&scope=&scopeId=&docId=   完整抽取結果
 *   DELETE /api/positioning-doc/:brandId/:scope/:scopeId/:docId
 */
import { Router, type Request, type Response } from "express";
import express from "express";
import { jwtVerify } from "jose";
import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import { join, resolve, basename } from "path";
import { randomUUID } from "crypto";
import { OLE_MAGIC, docToText, pptToMarkdown, ocrPdf } from "./positioningDocOcrLegacy";
import { getJwtSecret } from "../../platform/core/env";
import localPool from "../../localDb";
import {
  type PositioningScope, type SourceDocSummary,
  loadPositioning, savePositioningDocs, sourceDocsOf,
  MAX_DOCS_PER_SCOPE,
} from "../core/positioning/positioningDocs";

export const positioningDocRouter = Router();

export const STORAGE_ROOT =
  process.env.POSITIONING_DOC_DIR ?? join(process.cwd(), "storage", "positioning-docs");
// 品牌手冊偶爾夾整本 CI 手冊的圖，40MB 是實務上界；抽取器只讀文字，圖不影響。
const MAX_BYTES = 40 * 1024 * 1024;
const EXTRACT_TIMEOUT_MS = 90_000;
const ALLOWED_EXT = [".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".pdf", ".md", ".markdown", ".txt", ".html", ".htm"];

// ── auth（與 reportTemplateRoute 同一套；express 路由不能丟 TRPCError）──
export async function userIdOf(req: Request): Promise<number | null> {
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
    `SELECT b.id
       FROM brands b
       LEFT JOIN brand_members bm ON bm.brandId = b.id AND bm.userId = ?
      WHERE b.id = ? AND (b.userId = ? OR bm.userId IS NOT NULL)
      LIMIT 1`,
    [userId, brandId, userId],
  );
  return Array.isArray(rows) && rows.length > 0;
}

/** 產品／活動要屬於「這個使用者有權限的品牌」（團隊成員建的也算），才能讀寫它的定位。 */
async function canAccessScope(
  userId: number, brandId: number, scope: PositioningScope, scopeId: number,
): Promise<boolean> {
  if (!(await canAccessBrand(userId, brandId))) return false;
  if (scope === "brand") return scopeId === brandId;
  const table = scope === "product" ? "products" : "events";
  const [rows]: any = await localPool.execute(
    `SELECT id FROM \`${table}\` WHERE id = ? AND (brandId = ? OR userId = ?) LIMIT 1`,
    [scopeId, brandId, userId],
  );
  return Array.isArray(rows) && rows.length > 0;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function safeName(input: string): string {
  // 客戶端用 encodeURIComponent 傳檔名（HTTP header 只能放 latin1），這裡要先解回來，
  // 否則中文檔名會變成 %E5%93... 再被清成一串底線。
  let raw = String(input || "positioning.txt");
  try { raw = decodeURIComponent(raw); } catch { /* 不是編碼過的就照用 */ }
  const base = basename(raw);
  const cleaned = base.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^\.+/, "");
  return (cleaned || "positioning").slice(0, 120);
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}

function scopeDir(scope: PositioningScope, scopeId: number): string {
  return join(STORAGE_ROOT, scope, String(scopeId));
}

function assertInsideStorage(p: string): void {
  const root = resolve(STORAGE_ROOT);
  if (!resolve(p).startsWith(root)) throw new Error("path escapes storage root");
}

/** 讀參數並做完整權限檢查；失敗時已經回過 response，呼叫端直接 return。 */
async function resolveScope(
  req: Request, res: Response,
  src: "query" | "body" | "headers" | "params",
): Promise<{ userId: number; brandId: number; scope: PositioningScope; scopeId: number } | null> {
  const callerId = await userIdOf(req);
  if (!callerId) { res.status(401).json({ error: "Unauthorized" }); return null; }

  const bag: any =
    src === "query" ? req.query
    : src === "body" ? (req.body ?? {})
    : src === "params" ? req.params
    : req.headers;
  const pick = (k: string) => String(bag[src === "headers" ? `x-${k}` : k] ?? "");

  const brandId = parseInt(pick("brand-id") || pick("brandId"), 10);
  const scopeRaw = (pick("scope") || "brand") as PositioningScope;
  if (!["brand", "product", "event"].includes(scopeRaw)) {
    res.status(400).json({ error: "scope must be brand | product | event" }); return null;
  }
  const scopeId = parseInt(pick("scope-id") || pick("scopeId") || String(brandId), 10);
  if (!Number.isFinite(brandId) || !Number.isFinite(scopeId)) {
    res.status(400).json({ error: "brandId / scopeId required" }); return null;
  }
  // A team member acts on the owner's rows: reading needs membership, changing
  // positioning documents needs the strategy permission (teamAccess.ts).
  const { actingUserForBrand } = await import("../../platform/core/teamAccess");
  const acting = await actingUserForBrand(callerId, brandId, req.method === "GET" ? "view" : "strategy");
  if (acting.denied) { res.status(403).json({ error: acting.denied }); return null; }
  const userId = acting.userId;
  if (!(await canAccessScope(userId, brandId, scopeRaw, scopeId))) {
    res.status(404).json({ error: "Not found" }); return null;
  }
  return { userId, brandId, scope: scopeRaw, scopeId };
}

/** 跑 python 抽取器。失敗要說出壞在哪 —— 靜靜回空結構比壞掉更糟。 */
/** 副檔名與檔頭對不上就早退，別讓抽取器去炸。回傳錯誤訊息，沒問題回 null。 */
export function checkFileHeader(ext: string, body: Buffer): string | null {
  if ([".docx", ".pptx", ".xlsx"].includes(ext) && !(body[0] === 0x50 && body[1] === 0x4b)) {
    return `${ext} 的 zip 檔頭不對 — 檔案可能損毀或副檔名寫錯`;
  }
  if ([".doc", ".ppt"].includes(ext) && !OLE_MAGIC.every((b, i) => body[i] === b)) {
    return `${ext} 的檔頭不對 — 檔案可能損毀、已加密，或其實是 .${ext === ".doc" ? "docx" : "pptx"}（請改副檔名）`;
  }
  if (ext === ".pdf" && body.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return "PDF 檔頭不對 — 檔案可能損毀或副檔名寫錯";
  }
  return null;
}

type ExtractedDoc = {
  name: string; kind: string; chars: number;
  sections: { level: number; heading: string; body: string }[]; text: string;
};

async function runExtractor(path: string): Promise<ExtractedDoc> {
  const script = join(process.cwd(), "scripts", "positioning", "extract_doc.py");
  let stdout: string;
  try {
    ({ stdout } = await promisify(execFile)(
      process.env.PYTHON_BIN ?? "python3",
      [script, path],
      { timeout: EXTRACT_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
    ));
  } catch (err: any) {
    // 抽取器逐檔回報錯誤時 exit 1，但 JSON 在 stdout；execFile 只會丟
    // 「Command failed: <指令>」，真正原因被吞掉。先撈 stdout，再退到 stderr。
    let reason = "";
    try { reason = JSON.parse(String(err?.stdout || "{}")).errors?.[0]?.error || ""; } catch { /* 不是 JSON */ }
    if (!reason) reason = String(err?.stderr || "").trim().split("\n").slice(-3).join(" ");
    throw new Error(reason || String(err?.message || err));
  }
  const parsed = JSON.parse(stdout);
  if (parsed.errors?.length) throw new Error(parsed.errors[0].error || "抽取失敗");
  const doc = parsed.docs?.[0];
  if (!doc) throw new Error("抽取器沒有回傳內容");
  return doc;
}

/** 純文字 → 暫存 .txt/.md → 同一支抽取器切段。kind 由呼叫端指定（pdf / doc / ppt）。 */
async function sectionFromText(srcPath: string, text: string, ext: ".txt" | ".md", kind: string): Promise<ExtractedDoc> {
  const tmp = srcPath.replace(/.[^.]+$/, "") + `.fromtext${ext}`;
  assertInsideStorage(tmp);
  await fs.writeFile(tmp, text, "utf-8");
  try {
    const doc = await runExtractor(tmp);
    return { ...doc, name: basename(srcPath), kind };
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

/** 機器沒有 pdftotext 時的 PDF 備援：純 JS 取字。 */
async function pdfTextWithoutPoppler(path: string): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await fs.readFile(path)));
  const { text: rawText } = await extractText(pdf, { mergePages: true });
  // 部分 PDF 的字型把常用字對到「康熙部首」區（⼼ ⼀ ⾷），肉眼一樣、字碼不同，
  // 會讓後面的比對與搜尋全部落空。pdftotext 會自動轉回來，這裡補上同樣的事。
  // 只轉部首區，不能整段 NFKC —— 那會把全形標點「，」變成半形「,」。
  return rawText.replace(/[⺀-⿟]/g, (c) => c.normalize("NFKC"));
}

const EMPTY_PDF = /一個字都沒有/;

export async function extractFile(path: string): Promise<ExtractedDoc> {
  if (/.doc$/i.test(path)) {
    const text = (await docToText(path)).trim();
    if (!text) throw new Error("這份 .doc 讀得到但一個字都沒有 — 可能是空白文件或只有圖片");
    return sectionFromText(path, text, ".txt", "doc");
  }
  if (/.ppt$/i.test(path)) {
    const md = (await pptToMarkdown(path)).trim();
    if (!md) throw new Error("這份 .ppt 讀得到但一個字都沒有 — 可能全是圖片（請改上傳 .pdf 讓系統做文字辨識）");
    return sectionFromText(path, md, ".md", "ppt");
  }

  let pdfFallbackText: string | null = null;
  try {
    return await runExtractor(path);
  } catch (err: any) {
    const msg = String(err?.message);
    if (!/.pdf$/i.test(path)) throw err;
    if (/pdftotext/.test(msg)) {
      pdfFallbackText = await pdfTextWithoutPoppler(path);
    } else if (!EMPTY_PDF.test(msg)) {
      throw err;
    }
  }

  // 走到這裡一定是 PDF：不是 pdftotext 缺席（已有備援文字），就是 pdftotext 回空＝掃描檔。
  if (pdfFallbackText?.trim()) return sectionFromText(path, pdfFallbackText, ".txt", "pdf");
  const ocr = (await ocrPdf(path)).trim();
  if (!ocr) throw new Error("PDF 沒有文字層，文字辨識（OCR）也認不出內容 — 請確認掃描清晰度，或改貼上文字");
  const doc = await sectionFromText(path, ocr, ".txt", "pdf");
  return { ...doc, kind: "pdf-ocr" };
}

/** 抽取結果落地：完整版進磁碟，輕量大綱進 positioning JSON。 */
async function registerDoc(args: {
  userId: number; scope: PositioningScope; scopeId: number;
  docId: string; fileName: string;
  doc: { kind: string; chars: number; sections: { level: number; heading: string; body: string }[]; text: string };
}): Promise<SourceDocSummary[]> {
  const dir = scopeDir(args.scope, args.scopeId);
  assertInsideStorage(dir);
  await fs.mkdir(dir, { recursive: true });
  const extractPath = join(dir, `${args.docId}.extract.json`);
  assertInsideStorage(extractPath);
  await fs.writeFile(extractPath, JSON.stringify(args.doc), "utf-8");

  const summary: SourceDocSummary = {
    id: args.docId,
    name: args.fileName,
    kind: args.doc.kind,
    chars: args.doc.chars,
    uploadedAt: new Date().toISOString(),
    outline: args.doc.sections.map((s) => ({
      level: s.level,
      heading: s.heading || "(無標題段落)",
      chars: s.body.length,
    })),
    appliedAt: null,
  };

  const pos = await loadPositioning(args.scope, args.scopeId, args.userId);
  const docs = [...sourceDocsOf(pos).filter((d) => d.id !== args.docId), summary];
  if (docs.length > MAX_DOCS_PER_SCOPE) docs.splice(0, docs.length - MAX_DOCS_PER_SCOPE);
  await savePositioningDocs(args.scope, args.scopeId, args.userId, docs);
  return docs;
}

// ── upload ───────────────────────────────────────────────────────────────────
positioningDocRouter.post(
  "/upload",
  express.raw({ type: () => true, limit: MAX_BYTES }),
  async (req: Request, res: Response) => {
    const ctx = await resolveScope(req, res, "headers");
    if (!ctx) return;

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "檔案是空的" }); return;
    }

    const fileName = safeName(String(req.headers["x-filename"] ?? "positioning.txt"));
    const ext = extOf(fileName);
    if (!ALLOWED_EXT.includes(ext)) {
      res.status(400).json({ error: `不支援 ${ext || "(無副檔名)"} — 可用 ${ALLOWED_EXT.join(" / ")}` });
      return;
    }
    const badHeader = checkFileHeader(ext, body);
    if (badHeader) { res.status(400).json({ error: badHeader }); return; }

    const docId = randomUUID();
    const dir = scopeDir(ctx.scope, ctx.scopeId);
    assertInsideStorage(dir);
    await fs.mkdir(dir, { recursive: true });
    const target = join(dir, `${docId}${ext}`);
    assertInsideStorage(target);
    await fs.writeFile(target, body);

    try {
      const doc = await extractFile(target);
      const docs = await registerDoc({ ...ctx, docId, fileName, doc });
      res.json({ ok: true, docId, docs });
    } catch (err: any) {
      // 抽不出來的檔就不該留著佔位 —— 使用者看到的清單必須等於可用的文件。
      await fs.unlink(target).catch(() => {});
      const msg = String(err?.stderr || err?.message || err).slice(0, 800);
      console.error("[positioning-doc/upload] extract failed:", msg);
      res.status(400).json({ error: "文件讀不出內容", detail: msg });
    }
  },
);

/** 回給卡片編輯器的文字上限——卡片本身只吃 600 字，多的只是讓人看得到差距。 */
const EXTRACT_TEXT_MAX_CHARS = 20_000;

// ── extract-text（只抽文字，不落地）──────────────────────────────────────────
// 2026-09-24（CJ「按下新增卡片時…內容可以打字或是直接上傳文件」）：自訂卡片的
// 編輯器需要「把一份檔案的文字倒進這張卡的內容欄」，但那**不是**上傳一份定位
// 文件——上傳文件會進 _sourceDocs、會出現在「我的定位文件」清單、會走 AI 對映
// 提案那一整套流程。一張卡片只是要那份檔案的純文字。
//
// 所以這條路只做三件事：存成暫存檔 → 跑同一支抽取器 → 刪掉暫存檔，回純文字。
// 刻意重用 extractFile()（不另寫解析），但刻意不呼叫 registerDoc()（不落地）。
positioningDocRouter.post(
  "/extract-text",
  express.raw({ type: () => true, limit: MAX_BYTES }),
  async (req: Request, res: Response) => {
    const ctx = await resolveScope(req, res, "headers");
    if (!ctx) return;

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "檔案是空的" }); return;
    }
    const fileName = safeName(String(req.headers["x-filename"] ?? "card.txt"));
    const ext = extOf(fileName);
    if (!ALLOWED_EXT.includes(ext)) {
      res.status(400).json({ error: `不支援 ${ext || "(無副檔名)"} — 可用 ${ALLOWED_EXT.join(" / ")}` });
      return;
    }
    const badHeader = checkFileHeader(ext, body);
    if (badHeader) { res.status(400).json({ error: badHeader }); return; }

    const dir = scopeDir(ctx.scope, ctx.scopeId);
    assertInsideStorage(dir);
    await fs.mkdir(dir, { recursive: true });
    const target = join(dir, `tmp-card-${randomUUID()}${ext}`);
    assertInsideStorage(target);
    await fs.writeFile(target, body);
    try {
      const doc = await extractFile(target);
      // 一張卡片只吃 600 字，整包回傳沒有意義（一份 PDF 可能上萬字）。
      // chars 回真實長度，前端才講得出「這份有 3,200 字，只帶入前 600 字」。
      res.json({ ok: true, name: fileName, chars: doc.chars, text: String(doc.text ?? "").slice(0, EXTRACT_TEXT_MAX_CHARS) });
    } catch (err: any) {
      const msg = String(err?.stderr || err?.message || err).slice(0, 800);
      console.error("[positioning-doc/extract-text] extract failed:", msg);
      res.status(400).json({ error: "文件讀不出內容", detail: msg });
    } finally {
      // 不管成功失敗都要刪——這條路的定義就是「不留檔」。
      await fs.unlink(target).catch(() => {});
    }
  },
);

// ── paste（沒有檔案，直接貼文字）─────────────────────────────────────────────
positioningDocRouter.post("/paste", express.json({ limit: "8mb" }), async (req, res) => {
  const ctx = await resolveScope(req, res, "body");
  if (!ctx) return;
  const text = String((req.body as any)?.text ?? "").trim();
  const title = safeName(String((req.body as any)?.title ?? "貼上的定位.txt"));
  if (text.length < 40) { res.status(400).json({ error: "內容太短，至少要 40 個字" }); return; }

  const docId = randomUUID();
  const dir = scopeDir(ctx.scope, ctx.scopeId);
  assertInsideStorage(dir);
  await fs.mkdir(dir, { recursive: true });
  // 走跟上傳檔一樣的抽取器，不另寫一條解析路徑 —— 兩條路徑會各自長歪。
  const target = join(dir, `${docId}.txt`);
  assertInsideStorage(target);
  await fs.writeFile(target, text, "utf-8");

  try {
    const doc = await extractFile(target);
    const docs = await registerDoc({
      ...ctx, docId,
      fileName: title.endsWith(".txt") ? title : `${title}.txt`,
      doc,
    });
    res.json({ ok: true, docId, docs });
  } catch (err: any) {
    await fs.unlink(target).catch(() => {});
    res.status(400).json({ error: "內容讀不出結構", detail: String(err?.message ?? err).slice(0, 500) });
  }
});

// ── list ─────────────────────────────────────────────────────────────────────
positioningDocRouter.get("/list", async (req, res) => {
  const ctx = await resolveScope(req, res, "query");
  if (!ctx) return;
  const pos = await loadPositioning(ctx.scope, ctx.scopeId, ctx.userId);
  res.json({ docs: sourceDocsOf(pos) });
});

// ── 單份完整抽取結果（含每段內文，前端要能照用戶自己的結構呈現）───────────────
positioningDocRouter.get("/doc", async (req, res) => {
  const ctx = await resolveScope(req, res, "query");
  if (!ctx) return;
  const docId = String(req.query.docId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(docId)) { res.status(400).json({ error: "bad docId" }); return; }
  const path = join(scopeDir(ctx.scope, ctx.scopeId), `${docId}.extract.json`);
  try {
    assertInsideStorage(path);
    res.json({ ok: true, doc: JSON.parse(await fs.readFile(path, "utf-8")) });
  } catch {
    res.status(404).json({ error: "找不到這份文件的抽取結果" });
  }
});

// ── delete ───────────────────────────────────────────────────────────────────
positioningDocRouter.delete("/:brandId/:scope/:scopeId/:docId", async (req, res) => {
  const ctx = await resolveScope(req, res, "params");
  if (!ctx) return;
  const docId = String(req.params.docId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(docId)) { res.status(400).json({ error: "bad docId" }); return; }

  const dir = scopeDir(ctx.scope, ctx.scopeId);
  for (const ext of [...ALLOWED_EXT, ".extract.json"]) {
    const p = join(dir, `${docId}${ext}`);
    try { assertInsideStorage(p); await fs.unlink(p); } catch { /* 刪兩次不算錯 */ }
  }
  const pos = await loadPositioning(ctx.scope, ctx.scopeId, ctx.userId);
  const docs = sourceDocsOf(pos).filter((d) => d.id !== docId);
  await savePositioningDocs(ctx.scope, ctx.scopeId, ctx.userId, docs);
  res.json({ ok: true, docs });
});
