/**
 * MarketDashboard — simulated 市場 data for 懶得煮的Tom老闆.
 *
 * 2026-08-11 (CJ「接下去，模擬市場數據」).
 *
 * Rendered ABOVE whatever the page already had, never instead of it. Four of
 * the market pages (輿情四頁) run real live queries and GEO has a real scan —
 * replacing those with mock data would delete working features. The pages that
 * were static (總覽 / 關鍵字 / 競品 / 機會) still carry IRIS 女裝 copy, which is
 * simply wrong for a frozen-food brand, so a simulated-but-correct layer is
 * strictly better there.
 *
 * Everything is marked 模擬資料 so a demo can never be mistaken for live data.
 */
import React from "react";
import {
  BRANDS, SOURCES, TOPICS, HOTSPOTS, KEYWORDS, GEO_ROWS, GEO_QUERIES,
  mAggregate, netSentiment, sov, kwScore, fmtInt, fmtPct, fmtSigned,
  OWN_BRAND, type MFilter, type MTotals,
} from "./marketMockData";
import {
  AI_MODELS, SCOPES, FINDINGS, GEO_MATRIX, VERIFY_LABEL,
  modelHitRate, modelAvgRank, type VerifyState,
} from "./aiObsMockData";

const C = {
  border: "#eceff3", sub: "#9ca3af", text: "#111827", mute: "#6b7280",
  good: "#059669", bad: "#dc2626", warnBg: "#FFFBEB", badBg: "#FEF2F2", goodBg: "#ECFDF5",
};
const card: React.CSSProperties = {
  background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12,
  padding: "18px 20px", marginBottom: 16,
};
const th: React.CSSProperties = {
  textAlign: "left", fontSize: 10, color: C.sub, letterSpacing: ".06em",
  fontWeight: 800, padding: "0 8px 8px", borderBottom: `1px solid ${C.border}`,
};
const td: React.CSSProperties = { padding: "9px 8px", borderBottom: "1px solid #f6f7f9", fontSize: 12 };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={card}>
      <h3 style={{ fontSize: 13, margin: 0, fontWeight: 800 }}>{title}</h3>
      <div style={{ fontSize: 11, color: C.sub, marginTop: 3, marginBottom: 16 }}>{sub ?? ""}</div>
      {children}
    </div>
  );
}
function Kpi({ k, v, d }: { k: string; v: string; d?: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 10, color: C.sub, letterSpacing: ".06em", fontWeight: 800 }}>{k}</div>
      <div style={{ fontSize: 19, fontWeight: 850, marginTop: 5, letterSpacing: "-.02em" }}>{v}</div>
      <div style={{ marginTop: 3, fontSize: 11 }}>{d ?? <span style={{ color: C.sub }}>—</span>}</div>
    </div>
  );
}
function Note({ tone = "warn", children }: { tone?: "warn" | "bad" | "good"; children: React.ReactNode }) {
  const b = tone === "bad" ? C.bad : tone === "good" ? C.good : "#F59E0B";
  const bg = tone === "bad" ? C.badBg : tone === "good" ? C.goodBg : C.warnBg;
  return <div style={{ borderLeft: `3px solid ${b}`, background: bg, padding: "12px 14px",
                       borderRadius: "0 8px 8px 0", marginTop: 14, fontSize: 12, lineHeight: 1.7 }}>{children}</div>;
}
/** −1..+1 sentiment as a diverging bar; neutral centre is the reference. */
function SentBar({ t }: { t: MTotals }) {
  const p = t.mentions ? t.pos / t.mentions : 0;
  const n = t.mentions ? t.neg / t.mentions : 0;
  return (
    <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "#f3f4f6", minWidth: 90 }}>
      <div style={{ width: `${p * 100}%`, background: C.good }} />
      <div style={{ flex: 1, background: "#e5e7eb" }} />
      <div style={{ width: `${n * 100}%`, background: C.bad }} />
    </div>
  );
}

export interface MLens { range: string; brand: string; source: string; topic: string }
const DEFAULT: MLens = { range: "30d", brand: "", source: "", topic: "" };

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: Array<{ id: string; label: string }>;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: C.sub, letterSpacing: ".06em" }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 9px",
                 fontSize: 12, background: "#fff", minWidth: 124, cursor: "pointer" }}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}

