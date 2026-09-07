/**
 * AdminPostFormatsPage — 貼文形式候選佇列的審核台。
 *
 * 2026-08-23 (CJ「安排定期任務掃描當地熱門的 facebook 貼文，補充為 task」
 * ＋「候選佇列，你審核後才建卡」)
 *
 * 每月 1 號的 op-scan-post-formats.yml 掃各市場的 FB 高互動貼文，歸納出現有
 * 37 張卡沒覆蓋的「形式」寫進這裡。這一頁做的是判斷，不是建卡 —— 核准的意思
 * 是「這個形式值得開卡」，開卡本身要動 5 個檔案還要跑 probe E2E（30s SOP：
 * 失敗不上線），做完回來按「已開卡」填 task id 把佇列跟目錄接起來。
 *
 * 兩個分頁刻意分開，因為混在一起是這條流程最容易犯的錯：
 *   形式 —— 可重複的結構，這才是開卡的對象
 *   題材 —— 這個月大家在講什麼，拿去餵 fb-99-trend-rewrite / viral-rewrite
 *
 * Gated by adminProcedure server-side — non-admins get FORBIDDEN.
 */
import { useState } from "react";
import { trpc } from "../../../lib/trpc";
import { AlertTriangle, ExternalLink, RefreshCw, Check, X, Package } from "lucide-react";

type Kind = "format" | "topic";
type Status = "pending" | "approved" | "rejected" | "shipped";

interface Evidence { title: string; url: string; observedAt?: string }
interface CandidateRow {
  id: number;
  platform: string;
  market: string;
  language: string | null;
  kind: Kind;
  name: string;
  nameEn: string | null;
  mechanism: string | null;
  whyItWorks: string | null;
  evidence: Evidence[];
  duplicateOf: string | null;
  status: Status;
  seenCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  reviewNote: string | null;
  shippedTaskId: string | null;
}

const STATUS_META: Record<Status, { label: string; color: string; bg: string }> = {
  pending:  { label: "待審",   color: "#92400E", bg: "#FEF3C7" },
  approved: { label: "已核准", color: "#065F46", bg: "#D1FAE5" },
  rejected: { label: "已否決", color: "#525252", bg: "#F5F5F5" },
  shipped:  { label: "已開卡", color: "#3730A3", bg: "#E0E7FF" },
};

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

