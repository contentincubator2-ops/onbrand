/**
 * AdminDashboardPage — internal monitoring at a glance.
 *
 * 2026-05-16 (CJ「幫我規劃一個後台，可以監測使用者的情況數量等等」).
 *
 * Three sections matching CJ's priority pick:
 *   1. 成長漏斗  — signups / verify rate / DAU·WAU·MAU / entity counts
 *   2. 用量與成本 — LLM spend (24h/7d/30d) / top spenders / by model
 *   3. 健康與客服 — stuck positioning jobs / support tickets / errors / revenue
 *   + 最近註冊  — recent signups table
 *
 * Gated server-side by adminProcedure (role='admin' OR @sowork.tw|ai OR
 * userId 199). Non-admins get FORBIDDEN — page shows a friendly notice.
 *
 * Notion-discipline: monochrome, hairline borders, no decorative color.
 * Numbers are the content. Auto-refreshes every 30s.
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { RefreshCw, TrendingUp, DollarSign, Activity, AlertTriangle, Bug, Download, Target, Users, Clock } from "lucide-react";

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff",
  padding: "14px 16px",
};
const sectionTitle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, letterSpacing: "0.18em",
  textTransform: "uppercase", color: "#525252", margin: "26px 0 10px",
  display: "flex", alignItems: "center", gap: 7,
};

function Stat({ label, value, sub, warn }: {
  label: string; value: React.ReactNode; sub?: string; warn?: boolean;
}) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: "#737373", marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: 24, fontWeight: 700, lineHeight: 1.1,
        color: warn ? "#b91c1c" : "#171717", fontVariantNumeric: "tabular-nums",
      }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

const grid = (min = 150): React.CSSProperties => ({
  display: "grid", gap: 10,
  gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
});

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const opt = { refetchInterval: 30_000, refetchOnWindowFocus: false } as const;
  const ovQ = (trpc as any).adminStats?.overview?.useQuery?.(undefined, opt);
  const ucQ = (trpc as any).adminStats?.usageCost?.useQuery?.(undefined, opt);
  const hQ  = (trpc as any).adminStats?.health?.useQuery?.(undefined, opt);
  // 2026-06-07 (CJ「Part 1 投資人會看的指標」) — activation funnel + cohort retention + TTFV
  const afQ = (trpc as any).adminStats?.activationFunnel?.useQuery?.({ days: 30 }, opt);
  const crQ = (trpc as any).adminStats?.cohortRetention?.useQuery?.({ weeks: 8 }, opt);
  const ttfvQ = (trpc as any).adminStats?.timeToFirstValue?.useQuery?.({ days: 30 }, opt);
  const fbQ = (trpc as any).adminStats?.featureBreakdown?.useQuery?.({ days: 30, limit: 60 }, opt);
  const fmQ = (trpc as any).adminStats?.frictionMap?.useQuery?.({ days: 7 }, opt);
  const ruQ = (trpc as any).adminStats?.recentUsers?.useQuery?.({ limit: 50 }, opt);
  const bugsQ = (trpc as any).adminStats?.listBugReports?.useQuery?.({ status: "all", limit: 60 }, opt);
  const utils = (trpc as any).useUtils?.() ?? null;
  const refetchBugs = () => { bugsQ?.refetch?.(); utils?.adminStats?.userDetail?.invalidate?.(); };

  const triageM  = (trpc as any).adminStats?.triageBug?.useMutation?.({ onSuccess: refetchBugs });
  const confirmM = (trpc as any).adminStats?.confirmBug?.useMutation?.({ onSuccess: refetchBugs });
  const dispatchM= (trpc as any).adminStats?.dispatchBugFix?.useMutation?.({
    onSuccess: (r: any) => { refetchBugs(); if (r?.howTo) window.prompt("在終端機跑這行觸發修復 workflow（人工把關）：", r.howTo); },
  });
  const resolveM = (trpc as any).adminStats?.resolveBug?.useMutation?.({ onSuccess: refetchBugs });
  const csvUtils = (trpc as any).useUtils?.() ?? null;

  const exportCsv = async () => {
    try {
      const r = await csvUtils?.adminStats?.exportUsersCsv?.fetch?.();
      if (!r?.csv) return;
      const blob = new Blob(["﻿" + r.csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `onbrand-users-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { alert("匯出失敗：" + String((e as any)?.message ?? e)); }
  };

  const forbidden =
    ovQ?.error?.data?.code === "FORBIDDEN" ||
    ovQ?.error?.message?.includes("Admin only");

  if (forbidden) {
    return (
      <div style={{ maxWidth: 520, margin: "80px auto", textAlign: "center", color: "#525252" }}>
        <AlertTriangle size={28} style={{ color: "#b91c1c" }} />
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: "12px 0 6px", color: "#171717" }}>
          僅限管理員
        </h1>
        <p style={{ fontSize: 13 }}>這個頁面需要 SoWork 內部帳號（@sowork.tw / @sowork.ai）。</p>
      </div>
    );
  }

  const ov = ovQ?.data, uc = ucQ?.data, h = hQ?.data;
  const loading = ovQ?.isLoading && !ov;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 22px 80px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#171717" }}>監控後台</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportCsv} style={{
            display: "flex", alignItems: "center", gap: 6, fontSize: 12,
            border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 12px",
            background: "#fff", cursor: "pointer", color: "#525252",
          }}>
            <Download size={13} /> 匯出 CSV
          </button>
          <button
            onClick={() => { ovQ?.refetch?.(); ucQ?.refetch?.(); hQ?.refetch?.(); fbQ?.refetch?.(); fmQ?.refetch?.(); ruQ?.refetch?.(); afQ?.refetch?.(); crQ?.refetch?.(); ttfvQ?.refetch?.(); refetchBugs(); }}
            style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 12,
              border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 12px",
              background: "#fff", cursor: "pointer", color: "#525252",
            }}
          >
            <RefreshCw size={13} /> 重新整理
          </button>
        </div>
      </div>
      {loading && <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 20 }}>載入中…</p>}

      {/* ── 1. 成長漏斗 ── */}
      <div style={sectionTitle}><TrendingUp size={13} /> 成長漏斗</div>
      <div style={grid()}>
        <Stat label="總用戶" value={ov?.users.total ?? "—"} sub={`${ov?.users.admin ?? 0} admin`} />
        <Stat label="已驗證 / 啟用" value={ov?.users.active ?? "—"}
          sub={`驗證率 ${ov?.users.verifyRate ?? 0}%`} />
        <Stat label="未驗證" value={ov?.users.unverified ?? "—"}
          warn={(ov?.users.unverified ?? 0) > 0} />
        <Stat label="早鳥用戶" value={ov?.users.earlyBird ?? "—"} />
        <Stat label="新註冊 24h" value={ov?.signups.last24h ?? "—"} />
        <Stat label="新註冊 7d" value={ov?.signups.last7d ?? "—"}
          sub={`30d: ${ov?.signups.last30d ?? 0}`} />
        <Stat label="DAU" value={ov?.activity.dau ?? "—"} />
        <Stat label="WAU" value={ov?.activity.wau ?? "—"}
          sub={`7d 活躍率 ${ov?.activity.engagement7d ?? 0}%`} />
        <Stat label="MAU" value={ov?.activity.mau ?? "—"} />
        <Stat label="品牌數" value={ov?.entities.brands ?? "—"}
          sub={`已定位 ${ov?.entities.brandsPositioned ?? 0}`} />
        <Stat label="任務數" value={ov?.entities.missions ?? "—"} />
        <Stat label="總產出" value={ov?.entities.outputs ?? "—"}
          sub={`7d: ${ov?.entities.outputs7d ?? 0}`} />
      </div>

      {/* ── 1.5 Activation Funnel — 投資人最在意的單一指標 ── */}
      <div style={sectionTitle}><Target size={13} /> Activation Funnel（過去 30 天註冊用戶）</div>
      <div style={card}>
        {afQ?.data?.stages ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "#737373" }}>
                Activation Rate（3+ 任務）
                <span style={{ marginLeft: 8, color: "#9ca3af" }}>·</span>
                <span style={{ marginLeft: 8 }}>投資人健康範圍 &gt; 40%</span>
              </div>
              <div style={{
                fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                color: (afQ.data.activationRate ?? 0) >= 40 ? "#15803d" :
                       (afQ.data.activationRate ?? 0) >= 25 ? "#a16207" : "#b91c1c",
              }}>
                {afQ.data.activationRate}%
              </div>
            </div>
            {/* Horizontal bars */}
            {afQ.data.stages.map((s: any) => {
              const widthPct = Math.max(2, s.pctOfTotal); // min 2% for visibility
              return (
                <div key={s.key} style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                    <span style={{ color: "#374151", fontWeight: 500 }}>{s.label}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ color: "#171717", fontWeight: 600 }}>{s.count}</span>
                      <span style={{ color: "#9ca3af", marginLeft: 6 }}>
                        {s.pctOfTotal}% {s.key !== "signed_up" && `(${s.pctOfPrev}% prev)`}
                      </span>
                    </span>
                  </div>
                  <div style={{ height: 8, background: "#f3f4f6", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{
                      width: `${widthPct}%`, height: "100%",
                      background: s.key === "activated" ? "#0d9488" : s.key === "d7_retained" ? "#15803d" : "#171717",
                      transition: "width 0.4s ease",
                    }} />
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <div style={{ color: "#9ca3af", fontSize: 13 }}>{afQ?.isLoading ? "載入中…" : "無資料"}</div>
        )}
      </div>

      {/* ── 1.6 Time to First Value ── */}
      <div style={sectionTitle}><Clock size={13} /> Time-to-First-Value（從註冊到第一次跑任務）</div>
      <div style={grid(180)}>
        <Stat
          label="中位數（P50）"
          value={ttfvQ?.data ? `${ttfvQ.data.p50Minutes} 分鐘` : "—"}
          sub="投資人健康 < 10 分鐘"
          warn={(ttfvQ?.data?.p50Minutes ?? 0) > 30}
        />
        <Stat
          label="P75（75% 用戶以內）"
          value={ttfvQ?.data ? `${ttfvQ.data.p75Minutes} 分鐘` : "—"}
        />
        <Stat
          label="P95（95% 用戶以內）"
          value={ttfvQ?.data ? `${ttfvQ.data.p95Minutes} 分鐘` : "—"}
        />
        <Stat
          label="達成首次價值用戶"
          value={ttfvQ?.data ? `${ttfvQ.data.usersWhoActivated} / ${ttfvQ.data.totalSignups}` : "—"}
          sub={`${ttfvQ?.data?.activationRate ?? 0}% 註冊轉跑任務`}
        />
      </div>
      {ttfvQ?.data?.buckets && (
        <div style={{ ...card, marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#525252", marginBottom: 8 }}>
            分佈直方圖
          </div>
          {[
            { label: "< 5 分鐘 (極快)", count: ttfvQ.data.buckets.under5min, color: "#15803d" },
            { label: "5–15 分鐘 (快)", count: ttfvQ.data.buckets.under15min, color: "#22c55e" },
            { label: "15–60 分鐘 (普通)", count: ttfvQ.data.buckets.under60min, color: "#eab308" },
            { label: "1–24 小時 (慢)", count: ttfvQ.data.buckets.under24h, color: "#f97316" },
            { label: "> 24 小時 (很慢)", count: ttfvQ.data.buckets.over24h, color: "#b91c1c" },
          ].map((b) => {
            const total = ttfvQ.data.usersWhoActivated;
            const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
            return (
              <div key={b.label} style={{ marginBottom: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                  <span style={{ color: "#374151" }}>{b.label}</span>
                  <span style={{ color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>
                    {b.count} 人 · {pct}%
                  </span>
                </div>
                <div style={{ height: 5, background: "#f3f4f6", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(2, pct)}%`, height: "100%", background: b.color }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 1.7 Cohort Retention ── */}
      <div style={sectionTitle}><Users size={13} /> Cohort Retention（按註冊週分組）</div>
      <div style={{ ...card, overflowX: "auto" }}>
        {crQ?.data?.grid?.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ color: "#737373", textAlign: "left" }}>
                <th style={{ padding: "6px 8px", fontWeight: 600 }}>註冊週</th>
                <th style={{ padding: "6px 8px", fontWeight: 600 }}>新增</th>
                {crQ.data.grid[0].retention.map((_: any, i: number) => (
                  <th key={i} style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center", minWidth: 50 }}>
                    W{i}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {crQ.data.grid.map((row: any) => (
                <tr key={row.cohortWeek} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "6px 8px", color: "#374151" }}>{row.cohortWeek}</td>
                  <td style={{ padding: "6px 8px", color: "#171717", fontWeight: 600 }}>{row.size}</td>
                  {row.retention.map((r: number, i: number) => {
                    if (r === -1) return <td key={i} style={{ padding: "6px 8px", color: "#d1d5db", textAlign: "center" }}>—</td>;
                    const bg = r >= 50 ? "#15803d" : r >= 25 ? "#22c55e" : r >= 10 ? "#eab308" : r > 0 ? "#f97316" : "#fee2e2";
                    const fg = r >= 25 ? "#fff" : r > 0 ? "#171717" : "#9ca3af";
                    return (
                      <td key={i} style={{
                        padding: "6px 8px", textAlign: "center",
                        background: bg, color: fg, fontWeight: 600,
                      }}>
                        {r}%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: "#9ca3af", fontSize: 13 }}>{crQ?.isLoading ? "載入中…" : "尚無足夠資料"}</div>
        )}
      </div>

      {/* ── 2. 用量與成本 ── */}
      <div style={sectionTitle}><DollarSign size={13} /> 用量與成本（LLM）</div>
      <div style={grid()}>
        <Stat label="今日花費" value={`$${uc?.totals.usd24h ?? "—"}`}
          warn={(uc?.totals.usd24h ?? 0) > 20} />
        <Stat label="近 7 天" value={`$${uc?.totals.usd7d ?? "—"}`} />
        <Stat label="近 30 天" value={`$${uc?.totals.usd30d ?? "—"}`} />
        <Stat label="累計" value={`$${uc?.totals.allTimeUsd ?? "—"}`}
          sub={`${uc?.totals.calls ?? 0} 次呼叫`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#525252", marginBottom: 8 }}>
            前 10 大花費用戶（30d）
          </div>
          {(uc?.topSpenders ?? []).map((s: any) => (
            <div key={s.userId} style={{
              display: "flex", justifyContent: "space-between", fontSize: 12,
              padding: "4px 0", borderBottom: "1px solid #f3f4f6", color: "#374151",
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
                {s.email}
              </span>
              <span style={{ fontWeight: 600 }}>${s.usd30d} · {s.calls}</span>
            </div>
          ))}
          {(uc?.topSpenders ?? []).length === 0 && <Empty />}
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#525252", marginBottom: 8 }}>
            模型成本（7d）
          </div>
          {(uc?.byModel ?? []).map((m: any) => (
            <div key={m.model} style={{
              display: "flex", justifyContent: "space-between", fontSize: 12,
              padding: "4px 0", borderBottom: "1px solid #f3f4f6", color: "#374151",
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                {m.model}
              </span>
              <span style={{ fontWeight: 600 }}>${m.usd7d} · {m.calls}</span>
            </div>
          ))}
          {(uc?.byModel ?? []).length === 0 && <Empty />}
        </div>
      </div>

      {/* ── 3. 健康與客服 ── */}
      <div style={sectionTitle}><Activity size={13} /> 健康與客服</div>
      <div style={grid()}>
        <Stat label="定位執行中" value={h?.positioning.running ?? "—"} />
        <Stat label="卡住 >10min" value={h?.positioning.stuck ?? "—"}
          warn={(h?.positioning.stuck ?? 0) > 0} />
        <Stat label="定位失敗 24h" value={h?.positioning.failed24h ?? "—"}
          warn={(h?.positioning.failed24h ?? 0) > 0} />
        <Stat label="定位完成 24h" value={h?.positioning.done24h ?? "—"} />
        <Stat label="客服未處理" value={h?.support.open ?? "—"}
          warn={(h?.support.open ?? 0) > 0} sub={`處理中 ${h?.support.inProgress ?? 0}`} />
        <Stat label="客服新單 7d" value={h?.support.new7d ?? "—"}
          sub={`已解 ${h?.support.resolved7d ?? 0}`} />
        <Stat label="錯誤 24h" value={h?.errors24h ?? "—"}
          warn={(h?.errors24h ?? 0) > 0} />
        <Stat label="付費單 30d" value={h?.revenue.paidCount30d ?? "—"}
          sub={`NT$ ${(h?.revenue.twd30d ?? 0).toLocaleString()}`} />
      </div>

      {/* ── 逐功能使用 + 完成率 ── */}
      <div style={sectionTitle}>
        <TrendingUp size={13} /> 逐功能使用 + 完成率（近 {fbQ?.data?.days ?? 30} 天）
      </div>
      <div style={{ fontSize: 12, color: "#9ca3af", margin: "-4px 0 8px" }}>
        完成率 = 乾淨完成 ÷ 總次數。<b>高使用 + 低完成率</b> = 用戶想用但會卡住的功能，最該優先修。
      </div>
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#fafafa", color: "#737373", textAlign: "left" }}>
              {["功能", "平台", "使用", "用戶", "完成", "卡住", "失敗", "完成率", "最後使用"].map((hd) => (
                <th key={hd} style={{ padding: "8px 10px", fontWeight: 600, borderBottom: "1px solid #e5e7eb" }}>{hd}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(fbQ?.data?.features ?? []).map((f: any) => {
              const rate = f.completionRate;
              const rateColor = rate >= 80 ? "#15803d" : rate >= 50 ? "#b45309" : "#b91c1c";
              return (
                <tr key={f.taskId + f.workspace} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ ...td, whiteSpace: "normal", maxWidth: 260 }}>{String(f.label ?? "—")}</td>
                  <td style={td}>{String(f.workspace ?? "—")}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{f.uses}</td>
                  <td style={td}>{f.users}</td>
                  <td style={{ ...td, color: "#15803d" }}>{f.done}</td>
                  <td style={{ ...td, color: (f.stuck ?? 0) > 0 ? "#b45309" : "#9ca3af" }}>{f.stuck}</td>
                  <td style={{ ...td, color: (f.failed ?? 0) > 0 ? "#b91c1c" : "#9ca3af" }}>{f.failed}</td>
                  <td style={{ ...td, fontWeight: 700, color: rateColor }}>{rate}%</td>
                  <td style={{ ...td, color: "#9ca3af" }}>
                    {f.lastUsed ? new Date(f.lastUsed).toLocaleDateString("zh-TW") : "—"}
                  </td>
                </tr>
              );
            })}
            {(fbQ?.data?.features ?? []).length === 0 && (
              <tr><td colSpan={9} style={{ ...td, color: "#9ca3af", textAlign: "center" }}>尚無使用資料</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── 摩擦地圖（哪個頁面錯誤最多） ── */}
      <div style={sectionTitle}>
        <AlertTriangle size={13} /> 摩擦地圖 · 錯誤集中點（近 {fmQ?.data?.days ?? 7} 天）
      </div>
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#fafafa", color: "#737373", textAlign: "left" }}>
              {["頁面 / 路由", "來源", "錯誤數", "影響用戶", "範例訊息", "最後發生"].map((hd) => (
                <th key={hd} style={{ padding: "8px 10px", fontWeight: 600, borderBottom: "1px solid #e5e7eb" }}>{hd}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(fmQ?.data?.rows ?? []).map((r: any, i: number) => (
              <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ ...td, whiteSpace: "normal", maxWidth: 220 }}>{r.route}</td>
                <td style={td}>{r.source}</td>
                <td style={{ ...td, fontWeight: 700, color: r.errors > 5 ? "#b91c1c" : "#374151" }}>{r.errors}</td>
                <td style={td}>{r.users}</td>
                <td style={{ ...td, whiteSpace: "normal", maxWidth: 320, color: "#737373" }}>{typeof r.sampleMessage === "string" ? r.sampleMessage : String(r.sampleMessage ?? "—")}</td>
                <td style={{ ...td, color: "#9ca3af" }}>
                  {r.lastSeen ? new Date(r.lastSeen).toLocaleString("zh-TW", { hour12: false }) : "—"}
                </td>
              </tr>
            ))}
            {(fmQ?.data?.rows ?? []).length === 0 && (
              <tr><td colSpan={6} style={{ ...td, color: "#9ca3af", textAlign: "center" }}>近期無錯誤紀錄 🎉</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Bug 回報佇列 ── */}
      <div style={sectionTitle}><Bug size={13} /> Bug 回報佇列</div>
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {(bugsQ?.data ?? []).length === 0 && (
          <div style={{ padding: 16, fontSize: 12, color: "#9ca3af" }}>目前沒有 bug 回報</div>
        )}
        {(bugsQ?.data ?? []).map((b: any) => (
          <div key={b.id} style={{ borderBottom: "1px solid #f3f4f6", padding: "10px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#171717" }}>
                #{b.id} {b.title}
                <span style={{ ...tagS, marginLeft: 8 }}>{b.status}</span>
                {b.triageVerdict && (
                  <span style={{
                    ...tagS,
                    background: b.triageVerdict === "likely_bug" ? "#fee2e2"
                      : b.triageVerdict === "likely_misuse" ? "#dcfce7" : "#fef9c3",
                    color: "#525252",
                  }}>{b.triageVerdict}</span>
                )}
                {b.bountyPoints > 0 && <span style={{ ...tagS }}>+{b.bountyPoints} 點</span>}
              </div>
              <span style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>
                {b.userEmail} · {new Date(b.createdAt).toLocaleString("zh-TW", { hour12: false })}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#525252", margin: "5px 0", whiteSpace: "pre-wrap" }}>
              {String(b.body ?? "").slice(0, 280)}{(String(b.body ?? "").length > 280) ? "…" : ""}
            </div>
            {b.triageReason && typeof b.triageReason === "string" && (
              <div style={{ fontSize: 12, color: "#737373", fontStyle: "italic", marginBottom: 6 }}>
                triage：{b.triageReason}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <BugBtn label="AI 分流" onClick={() => triageM?.mutate?.({ bugId: b.id })}
                busy={triageM?.isPending} />
              <BugBtn label="✓ 確認是 bug（送點）" onClick={() => confirmM?.mutate?.({ bugId: b.id, isBug: true })}
                busy={confirmM?.isPending} />
              <BugBtn label="✗ 非 bug" onClick={() => confirmM?.mutate?.({ bugId: b.id, isBug: false })}
                busy={confirmM?.isPending} />
              <BugBtn label="🤖 派給修復專員" onClick={() => dispatchM?.mutate?.({ bugId: b.id })}
                busy={dispatchM?.isPending} />
              <BugBtn label="🎉 標記已解決＋通知" onClick={() => {
                const note = window.prompt("給用戶的備註（可空白）：") ?? undefined;
                resolveM?.mutate?.({ bugId: b.id, note });
              }} busy={resolveM?.isPending} />
              {b.userId ? (
                <BugBtn label="看用戶" onClick={() => navigate(`/admin/user/${b.userId}`)} />
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* ── 最近註冊 ── */}
      <div style={sectionTitle}>最近註冊（點列進 drill-down）</div>
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#fafafa", color: "#737373", textAlign: "left" }}>
              {["ID", "Email", "狀態", "方式", "品牌", "任務", "花費", "註冊時間"].map((h) => (
                <th key={h} style={{ padding: "8px 10px", fontWeight: 600, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(ruQ?.data ?? []).map((u: any) => (
              <tr key={u.id}
                onClick={() => navigate(`/admin/user/${u.id}`)}
                style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <td style={td}>{u.id}</td>
                <td style={td}>
                  {u.email}{u.role === "admin" && <span style={tagS}>admin</span>}
                  {u.earlyBird && <span style={tagS}>早鳥</span>}
                </td>
                <td style={td}>
                  <span style={{ color: u.isActive ? "#15803d" : "#b91c1c" }}>
                    {u.isActive ? "已驗證" : "未驗證"}
                  </span>
                </td>
                <td style={td}>{u.authMethod}</td>
                <td style={td}>{u.brands}</td>
                <td style={td}>{u.missions}</td>
                <td style={td}>${u.usdSpent}</td>
                <td style={{ ...td, color: "#9ca3af" }}>
                  {new Date(u.createdAt).toLocaleString("zh-TW", { hour12: false })}
                </td>
              </tr>
            ))}
            {(ruQ?.data ?? []).length === 0 && (
              <tr><td colSpan={8} style={{ ...td, color: "#9ca3af", textAlign: "center" }}>無資料</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const td: React.CSSProperties = { padding: "7px 10px", color: "#374151", whiteSpace: "nowrap" };
const tagS: React.CSSProperties = {
  fontSize: 12, background: "#f3f4f6", color: "#525252",
  borderRadius: 4, padding: "1px 5px", marginLeft: 6,
};
const Empty = () => <div style={{ fontSize: 12, color: "#9ca3af", padding: "8px 0" }}>無資料</div>;

function BugBtn({ label, onClick, busy }: { label: string; onClick: () => void; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} style={{
      fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6,
      padding: "4px 9px", background: busy ? "#f3f4f6" : "#fff",
      cursor: busy ? "default" : "pointer", color: "#374151",
    }}>{label}</button>
  );
}
