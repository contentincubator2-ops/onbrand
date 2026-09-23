/**
 * strategy-editor — 策略層五個 tray 共用的編輯／核准／紀錄介面。
 *
 * 2026-09-23 (CJ「策略層的每一個 mission tray，內容的任務卡片都是可以被用戶
 * 編輯，並且會有權限和紀錄的」)。
 *
 * ── 這個元件只管機制，不管內容 ───────────────────────────────────────
 * 欄位叫什麼、是單行還是多行、怎麼翻譯，都由呼叫端傳進來。機制（送出提案、
 * 顯示待審差異、核准／退回、看紀錄）在這裡。
 *
 * 這條界線很重要：如果欄位標籤也寫在這裡，這支就會變成一個「知道五種資料所有
 * 欄位」的上帝元件，而那正是收斂之前的狀況換一個地方重演。
 *
 * ── 送出按鈕寫的是「送出審核」而不是「儲存」 ─────────────────────────
 * 需要核准的資料，改完不會立刻生效。按鈕如果寫「儲存」，按的人會以為已經上線
 * 了——那是這個流程裡最容易出事的誤解。不需要核准的（用詞）才寫「儲存」。
 */
import React, { useState } from "react";
import { Check, History, Pencil, X } from "lucide-react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import { ErrorNote } from "../ui";
import { useT } from "../lang";

export type StrategyEntityId = "brand_asset" | "solution" | "wording" | "regulation" | "fact";

export interface EditField {
  /** 後端欄位名。必須在 strategyRegistry 的白名單裡，否則送出會被擋下。 */
  name: string;
  label: [en: string, zh: string];
  /** 多行文字。預設單行。 */
  multiline?: boolean;
  /** 日期欄位（YYYY-MM-DD）。 */
  date?: boolean;
  /** 只能從這幾個值裡選。 */
  options?: Array<{ value: string; label: [en: string, zh: string] }>;
  hint?: [en: string, zh: string];
}

/** 哪幾種資料改完要等核准。跟後端 strategyRegistry 一致。 */
const NEEDS_APPROVAL: Record<StrategyEntityId, boolean> = {
  brand_asset: true, solution: true, wording: false, regulation: true, fact: true,
};

export function StrategyEditButton({
  entity, entityId, fields, current, title, onChanged,
}: {
  entity: StrategyEntityId;
  entityId: number;
  fields: EditField[];
  current: Record<string, any>;
  title: [en: string, zh: string];
  onChanged?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 py-1 text-[12.5px] font-medium text-neutral-700 hover:border-neutral-500"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        {t("Edit", "編輯")}
      </button>
      {open ? (
        <StrategyEditModal
          entity={entity} entityId={entityId} fields={fields} current={current} title={title}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); onChanged?.(); }}
        />
      ) : null}
    </>
  );
}

