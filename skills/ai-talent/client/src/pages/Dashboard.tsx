import { useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";
import TaskCard from "../components/TaskCard";
import LoadingSpinner from "../components/LoadingSpinner";

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: balance, isLoading: balanceLoading } = trpc.credits.getBalance.useQuery();
  const { data: tasks, isLoading: tasksLoading } = trpc.task.list.useQuery({ limit: 5 });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">歡迎回來 👋</h1>
        <p className="text-gray-500 mt-1">SoWork Enterprise 行銷控制台</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Credits balance */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">可用 Credits</p>
          {balanceLoading ? (
            <LoadingSpinner size="sm" />
          ) : (
            <div>
              <p className="text-3xl font-bold text-indigo-600 mt-1">
                {((balance?.planCredits ?? 0) - 0) + (balance?.extraCredits ?? 0)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                方案：{balance?.planCredits ?? 0} ＋ 加購：{balance?.extraCredits ?? 0}
              </p>
            </div>
          )}
        </div>

        {/* Recent tasks count */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">最近任務</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {tasksLoading ? "—" : (tasks?.length ?? 0)}
          </p>
          <p className="text-xs text-gray-400 mt-1">最近 5 筆</p>
        </div>

        {/* Quick status */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">系統狀態</p>
          <p className="text-3xl font-bold text-green-600 mt-1">正常</p>
          <p className="text-xs text-gray-400 mt-1">所有服務運行中</p>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-3">快速操作</h2>
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/brand")}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            🎯 分析品牌
          </button>
          <button
            onClick={() => navigate("/campaigns")}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            📣 建立 Campaign
          </button>
        </div>
      </div>

      {/* Recent tasks */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-3">最近任務</h2>
        {tasksLoading ? (
          <LoadingSpinner message="載入任務中..." />
        ) : tasks && tasks.length > 0 ? (
          <div className="space-y-2">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
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
