import { useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";
import TaskCard from "../components/TaskCard";
import LoadingSpinner from "../components/LoadingSpinner";

// ── Icons ──────────────────────────────────────────────────────────────────
const IconRocket  = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>;
const IconUsers   = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const IconBolt    = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
const IconArrow   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>;
const IconTarget  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;
const IconList    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
const IconBrand   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed:   "bg-green-100 text-green-700",
    in_progress: "bg-yellow-100 text-yellow-700",
    pending:     "bg-gray-100 text-gray-600",
    failed:      "bg-red-100 text-red-600",
    cancelled:   "bg-gray-100 text-gray-400",
    review:      "bg-blue-100 text-blue-700",
  };
  const label: Record<string, string> = {
    completed:   "已完成",
    in_progress: "執行中",
    pending:     "等待中",
    failed:      "失敗",
    cancelled:   "已取消",
    review:      "審核中",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-500"}`}>
      {status === "in_progress" && <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mr-1.5 animate-pulse" />}
      {label[status] ?? status}
    </span>
  );
}

// ── A2A Architecture Diagram ───────────────────────────────────────────────
function A2ADiagram() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-700 mb-5">🤖 A2A 多代理架構</h2>
      <div className="flex items-center justify-center gap-0 overflow-x-auto pb-2">
        {/* CMO Node */}
        <div className="flex flex-col items-center">
          <div className="w-28 rounded-xl border-2 border-purple-400 bg-purple-50 p-3 text-center shadow-sm">
            <div className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center text-lg mx-auto mb-2">👔</div>
            <p className="text-xs font-bold text-purple-700">CMO</p>
            <p className="text-[10px] text-purple-500 mt-0.5">策略層</p>
            <p className="text-[10px] text-gray-500 mt-1 leading-tight">制定目標<br/>分配任務</p>
          </div>
        </div>

        {/* Arrow 1 */}
        <div className="flex flex-col items-center px-2">
          <div className="flex items-center gap-1">
            <div className="w-8 h-0.5 bg-indigo-300" />
            <div className="w-0 h-0 border-t-4 border-b-4 border-l-6 border-t-transparent border-b-transparent border-l-indigo-400" style={{ borderLeftWidth: 8 }} />
          </div>
          <p className="text-[9px] text-gray-400 mt-1">指派</p>
        </div>

        {/* PM Node */}
        <div className="flex flex-col items-center">
          <div className="w-28 rounded-xl border-2 border-blue-400 bg-blue-50 p-3 text-center shadow-sm">
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg mx-auto mb-2">🧭</div>
            <p className="text-xs font-bold text-blue-700">策略 PM</p>
            <p className="text-[10px] text-blue-500 mt-0.5">執行層</p>
            <p className="text-[10px] text-gray-500 mt-1 leading-tight">拆解任務<br/>協調執行</p>
          </div>
        </div>

        {/* Arrow 2 */}
        <div className="flex flex-col items-center px-2">
          <div className="flex items-center gap-1">
            <div className="w-8 h-0.5 bg-indigo-300" />
            <div className="w-0 h-0 border-t-4 border-b-4 border-t-transparent border-b-transparent" style={{ borderLeft: "8px solid #818cf8" }} />
          </div>
          <p className="text-[9px] text-gray-400 mt-1">觸發</p>
        </div>

        {/* Specialists */}
        <div className="flex flex-col gap-2">
          {[
            { emoji: "✍️", name: "文案專家",   color: "green" },
            { emoji: "📊", name: "數據分析師", color: "green" },
            { emoji: "🎯", name: "品牌策略師", color: "green" },
          ].map((s) => (
            <div key={s.name} className="w-28 rounded-lg border-2 border-green-300 bg-green-50 px-3 py-2 text-center shadow-sm">
              <span className="text-sm">{s.emoji}</span>
              <p className="text-[10px] font-semibold text-green-700 mt-0.5">{s.name}</p>
              <p className="text-[9px] text-green-500">訓練層</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-center text-xs text-gray-400 mt-4">
        OpenClaw 自動編排 · 任務完成後觸發下一步 · 全程可追蹤
      </p>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();

  const { data: balance,    isLoading: balanceLoading  } = trpc.credits.getBalance.useQuery();
  const { data: tasks,      isLoading: tasksLoading    } = trpc.task.list.useQuery({ limit: 5 });
  const { data: recentTasks, isLoading: recentLoading  } = trpc.task.listRecent.useQuery({ limit: 8 });
  const { data: agentCounts, isLoading: agentLoading   } = trpc.agent.countByLayer.useQuery();

  const runningCount = recentTasks?.filter((t) => t.status === "in_progress").length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mission Control 🚀</h1>
          <p className="text-gray-500 mt-1 text-sm">SoWork Enterprise AI 行銷指揮中心</p>
        </div>
        <button
          onClick={() => navigate("/chat")}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <IconBolt /> 啟動任務
        </button>
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Credits */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">可用 Credits</p>
          {balanceLoading ? <LoadingSpinner size="sm" /> : (
            <>
              <p className="text-2xl font-bold text-indigo-600">
                {(balance?.planCredits ?? 0) + (balance?.extraCredits ?? 0)}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">方案 {balance?.planCredits ?? 0} ＋ 加購 {balance?.extraCredits ?? 0}</p>
            </>
          )}
        </div>

        {/* Total agents */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">AI 人才總數</p>
          {agentLoading ? <LoadingSpinner size="sm" /> : (
            <>
              <p className="text-2xl font-bold text-gray-900">{agentCounts?.total ?? 0}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">可用 agents</p>
            </>
          )}
        </div>

        {/* Running tasks */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">執行中任務</p>
          <p className="text-2xl font-bold text-yellow-600">{runningCount}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {runningCount > 0 ? "OpenClaw 自動執行中" : "目前無進行中"}
          </p>
        </div>

        {/* System status */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">系統狀態</p>
          <p className="text-2xl font-bold text-green-600">正常</p>
          <p className="text-[10px] text-gray-400 mt-0.5">所有服務運行中</p>
        </div>
      </div>

      {/* Agent layer breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-700 mb-4">
          <span className="mr-2">👥</span>AI 人才層級分佈
        </h2>
        {agentLoading ? <LoadingSpinner message="載入人才數據..." /> : (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-purple-50 border border-purple-100 p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center text-base mx-auto mb-2">👔</div>
              <p className="text-2xl font-bold text-purple-700">{agentCounts?.strategy ?? 0}</p>
              <p className="text-xs font-semibold text-purple-600 mt-1">策略層</p>
              <p className="text-[10px] text-gray-500 mt-0.5">CMO / 策略總監</p>
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-base mx-auto mb-2">🧭</div>
              <p className="text-2xl font-bold text-blue-700">{agentCounts?.execution ?? 0}</p>
              <p className="text-xs font-semibold text-blue-600 mt-1">執行層</p>
              <p className="text-[10px] text-gray-500 mt-0.5">PM / 執行主管</p>
            </div>
            <div className="rounded-lg bg-green-50 border border-green-100 p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center text-base mx-auto mb-2">✍️</div>
              <p className="text-2xl font-bold text-green-700">{agentCounts?.training ?? 0}</p>
              <p className="text-xs font-semibold text-green-600 mt-1">訓練層</p>
              <p className="text-[10px] text-gray-500 mt-0.5">文案 / 數據 / 創意</p>
            </div>
          </div>
        )}
      </div>

      {/* A2A Architecture Diagram */}
      <A2ADiagram />

      {/* OpenClaw autonomous task status */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-700">
            <span className="mr-2">⚡</span>OpenClaw 自動任務紀錄
          </h2>
          {runningCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 px-2.5 py-1 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
              {runningCount} 個任務執行中
            </span>
          )}
        </div>
        {recentLoading ? (
          <LoadingSpinner message="載入任務紀錄..." />
        ) : recentTasks && recentTasks.length > 0 ? (
          <div className="space-y-2">
            {recentTasks.map((task) =>
              task?.id ? (
                <div key={task.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm flex-shrink-0">🤖</div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {task.createdAt ? new Date(task.createdAt).toLocaleDateString("zh-TW", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={task.status ?? "pending"} />
                </div>
              ) : null
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <p className="text-3xl mb-2">🤖</p>
            <p className="text-sm">尚無自動任務紀錄</p>
            <p className="text-xs mt-1">點擊「啟動任務」開始第一個 AI 任務</p>
          </div>
        )}
      </div>

      {/* Quick action cards */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-3">快速操作</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: <IconBolt />,
              color: "indigo",
              title: "啟動新任務",
              desc: "對話式 AI 任務派遣，OpenClaw 自動組隊執行",
              path: "/chat",
            },
            {
              icon: <IconList />,
              color: "blue",
              title: "查看所有任務",
              desc: "追蹤所有 AI 代理任務的執行狀態與輸出",
              path: "/tasks",
            },
            {
              icon: <IconBrand />,
              color: "purple",
              title: "品牌分析",
              desc: "讓 AI 分析你的品牌定位、競品與策略機會",
              path: "/brand",
            },
          ].map((card) => (
            <button
              key={card.path}
              onClick={() => navigate(card.path)}
              className={`text-left bg-white rounded-xl border border-gray-200 p-5 hover:border-${card.color}-300 hover:shadow-md transition-all group`}
            >
              <div className={`w-10 h-10 rounded-lg bg-${card.color}-100 text-${card.color}-600 flex items-center justify-center mb-3 group-hover:bg-${card.color}-600 group-hover:text-white transition-colors`}>
                {card.icon}
              </div>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{card.title}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{card.desc}</p>
                </div>
                <span className="text-gray-300 group-hover:text-indigo-500 transition-colors mt-0.5">
                  <IconArrow />
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Recent tasks (existing) */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-3">最近任務</h2>
        {tasksLoading ? (
          <LoadingSpinner message="載入任務中..." />
        ) : tasks && tasks.length > 0 ? (
          <div className="space-y-2">
            {tasks.map((task) =>
              task?.id ? <TaskCard key={task.id} task={task} /> : null
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 bg-white rounded-xl border border-gray-200">
            <p className="text-4xl mb-2">📭</p>
            <p>目前沒有任務</p>
          </div>
        )}
      </div>
    </div>
  );
}
