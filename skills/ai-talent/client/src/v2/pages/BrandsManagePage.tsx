/**
 * /brands — Brand Manager dashboard.
 *
 * 2026-05-11 (CJ「我需要管理我所有的品牌，看每個底下有多少活動和產品，
 * 可以新增 / 刪除」).
 *
 * Layout:
 *   Top bar:   page title + 新增品牌 button
 *   Body:      grid of brand cards, each showing:
 *              - logo + name
 *              - product / event / mission / output counts
 *              - last activity date
 *              - actions (進入編輯 / 刪除)
 *   Empty:     same as before — onboarding wizard CTA
 *
 * Editor (current /brands content) moves to /brands/edit?b=:id
 */
import React, { useState, useEffect } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { useOutletContext } from "react-router-dom";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import { showToastGlobal } from "../../components/ui/Toast";
import { useLang } from "../../lib/i18n";
import AddEntityModal from "../components/AddEntityModal";
import {
  Plus, Trash2, ChevronRight, Calendar, Package, Layers,
  FileText, ExternalLink, AlertTriangle,
} from "lucide-react";

export default function BrandsManagePage() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const ctx = useOutletContext<ShellOutletCtx>();
  const utils = trpc.useUtils();

  const listQuery = (trpc as any).brand?.listWithStats?.useQuery
    ? (trpc as any).brand.listWithStats.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: [], refetch: () => {} };
  const brands = (listQuery?.data ?? []) as Array<any>;

  // 2026-06-19 Phase 2: products/events are now reached by clicking them on
  // the brand card (deep-link into the editor with ?p= / ?e=) — the global
  // scope picker no longer carries product/event. scope.options returns all
  // products/events with their brandId so we can group them per card.
  const scopeOptionsQuery = (trpc as any).scope?.options?.useQuery?.(
    undefined, { refetchOnWindowFocus: false },
  );
  const allProducts = ((scopeOptionsQuery?.data as any)?.products ?? []) as Array<any>;
  const allEvents = ((scopeOptionsQuery?.data as any)?.events ?? []) as Array<any>;
  const productsByBrand = React.useMemo(() => {
    const m = new Map<number, any[]>();
    for (const p of allProducts) {
      if (!m.has(p.brandId)) m.set(p.brandId, []);
      m.get(p.brandId)!.push(p);
    }
    return m;
  }, [allProducts]);
  const eventsByBrand = React.useMemo(() => {
    const m = new Map<number, any[]>();
    for (const e of allEvents) {
      if (e.brandId == null) continue;
      if (!m.has(e.brandId)) m.set(e.brandId, []);
      m.get(e.brandId)!.push(e);
    }
    return m;
  }, [allEvents]);

  // Resolve the active scope so we can show a direct CTA into the
  // positioning editor when the user has picked a product or event from
  // the ScopeBar — without this banner there's no obvious path from the
  // brand grid into 活動定位 / 產品定位.
  const scope = ctx?.scope ?? { brandId: null, productId: null, eventId: null };
  const scopeKind: "event" | "product" | "brand" | "none" =
    scope.eventId ? "event"
    : scope.productId ? "product"
    : scope.brandId ? "brand"
    : "none";
  const activeBrand = scope.brandId ? brands.find((b) => b.id === scope.brandId) : null;
  // Pull event/product name when scope is set
  const eventQ = (trpc as any).event?.get?.useQuery?.(
    { id: scope.eventId ?? 0 },
    { enabled: !!scope.eventId, refetchOnWindowFocus: false },
  );
  const productQ = (trpc as any).product?.get?.useQuery?.(
    { id: scope.productId ?? 0 },
    { enabled: !!scope.productId && !scope.eventId, refetchOnWindowFocus: false },
  );
  const scopeName =
    scopeKind === "event" ? (eventQ?.data?.name ?? "")
    : scopeKind === "product" ? (productQ?.data?.name ?? "")
    : scopeKind === "brand" ? (activeBrand?.name ?? "")
    : "";
  const scopeLabel =
    scopeKind === "event" ? (lang === "en" ? "campaign positioning" : "活動定位")
    : scopeKind === "product" ? (lang === "en" ? "product positioning" : "產品定位")
    : (lang === "en" ? "brand positioning" : "品牌定位");

  // Scope-aware redirect: when the user has any scope picked (brand /
  // product / event), `/brands` becomes "show me that one thing's
  // positioning + copy + knowledge" and forwards into the editor. The
  // grid only renders when nothing is picked. Stays opt-in: ?all=1 keeps
  // the grid visible even with scope (useful for cross-brand switching).
  const [searchParams] = useSearchParams();
  const forceGrid = searchParams.get("all") === "1";
  // 2026-05-13 (CJ「建立好品牌後我點選左側品牌會是空白畫面」):
  // The onboarding wizard navigates to `/brands?b=<newId>` after creating
  // a brand, but never calls setScope — so scope.brandId stayed null,
  // scopeKind === "none" → redirect didn't fire → user landed on the
  // grid with the new brand un-selected, and any click into the editor
  // (or the sidebar pill) hit a half-hydrated state. Sync the URL param
  // into scope here so /brands?b=X behaves the same as picking it from
  // the ScopeBar.
  const urlBrandId = Number(searchParams.get("b") || 0);
  useEffect(() => {
    if (!urlBrandId) return;
    if (scope.brandId === urlBrandId) return;
    if (ctx?.setScope) {
      ctx.setScope({ brandId: urlBrandId, productId: null, eventId: null });
    }
  }, [urlBrandId, scope.brandId, ctx]);
  // 2026-05-14 (CJ「點選不同的地方時，會不斷跳出這個畫面」): replaced
  // the imperative `useEffect → navigate` redirect with a render-time
  // <Navigate> below. Imperative navigate from inside useEffect fires
  // AFTER paint, so the browser shows one blank frame (just the global
  // footer) before the new route mounts. <Navigate> renders synchronously
  // and React Router swaps the route in the same commit — no flash.
  // Effect kept only for fixing query-string ?b=<id> hydration.

  // 2026-05-14 (CJ「Logo 點擊 → 首頁空白」): all hooks MUST be called
  // before any early return. The previous version returned null then
  // called useState / useMutation below it — Rules of Hooks violation
  // that React bails on with a blank screen. Move all hook calls up.
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  // 2026-07-07 (CJ「新增第二個品牌沒有彈跳視窗會迷失方向」): open the same
  // AddEntityModal the top-right pill uses, instead of navigating to a full
  // editor page (/brands/edit?new=1).
  const [addBrandOpen, setAddBrandOpen] = useState(false);

  const deleteMut = (trpc as any).brand?.delete?.useMutation
    ? (trpc as any).brand.delete.useMutation({
        onSuccess: () => {
          showToastGlobal(lang === "en" ? "Brand deleted" : "品牌已刪除", "success");
          listQuery?.refetch?.();
          (utils as any).brand?.list?.invalidate?.();
          setPendingDelete(null);
          setConfirmText("");
        },
        onError: (e: any) =>
          showToastGlobal(
            lang === "en"
              ? `Couldn't delete: ${e?.message ?? e}`
              : `刪除失敗：${e?.message ?? e}`,
          ),
      })
    : null;

  // Render-time redirect — fires synchronously, no blank flash.
  if (!forceGrid && scopeKind !== "none") {
    const bid = scope.brandId ?? activeBrand?.id ?? "";
    return <Navigate to={`/brands/edit${bid ? `?b=${bid}` : ""}`} replace />;
  }

  // 2026-06-05 (CJ「Mia 給的連結是空白頁」fail-safe): if the URL has ?b=<id>
  // but the brand list is loaded AND that brandId doesn't exist in our list,
  // show a friendly error with a way to recover instead of a blank screen.
  // This catches Mia hallucinating brandIds, deleted brands, cross-user shares.
  const brandsLoaded = (ctx as any)?.brandsLoaded === true;
  if (!forceGrid && urlBrandId && brandsLoaded && !brands.find((b) => b.id === urlBrandId)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p className="text-5xl mb-4">🤔</p>
          <h2 className="text-xl font-semibold text-neutral-900 mb-2">
            {lang === "en" ? "Brand not found" : "找不到這個品牌"}
          </h2>
          <p className="text-sm text-neutral-500 mb-6">
            {lang === "en"
              ? `Brand #${urlBrandId} doesn't exist in your account — it may have been deleted, or the link was incorrect.`
              : `品牌 #${urlBrandId} 不存在於你的帳號 — 可能已被刪除，或連結有誤。`}
          </p>
          <button
            onClick={() => navigate("/brands?all=1", { replace: true })}
            className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700"
          >
            {lang === "en" ? "← Back to all brands" : "← 回到全部品牌"}
          </button>
        </div>
      </div>
    );
  }

  // 2026-05-16 (CJ「按下左側品牌功能時，總會先出現空白畫面」):
  // When the URL carries ?b=<id> we KNOW a redirect into the editor is
  // imminent (the effect above is mid-flight syncing it into scope).
  // Rendering the empty grid for that one frame is the blank flash the
  // user sees. Show a spinner until scope catches up and the <Navigate>
  // above fires.
  if (!forceGrid && urlBrandId && scopeKind === "none") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center text-neutral-500 text-sm">
          <div className="inline-block w-5 h-5 border-2 border-neutral-300 border-t-neutral-700 rounded-full animate-spin mb-3" />
          <p>{lang === "en" ? "Opening brand…" : "開啟品牌中…"}</p>
        </div>
      </div>
    );
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 3600_000));
    const isEn = lang === "en";
    if (diffDays === 0) return isEn ? "Today" : "今天";
    if (diffDays === 1) return isEn ? "Yesterday" : "昨天";
    if (diffDays < 7) return isEn ? `${diffDays} days ago` : `${diffDays} 天前`;
    if (diffDays < 30) {
      const w = Math.floor(diffDays / 7);
      return isEn ? `${w}w ago` : `${w} 週前`;
    }
    return d.toLocaleDateString(isEn ? "en-US" : "zh-TW");
  };

  if (listQuery?.isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-neutral-500 text-sm">
        {t("loading_brands")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-6">
      <div className="max-w-6xl mx-auto">
        {/* 2026-05-11 (CJ「這兩頁都沒有對齊」): hero aligned to /brands/edit —
            centered editorial discipline, eyebrow + big title + serif italic
            subtitle. 新增品牌 button moves to a top-right absolute slot so
            the title column can stay centered without competing for space. */}
        <div className="relative pt-2 pb-8 mb-2">
          <div className="text-center max-w-[1100px] mx-auto">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-600 mb-3">
              BRANDS · WORKSPACE
            </p>
            <h1
              className="font-semibold tracking-tight leading-tight"
              style={{
                fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
                background: "linear-gradient(135deg, #00b4bc 0%, #7c3aed 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {lang === "en" ? "All your brands" : "你的所有品牌"}
            </h1>
            <p
              className="mt-3 mx-auto text-default-700"
              style={{
                fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
                fontStyle: "italic", fontSize: 14, lineHeight: 1.7, maxWidth: 640,
              }}
            >
              {brands.length === 0
                ? (lang === "en"
                    ? "Start your first brand with the SoWork positioning method"
                    : "從第一個品牌開始套用 SoWork 品牌定位法")
                : (lang === "en"
                    ? `${brands.length} brands running the SoWork method · tap a card to edit`
                    : `${brands.length} 個品牌跑著 SoWork 品牌定位法 · 點卡片進入編輯`)}
            </p>
            <p
              className="mt-2 mx-auto text-default-700"
              style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 640, letterSpacing: "0.02em" }}
            >
              <span style={{ fontWeight: 600, color: "#171717", marginRight: 6 }}>
                {lang === "en" ? "Good for:" : "適合："}
              </span>
              {lang === "en"
                ? "Switching brands · Checking each brand's activity and output status"
                : "切換品牌 · 看每個品牌的活動 / 產出狀態"}
            </p>
          </div>
          <button
            onClick={() => setAddBrandOpen(true)}
            className="absolute right-0 top-2 px-4 py-2.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold transition flex items-center gap-2"
          >
            <Plus size={16} /> {t("create_brand")}
          </button>
        </div>

        {/* Scope CTA — when the user has picked a product or event from the
            ScopeBar but landed on the brand grid, surface a direct path into
            the positioning editor. Without this, 活動定位 / 產品定位 are
            buried behind 「進入編輯」 on a brand card. */}
        {(scopeKind === "event" || scopeKind === "product") && scopeName && (
          <div
            className="mb-6 rounded-xl border flex items-center gap-3 px-4 py-3"
            style={{
              background: "linear-gradient(135deg, rgba(124,58,237,0.06) 0%, rgba(0,180,188,0.06) 100%)",
              borderColor: "#E4E3E1",
            }}
          >
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.15em] px-2 py-1 rounded"
              style={{ background: "rgba(124,58,237,0.12)", color: "#5B21B6" }}
            >
              {scopeKind === "event"
                ? (lang === "en" ? "Campaign" : "活動")
                : (lang === "en" ? "Product" : "產品")}
            </span>
            <span className="text-sm text-neutral-700 flex-1 min-w-0 truncate">
              {lang === "en"
                ? <>You picked <strong className="text-neutral-900">{scopeName}</strong> — jump to its {scopeLabel}.</>
                : <>目前已選 <strong className="text-neutral-900">{scopeName}</strong> — 直接編輯它的{scopeLabel}。</>}
            </span>
            <button
              onClick={() => navigate(`/brands/edit?b=${scope.brandId ?? activeBrand?.id ?? ""}`)}
              className="px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap flex items-center gap-1"
              style={{ background: "#171717", color: "white" }}
            >
              {lang === "en" ? `Edit ${scopeLabel} →` : `編輯${scopeLabel} →`}
            </button>
          </div>
        )}

        {/* Empty state */}
        {brands.length === 0 ? (
          <div className="bg-white border border-dashed border-neutral-300 rounded-xl py-16 px-6 text-center">
            <div className="max-w-sm mx-auto">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400 mb-3">
                STEP 1
              </p>
              <h2 className="text-xl font-bold text-neutral-900 mb-2">
                {lang === "en" ? "Set up your first brand" : "建立你的第一個品牌"}
              </h2>
              <p className="text-sm text-neutral-500 mb-6">
                {lang === "en"
                  ? "Your brand is where OnBrand starts. Once you set it up, AI learns your positioning, voice, and visual style — every task taps into that brand brain."
                  : "品牌是 OnBrand 一切的起點。建立後 AI 自動分析定位、用詞、視覺風格，之後所有任務都會吃這份品牌大腦。"}
              </p>
              <button
                onClick={() => setAddBrandOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold transition"
              >
                {lang === "en" ? "Get started" : "開始建立"}
                <Plus size={14} />
              </button>
            </div>
          </div>
        ) : (
          /* Brand grid */
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {brands.map((b) => (
              <BrandCard
                key={b.id}
                brand={b}
                products={productsByBrand.get(b.id) ?? []}
                events={eventsByBrand.get(b.id) ?? []}
                onOpen={() => {
                  // Set scope to this brand + go to editor (brand positioning)
                  ctx?.setBrandId?.(b.id);
                  navigate(`/brands/edit?b=${b.id}`);
                }}
                onOpenProduct={(pid) => {
                  ctx?.setBrandId?.(b.id);
                  navigate(`/brands/edit?b=${b.id}&p=${pid}`);
                }}
                onOpenEvent={(eid) => {
                  ctx?.setBrandId?.(b.id);
                  navigate(`/brands/edit?b=${b.id}&e=${eid}`);
                }}
                onDelete={() => setPendingDelete({ id: b.id, name: b.name })}
                lastActivityLabel={formatDate(b.lastActivity)}
                lang={lang}
              />
            ))}
          </div>
        )}

        {/* Delete confirmation modal */}
        {pendingDelete && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6"
            onClick={() => { setPendingDelete(null); setConfirmText(""); }}
          >
            <div
              className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle size={22} className="text-red-600 mt-0.5" />
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 mb-1">
                    {t("confirm_delete_brand", { name: pendingDelete.name })}
                  </h3>
                  <p className="text-sm text-neutral-600 leading-relaxed">
                    {lang === "en"
                      ? "This can't be undone. All products, events, projects, and outputs under this brand will be deleted too."
                      : "這個動作無法還原。品牌底下的產品、活動、任務、產出紀錄都會一併刪除。"}
                  </p>
                </div>
              </div>
              <p className="text-xs text-neutral-700 mb-2">
                {lang === "en"
                  ? `Type the brand name "${pendingDelete.name}" to confirm:`
                  : `請輸入品牌名稱「${pendingDelete.name}」確認刪除：`}
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={pendingDelete.name}
                autoFocus
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-neutral-900 mb-4"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setPendingDelete(null); setConfirmText(""); }}
                  className="px-4 py-2 text-sm rounded-lg border border-neutral-300 text-neutral-700 hover:border-neutral-500 transition"
                >
                  {t("cancel")}
                </button>
                <button
                  disabled={confirmText !== pendingDelete.name || !deleteMut || deleteMut.isPending}
                  onClick={() => deleteMut?.mutate({ id: pendingDelete.id })}
                  className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deleteMut?.isPending
                    ? (lang === "en" ? "Deleting…" : "刪除中…")
                    : (lang === "en" ? "Delete for good" : "確認刪除")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add-brand modal — same 彈跳視窗 the top-right pill uses, so creating
            a second brand from the grid doesn't jump to a disorienting full page. */}
        <AddEntityModal
          isOpen={addBrandOpen}
          initialTab="brand"
          defaultBrandId={null}
          onClose={() => setAddBrandOpen(false)}
          onCreated={(kind, id) => {
            setAddBrandOpen(false);
            if (kind === "brand") {
              ctx?.setBrandId?.(id);
              ctx?.setScope?.({ brandId: id, productId: null, eventId: null });
              navigate(`/brands/edit?b=${id}`);
            }
          }}
        />
      </div>
    </div>
  );
}

function BrandCard({
  brand, products, events, onOpen, onOpenProduct, onOpenEvent, onDelete, lastActivityLabel, lang,
}: {
  brand: any;
  products: any[];
  events: any[];
  onOpen: () => void;
  onOpenProduct: (id: number) => void;
  onOpenEvent: (id: number) => void;
  onDelete: () => void;
  lastActivityLabel: string;
  lang: "zh-TW" | "en";
}) {
  const initial = (brand.name ?? "?").slice(0, 1).toUpperCase();
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5 hover:border-neutral-400 transition group">
      <div className="flex items-start gap-3 mb-4">
        {/* Avatar */}
        <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-neutral-900 text-white flex items-center justify-center text-base font-bold overflow-hidden">
          {brand.logoUrl
            ? <img src={brand.logoUrl} alt={brand.name} className="w-full h-full object-cover" />
            : initial
          }
        </div>
        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-neutral-900 truncate">{brand.name}</h3>
          {brand.industry && (
            <p className="text-xs text-neutral-500 truncate">{brand.industry}</p>
          )}
          {brand.website && (
            <a
              href={brand.website.startsWith("http") ? brand.website : `https://${brand.website}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] text-neutral-500 hover:text-neutral-900 inline-flex items-center gap-0.5"
            >
              {brand.website.replace(/^https?:\/\//, "")} <ExternalLink size={9} />
            </a>
          )}
        </div>
        {/* Quick delete (icon only, top-right) */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 transition text-neutral-400 hover:text-red-600 p-1"
          title={lang === "en" ? "Delete brand" : "刪除品牌"}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <Stat icon={Package}  label={lang === "en" ? "Products" : "產品"} n={brand.productCount} />
        <Stat icon={Calendar} label={lang === "en" ? "Events" : "活動"} n={brand.eventCount} />
        <Stat icon={Layers}   label={lang === "en" ? "Projects" : "任務"} n={brand.missionCount} />
        <Stat icon={FileText} label={lang === "en" ? "Outputs" : "產出"} n={brand.outputCount} />
      </div>

      {/* 2026-06-19 Phase 2: clickable product / event list → deep-links into
          the editor scoped to that entity (?p= / ?e=). This is the entry point
          that replaced the removed global product/event picker. */}
      {(products.length > 0 || events.length > 0) && (
        <div className="mb-4 space-y-2">
          {products.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 mb-1 flex items-center gap-1">
                <Package size={10} /> {lang === "en" ? "Products" : "產品"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={(e) => { e.stopPropagation(); onOpenProduct(p.id); }}
                    className="text-[11px] px-2 py-1 rounded-md border border-neutral-200 text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50 transition max-w-[160px] truncate"
                    title={p.name}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {events.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 mb-1 flex items-center gap-1">
                <Calendar size={10} /> {lang === "en" ? "Events" : "活動"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {events.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); onOpenEvent(ev.id); }}
                    className="text-[11px] px-2 py-1 rounded-md border border-neutral-200 text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50 transition max-w-[160px] truncate"
                    title={ev.name}
                  >
                    {ev.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer row */}
      <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
        <span className="text-[11px] text-neutral-500">
          {lang === "en" ? "Last activity" : "最近活動"} · {lastActivityLabel}
        </span>
        <button
          onClick={onOpen}
          className="text-xs font-semibold text-neutral-900 hover:underline flex items-center gap-0.5"
        >
          {lang === "en" ? "Open editor" : "進入編輯"} <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, n }: { icon: any; label: string; n: number }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-neutral-700">
        <Icon size={11} strokeWidth={2} />
        <span className="text-base font-bold text-neutral-900">{n}</span>
      </div>
      <p className="text-[10px] text-neutral-500 mt-0.5">{label}</p>
    </div>
  );
}
