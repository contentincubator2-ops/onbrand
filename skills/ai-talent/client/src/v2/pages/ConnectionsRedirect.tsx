/**
 * /connections — dedicated sidebar entry for brand connections + settings.
 *
 * 2026-05-12 (CJ「加一個獨立的功能區叫做『連結』」).
 *
 * Behavior:
 *   - If the user has an active brand (from shell context OR ?b= URL),
 *     redirect to /brands/edit?b=<id>&tab=connector — the BrandSettingsSheet
 *     opens directly on the "連結" tab.
 *   - If no active brand: redirect to /brands (the manager list) so they
 *     can pick one first.
 *
 * This page renders nothing itself; it just routes.
 */
import { Navigate, useOutletContext, useSearchParams } from "react-router-dom";

interface ShellCtx {
  brandId: number | null;
  brands?: any[];
}

export default function ConnectionsRedirect() {
  const ctx = useOutletContext<ShellCtx | null>();
  const [search] = useSearchParams();

  // 2026-05-14 (CJ「點選不同的地方時，會不斷跳出這個畫面」):
  // <Navigate> renders synchronously and React Router swaps the route in
  // the same render commit — no useEffect/blank-flash dance.
  const fromUrl = search.get("b");
  const urlBrandId = fromUrl ? parseInt(fromUrl, 10) : null;
  const activeBrandId =
    (urlBrandId && Number.isFinite(urlBrandId) ? urlBrandId : null) ??
    ctx?.brandId ??
    (ctx?.brands?.[0]?.id ?? null);

  if (activeBrandId) {
    return <Navigate to={`/brands/settings?b=${activeBrandId}&tab=connector`} replace />;
  }
  return <Navigate to="/brands" replace />;
}
