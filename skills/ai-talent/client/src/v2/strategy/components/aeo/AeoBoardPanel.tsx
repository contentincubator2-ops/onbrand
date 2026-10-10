/**
 * AeoBoardPanel — 策略層「AI 搜尋」tray：顧客問題地圖與覆蓋率。
 *
 * 2026-10-10（CJ「我需要有 AEO 專區嗎？」）。這裡不是另一個寫內容的地方，是看進度的板：
 * 顧客會拿去問 AI 的問題一題一列，三種狀態——還沒回答／已產出／已上架。
 *
 *   · 題目從哪來：請 AI 依品牌定位建議、自己加，或轉換貼文時自動補上。
 *   · 回答從哪來：任何一篇貼文的作品頁按「轉成 AI 搜尋版」→ 存到專案，就會連到這裡的題目。
 *   · 上架是用戶自己回來標的：我們只產文字，貼上官網之後 AI 才讀得到。
 *
 * 板上只有我們自己掌握的數字（幾題、幾題有回答、幾題上架），沒有「被 AI 引用幾次」——那個量不到。
 * 規則在 server strategy/core/brand/aeoQuestions.ts。
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { showToastGlobal } from "../../../platform/components/Toast";
import { friendlyError } from "../../../platform/lib/friendlyError";
import { HelpTip } from "../../../platform/components/HelpTip";
import { IllustratedEmpty } from "../../../platform/components/EmptyIllustration";
import { AddIcon, CheckIcon, CloseIcon, ExternalIcon, GenerateIcon } from "../../../platform/components/icons";

type Status = "open" | "answered" | "published";
interface Row {
  id: number; question: string; source: "ai" | "user" | "post"; status: Status;
  answerOutputId: number | null; publishedUrl: string | null;
}
type Filter = "all" | Status;

const btnGhost = "inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 text-[13px] font-medium text-neutral-800 transition hover:border-neutral-900 disabled:opacity-40";
const btnSolid = "inline-flex items-center gap-1.5 rounded-full border border-neutral-900 bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40";
const linkBtn = "text-[13px] text-neutral-500 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-40";

const statusLabel = (s: Status, en: boolean) =>
  s === "open" ? (en ? "Not answered" : "還沒回答") : s === "answered" ? (en ? "Written" : "已產出") : (en ? "Live" : "已上架");

/** 狀態點：空心＝還沒回答、灰＝已產出、黑＝已上架。只用墨色深淺，不加顏色。 */
function StatusDot({ status }: { status: Status }) {
  const cls = status === "open" ? "border border-neutral-400 bg-white"
    : status === "answered" ? "bg-neutral-400" : "bg-neutral-900";
  return <span aria-hidden className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}

