/** Strategy · 正面用詞 — preferred terms (go into every prompt) and word swaps (applied to every post). */
import React, { useState } from "react";
import { ArrowRight, Repeat, ThumbsUp } from "lucide-react";
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
  useWording,
  useWordingMarket,
  type Market,
} from "../../components/wording-shared";

const PRESETS: Record<Market, string> = {
  TW: "我在華碩 ExpertHub 服務。不用找好幾家系統商比價，這套方案便宜又好上手，限時搶購中！",
  US: "I work at ASUS. Stop comparing ten vendors — this cheap option is easy to start. Buy now!",
};

export default function StrategyPreferredPage() {
  const t = useT();
  const [market, setMarket] = useWordingMarket();
  const { query, actions } = useWording();
  const items = (query.data?.items ?? []).filter((w) => w.market === market);
  const preferred = items.filter((w) => w.kind === "preferred");
  const swaps = items.filter((w) => w.kind === "swap");
  const counts = {
    TW: (query.data?.items ?? []).filter((w) => w.market === "TW" && w.kind !== "banned").length,
    US: (query.data?.items ?? []).filter((w) => w.market === "US" && w.kind !== "banned").length,
  };

  const [term, setTerm] = useState("");
  const [termNote, setTermNote] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [swapNote, setSwapNote] = useState("");

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={t("Strategy · Preferred wording", "策略 · 正面用詞")}
        title={t("Say it the way the brand says it", "用品牌的說法來說")}
        subtitle={t(
          "Preferred terms go into every writing prompt. Word swaps are applied to every post automatically, after the compliance checks.",
          "推薦用詞會放進每一次寫作指令；替換對照在合規檢查之後，自動套用到每一篇貼文。",
        )}
        right={<MarketTabs market={market} onChange={setMarket} counts={counts} />}
      />

      <div className="mb-4">
        <LiveNote>{t("Live: changes apply to the next post a rep writes. No redeploy.", "即時生效：業務寫的下一篇就會套用，不需要重新部署。")}</LiveNote>
      </div>

      {query.isLoading ? <Loading /> : <ErrorNote error={query.error} />}

      {query.data ? (
        <>
          <SectionLabel
            label={t("Wording rules", "用詞規範")}
            counter={`${preferred.length + swaps.length}`}
            intro={t("What marketing wants every rep to sound like, in this market.", "行銷部希望每位業務在這個市場的說話方式。")}
          />
          <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <AssetCardFrame
              Icon={ThumbsUp}
              eyebrow={t("Prompt", "寫作指令")}
              right={<CountChip>{t(`${preferred.length} terms`, `${preferred.length} 個`)}</CountChip>}
              title={t("Preferred terms", "推薦用詞")}
              hint={t("The AI writer is told to use these.", "AI 撰寫時會優先使用這些用詞。")}
              filled={preferred.length > 0}
            >
              <div className="flex flex-wrap gap-1.5">
                {preferred.length ? (
                  preferred.map((w) => (
                    <span
                      key={w.id}
                      title={w.note ?? undefined}
                      className="inline-flex items-center gap-1 rounded-full border border-[#D4D4D4] bg-white py-0.5 pl-2.5 pr-1 text-[13px] text-[#171717]"
                    >
                      {w.term}
                      <RemoveButton label={t(`Remove ${w.term}`, `移除 ${w.term}`)} onClick={() => actions.remove(w.id)} disabled={actions.removingId === w.id} />
                    </span>
                  ))
                ) : (
                  <EmptyLine>{t("No preferred terms yet.", "尚未設定推薦用詞。")}</EmptyLine>
                )}
              </div>
              <form
                className="mt-auto flex flex-wrap items-end gap-2 pt-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!term.trim()) return;
                  if (await actions.add({ market, kind: "preferred", term, note: termNote })) {
                    setTerm("");
                    setTermNote("");
                  }
                }}
              >
                <UnderlineInput value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t("New term", "新用詞")} className="w-32 flex-1" />
                <UnderlineInput value={termNote} onChange={(e) => setTermNote(e.target.value)} placeholder={t("Why (optional)", "原因（選填）")} className="w-32 flex-1" />
                <AddButton disabled={!term.trim()} pending={actions.addingKind === "preferred"}>{t("Add", "新增")}</AddButton>
              </form>
              <ErrorNote error={actions.errorFor("preferred")} />
            </AssetCardFrame>

            <AssetCardFrame
              Icon={Repeat}
              eyebrow={t("Every post", "每篇貼文")}
              right={<CountChip>{t(`${swaps.length} swaps`, `${swaps.length} 組`)}</CountChip>}
              title={t("Word swaps", "替換對照")}
              hint={t("Replaced automatically in the final post.", "在最終貼文中自動替換。")}
              filled={swaps.length > 0}
            >
              <ul className="divide-y divide-stone-100">
                {swaps.length ? (
                  swaps.map((w) => (
                    <li key={w.id} className="flex items-center gap-2 py-1.5">
                      <span className="text-[13px] text-stone-500 line-through decoration-stone-300">{w.term}</span>
                      <ArrowRight size={12} className="shrink-0 text-stone-400" aria-hidden />
                      <span className="text-[13px] font-medium text-[#171717]">{w.replacement}</span>
                      {w.note ? <span className="min-w-0 flex-1 truncate text-[12px] text-stone-400">{w.note}</span> : <span className="flex-1" />}
                      <RemoveButton label={t(`Remove ${w.term}`, `移除 ${w.term}`)} onClick={() => actions.remove(w.id)} disabled={actions.removingId === w.id} />
                    </li>
                  ))
                ) : (
                  <EmptyLine>{t("No swaps yet.", "尚未設定替換對照。")}</EmptyLine>
                )}
              </ul>
              <form
                className="mt-auto flex flex-wrap items-end gap-2 pt-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!from.trim() || !to.trim()) return;
                  if (await actions.add({ market, kind: "swap", term: from, replacement: to, note: swapNote })) {
                    setFrom("");
                    setTo("");
                    setSwapNote("");
                  }
                }}
              >
                <UnderlineInput value={from} onChange={(e) => setFrom(e.target.value)} placeholder={t("Instead of", "原本的字")} className="w-24 flex-1" />
                <ArrowRight size={12} className="mb-2 shrink-0 text-stone-400" aria-hidden />
                <UnderlineInput value={to} onChange={(e) => setTo(e.target.value)} placeholder={t("Say", "改說")} className="w-24 flex-1" />
                <UnderlineInput value={swapNote} onChange={(e) => setSwapNote(e.target.value)} placeholder={t("Why", "原因")} className="w-24 flex-1" />
                <AddButton disabled={!from.trim() || !to.trim()} pending={actions.addingKind === "swap"}>{t("Add", "新增")}</AddButton>
              </form>
              <ErrorNote error={actions.errorFor("swap")} />
            </AssetCardFrame>
          </div>

          <WordingTester
            market={market}
            presets={PRESETS}
            highlight="swaps"
            label={t("Test a swap", "試試看")}
            intro={t("Paste a draft and see the swaps a rep's post would get.", "貼上草稿，看看業務貼文會被替換成什麼。")}
          />
        </>
      ) : null}
    </div>
  );
}
