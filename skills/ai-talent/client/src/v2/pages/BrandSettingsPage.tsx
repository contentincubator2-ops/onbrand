/**
 * BrandSettingsPage — redirect shim.
 *
 * 2026-05-29 (CJ「合併到品牌頁」): /brands/settings is redundant with
 * /brands/edit which already opens the settings sheet via ?tab= param.
 * Keep this route alive so old bookmarks / email links don't 404, but
 * immediately redirect to /brands/edit with the same ?b= and ?tab=.
 */
import { useEffect } from "react";
import { useSearchParams, useNavigate, useOutletContext } from "react-router-dom";

interface ShellCtx { brandId: number | null; brands?: any[] }

export default function BrandSettingsPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const ctx = useOutletContext<ShellCtx | null>();

  useEffect(() => {
    const b   = search.get("b") ?? String(ctx?.brandId ?? ctx?.brands?.[0]?.id ?? "");
    const tab = search.get("tab") ?? "connector";
    const url = b ? `/brands/edit?b=${b}&tab=${tab}` : `/brands/edit?tab=${tab}`;
    navigate(url, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