export default function AdminPostFormatsPage() {
  const [kind, setKind] = useState<Kind>("format");
  const [status, setStatus] = useState<Status | "all">("pending");
  const [market, setMarket] = useState<string>("");

  const listQ = (trpc as any).postFormat?.list?.useQuery?.(
    {
      kind,
      status: status === "all" ? undefined : status,
      market: market || undefined,
      limit: 150,
    },
    { refetchOnWindowFocus: false },
  );
  const utils = (trpc as any).useUtils?.() ?? null;
  const setStatusM = (trpc as any).postFormat?.setStatus?.useMutation?.({
    onSuccess: () => utils?.postFormat?.list?.invalidate?.(),
  });

  const data = listQ?.data ?? null;
  const items: CandidateRow[] = data?.items ?? [];
  const isLoading = !!listQ?.isLoading;
  const isAdmin = listQ?.error?.data?.code !== "FORBIDDEN";

  const countOf = (s: Status) =>
    (data?.counts ?? [])
      .filter((c: any) => c.status === s && c.kind === kind)
      .reduce((a: number, c: any) => a + c.n, 0);

  if (!isAdmin && !isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
        <div className="text-center max-w-md">
          <AlertTriangle size={32} className="mx-auto mb-3 text-neutral-500" />
          <p className="text-base font-semibold text-neutral-900 mb-1">需要管理員權限</p>
          <p className="text-sm text-neutral-600">
            貼文形式佇列僅限管理員。請聯絡 SoWork 把你帳號的 role 設為 admin。
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
            ADMIN · POST FORMAT QUEUE
          </p>
          <h1
            className="font-bold tracking-tight leading-none text-neutral-900 mb-3"
            style={{ fontSize: "clamp(1.5rem, 2.6vw, 2rem)" }}
          >
            貼文形式候選
          </h1>
          <p
            className="text-default-700"
            style={{
              fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
              fontStyle: "italic", fontSize: 14, lineHeight: 1.7, maxWidth: 660,
            }}
          >
            每月 1 號自動掃描各市場的 FB 高互動貼文 · 只列出現有任務卡還沒覆蓋的形式 ·
            核准後再照 SOP 開卡，開完回來填 task id
          </p>
        </div>

        {/* Kind switch — 形式 vs 題材 */}
        <div className="flex items-center gap-2 mb-5">
          {(["format", "topic"] as Kind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className="px-3.5 py-2 rounded-lg text-sm font-medium transition-all"
              style={
                kind === k
                  ? { background: "#171717", color: "white" }
                  : { background: "white", color: "#525252", border: "1px solid #E5E5E5" }
              }
            >
              {k === "format" ? "形式 — 開卡對象" : "題材 — 餵 rewrite 卡"}
            </button>
          ))}
          <div className="flex-1" />
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="px-3 py-2 rounded-lg border border-neutral-300 text-sm text-neutral-700 bg-white"
          >
            <option value="">全部市場</option>
            {(data?.markets ?? []).map((m: any) => (
              <option key={m.market} value={m.market}>{m.market}（{m.n}）</option>
            ))}
          </select>
          <button
            onClick={() => listQ?.refetch?.()}
            className="px-3 py-2 rounded-lg border border-neutral-300 hover:border-neutral-900 text-xs text-neutral-700 flex items-center gap-1.5"
          >
            <RefreshCw size={12} /> 重新整理
          </button>
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 mb-5 border-b border-neutral-300">
          {(["pending", "approved", "shipped", "rejected", "all"] as (Status | "all")[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-2 text-sm font-medium transition border-b-2 ${
                status === s
                  ? "border-neutral-900 text-neutral-900"
                  : "border-transparent text-neutral-600 hover:text-neutral-900"
              }`}
            >
              {s === "all" ? "全部" : STATUS_META[s].label}
              {s !== "all" && (
                <span className="ml-1.5 text-[12px] tabular-nums text-neutral-500">
                  {countOf(s)}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 2026-08-23 (CJ「每一個新增的 facebook 貼文任務，agent 的設計都要按照
            真實人物設計，system prompt 不少於 2200 個字」): 這條規則要在做決定的
            地方看得到，不能只寫在 SOP 文件裡 —— tier 詞彙那條規則就是因為只活在
            一行註解裡，同一個檔案自己漂出三種寫法。 */}
        {kind === "format" && (
          <div
            className="mb-5 rounded-xl px-4 py-3 text-sm leading-relaxed"
            style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#78350F" }}
          >
            <span className="font-semibold">核准之後開卡的硬標準：</span>
            這張卡綁的 agent 必須<span className="font-semibold">按照真實人物設計</span>，
            system prompt 不少於 <span className="font-semibold tabular-nums">2200 字</span>——
            要有具體的口頭禪、句型、立場，不是「專業／親切／溫暖」堆字數。
            <span className="block mt-1 text-[13px] opacity-80">
              字數可稽核：<code className="font-mono">npm run db:audit-fb-personas -- --posts</code>；
              「像不像真人」機器驗不了，加 <code className="font-mono">--show</code> 自己讀。
            </span>
          </div>
        )}

        {isLoading && <p className="text-sm text-neutral-500 py-10 text-center">載入中…</p>}

        {!isLoading && items.length === 0 && (
          <div className="bg-white border border-neutral-200 rounded-xl p-10 text-center">
            <Package size={28} className="mx-auto mb-3 text-neutral-400" />
            <p className="text-sm font-medium text-neutral-900 mb-1">這個分頁沒有候選</p>
            <p className="text-sm text-neutral-600 max-w-md mx-auto leading-relaxed">
              {kind === "format"
                ? "掃不到新形式是正常的 — 貼文形式是有限集合，不會每個月都長新的。真正每月都有的是題材，切到隔壁分頁看。"
                : "還沒有掃到題材。題材是拿去餵 fb-99-trend-rewrite / fb-99-viral-rewrite 的素材，不是開卡的對象。"}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {items.map((row) => (
            <div key={row.id} className="bg-white border border-neutral-200 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span
                      className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background: STATUS_META[row.status].bg,
                        color: STATUS_META[row.status].color,
                      }}
                    >
                      {STATUS_META[row.status].label}
                    </span>
                    <span className="text-[12px] font-semibold text-neutral-500 tracking-wide">
                      {row.market}
                    </span>
                    {row.seenCount > 1 && (
                      // 跨月重複出現 = 這個形式沒有消失。被否決過但一直回來的，
                      // 是值得重新考慮的訊號。
                      <span className="text-[12px] text-neutral-500 tabular-nums">
                        掃到 {row.seenCount} 次
                      </span>
                    )}
                    {row.duplicateOf && (
                      <span className="text-[12px] text-neutral-500">
                        已有卡：<code className="font-mono">{row.duplicateOf}</code>
                      </span>
                    )}
                    {row.shippedTaskId && (
                      <span className="text-[12px] text-indigo-700">
                        已開：<code className="font-mono">{row.shippedTaskId}</code>
                      </span>
                    )}
                  </div>

                  <p className="text-base font-semibold text-neutral-900 leading-snug">
                    {row.name}
                  </p>
                  {row.nameEn && (
                    <p className="text-xs text-neutral-500 mb-2">{row.nameEn}</p>
                  )}

                  {row.mechanism && (
                    <p className="text-sm text-neutral-700 leading-relaxed mt-2">
                      <span className="text-neutral-500">結構：</span>{row.mechanism}
                    </p>
                  )}
                  {row.whyItWorks && (
                    <p className="text-sm text-neutral-700 leading-relaxed mt-1">
                      <span className="text-neutral-500">為何有效：</span>{row.whyItWorks}
                    </p>
                  )}

                  {/* 佐證 — 每一筆都必須有可連結的來源，否則掃描階段就已丟棄 */}
                  {row.evidence.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1">
                      {row.evidence.map((e, i) => (
                        <a
                          key={i}
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-neutral-600 hover:text-neutral-900 flex items-center gap-1.5 min-w-0"
                        >
                          <ExternalLink size={11} className="shrink-0" />
                          <span className="truncate">{e.title}</span>
                          {e.observedAt && (
                            <span className="text-neutral-400 shrink-0">{e.observedAt}</span>
                          )}
                        </a>
                      ))}
                    </div>
                  )}

                  <p className="text-[12px] text-neutral-400 mt-3">
                    首次 {fmtDate(row.firstSeenAt)} · 最近 {fmtDate(row.lastSeenAt)}
                  </p>
                  {row.reviewNote && (
                    <p className="text-xs text-neutral-500 mt-1 italic">{row.reviewNote}</p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5 shrink-0">
                  {row.status !== "approved" && (
                    <button
                      onClick={() => setStatusM?.mutate?.({ id: row.id, status: "approved" })}
                      className="px-3 py-1.5 rounded-md text-xs font-medium border border-emerald-300 text-emerald-800 hover:bg-emerald-50 flex items-center gap-1.5"
                    >
                      <Check size={12} /> 值得開卡
                    </button>
                  )}
                  {row.status === "approved" && (
                    <button
                      onClick={() => {
                        const id = globalThis.prompt("開好的 task id（例：fb-30-howto-steps）");
                        if (id?.trim()) {
                          setStatusM?.mutate?.({
                            id: row.id, status: "shipped", shippedTaskId: id.trim(),
                          });
                        }
                      }}
                      className="px-3 py-1.5 rounded-md text-xs font-medium border border-indigo-300 text-indigo-800 hover:bg-indigo-50 flex items-center gap-1.5"
                    >
                      <Package size={12} /> 已開卡…
                    </button>
                  )}
                  {row.status !== "rejected" && (
                    <button
                      onClick={() => {
                        const note = globalThis.prompt("否決原因（選填，之後看得到）") ?? undefined;
                        setStatusM?.mutate?.({ id: row.id, status: "rejected", note });
                      }}
                      className="px-3 py-1.5 rounded-md text-xs font-medium border border-neutral-300 text-neutral-700 hover:bg-neutral-50 flex items-center gap-1.5"
                    >
                      <X size={12} /> 不開
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
