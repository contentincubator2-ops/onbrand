/**
 * VerifyEmailPage.tsx — Email verification page
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLang } from "../../../../lib/i18n";

export default function VerifyEmailPage() {
  const { lang } = useLang();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get("token");

      if (!token) {
        setStatus("error");
        setMessage(lang === "en" ? "Invalid verification link" : "無效的驗證連結");
        return;
      }

      try {
        const res = await fetch("/api/auth/verifyEmail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          setStatus("error");
          setMessage(data.error || (lang === "en" ? "Verification failed" : "驗證失敗"));
          return;
        }

        setStatus("success");
        setMessage(lang === "en" ? "Your email is verified!" : "您的電子郵件已成功驗證！");

        await new Promise(resolve => setTimeout(resolve, 500));
        window.location.href = "/planner";
      } catch (err) {
        setStatus("error");
        setMessage(lang === "en" ? "Network error — try again in a sec." : "網路錯誤，請稍後再試");
      }
    };

    verifyEmail();
  }, [searchParams, navigate, lang]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 w-full max-w-md text-center">
        {status === "loading" && (
          <>
            <div className="w-16 h-16 border-4 border-zinc-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-6" />
            <h1 className="text-2xl font-bold text-gray-900">
              {lang === "en" ? "Verifying…" : "驗證中…"}
            </h1>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {lang === "en" ? "You're verified!" : "驗證成功！"}
            </h1>
            <p className="text-sm text-gray-500">
              {lang === "en" ? "Taking you home…" : "正在前往首頁…"}
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {lang === "en" ? "Verification failed" : "驗證失敗"}
            </h1>
            <p className="text-gray-600 mb-6">{message}</p>
            <button
              onClick={() => navigate("/auth/login")}
              className="inline-block rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200"
              style={{ background: "#171717" }}
            >
              {lang === "en" ? "← Back to sign in" : "返回登入"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
