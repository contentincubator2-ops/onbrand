/**
 * RegisterPage.tsx — Email/password registration
 *
 * 2026-06-01 fix: if the user is already authenticated (e.g. came via Google
 * OAuth), redirect to "/" immediately instead of showing the register form.
 * This prevents the "此電子郵件已註冊" dead-end loop for Google-login users
 * who click a landing-page "免費試用" CTA.
 */

import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useLang } from "../../lib/i18n";

export default function RegisterPage() {
  const { t, lang, setLang } = useLang();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const navigate = useNavigate();

  // If already logged in, skip straight to the app.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          navigate("/theater", { replace: true });
        } else {
          setAuthChecking(false);
        }
      })
      .catch(() => { if (!cancelled) setAuthChecking(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show a minimal spinner while the auth check is in flight (avoids
  // briefly flashing the register form to already-logged-in users).
  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-7 h-7 rounded-full border-2 border-gray-200 border-t-violet-500 animate-spin" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!name || !email || !password || !confirmPassword) {
      setError(lang === "en" ? "Please fill in every field" : "請填寫所有欄位");
      return;
    }

    if (password !== confirmPassword) {
      setError(lang === "en" ? "Passwords don't match" : "密碼確認不一致");
      return;
    }

    if (password.length < 8) {
      setError(t("auth_err_password_short"));
      return;
    }

    if (!agreeToTerms) {
      setError(lang === "en"
        ? "Agree to the Terms and Privacy Policy to continue"
        : "請同意服務條款和隱私政策");
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
        setError((typeof data.error === "string" ? data.error : data.error?.message) || (lang === "en" ? "Sign-up failed — please try again." : "註冊失敗，請稍後再試"));
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
          window.location.replace("/theater");
          return;
        }
      } catch (e) {
        // fall through to success card
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
      <div className="min-h-screen flex">
        {/* Left brand panel */}
        <div className="hidden lg:flex flex-col justify-center px-16 w-1/2" style={{ background: "linear-gradient(160deg, #6C5CE7 0%, #a29bfe 100%)" }}>
          <div className="text-white">
            <div className="text-4xl font-bold mb-3">OnBrand · 對版</div>
            <div className="text-xl opacity-80">永遠 on-brand 的行銷作戰指揮台</div>
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
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {lang === "en" ? "You're in!" : "註冊成功！"}
            </h1>
            <p className="text-gray-600 mb-6">
              {lang === "en"
                ? "Your account is ready. Sign in to start creating content."
                : "你的帳號已啟用，可以直接登入使用 OnBrand。"}
            </p>
            <p className="text-sm text-gray-500 mb-6">
              {lang === "en" ? "Account" : "帳號"} <strong>{email}</strong>
            </p>
            <Link
              to="/auth/login"
              className="inline-block rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200"
              style={{ background: "linear-gradient(90deg, #6C5CE7, #a29bfe)" }}
            >
              {lang === "en" ? "Sign in" : "前往登入"}
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
          <div className="text-4xl font-bold mb-3">{lang === "en" ? "OnBrand" : "OnBrand · 對版"}</div>
          <div className="text-xl opacity-80 mb-8">
            {lang === "en" ? "Marketing on autopilot — always on-brand." : "永遠 on-brand 的行銷作戰指揮台"}
          </div>
          <ul className="space-y-4 text-sm opacity-90">
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">✦</span>
              {lang === "en"
                ? "168 tasks, each backed by an award-winning or market-proven case"
                : "168 個任務，每個內建獨立得獎工藝案例"}
            </li>
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">✦</span>
              {lang === "en"
                ? "FB · IG · TikTok · YouTube · Email · PR · Brand Strategy — all channels"
                : "FB、IG、TikTok、YouTube、EDM、PR、品牌策略全管道"}
            </li>
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">✦</span>
              {lang === "en"
                ? "Brand positioning set once — A2A strategy to execution, always on-brand"
                : "品牌定位一鍵鎖定，A2A 策略到執行永遠 on-brand"}
            </li>
          </ul>
          <button
            onClick={() => setLang(lang === "en" ? "zh-TW" : "en")}
            className="mt-10 text-xs opacity-70 hover:opacity-100 underline transition"
          >
            {lang === "en" ? "切換為繁體中文" : "Switch to English"}
          </button>
        </div>
      </div>

      {/* Right register panel */}
      <div className="flex flex-col justify-center items-center w-full lg:w-1/2 px-8">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{t("auth_register_title")}</h1>
            <p className="text-gray-400 text-sm">{t("auth_register_subtitle")}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t("auth_name_label")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("auth_name_placeholder")}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-colors"
                autoComplete="name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t("auth_email_label")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth_email_placeholder")}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-colors"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t("auth_password_label")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth_password_hint")}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-colors"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {lang === "en" ? "Confirm password" : "確認密碼"}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={lang === "en" ? "Type it again" : "再次輸入密碼"}
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
                {t("auth_agree_terms")}{" "}
                <Link to="/terms" className="text-indigo-500 hover:underline">{t("auth_terms_link")}</Link>
                {" "}{t("auth_and")}{" "}
                <Link to="/privacy" className="text-indigo-500 hover:underline">{t("auth_privacy_link")}</Link>
              </label>
            </div>

            {error && (
              <div className="text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 space-y-1.5">
                <div className="flex items-center gap-2 text-red-600">
                  <span>⚠</span> {error}
                </div>
                {/* Email already registered: offer direct login instead of dead-end */}
                {(error.includes("已註冊") || error.includes("already") || error.includes("already registered")) && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <Link
                      to="/auth/login"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
                    >
                      {lang === "en" ? "Sign in to your existing account →" : "直接登入現有帳號 →"}
                    </Link>
                    <span className="text-gray-300">·</span>
                    <a
                      href="/api/auth/google"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
                    >
                      {lang === "en" ? "Sign in with Google →" : "用 Google 登入 →"}
                    </a>
                  </div>
                )}
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
              {loading ? t("auth_register_busy") : t("auth_register_btn")}
            </button>

            <p className="text-center text-xs text-gray-400">
              {t("auth_have_account")}
              <Link to="/auth/login" className="text-indigo-500 hover:text-indigo-700 ml-1 underline">
                {t("auth_sign_in_link")}
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
