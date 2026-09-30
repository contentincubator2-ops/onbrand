/**
 * StrategyAlertsPanel — 策略監測：監測清單（品牌＋每個產品的關鍵字與競爭者）、
 * 掃描出來的策略提醒、以及「回頭看哪一張定位卡」。
 *
 * 2026-09-08 (CJ「有一群人，策略層上，如果發現用戶有變化的時候，或是競爭者有變化
 * 的時候，會亮出情報，提醒用戶要調整策略。為他的品牌和產品，都設定好監測的機制」；
 * 「策略監測，定義在 9000 的方案」)
 *
 * 2026-09-09（CJ「版面編排不好看」）：改成 TaskPicker／CardDetailDrawer 同一套
 * 手刻系統（neutral-* Tailwind、單色、rounded-xl／rounded-lg、font-mono 標
 * 日期）。狀態只用墨色深淺分（new＝墨色邊框，其餘＝淺灰邊框），不另外配色。
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
  evidence: Array<{ title: string; url?: string; source?: string; publishedAt?: string | null }>;
  status: "new" | "seen" | "applied" | "dismissed"; createdAt: string;
}
interface Overview {
  locked: boolean; brandName: string; scanIntervalDays: number; manualCooldownHours: number;
  watches: Watch[]; alerts: Alert[]; productNames: Record<number, string>;
  lastScanAt: string | null; canScanNow: boolean;
}

const KIND_ZH: Record<Alert["kind"], string> = { competitor_move: "競爭者動作", audience_shift: "受眾變化", market_trend: "市場趨勢" };
const KIND_EN: Record<Alert["kind"], string> = { competitor_move: "Competitor move", audience_shift: "Audience shift", market_trend: "Market trend" };
/**
 * 2026-09-30（CJ「不用寫著對應定位卡，然後，要寫掃描時間，但 AI Reporting 旁邊要寫的，
 * 應該是原文發布時間」）：標題列的時間＝原文發布日（evidence 裡最新的一則），
 * 掃描時間移到卡片底部。發布日由伺服器回原文網頁讀（publishedDate.ts），讀不到就寫不明。
 */
function pubDate(ymd: string, en: boolean): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const sameYear = y === new Date().getFullYear();
  if (en) return sameYear ? `${m}/${d}` : `${m}/${d}/${y}`;
  return sameYear ? `${m}/${d}` : `${y}/${m}/${d}`;
}
function latestPublished(a: Alert): string | null {
  const ds = a.evidence.map((e) => e.publishedAt).filter((x): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x));
  return ds.length ? ds.sort().at(-1)! : null;
}

