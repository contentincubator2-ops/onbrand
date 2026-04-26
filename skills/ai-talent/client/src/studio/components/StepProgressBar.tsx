import React from "react";
import type { MosAccent } from "../primitives/tokens";
import { ACCENTS } from "../primitives/tokens";

export interface StepProgressBarProps {
  steps: Array<{ name: string; status: "pending" | "active" | "done" }>;
  accent: MosAccent;
  onJump?: (i: number) => void;
}

export default function StepProgressBar({ steps, accent, onJump }: StepProgressBarProps) {
  const tone = ACCENTS[accent];
  return (
    <div className="w-full">
      <div className="flex items-center">
        {steps.map((s, i) => {
          const dot =
            s.status === "done"
              ? tone.bg
              : s.status === "active"
              ? tone.bg
              : "#E4E4E4";
          const text = s.status === "pending" ? "text-mos-muted" : "text-mos-ink";
          return (
            <React.Fragment key={i}>
              <button
                onClick={() => onJump?.(i)}
                className="flex flex-col items-center group"
                style={{ minWidth: 86 }}
              >
                <div
                  className="w-3 h-3 rounded-full transition"
                  style={{
                    background: dot,
                    outline: s.status === "active" ? `4px solid ${tone.bg}22` : "none",
                  }}
                />
                <div className={`mt-2 text-meta uppercase tracking-[0.16em] ${text}`}>
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className={`mt-1 text-[0.78rem] ${text} text-center max-w-[110px] leading-tight`}>
                  {s.name}
                </div>
              </button>
              {i < steps.length - 1 && (
                <div className="flex-1 h-px" style={{ background: s.status === "done" ? tone.bg : "#E4E4E4" }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
