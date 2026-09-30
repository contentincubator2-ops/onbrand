/**
 * RequireAuthV2 — protected-route wrapper for AppV2.
 *
 * 2026-05-08 (P1-5): added timeout + retry. Prior version returned null
 * silently on slow networks — user saw blank page. Now after 6s without
 * response we surface a "重新嘗試" button so the user has a recovery
 * path.
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { WaitingIcon } from "../platform/components/icons";

const AUTH_CHECK_TIMEOUT_MS = 6000;

export default function RequireAuthV2({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [ok, setOk] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setChecking(true);
    setTimedOut(false);

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      if (!cancelled) {
        setTimedOut(true);
        setChecking(false);
      }
    }, AUTH_CHECK_TIMEOUT_MS);

    (async () => {
      try {
        const r = await fetch("/api/auth/me", {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
        });
        if (cancelled) return;
        clearTimeout(timer);
        if (!r.ok) { setOk(false); setChecking(false); return; }
        const d = await r.json();
        if (d.user?.planStatus === "expired") {
          // 2026-05-29: auto-heal sets planStatus='expired' when trial ends.
          // Redirect to upgrade page instead of letting the user hit
          // confusing 403 errors on every tRPC call.
          navigate("/plan-expired", { replace: true });
          setChecking(false);
          return;
        }
        setOk(!!d.user);
        setChecking(false);
      } catch (err: any) {
        if (cancelled) return;
        clearTimeout(timer);
        // Aborted by timeout → already handled above.
        if (err?.name !== "AbortError") {
          setOk(false);
          setChecking(false);
        }
      }
    })();
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [attempt]);

  useEffect(() => {
    // Only redirect when explicitly NOT ok (not on timeout — let the
    // user retry first).
    if (!checking && !ok && !timedOut) navigate("/auth/login", { replace: true });
  }, [checking, ok, timedOut, navigate]);

  if (timedOut) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <div className="text-2xl mb-3"><WaitingIcon size={24} /></div>
          <h1 className="text-lg font-semibold mb-2">伺服器回應較慢</h1>
          <p className="text-sm text-default-500 mb-5">
            驗證身分超過 6 秒沒有回應。可能是網路慢或伺服器忙碌。
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="w-full px-4 py-2 rounded-full bg-zinc-600 text-white text-sm font-semibold hover:bg-zinc-700 transition"
            >
              重新嘗試
            </button>
            <button
              onClick={() => navigate("/auth/login", { replace: true })}
              className="w-full px-4 py-2 rounded-full bg-default-100 text-default-700 text-sm hover:bg-default-200 transition"
            >
              重新登入
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
            onBrand Studio · 載入中
          </div>
        </div>
      </div>
    );
  }
  if (!ok) return null;
  return <>{children}</>;
}
