/**
 * /settings/account — subscription, password, invoices, data export.
 * 2026-05-10. CJ direction「除了金流，今天都做完」.
 */
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { showToastGlobal } from "../../components/ui/Toast";
import { useLang } from "../../lib/i18n";
import { ChevronLeft, Download, Trash2, AlertTriangle, Plus, X, Sparkles } from "lucide-react";

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

  // ─── 2026-05-14 (CJ「加值點數方案」): Top-up packs ───
  const [showTopupModal, setShowTopupModal] = useState(false);
  // Auto-open from ?topup=1 (sent when user hits FORBIDDEN points-not-enough)
  React.useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      if (qs.get("topup") === "1" || qs.get("topup") === "open") {
        setShowTopupModal(true);
      }
    } catch {}
    const handler = () => setShowTopupModal(true);
    window.addEventListener("onbrand:open-topup", handler);
    return () => window.removeEventListener("onbrand:open-topup", handler);
  }, []);
  const topupPacksQuery = (trpc as any).stripe?.listTopupPacks?.useQuery
    ? (trpc as any).stripe.listTopupPacks.useQuery(undefined, { enabled: showTopupModal })
    : { data: [] };
  const topupMut = (trpc as any).stripe?.createTopupCheckout?.useMutation
    ? (trpc as any).stripe.createTopupCheckout.useMutation({
        onSuccess: (data: any) => {
          // Stripe Checkout — redirect straight to hosted page.
          if (data?.url) window.location.assign(data.url);
        },
        onError: (e: any) =>
          showToastGlobal((lang === "en" ? "Topup failed: " : "加購失敗：") + (e?.message ?? e)),
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
                    { key: "task_30s",   label: lang === "en" ? "30s · Single"  : "30s 單品" },
                    { key: "task_60s",   label: lang === "en" ? "60s · Pack"    : "60s 套組" },
                    { key: "task_99s",   label: lang === "en" ? "99s · Slate"   : "99s 檔期" },
                    { key: "image_flux", label: lang === "en" ? "AI image"      : "AI 圖片" },
                  ].map(({ key, label }) => (
                    <div key={key} className="bg-neutral-50 rounded-lg px-3 py-2">
                      <div className="text-neutral-500 text-[11px]">{label}</div>
                      <div className="text-neutral-900 font-semibold tabular-nums">{pts.costs[key]} {lang === "en" ? "pts" : "點"}</div>
                    </div>
                  ))}
                </div>
                {!unlimited && (
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => setShowTopupModal(true)}
                      className="px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium transition flex items-center gap-1.5"
                    >
                      <Plus size={14} /> {lang === "en" ? "Buy more points" : "加購點數"}
                    </button>
                    {isLow && (
                      <span className="text-xs text-amber-700">
                        {lang === "en"
                          ? "⚠ Low balance — top up or wait for refill"
                          : "⚠ 點數快用完了"}
                      </span>
                    )}
                  </div>
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

        {/* 2026-05-14 (CJ「加值點數方案」) Top-up modal */}
        {showTopupModal && (
          <div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={() => setShowTopupModal(false)}
          >
            <div
              className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
                  <Sparkles size={18} className="text-amber-500" />
                  {lang === "en" ? "Top-up points" : "加購點數方案"}
                </h3>
                <button
                  onClick={() => setShowTopupModal(false)}
                  className="text-neutral-400 hover:text-neutral-700"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="text-xs text-neutral-500 mb-5">
                {lang === "en"
                  ? "Points never expire — they stack on top of your monthly refill."
                  : "加購點數永不過期，會疊加在月配額之上。"}
                {((topupPacksQuery as any)?.data?.currency === "TWD") && (
                  <span className="block mt-1">
                    {lang === "en"
                      ? `Billed in TWD · today's rate: 1 USD ≈ ${Number((topupPacksQuery as any)?.data?.usdToTwd ?? 32).toFixed(2)} TWD`
                      : `依當日匯率計算 · 1 USD ≈ ${Number((topupPacksQuery as any)?.data?.usdToTwd ?? 32).toFixed(2)} NTD`}
                  </span>
                )}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(((topupPacksQuery as any)?.data?.packs) ?? []).map((pack: any) => (
                  <button
                    key={pack.id}
                    disabled={topupMut?.isPending}
                    onClick={() => topupMut?.mutate({ packId: pack.id })}
                    className={`text-left rounded-xl border-2 p-4 transition disabled:opacity-50 ${
                      pack.id === "medium"
                        ? "border-neutral-900 bg-neutral-50 hover:bg-neutral-100"
                        : "border-neutral-200 hover:border-neutral-400 bg-white"
                    }`}
                  >
                    {pack.id === "medium" && (
                      <div className="text-[10px] inline-block px-2 py-0.5 rounded-full bg-neutral-900 text-white font-medium mb-2">
                        {lang === "en" ? "MOST POPULAR" : "最熱門"}
                      </div>
                    )}
                    <div className="text-xs text-neutral-500">{lang === "en" ? pack.labelEn : pack.labelZh}</div>
                    <div className="text-2xl font-bold tabular-nums text-neutral-900 mt-1">
                      {pack.points.toLocaleString()}
                      <span className="text-xs font-normal text-neutral-500 ml-1">{lang === "en" ? "pts" : "點"}</span>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-neutral-900">
                      {pack.currency === "USD" ? "US$" : "NT$"} {pack.amount.toLocaleString()}
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                      {lang === "en"
                        ? `${pack.currency === "USD" ? "US$" : "NT$"} ${pack.perPoint.toFixed(pack.currency === "USD" ? 4 : 2)} / pt`
                        : `每點 ${pack.currency === "USD" ? "US$" : "NT$"} ${pack.perPoint.toFixed(pack.currency === "USD" ? 4 : 2)}`}
                    </div>
                    {pack.discountPct > 0 && (
                      <div className="mt-2 inline-block text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                        {lang === "en" ? `Save ${pack.discountPct}%` : `省 ${pack.discountPct}%`}
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-neutral-400 mt-4">
                {lang === "en"
                  ? "Secure payment by Stripe · receipt emailed automatically."
                  : "Stripe 安全付款 · 收據自動寄到信箱"}
              </p>
            </div>
          </div>
        )}

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
