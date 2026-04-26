/**
 * ZoneTimeline — 4-zone horizontal nav shown under the top bar.
 *
 * 偵測情報 → 決策策略 → 製作執行 → 複盤優化 → (loops back to 偵測)
 *
 * One pill per zone, connected by thin lines + arrow glyphs.
 * Active zone is filled; others show a count badge if data exists.
 */
import React from "react";
import type { DeckZone } from "./types";

const C = {
  bg: "#FFFFFF",
  border: "#E4E3E1",
  text: "#1A1A18",
  textMuted: "#6B6A64",
  textDim: "#9B9990",
  accent: "#E8631A",
  accentBg: "#FDEFE3",
};

const ZONES: { id: DeckZone; label: string; hint: string }[] = [
  { id: "detect",  label: "偵測情報",  hint: "市場、競品、情境" },
  { id: "decide",  label: "決策策略",  hint: "選方法、定位、框架" },
  { id: "make",    label: "製作執行",  hint: "內容、通路、物料" },
  { id: "review",  label: "複盤優化",  hint: "成效、洞察、迭代" },
];

export function ZoneTimeline({
  active,
  onChange,
  badges,
}: {
  active: DeckZone;
  onChange: (z: DeckZone) => void;
  badges?: Partial<Record<DeckZone, number>>;
}) {
  return (
    <div
      style={{
        background: C.bg,
        borderBottom: `1px solid ${C.border}`,
        padding: "14px 24px",
        display: "flex",
        alignItems: "center",
        gap: 0,
        overflowX: "auto",
      }}
    >
      {ZONES.map((z, idx) => {
        const isActive = z.id === active;
        const count = badges?.[z.id];
        return (
          <React.Fragment key={z.id}>
            <button
              onClick={() => onChange(z.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                background: isActive ? C.accentBg : "transparent",
                color: isActive ? C.accent : C.text,
                border: `1px solid ${isActive ? C.accent : "transparent"}`,
                borderRadius: 8,
                padding: "8px 14px",
                cursor: "pointer",
                minWidth: 140,
                textAlign: "left",
                transition: "all .15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{z.label}</span>
                {count !== undefined && count > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      background: isActive ? C.accent : "#E4E3E1",
                      color: isActive ? "#fff" : C.textMuted,
                      padding: "1px 6px",
                      borderRadius: 9,
                      minWidth: 16,
                      textAlign: "center",
                    }}
                  >
                    {count}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: isActive ? C.accent : C.textDim, marginTop: 2 }}>
                {z.hint}
              </div>
            </button>
            {idx < ZONES.length - 1 && (
              <div
                style={{
                  flex: "0 0 auto",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 6px",
                  color: C.textDim,
                  fontSize: 14,
                }}
              >
                →
              </div>
            )}
          </React.Fragment>
        );
      })}
      <div style={{ flex: 1 }} />
      <div style={{ fontSize: 11, color: C.textDim, whiteSpace: "nowrap" }}>
        ↻ 每個循環完成，回到偵測
      </div>
    </div>
  );
}
