import React from "react";
import { trpc } from "../../../../lib/trpc";
import { ErrorNote, Loading, PageHeader } from "../../ui";
import ContentChecker from "../../components/content-checker";
import { useT } from "../../lang";

export default function ContentCheckerPage() {
  const t = useT();
  const content = trpc.hub.admin.content.useQuery(undefined, { staleTime: 30_000 });
  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={t("Content · Compliance checker", "內容 · 合規檢查")}
        title={t("Try to break it", "試著讓它違規看看")}
        subtitle={t(
          "Paste any draft. Disclosure, approved prices, claims, sourced statistics, competitors, tracked links and the banned-words list are enforced, and fixed.",
          "貼上任何草稿：揭露身分、核准價格、誇大用語、數據出處、競品比較、追蹤連結與禁用詞，全部檢查並自動修正。",
        )}
      />
      {content.isLoading ? <Loading /> : <ErrorNote error={content.error} />}
      {content.data ? <ContentChecker packs={content.data.packs} /> : null}
    </div>
  );
}