function fmt(iso: string | null, en: boolean): string {
  if (!iso) return en ? "never" : "還沒掃過";
  const d = new Date(iso);
  return d.toLocaleString(en ? "en-US" : "zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function noteText(note: string | null, en: boolean): string {
  if (!note) return "";
  if (note.startsWith("no_scout")) return en ? "Web research is not configured yet — ask SoWork to enable it." : "Web 市調尚未設定，請聯繫 SoWork 開通。";
  if (note.startsWith("no_items")) return en ? "Nothing relevant found in the last 7 days." : "這 7 天沒掃到相關情報。";
  // 2026-09-30 只收確定 7 天內的新聞：有抓到東西，但都是舊文或讀不到日期。
  if (note.startsWith("no_fresh")) return en ? "Found items, but none were news published in the last 7 days." : "有掃到資料，但沒有確定是近 7 天發布的新聞。";
  if (note.startsWith("ok")) return note.replace(/^ok：?/, "");
  if (note.startsWith("plan")) return en ? "Plan does not include monitoring." : "方案沒有策略監測。";
  return note;
}

const splitList = (s: string): string[] => s.split(/[,，、\n]/).map((x) => x.trim()).filter(Boolean);
// 2026-09-23 (CJ「策略監測的按鈕再小一點，我想讓底下的策略卡片更明顯」)：
// 監測清單／立即掃描縮小一號——這張卡是輔助功能，不該跟下面的定位卡片
// 搶視覺重量。
const btnGhost = "rounded-full border border-neutral-900 px-2.5 py-0.5 text-[11px] font-medium text-neutral-900 transition hover:bg-neutral-900 hover:text-white";
const btnGhostDisabled = "rounded-full border border-neutral-300 px-2.5 py-0.5 text-[11px] font-medium text-neutral-400";

export default function StrategyAlertsPanel({ brandId }: { brandId: number }) {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const utils = (trpc as any).useUtils?.();

  const q = (trpc as any).strategyMonitor?.overview?.useQuery
    ? (trpc as any).strategyMonitor.overview.useQuery({ brandId }, { staleTime: 30_000 })
    : { data: null, isLoading: false, refetch: () => {} };
  const data = q.data as Overview | null | undefined;

  // unreadSummary 是側欄「品牌」圖示的數字與左下角通知的來源——標已讀／掃描後一起刷新，數字才會跟著變。
  const refetch = () => {
    try { utils?.strategyMonitor?.overview?.invalidate?.(); utils?.strategyMonitor?.unreadSummary?.invalidate?.(); } catch { /* noop */ }
    q.refetch?.();
  };
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
      <section className="mb-3 rounded-xl border border-neutral-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[14.5px] font-semibold text-neutral-900">{en ? "Strategy monitoring" : "策略監測"}</h3>
            <p className="mt-1 max-w-[520px] text-[12.5px] leading-relaxed text-neutral-500">
              {en
                ? "We watch your brand, products and competitors; when something shifts, an alert points you to the anchor to revisit. Included in the Professional plan."
                : "替你盯著品牌、產品與競爭者；有變化時亮出情報，指回該調整的錨點。專業方案內含。"}
            </p>
          </div>
          <button onClick={() => navigate("/pricing")} className="rounded-full bg-neutral-900 px-3 py-1 text-[11.5px] font-medium text-white hover:bg-neutral-800">
            {en ? "See the Professional plan" : "看專業方案"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-3 rounded-xl border border-neutral-200 bg-white px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[14.5px] font-semibold text-neutral-900">{en ? "Strategy monitoring" : "策略監測"}</h3>
          <p className="mt-1 font-mono text-[12px] tabular-nums text-neutral-500">
            {en ? `Last scan ${fmt(data.lastScanAt, en)} · auto every ${data.scanIntervalDays}d` : `上次掃描 ${fmt(data.lastScanAt, en)} · 每 ${data.scanIntervalDays} 天自動掃一次`}
          </p>
          {data.watches[0]?.lastScanNote && (
            <p className="mt-0.5 text-[12px] text-neutral-400">{noteText(data.watches[0].lastScanNote, en)}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* 2026-09-30（CJ「立即掃描功能，無法按下」）：手動掃描 24 小時一次是成本線，但原因
              只放在滑鼠移上去的 title，按鈕看起來像壞掉。直接寫出什麼時候可以再掃。 */}
          {!data.canScanNow && data.lastScanAt && (
            <span className="text-[11px] text-neutral-400">
              {en ? "Next manual scan " : "下次可掃描 "}
              {fmt(new Date(new Date(data.lastScanAt).getTime() + data.manualCooldownHours * 3_600_000).toISOString(), en)}
            </span>
          )}
          <button onClick={() => setEditing((v) => !v)} className={btnGhost}>
            {editing ? (en ? "Done" : "收起清單") : (en ? "Watch list" : "監測清單")}
          </button>
          <button
            disabled={!data.canScanNow || scanNow?.isPending}
            onClick={() => scanNow?.mutate?.({ brandId })}
            title={data.canScanNow ? "" : (en ? `Manual scan once every ${data.manualCooldownHours}h` : `手動掃描每 ${data.manualCooldownHours} 小時一次`)}
            className={data.canScanNow ? btnGhost : btnGhostDisabled}
          >
            {scanNow?.isPending ? (en ? "Scanning…" : "掃描中…") : (en ? "Scan now" : "立即掃描")}
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-4 flex flex-col gap-3">
          {data.watches.map((w) => {
            const k = `${w.scope}:${w.scopeId}`;
            const d = draft[k] ?? { keywords: "", competitors: "", enabled: true };
            return (
              <div key={k} className="rounded-lg border border-neutral-200 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-neutral-900">
                    {w.scope === "brand" ? (en ? "Brand · " : "品牌 · ") : (en ? "Product · " : "產品 · ")}{scopeName(w)}
                  </p>
                  <label className="flex items-center gap-1.5 text-[12px] text-neutral-500">
                    <input type="checkbox" checked={d.enabled} onChange={(e) => setDraft({ ...draft, [k]: { ...d, enabled: e.target.checked } })} />
                    {en ? "watching" : "監測中"}
                  </label>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="text-[12px] text-neutral-500">
                    {en ? "Keywords" : "關鍵字"}
                    <textarea value={d.keywords} onChange={(e) => setDraft({ ...draft, [k]: { ...d, keywords: e.target.value } })} rows={2}
                      className="mt-1 w-full rounded-md border border-neutral-200 px-2 py-1.5 text-[13px] text-neutral-800 outline-none focus:border-neutral-500" />
                  </label>
                  <label className="text-[12px] text-neutral-500">
                    {en ? "Competitors" : "競爭者"}
                    <textarea value={d.competitors} onChange={(e) => setDraft({ ...draft, [k]: { ...d, competitors: e.target.value } })} rows={2}
                      className="mt-1 w-full rounded-md border border-neutral-200 px-2 py-1.5 text-[13px] text-neutral-800 outline-none focus:border-neutral-500" />
                  </label>
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    disabled={setWatch?.isPending}
                    onClick={() => setWatch?.mutate?.({ brandId, scope: w.scope, scopeId: w.scopeId, keywords: splitList(d.keywords), competitors: splitList(d.competitors), enabled: d.enabled })}
                    className="rounded-full border border-neutral-300 px-2.5 py-1 text-[12px] text-neutral-700 hover:border-neutral-900 hover:text-neutral-900"
                  >
                    {en ? "Save" : "儲存"}
                  </button>
                </div>
              </div>
            );
          })}
          <p className="text-[12px] text-neutral-400">
            {en ? "Separate items with commas. Lists were pre-filled from your positioning." : "用逗號分隔。清單一開始是從你的定位自動帶出來的。"}
          </p>
        </div>
      )}

      <div className="mt-4">
        {alerts.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-neutral-500">
            {en ? "All calm — nothing needs you" : "一切平靜，沒有要處理的事"}
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {alerts.map((a) => (
              <article key={a.id} className={`rounded-lg border px-3.5 py-3 ${a.status === "new" ? "border-neutral-900" : "border-neutral-200"}`}>
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-neutral-500">
                  <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-neutral-700">{en ? KIND_EN[a.kind] : KIND_ZH[a.kind]}</span>
                  <span>{scopeName(a)}</span>
                  {(() => {
                    const p = latestPublished(a);
                    return p
                      ? <span className="font-mono tabular-nums" title={en ? "Original publish date" : "原文發布日"}>{en ? `Published ${pubDate(p, en)}` : `原文 ${pubDate(p, en)}`}</span>
                      : <span className="text-neutral-400">{en ? "Publish date unknown" : "原文發布日不明"}</span>;
                  })()}
                  {a.status === "new" && <span className="font-medium text-neutral-900">{en ? "new" : "未讀"}</span>}
                </div>
                <p className="mt-1.5 text-[14px] font-semibold text-neutral-900">{a.title}</p>
                {a.summary && <p className="mt-1 text-[13px] leading-relaxed text-neutral-700">{a.summary}</p>}
                {a.suggestion && (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-700">
                    <span className="text-neutral-400">{en ? "Suggestion: " : "建議："}</span>{a.suggestion}
                  </p>
                )}
                {a.evidence?.length > 0 && (
                  <ul className="mt-1.5 flex flex-col gap-0.5 pl-4 text-[12px] leading-relaxed text-neutral-400" style={{ listStyle: "disc" }}>
                    {a.evidence.map((e, i) => (
                      <li key={i}>
                        {e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="text-neutral-700 underline underline-offset-2">{e.title}</a> : e.title}
                        {e.source ? ` · ${e.source}` : ""}
                        {e.publishedAt && <span className="font-mono"> · {pubDate(e.publishedAt, en)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2.5 flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-2">
                  <span className="font-mono tabular-nums text-[12px] text-neutral-400">
                    {en ? `Scanned ${fmt(a.createdAt, en)}` : `掃描 ${fmt(a.createdAt, en)}`}
                  </span>
                  <span className="flex-1" />
                  {a.status === "new" && (
                    <button onClick={() => setStatus?.mutate?.({ id: a.id, status: "seen" })} className="text-[12px] text-neutral-400 underline underline-offset-2 hover:text-neutral-700">
                      {en ? "Mark read" : "已讀"}
                    </button>
                  )}
                  {a.status !== "applied" && (
                    <button onClick={() => setStatus?.mutate?.({ id: a.id, status: "applied" })} className="text-[12px] text-neutral-400 underline underline-offset-2 hover:text-neutral-700">
                      {en ? "Adjusted" : "已調整"}
                    </button>
                  )}
                  <button onClick={() => setStatus?.mutate?.({ id: a.id, status: "dismissed" })} className="text-[12px] text-neutral-400 underline underline-offset-2 hover:text-neutral-700">
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
