/**
 * i18n.tsx — Language context + useLang() hook
 *
 * Design:
 * - Supported: "zh-TW" (Traditional Chinese) | "en" (English)
 * - Priority: URL ?lang=xx > DB (server) > localStorage > browser locale
 * - On mount: read URL query first (Google indexes hreflang=?lang=en
 *   alternates — needs to honour the param), fall back to local detection,
 *   then sync from DB if logged-in.
 * - On toggle: update localStorage + URL immediately (no flash), then PATCH
 *   /api/auth/me/lang in the background to persist to DB.
 * - <html lang="..."> attribute kept in sync for SEO + screen readers.
 *
 * 2026-06-12 (SEO audit fix): added URL query reading + URL sync on toggle
 * + dynamic <html lang> update. Previously hreflang annotations pointed to
 * ?lang=en but i18n ignored URL, so Google would index Chinese content under
 * the English URL — defeating the alternate-link signal.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { zh } from "../locales/zh-TW";
import { en } from "../locales/en";

// ── Types ────────────────────────────────────────────────────────────────────

export type Lang = "zh-TW" | "en";
export type TranslationKey = keyof typeof zh;

// ── Locale detection (synchronous, for first render) ─────────────────────────

/** Read ?lang= from current URL; returns null if absent / invalid. */
function readUrlLang(): Lang | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("lang");
    if (v === "en") return "en";
    if (v === "zh-TW" || v === "zh-tw" || v === "zh") return "zh-TW";
    return null;
  } catch {
    return null;
  }
}

function detectLocale(): Lang {
  // 1. URL query takes priority — Google indexes ?lang=en as the canonical
  //    English page, so the rendered content MUST match.
  const urlLang = readUrlLang();
  if (urlLang) return urlLang;

  // 2. localStorage (user's previous preference on this device)
  const stored = localStorage.getItem("language");
  if (stored === "zh-TW" || stored === "en") return stored;

  // 3. Browser locale detection (Perplexity approach)
  const nav = navigator.language ?? "";
  return nav.toLowerCase().startsWith("zh") ? "zh-TW" : "en";
}

/**
 * Sync URL ?lang= param to match current lang state, without reloading
 * the page or disrupting React Router. Uses history.replaceState so the
 * change is invisible in history (no extra back-button step).
 *
 * Convention:
 * - zh-TW (default) → strip the param to keep URLs clean
 * - en → always present so the page is bookmarkable + shareable as English
 */
function syncUrlLang(lang: Lang): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (lang === "en") {
      url.searchParams.set("lang", "en");
    } else {
      url.searchParams.delete("lang");
    }
    // Only update if the URL actually differs (avoids needless history churn)
    if (url.toString() !== window.location.href) {
      window.history.replaceState(window.history.state, "", url.toString());
    }
  } catch {
    /* no-op */
  }
}

/** Keep <html lang="..."> in sync — SEO + assistive tech requirement. */
function syncHtmlLangAttr(lang: Lang): void {
  if (typeof document === "undefined") return;
  try {
    document.documentElement.setAttribute("lang", lang);
  } catch {
    /* no-op */
  }
}

// ── Server sync helpers ───────────────────────────────────────────────────────

/** Fetch preferredLang from the server (no-throw — returns null if unauthenticated) */
async function fetchServerLang(): Promise<Lang | null> {
  try {
    const res = await fetch("/api/auth/me", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const lang = data?.user?.preferredLang;
    if (lang === "zh-TW" || lang === "en") return lang;
    return null;
  } catch {
    return null;
  }
}

/** Persist preferredLang to DB (fire-and-forget — errors are non-fatal) */
function persistLangToServer(lang: Lang): void {
  fetch("/api/auth/me/lang", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lang }),
  }).catch(() => {
    // Non-fatal: localStorage is already updated; DB sync is best-effort
  });
}

// ── Context ──────────────────────────────────────────────────────────────────

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /**
   * Translate a key. Optionally pass `params` to interpolate `{placeholder}`
   * tokens — e.g. t("confirm_delete_brand", { name: brand.name }).
   */
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLocale);

  // On mount: sync from DB so the setting persists across localStorage clears
  // and across devices. URL param takes precedence so we don't override
  // an explicit ?lang=en from a Google result with the user's DB preference.
  // Also sync <html lang> + URL on every lang change.
  useEffect(() => {
    syncHtmlLangAttr(lang);
    syncUrlLang(lang);
  }, [lang]);

  useEffect(() => {
    // If URL has an explicit ?lang=, that's the authoritative source — skip
    // the DB sync (a logged-in user landing on ?lang=en should see English
    // even if their DB preference is zh-TW).
    if (readUrlLang() !== null) return;
    fetchServerLang().then((serverLang) => {
      if (serverLang && serverLang !== lang) {
        localStorage.setItem("language", serverLang);
        setLangState(serverLang);
      }
    });
    // Run once on mount — intentionally omit `lang` from deps to avoid loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-detect when user hits browser back/forward — they may navigate from
  // /?lang=en to / and expect zh-TW to come back.
  useEffect(() => {
    const handler = () => {
      const detected = detectLocale();
      setLangState((prev) => (prev !== detected ? detected : prev));
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const setLang = useCallback((l: Lang) => {
    // 1. Update UI immediately (optimistic)
    localStorage.setItem("language", l);
    setLangState(l);
    // 2. URL + <html lang> sync handled by the useEffect above
    // 3. Persist to DB in background (only meaningful for logged-in users)
    persistLangToServer(l);
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      const dict = lang === "en" ? en : zh;
      const raw =
        (dict as Record<string, string>)[key] ??
        (zh as Record<string, string>)[key] ??
        key;
      if (!params) return raw;
      // Interpolate {placeholder} tokens
      return raw.replace(/\{(\w+)\}/g, (_m, name) =>
        params[name] != null ? String(params[name]) : `{${name}}`
      );
    },
    [lang]
  );

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang() must be used inside <LanguageProvider>");
  return ctx;
}
