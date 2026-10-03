/**
 * CardDetailDrawer — 一張任務卡的「憑什麼」：用途、什麼時候用、出處與背後邏輯、
 * 需要你提供什麼、上架日期、屬於哪個方案。
 *
 * 2026-09-08 (CJ「任務卡可以點選看出處、看我們跟的爆款結構來源是什麼、看長青的
 * 背後邏輯是什麼，加上日期」＋「任務卡有名字，但也不知道該名字代表的意思」)
 *
 * 2026-09-09 (CJ「版面編排不好看」)：改成跟 TaskPicker 同一張皮 —— 手刻的
 * bottom-sheet／centered overlay，不是 HeroUI 的 Modal（那是另一套元件庫的
 * 陰影、圓角、按鈕節奏，跟這裡「單色、4A 代理商專業感」的手刻系統對不起來）。
 * 出處那格改成引文卡（左邊一條墨線＝這張卡真的有出處，同一個標記
 * KnowledgeEditor 用來標「這格填了東西」），可遷移的結構用 KnowledgeEditor
 * 已經在用的襯線斜體，不是又一列表格欄位。
 *
 * 資料全部來自 quickTask.cardDetail：出處是模型實際被餵的那一則參考，長青的
 * 邏輯來自 evergreenRationale，日期來自 git 歷史。這裡只負責排版，不另外編故事。
 */
import { useEffect } from "react";
import { CloseIcon } from "../../../platform/components/icons";
import { trpc } from "../../../../lib/trpc";
import { resolveSource, sourceLabel, sourceWhy } from "../../../platform/lib/sourceVocabulary";

interface Props {
  taskId: string | null;
  lang: string;
  onClose: () => void;
  /** 「用這張卡」—— 由頁面接回它原本的 openTask。 */
  onRun?: (taskId: string) => void;
}

