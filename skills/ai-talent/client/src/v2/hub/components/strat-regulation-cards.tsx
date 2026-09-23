/**
 * 法規更新的卡片牆。
 *
 * 2026-09-23 (CJ「regulation update，請同樣使用任務卡的呈現方式」)。
 *
 * ── 色塊裡放什麼 ─────────────────────────────────────────────────────
 * 產品卡放價格、品牌卡放筆數、總管理放數字。法規卡放**日期跟狀態的關係**，
 * 因為這一頁真正的風險只有一種形狀：**已經生效了，但還沒套用。**
 *
 * 那個狀態不會自己浮出來——清單上一條「法務審閱中」的法規，跟一條「法務審閱中
 * 而且三個月前就生效了」的法規，長得一模一樣。所以色塊直接算給你看，而且那是
 * 唯一會變紅的情況。
 *
 * ── 「已套用至政策包」是一句宣稱，不是一個事實 ──────────────────────
 * 那個狀態是手動維護的欄位。這一頁不假裝它被驗證過，但會驗它驗得動的那一半：
 * 法規指名的檢查在政策包裡存不存在（見 regulationCoverage.ts）。對不上就在卡片
 * 上標出來——因為那是設定錯誤，不是判斷問題。
 */
import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Eye, Scale } from "lucide-react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import CardShell, { CARD_GRID } from "./card-shell";
import { useT } from "../lang";

export const RULE_LABELS: Record<string, [string, string]> = {
  disclosure: ["Employee disclosure", "揭露員工身分"],
  price: ["Approved prices", "核准價格"],
  claims: ["No absolute claims", "禁止絕對用語"],
  evidence: ["Sourced statistics", "數據需有出處"],
  competitors: ["No competitor comparisons", "不比較競品"],
  link: ["Tracked link", "追蹤連結"],
};

export interface Regulation {
  id: number;
  market: string;
  authority: string;
  title: string;
  nameEn: string;
  nameZh: string;
  changeEn: string;
  changeZh: string;
  summary: string;
  summaryZh: string;
  impact: string;
  impactZh: string;
  rules: string[];
  status: string;
  effectiveOn: string | null;
  publishedOn: string | null;
  sourceUrl: string;
}

export interface Coverage {
  id: number;
  known: string[];
  unknown: string[];
  overdueDays: number | null;
  daysUntil: number | null;
}

/**
 * 卡片底下那一行的主管機關。
 *
 * 資料庫裡存的是「公平交易委員會 Fair Trade Commission」這種中英並列的長字串，
 * 直接放會折行，六張卡就高低不齊。取一邊就好——顯示語言決定取哪一邊。
 */
function shortAuthority(r: Regulation): string {
  // 中英並列的字串一律是「中文在前，英文在後」，所以取開頭那段非拉丁字元就對了。
  // 純英文的機關名（Federal Trade Commission）沒有開頭中文，整串照用。
  const lead = r.authority.match(/^[^A-Za-z]+/)?.[0]?.trim();
  return `${r.market} · ${lead || r.authority}`;
}

function statusTag(t: (en: string, zh: string) => string, status: string) {
  if (status === "applied") return t("APPLIED", "已套用");
  if (status === "review") return t("IN REVIEW", "法務審閱中");
  return t("WATCHING", "追蹤中");
}

