/**
 * StrategyAlertsPanel — 策略監測：監測清單（品牌＋每個產品的關鍵字與競爭者）、
 * 掃描出來的策略提醒、以及「回工作台看哪個錨點」。
 *
 * 2026-09-08 (CJ「有一群人，策略層上，如果發現用戶有變化的時候，或是競爭者有變化
 * 的時候，會亮出情報，提醒用戶要調整策略。為他的品牌和產品，都設定好監測的機制」；
 * 「策略監測，定義在 9000 的方案」)
 *
 * 基礎方案看得到這個區塊，但只有一句話與升級入口 —— 它是專業方案的賣點，
 * 藏起來等於不存在。
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { showToastGlobal } from "../../../../components/ui/Toast";

interface Watch {
  id: number; scope: "brand" | "product"; scopeId: number;
  keywords: string[]; competitors: string[]; enabled: boolean;
  lastScanAt: string | null; lastScanNote: string | null; lastScanItems: number;
}
interface Alert {
  id: number; scope: "brand" | "product"; scopeId: number;
  kind: "competitor_move" | "audience_shift" | "market_trend";
  anchor: "audience" | "competition" | "differentiation" | "tagline" | "none";
  title: string; summary: string; suggestion: string;
  evidence: Array<{ title: string; url?: string; source?: string; publishedAt?: string }>;
  status: "new" | "seen" | "applied" | "dismissed"; createdAt: string;
}
interface Overview {
  locked: boolean; brandName: string; scanIntervalDays: number; manualCooldownHours: number;
  watches: Watch[]; alerts: Alert[]; productNames: Record<number, string>;
  lastScanAt: string | null; canScanNow: boolean;
}

const INK = "#171717";
const MUTED = "#737373";
const LINE = "#E5E5E5";

const KIND_ZH: Record<Alert["kind"], string> = { competitor_move: "競爭者動作", audience_shift: "受眾變化", market_trend: "市場趨勢" };
const KIND_EN: Record<Alert["kind"], string> = { competitor_move: "Competitor move", audience_shift: "Audience shift", market_trend: "Market trend" };
const ANCHOR_ZH: Record<Alert["anchor"], string> = { audience: "受眾錨點", competition: "競爭格局", differentiation: "差異化", tagline: "標語", none: "（不動錨點，先知道就好）" };
const ANCHOR_EN: Record<Alert["anchor"], string> = { audience: "audience anchor", competition: "competitive set", differentiation: "differentiation", tagline: "tagline", none: "(no anchor change, just be aware)" };

function fmt(iso: string | null, en: boolean): string {
  if (!iso) return en ? "never" : "還沒掃過";
  const d = new Date(iso);
  return d.toLocaleString(en ? "en-US" : "zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function noteText(note: string | null, en: boolean): string {
  if (!note) return "";
  if (note.startsWith("no_scout")) return en ? "Web research is not configured yet — ask SoWork to enable it." : "Web 市調尚未設定，請聯繫 SoWork 開通。";
  if (note.startsWith("no_items")) return en ? "Nothing relevant found in the last two weeks." : "這兩週沒掃到相關情報。";
  if (note.startsWith("ok")) return note.replace(/^ok：?/, "");
  if (note.startsWith("plan")) return en ? "Plan does not include monitoring." : "方案沒有策略監測。";
  return note;
}

const splitList = (s: string): string[] => s.split(/[,，、\n]/).map((x) => x.trim()).filter(Boolean);

export default function StrategyAlertsPanel({ brandId }: { brandId: number }) {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const utils = (trpc as any).useUtils?.();

  const q = (trpc as any).strategyMonitor?.overview?.useQuery
    ? (trpc as any).strategyMonitor.overview.useQuery({ brandId }, { staleTime: 30_000 })
    : { data: null, isLoading: false, refetch: () => {} };
  const data = q.data as Overview | null | undefined;

  const refetch = () => { try { utils?.strategyMonitor?.overview?.invalidate?.(); } catch { /* noop */ } q.refetch?.(); };
  const setWatch = (trpc as any).strategyMonitor?.setWatch?.useMutation?.({
    onSuccess: () => { showToastGlobal(en ? "Watch list saved" : "監測清單已儲存", "success"); refetch(); },
    onError: (e: any) => showToastGlobal(String(e?.message ?? "error"), "error"),
  });
  const scanNow = (trpc as any).strategyMonitor?.scanNow?.useMutation?.({
    onSuccess: (r: any) => {
      const created = (r?.results ?? []).reduce((a: number, x: any) => a + (x.created ?? 0), 0);
      showToastGlobal(en ? `Scan done · ${created} alerts` : `掃描完成 · ${created} 則提醒`, "success");
      refetch();
    },
    onError: (e: any) => showToastGlobal(String(e?.message ?? "error"), "error"),
  });
  const setStatus = (trpc as any).strategyMonitor?.setAlertStatus?.useMutation?.({ onSuccess: refetch });

  // 監測清單的編輯草稿（逗號分隔字串）
  const [draft, setDraft] = useState<Record<string, { keywords: string; competitors: string; enabled: boolean }>>({});
  useEffect(() => {
    if (!data?.watches) return;
    const next: typeof draft = {};
    for (const w of data.watches) next[`${w.scope}:${w.scopeId}`] = { keywords: w.keywords.join("、"), competitors: w.competitors.join("、"), enabled: w.enabled };
    setDraft(next);
  }, [data?.watches]);
  const [editing, setEditing] = useState(false);

  const alerts = useMemo(() => (data?.alerts ?? []).filter((a) => a.status !== "dismissed"), [data?.alerts]);

  if (q.isLoading || !data) return null;

  const scopeName = (w: { scope: string; scopeId: number }) =>
    w.scope === "brand" ? data.brandName : (data.productNames[w.scopeId] ?? `#${w.scopeId}`);

  if (data.locked) {
    return (
      <section style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: "#FFFFFF", padding: "14px 18px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: INK }}>{en ? "Strategy monitoring" : "策略監測"}</div>
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>
              {en
                ? "We watch your brand, products and competitors; when something shifts, an alert points you to the anchor to revisit. Included in the Professional plan."
                : "替你盯著品牌、產品與競爭者；有變化時亮出情報，指回該調整的錨點。專業方案內含。"}
            </div>
          </div>
          <button onClick={() => navigate("/pricing")} style={{ borderRadius: 999, border: `1px solid ${INK}`, background: INK, color: "#FFF", padding: "5px 14px", fontSize: 12.5, cursor: "pointer" }}>
            {en ? "See the Professional plan" : "看專業方案"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: "#FFFFFF", padding: "14px 18px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: INK }}>{en ? "Strategy monitoring" : "策略監測"}</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>
            {en
              ? `Last scan: ${fmt(data.lastScanAt, en)} · automatic every ${data.scanIntervalDays} days`
              : `上次掃描：${fmt(data.lastScanAt, en)} · 每 ${data.scanIntervalDays} 天自動掃一次`}
            {data.watches[0]?.lastScanNote ? ` · ${noteText(data.watches[0].lastScanNote, en)}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setEditing((v) => !v)} style={{ borderRadius: 999, border: `1px solid ${INK}`, background: "#FFF", color: INK, padding: "4px 12px", fontSize: 12.5, cursor: "pointer" }}>
            {editing ? (en ? "Done" : "收起清單") : (en ? "Watch list" : "監測清單")}
          </button>
          <button
            disabled={!data.canScanNow || scanNow?.isPending}
            onClick={() => scanNow?.mutate?.({ brandId })}
            title={data.canScanNow ? "" : (en ? `Manual scan once every ${data.manualCooldownHours}h` : `手動掃描每 ${data.manualCooldownHours} 小時一次`)}
            style={{ borderRadius: 999, border: `1px solid ${INK}`, background: data.canScanNow ? INK : "#FFF", color: data.canScanNow ? "#FFF" : MUTED, padding: "4px 12px", fontSize: 12.5, cursor: data.canScanNow ? "pointer" : "not-allowed", opacity: scanNow?.isPending ? 0.6 : 1 }}
          >
            {scanNow?.isPending ? (en ? "Scanning…" : "掃描中…") : (en ? "Scan now" : "立即掃描")}
          </button>
        </div>
      </div>

      {editing && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {data.watches.map((w) => {
            const k = `${w.scope}:${w.scopeId}`;
            const d = draft[k] ?? { keywords: "", competitors: "", enabled: true };
            return (
              <div key={k} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>
                    {w.scope === "brand" ? (en ? "Brand · " : "品牌 · ") : (en ? "Product · " : "產品 · ")}{scopeName(w)}
                  </div>
                  <label style={{ fontSize: 12, color: MUTED, display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={d.enabled} onChange={(e) => setDraft({ ...draft, [k]: { ...d, enabled: e.target.checked } })} />
                    {en ? "watching" : "監測中"}
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                  <label style={{ fontSize: 12, color: MUTED }}>
                    {en ? "Keywords" : "關鍵字"}
                    <textarea value={d.keywords} onChange={(e) => setDraft({ ...draft, [k]: { ...d, keywords: e.target.value } })} rows={2}
                      style={{ width: "100%", marginTop: 4, fontSize: 13, padding: "6px 8px", border: `1px solid ${LINE}`, borderRadius: 6, fontFamily: "inherit" }} />
                  </label>
                  <label style={{ fontSize: 12, color: MUTED }}>
                    {en ? "Competitors" : "競爭者"}
                    <textarea value={d.competitors} onChange={(e) => setDraft({ ...draft, [k]: { ...d, competitors: e.target.value } })} rows={2}
                      style={{ width: "100%", marginTop: 4, fontSize: 13, padding: "6px 8px", border: `1px solid ${LINE}`, borderRadius: 6, fontFamily: "inherit" }} />
                  </label>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                  <button
                    disabled={setWatch?.isPending}
                    onClick={() => setWatch?.mutate?.({ brandId, scope: w.scope, scopeId: w.scopeId, keywords: splitList(d.keywords), competitors: splitList(d.competitors), enabled: d.enabled })}
                    style={{ borderRadius: 999, border: `1px solid ${INK}`, background: "#FFF", color: INK, padding: "3px 10px", fontSize: 12, cursor: "pointer" }}
                  >
                    {en ? "Save" : "儲存"}
                  </button>
                </div>
              </div>
            );
          })}
          <p style={{ margin: 0, fontSize: 12, color: MUTED }}>
            {en ? "Separate items with commas. Lists were pre-filled from your positioning." : "用逗號分隔。清單一開始是從你的定位自動帶出來的。"}
          </p>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {alerts.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
            {en
              ? "No alerts yet. Alerts appear only when something actually shifts; quiet is a valid result."
              : "目前沒有提醒。只有真的有變化才會出現，安靜是正常的結果。"}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {alerts.map((a) => (
              <article key={a.id} style={{ border: `1px solid ${a.status === "new" ? INK : LINE}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: MUTED }}>
                  <span style={{ borderRadius: 999, border: `1px solid ${LINE}`, padding: "1px 8px", color: INK }}>{en ? KIND_EN[a.kind] : KIND_ZH[a.kind]}</span>
                  <span>{scopeName(a)}</span>
                  <span>·</span>
                  <span>{fmt(a.createdAt, en)}</span>
                  {a.status === "new" && <span style={{ color: INK, fontWeight: 600 }}>{en ? "new" : "未讀"}</span>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginTop: 6 }}>{a.title}</div>
                {a.summary && <p style={{ margin: "4px 0 0", fontSize: 13, color: INK, lineHeight: 1.6 }}>{a.summary}</p>}
                {a.suggestion && (
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: INK, lineHeight: 1.6 }}>
                    <span style={{ color: MUTED }}>{en ? "Suggestion: " : "建議："}</span>{a.suggestion}
                  </p>
                )}
                {a.evidence?.length > 0 && (
                  <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
                    {a.evidence.map((e, i) => (
                      <li key={i}>
                        {e.url ? <a href={e.url} target="_blank" rel="noreferrer" style={{ color: INK, textDecoration: "underline" }}>{e.title}</a> : e.title}
                        {e.source ? ` · ${e.source}` : ""}{e.publishedAt ? ` · ${e.publishedAt}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, color: INK }}>
                    {en ? `Revisit in the workbench: ${ANCHOR_EN[a.anchor]}` : `回工作台看：${ANCHOR_ZH[a.anchor]}`}
                  </span>
                  <span style={{ flex: 1 }} />
                  {a.status === "new" && (
                    <button onClick={() => setStatus?.mutate?.({ id: a.id, status: "seen" })} style={{ fontSize: 12, background: "none", border: 0, color: MUTED, cursor: "pointer", textDecoration: "underline" }}>
                      {en ? "Mark read" : "已讀"}
                    </button>
                  )}
                  {a.status !== "applied" && (
                    <button onClick={() => setStatus?.mutate?.({ id: a.id, status: "applied" })} style={{ fontSize: 12, background: "none", border: 0, color: MUTED, cursor: "pointer", textDecoration: "underline" }}>
                      {en ? "Adjusted" : "已調整"}
                    </button>
                  )}
                  <button onClick={() => setStatus?.mutate?.({ id: a.id, status: "dismissed" })} style={{ fontSize: 12, background: "none", border: 0, color: MUTED, cursor: "pointer", textDecoration: "underline" }}>
                    {en ? "Dismiss" : "忽略"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
