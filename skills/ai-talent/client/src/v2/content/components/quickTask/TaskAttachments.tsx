/**
 * TaskAttachments — 任務卡視窗裡的「上傳素材」區。
 *
 * 2026-10-08（CJ「在任務卡的時候，讓用戶可以上傳檔案，包括影片、word、excel、圖片…
 * 解析後按照 skill 寫文章」）。
 *
 * 選檔（或拖進來）當下就上傳並解析成文字；解析結果由父層拿著，按「生成」時跟著
 * inputs 一起送。原檔不留在伺服器。每份解析完可以展開看 AI 讀到了什麼——寫出來的
 * 東西對不對得回素材，使用者要能自己核對。
 *
 * 版面照設計系統：單色、狀態才上色（失敗＝danger），說明收進「?」。
 */
import React from "react";
import { Icon, type IconName } from "../../../platform/components/icons";
import { HelpTip } from "../../../platform/components/HelpTip";
import {
  type AttachmentItem, type AttachmentKind, type AttachmentStage,
  ATTACHMENT_EXTS, ATTACHMENT_MAX_BYTES, MAX_ATTACHMENTS,
  attachmentKindOf, uploadAttachment,
} from "../../lib/taskAttachments";

const KIND_ICON: Record<AttachmentKind, IconName> = {
  document: "text", spreadsheet: "grid", image: "image", video: "video", audio: "play",
};

const STAGE_TEXT: Record<AttachmentStage, { zh: string; en: string }> = {
  reading: { zh: "讀取內容中…", en: "Reading…" },
  transcribing: { zh: "轉逐字稿中…", en: "Transcribing…" },
  viewing: { zh: "AI 看畫面中…", en: "Looking at the visuals…" },
};

interface Props {
  lang: string;
  items: AttachmentItem[];
  setItems: React.Dispatch<React.SetStateAction<AttachmentItem[]>>;
}