const QUOTE_FONT = '"Source Serif Pro", "Noto Serif TC", Georgia, serif';
const NEW_WINDOW_DAYS = 30;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(`${iso}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** 卡片上架未滿 30 天。頁面的「新上架」badge 與「本月新卡」計數都用這個，
 *  日期到期的定義只有一個地方。 */
export function isRecentCard(iso: string | null | undefined): boolean {
  const d = daysSince(iso);
  return d !== null && d <= NEW_WINDOW_DAYS;
}

function fmtDay(iso: string, en: boolean): string {
  const [y, m, d] = iso.split("-");
  return en ? `${y}-${m}-${d}` : `${y}.${m}.${d}`;
}

/** 「什麼時候用」—— 由來源類型決定，不是每張卡各寫一句。 */
function whenToUse(type: string, en: boolean): string {
  switch (type) {
    case "viral":
      return en
        ? "When you want a structure that has already proven it can travel. The older the measured month, the more it's worth re-checking."
        : "想跟上已經驗證會傳開的結構時用。量測年月越舊，越該重新驗證是否還有效。";
    case "award":
      return en ? "For flagship content that needs a complete narrative mechanism, not a quick post." : "做主打內容、需要完整敘事機制時用，不是日常一篇。";
    case "benchmark":
      return en ? "When everyday content should read like the benchmark brands, not like a template." : "想讓日常內容寫得像標竿品牌、而不是像範本時用。";
    case "brand-method":
      return en ? "This card grew out of your own methodology. Only you have it." : "這張卡從你自己的方法論長出來，只有你有。";
    case "channel-spec":
      return en ? "When the deliverable must follow the channel's field spec." : "交付必須符合通路欄位規格時用。";
    default:
      return en
        ? "The everyday staple. Works any time — the structure your scheduled posts fall back on."
        : "日常排程的基本款，任何時候都能用；排程沒靈感時就用它。";
  }
}

export default function CardDetailDrawer({ taskId, lang, onClose, onRun }: Props) {
  const en = lang === "en";
  const open = !!taskId;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const q = (trpc as any).quickTask?.cardDetail?.useQuery
    ? (trpc as any).quickTask.cardDetail.useQuery({ taskId: taskId ?? "" }, { enabled: open, staleTime: 5 * 60_000 })
    : { data: null, isLoading: false, error: null };
  const d = q.data as any;
  const src = resolveSource(d?.source);
  const full = (d?.source ?? {}) as { short?: string; takeaway?: string; metric?: string; asOf?: string; url?: string; postUrl?: string };
  const age = daysSince(d?.addedAt);
  const isNew = isRecentCard(d?.addedAt);
  const srcAgeMonths = full.asOf
    ? (() => { const m = /^(\d{4})-(\d{2})$/.exec(full.asOf!); if (!m) return null;
        const now = new Date(); return (now.getFullYear() - Number(m[1])) * 12 + (now.getMonth() + 1 - Number(m[2])); })()
    : null;
  const stale = src.type === "viral" && srcAgeMonths !== null && srcAgeMonths >= 12;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── header ─────────────────────────────────────────────── */}
        <div className="flex items-start gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-neutral-500">{en ? "About this card" : "出處與說明"}</p>
            <h2 className="mt-0.5 text-[17px] font-semibold leading-snug text-neutral-900">
              {d ? (en ? (d.labelEn || d.labelZh) : (d.labelZh || d.labelEn)) : (en ? "Loading…" : "讀取中…")}
            </h2>
            {d && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-[12px] text-neutral-600">
                  {sourceLabel(src.type, lang)}
                </span>
                {isNew && (
                  <span className="rounded-full border border-neutral-900 px-2 py-0.5 text-[12px] font-medium text-neutral-900">
                    {en ? "New" : "新上架"}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600"
            aria-label={en ? "Close" : "關閉"}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* ── body ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {q.error && (
            <p className="text-[13px] text-neutral-500">{en ? "Could not load this card." : "讀不到這張卡的資料。"}</p>
          )}

          {d && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-neutral-400">
                  {en ? "What it makes" : "用途"}
                </p>
                <p className="text-[14px] leading-relaxed text-neutral-700">
                  {en ? (d.descriptionEn || d.descriptionZh) : (d.descriptionZh || d.descriptionEn)}
                </p>
              </div>

              <div>
                <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-neutral-400">
                  {en ? "When to use it" : "什麼時候用"}
                </p>
                <p className="text-[14px] leading-relaxed text-neutral-700">{whenToUse(src.type, en)}</p>
              </div>

              {/* 出處 — 引文卡。左邊一條墨線＝KnowledgeEditor 同一個「這格填了
                  東西」標記；可遷移的結構用襯線斜體，跟語氣範例同一個處理。 */}
              <div>
                <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-neutral-400">
                  {en ? "Source" : "出處"}
                </p>
                {src.type === "evergreen" ? (
                  <p className="text-[14px] leading-relaxed text-neutral-700">{sourceWhy(src.type, lang)}</p>
                ) : (
                  <div className="relative rounded-lg border border-neutral-200 bg-neutral-50 py-3 pl-4 pr-4">
                    <span aria-hidden className="absolute inset-y-3 left-0 w-[2px] rounded bg-neutral-900" />
                    {full.short && (
                      <p className="text-[14px] font-semibold text-neutral-900">{full.short}</p>
                    )}
                    {full.takeaway && (
                      <p className="mt-1.5 text-[14px] leading-relaxed text-neutral-700" style={{ fontFamily: QUOTE_FONT, fontStyle: "italic" }}>
                        “{full.takeaway}”
                      </p>
                    )}
                    {(full.metric || full.asOf) && (
                      <p className="mt-2 border-t border-neutral-200 pt-2 font-mono text-[12px] tabular-nums text-neutral-500">
                        {full.metric}
                        {full.metric && full.asOf ? "　·　" : ""}
                        {full.asOf && (
                          <span className={stale ? "font-medium text-amber-700" : undefined}>
                            {en ? `measured ${full.asOf}` : `${full.asOf} 量測`}
                            {stale && (en ? " · worth re-checking" : " · 已一年以上，建議重看")}
                          </span>
                        )}
                      </p>
                    )}
                    {/* 2026-09-29（CJ「要有參考文章的連結」）：數字要能點過去自己核對。 */}
                    {(full.url || full.postUrl) && (
                      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-neutral-200 pt-2 text-[13px]">
                        {full.url && (
                          <a href={full.url} target="_blank" rel="noopener noreferrer" className="font-medium text-neutral-900 underline underline-offset-2 hover:text-neutral-600">
                            {en ? "Reference article ↗" : "參考文章 ↗"}
                          </a>
                        )}
                        {full.postUrl && (
                          <a href={full.postUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-neutral-900 underline underline-offset-2 hover:text-neutral-600">
                            {en ? "Original post ↗" : "原始貼文 ↗"}
                          </a>
                        )}
                      </p>
                    )}
                    {d.craftRef && (
                      <p className="mt-2 border-t border-neutral-200 pt-2 text-[13px] leading-relaxed text-neutral-600">
                        <span className="text-neutral-400">{en ? "As referenced by the model: " : "模型實際被餵的參考："}</span>
                        {d.craftRef}
                      </p>
                    )}
                  </div>
                )}
                {src.type === "evergreen" && d.rationale && (
                  <div className="relative mt-2 rounded-lg border border-neutral-200 bg-neutral-50 py-3 pl-4 pr-4">
                    <span aria-hidden className="absolute inset-y-3 left-0 w-[2px] rounded bg-neutral-900" />
                    <p className="text-[14px] leading-relaxed text-neutral-700" style={{ fontFamily: QUOTE_FONT, fontStyle: "italic" }}>
                      “{d.rationale}”
                    </p>
                  </div>
                )}
              </div>

              {Array.isArray(d.inputs) && d.inputs.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-neutral-400">
                    {en ? "You provide" : "需要你提供"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {d.inputs.map((i: any) => (
                      <span key={i.key} className="rounded-full border border-neutral-200 px-2 py-0.5 text-[12px] text-neutral-600">
                        {i.label}
                        {!i.required && <span className="text-neutral-400">{en ? " · optional" : "・選填"}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── footer ─────────────────────────────────────────────── */}
        {d && (
          <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-5 py-3">
            <p className="font-mono text-[12px] tabular-nums text-neutral-500">
              {d.addedAt
                ? <>{fmtDay(d.addedAt, en)}{age !== null && ` · ${en ? `${age}d ago` : `${age} 天前`}`}</>
                : (en ? "Your own card" : "你自己建的卡")}
              {d.planTier === "pro" && <span className="ml-2 text-neutral-400">{en ? "· Professional plan" : "・專業方案"}</span>}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[13px] text-neutral-500 hover:bg-neutral-100">
                {en ? "Close" : "關閉"}
              </button>
              {onRun && (
                <button
                  onClick={() => onRun(d.id)}
                  className="rounded-lg bg-neutral-900 px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-neutral-800"
                >
                  {en ? "Use this card" : "用這張卡"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
