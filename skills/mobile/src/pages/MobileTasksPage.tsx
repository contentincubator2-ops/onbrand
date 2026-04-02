/**
 * 任務頁面 — 任務模板系統 + 階段性檢查點
 * P0 功能：讓用戶真正完成任務並拿到交付物
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import MobileHeader from "../components/MobileHeader";
import { useI18n } from "@/i18n";
import { taskTemplates, TaskTemplate, TaskStage, categoryLabels } from "../components/TaskTemplates";
import { trpc } from "@/lib/trpc";
import { getDemoData } from "../demoData";
import NotificationCenter from "../components/NotificationCenter";

type TaskStatus = "pending" | "in_progress" | "pending_approval" | "completed";

interface Task {
  id: string;
  title: string;
  templateId: string;
  status: TaskStatus;
  currentStage: number;
  totalStages: number;
  agentName: string;
  agentAvatar: string;
  agentBg: string;
  createdAt: string;
  preview?: string;
}

// 不再使用 MOCK_TASKS，改用 API 獲取真實任務

const STATUS_CONFIG: Record<TaskStatus, { label: string; labelEn: string; color: string; dot: string }> = {
  pending: { label: "待處理", labelEn: "Pending", color: "text-gray-500", dot: "bg-gray-400" },
  in_progress: { label: "進行中", labelEn: "In Progress", color: "text-gray-700", dot: "bg-gray-600" },
  pending_approval: { label: "待審批", labelEn: "Pending Approval", color: "text-amber-600", dot: "bg-amber-500" },
  completed: { label: "已完成", labelEn: "Completed", color: "text-gray-900", dot: "bg-gray-900" },
};

// 角色定義
type UserRole = "all" | "hr" | "finance" | "pm" | "it" | "operations";
const ROLE_CONFIG: Record<UserRole, { label: string; labelEn: string; icon: string }> = {
  all: { label: "全部", labelEn: "All", icon: "👥" },
  hr: { label: "人資", labelEn: "HR", icon: "👤" },
  finance: { label: "財務", labelEn: "Finance", icon: "💰" },
  pm: { label: "專案", labelEn: "PM", icon: "📊" },
  it: { label: "IT", labelEn: "IT", icon: "💻" },
  operations: { label: "營運", labelEn: "Ops", icon: "⚙️" },
};

// 任務類型與角色對應
const TASK_ROLE_MAPPING: Record<string, UserRole[]> = {
  "employee-onboarding": ["hr"],
  "performance-review": ["hr"],
  "expense-report": ["finance"],
  "budget-planning": ["finance"],
  "project-kickoff": ["pm"],
  "meeting-minutes": ["pm"],
  "vendor-contract": ["operations"],
  "system-incident": ["it"],
  "custom-task": ["all"],
};

function useTaskSyncBadge() {
  const [syncLabel, setSyncLabel] = useState<string | null>(null);
  useEffect(() => {
    try {
      const clickup = JSON.parse(localStorage.getItem("taskIntegration_clickup") || "null");
      const asana = JSON.parse(localStorage.getItem("taskIntegration_asana") || "null");
      if (clickup?.connected) setSyncLabel("ClickUp");
      else if (asana?.connected) setSyncLabel("Asana");
    } catch { /* ignore */ }
  }, []);
  return syncLabel;
}

