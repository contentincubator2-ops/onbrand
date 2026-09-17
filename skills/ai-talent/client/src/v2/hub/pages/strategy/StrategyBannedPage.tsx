/** Strategy · 禁用詞 — marketing's blocking list on top of the policy pack's legal claim rules. */
import React, { useState } from "react";
import { ArrowRight, Ban, Lock } from "lucide-react";
import { ErrorNote, Loading, PageHeader } from "../../ui";
import { useT } from "../../lang";
import WordingTester from "../../components/wording-tester";
import {
  AddButton,
  AssetCardFrame,
  CountChip,
  EmptyLine,
  LiveNote,
  MarketTabs,
  RemoveButton,
  SectionLabel,
  UnderlineInput,
  humanizePattern,
  useWording,
  useWordingMarket,
  type Market,
} from "../../components/wording-shared";

const PRESETS: Record<Market, string> = {
  TW: "秒殺價！業界最強的電子簽核，包你立即見效",
  US: "This revolutionary game-changer is a no-brainer — instant results!",
};

export default function StrategyBannedPage() {
  const t = useT();
  const [market, setMarket] = useWordingMarket();
  const { query, actions } = useWording();
  const banned = (query.data?.items ?? []).filter((w) => w.market === market && w.kind === "banned");
  const legal = query.data?.legal[market] ?? [];
  const counts = {
    TW: (query.data?.items ?? []).filter((w) => w.market === "TW" && w.kind === "banned").length,
    US: (query.data?.items ?? []).filter((w) => w.market === "US" && w.kind === "banned").length,
  };

  const [term, setTerm] = useState("");
  const [replacement, setReplacement] = useState("");
  const [note, setNote] = useState("");

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={t("Strategy · Banned words", "策略 · 禁用詞")}
        title={t("Words no rep post can contain", "任何業務貼文都不能出現的字")}
        subtitle={t(
          "Two layers: the legal claim rules in the market's policy pack, plus marketing's own list. Both block and replace on every check.",
          "兩層：政策包裡的法規禁用，加上行銷部自己的清單；每次檢查都會攔下並替換。",
        )}
        right={<MarketTabs market={market} onChange={setMarket} counts={counts} />}
      />

      <div className="mb-4">
        <LiveNote>{t("Add a word, then try it below. It's blocked on the next check.", "新增一個字，馬上在下方試試；下一次檢查就會被攔下。")}</LiveNote>
      </div>

      {query.isLoading ? <Loading /> : <ErrorNote error={query.error} />}

      {query.data ? (
        <>
          <SectionLabel
            label={t("Blocked wording", "禁用規範")}
            counter={`${banned.length + legal.length}`}
            intro={t("Marketing edits the company list; legal owns the policy pack.", "公司清單由行銷部維護；政策包由法務維護。")}
          />
          <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            <AssetCardFrame
              Icon={Ban}
              eyebrow={t("Marketing", "行銷部")}
              right={<CountChip>{t(`${banned.length} words`, `${banned.length} 個`)}</CountChip>}
              title={t("Company list", "公司禁用詞")}
              hint={t("Blocking. Replaced with the suggested wording, or removed.", "會被攔下，替換成建議用語或直接刪除。")}
              filled={banned.length > 0}
            >
              <ul className="divide-y divide-stone-100">
                {banned.length ? (
                  banned.map((w) => (
                    <li key={w.id} className="flex items-center gap-2 py-1.5">
                      <span className="text-[13px] font-medium text-red-700">{w.term}</span>
                      <ArrowRight size={12} className="shrink-0 text-stone-400" aria-hidden />
                      <span className="text-[13px] text-[#171717]">{w.replacement || t("(removed)", "（刪除）")}</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-stone-400" title={w.addedBy ?? undefined}>
                        {w.note}
                      </span>
                      <RemoveButton label={t(`Remove ${w.term}`, `移除 ${w.term}`)} onClick={() => actions.remove(w.id)} disabled={actions.removingId === w.id} />
                    </li>
                  ))
                ) : (
                  <EmptyLine>{t("No company banned words yet.", "尚未設定公司禁用詞。")}</EmptyLine>
                )}
              </ul>
              <form
                className="mt-auto flex flex-wrap items-end gap-2 pt-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!term.trim()) return;
                  if (await actions.add({ market, kind: "banned", term, replacement, note })) {
                    setTerm("");
                    setReplacement("");
                    setNote("");
                  }
                }}
              >
                <UnderlineInput value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t("Banned word", "禁用詞")} className="w-24 flex-1" />
                <ArrowRight size={12} className="mb-2 shrink-0 text-stone-400" aria-hidden />
                <UnderlineInput value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder={t("Replace with (optional)", "替換為（選填）")} className="w-28 flex-1" />
                <UnderlineInput value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Why", "原因")} className="w-20 flex-1" />
                <AddButton disabled={!term.trim()} pending={actions.addingKind === "banned"}>{t("Add", "新增")}</AddButton>
              </form>
              <ErrorNote error={actions.errorFor("banned")} />
            </AssetCardFrame>

            <AssetCardFrame
              Icon={Lock}
              eyebrow={t("Legal", "法務")}
              right={<CountChip>{t(`${legal.length} rules`, `${legal.length} 條`)}</CountChip>}
              title={t("Legal rules (policy pack)", "法規禁用（政策包）")}
              hint={t("Maintained in the policy pack by legal.", "由法務在政策包中維護。")}
              filled
            >
              <ul className="divide-y divide-stone-100">
                {legal.map((r) => (
                  <li key={r.pattern} className="flex items-center gap-2 py-1.5">
                    <Lock size={11} className="shrink-0 text-stone-400" aria-hidden />
                    <span className="min-w-0 text-[13px] text-red-700">{humanizePattern(r.pattern)}</span>
                    <ArrowRight size={12} className="shrink-0 text-stone-400" aria-hidden />
                    <span className="min-w-0 text-[13px] text-[#171717]">{r.replacement || t("(removed)", "（刪除）")}</span>
                  </li>
                ))}
              </ul>
            </AssetCardFrame>
          </div>

          <WordingTester
            market={market}
            presets={PRESETS}
            highlight="claims"
            label={t("Try it", "立即測試")}
            intro={t("A draft full of blocked wording, checked against both layers.", "一份滿是禁用字的草稿，同時用兩層規範檢查。")}
          />
        </>
      ) : null}
    </div>
  );
}
