import React, { useState } from "react";
import { trpc } from "../../lib/trpc";

/**
 * MissionHomePage - Perplexity-style mission landing page
 *
 * Shown when a task/workspace has no messages yet.
 * Displays resource stats, suggested tasks, and a search bar for starting missions.
 *
 * Resource counts (from resource.summary API, confirmed 2025-04):
 *  - strategy: 5,608 agents / 253 skills / 123 AI models
 *  - website:  2,686 agents / 65 skills  / 61 AI models
 *  - facebook: 1,808 agents / 51 skills  / 54 AI models
 */

interface ResourceSummary {
    agents: number;
    skills: number;
    providers: number;
    mode?: string;
}

interface SuggestedTask {
    label: string;
    icon: string;
    description: string;
}

interface MissionHomePageProps {
    brandName?: string;
    workspace?: string;
    resourceSummary?: ResourceSummary;
    missionId?: number | null;
    onTaskSelect?: (task: string) => void;
}

const WORKSPACE_LABELS: Record<string, string> = {
    strategy: "策略定位",
    website: "官網優化",
    facebook: "Facebook 行銷",
    global: "全資源庫",
};

const SUGGESTED_TASKS: Record<string, SuggestedTask[]> = {
    strategy: [
      { icon: "🎯", label: "品牌定位分析", description: "分析競品並建立差異化定位策略" },
      { icon: "📊", label: "目標市場研究", description: "深入了解目標受眾與市場趨勢" },
      { icon: "💡", label: "品牌故事撰寫", description: "打造引人共鳴的品牌核心敘事" },
      { icon: "🔍", label: "競品情報收集", description: "系統性分析競爭對手的策略佈局" },
      { icon: "📈", label: "成長機會識別", description: "找出藍海市場與未開發機會點" },
      { icon: "🤝", label: "品牌合作提案", description: "策劃跨品牌合作與聯名活動" },
        ],
    website: [
      { icon: "✍️", label: "首頁文案優化", description: "改寫主視覺與 Hero Section 文案" },
      { icon: "🔎", label: "SEO 內容策略", description: "規劃關鍵字布局與內容架構" },
      { icon: "📝", label: "產品頁面撰寫", description: "撰寫轉換率最大化的產品描述" },
      { icon: "🖼️", label: "Landing Page 設計", description: "打造高轉換的活動落地頁" },
      { icon: "📱", label: "使用者體驗分析", description: "找出網站流失率高的痛點" },
      { icon: "💬", label: "客戶評價整合", description: "優化社群證明與口碑展示策略" },
        ],
    facebook: [
      { icon: "📣", label: "廣告文案創作", description: "撰寫高點擊率的 FB/IG 廣告素材" },
      { icon: "🎨", label: "視覺素材規劃", description: "規劃貼文視覺風格與創意方向" },
      { icon: "📅", label: "內容行事曆", description: "建立一個月社群發文計劃" },
      { icon: "💰", label: "廣告投放策略", description: "規劃 ROAS 最優化的廣告架構" },
      { icon: "👥", label: "受眾分析報告", description: "深度分析粉絲輪廓與行為模式" },
      { icon: "🚀", label: "病毒式傳播企劃", description: "策劃高分享性的互動活動" },
        ],
};

const DEFAULT_TASKS: SuggestedTask[] = [
  { icon: "🚀", label: "啟動品牌策略任務", description: "讓 AI 代理團隊協助制定完整品牌策略" },
  { icon: "📊", label: "市場競品分析", description: "快速獲得競品深度分析報告" },
  { icon: "✍️", label: "行銷文案撰寫", description: "AI 代理團隊產出高轉換率文案" },
  { icon: "🎯", label: "廣告投放規劃", description: "最大化廣告 ROAS 的策略規劃" },
  ];

