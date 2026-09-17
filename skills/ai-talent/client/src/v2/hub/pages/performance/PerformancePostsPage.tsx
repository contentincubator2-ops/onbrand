import React from "react";
import { trpc } from "../../../../lib/trpc";
import { ErrorNote, Loading, PageHeader } from "../../ui";
import RecentPosts from "../../components/perf-RecentPosts";
import { useT } from "../../lang";

export default function PerformancePostsPage() {
  const t = useT();
  const q = trpc.hub.admin.performance.useQuery(undefined, { refetchInterval: 15000 });
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        eyebrow={t("Results · Posts", "成效 · 貼文成效")}
        title={t("Every post, its checks and what it earned", "每篇貼文的檢查結果與成效")}
        subtitle={t(
          "Open a post to see the original draft next to the compliant version.",
          "點開貼文，可對照原始草稿與合規版本。",
        )}
      />
      {q.isLoading ? <Loading /> : <ErrorNote error={q.error} />}
      {q.data ? <RecentPosts posts={q.data.recentPosts} /> : null}
    </div>
  );
}
