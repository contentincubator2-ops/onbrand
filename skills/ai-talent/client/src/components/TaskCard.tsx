/**
 * TaskCard.tsx — Sprint 3 Claude warm design
 * Warm neutrals with amber status accents.
 */
import { formatDate } from "../lib/utils";

interface TaskCardProps {
  task: {
    id?: number;
    title?: string;
    status?: string;
    taskType?: string | null;
    createdAt?: Date | string | null;
    completedAt?: Date | string | null;
  };
}

const statusStyle: Record<string, { bg: string; text: string; border: string }> = {
  pending:     { bg: '#fdf6ed', text: '#92622a', border: '#e8d5b8' },
  in_progress: { bg: '#eef5fc', text: '#3a6a9b', border: '#c4d9ed' },
  review:      { bg: '#f3eef8', text: '#6b4f8a', border: '#d5c8e6' },
  completed:   { bg: '#eef6f0', text: '#3a7a4f', border: '#c4e0cc' },
  cancelled:   { bg: '#f5f2ed', text: '#9b8fa0', border: '#e0dbd5' },
};

const statusLabel: Record<string, string> = {
  pending:     "待處理",
  in_progress: "進行中",
  review:      "審核中",
  completed:   "已完成",
  cancelled:   "已取消",
};

export default function TaskCard({ task }: TaskCardProps) {
  const s = task.status ? statusStyle[task.status] : undefined;
  return (
    <div
      className="rounded-xl p-4 transition-shadow hover:shadow-sm"
      style={{
        background: '#fdfcfa',
        border: '1px solid #e8e5e0',
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate" style={{ color: '#3d3530' }}>{task.title}</p>
          {task.taskType && (
            <p className="text-xs mt-0.5" style={{ color: '#9b8fa0' }}>{task.taskType}</p>
          )}
          <p className="text-xs mt-1" style={{ color: '#c4bdb5' }}>{formatDate(task.createdAt)}</p>
        </div>
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0"
          style={{
            background: s?.bg ?? '#f5f2ed',
            color: s?.text ?? '#9b8fa0',
            border: `1px solid ${s?.border ?? '#e0dbd5'}`,
          }}
        >
          {(task.status ? statusLabel[task.status] : undefined) ?? task.status}
        </span>
      </div>
    </div>
  );
}
