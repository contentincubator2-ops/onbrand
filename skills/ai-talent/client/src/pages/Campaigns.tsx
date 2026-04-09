import { useState } from "react";
import { trpc } from "../lib/trpc";
import LoadingSpinner from "../components/LoadingSpinner";
import { formatDate } from "../lib/utils";

const STATUS_CONFIG = {
  planning:   { label: "規劃中", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  production: { label: "執行中", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  completed:  { label: "已完成", cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
} as const;

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? {
    label: status, cls: "bg-gray-100 text-gray-600 dark:bg-neutral-700 dark:text-neutral-300",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

interface CreateForm {
  name: string;
  theme: string;
  targetAudience: string;
  startDate: string;
  endDate: string;
}

export default function Campaigns() {
  const utils = trpc.useUtils();
  const { data: campaigns, isLoading } = trpc.campaign.list.useQuery();
  const createMutation = trpc.campaign.create.useMutation({
    onSuccess: () => {
      utils.campaign.list.invalidate();
      setShowModal(false);
      setForm({ name: "", theme: "", targetAudience: "", startDate: "", endDate: "" });
    },
  });

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<CreateForm>({
    name: "", theme: "", targetAudience: "", startDate: "", endDate: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    createMutation.mutate({
      name:           form.name.trim(),
      theme:          form.theme.trim() || undefined,
      targetAudience: form.targetAudience.trim() || undefined,
      startDate:      form.startDate || undefined,
      endDate:        form.endDate || undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Campaigns</h1>
          <p className="text-gray-500 dark:text-neutral-400 mt-1">管理您的行銷活動</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          新增 Campaign
        </button>
      </div>

      {/* Campaign list */}
      {isLoading ? (
        <LoadingSpinner message="載入 Campaigns..." />
      ) : !campaigns || campaigns.length === 0 ? (
        <div className="bg-white dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-neutral-700 p-12 text-center">
          <p className="text-5xl mb-4">📣</p>
          <p className="text-gray-700 dark:text-neutral-200 font-medium">尚無行銷活動</p>
          <p className="text-gray-400 dark:text-neutral-500 text-sm mt-1">點擊「新增 Campaign」開始建立您的第一個活動</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            新增 Campaign
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="bg-white dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-neutral-700 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-neutral-100 truncate">
                      {c.name}
                    </h3>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 dark:text-neutral-500">
                    {c.startDate && (
                      <span>
                        📅 {new Date(c.startDate).toLocaleDateString("zh-TW")}
                        {c.endDate ? ` → ${new Date(c.endDate).toLocaleDateString("zh-TW")}` : ""}
                      </span>
                    )}
                    <span>建立於 {formatDate(c.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          <div className="relative bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900 dark:text-neutral-100">新增 Campaign</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">
                  Campaign 名稱 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例：2026 Q2 品牌上市活動"
                  className="w-full border border-gray-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100 placeholder-gray-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">
                  活動主題
                </label>
                <input
                  type="text"
                  value={form.theme}
                  onChange={(e) => setForm(f => ({ ...f, theme: e.target.value }))}
                  placeholder="例：AI 行銷自動化"
                  className="w-full border border-gray-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100 placeholder-gray-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">
                  目標受眾
                </label>
                <textarea
                  value={form.targetAudience}
                  onChange={(e) => setForm(f => ({ ...f, targetAudience: e.target.value }))}
                  placeholder="例：25-40 歲台灣中小企業主"
                  rows={2}
                  className="w-full border border-gray-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100 placeholder-gray-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">
                    開始日期
                  </label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">
                    結束日期
                  </label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-neutral-300 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                >
                  {createMutation.isPending ? "建立中..." : "建立 Campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
