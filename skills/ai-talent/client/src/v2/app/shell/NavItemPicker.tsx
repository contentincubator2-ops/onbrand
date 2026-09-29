/**
 * NavItemPicker — 內容層側欄「＋」打開的視窗：勾選這個品牌要放哪些通路與工具、調順序。
 *
 * 2026-09-27（CJ「除了專案、行事曆、活動以外，所有的 mission tray 變成使用者自己可以
 * 加入，自己選要加 facebook、instagram 或其他通路」）。
 *
 * 上面是「側欄上的順序」（可上移／下移／拿掉），下面是全部可以加的項目，分「通路」與
 * 「工具」兩組，每項一句話說明它能做什麼——使用者要知道加了會得到什麼，才選得下去。
 */
import React from "react";
import { createPortal } from "react-dom";
import { CheckIcon, CloseIcon } from "../../platform/components/icons";

export interface PickerItem {
  id: string;
  label: string;
  tooltip?: string;
  icon: React.ReactNode;
  kind?: "channel" | "tool";
}

export default function NavItemPicker({ open, en, brandName, catalog, selected, saving, onClose, onSave }: {
  open: boolean;
  en: boolean;
  brandName?: string | null;
  catalog: PickerItem[];
  selected: string[];
  saving?: boolean;
  onClose: () => void;
  onSave: (ids: string[]) => void;
}) {
  const [draft, setDraft] = React.useState<string[]>(selected);
  React.useEffect(() => { if (open) setDraft(selected.filter((id) => catalog.some((c) => c.id === id))); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;

  const byId = new Map(catalog.map((c) => [c.id, c]));
  const toggle = (id: string) => setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  const move = (i: number, delta: number) => setDraft((d) => {
    const j = i + delta;
    if (j < 0 || j >= d.length) return d;
    const next = [...d];
    [next[i], next[j]] = [next[j]!, next[i]!];
    return next;
  });

  const section = (kind: "channel" | "tool", title: string) => {
    const items = catalog.filter((c) => (c.kind ?? "channel") === kind);
    if (!items.length) return null;
    return (
      <div className="mt-4">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-neutral-400">{title}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((c) => {
            const on = draft.includes(c.id);
            return (
              <button key={c.id} type="button" onClick={() => toggle(c.id)}
                className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ${on ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 bg-white hover:border-neutral-400"}`}>
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[15px] ${on ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-500"}`}>{c.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-neutral-900">{c.label}</span>
                  {c.tooltip && <span className="mt-0.5 block text-[12px] leading-snug text-neutral-500">{c.tooltip}</span>}
                </span>
                <span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[11px] ${on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"}`}>{on ? <CheckIcon size={9} /> : null}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-[680px] overflow-y-auto rounded-2xl bg-white px-6 py-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[17px] font-semibold text-neutral-900">{en ? "Your channels & tools" : "你的通路與工具"}</h3>
            <p className="mt-1 text-[12.5px] text-neutral-500">
              {en
                ? `Pick what ${brandName || "this brand"} actually uses. Projects, Calendar and Campaigns are always there.`
                : `只放${brandName ? `「${brandName}」` : "這個品牌"}真的會用到的。專案、行事曆、活動一直都在，不用加。`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-[14px] text-neutral-400 hover:text-neutral-900"><CloseIcon size={14} /></button>
        </div>

        {/* 側欄上的順序 */}
        <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
          <p className="mb-1.5 text-[12px] font-semibold text-neutral-500">{en ? "On your sidebar, in this order" : "側欄上的順序"}</p>
          {draft.length === 0 ? (
            <p className="py-1 text-[12.5px] text-neutral-400">{en ? "Nothing yet — pick below." : "還沒有——從下面挑。"}</p>
          ) : (
            <ol className="space-y-1">
              {draft.map((id, i) => {
                const c = byId.get(id);
                if (!c) return null;
                return (
                  <li key={id} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-[13px]">
                    <span className="w-4 text-right font-mono text-[11px] text-neutral-400">{i + 1}</span>
                    <span className="flex h-5 w-5 items-center justify-center text-neutral-600">{c.icon}</span>
                    <span className="flex-1 font-medium text-neutral-900">{c.label}</span>
                    <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="px-1 text-neutral-400 hover:text-neutral-900 disabled:opacity-30" aria-label={en ? "Move up" : "上移"}>↑</button>
                    <button type="button" disabled={i === draft.length - 1} onClick={() => move(i, 1)} className="px-1 text-neutral-400 hover:text-neutral-900 disabled:opacity-30" aria-label={en ? "Move down" : "下移"}>↓</button>
                    <button type="button" onClick={() => toggle(id)} className="px-1 text-neutral-400 hover:text-neutral-900" aria-label={en ? "Remove" : "拿掉"}><CloseIcon size={12} /></button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {section("channel", en ? "Channels" : "通路")}
        {section("tool", en ? "Tools" : "工具")}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-neutral-300 px-4 py-1.5 text-[13px] text-neutral-700 hover:border-neutral-900">{en ? "Cancel" : "取消"}</button>
          <button type="button" disabled={saving} onClick={() => onSave(draft)} className="rounded-full bg-neutral-900 px-5 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-700 disabled:opacity-40">
            {en ? "Save" : "儲存"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
