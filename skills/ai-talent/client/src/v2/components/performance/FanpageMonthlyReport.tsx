/**
 * FanpageMonthlyReport — 成效工作區的「粉絲團月報」。
 *
 * 主張：自動化的終點是「你的檔案」，不是我們的儀表板。使用者上傳自己已經在用的
 * 月報 .pptx（越多個月越準），系統跨月比對出哪些位置每月會變 —— 那些就是可以自動
 * 填的欄位 —— 並先把發現說清楚，再談填資料。
 *
 * 為什麼先給「體檢報告」而不是直接產檔：AgencyAnalytics 這類工具最常被罵的是
 * 「連接器斷了但你不知道」。先誠實講哪些能自動、哪些不行，比先自動化再出錯好。
 *
 * 中間的頁面是依真實幾何（EMU）畫出的示意圖，不是像素縮圖 —— dev VM 沒有
 * LibreOffice。要看真版面的話，之後接 Google Slides API 的 thumbnail 就能換掉，
 * 右邊面板不用重做。
 */
import React from "react";
import { useSearchParams } from "react-router-dom";

type SlotRef = { slide: number; x: number; y: number; w: number; h: number; shape: string };
type Slot = {
  id: string; type: string; label?: string; ref?: SlotRef; stability?: string;
  charBudget?: { max: number; derivedFrom?: { observed?: number[] } };
  observedValues?: string[];
  orientation?: string;
  cardinality?: { min?: number; max?: number };
  fields?: { key?: string }[];
  chartKind?: string;
  categories?: { from?: string };
  series?: { name?: string }[];
  observedCategoryCounts?: number[];
  observedPerMonth?: Record<string, number>;
  distinctImages?: number;
};
type OutlineShape = {
  name: string; kind: string; x: number; y: number; w: number; h: number; text?: string;
  table?: { rows: number; cols: number } | null;
  chart?: { kind: string; series: string[] } | null;
};
type Analysis = {
  deckCount: number;
  decks: { label: string; slides: number }[];
  reference: { label: string; slideW: number; slideH: number; slides: { index: number; shapes: OutlineShape[] }[] };
  slots: Slot[];
  health: { decksAnalyzed: number; findings: { kind: string; message: string; evidence?: string[] }[] };
};
type Deck = { name: string; bytes: number; uploadedAt: string };

const TYPE_COLOR: Record<string, string> = {
  scalar: "#2563eb", tableGroup: "#7c3aed", chart: "#0d9488",
  image: "#d97706", marker: "#db2777", slideGroup: "#475569",
};
const TYPE_ZH: Record<string, string> = {
  scalar: "單值", tableGroup: "表格群組", chart: "圖表",
  image: "圖片", marker: "標記", slideGroup: "整頁重複",
};
const FIND_COLOR: Record<string, string> = {
  stable: "#059669", variableCardinality: "#7c3aed", repeatingSlides: "#475569",
  imageHeavy: "#d97706", tightBudget: "#b45309", shapeRenamed: "#db2777", manualOnly: "#6b7280",
};

const card: React.CSSProperties = {
  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 14,
};
const kicker: React.CSSProperties = {
  fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#9ca3af", fontWeight: 800,
};

function fmtMB(b: number) { return (b / 1024 / 1024).toFixed(1) + " MB"; }
function pct(v: number, total: number) { return (v / total * 100).toFixed(2) + "%"; }

