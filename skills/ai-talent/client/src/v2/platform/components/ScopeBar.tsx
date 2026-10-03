/**
 * ScopeBar — global scope state hook.
 *
 * 2026-06-19 Phase 2 (CJ「右上只選品牌；產品/活動改 URL 帶 id」): the global
 * scope is now BRAND-ONLY. The standalone brand×product×event picker component
 * was removed — brand is chosen from the top-left brand switcher, and a
 * specific product / event is chosen per-task in the task modal or edited via
 * the brand-list page cards (which deep-link into /brands/edit?b=&p= / &e=).
 *
 * `useScopeState` persists the brand to localStorage and mirrors it to the URL
 * (?b=). Product/event are NOT tracked here — the BrandsPage editor reads
 * ?p= / ?e= from the URL locally, so they stay scoped to that editor session
 * and never leak across pages. ScopeState keeps productId/eventId in its shape
 * (always null from here) so existing consumers don't need type churn.
 */
import React from "react";
import { useSearchParams } from "react-router-dom";

export interface ScopeState {
  brandId: number | null;
  productId: number | null;
  eventId: number | null;
}

function readScopeFromStorageOnly(): ScopeState {
  try {
    const b = Number(localStorage.getItem("sowork.scope.brandId")) || null;
    // Purge legacy product/event scope keys (Phase 1 left them stale).
    localStorage.removeItem("sowork.scope.productId");
    localStorage.removeItem("sowork.scope.eventId");
    return { brandId: b, productId: null, eventId: null };
  } catch { return { brandId: null, productId: null, eventId: null }; }
}

function writeScopeToStorage(s: ScopeState) {
  try {
    if (s.brandId) localStorage.setItem("sowork.scope.brandId", String(s.brandId));
    else localStorage.removeItem("sowork.scope.brandId");
    // product/event are intentionally NOT persisted (URL-only now).
    localStorage.removeItem("sowork.scope.productId");
    localStorage.removeItem("sowork.scope.eventId");
  } catch {}
}

/**
 * useScopeState — single source of truth for the global (brand-only) scope.
 *
 * Order of truth on mount: URL (?b=) → localStorage → empty.
 * Every setScope writes localStorage + ?b= (replace) and clears any
 * editor-local ?p= / ?e= so product/event selection can't leak across pages.
 */
export function useScopeState(): [ScopeState, (s: ScopeState) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const [brandId, setBrandIdState] = React.useState<number | null>(() => {
    const b = Number(searchParams.get("b")) || null;
    if (b) return b;
    return readScopeFromStorageOnly().brandId;
  });

  const scope: ScopeState = React.useMemo(
    () => ({ brandId, productId: null, eventId: null }),
    [brandId],
  );

  const setScope = React.useCallback((s: ScopeState) => {
    const b = s.brandId ?? null;
    writeScopeToStorage({ brandId: b, productId: null, eventId: null });
    setBrandIdState(b);
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      if (b) sp.set("b", String(b)); else sp.delete("b");
      // Switching the global (brand) scope always drops any editor-local
      // product/event selection so it can't leak across pages.
      sp.delete("p");
      sp.delete("e");
      return sp;
    }, { replace: true });
  }, [setSearchParams]);

  // On mount, mirror brandId (from localStorage) into the URL if absent.
  const didInitRef = React.useRef(false);
  React.useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    if (!searchParams.get("b") && brandId) {
      setSearchParams((prev) => {
        const sp = new URLSearchParams(prev);
        sp.set("b", String(brandId));
        return sp;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External URL ?b= changes (deep link, manual edit) → sync brand into state.
  // When the URL drops ?b= on tab navigation, re-mirror from current state so
  // refresh / share-link keep the brand. Never reads or writes ?p= / ?e= —
  // those are owned by the editor page.
  React.useEffect(() => {
    const bRaw = searchParams.get("b");
    if (!bRaw) {
      if (brandId) {
        setSearchParams((prev) => {
          const sp = new URLSearchParams(prev);
          sp.set("b", String(brandId));
          return sp;
        }, { replace: true });
      }
      return;
    }
    const b = Number(bRaw) || null;
    if (b !== brandId) {
      setBrandIdState(b);
      writeScopeToStorage({ brandId: b, productId: null, eventId: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return [scope, setScope];
}
