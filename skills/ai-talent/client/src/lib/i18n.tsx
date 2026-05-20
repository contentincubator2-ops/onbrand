/**
 * i18n.tsx — Language context + useLang() hook
 *
 * Design:
 * - Supported: "zh-TW" (Traditional Chinese) | "en" (English)
 * - Priority: DB (server) > localStorage > browser locale detection
 * - On mount: fetch /api/auth/me and apply preferredLang from DB so the
 *   setting survives localStorage clears and syncs across devices.
 * - On toggle: update localStorage immediately (no flash), then PATCH
 *   /api/auth/me/lang in the background to persist to DB.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { zh } from "../locales/zh-TW";
import { en } from "../locales/en";

// ── Types ────────────────────────────────────────────────────────────────────

export type Lang = "zh-TW" | "en";
export type TranslationKey = keyof typeof zh;

// ── Locale detection (synchronous, for first render) ─────────────────────────

function detectLocale(): Lang {
  const stored = localStorage.getItem("language");
  if (stored === "zh-TW" || stored === "en") return stored;
  // Browser locale detection — Perplexity approach
  const nav = navigator.language ?? "";
  return nav.toLowerCase().startsWith("zh") ? "zh-TW" : "en";
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
  // and across devices. Only overrides the detected local value if DB differs.
  useEffect(() => {
    fetchServerLang().then((serverLang) => {
      if (serverLang && serverLang !== lang) {
        localStorage.setItem("language", serverLang);
        setLangState(serverLang);
      }
    });
    // Run once on mount — intentionally omit `lang` from deps to avoid loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = useCallback((l: Lang) => {
    // 1. Update UI immediately (optimistic)
    localStorage.setItem("language", l);
    setLangState(l);
    // 2. Persist to DB in background
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
