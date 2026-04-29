import React from "react";
import type { MosAccent } from "../primitives/tokens";
import { ACCENTS } from "../primitives/tokens";

export interface OptionCardProps {
  label: string;
  payload?: Record<string, any>;
  confidence?: number; // 0-1
  reversibility?: "one-way" | "two-way";
  rationale?: string;
  isRecommended?: boolean;
  accent: MosAccent;
  onApprove?: () => void;
  onRevise?: () => void;
  approving?: boolean;
}

export default function OptionCard({
  label,
  payload,
  confidence,
  reversibility,
  rationale,
  isRecommended,
  accent,
  onApprove,
  onRevise,
  approving,
}: OptionCardProps) {
  const tone = ACCENTS[accent];
  return (
    <div className="border border-divider bg-white">
      <div className="flex items-center justify-between px-5 pt-4">
        <div className="flex items-center gap-3">
          <div
            className="text-meta uppercase tracking-[0.22em] font-semibold"
            style={{ color: tone.text }}
          >
            {label}
          </div>
          {isRecommended && (
            <span
              className="px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.22em] text-white"
              style={{ background: tone.bg }}
            >
              Recommended
            </span>
          )}
        </div>
        {typeof confidence === "number" && (
          <div className="text-meta text-default-500">
            Confidence {Math.round(confidence * 100)}%
          </div>
        )}
      </div>

      {payload && (
        <div className="px-5 pt-3 pb-2">
          <dl className="divide-y divide-divider">
            {Object.entries(payload)
              .slice(0, 8)
              .map(([k, v]) => (
                <div key={k} className="grid grid-cols-[140px_1fr] py-2 gap-4">
                  <dt className="text-meta uppercase tracking-[0.14em] text-default-500">
                    {k.replace(/([a-z])([A-Z])/g, "$1 $2")}
                  </dt>
                  <dd className="text-[0.9rem] text-foreground leading-snug">
                    {typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      )}

      {rationale && (
        <div className="px-5 pb-3 text-[0.85rem] text-foreground leading-snug">
          {rationale}
        </div>
      )}

      <div className="border-t border-divider px-5 py-3 flex items-center justify-between text-meta uppercase tracking-[0.14em] text-default-500">
        <div>Reversibility · {reversibility ?? "two-way"}</div>
        <div className="flex gap-2">
          {onRevise && (
            <button
              onClick={onRevise}
              className="px-3 py-1.5 border border-divider text-foreground hover:border-foreground hover:text-foreground"
            >
              Revise
            </button>
          )}
          {onApprove && (
            <button
              onClick={onApprove}
              disabled={approving}
              className="px-3 py-1.5 text-white"
              style={{ background: tone.bg }}
            >
              {approving ? "Approving…" : "Approve"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
