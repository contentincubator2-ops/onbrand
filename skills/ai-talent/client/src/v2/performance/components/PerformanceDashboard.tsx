/**
 * PerformanceDashboard — the 成效 workspace's six pages, on simulated data.
 *
 * 2026-08-11 (CJ「六頁用假資料實作到 DEV，每一頁都要可以進行視角的篩選。
 * 我們重點在知道哪一個 TA 搭配哪一個訴求，會最強勁」).
 *
 * Two things drive the design:
 *
 * 1. The filter bar is shared by all six pages, not per-page. A view is
 *    (觀察區間 × 比較區間 × TA × 訴求 × 產品別); switching page keeps the lens
 *    so you can carry one question across Meta → Google → Shopline instead of
 *    re-selecting each time.
 *
 * 2. "Which TA × appeal is strongest" is a first-class panel, not something
 *    you reconstruct by flipping filters. Aggregates hide it by definition —
 *    averaging a 4.9-ROAS pairing with a 0.8 one yields an unremarkable 2.3
 *    and the actual finding disappears.
 *
 * All numbers come from perfMockData's cell model, so every figure is a sum
 * over the cells matching the current filter — the funnel stays arithmetically
 * true under any filter combination.
 */
import React from "react";
import {
  TAS, APPEALS, PRODUCTS, aggregate, roas, cpa, aov,
  taAppealMatrix, bestPairing, fmtInt, fmtMoney, fmtPct,
  DATE_RANGES, COMPARE_MODES, BREAKEVEN_ROAS, GROSS_MARGIN,
  type Filter, type Totals,
} from "./perfMockData";

const C = {
  border: "#eceff3", sub: "#9ca3af", text: "#111827", mute: "#6b7280",
  good: "#059669", bad: "#dc2626", warn: "#b45309",
  goodBg: "#ECFDF5", badBg: "#FEF2F2", warnBg: "#FFFBEB",
};

const card: React.CSSProperties = {
  background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12,
  padding: "18px 20px", marginBottom: 16,
};

function Card({ title, sub, children, style }: { title: string; sub?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ ...card, ...style }}>
      <h3 style={{ fontSize: 13, margin: 0, fontWeight: 800, color: C.text }}>{title}</h3>
      {sub && <div style={{ fontSize: 12, color: C.sub, marginTop: 3, marginBottom: 16 }}>{sub}</div>}
      {!sub && <div style={{ height: 12 }} />}
      {children}
    </div>
  );
}

function Delta({ cur, prev, invert }: { cur: number; prev: number; invert?: boolean }) {
  if (!prev) return <span style={{ color: C.sub, fontSize: 12 }}>—</span>;
  const d = (cur - prev) / prev;
  const better = invert ? d < 0 : d > 0;
  return (
    <span style={{ color: Math.abs(d) < 0.005 ? C.sub : better ? C.good : C.bad, fontSize: 12, fontWeight: 700 }}>
      {d > 0 ? "+" : ""}{(d * 100).toFixed(1)}%
    </span>
  );
}

function Kpi({ k, v, cur, prev, invert }: { k: string; v: string; cur?: number; prev?: number; invert?: boolean }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 12, color: C.sub, letterSpacing: ".06em", fontWeight: 800 }}>{k}</div>
      <div style={{ fontSize: 19, fontWeight: 850, marginTop: 5, letterSpacing: "-.02em", color: C.text }}>{v}</div>
      <div style={{ marginTop: 3 }}>
        {cur != null && prev != null ? <Delta cur={cur} prev={prev} invert={invert} /> : <span style={{ color: C.sub, fontSize: 12 }}>—</span>}
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left", fontSize: 12, color: C.sub, letterSpacing: ".06em",
  fontWeight: 800, padding: "0 8px 8px", borderBottom: `1px solid ${C.border}`,
};
const td: React.CSSProperties = { padding: "9px 8px", borderBottom: "1px solid #f6f7f9", fontSize: 12 };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

