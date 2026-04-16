import React, { useState } from "react";
import { WORKSPACE_SQUADS, type SquadOption } from "../../data/taskSquads";

interface SuggestedTask {
    label: string;
    description: string;
}

interface MissionHomePageProps {
    brandName?: string;
    workspace?: string;
    missionTitle?: string;
    missionId?: number | null;
    isExiting?: boolean;
    onTaskSelect?: (task: string) => void;
    onSquadPreview?: (squad: SquadOption | null, allSquads: SquadOption[]) => void;
}

const WORKSPACE_LABELS: Record<string, string> = {
    strategy: "策略定位",
    website: "官網優化",
    facebook: "Facebook 行銷",
    global: "全資源庫",
};

const SUGGESTED_TASKS: Record<string, SuggestedTask[]> = {
    strategy: [
      { label: "品牌定位分析", description: "分析競品並建立差異化定位策略" },
      { label: "目標市場研究", description: "深入了解目標受眾與市場趨勢" },
      { label: "品牌故事撰寫", description: "打造引人共鳴的品牌核心敘事" },
      { label: "競品情報收集", description: "系統性分析競爭對手的策略佈局" },
    ],
    website: [
      { label: "首頁文案優化", description: "改寫主視覺與 Hero Section 文案" },
      { label: "SEO 內容策略", description: "規劃關鍵字布局與內容架構" },
      { label: "產品頁面撰寫", description: "撰寫轉換率最大化的產品描述" },
      { label: "Landing Page 設計", description: "打造高轉換的活動落地頁" },
    ],
    facebook: [
      { label: "廣告文案創作", description: "撰寫高點擊率的 FB/IG 廣告素材" },
      { label: "視覺素材規劃", description: "規劃貼文視覺風格與創意方向" },
      { label: "內容行事曆", description: "建立一個月社群發文計劃" },
      { label: "廣告投放策略", description: "規劃 ROAS 最優化的廣告架構" },
    ],
};

const DEFAULT_TASKS: SuggestedTask[] = [
  { label: "啟動品牌策略任務", description: "讓 AI 代理團隊協助制定完整品牌策略" },
  { label: "市場競品分析", description: "快速獲得競品深度分析報告" },
  { label: "行銷文案撰寫", description: "AI 代理團隊產出高轉換率文案" },
  { label: "廣告投放規劃", description: "最大化廣告 ROAS 的策略規劃" },
];

