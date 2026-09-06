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

function routeChinese(route: string): string {
  return ({
    onboarding: "入門", explore: "探索", visual: "視覺",
    planning: "規劃", integration: "整合", publish: "發布",
    upgrade: "升級",
  } as Record<string, string>)[route] ?? route;
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
        const r = await evalMut.mutateAsync({});
        if (!r) return;
        const seen = seenRef.current;
        let toastIdx = 0;
        const stagger = (msg: string) => {
          setTimeout(() => {
            if (!stopped) showToastGlobal(msg, "success" as any);
          }, 350 * toastIdx);
          toastIdx++;
        };

        // 1) Per-achievement unlocks
        const fresh: any[] = r.newAchievements ?? [];
        for (const a of fresh) {
          if (seen.has(a.code)) continue;
          seen.add(a.code);
          stagger(`🎉 解鎖成就「${a.title}」 +${a.points} 點`);
        }

        // 2) Route completions — bigger celebration, list rewards
        const grants: any[] = r.routeGrants ?? [];
        for (const g of grants) {
          const grantKey = `route:${g.route}`;
          if (seen.has(grantKey)) continue;
          seen.add(grantKey);
          const rewardLabels = (g.rewards ?? []).map((rw: any) => rw.label).join(" · ");
          stagger(`完成路線「${routeChinese(g.route)}」獎勵：${rewardLabels}`);
        }

        // 3) Finale — all 18 unlocked
        if (r.finaleGrant && !seen.has("finale")) {
          seen.add("finale");
          const labels = (r.finaleGrant.rewards ?? []).map((rw: any) => rw.label).join(" · ");
          stagger(`🏆 全 18 成就達成！OnBrand Founding User · ${labels}`);
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