function Bar({ lens, setLens }: { lens: MLens; setLens: (l: MLens) => void }) {
  const any = lens.brand || lens.source || lens.topic;
  return (
    <div style={{ ...card, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
      <Select label="觀察區間" value={lens.range} onChange={(v) => setLens({ ...lens, range: v })}
              options={[{ id: "7d", label: "近 7 天" }, { id: "30d", label: "近 30 天" }, { id: "90d", label: "近 90 天" }]} />
      <div style={{ width: 1, height: 34, background: C.border }} />
      <Select label="品牌" value={lens.brand} onChange={(v) => setLens({ ...lens, brand: v })}
              options={[{ id: "", label: "全部品牌" }, ...BRANDS.map((b) => ({ id: b.id, label: b.label }))]} />
      <Select label="來源" value={lens.source} onChange={(v) => setLens({ ...lens, source: v })}
              options={[{ id: "", label: "全部來源" }, ...SOURCES.map((s) => ({ id: s.id, label: s.label }))]} />
      <Select label="討論主題" value={lens.topic} onChange={(v) => setLens({ ...lens, topic: v })}
              options={[{ id: "", label: "全部主題" }, ...TOPICS.map((t) => ({ id: t.id, label: t.label }))]} />
      {any && (
        <button onClick={() => setLens({ ...lens, brand: "", source: "", topic: "" })}
                style={{ border: `1px solid ${C.border}`, background: "#fff", borderRadius: 8,
                         padding: "7px 11px", fontSize: 12, cursor: "pointer", color: C.mute }}>清除視角</button>
      )}
      <div style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: C.bad,
                    background: C.badBg, border: "1px solid #FECACA", borderRadius: 6, padding: "5px 9px" }}>⚠ 模擬資料</div>
    </div>
  );
}

