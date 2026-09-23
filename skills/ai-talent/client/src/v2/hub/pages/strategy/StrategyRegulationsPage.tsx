/**
 * Strategy · 法規更新 —— 一條法規一張任務卡。
 *
 * 2026-09-23 (CJ「regulation update，請同樣使用任務卡的呈現方式」)。
 *
 * ── 上面那排統計拿掉了 ───────────────────────────────────────────────
 * 原本是三格（已套用 / 追蹤中 / 最近生效日）加一條時間軸。三格數字在卡片牆上
 * 本來就一眼看得到——每張卡自己帶狀態——所以它只是把同一件事講兩次。
 *
 * 取代它的是一行：**有沒有「已經生效但還沒套用」的。** 那是這一頁唯一一個
 * 需要有人今天就去處理的狀態，而它在原本的時間軸上完全看不出來（一條「法務
 * 審閱中」的法規，跟一條「法務審閱中而且三個月前就生效了」的，長得一模一樣）。
 *
 * 市場篩選留著，因為台灣與美國的法規是兩套，而且會一直長。狀態篩選拿掉——
 * 六張卡的狀態用看的就夠了，篩選只是多一層點擊。
 */
import React, { useState } from "react";
import { ErrorNote, Loading, PageHeader, cx } from "../../ui";
import { useT } from "../../lang";
import { trpc } from "../../../../lib/trpc";
import StratRegulationCards from "../../components/strat-regulation-cards";
import { SectionLabel } from "../../components/wording-shared";

type MarketFilter = "all" | "TW" | "US";

export default function StrategyRegulationsPage() {
  const t = useT();
  const q = trpc.hub.admin.regulations.useQuery(undefined, { staleTime: 60_000 });
  const [market, setMarket] = useState<MarketFilter>("all");

  const all = q.data?.items ?? [];
  const coverage = q.data?.coverage ?? {};
  const list = all.filter((r) => market === "all" || r.market === market);

  const overdue = Object.values(coverage).filter((c: any) => c.overdueDays != null).length;
  const broken = Object.values(coverage).filter((c: any) => c.unknown.length > 0).length;

  const options: Array<{ id: MarketFilter; label: string; count: number }> = [
    { id: "all", label: t("All markets", "全部市場"), count: all.length },
    { id: "TW", label: t("Taiwan", "台灣"), count: all.filter((r) => r.market === "TW").length },
    { id: "US", label: t("United States", "美國"), count: all.filter((r) => r.market === "US").length },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={t("Strategy · Regulation updates", "策略 · 法規更新")}
        title={t("When the rules change, every rep's next post changes with them", "法規一變，每位業務的下一篇貼文就跟著變")}
        subtitle={t(
          "One card per rule change: what it does to a rep post, which checks it turned into, and whether it is actually in force yet.",
          "一條法規一張卡：它對業務貼文做了什麼、變成了哪幾項檢查、以及它到底生效了沒有。",
        )}
        right={
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Market", "市場")}>
            {options.map((o) => {
              const on = market === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setMarket(o.id)}
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px]",
                    on ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100",
                  )}
                >
                  {o.label}
                  <span className={cx("tabular-nums", on ? "text-stone-300" : "text-stone-400")}>{o.count}</span>
                </button>
              );
            })}
          </div>
        }
      />

      {/* 一行取代三格統計：今天有沒有要處理的事。沒有也要說，留白看起來像沒查。 */}
      <div className="mb-5 space-y-1.5">
        <div className="flex items-center gap-1.5 text-[12.5px]">
          <span
            className={cx("h-1.5 w-1.5 shrink-0 rounded-full", overdue ? "bg-red-600" : "bg-emerald-500")}
            aria-hidden
          />
          <span className={overdue ? "font-medium text-red-700" : "text-stone-600"}>
            {overdue
              ? t(
                  `${overdue} rule${overdue === 1 ? " is" : "s are"} already in effect but not marked as applied.`,
                  `有 ${overdue} 條法規已經生效，但狀態還不是「已套用」。`,
                )
              : t(
                  "Every rule that is in force is marked as applied to its policy pack.",
                  "所有已生效的法規，狀態都是「已套用至政策包」。",
                )}
          </span>
        </div>
        {broken ? (
          <div className="flex items-center gap-1.5 text-[12.5px] text-amber-800">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
            {t(
              `${broken} rule${broken === 1 ? "" : "s"} name a check that does not exist in the policy pack — that mapping does nothing.`,
              `有 ${broken} 條法規指名了政策包裡沒有的檢查——那個對應是空的。`,
            )}
          </div>
        ) : null}
      </div>

      {q.isLoading ? <Loading /> : <ErrorNote error={q.error} />}

      {q.data ? (
        <>
          <SectionLabel
            label={t("Rule changes", "法規變動")}
            counter={`${list.length}`}
            intro={t(
              "Tracked by HQ per market. The status on each card is maintained by hand — what is checked automatically is only whether the checks a rule names exist.",
              "由總部逐市場追蹤。每張卡上的狀態是人工維護的；系統自動檢查的只有「它指名的檢查存不存在」。",
            )}
          />
          <StratRegulationCards items={list} coverage={coverage as any} onChanged={() => void q.refetch()} />
          {!list.length ? (
            <p className="text-[13px] text-neutral-500">{t("No updates for this market.", "這個市場沒有法規更新。")}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
