/**
 * ResetPasswordPage.tsx — Password reset page with token
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState(true);

  useEffect(() => {
    const resetToken = searchParams.get("token");
    if (!resetToken) {
      setTokenValid(false);
      setError("無效的重設連結");
    } else {
      setToken(resetToken);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || !confirmPassword) {
      setError("請填寫所有欄位");
      return;
    }

    if (password !== confirmPassword) {
      setError("密碼確認不一致");
      return;
    }

    if (password.length < 8) {
      setError("密碼至少需要 8 個字元");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/resetPassword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "重設失敗，請稍後再試");
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError("網路錯誤，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">無效的連結</h1>
          <p className="text-gray-600 mb-6">此重設連結無效或已過期</p>
          <Link
            to="/auth/forgot-password"
            className="inline-block rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200"
            style={{ background: "linear-gradient(90deg, #6C5CE7, #a29bfe)" }}
          >
            重新申請重設連結
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">密碼重設成功！</h1>
          <p className="text-gray-600 mb-6">您的密碼已成功更新</p>
          <Link
            to="/auth/login"
            className="inline-block rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200"
            style={{ background: "linear-gradient(90deg, #6C5CE7, #a29bfe)" }}
          >
            前往登入
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
          <div className="text-4xl font-bold mb-3">OnBrand · 對版</div>
          <div className="text-xl opacity-80">永遠 on-brand 的行銷作戰指揮台</div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex flex-col justify-center items-center w-full lg:w-1/2 px-8">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">重設密碼</h1>
            <p className="text-gray-400 text-sm">輸入您的新密碼</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                新密碼
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 個字元"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-colors"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                確認新密碼
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次輸入新密碼"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-colors"
                autoComplete="new-password"
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
              disabled={loading || !password || !confirmPassword}
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: loading ? "#d1cbf8" : "linear-gradient(90deg, #6C5CE7, #a29bfe)",
                color: "white",
                boxShadow: loading ? "none" : "0 4px 12px rgba(108,92,231,0.35)",
              }}
            >
              {loading ? "更新中..." : "更新密碼"}
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