function StrategyEditModal({
  entity, entityId, fields, current, title, onClose, onSaved,
}: {
  entity: StrategyEntityId;
  entityId: number;
  fields: EditField[];
  current: Record<string, any>;
  title: [en: string, zh: string];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const save = trpc.hub.admin.editStrategyItem.useMutation();
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const f of fields) d[f.name] = current?.[f.name] == null ? "" : String(current[f.name]);
    return d;
  });
  const gated = NEEDS_APPROVAL[entity];
  const dirty = fields.some((f) => draft[f.name] !== (current?.[f.name] == null ? "" : String(current[f.name])));

  return (
    <Modal isOpen size="2xl" scrollBehavior="inside" onClose={() => !save.isPending && onClose()}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5">
          <span className="text-[16px] font-semibold">{t(title[0], title[1])}</span>
          <span className="text-[12px] font-normal leading-relaxed text-neutral-500">
            {gated
              ? t(
                  "Changes here go for approval first. Nothing reps or the AI read changes until someone approves it.",
                  "這裡的修改會先送審。在有人核准之前，業務與 AI 讀到的內容完全不會變。",
                )
              : t("Changes here take effect on the next post a rep writes.", "這裡的修改，業務寫的下一篇就會套用。")}
          </span>
        </ModalHeader>

        <ModalBody>
          <div className="space-y-3">
            {fields.map((f) => (
              <div key={f.name}>
                <label className="text-[12px] font-medium text-neutral-700">{t(f.label[0], f.label[1])}</label>
                {f.options ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {f.options.map((o) => {
                      const on = draft[f.name] === o.value;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => setDraft((p) => ({ ...p, [f.name]: o.value }))}
                          className={
                            "rounded-full border px-2.5 py-1 text-[12.5px] " +
                            (on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-700 hover:border-neutral-500")
                          }
                        >
                          {t(o.label[0], o.label[1])}
                        </button>
                      );
                    })}
                  </div>
                ) : f.multiline ? (
                  <textarea
                    value={draft[f.name] ?? ""}
                    rows={3}
                    onChange={(e) => setDraft((p) => ({ ...p, [f.name]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-[13px] leading-relaxed outline-none focus:border-orange-500"
                  />
                ) : (
                  <input
                    type={f.date ? "date" : "text"}
                    value={draft[f.name] ?? ""}
                    onChange={(e) => setDraft((p) => ({ ...p, [f.name]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-[13px] outline-none focus:border-orange-500"
                  />
                )}
                {f.hint ? (
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-neutral-500">{t(f.hint[0], f.hint[1])}</p>
                ) : null}
              </div>
            ))}
          </div>
          <ErrorNote error={save.error} />
        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={save.isPending}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-[13px] text-neutral-700 disabled:opacity-50"
          >
            {t("Cancel", "取消")}
          </button>
          <button
            type="button"
            disabled={!dirty || save.isPending}
            onClick={async () => {
              const changes: Record<string, string> = {};
              for (const f of fields) changes[f.name] = draft[f.name] ?? "";
              await save.mutateAsync({ entity, entityId, changes });
              onSaved();
            }}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
          >
            {save.isPending
              ? t("Sending…", "送出中…")
              : gated ? t("Send for approval", "送出審核") : t("Save", "儲存")}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/**
 * 待審面板：逐欄的前後差異，加上核准／退回。
 *
 * 審核的人看的是**差異**，不是新版全文——「哪裡變了」比「現在長怎樣」重要
 * 得多。這一點在產品那邊已經證明有效。
 */
export function StrategyPendingPanel({
  entity, entityId, fieldLabel, onDone,
}: {
  entity: StrategyEntityId;
  entityId: number;
  fieldLabel: (field: string) => string;
  onDone?: () => void;
}) {
  const t = useT();
  const q = trpc.hub.admin.strategyPending.useQuery({ entity }, { staleTime: 10_000 });
  const act = trpc.hub.admin.approveStrategyItem.useMutation();
  const mine = q.data?.pending.find((p) => p.entityId === entityId);
  if (!mine) return null;

  const isAuthor = (q.data?.me ?? "").toLowerCase() === mine.proposedBy.toLowerCase();
  const canApprove = Boolean(q.data?.canApprove) && !isAuthor;

  return (
    <div className="mb-3 rounded-lg border border-orange-300 bg-orange-50 p-3">
      <div className="text-[12px] font-semibold text-orange-900">
        {t(
          `Waiting for approval — proposed by ${mine.proposedBy}`,
          `等待核准——由 ${mine.proposedBy} 提出`,
        )}
      </div>
      <ul className="mt-2 space-y-1">
        {mine.changes.map((c, i) => (
          <li key={i} className="text-[12.5px] leading-relaxed">
            <span className="text-neutral-500">{fieldLabel(c.field)}: </span>
            <span className="text-red-700 line-through">{c.from || t("(empty)", "（空白）")}</span>
            <span className="mx-1 text-neutral-400">→</span>
            <span className="text-green-800">{c.to || t("(empty)", "（空白）")}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canApprove || act.isPending}
          onClick={async () => {
            await act.mutateAsync({ entity, entityId, decision: "approve" });
            void q.refetch();
            onDone?.();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-2.5 py-1 text-[12.5px] font-medium text-white disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          {t("Approve", "核准")}
        </button>
        <button
          type="button"
          disabled={!canApprove || act.isPending}
          onClick={async () => {
            await act.mutateAsync({ entity, entityId, decision: "reject" });
            void q.refetch();
            onDone?.();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 py-1 text-[12.5px] text-neutral-700 disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          {t("Send back", "退回")}
        </button>
        {isAuthor ? (
          <span className="text-[11.5px] text-orange-900">
            {t("You proposed this — someone else has to approve it.", "這是你提的——要由別人核准。")}
          </span>
        ) : !q.data?.canApprove ? (
          <span className="text-[11.5px] text-orange-900">{t("You cannot approve.", "你沒有核准權限。")}</span>
        ) : null}
      </div>
      <ErrorNote error={act.error} />
    </div>
  );
}

/** 變更紀錄。五個 tray 共用同一張表，所以同一個元件。 */
export function StrategyLog({
  entity, entityId, fieldLabel,
}: {
  entity: StrategyEntityId;
  entityId?: number;
  fieldLabel: (field: string) => string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const q = trpc.hub.admin.strategyHistory.useQuery({ entity, entityId }, { enabled: open, staleTime: 10_000 });

  const verb = (a: string) =>
    ({
      created: t("added", "新增"),
      edited: t("proposed a change", "提出修改"),
      approved: t("approved", "核准"),
      rejected: t("sent back", "退回"),
      removed: t("removed", "移除"),
    } as Record<string, string>)[a] ?? a;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-neutral-600 hover:text-neutral-900"
      >
        <History className="h-3.5 w-3.5" aria-hidden />
        {open ? t("Hide change record", "收起變更紀錄") : t("Change record — who changed what, when", "變更紀錄——誰在什麼時候改了什麼")}
      </button>
      {open ? (
        q.data?.history.length ? (
          <ul className="mt-2 divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {q.data.history.map((h) => (
              <li key={h.id} className="px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                  <span className="font-medium text-neutral-800">{h.actor}</span>
                  <span className="text-neutral-600">{verb(h.action)}</span>
                  <span className="ml-auto tabular-nums text-[11.5px] text-neutral-400">
                    {new Date(h.createdAt).toLocaleString()}
                  </span>
                </div>
                {(h.changes ?? []).map((c: any, i: number) => (
                  <div key={i} className="mt-0.5 text-[12px] leading-relaxed">
                    <span className="text-neutral-400">{fieldLabel(c.field)}: </span>
                    <span className="text-red-600 line-through">{c.from || t("(empty)", "（空白）")}</span>
                    <span className="mx-1 text-neutral-400">→</span>
                    <span className="text-green-700">{c.to || t("(empty)", "（空白）")}</span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-neutral-500">{t("No changes recorded yet.", "還沒有任何變更紀錄。")}</p>
        )
      ) : null}
    </div>
  );
}