function Tag({ kind, children }: { kind: "good" | "bad" | "warn" | "mute"; children: React.ReactNode }) {
  const m = {
    good: { bg: C.goodBg, fg: "#047857" }, bad: { bg: C.badBg, fg: "#B91C1C" },
    warn: { bg: C.warnBg, fg: C.warn }, mute: { bg: "#f3f4f6", fg: C.mute },
  }[kind];
  return <span style={{ background: m.bg, color: m.fg, fontSize: 12, fontWeight: 800, padding: "2px 7px", borderRadius: 20 }}>{children}</span>;
}

function Note({ tone = "warn", children }: { tone?: "warn" | "bad"; children: React.ReactNode }) {
  return (
    <div style={{
      borderLeft: `3px solid ${tone === "bad" ? C.bad : "#F59E0B"}`,
      background: tone === "bad" ? C.badBg : C.warnBg,
      padding: "12px 14px", borderRadius: "0 8px 8px 0", marginTop: 14, fontSize: 12, lineHeight: 1.7,
    }}>{children}</div>
  );
}

/* ─────────────────────── Filter bar ─────────────────────── */

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: C.sub, letterSpacing: ".06em" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 9px",
          fontSize: 12, background: "#fff", color: C.text, minWidth: 128, cursor: "pointer",
        }}
      >
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}

export interface Lens {
  range: string; compare: string;
  ta: string; appeal: string; product: string;
}
export const DEFAULT_LENS: Lens = { range: "30d", compare: "prev", ta: "", appeal: "", product: "" };

function FilterBar({ lens, setLens }: { lens: Lens; setLens: (l: Lens) => void }) {
  const any = lens.ta || lens.appeal || lens.product;
  return (
    <div style={{ ...card, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
      <Select label="觀察區間" value={lens.range} onChange={(v) => setLens({ ...lens, range: v })}
              options={DATE_RANGES.map((d) => ({ id: d.id, label: d.label }))} />
      <Select label="比較區間" value={lens.compare} onChange={(v) => setLens({ ...lens, compare: v })}
              options={COMPARE_MODES.map((d) => ({ id: d.id, label: d.label }))} />
      <div style={{ width: 1, height: 34, background: C.border, margin: "0 2px" }} />
      <Select label="目標族群" value={lens.ta} onChange={(v) => setLens({ ...lens, ta: v })}
              options={[{ id: "", label: "全部族群" }, ...TAS.map((t) => ({ id: t.id, label: t.label }))]} />
      <Select label="產品功能訴求" value={lens.appeal} onChange={(v) => setLens({ ...lens, appeal: v })}
              options={[{ id: "", label: "全部訴求" }, ...APPEALS.map((a) => ({ id: a.id, label: a.label }))]} />
      <Select label="產品別" value={lens.product} onChange={(v) => setLens({ ...lens, product: v })}
              options={[{ id: "", label: "全部產品" }, ...PRODUCTS.map((p) => ({ id: p.id, label: p.label }))]} />
      {any && (
        <button
          onClick={() => setLens({ ...lens, ta: "", appeal: "", product: "" })}
          style={{ border: `1px solid ${C.border}`, background: "#fff", borderRadius: 8,
                   padding: "7px 11px", fontSize: 12, cursor: "pointer", color: C.mute }}
        >清除視角</button>
      )}
      <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: C.bad,
                    background: C.badBg, border: "1px solid #FECACA", borderRadius: 6, padding: "5px 9px" }}>
        ⚠ 模擬資料
      </div>
    </div>
  );
}

/* ─────────────────────── Funnel ─────────────────────── */

