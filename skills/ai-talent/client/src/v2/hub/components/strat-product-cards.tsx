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
import { Boxes, ExternalLink, Star } from "lucide-react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import CardShell, { CARD_GRID } from "./card-shell";
import { ExtLink, categoryLabel, formatDay, priceLabel, type Solution } from "./strat-shared";
import { useT } from "../lang";

/** 這個方案最低的那個有數字的核准價，沒有就回 null。 */
function lowestPrice(s: Solution) {
  const withAmount = s.prices.filter((p) => p.amount != null && p.billing !== "quote");
  if (!withAmount.length) return null;
  return withAmount.reduce((a, b) => (Number(a.amount) <= Number(b.amount) ? a : b));
}

export default function StratProductCards({ solutions }: { solutions: Solution[] }) {
  const t = useT();
  const [openId, setOpenId] = useState<number | null>(null);
  const active = solutions.find((s) => s.id === openId) ?? null;

  const quoteOnly = solutions.filter((s) => !lowestPrice(s)).length;

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[12px] font-medium uppercase tracking-wide text-stone-500">
          {t("What reps may quote, and where the number came from", "業務能報什麼價，以及那個數字哪裡來的")}
        </span>
        <span className="text-[12px] text-stone-400">
          {t(
            `${solutions.length} solutions · ${quoteOnly} quote-only`,
            `${solutions.length} 個方案 · ${quoteOnly} 個只有客製化報價`,
          )}
        </span>
      </div>

      <div className={CARD_GRID}>
        {solutions.map((s) => {
          const low = lowestPrice(s);
          const listedOn = s.prices.map((p) => p.effectiveFrom).filter(Boolean).sort()[0];
          return (
            <CardShell
              key={s.id}
              onClick={() => setOpenId(s.id)}
              accent={s.featured ? "#EA580C" : "#0369A1"}
              icon={s.featured ? Star : Boxes}
              tag={s.featured ? t("Featured", "精選") : categoryLabel(s.category)}
              name={s.nameEn}
              measure={t(
                `Listed by ${s.vendor} on ASUS ExpertHub; the prices here are the ones published on that page. A rep quoting anything else has it removed before the post exists.`,
                `由${s.vendor}刊登在 ASUS ExpertHub，這裡的價格就是那一頁上公布的。業務報了別的數字，在貼文成形之前就會被拿掉。`,
              )}
              detail={
                <span>
                  {s.prices.length
                    ? t(`${s.prices.length} approved plan(s)`, `${s.prices.length} 個核准方案`)
                    : t("No approved price — reps can't quote one", "沒有核准價格，業務不能報價")}
                  {listedOn ? ` · ${t("listed", "上架")} ${formatDay(listedOn)}` : ""}
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
      </div>

      {active ? <SolutionModal s={active} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function SolutionModal({ s, onClose }: { s: Solution; onClose: () => void }) {
  const t = useT();
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
        </ModalBody>

        <ModalFooter className="justify-between">
          {s.sourceUrl ? (
            <ExtLink href={s.sourceUrl} label={t("Source page on ExpertHub", "ExpertHub 上的原始頁面")} className="text-[12px]">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </ExtLink>
          ) : <span />}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
            style={{ background: "#F97316" }}
          >
            {t("Close", "關閉")}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
