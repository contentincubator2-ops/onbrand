/**
 * Background watcher that calls achievements.evaluate periodically and on
 * page focus. Toasts a celebration when a new achievement unlocks.
 *
 * Mounted once at ShellLayout level. Doesn't render UI — emits toasts.
 *
 * 2026-05-10 (CJ「成就系統 + 解鎖時 toast 慶祝」).
 */
import React, { useEffect, useRef } from "react";
import { trpc } from "../../lib/trpc";
import { showToastGlobal } from "../../components/ui/Toast";

const SEEN_KEY = "drop:achievements:seen";

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}
function saveSeen(s: Set<string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch {}
}

export default function AchievementUnlockWatcher() {
  const evalMut = (trpc as any).achievements?.evaluate?.useMutation
    ? (trpc as any).achievements.evaluate.useMutation()
    : null;
  const seenRef = useRef<Set<string>>(loadSeen());
  const lastRunRef = useRef<number>(0);

  useEffect(() => {
    if (!evalMut) return;
    let stopped = false;

    const run = async () => {
      const now = Date.now();
      // throttle to once per 30s
      if (now - lastRunRef.current < 30_000) return;
      lastRunRef.current = now;
      try {
        const fresh = await evalMut.mutateAsync({});
        if (!fresh || !Array.isArray(fresh) || fresh.length === 0) return;
        const seen = seenRef.current;
        for (const a of fresh) {
          if (seen.has(a.code)) continue;
          seen.add(a.code);
          // Stagger toasts so multiple unlocks don't pile on instantly
          setTimeout(() => {
            if (!stopped) {
              showToastGlobal(
                `🎉 解鎖成就「${a.title}」 +${a.points} 點`,
                "success" as any,
              );
            }
          }, 300 * fresh.indexOf(a));
        }
        saveSeen(seen);
      } catch {/* swallow */}
    };

    // run on mount (after small delay so app loads first)
    const initialTimer = setTimeout(run, 2000);

    // run on window focus
    const onFocus = () => run();
    window.addEventListener("focus", onFocus);

    // periodic — every 90s while app is open
    const interval = setInterval(run, 90_000);

    return () => {
      stopped = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [evalMut]);

  return null;
}
