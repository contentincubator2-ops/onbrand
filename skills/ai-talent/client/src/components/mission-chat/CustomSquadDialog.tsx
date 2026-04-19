/**
 * CustomSquadDialog.tsx
 * GPTs/Gems-style dialog: save the current squad's customized steps + agents
 * as a new reusable squad configuration.
 *
 * Features:
 * - Name + description
 * - Preview/reorder steps from current session
 * - Sharing: Private | Brand Team
 * - Creates a new row in squads table (via tRPC)
 */
import React, { useState } from "react";
import { trpc } from "../../lib/trpc";

const ORANGE = "#C9823A";
const ORANGE_LIGHT = "#FFF7ED";
const ORANGE_BORDER = "#F5C9A8";

interface Step {
  order: number;
  name: string;
  description?: string;
  assignedAgentName?: string;
  assignedAgentSlug?: string;
}

interface CustomSquadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Current squad's steps from DB */
  currentSteps: Step[];
  /** Current squad's base info */
  baseSquadName?: string;
  baseSquadDescription?: string;
  /** Brand the mission belongs to */
  brandId?: number | null;
  missionId?: number | null;
}

export function CustomSquadDialog({
  isOpen,
  onClose,
  currentSteps,
  baseSquadName = "",
  baseSquadDescription = "",
  brandId,
  missionId,
}: CustomSquadDialogProps) {
  const [name, setName] = useState(baseSquadName ? `${baseSquadName} (自訂)` : "我的自訂 Squad");
  const [description, setDescription] = useState(baseSquadDescription);
  const [steps, setSteps] = useState<Step[]>(currentSteps);
  const [sharing, setSharing] = useState<"private" | "brand">("private");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // tRPC mutation to create custom squad
  const createSquad = (trpc as any).squad?.createCustom?.useMutation
    ? (trpc as any).squad.createCustom.useMutation({
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => { setSaved(false); onClose(); }, 2000);
        },
        onError: (e: any) => {
          setError(e?.message ?? "儲存失敗，請稍後重試");
          setSaving(false);
        },
      })
    : null;

  const handleSave = async () => {
    if (!name.trim()) { setError("請輸入 Squad 名稱"); return; }
    setSaving(true);
    setError(null);

    if (createSquad) {
      createSquad.mutate({
        name: name.trim(),
        description: description.trim(),
        steps: JSON.stringify(steps),
        brandId: sharing === "brand" ? brandId : null,
        visibility: sharing,
        sourceMissionId: missionId,
      });
    } else {
      // Fallback: save to localStorage if tRPC endpoint not yet deployed
      const saved = JSON.parse(localStorage.getItem("customSquads") || "[]");
      saved.push({
        id: `custom-${Date.now()}`,
        name: name.trim(),
        description: description.trim(),
        steps,
        sharing,
        brandId: sharing === "brand" ? brandId : null,
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem("customSquads", JSON.stringify(saved));
      setSaving(false);
      setSaved(true);
      // Fire event so squad picker can refresh
      window.dispatchEvent(new CustomEvent("custom-squad-saved"));
      setTimeout(() => { setSaved(false); onClose(); }, 2000);
    }
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const next = [...steps];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    next.forEach((s, i) => { s.order = i + 1; });
    setSteps(next);
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.5)",
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "white", borderRadius: 16,
        width: "min(560px, 95vw)", maxHeight: "85vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 20px 14px",
          borderBottom: "1px solid #ECEAE8",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: `linear-gradient(135deg, ${ORANGE}, #E8631A)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(201,130,58,0.3)",
            flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A18" }}>儲存為我的 Squad</div>
            <div style={{ fontSize: 11, color: "#9B9990" }}>打造專屬於你的可重複使用 AI 協作模板</div>
          </div>
          <button
            onClick={onClose}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#9B9990", fontSize: 18 }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Name */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B6A66", display: "block", marginBottom: 5 }}>
              Squad 名稱 *
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如：SoWork AI 品牌定位 v2"
              style={{
                width: "100%", padding: "8px 12px",
                border: "1.5px solid #E4E3E1", borderRadius: 9,
                fontSize: 13, outline: "none", fontFamily: "inherit",
                boxSizing: "border-box",
              }}
              onFocus={e => { e.target.style.borderColor = ORANGE; }}
              onBlur={e => { e.target.style.borderColor = "#E4E3E1"; }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B6A66", display: "block", marginBottom: 5 }}>
              描述
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="這個 Squad 適合用來做什麼？"
              rows={2}
              style={{
                width: "100%", padding: "8px 12px",
                border: "1.5px solid #E4E3E1", borderRadius: 9,
                fontSize: 12, outline: "none", fontFamily: "inherit",
                resize: "vertical", boxSizing: "border-box",
              }}
              onFocus={e => { e.target.style.borderColor = ORANGE; }}
              onBlur={e => { e.target.style.borderColor = "#E4E3E1"; }}
            />
          </div>

          {/* Steps */}
          {steps.length > 0 && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6B6A66", display: "block", marginBottom: 6 }}>
                執行步驟（可調整順序）
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {steps.map((step, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 10px", borderRadius: 8,
                    border: "1px solid #ECEAE8", background: "#FAFAF9",
                  }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: 6,
                      background: ORANGE_LIGHT, border: `1px solid ${ORANGE_BORDER}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700, color: ORANGE, flexShrink: 0,
                    }}>
                      {i + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A18" }}>{step.name}</div>
                      {step.description && (
                        <div style={{ fontSize: 10, color: "#6B6A66", marginTop: 1, lineHeight: 1.35 }}>
                          {step.description.slice(0, 60)}{step.description.length > 60 ? "…" : ""}
                        </div>
                      )}
                      {step.assignedAgentName && (
                        <div style={{ fontSize: 10, color: "#9B9990", marginTop: step.description ? 0 : 1 }}>by {step.assignedAgentName}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                      <button
                        onClick={() => moveStep(i, -1)}
                        disabled={i === 0}
                        style={{
                          width: 20, height: 18, border: "1px solid #E4E3E1", borderRadius: 4,
                          background: i === 0 ? "#F9F9F8" : "white", cursor: i === 0 ? "default" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: i === 0 ? "#D4D3D0" : "#6B6A66",
                          fontSize: 9,
                        }}
                      >▲</button>
                      <button
                        onClick={() => moveStep(i, 1)}
                        disabled={i === steps.length - 1}
                        style={{
                          width: 20, height: 18, border: "1px solid #E4E3E1", borderRadius: 4,
                          background: i === steps.length - 1 ? "#F9F9F8" : "white",
                          cursor: i === steps.length - 1 ? "default" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: i === steps.length - 1 ? "#D4D3D0" : "#6B6A66",
                          fontSize: 9,
                        }}
                      >▼</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sharing */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B6A66", display: "block", marginBottom: 6 }}>
              分享範圍
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { value: "private", label: "🔒 私人", desc: "只有你能使用" },
                { value: "brand", label: "👥 品牌團隊", desc: "品牌成員皆可用" },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSharing(opt.value as "private" | "brand")}
                  style={{
                    flex: 1, padding: "8px 10px", borderRadius: 9,
                    border: `1.5px solid ${sharing === opt.value ? ORANGE : "#E4E3E1"}`,
                    background: sharing === opt.value ? ORANGE_LIGHT : "white",
                    cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: sharing === opt.value ? ORANGE : "#1A1A18" }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 10, color: "#9B9990", marginTop: 1 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{
              fontSize: 11, color: "#B91C1C",
              background: "#FEF2F2", border: "1px solid #FECACA",
              borderRadius: 7, padding: "6px 10px",
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid #ECEAE8",
          display: "flex", gap: 8, justifyContent: "flex-end",
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px", borderRadius: 9,
              border: "1px solid #E4E3E1", background: "white",
              fontSize: 13, color: "#6B6A66", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            style={{
              padding: "8px 20px", borderRadius: 9,
              border: "none",
              background: saved ? "#22C55E" : saving ? "#D4A96A" : `linear-gradient(135deg, ${ORANGE}, #E8631A)`,
              fontSize: 13, fontWeight: 700, color: "white",
              cursor: saving || saved ? "default" : "pointer",
              fontFamily: "inherit",
              boxShadow: saved || saving ? "none" : "0 2px 8px rgba(201,130,58,0.35)",
              transition: "all 0.2s",
            }}
          >
            {saved ? "✓ 已儲存！" : saving ? "儲存中…" : "儲存為我的 Squad ✦"}
          </button>
        </div>
      </div>
    </div>
  );
}
