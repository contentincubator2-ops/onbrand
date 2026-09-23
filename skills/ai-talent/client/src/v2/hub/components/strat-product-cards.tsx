/**
 * 產品頁的卡片牆：一張卡一個方案，點進去看完整資料。
 *
 * 2026-09-23 (CJ「接下來做產品頁，用真實的 ExpertHub 的產品頁，進行蒐集」)。
 *
 * ── 頭部色塊為什麼放價格 ─────────────────────────────────────────────
 * 總管理的卡放數字（功能回答了什麼）、品牌的卡放筆數。產品卡放**最低的那個
 * 核准價格**，因為這一頁的問題是「業務可以說多少錢」——價格就是這張卡的主體，
 * 而且是合規引擎唯一認的東西：不在這張表上的數字，價格規則會把它拿掉。
 *
 * ── 沒有價格的方案要看得出來 ─────────────────────────────────────────
 * 官網上有些方案標「客製化報價」。那種卡的頭部不寫數字寫「客製化報價」，因為
 * 「沒有核准價格」跟「價格是 0」在合規引擎裡是天差地別的兩件事——真的寫 0 進
 * 核准清單，業務寫「$0」就會通過價格檢查。
 */
import React, { useState } from "react";
import { Boxes, Clock, ExternalLink, History, Plus, Star } from "lucide-react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import CardShell, { CARD_GRID } from "./card-shell";
import { ExtLink, categoryLabel, priceLabel, type Solution } from "./strat-shared";
import { useT } from "../lang";
import { trpc } from "../../../lib/trpc";
import { CreateSolutionModal, EditLog, EditSolutionModal, PendingPanel } from "./strat-product-edit";

/** 這個方案最低的那個有數字的核准價，沒有就回 null。 */
function lowestPrice(s: Solution) {
  const withAmount = s.prices.filter((p) => p.amount != null && p.billing !== "quote");
  if (!withAmount.length) return null;
  return withAmount.reduce((a, b) => (Number(a.amount) <= Number(b.amount) ? a : b));
}

export default function StratProductCards({ solutions, onChanged }: { solutions: Solution[]; onChanged?: () => void }) {
  const t = useT();
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const active = solutions.find((s) => s.id === openId) ?? null;

  const editing = trpc.hub.admin.solutionEditing.useQuery(undefined, { staleTime: 30_000 });
  const refresh = () => { onChanged?.(); void editing.refetch(); };

  const quoteOnly = solutions.filter((s) => !lowestPrice(s)).length;
  const awaiting = solutions.filter((s) => s.pending && Object.keys(s.pending).length).length;

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[12px] font-medium uppercase tracking-wide text-stone-500">
          {t("Prices a rep may quote — anything else is removed before the post exists", "業務能報的價格——其他數字在貼文成形之前就會被拿掉")}
        </span>
        <span className="text-[12px] text-stone-400">
          {t(
            `${solutions.length} solutions · ${quoteOnly} with no quotable price`,
            `${solutions.length} 個方案 · ${quoteOnly} 個沒有可以報的價格`,
          )}
        </span>
        {awaiting ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[12px] font-medium text-orange-800">
            <Clock className="h-3 w-3" aria-hidden />
            {t(`${awaiting} waiting for approval`, `${awaiting} 筆等待核准`)}
          </span>
        ) : null}
        {editing.data && !editing.data.canApprove ? (
          <span className="text-[11.5px] text-stone-400">
            {t("You can edit, but not approve.", "你可以編輯，但不能核准。")}
          </span>
        ) : null}
      </div>

      <div className={CARD_GRID}>
        {solutions.map((s) => {
          const low = lowestPrice(s);
          // 只數「有數字、而且不是客製化報價」的那幾檔 —— 那才是業務真的能說出口的。
          const quotable = s.prices.filter((p) => p.amount != null && p.billing !== "quote").length;
          return (
            <CardShell
              key={s.id}
              onClick={() => setOpenId(s.id)}
              accent={s.pending && Object.keys(s.pending).length ? "#C2410C" : s.featured ? "#EA580C" : "#0369A1"}
              icon={s.pending && Object.keys(s.pending).length ? Clock : s.featured ? Star : Boxes}
              tag={
                s.pending && Object.keys(s.pending).length
                  ? t("PENDING", "待核准")
                  : s.featured
                    ? t("Featured", "精選")
                    : categoryLabel(s.category)
              }
              name={s.nameEn}
              // 2026-09-23 (CJ「產品的卡片，就不出現 how it count，而是這個產品的
              // 簡單介紹」)。這一頁的讀者要先知道這是什麼東西；價格哪裡來的
              // 寫在下面那個說明框，點進去 modal 還有原始頁面連結。
              measure={t(s.summaryEn, s.summaryZh)}
              measureLabel={null}
              clampMeasure={3}
              // 2026-09-23 (CJ「請釐清這個意思：1 approved plans from xxx」)。
              // 原本寫「1 approved plan(s) · from 數位開創國際」，三個地方都模糊：
              // approved 沒說誰核准的、from 讀起來像方案出自誰、單複數還壞掉。
              // 現在直接說那個數字代表什麼（業務可以報幾個價），以及誰刊登的。
              detail={
                <span>
                  {quotable
                    ? t(
                        `${quotable} ${quotable === 1 ? "price" : "prices"} a rep may quote`,
                        `業務可以報 ${quotable} 個價格`,
                      )
                    : t("No price a rep may state", "沒有可以報的價格")}
                  {` · ${t(`listed by ${s.vendor}`, `由${s.vendor}刊登`)}`}
                </span>
              }
              action={t("See the full entry", "看完整資料")}
            >
              {low ? (
                <>
                  <div className="text-[26px] font-bold leading-none tabular-nums text-stone-900">
                    NT${Number(low.amount).toLocaleString("en-US")}
                  </div>
                  <div className="mt-1.5 line-clamp-2 text-center text-[11px] leading-tight text-stone-500">
                    {t(low.planEn, low.planZh)}
                    {low.startsFrom ? t(" (from)", " 起") : ""}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[17px] font-bold leading-tight text-stone-700">
                    {t("Custom quote", "客製化報價")}
                  </div>
                  <div className="mt-1.5 text-center text-[11px] leading-tight text-stone-500">
                    {t("no number a rep may state", "沒有可以直接說出口的數字")}
                  </div>
                </>
              )}
            </CardShell>
          );
        })}

        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 bg-white text-neutral-500 transition hover:border-neutral-500 hover:text-neutral-800"
        >
          <Plus className="h-5 w-5" aria-hidden />
          <span className="text-[13px] font-medium">{t("Add a product", "新增產品")}</span>
        </button>
      </div>

      {active ? (
        <SolutionModal
          s={active}
          canApprove={Boolean(editing.data?.canApprove)}
          me={editing.data?.me ?? ""}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
        />
      ) : null}
      {creating ? (
        <CreateSolutionModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refresh(); }} />
      ) : null}
    </div>
  );
}

