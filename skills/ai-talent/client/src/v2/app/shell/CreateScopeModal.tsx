/**
 * CreateScopeModal — small create form for brand / product / event.
 * Triggered from ScopeBar dropdowns ("+ 新增 X"). Calls the matching
 * router mutation, invalidates scope.options, and selects the new
 * record as the active scope on success.
 */
import React from "react";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Input, Button, Chip,
} from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrademark, faBox, faCalendarDay } from "@fortawesome/free-solid-svg-icons";

export type CreateScopeKind = "brand" | "product" | "event";

interface CreateScopeModalProps {
  kind: CreateScopeKind | null;
  /** Active brandId — required for product / event creation. */
  brandId: number | null;
  onClose: () => void;
  /** Called with the new record id after successful create. */
  onCreated: (kind: CreateScopeKind, id: number) => void;
}

const KIND_META = {
  brand:   { icon: faTrademark,  label: "品牌",    eyebrow: "BRAND" },
  product: { icon: faBox,        label: "產品",    eyebrow: "PRODUCT" },
  event:   { icon: faCalendarDay,label: "活動",    eyebrow: "EVENT" },
} as const;

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^\w一-鿿-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || `untitled-${Date.now()}`;
}

export default function CreateScopeModal({ kind, brandId, onClose, onCreated }: CreateScopeModalProps) {
  const open = kind !== null;
  const meta = kind ? KIND_META[kind] : null;
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr]   = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) { setName(""); setErr(null); setBusy(false); }
  }, [open]);

  const utils = (trpc as any).useUtils?.() ?? null;

  const brandCreate   = (trpc as any).brand?.create?.useMutation?.()    ?? null;
  const productUpsert = (trpc as any).product?.upsert?.useMutation?.()  ?? null;
  const eventUpsert   = (trpc as any).event?.upsert?.useMutation?.()    ?? null;

  const submit = async () => {
    if (!kind || !name.trim()) { setErr("請輸入名稱"); return; }
    setBusy(true);
    setErr(null);
    try {
      let newId: number;
      if (kind === "brand") {
        if (!brandCreate) throw new Error("brand.create not available");
        const r: any = await brandCreate.mutateAsync({ name: name.trim() });
        newId = Number(r?.id ?? r?.brandId ?? r?.[0]?.insertId ?? 0);
        if (!newId) throw new Error("Failed to read new brand id from response");
      } else if (kind === "product") {
        if (!productUpsert) throw new Error("product.upsert not available");
        if (!brandId) throw new Error("產品需要綁定品牌，請先選一個品牌");
        const r: any = await productUpsert.mutateAsync({
          brandId, slug: slugify(name), name: name.trim(),
        });
        newId = Number(r?.id ?? 0);
      } else {
        if (!eventUpsert) throw new Error("event.upsert not available");
        const r: any = await eventUpsert.mutateAsync({
          brandId: brandId ?? null, slug: slugify(name), name: name.trim(),
        });
        newId = Number(r?.id ?? 0);
      }
      utils?.scope?.options?.invalidate?.();
      utils?.brand?.listByMember?.invalidate?.();
      onCreated(kind, newId);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} size="md">
      <ModalContent>
        {meta && (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <Chip size="sm" variant="flat" color="default" className="uppercase tracking-wider self-start"
                startContent={<FontAwesomeIcon icon={meta.icon} className="text-tiny ml-1" />}>
                {meta.eyebrow}
              </Chip>
              <h2 className="text-medium font-semibold">新增{meta.label}</h2>
            </ModalHeader>
            <ModalBody className="gap-3">
              <Input
                size="sm"
                radius="md"
                variant="bordered"
                label={`${meta.label}名稱`}
                labelPlacement="outside"
                placeholder={kind === "event" ? "例：618 大檔活動" : kind === "product" ? "例：00991A 復華未來50 ETF" : "例：成吉思汗健身俱樂部"}
                value={name}
                onValueChange={setName}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                autoFocus
              />
              {kind === "product" && !brandId && (
                <p className="text-tiny text-warning">提醒：建立產品需要綁定品牌，請先在 ScopeBar 選擇一個品牌。</p>
              )}
              {kind === "event" && !brandId && (
                <p className="text-tiny text-default-500">提示：未綁定品牌的活動仍可建立，之後可再關聯。</p>
              )}
              {err && <p className="text-tiny text-danger">{err}</p>}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>取消</Button>
              <Button
                color="primary"
                isLoading={busy}
                isDisabled={!name.trim() || (kind === "product" && !brandId)}
                onPress={submit}
              >
                建立
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
