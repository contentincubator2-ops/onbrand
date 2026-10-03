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
import { useState, useEffect } from "react";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Button, Input, Textarea, Select, SelectItem, Autocomplete, AutocompleteItem } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRocket, faCubes, faCalendarDays } from "@fortawesome/free-solid-svg-icons";
// 2026-09-10 (CJ 市場收斂): 見 BrandOnboardingWizard 的同一則說明。
import { marketOptions, getCountry } from "../../../lib/countries";
import EventProductScopePicker from "./events/EventProductScopePicker";
import { UNDECIDED_SCOPE, type ProductScopeValue } from "../lib/eventProductScope";

// 2026-07-18 (CJ 多市場): same list as BrandOnboardingWizard — common
// languages first; the selected country's native language is auto-added.
const COMMON_LANGS: Array<{ code: string; label: string }> = [
  { code: "zh-TW", label: "繁體中文" },
  { code: "zh-CN", label: "简体中文" },
  { code: "en",    label: "English" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "ja",    label: "日本語" },
  { code: "ko",    label: "한국어" },
  { code: "th",    label: "ภาษาไทย" },
  { code: "vi",    label: "Tiếng Việt" },
  { code: "id",    label: "Bahasa Indonesia" },
  { code: "ms",    label: "Bahasa Melayu" },
  { code: "de",    label: "Deutsch" },
  { code: "fr",    label: "Français" },
  { code: "es",    label: "Español" },
  { code: "pt",    label: "Português" },
  { code: "it",    label: "Italiano" },
  { code: "ru",    label: "Русский" },
  { code: "ar",    label: "العربية" },
  { code: "hi",    label: "हिन्दी" },
];

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
  /** 2026-10-02：從活動時間軸的節點「開始企劃」——帶入名稱與日期（仍可改）。 */
  eventPrefill?: { name: string; startAt: string; endAt: string | null } | null;
}

