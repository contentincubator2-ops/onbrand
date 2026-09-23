/**
 * Strategy · 市場數據 —— 一則消息一張任務卡。
 *
 * 2026-09-23 (CJ)：「對業務的客戶有幫助的資訊…例如補助案等等，可以主動推播給
 * 業務，所以每個市場消息，應該要匹配到公司的客戶行業標籤，這樣才能推播給對應
 * 的業務，讓業務轉給客戶」。
 *
 * ── 這一頁的問題換了 ─────────────────────────────────────────────────
 * 原本回答「我們有幾筆有出處的數據」。現在回答「**這則消息會到誰手上**」。
 * 所以最上面那一行不是總筆數，是**每位業務會收到幾則**——有人收到六則、有人
 * 收到零則，那是標籤出了問題，而總筆數完全看不出這件事。
 *
 * ── 還沒做的事，要說清楚 ─────────────────────────────────────────────
 * 這一頁現在算出「誰該收到什麼」，但**還沒有真的推出去**。推播會送訊息給真實
 * 的人，那需要 CJ 點頭，不是我自己決定的事。LINE 的管道已經在（lineBot.ts），
 * 缺的是觸發時機與退訂，不是技術。
 */
import React from "react";
import { trpc } from "../../../../lib/trpc";
import { ErrorNote, Loading, PageHeader, cx } from "../../ui";
import StratFactCards from "../../components/strat-fact-cards";
import { SectionLabel } from "../../components/wording-shared";
import { useT } from "../../lang";

export default function StrategyFactsPage() {
  const t = useT();
  const q = trpc.hub.admin.marketFacts.useQuery(undefined, { staleTime: 60_000 });

  const facts = q.data?.facts ?? [];
  const routing = (q.data?.routing ?? {}) as any;
  const perRep = q.data?.perRep ?? [];
  const forwardable = facts.filter((f) => routing[f.id]?.forwardable).length;
  const quiet = perRep.filter((r) => r.count === 0);
  const orphans = q.data?.unreachable ?? [];
  const expiring = facts.filter((f) => {
    const d = routing[f.id]?.daysLeft;
    return routing[f.id]?.live && d != null && d <= 30;
  });

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={t("Strategy · Market intel", "策略 · 市場數據")}
        title={t("What a rep can send their customers this week", "業務這週可以轉給客戶的東西")}
        subtitle={t(
          "Each item is tagged with the customer industries it helps, so it reaches the reps who serve them. Subsidies carry a deadline and stop being sent once it passes.",
          "每一則消息都標記了它對哪些產業的客戶有幫助，才能送到負責那些客戶的業務手上。補助帶截止日，過期就不再送。",
        )}
      />

      {q.isLoading ? <Loading /> : <ErrorNote error={q.error} />}

      {q.data ? (
        <>
          {/* 總筆數沒有用。有用的是「每個人會收到幾則」。 */}
          <div className="mb-5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[12.5px] text-stone-600">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              {t(
                `${forwardable} of ${facts.length} items are being routed to reps right now.`,
                `${facts.length} 則消息裡，目前有 ${forwardable} 則正在送給業務。`,
              )}
            </div>
            {expiring.length ? (
              <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-orange-800">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" aria-hidden />
                {t(
                  `${expiring.length} closes within 30 days.`,
                  `有 ${expiring.length} 則在 30 天內截止。`,
                )}
              </div>
            ) : null}
            {orphans.length ? (
              <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-red-700">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" aria-hidden />
                {t(
                  `${orphans.length} item${orphans.length === 1 ? "" : "s"} reach nobody — the industry tags need a look.`,
                  `有 ${orphans.length} 則送不到任何人——產業標籤要檢查。`,
                )}
              </div>
            ) : null}
          </div>

          <SectionLabel
            label={t("Market intel", "市場消息")}
            counter={`${facts.length}`}
            intro={t(
              "Two uses, different bars. Forwarding needs it to be useful to a customer and still open; quoting in a post needs a verified figure. An item can be one, both or neither.",
              "兩種用途，門檻不一樣：可以轉給客戶的要對客戶有用而且還沒過期；可以寫進貼文的要有查證過的數字。一則消息可以是其中之一、兩者、或都不是。",
            )}
          />
          <StratFactCards facts={facts as any} routing={routing} reps={q.data.reps as any} />

          <div className="mt-7">
            <SectionLabel
              label={t("What each rep receives", "每位業務會收到幾則")}
              intro={t(
                "The number that matters is not how much intel HQ has, but whether it lands. A rep at zero is a tagging problem, not a quiet week.",
                "有意義的數字不是總部有多少情報，而是它有沒有落地。某位業務掛零，那是標籤問題，不是這週剛好沒消息。",
              )}
            />
            <ul className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 bg-white">
              {perRep.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
                  <span className="text-[13px] text-neutral-800">
                    <span className="mr-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-neutral-600">
                      {r.market}
                    </span>
                    {r.name}
                  </span>
                  <span
                    className={cx(
                      "text-[13px] font-semibold tabular-nums",
                      r.count === 0 ? "text-red-700" : "text-neutral-900",
                    )}
                  >
                    {r.count === 0 ? t("nothing", "沒有") : t(`${r.count} items`, `${r.count} 則`)}
                  </span>
                </li>
              ))}
            </ul>
            {quiet.length ? (
              <p className="mt-2 text-[11.5px] leading-relaxed text-neutral-500">
                {t(
                  `${quiet.length} rep(s) would receive nothing. Either no intel covers their industries yet, or their coverage tags are wrong.`,
                  `有 ${quiet.length} 位業務什麼都收不到。可能是還沒有涵蓋他們產業的消息，也可能是他們的產業標籤設錯了。`,
                )}
              </p>
            ) : null}
          </div>

          {/* 誠實地講清楚這一頁到哪裡為止。 */}
          <p className="mt-6 text-[11.5px] leading-relaxed text-neutral-500">
            {t(
              "This page works out who should receive what. It does not send anything yet — pushing messages to real people is a separate decision, and it needs an opt-out before it goes live.",
              "這一頁算出「誰該收到什麼」，但還沒有真的送出去。推播是會送訊息給真實的人的動作，那是另一個決定，而且上線前要先有退訂機制。",
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}