export default function MobileTasksPage() {
  const [, navigate] = useLocation();
  const { locale, t } = useI18n();
  const syncLabel = useTaskSyncBadge();
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [roleFilter, setRoleFilter] = useState<UserRole>("all");
  const [approvalComment, setApprovalComment] = useState("");
  const [rejectingApprovalId, setRejectingApprovalId] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);

  // 檢查是否使用演示資料
  const useDemoData = localStorage.getItem("useDemoData") === "true";
  const demoPersonaId = localStorage.getItem("demoPersonaId");
  const personaDemoTasks = demoPersonaId ? getDemoData(demoPersonaId)?.tasks ?? null : null;

  // 獲取演示任務
  const { data: demoTasks } = trpc.demo.tasks.useQuery(
    { filter },
    { enabled: useDemoData }
  );

  // 獲取任務列表（從幕僚長 API）
  const { data: realTasks, isLoading: tasksLoading, refetch: refetchTasks } = trpc.chiefOfStaff.tasks.useQuery(
    { status: filter },
    { refetchInterval: 10000 } // 每 10 秒刷新一次
  );

  // 獲取待審批列表
  const { data: pendingApprovalsData, refetch: refetchApprovals } = trpc.chiefOfStaff.pendingApprovals.useQuery(
    undefined,
    { refetchInterval: 10000 }
  );

  // 審批通過
  const approveMutation = trpc.chiefOfStaff.approveTask.useMutation({
    onSuccess: () => {
      refetchTasks();
      refetchApprovals();
    },
  });

  // 審批駁回
  const rejectMutation = trpc.chiefOfStaff.rejectTask.useMutation({
    onSuccess: () => {
      setRejectingApprovalId(null);
      setApprovalComment("");
      refetchTasks();
      refetchApprovals();
    },
  });

  // 通知相關
  const { data: unreadData, refetch: refetchUnread } = trpc.notification.unreadCount.useQuery(
    undefined,
    { refetchInterval: 5000 }
  );
  const { data: notificationsData, refetch: refetchNotifications } = trpc.notification.list.useQuery(
    undefined,
    { enabled: showNotifications }
  );
  const markReadMutation = trpc.notification.markRead.useMutation({
    onSuccess: () => { refetchUnread(); refetchNotifications(); },
  });

  // Demo 通知
  const demoNotifications = demoPersonaId ? [
    {
      id: "demo-notif-1",
      type: "approval_required" as const,
      title: "Unilever 提案需要審批",
      message: "Maya 完成了 Unilever 全球提案初稿，等待您確認",
      taskId: "groupm-t2",
      taskTitle: "Q4 全球品牌活動 Pitch 文件",
      fromAI: { id: 1, name: "Maya" },
      createdAt: new Date(Date.now() - 2.5 * 60 * 60 * 1000),
      actionRequired: true,
    },
    {
      id: "demo-notif-2",
      type: "task_complete" as const,
      title: "Nike 競品分析完成",
      message: "Ryan 完成了 W42 競品監測，發現 Adidas 短影音投放增加 38%",
      taskId: "groupm-t3",
      taskTitle: "競品廣告監測週報 W42",
      fromAI: { id: 2, name: "Ryan" },
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      actionRequired: false,
    },
    {
      id: "demo-notif-3",
      type: "stage_complete" as const,
      title: "Outlook Calendar 已連接",
      message: "下週有 3 個會議需要確認時間",
      taskId: "",
      taskTitle: "",
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
      actionRequired: false,
    },
  ] : [];
  const notificationBadgeCount = demoPersonaId
    ? demoNotifications.length
    : (unreadData?.count ?? 0);
  const allNotifications = [...demoNotifications, ...(notificationsData?.notifications ?? [])];

  // 獲取選中模板的 AI 員工配對
  const { data: agentMapping } = trpc.task.getAgentMapping.useQuery(
    { taskType: selectedTemplate?.id || "" },
    { enabled: !!selectedTemplate }
  );
  
  // 格式化時間
  const formatTime = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return locale === "zh" ? "剛剛" : "Just now";
    if (diffMins < 60) return locale === "zh" ? `${diffMins} 分鐘前` : `${diffMins}m ago`;
    if (diffHours < 24) return locale === "zh" ? `${diffHours} 小時前` : `${diffHours}h ago`;
    if (diffDays < 7) return locale === "zh" ? `${diffDays} 天前` : `${diffDays}d ago`;
    return d.toLocaleDateString("zh-TW");
  };

  // Apple SF Symbols 風格任務圖標 - 根據模板類型返回 SVG
  const TaskIcons: Record<string, React.ReactNode> = {
    "employee-onboarding": (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="7" r="4" /><path d="M5 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    "performance-review": (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 20V10M12 20V4M6 20v-6" />
      </svg>
    ),
    "expense-report": (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 6v12M9 10h6a2 2 0 0 1 0 4H9" />
      </svg>
    ),
    "budget-planning": (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" /><path d="M7 16l4-4 4 4 6-6" />
      </svg>
    ),
    "project-kickoff": (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    "meeting-minutes": (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
    "vendor-contract": (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    "system-incident": (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    "custom-task": (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    default: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  };

  const getTemplateIcon = (templateId: string): React.ReactNode => {
    return TaskIcons[templateId] || TaskIcons.default;
  };

  const handleSelectTemplate = (template: TaskTemplate) => {
    setSelectedTemplate(template);
  };

  const handleStartTask = () => {
    if (selectedTemplate) {
      // 實際會創建任務並導航到任務執行頁面
      navigate(`/task/new?template=${selectedTemplate.id}`);
      setShowTemplates(false);
      setSelectedTemplate(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <MobileHeader
        title={t("tasks.title")}
        rightAction={
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowNotifications(true); refetchNotifications(); }}
              className="relative w-9 h-9 flex items-center justify-center active:bg-gray-100 rounded-full transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {notificationBadgeCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                  {notificationBadgeCount > 9 ? "9+" : notificationBadgeCount}
                </span>
              )}
            </button>
          </div>
        }
      />

      {/* 新增任務按鈕 - 單色設計 */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-3">
        <button
          onClick={() => setShowTemplates(true)}
          className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 text-white rounded-xl font-semibold shadow-md active:scale-[0.98] transition-transform"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M10 4v12M4 10h12"/>
          </svg>
          {locale === "zh" ? "建立新任務" : "Create New Task"}
        </button>
      </div>

      {/* 角色篩選 */}
      <div className="flex-shrink-0 px-4 pb-2">
        <p className="text-xs text-gray-500 mb-2">{locale === "zh" ? "依角色篩選" : "Filter by Role"}</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(Object.keys(ROLE_CONFIG) as UserRole[]).map((role) => {
            const cfg = ROLE_CONFIG[role];
            return (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                  roleFilter === role
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                <span>{cfg.icon}</span>
                <span>{locale === "zh" ? cfg.label : cfg.labelEn}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 狀態篩選 */}
      <div className="flex-shrink-0 px-4 pb-3 flex gap-2">
        {(["all", "active", "completed"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === status
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {status === "all" && (locale === "zh" ? "全部" : "All")}
            {status === "active" && (locale === "zh" ? "進行中" : "Active")}
            {status === "completed" && (locale === "zh" ? "已完成" : "Completed")}
          </button>
        ))}
      </div>

      {/* 待審批區塊 */}
      {pendingApprovalsData && pendingApprovalsData.count > 0 && (
        <div className="flex-shrink-0 px-4 pb-2">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-amber-100 border-b border-amber-200">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="text-sm font-semibold text-amber-800">
                {locale === "zh" ? `待審批 (${pendingApprovalsData.count})` : `Pending Approval (${pendingApprovalsData.count})`}
              </span>
            </div>
            <div className="divide-y divide-amber-100">
              {pendingApprovalsData.approvals.map((approval: any) => (
                <div key={approval.id} className="p-4">
                  <p className="text-sm font-medium text-gray-900 mb-0.5">{approval.stageName}</p>
                  {approval.aiSummary && (
                    <p className="text-xs text-gray-600 mb-3 line-clamp-2">{approval.aiSummary}</p>
                  )}
                  {rejectingApprovalId === approval.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={approvalComment}
                        onChange={(e) => setApprovalComment(e.target.value)}
                        placeholder={locale === "zh" ? "請輸入駁回原因（選填）" : "Rejection reason (optional)"}
                        className="w-full text-xs border border-gray-200 rounded-lg p-2 resize-none h-16 focus:outline-none focus:border-amber-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => rejectMutation.mutate({ approvalId: approval.id, comment: approvalComment || undefined })}
                          disabled={rejectMutation.isPending}
                          className="flex-1 py-2 bg-red-500 text-white text-xs font-semibold rounded-lg active:opacity-80"
                        >
                          {locale === "zh" ? "確認駁回" : "Confirm Reject"}
                        </button>
                        <button
                          onClick={() => { setRejectingApprovalId(null); setApprovalComment(""); }}
                          className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg"
                        >
                          {locale === "zh" ? "取消" : "Cancel"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => approveMutation.mutate({ approvalId: approval.id })}
                        disabled={approveMutation.isPending}
                        className="flex-1 py-2 bg-gray-800 text-white text-xs font-semibold rounded-lg active:opacity-80"
                      >
                        {locale === "zh" ? "✓ 通過" : "✓ Approve"}
                      </button>
                      <button
                        onClick={() => setRejectingApprovalId(approval.id)}
                        className="flex-1 py-2 bg-red-100 text-red-600 text-xs font-semibold rounded-lg active:opacity-80"
                      >
                        {locale === "zh" ? "✗ 駁回" : "✗ Reject"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 任務列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {personaDemoTasks ? (
          // Demo 模式：顯示展示任務
          personaDemoTasks
            .filter((task) => {
              if (filter === "completed") return task.status === "completed";
              if (filter === "active") return task.status !== "completed";
              return true;
            })
            .map((task) => {
            const statusCfg = STATUS_CONFIG[task.status as TaskStatus] || STATUS_CONFIG.pending;
            const progress = task.totalStages > 0 ? (task.currentStage / task.totalStages) * 100 : 0;
            const primaryAgent = task.assignedAgents?.[0];
            return (
              <div
                key={task.id}
                className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left"
              >
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-500">{formatTime(task.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                    <span className={`text-xs font-medium ${statusCfg.color}`}>
                      {locale === "zh" ? statusCfg.label : statusCfg.labelEn}
                    </span>
                  </div>
                </div>
                <p className="font-semibold text-gray-900 text-sm mb-1.5 line-clamp-2">{task.title}</p>
                {task.description && (
                  <p className="text-xs text-gray-500 line-clamp-2 mb-3">{task.description}</p>
                )}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">
                      {locale === "zh" ? `階段 ${task.currentStage}/${task.totalStages}` : `Stage ${task.currentStage}/${task.totalStages}`}
                    </span>
                    <span className="text-xs text-gray-400">{Math.round(progress)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-700 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {task.assignedAgents.slice(0, 3).map((agent) => (
                        <div
                          key={agent.id}
                          className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-white"
                        >
                          {agent.name?.charAt(0) || "?"}
                        </div>
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">
                      {primaryAgent?.name || t("tasks.unassigned")}
                      {task.assignedAgents.length > 1 && ` +${task.assignedAgents.length - 1}`}
                    </span>
                  </div>
                  {syncLabel && (
                    <span className="text-[10px] font-medium text-indigo-500">✓ {syncLabel}</span>
                  )}
                </div>
              </div>
            );
          })
        ) : !realTasks || realTasks.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round">
                <rect x="4" y="6" width="24" height="20" rx="2"/>
                <path d="M4 12h24M12 6v6"/>
              </svg>
            </div>
            <p className="text-gray-500 text-sm">{t("tasks.noTasks")}</p>
            <p className="text-gray-400 text-xs mt-1">
              {locale === "zh" ? "點擊上方按鈕建立第一個任務" : "Click the button above to create your first task"}
            </p>
          </div>
        ) : tasksLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 mx-auto mb-4 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">{t("common.loading")}</p>
          </div>
        ) : (
          ((useDemoData ? demoTasks : realTasks) || [])
            .filter((task: any) => {
              // 角色篩選
              if (roleFilter === "all") return true;
              const taskRoles = TASK_ROLE_MAPPING[task.templateId || task.department] || ["all"];
              return taskRoles.includes(roleFilter) || taskRoles.includes("all");
            })
            .map((task: any) => {
            const statusCfg = STATUS_CONFIG[task.status as TaskStatus] || STATUS_CONFIG.pending;
            const progress = (task.currentStage / task.totalStages) * 100;
            const primaryAgent = task.assignedAgents?.[0];
            
            return (
              <button
                key={task.id}
                onClick={() => navigate(`/task/${task.id}`)}
                className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left active:bg-gray-50 transition-colors"
              >
                {/* 頂部：狀態 */}
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-500">{formatTime(task.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                    <span className={`text-xs font-medium ${statusCfg.color}`}>
                      {locale === "zh" ? statusCfg.label : statusCfg.labelEn}
                    </span>
                  </div>
                </div>

                {/* 標題 */}
                <p className="font-semibold text-gray-900 text-sm mb-1.5 line-clamp-2">{task.title}</p>

                {/* 描述 */}
                {task.description && (
                  <p className="text-xs text-gray-500 line-clamp-2 mb-3">{task.description}</p>
                )}

                {/* 進度條 */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">
                      {locale === "zh" ? `階段 ${task.currentStage}/${task.totalStages}` : `Stage ${task.currentStage}/${task.totalStages}`}
                    </span>
                    <span className="text-xs text-gray-400">{Math.round(progress)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gray-700 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* 底部：AI 員工列表 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* 顯示所有分配的 AI 員工（最多 3 個） */}
                    <div className="flex -space-x-2">
                      {(task.assignedAgents || []).slice(0, 3).map((agent: any, i: number) => (
                        <div
                          key={agent.id}
                          className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-white"
                          title={agent.name}
                        >
                          {agent.name?.charAt(0) || "?"}
                        </div>
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">
                      {primaryAgent?.name || t("tasks.unassigned")}
                      {(task.assignedAgents?.length || 0) > 1 && ` +${task.assignedAgents.length - 1}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {syncLabel && (
                      <span className="text-[10px] font-medium text-gray-500">✓ {syncLabel}</span>
                    )}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* 任務模板選擇 Modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          {/* Modal Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button
              onClick={() => {
                setShowTemplates(false);
                setSelectedTemplate(null);
              }}
              className="text-gray-500 text-sm"
            >
              {locale === "zh" ? "取消" : "Cancel"}
            </button>
            <h2 className="font-semibold text-gray-900">
              {locale === "zh" ? "選擇任務模板" : "Choose Template"}
            </h2>
            <div className="w-10" />
          </div>

          {/* Template List or Detail */}
          <div className="flex-1 overflow-y-auto">
            {selectedTemplate ? (
              /* Template Detail View */
              <div className="p-4">
                {/* Template Header */}
                <div className="text-center mb-6">
                  <div className="w-12 h-12 mx-auto mb-3 flex items-center justify-center bg-gray-100 rounded-2xl">
                    {getTemplateIcon(selectedTemplate.id)}
                  </div>
                  <h3 className="font-bold text-lg text-gray-900">
                    {locale === "zh" ? selectedTemplate.name : selectedTemplate.nameEn}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {locale === "zh" ? selectedTemplate.description : selectedTemplate.descriptionEn}
                  </p>
                  <div className="flex items-center justify-center gap-3 mt-3">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-full flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                      </svg>
                      {selectedTemplate.estimatedTime}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-full flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
                      </svg>
                      {selectedTemplate.outputFormats.map(f => f.toUpperCase()).join(", ")}
                    </span>
                  </div>
                </div>

                {/* AI 員工配對 */}
                {agentMapping && (
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-4 mb-6 border border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3C3C43" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" /><circle cx="12" cy="5" r="3" />
                      </svg>
                      <h4 className="font-semibold text-gray-900 text-sm">
                        {locale === "zh" ? "AI 員工已就緒" : "AI Agent Ready"}
                      </h4>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center text-white font-bold overflow-hidden">
                        {agentMapping.primary?.avatar ? (
                          <img src={agentMapping.primary.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          agentMapping.primary?.name?.charAt(0) || "AI"
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 text-sm">
                          {agentMapping.primary?.name || agentMapping.primary?.englishName}
                        </p>
                        <p className="text-xs text-gray-500">{agentMapping.primary?.title}</p>
                      </div>
                    </div>
                    {agentMapping.humanApprover && (
                      <div className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="7" r="4" /><path d="M5 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" />
                        </svg>
                        <p className="text-xs text-gray-600">
                          <span className="text-gray-700 font-medium">{locale === "zh" ? "需要審批" : "Approval required"}: </span>
                          {agentMapping.humanApprover}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Stages */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-900 text-sm">
                    {locale === "zh" ? "執行階段" : "Execution Stages"}
                  </h4>
                  {selectedTemplate.stages.map((stage, index) => (
                    <div key={stage.id} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 text-sm">
                            {locale === "zh" ? stage.name : stage.nameEn}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {locale === "zh" ? stage.description : stage.descriptionEn}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {(locale === "zh" ? stage.checklist : stage.checklistEn).map((item, i) => (
                              <span key={i} className="text-[10px] bg-white text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Start Button */}
                <div className="mt-6 space-y-2">
                  <button
                    onClick={handleStartTask}
                    className="w-full py-3.5 bg-gray-900 text-white rounded-xl font-semibold shadow-md active:scale-[0.98] transition-transform"
                  >
                    {locale === "zh" ? "開始任務" : "Start Task"}
                  </button>
                  <button
                    onClick={() => setSelectedTemplate(null)}
                    className="w-full py-3 text-gray-500 text-sm"
                  >
                    {locale === "zh" ? "返回選擇其他模板" : "Back to templates"}
                  </button>
                </div>
              </div>
            ) : (
              /* Template Grid */
              <div className="p-4 grid grid-cols-2 gap-3">
                {taskTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    className="bg-white rounded-2xl border border-gray-100 p-4 text-left active:bg-gray-50 transition-colors"
                  >
                    <div className="w-10 h-10 mb-2 bg-gray-100 rounded-xl flex items-center justify-center">
                      {getTemplateIcon(template.id)}
                    </div>
                    <p className="font-semibold text-gray-900 text-sm">
                      {locale === "zh" ? template.name : template.nameEn}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {locale === "zh" ? template.description : template.descriptionEn}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-gray-400">⏱ {template.estimatedTime}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 通知中心 */}
      {showNotifications && (
        <NotificationCenter
          notifications={allNotifications}
          onClose={() => setShowNotifications(false)}
          onNotificationClick={(notification) => {
            markReadMutation.mutate({ notificationId: notification.id });
            setShowNotifications(false);
            // 如果是需要審批的通知，捲動到待審批區域
            if (notification.type === "approval_required") {
              refetchApprovals();
            }
          }}
          onMarkAllRead={() => {
            markReadMutation.mutate({ markAllRead: true });
          }}
        />
      )}
    </div>
  );
}
