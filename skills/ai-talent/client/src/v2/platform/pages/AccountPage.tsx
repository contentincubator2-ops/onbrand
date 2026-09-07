/**
 * /settings/account — subscription, password, invoices, data export.
 * 2026-05-10. CJ direction「除了金流，今天都做完」.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { showToastGlobal } from "../../../components/ui/Toast";
import { useLang } from "../../../lib/i18n";
import { tierLabel } from "../lib/tierVocabulary";
import { ChevronLeft, Download, Trash2, AlertTriangle } from "lucide-react";

export default function AccountPage() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
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
          showToastGlobal(typeof r?.message === "string" ? r.message : String(r?.message ?? (lang === "en" ? "Account deleted" : "帳號已刪除")), "success");
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

  // ─── 2026-05-14 (CJ「TWD + USD 雙幣」): Billing country toggle ───
  const setCountryMut = (trpc as any).billing?.setBillingCountry?.useMutation
    ? (trpc as any).billing.setBillingCountry.useMutation({
        onSuccess: () => {
          showToastGlobal(lang === "en" ? "Billing country updated" : "計費國家已更新", "success");
          (statusQuery as any)?.refetch?.();
        },
        onError: (e: any) =>
          showToastGlobal((lang === "en" ? "Update failed: " : "更新失敗：") + (e?.message ?? e)),
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
          (typeof data.error === "string" ? data.error : (data.error?.message ?? null)) ??
          (lang === "en" ? `Update failed (${res.status})` : `更新失敗 (${res.status})`)
        );
      }
    } catch (e: any) {
      showToastGlobal((lang === "en" ? "Network error: " : "網路錯誤：") + (e?.message ?? e));
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

        {/* 2026-05-14 (CJ「TWD + USD 雙幣」) — billing country toggle */}
        {status && (
          <section className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900 mb-1">
                  {lang === "en" ? "Billing country & currency" : "計費國家與幣別"}
                </h2>
                <p className="text-xs text-neutral-500">
                  {lang === "en"
                    ? "USD is our primary price. TWD bills convert at today's FX rate (refreshed daily). Locked while a subscription is active."
                    : "美金為主要計價幣別。台幣依當日匯率換算（每日更新）。訂閱期間無法變更。"}
                </p>
              </div>
              <div className="flex gap-2">
                {(["TW", "US"] as const).map((c) => {
                  const active = (status as any)?.billingCountry === c;
                  return (
                    <button
                      key={c}
                      disabled={!setCountryMut || setCountryMut.isPending || (status as any)?.planStatus === "active"}
                      onClick={() => setCountryMut?.mutate({ country: c })}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition border ${
                        active
                          ? "bg-neutral-900 text-white border-neutral-900"
                          : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-500"
                      } disabled:opacity-50`}
                    >
                      {c === "TW" ? "🇹🇼 TWD" : "🌐 USD"}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* 2026-09-07 方案額度。資料一直都在（billing.getStatus 回 quota），
            只是這頁只畫了點數 —— 使用者看不到自己的通路數／自建卡／席次。
            撞到上限才發現，是死路；這裡先讓他看得到。 */}
        {(status as any)?.quota && (
          (() => {
            const q = (status as any).quota as Record<string, number | boolean>;
            const fmt = (n: number | boolean | undefined) =>
              n === -1 || n === undefined ? "不限" : String(n);
            const rows: Array<[string, string]> = [
              ["同時開通路", fmt(q.platforms as number)],
              ["自建任務卡", `${fmt(q.ownTaskCards as number)} 張`],
              ["爆款結構卡", q.viralTaskCards === false ? "專業方案" : "可用"],
              ["產品定位", fmt(q.products as number)],
              ["活動定位", q.eventsPerCycle === -1 ? "不限" : `每月 ${q.eventsPerCycle}`],
              ["席次", fmt(q.team_members as number)],
              ["審核工作流", q.reviewWorkflow ? "有" : "專業方案"],
              ["品牌", fmt(q.brands as number)],
            ];
            return (
              <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-5">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-[15px] font-semibold text-neutral-900">方案額度</h2>
                  <span className="text-[13px] text-neutral-500">
                    {String((status as any)?.planName ?? "")}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                  {rows.map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between border-b border-neutral-100 py-1">
                      <dt className="text-[13px] text-neutral-500">{k}</dt>
                      <dd className="text-[14px] font-medium text-neutral-900">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-[13px] text-neutral-500">
                  要增加額度，到
                  <button
                    onClick={() => navigate("/pricing")}
                    className="mx-1 font-medium text-neutral-900 underline-offset-2 hover:underline"
                  >
                    方案與定價
                  </button>
                  升級。
                </p>
              </section>
            );
          })()
        )}

        {/* Points balance — 2026-05-14 (CJ「點數系統」) replaces fixed quotas */}
        {(status as any)?.points && (
          (() => {
            const pts = (status as any).points as {
              balance: number; perCycle: number; cycleDays: number;
              nextRefillAt: string | null;
              costs: Record<string, number>;
            };
            const pctRemaining = pts.perCycle > 0
              ? Math.max(0, Math.min(100, Math.round((pts.balance / pts.perCycle) * 100)))
              : 0;
            const isLow = pts.perCycle > 0 && pts.balance < pts.perCycle * 0.2;
            const unlimited = pts.perCycle < 0;
            const refillLabel = pts.nextRefillAt
              ? new Date(pts.nextRefillAt).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" })
              : "—";
            return (
              <section className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-lg font-semibold text-neutral-900">
                    {lang === "en" ? "Point balance" : "點數餘額"}
                  </h2>
                  <span className={`text-2xl font-bold tabular-nums ${isLow ? "text-amber-700" : "text-neutral-900"}`}>
                    {pts.balance.toLocaleString()}
                    <span className="text-sm font-normal text-neutral-500 ml-1">
                      {unlimited ? (lang === "en" ? "/ unlimited" : "/ 無限") : ` / ${pts.perCycle.toLocaleString()}`}
                    </span>
                  </span>
                </div>
                {!unlimited && (
                  <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mb-3">
                    <div
                      className={`h-full transition-all ${isLow ? "bg-amber-500" : "bg-neutral-900"}`}
                      style={{ width: `${pctRemaining}%` }}
                    />
                  </div>
                )}
                <p className="text-xs text-neutral-500 mb-4">
                  {unlimited
                    ? (lang === "en" ? "Enterprise — no limit" : "企業版 · 無上限")
                    : pts.cycleDays === 7
                      ? (lang === "en" ? "Trial allocation · one-time grant" : "試用點數 · 一次性贈送")
                      : (lang === "en"
                          ? `Resets to ${pts.perCycle.toLocaleString()} on ${refillLabel}`
                          : `${refillLabel} 自動補滿 ${pts.perCycle.toLocaleString()} 點`)}
                </p>
                {/* Cost cheatsheet */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {[
                    { key: "task_30s",   label: tierLabel("30s", lang) },
                    { key: "task_60s",   label: tierLabel("60s", lang) },
                    { key: "task_99s",   label: tierLabel("99s", lang) },
                    { key: "image_flux", label: lang === "en" ? "AI image"      : "AI 圖片" },
                  ].map(({ key, label }) => (
                    <div key={key} className="bg-neutral-50 rounded-lg px-3 py-2">
                      <div className="text-neutral-500 text-[12px]">{label}</div>
                      <div className="text-neutral-900 font-semibold tabular-nums">{pts.costs[key]} {lang === "en" ? "pts" : "點"}</div>
                    </div>
                  ))}
                </div>
                {!unlimited && isLow && (
                  <p className="mt-4 text-xs text-neutral-600">
                    {lang === "en"
                      ? "Low balance — points refill at the start of the next cycle. Need more every month? "
                      : "點數快用完了 — 下個週期開始時補滿。每月需要更多？"}
                    <Link to="/pricing" className="underline hover:text-neutral-900">{lang === "en" ? "Plans & pricing" : "方案與定價"}</Link>
                  </p>
                )}
              </section>
            );
          })()
        )}

        {/* Invoices */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">{t("account_invoices")}</h2>
          {invoices.length === 0 ? (
            <p className="text-sm text-neutral-500">{lang === "en" ? "No invoices yet — invoices appear once you subscribe." : "尚無發票（試用期間不開立發票）"}</p>
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
                    <td className="py-2 text-right">
                      {inv.currency === "USD" ? "US$" : "NT$"} {Number(inv.amount ?? inv.amountTwd).toLocaleString("en-US")}
                    </td>
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
              ? "Download all your brands, tasks, and outputs as JSON. You own your data."
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
            <a href="mailto:sowork@sowork.ai" className="px-4 py-2 rounded-lg border border-neutral-300 hover:border-neutral-500 text-neutral-700 transition">
              sowork@sowork.ai
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
