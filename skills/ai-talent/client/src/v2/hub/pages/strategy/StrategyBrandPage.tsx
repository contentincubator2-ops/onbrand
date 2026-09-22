import React from "react";
import { trpc } from "../../../../lib/trpc";
import { ErrorNote, Loading, PageHeader } from "../../ui";
import StratPositioning from "../../components/strat-positioning";
import BrandAssetCards from "../../components/strat-brand-assets";
import type { Positioning } from "../../components/strat-shared";
import { useHubLang, useT } from "../../lang";

export default function StrategyBrandPage() {
  const { lang } = useHubLang();
  const t = useT();
  const strategy = trpc.hub.admin.strategy.useQuery(undefined, { staleTime: 60_000 });
  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={t("Strategy · Brand", "策略 · 品牌")}
        title={t("What every rep is allowed to say", "每位業務說的都是同一個品牌")}
        subtitle={t(
          "Positioning marketing maintains once. Every post, product lookup and AI answer draws on it.",
          "行銷部維護一次的品牌定位，每篇貼文、每次產品快查與 AI 回答都從這裡取用。",
        )}
      />
      {strategy.isLoading ? <Loading /> : <ErrorNote error={strategy.error} />}
      {/* 2026-09-22 (CJ): 操作性品牌資料放在定位上面 —— 每篇貼文都會用到的排前面，
          定位是背景。 */}
      <BrandAssetCards />

      <div className="mt-8">
        {strategy.data ? <StratPositioning positioning={(strategy.data.positioning ?? {}) as Positioning} lang={lang} /> : null}
      </div>
    </div>
  );
}
