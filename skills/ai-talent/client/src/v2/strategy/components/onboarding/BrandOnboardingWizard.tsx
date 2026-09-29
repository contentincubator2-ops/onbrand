/**
 * BrandOnboardingWizard — first-time user guide.
 *
 * CJ direction (2026-05-08):
 *   "對於新手，要做 onboarding 的流程指引，引導新增品牌"
 *
 * Flow (4 steps with progress bar):
 *   1. 歡迎 — explain Marketing OS in 3 dots, set expectation.
 *   2. 建品牌 — name + industry + website + FB URL all in one form.
 *      The website + FB URL feed brandRealContent so AI 自動填寫
 *      and 試寫 work on the first try (no more 五感十築 → 美妝 hallucination).
 *   3. 自動定位中 — show 14-step pipeline progress, live agent rotate.
 *      User watches; on done auto-advances.
 *   4. 完成 — CTA: "看試寫" (jumps to test panel) or "去 /30s 開始".
 *
 * Auto-shown when user has 0 brands (replaces the simple empty state).
 */
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { logActivation } from "../../../platform/lib/activationTelemetry";
import { Modal, ModalContent, ModalBody, Button, Input, Textarea, Select, SelectItem, Autocomplete, AutocompleteItem } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrademark, faGlobe, faArrowRight, faCheck, faLanguage, faCubes } from "@fortawesome/free-solid-svg-icons";
import { faFacebook } from "@fortawesome/free-brands-svg-icons";
import RunningAgentCarousel from "../../../content/components/quickTask/RunningAgentCarousel";
// 2026-09-10 (CJ 市場收斂): 選單只列 14 個焦點市場；getCountry 仍讀完整
// COUNTRIES，舊資料的市場代號才不會變成空白。見 countries.ts marketOptions。
import { marketOptions, getCountry } from "../../../../lib/countries";
import { DoneIcon, WarningIcon, ErrorIcon } from "../../../platform/components/icons";
import { HelpTip } from "../../../platform/components/HelpTip";

const INDUSTRIES_ZH = [
  "AI / 科技軟體",
  "電商 / 零售",
  "美妝 / 保養",
  "餐飲 / 食品",
  "教育 / 培訓",
  "金融 / 保險",
  "醫療 / 健康",
  "媒體 / 娛樂",
  "製造 / 工業",
  "房地產 / 建設",
  "旅遊 / 飯店",
  "遊戲 / 娛樂社群",
  "非營利組織",
  "其他",
];

const INDUSTRIES_EN = [
  "AI / Tech",
  "E-commerce / Retail",
  "Beauty / Skincare",
  "Food & Beverage",
  "Education / Training",
  "Finance / Insurance",
  "Health / Medical",
  "Media / Entertainment",
  "Manufacturing",
  "Real Estate / Construction",
  "Travel / Hospitality",
  "Gaming / Community",
  "Nonprofit",
  "Other",
];

/**
 * 產品數量級距。與 server PRODUCT_COUNT_BANDS 同一組值（跨邊界不 import，
 * 值錯掉的話 zod enum 會直接擋下來，不會默默寫進一個無效級距）。
 *
 * 2026-09-10 (CJ「因為官網掃描的功能，持續不穩定，所以我還是偏好問產品數量」)
 * 問級距不需要爬任何東西，而且它決定的是方案推薦：products 額度基礎 0、
 * 專業 10，所以「11–30」這種答案本身就是一個升級訊號。
 */
const PRODUCT_BANDS: Array<{ code: string; zh: string; en: string }> = [
  { code: "none",   zh: "還沒有產品",   en: "No products yet" },
  { code: "1-3",    zh: "1–3 個",      en: "1-3" },
  { code: "4-10",   zh: "4–10 個",     en: "4-10" },
  { code: "11-30",  zh: "11–30 個",    en: "11-30" },
  { code: "31-100", zh: "31–100 個",   en: "31-100" },
  { code: "100+",   zh: "100 個以上",  en: "100+" },
];

/**
 * 抓取結果的顯示層級。直接對映 fetchProductMeta 的 meta.source ——
 * 不做美化，抓不到就說抓不到，讓使用者知道要手填。
 */
