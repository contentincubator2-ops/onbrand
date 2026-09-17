import React from "react";
import { trpc } from "../../../../lib/trpc";
import { ErrorNote, Loading, PageHeader } from "../../ui";
import ContentPolicy from "../../components/content-policy";
import { useT } from "../../lang";

export default function ContentPoliciesPage() {
  const t = useT();
  const content = trpc.hub.admin.content.useQuery(undefined, { staleTime: 30_000 });
  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={t("Content · Policy packs", "內容 · 政策包")}
        title={t("One workflow, market-specific law", "同一套流程，各市場的法規")}
        subtitle={t(
          "Taiwan Fair Trade rules and the US FTC Endorsement Guides, encoded as the checks every post passes.",
          "台灣公平會規範與美國 FTC 背書指南，轉成每篇貼文都要通過的檢查。",
        )}
      />
      {content.isLoading ? <Loading /> : <ErrorNote error={content.error} />}
      {content.data ? <ContentPolicy packs={content.data.packs} /> : null}
    </div>
  );
}
