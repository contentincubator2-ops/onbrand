/**
 * RegisterPage.tsx — Email/password registration
 *
 * 2026-06-12 (CJ direction「插畫風格參考 www.sowork.ai」):
 *   Restyled to match SoWork.ai's editorial-illustration visual language —
 *   warm cream background, orange accents, heavy black headlines, thick
 *   black-bordered cards. Mirrors LandingPage / LoginPage palette.
 *
 * 2026-06-01 fix: if the user is already authenticated (e.g. came via Google
 * OAuth), redirect to "/" immediately instead of showing the register form.
 * This prevents the "此電子郵件已註冊" dead-end loop for Google-login users
 * who click a landing-page "免費試用" CTA.
 */

import { CATALOG } from "../../v2/platform/lib/catalogFigures";
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useLang } from "../../lib/i18n";
import { logActivation } from "../../v2/platform/lib/activationTelemetry";
import { WarningIcon } from "../../v2/platform/components/icons";

// SoWork.ai design tokens
const C = {
  cream: "#F7F2EB",
  ink: "#0F0F0E",
  inkSoft: "#3A3633",
  muted: "#6B6660",
  orange: "#E85D2E",
  orangeDark: "#C84516",
  orangeChip: "#FDE6D8",
  border: "#E8DECC",
  borderSoft: "#EFE7D6",
  white: "#FFFFFF",
};

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

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.cream }}>
        <div
          className="w-7 h-7 rounded-full animate-spin"
          style={{ border: `3px solid ${C.borderSoft}`, borderTopColor: C.orange }}
        />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
          // 2026-06-21 (TTFV): activation funnel — stage 1 (register_completed).
          // Fired BEFORE redirect so the event sticks even if the navigation
          // teardown cancels in-flight requests on slow mobiles.
          logActivation("register_completed", { method: "email" });
          // 2026-07-15 (activation funnel — Leak A fix): a brand-new account
          // has 0 brands. Landing on /theater (empty publishing calendar) was
          // a dead end — 37% of signups never created a brand. Route straight
          // to the brand grid's guided "建立你的第一個品牌" empty-state + modal.
          window.location.replace("/brands?all=1");
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

  // ── Success card ────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen flex" style={{ background: C.cream }}>
        <div
          className="hidden lg:flex flex-col justify-center px-14 w-[55%] relative"
          style={{ background: C.cream, borderRight: `1px solid ${C.borderSoft}` }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `radial-gradient(circle, ${C.ink} 1px, transparent 1px)`,
              backgroundSize: "28px 28px",
              opacity: 0.045,
            }}
            aria-hidden
          />
          <div className="max-w-xl relative z-10">
            <div className="flex items-center gap-2 mb-8">
              <svg width="22" height="26" viewBox="0 0 24 28" fill="none" aria-hidden>
                <path d="M12 2 C 16 8, 22 14, 22 19 A 10 10 0 0 1 2 19 C 2 14, 8 8, 12 2 Z" fill={C.orange} stroke={C.ink} strokeWidth="2.2" strokeLinejoin="round" />
              </svg>
              <span className="text-[18px] font-extrabold" style={{ color: C.ink }}>
                OnBrand<span style={{ color: C.orange }}>.ai</span>
              </span>
            </div>
            <div
              className="inline-block text-[12px] font-bold px-3 py-1.5 rounded-md mb-5"
              style={{ background: C.orangeChip, color: C.orangeDark }}
            >
              {lang === "en" ? "Step 1 complete" : "第 1 步完成"}
            </div>
            <h2
              className="font-black tracking-tight leading-[1.1] mb-4"
              style={{ color: C.ink, fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", letterSpacing: "-0.02em" }}
            >
              {lang === "en" ? "Welcome aboard." : "歡迎加入。"}
              <br />
              <span style={{ color: C.orange }}>
                {lang === "en" ? "Let's build your Brand Brain." : "一起建立你的品牌大腦。"}
              </span>
            </h2>
            <p className="text-[14px] leading-relaxed" style={{ color: C.muted }}>
              {lang === "en"
                ? "Next: complete SoWork's 14-step Brand Positioning Method (about 10 minutes). Once locked, every caption stays on-brand automatically."
                : "下一步：完成 SoWork 14 步品牌定位法（約 10 分鐘）。完成後，你產出的每一篇貼文都會自動 on-brand。"}
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-center items-center w-full lg:w-[45%] px-8" style={{ background: C.cream }}>
          <div
            className="rounded-2xl p-10 w-full max-w-md text-center"
            style={{ background: C.white, border: `2px solid ${C.ink}`, boxShadow: `6px 6px 0 ${C.ink}` }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: C.orangeChip, border: `2px solid ${C.ink}` }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-black mb-2" style={{ color: C.ink, letterSpacing: "-0.01em" }}>
              {lang === "en" ? "You're in!" : "註冊成功！"}
            </h1>
            <p className="mb-6" style={{ color: C.inkSoft }}>
              {lang === "en"
                ? "Your account is ready. Sign in to start creating content."
                : "你的帳號已啟用，可以直接登入使用 OnBrand。"}
            </p>
            <p className="text-sm mb-6" style={{ color: C.muted }}>
              {lang === "en" ? "Account" : "帳號"} <strong style={{ color: C.ink }}>{email}</strong>
            </p>
            <Link
              to="/auth/login"
              className="inline-block rounded-lg px-6 py-2.5 text-sm font-bold transition-transform hover:-translate-y-0.5"
              style={{ background: C.orange, color: C.white, boxShadow: `0 4px 0 ${C.orangeDark}` }}
            >
              {lang === "en" ? "Sign in" : "前往登入"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const FEATURES = lang === "en"
    ? [
        ["01", "Brand Brain", "Lock your positioning once. Every post stays on-brand."],
        ["02", "Content Tiers", "A single post · a content pack · a full campaign."],
        ["03", "7-Day Publisher", "Schedule a whole week across channels in one click."],
        ["04", "Sourced", `Viral-structure cards refreshed monthly, each with its spread metric, measurement month and reference article.`],
      ]
    : [
        ["01", "品牌大腦", "鎖定一次品牌定位 · 每篇貼文自動 on-brand"],
        ["02", "三種規格", "單篇內容 · 內容套組 · 完整企劃"],
        ["03", "七日發布台", "一次排好 7 天 × 全平台內容"],
        ["04", "有出處", `每月更新的爆款結構卡，每張附傳播數字、量測年月與參考文章`],
      ];

  return (
    <div className="min-h-screen flex" style={{ background: C.cream }}>
      {/* ── Left: marketing panel (55%) ──────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-center px-14 py-12 w-[55%] relative overflow-y-auto"
        style={{ background: C.cream, borderRight: `1px solid ${C.borderSoft}` }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle, ${C.ink} 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
            opacity: 0.045,
          }}
          aria-hidden
        />

        <div className="max-w-xl relative z-10">
          {/* Brand mark */}
          <div className="flex items-center gap-2 mb-8">
            <svg width="22" height="26" viewBox="0 0 24 28" fill="none" aria-hidden>
              <path d="M12 2 C 16 8, 22 14, 22 19 A 10 10 0 0 1 2 19 C 2 14, 8 8, 12 2 Z" fill={C.orange} stroke={C.ink} strokeWidth="2.2" strokeLinejoin="round" />
            </svg>
            <span className="text-[18px] font-extrabold" style={{ color: C.ink }}>
              OnBrand<span style={{ color: C.orange }}>.ai</span>
            </span>
          </div>

          {/* Pill chip */}
          <div
            className="inline-block text-[12px] font-bold px-3 py-1.5 rounded-md mb-5"
            style={{ background: C.orangeChip, color: C.orangeDark }}
          >
            {lang === "en" ? "AI-Powered Brand Brain" : "AI 驅動的品牌大腦"}
          </div>

          {/* Hero headline */}
          <h1
            className="font-black tracking-tight leading-[1.05] mb-5"
            style={{
              color: C.ink,
              fontSize: "clamp(2rem, 4vw, 3.2rem)",
              letterSpacing: "-0.02em",
            }}
          >
            {lang === "en" ? (
              <>
                Always
                <br />
                on-brand.
              </>
            ) : (
              <>
                永遠 on-brand
                <br />
                的 AI 行銷工作室
              </>
            )}
          </h1>

          <p className="text-[14.5px] leading-[1.75] mb-8 max-w-[500px]" style={{ color: C.muted }}>
            {lang === "en"
              ? "OnBrand isn't another one-click AI generator. SoWork's 14-step Brand Positioning Method writes your Why, TA, Differentiation and Voice into a Brand Brain. Set it once. Every channel follows."
              : "OnBrand 不是「AI 一鍵生成」工具——把 SoWork 14 步品牌定位法做成可執行流程，AI 在每篇貼文之前先讀懂你的 WHY、TA、差異化。鎖定一次，所有平台都跟著你的調性走。"}
          </p>

          <div className="grid grid-cols-2 gap-3 mb-8 max-w-[500px]">
            {FEATURES.map(([n, title, desc]) => (
              <div
                key={n}
                className="p-4 rounded-xl transition hover:-translate-y-0.5"
                style={{ background: C.white, border: `1.5px solid ${C.ink}` }}
              >
                <div className="text-[12px] font-black tracking-[0.2em] mb-2" style={{ color: C.orange }}>
                  {n}
                </div>
                <div className="text-[13.5px] font-bold mb-1 leading-snug" style={{ color: C.ink }}>
                  {title}
                </div>
                <div className="text-[11.5px] leading-relaxed" style={{ color: C.muted }}>
                  {desc}
                </div>
              </div>
            ))}
          </div>

          {/* 2026-09-29（CJ）：內容通路只剩 FB／IG／TikTok／電子報／官網 */}
          <div className="flex items-center gap-2 text-[10.5px] mb-6 flex-wrap" style={{ color: C.inkSoft }}>
            <span className="font-bold tracking-wider">
              {lang === "en" ? "ALL CHANNELS" : "全管道覆蓋"}
            </span>
            <span style={{ color: C.muted }}>·</span><span>Facebook</span>
            <span style={{ color: C.muted }}>·</span><span>Instagram</span>
            <span style={{ color: C.muted }}>·</span><span>Threads</span>
            <span style={{ color: C.muted }}>·</span><span>LINE</span>
            <span style={{ color: C.muted }}>·</span><span>TikTok</span>
            <span style={{ color: C.muted }}>·</span><span>Email</span>
            <span style={{ color: C.muted }}>·</span><span>{lang === "en" ? "Website" : "官網"}</span>
          </div>

          <button
            onClick={() => setLang(lang === "en" ? "zh-TW" : "en")}
            className="text-xs underline transition hover:opacity-70"
            style={{ color: C.muted }}
          >
            {lang === "en" ? "切換為繁體中文" : "Switch to English"}
          </button>
        </div>
      </div>

      {/* ── Right: register panel (45%) ──────────────────────────── */}
      <div className="flex flex-col justify-center items-center w-full lg:w-[45%] px-8 py-10" style={{ background: C.cream }}>
        <div className="w-full max-w-md">
          {/* Hero copy */}
          <div className="mb-5 text-center">
            <div
              className="inline-block text-[12px] font-bold tracking-[0.2em] uppercase px-3 py-1 rounded-md mb-3"
              style={{ background: C.orangeChip, color: C.orangeDark }}
            >
              {lang === "en" ? "Start free" : "免費開始"}
            </div>
            <h1 className="text-[28px] font-black mb-2" style={{ color: C.ink, letterSpacing: "-0.02em" }}>
              {lang === "en" ? "Build your Brand Brain." : "建立你的品牌大腦"}
            </h1>
            <p className="text-sm" style={{ color: C.muted }}>
              {lang === "en"
                ? "No credit card. 14-step positioning takes ~10 minutes."
                : "免信用卡 · 14 步定位流程約 10 分鐘完成"}
            </p>
          </div>

          {/* Google one-tap */}
          <a
            href="/api/auth/google"
            className="w-full flex items-center justify-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold transition mb-4"
            style={{ border: `1.5px solid ${C.ink}`, color: C.ink, background: C.white }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {lang === "en" ? "Sign up with Google" : "用 Google 註冊"}
          </a>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full" style={{ borderTop: `1px solid ${C.border}` }} />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2" style={{ background: C.cream, color: C.muted }}>
                {lang === "en" ? "or use email" : "或用 Email"}
              </span>
            </div>
          </div>

          {/* Register card */}
          <div
            className="rounded-2xl p-8 w-full"
            style={{ background: C.white, border: `2px solid ${C.ink}`, boxShadow: `6px 6px 0 ${C.ink}` }}
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: C.ink }}>
                  {t("auth_name_label")}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("auth_name_placeholder")}
                  className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors"
                  style={{ border: `1.5px solid ${C.border}`, background: C.white, color: C.ink }}
                  autoComplete="name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: C.ink }}>
                  {t("auth_email_label")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth_email_placeholder")}
                  className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors"
                  style={{ border: `1.5px solid ${C.border}`, background: C.white, color: C.ink }}
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: C.ink }}>
                  {t("auth_password_label")}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth_password_hint")}
                  className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors"
                  style={{ border: `1.5px solid ${C.border}`, background: C.white, color: C.ink }}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: C.ink }}>
                  {lang === "en" ? "Confirm password" : "確認密碼"}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={lang === "en" ? "Type it again" : "再次輸入密碼"}
                  className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors"
                  style={{ border: `1.5px solid ${C.border}`, background: C.white, color: C.ink }}
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
                <label htmlFor="terms" className="text-xs" style={{ color: C.muted }}>
                  {t("auth_agree_terms")}{" "}
                  <Link to="/terms" className="hover:underline" style={{ color: C.orange }}>{t("auth_terms_link")}</Link>
                  {" "}{t("auth_and")}{" "}
                  <Link to="/privacy" className="hover:underline" style={{ color: C.orange }}>{t("auth_privacy_link")}</Link>
                </label>
              </div>

              {error && (
                <div
                  className="text-sm rounded-lg px-3 py-2.5 space-y-1.5"
                  style={{ background: "#FFF1ED", border: `1.5px solid ${C.orange}` }}
                >
                  <div className="flex items-center gap-2" style={{ color: C.orangeDark }}>
                    <WarningIcon size={14} /> {error}
                  </div>
                  {(error.includes("已註冊") || error.includes("already") || error.includes("already registered")) && (
                    <div className="flex items-center gap-2 pt-0.5">
                      <Link to="/auth/login" className="inline-flex items-center gap-1 text-xs font-bold underline hover:opacity-70" style={{ color: C.orangeDark }}>
                        {lang === "en" ? "Sign in to your existing account →" : "直接登入現有帳號 →"}
                      </Link>
                      <span style={{ color: C.muted }}>·</span>
                      <a href="/api/auth/google" className="inline-flex items-center gap-1 text-xs font-bold underline hover:opacity-70" style={{ color: C.orangeDark }}>
                        {lang === "en" ? "Sign in with Google →" : "用 Google 登入 →"}
                      </a>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg py-2.5 text-sm font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                style={{
                  background: C.orange,
                  color: C.white,
                  boxShadow: loading ? "none" : `0 4px 0 ${C.orangeDark}`,
                }}
              >
                {loading ? t("auth_register_busy") : t("auth_register_btn")}
              </button>

              <p className="text-center text-xs" style={{ color: C.muted }}>
                {t("auth_have_account")}
                <Link to="/auth/login" className="ml-1 underline hover:opacity-70" style={{ color: C.orange }}>
                  {t("auth_sign_in_link")}
                </Link>
              </p>
            </form>
          </div>

          <p className="text-center text-[12px] mt-6 leading-relaxed" style={{ color: C.muted }}>
            {lang === "en"
              ? "By signing up you agree to our Terms & Privacy. SoWork × OnBrand"
              : "註冊即代表同意《服務條款》與《隱私政策》。SoWork × OnBrand"}
          </p>
        </div>
      </div>
    </div>
  );
}