function formatNumber(n: number): string {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}萬`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
}

export const MissionHomePage: React.FC<MissionHomePageProps> = ({
    brandName,
    workspace = "global",
    resourceSummary,
    missionId,
    onTaskSelect,
}) => {
    const [inputValue, setInputValue] = useState("");

    // Per-mission semantic resource polling (stops when status === 'ready')
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
    const missionResource = missionId ? (missionResourceQuery.data as (ResourceSummary & { status?: string }) | undefined) : undefined;

    // Fall back to workspace-level summary only when no missionId is provided
    const resourceQuery = trpc.resource.summary.useQuery({ workspace }, { enabled: !resourceSummary && !missionId });
    const effectiveSummary: (ResourceSummary & { status?: string }) | undefined =
        missionResource ?? resourceSummary ?? (resourceQuery.data as ResourceSummary | undefined);

    const isLoading = !!missionId && (!missionResource || (missionResource as any).status === "pending");
    const wsLabel = WORKSPACE_LABELS[workspace] ?? workspace;
    const tasks = SUGGESTED_TASKS[workspace] ?? DEFAULT_TASKS;

    const agents = effectiveSummary?.agents ?? 0;
    const skills = effectiveSummary?.skills ?? 0;
    const providers = effectiveSummary?.providers ?? 0;

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
                                                  gap: 8,
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
                                  <span>🤖</span>
                                  <span>A2A 自主代理行銷作業系統</span>
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
                          {brandName ? `${brandName} · ${wsLabel}` : `${wsLabel} 任務啟動`}
                        </h1>
                        <p style={{ fontSize: 14, color: "#9B9990", lineHeight: 1.6 }}>
                                  輸入任務需求，AI 代理團隊將自動組建、規劃並執行
                        </p>
                </div>
          
            {/* Loading state: semantic matching in progress */}
            {isLoading && (
                <div style={{
                    background: "#F0F4FF",
                    border: "1px solid #D4E0FF",
                    borderRadius: 12,
                    padding: "16px 24px",
                    marginBottom: 24,
                    textAlign: "center",
                    maxWidth: 400,
                    width: "100%",
                }}>
                    <div style={{ fontSize: 16, marginBottom: 8 }}>⚙️</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#3B5BD5", marginBottom: 6 }}>
                        正在為此任務配對最佳 AI 代理人選…
                    </div>
                    <div style={{
                        height: 4,
                        background: "#E0E7FF",
                        borderRadius: 2,
                        overflow: "hidden",
                    }}>
                        <div style={{
                            height: "100%",
                            background: "linear-gradient(90deg, #5B7FDB 0%, #A5B4FC 50%, #5B7FDB 100%)",
                            backgroundSize: "200% 100%",
                            animation: "shimmer 1.5s infinite linear",
                            borderRadius: 2,
                        }} />
                    </div>
                    <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
                    <div style={{ fontSize: 11, color: "#9B9990", marginTop: 8 }}>
                        由 text-embedding-3-large 語意搜尋驅動
                    </div>
                </div>
            )}

          
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
                                                                onClick={() => {
                                                                                  if (onTaskSelect) onTaskSelect(task.label);
                                                                }}
                                                                style={{
                                                                                  background: "#FFFFFF",
                                                                                  border: "1px solid #E8EAF0",
                                                                                  borderRadius: 12,
                                                                                  padding: "12px 16px",
                                                                                  textAlign: "left",
                                                                                  cursor: "pointer",
                                                                                  transition: "all 0.15s",
                                                                                  display: "flex",
                                                                                  alignItems: "flex-start",
                                                                                  gap: 10,
                                                                }}
                                                                onMouseEnter={(e) => {
                                                                                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#5B7FDB";
                                                                                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(91,127,219,0.15)";
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#E8EAF0";
                                                                                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
                                                                }}
                                                              >
                                                              <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{task.icon}</span>
                                                              <div>
                                                                              <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A18", marginBottom: 2 }}>
                                                                                {task.label}
                                                                              </div>
                                                                              <div style={{ fontSize: 11, color: "#9B9990", lineHeight: 1.5 }}>
                                                                                {task.description}
                                                                              </div>
                                                              </div>
                                                </button>
                                              ))}
                        </div>
                </div>
          
            {/* Footer hint */}
                <p
                          style={{
                                      marginTop: 32,
                                      fontSize: 11,
                                      color: "#C5C5C0",
                                      textAlign: "center",
                          }}
                        >
                        由 text-embedding-3-large 語意搜尋驅動
                </p>
          </div>
        );
};
