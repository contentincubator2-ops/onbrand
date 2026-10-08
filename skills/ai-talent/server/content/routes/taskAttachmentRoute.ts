/**
 * taskAttachmentRoute — 任務卡上傳素材：檔案進來 → 解析成文字 → 原檔刪掉。
 *
 * 2026-10-08（CJ「在任務卡的時候，讓用戶可以上傳檔案，包括影片、word、excel、圖片…
 * 解析後按照 skill 寫文章」）。文字怎麼進指令見 core/catalog/taskAttachments.ts。
 *
 * ── 為什麼分段上傳 ─────────────────────────────────────────────────────
 * nginx 的 client_max_body_size 是 25MB（admin-nginx-tune-onbrand-v2.yml）。一支手機
 * 拍的一分鐘影片就超過了，整檔 POST 會在進到 node 之前被 413。所以畫面把檔案切成
 * 8MB 一段依序送，這裡接在同一個暫存檔後面；小檔就是只有一段。
 *
 * ── 為什麼解析是背景工作＋輪詢 ─────────────────────────────────────────
 * 一支十分鐘的影片要抽聲音、轉逐字稿、看畫面，會超過一次請求該等的時間。最後一段
 * 收齊就回「解析中」，畫面輪詢 status。工作表放記憶體（pm2 單一行程 fork 模式）；
 * 行程重啟會掉，畫面看到 404 就請使用者重傳——比為了幾分鐘的暫存狀態開一張表划算。
 *
 * ── 不留檔 ─────────────────────────────────────────────────────────────
 * 解析完（或失敗、或逾時沒傳完）原檔與中間產物一律刪掉。結果文字只在記憶體放到被
 * 取走後 30 分鐘。dev VM 磁碟滿過一次（2026-09-22），這裡不製造新的累積點。
 *
 * 端點
 *   POST   /api/task-attachment/chunk         raw bytes（x-upload-id / x-chunk-index /
 *                                             x-chunk-total / x-filename / x-file-size）
 *   GET    /api/task-attachment/status/:id
 *   DELETE /api/task-attachment/:id
 */
import { Router, type Request, type Response } from "express";
import express from "express";
import { promises as fs } from "fs";
import { join } from "path";
import {
  STORAGE_ROOT, userIdOf, extractFile, checkFileHeader,
} from "../../strategy/routes/positioningDocRoute";
import {
  type AttachmentKind, attachmentKindOf, extOfName,
  ATTACHMENT_EXTS, ATTACHMENT_MAX_BYTES, ATTACHMENT_TEXT_MAX,
} from "../core/catalog/taskAttachments";
import { imageToText, avToText, type MediaStage } from "../../platform/core/media/mediaToText";

export const taskAttachmentRouter = Router();

const TMP_DIR = join(STORAGE_ROOT, "_task-attachments");
/** 畫面一段切 8MB；這裡留一點餘裕。 */
const CHUNK_LIMIT = 10 * 1024 * 1024;
const MAX_ACTIVE_PER_USER = 3;
const JOB_TTL_MS = 30 * 60_000;
const PARSE_TIMEOUT_MS = 8 * 60_000;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Stage = "reading" | MediaStage;
interface Job {
  id: string;
  userId: number;
  name: string;
  ext: string;
  kind: AttachmentKind;
  size: number;
  total: number;
  nextIndex: number;
  received: number;
  status: "uploading" | "processing" | "done" | "error";
  stage: Stage | null;
  result: { name: string; kind: AttachmentKind; chars: number; text: string; truncated: boolean } | null;
  error: string | null;
  touchedAt: number;
  abort: AbortController;
}

const jobs = new Map<string, Job>();

const pathOf = (job: Job) => join(TMP_DIR, `${job.id}${job.ext}`);

/** 這份上傳的原檔與所有中間產物（聲音、畫面、抽取器的暫存文字）都以 id 開頭。 */
async function removeFiles(id: string): Promise<void> {
  const names = await fs.readdir(TMP_DIR).catch(() => [] as string[]);
  await Promise.all(names.filter((n) => n.startsWith(id)).map((n) => fs.unlink(join(TMP_DIR, n)).catch(() => {})));
}

function dropJob(job: Job): void {
  job.abort.abort();
  jobs.delete(job.id);
  void removeFiles(job.id);
}

setInterval(() => {
  const now = Date.now();
  for (const job of jobs.values()) if (now - job.touchedAt > JOB_TTL_MS) dropJob(job);
}, 5 * 60_000).unref();

// 行程上次沒收乾淨的暫存檔（重啟時工作表已經不在了，沒有人會再來清）。
void fs.readdir(TMP_DIR).then(
  (names) => Promise.all(names.map((n) => fs.unlink(join(TMP_DIR, n)).catch(() => {}))),
  () => {},
);

