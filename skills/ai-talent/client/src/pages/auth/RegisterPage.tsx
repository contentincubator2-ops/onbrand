/**
 * RegisterPage.tsx — Email/password registration
 */

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!name || !email || !password || !confirmPassword) {
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

    if (!agreeToTerms) {
      setError("請同意服務條款和隱私政策");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "註冊失敗，請稍後再試");
        return;
      }

      // 2026-05-10 (CJ direction「註冊不用收驗證碼，直接註冊」):
      // Email verification is best-effort; backend auto-activates the user.
      // Auto-login immediately after register so the user lands inside the
      // app without seeing a "check your email" wall.
      try {
        const loginRes = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password }),
        });
        const loginData = await loginRes.json();
        if (loginRes.ok && loginData.token) {
          try { localStorage.setItem("authToken", loginData.token); } catch {}
          window.location.replace("/");
          return;
        }
      } catch (e) {
        // fall through to success card
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
      <div className="min-h-screen flex">
        {/* Left brand panel */}
        <div className="hidden lg:flex flex-col justify-center px-16 w-1/2" style={{ background: "linear-gradient(160deg, #6C5CE7 0%, #a29bfe 100%)" }}>
          <div className="text-white">
            <div className="text-4xl font-bold mb-3">Drop · 秒稿</div>
            <div className="text-xl opacity-80">AI 驅動的行銷作戰指揮台</div>
          </div>
        </div>

        {/* Right success panel */}
        <div className="flex flex-col justify-center items-center w-full lg:w-1/2 px-8">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">註冊成功！</h1>
            <p className="text-gray-600 mb-6">
              你的帳號已啟用，可以直接登入使用 Drop。
            </p>
            <p className="text-sm text-gray-500 mb-6">
              帳號 <strong>{email}</strong>
            </p>
            <Link
              to="/auth/login"
              className="inline-block rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200"
              style={{ background: "linear-gradient(90deg, #6C5CE7, #a29bfe)" }}
            >
              前往登入
            </Link>
          </div>
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
          <div className="text-xl opacity-80 mb-8">AI 驅動的行銷作戰指揮台</div>
          <ul className="space-y-4 text-sm opacity-90">
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">✦</span>
              註冊即送 1000 點數，免費體驗 AI 行銷
            </li>
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">✦</span>
              多 Agent 並行執行，3 倍行銷產出效率
            </li>
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">✦</span>
              Facebook、LinkedIn、YouTube 全管道整合
            </li>
          </ul>
        </div>
      </div>

      {/* Right register panel */}
      <div className="flex flex-col justify-center items-center w-full lg:w-1/2 px-8">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">建立新帳號</h1>
            <p className="text-gray-400 text-sm">開始使用 Drop · 秒稿</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                姓名
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="您的姓名"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-colors"
                autoComplete="name"
                required
              />
            </div>

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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                密碼
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
                確認密碼
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次輸入密碼"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-colors"
                autoComplete="new-password"
                required
              />
            </div>

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="terms"
                checked={agreeToTerms}
                onChange={(e) => setAgreeToTerms(e.target.checked)}
                className="mt-0.5"
                required
              />
              <label htmlFor="terms" className="text-xs text-gray-500">
                我同意 <Link to="/terms" className="text-indigo-500 hover:underline">服務條款</Link> 和 <Link to="/privacy" className="text-indigo-500 hover:underline">隱私政策</Link>
              </label>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <span>⚠</span> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: loading ? "#d1cbf8" : "linear-gradient(90deg, #6C5CE7, #a29bfe)",
                color: "white",
                boxShadow: loading ? "none" : "0 4px 12px rgba(108,92,231,0.35)",
              }}
            >
              {loading ? "註冊中..." : "註冊"}
            </button>

            <p className="text-center text-xs text-gray-400">
              已有帳號？
              <Link to="/auth/login" className="text-indigo-500 hover:text-indigo-700 ml-1 underline">
                立即登入
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
