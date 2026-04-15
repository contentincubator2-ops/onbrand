import React, { useState } from "react";
import { trpc } from "../../lib/trpc";
import { TASK_SQUADS, type SquadOption } from "../../data/taskSquads";

interface ResourceSummary {
    agents: number;
    skills: number;
    providers: number;
    mode?: string;
}

interface SuggestedTask {
    label: string;
    description: string;
}

interface MissionHomePageProps {
    brandName?: string;
    workspace?: string;
    missionTitle?: string;
    resourceSummary?: ResourceSummary;
    missionId?: number | null;
    onTaskSelect?: (task: string) => void;
    onSquadSelect?: (taskLabel: string, squad: SquadOption, allSquads: SquadOption[]) => void;
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
      { label: "成長機會識別", description: "找出藍海市場與未開發機會點" },
      { label: "品牌合作提案", description: "策劃跨品牌合作與聯名活動" },
    ],
    website: [
      { label: "首頁文案優化", description: "改寫主視覺與 Hero Section 文案" },
      { label: "SEO 內容策略", description: "規劃關鍵字布局與內容架構" },
      { label: "產品頁面撰寫", description: "撰寫轉換率最大化的產品描述" },
      { label: "Landing Page 設計", description: "打造高轉換的活動落地頁" },
      { label: "使用者體驗分析", description: "找出網站流失率高的痛點" },
      { label: "客戶評價整合", description: "優化社群證明與口碑展示策略" },
    ],
    facebook: [
      { label: "廣告文案創作", description: "撰寫高點擊率的 FB/IG 廣告素材" },
      { label: "視覺素材規劃", description: "規劃貼文視覺風格與創意方向" },
      { label: "內容行事曆", description: "建立一個月社群發文計劃" },
      { label: "廣告投放策略", description: "規劃 ROAS 最優化的廣告架構" },
      { label: "受眾分析報告", description: "深度分析粉絲輪廓與行為模式" },
      { label: "病毒式傳播企劃", description: "策劃高分享性的互動活動" },
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
    resourceSummary,
    missionId,
    onTaskSelect,
    onSquadSelect,
}) => {
    const [inputValue, setInputValue] = useState("");
    const [selectedTask, setSelectedTask] = useState<string | null>(null);

    // Per-mission semantic resource (kept for drawer sync, not displayed here)
    const missionResourceQuery = trpc.resource.summaryByMission.useQuery(
        { missionId: missionId! },
        {
            enabled: !!missionId,
            refetchInterval: (query) => {
                const status = (query.state.data as any)?.status;
                return status === "ready" || status === "error" ? false : 2000;
            },
        }
    );
    void missionResourceQuery; // suppress unused warning — data flows to drawer via AppShell

    const wsLabel = WORKSPACE_LABELS[workspace] ?? workspace;
    const tasks = SUGGESTED_TASKS[workspace] ?? DEFAULT_TASKS;

    // Title: mission name takes priority, then brand+workspace, then workspace alone
    const titleText = missionTitle
        ? `${missionTitle} 任務啟動`
        : brandName
        ? `${brandName} · ${wsLabel}`
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

    if (selectedTask !== null) {
        const squads = TASK_SQUADS[selectedTask] ?? [];
        return (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    height: "100%",
                    overflowY: "auto",
                    padding: "40px 20px 120px",
                    background: "linear-gradient(180deg, #F8F9FC 0%, #FFFFFF 100%)",
                }}
            >
                <div style={{ width: "100%", maxWidth: 640 }}>
                    <button
                        onClick={() => setSelectedTask(null)}
                        style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: 13,
                            color: "#6B6A66",
                            padding: "0 0 20px 0",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontFamily: "inherit",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#1A1A18"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6B6A66"; }}
                    >
                        ← 返回
                    </button>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1A1A18", marginBottom: 4 }}>
                        {selectedTask}
                    </h2>
                    <p style={{ fontSize: 13, color: "#9B9990", marginBottom: 20 }}>選擇執行方式</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        {squads.map((squad) => (
                            <button
                                key={squad.squadSlug}
                                onClick={() => {
                                    const allSquads = TASK_SQUADS[selectedTask] ?? [];
                                    onSquadSelect?.(selectedTask, squad, allSquads);
                                    setSelectedTask(null);
                                }}
                                style={{
                                    background: "#FFFFFF",
                                    border: "1px solid #E8EAF0",
                                    borderRadius: 12,
                                    padding: "12px 14px",
                                    textAlign: "left",
                                    cursor: "pointer",
                                    transition: "border-color 0.15s",
                                    fontFamily: "inherit",
                                }}
                                onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = "#C0C0BA";
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = "#E8EAF0";
                                }}
                            >
                                <div style={{ fontWeight: 600, fontSize: 13, color: "#1A1A18", marginBottom: 2 }}>
                                    {squad.name}
                                </div>
                                <div style={{ fontSize: 11, color: "#9B9990", marginBottom: 6 }}>
                                    {squad.leadTitle}
                                </div>
                                <div style={{ fontSize: 12, color: "#6B6A66", marginBottom: 8, lineHeight: 1.5 }}>
                                    {squad.tagline}
                                </div>
                                <div style={{ fontSize: 10, color: "#C0C0BA", lineHeight: 1.4 }}>
                                    {squad.steps.map((s) => s.phase).join(" → ")}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-start",
                height: "100%",
                overflowY: "auto",
                padding: "40px 20px 120px",
                background: "linear-gradient(180deg, #F8F9FC 0%, #FFFFFF 100%)",
            }}
        >
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 32, maxWidth: 600 }}>
                <div
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        background: "#F0F4FF",
                        border: "1px solid #D4E0FF",
                        borderRadius: 20,
                        padding: "4px 14px",
                        marginBottom: 16,
                        fontSize: 12,
                        color: "#5B7FDB",
                        fontWeight: 500,
                    }}
                >
                    A2A 自主代理行銷作業系統
                </div>

                <h1
                    style={{
                        fontSize: 28,
                        fontWeight: 700,
                        color: "#1A1A18",
                        lineHeight: 1.3,
                        marginBottom: 8,
                    }}
                >
                    {titleText}
                </h1>
                <p style={{ fontSize: 14, color: "#9B9990", lineHeight: 1.6 }}>
                    輸入任務需求，AI 代理團隊將自動組建、規劃並執行
                </p>
            </div>

            {/* Search Input */}
            <div
                style={{
                    width: "100%",
                    maxWidth: 640,
                    background: "#FFFFFF",
                    border: "1.5px solid #E2E8F0",
                    borderRadius: 16,
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 10,
                    marginBottom: 28,
                    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
                    transition: "border-color 0.2s",
                }}
            >
                <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`描述你的${wsLabel}任務需求... (Enter 送出)`}
                    rows={2}
                    style={{
                        flex: 1,
                        border: "none",
                        outline: "none",
                        resize: "none",
                        fontSize: 14,
                        color: "#1A1A18",
                        lineHeight: 1.6,
                        background: "transparent",
                        fontFamily: "inherit",
                    }}
                />
                <button
                    onClick={handleSubmit}
                    disabled={!inputValue.trim()}
                    style={{
                        background: inputValue.trim() ? "#1A1A18" : "#E8EAF0",
                        color: inputValue.trim() ? "#FFFFFF" : "#9B9990",
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

            {/* Suggested Tasks */}
            <div style={{ width: "100%", maxWidth: 640 }}>
                <p
                    style={{
                        fontSize: 12,
                        color: "#9B9990",
                        marginBottom: 12,
                        textAlign: "center",
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                    }}
                >
                    推薦任務
                </p>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                        gap: 10,
                    }}
                >
                    {tasks.map((task) => (
                        <button
                            key={task.label}
                            onClick={() => setSelectedTask(task.label)}
                            style={{
                                background: "#FFFFFF",
                                border: "1px solid #E8EAF0",
                                borderRadius: 12,
                                padding: "12px 16px",
                                textAlign: "left",
                                cursor: "pointer",
                                transition: "all 0.15s",
                            }}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.borderColor = "#C0C0BA";
                                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.borderColor = "#E8EAF0";
                                (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
                            }}
                        >
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A18", marginBottom: 2 }}>
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
    );
};
