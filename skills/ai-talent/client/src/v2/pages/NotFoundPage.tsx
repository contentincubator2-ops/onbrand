/**
 * NotFoundPage — 404 screen shown for any route that doesn't match.
 *
 * 2026-05-29 (CJ solo-ops): previously the app silently redirected to /
 * for all unknown routes. This page tells users clearly what happened
 * and gives them recovery paths.
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { useLang as useLanguage } from "../../lib/i18n";

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { lang } = useLanguage();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        {/* Large 404 */}
        <div className="text-8xl font-bold text-default-100 select-none mb-2">404</div>

        <h1 className="text-xl font-semibold text-default-900 mb-2">
          {lang === "en" ? "Page not found" : "找不到這個頁面"}
        </h1>
        <p className="text-sm text-default-500 mb-8 leading-relaxed">
          {lang === "en"
            ? "The link may be broken or the page may have been moved."
            : "連結可能已失效，或頁面已移動到新的位置。"}
        </p>

        {/* Recovery actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-full py-2.5 rounded-full bg-default-100 text-default-700 text-sm font-medium hover:bg-default-200 transition"
          >
            {lang === "en" ? "← Go back" : "← 返回上一頁"}
          </button>
          <button
            onClick={() => navigate("/theater", { replace: true })}
            className="w-full py-2.5 rounded-full bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition"
          >
            {lang === "en" ? "Go to home" : "前往主頁"}
          </button>
        </div>

        {/* Support link */}
        <p className="mt-8 text-xs text-default-400">
          {lang === "en" ? "Need help? " : "需要協助？"}
          <a
            href="mailto:sowork@sowork.ai"
            className="text-violet-500 hover:underline"
          >
            sowork@sowork.ai
          </a>
        </p>
      </div>
    </div>
  );
}
