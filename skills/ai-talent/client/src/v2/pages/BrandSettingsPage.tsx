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
    const b = search.get("b") ?? String(ctx?.brandId ?? ctx?.brands?.[0]?.id ?? "");
    // 2026-05-30: modal only has publish/ai/danger.
    // connector/info/visual → no longer modal tabs; drop the ?tab= so the
    // main workspace page opens normally (基本資料/視覺 are main page tabs).
    const rawTab = search.get("tab") ?? "";
    const modalTabs = ["publish", "ai", "danger"];
    const tab = modalTabs.includes(rawTab) ? rawTab
               : rawTab === "connector" ? "publish"   // legacy connector → publish
               : "";                                   // info/visual → no modal tab
    const url = b
      ? (tab ? `/brands/edit?b=${b}&tab=${tab}` : `/brands/edit?b=${b}`)
      : (tab ? `/brands/edit?tab=${tab}` : `/brands/edit`);
    navigate(url, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
