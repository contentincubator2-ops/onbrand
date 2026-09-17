/** Strategy · 法規更新 — rule changes per market, mapped to the checks they affect. */
import React, { useState } from "react";
import { ExternalLink, Scale } from "lucide-react";
import { trpc } from "../../../../lib/trpc";
import { Card, ErrorNote, Loading, PageHeader, Pill, cx } from "../../ui";
import { useT } from "../../lang";

type MarketFilter = "all" | "TW" | "US";
type StatusFilter = "all" | "applied" | "review" | "monitoring";

const RULE_LABELS: Record<string, [string, string]> = {
  disclosure: ["Employee disclosure", "揭露員工身分"],
  price: ["Approved prices", "核准價格"],
  claims: ["No absolute claims", "禁止絕對用語"],
  evidence: ["Sourced statistics", "數據需有出處"],
  competitors: ["No competitor comparisons", "不比較競品"],
  link: ["Tracked link", "追蹤連結"],
};

function Pills<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ id: T; label: string; count?: number }> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px]", on ? "text-white" : "bg-white text-neutral-700")}
            style={on ? { background: "#171717" } : { border: "1px solid #E5E5E5" }}
          >
            {o.label}
            {o.count != null ? <span className={on ? "text-neutral-300" : "text-neutral-400"}>{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export default function StrategyRegulationsPage() {
  const t = useT();
  const q = trpc.hub.admin.regulations.useQuery(undefined, { staleTime: 60_000 });
  const [market, setMarket] = useState<MarketFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const all = q.data ?? [];
  const list = all.filter((r) => (market === "all" || r.market === market) && (status === "all" || r.status === status));
  const applied = all.filter((r) => r.status === "applied").length;
  const monitoring = all.filter((r) => r.status === "monitoring").length;
  const latest = all.map((r) => r.effectiveOn).filter(Boolean).sort().pop();

  const statusPill = (s: string) =>
    s === "applied" ? (
      <Pill tone="good">{t("Applied to policy pack", "已套用至政策包")}</Pill>
    ) : s === "review" ? (
      <Pill tone="warn">{t("Legal review", "法務審閱中")}</Pill>
    ) : (
      <Pill tone="info">{t("Monitoring", "追蹤中")}</Pill>
    );

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={t("Strategy · Regulation updates", "策略 · 法規更新")}
        title={t("When the rules change, every rep's next post changes with them", "法規一變，每位業務的下一篇貼文就跟著變")}
        subtitle={t(
          "HQ tracks rule changes per market and maps each one to the checks it affects.",
          "總部追蹤各市場的法規變動，並對應到它影響的每一項檢查。",
        )}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card>
          <div className="text-[12px] text-neutral-500">{t("Applied to policy packs", "已套用至政策包")}</div>
          <div className="mt-1 text-[26px] font-semibold tabular-nums">{applied}</div>
        </Card>
        <Card>
          <div className="text-[12px] text-neutral-500">{t("Being monitored", "追蹤中")}</div>
          <div className="mt-1 text-[26px] font-semibold tabular-nums">{monitoring}</div>
        </Card>
        <Card>
          <div className="text-[12px] text-neutral-500">{t("Latest effective date", "最近生效日")}</div>
          <div className="mt-1 text-[26px] font-semibold tabular-nums">{latest ?? "—"}</div>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Pills<MarketFilter>
          value={market}
          onChange={setMarket}
          options={[
            { id: "all", label: t("All markets", "全部市場"), count: all.length },
            { id: "TW", label: t("Taiwan", "台灣"), count: all.filter((r) => r.market === "TW").length },
            { id: "US", label: t("United States", "美國"), count: all.filter((r) => r.market === "US").length },
          ]}
        />
        <Pills<StatusFilter>
          value={status}
          onChange={setStatus}
          options={[
            { id: "all", label: t("Any status", "全部狀態") },
            { id: "applied", label: t("Applied", "已套用") },
            { id: "monitoring", label: t("Monitoring", "追蹤中") },
          ]}
        />
      </div>

      {q.isLoading ? <Loading /> : <ErrorNote error={q.error} />}

      <ol className="relative space-y-4 border-l border-neutral-200 pl-5">
        {list.map((r) => (
          <li key={r.id} className="relative">
            <span className="absolute -left-[27px] top-5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white bg-orange-500 ring-1 ring-orange-200" aria-hidden />
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">{r.market}</span>
                <span className="text-[12px] text-neutral-500">{r.authority}</span>
                <span className="flex-1" />
                {statusPill(r.status)}
              </div>
              <h3 className="mt-2 text-[16px] font-semibold leading-snug text-neutral-900">{r.title}</h3>
              <div className="mt-1 text-[12px] tabular-nums text-neutral-500">
                {r.effectiveOn ? t(`Effective ${r.effectiveOn}`, `生效 ${r.effectiveOn}`) : t("Effective date not yet set", "生效日尚未公布")}
                {r.publishedOn ? ` · ${t(`Published ${r.publishedOn}`, `公布 ${r.publishedOn}`)}` : ""}
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-neutral-700">{r.summary}</p>
              <div className="mt-3 rounded-lg border border-orange-100 bg-orange-50/60 p-3">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-orange-900">
                  <Scale size={13} aria-hidden />
                  {t("Impact on rep posts", "對業務貼文的影響")}
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-neutral-800">{r.impact}</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {r.rules.map((rule) => {
                  const label = RULE_LABELS[rule];
                  return (
                    <span key={rule} className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[12px] text-neutral-700">
                      {label ? t(label[0], label[1]) : rule}
                    </span>
                  );
                })}
                <span className="flex-1" />
                <a
                  href={r.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-neutral-600 underline-offset-2 hover:text-neutral-900 hover:underline"
                >
                  {t("Read the source", "查看原文")} <ExternalLink size={12} aria-hidden />
                </a>
              </div>
            </Card>
          </li>
        ))}
      </ol>
      {!q.isLoading && !list.length ? <p className="text-[13px] text-neutral-500">{t("No updates match these filters.", "沒有符合條件的法規更新。")}</p> : null}
    </div>
  );
}