export const MissionHomePage: React.FC<MissionHomePageProps> = ({
    brandName,
    workspace = "global",
    missionTitle,
    isExiting = false,
    onTaskSelect,
    onSquadPreview,
}) => {
    const [inputValue, setInputValue] = useState("");
    const [selectedSquad, setSelectedSquad] = useState<SquadOption | null>(null);

    const wsLabel = WORKSPACE_LABELS[workspace] ?? workspace;
    const tasks = SUGGESTED_TASKS[workspace] ?? DEFAULT_TASKS;
    const squads = WORKSPACE_SQUADS[workspace] ?? [];

    const titleText = missionTitle
        ? `${missionTitle} 任務啟動`
        : `${wsLabel} 任務啟動`;

    const handleSubmit = () => {
        if (inputValue.trim() && onTaskSelect) {
            onTaskSelect(inputValue.trim());
            setInputValue("");
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <>
            <style>{`
                @keyframes mhpExit {
                    from { transform: translateY(0); opacity: 1; }
                    to   { transform: translateY(-24px); opacity: 0; }
                }
            `}</style>
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    overflowY: "auto",
                    padding: "40px 20px 80px",
                    background: "#FFFFFF",
                    animation: isExiting ? "mhpExit 0.35s ease forwards" : undefined,
                }}
            >
                {/* A. Header */}
                <div style={{ maxWidth: 600, textAlign: "center", marginBottom: 28 }}>
                    <div style={{ fontSize: 24, fontWeight: 600, color: "#1A1A18", marginBottom: 6 }}>
                        {titleText}
                    </div>
                    <div style={{ fontSize: 13, color: "#9B9990" }}>
                        選擇執行方式，輸入任務需求
                    </div>
                </div>

                {/* B. Input box */}
                <div
                    style={{
                        width: "100%",
                        maxWidth: 620,
                        background: "#F9F9F8",
                        border: "1.5px solid #E2E8F0",
                        borderRadius: 16,
                        padding: "14px 16px 10px",
                        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                        marginBottom: 12,
                    }}
                >
                    <textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={`描述你的${wsLabel}任務需求...`}
                        rows={2}
                        style={{
                            width: "100%",
                            border: "none",
                            outline: "none",
                            resize: "none",
                            fontSize: 14,
                            color: "#1A1A18",
                            lineHeight: 1.6,
                            background: "transparent",
                            fontFamily: "inherit",
                            boxSizing: "border-box",
                        }}
                    />
                    <div style={{ display: "flex", flexDirection: "row", justifyContent: "flex-end" }}>
                        <button
                            onClick={handleSubmit}
                            disabled={!inputValue.trim()}
                            style={{
                                background: inputValue.trim() ? "#1A1A18" : "#E8EAF0",
                                color: "#FFFFFF",
                                border: "none",
                                borderRadius: 10,
                                padding: "8px 16px",
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: inputValue.trim() ? "pointer" : "not-allowed",
                                transition: "all 0.2s",
                                whiteSpace: "nowrap",
                            }}
                        >
                            啟動任務 →
                        </button>
                    </div>
                </div>

                {/* C. Squad chips */}
                {squads.length > 0 && (
                    <div
                        style={{
                            maxWidth: 620,
                            width: "100%",
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 6,
                            justifyContent: "center",
                            marginBottom: 24,
                        }}
                    >
                        {squads.map((squad) => {
                            const isSelected = selectedSquad?.squadSlug === squad.squadSlug;
                            return (
                                <button
                                    key={squad.squadSlug}
                                    onClick={() => {
                                        const newSquad = isSelected ? null : squad;
                                        setSelectedSquad(newSquad);
                                        onSquadPreview?.(newSquad, squads);
                                    }}
                                    style={{
                                        borderRadius: 20,
                                        padding: "5px 12px",
                                        fontSize: 12,
                                        fontWeight: 500,
                                        cursor: "pointer",
                                        border: isSelected ? "1px solid #1A1A18" : "1px solid #E4E3E1",
                                        background: isSelected ? "#1A1A18" : "#FFFFFF",
                                        color: isSelected ? "#FFFFFF" : "#6B6A66",
                                        transition: "all 0.15s",
                                        fontFamily: "inherit",
                                    }}
                                >
                                    {squad.name}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* D. Suggested tasks */}
                <div style={{ maxWidth: 620, width: "100%" }}>
                    <div
                        style={{
                            fontSize: 11,
                            color: "#C5C5C0",
                            textAlign: "center",
                            marginBottom: 10,
                            letterSpacing: 0.5,
                            textTransform: "uppercase",
                        }}
                    >
                        推薦任務
                    </div>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 8,
                        }}
                    >
                        {tasks.map((task) => (
                            <button
                                key={task.label}
                                onClick={() => setInputValue(task.label)}
                                style={{
                                    background: "#FFFFFF",
                                    border: "1px solid #E8EAF0",
                                    borderRadius: 12,
                                    padding: "10px 14px",
                                    textAlign: "left",
                                    cursor: "pointer",
                                    transition: "border-color 0.15s, box-shadow 0.15s",
                                    fontFamily: "inherit",
                                }}
                                onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = "#C0C0BA";
                                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)";
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = "#E8EAF0";
                                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
                                }}
                            >
                                <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A18", marginBottom: 2 }}>
                                    {task.label}
                                </div>
                                <div style={{ fontSize: 11, color: "#9B9990", lineHeight: 1.5 }}>
                                    {task.description}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
};
