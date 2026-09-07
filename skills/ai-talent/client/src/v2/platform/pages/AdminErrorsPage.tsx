/**
 * AdminErrorsPage — Sentry-lite dashboard for production errors.
 *
 * 2026-05-11 (CJ「補 Sentry-style error tracking」). Surfaces what
 * users hit but didn't tell you about — auto-captured by the tRPC
 * errorLoggerMiddleware in _core/trpc.ts.
 *
 * Layout:
 *   Top stats:   X unresolved / Y resolved / Z total in window
 *   Window:      24h / 7d toggle
 *   Tab:         未解決 (default) / 已解決 / 全部
 *   Groups:      top fingerprints by count, click to expand
 *   Detail:      per-occurrence list with stack + meta JSON
 *   Action:      「標記已處理」per row / per fingerprint
 *
 * Gated by adminProcedure server-side — non-admins get FORBIDDEN.
 */
import { useMemo, useState } from "react";
import { trpc } from "../../../lib/trpc";
import { AlertTriangle, CheckCircle2, ChevronRight, RefreshCw } from "lucide-react";

type ResolvedFilter = "unresolved" | "resolved" | "all";
type WindowOpt = "24h" | "7d";

interface ErrorRow {
  id: number;
  level: string;
  source: string;
  route: string | null;
  userId: number | null;
  message: string;
  stack: string | null;
  meta: any;
  fingerprint: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: number | null;
}

