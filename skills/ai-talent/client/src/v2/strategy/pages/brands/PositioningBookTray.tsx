/**
 * 品牌定位頁的卡片牆——「品牌定位書」。
 *
 * 2026-10-10（CJ「跟通路一樣的呈現方式，每一個卡片按進去可以對話式修改，全部完成後像活動
 * 定位一樣產出草擬提案」「第一次進來可以是空白」「用戶可以新增卡片，自由在不同卡片之間排列」）。
 *
 * 卡片長相沿用 PositioningCard（跟通路角色、產品／活動定位同一張卡）。這裡多三件事：
 *   · 拖曳換順序——順序就是提案的章節順序
 *   · 「新增卡片」：把拿掉的預設卡加回來，或開一張自己命名的卡
 *   · 右上「草擬提案」：把卡片照順序寫成一份定位書
 *
 * 卡片的定義、字數上限、從原本定位欄位整理文字的規則都在伺服器
 * （server/strategy/core/positioning/positioningBook.ts），這裡不抄第二份。
 */
import React from "react";
import {
  faBullseye, faMagnifyingGlassChart, faUsers, faTableList, faBolt, faGem, faFlag, faQuoteLeft, faPenNib,
  faScroll, faStickyNote, faPlus, faFileLines, faRotateLeft,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { PositioningCard, SectionLabel, truncate } from "./PositioningGrid";
import { DraftProposalButton, useDraftProgress } from "../../components/events/CampaignProposalPanel";
import PositioningBookModal, { type BookCardView } from "../../components/positioning/PositioningBookModal";
import PositioningBookProposalModal from "../../components/positioning/PositioningBookProposalModal";
import { readStoredDirector } from "../../lib/strategistDirectors";

const ICONS: Record<string, any> = {
  challenge: faBullseye, audit: faMagnifyingGlassChart, audience: faUsers, competitors: faTableList,
  tension: faBolt, bestSelf: faGem, proposition: faFlag, voice: faQuoteLeft, tagline: faPenNib, manifesto: faScroll,
};

type CustomSegment = { id: string; title: string; fields: { key: string; label: string; value: string }[] };

export default function PositioningBookTray({
  brandId, brandName, customSegments, onEditCustomSegment, onDeleteCustomSegment, onOpenSegment,
}: {
  brandId: number;
  brandName: string;
  /** 從上傳的定位文件建立、套不進任何卡片的內容（positioning._customSegments）。照舊顯示、照舊編輯。 */
  customSegments?: CustomSegment[];
  onEditCustomSegment?: (segmentId: string) => void;
  onDeleteCustomSegment?: (segmentId: string) => void;
  /** 打開原本的定位欄位（卡片裡「編輯原始資料」的連結）。 */
  onOpenSegment: (segmentId: string) => void;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  const utils = (trpc as any).useUtils?.() ?? null;
  const bookQ = (trpc as any).positioningBook.get.useQuery({ brandId }, { refetchOnWindowFocus: false });
  const addMut = (trpc as any).positioningBook.addCard.useMutation();
  const reorderMut = (trpc as any).positioningBook.reorder.useMutation();
  const draftMut = (trpc as any).positioningBook.draftProposal.useMutation();

  const cards: BookCardView[] = bookQ.data?.cards ?? [];
  const hidden: { id: string; title: string; titleEn: string }[] = bookQ.data?.hidden ?? [];
  const proposal: { text: string; at: string; stale: boolean } | null = bookQ.data?.proposal ?? null;
  const minToDraft: number = bookQ.data?.minCardsToDraft ?? 3;

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");
  const [showProposal, setShowProposal] = React.useState(false);
  const [error, setError] = React.useState("");
  // 拖曳中的順序先在畫面上換，放開才送出——送出失敗就照伺服器的順序畫回去。
  const [localOrder, setLocalOrder] = React.useState<string[] | null>(null);
  const dragId = React.useRef<string | null>(null);

  const refresh = async () => {
    await bookQ.refetch?.();
    // 卡片存檔後品牌大腦變了；scope.active 也帶著 positioning，一起重抓。
    utils?.scope?.active?.invalidate?.();
  };

  const ordered = React.useMemo(() => {
    if (!localOrder) return cards;
    const byId = new Map(cards.map((c) => [c.id, c]));
    return localOrder.map((id) => byId.get(id)).filter((c): c is BookCardView => !!c);
  }, [cards, localOrder]);

  const filledCount = cards.filter((c) => c.body || c.derived).length;
  const editing = cards.find((c) => c.id === editingId) ?? null;

  const onDragOver = (overId: string) => (e: React.DragEvent) => {
    const from = dragId.current;
    if (!from) return;
    e.preventDefault();
    if (from === overId) return;
    const ids = (localOrder ?? cards.map((c) => c.id)).slice();
    const a = ids.indexOf(from), b = ids.indexOf(overId);
    if (a < 0 || b < 0) return;
    ids.splice(a, 1); ids.splice(b, 0, from);
    setLocalOrder(ids);
  };
  const onDragEnd = async () => {
    dragId.current = null;
    const next = localOrder;
    if (!next || next.join("|") === cards.map((c) => c.id).join("|")) { setLocalOrder(null); return; }
    setError("");
    try {
      await reorderMut.mutateAsync({ brandId, order: next });
      await refresh();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setLocalOrder(null); }
  };

  const add = async (input: { preset?: string; title?: string }) => {
    setError("");
    try {
      const r = await addMut.mutateAsync({ brandId, ...input });
      setAdding(false); setNewTitle("");
      await refresh();
      // 自己開的卡是空的，直接進去寫；加回來的預設卡留在牆上就好。
      if (input.title && r?.cardId) setEditingId(r.cardId);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const [draftBusy, setDraftBusy] = React.useState(false);
  const draftPct = useDraftProgress(draftBusy);
  const draft = async () => {
    if (draftBusy) return;
    setError(""); setDraftBusy(true);
    try {
      await draftMut.mutateAsync({ brandId, agentId: readStoredDirector(brandId, "brand") ?? undefined });
      await bookQ.refetch?.();
      setShowProposal(true);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setDraftBusy(false); }
  };

  const canDraft = filledCount >= minToDraft;

  return (
    <div style={{ padding: "8px 0 24px", display: "flex", flexDirection: "column", gap: 36 }}>
      <div>
        <div className="mb-3 flex items-center justify-end gap-2">
          {proposal && (
            <DraftProposalButton
              en={en} icon={faFileLines} progress={null} onPress={() => setShowProposal(true)}
              label={proposal.stale ? (en ? "Proposal (cards changed)" : "提案（卡片已更新）") : (en ? "Proposal" : "提案")}
            />
          )}
          <DraftProposalButton
            en={en} icon={proposal ? faRotateLeft : faFileLines} progress={draftPct} onPress={draft} disabled={!canDraft}
            label={proposal ? (en ? "Redraft" : "重新草擬") : (en ? "Draft proposal" : "草擬提案")}
            title={canDraft
              ? (en ? "Write the cards, in this order, into a positioning proposal" : "把卡片照這個順序寫成一份定位書提案")
              : (en ? `Fill at least ${minToDraft} cards first` : `至少要有 ${minToDraft} 張卡片有內容`)}
          />
        </div>
        <SectionLabel
          label={en ? "Brand positioning book" : "品牌定位書"}
          counter={`${filledCount} / ${cards.length}`}
          intro={en
            ? "Each card is one chapter of the positioning book. Open a card to work it out with the strategist; drag cards to change the chapter order; add or remove cards to fit how you present. When enough cards are written, draft the proposal at the top right."
            : "每張卡片是定位書的一章。點進去可以跟策略顧問一起寫；拖曳卡片可以換章節順序；卡片可以自己加、也可以拿掉。寫得差不多了，右上角可以草擬提案。"}
        />
        {error && (
          <div className="mb-3 rounded-medium border border-danger-200 bg-danger-50 px-3 py-2 text-tiny text-danger-700">{error}</div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {ordered.map((c, i) => {
            const text = c.body || c.derived;
            const title = en ? c.titleEn : c.title;
            return (
              <div
                key={c.id}
                draggable
                onDragStart={(e) => { dragId.current = c.id; e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={onDragOver(c.id)}
                onDragEnd={onDragEnd}
                onDrop={(e) => e.preventDefault()}
                className="flex"
                style={{ opacity: dragId.current === c.id && localOrder ? 0.5 : 1, cursor: "grab" }}
                title={en ? "Drag to reorder" : "拖曳可以換順序"}
              >
                <div className="flex-1 min-w-0 [&>div]:h-full">
                  <PositioningCard
                    label={`${i + 1} ${title}`}
                    icon={c.preset ? ICONS[c.preset] ?? faStickyNote : faStickyNote}
                    onClick={() => setEditingId(c.id)}
                    hasContent={!!text}
                    headline={text ? truncate(text.split("\n")[0]!.replace(/^[^：]{1,6}：/, ""), 50) : null}
                    preview={text
                      ? <span style={{ whiteSpace: "pre-line" }}>{truncate(text, 90)}</span>
                      : <span style={{ fontStyle: "italic" }}>{en ? c.askEn : c.ask}</span>}
                    sourceLabel={
                      c.upstreamChanged ? (en ? "Earlier cards changed since" : "前面的卡片後來改過")
                      : c.body ? undefined
                      : c.derived ? (en ? "From existing positioning" : "來自現有定位資料")
                      : undefined
                    }
                  />
                </div>
              </div>
            );
          })}

          {adding ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-neutral-300 bg-white p-3" style={{ minHeight: 124 }}>
              {hidden.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-neutral-500">{en ? "Put back" : "加回來"}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {hidden.map((p) => (
                      <button
                        key={p.id} type="button" disabled={addMut.isPending}
                        onClick={() => add({ preset: p.id })}
                        className="rounded-full border border-neutral-300 px-2.5 py-1 text-[11.5px] text-neutral-700 transition-colors hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-50"
                      >
                        {en ? p.titleEn : p.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <span className="text-[11px] font-semibold text-neutral-500">{en ? "Your own card" : "自己開一張"}</span>
              <input
                autoFocus
                value={newTitle}
                maxLength={24}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && newTitle.trim()) void add({ title: newTitle });
                  if (e.key === "Escape") { setAdding(false); setNewTitle(""); }
                }}
                placeholder={en ? "Card title, e.g. Brand architecture" : "卡片標題，例如：品牌架構"}
                className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-neutral-900"
              />
              <div className="mt-auto flex justify-end gap-2">
                <button type="button" onClick={() => { setAdding(false); setNewTitle(""); }}
                  className="rounded-lg px-2.5 py-1 text-[12px] text-neutral-600 hover:text-neutral-900">
                  {en ? "Cancel" : "取消"}
                </button>
                <button type="button" disabled={!newTitle.trim() || addMut.isPending} onClick={() => add({ title: newTitle })}
                  className="rounded-lg bg-neutral-900 px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-40">
                  {en ? "Add" : "新增"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 text-neutral-500 hover:border-neutral-900 hover:text-neutral-900 transition-colors"
              style={{ minHeight: 124, padding: 16 }}
            >
              <FontAwesomeIcon icon={faPlus} style={{ fontSize: 16 }} />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{en ? "Add a card" : "新增卡片"}</span>
            </button>
          )}
        </div>
      </div>

      {(customSegments ?? []).length > 0 && (
        <div>
          <SectionLabel
            label={en ? "From your documents" : "來自你的定位文件"}
            counter={String(customSegments!.length)}
            intro={en
              ? "Content from an uploaded document that did not fit any card. Tasks still read it; it is not part of the proposal."
              : "上傳的定位文件裡，套不進任何一張卡片的內容。產文時一樣會讀到，但不會寫進提案。"}
          />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {customSegments!.map((seg) => (
              <PositioningCard
                key={seg.id}
                label={seg.title}
                icon={faStickyNote}
                onClick={() => onEditCustomSegment?.(seg.id)}
                hasContent
                preview={
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                    {seg.fields.slice(0, 4).map((f) => (
                      <li key={f.key}>
                        <strong style={{ color: "#171717", fontWeight: 600 }}>{f.label}：</strong>
                        {truncate(f.value, 60)}
                      </li>
                    ))}
                  </ul>
                }
                onDelete={onDeleteCustomSegment ? () => onDeleteCustomSegment(seg.id) : undefined}
                headline={seg.fields[0]?.value ? truncate(seg.fields[0].value, 50) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      <PositioningBookModal
        open={!!editing}
        card={editing}
        brandId={brandId}
        onClose={() => setEditingId(null)}
        onSaved={refresh}
        onOpenSegment={(segId) => { setEditingId(null); onOpenSegment(segId); }}
      />
      <PositioningBookProposalModal
        open={showProposal && !!proposal}
        proposal={proposal}
        brandName={brandName}
        drafting={draftPct}
        onRedraft={draft}
        onClose={() => setShowProposal(false)}
      />
    </div>
  );
}
