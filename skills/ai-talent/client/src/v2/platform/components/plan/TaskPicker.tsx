/**
 * TaskPicker — 從這個通路的全部任務卡裡，挑要擺在托盤上的。
 *
 * 2026-09-06 (CJ「按下去後，就按照類別陳列不同 Facebook 任務卡，讓用戶選擇
 * 要爆款、長青還是哪一種」)。
 *
 * 分組用「結構來源」而不是 tier —— tier 問的是「產出多大」，來源問的是
 * 「憑什麼這樣寫」。使用者在挑卡的當下想的是後者。
 *
 * 被方案鎖住的爆款卡不假裝存在，也不隱藏：列出一行寫清楚有幾張、要哪個
 * 方案。數字由 server 算（viralLocked），不寫死在前端。
 *
 * 單色。全站紀律是「4A 代理商專業感，不要彩色」，這裡只用墨色深淺與邊框。
 */
import React, { useMemo, useState } from "react";
import { useLang } from "../../../../lib/i18n";
import { resolveSource, sourceWhy, sourcePillText,
  FRONT_CARD_KINDS, frontCardKind, frontCardKindLabel, type FrontCardKind } from "../../../content/lib/sourceVocabulary";
import { CheckIcon, CloseIcon, LockIcon, SearchIcon } from "../icons";

export interface PickerTask {
  id: string;
  label?: string;
  description?: string;
  source?: unknown;
  tier?: string;
  ownCardId?: string | null;
}

export default function TaskPicker({
  open, onClose, tasks, selected, maxTray, viralLocked, onSave, saving, onDetail, categoryLabel,
}: {
  open: boolean;
  onClose: () => void;
  tasks: PickerTask[];
  selected: string[];
  maxTray: number;
  viralLocked: number;
  onSave: (ids: string[]) => void;
  saving?: boolean;
  /** 2026-09-08：選卡時也能先看這張卡的出處與說明（開 CardDetailDrawer）。 */
  onDetail?: (id: string) => void;
  /**
   * 2026-09-09 (CJ「若僅在 facebook 貼文的類別中新增，就只要出現 facebook
   * 貼文類別的任務即可」)：現在 `tasks` 已經是「目前這個分類」的卡，不是整個
   * 通路的卡。有值時把分類名亮出來，讓使用者知道自己挑的範圍是被縮小過的，
   * 不是這個通路的全部。
   */
  categoryLabel?: string | null;
}) {
  const { lang } = useLang();
  const isEn = lang === "en";
  const [draft, setDraft] = useState<string[]>(selected);
  const [q, setQ] = useState("");

  // 每次打開都以目前托盤為起點，而不是沿用上次沒存的草稿
  React.useEffect(() => { if (open) { setDraft(selected); setQ(""); } }, [open, selected]);

  const groups = useMemo(() => {
    const kw = q.trim().toLowerCase();
    // 2026-09-29：前台只分兩類——爆款結構、品牌自建；其他類型不列。
    const byType = new Map<FrontCardKind, PickerTask[]>();
    for (const t of tasks) {
      if (kw && !`${t.label ?? ""} ${t.description ?? ""}`.toLowerCase().includes(kw)) continue;
      const type = frontCardKind(t);
      if (!type) continue;
      const arr = byType.get(type) ?? [];
      arr.push(t);
      byType.set(type, arr);
    }
    return FRONT_CARD_KINDS
      .filter((s) => byType.has(s))
      .map((s) => ({ type: s, items: byType.get(s)! }));
  }, [tasks, q]);

  if (!open) return null;

  const full = draft.length >= maxTray;
  const toggle = (id: string) =>
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : (d.length >= maxTray ? d : [...d, id])));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
         onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="flex-1">
            <h2 className="text-[17px] font-semibold text-neutral-900">
              {isEn ? "Choose task cards" : "選擇任務卡"}
            </h2>
            <p className="mt-0.5 text-[13px] text-neutral-500">
              {isEn
                ? `Pick the cards you use often. ${draft.length} / ${maxTray} selected.`
                : `挑你常用的卡，平常就只擺這幾張。已選 ${draft.length} / ${maxTray}。`}
              {categoryLabel && (
                <span className="ml-1.5 rounded-full border border-neutral-300 px-2 py-0.5 text-[12px] text-neutral-600">
                  {isEn ? `In: ${categoryLabel}` : `分類：${categoryLabel}`}
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="border-b border-neutral-200 px-5 py-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1.5">
            <SearchIcon size={15} className="text-neutral-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isEn ? "Search cards" : "搜尋任務卡"}
              className="w-full bg-transparent text-[14px] outline-none placeholder:text-neutral-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {groups.map(({ type, items }) => (
            <section key={type} className="mb-5">
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-[14px] font-semibold text-neutral-900">
                  {frontCardKindLabel(type, lang)}
                </h3>
                <span className="text-[13px] text-neutral-400">{items.length}</span>
                <span className="truncate text-[13px] text-neutral-400">{type === "viral" ? sourceWhy("viral", lang) : (lang === "en" ? "Cards you built for this brand." : "你替這個品牌自己建的卡。")}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((t) => {
                  const on = draft.includes(t.id);
                  const src = resolveSource(t.source);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggle(t.id)}
                      disabled={!on && full}
                      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                        on
                          ? "border-neutral-900 bg-neutral-50"
                          : !on && full
                            ? "cursor-not-allowed border-neutral-150 opacity-40"
                            : "border-neutral-200 hover:border-neutral-400"
                      }`}
                    >
                      <span className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded border ${
                        on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"
                      }`}>
                        {on && <CheckIcon size={11} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium text-neutral-900">
                          {t.label ?? t.id}
                        </span>
                        <span className="mt-0.5 block truncate text-[13px] text-neutral-500">
                          {type === "own" ? frontCardKindLabel("own", lang) : sourcePillText(src, lang)}
                        </span>
                        {onDetail && (
                          <span
                            role="button"
                            tabIndex={0}
                            className="mt-1 inline-block text-[12px] font-medium text-neutral-800 underline underline-offset-2"
                            onClick={(e) => { e.stopPropagation(); onDetail(t.id); }}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter" && e.key !== " ") return;
                              e.preventDefault(); e.stopPropagation(); onDetail(t.id);
                            }}
                          >
                            {lang === "en" ? "Source & notes" : "出處與說明"}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          {viralLocked > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
              <LockIcon size={15} className="text-neutral-400" />
              <span className="text-[13px] text-neutral-600">
                {isEn
                  ? `${viralLocked} viral-structure cards on this channel are on the Professional plan.`
                  : `這個通路還有 ${viralLocked} 張爆款結構卡，屬於專業方案。`}
              </span>
            </div>
          )}

          {groups.length === 0 && (
            <p className="py-10 text-center text-[14px] text-neutral-400">
              {isEn ? "No cards match." : "沒有符合的任務卡。"}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-neutral-200 px-5 py-3">
          <button
            onClick={() => setDraft([])}
            className="text-[13px] text-neutral-500 underline-offset-2 hover:underline"
          >
            {isEn ? "Reset to default" : "回到系統預設"}
          </button>
          <button
            onClick={() => onSave(draft)}
            disabled={saving}
            className="ml-auto rounded-lg bg-neutral-900 px-4 py-2 text-[14px] font-medium text-white disabled:opacity-40"
          >
            {isEn ? "Save" : "儲存"}
          </button>
        </div>
      </div>
    </div>
  );
}