function Funnel({ t }: { t: Totals }) {
  const stages = [
    { nm: "曝光",        en: "Impressions",  v: t.impressions,  rate: null as number | null, cost: t.impressions ? (t.spend / t.impressions) * 1000 : 0, costLabel: "CPM" },
    { nm: "點擊",        en: "Clicks",       v: t.clicks,       rate: t.impressions ? t.clicks / t.impressions : 0, cost: t.clicks ? t.spend / t.clicks : 0, costLabel: "CPC" },
    { nm: "到站",        en: "Sessions",     v: t.sessions,     rate: t.clicks ? t.sessions / t.clicks : 0, cost: t.sessions ? t.spend / t.sessions : 0, costLabel: "" },
    { nm: "看商品頁",    en: "Product view", v: t.productViews, rate: t.sessions ? t.productViews / t.sessions : 0, cost: t.productViews ? t.spend / t.productViews : 0, costLabel: "" },
    { nm: "加入購物車",  en: "Add to cart",  v: t.atc,          rate: t.productViews ? t.atc / t.productViews : 0, cost: t.atc ? t.spend / t.atc : 0, costLabel: "" },
    { nm: "進入結帳",    en: "Checkout",     v: t.checkout,     rate: t.atc ? t.checkout / t.atc : 0, cost: t.checkout ? t.spend / t.checkout : 0, costLabel: "" },
    { nm: "完成訂單",    en: "Purchase",     v: t.orders,       rate: t.checkout ? t.orders / t.checkout : 0, cost: t.orders ? t.spend / t.orders : 0, costLabel: "CPA" },
  ];
  const max = stages[0]!.v || 1;
  // Flag the two worst conversion steps — the eye should land on the leak,
  // not on the biggest absolute number (which is always the top of the funnel).
  const ranked = stages.filter((s) => s.rate != null).sort((a, b) => (a.rate! - b.rate!));
  const leaks = new Set(ranked.slice(0, 2).map((s) => s.nm));
  const grid = "112px 1fr 88px 88px 104px";

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: 12, fontSize: 12, color: C.sub,
                    fontWeight: 800, letterSpacing: ".06em", paddingBottom: 7,
                    borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>
        <div>階段</div><div /><div style={{ textAlign: "right" }}>人數</div>
        <div style={{ textAlign: "right" }}>轉換率</div><div style={{ textAlign: "right" }}>單位成本</div>
      </div>
      {stages.map((s) => {
        const isLeak = leaks.has(s.nm);
        return (
          <div key={s.nm} style={{
            display: "grid", gridTemplateColumns: grid, gap: 12, alignItems: "center",
            padding: "9px 6px", borderBottom: "1px solid #f6f7f9", borderRadius: 6,
            background: isLeak ? C.badBg : undefined,
          }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 12 }}>{s.nm}</div>
              <div style={{ color: C.sub, fontSize: 12 }}>{s.en}</div>
            </div>
            <div>
              <div style={{
                height: 26, borderRadius: 5, background: isLeak ? C.bad : C.text,
                width: `${Math.max(6, (s.v / max) * 100)}%`, display: "flex", alignItems: "center",
                paddingLeft: 9, color: "#fff", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
              }}>
                {s.rate != null && isLeak ? `↓ 流失 ${fmtPct(1 - s.rate)}` : ""}
              </div>
            </div>
            <div style={{ textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtInt(s.v)}</div>
            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12,
                          color: isLeak ? C.bad : C.text, fontWeight: isLeak ? 800 : 400 }}>
              {s.rate == null ? "—" : fmtPct(s.rate)}
            </div>
            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12, color: C.mute }}>
              {s.costLabel ? `${s.costLabel} ` : ""}{fmtMoney(s.cost)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────── TA × appeal matrix ─────────────────── */

function Matrix({ product, onPick }: { product: string; onPick: (ta: string, appeal: string) => void }) {
  const rows = taAppealMatrix(product || null);
  const all = rows.flatMap((r) => r.cells.filter((c) => c.totals.spend >= 4000).map((c) => c.roas));
  const lo = Math.min(...all), hi = Math.max(...all);
  const shade = (v: number, thin: boolean) => {
    if (thin) return { bg: "#fafafa", fg: "#d1d5db" };
    const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
    // Single-hue ramp: intensity = performance. Red/green would imply
    // good/bad thresholds that don't exist here — every cell is relative.
    return { bg: `rgba(17,24,39,${(0.04 + t * 0.80).toFixed(3)})`, fg: t > 0.55 ? "#fff" : C.text };
  };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620 }}>
        <thead>
          <tr>
            <th style={{ ...th, minWidth: 104 }}>TA ＼ 訴求</th>
            {APPEALS.map((a) => <th key={a.id} style={{ ...th, textAlign: "center" }}>{a.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ta.id}>
              <td style={{ ...td, fontWeight: 800 }}>{r.ta.label}</td>
              {r.cells.map((c) => {
                const thin = c.totals.spend < 4000;
                const s = shade(c.roas, thin);
                return (
                  <td key={c.appeal.id} style={{ ...td, padding: 4, textAlign: "center" }}>
                    <button
                      onClick={() => onPick(r.ta.id, c.appeal.id)}
                      title={thin ? "投放量太小，數字不可靠" : `ROAS ${c.roas.toFixed(2)}｜訂單 ${fmtInt(c.orders)}｜花費 ${fmtMoney(c.totals.spend)}`}
                      style={{
                        width: "100%", border: "none", borderRadius: 7, padding: "10px 6px",
                        background: s.bg, color: s.fg, cursor: "pointer", lineHeight: 1.25,
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 850, fontVariantNumeric: "tabular-nums" }}>
                        {thin ? "—" : c.roas.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 12, opacity: .75 }}>{thin ? "量太小" : `${fmtInt(c.orders)} 單`}</div>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────── Pages ─────────────────────── */

function Overview({ lens, setLens }: { lens: Lens; setLens: (l: Lens) => void }) {
  const f: Filter = { ta: lens.ta || null, appeal: lens.appeal || null, product: lens.product || null };
  const cur = aggregate(f, "current");
  const prev = aggregate(f, "previous");
  const showCmp = lens.compare !== "none";
  const best = bestPairing(lens.product || null);
  const grossProfit = cur.revenue * GROSS_MARGIN;
  const net = grossProfit - cur.spend;
  const lostAtc = cur.atc - cur.checkout;
  const lostCheckout = cur.checkout - cur.orders;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 16 }}>
        <Kpi k="廣告花費" v={fmtMoney(cur.spend)} cur={showCmp ? cur.spend : undefined} prev={showCmp ? prev.spend : undefined} />
        <Kpi k="營收" v={fmtMoney(cur.revenue)} cur={showCmp ? cur.revenue : undefined} prev={showCmp ? prev.revenue : undefined} />
        <Kpi k="ROAS" v={roas(cur).toFixed(2)} cur={showCmp ? roas(cur) : undefined} prev={showCmp ? roas(prev) : undefined} />
        <Kpi k="CPA 獲客成本" v={fmtMoney(cpa(cur))} cur={showCmp ? cpa(cur) : undefined} prev={showCmp ? cpa(prev) : undefined} invert />
        <Kpi k="客單價 AOV" v={fmtMoney(aov(cur))} cur={showCmp ? aov(cur) : undefined} prev={showCmp ? aov(prev) : undefined} />
      </div>

      <Card title="TA × 訴求 強度矩陣"
            sub="數字是 ROAS，底色深＝越強。點任一格就把整個儀表板切到那個組合">
        <Matrix product={lens.product} onPick={(ta, appeal) => setLens({ ...lens, ta, appeal })} />
        {best && (
          <Note>
            <b>目前最強組合：{best.ta} × {best.appeal}</b> —— ROAS {best.roas.toFixed(2)}、
            {fmtInt(best.orders)} 單，但只吃掉 {fmtMoney(best.spend)}（總預算的 {fmtPct(best.spend / 450000, 0)}）。
            這組還沒放量，是目前最明確的加碼標的。
          </Note>
        )}
      </Card>

      <Card title="銷售漏斗"
            sub={`每一層的人數、對上一層的轉換率，以及走到這層為止每個人的累計成本${lens.ta || lens.appeal || lens.product ? "（已套用視角篩選）" : ""}`}>
        <Funnel t={cur} />
        <Note tone="bad">
          <b>最大漏水點：結帳流程</b><br />
          加購後有 {fmtInt(lostAtc)} 人沒進結帳、進了結帳又有 {fmtInt(lostCheckout)} 人沒付款，
          合計流失 <b>{fmtInt(lostAtc + lostCheckout)} 人</b>。以目前 CPA 換算，這段等於每期燒掉約{" "}
          <b>{fmtMoney((lostAtc + lostCheckout) * cpa(cur))}</b> 的已付費流量。<br />
          冷凍宅配的運費在結帳頁才揭露，與「運費驚嚇」的典型模式吻合，建議優先驗證。
        </Note>
        <Note>
          <b>ROAS {roas(cur).toFixed(2)} 要對照毛利才有意義。</b>
          以 {fmtPct(GROSS_MARGIN, 0)} 毛利計算：毛利 {fmtMoney(grossProfit)} − 廣告 {fmtMoney(cur.spend)} ={" "}
          <b style={{ color: net >= 0 ? C.good : C.bad }}>{net >= 0 ? "+" : ""}{fmtMoney(net)}</b>
          {Math.abs(net) < cur.spend * 0.1 ? "，接近打平。" : "。"}
          損益平衡在 ROAS <b>{BREAKEVEN_ROAS.toFixed(2)}</b>；真正該追的是把結帳流失砍半，
          那比把 ROAS 再推高 0.2 容易得多。
        </Note>
      </Card>
    </>
  );
}

function PlatformPage({ lens, kind }: { lens: Lens; kind: "meta" | "google" }) {
  const f: Filter = { ta: lens.ta || null, appeal: lens.appeal || null, product: lens.product || null };
  const all = aggregate(f, "current");
  const prev = aggregate(f, "previous");
  const showCmp = lens.compare !== "none";
  // Platform split of the same filtered pool, so the pages reconcile with 總覽.
  const shareOf = kind === "meta" ? 0.624 : 0.376;
  const eff = kind === "meta" ? 1.06 : 0.90;
  const s = (t: Totals): Totals => ({
    spend: t.spend * shareOf, impressions: t.impressions * shareOf, clicks: t.clicks * shareOf,
    sessions: t.sessions * shareOf, productViews: t.productViews * shareOf, atc: t.atc * shareOf,
    checkout: t.checkout * shareOf, orders: t.orders * shareOf * eff, revenue: t.revenue * shareOf * eff,
  });
  const cur = s(all), pv = s(prev);

  const rows = kind === "meta"
    ? [
        { n: "再行銷 · 加購未結帳", sp: 0.149, r: 4.91, tag: "good" as const, note: "加碼" },
        { n: "和牛牛舌 · 轉換",     sp: 0.242, r: 2.71, tag: "good" as const, note: "維持" },
        { n: "懶人組合包 · 轉換",   sp: 0.196, r: 2.45, tag: "mute" as const, note: "維持" },
        { n: "火鍋湯底 · 轉換",     sp: 0.121, r: 1.98, tag: "warn" as const, note: "觀察" },
        { n: "廣泛受眾 · 測試",     sp: 0.178, r: 0.82, tag: "bad"  as const, note: "關閉" },
        { n: "品牌認知 · 影片",     sp: 0.114, r: 0.79, tag: "warn" as const, note: "改看輔助轉換" },
      ]
    : [
        { n: "和牛 牛舌 宅配",   sp: 0.107, r: 3.62, tag: "good" as const, note: "提高出價" },
        { n: "冷凍 即食 料理包", sp: 0.142, r: 2.49, tag: "good" as const, note: "維持" },
        { n: "懶得煮的Tom老闆",  sp: 0.037, r: 8.10, tag: "mute" as const, note: "品牌字 · 必守" },
        { n: "火鍋湯底 推薦",    sp: 0.124, r: 1.68, tag: "warn" as const, note: "縮減" },
        { n: "宵夜 吃什麼",      sp: 0.098, r: 0.58, tag: "bad"  as const, note: "加否定字" },
        { n: "PMax · 全站",      sp: 0.284, r: 1.94, tag: "warn" as const, note: "與品牌字重疊" },
      ];

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 16 }}>
        <Kpi k="花費" v={fmtMoney(cur.spend)} cur={showCmp ? cur.spend : undefined} prev={showCmp ? pv.spend : undefined} />
        <Kpi k="ROAS" v={roas(cur).toFixed(2)} cur={showCmp ? roas(cur) : undefined} prev={showCmp ? roas(pv) : undefined} />
        <Kpi k="CPA" v={fmtMoney(cpa(cur))} cur={showCmp ? cpa(cur) : undefined} prev={showCmp ? cpa(pv) : undefined} invert />
        <Kpi k="訂單" v={fmtInt(cur.orders)} cur={showCmp ? cur.orders : undefined} prev={showCmp ? pv.orders : undefined} />
        <Kpi k={kind === "meta" ? "CTR" : "CPC"}
             v={kind === "meta" ? fmtPct(cur.impressions ? cur.clicks / cur.impressions : 0, 2) : fmtMoney(cur.clicks ? cur.spend / cur.clicks : 0)} />
      </div>
      <Card title={kind === "meta" ? "活動成效" : "搜尋字詞 / 活動"}
            sub={`損益平衡在 ROAS ${BREAKEVEN_ROAS.toFixed(2)}（${fmtPct(GROSS_MARGIN, 0)} 毛利）`}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>{kind === "meta" ? "活動" : "字詞 / 活動"}</th>
            <th style={{ ...th, textAlign: "right" }}>花費</th>
            <th style={{ ...th, textAlign: "right" }}>訂單</th>
            <th style={{ ...th, textAlign: "right" }}>CPA</th>
            <th style={{ ...th, textAlign: "right" }}>ROAS</th>
            <th style={th}>判讀</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const sp = cur.spend * r.sp;
              const rev = sp * r.r;
              const ord = rev / (aov(cur) || 680);
              return (
                <tr key={r.n}>
                  <td style={td}>{r.n}</td>
                  <td style={tdR}>{fmtMoney(sp)}</td>
                  <td style={tdR}>{fmtInt(ord)}</td>
                  <td style={tdR}>{fmtMoney(ord ? sp / ord : 0)}</td>
                  <td style={{ ...tdR, fontWeight: 800, color: r.r < BREAKEVEN_ROAS ? C.bad : C.text }}>{r.r.toFixed(2)}</td>
                  <td style={td}><Tag kind={r.tag}>{r.note}</Tag></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {kind === "meta"
          ? <Note><b>受眾疲乏：</b>「和牛牛舌 · 轉換」頻次 6.2、CTR 兩週內從 2.1% 掉到 1.3%，素材看膩了。換素材，不要加預算。</Note>
          : <Note><b>曝光佔有率僅 34%：</b>ROAS 3.62 的高意圖字還有量沒吃到，預算應該從 PMax 移過來。</Note>}
      </Card>
    </>
  );
}

function Shopline({ lens }: { lens: Lens }) {
  const f: Filter = { ta: lens.ta || null, appeal: lens.appeal || null, product: lens.product || null };
  const cur = aggregate(f, "current");
  const prev = aggregate(f, "previous");
  const showCmp = lens.compare !== "none";
  const prods = PRODUCTS
    .filter((p) => !lens.product || p.id === lens.product)
    .map((p) => {
      const t = aggregate({ ...f, product: p.id }, "current");
      return { p, t };
    })
    .sort((a, b) => b.t.revenue - a.t.revenue);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 16 }}>
        <Kpi k="訂單數" v={fmtInt(cur.orders)} cur={showCmp ? cur.orders : undefined} prev={showCmp ? prev.orders : undefined} />
        <Kpi k="客單價" v={fmtMoney(aov(cur))} cur={showCmp ? aov(cur) : undefined} prev={showCmp ? aov(prev) : undefined} />
        <Kpi k="營收" v={fmtMoney(cur.revenue)} cur={showCmp ? cur.revenue : undefined} prev={showCmp ? prev.revenue : undefined} />
        <Kpi k="回購率" v="28.4%" />
        <Kpi k="新客佔比" v="71.6%" />
      </div>
      <Card title="商品銷售排行" sub="依營收；隨視角篩選變動">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>商品</th>
            <th style={{ ...th, textAlign: "right" }}>訂單</th>
            <th style={{ ...th, textAlign: "right" }}>營收</th>
            <th style={{ ...th, textAlign: "right" }}>客單</th>
            <th style={{ ...th, textAlign: "right" }}>ROAS</th>
          </tr></thead>
          <tbody>
            {prods.map(({ p, t }) => (
              <tr key={p.id}>
                <td style={td}>{p.label}</td>
                <td style={tdR}>{fmtInt(t.orders)}</td>
                <td style={tdR}>{fmtMoney(t.revenue)}</td>
                <td style={tdR}>{fmtMoney(aov(t))}</td>
                <td style={{ ...tdR, fontWeight: 800, color: roas(t) < BREAKEVEN_ROAS ? C.bad : C.text }}>{roas(t).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Note>
          <b>首購商品決定回購率。</b>首購買「懶人料理組合包」的 30 天回購率 21%，首購買單品的只有 8%。
          獲客廣告主打組合包、單品留給再行銷，會比現在的配置更有效。
        </Note>
      </Card>
    </>
  );
}

function GaPage({ lens }: { lens: Lens }) {
  const f: Filter = { ta: lens.ta || null, appeal: lens.appeal || null, product: lens.product || null };
  const cur = aggregate(f, "current");
  const prev = aggregate(f, "previous");
  const showCmp = lens.compare !== "none";
  const cvr = cur.sessions ? cur.orders / cur.sessions : 0;
  const src = [
    { n: "Meta 付費", sh: 0.532, cv: 3.28 }, { n: "Google 付費", sh: 0.278, cv: 3.02 },
    { n: "自然搜尋", sh: 0.100, cv: 6.41 }, { n: "直接進入", sh: 0.063, cv: 5.88 },
    { n: "電子報", sh: 0.027, cv: 9.20 },
  ];
  const pages = [
    { n: "/products/和牛牛舌", sh: 0.239, cv: 5.12 }, { n: "/（首頁）", sh: 0.302, cv: 1.94 },
    { n: "/collections/懶人組合", sh: 0.185, cv: 4.38 }, { n: "/products/雞腿排", sh: 0.144, cv: 3.71 },
    { n: "/pages/免運說明", sh: 0.051, cv: 2.10 },
  ];
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 16 }}>
        <Kpi k="工作階段" v={fmtInt(cur.sessions)} cur={showCmp ? cur.sessions : undefined} prev={showCmp ? prev.sessions : undefined} />
        <Kpi k="轉換率" v={fmtPct(cvr, 2)} cur={showCmp ? cvr : undefined} prev={showCmp ? (prev.sessions ? prev.orders / prev.sessions : 0) : undefined} />
        <Kpi k="跳出率" v="46.2%" />
        <Kpi k="平均停留" v="1:52" />
        <Kpi k="行動裝置" v="83%" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card title="流量來源" sub="自然與電子報轉換最高，但量最小">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>來源</th><th style={{ ...th, textAlign: "right" }}>工作階段</th><th style={{ ...th, textAlign: "right" }}>轉換率</th></tr></thead>
            <tbody>{src.map((r) => (
              <tr key={r.n}><td style={td}>{r.n}</td><td style={tdR}>{fmtInt(cur.sessions * r.sh)}</td>
              <td style={{ ...tdR, fontWeight: r.cv > 5 ? 800 : 400 }}>{r.cv.toFixed(2)}%</td></tr>
            ))}</tbody>
          </table>
        </Card>
        <Card title="到達頁" sub="首頁流量最大但轉換最差">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>頁面</th><th style={{ ...th, textAlign: "right" }}>工作階段</th><th style={{ ...th, textAlign: "right" }}>轉換率</th></tr></thead>
            <tbody>{pages.map((r) => (
              <tr key={r.n}><td style={td}>{r.n}</td><td style={tdR}>{fmtInt(cur.sessions * r.sh)}</td>
              <td style={{ ...tdR, color: r.cv < 2 ? C.bad : C.text, fontWeight: r.cv < 2 ? 800 : 400 }}>{r.cv.toFixed(2)}%</td></tr>
            ))}</tbody>
          </table>
          <Note>廣告把 30% 流量丟到首頁，轉換率只有商品頁的 38%。改指向商品頁估計可多 <b>+{fmtMoney(62000)}</b>／月。</Note>
        </Card>
      </div>
    </>
  );
}