const SOURCE_BADGE: Record<string, { mark: ReactNode; zh: string; en: string; color: string }> = {
  jsonld: { mark: <DoneIcon size={12} />, zh: "已讀到商品資料",   en: "Product data read",  color: "#15803D" },
  og:     { mark: <DoneIcon size={12} />, zh: "已讀到頁面資料",   en: "Page data read",     color: "#15803D" },
  title:  { mark: <WarningIcon size={12} />, zh: "只讀到標題",       en: "Title only",         color: "#B45309" },
  none:   { mark: <ErrorIcon size={12} />, zh: "讀不到，請手動填", en: "Unreadable",         color: "#B91C1C" },
  unsafe: { mark: <ErrorIcon size={12} />, zh: "網址無法存取",     en: "URL not reachable",  color: "#B91C1C" },
};

interface ProductImportRow {
  url: string;
  source: string;
  readable: boolean;
  name?: string;
  price?: string;
  productId?: number;
  skipped?: string;
}

interface Props {
  isOpen: boolean;
  onClose?: () => void;
  /** Called once a brand is created + onboarding finishes. */
  onComplete: (brandId: number) => void;
}

type Step = 1 | 2 | 3 | 4;

export default function BrandOnboardingWizard({ isOpen, onClose, onComplete }: Props) {
  const navigate = useNavigate();
  const { lang } = useLang();
  const INDUSTRIES = lang === "en" ? INDUSTRIES_EN : INDUSTRIES_ZH;
  const STEPS: Array<{ n: Step; label: string }> = [
    { n: 1, label: lang === "en" ? "Welcome" : "歡迎" },
    { n: 2, label: lang === "en" ? "Add brand" : "建立品牌" },
    { n: 3, label: lang === "en" ? "Positioning" : "自動定位" },
    { n: 4, label: lang === "en" ? "Done" : "完成" },
  ];
  const [step, setStep] = useState<Step>(1);
  const [createdBrandId, setCreatedBrandId] = useState<number | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState<string>("");
  const [website, setWebsite] = useState("");
  const [fbUrl, setFbUrl] = useState("");
  // 2026-09-10 產品 intake。兩格都可以跳過 —— onboarding 每一步都要能繼續。
  const [productBand, setProductBand] = useState<string>("");
  const [productUrlsText, setProductUrlsText] = useState("");
  const [productImport, setProductImport] = useState<
    { state: "idle" } | { state: "running"; count: number }
    | { state: "done"; rows: ProductImportRow[]; created: number; pendingUpgrade: boolean }
  >({ state: "idle" });
  const [targetCountry, setTargetCountry] = useState<string>("TW");
  const [outputLanguage, setOutputLanguage] = useState<string>("zh-TW");
  const [err, setErr] = useState<string | null>(null);

  // When country changes, auto-populate the default language for that country
  const handleCountryChange = (code: string) => {
    setTargetCountry(code);
    const profile = getCountry(code);
    if (profile) setOutputLanguage(profile.languageCode);
  };

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setCreatedBrandId(null);
      setName(""); setIndustry(""); setWebsite(""); setFbUrl("");
      setProductBand(""); setProductUrlsText(""); setProductImport({ state: "idle" });
      setTargetCountry("TW"); setOutputLanguage("zh-TW"); setErr(null);
    }
  }, [isOpen]);

  const createBrandMut = (trpc as any).brand?.create?.useMutation?.();
  const updateConnMut = (trpc as any).brand?.updateConnections?.useMutation?.();
  const startPositioningMut = (trpc as any).positioningJobs?.start?.useMutation?.();
  const runInterimMut = (trpc as any).positioningJobs?.runInterim?.useMutation?.();
  const importProductsMut = (trpc as any).product?.importFromUrls?.useMutation?.();

  const handleCreateAndAdvance = async () => {
    if (!name.trim()) { setErr(lang === "en" ? "Brand name is required" : "請輸入品牌名稱"); return; }
    setErr(null);
    try {
      const r = await createBrandMut.mutateAsync({
        name: name.trim(),
        // 2026-07-19 (CJ 基本資料同步): the wizard collected industry but
        // never sent it — brands.industry stayed blank on the 基本資料頁.
        industry: industry.trim() || undefined,
        targetCountry: targetCountry || undefined,
        outputLanguage: outputLanguage || undefined,
      });
      const newId = Number(r?.id ?? r?.brandId ?? 0);
      if (!newId) { setErr(lang === "en" ? "Couldn't create — try again in a sec" : "建立失敗，請稍後再試"); return; }
      setCreatedBrandId(newId);
      // Activation funnel — stage 2
      logActivation("first_brand_created", { brandId: newId, industry: industry || null });

      // Save connector data (website + FB)
      const socialLinks: Record<string, string> = {};
      if (fbUrl.trim()) socialLinks.facebook = fbUrl.trim();
      if (website.trim() || Object.keys(socialLinks).length > 0) {
        try {
          await updateConnMut?.mutateAsync?.({
            brandId: newId,
            website: website.trim() || null,
            socialLinks,
          });
        } catch {/* non-fatal */}
      }

      // 2026-09-10 產品 intake。**刻意不 await** —— 最多 8 個網址 × 10 秒
      // timeout，await 會把 onboarding 卡在別人的站台上。結果回來時寫進
      // state，第 3 步的等待畫面順便把它顯示出來。
      const productUrls = productUrlsText
        .split(/[\n,\s]+/)
        .map((u) => u.trim())
        .filter(Boolean)
        .slice(0, 8);
      if (productUrls.length > 0 || productBand) {
        setProductImport(productUrls.length ? { state: "running", count: productUrls.length } : { state: "idle" });
        importProductsMut?.mutateAsync?.({
          brandId: newId,
          urls: productUrls,
          ...(productBand ? { countBand: productBand } : {}),
        })
          .then((res: any) => {
            if (!productUrls.length) return;
            setProductImport({
              state: "done",
              rows: (res?.results ?? []) as ProductImportRow[],
              created: Number(res?.created ?? 0),
              pendingUpgrade: !!res?.pendingUpgrade,
            });
          })
          .catch(() => {
            // 匯入失敗不該擋住定位 —— 使用者稍後可在產品頁重貼。
            setProductImport({ state: "idle" });
          });
      }

      // 2026-06-21 (CJ「TTFV from 38min」): activation refactor.
      //  Before: fire interim + start, then wait 9 min for `start` to finish
      //         before advancing the wizard. TTFV ~38 min.
      //  After:  AWAIT interim only (~30 sec express brain), fire start
      //         to run in background (~9 min, surfaces via Mia nudge when
      //         done), then route straight to /theater with firstTime=1
      //         so the user lands on the 7-day publisher with the AHA
      //         moment of 21 cards generated using the express brain.
      setStep(3); // "正在分析品牌..." waiting screen
      const interimStartMs = Date.now();
      try {
        await runInterimMut?.mutateAsync?.({ entityKind: "brand", entityId: newId });
        // Activation funnel — stage 3 (only fire on success path so the
        // metric reflects actual express-brain delivery, not just attempt).
        logActivation("express_brain_ready", {
          brandId: newId,
          interimLatencyMs: Date.now() - interimStartMs,
        });
      } catch (e) {
        // Interim failed — don't block; Theater can still run with whatever
        // exists (industry-level defaults). Log for telemetry.
        // eslint-disable-next-line no-console
        console.warn("[onboarding] runInterim failed (non-fatal):", e);
      }
      // Fire full pipeline in the background — completion surfaces via
      // Mia nudge (brand.positioning_complete fired by Theater polling).
      startPositioningMut?.mutate?.({ entityKind: "brand", entityId: newId, lang: "zh-TW" });

      // Hand control back to caller (sets scope + brandId) then jump to
      // Theater with the first-time flag so it knows to show the
      // oversized "Generate 7 days" CTA and progress banner.
      onComplete(newId);
      navigate(`/theater?firstTime=1&b=${newId}`);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  // Poll job status while in step 3; auto-advance when done
  const job = (trpc as any).positioningJobs?.getStatus?.useQuery?.(
    { entityKind: "brand", entityId: createdBrandId ?? 0 },
    { enabled: !!createdBrandId && step === 3, refetchInterval: 4_000 },
  );
  const jobData = job?.data as any;
  useEffect(() => {
    if (step !== 3 || !jobData) return;
    if (jobData.status === "done" || jobData.status === "failed") {
      setStep(4);
    }
  }, [step, jobData?.status]);

  const handleFinish = () => {
    if (createdBrandId) onComplete(createdBrandId);
  };


  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      hideCloseButton={step !== 1 && step !== 4}
      isDismissable={false}
      backdrop="blur"
      // 2026-07-07 (CJ「送出按鈕被切一半」— short laptop viewports):
      // scrollBehavior="inside" makes the body scroll within max-h instead
      // of clipping the bottom (CTA buttons) with no way to reach them.
      scrollBehavior="inside"
      classNames={{ base: "max-h-[90dvh]" }}
    >
      <ModalContent>
        <ModalBody className="p-0">
          {/* Progress bar */}
          <div className="px-6 pt-5 pb-3 border-b border-default-100">
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => {
                const isActive = s.n === step;
                const isDone = s.n < step;
                return (
                  <div key={s.n} className="flex items-center gap-2 flex-1">
                    <div
                      className={`flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-bold transition ${
                        isDone ? "bg-emerald-500 text-white"
                          : isActive ? "bg-zinc-600 text-white"
                          : "bg-default-100 text-default-400"
                      }`}
                    >
                      {isDone ? <FontAwesomeIcon icon={faCheck} className="text-[12px]" /> : s.n}
                    </div>
                    <span className={`text-xs ${isActive ? "font-semibold text-default-900" : "text-default-500"}`}>
                      {s.label}
                    </span>
                    {i < STEPS.length - 1 && (
                      <div className="flex-1 h-px bg-default-200 mx-1" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="px-6 py-6 min-h-[420px]">
            {/* STEP 1 — 歡迎 (2026-05-11: rewritten around SoWork brand
                positioning method — methodology becomes the headline, not
                tech specs). */}
            {step === 1 && (
              <div className="py-2">
                <h1 style={{
                  fontSize: 28, fontWeight: 700, color: "#171717",
                  lineHeight: 1.15, letterSpacing: "-0.015em",
                  marginBottom: 26, maxWidth: 520,
                }}>
                  {lang === "en" ? "Lock in your positioning first" : "先鎖定品牌定位"}
                </h1>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
                  {(lang === "en" ? [
                    { num: "01", label: "Add your brand", desc: "Name, site, FB — entry points so AI pulls real content" },
                    { num: "02", label: "Run the method", desc: "14-step deep dive: Golden Circle → Differentiation → Voice" },
                    { num: "03", label: "Auto-generate content", desc: "Singles / Packs / Campaigns" },
                  ] : [
                    { num: "01", label: "建立品牌", desc: "名稱、官網、FB — 給 AI 抓真實內容的入口" },
                    { num: "02", label: "套用定位法", desc: "14 步深度分析：黃金圈 → 差異化 → Voice" },
                    { num: "03", label: "內容自動產出", desc: "單篇 / 套組 / 企劃" },
                  ]).map((s, i, arr) => (
                    <div
                      key={s.num}
                      style={{
                        background: "#FFFFFF",
                        border: "1px solid #D4D4D4",
                        borderRadius: 8,
                        padding: "14px 14px 12px",
                        position: "relative",
                      }}
                    >
                      <p style={{
                        fontSize: 12, fontWeight: 700, color: "#525252",
                        letterSpacing: "0.22em", marginBottom: 6,
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        STEP {s.num}
                      </p>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#171717", marginBottom: 4 }}>
                        {s.label}
                      </p>
                      <p style={{
                        fontSize: 12.5, lineHeight: 1.55, color: "#525252",
                        fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
                      }}>
                        {s.desc}
                      </p>
                      {i < arr.length - 1 && (
                        <span aria-hidden style={{
                          position: "absolute", right: -10, top: "50%",
                          transform: "translateY(-50%)",
                          color: "#525252", fontSize: 14,
                        }}>→</span>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setStep(2)}
                  style={{
                    padding: "10px 18px",
                    fontSize: 13, fontWeight: 600,
                    letterSpacing: "0.04em",
                    borderRadius: 6, cursor: "pointer",
                    border: "1px solid #171717",
                    background: "#171717", color: "#FFFFFF",
                    display: "inline-flex", alignItems: "center", gap: 6,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#262626"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#171717"; }}
                >
                  {lang === "en" ? "Add your first brand" : "開始建立第一個品牌"}
                  <FontAwesomeIcon icon={faArrowRight} className="text-tiny" />
                </button>
                <p style={{ fontSize: 12, color: "#525252", marginTop: 10 }}>
                  {lang === "en" ? "About 2 minutes" : "預計 2 分鐘"}
                </p>
              </div>
            )}

            {/* STEP 2 — 建品牌 */}
            {step === 2 && (
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "#171717" }}
                  >
                    <FontAwesomeIcon icon={faTrademark} style={{ color: "white", fontSize: 16 }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold flex items-center gap-1.5">
                      {lang === "en" ? "Add your first brand" : "建立第一個品牌"}
                      <HelpTip>{lang === "en"
                        ? "Website + FB help a lot — AI reads real content to write more accurately about your brand"
                        : "官網 + FB 連結很重要 — AI 會抓真實內容當依據"}</HelpTip>
                    </h2>
                  </div>
                </div>

                <div className="space-y-3">
                  <Input
                    label={lang === "en" ? "Brand name" : "品牌名稱"}
                    placeholder={lang === "en"
                      ? "e.g. Lemo Wooden Toys / Pokémon GO Taiwan / adidas Taiwan"
                      : "例：五感十築 / Pokemon GO 台灣社群 / adidas Taiwan"}
                    value={name}
                    onValueChange={setName}
                    isRequired
                    autoFocus
                    description={lang === "en"
                      ? "We'll use this name to search for your brand data"
                      : "系統依此名稱搜尋品牌資料"}
                  />
                  <Select
                    label={lang === "en" ? "Industry (optional)" : "產業（可選）"}
                    placeholder={lang === "en" ? "Pick the closest fit" : "選一個最接近的"}
                    selectedKeys={industry ? [industry] : []}
                    onSelectionChange={(keys) => setIndustry(Array.from(keys)[0] as string ?? "")}
                  >
                    {INDUSTRIES.map((i) => <SelectItem key={i}>{i}</SelectItem>)}
                  </Select>

                  {/* ── Target market + output language (2026-05-21) ── */}
                  <div className="grid grid-cols-2 gap-3">
                    <Autocomplete
                      label={lang === "en" ? "Target market" : "目標市場"}
                      placeholder={lang === "en" ? "Search country…" : "搜尋國家…"}
                      defaultSelectedKey={targetCountry}
                      onSelectionChange={(key) => { if (key) handleCountryChange(String(key)); }}
                      description={lang === "en"
                        ? "AI adapts copy style and platforms"
                        : "AI 依市場調整文案風格與平台"}
                    >
                      {marketOptions(targetCountry).map((c) => (
                        <AutocompleteItem key={c.code} textValue={`${c.emoji} ${lang === "en" ? c.name : (c.nameZh ?? c.name)} (${c.code})`}>
                          <div className="flex items-center gap-2">
                            <span className="text-base">{c.emoji}</span>
                            <span className="text-sm">{lang === "en" ? c.name : (c.nameZh ?? c.name)}</span>
                            <span className="text-xs text-default-400 ml-auto">{c.code}</span>
                          </div>
                        </AutocompleteItem>
                      ))}
                    </Autocomplete>

                    <Select
                      label={lang === "en" ? "Output language" : "輸出語言"}
                      selectedKeys={outputLanguage ? [outputLanguage] : ["zh-TW"]}
                      onSelectionChange={(keys) => setOutputLanguage(Array.from(keys)[0] as string ?? "zh-TW")}
                      description={lang === "en"
                        ? "Language AI will write in"
                        : "AI 產出文案的語言"}
                      startContent={<FontAwesomeIcon icon={faLanguage} className="text-default-400 text-tiny" />}
                    >
                      {/* Common languages first, then auto-populated from selected country */}
                      {[
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
                        // auto-add target country's native language if not already listed
                        ...((() => {
                          const c = getCountry(targetCountry);
                          if (!c) return [];
                          const existing = ["zh-TW","zh-CN","en","en-US","en-GB","ja","ko","th","vi","id","ms","de","fr","es","pt","it","ru","ar","hi"];
                          if (existing.includes(c.languageCode)) return [];
                          return [{ code: c.languageCode, label: c.languageName }];
                        })()),
                      ].map((l) => <SelectItem key={l.code}>{l.label}</SelectItem>)}
                    </Select>
                  </div>

                  <Input
                    label={lang === "en" ? "Website (optional)" : "官網（可選）"}
                    placeholder="https://example.com"
                    value={website}
                    onValueChange={setWebsite}
                    startContent={<FontAwesomeIcon icon={faGlobe} className="text-default-400 text-tiny" />}
                  />
                  <Input
                    label={lang === "en" ? "Facebook page (optional)" : "Facebook 粉專（可選）"}
                    placeholder="https://www.facebook.com/yourpage"
                    value={fbUrl}
                    onValueChange={setFbUrl}
                    startContent={<FontAwesomeIcon icon={faFacebook} style={{ color: "#18181b" }} className="text-tiny" />}
                  />

                  {/* 2026-09-10 產品 intake。兩格都可空白 —— 跳過的代價寫在
                      description 裡，不藏在錯誤訊息裡。 */}
                  <Select
                    label={lang === "en" ? "How many products? (optional)" : "產品數量（可選）"}
                    selectedKeys={productBand ? [productBand] : []}
                    onSelectionChange={(keys) => setProductBand(String(Array.from(keys)[0] ?? ""))}
                    description={lang === "en"
                      ? "Used to recommend a plan — product positioning is on the Professional tier"
                      : "用來推薦方案 —— 產品定位屬於專業方案"}
                    startContent={<FontAwesomeIcon icon={faCubes} className="text-default-400 text-tiny" />}
                  >
                    {PRODUCT_BANDS.map((b) => (
                      <SelectItem key={b.code}>{lang === "en" ? b.en : b.zh}</SelectItem>
                    ))}
                  </Select>
                  <Textarea
                    label={lang === "en" ? "Priority product pages (optional)" : "優先設定的產品網址（可選）"}
                    placeholder={lang === "en"
                      ? "One product page URL per line, up to 8"
                      : "一行一個商品頁網址，最多 8 個"}
                    value={productUrlsText}
                    onValueChange={setProductUrlsText}
                    minRows={2}
                    maxRows={5}
                    description={lang === "en"
                      ? "We read each page directly (no site-wide crawl) and tell you exactly what we got"
                      : "我們逐頁讀取（不做全站掃描），並明確告訴你每一頁讀到什麼"}
                  />
                </div>

                {err && <div className="mt-3 text-sm text-danger"><WarningIcon size={13} /> {err}</div>}

                <div className="mt-5 flex items-center justify-between gap-2">
                  <Button variant="light" onPress={() => setStep(1)}>{lang === "en" ? "← Back" : "← 上一步"}</Button>
                  <Button
                    color="primary"
                    onPress={handleCreateAndAdvance}
                    isLoading={createBrandMut?.isPending}
                    endContent={!createBrandMut?.isPending && <FontAwesomeIcon icon={faArrowRight} className="text-tiny" />}
                    className="font-semibold"
                    style={{ background: "#171717" }}
                  >
                    {lang === "en" ? "Create & start positioning" : "建立並開始定位"}
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3 — Express Brain 分析中（~30s）
                2026-06-21 (CJ「TTFV from 38min」): collapsed from "wait
                9 min for full pipeline" to "wait ~30 sec for express brain
                then auto-redirect to Theater". Background full pipeline
                still runs; user sees it as a banner inside Theater. */}
            {step === 3 && (
              <div>
                <div className="mb-3">
                  <p style={{
                    fontSize: 12, fontWeight: 600, color: "#404040",
                    letterSpacing: "0.28em", textTransform: "uppercase",
                    marginBottom: 6,
                  }}>
                    {lang === "en" ? "Express Brain · ~30 sec" : "品牌大腦初版 · 約 30 秒"}
                  </p>
                  <h2 style={{
                    fontSize: 22, fontWeight: 700, color: "#171717",
                    letterSpacing: "-0.01em", marginBottom: 8,
                  }}>
                    {lang === "en"
                      ? "Reading your website + Facebook…"
                      : "正在讀你的官網 + Facebook…"}
                    <span style={{ marginLeft: 6, verticalAlign: "middle" }}>
                      <HelpTip>
                        {lang === "en"
                          ? "The full 14-step SoWork positioning keeps running in the background (~9 min); you'll be notified when it's ready."
                          : "完整的 14 步 SoWork 定位會在背景繼續跑（約 9 分鐘），完成後會通知你。"}
                      </HelpTip>
                    </span>
                  </h2>
                </div>

                <RunningAgentCarousel
                  agents={lang === "en" ? [
                    { name: "Mia", title: "Customer Success", role: "Reading website + FB" },
                    { name: "Aiden Hsu", title: "Brand Voice", role: "Extracting tone" },
                    { name: "Mandy Cheng", title: "Strategist", role: "Quick USP draft" },
                  ] : [
                    { name: "Mia", title: "客戶成功", role: "讀取官網 + FB" },
                    { name: "Aiden Hsu", title: "品牌聲音", role: "萃取調性" },
                    { name: "Mandy Cheng", title: "策略師", role: "獨家賣點初稿" },
                  ]}
                  stages={null}
                  accentColor="#18181b"
                  progressPct={50}
                  elapsedText={lang === "en" ? "Building express brain…" : "建立品牌大腦初版中…"}
                />

                {/* 2026-09-10 產品讀取結果。顯示 fetchProductMeta 的層級，
                    不美化 —— 讀不到就寫讀不到，使用者才知道要手填。 */}
                {productImport.state !== "idle" && (
                  <div style={{ marginTop: 18, borderTop: "1px solid #E5E5E5", paddingTop: 14 }}>
                    <p style={{
                      fontSize: 12, fontWeight: 700, color: "#525252",
                      letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10,
                    }}>
                      {lang === "en" ? "Product pages" : "產品網址讀取"}
                    </p>
                    {productImport.state === "running" && (
                      <p style={{ fontSize: 13, color: "#525252" }}>
                        {lang === "en"
                          ? `Reading ${productImport.count} product page(s)…`
                          : `正在讀取 ${productImport.count} 個商品頁…`}
                      </p>
                    )}
                    {productImport.state === "done" && (
                      <>
                        {productImport.rows.map((r) => {
                          const badge = SOURCE_BADGE[r.source] ?? SOURCE_BADGE.none;
                          return (
                            <div key={r.url} style={{
                              display: "flex", alignItems: "baseline", gap: 8,
                              fontSize: 13, lineHeight: 1.7, color: "#404040",
                            }}>
                              <span style={{ color: badge.color, fontWeight: 700 }}>{badge.mark}</span>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontWeight: 600 }}>
                                  {r.name || r.url.replace(/^https?:\/\//, "").slice(0, 44)}
                                </span>
                                {r.price ? <span style={{ color: "#525252" }}> · {r.price}</span> : null}
                              </span>
                              <span style={{ fontSize: 12, color: badge.color, whiteSpace: "nowrap" }}>
                                {lang === "en" ? badge.en : badge.zh}
                              </span>
                            </div>
                          );
                        })}
                        {productImport.pendingUpgrade && (
                          <p style={{ fontSize: 12, color: "#B45309", marginTop: 8, lineHeight: 1.6 }}>
                            {lang === "en"
                              ? "Saved for you — product positioning is on the Professional tier, so these import the moment you upgrade."
                              : "已替你存下來 —— 產品定位屬於專業方案，升級後這幾個會直接匯入。"}
                          </p>
                        )}
                        {!productImport.pendingUpgrade && productImport.created > 0 && (
                          <p style={{ fontSize: 12, color: "#525252", marginTop: 8 }}>
                            {lang === "en"
                              ? `${productImport.created} product(s) created.`
                              : `已建立 ${productImport.created} 個產品。`}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* STEP 4 — 完成 */}
            {step === 4 && (
              <div className="py-2">
                <h1 style={{
                  fontSize: 26, fontWeight: 700, color: "#171717",
                  lineHeight: 1.2, letterSpacing: "-0.015em",
                  marginBottom: 12, maxWidth: 540,
                }}>
                  {lang === "en"
                    ? "Your brand is ready"
                    : "你的品牌已備好"}
                </h1>
                <p style={{
                  fontSize: 13.5, lineHeight: 1.75, color: "#404040",
                  maxWidth: 580, marginBottom: 24,
                }}>
                  {jobData?.status === "done"
                    ? null
                    : (lang === "en"
                      ? "Full positioning still running in the background (we'll ping you bottom-left). You can head to the workspace to watch the 10 steps live, or jump in with the interim positioning and write your first post."
                      : "完整定位仍在背景跑（左下會通知）— 你可以先到工作區看 10 步即時推理，或直接用臨時定位開始試寫第一篇。")}
                </p>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                  <button
                    onClick={() => {
                      navigate(createdBrandId ? `/tasks/fb?b=${createdBrandId}` : "/tasks/fb");
                      handleFinish();
                    }}
                    style={{
                      padding: "10px 16px", fontSize: 13, fontWeight: 600,
                      letterSpacing: "0.04em", borderRadius: 6, cursor: "pointer",
                      border: "1px solid #171717",
                      background: "#171717", color: "#FFFFFF",
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}
                  >
                    {lang === "en" ? "Start creating" : "開始創作"} <FontAwesomeIcon icon={faArrowRight} className="text-tiny" />
                  </button>
                  <button
                    onClick={() => {
                      if (createdBrandId) navigate(`/brands?b=${createdBrandId}`);
                      handleFinish();
                    }}
                    style={{
                      padding: "10px 16px", fontSize: 13, fontWeight: 600,
                      letterSpacing: "0.04em", borderRadius: 6, cursor: "pointer",
                      border: "1px solid #D4D4D4",
                      background: "#FFFFFF", color: "#525252",
                    }}
                  >
                    {lang === "en" ? "Back to brand workspace" : "回品牌工作區"}
                  </button>
                </div>
                <p style={{ fontSize: 12, color: "#525252", marginBottom: 20 }}>
                  {lang === "en"
                    ? "You can re-run the SoWork Brand Method anytime from Brand → Settings"
                    : "日後可隨時在「品牌 → 設定」重新跑 SoWork 品牌定位法"}
                </p>

                {/* 2026-05-14 (CJ「Onboarding 加一題」): nudge plan choice based on
                    brand-count intent. Pure nudge — no auto-subscribe, just a
                    soft pricing recommendation. */}
                <div style={{
                  borderTop: "1px solid #E5E5E5",
                  paddingTop: 16,
                }}>
                  <p style={{
                    fontSize: 12, fontWeight: 700, color: "#525252",
                    letterSpacing: "0.22em", textTransform: "uppercase",
                    marginBottom: 10,
                  }}>
                    {lang === "en" ? "Pick your plan" : "選擇你的方案"}
                  </p>
                  <p style={{ fontSize: 13, color: "#404040", marginBottom: 12, lineHeight: 1.6 }}>
                    {lang === "en" ? "Both self-serve plans cover 1 brand. More brands or internal customisation is the enterprise track." : "兩個自助方案都是 1 個品牌；需要多品牌或內部客製，走企業客製版。"}
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => navigate("/pricing")}
                      style={{
                        padding: "8px 14px", fontSize: 12, fontWeight: 600,
                        borderRadius: 6, cursor: "pointer",
                        border: "1px solid #D4D4D4",
                        background: "#FFFFFF", color: "#171717",
                      }}
                    >
                      {lang === "en" ? "Basic → NT$2,250 / mo · 2 seats" : "基礎 → NT$2,250／月 · 2 席"}
                    </button>
                    <button
                      onClick={() => navigate("/pricing")}
                      style={{
                        padding: "8px 14px", fontSize: 12, fontWeight: 600,
                        borderRadius: 6, cursor: "pointer",
                        border: "1px solid #171717",
                        background: "#171717", color: "#FFFFFF",
                      }}
                    >
                      {lang === "en" ? "Professional → NT$9,000 / mo · 5 seats" : "專業 → NT$9,000／月 · 5 席"}
                    </button>
                    <a
                      href="mailto:sowork@sowork.ai?subject=企業客製版洽詢"
                      style={{
                        padding: "8px 14px", fontSize: 12, fontWeight: 600,
                        borderRadius: 6, cursor: "pointer",
                        border: "1px solid #D4D4D4",
                        background: "#FFFFFF", color: "#171717",
                        textDecoration: "none",
                        display: "inline-flex", alignItems: "center",
                      }}
                    >
                      {lang === "en" ? "Multiple brands → Enterprise, contact us" : "多品牌／客製 → 企業客製版，聯繫我們"}
                    </a>
                  </div>
                  <p style={{ fontSize: 12, color: "#737373", marginTop: 8, fontStyle: "italic" }}>
                    {lang === "en"
                      ? "Cancel anytime — keep access until the current period ends."
                      : "隨時可取消 — 當期結束前皆可正常使用。"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
