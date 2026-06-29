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
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { logActivation } from "../../lib/activationTelemetry";
import { Modal, ModalContent, ModalBody, Button, Input, Select, SelectItem, Autocomplete, AutocompleteItem } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrademark, faGlobe, faArrowRight, faCheck, faWandMagicSparkles, faLanguage } from "@fortawesome/free-solid-svg-icons";
import { faFacebook } from "@fortawesome/free-brands-svg-icons";
import RunningAgentCarousel from "../quickTask/RunningAgentCarousel";
import { COUNTRIES, getCountry } from "../../../lib/countries";

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
      setTargetCountry("TW"); setOutputLanguage("zh-TW"); setErr(null);
    }
  }, [isOpen]);

  const createBrandMut = (trpc as any).brand?.create?.useMutation?.();
  const updateConnMut = (trpc as any).brand?.updateConnections?.useMutation?.();
  const startPositioningMut = (trpc as any).positioningJobs?.start?.useMutation?.();
  const runInterimMut = (trpc as any).positioningJobs?.runInterim?.useMutation?.();

  const handleCreateAndAdvance = async () => {
    if (!name.trim()) { setErr(lang === "en" ? "Brand name is required" : "請輸入品牌名稱"); return; }
    setErr(null);
    try {
      const r = await createBrandMut.mutateAsync({
        name: name.trim(),
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

  const handleSkipToFinish = () => setStep(4);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      hideCloseButton={step !== 1 && step !== 4}
      isDismissable={false}
      backdrop="blur"
      classNames={{ base: "max-h-[90vh]" }}
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
                      className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition ${
                        isDone ? "bg-emerald-500 text-white"
                          : isActive ? "bg-violet-600 text-white"
                          : "bg-default-100 text-default-400"
                      }`}
                    >
                      {isDone ? <FontAwesomeIcon icon={faCheck} className="text-[9px]" /> : s.n}
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
                <p style={{
                  fontSize: 10, fontWeight: 600, color: "#404040",
                  letterSpacing: "0.28em", textTransform: "uppercase",
                  marginBottom: 12,
                }}>
                  Welcome · SoWork Brand Method
                </p>
                <h1 style={{
                  fontSize: 28, fontWeight: 700, color: "#171717",
                  lineHeight: 1.15, letterSpacing: "-0.015em",
                  marginBottom: 14, maxWidth: 520,
                }}>
                  {lang === "en"
                    ? "Lock in who you are first — then AI knows what every post should say"
                    : "先鎖定你是誰，AI 才知道每篇文章要說什麼"}
                </h1>
                <p style={{
                  fontSize: 14, lineHeight: 1.75, color: "#404040",
                  fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
                  maxWidth: 580, marginBottom: 26,
                }}>
                  {lang === "en" ? (
                    <>OnBrand isn't another "one-click AI generator" — we turned the
                      <strong style={{ fontFamily: "system-ui", fontWeight: 600, color: "#171717" }}> SoWork Brand Positioning Method</strong>
                      {" "}into an actionable 14-step flow. AI reads your WHY, TA, and differentiation before every post. Lock it once — every channel stays on tone.</>
                  ) : (
                    <>OnBrand 不是另一個「AI 一鍵生成」工具 — 我們把
                      <strong style={{ fontFamily: "system-ui", fontWeight: 600, color: "#171717" }}> SoWork 品牌定位法</strong>
                      做成可執行的 14 步流程，讓 AI 在每篇貼文之前，先讀懂你的 WHY、TA、差異化。鎖定一次，所有平台都跟著你的調性走。</>
                  )}
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
                  {(lang === "en" ? [
                    { num: "01", label: "Add your brand", desc: "Name, site, FB — entry points so AI pulls real content" },
                    { num: "02", label: "Run the method", desc: "14-step deep dive: Golden Circle → Differentiation → Voice" },
                    { num: "03", label: "Auto-generate content", desc: "30s Single / 60s Pack / 99s Slate" },
                  ] : [
                    { num: "01", label: "建立品牌", desc: "名稱、官網、FB — 給 AI 抓真實內容的入口" },
                    { num: "02", label: "套用定位法", desc: "14 步深度分析：黃金圈 → 差異化 → Voice" },
                    { num: "03", label: "內容自動產出", desc: "30s 單品 / 60s 套組 / 99s 檔期" },
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
                        fontSize: 9, fontWeight: 700, color: "#525252",
                        letterSpacing: "0.22em", marginBottom: 6,
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        STEP {s.num}
                      </p>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#171717", marginBottom: 4 }}>
                        {s.label}
                      </p>
                      <p style={{
                        fontSize: 11.5, lineHeight: 1.55, color: "#525252",
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
                <p style={{ fontSize: 11, color: "#525252", marginTop: 10 }}>
                  {lang === "en"
                    ? "About 2 minutes · once finished, AI is ready to write for your brand"
                    : "預計 2 分鐘 · 完成後 AI 已備好可以為你寫內容"}
                </p>
              </div>
            )}

            {/* STEP 2 — 建品牌 */}
            {step === 2 && (
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #00b4bc, #7c3aed)" }}
                  >
                    <FontAwesomeIcon icon={faTrademark} style={{ color: "white", fontSize: 16 }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">{lang === "en" ? "Add your first brand" : "建立第一個品牌"}</h2>
                    <p className="text-xs text-default-500">{lang === "en"
                      ? "Website + FB help a lot — AI reads real content to write more accurately about your brand"
                      : "官網 + FB 連結很重要 — AI 會抓真實內容做 ground"}</p>
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
                      {COUNTRIES.map((c) => (
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
                    startContent={<FontAwesomeIcon icon={faFacebook} style={{ color: "#1877F2" }} className="text-tiny" />}
                  />
                </div>

                {err && <div className="mt-3 text-sm text-danger">⚠ {err}</div>}

                <div className="mt-5 flex items-center justify-between gap-2">
                  <Button variant="light" onPress={() => setStep(1)}>{lang === "en" ? "← Back" : "← 上一步"}</Button>
                  <Button
                    color="primary"
                    onPress={handleCreateAndAdvance}
                    isLoading={createBrandMut?.isPending}
                    endContent={!createBrandMut?.isPending && <FontAwesomeIcon icon={faArrowRight} className="text-tiny" />}
                    className="font-semibold"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #6366F1)" }}
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
                    fontSize: 10, fontWeight: 600, color: "#404040",
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
                  </h2>
                  <p style={{
                    fontSize: 13.5, lineHeight: 1.75, color: "#525252",
                    fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
                    maxWidth: 540,
                  }}>
                    {lang === "en"
                      ? "Building a quick Brand Brain so you can generate your first week of content in ~3 minutes. The full 14-step SoWork positioning will keep running in the background — Mia will ping you when it's ready (~9 min)."
                      : "正在建立品牌大腦初版，讓你 3 分鐘內就能看到第一週內容。完整的 14 步 SoWork 定位會在背景繼續跑（約 9 分鐘），完成後 Mia 會通知你。"}
                  </p>
                </div>

                <RunningAgentCarousel
                  agents={lang === "en" ? [
                    { name: "Mia", title: "Customer Success", role: "Reading website + FB" },
                    { name: "Aiden Hsu", title: "Brand Voice", role: "Extracting tone" },
                    { name: "Mandy Cheng", title: "Strategist", role: "Quick USP draft" },
                  ] : [
                    { name: "Mia", title: "客戶成功", role: "讀取官網 + FB" },
                    { name: "Aiden Hsu", title: "品牌聲音", role: "萃取調性" },
                    { name: "Mandy Cheng", title: "策略師", role: "USP 初稿" },
                  ]}
                  stages={null}
                  accentColor="#E85D2E"
                  progressPct={50}
                  elapsedText={lang === "en" ? "Building express brain…" : "建立品牌大腦初版中…"}
                />
              </div>
            )}

            {/* STEP 4 — 完成 */}
            {step === 4 && (
              <div className="py-2">
                <p style={{
                  fontSize: 10, fontWeight: 600, color: "#404040",
                  letterSpacing: "0.28em", textTransform: "uppercase",
                  marginBottom: 12,
                }}>
                  Positioning Locked · Ready for Production
                </p>
                <h1 style={{
                  fontSize: 26, fontWeight: 700, color: "#171717",
                  lineHeight: 1.2, letterSpacing: "-0.015em",
                  marginBottom: 12, maxWidth: 540,
                }}>
                  {lang === "en"
                    ? "Your brand's locked in — AI knows what every post should say"
                    : "你的品牌已備好，AI 知道每篇文章該說什麼了"}
                </h1>
                <p style={{
                  fontSize: 13.5, lineHeight: 1.75, color: "#404040",
                  fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
                  maxWidth: 580, marginBottom: 24,
                }}>
                  {jobData?.status === "done"
                    ? (lang === "en"
                      ? "All 10 sections are done — Golden Circle, target audience, differentiation, and Voice are written to your Brand DNA. From here on, every 30s / 60s / 99s / 7-Day Publisher post uses this as its backbone."
                      : "10 個段落全部完成 — 黃金圈、目標受眾、差異化、Voice 已寫入品牌大腦。從現在起 30s / 60s / 99s / 七日發布台 的每一篇內容都會以此為骨架產出。")
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
                <p style={{ fontSize: 11, color: "#525252", marginBottom: 20 }}>
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
                    fontSize: 10, fontWeight: 700, color: "#525252",
                    letterSpacing: "0.22em", textTransform: "uppercase",
                    marginBottom: 10,
                  }}>
                    {lang === "en" ? "Pick your plan" : "選擇你的方案"}
                  </p>
                  <p style={{ fontSize: 13, color: "#404040", marginBottom: 12, lineHeight: 1.6 }}>
                    {lang === "en" ? "How many brands will you manage on OnBrand?" : "你計畫在 OnBrand 管理幾個品牌？"}
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => navigate("/pricing?recommend=solo")}
                      style={{
                        padding: "8px 14px", fontSize: 12, fontWeight: 600,
                        borderRadius: 6, cursor: "pointer",
                        border: "1px solid #D4D4D4",
                        background: "#FFFFFF", color: "#171717",
                      }}
                    >
                      {lang === "en" ? "Just 1 → Solo $100/mo" : "就 1 個 → Solo NT$3,000/月"}
                    </button>
                    <a
                      href="mailto:sowork@sowork.ai?subject=多品牌方案洽詢"
                      style={{
                        padding: "8px 14px", fontSize: 12, fontWeight: 600,
                        borderRadius: 6, cursor: "pointer",
                        border: "1px solid #D4D4D4",
                        background: "#FFFFFF", color: "#171717",
                        textDecoration: "none",
                        display: "inline-flex", alignItems: "center",
                      }}
                    >
                      {lang === "en" ? "2–3 brands → Contact us" : "2–3 個品牌 → 聯繫我們"}
                    </a>
                    <a
                      href="mailto:sowork@sowork.ai?subject=Agency 方案洽詢"
                      style={{
                        padding: "8px 14px", fontSize: 12, fontWeight: 600,
                        borderRadius: 6, cursor: "pointer",
                        border: "1px solid #D4D4D4",
                        background: "#FFFFFF", color: "#171717",
                        textDecoration: "none",
                        display: "inline-flex", alignItems: "center",
                      }}
                    >
                      {lang === "en" ? "4+ → Contact sales" : "4 個以上 → 聯繫業務"}
                    </a>
                  </div>
                  <p style={{ fontSize: 11, color: "#737373", marginTop: 8, fontStyle: "italic" }}>
                    {lang === "en"
                      ? "Early-bird locked forever — sign up today, your price never goes up."
                      : "早鳥永久保價 — 今天訂閱、之後不漲。"}
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
