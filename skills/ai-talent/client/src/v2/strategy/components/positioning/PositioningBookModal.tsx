/**
 * PositioningBookModal — 品牌定位書的一張卡片：左邊是這張卡的內容，右邊跟策略顧問討論，或貼上／上傳現成的文字。
 *
 * 2026-10-10（CJ「點卡片進去後，就是一個一個跳出來的視窗」→「跟通路一樣格式的彈跳視窗就好，
 * 右邊對話加上上傳，左邊是欄位」）。版面與做法照 ChannelRoleModal，同樣幾個刻意的選擇：
 *   1. 顧問給的、從貼上的文字挑出來的，都是草稿。按「套用到左邊」只是把字放進左邊，還沒存；按「儲存」才寫入。
 *      定位是所有產文的上游，顧問的草稿不能不經過人就生效。
 *   2. 套用會取代左邊已經寫的字時，按鈕上直接講。
 *   3. 貼上那條只准引用：伺服器逐字比對，改寫過的句子丟掉並回報被擋下幾段。
 *   4. 送出用 Ctrl／⌘+Enter，不用單獨 Enter（中文輸入法選字時按 Enter 會誤送）。
 *
 * 一次只開一張卡：定位書是一條推導鏈，顧問要看得出這一次改了哪一張。
 */
import React from "react";
import { Avatar, Button, Input, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperPlane, faWandMagicSparkles, faFileArrowUp } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { BRAND_SEGMENTS } from "../../lib/positioningSchema";
import { readStoredDirector } from "../../lib/strategistDirectors";

/** positioningBook.get 回來的一張卡（形狀由伺服器的 BookCard 決定）。 */
export interface BookCardView {
  id: string;
  preset: string | null;
  title: string; titleEn: string;
  ask: string; askEn: string;
  max: number;
  body: string;
  derived: string;
  sources: string[];
  updatedAt: string | null;
  upstreamChanged: boolean;
}

type PasteResult = { proposal: string | null; dropped: number; truncated: boolean; applied?: boolean };
/** 伺服器 importPaste 的上限。 */
const PASTE_MAX = 30_000;
/** 跟自訂卡片「從檔案帶入」同一個端點、同一組格式。 */
const ACCEPT = ".docx,.doc,.pptx,.ppt,.xlsx,.pdf,.md,.markdown,.txt,.html,.htm";

type Msg = { role: "user" | "assistant"; content: string; proposal?: string | null; applied?: boolean };