function decodeName(raw: unknown): string {
  let name = String(raw ?? "");
  try { name = decodeURIComponent(name); } catch { /* 沒編碼就照用 */ }
  return name.replace(/[\\/\u0000-\u001f]+/g, "_").trim().slice(0, 200);
}

const PLAIN_TEXT_EXT = [".csv", ".txt", ".md", ".markdown"];
/** 純文字只讀開頭這麼多——12,000 個中文字約 36KB，256KB 綽綽有餘。 */
const PLAIN_TEXT_READ_BYTES = 256 * 1024;

/**
 * 位元組 → 文字。Excel 另存的 CSV、記事本存的 .txt 常見是 Big5；UTF-8 解不乾淨就換 Big5，
 * 不留一堆 �。只讀開頭一段時結尾可能切在一個字的中間，所以先退掉最後幾個位元組再嚴格解。
 */
function decodeText(buf: Buffer): string {
  for (let trim = 0; trim <= 3; trim++) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buf.subarray(0, buf.length - trim)).replace(/^﻿/, "");
    } catch { /* 再退一個位元組 */ }
  }
  try { return new TextDecoder("big5").decode(buf); } catch { return buf.toString("utf-8"); }
}

/** 給使用者看的失敗原因：不帶伺服器路徑與指令列。 */
export function publicError(err: any): string {
  const raw = String(err?.stderr || err?.message || err).trim();
  if (/All LLM providers failed|LLM invoke failed|transcription HTTP/.test(raw)) {
    return "AI 暫時讀不了這個檔案，請稍後再試一次";
  }
  if (/^Command failed|^spawn |ETIMEDOUT|ENOENT|[A-Za-z]:\\|\/opt\/|\/home\/|\/tmp\//.test(raw)) {
    return "這份檔案讀不出內容——可能太大、格式有問題，或解析逾時";
  }
  return raw.slice(0, 300) || "這份檔案讀不出內容";
}

async function parse(job: Job): Promise<string> {
  const path = pathOf(job);
  if (job.kind === "image") {
    job.stage = "viewing";
    return imageToText(await fs.readFile(path), job.abort.signal);
  }
  if (job.kind === "video" || job.kind === "audio") {
    return avToText({
      path, name: job.name, isVideo: job.kind === "video",
      tmpPrefix: join(TMP_DIR, job.id),
      onStage: (s) => { job.stage = s; },
      signal: job.abort.signal,
    });
  }
  job.stage = "reading";
  // 純文字不必過抽取器（它要切標題階層，20MB 的 .txt 實測會跑到逾時）。只留得下
  // ATTACHMENT_TEXT_MAX 個字，讀開頭一段就夠。
  if (PLAIN_TEXT_EXT.includes(job.ext)) {
    const buf = Buffer.alloc(Math.min(job.size, PLAIN_TEXT_READ_BYTES));
    const fh = await fs.open(path, "r");
    try { await fh.read(buf, 0, buf.length, 0); } finally { await fh.close(); }
    return decodeText(buf);
  }
  const head = Buffer.alloc(8);
  const fh = await fs.open(path, "r");
  try { await fh.read(head, 0, 8, 0); } finally { await fh.close(); }
  const badHeader = checkFileHeader(job.ext, head);
  if (badHeader) throw new Error(badHeader);
  return String((await extractFile(path)).text ?? "");
}

async function runJob(job: Job): Promise<void> {
  job.status = "processing";
  const timer = setTimeout(() => job.abort.abort(), PARSE_TIMEOUT_MS);
  try {
    const text = (await Promise.race([
      parse(job),
      new Promise<never>((_, reject) => job.abort.signal.addEventListener("abort", () => reject(new Error("解析太久，已停止——請換短一點的檔案再試")))),
    ])).trim();
    if (!text) throw new Error("這份檔案讀不出內容");
    job.result = {
      name: job.name, kind: job.kind, chars: text.length,
      text: text.slice(0, ATTACHMENT_TEXT_MAX), truncated: text.length > ATTACHMENT_TEXT_MAX,
    };
    job.status = "done";
  } catch (err: any) {
    job.error = publicError(err);
    job.status = "error";
    console.error(`[task-attachment] parse failed (${job.kind} ${job.ext}):`, String(err?.stderr || err?.message || err).slice(0, 600));
  } finally {
    clearTimeout(timer);
    job.stage = null;
    job.touchedAt = Date.now();
    await removeFiles(job.id);
  }
}

function view(job: Job) {
  return {
    id: job.id, status: job.status, stage: job.stage,
    received: job.received, size: job.size,
    result: job.status === "done" ? job.result : null,
    error: job.status === "error" ? job.error : null,
  };
}

