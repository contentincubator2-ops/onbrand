import React from "react";
import { trpc } from "../../../../lib/trpc";
import { ErrorNote, Loading, PageHeader } from "../../ui";
import StratFacts from "../../components/strat-facts";
import { useT } from "../../lang";

export default function StrategyFactsPage() {
  const t = useT();
  const strategy = trpc.hub.admin.strategy.useQuery(undefined, { staleTime: 60_000 });
  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={t("Strategy · Market facts", "策略 · 市場數據")}
        title={t("Cited facts reps can quote", "業務可以引用的有出處數據")}
        subtitle={t(
          "Every statistic carries its source. Unverified facts stay visible to HQ but can never appear in a post.",
          "每個數字都附出處；尚未查證的數據總部看得到，但不會出現在任何貼文裡。",
        )}
      />
      {strategy.isLoading ? <Loading /> : <ErrorNote error={strategy.error} />}
      {strategy.data ? <StratFacts facts={strategy.data.facts} /> : null}
    </div>
  );
}
