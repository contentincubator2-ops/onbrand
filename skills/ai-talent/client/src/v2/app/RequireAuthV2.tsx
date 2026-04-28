/**
 * RequireAuthV2 — protected-route wrapper for AppV2.
 * Same /api/auth/me probe as the legacy RequireAuth, but renders a
 * paper-themed loading state and supports `<Outlet>` so it can wrap
 * the ShellLayout once for many child routes.
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function RequireAuthV2({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/auth/me", {
          method: "POST",
          credentials: "include",
        });
        if (cancelled) return;
        if (!r.ok) { setOk(false); return; }
        const d = await r.json();
        setOk(!!d.user);
      } catch {
        if (!cancelled) setOk(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!checking && !ok) navigate("/auth/login", { replace: true });
  }, [checking, ok, navigate]);

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-small tracking-[0.2em] uppercase text-default-400">
          Marketing OS · 載入中
        </div>
      </div>
    );
  }
  if (!ok) return null;
  return <>{children}</>;
}
