/**
 * 成效工作區 — mock dashboard (2026-08-11).
 *
 * Built on fake data on purpose: the connectors behind these panels differ
 * enormously in cost (Meta may work with the scope we already request; Google
 * Ads needs a developer token; SHOPLINE/91APP need per-merchant credentials),
 * so it's worth agreeing what the screen should say before paying for any of
 * them.
 *
 * Design follows the house rules: colour carries meaning only — connection
 * state and good/bad deltas — never decoration.
 */
import React from "react";
import {
  platformConnections, kpis, byAudience, topContent, MOCK_PERIOD,
  type ConnectionState,
} from "./mockPerformance";

const nf = new Intl.NumberFormat("zh-TW");
const money = (n: number) => `NT$ ${nf.format(n)}`;

const STATE_STYLE: Record<ConnectionState, { label: string; fg: string; bg: string; border: string }> = {
  connected:    { label: "已連接",   fg: "#166534", bg: "#F0FDF4", border: "#BBF7D0" },
  available:    { label: "可連接",   fg: "#525252", bg: "#FAFAFA", border: "#E5E5E5" },
  needs_reauth: { label: "需重新授權", fg: "#92400E", bg: "#FFFBEB", border: "#FDE68A" },
};

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", google: "Google Ads",
  shopline: "SHOPLINE", "91app": "91APP",
};

function Delta({ pct, goodWhen }: { pct: number; goodWhen: "up" | "down" }) {
  const isUp = pct >= 0;
  const isGood = goodWhen === "up" ? isUp : !isUp;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: isGood ? "#166534" : "#B91C1C" }}>
      {isUp ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/** Simple proportional bar — avoids pulling a chart lib in for a mock. */
function Bar({ value, max, muted }: { value: number; max: number; muted?: boolean }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ height: 6, background: "#F5F5F4", borderRadius: 3, overflow: "hidden", minWidth: 80 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: muted ? "#D6D3D1" : "#1F2A4D", borderRadius: 3 }} />
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left", fontSize: 11, fontWeight: 700, color: "#78716C",
  letterSpacing: ".04em", padding: "8px 10px", borderBottom: "1px solid #E7E5E4", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  fontSize: 13, color: "#292524", padding: "10px", borderBottom: "1px solid #F5F5F4", whiteSpace: "nowrap",
};

