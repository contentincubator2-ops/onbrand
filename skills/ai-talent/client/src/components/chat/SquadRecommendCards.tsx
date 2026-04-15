/**
 * SquadRecommendCards.tsx
 * PM 推薦 3 個 Squad 卡片，用戶點選確認後觸發 assemble
 */

import React, { useState } from "react";
import { trpc } from "../../lib/trpc";

interface SquadMember {
  name: string;
  title: string;
  role: string;
  isLead: boolean;
}

interface SquadOption {
  slug: string;
  name: string;
  description: string;
  similarity: number;
  members: SquadMember[];
}

interface Props {
  squads: SquadOption[];
  missionId: number;
  brandId: number;
  onConfirmed?: (squadUid: string, squadTitle: string) => void;
}

export default function SquadRecommendCards({ squads, missionId, brandId, onConfirmed }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const assembleMutation = (trpc as any).squad?.assemble?.useMutation
    ? (trpc as any).squad.assemble.useMutation({
        onSuccess: (data: any) => {
          setConfirmed(true);
          setLoading(false);
          onConfirmed?.(data.squadUid, data.title);
        },
        onError: () => setLoading(false),
      })
    : null;

  const handleConfirm = (slug: string) => {
    if (!assembleMutation || loading) return;
    setSelected(slug);
    setLoading(true);
    assembleMutation.mutate({
      missionId,
      brandId,
      workspace: "strategy",
      squadType: slug,
    });
  };

  if (confirmed) {
    return (
      <div style={{
        padding: "12px 14px",
        background: "#F0FDF8",
        border: "1px solid #1DBEAA",
        borderRadius: 10,
        fontSize: 12,
        color: "#1A1A18",
      }}>
        ✅ 小組已召集！請切換到「👥 成員」tab 查看進度。
      </div>
    );
  }

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{
        fontSize: 11, color: "#9B9990", marginBottom: 10,
        fontWeight: 500,
      }}>
        🎯 PM 為這個任務推薦了 {squads.length} 個小組，選一個確認組隊：
      </div>

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
        {squads.map((sq, i) => {
          const isSelected = selected === sq.slug;
          const isLoading = isSelected && loading;

          return (
            <div key={sq.slug} style={{
              background: isSelected ? "#F0FDF8" : "white",
              border: `1.5px solid ${isSelected ? "#1DBEAA" : "#E4E3E1"}`,
              borderRadius: 10,
              padding: "10px 12px",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.15s",
              opacity: loading && !isSelected ? 0.5 : 1,
            }}
              onClick={() => !loading && handleConfirm(sq.slug)}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1A1A18" }}>
                    {i + 1}. {sq.name}
                  </div>
                  <div style={{ fontSize: 10, color: "#9B9990", marginTop: 2 }}>
                    相關度 {Math.round(sq.similarity * 100)}%
                  </div>
                </div>
                {isLoading && (
                  <div style={{ fontSize: 11, color: "#1DBEAA" }}>召集中...</div>
                )}
                {!loading && (
                  <div style={{
                    fontSize: 10, padding: "3px 8px",
                    background: isSelected ? "#1DBEAA" : "#F5F4F2",
                    color: isSelected ? "white" : "#6B6A66",
                    borderRadius: 6, fontWeight: 600,
                  }}>
                    {isSelected ? "✓ 已選" : "選擇"}
                  </div>
                )}
              </div>

              {/* Description */}
              {sq.description && (
                <div style={{ fontSize: 11, color: "#6B6A66", marginBottom: 8, lineHeight: 1.5 }}>
                  {sq.description.slice(0, 80)}
                </div>
              )}

              {/* Members preview */}
              {sq.members.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                  {sq.members.slice(0, 5).map((m, mi) => (
                    <div key={mi} style={{
                      background: m.isLead ? "#E8FBF7" : "#F5F4F2",
                      border: `1px solid ${m.isLead ? "#1DBEAA" : "#E4E3E1"}`,
                      borderRadius: 5,
                      padding: "2px 6px",
                      fontSize: 10,
                      color: m.isLead ? "#0A8A7A" : "#6B6A66",
                      fontWeight: m.isLead ? 600 : 400,
                    }}>
                      {m.isLead ? "👑 " : ""}{m.name}
                    </div>
                  ))}
                  {sq.members.length === 0 && (
                    <div style={{ fontSize: 10, color: "#C8C7C3" }}>成員載入中...</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
