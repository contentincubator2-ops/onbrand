/**
 * TaskProgressTracker — Right sidebar showing task steps + overall progress bar.
 * Status icons: pending=gray circle, running=orange pulse, done=green check, error=red X.
 */
import { useEffect } from "react";

export interface TaskStep {
  id: number;
  label: string;
  status: "pending" | "running" | "done" | "error";
}

interface Props {
  taskName?: string;
  steps: TaskStep[];
  progress: number; // 0–100
  onComplete?: () => void;
}

function StepIcon({ status }: { status: TaskStep["status"] }) {
  if (status === "done")
    return (
      <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-3 h-3 text-emerald-600" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  if (status === "error")
    return (
      <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-3 h-3 text-red-500" viewBox="0 0 12 12" fill="none">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
    );
  if (status === "running")
    return (
      <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">
        <span className="w-3 h-3 rounded-full bg-[#FF6B35] animate-ping absolute opacity-60" />
        <span className="w-3 h-3 rounded-full bg-[#FF6B35] relative" />
      </span>
    );
  // pending
  return (
    <span className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />
  );
}

export default function TaskProgressTracker({ taskName, steps, progress, onComplete }: Props) {
  const allDone = steps.length > 0 && steps.every(s => s.status === "done");

  useEffect(() => {
    if (allDone) onComplete?.();
  }, [allDone, onComplete]);

  return (
    <aside className="w-72 bg-white dark:bg-gray-800 border-l border-gray-100 dark:border-gray-700 flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-700">
        <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">任務進度</p>
        {taskName && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{taskName}</p>
        )}
      </div>

      <div className="flex-1 p-4 flex flex-col gap-4">
        {steps.length === 0 ? (
          <div className="flex flex-col items-center mt-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm text-gray-400 dark:text-gray-500">發送訊息後任務詳情將在此顯示</p>
          </div>
        ) : (
          <>
            {/* Overall progress bar */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">整體進度</span>
                <span className="text-xs font-semibold text-[#FF6B35]">{progress}%</span>
              </div>
              <div className="h-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progress}%`, backgroundColor: "#FF6B35" }}
                />
              </div>
            </div>

            {/* Steps */}
            <ul className="space-y-3">
              {steps.map((step, i) => (
                <li key={step.id} className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center">
                    <StepIcon status={step.status} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${
                      step.status === "done"    ? "text-gray-400 dark:text-gray-500 line-through" :
                      step.status === "running" ? "text-[#FF6B35] font-medium" :
                      step.status === "error"   ? "text-red-500" :
                      "text-gray-600 dark:text-gray-300"
                    }`}>{step.label}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">{i + 1}/{steps.length}</span>
                </li>
              ))}
            </ul>

            {/* Complete state */}
            {allDone && (
              <div className="mt-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 px-4 py-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">任務完成 ✓</span>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
