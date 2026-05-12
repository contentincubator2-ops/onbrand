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
import { useEffect } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";

interface ShellCtx {
  brandId: number | null;
  brands?: any[];
}

export default function ConnectionsRedirect() {
  const navigate = useNavigate();
  const ctx = useOutletContext<ShellCtx | null>();
  const [search] = useSearchParams();

  useEffect(() => {
    // Priority: URL ?b= override → shell context brandId → first brand in list → /brands list
    const fromUrl = search.get("b");
    const urlBrandId = fromUrl ? parseInt(fromUrl, 10) : null;
    const activeBrandId =
      (urlBrandId && Number.isFinite(urlBrandId) ? urlBrandId : null) ??
      ctx?.brandId ??
      (ctx?.brands?.[0]?.id ?? null);

    if (activeBrandId) {
      navigate(`/brands/edit?b=${activeBrandId}&tab=connector`, { replace: true });
    } else {
      // No active brand — go to manager list so user picks
      navigate("/brands", { replace: true });
    }
  }, [ctx?.brandId, ctx?.brands, search, navigate]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center text-sm text-default-400">
      開啟連結設定…
    </div>
  );
}
