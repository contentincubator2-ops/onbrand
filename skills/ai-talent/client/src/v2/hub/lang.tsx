/**
 * Sales Hub display language (中 / EN toggle in the rail). English is the
 * default for the Dallas show; the choice is remembered per browser.
 */
import React from "react";

export type HubLang = "en" | "zh";

const KEY = "hub.lang";

const HubLangContext = React.createContext<{ lang: HubLang; setLang: (l: HubLang) => void }>({
  lang: "en",
  setLang: () => undefined,
});

export function HubLangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<HubLang>(() => {
    try {
      return window.localStorage.getItem(KEY) === "zh" ? "zh" : "en";
    } catch {
      return "en";
    }
  });
  const setLang = React.useCallback((l: HubLang) => {
    setLangState(l);
    try { window.localStorage.setItem(KEY, l); } catch { /* storage unavailable */ }
  }, []);
  return <HubLangContext.Provider value={{ lang, setLang }}>{children}</HubLangContext.Provider>;
}

export const useHubLang = () => React.useContext(HubLangContext);

/** Pick the string for the current language. */
export function useT() {
  const { lang } = useHubLang();
  return React.useCallback((en: string, zh: string) => (lang === "zh" ? zh : en), [lang]);
}
