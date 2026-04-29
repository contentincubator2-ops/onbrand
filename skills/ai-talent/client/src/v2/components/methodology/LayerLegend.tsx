/**
 * LayerLegend — 6-layer strategy ribbon shown above the methodology
 * catalog and the mission wall, so users always see the full strategic
 * vocabulary (L1 品牌策略 → L6 驗證校準) regardless of which layer
 * they're filtering on.
 *
 * Optional onPick — if provided, clicking a chip filters the underlying
 * grid. Active layer is highlighted with the layer's accent colour.
 */
import React from "react";
import {
  LAYER_ORDER,
  LAYER_TOKENS,
  type MosLayer,
} from "../../../studio/primitives/tokens";

export interface LayerLegendProps {
  /** Currently-active layer, or null for "all". */
  active?: MosLayer | null;
  /** When clicked. Pass null to clear. If absent, chips are read-only. */
  onPick?: (layer: MosLayer | null) => void;
  className?: string;
}

export default function LayerLegend({ active, onPick, className = "" }: LayerLegendProps) {
  const interactive = !!onPick;
  return (
    <div className={`flex flex-wrap items-stretch gap-2 ${className}`}>
      {onPick && (
        <Chip
          tone="#0A0A0A"
          tint="transparent"
          label="ALL"
          subLabel="全部"
          isActive={!active}
          onClick={() => onPick(null)}
          interactive
        />
      )}
      {LAYER_ORDER.map((k) => {
        const t = LAYER_TOKENS[k];
        return (
          <Chip
            key={k}
            tone={t.bg}
            tint={t.bgTint}
            label={k}
            subLabel={t.label}
            isActive={active === k}
            onClick={interactive ? () => onPick?.(k) : undefined}
            interactive={interactive}
          />
        );
      })}
    </div>
  );
}

function Chip({
  tone,
  tint,
  label,
  subLabel,
  isActive,
  onClick,
  interactive,
}: {
  tone: string;
  tint: string;
  label: string;
  subLabel: string;
  isActive: boolean;
  onClick?: () => void;
  interactive: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={[
        "flex items-center gap-2 px-3 py-1.5 border transition",
        interactive ? "cursor-pointer hover:border-foreground" : "cursor-default",
        isActive ? "border-foreground" : "border-divider",
      ].join(" ")}
      style={{
        background: isActive ? tint : "#fff",
      }}
    >
      <span
        className="inline-block w-2.5 h-2.5"
        style={{ background: tone }}
        aria-hidden
      />
      <span className="font-semibold text-tiny tracking-[0.22em] uppercase text-foreground">
        {label}
      </span>
      <span className="text-tiny text-default-500">{subLabel}</span>
    </button>
  );
}
