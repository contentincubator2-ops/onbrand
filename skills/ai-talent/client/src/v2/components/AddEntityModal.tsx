/**
 * AddEntityModal — unified create dialog for 品牌 / 產品 / 活動.
 *
 * Single component used everywhere we need to add scope entities:
 *   · ShellLayout BrandHierarchyPill 「+ 新增品牌 / 產品 / 活動」
 *   · BrandsPage primary "+ 新增" button
 *   · Future: TheaterPage 加入素材 modal "+ 新增" buttons can re-use
 *     by passing an initialTab.
 *
 * Each tab uses the canonical tRPC mutation:
 *   品牌 → trpc.brand.create
 *   產品 → trpc.product.upsert (no id = create)
 *   活動 → trpc.event.upsert   (no id = create)
 *
 * Successful create → invalidates the relevant list queries so the
 * brand picker / scope options refresh immediately.
 */
import React, { useState, useEffect } from "react";
import { trpc } from "../../lib/trpc";
import { Modal, ModalBody, ModalContent, ModalHeader, Button, Input, Textarea, Select, SelectItem } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faRocket, faCubes, faCalendarDays } from "@fortawesome/free-solid-svg-icons";

export type AddEntityTab = "brand" | "product" | "event";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: AddEntityTab;
  /** Pre-select a brand for product/event creation (e.g. when launched
   *  from inside a brand context). Defaults to undefined → user picks. */
  defaultBrandId?: number | null;
  /** Callback after a successful create. Receives entity kind + new id. */
  onCreated?: (kind: AddEntityTab, id: number) => void;
}

