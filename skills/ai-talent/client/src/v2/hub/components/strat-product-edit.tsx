/**
 * 產品描述的編輯、新增（含 AI 幫忙寫）、核准與紀錄。
 *
 * 2026-09-23 (CJ)：編輯權限、新增產品＋AI 幫忙寫、編輯紀錄＋核准權限管理。
 *
 * ── 為什麼「儲存」的按鈕寫的是「送出審核」 ───────────────────────────
 * 改了描述不會立刻生效。提案存在 pending，核准之後才會合併到正式欄位——業務與
 * AI 讀到的永遠是已核准的版本。按鈕如果寫「儲存」，按的人會以為已經上線了，
 * 那是這個流程裡最容易出事的誤解。
 *
 * ── 核准者看到的是差異，不是新版全文 ─────────────────────────────────
 * 審核一段文字的時候，「哪裡變了」比「現在長怎樣」重要得多。所以待審面板逐欄
 * 列出前後值。
 */
import React, { useState } from "react";
import { Check, History, Sparkles, X } from "lucide-react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import { ErrorNote } from "../ui";
import { useT } from "../lang";
import type { Solution } from "./strat-shared";

const FIELD_LABELS: Record<string, [en: string, zh: string]> = {
  name_en: ["Name (EN)", "名稱（英）"],
  name_zh: ["Name (ZH)", "名稱（中）"],
  summary_en: ["Summary (EN)", "簡介（英）"],
  summary_zh: ["Summary (ZH)", "簡介（中）"],
  audience_en: ["Best for (EN)", "適合（英）"],
  audience_zh: ["Best for (ZH)", "適合（中）"],
};

export function fieldLabel(t: (en: string, zh: string) => string, key: string): string {
  const l = FIELD_LABELS[key];
  return l ? t(l[0], l[1]) : key;
}