export default function StratRegulationCards({
  items,
  coverage,
}: {
  items: Regulation[];
  coverage: Record<number, Coverage>;
}) {
  const t = useT();
  const [openId, setOpenId] = useState<number | null>(null);
  const active = items.find((r) => r.id === openId) ?? null;

  return (
    <div className="min-w-0">
      <div className={CARD_GRID}>
        {items.map((r) => {
          const c = coverage[r.id];
          const overdue = c?.overdueDays != null;
          const broken = (c?.unknown.length ?? 0) > 0;
          return (
            <CardShell
              key={r.id}
              onClick={() => setOpenId(r.id)}
              // 紅色只留給「已生效但沒套用」。其他狀態不搶那個位置。
              accent={overdue ? "#B91C1C" : broken ? "#C2410C" : r.status === "applied" ? "#15803D" : "#525252"}
              icon={overdue || broken ? AlertTriangle : r.status === "applied" ? CheckCircle2 : Eye}
              tag={overdue ? t("OVERDUE", "逾期未套用") : statusTag(t, r.status)}
              // 2026-09-23 (CJ「要有更新日期，法規名稱還要最近修改的摘要，按下去
              // 才看到完整的法規」)：卡片只放三件事——日期（色塊）、法規名稱、
              // 這次改了什麼。原本這裡放的是「中文法規名 — 英文變動說明」黏成的
              // 長標題，六張並排就成了一面文字牆。完整的名稱與全文移到 modal。
              name={t(r.nameEn, r.nameZh)}
              measure={t(r.changeEn, r.changeZh)}
              measureLabel={null}
              clampMeasure={3}
              // 只留主管機關的短名。原本這一行是「市場 · 全名 · N 項檢查」，
              // 會折成兩行，六張卡的高度就參差不齊（而且 "1 checks" 單複數是壞的）。
              detail={<span>{shortAuthority(r)}</span>}
              action={t("Read the full rule", "看完整法規")}
            >
              <RegulationBand reg={r} cov={c} />
            </CardShell>
          );
        })}
      </div>

      {active ? (
        <RegulationModal reg={active} cov={coverage[active.id]} onClose={() => setOpenId(null)} />
      ) : null}
    </div>
  );
}

/** 色塊：日期與狀態的關係，不是日期本身。 */
function RegulationBand({ reg, cov }: { reg: Regulation; cov?: Coverage }) {
  const t = useT();

  if (cov?.overdueDays != null) {
    return (
      <>
        <div className="text-[30px] font-bold leading-none tabular-nums text-red-700">{cov.overdueDays}</div>
        <div className="mt-1.5 text-center text-[11px] font-medium leading-tight text-red-700">
          {t(
            cov.overdueDays === 0 ? "in effect today, not applied" : "days in effect, not applied",
            cov.overdueDays === 0 ? "今天生效，尚未套用" : "天前就生效，尚未套用",
          )}
        </div>
      </>
    );
  }

  if (cov?.daysUntil != null) {
    return (
      <>
        <div className="text-[19px] font-bold leading-none tabular-nums text-stone-900">{reg.effectiveOn}</div>
        <div className="mt-1.5 text-center text-[11px] leading-tight text-stone-500">
          {t(`takes effect in ${cov.daysUntil} days`, `${cov.daysUntil} 天後生效`)}
        </div>
      </>
    );
  }

  if (!reg.effectiveOn) {
    return (
      <>
        <div className="text-[17px] font-bold leading-tight text-stone-700">{t("No date yet", "生效日未定")}</div>
        <div className="mt-1.5 text-center text-[11px] leading-tight text-stone-500">
          {reg.publishedOn
            ? t(`published ${reg.publishedOn}`, `${reg.publishedOn} 公布`)
            : t("published, not scheduled", "已公布，尚未排定")}
        </div>
      </>
    );
  }

  // 已生效而且已套用 —— 這是好消息，用日期而不是數字，因為天數在這裡沒有意義。
  return (
    <>
      <div className="text-[19px] font-bold leading-none tabular-nums text-stone-900">{reg.effectiveOn}</div>
      <div className="mt-1.5 text-center text-[11px] leading-tight text-stone-500">
        {t("in effect since", "起生效")}
      </div>
    </>
  );
}