export default function PerformanceDashboard() {
  const maxRevenue = Math.max(...byAudience.map((a) => a.revenue));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Mock-data banner. Must stay prominent — these numbers look real enough
          to end up in a client deck by accident. */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px",
        background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10,
      }}>
        <span style={{ fontSize: 15, lineHeight: 1.2 }}>⚠️</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#92400E" }}>這是模擬資料，不是真實成效</div>
          <div style={{ fontSize: 12, color: "#A16207", marginTop: 2, lineHeight: 1.6 }}>
            用途是先確認「成效工作區該長什麼樣、該回答什麼問題」，再決定投入哪些平台的串接。
            下方每一個數字都是假的，請勿放進客戶簡報。
          </div>
        </div>
      </div>

      {/* ── Connections ─────────────────────────────────────────────── */}
      <section>
        <SectionTitle title="資料來源" hint="連接之後，下方數字才會是真的" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
          {platformConnections.map((p) => {
            const s = STATE_STYLE[p.state];
            return (
              <div key={p.id} style={{ border: "1px solid #E7E5E4", borderRadius: 10, padding: "12px 14px", background: "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1C1917" }}>{p.label}</span>
                  <span style={{
                    fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
                    color: s.fg, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: "nowrap",
                  }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 12, color: "#57534E", marginTop: 6, lineHeight: 1.6 }}>{p.provides}</div>
                {p.note && (
                  <div style={{ fontSize: 11, color: "#A8A29E", marginTop: 6, lineHeight: 1.5 }}>· {p.note}</div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── KPIs ────────────────────────────────────────────────────── */}
      <section>
        <SectionTitle title="整體成效" hint={MOCK_PERIOD} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          {kpis.map((k) => (
            <div key={k.id} style={{ border: "1px solid #E7E5E4", borderRadius: 10, padding: "12px 14px", background: "#fff" }}>
              <div style={{ fontSize: 11.5, color: "#78716C", fontWeight: 600 }}>{k.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 850, color: "#1C1917" }}>{k.value}</span>
                <Delta pct={k.deltaPct} goodWhen={k.goodWhen} />
              </div>
              <div style={{ fontSize: 11, color: "#A8A29E", marginTop: 4 }}>{k.hint}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── The differentiator ──────────────────────────────────────── */}
      <section>
        <SectionTitle
          title="各族群成效"
          hint="這一區是其他工具給不了的：每一篇內容都記得它是寫給誰的"
        />
        <div style={{ border: "1px solid #E7E5E4", borderRadius: 10, background: "#fff", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th}>族群</th>
                <th style={th}>對應甜蜜點</th>
                <th style={{ ...th, textAlign: "right" }}>篇數</th>
                <th style={{ ...th, textAlign: "right" }}>觸及</th>
                <th style={{ ...th, textAlign: "right" }}>互動率</th>
                <th style={{ ...th, textAlign: "right" }}>訂單</th>
                <th style={{ ...th, textAlign: "right" }}>營收</th>
                <th style={{ ...th, textAlign: "right" }}>ROAS</th>
                <th style={th}>營收占比</th>
              </tr>
            </thead>
            <tbody>
              {byAudience.map((a) => (
                <tr key={a.audience}>
                  <td style={{ ...td, fontWeight: 700 }}>{a.audience}</td>
                  <td style={{ ...td, color: "#57534E" }}>{a.sweetSpot}</td>
                  <td style={{ ...td, textAlign: "right" }}>{a.pieces}</td>
                  <td style={{ ...td, textAlign: "right" }}>{nf.format(a.reach)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{a.engagementRate.toFixed(1)}%</td>
                  <td style={{ ...td, textAlign: "right" }}>{nf.format(a.orders)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{money(a.revenue)}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{a.roas.toFixed(2)}</td>
                  <td style={td}><Bar value={a.revenue} max={maxRevenue} muted={a.roas < 2.5} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: "#57534E", marginTop: 8, lineHeight: 1.7 }}>
          讀法：「忙碌雙薪爸媽」用 14 篇做到 ROAS 5.21，「健身備餐族」用 7 篇只有 1.74 ——
          下個月的內容配額應該往前者移。這個判斷只有在「每篇都知道寫給誰」的前提下才做得出來。
        </p>
      </section>

      {/* ── Per-piece ───────────────────────────────────────────────── */}
      <section>
        <SectionTitle title="單篇成效" hint="點回內容可看當初的定位依據" />
        <div style={{ border: "1px solid #E7E5E4", borderRadius: 10, background: "#fff", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                <th style={th}>內容</th>
                <th style={th}>平台</th>
                <th style={th}>族群</th>
                <th style={th}>發布日</th>
                <th style={{ ...th, textAlign: "right" }}>觸及</th>
                <th style={{ ...th, textAlign: "right" }}>互動率</th>
                <th style={{ ...th, textAlign: "right" }}>訂單</th>
                <th style={{ ...th, textAlign: "right" }}>營收</th>
              </tr>
            </thead>
            <tbody>
              {topContent.map((c) => (
                <tr key={c.id}>
                  <td style={{ ...td, fontWeight: 600, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</td>
                  <td style={{ ...td, color: "#57534E" }}>{PLATFORM_LABEL[c.platform] ?? c.platform}</td>
                  <td style={{ ...td, color: "#57534E" }}>{c.audience}</td>
                  <td style={{ ...td, color: "#A8A29E" }}>{c.publishedAt}</td>
                  <td style={{ ...td, textAlign: "right" }}>{nf.format(c.reach)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{c.engagementRate.toFixed(1)}%</td>
                  <td style={{ ...td, textAlign: "right" }}>{nf.format(c.orders)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{money(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#1C1917" }}>{title}</h2>
      {hint && <span style={{ fontSize: 12, color: "#A8A29E" }}>{hint}</span>}
    </div>
  );
}
