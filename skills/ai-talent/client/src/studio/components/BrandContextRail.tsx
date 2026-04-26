import React from "react";
import type { MosAccent } from "../primitives/tokens";
import { ACCENTS, clipForIndex } from "../primitives/tokens";

export interface BrandContextRailProps {
  brandName: string;
  accent: MosAccent;
  positioning?: string;
  archetype?: string;
  voiceTone?: string;
  audience?: string;
  history?: Array<{ decisionType: string; title?: string | null; status: string }>;
}

export default function BrandContextRail({
  brandName,
  accent,
  positioning,
  archetype,
  voiceTone,
  audience,
  history = [],
}: BrandContextRailProps) {
  const tone = ACCENTS[accent];

  return (
    <aside className="w-[240px] shrink-0 border-r border-mos-hair bg-white">
      <div className={`${tone.bgClass} ${clipForIndex(1)} h-[116px] relative`}>
        <div className="absolute left-5 top-5 text-[0.62rem] tracking-[0.22em] uppercase text-white/90">
          Brand
        </div>
        <div className="absolute left-5 bottom-5 mos-display text-[1.25rem] text-white leading-none">
          {brandName}
        </div>
      </div>

      <div className="px-5 py-5 space-y-5">
        <Field label="Positioning" value={positioning} />
        <Field label="Archetype" value={archetype} />
        <Field label="Voice" value={voiceTone} />
        <Field label="Audience" value={audience} />
      </div>

      <div className="border-t border-mos-hair px-5 py-5">
        <div className="mos-eyebrow mb-3">History</div>
        {history.length === 0 && (
          <div className="text-meta text-mos-muted">No prior decisions yet.</div>
        )}
        <ul className="space-y-2">
          {history.map((h, i) => (
            <li
              key={i}
              className="flex items-center justify-between text-[0.78rem]"
            >
              <span className="text-mos-body truncate pr-2">
                {h.title ?? h.decisionType}
              </span>
              <span
                className={[
                  "text-[0.62rem] uppercase tracking-[0.14em]",
                  h.status === "approved" || h.status === "active"
                    ? "text-mos-ink"
                    : "text-mos-muted",
                ].join(" ")}
              >
                {h.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="mos-eyebrow mb-1">{label}</div>
      <div className="text-[0.88rem] text-mos-ink leading-snug">
        {value || <span className="text-mos-muted">—</span>}
      </div>
    </div>
  );
}
