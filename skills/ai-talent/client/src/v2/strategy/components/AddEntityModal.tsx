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
import { useState, useEffect, useRef } from "react";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Button, Chip, Input, Textarea, Select, SelectItem, Autocomplete, AutocompleteItem, Tooltip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRocket, faCubes, faCalendarDays, faTag, faShareNodes, faPaperclip, faXmark, faFileLines } from "@fortawesome/free-solid-svg-icons";
// 2026-09-10 (CJ 市場收斂): 見 BrandOnboardingWizard 的同一則說明。
import { marketOptions, getCountry } from "../../../lib/countries";
import EventProductScopePicker from "./events/EventProductScopePicker";
import { UNDECIDED_SCOPE, scopeSummary, type ProductScopeValue } from "../lib/eventProductScope";
import { EmptyIllustration } from "../../platform/components/EmptyIllustration";
import { showToastGlobal } from "../../platform/components/Toast";
import { TASK_MODAL_CLASSNAMES, TASK_MODAL_HEADER, TASK_MODAL_INPUT, TASK_MODAL_QUESTION } from "../../platform/components/taskModalStyle";
import { CAMPAIGN_CHANNELS, CAMPAIGN_TYPES } from "../lib/campaign/campaignSchema";
import { CHANNEL_META, channelLabel } from "../../platform/lib/channelMeta";

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

