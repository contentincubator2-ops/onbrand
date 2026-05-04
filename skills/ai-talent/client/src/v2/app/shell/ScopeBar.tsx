/**
 * ScopeBar — global brand × product × event scope picker.
 *
 * Lives in ShellLayout's top-right header. Hierarchical scope rule
 * (CJ direction 2026-04-29):
 *   - Brand is the root. Products & events ALWAYS belong to one brand.
 *   - Picking a product → auto-sets parent brand (stays visible).
 *   - Picking an event → auto-sets parent brand + parent product (if any).
 *     Events may span multiple products (Pokemon Go 五月活動 等); when
 *     event.productId is null the product picker shows "—" with the brand
 *     still locked in.
 *   - Picking a brand → switches brand and clears product/event (they're
 *     children of a different brand now).
 *
 * The intake agent / orchestrator reads scope.brandId for brand brain
 * context regardless of whether product/event is also set; it reads the
 * MOST SPECIFIC level (event > product > brand) to know which positioning
 * JSON to thread through the squad.
 *
 * State is persisted to localStorage AND mirrored to the URL hash so
 * deep links / refresh keep the scope.
 */
import React from "react";
import { trpc } from "../../../lib/trpc";
import {
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Button, Chip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faTrademark, faBox, faCalendarDay, faPlus } from "@fortawesome/free-solid-svg-icons";
import CreateScopeModal, { type CreateScopeKind } from "./CreateScopeModal";

export interface ScopeState {
  brandId: number | null;
  productId: number | null;
  eventId: number | null;
}

interface ScopeBarProps {
  scope: ScopeState;
  setScope: (s: ScopeState) => void;
}

function readScopeFromStorage(): ScopeState {
  try {
    const b = Number(localStorage.getItem("sowork.scope.brandId")) || null;
    const p = Number(localStorage.getItem("sowork.scope.productId")) || null;
    const e = Number(localStorage.getItem("sowork.scope.eventId")) || null;
    return { brandId: b, productId: p, eventId: e };
  } catch { return { brandId: null, productId: null, eventId: null }; }
}

function writeScopeToStorage(s: ScopeState) {
  try {
    if (s.brandId)   localStorage.setItem("sowork.scope.brandId", String(s.brandId));   else localStorage.removeItem("sowork.scope.brandId");
    if (s.productId) localStorage.setItem("sowork.scope.productId", String(s.productId)); else localStorage.removeItem("sowork.scope.productId");
    if (s.eventId)   localStorage.setItem("sowork.scope.eventId", String(s.eventId));   else localStorage.removeItem("sowork.scope.eventId");
  } catch {}
}

export function useScopeState(): [ScopeState, (s: ScopeState) => void] {
  const [scope, setScopeState] = React.useState<ScopeState>(readScopeFromStorage);
  const setScope = React.useCallback((s: ScopeState) => {
    writeScopeToStorage(s);
    setScopeState(s);
  }, []);
  return [scope, setScope];
}

