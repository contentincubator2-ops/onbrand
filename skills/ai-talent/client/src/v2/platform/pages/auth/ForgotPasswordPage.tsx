/**
 * ForgotPasswordPage.tsx — Password reset request page
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../../../../lib/i18n";
import { WarningIcon } from "../../components/icons";

export default function ForgotPasswordPage() {
  const { t, lang, setLang } = useLang();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      setError(t("auth_err_email_invalid"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgotPassword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError((typeof data.error === "string" ? data.error : data.error?.message) || (lang === "en" ? "Couldn't send the link — try again." : "請求失敗，請稍後再試"));
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError(t("auth_err_network"));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{lang === "en" ? "Check your inbox" : "已發送重設連結"}</h1>
          <p className="text-gray-600 mb-6">
            {lang === "en"
              ? "If this email is registered, you'll get a reset link any second now."
              : "如果此電子郵件已註冊，您將收到密碼重設連結"}
          </p>
          <p className="text-sm text-gray-500 mb-6">{t("auth_forgot_sent")}</p>
          <Link
            to="/auth/login"
            className="inline-block rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200"
            style={{ background: "#171717" }}
          >
            {t("auth_back_to_login")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex flex-col justify-center px-16 w-1/2" style={{ background: "#171717" }}>
        <div className="text-white">
          <div className="text-4xl font-bold mb-3">onBrand Studio</div>
          <button
            onClick={() => setLang(lang === "en" ? "zh-TW" : "en")}
            className="mt-10 text-xs opacity-70 hover:opacity-100 underline transition"
          >
            {lang === "en" ? "切換為繁體中文" : "Switch to English"}
          </button>
        </div>
      </div>

      <div className="flex flex-col justify-center items-center w-full lg:w-1/2 px-8">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">{t("auth_forgot_title")}</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t("auth_email_label")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth_email_placeholder")}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:border-zinc-400 transition-colors"
                autoComplete="email"
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <WarningIcon size={14} /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: loading ? "#d4d4d8" : "#171717",
                color: "white",
                boxShadow: loading ? "none" : "0 4px 12px rgba(24,24,27,0.25)",
              }}
            >
              {loading ? t("auth_forgot_busy") : t("auth_forgot_btn")}
            </button>

            <p className="text-center text-xs text-gray-400">
              {lang === "en" ? "Remembered it?" : "記得密碼了？"}
              <Link to="/auth/login" className="text-zinc-500 hover:text-zinc-700 ml-1 underline">
                {t("auth_back_to_login")}
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
