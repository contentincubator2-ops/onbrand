/**
 * i18n.tsx — Language context + useLang() hook
 *
 * Design:
 * - Supported: "zh-TW" (Traditional Chinese) | "en" (English)
 * - Default: browser locale detection (navigator.language).
 *   If the browser reports any "zh" variant → "zh-TW", otherwise "en".
 *   (Same approach as Perplexity — match user's OS/browser preference on first visit)
 * - Persisted: localStorage key "language"
 * - Override: user can switch in Settings page, takes effect immediately
 */

import React, { createContext, useContext, useState, useCallback } from "react";
import { zh } from "../locales/zh-TW";
import { en } from "../locales/en";

// ── Types ────────────────────────────────────────────────────────────────────

export type Lang = "zh-TW" | "en";
export type TranslationKey = keyof typeof zh;

// ── Locale detection ─────────────────────────────────────────────────────────

function detectLocale(): Lang {
  const stored = localStorage.getItem("language");
  if (stored === "zh-TW" || stored === "en") return stored;
  // Browser locale detection (Perplexity approach)
  const nav = navigator.language ?? "";
  return nav.toLowerCase().startsWith("zh") ? "zh-TW" : "en";
}

// ── Context ──────────────────────────────────────────────────────────────────

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLocale);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem("language", l);
    setLangState(l);
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      const dict = lang === "en" ? en : zh;
      return (dict as Record<string, string>)[key] ?? (zh as Record<string, string>)[key] ?? key;
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