export default function FanpageMonthlyReport() {
  const [searchParams] = useSearchParams();
  const brandId = Number(searchParams.get("b") ?? 0) || null;

  const [decks, setDecks] = React.useState<Deck[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null);
  const [page, setPage] = React.useState(1);
  const [sel, setSel] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const refresh = React.useCallback(async () => {
    if (!brandId) return;
    try {
      const r = await fetch(`/api/report-template/list?brandId=${brandId}`, { credentials: "include" });
      const j = await r.json();
      setDecks(j.decks ?? []);
    } catch { /* the empty state already says what to do */ }
  }, [brandId]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  async function upload(files: FileList | null) {
    if (!files || !brandId) return;
    setErr(null);
    for (const f of Array.from(files)) {
      if (!f.name.toLowerCase().endsWith(".pptx")) {
        setErr(`「${f.name}」不是 .pptx，已略過`);
        continue;
      }
      setBusy(`上傳中：${f.name}`);
      try {
        const r = await fetch("/api/report-template/upload", {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/octet-stream",
            "x-brand-id": String(brandId),
            "x-filename": encodeURIComponent(f.name),
          },
          body: f,
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setDecks(j.decks ?? []);
      } catch (e: any) {
        setErr(`${f.name}：${e?.message ?? "上傳失敗"}`);
      }
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function remove(name: string) {
    if (!brandId) return;
    setBusy("刪除中…");
    try {
      const r = await fetch(`/api/report-template/${brandId}/${encodeURIComponent(name)}`, {
        method: "DELETE", credentials: "include",
      });
      const j = await r.json();
      setDecks(j.decks ?? []);
    } finally { setBusy(null); }
  }

  async function analyze() {
    if (!brandId) return;
    setBusy("解析中…（第一次比對多份月報約需 1–2 分鐘）");
    setErr(null);
    try {
      const r = await fetch("/api/report-template/analyze", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || j.error || `HTTP ${r.status}`);
      setAnalysis(j);
      setSel(null);
      // Open on the first page that actually has fillable slots, not page 1
      // (which is always the cover and never has any).
      const first = (j.slots as Slot[]).find(s => s.ref?.slide)?.ref?.slide;
      setPage(first ?? 1);
    } catch (e: any) {
      setErr(e?.message ?? "解析失敗");
    } finally { setBusy(null); }
  }

  if (!brandId) {
    return (
      <div style={{ ...card, borderColor: "#fde68a", background: "#fffbeb", color: "#92400e" }}>
        網址缺少 <b>?b=品牌ID</b>。請先在右上角選擇品牌，或用
        <code style={{ margin: "0 4px" }}>/performance/fanpage_monthly?b=2975</code>開啟。
      </div>
    );
  }

  const W = analysis?.reference.slideW ?? 9144000;
  const H = analysis?.reference.slideH ?? 5143500;
  const slotsByPage: Record<number, Slot[]> = {};
  analysis?.slots.forEach(s => {
    if (s.ref?.slide) (slotsByPage[s.ref.slide] ||= []).push(s);
  });
  const pageSlots = slotsByPage[page] ?? [];
  const selected = pageSlots.find(s => s.id === sel);
  const outline = analysis?.reference.slides.find(s => s.index === page);
  const typeCounts: Record<string, number> = {};
  analysis?.slots.forEach(s => { typeCounts[s.type] = (typeCounts[s.type] ?? 0) + 1; });

  return (
    <div>
      {/* ── 上傳 ─────────────────────────────────────────────────────── */}
      <div style={card}>
        <div style={kicker}>STEP 1 · 上傳你現在在用的月報</div>
        <h3 style={{ margin: "6px 0 4px", fontSize: 16, fontWeight: 850 }}>版型來自你自己的檔案</h3>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>
          上傳同一份月報的<b>不同月份</b>（建議 4 份以上）。系統靠跨月比對判斷哪些位置每月會變 ——
          每月都一樣的是版型，會變的才是要自動填的欄位。只上傳一份無法比對。
        </p>

        <input ref={fileRef} type="file" accept=".pptx" multiple style={{ display: "none" }}
               onChange={e => void upload(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} disabled={!!busy}
                style={{ border: "1px solid #111827", background: "#111827", color: "#fff",
                         borderRadius: 9, padding: "8px 16px", fontSize: 13, fontWeight: 700,
                         cursor: busy ? "not-allowed" : "pointer" }}>
          選擇 .pptx（可多選）
        </button>
        <button onClick={() => void analyze()} disabled={!!busy || decks.length === 0}
                style={{ marginLeft: 8, border: "1px solid #e5e7eb", background: "#fff", color: "#111827",
                         borderRadius: 9, padding: "8px 16px", fontSize: 13, fontWeight: 700,
                         cursor: (busy || !decks.length) ? "not-allowed" : "pointer" }}>
          開始分析（{decks.length} 份）
        </button>

        {busy && <div style={{ marginTop: 10, fontSize: 12, color: "#2563eb" }}>{busy}</div>}
        {err && <div style={{ marginTop: 10, fontSize: 12, color: "#b91c1c" }}>⚠ {err}</div>}

        {decks.length > 0 && (
          <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
            {decks.map(d => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 10,
                                         border: "1px solid #f1f3f5", borderRadius: 8, padding: "7px 10px" }}>
                <span style={{ fontSize: 12, fontWeight: 700, flex: 1, wordBreak: "break-all" }}>{d.name}</span>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>{fmtMB(d.bytes)}</span>
                <button onClick={() => void remove(d.name)} disabled={!!busy}
                        style={{ border: "none", background: "none", color: "#9ca3af",
                                 cursor: "pointer", fontSize: 12 }}>移除</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {!analysis && (
        <div style={{ ...card, color: "#6b7280", fontSize: 13 }}>
          還沒有分析結果。上傳月報後按「開始分析」，系統會告訴你這份版型有多少欄位可以自動填、
          哪些每月會變動、哪句洞察只有幾個字的空間。
        </div>
      )}

      {analysis && (
        <>
          {/* ── 體檢報告 ───────────────────────────────────────────── */}
          <div style={card}>
            <div style={kicker}>STEP 2 · 版型體檢報告</div>
            <h3 style={{ margin: "6px 0 10px", fontSize: 16, fontWeight: 850 }}>
              比對 {analysis.health.decksAnalyzed} 個月，找到 {analysis.slots.length} 個可填欄位
            </h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} style={{ border: "1px solid #e5e7eb", borderRadius: 9, padding: "6px 10px", background: "#fafafa" }}>
                  <b style={{ fontSize: 15 }}>{v}</b>
                  <span style={{ display: "block", fontSize: 11, color: "#9ca3af" }}>{TYPE_ZH[k] ?? k}</span>
                </div>
              ))}
            </div>
            {analysis.health.findings.map((f, i) => (
              <div key={i} style={{ border: "1px solid #e5e7eb", borderLeft: `3px solid ${FIND_COLOR[f.kind] ?? "#6b7280"}`,
                                    borderRadius: 8, padding: "9px 11px", marginBottom: 6, background: "#fafafa" }}>
                <div style={{ fontSize: 13 }}>{f.message}</div>
                {(f.evidence ?? []).map((e, j) => (
                  <div key={j} style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>└ {e}</div>
                ))}
              </div>
            ))}
          </div>

          {/* ── 逐頁檢視 ───────────────────────────────────────────── */}
          <div style={card}>
            <div style={kicker}>STEP 3 · 逐頁確認每個區塊要填什麼</div>
            <div style={{ display: "grid", gridTemplateColumns: "104px minmax(0,1fr) 300px", gap: 12, marginTop: 10 }}>
              {/* page rail */}
              <div style={{ maxHeight: 520, overflowY: "auto", paddingRight: 4 }}>
                {analysis.reference.slides.map(sl => {
                  const n = (slotsByPage[sl.index] ?? []).length;
                  return (
                    <div key={sl.index} onClick={() => { setPage(sl.index); setSel(null); }}
                         style={{ position: "relative", aspectRatio: "16/9", marginBottom: 6, cursor: "pointer",
                                  border: `1px solid ${page === sl.index ? "#2563eb" : "#e5e7eb"}`,
                                  outline: page === sl.index ? "1px solid #2563eb" : "none",
                                  borderRadius: 5, background: "#fff", overflow: "hidden" }}>
                        {sl.shapes.slice(0, 22).map((sh, i) => (
                          <span key={i} style={{ position: "absolute", left: pct(sh.x, W), top: pct(sh.y, H),
                                                 width: pct(sh.w, W), height: pct(sh.h, H),
                                                 background: "#eef0f3", borderRadius: 1 }} />
                        ))}
                        {(slotsByPage[sl.index] ?? []).slice(0, 30).map((s, i) => (
                          <span key={i} style={{ position: "absolute", left: pct(s.ref!.x, W), top: pct(s.ref!.y, H),
                                                 width: pct(Math.max(s.ref!.w, 70000), W),
                                                 height: pct(Math.max(s.ref!.h, 70000), H),
                                                 background: TYPE_COLOR[s.type], opacity: 0.75, borderRadius: 1 }} />
                        ))}
                        <span style={{ position: "absolute", right: 2, bottom: 1, fontSize: 9, color: "#9ca3af",
                                       background: "rgba(255,255,255,.85)", padding: "0 3px", borderRadius: 3 }}>
                          {sl.index}{n ? ` · ${n}` : ""}
                        </span>
                    </div>
                  );
                })}
              </div>

              {/* schematic */}
              <div>
                <div style={{ position: "relative", aspectRatio: "1778/1000", border: "1px solid #e5e7eb",
                              borderRadius: 8, background: "#fff", overflow: "hidden" }}>
                  {outline?.shapes.map((sh, i) => (
                    <div key={i} style={{ position: "absolute", left: pct(sh.x, W), top: pct(sh.y, H),
                                          width: pct(sh.w, W), height: pct(sh.h, H),
                                          border: "1px solid #eef0f3", borderRadius: 3, overflow: "hidden",
                                          fontSize: 9, lineHeight: 1.25, color: "#6b7280", padding: "2px 3px",
                                          background: sh.kind === "picture" ? "#f8f9fa" : "transparent" }}>
                      {sh.kind === "table" ? `▦ ${sh.table?.rows}×${sh.table?.cols}`
                        : sh.kind === "chart" ? `▤ ${(sh.chart?.kind ?? "").replace("Chart", "")}`
                        : sh.text}
                    </div>
                  ))}
                  {pageSlots.map(s => (
                    <div key={s.id} onClick={() => setSel(s.id)} title={TYPE_ZH[s.type]}
                         style={{ position: "absolute", left: pct(s.ref!.x, W), top: pct(s.ref!.y, H),
                                  width: pct(Math.max(s.ref!.w, 40000), W),
                                  height: pct(Math.max(s.ref!.h, 40000), H),
                                  border: `1.5px solid ${TYPE_COLOR[s.type]}`, borderRadius: 3, cursor: "pointer",
                                  background: sel === s.id ? `${TYPE_COLOR[s.type]}33` : "transparent",
                                  boxShadow: sel === s.id ? `0 0 0 2px ${TYPE_COLOR[s.type]}` : "none" }} />
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
                  第 {page} 頁 · 依原檔真實座標繪製的示意圖（非像素縮圖）。點框看該欄位的設定。
                </div>
              </div>

              {/* inspector */}
              <div style={{ maxHeight: 520, overflowY: "auto" }}>
                <div style={kicker}>第 {page} 頁 · {pageSlots.length} 個欄位</div>
                {pageSlots.length === 0 && (
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
                    這頁沒有偵測到會變動的欄位 —— 全部都是每月固定的樣板內容。
                  </div>
                )}
                {pageSlots.map(s => (
                  <div key={s.id} onClick={() => setSel(s.id)}
                       style={{ border: `1px solid ${sel === s.id ? "#2563eb" : "#e5e7eb"}`, borderRadius: 8,
                                padding: "8px 10px", marginTop: 6, cursor: "pointer", background: "#fafafa" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: TYPE_COLOR[s.type] }} />
                      {s.ref?.shape || TYPE_ZH[s.type]}
                      <span style={{ marginLeft: "auto", fontSize: 10, color: "#9ca3af" }}>{s.stability}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
                      {s.observedValues?.[0]
                        ?? (s.type === "tableGroup" ? `${s.cardinality?.min}–${s.cardinality?.max} 項 · ${(s.fields ?? []).map(f => f.key).filter(Boolean).join("/")}`
                        : s.type === "chart" ? `${s.chartKind} · ${(s.series ?? []).map(x => x.name).join("/")}`
                        : s.type === "image" ? `${s.distinctImages ?? "?"} 個月各不相同 → 每月換圖`
                        : s.type === "marker" ? "位置隨排名移動" : "")}
                    </div>
                  </div>
                ))}

                {selected && (
                  <div style={{ border: "1px solid #2563eb", borderRadius: 8, padding: "10px 11px", marginTop: 12, background: "#fff" }}>
                    <div style={kicker}>欄位設定</div>
                    <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", marginTop: 6 }}>
                      <tbody>
                        <tr><td style={{ color: "#9ca3af", width: 68 }}>型別</td><td><b>{TYPE_ZH[selected.type]}</b></td></tr>
                        <tr><td style={{ color: "#9ca3af" }}>來源</td><td>{selected.ref?.shape}</td></tr>
                        <tr><td style={{ color: "#9ca3af" }}>跨月穩定</td><td>{selected.stability}</td></tr>
                        {selected.charBudget && (
                          <tr><td style={{ color: "#9ca3af" }}>字數上限</td>
                              <td><b>{selected.charBudget.max}</b> 字（各月 {(selected.charBudget.derivedFrom?.observed ?? []).join("/")}）</td></tr>
                        )}
                        {selected.cardinality && (
                          <tr><td style={{ color: "#9ca3af" }}>項目數</td>
                              <td><b>{selected.cardinality.min}～{selected.cardinality.max}</b> · 依實際資料筆數</td></tr>
                        )}
                        {selected.observedValues?.length && (
                          <tr><td style={{ color: "#9ca3af" }}>歷月實際值</td>
                              <td>{selected.observedValues.map((v, i) => <div key={i}>{v}</div>)}</td></tr>
                        )}
                      </tbody>
                    </table>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>
                      綁定資料來源（Meta / GA4 / 輿情 / GEO）與 AI 洞察撰寫在下一版開放。
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
