/**
 * CustomCardEditor — 一張自訂定位卡的編輯器（標題 + 內容）。
 *
 * 2026-09-24（CJ「按下新增卡片時，只是要她編輯該卡片的標題和內容，內容可以
 * 打字或是直接上傳文件」）：
 *
 * 在這之前，定位總覽那顆「新增卡片」虛線磚按下去是**跳到「我的定位文件」整頁**
 * ——那是「上傳一整份定位書、AI 對映到 20 個固定欄位」的流程，跟「我想自己加
 * 一張卡」是兩件事。使用者按了之後會發現自己跑到另一個功能裡，而且那裡根本
 * 沒有「新增一張卡」這個動作（卡片只能由 AI 從文件裡提議）。
 *
 * 這個編輯器就是缺掉的那一塊：一個小對話框，標題一格、內容一格，打字或從檔案
 * 帶入都可以，存下去就是一張卡。
 *
 * ── 幾個刻意的選擇 ────────────────────────────────────────────────────
 * 1. 「從檔案帶入」走的是新的 /api/positioning-doc/extract-text——只抽文字、
 *    不落地。它**不會**變成「我的定位文件」清單裡的一份文件，也不會觸發 AI
 *    對映提案：使用者要的只是把那份檔案的文字倒進這張卡。兩件事混在一起的話，
 *    「我加了一張卡」會莫名其妙多出一份文件。
 * 2. 內容上限 600 字是後端 MAX_CUSTOM_SEGMENT_FIELD_VALUE_CHARS，而且跑任務時
 *    每張卡最多只讀進 500 字（brandContext.pushCustomSegments）。所以超過的部分
 *    會明講「不會存進去」，而不是靜靜截斷——使用者以為整份文件都進去了，卻只有
 *    前 500 字真的被讀到，是最糟的情況。想整份帶進來的人要走「上傳定位資料」。
 * 3. 多欄位（label + value）保留但收在後面：AI 從文件提議的卡片本來就是多欄位的，
 *    編輯既有卡片時不能把它們壓成一格，否則一打開就把資料弄丟。新建時預設就
 *    一格「內容」，跟 CJ 說的「只是標題和內容」一致。
 */
