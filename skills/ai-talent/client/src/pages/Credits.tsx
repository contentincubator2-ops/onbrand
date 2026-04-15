import { trpc } from "../lib/trpc";
import LoadingSpinner from "../components/LoadingSpinner";
import { formatDate } from "../lib/utils";

const TX_LABEL: Record<string, string> = {
  llm_call:             "AI 使用",
  topup:                "加購點數",
  admin_adjustment:     "管理員調整",
  registration_bonus:   "註冊獎勵",
  subscription:         "訂閱方案",
  monthly_reset:        "每月重置",
  subscription_upgrade: "方案升級",
  topup_expired:        "點數到期",
};

export default function Credits() {
  const { data: balance, isLoading: balanceLoading } = trpc.credits.getBalance.useQuery();
  const { data: transactions, isLoading: txLoading } = trpc.credits.getTransactions.useQuery({ limit: 20 });

  const totalAvailable = (balance?.planCredits ?? 0) + (balance?.extraCredits ?? 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Credits</h1>
        <p className="text-gray-500 dark:text-neutral-400 mt-1">查看點數餘額與消耗記錄</p>
      </div>

      {/* Balance cards */}
      {balanceLoading ? (
        <LoadingSpinner message="載入餘額中..." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-indigo-600 text-white rounded-xl p-5">
            <p className="text-sm text-indigo-200">可用 Credits</p>
            <p className="text-4xl font-bold mt-1">{totalAvailable.toLocaleString()}</p>
            <p className="text-xs text-indigo-300 mt-1">{balance?.planTier ?? "trial"} 方案</p>
          </div>
          <div className="bg-white dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-neutral-700 p-5">
            <p className="text-sm text-gray-500 dark:text-neutral-400">方案 Credits</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-neutral-100 mt-1">
              {(balance?.planCredits ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-neutral-700 p-5">
            <p className="text-sm text-gray-500 dark:text-neutral-400">加購 Credits</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-neutral-100 mt-1">
              {(balance?.extraCredits ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Usage bar */}
      {!balanceLoading && balance && (
        <div className="bg-white dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-neutral-700 p-5">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600 dark:text-neutral-300 font-medium">本期使用量</span>
            <span className="text-gray-500 dark:text-neutral-400">
              {(balance.usedCredits ?? 0).toLocaleString()} / {(balance.planCredits ?? 0).toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-gray-100 dark:bg-neutral-700 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all"
              style={{
                width: balance.planCredits
                  ? `${Math.min(100, ((balance.usedCredits ?? 0) / balance.planCredits) * 100)}%`
                  : "0%",
              }}
            />
          </div>
        </div>
      )}

      {/* Transactions */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 dark:text-neutral-200 mb-3">交易記錄</h2>
        {txLoading ? (
          <LoadingSpinner message="載入記錄中..." />
        ) : transactions && transactions.length > 0 ? (
          <div className="bg-white dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-neutral-700 border-b border-gray-200 dark:border-neutral-600">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-neutral-300 font-medium">類型</th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-neutral-300 font-medium">說明</th>
                  <th className="text-right px-4 py-3 text-gray-600 dark:text-neutral-300 font-medium">點數</th>
                  <th className="text-right px-4 py-3 text-gray-600 dark:text-neutral-300 font-medium">時間</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-neutral-700">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-neutral-700/50">
                    <td className="px-4 py-3 text-gray-700 dark:text-neutral-200">
                      {TX_LABEL[tx.actionType] ?? tx.actionType}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-neutral-400 max-w-xs truncate">
                      {tx.description ?? "—"}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-medium ${
                      tx.creditsAmount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                    }`}>
                      {tx.creditsAmount >= 0 ? "+" : ""}{tx.creditsAmount}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 dark:text-neutral-500">
                      {formatDate(tx.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 dark:text-neutral-500 bg-white dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-neutral-700">
            <p className="text-4xl mb-2">💳</p>
            <p>目前沒有交易記錄</p>
          </div>
        )}
      </div>
    </div>
  );
}
