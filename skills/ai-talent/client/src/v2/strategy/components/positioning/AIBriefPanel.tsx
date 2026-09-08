/**
 * AIBriefPanel — 「AI 讀到的品牌簡報」：每張任務卡開跑前塞進模型的那段字，
 * 攤開給用戶看，每一行對回它來自定位的哪一格；缺的格列在下面。
 *
 * 2026-09-08 (CJ「品牌大腦也可以參考任務卡一樣，用戶可以自己上傳自己的文件，
 * 我們顯示出幫他把定位化為 AI 讀懂的文字的過程，不一定要用我們的定位方法論」)
 *
 * 2026-09-09（CJ「版面編排不好看」）：改成 TaskPicker／CardDetailDrawer 同一套
 * 手刻系統（neutral-* Tailwind、單色、rounded-xl／rounded-lg、font-mono
 * 標數字）。原本每一行都是獨立表格列（label 欄＋分隔線），15 行下來像資料庫
 * 匯出；改成每個段落一個群組、群組內只用行距分開，不再逐行畫線。
 *
 * 這個面板的主張只有一句：簡報裡有的，模型就照做；沒有的，模型就用猜的。
 */
import { useState } from "react";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";

interface Props {
  brandId: number | null;
  /** 跳到「我的定位文件」（上傳→提案→確認）。 */
  onOpenDocs?: () => void;
}

export default function AIBriefPanel({ brandId, onOpenDocs }: Props) {
  const { lang } = useLang();
  const en = lang === "en";
  const [mode, setMode] = useState<"full" | "core">("full");
  const [showRaw, setShowRaw] = useState(false);

  const briefQ = (trpc as any).brandKnowledge?.aiBrief?.useQuery
    ? (trpc as any).brandKnowledge.aiBrief.useQuery({ brandId: brandId ?? 0 }, { enabled: !!brandId, staleTime: 60_000 })
    : { data: null, isLoading: false };
  const coverageQ = (trpc as any).positioningDocs?.coverage?.useQuery
    ? (trpc as any).positioningDocs.coverage.useQuery({ scope: "brand", scopeId: brandId ?? 0 }, { enabled: !!brandId, staleTime: 60_000 })
    : { data: null };

  const brief = briefQ.data as
    | { full: string; core: string; fullChars: number; coreChars: number; sections: Array<{ title: string; lines: Array<{ label: string | null; text: string; field: string | null }> }>; fields: string[] }
    | null
    | undefined;
  const coverage = coverageQ.data as { filled: Array<{ path: string; label: string }>; missing: Array<{ path: string; label: string; cost: string }>; total: number } | null | undefined;

  if (!brandId) return null;

  const empty = !!brief && !brief.full.trim();
  const fieldLabel = (path: string | null): string | null => {
    if (!path) return null;
    const hit = coverage?.filled?.find((f) => f.path === path) ?? coverage?.missing?.find((f) => f.path === path);
    return hit?.label ?? null;
  };

  return (
    <section className="rounded-xl border border-neutral-200 bg-white px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-neutral-900">
            {en ? "The brand brief the AI actually reads" : "AI 讀到的品牌簡報"}
          </h3>
          <p className="mt-1 max-w-[560px] text-[13px] leading-relaxed text-neutral-500">
            {en
              ? "This exact text is placed in front of the model before every task card runs. What is here, the model follows; what is missing, the model guesses."
              : "每張任務卡開跑前，這段字會原封不動放在模型前面。簡報裡有的，模型照做；沒有的，模型只能猜。"}
          </p>
        </div>
        {brief && !empty && (
          <div className="flex items-center gap-1.5">
            {(["full", "core"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition ${
                  mode === m ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-500"
                }`}
              >
                {m === "full"
                  ? (en ? `Full · ${brief.fullChars}` : `完整版 · ${brief.fullChars} 字`)
                  : (en ? `Lean · ${brief.coreChars}` : `精簡版 · ${brief.coreChars} 字`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {briefQ.isLoading && <p className="mt-3 text-[13px] text-neutral-500">{en ? "Loading…" : "讀取中…"}</p>}

      {empty && (
        <p className="mt-3 text-[13px] leading-relaxed text-neutral-700">
          {en
            ? "The brief is empty: no positioning field is filled yet. Every card will run on the brand name alone."
            : "簡報目前是空的：定位還沒有任何欄位。現在每張卡只拿得到品牌名稱。"}
        </p>
      )}

      {brief && !empty && mode === "full" && !showRaw && (
        <div className="mt-4 flex flex-col gap-5">
          {brief.sections.map((s, si) => (
            <div key={si}>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">{s.title}</p>
              <dl className="flex flex-col gap-2.5">
                {s.lines.map((l, li) => {
                  const from = fieldLabel(l.field);
                  return (
                    <div key={li} className="grid grid-cols-[128px_1fr] gap-3 text-[13px] leading-relaxed">
                      <dt className={l.label ? "font-medium text-neutral-900" : "text-neutral-300"}>
                        {l.label ?? "·"}
                        {from && l.label !== from && <div className="text-[11px] font-normal text-neutral-400">{en ? `from ${from}` : `來自 ${from}`}</div>}
                      </dt>
                      <dd className="whitespace-pre-wrap break-words text-neutral-700">{l.text}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>
      )}

      {brief && !empty && (mode === "core" || showRaw) && (
        <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-[12px] leading-relaxed text-neutral-700">
          {(mode === "core" ? brief.core : brief.full).trim()}
        </pre>
      )}

      {brief && !empty && mode === "full" && (
        <button onClick={() => setShowRaw((v) => !v)} className="mt-2 text-[12px] text-neutral-400 underline underline-offset-2 hover:text-neutral-600">
          {showRaw ? (en ? "Back to the field view" : "回到欄位對照") : (en ? "Show the raw text the model sees" : "看模型看到的原文")}
        </button>
      )}

      {coverage && (
        <div className="mt-5 border-t border-neutral-200 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-[13px] font-semibold text-neutral-900">
              {en
                ? `Fields the engine reads: ${coverage.filled.length} of ${coverage.total} filled`
                : `引擎會讀的欄位：${coverage.total} 格，你填了 ${coverage.filled.length} 格`}
            </p>
            {onOpenDocs && (
              <button
                onClick={onOpenDocs}
                className="rounded-full border border-neutral-900 px-3 py-1 text-[12px] font-medium text-neutral-900 hover:bg-neutral-900 hover:text-white"
              >
                {en ? "Upload your own positioning document" : "上傳你既有的定位文件"}
              </button>
            )}
          </div>
          <p className="mt-1.5 max-w-[560px] text-[12.5px] leading-relaxed text-neutral-500">
            {en
              ? "You do not have to walk our 14 steps. Upload the document you already have — we extract these fields from it, you confirm, and only then does it enter the brief."
              : "不一定要走我們的 14 步。上傳你手上既有的定位文件，我們從裡面抽出這些欄位，你確認過才進簡報。"}
          </p>
          {coverage.missing.length > 0 && (
            <dl className="mt-3 flex flex-col gap-2">
              {coverage.missing.map((m) => (
                <div key={m.path} className="grid grid-cols-[128px_1fr] gap-3 text-[12.5px] leading-relaxed">
                  <dt className="font-medium text-neutral-900">{m.label}</dt>
                  <dd className="text-neutral-500">{en ? "Missing — " : "還沒填。"}{m.cost}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </section>
  );
}