export default function AeoBoardPanel({ brandId }: { brandId: number }) {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const T = trpc as any;
  const utils = T.useUtils();
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  /** 正在填上架網址的那一題。 */
  const [publishing, setPublishing] = useState<{ id: number; url: string } | null>(null);

  const listQ = T.aeoQuestion.list.useQuery({ brandId }, { refetchOnWindowFocus: true });
  const refresh = () => { try { utils.aeoQuestion.list.invalidate({ brandId }); } catch { /* noop */ } };
  const onErr = (e: any) => showToastGlobal(friendlyError(e, en ? "That didn't go through. Please try again." : "剛剛沒成功，再試一次。"), "error");

  const suggest = T.aeoQuestion.suggest.useMutation({
    onSuccess: (r: any) => {
      const n = r?.added?.length ?? 0;
      showToastGlobal(n ? (en ? `Added ${n} questions` : `加了 ${n} 題`) : (en ? "Nothing new to add" : "沒有新的題目可以加"), n ? "success" : undefined);
      refresh();
    },
    onError: onErr,
  });
  const add = T.aeoQuestion.add.useMutation({ onSuccess: () => { setDraft(""); refresh(); }, onError: onErr });
  const archive = T.aeoQuestion.archive.useMutation({ onSuccess: refresh, onError: onErr });
  const setPublished = T.aeoQuestion.setPublished.useMutation({
    onSuccess: () => { setPublishing(null); refresh(); },
    onError: onErr,
  });

  const rows: Row[] = listQ.data?.questions ?? [];
  const cov = listQ.data?.coverage ?? { total: 0, answered: 0, published: 0 };
  const counts = useMemo(() => ({
    all: rows.length,
    open: rows.filter((r) => r.status === "open").length,
    answered: rows.filter((r) => r.status === "answered").length,
    published: rows.filter((r) => r.status === "published").length,
  }), [rows]);
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const pct = (n: number) => (cov.total ? Math.round((n / cov.total) * 100) : 0);

  const submitDraft = () => { if (draft.trim().length >= 2 && !add.isPending) add.mutate({ brandId, question: draft.trim() }); };

  return (
    <div className="mx-auto max-w-[1040px] space-y-5 px-2">
      <header>
        <h2 className="flex items-center gap-1.5 text-[20px] font-semibold text-neutral-900">
          {en ? "AI search" : "AI 搜尋"}
          <HelpTip>
            {en
              ? "AI search engines (ChatGPT, Perplexity, Google's AI answers) mostly cite public web pages, YouTube and news, not social posts. This board lists the questions your customers would ask an AI and shows which ones your brand has an answer for. An answer only counts once it's live on your site. Whether an AI cites it can't be guaranteed."
              : "AI 搜尋（ChatGPT、Perplexity、Google 的 AI 答案）引用的多半是公開網頁、YouTube 與新聞，不是社群貼文。這塊板列出顧客會拿去問 AI 的問題，並顯示品牌已經回答了哪幾題。回答要貼上官網之後才算數；AI 會不會引用無法保證。"}
          </HelpTip>
        </h2>
      </header>

      {listQ.isLoading ? (
        <p className="py-10 text-center text-[14px] text-neutral-500">{en ? "Loading…" : "載入中…"}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200">
          <IllustratedEmpty
            kind="lens"
            title={en ? "No customer questions yet" : "還沒有顧客問題"}
            action={{ label: suggest.isPending ? (en ? "Thinking…" : "AI 正在想…") : (en ? "Ask AI to suggest questions" : "請 AI 建議問題"), onPress: () => { if (!suggest.isPending) suggest.mutate({ brandId }); } }}
          />
          <div className="mx-auto flex max-w-[520px] items-center gap-2 px-5 pb-8">
            <input value={draft} maxLength={120} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitDraft(); }}
              aria-label={en ? "Add your own question" : "自己加一題"} placeholder={en ? "Or type a question your customers ask" : "或自己寫一個顧客會問的問題"}
              className="min-w-0 flex-1 rounded-full border border-neutral-300 px-4 py-2 text-[14px] outline-none focus:border-neutral-900" />
            <button type="button" className={btnGhost} disabled={draft.trim().length < 2 || add.isPending} onClick={submitDraft}><AddIcon size={11} />{en ? "Add" : "加入"}</button>
          </div>
        </div>
      ) : (
        <>
          {/* 覆蓋率：三個數字＋一條進度。深色＝已上架，淺色＝已產出還沒上架。 */}
          <section className="rounded-2xl border border-neutral-200 px-5 py-4" aria-label={en ? "Coverage" : "覆蓋率"}>
            <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
              {[
                { n: cov.total, zh: "顧客會問的問題", e: "Customer questions" },
                { n: cov.answered, zh: `已產出回答（${pct(cov.answered)}%）`, e: `Answers written (${pct(cov.answered)}%)` },
                { n: cov.published, zh: `已上架官網（${pct(cov.published)}%）`, e: `Live on your site (${pct(cov.published)}%)` },
              ].map((x) => (
                <div key={x.zh}>
                  <p className="m-0 text-[28px] font-semibold leading-none text-neutral-900" style={{ fontVariantNumeric: "tabular-nums" }}>{x.n}</p>
                  <p className="m-0 mt-1.5 text-[13px] text-neutral-500">{en ? x.e : x.zh}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-neutral-100" role="img"
              aria-label={en ? `${cov.published} live, ${cov.answered - cov.published} written, ${cov.total - cov.answered} not answered` : `${cov.published} 題已上架、${cov.answered - cov.published} 題已產出、${cov.total - cov.answered} 題還沒回答`}>
              <span className="bg-neutral-900" style={{ width: `${pct(cov.published)}%` }} />
              <span className="bg-neutral-400" style={{ width: `${pct(cov.answered - cov.published)}%` }} />
            </div>
            <p className="m-0 mt-3 text-[13px] leading-relaxed text-neutral-500">
              {en
                ? "To answer one: open any post you've written and press \"Make an AI-search version\". Saving it links the answer here."
                : "怎麼回答：打開任何一篇寫好的貼文，按「轉成 AI 搜尋版」。存檔後回答會自動連到這裡的題目。"}
            </p>
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <input value={draft} maxLength={120} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitDraft(); }}
              aria-label={en ? "Add your own question" : "自己加一題"} placeholder={en ? "Add a question your customers ask" : "自己加一個顧客會問的問題"}
              className="min-w-[220px] flex-1 rounded-full border border-neutral-300 px-4 py-2 text-[14px] outline-none focus:border-neutral-900" />
            <button type="button" className={btnGhost} disabled={draft.trim().length < 2 || add.isPending} onClick={submitDraft}><AddIcon size={11} />{en ? "Add" : "加入"}</button>
            <button type="button" className={btnSolid} disabled={suggest.isPending} onClick={() => suggest.mutate({ brandId })}>
              <GenerateIcon size={12} />{suggest.isPending ? (en ? "Thinking…" : "AI 正在想…") : (en ? "Ask AI for more" : "請 AI 再建議")}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="tablist">
            {(["all", "open", "answered", "published"] as Filter[]).map((f) => {
              const on = filter === f;
              return (
                <button key={f} type="button" role="tab" aria-selected={on} onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition ${on ? "bg-neutral-900 text-white" : "border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"}`}>
                  {f === "all" ? (en ? "All" : "全部") : statusLabel(f, en)} {counts[f]}
                </button>
              );
            })}
          </div>

          {shown.length === 0 ? (
            <p className="rounded-2xl border border-neutral-200 px-5 py-8 text-center text-[14px] text-neutral-500">{en ? "Nothing in this group." : "這一類目前沒有題目。"}</p>
          ) : (
            <ul className="m-0 list-none divide-y divide-neutral-100 rounded-2xl border border-neutral-200 p-0">
              {shown.map((r) => (
                <li key={r.id} className="px-5 py-3.5">
                  <div className="flex items-start gap-3">
                    <StatusDot status={r.status} />
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-[15px] leading-snug text-neutral-900">{r.question}</p>
                      <p className="m-0 mt-1 text-[12.5px] text-neutral-500">
                        {statusLabel(r.status, en)}
                        {r.source === "post" && <span>{en ? " · added from a post" : "・從貼文補上的"}</span>}
                        {r.status === "published" && r.publishedUrl && (
                          <a href={r.publishedUrl} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 underline underline-offset-2 hover:text-neutral-900">
                            <ExternalIcon size={10} />{en ? "View page" : "看頁面"}
                          </a>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 pt-0.5">
                      {r.answerOutputId != null && (
                        <button type="button" className={linkBtn} onClick={() => navigate(`/run/${r.answerOutputId}`)}>{en ? "Open answer" : "打開回答"}</button>
                      )}
                      {r.status === "answered" && publishing?.id !== r.id && (
                        <button type="button" className={btnGhost} onClick={() => setPublishing({ id: r.id, url: "" })}><CheckIcon size={11} />{en ? "It's on my site" : "已貼上官網"}</button>
                      )}
                      {r.status === "published" && (
                        <button type="button" className={linkBtn} disabled={setPublished.isPending} onClick={() => setPublished.mutate({ id: r.id, published: false })}>{en ? "Not live anymore" : "取消上架"}</button>
                      )}
                      <button type="button" aria-label={en ? `Remove "${r.question}"` : `拿掉「${r.question}」`} title={en ? "Remove" : "拿掉這一題"}
                        className="text-neutral-400 hover:text-neutral-900 disabled:opacity-40" disabled={archive.isPending}
                        onClick={() => {
                          if (r.answerOutputId != null && !window.confirm(en ? "Remove this question? The answer stays in Projects." : "拿掉這一題？回答還會留在專案裡。")) return;
                          archive.mutate({ id: r.id });
                        }}><CloseIcon size={12} /></button>
                    </div>
                  </div>
                  {publishing?.id === r.id && (
                    <div className="ml-5 mt-2.5 flex flex-wrap items-center gap-2">
                      <input autoFocus value={publishing.url} maxLength={500} onChange={(e) => setPublishing({ id: r.id, url: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") setPublished.mutate({ id: r.id, published: true, url: publishing.url.trim() || undefined }); }}
                        aria-label={en ? "Page address (optional)" : "頁面網址（可不填）"} placeholder={en ? "Page address (optional)" : "頁面網址（可不填）"}
                        className="min-w-[220px] flex-1 rounded-full border border-neutral-300 px-4 py-1.5 text-[13.5px] outline-none focus:border-neutral-900" />
                      <button type="button" className={btnSolid} disabled={setPublished.isPending}
                        onClick={() => setPublished.mutate({ id: r.id, published: true, url: publishing.url.trim() || undefined })}>{en ? "Mark as live" : "標記上架"}</button>
                      <button type="button" className={linkBtn} onClick={() => setPublishing(null)}>{en ? "Cancel" : "取消"}</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