function autoSlug(name: string): string {
  const base = name.toLowerCase().trim()
    .replace(/[^\w一-鿿-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "item";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export function AddEntityModal({ isOpen, onClose, initialTab = "brand", defaultBrandId, onCreated }: Props) {
  const [tab, setTab] = useState<AddEntityTab>(initialTab);
  useEffect(() => { if (isOpen) setTab(initialTab); }, [isOpen, initialTab]);

  // ── Brand list (for product/event picker) ───────────────────────────
  const scopeOptions = (trpc as any).scope?.options?.useQuery
    ? (trpc as any).scope.options.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: null };
  const brandsList: Array<{ id: number; name: string }> = (scopeOptions.data as any)?.brands ?? [];

  // ── tRPC mutations + utils for cache invalidation ───────────────────
  const utils = trpc.useUtils();
  const createBrandMut   = (trpc as any).brand?.create?.useMutation();
  const upsertProductMut = (trpc as any).product?.upsert?.useMutation();
  const upsertEventMut   = (trpc as any).event?.upsert?.useMutation();

  // ── Per-tab form state (kept independent so user can switch without losing input) ──
  // Brand
  const [brandName, setBrandName] = useState("");
  const [brandWebsite, setBrandWebsite] = useState("");
  const [brandTA, setBrandTA] = useState("");
  // Product
  const [prodBrandId, setProdBrandId] = useState<number | null>(defaultBrandId ?? null);
  const [prodName, setProdName] = useState("");
  const [prodPositioning, setProdPositioning] = useState("");
  // Event
  const [evBrandId, setEvBrandId] = useState<number | null>(defaultBrandId ?? null);
  const [evName, setEvName] = useState("");
  const [evStart, setEvStart] = useState("");
  const [evEnd, setEvEnd] = useState("");
  const [evNote, setEvNote] = useState("");

  // Reset on open
  useEffect(() => {
    if (!isOpen) return;
    setBrandName(""); setBrandWebsite(""); setBrandTA("");
    setProdBrandId(defaultBrandId ?? null); setProdName(""); setProdPositioning("");
    setEvBrandId(defaultBrandId ?? null); setEvName(""); setEvStart(""); setEvEnd(""); setEvNote("");
  }, [isOpen, defaultBrandId]);

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refreshLists = async () => {
    await Promise.all([
      utils.scope?.options?.invalidate?.(),
      utils.product?.list?.invalidate?.(),
      utils.event?.list?.invalidate?.(),
      // Legacy brand listing — invalidate any usage
      (utils as any).brand?.listByMember?.invalidate?.(),
    ].filter(Boolean));
  };

  const handleCreateBrand = async () => {
    if (!brandName.trim() || !createBrandMut) return;
    setBusy(true); setErrorMsg(null);
    try {
      const r = await createBrandMut.mutateAsync({
        name: brandName.trim(),
        website: brandWebsite.trim() || undefined,
        targetAudience: brandTA.trim() || undefined,
      });
      const newId = Number(r?.id ?? r?.brandId ?? 0);
      await refreshLists();
      onCreated?.("brand", newId);
      onClose();
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateProduct = async () => {
    if (!prodName.trim() || !upsertProductMut) return;
    setBusy(true); setErrorMsg(null);
    try {
      const r = await upsertProductMut.mutateAsync({
        brandId: prodBrandId,
        slug: autoSlug(prodName),
        name: prodName.trim(),
        positioning: prodPositioning.trim() ? { summary: prodPositioning.trim() } : undefined,
      });
      const newId = Number(r?.id ?? 0);
      await refreshLists();
      onCreated?.("product", newId);
      onClose();
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!evName.trim() || !upsertEventMut) return;
    setBusy(true); setErrorMsg(null);
    try {
      const r = await upsertEventMut.mutateAsync({
        brandId: evBrandId,
        slug: autoSlug(evName),
        name: evName.trim(),
        startAt: evStart || null,
        endAt: evEnd || null,
        positioning: evNote.trim() ? { note: evNote.trim() } : undefined,
      });
      const newId = Number(r?.id ?? 0);
      await refreshLists();
      onCreated?.("event", newId);
      onClose();
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" backdrop="blur">
      <ModalContent>
        <ModalHeader className="flex items-center justify-between">
          <span className="text-lg font-semibold">新增 {tab === "brand" ? "品牌" : tab === "product" ? "產品" : "活動"}</span>
          <button onClick={onClose} className="text-default-400 hover:text-default-700">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </ModalHeader>
        <ModalBody className="pb-6">
          {/* Tab strip */}
          <div className="flex items-center gap-1 mb-5 border-b border-default-200">
            {([
              { v: "brand"   as const, label: "品牌", icon: faRocket,        accent: "#7C3AED" },
              { v: "product" as const, label: "產品", icon: faCubes,         accent: "#059669" },
              { v: "event"   as const, label: "活動", icon: faCalendarDays,  accent: "#F97316" },
            ]).map((t) => (
              <button
                key={t.v}
                onClick={() => { setTab(t.v); setErrorMsg(null); }}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium border-b-2 transition flex items-center gap-1.5"
                style={{
                  borderColor: tab === t.v ? t.accent : "transparent",
                  color: tab === t.v ? t.accent : "#6b7280",
                }}
              >
                <FontAwesomeIcon icon={t.icon} className="text-xs" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Brand tab */}
          {tab === "brand" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-default-700 block mb-1">品牌名稱<span className="text-danger ml-0.5">*</span></label>
                <Input value={brandName} onValueChange={setBrandName} placeholder="例：桂冠營養研究室" autoFocus isRequired />
              </div>
              <div>
                <label className="text-xs font-medium text-default-700 block mb-1">官網（可選）</label>
                <Input value={brandWebsite} onValueChange={setBrandWebsite} placeholder="https://..." />
              </div>
              <div>
                <label className="text-xs font-medium text-default-700 block mb-1">目標受眾（可選，1 句話）</label>
                <Textarea value={brandTA} onValueChange={setBrandTA} placeholder="例：35-50 歲、雙薪家庭、注重健康的媽媽" minRows={2} />
              </div>
              <p className="text-xs text-default-500 italic">
                建立後會自動觸發品牌定位推估（10-step Sowork analysis）。
              </p>
            </div>
          )}

          {/* Product tab */}
          {tab === "product" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-default-700 block mb-1">所屬品牌<span className="text-danger ml-0.5">*</span></label>
                <Select
                  selectedKeys={prodBrandId ? new Set([String(prodBrandId)]) : new Set()}
                  onSelectionChange={(keys) => {
                    const v = Array.from(keys as Set<string>)[0];
                    setProdBrandId(v ? Number(v) : null);
                  }}
                  placeholder="請選擇品牌"
                  isRequired
                >
                  {brandsList.map((b) => (
                    <SelectItem key={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-default-700 block mb-1">產品名稱<span className="text-danger ml-0.5">*</span></label>
                <Input value={prodName} onValueChange={setProdName} placeholder="例：健力餐 5g 蛋白質微波系列" autoFocus isRequired />
              </div>
              <div>
                <label className="text-xs font-medium text-default-700 block mb-1">產品定位 / USP（可選）</label>
                <Textarea value={prodPositioning} onValueChange={setProdPositioning} placeholder="一句話描述產品的核心差異" minRows={2} />
              </div>
            </div>
          )}

          {/* Event tab */}
          {tab === "event" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-default-700 block mb-1">所屬品牌<span className="text-danger ml-0.5">*</span></label>
                <Select
                  selectedKeys={evBrandId ? new Set([String(evBrandId)]) : new Set()}
                  onSelectionChange={(keys) => {
                    const v = Array.from(keys as Set<string>)[0];
                    setEvBrandId(v ? Number(v) : null);
                  }}
                  placeholder="請選擇品牌"
                  isRequired
                >
                  {brandsList.map((b) => (
                    <SelectItem key={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-default-700 block mb-1">活動名稱<span className="text-danger ml-0.5">*</span></label>
                <Input value={evName} onValueChange={setEvName} placeholder="例：母親節限時優惠 / 新品上市發表會" autoFocus isRequired />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-default-700 block mb-1">起始日</label>
                  <Input type="date" value={evStart} onValueChange={setEvStart} />
                </div>
                <div>
                  <label className="text-xs font-medium text-default-700 block mb-1">結束日</label>
                  <Input type="date" value={evEnd} onValueChange={setEvEnd} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-default-700 block mb-1">活動主題 / 重點（可選）</label>
                <Textarea value={evNote} onValueChange={setEvNote} placeholder="活動的訴求 / 主題 / 配套" minRows={2} />
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="text-tiny text-danger bg-danger-50 border border-danger-200 rounded px-3 py-2 mt-3">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-default-100">
            <Button variant="light" onPress={onClose} isDisabled={busy}>取消</Button>
            <Button
              color="primary"
              isLoading={busy}
              isDisabled={busy ||
                (tab === "brand"   && !brandName.trim()) ||
                (tab === "product" && (!prodName.trim() || !prodBrandId)) ||
                (tab === "event"   && (!evName.trim() || !evBrandId))
              }
              onPress={() => {
                if (tab === "brand") return handleCreateBrand();
                if (tab === "product") return handleCreateProduct();
                return handleCreateEvent();
              }}
            >
              建立 {tab === "brand" ? "品牌" : tab === "product" ? "產品" : "活動"}
            </Button>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

export default AddEntityModal;
