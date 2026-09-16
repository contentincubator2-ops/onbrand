/** Mobile-first shell and helpers for the rep's LIFF pages (run inside LINE at ~375px). */
import React, { useEffect, useRef, useState } from "react";
import { Circle, Info, LogIn } from "lucide-react";
import { cx } from "../ui";
import type { LiffBoot } from "./liff-useLiff";

export const LIFF_DISCLAIMER = "Concept demo — not affiliated with ASUS.";

export function LiffShell({
  title,
  subtitle,
  simulate,
  children,
}: {
  title: string;
  subtitle?: string | null;
  simulate?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {simulate ? (
        <div className="bg-stone-800 px-4 py-1 text-center text-[11px] font-medium text-stone-100">Preview mode (admin)</div>
      ) : null}
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-2.5 px-4 py-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-900 text-[11px] font-bold text-white" aria-hidden>
            EH
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold leading-tight">{title}</h1>
            <div className="truncate text-[11px] text-stone-500">{subtitle || "ExpertHub AI Team"}</div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pb-8 pt-4">{children}</main>
      <footer className="mx-auto max-w-md px-4 pb-8 text-center text-[11px] text-stone-400">{LIFF_DISCLAIMER}</footer>
    </div>
  );
}

/** Everything that isn't "ready" — bilingual, since the rep's market isn't known yet. */
export function BootNotice({ boot }: { boot: Exclude<LiffBoot, { status: "ready" }> }) {
  if (boot.status === "loading") return <Notice icon="pulse" zh="載入中…" en="Loading…" />;
  if (boot.status === "redirecting") return <Notice icon="login" zh="正在以 LINE 登入…" en="Signing in with LINE…" />;
  if (boot.status === "not-configured") {
    return (
      <Notice
        icon="info"
        zh="LINE 尚未設定"
        en="LINE not configured yet"
        detail="HQ hasn't connected a LIFF app for this server. At the booth, open this page from the phone simulator instead."
      />
    );
  }
  return <Notice icon="info" zh="無法開啟頁面" en="Couldn't open this page" detail={boot.message} tone="bad" />;
}

export function Notice({
  icon,
  zh,
  en,
  detail,
  tone = "neutral",
}: {
  icon: "pulse" | "login" | "info";
  zh?: string;
  en: string;
  detail?: string | null;
  tone?: "neutral" | "bad";
}) {
  return (
    <div
      className={cx(
        "flex items-start gap-3 rounded-xl border p-4",
        tone === "bad" ? "border-red-200 bg-red-50 text-red-900" : "border-stone-200 bg-white text-stone-800",
      )}
      role={tone === "bad" ? "alert" : "status"}
    >
      {icon === "pulse" ? <Circle className="mt-1 h-3 w-3 shrink-0 animate-pulse text-stone-400" aria-hidden /> : null}
      {icon === "login" ? <LogIn className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" aria-hidden /> : null}
      {icon === "info" ? <Info className={cx("mt-0.5 h-4 w-4 shrink-0", tone === "bad" ? "text-red-700" : "text-stone-500")} aria-hidden /> : null}
      <div className="min-w-0">
        {zh ? <div className="text-[14px] font-medium">{zh}</div> : null}
        <div className={cx(zh ? "text-[13px] text-stone-500" : "text-[14px] font-medium", tone === "bad" && zh && "text-red-800")}>{en}</div>
        {detail ? <div className={cx("mt-1.5 break-words text-[13px]", tone === "bad" ? "text-red-800" : "text-stone-600")}>{detail}</div> : null}
      </div>
    </div>
  );
}

export function ErrorLine({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800" role="alert">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  );
}

export const btnPrimary =
  "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-3 text-[15px] font-medium text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300";
export const btnSecondary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-[14px] font-medium text-stone-800 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400 disabled:hover:bg-white";

/**
 * Clipboard with a fallback for older in-app browsers: select the textarea's
 * text so the rep can long-press → Copy. Returns "copied" | "selected" | "failed".
 */
export function useCopy() {
  const [state, setState] = useState<"idle" | "copied" | "selected">("idle");
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flash = (s: "copied" | "selected") => {
    setState(s);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), s === "copied" ? 2000 : 5000);
  };

  const copy = async (text: string, field?: HTMLTextAreaElement | null): Promise<"copied" | "selected" | "failed"> => {
    try {
      await navigator.clipboard.writeText(text);
      flash("copied");
      return "copied";
    } catch {
      /* fall through */
    }
    if (field) {
      field.focus();
      field.select();
      try {
        if (document.execCommand("copy")) {
          flash("copied");
          return "copied";
        }
      } catch {
        /* ignore */
      }
      flash("selected");
      return "selected";
    }
    return "failed";
  };

  return { state, copy };
}

/** Seconds since `active` became true; 0 when inactive. */
export function useElapsed(active: boolean): number {
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      setStart(null);
      return;
    }
    setStart(Date.now());
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return start == null ? 0 : Math.max(0, Math.round((now - start) / 1000));
}