function RegulationModal({ reg, cov, onClose }: { reg: Regulation; cov?: Coverage; onClose: () => void }) {
  const t = useT();
  return (
    <Modal isOpen size="2xl" scrollBehavior="inside" onClose={onClose}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
              {reg.market}
            </span>
            <span className="text-[12px] font-normal text-neutral-500">{reg.authority}</span>
          </div>
          <span className="text-[16px] font-semibold leading-snug">{t(reg.nameEn, reg.nameZh)}</span>
          {/* 完整官方名稱只在這裡出現 —— 它太長，放不進卡片。 */}
          <span className="text-[12px] font-normal leading-relaxed text-neutral-600">{reg.title}</span>
          <span className="text-[12px] font-normal tabular-nums text-neutral-500">
            {reg.effectiveOn
              ? t(`Effective ${reg.effectiveOn}`, `生效 ${reg.effectiveOn}`)
              : t("Effective date not yet published", "生效日尚未公布")}
            {reg.publishedOn ? ` · ${t(`published ${reg.publishedOn}`, `${reg.publishedOn} 公布`)}` : ""}
          </span>
        </ModalHeader>

        <ModalBody>
          {cov?.overdueDays != null ? (
            <Warn>
              {t(
                `This has been in effect for ${cov.overdueDays} day(s) and is still not marked as applied.`,
                `這條已經生效 ${cov.overdueDays} 天，狀態還不是「已套用」。`,
              )}
            </Warn>
          ) : null}

          <div className="mb-1 text-[12px] font-semibold text-neutral-700">{t("What changed", "這次改了什麼")}</div>
          <p className="text-[13px] leading-relaxed text-neutral-700">{t(reg.summary, reg.summaryZh)}</p>

          <div className="mt-3 rounded-lg border border-orange-100 bg-orange-50/60 p-3">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-orange-900">
              <Scale size={13} aria-hidden />
              {t("What it changes for a rep post", "它對業務貼文改了什麼")}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-neutral-800">{t(reg.impact, reg.impactZh)}</p>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 text-[12px] font-semibold text-neutral-700">
              {t("Checks it maps to", "它對應到的檢查")}
            </div>
            {cov?.known.length || cov?.unknown.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {cov.known.map((rule) => {
                  const l = RULE_LABELS[rule];
                  return (
                    <span key={rule} className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[12px] text-neutral-700">
                      {l ? t(l[0], l[1]) : rule}
                    </span>
                  );
                })}
                {cov.unknown.map((rule) => (
                  <span key={rule} className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[12px] font-medium text-amber-900">
                    <AlertTriangle size={11} aria-hidden />
                    {rule}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[13px] italic text-neutral-500">
                {t(
                  "None yet — this one is being watched, not acted on.",
                  "還沒有——這條目前是追蹤，還沒有轉成任何檢查。",
                )}
              </p>
            )}

            {cov?.unknown.length ? (
              <Warn>
                {t(
                  `The policy pack for ${reg.market} has no check called ${cov.unknown.join(", ")}. That mapping does nothing — most likely a check was renamed.`,
                  `${reg.market} 的政策包裡沒有叫做 ${cov.unknown.join("、")} 的檢查。這個對應是空的——多半是某項檢查被改過名字。`,
                )}
              </Warn>
            ) : null}
          </div>

          {/* 這句必須在。綠色的「已套用」標籤沒有被任何東西驗證過。 */}
          <p className="mt-4 text-[11.5px] leading-relaxed text-neutral-500">
            {t(
              "The status on this card is maintained by hand. What is checked automatically is only whether the checks it names exist in the policy pack — not whether they say the right thing.",
              "卡片上的狀態是人工維護的。系統自動檢查的只有「它指名的那幾項檢查存不存在於政策包」，不包含「那些檢查寫得對不對」。",
            )}
          </p>
        </ModalBody>

        <ModalFooter className="justify-between">
          <a
            href={reg.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-neutral-600 underline-offset-2 hover:text-neutral-900 hover:underline"
          >
            {t("Read the source", "查看原文")} <ExternalLink size={12} aria-hidden />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-[13px] text-neutral-700"
          >
            {t("Close", "關閉")}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[12.5px] leading-relaxed text-amber-900">
      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
