/**
 * BrandSwitcher — small dropdown in the top bar.
 * Migrated to HeroUI 2026-04-27 (a11y + Esc handling free).
 */
import React from "react";
import {
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSection,
  Button,
} from "@heroui/react";

interface Brand { id: number; name: string; }

export default function BrandSwitcher({
  brands,
  selectedId,
  onSelect,
}: {
  brands: Brand[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const selected = brands.find((b) => b.id === selectedId) ?? null;
  const initial = (selected?.name ?? "·")[0];

  return (
    <Dropdown placement="bottom-end" radius="sm">
      <DropdownTrigger>
        <Button
          size="sm"
          variant="bordered"
          radius="sm"
          startContent={
            <span className="w-5 h-5 rounded-full bg-success text-white text-[0.6rem] flex items-center justify-center font-semibold shrink-0">
              {initial}
            </span>
          }
          endContent={<span className="text-default-400">▾</span>}
          className="text-[0.74rem] text-foreground h-8 min-w-[140px] justify-start border-divider"
        >
          <span className="max-w-[140px] truncate">{selected?.name ?? "選擇品牌"}</span>
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="品牌選單"
        onAction={(key) => {
          const k = String(key);
          if (k === "__add__") { window.location.href = "/onboarding"; return; }
          onSelect(Number(k));
        }}
        emptyContent="尚無品牌"
      >
        <DropdownSection showDivider>
          {brands.map((b) => (
            <DropdownItem key={String(b.id)}>{b.name}</DropdownItem>
          ))}
        </DropdownSection>
        <DropdownSection>
          <DropdownItem key="__add__" className="text-default-500">
            + 新增品牌
          </DropdownItem>
        </DropdownSection>
      </DropdownMenu>
    </Dropdown>
  );
}
