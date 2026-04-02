import { trpc } from "../lib/trpc";
import LoadingSpinner from "../components/LoadingSpinner";
import { formatDate } from "../lib/utils";

export default function Credits() {
  const { data: balance, isLoading: balanceLoading } = trpc.credits.getBalance.useQuery();
  const { data: transactions, isLoading: txLoading } = trpc.credits.getTransactions.useQuery({ limit: 20 });

  const totalAvailable = (balance?.planCredits ?? 0) + (balance?.extraCredits ?? 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Credits</h1>
        <p className="text-gray-500 mt-1">查看點數餘額與消耗記錄</p>
      </div>

      {/* Balance cards */}
      {balanceLoading ? (
        <LoadingSpinner message="載入餘額中..." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-indigo-600 text-white rounded-xl p-5">
            <p className="text-sm text-indigo-200">可用 Credits</p>
            <p className="text-4xl font-bold mt-1">{totalAvailable.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">方案 Credits</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {(balance?.planCredits ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">加購 Credits</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {(balance?.extraCredits ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Transactions */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-3">交易記錄</h2>
        {txLoading ? (
          <LoadingSpinner message="載入記錄中..." />
        ) : transactions && transactions.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">類型</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">說明</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">點數</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">時間</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{tx.actionType}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                      {tx.description ?? "—"}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-medium ${
                      tx.creditsAmount >= 0 ? "text-green-600" : "text-red-600"
                    }`}>
                      {tx.creditsAmount >= 0 ? "+" : ""}{tx.creditsAmount}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {formatDate(tx.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 bg-white rounded-xl border border-gray-200">
            <p className="text-4xl mb-2">💳</p>
            <p>目前沒有交易記錄</p>
          </div>
        )}
      </div>
    </div>
  );
}
