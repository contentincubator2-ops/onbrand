/**
 * 右上角品牌／產品／活動範圍膠囊，與記憶摘要面板。
 */
import { type ScopeState } from "../../platform/components/ScopeBar";
import React from "react";
import AddEntityModal, { type AddEntityTab } from "../../strategy/components/AddEntityModal";
import { useLang } from "../../../lib/i18n";
import { trpc } from "../../../lib/trpc";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faChevronDown, faCheck, faLayerGroup, faBoxOpen, faCalendarDays } from "@fortawesome/free-solid-svg-icons";
import { StrategyIcon, LockIcon, CheckIcon } from "../../platform/components/icons";
import { useIsMobile, brandColor } from "./shellShared";

/* ─────────────── Brand Hierarchy Pill (fixed top-left) ───────────────
   Always-expanded horizontal pill showing the active brand → product →
   event hierarchy. Click any segment to open a hierarchical dropdown
   for switching or adding. Replaces the old cramped circle button.

   Layout: positioned absolute at top-left of viewport, width 280px,
   height 44px. Pushes IconBar's first child down via top padding.
*/
export function BrandHierarchyPill({
  brands, scope, setScope, onNavigate,
}: {
  brands: any[];
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
  onNavigate: (to: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [addModal, setAddModal] = React.useState<{ open: boolean; tab: AddEntityTab }>({ open: false, tab: "brand" });
  const { lang } = useLang();
  const isEn = lang === "en";
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Load product / event lists scoped to current brand.
  // NOTE: server exposes `list` (not `listByBrand`) — both accept {brandId}.
  const productsQuery = (trpc as any).product?.list?.useQuery
    ? (trpc as any).product.list.useQuery(
        { brandId: scope.brandId ?? undefined },
        { enabled: !!scope.brandId, refetchOnWindowFocus: false }
      )
    : { data: [] };
  const eventsQuery = (trpc as any).event?.list?.useQuery
    ? (trpc as any).event.list.useQuery(
        { brandId: scope.brandId ?? undefined },
        { enabled: !!scope.brandId, refetchOnWindowFocus: false }
      )
    : { data: [] };
  const products = (productsQuery.data as any[]) ?? [];
  const events = (eventsQuery.data as any[]) ?? [];

  const activeBrand = brands.find((b: any) => b.id === scope.brandId) ?? null;
  const activeProduct = products.find((p: any) => p.id === scope.productId) ?? null;
  const activeEvent = events.find((e: any) => e.id === scope.eventId) ?? null;

  // Display priority: event > product > brand (most specific scope wins as label)
  const displayName =
    activeEvent?.name ?? activeProduct?.name ?? activeBrand?.name ?? (isEn ? "Pick a brand" : "選擇品牌");
  const isMobile = useIsMobile();

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        // 2026-05-14 (CJ「品牌大腦放右上方」): moved from left to right anchor.
        // Sidebar is collapsed icon-only (ICON_W=70px) and doesn't overlap
        // the right side, so no shift tracking needed.
        right: 12,
        top: 10,
        zIndex: 50,
        // Mobile: a fixed 280px pill spans 78% of a 375px screen and
        // covers every page header. Cap to the space left of the 70px
        // rail with a hard max so it never overflows.
        width: isMobile ? "min(220px, calc(100vw - 90px))" : 280,
        transition: "right 0.22s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* ── Pill trigger button ── */}
      {/* Empty state (no brand selected): orange dashed CTA */}
      {/* Active state: Notion-style subtle white pill */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          height: 40,
          borderRadius: 8,
          border: activeBrand
            ? (open ? "1px solid #d4d4d4" : "1px solid #e5e7eb")
            : "1.5px dashed #18181b",
          background: activeBrand ? "#fff" : (open ? "#f4f4f5" : "#fff"),
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 10px 0 8px",
          cursor: "pointer",
          boxShadow: activeBrand
            ? (open ? "0 4px 12px rgba(0,0,0,0.06)" : "0 1px 2px rgba(0,0,0,0.04)")
            : "0 1px 4px rgba(24,24,27,0.12)",
          transition: "border-color 0.12s, box-shadow 0.12s, background 0.12s",
        }}
        onMouseEnter={e => {
          if (!activeBrand) e.currentTarget.style.background = "#f4f4f5";
        }}
        onMouseLeave={e => {
          if (!activeBrand) e.currentTarget.style.background = open ? "#f4f4f5" : "#fff";
        }}
      >
        {/* Icon: brand logo / initial / brain / + */}
        <span style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          background: activeBrand
            ? (activeBrand.logoUrl ? "#fafafa" : brandColor(activeBrand.name).bgGradient)
            : "rgba(24,24,27,0.12)",
          border: activeBrand ? "none" : "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
          color: activeBrand ? "#fff" : "#18181b",
          fontSize: activeBrand ? 11 : 14,
          fontWeight: 700,
        }}>
          {activeBrand?.logoUrl ? (
            <img src={activeBrand.logoUrl} alt={activeBrand.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : activeBrand ? (
            <span>{activeBrand.name.charAt(0).toUpperCase()}</span>
          ) : (
            <FontAwesomeIcon icon={faPlus} style={{ fontSize: 12 }} />
          )}
        </span>
        {/* Label */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15 }}>
          {(activeProduct || activeEvent) && (
            <span style={{
              fontSize: 12, color: "#9ca3af", letterSpacing: "0.3px",
              maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {activeBrand?.name}{activeProduct ? ` › ${activeProduct.name}` : ""}
            </span>
          )}
          <span style={{
            fontSize: 13,
            color: activeBrand ? "#1f2937" : "#18181b",
            fontWeight: activeBrand ? 700 : 600,
            maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {displayName}
          </span>
        </div>
        {/* Dropdown chevron */}
        <FontAwesomeIcon
          icon={faChevronDown}
          style={{
            fontSize: 12,
            color: activeBrand ? "#9ca3af" : "#18181b",
            transition: "transform 0.15s",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </button>

      {/* Hierarchical popover: Brain summary → Brand → Product → Event */}
      {open && (
        <div
          style={{
            marginTop: 6,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.14), 0 4px 8px rgba(0,0,0,0.04)",
            padding: 6,
            maxHeight: "70vh",
            overflowY: "auto",
          }}
        >
          {/* 2026-05-14 (CJ「品牌大腦」): brain summary panel at top.
              Positioning is locked (read-only) + accumulated reference
              material counts. No "AI learned X" copy — positioning never
              auto-updates from user behaviour; only user-curated entries
              and AI usage stats are surfaced. */}
          {activeBrand && (
            <BrainSummaryPanel
              brandId={activeBrand.id}
              brandName={activeBrand.name}
              isEn={isEn}
              onClose={() => setOpen(false)}
              onNavigate={onNavigate}
            />
          )}

          {/* ── When no brands: full-width primary CTA at top ── */}
          {brands.length === 0 && (
            <div style={{ padding: "8px 8px 4px" }}>
              <button
                onClick={() => { setAddModal({ open: true, tab: "brand" }); setOpen(false); }}
                style={{
                  width: "100%", padding: "11px 14px",
                  borderRadius: 8,
                  background: "#18181b",
                  border: "none", cursor: "pointer", color: "#fff",
                  fontSize: 13, fontWeight: 700,
                  display: "flex", alignItems: "center", gap: 8,
                  boxShadow: "0 2px 8px rgba(24,24,27,0.30)",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              >
                <FontAwesomeIcon icon={faPlus} />
                {isEn ? "Add your first brand" : "新增你的第一個品牌"}
              </button>
            </div>
          )}

          {/* BRAND section */}
          {brands.length > 0 && (
          <p style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.5px", padding: "6px 10px 4px", textTransform: "uppercase" }}>
            {isEn ? "Switch brand" : "切換品牌"}
          </p>
          )}
          {brands.length > 0 && brands.map((b: any) => {
            const isActive = b.id === scope.brandId;
            const bColor = brandColor(b.name);
            return (
              <button
                key={b.id}
                onClick={() => {
                  setScope({ brandId: b.id, productId: null, eventId: null });
                  setOpen(false);
                }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 10px", border: "none", borderRadius: 6,
                  background: isActive ? bColor.light : "transparent",
                  cursor: "pointer", textAlign: "left",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#f9fafb"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  background: bColor.bgGradient,
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, overflow: "hidden",
                }}>
                  {b.logoUrl ? <img src={b.logoUrl} alt={b.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (b.name?.charAt(0) ?? "?")}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: isActive ? 600 : 500, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.name}
                </span>
                {isActive && <FontAwesomeIcon icon={faCheck} style={{ fontSize: 12, color: bColor.bg }} />}
              </button>
            );
          })}

          {/* 2026-06-19 Phase 2: product/event pickers removed from the global
              switcher. Brand is the only global scope now; a specific product /
              event is chosen per-task in the task modal, or edited via the
              brand-list page cards (which deep-link to /brands/edit?b=&p= / &e=). */}

          {/* Add new — opens unified modal instead of navigating */}
          {brands.length > 0 && (
          <>
          <div style={{ borderTop: "1px solid #f3f4f6", margin: "6px 0 4px" }} />
          {/* 2026-07-07 (CJ「沒有清楚路徑到『所有品牌』頁」): explicit link to
              the brand-management grid so it's reachable from the always-visible
              top-right pill, not just the editor breadcrumb / settings menu. */}
          <div style={{ borderTop: "1px solid #f3f4f6", margin: "6px 0 4px" }} />
          <div style={{ padding: "0 8px 4px" }}>
            <button
              onClick={() => { onNavigate("/brands?all=1"); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px", border: "none", borderRadius: 7,
                background: "transparent", cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontSize: 12 }}>
                <FontAwesomeIcon icon={faLayerGroup} />
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: "#374151" }}>
                {isEn ? "See all brands →" : "查看所有品牌 →"}
              </span>
            </button>
          </div>
          {/* New brand — dashed outline CTA (prominent but not primary) */}
          <div style={{ padding: "4px 8px" }}>
            <button
              onClick={() => { setAddModal({ open: true, tab: "brand" }); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "7px 10px", border: "1.5px dashed #e5e7eb", borderRadius: 7,
                background: "transparent", cursor: "pointer", textAlign: "left",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "#18181b";
                e.currentTarget.style.background = "rgba(24,24,27,0.04)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "#e5e7eb";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                background: "rgba(24,24,27,0.10)", color: "#18181b",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
              }}>
                <FontAwesomeIcon icon={faPlus} />
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "#18181b" }}>
                {isEn ? "New brand" : "新增品牌"}
              </span>
            </button>
          </div>
          {/* New product / event — smaller secondary row */}
          {([
            { tab: "product" as const, label: isEn ? "New product" : "新增產品",  icon: faBoxOpen,       accent: "#18181b" },
            { tab: "event"   as const, label: isEn ? "New event" : "新增活動",    icon: faCalendarDays,  accent: "#18181b" },
          ]).map((opt) => (
            <button
              key={opt.tab}
              onClick={() => { setAddModal({ open: true, tab: opt.tab }); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "5px 18px", border: "none", borderRadius: 6,
                background: "transparent", cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", color: opt.accent, fontSize: 12 }}>
                <FontAwesomeIcon icon={opt.icon} />
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: "#6b7280" }}>{opt.label}</span>
            </button>
          ))}
          </>
          )}
        </div>
      )}
      {/* AddEntityModal — fires on bottom button click; defaults brand for product/event */}
      <AddEntityModal
        isOpen={addModal.open}
        initialTab={addModal.tab}
        defaultBrandId={scope.brandId ?? null}
        onClose={() => setAddModal({ open: false, tab: addModal.tab })}
        onCreated={(kind, id) => {
          if (kind === "brand") setScope({ brandId: id, productId: null, eventId: null });
          else if (kind === "product") setScope({ brandId: scope.brandId ?? null, productId: id, eventId: null });
          else if (kind === "event") setScope({ brandId: scope.brandId ?? null, productId: scope.productId ?? null, eventId: id });
        }}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   BrainSummaryPanel — top section of the BrandHierarchyPill dropdown
   ══════════════════════════════════════════════════════════════════
   2026-05-14 (CJ「品牌大腦」):
   Shows the "what's in this brand brain" narrative above the brand
   switcher. Three sub-sections matching the locked-vs-curated mental
   model:
     1. 鎖定憲法 — positioning summary, marked read-only with lock icon.
        Customer service is the only way to change.
     2. 你加進來的 — knowledge / preferred terms / banned terms counts.
        User-curated material, user-controlled.
     3. AI 引用 — usage stats from past 7 days (placeholder copy until
        instrumentation lands; for now reads from output count).
   Uses brand.getBrainSummary if available, falls back to existing brand.get.
   ══════════════════════════════════════════════════════════════════ */
export function BrainSummaryPanel({
  brandId, brandName, isEn, onClose, onNavigate,
}: {
  brandId: number;
  brandName: string;
  isEn: boolean;
  onClose: () => void;
  onNavigate: (to: string) => void;
}) {
  const summaryQ = (trpc as any).brand?.getBrainSummary?.useQuery
    ? (trpc as any).brand.getBrainSummary.useQuery(
        { brandId },
        { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 60_000 },
      )
    : { data: null, isLoading: false };
  const s: any = summaryQ?.data ?? null;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ padding: "8px 10px 6px" }}>
      <p style={{
        fontSize: 12, fontWeight: 700, color: "#525252",
        letterSpacing: "0.22em", textTransform: "uppercase",
        marginBottom: 6,
      }}>{title}</p>
      {children}
    </div>
  );

  const Row = ({ label, value, dim }: { label: string; value: React.ReactNode; dim?: boolean }) => (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      fontSize: 12, color: dim ? "#9ca3af" : "#374151", padding: "2px 0",
    }}>
      <span>{label}</span>
      <span style={{ fontWeight: 600, color: dim ? "#9ca3af" : "#171717" }}>{value}</span>
    </div>
  );

  return (
    <div style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: 4, marginBottom: 4 }}>
      {/* Heading */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 10px 6px",
      }}>
        <StrategyIcon size={15} strokeWidth={1.5} color="#171717" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#171717" }}>
          {isEn ? "Brand Brain" : "品牌大腦"} · {brandName}
        </span>
      </div>

      {/* 1. 鎖定憲法 */}
      <Section title={isEn ? "01 · Locked Positioning" : "01 · 鎖定憲法"}>
        <Row
          label={isEn ? "Positioning" : "品牌定位"}
          value={
            s?.positioning?.completedSections != null
              ? <>{`${s.positioning.completedSections}/${s.positioning.totalSections ?? 10} `}{s.positioning.isLocked ? <LockIcon size={11} /> : null}</>
              : "—"
          }
        />
        {!s?.positioning?.isLocked && (
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 4, lineHeight: 1.5 }}>
            {isEn
              ? "Not locked yet — complete the positioning flow to lock your brand identity."
              : `尚未鎖定 · 完成 ${s?.positioning?.totalSections ?? 10} 步定位後會自動鎖定`}
          </p>
        )}
      </Section>

      {/* 2. 你加進來的 */}
      <Section title={isEn ? "02 · Your References" : "02 · 你加進來的"}>
        <Row label={isEn ? "Knowledge" : "知識條目"} value={String(s?.knowledge?.count ?? 0)} />
        <Row label={isEn ? "Preferred terms" : "偏好詞"} value={String(s?.preferences?.preferredCount ?? 0)} />
        <Row label={isEn ? "Banned terms" : "禁用詞"} value={String(s?.preferences?.bannedCount ?? 0)} />
        <Row
          label={isEn ? "Visual identity" : "視覺識別"}
          value={s?.visual?.hasLogo ? <CheckIcon size={11} /> : "—"}
          dim={!s?.visual?.hasLogo}
        />
        <Row
          label={isEn ? "Platform binding" : "平台連結"}
          value={
            [s?.connections?.fb && "FB", s?.connections?.ig && "IG"]
              .filter(Boolean).join(" / ") || "—"
          }
          dim={!s?.connections?.fb && !s?.connections?.ig}
        />
      </Section>

      {/* 3. AI 引用 */}
      <Section title={isEn ? "03 · AI Usage (this week)" : "03 · AI 本週引用"}>
        <Row
          label={isEn ? "Outputs produced" : "本週產出"}
          value={String(s?.outputs?.last7DaysCount ?? 0)}
        />
        <Row
          label={isEn ? "Total outputs" : "歷史總產出"}
          value={String(s?.outputs?.totalCount ?? 0)}
        />
        {/* Term-use instrumentation lands in a follow-up — see ROADMAP. */}
      </Section>

      {/* CTA */}
      <div style={{ padding: "4px 10px 8px" }}>
        <button
          onClick={() => {
            onNavigate(`/brands/edit?b=${brandId}`);
            onClose();
          }}
          style={{
            width: "100%", padding: "8px 10px", borderRadius: 6,
            border: "1px solid #171717", background: "#171717", color: "#fff",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#262626"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#171717"; }}
        >
          {isEn ? "Open full brain →" : "完整品牌大腦 →"}
        </button>
      </div>
    </div>
  );
}
