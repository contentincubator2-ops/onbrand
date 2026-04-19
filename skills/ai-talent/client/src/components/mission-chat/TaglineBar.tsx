/**
 * TaglineBar.tsx
 * Persistent editable tagline + sub-tagline strip shown above the chat input.
 * Click to edit inline, blur/Enter to save to DB via tRPC mission.update.
 * Only visible when a mission with a squadSlug is active.
 */
import React, { useState, useRef, useEffect } from "react";
import { trpc } from "../../lib/trpc";

interface TaglineBarProps {
  missionId: number;
  initialTagline?: string | null;
  initialSubTagline?: string | null;
}

export function TaglineBar({ missionId, initialTagline, initialSubTagline }: TaglineBarProps) {
  const [tagline, setTagline] = useState(initialTagline ?? "");
  const [subTagline, setSubTagline] = useState(initialSubTagline ?? "");
  const [editingField, setEditingField] = useState<"tagline" | "subTagline" | null>(null);
  const [saved, setSaved] = useState(false);
  const taglineRef = useRef<HTMLInputElement>(null);
  const subTaglineRef = useRef<HTMLInputElement>(null);

  const updateMission = trpc.mission.update.useMutation({
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  // Sync from parent when mission changes
  useEffect(() => {
    setTagline(initialTagline ?? "");
    setSubTagline(initialSubTagline ?? "");
  }, [missionId, initialTagline, initialSubTagline]);

  const save = () => {
    updateMission.mutate({ id: missionId, tagline: tagline || null, subTagline: subTagline || null });
    setEditingField(null);
  };

  const handleTaglineKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") setEditingField(null);
  };

  const isEmpty = !tagline && !subTagline;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px",
        background: isEmpty ? "transparent" : "linear-gradient(135deg, #F0F7FF 0%, #F5F0FF 100%)",
        border: isEmpty ? "1px dashed #D4D2CF" : "1px solid #C7DEFF",
        borderRadius: 10,
        marginBottom: 4,
        flexShrink: 0,
        transition: "all 0.2s",
        minHeight: 36,
      }}
    >
      {/* Left icon */}
      <span style={{ fontSize: 16, flexShrink: 0, opacity: isEmpty ? 0.4 : 1 }}>🎯</span>

      {/* Tagline field */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {editingField === "tagline" ? (
          <input
            ref={taglineRef}
            autoFocus
            value={tagline}
            onChange={e => setTagline(e.target.value)}
            onBlur={save}
            onKeyDown={handleTaglineKey}
            placeholder="輸入品牌定位標語…"
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 13,
              fontWeight: 600,
              color: "#1D3557",
              fontFamily: "inherit",
            }}
          />
        ) : (
          <div
            onClick={() => setEditingField("tagline")}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: tagline ? "#1D3557" : "#B0ADA8",
              cursor: "text",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {tagline || "點擊輸入品牌定位標語…"}
          </div>
        )}

        {/* Sub-tagline */}
        {(tagline || editingField === "subTagline") && (
          editingField === "subTagline" ? (
            <input
              ref={subTaglineRef}
              autoFocus
              value={subTagline}
              onChange={e => setSubTagline(e.target.value)}
              onBlur={save}
              onKeyDown={handleTaglineKey}
              placeholder="副標語（目標受眾或差異點）…"
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 11,
                color: "#5A7A9F",
                fontFamily: "inherit",
                marginTop: 1,
              }}
            />
          ) : (
            <div
              onClick={() => setEditingField("subTagline")}
              style={{
                fontSize: 11,
                color: subTagline ? "#5A7A9F" : "#C8C7C3",
                cursor: "text",
                marginTop: 1,
              }}
            >
              {subTagline || "副標語…"}
            </div>
          )
        )}
      </div>

      {/* Save indicator */}
      {saved && (
        <span style={{ fontSize: 10, color: "#059669", flexShrink: 0, fontWeight: 600 }}>
          ✓ 已儲存
        </span>
      )}

      {/* Edit/Save button */}
      {editingField ? (
        <button
          onClick={save}
          style={{
            flexShrink: 0,
            fontSize: 11,
            padding: "3px 10px",
            borderRadius: 6,
            border: "1px solid #2563EB",
            background: "#2563EB",
            color: "white",
            cursor: "pointer",
            fontFamily: "inherit",
            fontWeight: 600,
          }}
        >
          儲存
        </button>
      ) : (
        !isEmpty && (
          <button
            onClick={() => setEditingField("tagline")}
            style={{
              flexShrink: 0,
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 5,
              border: "1px solid #C7DEFF",
              background: "white",
              color: "#2563EB",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            編輯
          </button>
        )
      )}
    </div>
  );
}