export default function TaskAttachments({ lang, items, setItems }: Props) {
  const en = lang === "en";
  const L = (zh: string, e: string) => (en ? e : zh);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const aborts = React.useRef(new Map<string, AbortController>());
  const [note, setNote] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  // 視窗關掉（元件卸載）時，還在傳的全部中止——伺服器端會跟著清掉。
  React.useEffect(() => () => { aborts.current.forEach((a) => a.abort()); }, []);

  const patch = (id: string, p: Partial<AttachmentItem>) =>
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, ...p } : a)));

  const addFiles = (files: File[]) => {
    setNote(null);
    const room = MAX_ATTACHMENTS - items.length;
    if (files.length > room) {
      setNote(L(`一次最多帶 ${MAX_ATTACHMENTS} 份素材`, `Up to ${MAX_ATTACHMENTS} files per task`));
    }
    for (const file of files.slice(0, Math.max(0, room))) {
      const kind = attachmentKindOf(file.name);
      if (!kind) {
        setNote(L(`「${file.name}」的格式還不支援`, `"${file.name}" isn't a supported format`));
        continue;
      }
      if (file.size > ATTACHMENT_MAX_BYTES[kind]) {
        const mb = Math.round(ATTACHMENT_MAX_BYTES[kind] / 1024 / 1024);
        setNote(L(`「${file.name}」太大了（上限 ${mb}MB）`, `"${file.name}" is too large (max ${mb}MB)`));
        continue;
      }
      if (file.size === 0) {
        setNote(L(`「${file.name}」是空的`, `"${file.name}" is empty`));
        continue;
      }
      const id = crypto.randomUUID();
      const ctl = new AbortController();
      aborts.current.set(id, ctl);
      setItems((prev) => [...prev, {
        id, name: file.name, kind, status: "uploading", progress: 0, stage: null,
        text: "", chars: 0, truncated: false, error: null,
      }]);
      uploadAttachment(file, id, (p) => patch(id, p), ctl.signal)
        .then((r) => patch(id, { status: "done", stage: null, ...r }))
        .catch((e: any) => {
          if (ctl.signal.aborted) return;
          const raw = String(e?.message ?? e);
          patch(id, {
            status: "error", stage: null,
            error: raw === "timeout"
              ? L("解析太久了，請換短一點的檔案再試", "This took too long — try a shorter file")
              : raw === "Failed to fetch"
                ? L("網路中斷，請再傳一次", "Connection dropped — please upload again")
                : raw,
          });
        })
        .finally(() => aborts.current.delete(id));
    }
  };

  const remove = (id: string) => {
    aborts.current.get(id)?.abort();
    aborts.current.delete(id);
    setItems((prev) => prev.filter((a) => a.id !== id));
    if (openId === id) setOpenId(null);
  };

  const statusText = (a: AttachmentItem): string => {
    if (a.status === "uploading") return L(`上傳中 ${Math.round(a.progress * 100)}%`, `Uploading ${Math.round(a.progress * 100)}%`);
    if (a.status === "processing") {
      const s = a.stage ? STAGE_TEXT[a.stage] : { zh: "解析中…", en: "Reading…" };
      return en ? s.en : s.zh;
    }
    if (a.status === "error") return a.error ?? L("讀不出內容", "Couldn't read this file");
    const n = a.chars.toLocaleString();
    return a.truncated
      ? L(`讀到 ${n} 字，帶入前 ${a.text.length.toLocaleString()} 字`, `${n} characters read, first ${a.text.length.toLocaleString()} used`)
      : L(`已讀取 ${n} 字`, `${n} characters read`);
  };

  const full = items.length >= MAX_ATTACHMENTS;

  return (
    <div className="space-y-2" data-task-attachments>
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept={ATTACHMENT_EXTS.join(",")}
        onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={full}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!full) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!full) addFiles(Array.from(e.dataTransfer.files ?? []));
          }}
          className={`flex-1 flex items-center gap-2 rounded-2xl border border-dashed px-4 py-2.5 text-left text-small transition disabled:opacity-50 disabled:cursor-not-allowed ${dragOver ? "border-neutral-900 bg-default-100" : "border-default-300 hover:border-default-500 bg-white"}`}
        >
          <Icon name="upload" size={14} className="text-default-600 shrink-0" />
          <span className="text-default-700">
            {L("上傳素材，讓 AI 讀完再寫", "Upload material for the AI to read first")}
          </span>
          <span className="text-tiny text-default-400 truncate">
            {L("影片・Word・Excel・PDF・簡報・圖片", "Video · Word · Excel · PDF · Slides · Images")}
          </span>
        </button>
        <HelpTip>
          {L(
            `可以拖曳或點選，一次最多 ${MAX_ATTACHMENTS} 份。影片與錄音會轉成逐字稿並描述畫面（300MB 以內，只轉前 90 分鐘）；圖片會讀出畫面與圖上的字；文件與試算表讀內文。原檔解析完就刪除，不會留在伺服器。內容還是照這張任務卡的寫法與品牌設定來寫。`,
            `Drag in or click, up to ${MAX_ATTACHMENTS} files. Video and audio are transcribed and the visuals described (up to 300MB, first 90 minutes); images are read for content and on-image text; documents and spreadsheets are read as text. The original file is deleted right after reading. The piece is still written to this task card's format and your brand settings.`,
          )}
        </HelpTip>
      </div>

      {note && <p className="text-tiny text-danger-500">{note}</p>}

      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((a) => {
            const busy = a.status === "uploading" || a.status === "processing";
            const open = openId === a.id && a.status === "done";
            return (
              <li key={a.id} className="rounded-xl ring-1 ring-default-200 bg-white px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  {busy
                    ? <span className="w-3.5 h-3.5 shrink-0 border-2 border-default-300 border-t-neutral-900 rounded-full animate-spin" />
                    : <Icon name={a.status === "error" ? "warning" : KIND_ICON[a.kind]} size={13} className={`shrink-0 ${a.status === "error" ? "text-danger-500" : "text-default-600"}`} />}
                  <span className="text-small text-default-800 truncate min-w-0 flex-1">{a.name}</span>
                  <span className={`text-tiny shrink-0 max-w-[55%] truncate ${a.status === "error" ? "text-danger-500" : "text-default-500"}`} title={a.status === "error" ? (a.error ?? "") : undefined}>
                    {statusText(a)}
                  </span>
                  {a.status === "done" && (
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : a.id)}
                      aria-expanded={open}
                      className="text-tiny text-default-700 underline underline-offset-2 shrink-0 hover:text-neutral-900"
                    >
                      {open ? L("收起", "Hide") : L("看 AI 讀到什麼", "See what was read")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    aria-label={L(`移除 ${a.name}`, `Remove ${a.name}`)}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-default-500 hover:bg-default-100 hover:text-neutral-900 shrink-0"
                  >
                    <Icon name="close" size={11} />
                  </button>
                </div>
                {a.status === "uploading" && (
                  <div className="mt-1.5 h-1 rounded-full bg-default-100 overflow-hidden">
                    <div className="h-full bg-neutral-900 transition-all" style={{ width: `${Math.round(a.progress * 100)}%` }} />
                  </div>
                )}
                {open && (
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-default-50 px-3 py-2 text-tiny text-default-700 font-sans">
                    {a.text}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
