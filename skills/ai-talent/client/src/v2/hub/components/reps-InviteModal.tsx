import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { CopyButton } from "./reps-CopyButton";

const STEPS = [
  "Add the ExpertHub AI Team LINE account.",
  "Send this code in the chat.",
  "The menu appears — your AI marketing team.",
];

export default function InviteModal({ repName, code, onClose }: { repName: string; code: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hub-invite-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border border-stone-200 bg-white p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-medium uppercase tracking-wide text-stone-500">Invite to LINE bot</div>
            <h2 id="hub-invite-title" className="mt-1 text-[18px] font-semibold leading-snug text-stone-900">
              {repName}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="mt-5 rounded-lg border border-stone-200 bg-stone-50 px-4 py-5 text-center">
          <div className="text-[12px] text-stone-500">One-time binding code</div>
          <div className="mt-2 select-all pl-[0.25em] font-mono text-[40px] font-semibold leading-none tracking-[0.25em] text-stone-900">
            {code}
          </div>
          <div className="mt-4">
            <CopyButton text={code} label="Copy code" />
          </div>
        </div>

        <ol className="mt-5 space-y-3">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-start gap-3 text-[14px] text-stone-800">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[12px] font-semibold tabular-nums text-white">
                {i + 1}
              </span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>

        <p className="mt-5 text-[12px] leading-relaxed text-stone-500">
          Sending the code links the rep's LINE account and records their consent. The code works once; issuing a new one replaces it.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-stone-900 px-3 py-2 text-[14px] font-medium text-white hover:bg-stone-800"
        >
          Done
        </button>
      </div>
    </div>
  );
}
