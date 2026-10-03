/**
 * ChannelRoleModal — 編輯「某個平台在品牌裡的角色」（通路角色）。
 *
 * 2026-10-03（CJ「用戶在不同平台，想溝通的訊息不一樣，不同平台的定位不同，應該在哪裡設定？」
 * →「樣式要雷同於品牌定位的任務卡，也要讓用戶可以直接在這邊與 AI 討論出該平台的定位，
 * 也要可以直接貼上其他討論好的文字串」）。
 *
 * 左邊是五格表單（真正會被存下來、被產文讀到的就只有這五格）；右邊是兩條把內容弄進表單的路：
 *   · 與 AI 討論  —— 一來一回，AI 覺得資訊夠了（或用戶說「幫我整理」）才附一份草案
 *   · 貼上現成文字 —— 別處（ChatGPT / Claude…）已經討論好的對話或說明，逐字對映到五格
 *
 * ── 幾個刻意的選擇 ────────────────────────────────────────────────────
 * 1. **兩條路都只是「提案」。** 按「套用到欄位」只是把值放進左邊表單，還沒存；用戶可以再改，
 *    按「儲存」才寫入。定位是所有該平台任務卡的上游，AI 的草案不能不經過人就生效。
 * 2. **會取代用戶已經寫的格時要講。** 套用鈕上直接標「會取代已寫的 N 格」，而不是靜靜蓋掉。
 * 3. **貼上那條只准引用。** 伺服器端逐字比對，改寫過的格會整格丟掉並列在「被擋下」——
 *    比起一句順過的話默默變成品牌對外的說法，少一格才誠實。
 * 4. **送出用 Ctrl／⌘+Enter，不用單獨 Enter。** 中文輸入法選字時按 Enter 會誤送。
 */
