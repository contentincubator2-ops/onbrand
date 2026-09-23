/**
 * Strategy · 正面用詞 — preferred terms (go into every prompt) and word swaps
 * (applied to every post).
 *
 * ── 2026-09-23 (CJ「優化這一頁」) ────────────────────────────────────
 * 這一頁原本把兩張卡並排，長得一模一樣，所以看起來是同一種東西。它們不是：
 *
 *   推薦用詞 → 寫進**寫作指令**。是「請優先使用」，模型可以不照做，而且沒有
 *              任何地方檢查它做了沒有。
 *   替換對照 → **確定性字串替換**（applySwaps）。寫了就一定會發生，不經過模型。
 *
 * 一個是期望，一個是保證。十三條規則排在一起看不出差別，維護的人會以為自己
 * 設了十三道閘門，其實只有一半是。
 *
 * 處理方式不是把文案寫得更小心（那只是換個說法繼續含糊），是**把真實數字放
 * 上去**：每一條規則旁邊顯示它在實際產出的貼文裡作用了幾次。推薦用詞顯示
 * 「出現在幾篇」，替換對照顯示「觸發過幾次」。作用不到的就顯示 0——那是這一頁
 * 最有用的一個數字，因為它指出哪幾條是紙上規則。
 *
 * 再加一段「規則之間有沒有打架」，因為這裡真的有一個會讓貼文變成不合格的組合
 * （替換把禁用詞寫回去，而替換排在修補之後）。詳見 wordingUsage.ts。
 */
import React, { useState } from "react";
import { ArrowRight, Repeat, ThumbsUp } from "lucide-react";
import { ErrorNote, Loading, PageHeader } from "../../ui";
import { useT } from "../../lang";
import WordingTester from "../../components/wording-tester";
import {
  AddButton,
  AssetCardFrame,
  ConflictPanel,
  CountChip,
  EmptyLine,
  LiveNote,
  MarketTabs,
  MeasuredNote,
  RemoveButton,
  SectionLabel,
  UnderlineInput,
  UsageChip,
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
  // 牴觸是逐市場算的（禁用詞在別的分頁維護，但規則之間的衝突要一起看）。
  const marketConflicts = (query.data?.conflicts ?? []).filter((c) => c.market === market);

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
          "Two different kinds of rule. Preferred terms are asked of the writer and can be ignored; word swaps are applied to the text and cannot. The numbers show which is which in practice.",
          "這裡有兩種不同的規則：推薦用詞是「請模型優先使用」，模型可以不理；替換對照是直接改字，不經過模型。旁邊的數字是它們實際作用的次數。",
        )}
        right={<MarketTabs market={market} onChange={setMarket} counts={counts} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1">
        <LiveNote>{t("Live: changes apply to the next post a rep writes. No redeploy.", "即時生效：業務寫的下一篇就會套用，不需要重新部署。")}</LiveNote>
        {query.data ? <MeasuredNote measured={query.data.measured} market={market} /> : null}
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
              eyebrow={t("Asked for", "請模型照做")}
              right={<CountChip>{t(`${preferred.length} terms`, `${preferred.length} 個`)}</CountChip>}
              title={t("Preferred terms", "推薦用詞")}
              // 「怎麼衡量」而不是「為什麼放這個」—— 跟總管理的卡同一條紀律。
              hint={t(
                "Written into the prompt as a request. Nothing enforces it, so each term shows how many of the last posts actually contain it.",
                "以「請優先使用」寫進指令，沒有任何地方強制。所以每個詞旁邊是它實際出現在最近幾篇貼文裡。",
              )}
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
                      <UsageChip usage={query.data?.measured.usage[w.id]} kind="preferred" />
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
              eyebrow={t("Always applied", "一定會發生")}
              right={<CountChip>{t(`${swaps.length} swaps`, `${swaps.length} 組`)}</CountChip>}
              title={t("Word swaps", "替換對照")}
              hint={t(
                "A string replacement on the finished text — the model is not involved, so it cannot be ignored. Each row shows how many of the last posts it actually fired on.",
                "直接對完稿做字串替換，不經過模型，所以不可能被忽略。每一列旁邊是它實際在最近幾篇裡觸發過。",
              )}
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
                      <UsageChip usage={query.data?.measured.usage[w.id]} kind="swap" />
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

          {/* 風險放在規則後面、試寫前面 —— 照總管理那一頁定下的順序（成效、啟用、
              可信度、風險）。沒有問題的時候也要出現，因為「查過沒事」跟「沒查」
              是兩回事。 */}
          <div className="mt-7">
            <SectionLabel
              label={t("Rules that fight each other", "互相牴觸的規則")}
              counter={marketConflicts.length ? `${marketConflicts.length}` : undefined}
              intro={t(
                "Order matters: the writer is checked, then repaired, then the swaps run, then it is checked once more. A swap that puts a banned word back in is caught by that last check — but there is no repair step after it, so the post is flagged rather than fixed.",
                "順序會咬人：先檢查、再修補、然後替換、最後再檢查一次。一組把禁用詞換回去的替換，最後那次檢查抓得到，但它後面已經沒有修補步驟了——那篇會被標記成不合格，而不是被修好。",
              )}
            />
            <ConflictPanel conflicts={marketConflicts} />
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