/** 新增活動時最多帶幾份過往資料；一份讀進多少字（跟活動參考資料的單筆上限一致）。 */
const EVENT_FILES_MAX = 5;
const EVENT_FILE_TEXT_MAX = 20_000;
const EVENT_FILE_ACCEPT = ".docx,.doc,.pptx,.ppt,.xlsx,.pdf,.md,.markdown,.txt,.html,.htm";

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
  // 2026-10-08（CJ「本來確認類型和通路的那一格的內容，都要出現在新建活動的選項」）：宣傳企劃頁
  // 原本「下一步」之後才確認的類型、通路、線下活動的地點／場次／報名連結，都在這裡選。有選就
  // 照選的，沒選的才由 AI 依那段話判斷；三樣（類型、通路、那段話）都有就直接排，不推斷。
  const [evType, setEvType] = useState("");
  const [evChannels, setEvChannels] = useState<string[]>([]);
  const [evOffline, setEvOffline] = useState({ venue: "", sessions: "", signupUrl: "" });
  /**
   * 2026-10-08（CJ「新建活動時…可上傳過往資料參考」「這一個彈跳視窗內容很多，可以參考任務卡的
   * 彈跳視窗的 TESLA UI」）：
   *   · 過往資料用上傳的。挑檔當下就抽成文字（既有的 extract-text，不留檔），讀不出來馬上說；
   *     活動建好後存成這檔活動的參考資料（campaign.chatAddSource）——排企劃與之後的對話都讀得到。
   *   · 版面照任務卡視窗：插畫＋一句問題＋一個輸入框，其餘（品牌、日期、搭配、類型、通路）收成
   *     一排圖示，點了才展開那一格。
   */
  const [evFiles, setEvFiles] = useState<Array<{ name: string; text: string; chars: number }>>([]);
  const [evUploading, setEvUploading] = useState("");
  const [evFileNote, setEvFileNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [evPanel, setEvPanel] = useState<"brand" | "dates" | "scope" | "type" | "channels" | null>(null);
  const evFileRef = useRef<HTMLInputElement>(null);
  const addSourceMut = (trpc as any).campaign?.chatAddSource?.useMutation?.();
  const onEventFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length || !evBrandId || evUploading) return;
    const en = lang === "en";
    setEvFileNote(null);
    let room = EVENT_FILES_MAX - evFiles.length;
    for (const file of files) {
      if (room <= 0) {
        setEvFileNote({ text: en ? `Up to ${EVENT_FILES_MAX} files.` : `最多 ${EVENT_FILES_MAX} 份。`, bad: true });
        break;
      }
      setEvUploading(file.name);
      try {
        const r = await fetch("/api/positioning-doc/extract-text", {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/octet-stream",
            "x-brand-id": String(evBrandId),
            "x-scope": "brand",
            "x-scope-id": String(evBrandId),
            "x-filename": encodeURIComponent(file.name),
          },
          body: file,
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.detail ? `${j.error}：${j.detail}` : (j?.error ?? `HTTP ${r.status}`));
        const raw = String(j.text ?? "").trim();
        if (!raw) throw new Error(en ? "No text could be read from this file" : "這份檔案讀不出文字");
        const total = Math.max(Number(j.chars) || 0, raw.length);
        setEvFiles((prev) => [...prev, { name: file.name.slice(0, 200), text: raw.slice(0, EVENT_FILE_TEXT_MAX), chars: total }]);
        room -= 1;
        // 明講被切掉了，不要讓人以為整份都讀進來了。
        if (total > EVENT_FILE_TEXT_MAX) {
          setEvFileNote({
            text: en
              ? `${file.name} has about ${total.toLocaleString()} characters — only the first ${EVENT_FILE_TEXT_MAX.toLocaleString()} are read.`
              : `${file.name} 約 ${total.toLocaleString()} 字，只讀進前 ${EVENT_FILE_TEXT_MAX.toLocaleString()} 字。`,
            bad: false,
          });
        }
      } catch (e: any) {
        setEvFileNote({ text: `${file.name}：${String(e?.message ?? e).slice(0, 160)}`, bad: true });
      }
    }
    setEvUploading("");
    if (evFileRef.current) evFileRef.current.value = "";
  };
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
    setEvChannels([]);
    setEvType("");
    setEvOffline({ venue: "", sessions: "", signupUrl: "" });
    setEvFiles([]); setEvUploading(""); setEvFileNote(null);
    setEvPanel(defaultBrandId ? null : "brand");
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
      const note = evNote.trim();
      const campaign: Record<string, unknown> = {
        ...(evScope.scope ? { productScope: evScope.scope } : {}),
        ...(evType ? { type: evType } : {}),
        ...(evChannels.length ? { channels: evChannels } : {}),
        // 那段話就是優惠機制（宣傳企劃頁的同一題）；上限跟設定欄位一樣是 600 字。
        ...(note ? { mechanic: note.slice(0, 600) } : {}),
        ...(evType === "offline"
          ? Object.fromEntries(Object.entries(evOffline).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v))
          : {}),
      };
      const r = await upsertEventMut.mutateAsync({
        brandId: evBrandId,
        slug: autoSlug(evName, "event"),
        name: evName.trim(),
        startAt: evStart || null,
        endAt: evEnd || null,
        // 搭配的產品寫進 event_products；「純品牌」沒有產品可寫，所以記在
        // positioning.campaign.productScope（語意見 server/strategy/core/entities/eventProductScope.ts）。
        ...(evScope.scope ? { productIds: evScope.productIds } : {}),
        positioning: (note || Object.keys(campaign).length)
          ? { ...(note ? { note } : {}), ...(Object.keys(campaign).length ? { campaign } : {}) }
          : undefined,
      });
      const newId = Number(r?.id ?? 0);
      // 參考資料要在進企劃頁（會直接排第一版）之前存好，排的時候才讀得到。存不進去不擋建立，
      // 但要講——之後可以在企劃頁的對話框重新上傳。
      let lost = 0;
      if (newId && evFiles.length) {
        for (const f of evFiles) {
          try { await addSourceMut.mutateAsync({ eventId: newId, name: f.name, text: f.text, chars: f.chars }); }
          catch { lost += 1; }
        }
      }
      if (lost > 0) {
        showToastGlobal(lang === "en"
          ? `${lost} reference file(s) couldn't be saved — re-upload them from the chat box on the campaign page.`
          : `有 ${lost} 份參考資料沒存進去，可以在企劃頁的對話框重新上傳。`, "error");
      }
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
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" backdrop="blur" scrollBehavior="inside" classNames={TASK_MODAL_CLASSNAMES}>
      <ModalContent>
        {/* 2026-07-19 (CJ「彈窗右上角兩個重疊的 ×」): the custom close button
            sat under HeroUI Modal's BUILT-IN close at the same corner →
            double ×. Keep the built-in one (proper hover/ESC semantics). */}
        <ModalHeader className={TASK_MODAL_HEADER}>
          <div className="flex items-center gap-2.5 min-w-0">
            <FontAwesomeIcon icon={tab === "brand" ? faRocket : tab === "product" ? faCubes : faCalendarDays} className="text-neutral-900 shrink-0" style={{ fontSize: 16 }} />
            <p className="text-[15px] text-neutral-900 truncate font-semibold">{lang === "en" ? `Add a ${entityLabel(tab)}` : `新增 ${entityLabel(tab)}`}</p>
          </div>
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

          {/* Event tab —— 任務卡視窗的版面（taskModalStyle）：問題＋輸入框在第一層，其餘在圖示後面。 */}
          {tab === "event" && (() => {
            const en = lang === "en";
            const L = (zh: string, e: string) => (en ? e : zh);
            const typeSpec = CAMPAIGN_TYPES.find((t) => t.id === evType);
            const dock = [
              { id: "brand" as const, icon: faRocket, label: L("品牌", "Brand"), on: !!evBrandId,
                tip: brandsList.find((x) => Number(x.id) === Number(evBrandId))?.name ?? L("選所屬品牌", "Pick a brand") },
              { id: "dates" as const, icon: faCalendarDays, label: L("日期", "Dates"), on: !!(evStart || evEnd),
                tip: [evStart, evEnd].filter(Boolean).join(" → ") || L("起始日、結束日", "Start and end dates") },
              { id: "scope" as const, icon: faCubes, label: L("搭配", "Features"), on: !!evScope.scope,
                tip: scopeSummary(evScope, en) || L("搭配哪個產品，或純品牌活動", "Which products, or a brand campaign") },
              { id: "type" as const, icon: faTag, label: L("類型", "Type"), on: !!evType,
                tip: typeSpec ? (en ? typeSpec.en : typeSpec.zh) : L("沒選就依你寫的內容判斷", "Leave empty and we'll work it out") },
              { id: "channels" as const, icon: faShareNodes, label: L("通路", "Channels"), on: evChannels.length > 0,
                tip: evChannels.map((c) => channelLabel(c, en)).join("、") || L("沒選就依你寫的內容判斷", "Leave empty and we'll pick") },
            ];
            const canAttach = !!evBrandId && !busy && !evUploading && evFiles.length < EVENT_FILES_MAX;
            return (
            <div className="space-y-3">
              <div className="flex items-center gap-4 pt-1">
                <div className="shrink-0"><EmptyIllustration kind="event" width={104} /></div>
                <h2 className={TASK_MODAL_QUESTION}>{L("這檔活動在賣什麼、優惠是什麼？", "What's this campaign offering?")}</h2>
              </div>

              <Input value={evName} onValueChange={setEvName} autoFocus isRequired classNames={TASK_MODAL_INPUT}
                aria-label={L("活動名稱", "Event name")}
                placeholder={L("活動名稱（必填），例：母親節限時優惠", "Event name (required), e.g. Mother's Day flash sale")} />

              <div className="relative">
                <Textarea value={evNote} onValueChange={setEvNote} minRows={3} maxRows={6} maxLength={800}
                  aria-label={L("這檔活動在賣什麼、優惠是什麼？", "What's this campaign offering?")}
                  classNames={{ inputWrapper: "rounded-2xl px-4 pt-3 pb-12", input: "text-[15px]" }}
                  placeholder={L("例：中秋檔期，橫膈牛排＋厚切牛舌組合早鳥 8 折，9/20–9/28，數量有限", "e.g. Mid-Autumn bundle, 20% off early bird, 9/20–9/28, limited stock")} />
                <div className="absolute right-2 bottom-2 z-10">
                  <Tooltip content={!evBrandId ? L("先選品牌", "Pick a brand first")
                    : L("上傳過往資料當參考（企劃書、活動辦法、成效報告…）", "Upload past material as reference (plans, terms, reports…)")}>
                    <button type="button" disabled={!canAttach} onClick={() => evFileRef.current?.click()}
                      aria-label={L("上傳過往資料", "Upload past material")}
                      className="relative w-9 h-9 rounded-full bg-white text-neutral-700 ring-1 ring-default-200 hover:ring-default-400 flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed">
                      {evUploading
                        ? <span className="w-4 h-4 border-2 border-default-300 border-t-neutral-700 rounded-full animate-spin" />
                        : <FontAwesomeIcon icon={faPaperclip} style={{ fontSize: 14 }} />}
                      {evFiles.length > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-neutral-900 text-white text-[10px] leading-4 text-center ring-2 ring-white">{evFiles.length}</span>
                      )}
                    </button>
                  </Tooltip>
                </div>
                <input ref={evFileRef} type="file" multiple hidden accept={EVENT_FILE_ACCEPT}
                  onChange={(e) => { void onEventFiles(e.target.files); }} />
              </div>

              {(evFiles.length > 0 || evUploading || evFileNote) && (
                <div className="space-y-1.5">
                  {evFiles.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {evFiles.map((f, i) => (
                        <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 max-w-full rounded-full bg-default-100 pl-2.5 pr-1 py-1 text-[12px] text-default-700">
                          <FontAwesomeIcon icon={faFileLines} className="text-default-400 shrink-0" style={{ fontSize: 11 }} />
                          <span className="truncate max-w-[220px]">{f.name}</span>
                          <span className="text-default-400 shrink-0">{f.chars > EVENT_FILE_TEXT_MAX ? L(`前 ${EVENT_FILE_TEXT_MAX.toLocaleString()} 字`, `first ${EVENT_FILE_TEXT_MAX.toLocaleString()} chars`) : L(`${f.chars.toLocaleString()} 字`, `${f.chars.toLocaleString()} chars`)}</span>
                          <button type="button" disabled={busy} aria-label={L(`移除 ${f.name}`, `Remove ${f.name}`)}
                            onClick={() => setEvFiles((prev) => prev.filter((_, j) => j !== i))}
                            className="w-5 h-5 rounded-full flex items-center justify-center text-default-500 hover:bg-default-200 shrink-0">
                            <FontAwesomeIcon icon={faXmark} style={{ fontSize: 10 }} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {evUploading && <p className="text-tiny text-default-500" role="status">{L(`正在讀 ${evUploading}…`, `Reading ${evUploading}…`)}</p>}
                  {evFileNote && <p className={`text-tiny ${evFileNote.bad ? "text-danger" : "text-default-500"}`}>{evFileNote.text}</p>}
                </div>
              )}

              {/* 第二層：一排圖示，點了才展開那一格；設定過的反白。 */}
              <div className="flex items-start gap-3 pt-1">
                {dock.map((d) => {
                  const open = evPanel === d.id;
                  return (
                    <Tooltip key={d.id} content={d.tip}>
                      <button type="button" disabled={busy} aria-pressed={open} aria-label={d.label}
                        onClick={() => setEvPanel(open ? null : d.id)}
                        className="flex flex-col items-center gap-1 w-12 group">
                        <span className={`w-10 h-10 rounded-full flex items-center justify-center transition ${d.on ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 ring-1 ring-default-200 group-hover:ring-default-400"} ${open ? "ring-2 ring-neutral-900 ring-offset-2" : ""}`}>
                          <FontAwesomeIcon icon={d.icon} style={{ fontSize: 15 }} />
                        </span>
                        <span className={`text-[11px] leading-none ${open ? "text-neutral-900 font-medium" : "text-default-500"}`}>{d.label}</span>
                      </button>
                    </Tooltip>
                  );
                })}
              </div>

              {evPanel && (
                <div className="rounded-2xl bg-white ring-1 ring-default-200 px-4 py-3">
                  {evPanel === "brand" && (
                    <Select
                      aria-label={L("所屬品牌", "Brand")}
                      selectedKeys={evBrandId ? new Set([String(evBrandId)]) : new Set()}
                      onSelectionChange={(keys) => {
                        const v = Array.from(keys as Set<string>)[0];
                        setEvBrandId(v ? Number(v) : null);
                        setEvScope(UNDECIDED_SCOPE);   // 產品是跟著品牌的，換品牌就重選
                        setEvFiles([]); setEvFileNote(null);   // 檔案是用原品牌的權限讀的，換品牌就重傳
                      }}
                      placeholder={L("請選擇品牌", "Pick a brand")}
                      isRequired
                    >
                      {brandsList.map((x) => (
                        <SelectItem key={String(x.id)}>{x.name}</SelectItem>
                      ))}
                    </Select>
                  )}
                  {evPanel === "dates" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-default-700 block mb-1">{L("起始日", "Start date")}</label>
                        <Input type="date" value={evStart} onValueChange={setEvStart} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-default-700 block mb-1">{L("結束日", "End date")}</label>
                        <Input type="date" value={evEnd} onValueChange={setEvEnd} />
                      </div>
                    </div>
                  )}
                  {evPanel === "scope" && (evBrandId
                    ? <EventProductScopePicker products={evBrandProducts} value={evScope} onChange={setEvScope} en={en} isDisabled={busy} />
                    : <p className="text-tiny text-default-500">{L("先選品牌。", "Pick a brand first.")}</p>)}
                  {evPanel === "type" && (
                    <div className="space-y-3">
                      <div className="flex gap-1.5 flex-wrap">
                        {CAMPAIGN_TYPES.map((t) => (
                          <Chip key={t.id} size="sm" color="default"
                            className={`cursor-pointer ${evType === t.id ? "bg-foreground text-background" : ""}`}
                            variant={evType === t.id ? "solid" : "flat"} aria-pressed={evType === t.id}
                            onClick={() => { if (!busy) setEvType(evType === t.id ? "" : t.id); }}>
                            {en ? t.en : t.zh}
                          </Chip>
                        ))}
                      </div>
                      {evType === "offline" && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {([["venue", "地點", "Venue"], ["sessions", "場次", "Sessions"], ["signupUrl", "報名連結", "Sign-up URL"]] as const).map(([k, zh, e2]) => (
                            <div key={k}>
                              <label className="text-xs font-medium text-default-700 block mb-1">{en ? e2 : zh}</label>
                              <Input value={evOffline[k]} onValueChange={(v) => setEvOffline((o) => ({ ...o, [k]: v }))} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {evPanel === "channels" && (
                    <div className="flex gap-1.5 flex-wrap">
                      {CAMPAIGN_CHANNELS.filter((c) => CHANNEL_META[c]).map((c) => {
                        const on = evChannels.includes(c);
                        return (
                          <Chip key={c} size="sm" variant={on ? "solid" : "flat"} color="default" aria-pressed={on}
                            className={`cursor-pointer ${on ? "bg-foreground text-background" : ""}`}
                            startContent={<FontAwesomeIcon icon={CHANNEL_META[c]!.icon} className={`text-tiny ml-1 ${on ? "" : "text-default-500"}`} />}
                            onClick={() => { if (!busy) setEvChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])); }}>
                            {channelLabel(c, en)}
                          </Chip>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })()}

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
              (tab === "event"   && (!evName.trim() || !evBrandId || !!evUploading))
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
