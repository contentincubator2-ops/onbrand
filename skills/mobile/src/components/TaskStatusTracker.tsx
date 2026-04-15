/**
 * 任務狀態追蹤組件
 * 顯示：AI 處理中 → 等待審批 → 完成
 */
import { useState, useEffect } from "react";

export type TaskStatus = "pending" | "ai_processing" | "waiting_approval" | "approved" | "completed" | "rejected";

interface TaskStage {
  id: number;
  name: string;
  status: TaskStatus;
  assignTo: "ai" | "human" | "both";
  aiAgent?: {
    id: number;
    name: string;
    avatar?: string;
  };
  humanApprover?: string;
  completedAt?: Date;
  note?: string;
}

interface Props {
  stages: TaskStage[];
  currentStageIndex: number;
  onApprove?: (stageId: number) => void;
  onReject?: (stageId: number, reason: string) => void;
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bgColor: string; icon: string }> = {
  pending: { label: "待開始", color: "#8E8E93", bgColor: "#F2F2F7", icon: "○" },
  ai_processing: { label: "AI 處理中", color: "#007AFF", bgColor: "#E8F4FD", icon: "⟳" },
  waiting_approval: { label: "等待審批", color: "#FF9500", bgColor: "#FFF4E6", icon: "!" },
  approved: { label: "已核准", color: "#34C759", bgColor: "#E8FAF0", icon: "✓" },
  completed: { label: "已完成", color: "#34C759", bgColor: "#E8FAF0", icon: "✓" },
  rejected: { label: "已退回", color: "#FF3B30", bgColor: "#FFEBEA", icon: "✗" },
};

export default function TaskStatusTracker({ stages, currentStageIndex, onApprove, onReject }: Props) {
  const [processingDots, setProcessingDots] = useState(0);

  // AI 處理中的動畫
  useEffect(() => {
    const currentStage = stages[currentStageIndex];
    if (currentStage?.status === "ai_processing") {
      const interval = setInterval(() => {
        setProcessingDots(d => (d + 1) % 4);
      }, 400);
      return () => clearInterval(interval);
    }
  }, [stages, currentStageIndex]);

  return (
    <div className="bg-white rounded-2xl border border-[#E5E5EA] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-[#F2F2F7] border-b border-[#E5E5EA]">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#8E8E93] uppercase tracking-wide">任務進度</span>
          <span className="text-[13px] text-[#1C1C1E] font-medium">
            {currentStageIndex + 1} / {stages.length}
          </span>
        </div>
        
        {/* Progress bar */}
        <div className="mt-2 h-1.5 bg-[#E5E5EA] rounded-full overflow-hidden">
          <div 
            className="h-full bg-[#1C1C1E] rounded-full transition-all duration-500"
            style={{ width: `${((currentStageIndex + 1) / stages.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Stages */}
      <div className="divide-y divide-[#F2F2F7]">
        {stages.map((stage, index) => {
          const config = STATUS_CONFIG[stage.status];
          const isCurrent = index === currentStageIndex;
          const isPast = index < currentStageIndex;
          
          return (
            <div 
              key={stage.id} 
              className={`px-4 py-3 ${isCurrent ? "bg-[#FAFAFA]" : ""}`}
            >
              <div className="flex items-start gap-3">
                {/* Status indicator */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  isPast || stage.status === "completed" || stage.status === "approved"
                    ? "bg-[#1C1C1E]"
                    : isCurrent
                    ? `bg-[${config.bgColor}]`
                    : "bg-[#F2F2F7]"
                }`}>
                  {isPast || stage.status === "completed" || stage.status === "approved" ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : stage.status === "ai_processing" ? (
                    <div className="w-3 h-3 border-2 border-[#007AFF] border-t-transparent rounded-full animate-spin" />
                  ) : stage.status === "waiting_approval" ? (
                    <span className="text-[#FF9500] text-xs font-bold">!</span>
                  ) : (
                    <span className="text-[#8E8E93] text-xs">{index + 1}</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-[15px] font-medium ${
                      isPast ? "text-[#8E8E93]" : "text-[#1C1C1E]"
                    }`}>
                      {stage.name}
                    </span>
                    
                    {/* Status badge */}
                    {(isCurrent || stage.status !== "pending") && (
                      <span 
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ color: config.color, backgroundColor: config.bgColor }}
                      >
                        {stage.status === "ai_processing" 
                          ? `AI 處理中${".".repeat(processingDots)}`
                          : config.label
                        }
                      </span>
                    )}
                  </div>

                  {/* AI Agent info */}
                  {stage.aiAgent && (stage.assignTo === "ai" || stage.assignTo === "both") && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#E8611A] to-[#FF8A50] flex items-center justify-center overflow-hidden">
                        {stage.aiAgent.avatar ? (
                          <img src={stage.aiAgent.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white text-[10px] font-semibold">{stage.aiAgent.name?.charAt(0)}</span>
                        )}
                      </div>
                      <span className="text-[13px] text-[#8E8E93]">
                        {stage.aiAgent.name} {stage.assignTo === "both" ? "+ 真人審批" : ""}
                      </span>
                    </div>
                  )}

                  {/* Human approver */}
                  {stage.humanApprover && stage.assignTo === "human" && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="w-5 h-5 rounded-full bg-[#F2F2F7] flex items-center justify-center">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                      <span className="text-[13px] text-[#8E8E93]">{stage.humanApprover}</span>
                    </div>
                  )}

                  {/* Approval buttons */}
                  {isCurrent && stage.status === "waiting_approval" && onApprove && onReject && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => onApprove(stage.id)}
                        className="flex-1 py-2 bg-[#34C759] text-white rounded-lg text-[13px] font-semibold"
                      >
                        核准
                      </button>
                      <button
                        onClick={() => onReject(stage.id, "")}
                        className="flex-1 py-2 bg-[#F2F2F7] text-[#FF3B30] rounded-lg text-[13px] font-semibold"
                      >
                        退回
                      </button>
                    </div>
                  )}

                  {/* Completion note */}
                  {stage.note && (
                    <p className="text-[13px] text-[#8E8E93] mt-1.5 italic">{stage.note}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