function Attribution({ lens }: { lens: Lens }) {
  const f: Filter = { ta: lens.ta || null, appeal: lens.appeal || null, product: lens.product || null };
  const cur = aggregate(f, "current");
  const rows = [
    { n: "Meta",          sp: 0.624, last: 0.645, dda: 0.686, note: "助攻被低估" },
    { n: "Google Search", sp: 0.269, last: 0.271, dda: 0.222, note: "吃到別人養出來的需求" },
    { n: "Google PMax",   sp: 0.107, last: 0.064, dda: 0.057, note: "與品牌字重疊" },
    { n: "電子報",         sp: 0.000, last: 0.020, dda: 0.036, note: "零成本、明顯被低估" },
  ];
  const realloc = [
    { n: "Meta 再行銷",     now: 0.149, to: 0.204, why: "ROAS 4.91，受眾規模還沒吃滿" },
    { n: "Meta 廣泛測試",   now: 0.178, to: 0.000, why: "ROAS 0.82，連 3 週低於平衡點" },
    { n: "Google 品類字",   now: 0.083, to: 0.047, why: "「宵夜吃什麼」等泛意圖字 ROAS 0.58" },
    { n: "Google 高意圖字", now: 0.040, to: 0.077, why: "ROAS 3.62 但曝光佔有率僅 34%" },
  ];
  return (
    <>
      <Card title="平台效率比較" sub="最後點擊 vs 資料驅動歸因 — 差距代表助攻被低估或高估">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>平台</th><th style={{ ...th, textAlign: "right" }}>花費</th>
            <th style={{ ...th, textAlign: "right" }}>最後點擊</th><th style={{ ...th, textAlign: "right" }}>資料驅動</th>
            <th style={{ ...th, textAlign: "right" }}>差異</th><th style={th}>意義</th>
          </tr></thead>
          <tbody>{rows.map((r) => {
            const d = r.last ? (r.dda - r.last) / r.last : 0;
            return (
              <tr key={r.n}>
                <td style={td}>{r.n}</td><td style={tdR}>{fmtMoney(cur.spend * r.sp)}</td>
                <td style={tdR}>{fmtInt(cur.orders * r.last)}</td><td style={tdR}>{fmtInt(cur.orders * r.dda)}</td>
                <td style={{ ...tdR, color: d > 0 ? C.good : C.bad, fontWeight: 800 }}>{d > 0 ? "+" : ""}{(d * 100).toFixed(1)}%</td>
                <td style={{ ...td, color: C.mute }}>{r.note}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </Card>
      <Card title="預算重分配建議" sub={`總預算不變 ${fmtMoney(cur.spend)}，只換配置`}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>項目</th><th style={{ ...th, textAlign: "right" }}>現在</th>
            <th style={{ ...th, textAlign: "right" }}>建議</th><th style={{ ...th, textAlign: "right" }}>變動</th><th style={th}>理由</th>
          </tr></thead>
          <tbody>{realloc.map((r) => {
            const now = cur.spend * r.now, to = cur.spend * r.to, d = to - now;
            return (
              <tr key={r.n}>
                <td style={td}>{r.n}</td><td style={tdR}>{fmtMoney(now)}</td><td style={tdR}>{fmtMoney(to)}</td>
                <td style={{ ...tdR, color: d > 0 ? C.good : C.bad, fontWeight: 800 }}>{d > 0 ? "+" : "−"}{fmtMoney(Math.abs(d))}</td>
                <td style={{ ...td, color: C.mute }}>{r.why}</td>
              </tr>
            );
          })}</tbody>
        </table>
        <Note>
          <b>預估效果：</b>同樣 {fmtMoney(cur.spend)}，ROAS 從 {roas(cur).toFixed(2)} → 約{" "}
          <b>{(roas(cur) * 1.18).toFixed(2)}</b>，營收 +{fmtMoney(cur.revenue * 0.18)}。不含修好結帳後的額外回收。
        </Note>
      </Card>
    </>
  );
}

/* ─────────────────────── Shell ─────────────────────── */

export default function PerformanceDashboard({ sourceId }: { sourceId: string }) {
  // Lens is held here so it survives page switches — the point is to carry one
  // question across platforms, not re-pick filters on every tab.
  const [lens, setLens] = React.useState<Lens>(DEFAULT_LENS);
  return (
    <div style={{ marginBottom: 28 }}>
      <FilterBar lens={lens} setLens={setLens} />
      {sourceId === "overview"    && <Overview lens={lens} setLens={setLens} />}
      {sourceId === "meta"        && <PlatformPage lens={lens} kind="meta" />}
      {sourceId === "google"      && <PlatformPage lens={lens} kind="google" />}
      {sourceId === "shopline"    && <Shopline lens={lens} />}
      {sourceId === "ga"          && <GaPage lens={lens} />}
      {sourceId === "attribution" && <Attribution lens={lens} />}
    </div>
  );
}
