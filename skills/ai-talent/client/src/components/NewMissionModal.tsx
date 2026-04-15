/**
 * NewMissionModal.tsx
 *
 * Modal for creating a new mission with brand, workspace, title, and description.
 * Triggered by the "新任務" button in AppShell.
 * On submit: calls trpc.mission.create, then navigates to the new mission.
 */
import React, { useState } from "react";
import { trpc } from "../lib/trpc";

const WORKSPACES = [
  { key: "strategy",  label: "品牌策略" },
  { key: "facebook",  label: "Facebook 行銷" },
  { key: "linkedin",  label: "LinkedIn" },
  { key: "youtube",   label: "YouTube" },
  { key: "website",   label: "官網優化" },
  { key: "pr",        label: "公關媒體" },
  { key: "event",     label: "活動企劃" },
];

interface NewMissionModalProps {
  open: boolean;
  defaultWorkspace?: string;
  onClose: () => void;
  onCreated: (missionId: number, workspace: string) => void;
}

export const NewMissionModal: React.FC<NewMissionModalProps> = ({
  open,
  defaultWorkspace = "strategy",
  onClose,
  onCreated,
}) => {
  const [brandId, setBrandId] = useState<number | "">("");
  const [workspace, setWorkspace] = useState(defaultWorkspace);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const { data: brands = [] } = trpc.brand.listByMember.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
  });

  const createMission = trpc.mission.create.useMutation({
    onSuccess: (data) => {
      onCreated(data.id, workspace);
      handleClose();
    },
    onError: (err) => setError(err.message),
  });

  const handleClose = () => {
    setBrandId("");
    setWorkspace(defaultWorkspace);
    setTitle("");
    setDescription("");
    setError("");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("請輸入任務名稱"); return; }

    const selectedBrand = brands.find((b: any) => b.id === Number(brandId));
    createMission.mutate({
      brandId:    brandId ? Number(brandId) : undefined,
      brandName:  selectedBrand?.name,
      workspace,
      title:      title.trim(),
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
          <p style={{ fontSize: 13, color: "#9B9990", marginTop: 4 }}>
            填寫越詳細，AI 代理人選配對越精準
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Brand */}
          <div>
            <label style={labelStyle}>品牌</label>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value === "" ? "" : Number(e.target.value))}
              style={selectStyle}
            >
              <option value="">選擇品牌（選填）</option>
              {brands.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Workspace */}
          <div>
            <label style={labelStyle}>工作區 <span style={{ color: "#E53E3E" }}>*</span></label>
            <select
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              style={selectStyle}
            >
              {WORKSPACES.map((ws) => (
                <option key={ws.key} value={ws.key}>{ws.label}</option>
              ))}
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