// 2026-07-19 (CJ「新增活動 slug 直接用中文字元，未做 URL 編碼」): slugs must
// be URL-safe ASCII. CJK has no meaningful ASCII form — for
// Chinese-only names fall back to the entity kind; the random suffix
// carries uniqueness (e.g.「母親節活動」→ "event-x7k2").
function autoSlug(name: string, kind: string = "item"): string {
  const base = name.toLowerCase().trim()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "") // é→e, ü→u
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${base || kind}-${Math.random().toString(36).slice(2, 6)}`;
}

export function AddEntityModal({ isOpen, onClose, initialTab = "brand", defaultBrandId, onCreated, eventPrefill }: Props) {
  const { lang } = useLang();
  const [tab, setTab] = useState<AddEntityTab>(initialTab);
  // 2026-09-07 產品定位上限。建到第 11 個才被擋是死路，事前就要看得到「已用 N／M」。
  // 數量用 scope.options 裡該品牌的產品數，上限用 billing.getStatus 的 quota。
  const planStatusQ = (trpc as any).billing?.getStatus?.useQuery
    ? (trpc as any).billing.getStatus.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: undefined };
  const productLimit: number | undefined = (planStatusQ.data as any)?.quota?.products;
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
  // Background positioning pipeline + interim quick-pulse triggers.
  // Fire-and-forget: caller doesn't await, UI returns immediately.
  const startPositioningMut = (trpc as any).positioningJobs?.start?.useMutation();
  const runInterimMut       = (trpc as any).positioningJobs?.runInterim?.useMutation();
  const triggerPositioning = (kind: "brand" | "product" | "event", id: number) => {
    if (!id) return;
    // Interim is fast (<12s) — fire it; user sees a tagline appear shortly.
    runInterimMut?.mutate?.({ entityKind: kind, entityId: id });
    // Full pipeline runs in background; status polled via positioningJobs.getStatus.
    startPositioningMut?.mutate?.({ entityKind: kind, entityId: id, lang: "zh-TW" });
  };

  // ── Per-tab form state (kept independent so user can switch without losing input) ──
  // Brand
  const [brandName, setBrandName] = useState("");
  const [brandWebsite, setBrandWebsite] = useState("");
  const [brandTA, setBrandTA] = useState("");
  // 2026-07-18 (CJ 多市場): target market + output language — was only in
  // the first-brand onboarding wizard, so existing users adding brands here
  // couldn't pick a market at all.
  const [brandCountry, setBrandCountry] = useState("TW");
  const [brandLang, setBrandLang] = useState("zh-TW");
  const handleBrandCountryChange = (code: string) => {
    setBrandCountry(code);
    const profile = getCountry(code);
    if (profile) setBrandLang(profile.languageCode);
  };
  // Product
  const [prodBrandId, setProdBrandId] = useState<number | null>(defaultBrandId ?? null);
  const [prodName, setProdName] = useState("");
  const [prodWebsite, setProdWebsite] = useState("");
  const [prodPositioning, setProdPositioning] = useState("");
  // Event
  const [evBrandId, setEvBrandId] = useState<number | null>(defaultBrandId ?? null);
  const [evName, setEvName] = useState("");
  const [evStart, setEvStart] = useState("");
  const [evEnd, setEvEnd] = useState("");
  const [evNote, setEvNote] = useState("");
  // 2026-09-30（CJ「新增活動的過程中，要讓用戶可以選擇…搭配哪個產品、好幾個產品聯合
  // 或純品牌活動」）。沒選也能建立——宣傳企劃頁的第一步會再問一次同一題。
  const [evScope, setEvScope] = useState<ProductScopeValue>(UNDECIDED_SCOPE);
  const evBrandProducts: Array<{ id: number; name: string }> =
    (((scopeOptions.data as any)?.products ?? []) as any[])
      .filter((p) => Number(p.brandId) === Number(evBrandId))
      .map((p) => ({ id: Number(p.id), name: String(p.name) }));

  // Reset on open。從活動時間軸節點「開始企劃」打開時，活動欄位改帶節點的名稱與日期——
  // 要寫在這一步裡：另開一個 effect 帶值的話，會被這裡（宣告在後、執行在後）清掉
  // （2026-10-02 dev 站實測踩到）。
  useEffect(() => {
    if (!isOpen) return;
    setBrandName(""); setBrandWebsite(""); setBrandTA("");
    setBrandCountry("TW"); setBrandLang("zh-TW");
    setProdBrandId(defaultBrandId ?? null); setProdName(""); setProdPositioning("");
    setEvBrandId(defaultBrandId ?? null);
    setEvName(eventPrefill?.name ?? "");
    setEvStart(eventPrefill?.startAt ?? "");
    setEvEnd(eventPrefill?.endAt ?? "");
    setEvNote("");
    setEvScope(UNDECIDED_SCOPE);
  }, [isOpen, defaultBrandId, eventPrefill]);

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
        targetCountry: brandCountry || undefined,
        outputLanguage: brandLang || undefined,
      });
      const newId = Number(r?.id ?? r?.brandId ?? 0);
      await refreshLists();
      triggerPositioning("brand", newId);
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
      // 2026-05-18 (CJ「新增產品也加網址欄位，後續讀取更準確」): persist
      // the URL in positioning.website AND fold it into summary text so
      // every downstream reader (positioning pipeline context + the
      // orchestra's findFirstUrl) actually sees & can fetch the page.
      const w = prodWebsite.trim();
      const s = prodPositioning.trim();
      const summary = [s, w ? `官方網址：${w}` : ""].filter(Boolean).join("\n");
      const positioning =
        (s || w) ? { summary: summary || undefined, website: w || undefined } : undefined;
      const r = await upsertProductMut.mutateAsync({
        brandId: prodBrandId,
        slug: autoSlug(prodName, "product"),
        name: prodName.trim(),
        positioning,
      });
      const newId = Number(r?.id ?? 0);
      await refreshLists();
      triggerPositioning("product", newId);
      onCreated?.("product", newId);
      // Metadata enrichment is detached on the server. Refresh once more after
      // the usual fast product-page fetch so the new card can pick up its image.
      window.setTimeout(() => {
        void utils.product?.list?.invalidate?.();
      }, 2500);
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
        slug: autoSlug(evName, "event"),
        name: evName.trim(),
        startAt: evStart || null,
        endAt: evEnd || null,
        // 搭配的產品寫進 event_products；「純品牌」沒有產品可寫，所以記在
        // positioning.campaign.productScope（語意見 server/strategy/core/entities/eventProductScope.ts）。
        ...(evScope.scope ? { productIds: evScope.productIds } : {}),
        positioning: (evNote.trim() || evScope.scope)
          ? {
              ...(evNote.trim() ? { note: evNote.trim() } : {}),
              ...(evScope.scope ? { campaign: { productScope: evScope.scope } } : {}),
            }
          : undefined,
      });
      const newId = Number(r?.id ?? 0);
      await refreshLists();
      triggerPositioning("event", newId);
      onCreated?.("event", newId);
      onClose();
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const entityLabel = (k: AddEntityTab) => lang === "en"
    ? (k === "brand" ? "brand" : k === "product" ? "product" : "event")
    : (k === "brand" ? "品牌" : k === "product" ? "產品" : "活動");
  const EntityLabel = (k: AddEntityTab) => lang === "en"
    ? (k === "brand" ? "Brand" : k === "product" ? "Product" : "Event")
    : entityLabel(k);

  return (
    // 2026-07-07 (CJ「建立品牌送出按鈕被切一半」— Windows 筆電):
    // scrollBehavior="inside" caps the modal at the viewport and lets
    // ModalBody scroll internally; action buttons moved to ModalFooter
    // so they are always visible regardless of viewport height.
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" backdrop="blur" scrollBehavior="inside" classNames={{ base: "max-h-[92dvh]" }}>
      <ModalContent>
        {/* 2026-07-19 (CJ「彈窗右上角兩個重疊的 ×」): the custom close button
            sat under HeroUI Modal's BUILT-IN close at the same corner →
            double ×. Keep the built-in one (proper hover/ESC semantics). */}
        <ModalHeader className="flex items-center justify-between pr-10">
          <span className="text-lg font-semibold">{lang === "en" ? `Add a ${entityLabel(tab)}` : `新增 ${entityLabel(tab)}`}</span>
        </ModalHeader>
        <ModalBody className="pb-6">
          {/* Tab strip */}
          <div className="flex items-center gap-1 mb-5 border-b border-default-200">
            {([
              { v: "brand"   as const, label: EntityLabel("brand"),   icon: faRocket,        accent: "#18181b" },
              { v: "product" as const, label: EntityLabel("product"), icon: faCubes,         accent: "#18181b" },
              { v: "event"   as const, label: EntityLabel("event"),   icon: faCalendarDays,  accent: "#18181b" },
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
                <label className="text-xs font-medium text-default-700 block mb-1">{lang === "en" ? "Brand name" : "品牌名稱"}<span className="text-danger ml-0.5">*</span></label>
                <Input value={brandName} onValueChange={setBrandName} placeholder={lang === "en" ? "e.g. Laurel Nutrition Lab" : "例：桂冠營養研究室"} autoFocus isRequired />
              </div>
              <div>
                <label className="text-xs font-medium text-default-700 block mb-1">{lang === "en" ? "Website (optional)" : "官網（可選）"}</label>
                <Input value={brandWebsite} onValueChange={setBrandWebsite} placeholder="https://..." />
              </div>
              {/* 2026-07-18 (CJ 多市場): market picker — parity with the onboarding wizard */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-default-700 block mb-1">{lang === "en" ? "Target market" : "目標市場"}</label>
                  <Autocomplete
                    aria-label={lang === "en" ? "Target market" : "目標市場"}
                    placeholder={lang === "en" ? "Search country…" : "搜尋國家…"}
                    defaultSelectedKey={brandCountry}
                    onSelectionChange={(key) => { if (key) handleBrandCountryChange(String(key)); }}
                  >
                    {marketOptions(brandCountry).map((c) => (
                      <AutocompleteItem key={c.code} textValue={`${c.emoji} ${lang === "en" ? c.name : (c.nameZh ?? c.name)} (${c.code})`}>
                        <div className="flex items-center gap-2">
                          <span className="text-base">{c.emoji}</span>
                          <span className="text-sm">{lang === "en" ? c.name : (c.nameZh ?? c.name)}</span>
                          <span className="text-xs text-default-400 ml-auto">{c.code}</span>
                        </div>
                      </AutocompleteItem>
                    ))}
                  </Autocomplete>
                  <p className="text-tiny text-default-400 mt-1">{lang === "en" ? "AI researches competitors & trends in this market" : "AI 依此市場做競品 / 趨勢研究"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-default-700 block mb-1">{lang === "en" ? "Output language" : "輸出語言"}</label>
                  <Select
                    aria-label={lang === "en" ? "Output language" : "輸出語言"}
                    selectedKeys={brandLang ? [brandLang] : ["zh-TW"]}
                    onSelectionChange={(keys) => setBrandLang(Array.from(keys)[0] as string ?? "zh-TW")}
                  >
                    {[
                      ...COMMON_LANGS,
                      ...((() => {
                        const c = getCountry(brandCountry);
                        if (!c || COMMON_LANGS.some((l) => l.code === c.languageCode)) return [];
                        return [{ code: c.languageCode, label: c.languageName }];
                      })()),
                    ].map((l) => <SelectItem key={l.code}>{l.label}</SelectItem>)}
                  </Select>
                  <p className="text-tiny text-default-400 mt-1">{lang === "en" ? "Language AI writes copy in" : "AI 產出文案的語言"}</p>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-default-700 block mb-1">{lang === "en" ? "Target audience (optional, one line)" : "目標受眾（可選，1 句話）"}</label>
                <Textarea value={brandTA} onValueChange={setBrandTA} placeholder={lang === "en" ? "e.g. health-conscious moms, 35-50, dual-income households" : "例：35-50 歲、雙薪家庭、注重健康的媽媽"} minRows={2} />
              </div>
              <p className="text-xs text-default-500 italic">
                {lang === "en" ? "We'll auto-run a brand positioning analysis once it's created." : "建立後會自動觸發品牌定位推估（10-step Sowork analysis）。"}
              </p>
            </div>
          )}

          {/* Product tab */}
          {tab === "product" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-default-700 block mb-1">{lang === "en" ? "Brand" : "所屬品牌"}<span className="text-danger ml-0.5">*</span></label>
                <Select
                  selectedKeys={prodBrandId ? new Set([String(prodBrandId)]) : new Set()}
                  onSelectionChange={(keys) => {
                    const v = Array.from(keys as Set<string>)[0];
                    setProdBrandId(v ? Number(v) : null);
                  }}
                  placeholder={lang === "en" ? "Pick a brand" : "請選擇品牌"}
                  isRequired
                >
                  {brandsList.map((b) => (
                    <SelectItem key={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </Select>
              </div>
              <div>
                {productLimit !== undefined && productLimit !== -1 && (() => {
                  const used = ((scopeOptions as any)?.data?.products ?? [])
                    .filter((p: any) => Number(p.brandId) === Number(prodBrandId)).length;
                  const full = used >= productLimit;
                  return (
                    <p className={`mb-2 text-[13px] ${full ? "text-default-800 font-medium" : "text-default-500"}`}>
                      {lang === "en"
                        ? `Product positioning: ${used} / ${productLimit} used${full ? " — upgrade to add more." : "."}`
                        : `產品定位已用 ${used} ／ ${productLimit} 個${full ? "，升級後可以增加。" : "。"}`}
                    </p>
                  );
                })()}
                <label className="text-xs font-medium text-default-700 block mb-1">{lang === "en" ? "Product name" : "產品名稱"}<span className="text-danger ml-0.5">*</span></label>
                <Input value={prodName} onValueChange={setProdName} placeholder={lang === "en" ? "e.g. Healthy Meal 5g Protein microwave line" : "例：健力餐 5g 蛋白質微波系列"} autoFocus isRequired />
              </div>
              <div>
                <label className="text-xs font-medium text-default-700 block mb-1">{lang === "en" ? "Product URL (optional)" : "產品網址（可選）"}</label>
                <Input value={prodWebsite} onValueChange={setProdWebsite} placeholder="https://onbrand.sowork.ai" />
                <p className="text-tiny text-default-400 mt-1">{lang === "en" ? "The AI reads this page so the positioning is accurate." : "AI 會讀取這個頁面，讓定位分析更準確"}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-default-700 block mb-1">{lang === "en" ? "Positioning / USP (optional)" : "產品定位 / 獨家賣點（可選）"}</label>
                <Textarea value={prodPositioning} onValueChange={setProdPositioning} placeholder={lang === "en" ? "One line on what makes this product different" : "一句話描述產品的核心差異"} minRows={2} />
              </div>
            </div>
          )}

          {/* Event tab */}
          {tab === "event" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-default-700 block mb-1">{lang === "en" ? "Brand" : "所屬品牌"}<span className="text-danger ml-0.5">*</span></label>
                <Select
                  selectedKeys={evBrandId ? new Set([String(evBrandId)]) : new Set()}
                  onSelectionChange={(keys) => {
                    const v = Array.from(keys as Set<string>)[0];
                    setEvBrandId(v ? Number(v) : null);
                    setEvScope(UNDECIDED_SCOPE);   // 產品是跟著品牌的，換品牌就重選
                  }}
                  placeholder={lang === "en" ? "Pick a brand" : "請選擇品牌"}
                  isRequired
                >
                  {brandsList.map((b) => (
                    <SelectItem key={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-default-700 block mb-1">{lang === "en" ? "Event name" : "活動名稱"}<span className="text-danger ml-0.5">*</span></label>
                <Input value={evName} onValueChange={setEvName} placeholder={lang === "en" ? "e.g. Mother's Day flash sale / Product launch event" : "例：母親節限時優惠 / 新品上市發表會"} autoFocus isRequired />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-default-700 block mb-1">{lang === "en" ? "Start date" : "起始日"}</label>
                  <Input type="date" value={evStart} onValueChange={setEvStart} />
                </div>
                <div>
                  <label className="text-xs font-medium text-default-700 block mb-1">{lang === "en" ? "End date" : "結束日"}</label>
                  <Input type="date" value={evEnd} onValueChange={setEvEnd} />
                </div>
              </div>
              {evBrandId && (
                <EventProductScopePicker
                  products={evBrandProducts} value={evScope} onChange={setEvScope}
                  en={lang === "en"} isDisabled={busy}
                />
              )}
              <div>
                <label className="text-xs font-medium text-default-700 block mb-1">{lang === "en" ? "Theme / hooks (optional)" : "活動主題 / 重點（可選）"}</label>
                <Textarea value={evNote} onValueChange={setEvNote} placeholder={lang === "en" ? "What's the angle, theme, or perks" : "活動的訴求 / 主題 / 配套"} minRows={2} />
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="text-tiny text-danger bg-danger-50 border border-danger-200 rounded px-3 py-2 mt-3">
              {errorMsg}
            </div>
          )}
        </ModalBody>
        <ModalFooter className="border-t border-default-100">
          <Button variant="light" onPress={onClose} isDisabled={busy}>{lang === "en" ? "Cancel" : "取消"}</Button>
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
            {lang === "en" ? `Create ${entityLabel(tab)}` : `建立 ${entityLabel(tab)}`}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default AddEntityModal;