/** 一筆紀錄長什麼樣 —— 誰、什麼時候、動了什麼。 */
export function EditLog({ history }: { history: Array<any> }) {
  const t = useT();
  if (!history.length) {
    return <p className="text-[13px] text-neutral-500">{t("No changes recorded yet.", "還沒有任何變更紀錄。")}</p>;
  }
  const verb = (a: string) =>
    ({
      created: t("added the product", "新增了這個產品"),
      edited: t("proposed a change", "提出修改"),
      approved: t("approved", "核准"),
      rejected: t("rejected", "退回"),
      withdrawn: t("withdrew", "撤回"),
    } as Record<string, string>)[a] ?? a;

  return (
    <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
      {history.map((h) => (
        <li key={h.id} className="px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
            <span className="font-medium text-neutral-800">{h.actor}</span>
            <span className="text-neutral-600">{verb(h.action)}</span>
            <span className="ml-auto tabular-nums text-[11.5px] text-neutral-400">
              {new Date(h.createdAt).toLocaleString()}
            </span>
          </div>
          {h.note ? <div className="mt-0.5 text-[12px] text-neutral-500">{h.note}</div> : null}
          {(h.changes ?? []).map((c: any, i: number) => (
            <div key={i} className="mt-1 text-[12px] leading-relaxed">
              <span className="text-neutral-400">{fieldLabel(t, c.field)}: </span>
              <span className="text-red-600 line-through">{c.from || t("(empty)", "（空白）")}</span>
              <span className="mx-1 text-neutral-400">→</span>
              <span className="text-green-700">{c.to || t("(empty)", "（空白）")}</span>
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

/** 待審提案：逐欄的前後差異，加上核准／退回。 */
export function PendingPanel({
  s,
  canApprove,
  me,
  onDone,
}: {
  s: Solution;
  canApprove: boolean;
  me: string;
  onDone: () => void;
}) {
  const t = useT();
  const approve = trpc.hub.admin.approveSolutionEdit.useMutation();
  const reject = trpc.hub.admin.rejectSolutionEdit.useMutation();
  if (!s.pending || !Object.keys(s.pending).length) return null;

  const mine = (s.pendingBy ?? "").toLowerCase() === me.toLowerCase();
  const busy = approve.isPending || reject.isPending;

  return (
    <div className="rounded-lg border border-orange-300 bg-orange-50 p-3">
      <div className="text-[12px] font-semibold text-orange-900">
        {t("Waiting for approval", "等待核准")} · {s.pendingBy}
        {s.pendingAt ? ` · ${new Date(s.pendingAt).toLocaleString()}` : ""}
      </div>
      <div className="mt-2 space-y-1">
        {Object.entries(s.pending).map(([field, to]) => (
          <div key={field} className="text-[12.5px] leading-relaxed">
            <span className="text-orange-900/60">{fieldLabel(t, field)}: </span>
            <span className="text-red-700 line-through">
              {String((s as any)[camel(field)] ?? "") || t("(empty)", "（空白）")}
            </span>
            <span className="mx-1 text-orange-900/50">→</span>
            <span className="font-medium text-green-800">{String(to) || t("(empty)", "（空白）")}</span>
          </div>
        ))}
      </div>

      <ErrorNote error={approve.error ?? reject.error} />

      {canApprove ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy || mine}
            title={mine ? t("You proposed this — someone else has to approve it.", "這是你自己提的，要別人來核准。") : undefined}
            onClick={async () => { await approve.mutateAsync({ solutionId: s.id }); onDone(); }}
            className="inline-flex items-center gap-1 rounded-lg bg-green-700 px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            {t("Approve and publish", "核准並生效")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => { await reject.mutateAsync({ solutionId: s.id }); onDone(); }}
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-[12.5px] text-neutral-700 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            {t("Send back", "退回")}
          </button>
          {mine ? (
            <span className="self-center text-[11.5px] text-orange-900/70">
              {t("You proposed this one.", "這一筆是你自己提的。")}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-[11.5px] text-orange-900/70">
          {t("You're not on the approver list, so this stays pending.", "你不在核准名單上，所以這筆會一直等著。")}
        </p>
      )}
    </div>
  );
}

const camel = (k: string) => k.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());

/** 編輯一個既有產品的文字。存檔＝送出審核。 */
export function EditSolutionModal({ s, onClose, onSaved }: { s: Solution; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const edit = trpc.hub.admin.editSolution.useMutation();
  const [draft, setDraft] = useState({
    name_en: s.nameEn ?? "",
    name_zh: s.nameZh ?? "",
    summary_en: s.summaryEn ?? "",
    summary_zh: s.summaryZh ?? "",
    audience_en: s.audienceEn ?? "",
    audience_zh: s.audienceZh ?? "",
  });
  const [note, setNote] = useState("");

  const dirty = Object.entries(draft).some(
    ([k, v]) => String(v).trim() !== String((s as any)[camel(k)] ?? "").trim(),
  );

  return (
    <Modal isOpen size="2xl" scrollBehavior="inside" onClose={() => !edit.isPending && onClose()}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5">
          <span className="text-[16px] font-semibold">{t("Edit description", "編輯描述")}</span>
          <span className="text-[12px] font-normal text-neutral-500">
            {t(
              "Changes don't go live until someone else approves them. Prices are not editable here.",
              "改完不會立刻生效，要別人核准才會。價格不在這裡改。",
            )}
          </span>
        </ModalHeader>
        <ModalBody>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["name_en", "name_zh"] as const).map((f) => (
              <Field key={f} label={fieldLabel(t, f)} value={draft[f]} onChange={(v) => setDraft({ ...draft, [f]: v })} />
            ))}
            {(["summary_en", "summary_zh"] as const).map((f) => (
              <Field key={f} wide rows={5} label={fieldLabel(t, f)} value={draft[f]} onChange={(v) => setDraft({ ...draft, [f]: v })} />
            ))}
            {(["audience_en", "audience_zh"] as const).map((f) => (
              <Field key={f} label={fieldLabel(t, f)} value={draft[f]} onChange={(v) => setDraft({ ...draft, [f]: v })} />
            ))}
            <Field
              wide
              label={t("Why (goes in the record)", "修改原因（會留在紀錄裡）")}
              value={note}
              onChange={setNote}
            />
          </div>
          <ErrorNote error={edit.error} />
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={onClose} disabled={edit.isPending} className="rounded-lg px-3 py-2 text-[13px] text-neutral-600 hover:bg-neutral-100 disabled:opacity-50">
            {t("Cancel", "取消")}
          </button>
          <button
            type="button"
            disabled={!dirty || edit.isPending}
            onClick={async () => {
              await edit.mutateAsync({ solutionId: s.id, fields: draft, note: note.trim() || undefined });
              onSaved();
            }}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ background: "#F97316" }}
          >
            {edit.isPending ? t("Sending…", "送出中…") : t("Send for approval", "送出審核")}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/** 新增產品。AI 只改寫你打的粗稿，不會去查也不會補。 */
export function CreateSolutionModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const t = useT();
  const create = trpc.hub.admin.createSolution.useMutation();
  const ai = trpc.hub.admin.draftSolutionCopy.useMutation();
  const [f, setF] = useState({
    nameEn: "", nameZh: "", vendor: "", category: "", summaryEn: "", summaryZh: "", sourceUrl: "",
  });
  const [notes, setNotes] = useState("");

  const ready = f.nameEn.trim().length >= 2 && f.nameZh.trim() && f.vendor.trim().length >= 2
    && f.category.trim().length >= 2 && f.summaryEn.trim().length >= 20 && f.summaryZh.trim().length >= 10;

  return (
    <Modal isOpen size="2xl" scrollBehavior="inside" onClose={() => !create.isPending && onClose()}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5">
          <span className="text-[16px] font-semibold">{t("Add a product", "新增產品")}</span>
          <span className="text-[12px] font-normal text-neutral-500">
            {t(
              "It goes in without a price, so reps can't quote one until a price is added.",
              "新增後沒有價格，所以在加上價格之前業務報不了價。",
            )}
          </span>
        </ModalHeader>
        <ModalBody>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("Name (EN)", "名稱（英）")} value={f.nameEn} onChange={(v) => setF({ ...f, nameEn: v })} />
            <Field label={t("Name (ZH)", "名稱（中）")} value={f.nameZh} onChange={(v) => setF({ ...f, nameZh: v })} />
            <Field label={t("Vendor", "供應商")} value={f.vendor} onChange={(v) => setF({ ...f, vendor: v })} />
            <Field label={t("Category", "分類")} value={f.category} onChange={(v) => setF({ ...f, category: v })} />
          </div>

          <div className="mt-3 rounded-lg border border-neutral-200 p-3">
            <div className="text-[12px] font-semibold text-neutral-700">
              {t("Rough notes — then let AI tidy them up", "先打粗稿，再讓 AI 整理")}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t(
                "What does it do, and for whom? A sentence or two is enough.",
                "它替誰解決什麼問題？一兩句就夠。",
              )}
              className="mt-1.5 w-full rounded-lg border border-neutral-300 p-2 text-[13px] outline-none focus:border-orange-500"
            />
            <button
              type="button"
              disabled={notes.trim().length < 15 || ai.isPending}
              onClick={async () => {
                const r = await ai.mutateAsync({ name: f.nameEn || f.nameZh, vendor: f.vendor, notes });
                setF((p) => ({ ...p, summaryEn: r.summaryEn, summaryZh: r.summaryZh }));
              }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-orange-300 px-3 py-1.5 text-[12.5px] font-medium text-orange-700 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {ai.isPending ? t("Writing…", "整理中…") : t("Draft both summaries", "產生中英簡介")}
            </button>
            {ai.data ? (
              <p className="mt-2 text-[11.5px] leading-relaxed text-neutral-500">
                {t(ai.data.notice.en, ai.data.notice.zh)}
              </p>
            ) : null}
            <ErrorNote error={ai.error} />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field wide rows={4} label={t("Summary (EN)", "簡介（英）")} value={f.summaryEn} onChange={(v) => setF({ ...f, summaryEn: v })} />
            <Field wide rows={4} label={t("Summary (ZH)", "簡介（中）")} value={f.summaryZh} onChange={(v) => setF({ ...f, summaryZh: v })} />
            <Field wide label={t("Source URL (optional)", "資料來源網址（選填）")} value={f.sourceUrl} onChange={(v) => setF({ ...f, sourceUrl: v })} />
          </div>
          <ErrorNote error={create.error} />
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={onClose} disabled={create.isPending} className="rounded-lg px-3 py-2 text-[13px] text-neutral-600 hover:bg-neutral-100 disabled:opacity-50">
            {t("Cancel", "取消")}
          </button>
          <button
            type="button"
            disabled={!ready || create.isPending}
            onClick={async () => {
              await create.mutateAsync({ ...f, sourceUrl: f.sourceUrl.trim() || undefined });
              onCreated();
            }}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ background: "#F97316" }}
          >
            {create.isPending ? t("Adding…", "新增中…") : t("Add product", "新增產品")}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function Field({
  label, value, onChange, wide, rows,
}: { label: string; value: string; onChange: (v: string) => void; wide?: boolean; rows?: number }) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="mb-1 block text-[12px] text-neutral-500">{label}</span>
      {rows ? (
        <textarea
          value={value}
          rows={rows}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 p-2 text-[13px] outline-none focus:border-orange-500"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-orange-500"
        />
      )}
    </label>
  );
}

export { History as HistoryIcon };
