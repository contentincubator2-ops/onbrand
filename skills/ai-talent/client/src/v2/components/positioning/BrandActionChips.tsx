/**
 * BrandActionChips — kicker-row action chips: 試寫 + 定案.
 *
 * Sits in the tiny grey kicker row right after `BRAND WORKSPACE · {name}`.
 * Click 試寫 → 6-scenario panel slides in below the whole hero.
 * Click 定案 → confirm + bulk-lock 定位/文字/視覺.
 *
 * Replaces the buttons that used to live inside BrandMessageBar — moved
 * here so the message bar stays single-purpose (read-only display) per
 * /30s search-bar visual hierarchy.
 *
 * The expand panel renders BELOW (not inside) the chips so the panel
 * is part of the page flow, pushing tab content down rather than
 * obscuring the bar / tiles above.
 */
import { useState } from "react";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { FlaskConical, CheckCircle2, X, Sparkles, RefreshCw } from "lucide-react";

interface ScenarioResult {
  id: string;
  icon: string;
  label: string;
  caption: string;
  ok: boolean;
  error?: string;
}

interface Props {
  brandId: number | null;
}

/** Just the chip row (controlled). */
export function BrandActionChipsRow({
  brandId, expanded, onToggle, status, isRunning,
}: Props & { expanded: boolean; onToggle: () => void; status: "full"|"interim"|"empty"; isRunning: boolean }) {
  const { lang } = useLang();
  const utils = trpc.useUtils();
  // 2026-05-27: use theater.lockTabs (bulk, now exists on server).
  // Previous code tried to ?? fallback to theater.lockTab, but tRPC proxy is
  // always truthy for any path, so the fallback never triggered and the call
  // to the non-existent theater.lockTabs caused "No procedure found" errors.
  const lockTabsMut = (trpc as any).theater?.lockTabs?.useMutation?.({
    onSuccess: () => utils.theater?.getTabLocks?.invalidate?.(),
  });

  const handleLock = async () => {
    if (!brandId) return;
    if (!confirm(lang === "en"
      ? "Lock Positioning / Copy / Visual tabs?\nAfter locking:\n· Editors become read-only\n· This becomes the single source of truth everywhere\nYou can unlock anytime."
      : "確定要鎖定 定位 / 文字 / 視覺 三個頁籤？\n鎖定後：\n· 編輯欄變成唯讀\n· 全平台都會用這份做為單一真相\n隨時可以解鎖。")) return;
    try {
      await lockTabsMut?.mutateAsync?.({ brandId, tabs: ["positioning", "copy", "visual"] });
    } catch (e: any) {
      alert((lang === "en" ? "Lock failed: " : "鎖定失敗：") + String(e?.message ?? e));
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full transition"
        style={{
          background: expanded ? "#4338CA" : "#EEF2FF",
          color:      expanded ? "#fff"    : "#4338CA",
        }}
        disabled={!brandId}
      >
        {expanded ? <X size={11} /> : <FlaskConical size={11} />}
        {expanded
          ? (lang === "en" ? "Hide test" : "收起試寫")
          : (lang === "en" ? "Test" : "試寫")}
      </button>
      <button
        onClick={handleLock}
        className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full transition text-white"
        style={{ background: status === "full" ? "#10B981" : "#9CA3AF" }}
        disabled={!brandId || status !== "full"}
        title={status !== "full"
          ? (lang === "en" ? "Finish full positioning before locking" : "等完整定位完成後才可定案")
          : (lang === "en" ? "Lock Positioning / Copy / Visual at once" : "一次鎖定 定位 / 文字 / 視覺")}
      >
        <CheckCircle2 size={11} /> {lang === "en" ? "Lock in" : "定案"}
      </button>
    </div>
  );
}

/** The expanded panel (controlled). */
export function BrandTestPanel({ brandId, open, onClose }: { brandId: number | null; open: boolean; onClose: () => void }) {
  const { lang } = useLang();
  const [results, setResults] = useState<ScenarioResult[] | null>(null);
  const [meta, setMeta] = useState<{ hasRealContent: boolean; sources: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const testMut = (trpc as any).positioningJobs?.runTestBattery?.useMutation?.();

  const runBattery = async () => {
    if (!brandId) return;
    setErr(null); setResults(null); setMeta(null);
    try {
      const r = await testMut?.mutateAsync?.({ brandId });
      if (!r?.ok) { setErr(lang === "en" ? "Test failed" : "測試失敗"); return; }
      setResults(r.scenarios as ScenarioResult[]);
      setMeta({ hasRealContent: !!r.hasRealContent, sources: r.sources ?? [] });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  // Fire on open if we don't have results yet
  if (open && !results && !testMut?.isPending && !err) runBattery();

  if (!open) return null;

  return (
    <div className="max-w-[1100px] mx-auto px-6 mt-3">
      <div
        className="bg-white border border-default-100 shadow-sm rounded-2xl"
        style={{ padding: 16 }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs">
            <Sparkles size={12} className="text-violet-500" />
            {testMut?.isPending ? (
              <span className="text-default-600">{lang === "en" ? "Drafting 6 scenarios… ~10–15s" : "同時試寫 6 個情境中…約 10-15 秒"}</span>
            ) : results ? (
              <>
                <span className="text-default-700 font-medium">{lang === "en" ? "6-scenario test results" : "6 情境試寫結果"}</span>
                {meta && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px]"
                    style={{
                      background: meta.hasRealContent ? "#D1FAE5" : "#FEF3C7",
                      color:      meta.hasRealContent ? "#047857" : "#92400E",
                    }}
                  >
                    {meta.hasRealContent
                      ? (lang === "en"
                          ? `Pulled from website / FB (${meta.sources.join(" + ")})`
                          : `已抓官網 / FB（${meta.sources.join(" + ")}）`)
                      : (lang === "en"
                          ? "⚠️ No website / FB content found — add links in the Links tile first"
                          : "⚠️ 沒抓到官網 / FB — 請先到「連結」tile 補上")}
                  </span>
                )}
              </>
            ) : (
              <span className="text-default-500">{lang === "en" ? "Getting ready…" : "準備中…"}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runBattery}
              disabled={!brandId || testMut?.isPending}
              className="flex items-center gap-1 text-xs text-default-600 hover:text-default-900 px-2 py-1 rounded transition"
              title={lang === "en" ? "Run again" : "重新跑一次"}
            >
              <RefreshCw size={11} className={testMut?.isPending ? "animate-spin" : ""} /> {lang === "en" ? "Rerun" : "重跑"}
            </button>
            <button
              onClick={onClose}
              className="text-default-400 hover:text-default-700 p-1"
              title={lang === "en" ? "Hide test" : "收起試寫"}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {err && <div className="text-sm text-danger mb-2">{err}</div>}

        {testMut?.isPending && !results ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-default-100 bg-default-50 animate-pulse" style={{ height: 130 }} />
            ))}
          </div>
        ) : results ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((s) => (
              <div key={s.id} className="rounded-lg border border-default-100 bg-default-50/60" style={{ padding: 10, minHeight: 130 }}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span style={{ fontSize: 13 }}>{s.icon}</span>
                  <span className="text-[11px] font-medium text-default-600">{s.label}</span>
                </div>
                {s.ok
                  ? <p className="text-[12px] text-default-800 whitespace-pre-wrap leading-relaxed">{s.caption}</p>
                  : <p className="text-[11px] text-danger italic">{s.error || (lang === "en" ? "Generation failed" : "產生失敗")}</p>}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Read positioning status for the chip row (small hook for parent). */
export function usePositioningStatus(brandId: number | null): { status: "full"|"interim"|"empty"; isRunning: boolean } {
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
  const isRunning = (job?.data as any)?.status === "running";
  return { status, isRunning };
}
