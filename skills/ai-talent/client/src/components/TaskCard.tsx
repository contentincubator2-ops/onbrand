import { formatDate } from "../lib/utils";

interface TaskCardProps {
  task: {
    id: number;
    title: string;
    status: string;
    taskType?: string | null;
    createdAt: Date | string;
    completedAt?: Date | string | null;
  };
}

const statusColor: Record<string, string> = {
  pending:     "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  review:      "bg-purple-100 text-purple-800",
  completed:   "bg-green-100 text-green-800",
  cancelled:   "bg-gray-100 text-gray-600",
};

const statusLabel: Record<string, string> = {
  pending:     "待處理",
  in_progress: "進行中",
  review:      "審核中",
  completed:   "已完成",
  cancelled:   "已取消",
};

export default function TaskCard({ task }: TaskCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{task.title}</p>
          {task.taskType && (
            <p className="text-xs text-gray-500 mt-0.5">{task.taskType}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">{formatDate(task.createdAt)}</p>
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${
            statusColor[task.status] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          {statusLabel[task.status] ?? task.status}
        </span>
      </div>
    </div>
  );
}
