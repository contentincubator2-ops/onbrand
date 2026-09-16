import React, { useState } from "react";
import { trpc } from "../../../lib/trpc";
import { ErrorNote, Loading, PageHeader } from "../ui";
import StratPositioning, { PositioningToggle } from "../components/strat-positioning";
import StratCatalog from "../components/strat-catalog";
import StratFacts from "../components/strat-facts";
import type { Lang, Positioning } from "../components/strat-shared";

export default function HubStrategyPage() {
  const [lang, setLang] = useState<Lang>("en");
  const strategy = trpc.hub.admin.strategy.useQuery(undefined, { staleTime: 60_000 });

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow="Strategy"
        title="What every rep is allowed to say"
        subtitle="One source of truth from marketing: positioning, approved prices, and cited facts. Reps and the AI can't go off-script."
        right={<PositioningToggle lang={lang} onChange={setLang} />}
      />

      {strategy.isLoading ? (
        <Loading label="Loading strategy…" />
      ) : strategy.error ? (
        <ErrorNote error={strategy.error} />
      ) : strategy.data ? (
        <div className="space-y-10">
          <StratPositioning positioning={(strategy.data.positioning ?? {}) as Positioning} lang={lang} />
          <StratCatalog solutions={strategy.data.solutions} />
          <StratFacts facts={strategy.data.facts} />
        </div>
      ) : null}
    </div>
  );
}