function SolutionModal({
  s, canApprove, me, onClose, onChanged,
}: { s: Solution; canApprove: boolean; me: string; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const history = trpc.hub.admin.solutionHistory.useQuery(
    { solutionId: s.id },
    { enabled: showLog, staleTime: 10_000 },
  );

  if (editing) {
    return (
      <EditSolutionModal
        s={s}
        onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); onChanged(); onClose(); }}
      />
    );
  }

  return (
    <Modal isOpen size="2xl" scrollBehavior="inside" onClose={onClose}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5">
          <span className="text-[16px] font-semibold">{s.nameEn}</span>
          <span lang="zh-Hant" className="text-[13px] font-normal text-neutral-500">{s.nameZh}</span>
          <span className="text-[12px] font-normal text-neutral-500">
            {s.vendor} · {categoryLabel(s.category)}
          </span>
        </ModalHeader>

        <ModalBody>
          <PendingPanel s={s} canApprove={canApprove} me={me} onDone={() => { onChanged(); onClose(); }} />

          <p className="text-[13px] leading-relaxed text-neutral-700">{s.summaryEn}</p>
          <p lang="zh-Hant" className="text-[13px] leading-relaxed text-neutral-500">{s.summaryZh}</p>

          <div className="mt-2">
            <div className="mb-1.5 text-[12px] font-semibold text-neutral-700">
              {t("Approved prices — reps quote from here or not at all", "核准價格——業務只能從這裡引用")}
            </div>
            {s.prices.length ? (
              <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                {s.prices.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-[13px] text-neutral-800">{p.planEn}</div>
                      <div lang="zh-Hant" className="text-[11.5px] text-neutral-500">{p.planZh}</div>
                    </div>
                    <div className="text-[13px] font-semibold tabular-nums text-neutral-900">{priceLabel(p)}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-neutral-500">
                {t("No active price — reps can't quote one.", "沒有生效中的價格，業務不能報價。")}
              </p>
            )}
          </div>

          {s.features.length ? (
            <div className="mt-3">
              <div className="mb-1.5 text-[12px] font-semibold text-neutral-700">{t("Features", "方案特色")}</div>
              <ul className="space-y-1.5">
                {s.features.map((f, i) => (
                  <li key={i} className="text-[13px] leading-relaxed text-neutral-700">
                    · {f.en}
                    <span lang="zh-Hant" className="block pl-3 text-[12px] text-neutral-500">{f.zh}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {s.audienceEn ? (
            <div className="mt-3">
              <div className="mb-1 text-[12px] font-semibold text-neutral-700">{t("Best for", "適合")}</div>
              <p className="text-[13px] text-neutral-700">{s.audienceEn}</p>
              <p lang="zh-Hant" className="text-[12px] text-neutral-500">{s.audienceZh}</p>
            </div>
          ) : null}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowLog((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-neutral-600 hover:text-neutral-900"
            >
              <History className="h-3.5 w-3.5" aria-hidden />
              {showLog ? t("Hide change record", "收起變更紀錄") : t("Change record — who changed what, when", "變更紀錄——誰在什麼時候改了什麼")}
            </button>
            {showLog ? (
              <div className="mt-2">
                {history.isLoading ? (
                  <p className="text-[13px] text-neutral-500">{t("Loading…", "載入中…")}</p>
                ) : (
                  <EditLog history={history.data?.history ?? []} />
                )}
              </div>
            ) : null}
          </div>

          {s.updatedBy ? (
            <p className="mt-3 text-[11.5px] text-neutral-400">
              {t("Last approved change by", "最後一次核准的變更")} {s.updatedBy}
              {s.updatedAt ? ` · ${new Date(s.updatedAt).toLocaleString()}` : ""}
            </p>
          ) : null}
        </ModalBody>

        <ModalFooter className="justify-between">
          {s.sourceUrl ? (
            <ExtLink href={s.sourceUrl} label={t("Source page on ExpertHub", "ExpertHub 上的原始頁面")} className="text-[12px]">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </ExtLink>
          ) : <span />}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50"
            >
              {t("Edit description", "編輯描述")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
              style={{ background: "#F97316" }}
            >
              {t("Close", "關閉")}
            </button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
