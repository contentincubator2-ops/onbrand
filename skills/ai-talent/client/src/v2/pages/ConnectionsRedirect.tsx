/**
 * /connections — legacy route kept for bookmark compatibility.
 *
 * 2026-05-30 (CJ「移除連結頁」): "連結" sidebar item removed. Social URLs
 * now live in 基本資料 tab (info). This component redirects any old
 * /connections links to /brands/edit?tab=info so they still land somewhere
 * sensible instead of 404-ing.
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
    return <Navigate to={`/brands/edit?b=${activeBrandId}&tab=info`} replace />;
  }
  return <Navigate to="/brands" replace />;
}
