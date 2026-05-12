/**
 * /settings/account — subscription, password, invoices, data export.
 * 2026-05-10. CJ direction「除了金流，今天都做完」.
 */
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { showToastGlobal } from "../../components/ui/Toast";
import { useLang } from "../../lib/i18n";
import { ChevronLeft, Download, Trash2, AlertTriangle } from "lucide-react";

export default function AccountPage() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
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
          showToastGlobal(lang === "en" ? "Subscription canceled" : "訂閱已取消", "success");
          (statusQuery as any)?.refetch?.();
        },
        onError: (e: any) =>
          showToastGlobal(
            (lang === "en" ? "Couldn't cancel: " : "取消失敗：") + (e?.message ?? e)
          ),
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
          showToastGlobal(lang === "en" ? "Data downloaded" : "資料已下載", "success");
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
        onError: (e: any) =>
          showToastGlobal(
            (lang === "en" ? "Couldn't delete: " : "刪除失敗：") + (e?.message ?? e)
          ),
      })
    : null;

  // ─── Change password ───
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const submitPwdChange = async () => {
    if (newPwd.length < 8) {
      showToastGlobal(lang === "en" ? "Password needs at least 8 characters" : "新密碼至少 8 個字元");
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
        showToastGlobal(lang === "en" ? "Password updated" : "密碼已更新", "success");
        setCurrentPwd(""); setNewPwd("");
      } else {
        showToastGlobal(
          data.error ?? (lang === "en" ? `Update failed (${res.status})` : `更新失敗 (${res.status})`)
        );
      }
    } catch (e: any) {
      showToastGlobal((lang === "en" ? "Network hiccup: " : "網路錯誤：") + (e?.message ?? e));
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
          <ChevronLeft size={16} /> {t("back")}
        </button>

        <h1 className="text-2xl font-bold text-neutral-900 mb-6">{t("account_title")}</h1>

        {/* Subscription card */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">{t("account_subscription")}</h2>
          {status ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">{lang === "en" ? "Current plan" : "當前方案"}</span>
                <span className="font-semibold text-neutral-900">{status.planName ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">{lang === "en" ? "Status" : "狀態"}</span>
                <span className="font-medium">
                  {status.planStatus === "trial" && <span className="text-blue-600">{lang === "en" ? "Trial" : "試用中"}</span>}
                  {status.planStatus === "active" && <span className="text-emerald-600">{lang === "en" ? "Active" : "使用中"}</span>}
                  {status.planStatus === "canceled" && <span className="text-amber-600">{lang === "en" ? "Canceled (active until period end)" : "已取消（當期到期前可繼續使用）"}</span>}
                  {status.planStatus === "expired" && <span className="text-red-600">{lang === "en" ? "Expired" : "已到期"}</span>}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">
                  {status.planStatus === "trial"
                    ? (lang === "en" ? "Trial ends" : "試用到期")
                    : (lang === "en" ? "Next renewal" : "下次續扣")}
                </span>
                <span className="font-medium text-neutral-900">
                  {status.planEndsAt ? new Date(status.planEndsAt).toLocaleDateString(lang === "en" ? "en-US" : "zh-TW") : "—"}
                  {status.daysLeft > 0 && (
                    <span className="text-xs text-neutral-500 ml-2">
                      {lang === "en" ? `(${status.daysLeft} days left)` : `（剩 ${status.daysLeft} 天）`}
                    </span>
                  )}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">{t("loading")}</p>
          )}

          <div className="mt-6 flex gap-2">
            {status?.planStatus !== "active" && (
              <Link
                to="/pricing"
                className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium transition"
              >
                {t("pricing_upgrade_cta")}
              </Link>
            )}
            {status?.planStatus === "active" && cancelMut && (
              <button
                onClick={() => {
                  if (confirm(lang === "en" ? "Cancel your subscription? You'll keep access until the period ends." : "確定要取消訂閱？當期到期前仍可繼續使用。")) {
                    cancelMut.mutate({});
                  }
                }}
                className="px-4 py-2 rounded-lg border border-neutral-300 hover:border-neutral-500 text-sm text-neutral-700 transition"
              >
                {lang === "en" ? "Cancel subscription" : "取消訂閱"}
              </button>
            )}
          </div>
        </section>

        {/* Quota usage — 2026-05-12 */}
        {status?.usage && status?.quota && (
          <section className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">{t("account_usage")}</h2>
            <div className="space-y-3 text-sm">
              {[
                { key: "task_30s", label: lang === "en" ? "30s tasks" : "30 秒任務" },
                { key: "task_60s", label: lang === "en" ? "60s tasks" : "60 秒任務" },
                { key: "task_99s", label: lang === "en" ? "99s tasks" : "99 秒任務" },
                { key: "image_gen", label: lang === "en" ? "AI images" : "AI 圖片" },
                { key: "video_gen", label: lang === "en" ? "AI videos" : "AI 影片" },
              ].map(({ key, label }) => {
                const used = (status.usage as any)[key] ?? 0;
                const cap = (status.quota as any)[key];
                if (cap === undefined) return null;
                const unlimited = cap < 0;
                const pct = unlimited ? 0 : Math.min(100, Math.round((used / cap) * 100));
                const isHigh = !unlimited && pct >= 80;
                return (
                  <div key={key}>
                    <div className="flex justify-between mb-1">
                      <span className="text-neutral-700">{label}</span>
                      <span className={`font-medium ${isHigh ? "text-amber-700" : "text-neutral-600"}`}>
                        {used}{unlimited ? (lang === "en" ? " · Unlimited" : " · 無限") : ` / ${cap}`}
                      </span>
                    </div>
                    <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${isHigh ? "bg-amber-500" : "bg-neutral-900"}`}
                        style={{ width: unlimited ? "0%" : `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-neutral-400">{lang === "en" ? "Resets on the 1st of each month" : "每月 1 號重置"}</p>
          </section>
        )}

        {/* Invoices */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">{t("account_invoices")}</h2>
          {invoices.length === 0 ? (
            <p className="text-sm text-neutral-500">{lang === "en" ? "No invoices yet (no invoices during trial)" : "尚無發票（試用期間不開立發票）"}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-500 border-b border-neutral-200">
                <tr>
                  <th className="text-left py-2">{lang === "en" ? "Date" : "日期"}</th>
                  <th className="text-left py-2">{lang === "en" ? "Invoice no." : "發票號碼"}</th>
                  <th className="text-right py-2">{lang === "en" ? "Amount" : "金額"}</th>
                  <th className="text-right py-2"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-neutral-100">
                    <td className="py-2">{new Date(inv.createdAt).toLocaleDateString(lang === "en" ? "en-US" : "zh-TW")}</td>
                    <td className="py-2 font-mono text-xs">{inv.invoiceNumber ?? "—"}</td>
                    <td className="py-2 text-right">NT$ {inv.amountTwd.toLocaleString(lang === "en" ? "en-US" : "zh-TW")}</td>
                    <td className="py-2 text-right">
                      {inv.downloadUrl && (
                        <a href={inv.downloadUrl} className="text-blue-600 hover:underline text-xs">{t("download")}</a>
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
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">{t("account_change_password")}</h2>
          <div className="space-y-3 max-w-md">
            <input
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              placeholder={lang === "en" ? "Current password" : "目前密碼"}
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-neutral-900"
            />
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder={lang === "en" ? "New password (8+ characters)" : "新密碼（至少 8 字元）"}
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-neutral-900"
            />
            <button
              onClick={submitPwdChange}
              disabled={pwdLoading || !currentPwd || !newPwd}
              className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium transition disabled:opacity-50"
            >
              {pwdLoading
                ? (lang === "en" ? "Updating…" : "更新中…")
                : (lang === "en" ? "Update password" : "更新密碼")}
            </button>
          </div>
        </section>

        {/* Data export */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-2">{t("account_export_data")}</h2>
          <p className="text-sm text-neutral-500 mb-4">
            {lang === "en"
              ? "Download all your brands, tasks, and outputs (JSON) — your data, your right."
              : "下載您所有的品牌、任務、產出內容（JSON 格式）— 個資法權利之一。"}
          </p>
          <button
            onClick={() => exportMut?.mutate({})}
            disabled={!exportMut || exportMut.isPending}
            className="px-4 py-2 rounded-lg border border-neutral-300 hover:border-neutral-500 text-sm text-neutral-700 transition flex items-center gap-2"
          >
            <Download size={14} />{" "}
            {exportMut?.isPending
              ? (lang === "en" ? "Preparing…" : "準備中…")
              : (lang === "en" ? "Download JSON" : "下載 JSON")}
          </button>
        </section>

        {/* Customer support */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-2">{lang === "en" ? "Support" : "客服"}</h2>
          <p className="text-sm text-neutral-600 mb-4">{lang === "en" ? "We reply within 24 hours on weekdays" : "工作日 24 小時內回覆"}</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <a href="mailto:sowork@sowork.tw" className="px-4 py-2 rounded-lg border border-neutral-300 hover:border-neutral-500 text-neutral-700 transition">
              sowork@sowork.tw
            </a>
            <a href="https://line.me/R/ti/p/@sowork" target="_blank" rel="noreferrer" className="px-4 py-2 rounded-lg border border-neutral-300 hover:border-neutral-500 text-neutral-700 transition">
              {lang === "en" ? "Add us on LINE" : "LINE 加入好友"}
            </a>
          </div>
        </section>

        {/* Danger zone — delete account */}
        <section className="bg-red-50 border border-red-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-red-900 mb-2 flex items-center gap-2">
            <AlertTriangle size={18} /> {t("account_danger_zone")}
          </h2>
          <p className="text-sm text-red-700 mb-4">
            {lang === "en"
              ? "After deletion, you have 30 days to recover by emailing support. After 30 days, data is gone for good."
              : "刪除帳號後，30 天內可向客服申請復原；超過 30 天資料將永久銷毀。"}
          </p>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 rounded-lg border border-red-300 hover:bg-red-100 text-sm text-red-700 transition flex items-center gap-2"
            >
              <Trash2 size={14} /> {t("account_delete_account")}
            </button>
          ) : (
            <div className="space-y-3 max-w-md">
              <p className="text-sm text-red-700">{lang === "en" ? "Type your registered email to confirm:" : "請輸入您的註冊 email 確認："}</p>
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
                  {lang === "en" ? "Delete for good" : "確認刪除"}
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteEmailConfirm(""); }}
                  className="px-4 py-2 rounded-lg border border-neutral-300 hover:border-neutral-500 text-sm text-neutral-700 transition"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-neutral-400 space-x-3">
          <Link to="/terms" className="hover:text-neutral-700">{t("footer_terms")}</Link>
          <Link to="/privacy" className="hover:text-neutral-700">{t("footer_privacy")}</Link>
          <Link to="/refund" className="hover:text-neutral-700">{t("footer_refund")}</Link>
        </div>
      </div>
    </div>
  );
}
