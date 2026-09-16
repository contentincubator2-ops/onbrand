/**
 * Identity bootstrap for the rep's LIFF pages (/liff/write, /liff/share).
 *
 *   ?rep=<id>  → simulate mode: the admin session impersonates that rep
 *                (opened from the booth phone simulator).
 *   otherwise  → LIFF mode: load the LINE SDK, liff.init, login if needed,
 *                then send the LINE ID token with every hub.rep.* call.
 *
 * Query params are read AFTER liff.init: when opened through
 * https://liff.line.me/<id>/write?s=3 the SDK restores the path and query from
 * `liff.state` during init, so they aren't on the URL before that.
 */
import { useEffect, useState } from "react";

const LIFF_SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";

export interface LiffIdentity {
  idToken?: string;
  repId?: number;
}

export type LiffBoot =
  | { status: "loading" }
  | { status: "not-configured" }
  | { status: "redirecting" }
  | { status: "error"; message: string }
  | { status: "ready"; mode: "simulate" | "liff"; identity: LiffIdentity; params: URLSearchParams; liff: any };

let sdkPromise: Promise<any> | null = null;
let initPromise: Promise<any> | null = null;

function loadLiffSdk(): Promise<any> {
  const w = window as any;
  if (w.liff) return Promise.resolve(w.liff);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = LIFF_SDK_URL;
    script.async = true;
    script.onload = () => (w.liff ? resolve(w.liff) : reject(new Error("The LINE SDK loaded but didn't start.")));
    script.onerror = () => {
      sdkPromise = null;
      script.remove();
      reject(new Error("Couldn't load the LINE SDK. Check your connection and reopen the page."));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

/** Loads the SDK and runs liff.init exactly once per page load (StrictMode-safe). */
function initLiff(liffId: string): Promise<any> {
  if (!initPromise) {
    initPromise = loadLiffSdk()
      .then(async (liff) => {
        await liff.init({ liffId });
        return liff;
      })
      .catch((err) => {
        initPromise = null;
        throw err;
      });
  }
  return initPromise;
}

function simulateBoot(): LiffBoot | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const rep = Number(params.get("rep"));
  if (!params.has("rep") || !Number.isInteger(rep) || rep <= 0) return null;
  return { status: "ready", mode: "simulate", identity: { repId: rep }, params, liff: null };
}

export function useLiffBoot(): LiffBoot {
  const [boot, setBoot] = useState<LiffBoot>(() => simulateBoot() ?? { status: "loading" });

  useEffect(() => {
    if (boot.status !== "loading") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/hub/liff-config", { credentials: "omit" });
        if (!res.ok) throw new Error(`Couldn't read the LINE configuration (${res.status}).`);
        const { liffId } = (await res.json()) as { liffId: string | null };
        if (!liffId) {
          if (!cancelled) setBoot({ status: "not-configured" });
          return;
        }
        const liff = await initLiff(liffId);
        if (cancelled) return;
        if (!liff.isLoggedIn()) {
          setBoot({ status: "redirecting" });
          liff.login();
          return;
        }
        const idToken: string | null = liff.getIDToken();
        if (!idToken) throw new Error("LINE didn't return an ID token — the LIFF app needs the openid scope.");
        setBoot({ status: "ready", mode: "liff", identity: { idToken }, params: new URLSearchParams(window.location.search), liff });
      } catch (err: any) {
        if (!cancelled) setBoot({ status: "error", message: String(err?.message ?? err) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once; `boot` only leaves "loading" from inside this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return boot;
}

/** In LIFF mode opens in the system browser; otherwise a new tab. */
export function openExternal(liff: any, url: string) {
  if (liff?.openWindow) {
    liff.openWindow({ url, external: true });
    return;
  }
  window.open(url, "_blank", "noopener");
}

export function canShareTargetPicker(liff: any): boolean {
  try {
    return Boolean(liff?.isApiAvailable?.("shareTargetPicker"));
  } catch {
    return false;
  }
}

/**
 * Silences the app-wide "載入失敗" toast for a query — these pages show their
 * own inline errors (in the rep's language). react-query keeps unknown option
 * keys on the query, and main.tsx skips queries that define onError.
 */
export const OWN_ERROR_UI = { onError: () => undefined } as {};
