/**
 * ImageSizePicker — 這個通路要擺哪幾種圖片尺寸。
 *
 * 2026-09-30（CJ「圖片類別的任務卡，也不需要一次全部列出，只要列出兩張後，用戶可以
 * 自己新增該平台的不同尺寸圖片進去」）。預設每通路兩張；這裡列出該平台全部真實尺寸，
 * 分「一般／廣告」兩組勾選，存在 brands.positioning.__imageTray。
 *
 * 外觀沿用 TaskPicker（同一件事：挑要擺在托盤上的卡），單色。
 */
import React, { useMemo, useState } from "react";
import { useLang } from "../../../../lib/i18n";
import { CheckIcon, CloseIcon, SearchIcon } from "../../../platform/components/icons";
import { RatioFrame } from "./ImageCardTile";
import type { ImageCardInfo } from "../../../platform/lib/imageCardHandoff";

export default function ImageSizePicker({
  open, onClose, cards, selected, max, onSave, saving,
}: {
  open: boolean;
  onClose: () => void;
  /** 這個通路的全部圖片卡。 */
  cards: ImageCardInfo[];
  selected: string[];
  max: number;
  onSave: (ids: string[]) => void;
  saving?: boolean;
}) {
  const { lang } = useLang();
  const isEn = lang === "en";
  const [draft, setDraft] = useState<string[]>(selected);
  const [q, setQ] = useState("");

  // 每次打開都以目前托盤為起點，而不是沿用上次沒存的草稿
  React.useEffect(() => { if (open) { setDraft(selected); setQ(""); } }, [open, selected]);

  const groups = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const hit = (c: ImageCardInfo) =>
      !kw || `${c.labelZh} ${c.labelEn} ${c.descZh} ${c.width}x${c.height} ${c.width}×${c.height}`.toLowerCase().includes(kw);
    return (["organic", "ad"] as const)
      .map((p) => ({ placement: p, items: cards.filter((c) => (c.placement ?? "organic") === p && hit(c)) }))
      .filter((g) => g.items.length);
  }, [cards, q]);

  if (!open) return null;

  const full = draft.length >= max;
  const toggle = (id: string) =>
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : (d.length >= max ? d : [...d, id])));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="flex-1">
            <h2 className="text-[17px] font-semibold text-neutral-900">
              {isEn ? "Choose image sizes" : "選擇圖片尺寸"}
            </h2>
            <p className="mt-0.5 text-[13px] text-neutral-500">
              {isEn ? `${draft.length} / ${max} selected` : `已選 ${draft.length} / ${max}`}
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
              placeholder={isEn ? "Search sizes, e.g. Stories or 1080" : "搜尋版位或尺寸，例如 限時動態、1080"}
              className="w-full bg-transparent text-[14px] outline-none placeholder:text-neutral-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {groups.map(({ placement, items }) => (
            <section key={placement} className="mb-5">
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-[14px] font-semibold text-neutral-900">
                  {placement === "ad" ? (isEn ? "Ads" : "廣告") : (isEn ? "Organic" : "一般")}
                </h3>
                <span className="text-[13px] text-neutral-400">{items.length}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((c) => {
                  const on = draft.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggle(c.id)}
                      disabled={!on && full}
                      title={c.noteZh}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                        on
                          ? "border-neutral-900 bg-neutral-50"
                          : full
                            ? "cursor-not-allowed border-neutral-150 opacity-40"
                            : "border-neutral-200 hover:border-neutral-400"
                      }`}
                    >
                      <span className={`flex h-4 w-4 flex-none items-center justify-center rounded border ${
                        on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"
                      }`}>
                        {on && <CheckIcon size={11} strokeWidth={3} />}
                      </span>
                      <span className="flex h-9 w-12 flex-none items-center justify-center">
                        <RatioFrame width={c.width} height={c.height} box={24} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium text-neutral-900">
                          {isEn ? c.labelEn : c.labelZh}
                        </span>
                        <span className="mt-0.5 block truncate text-[13px] tabular-nums text-neutral-500">
                          {c.width}×{c.height} · {c.ratio}
                          {c.maxImages > 1 ? (isEn ? ` · up to ${c.maxImages}` : ` · 最多 ${c.maxImages} 張`) : ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          {groups.length === 0 && (
            <p className="py-10 text-center text-[14px] text-neutral-400">
              {isEn ? "No sizes match." : "沒有符合的尺寸。"}
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
