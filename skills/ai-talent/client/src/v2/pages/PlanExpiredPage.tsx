/**
 * PlanExpiredPage — shown when a user's trial has expired.
 *
 * 2026-05-29 (CJ solo-ops): auto-heal sets planStatus='expired'
 * when trial ends. RequireAuthV2 checks this and redirects here so
 * users see a clear upgrade path rather than confusing 403 errors.
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { useLang as useLanguage } from "../../lib/i18n";

export default function PlanExpiredPage() {
  const navigate = useNavigate();
  const { lang } = useLanguage();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-6">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-default-900 mb-2">
          {lang === "en" ? "Your trial has ended" : "試用期已結束"}
        </h1>
        <p className="text-sm text-default-500 mb-2 leading-relaxed">
          {lang === "en"
            ? "Your 7-day free trial has expired. Upgrade to keep your brands, content history, and continue generating."
            : "你的 7 天免費試用已到期。升級後可保留所有品牌定位、內容記錄，並繼續生成內容。"}
        </p>
        <p className="text-xs text-default-400 mb-8">
          {lang === "en"
            ? "Your data is safe — it will be kept for 30 days."
            : "你的資料安全保存，30 天內升級即可完整保留。"}
        </p>

        {/* CTA */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => navigate("/pricing")}
            className="w-full py-3 rounded-full bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition"
          >
            {lang === "en" ? "View plans & upgrade →" : "查看方案，立即升級 →"}
          </button>
          <a
            href="mailto:sowork@sowork.ai?subject=OnBrand 升級諮詢"
            className="block w-full py-2.5 rounded-full bg-default-100 text-default-700 text-sm hover:bg-default-200 transition"
          >
            {lang === "en" ? "Talk to us first" : "先聯絡我們諮詢"}
          </a>
        </div>

        {/* Settings link for account info */}
        <button
          onClick={() => navigate("/settings/account")}
          className="mt-6 text-xs text-default-400 hover:text-default-600 transition underline"
        >
          {lang === "en" ? "View account details" : "查看帳號詳情"}
        </button>
      </div>
    </div>
  );
}
