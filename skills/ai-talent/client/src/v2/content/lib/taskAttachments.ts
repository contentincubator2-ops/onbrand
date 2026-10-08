/**
 * taskAttachments（client）— 任務卡上傳素材：哪些檔可以傳、怎麼傳、傳完拿到什麼。
 *
 * 副檔名與上限是 server/content/core/catalog/taskAttachments.ts 的鏡像（不能跨 vite
 * root import），由 server 側的 taskAttachments.parity.test.ts 綁住。權威判斷在 server，
 * 這份只是讓「不支援／太大」在選檔當下就講，不必等傳完。
 *
 * 上傳走分段：nginx 單次請求上限 25MB，影片一定超過，所以切 8MB 一段依序送，
 * 最後一段收齊後伺服器在背景解析，這裡輪詢到有結果為止。
 */

export type AttachmentKind = "document" | "spreadsheet" | "image" | "video" | "audio";

const EXT_KIND: Record<string, AttachmentKind> = {
  ".docx": "document", ".doc": "document", ".pptx": "document", ".ppt": "document",
  ".pdf": "document", ".md": "document", ".markdown": "document", ".txt": "document",
  ".html": "document", ".htm": "document",
  ".xlsx": "spreadsheet", ".csv": "spreadsheet",
  ".jpg": "image", ".jpeg": "image", ".png": "image", ".webp": "image", ".gif": "image",
  ".heic": "image", ".heif": "image",
  ".mp4": "video", ".mov": "video", ".m4v": "video", ".webm": "video", ".avi": "video", ".mkv": "video",
  ".mp3": "audio", ".m4a": "audio", ".wav": "audio", ".aac": "audio", ".ogg": "audio",
};

export const ATTACHMENT_EXTS = Object.keys(EXT_KIND);

export const ATTACHMENT_MAX_BYTES: Record<AttachmentKind, number> = {
  document: 40 * 1024 * 1024,
  spreadsheet: 40 * 1024 * 1024,
  image: 20 * 1024 * 1024,
  video: 300 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
};

export const MAX_ATTACHMENTS = 5;
export const ATTACHMENT_TEXT_MAX = 12_000;

export function attachmentKindOf(name: string): AttachmentKind | null {
  const i = name.lastIndexOf(".");
  return EXT_KIND[i < 0 ? "" : name.slice(i).toLowerCase()] ?? null;
}

export type AttachmentStage = "reading" | "transcribing" | "viewing";

export interface AttachmentItem {
  id: string;
  name: string;
  kind: AttachmentKind;
  status: "uploading" | "processing" | "done" | "error";
  /** 0–1，只在 uploading 有意義。 */
  progress: number;
  stage: AttachmentStage | null;
  text: string;
  /** 解析出來的原始字數（text 可能已截到 ATTACHMENT_TEXT_MAX）。 */
  chars: number;
  truncated: boolean;
  error: string | null;
}

/** 送給 runOrchestra* 的形狀：只帶解析完成的。 */
export function readyAttachments(items: AttachmentItem[]): { name: string; kind: AttachmentKind; text: string }[] {
  return items
    .filter((a) => a.status === "done" && a.text.trim())
    .slice(0, MAX_ATTACHMENTS)
    .map((a) => ({ name: a.name.slice(0, 200), kind: a.kind, text: a.text.slice(0, ATTACHMENT_TEXT_MAX) }));
}

export function attachmentsBusy(items: AttachmentItem[]): boolean {
  return items.some((a) => a.status === "uploading" || a.status === "processing");
}

const CHUNK_BYTES = 8 * 1024 * 1024;
const POLL_MS = 2_000;
/** 伺服器自己的解析上限是 8 分鐘；多等一點，讓它的錯誤訊息先到。 */
const POLL_LIMIT_MS = 9 * 60_000;

async function jsonOrThrow(r: Response): Promise<any> {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
  return j;
}

/**
 * 上傳一個檔並等到解析完。過程中用 onUpdate 回報進度與階段。
 * 中止（signal）時會請伺服器把這份上傳丟掉。
 */
export async function uploadAttachment(
  file: File,
  id: string,
  onUpdate: (patch: Partial<AttachmentItem>) => void,
  signal: AbortSignal,
): Promise<{ text: string; chars: number; truncated: boolean }> {
  const total = Math.max(1, Math.ceil(file.size / CHUNK_BYTES));
  const cleanup = () => { void fetch(`/api/task-attachment/${id}`, { method: "DELETE", credentials: "include" }).catch(() => {}); };
  try {
    let view: any = null;
    for (let i = 0; i < total; i++) {
      view = await jsonOrThrow(await fetch("/api/task-attachment/chunk", {
        method: "POST",
        credentials: "include",
        signal,
        headers: {
          "content-type": "application/octet-stream",
          "x-upload-id": id,
          "x-chunk-index": String(i),
          "x-chunk-total": String(total),
          "x-file-size": String(file.size),
          "x-filename": encodeURIComponent(file.name),
        },
        body: file.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES),
      }));
      onUpdate({ progress: (i + 1) / total });
    }
    onUpdate({ status: "processing", stage: view?.stage ?? null });

    const startedAt = Date.now();
    while (view?.status === "processing" || view?.status === "uploading") {
      if (Date.now() - startedAt > POLL_LIMIT_MS) throw new Error("timeout");
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, POLL_MS);
        signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("aborted", "AbortError")); }, { once: true });
      });
      view = await jsonOrThrow(await fetch(`/api/task-attachment/status/${id}`, { credentials: "include", signal }));
      onUpdate({ stage: view?.stage ?? null });
    }
    if (view?.status !== "done" || !view?.result?.text) throw new Error(view?.error ?? "這份檔案讀不出內容");
    return { text: String(view.result.text), chars: Number(view.result.chars) || 0, truncated: !!view.result.truncated };
  } finally {
    // 成功也清：結果已經在畫面手上，伺服器不必再留著。
    cleanup();
  }
}
