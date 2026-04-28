/**
 * ScopeBar — global brand × product × event scope picker.
 *
 * Lives in ShellLayout's top-right header. Choose-one rule: user can pick
 * one of (brand | product | event) as the active scope; the other two
 * show "—" by default. The intake agent / orchestrator reads the active
 * scope before kicking off any squad pipeline.
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

  // Choose-one rule helper: picking one clears the other two
  const pick = (which: "brand" | "product" | "event", id: number | null) => {
    if (which === "brand")   setScope({ brandId: id, productId: null, eventId: null });
    if (which === "product") setScope({ brandId: null, productId: id, eventId: null });
    if (which === "event")   setScope({ brandId: null, productId: null, eventId: id });
  };

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
        current={product?.name ?? null}
        items={products.map((p: any) => ({ id: p.id, name: p.name }))}
        onPick={(id) => pick("product", id)}
        onCreate={() => setCreateKind("product")}
        emptyHint="尚未建立產品"
      />
      <ScopePicker
        icon={faCalendarDay}
        label="活動"
        current={event?.name ?? null}
        items={events.map((e: any) => ({ id: e.id, name: e.name }))}
        onPick={(id) => pick("event", id)}
        onCreate={() => setCreateKind("event")}
        emptyHint="尚未建立活動"
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
  icon, label, current, items, onPick, onCreate, emptyHint,
}: {
  icon: any;
  label: string;
  current: string | null;
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
        selectedKeys={current
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
