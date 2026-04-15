/**
 * NewMissionModal.tsx
 *
 * Modal for creating a new mission.
 * - Brand: hidden when brandId is passed in (already in brand context)
 * - Workspace: shows only the user's actual workspaces (passed from AppShell)
 */
import React, { useState, useEffect } from "react";
import { trpc } from "../lib/trpc";

interface NewMissionModalProps {
  open: boolean;
  defaultWorkspace?: string;
  /** Pre-filled brand — hides the brand selector */
  brandId?: number;
  brandName?: string;
  /** User's actual workspace list from sidebar */
  workspaces?: { wsKey: string; label: string }[];
  onClose: () => void;
  onCreated: (missionId: number, workspace: string) => void;
}

export const NewMissionModal: React.FC<NewMissionModalProps> = ({
  open,
  defaultWorkspace = "strategy",
  brandId: propBrandId,
  brandName: propBrandName,
  workspaces = [],
  onClose,
  onCreated,
}) => {
  const [workspace, setWorkspace] = useState(defaultWorkspace);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  // Sync workspace when defaultWorkspace changes (e.g. opened from sidebar button)
  useEffect(() => { setWorkspace(defaultWorkspace); }, [defaultWorkspace]);

  const createMission = trpc.mission.create.useMutation({
    onSuccess: (data) => {
      onCreated(data.id, workspace);
      handleClose();
    },
    onError: (err) => setError(err.message),
  });

  const handleClose = () => {
    setWorkspace(defaultWorkspace);
    setTitle("");
    setDescription("");
    setError("");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("請輸入任務名稱"); return; }
    createMission.mutate({
      brandId:     propBrandId,
      brandName:   propBrandName,
      workspace,
      title:       title.trim(),
      description: description.trim() || undefined,
    });
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 16,
          padding: "28px 32px",
          width: "100%",
          maxWidth: 480,
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1A1A18", margin: 0 }}>
            建立新任務
          </h2>
          {propBrandName && (
            <p style={{ fontSize: 13, color: "#5B7FDB", marginTop: 4, fontWeight: 500 }}>
              {propBrandName}
            </p>
          )}
          <p style={{ fontSize: 13, color: "#9B9990", marginTop: 2 }}>
            填寫越詳細，AI 代理人選配對越精準
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Workspace — only show user's actual workspaces */}
          <div>
            <label style={labelStyle}>工作區 <span style={{ color: "#E53E3E" }}>*</span></label>
            <select
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              style={selectStyle}
            >
              {workspaces.length > 0
                ? workspaces.map((ws) => (
                    <option key={ws.wsKey} value={ws.wsKey}>{ws.label}</option>
                  ))
                : <option value={workspace}>{workspace}</option>
              }
            </select>
          </div>

          {/* Title */}
          <div>
            <label style={labelStyle}>任務名稱 <span style={{ color: "#E53E3E" }}>*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：Q3 品牌重塑計劃"
              style={inputStyle}
            />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>任務說明（強烈建議）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述你的行銷目標、目標受眾、預期成果，越詳細越能幫你配對最佳人選"
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          {error && (
            <div style={{ color: "#E53E3E", fontSize: 13 }}>{error}</div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="button"
              onClick={handleClose}
              style={{
                background: "transparent",
                border: "1px solid #E8EAF0",
                borderRadius: 8,
                padding: "8px 18px",
                fontSize: 13,
                cursor: "pointer",
                color: "#5A5A5A",
              }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={createMission.isPending}
              style={{
                background: createMission.isPending ? "#9B9990" : "#1A1A18",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 8,
                padding: "8px 22px",
                fontSize: 13,
                fontWeight: 600,
                cursor: createMission.isPending ? "not-allowed" : "pointer",
              }}
            >
              {createMission.isPending ? "建立中…" : "啟動任務"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#5A5A5A",
  marginBottom: 5,
  letterSpacing: 0.3,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1.5px solid #E2E8F0",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
  color: "#1A1A18",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  background: "#FFFFFF",
  cursor: "pointer",
};