export default function PositioningBookModal({
  open, card, brandId, onClose, onSaved, onOpenSegment,
}: {
  open: boolean;
  card: BookCardView | null;
  brandId: number;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onOpenSegment: (segmentId: string) => void;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  const isCustom = !!card && !card.preset;

  const [body, setBody] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [draft, setDraft] = React.useState("");
  const [tab, setTab] = React.useState<"chat" | "paste">("chat");
  const [pasteText, setPasteText] = React.useState("");
  const [pasteResult, setPasteResult] = React.useState<PasteResult | null>(null);
  const [fileNote, setFileNote] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState<"chat" | "paste" | "file" | "save" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement | null>(null);

  // 每次開啟都重讀這張卡已存的內容，不沿用上一張卡的對話。
  React.useEffect(() => {
    if (!open || !card) return;
    setBody(card.body); setTitle(card.title);
    setTab("chat"); setMsgs([]); setDraft(""); setPasteText(""); setPasteResult(null); setFileNote(null);
    setBusy(null); setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, card?.id]);

  React.useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  // 來討論的顧問：這個品牌的策略總監（用戶換過人選就用他選的那一位）。
  const storedAgentId = React.useMemo(() => (open ? readStoredDirector(brandId, "brand") : null), [open, brandId]);
  const directorsQ = trpc.strategistChat.listDirectors.useQuery(
    { brandId, includeAgentId: storedAgentId ?? undefined },
    { enabled: open && !!brandId, refetchOnWindowFocus: false, staleTime: 60_000 },
  );
  const directors = directorsQ.data?.directors ?? [];
  const director = directors.find((d: any) => d.agentId === storedAgentId) ?? directors[0] ?? null;
  const agentAvatar = (size: string) => (
    <Avatar src={director?.avatarUrl || undefined} name={director?.name} isBordered={false} className={`${size} shrink-0`} showFallback />
  );

  const discuss = (trpc as any).positioningBook.discuss.useMutation();
  const importPaste = (trpc as any).positioningBook.importPaste.useMutation();
  const save = (trpc as any).positioningBook.saveCard.useMutation();
  const remove = (trpc as any).positioningBook.removeCard.useMutation();

  const dirty = !!card && (body !== card.body || (isCustom && title.trim() !== card.title));
  const label = card ? (en ? card.titleEn : card.title) : "";

  const requestClose = () => {
    if (busy === "save") return;
    if (dirty && !window.confirm(en ? "Discard your unsaved changes?" : "還有沒儲存的修改，確定要放棄嗎？")) return;
    onClose();
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || !card || busy) return;
    setError(null);
    const next: Msg[] = [...msgs, { role: "user", content: t }];
    setMsgs(next); setDraft(""); setBusy("chat");
    try {
      const r = await discuss.mutateAsync({
        brandId, cardId: card.id, current: body,
        title: isCustom ? title : undefined,
        agentId: director?.agentId,
        messages: next.map((m) => ({ role: m.role, content: m.content })),
      });
      setMsgs([...next, { role: "assistant", content: r.reply, proposal: r.proposal ?? null }]);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      // 送出失敗：把用戶那句還給輸入框，不要讓他重打。
      setMsgs(msgs); setDraft(t);
    } finally { setBusy(null); }
  };

  const runPaste = async () => {
    if (!card || !pasteText.trim() || busy) return;
    setError(null); setPasteResult(null); setBusy("paste");
    try {
      const r = await importPaste.mutateAsync({ brandId, cardId: card.id, title: isCustom ? title : undefined, text: pasteText });
      setPasteResult({ proposal: r.proposal ?? null, dropped: r.dropped ?? 0, truncated: !!r.truncated });
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setBusy(null); }
  };

  /** 上傳檔案：只把文字讀出來放進貼上框，要不要挑、挑完要不要套用，還是使用者決定。 */
  const onFile = async (file: File) => {
    if (busy) return;
    setError(null); setFileNote(null); setPasteResult(null); setBusy("file");
    try {
      const r = await fetch("/api/positioning-doc/extract-text", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/octet-stream",
          "x-brand-id": String(brandId),
          "x-scope": "brand",
          "x-scope-id": String(brandId),
          "x-filename": encodeURIComponent(file.name),
        },
        body: file,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.detail ? `${j.error}：${j.detail}` : (j?.error ?? `HTTP ${r.status}`));
      const chars = [...String(j.text ?? "").trim()];
      setPasteText(chars.slice(0, PASTE_MAX).join(""));
      // 明講被切掉了，不要讓人以為整份都進來了。
      setFileNote(chars.length > PASTE_MAX
        ? (en ? `${file.name} has ${chars.length} characters — only the first ${PASTE_MAX} were read.` : `${file.name} 有 ${chars.length} 字，這裡只讀了前 ${PASTE_MAX} 字。`)
        : (en ? `Read ${chars.length} characters from ${file.name}.` : `已從 ${file.name} 讀出 ${chars.length} 字。`));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setBusy(null); }
  };

  /** 套用會取代左邊已經寫的字時，按鈕上直接講。 */
  const applyLabel = (proposal: string) =>
    body.trim() && body.trim() !== proposal
      ? (en ? "Apply (replaces what is on the left)" : "套用到左邊（會取代左邊現在的內容）")
      : (en ? "Apply to the left" : "套用到左邊");

  const doSave = async () => {
    if (!card || busy) return;
    setError(null); setBusy("save");
    try {
      await save.mutateAsync({ brandId, cardId: card.id, body, title: isCustom ? title : undefined });
      await onSaved(); onClose();
    } catch (e: any) {
      setError(String(e?.message ?? e)); setBusy(null);
    }
  };

  const doRemove = async () => {
    if (!card || busy) return;
    const msg = isCustom
      ? (en ? `Delete the card "${label}"? Its content will be gone.` : `確定要刪除「${label}」這張卡片嗎？內容會一起刪掉。`)
      : (en ? `Take "${label}" out of the positioning book? You can put it back from "Add a card".` : `把「${label}」從定位書拿掉？之後可以從「新增卡片」加回來。`);
    if (!window.confirm(msg)) return;
    setError(null); setBusy("save");
    try {
      await remove.mutateAsync({ brandId, cardId: card.id });
      await onSaved(); onClose();
    } catch (e: any) {
      setError(String(e?.message ?? e)); setBusy(null);
    }
  };

  const starters = en
    ? ["Draft this card from what you know about the brand", "What would you ask me first?", "Challenge what I have written here"]
    : ["依你對品牌的了解，先幫我擬這張卡", "你會先問我什麼？", "挑戰一下我目前寫的內容"];

  const segTitle = (id: string) => {
    const s = BRAND_SEGMENTS.find((x) => x.id === id);
    return s ? (en ? (s.titleEn ?? s.title) : s.title) : id;
  };

  return (
    <Modal isOpen={open} onOpenChange={(v) => { if (!v) requestClose(); }} size="5xl" scrollBehavior="inside" isDismissable={busy !== "save"}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-medium font-semibold">{label}</span>
          {card && (card.ask || isCustom) && (
            <span className="text-tiny font-normal text-default-500">
              {isCustom
                ? (en ? "Your own card. It becomes a chapter of the proposal, in the position you place it." : "你自己加的卡片。它會是提案裡的一章，位置照你排的順序。")
                : (en ? card.askEn : card.ask)}
            </span>
          )}
        </ModalHeader>

        <ModalBody className="gap-4 md:flex-row md:items-start">
          {/* 左：這張卡的內容（真正會存、會寫進提案的就是這一格） */}
          <div className="flex flex-1 flex-col gap-3 md:min-w-0">
            {isCustom && (
              <Input
                size="sm" variant="bordered" radius="md" labelPlacement="outside" maxLength={24}
                label={en ? "Card title" : "卡片標題"} value={title} onValueChange={setTitle}
              />
            )}
            {card?.upstreamChanged && (
              <div className="rounded-medium border border-divider bg-default-50 px-3 py-2 text-tiny text-default-600">
                {en
                  ? "Cards placed before this one were changed after it was last saved. Check that it still follows from them."
                  : "排在這張之前的卡片，在這張上次存檔之後改過。看一下這張的內容還接不接得上。"}
              </div>
            )}
            <Textarea
              variant="bordered" radius="md" labelPlacement="outside"
              label={en ? "This card" : "這張卡的內容"}
              placeholder={card ? (en ? card.askEn : card.ask) || (en ? "Write here" : "寫在這裡") : ""}
              minRows={10} maxRows={20} maxLength={card?.max}
              value={body} onValueChange={setBody}
              description={`${[...body].length} / ${card?.max ?? 0}`}
            />
            {card && !body.trim() && card.derived && (
              <div className="rounded-medium border border-dashed border-divider p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-tiny font-semibold text-default-600">
                    {en ? "From the brand's existing positioning" : "品牌現有的定位資料"}
                  </span>
                  <Button size="sm" variant="flat" onPress={() => setBody(card.derived)}>
                    {en ? "Start from this" : "從這裡開始改"}
                  </Button>
                </div>
                <p className="m-0 mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-tiny text-default-600">{card.derived}</p>
                <p className="m-0 mt-2 text-tiny text-default-400">
                  {en
                    ? "Shown on the card until you write your own. Once you save your own text, that is what the proposal uses."
                    : "你還沒寫之前，卡片上先顯示這些。自己寫過存檔後，提案用的就是你寫的。"}
                </p>
              </div>
            )}
            {card && card.sources.length > 0 && (
              <p className="m-0 text-tiny text-default-500">
                {en ? "Original fields: " : "原始資料欄位："}
                {card.sources.map((id, i) => (
                  <React.Fragment key={id}>
                    {i > 0 && "、"}
                    <button type="button" className="underline underline-offset-2 hover:text-foreground"
                      onClick={() => { if (!dirty || window.confirm(en ? "Leave without saving?" : "還沒儲存，確定要離開嗎？")) onOpenSegment(id); }}>
                      {segTitle(id)}
                    </button>
                  </React.Fragment>
                ))}
              </p>
            )}
          </div>
          {/* 右：把內容弄進左邊的兩條路——跟顧問討論，或貼上／上傳現成的文字 */}
          <div className="flex flex-1 flex-col gap-3 rounded-large border border-divider p-3 md:min-w-0">
            <div className="flex gap-1 rounded-medium bg-default-100 p-1" role="tablist">
              {([["chat", en ? "Discuss with the strategist" : "與顧問討論"], ["paste", en ? "Paste or upload" : "貼上或上傳"]] as const).map(([id, text]) => (
                <button
                  key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                  className={`flex-1 rounded-small px-3 py-1.5 text-small font-medium transition-colors ${
                    tab === id ? "bg-white text-foreground shadow-small" : "text-default-500 hover:text-foreground"}`}
                >
                  {text}
                </button>
              ))}
            </div>

            {tab === "chat" ? (
              <div className="flex min-h-[320px] flex-1 flex-col gap-3">
                {director && (
                  <div className="flex items-center gap-2 border-b border-divider pb-2">
                    {agentAvatar("h-9 w-9")}
                    <div className="min-w-0 leading-tight">
                      <div className="truncate text-small font-semibold">{director.name}</div>
                      <div className="truncate text-tiny text-default-500">{director.title}</div>
                    </div>
                  </div>
                )}
                <div className="flex max-h-[420px] min-h-[300px] flex-1 flex-col gap-3 overflow-y-auto pr-1">
                  <div className="flex items-end gap-2">
                    {director && agentAvatar("h-7 w-7")}
                    <div className="rounded-medium bg-default-100 px-3 py-2 text-small text-default-700">
                      {en
                        ? `Let's work on "${label}". Tell me what you already know or believe here — or have me draft it first.`
                        : `我們來寫「${label}」。先說說你目前的想法，或直接讓我先擬一版。`}
                    </div>
                  </div>
                  {msgs.length === 0 && (
                    <div className="flex flex-wrap gap-2">
                      {starters.map((s) => (
                        <button
                          key={s} type="button" disabled={!!busy} onClick={() => send(s)}
                          className="rounded-full border border-neutral-300 px-3 py-1 text-tiny text-neutral-700 transition-colors hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-50"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {msgs.map((m, i) => (
                    <div key={i} className={m.role === "user" ? "flex justify-end" : "flex items-end justify-start gap-2"}>
                      {m.role === "assistant" && director && agentAvatar("h-7 w-7")}
                      <div className={`max-w-[90%] whitespace-pre-wrap rounded-medium px-3 py-2 text-small ${
                        m.role === "user" ? "bg-neutral-900 text-white" : "bg-default-100 text-default-800"}`}>
                        {m.content}
                        {m.role === "assistant" && m.proposal && (
                          <div className="mt-2 border-t border-divider pt-2">
                            <div className="text-tiny font-semibold text-default-600">{en ? "Draft" : "草稿"}</div>
                            <p className="m-0 mt-1 whitespace-pre-wrap text-tiny text-default-700">{m.proposal}</p>
                            <Button
                              size="sm" variant="flat" className="mt-2" isDisabled={m.applied}
                              startContent={<FontAwesomeIcon icon={faWandMagicSparkles} className="text-tiny" />}
                              onPress={() => {
                                setBody(m.proposal!);
                                setMsgs((all) => all.map((x, j) => (j === i ? { ...x, applied: true } : x)));
                              }}
                            >
                              {m.applied ? (en ? "Applied — edit on the left" : "已套用，可在左邊再改") : applyLabel(m.proposal)}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {busy === "chat" && (
                    <div className="flex items-center gap-2 text-tiny text-default-500">
                      {director && agentAvatar("h-7 w-7")}
                      {en ? "Thinking…" : "思考中…"}
                    </div>
                  )}
                  <div ref={endRef} />
                </div>
                <div className="flex items-end gap-2">
                  <Textarea
                    size="sm" variant="bordered" radius="md" minRows={2} maxRows={6} maxLength={6000}
                    placeholder={en ? "Type here — Ctrl/⌘ + Enter to send" : "在這裡輸入——Ctrl／⌘ + Enter 送出"}
                    value={draft} onValueChange={setDraft}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        void send(draft);
                      }
                    }}
                  />
                  <Button isIconOnly color="primary" aria-label={en ? "Send" : "送出"}
                    isDisabled={!draft.trim() || !!busy} isLoading={busy === "chat"} onPress={() => send(draft)}>
                    <FontAwesomeIcon icon={faPaperPlane} />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[320px] flex-1 flex-col gap-3">
                <p className="m-0 text-tiny text-default-500">
                  {en
                    ? `Paste text you already have — a positioning document, meeting notes, a ChatGPT / Claude conversation — or upload a file. Only the sentences that belong to "${label}" are picked out, in your exact words; nothing is rewritten or added.`
                    : `貼上你已經有的文字（定位文件、會議紀錄、ChatGPT／Claude 的對話），或上傳檔案。只會挑出屬於「${label}」的句子，而且是你的原文，不會改寫、也不會補寫。`}
                </p>
                <Textarea
                  variant="bordered" radius="md" minRows={6} maxRows={12} maxLength={PASTE_MAX}
                  placeholder={en ? "Paste text here" : "把文字貼在這裡"}
                  value={pasteText} onValueChange={(v) => { setPasteText(v); setPasteResult(null); setFileNote(null); }}
                  description={`${[...pasteText].length} / ${PASTE_MAX}`}
                />
                <input
                  ref={fileRef} type="file" accept={ACCEPT} className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="flat" isDisabled={!!busy} isLoading={busy === "file"}
                    startContent={busy === "file" ? undefined : <FontAwesomeIcon icon={faFileArrowUp} className="text-tiny" />}
                    onPress={() => fileRef.current?.click()}>
                    {en ? "Upload a file" : "上傳檔案"}
                  </Button>
                  <Button size="sm" color="primary" variant="flat" isDisabled={pasteText.trim().length < 4 || !!busy}
                    isLoading={busy === "paste"} onPress={runPaste}>
                    {en ? "Pick out this card's content" : "挑出這張卡的內容"}
                  </Button>
                  <span className="text-tiny text-default-400">Word / PPT / Excel / PDF / Markdown / txt</span>
                </div>
                {fileNote && <p className="m-0 text-tiny text-default-500">{fileNote}</p>}

                {pasteResult && (
                  <div className="rounded-medium border border-divider p-3 text-small">
                    {pasteResult.proposal ? (
                      <>
                        <div className="text-tiny font-semibold text-default-600">{en ? "Found in your text" : "在你的文字裡找到"}</div>
                        <p className="m-0 mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-tiny text-default-700">{pasteResult.proposal}</p>
                        <Button
                          size="sm" variant="flat" className="mt-2" isDisabled={pasteResult.applied}
                          startContent={<FontAwesomeIcon icon={faWandMagicSparkles} className="text-tiny" />}
                          onPress={() => { setBody(pasteResult.proposal!); setPasteResult((r) => (r ? { ...r, applied: true } : r)); }}
                        >
                          {pasteResult.applied ? (en ? "Applied — edit on the left" : "已套用，可在左邊再改") : applyLabel(pasteResult.proposal)}
                        </Button>
                      </>
                    ) : (
                      <p className="m-0 text-default-700">
                        {en ? "Nothing in your text belongs to this card." : "你的文字裡，找不到屬於這張卡的內容。"}
                      </p>
                    )}
                    {pasteResult.dropped > 0 && (
                      <p className="m-0 mt-2 text-tiny text-default-500">
                        {en
                          ? `${pasteResult.dropped} passage(s) were held back because the AI reworded your text.`
                          : `有 ${pasteResult.dropped} 段被擋下（AI 改寫了你的原文，所以沒採用）。`}
                      </p>
                    )}
                    {pasteResult.truncated && (
                      <p className="m-0 mt-2 text-tiny text-default-500">
                        {en ? "Longer than this card's limit — only the first part is included." : "超過這張卡的字數上限，只帶入前段。"}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </ModalBody>

        {error && (
          <div className="mx-6 mb-2 rounded-medium border border-danger-200 bg-danger-50 px-3 py-2 text-tiny text-danger-700">{error}</div>
        )}
        <ModalFooter className="justify-between">
          <Button size="sm" variant="light" isDisabled={!!busy} onPress={doRemove}>
            {isCustom ? (en ? "Delete this card" : "刪除這張卡片") : (en ? "Take out of the book" : "從定位書拿掉")}
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="flat" onPress={requestClose} isDisabled={busy === "save"}>{en ? "Cancel" : "取消"}</Button>
            <Button size="sm" color="primary" isDisabled={!dirty || !!busy} isLoading={busy === "save"} onPress={doSave}>
              {en ? "Save" : "儲存"}
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
