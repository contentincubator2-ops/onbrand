/**
 * RequireAuthV2 — protected-route wrapper for AppV2.
 *
 * 2026-05-08 (P1-5): added timeout + retry. Prior version returned null
 * silently on slow networks — user saw blank page. Now after 6s without
 * response we surface a "重新嘗試" button so the user has a recovery
 * path.
 */
import { tr } from "../../lib/i18n";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { WaitingIcon } from "../platform/components/icons";
import { fetchAuthMe } from "../../lib/authMe";

const AUTH_CHECK_TIMEOUT_MS = 6000;

// 2026-09-29: only these mean "no valid session". A 429 (rate limit), 5xx or
// network error used to redirect to /auth/login too, which looked like a
// random logout after a few quick page switches. Those now show the retry
// screen instead.
const LOGGED_OUT_STATUSES = new Set([401, 403, 404]);

type Failure = "timeout" | "error" | null;

export default function RequireAuthV2({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [ok, setOk] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let settled = false;
    setChecking(true);
    setFailure(null);

    // The /me request is shared with other callers (fetchAuthMe), so we don't
    // abort it on timeout — we just stop waiting for it.
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
      setChecking(false);
    };
    const timer = setTimeout(() => settle(() => setFailure("timeout")), AUTH_CHECK_TIMEOUT_MS);

    fetchAuthMe().then(
      ({ status, data }) => settle(() => {
        if (LOGGED_OUT_STATUSES.has(status)) { setOk(false); return; }
        if (status < 200 || status >= 300) { setFailure("error"); return; }
        if (data?.user?.planStatus === "expired") {
          // 2026-05-29: auto-heal sets planStatus='expired' when trial ends.
          // Redirect to upgrade page instead of letting the user hit
          // confusing 403 errors on every tRPC call.
          navigate("/plan-expired", { replace: true });
          return;
        }
        if (data?.user) setOk(true);
        else setFailure("error");
      }),
      () => settle(() => setFailure("error")),
    );
    return () => { settled = true; clearTimeout(timer); };
  }, [attempt]);

  useEffect(() => {
    // Only redirect when the server said the session is gone — on timeout or
    // a transient error let the user retry first.
    if (!checking && !ok && !failure) navigate("/auth/login", { replace: true });
  }, [checking, ok, failure, navigate]);

  if (failure) {
    const timedOut = failure === "timeout";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <div className="text-2xl mb-3"><WaitingIcon size={24} /></div>
          <h1 className="text-lg font-semibold mb-2">{timedOut ? tr("The server is responding slowly", "伺服器回應較慢") : tr("Can't confirm your sign-in right now", "暫時無法確認登入狀態")}</h1>
          <p className="text-sm text-default-500 mb-5">
            {timedOut
              ? tr("Verifying your identity took over 6 seconds. The network may be slow or the server busy.", "驗證身分超過 6 秒沒有回應。可能是網路慢或伺服器忙碌。")
              : tr("The server is busy or the network is unstable. You are still signed in — please try again shortly.", "伺服器忙碌或網路不穩，你仍在登入中。請稍候再試一次。")}
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="w-full px-4 py-2 rounded-full bg-zinc-600 text-white text-sm font-semibold hover:bg-zinc-700 transition"
            >
              {tr("Try again", "重新嘗試")}
            </button>
            <button
              onClick={() => navigate("/auth/login", { replace: true })}
              className="w-full px-4 py-2 rounded-full bg-default-100 text-default-700 text-sm hover:bg-default-200 transition"
            >
              {tr("Sign in again", "重新登入")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 rounded-full border-2 border-default-200 border-t-violet-500 animate-spin"
          />
          <div className="text-small tracking-[0.2em] uppercase text-default-400">
            onBrand Studio · {tr("Loading", "載入中")}
          </div>
        </div>
      </div>
    );
  }
  if (!ok) return null;
  return <>{children}</>;
}