/* ── Brand × topic sentiment grid — the market equivalent of TA × 訴求 ── */
function BrandTopicGrid({ onPick }: { onPick: (b: string, t: string) => void }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
        <thead><tr>
          <th style={{ ...th, minWidth: 108 }}>品牌 ＼ 主題</th>
          {TOPICS.map((t) => <th key={t.id} style={{ ...th, textAlign: "center" }}>{t.label}</th>)}
        </tr></thead>
        <tbody>
          {BRANDS.map((b) => (
            <tr key={b.id}>
              <td style={{ ...td, fontWeight: b.own ? 850 : 600, color: b.own ? C.text : C.mute }}>
                {b.label}{b.own && <span style={{ fontSize: 9, marginLeft: 5, color: C.sub }}>本品牌</span>}
              </td>
              {TOPICS.map((t) => {
                const tot = mAggregate({ brand: b.id, topic: t.id });
                const ns = netSentiment(tot);
                // Diverging scale: green = net positive, red = net negative.
                // Here a threshold genuinely exists (zero), unlike the relative
                // ROAS matrix, so a two-colour ramp is the honest encoding.
                const mag = Math.min(1, Math.abs(ns) / 0.6);
                const bg = ns >= 0
                  ? `rgba(5,150,105,${(0.06 + mag * 0.62).toFixed(3)})`
                  : `rgba(220,38,38,${(0.06 + mag * 0.62).toFixed(3)})`;
                return (
                  <td key={t.id} style={{ ...td, padding: 4, textAlign: "center" }}>
                    <button onClick={() => onPick(b.id, t.id)}
                            title={`${fmtInt(tot.mentions)} 則｜淨情緒 ${fmtSigned(ns)}`}
                            style={{ width: "100%", border: "none", borderRadius: 7, padding: "9px 4px",
                                     background: bg, color: mag > 0.55 ? "#fff" : C.text, cursor: "pointer", lineHeight: 1.25 }}>
                      <div style={{ fontSize: 13, fontWeight: 850, fontVariantNumeric: "tabular-nums" }}>{fmtSigned(ns)}</div>
                      <div style={{ fontSize: 9, opacity: .75 }}>{fmtInt(tot.mentions)} 則</div>
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

function Overview({ lens, setLens }: { lens: MLens; setLens: (l: MLens) => void }) {
  const f: MFilter = { brand: lens.brand || null, source: lens.source || null, topic: lens.topic || null };
  const all = mAggregate(f);
  const own = mAggregate({ ...f, brand: "own" });
  const ownNs = netSentiment(own);
  const weakest = TOPICS
    .map((t) => ({ t, ns: netSentiment(mAggregate({ brand: "own", topic: t.id })) }))
    .sort((a, b) => a.ns - b.ns)[0]!;
  const strongest = TOPICS
    .map((t) => ({ t, ns: netSentiment(mAggregate({ brand: "own", topic: t.id })) }))
    .sort((a, b) => b.ns - a.ns)[0]!;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 16 }}>
        <Kpi k="市場總聲量" v={fmtInt(all.mentions)} d={<span style={{ color: C.good }}>+15.2%</span>} />
        <Kpi k="本品牌聲量" v={fmtInt(own.mentions)} d={<span style={{ color: C.good }}>+22.4%</span>} />
        <Kpi k="聲量佔比 SOV" v={fmtPct(sov(own))} d={<span style={{ color: C.sub }}>市場第 5</span>} />
        <Kpi k="淨情緒" v={fmtSigned(ownNs)} d={<span style={{ color: ownNs > 0.2 ? C.good : C.mute }}>高於市場均值</span>} />
        <Kpi k="負面提及" v={fmtInt(own.neg)} d={<span style={{ color: C.bad }}>集中在 2 個主題</span>} />
      </div>

      <Card title="品牌 × 討論主題 情緒矩陣"
            sub="數字是淨情緒（正面−負面）／總量。綠＝被稱讚，紅＝被抱怨。點任一格切換視角">
        <BrandTopicGrid onPick={(b, t) => setLens({ ...lens, brand: b, topic: t })} />
        <Note tone="good">
          <b>最強：{strongest.t.label}（{fmtSigned(strongest.ns)}）</b> —— 這是全市場最高分，
          連桂冠、大成都比不上。這一點應該是所有溝通的主軸。
        </Note>
        <Note tone="bad">
          <b>最弱：{weakest.t.label}（{fmtSigned(weakest.ns)}）</b> —— 全品牌中唯一淨負面的主題。
          值得注意的是，這與成效層漏斗看到的結帳流失是同一件事：運費在結帳頁才揭露，
          消費者在社群抱怨的也是同一點。<b>兩個獨立資料層指向同一個問題，優先度應該最高。</b>
        </Note>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card title="聲量來源分布" sub="哪裡在談論這個品類">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>來源</th><th style={{ ...th, textAlign: "right" }}>則數</th><th style={{ ...th, textAlign: "center" }}>情緒</th></tr></thead>
            <tbody>{SOURCES.map((s) => {
              const t = mAggregate({ ...f, source: s.id });
              return <tr key={s.id}><td style={td}>{s.label}</td><td style={tdR}>{fmtInt(t.mentions)}</td>
                <td style={{ ...td, width: 110 }}><SentBar t={t} /></td></tr>;
            })}</tbody>
          </table>
        </Card>
        <Card title="競品聲量排名" sub="以總提及數排序">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>品牌</th><th style={{ ...th, textAlign: "right" }}>則數</th><th style={{ ...th, textAlign: "right" }}>SOV</th><th style={{ ...th, textAlign: "right" }}>淨情緒</th></tr></thead>
            <tbody>{[...BRANDS].map((b) => ({ b, t: mAggregate({ brand: b.id }) }))
              .sort((x, y) => y.t.mentions - x.t.mentions)
              .map(({ b, t }) => (
                <tr key={b.id} style={b.own ? { background: "#FFF7ED" } : undefined}>
                  <td style={{ ...td, fontWeight: b.own ? 850 : 400 }}>{b.label}</td>
                  <td style={tdR}>{fmtInt(t.mentions)}</td>
                  <td style={tdR}>{fmtPct(sov(t))}</td>
                  <td style={{ ...tdR, color: netSentiment(t) >= 0 ? C.good : C.bad, fontWeight: 800 }}>{fmtSigned(netSentiment(t))}</td>
                </tr>
              ))}</tbody>
          </table>
          <Note>聲量只有第 5，但淨情緒是第 1 —— 這是「小而好」的形狀。問題不是產品，是知名度。</Note>
        </Card>
      </div>
    </>
  );
}

function Hotspots() {
  return (
    <Card title="市場熱點" sub="熱度＝當前討論量，成長＝週增幅，適配度＝與本品牌定位的吻合程度">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          <th style={th}>話題</th><th style={{ ...th, textAlign: "right" }}>熱度</th>
          <th style={{ ...th, textAlign: "right" }}>週成長</th><th style={{ ...th, textAlign: "right" }}>適配度</th><th style={th}>判讀</th>
        </tr></thead>
        <tbody>{[...HOTSPOTS].sort((a, b) => b.fit - a.fit).map((h) => (
          <tr key={h.id}>
            <td style={{ ...td, fontWeight: 700 }}>{h.label}</td>
            <td style={tdR}>{h.heat}</td>
            <td style={{ ...tdR, color: h.growth > 0.3 ? C.good : C.mute }}>+{(h.growth * 100).toFixed(0)}%</td>
            <td style={{ ...tdR, fontWeight: 800, color: h.fit >= 80 ? C.good : h.fit < 55 ? C.bad : C.mute }}>{h.fit}</td>
            <td style={{ ...td, color: C.mute }}>{h.note}</td>
          </tr>
        ))}</tbody>
      </table>
      <Note>
        <b>熱度高 ≠ 該蹭。</b>「食材漲價怎麼辦」熱度 88 但適配度只有 38 —— 中高價定位去蹭省錢話題
        會傷害定位。真正該做的是適配度 91 的「小家庭免開火」，它跟「免油煙免洗鍋」訴求完全對齊。
      </Note>
    </Card>
  );
}

function Keywords() {
  const rows = [...KEYWORDS].map((k) => ({ k, s: kwScore(k) })).sort((a, b) => b.s - a.s);
  return (
    <Card title="關鍵字機會" sub="機會分數＝需求量 × 可攻下程度 × 購買意圖，不是只看搜尋量">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          <th style={th}>關鍵字</th><th style={{ ...th, textAlign: "right" }}>月搜尋量</th>
          <th style={{ ...th, textAlign: "right" }}>競爭度</th><th style={{ ...th, textAlign: "right" }}>CPC</th>
          <th style={{ ...th, textAlign: "center" }}>意圖</th><th style={{ ...th, textAlign: "right" }}>機會分數</th>
        </tr></thead>
        <tbody>{rows.map(({ k, s }) => (
          <tr key={k.kw}>
            <td style={{ ...td, fontWeight: 700 }}>{k.kw}</td>
            <td style={tdR}>{fmtInt(k.vol)}</td>
            <td style={tdR}>{k.diff}</td>
            <td style={tdR}>${k.cpc.toFixed(1)}</td>
            <td style={{ ...td, textAlign: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 20,
                background: k.intent === "high" ? C.goodBg : k.intent === "mid" ? "#f3f4f6" : C.badBg,
                color: k.intent === "high" ? C.good : k.intent === "mid" ? C.mute : C.bad }}>
                {k.intent === "high" ? "高" : k.intent === "mid" ? "中" : "低"}
              </span>
            </td>
            <td style={{ ...tdR, fontWeight: 850 }}>{s}</td>
          </tr>
        ))}</tbody>
      </table>
      <Note>
        「宵夜吃什麼」月搜 61,000 是最大的量，但競爭度 76、意圖低，機會分數墊底 ——
        跟成效層看到的一樣（那個字 ROAS 0.58）。<b>搜尋量最大的字往往是最不該買的字。</b>
      </Note>
    </Card>
  );
}

function Geo() {
  const own = GEO_ROWS.find((r) => r.brand === OWN_BRAND)!;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
        <Kpi k="AI 出現率" v={fmtPct(own.appear, 0)} d={<span style={{ color: C.bad }}>市場第 5</span>} />
        <Kpi k="AI 聲量佔比" v={fmtPct(own.sovAi, 0)} d={<span style={{ color: C.bad }}>桂冠的 1/3</span>} />
        <Kpi k="AI 情緒" v={fmtSigned(own.sent)} d={<span style={{ color: C.good }}>全市場第 1</span>} />
        <Kpi k="被引用來源" v={String(own.cited)} d={<span style={{ color: C.bad }}>偏少</span>} />
      </div>
      <Card title="各品牌 AI 能見度" sub="在 Gemini 等 AI 回答中被提及的比率與情緒">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>品牌</th><th style={{ ...th, textAlign: "right" }}>出現率</th>
            <th style={{ ...th, textAlign: "right" }}>AI 聲量佔比</th><th style={{ ...th, textAlign: "right" }}>情緒</th>
            <th style={{ ...th, textAlign: "right" }}>被引用來源數</th>
          </tr></thead>
          <tbody>{GEO_ROWS.map((r) => (
            <tr key={r.brand} style={r.brand === OWN_BRAND ? { background: "#FFF7ED" } : undefined}>
              <td style={{ ...td, fontWeight: r.brand === OWN_BRAND ? 850 : 400 }}>{r.brand}</td>
              <td style={tdR}>{fmtPct(r.appear, 0)}</td><td style={tdR}>{fmtPct(r.sovAi, 0)}</td>
              <td style={{ ...tdR, color: C.good, fontWeight: r.brand === OWN_BRAND ? 800 : 400 }}>{fmtSigned(r.sent)}</td>
              <td style={tdR}>{r.cited}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
      <Card title="問題別命中狀況" sub="AI 被問到這些問題時，有沒有提到我們">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>使用者可能問 AI 的問題</th><th style={{ ...th, textAlign: "center" }}>是否命中</th><th style={th}>說明</th></tr></thead>
          <tbody>{GEO_QUERIES.map((g) => (
            <tr key={g.q}>
              <td style={{ ...td, fontWeight: 600 }}>{g.q}</td>
              <td style={{ ...td, textAlign: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20,
                  background: g.hit ? C.goodBg : C.badBg, color: g.hit ? C.good : C.bad }}>{g.hit ? "命中" : "未命中"}</span>
              </td>
              <td style={{ ...td, color: C.mute }}>{g.note}</td>
            </tr>
          ))}</tbody>
        </table>
        <Note>
          情緒全市場第 1，但出現率只有 34% —— <b>AI 講到我們時評價很好，問題是根本很少講到。</b>
          這是內容曝光問題（被引用來源只有 3 個），不是產品或口碑問題。
        </Note>
      </Card>
    </>
  );
}

function Opportunity() {
  const rows = [
    { n: "把「免油煙免洗鍋」做成主溝通", why: "情緒矩陣此項最高分，且對應熱度 85／適配度 91 的「小家庭免開火」", eff: "低", val: "高" },
    { n: "運費透明化 + 免運門檻前置",   why: "唯一淨負面主題，且與成效層結帳流失 47.6% 是同一件事", eff: "中", val: "高" },
    { n: "宴客情境內容系列",           why: "「宴客 冷凍 菜色」是 AI 唯一第 1 名的題目，也是 ROAS 最高的 TA×訴求", eff: "低", val: "高" },
    { n: "增加可被 AI 引用的來源",      why: "AI 情緒第 1 但出現率僅 34%、被引用來源只有 3 個", eff: "中", val: "中" },
    { n: "攻「和牛 牛舌 宅配」關鍵字",   why: "機會分數前段，競爭度僅 41，成效層 ROAS 3.62 但曝光佔有率只有 34%", eff: "低", val: "中" },
    { n: "不要蹭「食材漲價」話題",      why: "熱度 88 但適配度 38，與中高價定位衝突", eff: "—", val: "避免" },
  ];
  return (
    <Card title="機會診斷" sub="從市場訊號推導的行動清單，依「價值 ÷ 難度」排序">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          <th style={th}>行動</th><th style={th}>依據</th>
          <th style={{ ...th, textAlign: "center" }}>難度</th><th style={{ ...th, textAlign: "center" }}>價值</th>
        </tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>
            <td style={{ ...td, fontWeight: 700 }}>{r.n}</td>
            <td style={{ ...td, color: C.mute }}>{r.why}</td>
            <td style={{ ...td, textAlign: "center" }}>{r.eff}</td>
            <td style={{ ...td, textAlign: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 20,
                background: r.val === "高" ? C.goodBg : r.val === "避免" ? C.badBg : "#f3f4f6",
                color: r.val === "高" ? C.good : r.val === "避免" ? C.bad : C.mute }}>{r.val}</span>
            </td>
          </tr>
        ))}</tbody>
      </table>
      <Note tone="good">
        前三項都同時被「市場層」和「成效層」指到 —— 兩個獨立資料源同意的結論，
        比單一儀表板上的任何單點數字都值得先做。
      </Note>
    </Card>
  );
}

function Listening({ scope, lens }: { scope: string; lens: MLens }) {
  const brand = scope === "listen_own" ? "own" : scope === "listen_competitor" ? (lens.brand || null) : (lens.brand || null);
  const f: MFilter = { brand, source: lens.source || null, topic: lens.topic || null };
  const t = mAggregate(f);
  const title = scope === "listen_own" ? "本品牌聲量"
    : scope === "listen_competitor" ? "競品聲量"
    : scope === "listen_industry" ? "產業討論" : "市場熱點";
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
        <Kpi k="提及則數" v={fmtInt(t.mentions)} />
        <Kpi k="正面" v={fmtInt(t.pos)} d={<span style={{ color: C.good }}>{fmtPct(t.mentions ? t.pos / t.mentions : 0, 0)}</span>} />
        <Kpi k="負面" v={fmtInt(t.neg)} d={<span style={{ color: C.bad }}>{fmtPct(t.mentions ? t.neg / t.mentions : 0, 0)}</span>} />
        <Kpi k="淨情緒" v={fmtSigned(netSentiment(t))} />
      </div>
      <Card title={`${title} · 主題拆解`} sub="哪些主題在被談，談得好不好">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>主題</th><th style={{ ...th, textAlign: "right" }}>則數</th>
            <th style={{ ...th, textAlign: "center" }}>情緒分布</th><th style={{ ...th, textAlign: "right" }}>淨情緒</th></tr></thead>
          <tbody>{TOPICS.map((tp) => {
            const tt = mAggregate({ ...f, topic: tp.id });
            const ns = netSentiment(tt);
            return (
              <tr key={tp.id}>
                <td style={td}>{tp.label}</td><td style={tdR}>{fmtInt(tt.mentions)}</td>
                <td style={{ ...td, width: 120 }}><SentBar t={tt} /></td>
                <td style={{ ...tdR, color: ns >= 0 ? C.good : C.bad, fontWeight: 800 }}>{fmtSigned(ns)}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </Card>
      {scope === "listen_hotspots" && <Hotspots />}
    </>
  );
}

/* ══════════════════════ 純 AI 觀測 mode ══════════════════════
 * A deliberately different interface, not a restyled version of the paid one.
 * AI has no population, so it cannot honestly produce 聲量 / SOV / trends —
 * any absolute number here would be invented. The atom is therefore a FINDING:
 * what was asserted, by which models, and whether we could verify it.
 *
 * The two things that separate this from just asking ChatGPT yourself are the
 * two things the UI leads with: 核實狀態 and 限定範圍.
 */

function VerifyBadge({ v }: { v: VerifyState }) {
  const m = {
    verified:   { bg: C.goodBg, fg: C.good, icon: "✓" },
    partial:    { bg: C.warnBg, fg: "#b45309", icon: "◐" },
    unverified: { bg: C.badBg,  fg: C.bad, icon: "✕" },
  }[v];
  return (
    <span style={{ background: m.bg, color: m.fg, fontSize: 10, fontWeight: 800,
                   padding: "3px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>
      {m.icon} {VERIFY_LABEL[v]}
    </span>
  );
}

function ModelChips({ ids }: { ids: string[] }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {AI_MODELS.map((m) => {
        const on = ids.includes(m.id);
        return (
          <span key={m.id} title={m.label}
            style={{
              width: 20, height: 20, borderRadius: 6, fontSize: 9, fontWeight: 850,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: on ? C.text : "#f3f4f6", color: on ? "#fff" : "#d1d5db",
            }}>{m.short}</span>
        );
      })}
    </div>
  );
}

function AiObservation({ sourceId }: { sourceId: string }) {
  const [scope, setScope] = React.useState<string>("today");
  const [onlyVerified, setOnlyVerified] = React.useState(false);
  const sc = SCOPES.find((s) => s.id === scope)!;

  let items = FINDINGS.filter((f) => f.scopes.includes(scope));
  if (onlyVerified) items = items.filter((f) => f.verify === "verified");
  // Most-agreed first — cross-model agreement is the only confidence signal
  // available without a population to count.
  items = [...items].sort((a, b) => b.models.length - a.models.length);

  const verified = FINDINGS.filter((f) => f.scopes.includes(scope) && f.verify === "verified").length;
  const total = FINDINGS.filter((f) => f.scopes.includes(scope)).length;

  return (
    <>
      <div style={{ ...card, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Select label="觀測範圍" value={scope} onChange={setScope}
                options={SCOPES.map((s) => ({ id: s.id, label: s.label }))} />
        <div style={{ fontSize: 11, color: C.sub, paddingBottom: 8 }}>{sc.note}</div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, paddingBottom: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={onlyVerified} onChange={(e) => setOnlyVerified(e.target.checked)} />
          只看已核實
        </label>
        <div style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: C.bad,
                      background: C.badBg, border: "1px solid #FECACA", borderRadius: 6, padding: "5px 9px" }}>⚠ 模擬資料</div>
      </div>

      <div style={{ ...card, background: "#fafafa" }}>
        <div style={{ fontSize: 12, lineHeight: 1.8 }}>
          <b>這一頁跟你自己去問 AI 的差別</b><br />
          ① <b>限定範圍</b>：只採計 <b>{sc.label}（{sc.note}）</b>內的觀測，不是模型憑印象回答。<br />
          ② <b>逐條核實</b>：{total} 筆發現中 <b>{verified} 筆</b>比對得到可指認的原文，其餘明確標示為部分／無法核實 —— 不會把推測混進事實。<br />
          ③ <b>跨模型比對</b>：{AI_MODELS.length} 個模型各問一次，只有一個模型說的會被降權，不會單一模型幻覺就當結論。
        </div>
      </div>

      <Card title={`AI 觀測發現 · ${sc.label}`}
            sub="依「幾個模型同時提到」排序 — 沒有母體就沒有聲量數字，跨模型一致度是這裡唯一誠實的信心指標">
        {items.length === 0 && <div style={{ fontSize: 12, color: C.sub }}>此範圍內沒有符合條件的發現。</div>}
        {items.map((f) => (
          <div key={f.id} style={{ borderTop: `1px solid ${C.border}`, padding: "14px 0" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 800, background: "#f3f4f6", color: C.mute,
                             padding: "3px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>{f.topic}</span>
              <VerifyBadge v={f.verify} />
              <span style={{ fontSize: 10, color: C.sub, fontWeight: 700 }}>
                強度 {f.strength === "high" ? "高" : f.strength === "mid" ? "中" : "低"}
              </span>
              <div style={{ marginLeft: "auto" }}>
                <ModelChips ids={f.models} />
              </div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 6 }}>{f.claim}</div>
            <div style={{ fontSize: 11, color: C.mute }}>
              {f.models.length}/{AI_MODELS.length} 個模型提到
              {f.brands.length > 0 && <> · 涉及 {f.brands.join("、")}</>}
              {f.sourceNote && <> · {f.sourceNote}</>}
              {f.source && <> · <a href={f.source} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>來源</a></>}
            </div>
          </div>
        ))}
        <Note>
          <b>沒有「聲量 N 則」這種數字，是刻意的。</b>AI 沒有母體 —— 任何絕對數字都是編的，
          拿去對客戶報告會出事。要絕對值請切到「付費數據庫」版。
        </Note>
      </Card>

      {sourceId === "geo" && <GeoMultiModel />}
    </>
  );
}

/* GEO is always live-at-this-moment, and every model answers differently —
   so the unit of analysis is the model × question grid, not a single score. */
function GeoMultiModel() {
  return (
    <>
      <Card title="GEO · 各 AI 模型當下的回答" sub="同一個問題同時問 5 個模型，看誰會提到我們、排第幾、引用什麼">
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 660 }}>
            <thead><tr>
              <th style={{ ...th, minWidth: 168 }}>使用者問 AI 的問題</th>
              {AI_MODELS.map((m) => <th key={m.id} style={{ ...th, textAlign: "center" }}>{m.label}</th>)}
            </tr></thead>
            <tbody>
              {GEO_MATRIX.map((q) => (
                <tr key={q.q}>
                  <td style={{ ...td, fontWeight: 700 }}>{q.q}</td>
                  {AI_MODELS.map((m) => {
                    const c = q.cells.find((x) => x.model === m.id)!;
                    return (
                      <td key={m.id} style={{ ...td, textAlign: "center", padding: 4 }}>
                        {c.hit ? (
                          <div title={c.cited ? `引用：${c.cited}` : undefined}
                               style={{ background: c.sentiment === "pos" ? C.goodBg : "#f3f4f6",
                                        color: c.sentiment === "pos" ? C.good : C.mute,
                                        borderRadius: 7, padding: "7px 4px", lineHeight: 1.3 }}>
                            <div style={{ fontSize: 13, fontWeight: 850 }}>#{c.rank}</div>
                            <div style={{ fontSize: 9 }}>{c.cited ?? "—"}</div>
                          </div>
                        ) : (
                          <div style={{ background: C.badBg, color: C.bad, borderRadius: 7,
                                        padding: "7px 4px", fontSize: 11, fontWeight: 800 }}>未提及</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="各模型命中率" sub="同一個品牌，在不同 AI 上的能見度差很多 —— 優化對象不該一視同仁">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>模型</th><th style={{ ...th, textAlign: "right" }}>命中</th>
            <th style={{ ...th, textAlign: "right" }}>命中率</th><th style={{ ...th, textAlign: "right" }}>平均排名</th>
          </tr></thead>
          <tbody>{AI_MODELS.map((m) => {
            const r = modelHitRate(m.id); const ar = modelAvgRank(m.id);
            return (
              <tr key={m.id}>
                <td style={{ ...td, fontWeight: 700 }}>{m.label}</td>
                <td style={tdR}>{r.hits}/{r.total}</td>
                <td style={{ ...tdR, fontWeight: 800, color: r.rate >= 0.6 ? C.good : r.rate <= 0.2 ? C.bad : C.mute }}>
                  {fmtPct(r.rate, 0)}
                </td>
                <td style={tdR}>{ar ? `#${ar.toFixed(1)}` : "—"}</td>
              </tr>
            );
          })}</tbody>
        </table>
        <Note>
          <b>Perplexity 命中率最高、Copilot 最低。</b>Perplexity 會即時抓網頁並引用官網，
          Copilot 較依賴既有索引 —— 所以要提升 Copilot 的能見度，靠的是被更多第三方網站提及，
          不是改自己的官網。<b>同一個 GEO 問題，對不同模型的解法不一樣。</b>
        </Note>
        <Note tone="bad">
          「冷凍調理包 哪個好吃」<b>5 個模型全部未提及</b> —— 這是最明確的內容缺口，
          而且是高購買意圖的問題。
        </Note>
      </Card>
    </>
  );
}

/* ─────────────────────── Shell ─────────────────────── */

type Mode = "db" | "ai";

export default function MarketDashboard({ sourceId }: { sourceId: string }) {
  const [lens, setLens] = React.useState<MLens>(DEFAULT);
  const [mode, setMode] = React.useState<Mode>("db");
  const listening = ["listen_hotspots", "listen_industry", "listen_own", "listen_competitor"].includes(sourceId);

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Mode switch — the two are different products, not two skins. Paid DB
          answers "how much"; AI answers "what is being said, and can we back
          it up". Mixing them into one view is how AI guesses get mistaken for
          measured figures. */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        {([
          { id: "db" as const, label: "付費數據庫", note: "有母體、可追蹤趨勢、可稽核" },
          { id: "ai" as const, label: "純 AI 觀測", note: "無母體、逐條核實、可限定範圍" },
        ]).map((m) => {
          const on = mode === m.id;
          return (
            <button key={m.id} onClick={() => setMode(m.id)}
              style={{
                border: `1px solid ${on ? C.text : C.border}`, background: on ? C.text : "#fff",
                color: on ? "#fff" : C.mute, borderRadius: 10, padding: "8px 14px",
                cursor: "pointer", textAlign: "left", lineHeight: 1.3,
              }}>
              <div style={{ fontSize: 12, fontWeight: 800 }}>{m.label}</div>
              <div style={{ fontSize: 10, opacity: on ? .8 : .7 }}>{m.note}</div>
            </button>
          );
        })}
      </div>

      {mode === "ai" ? (
        <AiObservation sourceId={sourceId} />
      ) : (
        <>
          <Bar lens={lens} setLens={setLens} />
          {sourceId === "overview"     && <Overview lens={lens} setLens={setLens} />}
          {listening                   && <Listening scope={sourceId} lens={lens} />}
          {sourceId === "keywords"     && <Keywords />}
          {sourceId === "geo"          && <Geo />}
          {sourceId === "competitors"  && <Overview lens={lens} setLens={setLens} />}
          {sourceId === "opportunity"  && <Opportunity />}
          {sourceId === "hot_topics"   && <Hotspots />}
        </>
      )}
    </div>
  );
}