// ── chunk ────────────────────────────────────────────────────────────────────
taskAttachmentRouter.post(
  "/chunk",
  express.raw({ type: () => true, limit: CHUNK_LIMIT }),
  async (req: Request, res: Response) => {
    const userId = await userIdOf(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = String(req.headers["x-upload-id"] ?? "");
    const index = parseInt(String(req.headers["x-chunk-index"] ?? ""), 10);
    const body = req.body as Buffer;
    if (!ID_RE.test(id) || !Number.isInteger(index) || index < 0) {
      res.status(400).json({ error: "bad upload id / chunk index" }); return;
    }
    if (!Buffer.isBuffer(body) || body.length === 0) { res.status(400).json({ error: "檔案是空的" }); return; }

    let job = jobs.get(id);
    if (!job) {
      if (index !== 0) { res.status(404).json({ error: "上傳已中斷，請重新選檔" }); return; }
      const name = decodeName(req.headers["x-filename"]);
      const kind = attachmentKindOf(name);
      const size = parseInt(String(req.headers["x-file-size"] ?? ""), 10);
      const total = parseInt(String(req.headers["x-chunk-total"] ?? ""), 10);
      if (!kind) {
        res.status(400).json({ error: `不支援 ${extOfName(name) || "(無副檔名)"} — 可用 ${ATTACHMENT_EXTS.join(" / ")}` });
        return;
      }
      if (!(size > 0) || !(total > 0) || total > Math.ceil(ATTACHMENT_MAX_BYTES[kind] / (1024 * 1024))) {
        res.status(400).json({ error: "bad file size / chunk total" }); return;
      }
      if (size > ATTACHMENT_MAX_BYTES[kind]) {
        res.status(413).json({ error: `檔案太大（上限 ${Math.round(ATTACHMENT_MAX_BYTES[kind] / 1024 / 1024)}MB）` });
        return;
      }
      const active = [...jobs.values()].filter((j) => j.userId === userId && (j.status === "uploading" || j.status === "processing"));
      if (active.length >= MAX_ACTIVE_PER_USER) {
        res.status(429).json({ error: "還有檔案在解析，等它們完成再加" }); return;
      }
      // 圖片與影音要呼叫模型，跟跑任務同一道額度預檢。
      if (kind === "image" || kind === "video" || kind === "audio") {
        const { preflightCostCheck } = await import("../../platform/core/llm/llmWithBilling");
        const guard = await preflightCostCheck(userId);
        if (!guard.ok) { res.status(403).json({ error: guard.reason }); return; }
      }
      await fs.mkdir(TMP_DIR, { recursive: true });
      job = {
        id, userId, name, ext: extOfName(name), kind, size, total,
        nextIndex: 0, received: 0, status: "uploading", stage: null,
        result: null, error: null, touchedAt: Date.now(), abort: new AbortController(),
      };
      jobs.set(id, job);
    }

    if (job.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }
    if (job.status !== "uploading" || index !== job.nextIndex) {
      res.status(409).json({ error: "分段順序不對，請重新選檔" }); return;
    }
    if (job.received + body.length > job.size) {
      dropJob(job);
      res.status(400).json({ error: "收到的資料比宣告的檔案大" }); return;
    }

    try {
      await fs.appendFile(pathOf(job), body);
    } catch (err: any) {
      dropJob(job);
      console.error("[task-attachment] write failed:", String(err?.message ?? err));
      res.status(500).json({ error: "伺服器存不下這個檔案，請稍後再試" }); return;
    }
    job.received += body.length;
    job.nextIndex += 1;
    job.touchedAt = Date.now();

    if (job.nextIndex >= job.total) {
      if (job.received !== job.size) {
        dropJob(job);
        res.status(400).json({ error: "檔案沒有傳完整，請重新選檔" }); return;
      }
      void runJob(job);
    }
    res.json(view(job));
  },
);

// ── status ───────────────────────────────────────────────────────────────────
taskAttachmentRouter.get("/status/:id", async (req, res) => {
  const userId = await userIdOf(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const job = jobs.get(String(req.params.id ?? ""));
  if (!job || job.userId !== userId) { res.status(404).json({ error: "找不到這份上傳，請重新選檔" }); return; }
  job.touchedAt = Date.now();
  res.json(view(job));
});

// ── cancel / 取走後清掉 ──────────────────────────────────────────────────────
taskAttachmentRouter.delete("/:id", async (req, res) => {
  const userId = await userIdOf(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const job = jobs.get(String(req.params.id ?? ""));
  if (job && job.userId === userId) dropJob(job);
  res.json({ ok: true });
});