export default function AdminErrorsPage() {
  const [resolved, setResolved] = useState<ResolvedFilter>("unresolved");
  const [window, setWindow] = useState<WindowOpt>("24h");
  const [openFingerprint, setOpenFingerprint] = useState<string | null>(null);

  const statsQ = (trpc as any).ops?.errorStats?.useQuery?.(
    { window },
    { refetchInterval: 30_000, refetchOnWindowFocus: false },
  );
  const listQ = (trpc as any).ops?.listForAdmin?.useQuery?.(
    { limit: 200, resolved },
    { refetchInterval: 30_000, refetchOnWindowFocus: false },
  );
  const utils = (trpc as any).useUtils?.() ?? null;
  const markResolvedM = (trpc as any).ops?.markResolved?.useMutation?.({
    onSuccess: () => {
      utils?.ops?.errorStats?.invalidate?.();
      utils?.ops?.listForAdmin?.invalidate?.();
    },
  });

  const stats: any = statsQ?.data ?? null;
  const list: ErrorRow[] = listQ?.data ?? [];
  const isLoading = !!statsQ?.isLoading || !!listQ?.isLoading;
  const isAdmin = !(statsQ?.error?.data?.code === "FORBIDDEN" || listQ?.error?.data?.code === "FORBIDDEN");

  // Group rows by fingerprint for the unresolved view.
  const grouped = useMemo(() => {
    const m = new Map<string, ErrorRow[]>();
    for (const r of list) {
      const k = r.fingerprint ?? `__nofp__${r.id}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return Array.from(m.entries()).map(([fp, rows]) => ({
      fp, rows, count: rows.length, latest: rows[0]!,
    })).sort((a, b) => b.count - a.count);
  }, [list]);

  if (!isAdmin && !isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
        <div className="text-center max-w-md">
          <AlertTriangle size={32} className="mx-auto mb-3 text-neutral-500" />
          <p className="text-base font-semibold text-neutral-900 mb-1">需要管理員權限</p>
          <p className="text-sm text-neutral-600">
            錯誤追蹤面板僅限管理員。請聯絡 SoWork 把你帳號的 role 設為 admin。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[12px] font-semibold uppercase tracking-[0.25em] text-neutral-600 mb-2">
            ADMIN · ERROR TRACKING
          </p>
          <h1
            className="font-bold tracking-tight leading-none text-neutral-900 mb-3"
            style={{ fontSize: "clamp(1.5rem, 2.6vw, 2rem)" }}
          >
            錯誤追蹤
          </h1>
          <p
            className="text-default-700"
            style={{
              fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
              fontStyle: "italic", fontSize: 14, lineHeight: 1.7, maxWidth: 640,
            }}
          >
            自動捕捉到的 server / client 錯誤 · 標記已處理之後從這裡消失，避免持續干擾
          </p>
        </div>

        {/* Stats + window toggle */}
        <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-6">
            <StatCell label="未解決" value={stats?.totals?.unresolved ?? 0} accent="#B91C1C" />
            <StatCell label="已解決" value={stats?.totals?.resolved ?? 0} accent="#525252" />
            <StatCell label="總計" value={stats?.totals?.total ?? 0} accent="#171717" />
          </div>
          <div className="flex items-center gap-3">
            <WindowToggle value={window} onChange={setWindow} />
            <button
              onClick={() => { statsQ?.refetch?.(); listQ?.refetch?.(); }}
              className="px-3 py-1.5 rounded-md border border-neutral-300 hover:border-neutral-900 text-xs text-neutral-700 flex items-center gap-1.5"
            >
              <RefreshCw size={12} /> 重新整理
            </button>
          </div>
        </div>

        {/* Tab: unresolved / resolved / all */}
        <div className="flex items-center gap-1 mb-5 border-b border-neutral-300">
          {(["unresolved", "resolved", "all"] as ResolvedFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setResolved(f)}
              className={`px-3 py-2 text-sm font-medium transition border-b-2 ${
                resolved === f
                  ? "border-neutral-900 text-neutral-900"
                  : "border-transparent text-neutral-600 hover:text-neutral-900"
              }`}
            >
              {f === "unresolved" ? "未解決" : f === "resolved" ? "已解決" : "全部"}
            </button>
          ))}
        </div>

        {/* Groups */}
        {isLoading ? (
          <div className="text-center py-16 text-neutral-600">載入中…</div>
        ) : grouped.length === 0 ? (
          <div className="bg-white border border-dashed border-neutral-300 rounded-xl py-16 text-center">
            <CheckCircle2 size={32} className="mx-auto mb-3 text-emerald-600" />
            <p className="text-base font-medium text-neutral-900 mb-1">乾淨 — 沒有未處理錯誤</p>
            <p className="text-sm text-neutral-600">最後 {window} 內沒有需要看的案例</p>
          </div>
        ) : (
          <div className="space-y-2">
            {grouped.map((g) => {
              const isOpen = openFingerprint === g.fp;
              return (
                <div
                  key={g.fp}
                  className="bg-white border border-neutral-300 rounded-lg overflow-hidden transition"
                  style={{ borderColor: isOpen ? "#171717" : undefined }}
                >
                  {/* Group summary row */}
                  <div
                    onClick={() => setOpenFingerprint(isOpen ? null : g.fp)}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-neutral-50"
                  >
                    <span
                      className="text-[12px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider"
                      style={{
                        background: g.latest.level === "error" ? "#FEE2E2" : g.latest.level === "warn" ? "#FEF3C7" : "#E5E7EB",
                        color: g.latest.level === "error" ? "#B91C1C" : g.latest.level === "warn" ? "#92400E" : "#374151",
                      }}
                    >
                      {g.latest.level}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {g.latest.message}
                      </p>
                      <p className="text-[12px] text-neutral-600 mt-0.5 truncate">
                        <span className="font-mono">{g.latest.source}</span>
                        {g.latest.route && <span className="ml-2 text-neutral-500">· {g.latest.route}</span>}
                        <span className="ml-2 text-neutral-500">· 最後：{fmtTime(g.latest.createdAt)}</span>
                      </p>
                    </div>
                    <span
                      className="text-xs font-bold tabular-nums px-2 py-0.5 rounded bg-neutral-900 text-white"
                      title={`此 fingerprint 共 ${g.count} 筆`}
                    >
                      ×{g.count}
                    </span>
                    {resolved !== "resolved" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!confirm(`標記 fingerprint「${g.latest.message.slice(0, 40)}…」為已處理？將清掉同 fingerprint 全部 ${g.count} 筆。`)) return;
                          markResolvedM?.mutateAsync?.({ fingerprint: g.fp });
                        }}
                        className="text-xs text-neutral-600 hover:text-neutral-900 px-2 py-1 rounded hover:bg-neutral-100"
                      >
                        標記全部已處理
                      </button>
                    )}
                    <ChevronRight
                      size={16}
                      className="text-neutral-600 transition-transform"
                      style={{ transform: isOpen ? "rotate(90deg)" : "none" }}
                    />
                  </div>

                  {/* Expanded: per-occurrence list */}
                  {isOpen && (
                    <div className="border-t border-neutral-300 bg-neutral-50">
                      {g.rows.map((r) => (
                        <div key={r.id} className="px-4 py-3 border-b border-neutral-300 last:border-b-0">
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                            <div className="text-[12px] text-neutral-600 font-mono">
                              #{r.id} · {fmtTime(r.createdAt)}
                              {r.userId && <span className="ml-2">user #{r.userId}</span>}
                              {r.resolvedAt && (
                                <span className="ml-2 text-emerald-700">✓ 已處理 {fmtTime(r.resolvedAt)}</span>
                              )}
                            </div>
                            {!r.resolvedAt && (
                              <button
                                onClick={() => markResolvedM?.mutateAsync?.({ id: r.id })}
                                className="text-[12px] text-neutral-600 hover:text-neutral-900 px-2 py-0.5 rounded hover:bg-neutral-200"
                              >
                                標記此筆已處理
                              </button>
                            )}
                          </div>
                          {r.stack && (
                            <pre
                              className="text-[12px] text-neutral-800 bg-white border border-neutral-300 rounded p-2 overflow-x-auto whitespace-pre-wrap mb-1.5"
                              style={{ maxHeight: 220 }}
                            >
                              {r.stack}
                            </pre>
                          )}
                          {r.meta && (
                            <pre className="text-[12px] text-neutral-600 font-mono break-all bg-white border border-neutral-300 rounded p-2 overflow-x-auto">
                              {JSON.stringify(r.meta, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCell({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-neutral-600 mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums" style={{ color: accent }}>{value}</p>
    </div>
  );
}

function WindowToggle({ value, onChange }: { value: WindowOpt; onChange: (v: WindowOpt) => void }) {
  return (
    <div className="inline-flex border border-neutral-300 rounded-md overflow-hidden">
      {(["24h", "7d"] as WindowOpt[]).map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1.5 text-xs font-medium transition ${
            value === opt
              ? "bg-neutral-900 text-white"
              : "bg-white text-neutral-700 hover:bg-neutral-100"
          }`}
        >
          {opt === "24h" ? "24 小時" : "7 天"}
        </button>
      ))}
    </div>
  );
}

function fmtTime(s: string | null): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60_000) return "剛剛";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分鐘前`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小時前`;
    return d.toLocaleString("zh-TW", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return s;
  }
}
