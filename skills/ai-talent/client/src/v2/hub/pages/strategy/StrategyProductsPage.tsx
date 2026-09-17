import React from "react";
import { trpc } from "../../../../lib/trpc";
import { ErrorNote, Loading, PageHeader } from "../../ui";
import StratCatalog from "../../components/strat-catalog";
import { useT } from "../../lang";

export default function StrategyProductsPage() {
  const t = useT();
  const strategy = trpc.hub.admin.strategy.useQuery(undefined, { staleTime: 60_000 });
  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={t("Strategy · Products", "策略 · 產品")}
        title={t("Solutions and approved prices", "方案與核准價格")}
        subtitle={t(
          "Reps and the AI can only quote these prices. When marketing changes one, posts quoting the old price are flagged.",
          "業務與 AI 只能引用這裡的價格；行銷部一改價，引用舊價的貼文就會被標記。",
        )}
      />
      {strategy.isLoading ? <Loading /> : <ErrorNote error={strategy.error} />}
      {strategy.data ? <StratCatalog solutions={strategy.data.solutions} /> : null}
    </div>
  );
}
