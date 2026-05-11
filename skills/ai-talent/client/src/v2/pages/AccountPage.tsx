/**
 * /settings/account — subscription, password, invoices, data export.
 * 2026-05-10. CJ direction「除了金流，今天都做完」.
 */
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { showToastGlobal } from "../../components/ui/Toast";
import { ChevronLeft, Download, Trash2, AlertTriangle } from "lucide-react";

export default function AccountPage() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const statusQuery = (trpc as any).billing?.getStatus?.useQuery
    ? (trpc as any).billing.getStatus.useQuery()
    : { data: null, refetch: () => {} };
  const invoicesQuery = (trpc as any).billing?.listInvoices?.useQuery
    ? (trpc as any).billing.listInvoices.useQuery()
    : { data: [] };

  const status = statusQuery?.data;
  const invoices = (invoicesQuery?.data ?? []) as any[];

  // ─── Cancel subscription ──────────────────────────────────────
  const cancelMut = (trpc as any).billing?.cancelSubscription?.useMutation
    ? (trpc as any).billing.cancelSubscription.useMutation({
        onSuccess: () => {
          showToastGlobal("訂閱已取消", "success");
          (statusQuery as any)?.refetch?.();
        },
        onError: (e: any) => showToastGlobal(`取消失敗：${e?.message ?? e}`),
      })
    : null;

  // ─── Export data ──────────────────────────────────────────────
  const exportMut = (trpc as any).billing?.exportData?.useMutation
    ? (trpc as any).billing.exportData.useMutation({
        onSuccess: (data: any) => {
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `drop-export-${new Date().toISOString().split("T")[0]}.json`;
          a.click();
          URL.revokeObjectURL(url);
          showToastGlobal("資料已下載", "success");
        },
      })
    : null;

  // ─── Delete account ───────────────────────────────────────────
  const [deleteEmailConfirm, setDeleteEmailConfirm] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteMut = (trpc as any).billing?.deleteAccount?.useMutation
    ? (trpc as any).billing.deleteAccount.useMutation({
        onSuccess: (r: any) => {
          showToastGlobal(r.message, "success");
          setTimeout(() => {
            try { localStorage.removeItem("authToken"); } catch {}
            window.location.replace("/auth/login");
          }, 2000);
        },
        onError: (e: any) => showToastGlobal(`刪除失敗：${e?.message ?? e}`),
      })
    : null;

  // ─── Change password (uses /api/auth/change-password — not yet added; placeholder) ───
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const submitPwdChange = async () => {
    if (newPwd.length < 8) {
      showToastGlobal("新密碼至少 8 個字元");
      return;
    }
    setPwdLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToastGlobal("密碼已更新", "success");
        setCurrentPwd(""); setNewPwd("");
      } else {
        showToastGlobal(data.error ?? `更新失敗 (${res.status})`);
      }
    } catch (e: any) {
      showToastGlobal(`網路錯誤：${e?.message ?? e}`);
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-6">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-neutral-500 hover:text-neutral-900 flex items-center gap-1 mb-6"
        >
          <ChevronLeft size={16} /> 返回
        </button>

        <h1 className="text-2xl font-bold text-neutral-900 mb-6">帳號設定</h1>

        {/* Subscription card */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">訂閱狀態</h2>
          {status ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">當前方案</span>
                <span className="font-semibold text-neutral-900">{status.planName ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">狀態</span>
                <span className="font-medium">
                  {status.planStatus === "trial" && <span className="text-blue-600">試用中</span>}
                  {status.planStatus === "active" && <span className="text-emerald-600">使用中</span>}
                  {status.planStatus === "canceled" && <span className="text-amber-600">已取消（當期到期前可繼續使用）</span>}
                  {status.planStatus === "expired" && <span className="text-red-600">已到期</span>}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">{status.planStatus === "trial" ? "試用到期" : "下次續扣"}</span>
                <span className="font-medium text-neutral-900">
                  {status.planEndsAt ? new Date(status.planEndsAt).toLocaleDateString("zh-TW") : "—"}
                  {status.daysLeft > 0 && <span className="text-xs text-neutral-500 ml-2">（剩 {status.daysLeft} 天）</span>}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">載入中…</p>
          )}

          <div className="mt-6 flex gap-2">
            {status?.planStatus !== "active" && (
              <Link
                to="/pricing"
                className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium transition"
              >
                升級 OnBrand Pro
              </Link>
            )}
            {status?.planStatus === "active" && cancelMut && (
              <button
                onClick={() => {
                  if (confirm("確定要取消訂閱？當期到期前仍可繼續使用。")) {
                    cancelMut.mutate({});
                  }
                }}
                className="px-4 py-2 rounded-lg border border-neutral-300 hover:border-neutral-500 text-sm text-neutral-700 transition"
              >
                取消訂閱
              </button>
            )}
          </div>
        </section>

        {/* Invoices */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">發票紀錄</h2>
          {invoices.length === 0 ? (
            <p className="text-sm text-neutral-500">尚無發票（試用期間不開立發票）</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-500 border-b border-neutral-200">
                <tr>
                  <th className="text-left py-2">日期</th>
                  <th className="text-left py-2">發票號碼</th>
                  <th className="text-right py-2">金額</th>
                  <th className="text-right py-2"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-neutral-100">
                    <td className="py-2">{new Date(inv.createdAt).toLocaleDateString("zh-TW")}</td>
                    <td className="py-2 font-mono text-xs">{inv.invoiceNumber ?? "—"}</td>
                    <td className="py-2 text-right">NT$ {inv.amountTwd.toLocaleString("zh-TW")}</td>
                    <td className="py-2 text-right">
                      {inv.downloadUrl && (
                        <a href={inv.downloadUrl} className="text-blue-600 hover:underline text-xs">下載</a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Change password */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">更改密碼</h2>
          <div className="space-y-3 max-w-md">
            <input
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              placeholder="目前密碼"
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-neutral-900"
            />
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="新密碼（至少 8 字元）"
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-neutral-900"
            />
            <button
              onClick={submitPwdChange}
              disabled={pwdLoading || !currentPwd || !newPwd}
              className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium transition disabled:opacity-50"
            >
              {pwdLoading ? "更新中…" : "更新密碼"}
            </button>
          </div>
        </section>

        {/* Data export */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-2">匯出我的資料</h2>
          <p className="text-sm text-neutral-500 mb-4">下載您所有的品牌、任務、產出內容（JSON 格式）— 個資法權利之一。</p>
          <button
            onClick={() => exportMut?.mutate({})}
            disabled={!exportMut || exportMut.isPending}
            className="px-4 py-2 rounded-lg border border-neutral-300 hover:border-neutral-500 text-sm text-neutral-700 transition flex items-center gap-2"
          >
            <Download size={14} /> {exportMut?.isPending ? "準備中…" : "下載 JSON"}
          </button>
        </section>

        {/* Customer support */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-2">客服</h2>
          <p className="text-sm text-neutral-600 mb-4">工作日 24 小時內回覆</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <a href="mailto:sowork@sowork.tw" className="px-4 py-2 rounded-lg border border-neutral-300 hover:border-neutral-500 text-neutral-700 transition">
              sowork@sowork.tw
            </a>
            <a href="https://line.me/R/ti/p/@sowork" target="_blank" rel="noreferrer" className="px-4 py-2 rounded-lg border border-neutral-300 hover:border-neutral-500 text-neutral-700 transition">
              LINE 加入好友
            </a>
          </div>
        </section>

        {/* Danger zone — delete account */}
        <section className="bg-red-50 border border-red-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-red-900 mb-2 flex items-center gap-2">
            <AlertTriangle size={18} /> 危險區
          </h2>
          <p className="text-sm text-red-700 mb-4">
            刪除帳號後，30 天內可向客服申請復原；超過 30 天資料將永久銷毀。
          </p>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 rounded-lg border border-red-300 hover:bg-red-100 text-sm text-red-700 transition flex items-center gap-2"
            >
              <Trash2 size={14} /> 刪除帳號
            </button>
          ) : (
            <div className="space-y-3 max-w-md">
              <p className="text-sm text-red-700">請輸入您的註冊 email 確認：</p>
              <input
                type="email"
                value={deleteEmailConfirm}
                onChange={(e) => setDeleteEmailConfirm(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-3 py-2 text-sm border border-red-300 rounded-lg focus:outline-none focus:border-red-600"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => deleteMut?.mutate({ confirmEmail: deleteEmailConfirm })}
                  disabled={!deleteMut || deleteMut.isPending || !deleteEmailConfirm}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition disabled:opacity-50"
                >
                  確認刪除
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteEmailConfirm(""); }}
                  className="px-4 py-2 rounded-lg border border-neutral-300 hover:border-neutral-500 text-sm text-neutral-700 transition"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-neutral-400 space-x-3">
          <Link to="/terms" className="hover:text-neutral-700">服務條款</Link>
          <Link to="/privacy" className="hover:text-neutral-700">隱私政策</Link>
          <Link to="/refund" className="hover:text-neutral-700">退費條款</Link>
        </div>
      </div>
    </div>
  );
}