import React from "react";
import { Button, Input, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { AddIcon, DeleteIcon, UploadIcon } from "../../../platform/components/icons";
import { useLang } from "../../../../lib/i18n";
import { trpc } from "../../../../lib/trpc";

const ACCEPT = ".docx,.pptx,.pdf,.md,.markdown,.txt,.html,.htm";
/** 後端 MAX_CUSTOM_SEGMENT_* 的鏡像。改後端記得一起改這裡。 */
const MAX_TITLE = 24;
const MAX_VALUE = 600;
const MAX_FIELDS = 8;

export interface EditableCard {
  id: string | null;                       // null = 新建
  title: string;
  fields: { label: string; value: string }[];
}

export default function CustomCardEditor({
  open, card, scopeMode, scopeId, onClose, onSaved,
}: {
  open: boolean;
  /** null 時不渲染內容；由呼叫端決定開哪一張。 */
  card: EditableCard | null;
  scopeMode: "brand" | "product" | "event";
  scopeId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  const [title, setTitle] = React.useState("");
  const [fields, setFields] = React.useState<{ label: string; value: string }[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  /** 檔案內容要倒進哪一格——使用者按的那一格。 */
  const targetFieldRef = React.useRef<number>(0);

  // 每次開啟都重讀一次傳進來的卡，不要沿用上一張的殘留內容。
  React.useEffect(() => {
    if (!open) return;
    setTitle(card?.title ?? "");
    setFields(card?.fields?.length ? card.fields.map((f) => ({ ...f })) : [{ label: en ? "Content" : "內容", value: "" }]);
    setError(null); setNotice(null); setBusy(false);
  }, [open, card, en]);

  const createMut = (trpc as any).positioningDocs?.createCustomSegment?.useMutation?.({
    onSuccess: () => { setBusy(false); onSaved(); onClose(); },
    onError: (e: any) => { setBusy(false); setError(String(e?.message ?? e)); },
  }) ?? null;
  const updateMut = (trpc as any).positioningDocs?.updateCustomSegment?.useMutation?.({
    onSuccess: () => { setBusy(false); onSaved(); onClose(); },
    onError: (e: any) => { setBusy(false); setError(String(e?.message ?? e)); },
  }) ?? null;

  async function onFile(file: File) {
    if (!scopeId) return;
    setError(null); setNotice(null); setBusy(true);
    try {
      const r = await fetch("/api/positioning-doc/extract-text", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/octet-stream",
          "x-brand-id": String(scopeId),
          "x-scope": scopeMode,
          "x-scope-id": String(scopeId),
          "x-filename": encodeURIComponent(file.name),
        },
        body: file,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.detail ? `${j.error}：${j.detail}` : (j?.error ?? `HTTP ${r.status}`));
      const raw = String(j.text ?? "").trim();
      const idx = Math.min(targetFieldRef.current, fields.length - 1);
      setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, value: raw.slice(0, MAX_VALUE) } : f)));
      if (raw.length > MAX_VALUE) {
        // 明講被切掉了，不要讓人以為整份都進來了。
        setNotice(en
          ? `${file.name} has ${raw.length} characters — only the first ${MAX_VALUE} were placed here (one card's limit). To bring in a whole document, use “Upload your positioning doc” instead.`
          : `${file.name} 有 ${raw.length} 字，這裡只帶入前 ${MAX_VALUE} 字（單張卡片的上限）。想把整份文件帶進來，請改用「上傳定位資料」。`);
      } else {
        setNotice(en ? `Loaded ${raw.length} characters from ${file.name}.` : `已從 ${file.name} 帶入 ${raw.length} 字，可以直接編輯。`);
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const cleanFields = fields
    .map((f) => ({ label: f.label.trim(), value: f.value.trim() }))
    .filter((f) => f.label && f.value);
  const canSave = !!scopeId && title.trim().length > 0 && cleanFields.length > 0 && !busy;

  const save = () => {
    if (!canSave || !scopeId) return;
    setError(null); setBusy(true);
    const payload = { scope: scopeMode, scopeId, title: title.trim().slice(0, MAX_TITLE), fields: cleanFields };
    if (card?.id) updateMut?.mutate?.({ ...payload, segmentId: card.id });
    else createMut?.mutate?.(payload);
  };

  return (
    <Modal isOpen={open} onOpenChange={(v) => { if (!v) onClose(); }} size="2xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-medium font-semibold">
            {card?.id ? (en ? "Edit card" : "編輯卡片") : (en ? "New card" : "新增卡片")}
          </span>
          <span className="text-tiny text-default-500 font-normal">
            {en
              ? "Your own positioning card — read on every task run, same as the fixed fields."
              : "你自己的定位卡片——跟上面的固定欄位一樣，每次跑任務都會被讀到。"}
          </span>
        </ModalHeader>
        <ModalBody className="gap-4">
          <Input
            label={en ? "Card title" : "卡片標題"}
            placeholder={en ? "e.g. Brand vision" : "例如：品牌願景"}
            value={title}
            maxLength={MAX_TITLE}
            onValueChange={setTitle}
            description={`${title.length} / ${MAX_TITLE}`}
            isRequired
          />

          {fields.map((f, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-medium border border-divider p-3">
              <div className="flex items-center gap-2">
                <Input
                  size="sm"
                  label={en ? "Field name" : "欄位名稱"}
                  value={f.label}
                  maxLength={40}
                  onValueChange={(v) => setFields((prev) => prev.map((x, j) => (j === i ? { ...x, label: v } : x)))}
                  className="max-w-[200px]"
                />
                <Button
                  size="sm" variant="flat" startContent={<UploadIcon size={13} />}
                  isDisabled={busy || !scopeId}
                  onPress={() => { targetFieldRef.current = i; fileRef.current?.click(); }}
                >
                  {en ? "From a file" : "從檔案帶入"}
                </Button>
                {fields.length > 1 && (
                  <Button
                    size="sm" variant="light" isIconOnly
                    onPress={() => setFields((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <DeleteIcon size={14} className="text-danger-500" />
                  </Button>
                )}
              </div>
              <Textarea
                label={en ? "Content" : "內容"}
                placeholder={en ? "Type it, or pull it in from a file" : "直接打字，或用上面的「從檔案帶入」"}
                value={f.value}
                minRows={4}
                maxRows={12}
                maxLength={MAX_VALUE}
                onValueChange={(v) => setFields((prev) => prev.map((x, j) => (j === i ? { ...x, value: v } : x)))}
                description={`${f.value.length} / ${MAX_VALUE}`}
              />
            </div>
          ))}

          {fields.length < MAX_FIELDS && (
            <Button
              size="sm" variant="flat" startContent={<AddIcon size={13} />}
              onPress={() => setFields((prev) => [...prev, { label: "", value: "" }])}
            >
              {en ? "Add another field" : "再加一格"}
            </Button>
          )}

          <p className="text-tiny text-default-500">
            {en
              ? `Each field holds up to ${MAX_VALUE} characters, and a task run reads up to ~500 characters per card. For a whole positioning document, use “Upload your positioning doc” — it maps into the fixed fields instead.`
              : `每一格上限 ${MAX_VALUE} 字，而跑任務時每張卡最多讀進約 500 字。想帶進一整份定位書，請用「上傳定位資料」——那條路會對映到上面的固定欄位。`}
          </p>

          {notice && (
            <div className="rounded-medium border border-warning-200 bg-warning-50 px-3 py-2 text-tiny text-warning-800">
              {notice}
            </div>
          )}
          {error && (
            <div className="rounded-medium border border-danger-200 bg-danger-50 px-3 py-2 text-tiny text-danger-700">
              {error}
            </div>
          )}

          <input
            ref={fileRef} type="file" accept={ACCEPT} className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          />
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="flat" onPress={onClose}>{en ? "Cancel" : "取消"}</Button>
          <Button size="sm" color="primary" isDisabled={!canSave} isLoading={busy} onPress={save}>
            {card?.id ? (en ? "Save changes" : "儲存修改") : (en ? "Create card" : "建立卡片")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
