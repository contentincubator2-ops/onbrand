/**
 * ForgotPasswordPage.tsx — Password reset request page
 */

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      setError("請輸入您的電子郵件");
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
        setError(data.error || "請求失敗，請稍後再試");
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError("網路錯誤，請稍後再試");
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
          <h1 className="text-2xl font-bold text-gray-900 mb-2">已發送重設連結</h1>
          <p className="text-gray-600 mb-6">
            如果此電子郵件已註冊，您將收到密碼重設連結
          </p>
          <p className="text-sm text-gray-500 mb-6">
            連結將在 1 小時內有效。請檢查您的收件匣。
          </p>
          <Link
            to="/auth/login"
            className="inline-block rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200"
            style={{ background: "linear-gradient(90deg, #6C5CE7, #a29bfe)" }}
          >
            返回登入
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-center px-16 w-1/2" style={{ background: "linear-gradient(160deg, #6C5CE7 0%, #a29bfe 100%)" }}>
        <div className="text-white">
          <div className="text-4xl font-bold mb-3">Drop · 秒稿</div>
          <div className="text-xl opacity-80">AI 驅動的行銷作戰指揮台</div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex flex-col justify-center items-center w-full lg:w-1/2 px-8">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">忘記密碼？</h1>
            <p className="text-gray-400 text-sm">輸入您的電子郵件以重設密碼</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                電子郵件
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-colors"
                autoComplete="email"
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <span>⚠</span> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: loading ? "#d1cbf8" : "linear-gradient(90deg, #6C5CE7, #a29bfe)",
                color: "white",
                boxShadow: loading ? "none" : "0 4px 12px rgba(108,92,231,0.35)",
              }}
            >
              {loading ? "發送中..." : "發送重設連結"}
            </button>

            <p className="text-center text-xs text-gray-400">
              記得密碼了？
              <Link to="/auth/login" className="text-indigo-500 hover:text-indigo-700 ml-1 underline">
                返回登入
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