export default function ScopeBar({ scope, setScope }: ScopeBarProps) {
  const optionsQuery = (trpc as any).scope?.options?.useQuery
    ? (trpc as any).scope.options.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: null };
  const opts = optionsQuery.data as
    | { brands: any[]; products: any[]; events: any[] }
    | null;

  // brands fallback to legacy endpoint until scope router is fully deployed
  const legacyBrandsQuery = trpc.brand.listByMember.useQuery(undefined, {
    refetchOnWindowFocus: false,
    enabled: !opts,
  });
  const brands = opts?.brands ?? (legacyBrandsQuery.data as any[]) ?? [];
  const products = opts?.products ?? [];
  const events = opts?.events ?? [];

  const brand = brands.find((b: any) => b.id === scope.brandId) ?? null;
  const product = products.find((p: any) => p.id === scope.productId) ?? null;
  const event = events.find((e: any) => e.id === scope.eventId) ?? null;

  // Hierarchical scope picker. Picking a product / event resolves its
  // parent brand from the FK column on the row (server-side scope.options
  // returns products.brandId, events.brandId, events.productId).
  const pick = (which: "brand" | "product" | "event", id: number | null) => {
    if (which === "brand") {
      // Switching brand always clears product/event — they belong to
      // a different brand now.
      setScope({ brandId: id, productId: null, eventId: null });
      return;
    }
    if (which === "product") {
      if (id == null) {
        // Clearing product keeps brand (user wants brand-level scope back).
        setScope({ brandId: scope.brandId, productId: null, eventId: null });
        return;
      }
      const p = products.find((x: any) => x.id === id);
      const parentBrandId: number | null = p?.brandId ?? scope.brandId ?? null;
      // Picking a product clears any event (events are below products).
      setScope({ brandId: parentBrandId, productId: id, eventId: null });
      return;
    }
    if (which === "event") {
      if (id == null) {
        // Clearing event keeps brand + product (user steps back one level).
        setScope({ brandId: scope.brandId, productId: scope.productId, eventId: null });
        return;
      }
      const e = events.find((x: any) => x.id === id);
      const parentBrandId: number | null = e?.brandId ?? scope.brandId ?? null;
      // event.productIds is the m:n list (event_products join). When event
      // spans 0 or 2+ products, we leave product picker empty (null) so
      // "—" displays — caller can read scope.eventId and look up productIds
      // for full context. Single-product events auto-set the product.
      const productIds: number[] = (e?.productIds as number[] | undefined) ?? [];
      const parentProductId: number | null = productIds.length === 1
        ? productIds[0]
        : (productIds.length === 0 ? (e?.productId ?? null) : null);
      setScope({ brandId: parentBrandId, productId: parentProductId, eventId: id });
    }
  };

  // When the active event spans multiple products, surface them as a chip
  // group below the picker so the user knows the scope without clicking in.
  const eventMultiProducts: any[] = React.useMemo(() => {
    if (!event) return [];
    const ids = (event.productIds as number[] | undefined) ?? [];
    if (ids.length < 2) return [];
    return ids
      .map((pid) => products.find((p: any) => p.id === pid))
      .filter(Boolean);
  }, [event, products]);

  // Filter children to the active brand so the picker shows coherent options.
  // When no brand is set, show everything (user is browsing all scopes).
  const filteredProducts = scope.brandId
    ? products.filter((p: any) => p.brandId === scope.brandId)
    : products;
  // Events: show events of this brand PLUS the currently-selected event even if
  // its brandId is null/mismatched (brandId may be null on old records). This
  // ensures the dropdown always reflects the actual scope.eventId state.
  const filteredEvents = (() => {
    const base = scope.brandId
      ? events.filter((e: any) => e.brandId === scope.brandId || !e.brandId)
      : events;
    // Also include the currently-selected event if not already in list
    if (scope.eventId && !base.some((e: any) => e.id === scope.eventId)) {
      const selected = events.find((e: any) => e.id === scope.eventId);
      if (selected) return [...base, selected];
    }
    return base;
  })();

  const [createKind, setCreateKind] = React.useState<CreateScopeKind | null>(null);

  return (
    <div className="flex items-center gap-2">
      <ScopePicker
        icon={faTrademark}
        label="品牌"
        current={brand?.name ?? null}
        items={brands.map((b: any) => ({ id: b.id, name: b.name }))}
        onPick={(id) => pick("brand", id)}
        onCreate={() => setCreateKind("brand")}
        emptyHint="尚未建立品牌"
      />
      <ScopePicker
        icon={faBox}
        label="產品"
        current={
          product?.name
            ?? (eventMultiProducts.length > 0
                ? `${eventMultiProducts.length} 個產品`
                : null)
        }
        items={filteredProducts.map((p: any) => ({ id: p.id, name: p.name }))}
        onPick={(id) => pick("product", id)}
        onCreate={() => setCreateKind("product")}
        emptyHint={scope.brandId ? "此品牌尚未有產品" : "尚未建立產品"}
      />
      <ScopePicker
        icon={faCalendarDay}
        label="活動"
        current={event?.name ?? null}
        selectedId={scope.eventId}
        items={filteredEvents.map((e: any) => ({ id: e.id, name: e.name }))}
        onPick={(id) => pick("event", id)}
        onCreate={() => setCreateKind("event")}
        emptyHint={scope.brandId ? "此品牌尚未有活動" : "尚未建立活動"}
      />
      <CreateScopeModal
        kind={createKind}
        brandId={scope.brandId}
        onClose={() => setCreateKind(null)}
        onCreated={(kind, id) => pick(kind, id)}
      />
    </div>
  );
}

function ScopePicker({
  icon, label, current, selectedId, items, onPick, onCreate, emptyHint,
}: {
  icon: any;
  label: string;
  current: string | null;
  selectedId?: number | null;
  items: Array<{ id: number; name: string }>;
  onPick: (id: number | null) => void;
  onCreate: () => void;
  emptyHint: string;
}) {
  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Button
          size="sm"
          variant="bordered"
          radius="md"
          startContent={<FontAwesomeIcon icon={icon} className="text-default-400 text-tiny" />}
          endContent={<FontAwesomeIcon icon={faChevronDown} className="text-default-400 text-tiny" />}
          className="font-normal"
        >
          <span className="text-default-500 mr-1">{label}</span>
          <span className={current ? "text-foreground" : "text-default-400"}>
            {current ?? "—"}
          </span>
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label={`${label} 切換`}
        selectionMode="single"
        selectedKeys={selectedId != null
          ? new Set([String(selectedId)])
          : current
            ? new Set([String(items.find((i) => i.name === current)?.id ?? "")])
            : new Set()}
        emptyContent={
          <div className="px-3 py-4 text-tiny text-default-400">{emptyHint}</div>
        }
      >
        <>
          <DropdownItem
            key="__create__"
            onPress={onCreate}
            startContent={<FontAwesomeIcon icon={faPlus} className="text-tiny" />}
            className="text-primary"
          >
            新增{label}
          </DropdownItem>
          <DropdownItem
            key="__clear__"
            onPress={() => onPick(null)}
            className="text-default-400"
          >
            清除選擇 (—)
          </DropdownItem>
          <>{items.map((it) => (
            <DropdownItem key={String(it.id)} onPress={() => onPick(it.id)}>
              {it.name}
            </DropdownItem>
          ))}</>
        </>
      </DropdownMenu>
    </Dropdown>
  );
}
