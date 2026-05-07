/**
 * BrandMessageBar — repurposes BrandsPage's old search slot.
 *
 * Compact mode (default):
 *   [pill] [current USP / tagline] [🔄] [🧪 測試] [✅ 定案]
 *
 * Click 測試 → bar EXPANDS DOWN inline (no modal, stays on Brand page).
 * Expanded panel shows 6 scenario cards (FB / IG / 客服 / 直播 / 危機 / EDM)
 * generated in parallel (~10-15s). User can collapse with × or 重跑.
 *
 * CJ direction (2026-05-07):
 *   "測試 modal 跳出來，那框框就沒有用處了。要充分利用現有版位。
 *    我覺得一次寫六個情境很棒。"
 */
import { useState } from "react";
import { trpc } from "../../../lib/trpc";
import { FlaskConical, CheckCircle2, RefreshCw, X, Sparkles } from "lucide-react";

interface Props {
  brandId: number | null;
}

interface ScenarioResult {
  id: string;
  icon: string;
  label: string;
  caption: string;
  ok: boolean;
  error?: string;
}

export default function BrandMessageBar({ brandId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [results, setResults] = useState<ScenarioResult[] | null>(null);
  const [testMeta, setTestMeta] = useState<{ hasRealContent: boolean; sources: string[] } | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);

  const cur = (trpc as any).positioningJobs?.getCurrent?.useQuery?.(
    { entityKind: "brand", entityId: brandId ?? 0 },
    { enabled: !!brandId, refetchInterval: 6_000 },
  );
  const data = (cur?.data as any) ?? null;
  const status = (data?.source as "full" | "interim" | "empty" | undefined) ?? "empty";

  const job = (trpc as any).positioningJobs?.getStatus?.useQuery?.(
    { entityKind: "brand", entityId: brandId ?? 0 },
    { enabled: !!brandId, refetchInterval: 4_000 },
  );
  const jobData = job?.data as any;
  const isRunning = jobData?.status === "running";

  const utils = trpc.useUtils();
  const interimMut = (trpc as any).positioningJobs?.runInterim?.useMutation?.({
    onSuccess: () => utils.positioningJobs?.getCurrent?.invalidate?.(),
  });
  const startMut = (trpc as any).positioningJobs?.start?.useMutation?.();

  const testMut = (trpc as any).positioningJobs?.runTestBattery?.useMutation?.();

  const lockTabsMut = (trpc as any).theater?.lockTabs?.useMutation?.({
    onSuccess: () => utils.theater?.getTabLocks?.invalidate?.(),
  }) ?? (trpc as any).theater?.lockTab?.useMutation?.({
    onSuccess: () => utils.theater?.getTabLocks?.invalidate?.(),
  });

  const message = data?.usp || data?.positioning || data?.tagline || "";
  const placeholder = "等待品牌定位產生中…";

  const pillColor = status === "full" ? { bg: "#D1FAE5", fg: "#047857", label: "完整定位 ✓" }
                  : status === "interim" ? { bg: "#FEF3C7", fg: "#92400E", label: isRunning ? "暫時定位（全本進行中）" : "暫時定位" }
                  : { bg: "#F3F4F6", fg: "#6B7280", label: "等待產生" };

  const runBattery = async () => {
    if (!brandId) return;
    setTestErr(null); setResults(null); setTestMeta(null);
    try {
      const r = await testMut?.mutateAsync?.({ brandId });
      if (!r?.ok) { setTestErr("測試失敗"); return; }
      setResults(r.scenarios as ScenarioResult[]);
      setTestMeta({ hasRealContent: !!r.hasRealContent, sources: r.sources ?? [] });
    } catch (e: any) {
      setTestErr(String(e?.message ?? e));
    }
  };

  const handleTest = () => {
    if (!brandId) return;
    setExpanded(true);
    if (!results && !testMut?.isPending) runBattery();
  };

  const handleLock = async () => {
    if (!brandId) return;
    if (!confirm("確定要鎖定 定位 / 文字 / 視覺 三個 tab？\n鎖定後：\n· 編輯欄變成唯讀\n· 全平台都會用這份做為單一真相\n隨時可以解鎖。")) return;
    try {
      if ((trpc as any).theater?.lockTabs) {
        await lockTabsMut?.mutateAsync?.({ brandId, tabs: ["positioning", "copy", "visual"] });
      } else {
        for (const tab of ["positioning", "copy", "visual"] as const) {
          await lockTabsMut?.mutateAsync?.({ brandId, tab, locked: true });
        }
      }
    } catch (e: any) {
      alert("鎖定失敗：" + String(e?.message ?? e));
    }
  };

  const handleRegenerate = () => {
    if (!brandId) return;
    interimMut?.mutate?.({ entityKind: "brand", entityId: brandId });
    startMut?.mutate?.({ entityKind: "brand", entityId: brandId, lang: "zh-TW" });
  };

  return (
    <div className="w-full" style={{ maxWidth: 800 }}>
      {/* Compact bar */}
      <div
        className="flex items-center gap-3 px-4 bg-white border border-default-100 shadow-md"
        style={{
          height: 56,
          borderRadius: expanded ? "20px 20px 0 0" : 20,
          borderBottom: expanded ? "1px solid #F3F4F6" : undefined,
        }}
      >
        <span
          className="text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0 tracking-wide"
          style={{ background: pillColor.bg, color: pillColor.fg }}
        >
          {pillColor.label}
        </span>
        <div className="flex-1 min-w-0 text-sm text-default-800 truncate" title={message || placeholder}>
          {message || <span className="text-default-400 italic">{placeholder}</span>}
        </div>
        <button
          onClick={handleRegenerate}
          className="text-default-400 hover:text-default-700 transition shrink-0 p-1"
          title="重新產生暫時定位"
          disabled={!brandId}
        >
          <RefreshCw size={14} className={interimMut?.isPending ? "animate-spin" : ""} />
        </button>
        <button
          onClick={expanded ? () => setExpanded(false) : handleTest}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition shrink-0"
          style={{
            background: expanded ? "#4338CA" : "#EEF2FF",
            color: expanded ? "#fff" : "#4338CA",
          }}
          disabled={!brandId}
        >
          {expanded ? <X size={13} /> : <FlaskConical size={13} />}
          {expanded ? "收起" : "測試"}
        </button>
        <button
          onClick={handleLock}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition shrink-0 text-white"
          style={{ background: status === "full" ? "#10B981" : "#9CA3AF" }}
          disabled={!brandId || status !== "full"}
          title={status !== "full" ? "等完整定位完成後才可定案" : "一次鎖定 定位 / 文字 / 視覺"}
        >
          <CheckCircle2 size={13} /> 定案
        </button>
      </div>

      {/* Expanded test battery panel */}
      {expanded && (
        <div
          className="bg-white border border-default-100 shadow-md"
          style={{
            borderRadius: "0 0 20px 20px",
            borderTop: "none",
            padding: 16,
          }}
        >
          {/* Status row */}
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs">
              <Sparkles size={12} className="text-violet-500" />
              {testMut?.isPending ? (
                <span className="text-default-600">同時試寫 6 個情境中…約 10-15 秒</span>
              ) : results ? (
                <>
                  <span className="text-default-700 font-medium">6 情境測試結果</span>
                  {testMeta && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px]"
                      style={{
                        background: testMeta.hasRealContent ? "#D1FAE5" : "#FEF3C7",
                        color:      testMeta.hasRealContent ? "#047857" : "#92400E",
                      }}
                    >
                      {testMeta.hasRealContent
                        ? `已抓官網 / FB（${testMeta.sources.join(" + ")}）`
                        : "⚠️ 沒抓到官網 / FB — 結果可能不準"}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-default-500">準備中…</span>
              )}
            </div>
            <button
              onClick={runBattery}
              disabled={!brandId || testMut?.isPending}
              className="flex items-center gap-1 text-xs text-default-600 hover:text-default-900 px-2 py-1 rounded transition"
              title="重新跑一次"
            >
              <RefreshCw size={11} className={testMut?.isPending ? "animate-spin" : ""} /> 重跑
            </button>
          </div>

          {testErr && <div className="text-sm text-danger mb-2">{testErr}</div>}

          {/* Skeletons or results */}
          {testMut?.isPending && !results ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-default-100 bg-default-50 animate-pulse" style={{ height: 130 }} />
              ))}
            </div>
          ) : results ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((s) => (
                <ScenarioCard key={s.id} scenario={s} />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ScenarioCard({ scenario }: { scenario: ScenarioResult }) {
  return (
    <div
      className="rounded-lg border border-default-100 bg-default-50/50 hover:bg-default-50 transition"
      style={{ padding: 10, minHeight: 130 }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span style={{ fontSize: 13 }}>{scenario.icon}</span>
        <span className="text-[11px] font-medium text-default-600">{scenario.label}</span>
      </div>
      {scenario.ok ? (
        <p className="text-[12px] text-default-800 whitespace-pre-wrap leading-relaxed">{scenario.caption}</p>
      ) : (
        <p className="text-[11px] text-danger italic">{scenario.error || "產生失敗"}</p>
      )}
    </div>
  );
}