import React from "react";
import { Avatar, Button, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperPlane, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { Icon } from "../../../platform/components/icons";
import {
  CHANNELS, CHANNEL_ROLE_FIELDS, EMPTY_ROLE, mergeProposal, normalizeRole, overwrittenKeys, roleIsEmpty,
  type ChannelId, type ChannelRoleValue,
} from "../../lib/channelRoles";

type Msg = { role: "user" | "assistant"; content: string; proposal?: ChannelRoleValue | null; applied?: boolean };
type PasteResult = {
  proposal: ChannelRoleValue | null; missing: string[]; dropped: string[]; truncated: string[];
  applied?: boolean;
};

export default function ChannelRoleModal({
  open, channel, brandId, saved, onClose, onSaved,
}: {
  open: boolean;
  channel: ChannelId | null;
  brandId: number | null;
  /** 目前已存的內容（positioning.channelRoles[channel]）。 */
  saved: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  const meta = CHANNELS.find((c) => c.id === channel) ?? null;
  const label = meta ? (en ? meta.en : meta.zh) : "";

  const [form, setForm] = React.useState<ChannelRoleValue>(EMPTY_ROLE);
  const [baseline, setBaseline] = React.useState<ChannelRoleValue>(EMPTY_ROLE);
  const [tab, setTab] = React.useState<"chat" | "paste">("chat");
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [draft, setDraft] = React.useState("");
  const [pasteText, setPasteText] = React.useState("");
  const [pasteResult, setPasteResult] = React.useState<PasteResult | null>(null);
  const [busy, setBusy] = React.useState<"chat" | "paste" | "save" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement | null>(null);

  // 每次開啟都重讀一次已存內容，不沿用上一個平台的殘留（含對話與貼上的文字）。
  React.useEffect(() => {
    if (!open) return;
    const v = normalizeRole(saved);
    setForm(v); setBaseline(v);
    setTab("chat"); setMsgs([]); setDraft(""); setPasteText(""); setPasteResult(null);
    setBusy(null); setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, channel]);

  React.useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  // 指派來討論的顧問：這個通路的第一位策略總監（mos_db 真實 agent，名字／職稱／頭像都是原文）。
  const directorsQ = trpc.strategistChat.listDirectors.useQuery(
    { brandId: brandId ?? 0, scope: channel ?? undefined },
    { enabled: open && !!brandId && !!channel, refetchOnWindowFocus: false, staleTime: 60_000 },
  );
  const director = (directorsQ.data?.directors ?? [])[0] ?? null;
  const agentAvatar = (size: string) => (
    <Avatar
      src={director?.avatarUrl || undefined}
      name={director?.name}
      isBordered={false}
      className={`${size} shrink-0`}
      showFallback
    />
  );

  const discuss = trpc.channelRole.discuss.useMutation();
  const importPaste = trpc.channelRole.importPaste.useMutation();
  const save = trpc.channelRole.save.useMutation();

  const dirty = CHANNEL_ROLE_FIELDS.some((f) => form[f.key] !== baseline[f.key]);

  const requestClose = () => {
    if (busy === "save") return;
    if (dirty && !window.confirm(en ? "Discard your unsaved changes?" : "還有沒儲存的修改，確定要放棄嗎？")) return;
    onClose();
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || !channel || !brandId || busy) return;
    setError(null);
    const next: Msg[] = [...msgs, { role: "user", content: t }];
    setMsgs(next); setDraft(""); setBusy("chat");
    try {
      const r = await discuss.mutateAsync({
        brandId, channel,
        current: form,
        agentId: director?.agentId,
        messages: next.map((m) => ({ role: m.role, content: m.content })),
      });
      setMsgs([...next, { role: "assistant", content: r.reply, proposal: r.proposal ? normalizeRole(r.proposal) : null }]);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      // 送出失敗：把用戶那句還給輸入框，不要讓他重打。
      setMsgs(msgs); setDraft(t);
    } finally { setBusy(null); }
  };

  const runPaste = async () => {
    if (!channel || !brandId || !pasteText.trim() || busy) return;
    setError(null); setPasteResult(null); setBusy("paste");
    try {
      const r = await importPaste.mutateAsync({ brandId, channel, text: pasteText });
      setPasteResult({
        proposal: r.proposal ? normalizeRole(r.proposal) : null,
        missing: r.missing, dropped: r.dropped, truncated: r.truncated,
      });
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setBusy(null); }
  };

  const apply = (proposal: ChannelRoleValue, mark: () => void) => {
    setForm((cur) => mergeProposal(cur, proposal));
    mark();
  };

  const doSave = async () => {
    if (!channel || !brandId || busy) return;
    setError(null); setBusy("save");
    try {
      await save.mutateAsync({ brandId, channel, role: form });
      onSaved(); onClose();
    } catch (e: any) {
      setError(String(e?.message ?? e)); setBusy(null);
    }
  };

  const doClear = async () => {
    if (!channel || !brandId || busy) return;
    if (!window.confirm(en ? `Clear the ${label} role?` : `確定要清除「${label}」的通路角色嗎？`)) return;
    setError(null); setBusy("save");
    try {
      await save.mutateAsync({ brandId, channel, role: EMPTY_ROLE });
      onSaved(); onClose();
    } catch (e: any) {
      setError(String(e?.message ?? e)); setBusy(null);
    }
  };

  const proposalPreview = (p: ChannelRoleValue) => (
    <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-tiny text-default-700">
      {CHANNEL_ROLE_FIELDS.filter((f) => p[f.key]).map((f) => (
        <li key={f.key}>
          <strong className="font-semibold text-foreground">{en ? f.en : f.zh}：</strong>{p[f.key]}
        </li>
      ))}
    </ul>
  );

  const applyLabel = (p: ChannelRoleValue) => {
    const n = overwrittenKeys(form, p).length;
    if (n === 0) return en ? "Apply to the fields" : "套用到欄位";
    return en ? `Apply (replaces ${n} you wrote)` : `套用到欄位（會取代你已寫的 ${n} 格）`;
  };

  const starters = en
    ? ["Draft it for me from what you know about the brand", "Who is actually on this platform?", "What should this platform NOT talk about?"]
    : ["依你對品牌的了解，先幫我擬一份草案", "這個平台上的人，到底是誰？", "有哪些話不該在這個平台說？"];

  return (
    <Modal
      isOpen={open}
      onOpenChange={(v) => { if (!v) requestClose(); }}
      size="5xl"
      scrollBehavior="inside"
      isDismissable={busy !== "save"}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-medium font-semibold">
            {meta && <Icon name={meta.icon} size={16} />}
            {en ? `${label} — role in the brand` : `${label} 的通路角色`}
          </span>
          <span className="text-tiny font-normal text-default-500">
            {en
              ? "What this platform does for the brand, who it talks to, and what it says. Only tasks that publish to this platform read it — shared brand positioning stays where it is."
              : "這個平台在品牌裡負責什麼、對誰說、說什麼。只有發在這個平台的任務會讀到它——品牌共通的定位仍然放在原本的卡片。"}
          </span>
        </ModalHeader>

        <ModalBody className="gap-4 md:flex-row">
          {/* 左：五格表單（真正會存、會被讀到的就這五格） */}
          <div className="flex flex-1 flex-col gap-3 md:min-w-0">
            {CHANNEL_ROLE_FIELDS.map((f) => (
              <Textarea
                key={f.key}
                size="sm"
                variant="bordered"
                radius="md"
                label={en ? f.en : f.zh}
                labelPlacement="outside"
                placeholder={en ? f.hintEn : f.hintZh}
                minRows={f.rows}
                maxRows={8}
                maxLength={f.max}
                value={form[f.key]}
                onValueChange={(v) => setForm((cur) => ({ ...cur, [f.key]: v }))}
                description={`${[...form[f.key]].length} / ${f.max}`}
              />
            ))}
          </div>

          {/* 右：把內容弄進左邊表單的兩條路 */}
          <div className="flex flex-1 flex-col gap-3 rounded-large border border-divider p-3 md:min-w-0">
            <div className="flex gap-1 rounded-medium bg-default-100 p-1" role="tablist">
              {([["chat", en ? "Discuss with AI" : "與 AI 討論"], ["paste", en ? "Paste existing text" : "貼上現成文字"]] as const).map(([id, text]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`flex-1 rounded-small px-3 py-1.5 text-small font-medium transition-colors ${
                    tab === id ? "bg-white text-foreground shadow-small" : "text-default-500 hover:text-foreground"
                  }`}
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
                <div className="flex max-h-[380px] flex-1 flex-col gap-3 overflow-y-auto pr-1">
                  <div className="flex items-end gap-2">
                    {director && agentAvatar("h-7 w-7")}
                    <div className="rounded-medium bg-default-100 px-3 py-2 text-small text-default-700">
                      {en
                        ? `Let's work out the brand's role on ${label}. Tell me who you want to reach here and what the brand should get out of it — or have me draft one first.`
                        : `我們來討論品牌在 ${label} 的定位。可以先說說：想在這個平台接觸誰、希望靠它達成什麼？或是直接讓我先擬一份草案。`}
                    </div>
                  </div>
                  {msgs.length === 0 && (
                    <div className="flex flex-wrap gap-2">
                      {starters.map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={!!busy}
                          onClick={() => send(s)}
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
                      <div
                        className={`max-w-[90%] whitespace-pre-wrap rounded-medium px-3 py-2 text-small ${
                          m.role === "user" ? "bg-neutral-900 text-white" : "bg-default-100 text-default-800"
                        }`}
                      >
                        {m.content}
                        {m.role === "assistant" && m.proposal && (
                          <div className="mt-2 border-t border-divider pt-2">
                            <div className="text-tiny font-semibold text-default-600">{en ? "Draft" : "草案"}</div>
                            {proposalPreview(m.proposal)}
                            <Button
                              size="sm"
                              variant="flat"
                              className="mt-2"
                              isDisabled={m.applied}
                              startContent={<FontAwesomeIcon icon={faWandMagicSparkles} className="text-tiny" />}
                              onPress={() => apply(m.proposal!, () => setMsgs((all) => all.map((x, j) => (j === i ? { ...x, applied: true } : x))))}
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
                    size="sm"
                    variant="bordered"
                    radius="md"
                    minRows={2}
                    maxRows={6}
                    maxLength={6000}
                    placeholder={en ? "Type here — Ctrl/⌘ + Enter to send" : "在這裡輸入——Ctrl／⌘ + Enter 送出"}
                    value={draft}
                    onValueChange={setDraft}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        void send(draft);
                      }
                    }}
                  />
                  <Button
                    isIconOnly
                    color="primary"
                    aria-label={en ? "Send" : "送出"}
                    isDisabled={!draft.trim() || !!busy}
                    isLoading={busy === "chat"}
                    onPress={() => send(draft)}
                  >
                    <FontAwesomeIcon icon={faPaperPlane} />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[320px] flex-1 flex-col gap-3">
                <p className="m-0 text-tiny text-default-500">
                  {en
                    ? `Paste a conversation you already had (ChatGPT, Claude…) or your own notes about ${label}. The five fields are filled with your exact words only — nothing is rewritten or added.`
                    : `貼上你已經在別處（ChatGPT、Claude…）討論好的對話，或自己寫的 ${label} 說明。五個欄位只會填入你貼的原文，不會改寫、也不會補寫。`}
                </p>
                <Textarea
                  variant="bordered"
                  radius="md"
                  minRows={10}
                  maxRows={14}
                  maxLength={30000}
                  placeholder={en ? "Paste text here" : "把文字貼在這裡"}
                  value={pasteText}
                  onValueChange={(v) => { setPasteText(v); setPasteResult(null); }}
                  description={`${[...pasteText].length} / 30000`}
                />
                <Button
                  size="sm"
                  variant="flat"
                  className="self-start"
                  isDisabled={pasteText.trim().length < 4 || !!busy}
                  isLoading={busy === "paste"}
                  onPress={runPaste}
                >
                  {en ? "Sort into the fields" : "整理成欄位"}
                </Button>

                {pasteResult && (
                  <div className="rounded-medium border border-divider p-3 text-small">
                    {pasteResult.proposal ? (
                      <>
                        <div className="text-tiny font-semibold text-default-600">
                          {en ? "Found in your text" : "在你貼的內容裡找到"}
                        </div>
                        {proposalPreview(pasteResult.proposal)}
                        <Button
                          size="sm"
                          variant="flat"
                          className="mt-2"
                          isDisabled={pasteResult.applied}
                          startContent={<FontAwesomeIcon icon={faWandMagicSparkles} className="text-tiny" />}
                          onPress={() => apply(pasteResult.proposal!, () => setPasteResult((r) => (r ? { ...r, applied: true } : r)))}
                        >
                          {pasteResult.applied ? (en ? "Applied — edit on the left" : "已套用，可在左邊再改") : applyLabel(pasteResult.proposal)}
                        </Button>
                      </>
                    ) : (
                      <p className="m-0 text-default-700">
                        {en ? "Couldn't find anything that fits these five fields in your text." : "你貼的內容裡，找不到能放進這五格的句子。"}
                      </p>
                    )}
                    {pasteResult.missing.length > 0 && pasteResult.proposal && (
                      <p className="m-0 mt-2 text-tiny text-default-500">
                        {en ? "Not in your text: " : "你貼的內容沒有這幾項："}{pasteResult.missing.join("、")}
                        {en ? " — fill them in yourself, or ask the AI." : "——可以自己補，或到「與 AI 討論」問。"}
                      </p>
                    )}
                    {pasteResult.dropped.length > 0 && (
                      <p className="m-0 mt-2 text-tiny text-default-500">
                        {en ? "Held back (the AI reworded your text, so it was not used): " : "被擋下（AI 改寫了你的原文，所以沒採用）："}
                        {pasteResult.dropped.join("、")}
                      </p>
                    )}
                    {pasteResult.truncated.length > 0 && (
                      <p className="m-0 mt-2 text-tiny text-default-500">
                        {en ? "Cut to the length limit: " : "超過單格字數上限、只帶入前段："}{pasteResult.truncated.join("、")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </ModalBody>

        {error && (
          <div className="mx-6 mb-2 rounded-medium border border-danger-200 bg-danger-50 px-3 py-2 text-tiny text-danger-700">
            {error}
          </div>
        )}
        <ModalFooter className="justify-between">
          <div>
            {!roleIsEmpty(baseline) && (
              <Button size="sm" variant="light" isDisabled={!!busy} onPress={doClear}>
                {en ? "Clear this platform" : "清除這個平台"}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="flat" onPress={requestClose} isDisabled={busy === "save"}>
              {en ? "Cancel" : "取消"}
            </Button>
            <Button size="sm" color="primary" isDisabled={!dirty || !!busy} isLoading={busy === "save"} onPress={doSave}>
              {en ? "Save" : "儲存"}
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
