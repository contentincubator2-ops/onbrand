/**
 * Shared WhatsApp chrome for the booth phone simulator (sim-PhoneSimulator.tsx,
 * sim-RichMenu.tsx, BotMessages.tsx). Palette and bubble shape intentionally
 * match reps-WhatsAppReplay.tsx so the live simulator and the recorded
 * conversation replay look like the same app.
 */
import React from "react";
import { ChevronRight, List as ListIcon, X } from "lucide-react";
import { cx } from "../ui";

export const WA = {
  header: "#008069",
  wallpaper: "#efeae2",
  outgoing: "#d9fdd3",
  link: "#027eb5",
  tick: "#53bdeb",
};

export function Bubble({ side, children, tail }: { side: "in" | "out"; children: React.ReactNode; tail: boolean }) {
  return (
    <div className={cx("flex", side === "out" ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "relative max-w-[82%] rounded-lg px-2.5 py-1.5 text-[13.5px] leading-[1.35] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]",
          tail && (side === "out" ? "rounded-tr-none" : "rounded-tl-none"),
        )}
        style={{ background: side === "out" ? WA.outgoing : "#fff" }}
      >
        {tail ? (
          <span
            aria-hidden
            className={cx(
              "absolute top-0 h-0 w-0 border-t-[8px]",
              side === "out" ? "-right-2 border-r-[8px] border-r-transparent" : "-left-2 border-l-[8px] border-l-transparent",
            )}
            style={{ borderTopColor: side === "out" ? WA.outgoing : "#fff" }}
          />
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** A WhatsApp "reply button" row — full-width, under the bubble it answers. */
export function ReplyRow({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="flex justify-start">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="w-[82%] rounded-lg bg-white py-2 text-center text-[13.5px] font-medium shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] disabled:opacity-60"
        style={{ color: WA.link }}
      >
        {label}
      </button>
    </div>
  );
}

/** The footer row inside a bubble that opens the list sheet (>3 options). */
export function ListAffordance({ label, onOpen, disabled }: { label: string; onOpen: () => void; disabled?: boolean }) {
  return (
    <div className="-mx-2.5 mt-1.5 border-t border-stone-200 pt-1.5">
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-1.5 pb-0.5 text-[13.5px] font-medium hover:opacity-80 disabled:opacity-60"
        style={{ color: WA.link }}
      >
        <ListIcon className="h-4 w-4" aria-hidden /> {label}
      </button>
    </div>
  );
}

export interface SheetRow {
  id: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

/** WhatsApp's list message — a sheet that slides up from the bottom of the phone. */
export function OptionsSheet({
  title,
  rows,
  onSelect,
  onClose,
}: {
  title: string;
  rows: SheetRow[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/30" onClick={onClose}>
      <div className="max-h-[70%] overflow-y-auto rounded-t-2xl bg-white pb-3" onClick={(e) => e.stopPropagation()}>
        <div className="relative border-b border-stone-100 px-4 py-3 text-center text-[14px] font-semibold text-[#111b21]">
          <button type="button" onClick={onClose} className="absolute left-3 top-2.5 rounded p-1 text-stone-500 hover:bg-stone-100" aria-label="Close">
            <X className="h-4 w-4" aria-hidden />
          </button>
          {title}
        </div>
        <ul>
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className="flex w-full items-center gap-3 border-b border-stone-100 px-4 py-2.5 text-left last:border-0 hover:bg-stone-50"
              >
                {r.icon ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100">{r.icon}</span> : null}
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] text-[#111b21]">{r.title}</div>
                  {r.description ? <div className="text-[12px] text-stone-500">{r.description}</div> : null}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-stone-300" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
