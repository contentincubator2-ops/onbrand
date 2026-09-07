/**
 * AdminUserDetailPage — single-user drill-down.
 *
 * 2026-05-16 (CJ「單一用戶 drill-down」). Click a row in the monitoring
 * dashboard → full picture of one user: profile, points ledger, usage,
 * brands, support tickets, bug reports, recent errors.
 *
 * adminProcedure-gated server-side.
 */
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { ArrowLeft, AlertTriangle } from "lucide-react";

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff",
  padding: "14px 16px", marginBottom: 14,
};
const h2: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, letterSpacing: "0.16em",
  textTransform: "uppercase", color: "#525252", marginBottom: 10,
};
const kv: React.CSSProperties = { fontSize: 12, color: "#374151", padding: "3px 0" };
const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 600, color: "#737373", borderBottom: "1px solid #e5e7eb", textAlign: "left" };
const td: React.CSSProperties = { padding: "5px 8px", color: "#374151", whiteSpace: "nowrap" };

export default function AdminUserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const uid = Number(id);
  const q = (trpc as any).adminStats?.userDetail?.useQuery?.(
    { userId: uid }, { enabled: uid > 0, refetchOnWindowFocus: false });

  if (q?.error) {
    const forbidden = q.error?.data?.code === "FORBIDDEN" || q.error?.message?.includes("Admin only");
    return (
      <div style={{ maxWidth: 520, margin: "80px auto", textAlign: "center", color: "#525252" }}>
        <AlertTriangle size={26} style={{ color: "#b91c1c" }} />
        <p style={{ marginTop: 10, fontSize: 14 }}>
          {forbidden ? "僅限管理員（@sowork.tw / @sowork.ai）" : "找不到此用戶"}
        </p>
      </div>
    );
  }
  const d = q?.data;
  const iso = (s: any) => s ? new Date(s).toLocaleString("zh-TW", { hour12: false }) : "—";

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "26px 22px 80px" }}>
      <button onClick={() => navigate("/admin/dashboard")} style={{
        display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#525252",
        border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 12px",
        background: "#fff", cursor: "pointer", marginBottom: 16,
      }}><ArrowLeft size={13} /> 回監控後台</button>

      {!d && <p style={{ color: "#9ca3af", fontSize: 13 }}>載入中…</p>}
      {d && (
        <>
          <h1 style={{ fontSize: 19, fontWeight: 700, color: "#171717", marginBottom: 14 }}>
            #{d.user.id} {d.user.email}
            {d.user.role === "admin" && <span style={tag}>admin</span>}
            {d.user.earlyBird && <span style={tag}>早鳥</span>}
            <span style={{ ...tag, background: d.user.isActive ? "#dcfce7" : "#fee2e2" }}>
              {d.user.isActive ? "已驗證" : "未驗證"}
            </span>
          </h1>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={card}>
              <div style={h2}>基本資料</div>
              <div style={kv}>姓名：{d.user.name || "—"}</div>
              <div style={kv}>登入方式：{d.user.authMethod}</div>
              <div style={kv}>點數餘額：<b>{d.user.pointsBalance}</b>（credits {d.user.credits}）</div>
              <div style={kv}>鎖定價：{d.user.lockedPriceTwd ? `NT$ ${d.user.lockedPriceTwd}` : "—"}</div>
              <div style={kv}>註冊 IP：{d.user.registrationIp || "—"}</div>
              <div style={kv}>最後登入 IP：{d.user.lastLoginIp || "—"}</div>
              <div style={kv}>註冊：{iso(d.user.createdAt)}</div>
              <div style={kv}>啟用：{iso(d.user.activatedAt)}</div>
            </div>
            <div style={card}>
              <div style={h2}>用量</div>
              <div style={kv}>任務數：<b>{d.stats.missions}</b> · 產出：<b>{d.stats.outputs}</b></div>
              <div style={kv}>LLM 累計花費：<b>${d.stats.usdAll}</b>（近 7d ${d.stats.usd7d}）</div>
              <div style={kv}>LLM 呼叫次數：{d.stats.llmCalls}</div>
              <div style={kv}>品牌數：{d.brands.length}</div>
            </div>
          </div>

          <div style={card}>
            <div style={h2}>品牌（{d.brands.length}）</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr><th style={th}>ID</th><th style={th}>名稱</th><th style={th}>定位狀態</th><th style={th}>建立</th></tr></thead>
              <tbody>
                {d.brands.map((b: any) => (
                  <tr key={b.id}><td style={td}>{b.id}</td><td style={td}>{b.name}</td>
                    <td style={td}>{b.positioningStatus ?? "—"}</td><td style={td}>{iso(b.createdAt)}</td></tr>
                ))}
                {d.brands.length === 0 && <tr><td colSpan={4} style={{ ...td, color: "#9ca3af" }}>無</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={card}>
              <div style={h2}>點數紀錄（最近 20）</div>
              {d.pointHistory.map((p: any, i: number) => (
                <div key={i} style={{ ...kv, display: "flex", justifyContent: "space-between" }}>
                  <span>{String(p.kind ?? "—")} · {String(p.reason ?? "—")}</span>
                  <span style={{ color: p.delta >= 0 ? "#15803d" : "#b91c1c" }}>
                    {p.delta >= 0 ? "+" : ""}{p.delta} → {p.balanceAfter}
                  </span>
                </div>
              ))}
              {d.pointHistory.length === 0 && <div style={{ ...kv, color: "#9ca3af" }}>無</div>}
            </div>
            <div style={card}>
              <div style={h2}>Bug 回報（{d.bugs.length}）</div>
              {d.bugs.map((b: any) => (
                <div key={b.id} style={kv}>
                  #{b.id} {b.title} · <b>{b.status}</b>
                  {b.triageVerdict ? ` · ${b.triageVerdict}` : ""}{b.bountyPoints ? ` · +${b.bountyPoints}點` : ""}
                </div>
              ))}
              {d.bugs.length === 0 && <div style={{ ...kv, color: "#9ca3af" }}>無</div>}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={card}>
              <div style={h2}>客服工單（{d.tickets.length}）</div>
              {d.tickets.map((t: any) => (
                <div key={t.id} style={kv}>#{t.id} [{t.tag ?? "—"}] {t.subject} · <b>{t.status}</b> · {iso(t.createdAt)}</div>
              ))}
              {d.tickets.length === 0 && <div style={{ ...kv, color: "#9ca3af" }}>無</div>}
            </div>
            <div style={card}>
              <div style={h2}>近期錯誤（{d.recentErrors.length}）</div>
              {d.recentErrors.map((e: any) => (
                <div key={e.id} style={{ ...kv, color: "#b91c1c" }}>
                  [{String(e.source ?? "?")}] {String(e.message ?? "unknown error")} · {iso(e.createdAt)}
                </div>
              ))}
              {d.recentErrors.length === 0 && <div style={{ ...kv, color: "#9ca3af" }}>無</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const tag: React.CSSProperties = {
  fontSize: 12, background: "#f3f4f6", color: "#525252",
  borderRadius: 5, padding: "2px 7px", marginLeft: 8, verticalAlign: "middle",
};
