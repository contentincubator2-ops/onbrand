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
import { trpc } from "../../lib/trpc";
import { RefreshCw, TrendingUp, DollarSign, Activity, AlertTriangle, Bug, Download } from "lucide-react";

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff",
  padding: "14px 16px",
};
const sectionTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: "0.18em",
  textTransform: "uppercase", color: "#525252", margin: "26px 0 10px",
  display: "flex", alignItems: "center", gap: 7,
};

function Stat({ label, value, sub, warn }: {
  label: string; value: React.ReactNode; sub?: string; warn?: boolean;
}) {
  return (
    <div style={card}>
      <div style={{ fontSize: 11, color: "#737373", marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: 24, fontWeight: 700, lineHeight: 1.1,
        color: warn ? "#b91c1c" : "#171717", fontVariantNumeric: "tabular-nums",
      }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>{sub}</div>}
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
            onClick={() => { ovQ?.refetch?.(); ucQ?.refetch?.(); hQ?.refetch?.(); ruQ?.refetch?.(); refetchBugs(); }}
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
          <div style={{ fontSize: 11, fontWeight: 700, color: "#525252", marginBottom: 8 }}>
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
          <div style={{ fontSize: 11, fontWeight: 700, color: "#525252", marginBottom: 8 }}>
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
              <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>
                {b.userEmail} · {new Date(b.createdAt).toLocaleString("zh-TW", { hour12: false })}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#525252", margin: "5px 0", whiteSpace: "pre-wrap" }}>
              {b.body.slice(0, 280)}{b.body.length > 280 ? "…" : ""}
            </div>
            {b.triageReason && (
              <div style={{ fontSize: 11, color: "#737373", fontStyle: "italic", marginBottom: 6 }}>
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
              <BugBtn label="🤖 派給修復 agent" onClick={() => dispatchM?.mutate?.({ bugId: b.id })}
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
  fontSize: 9, background: "#f3f4f6", color: "#525252",
  borderRadius: 4, padding: "1px 5px", marginLeft: 6,
};
const Empty = () => <div style={{ fontSize: 12, color: "#9ca3af", padding: "8px 0" }}>無資料</div>;

function BugBtn({ label, onClick, busy }: { label: string; onClick: () => void; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} style={{
      fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 6,
      padding: "4px 9px", background: busy ? "#f3f4f6" : "#fff",
      cursor: busy ? "default" : "pointer", color: "#374151",
    }}>{label}</button>
  );
}
