/**
 * BrandSettingsSheet — right-side drawer for brand setup tasks that
 * shouldn't crowd the main 3-tile workspace.
 *
 * CJ direction (2026-05-07, Path A simplification):
 *   "我偏好 A，可以完全移除指令區。社群帳號連結放在設定。"
 *
 * Tabs (vertical):
 *   - 基本資料 (name / industry / description)
 *   - 連結 (website + social URLs — uses existing ConnectorEditor)
 *   - 視覺 (logo upload + colors — placeholder, full editor later)
 *   - AI 指令庫 (per-platform overrides — uses existing AIPromptsEditor)
 *   - 危險區 (delete brand)
 *
 * Opens via the gear icon top-right of Brand workspace header.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, ModalContent, Button, Input, Textarea, Spinner } from "@heroui/react";
import {
  Bot, Trash2, X, Share2, CheckCircle2, ExternalLink,
} from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebook, faInstagram, faLinkedin, faYoutube, faLine, faThreads, faTiktok } from "@fortawesome/free-brands-svg-icons";
import { faGlobe } from "@fortawesome/free-solid-svg-icons";
import AIPromptsEditor from "./AIPromptsEditor";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";

// 2026-05-30 (CJ「modal 只留設定類 tab，內容類交給主頁面」):
// 基本資料 和 視覺 都已在主工作區有完整 tab，不在 modal 重複。
// Modal = 設定齒輪 = 平台授權 / AI 指令 / 危險區 三項純設定。
type SettingsTab = "publish" | "ai" | "danger";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  brandId: number | null;
  brandName: string | null;
  /** Tab to land on when sheet opens. Defaults to "publish". */
  initialTab?: SettingsTab;
  /** Optional onboarding banner shown above active tab content. */
  onboardingHint?: string;
}

function getTabs(en: boolean): Array<{ id: SettingsTab; label: string; Icon: any }> {
  // 2026-05-30 (CJ「modal 只留設定類 tab」):
  // 基本資料 → 主工作區「基本資料」tab（InfoTab 已在 BrandsPage 直接嵌入）
  // 視覺 → 主工作區「視覺」tab（完整版視覺資產庫）
  // Modal = 純設定（外部連接 + AI 客製化 + 危險操作）
  return [
    { id: "publish", label: en ? "Platform auth" : "平台授權", Icon: Share2 },
    { id: "ai",      label: en ? "AI prompts"    : "AI 指令",  Icon: Bot    },
    { id: "danger",  label: en ? "Danger zone"   : "危險區",   Icon: Trash2 },
  ];
}

export default function BrandSettingsSheet({ isOpen, onClose, brandId, brandName, initialTab, onboardingHint }: Props) {
  const { lang } = useLang();
  const en = lang === "en";
  const TABS = getTabs(en);
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? "publish");
  // When a fresh initialTab arrives (e.g., onboarding triggers connector), reflect it.
  useEffect(() => {
    if (isOpen && initialTab) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      placement="top"
      size="5xl"
      scrollBehavior="inside"
      backdrop="blur"
      classNames={{
        base: "max-h-[90vh] my-4",
        body: "p-0",
      }}
    >
      <ModalContent>
        <div className="flex" style={{ minHeight: "70vh" }}>
          {/* Left rail — vertical tabs */}
          <div className="w-44 shrink-0 border-r border-default-100 bg-default-50/40 flex flex-col">
            <div className="px-4 py-4 border-b border-default-100">
              <div className="text-tiny text-default-500 font-medium uppercase tracking-wider">{en ? "Settings" : "設定"}</div>
              <div className="text-sm font-semibold text-default-900 truncate mt-0.5" title={brandName ?? ""}>{brandName ?? "—"}</div>
            </div>
            <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition text-left ${
                    activeTab === t.id
                      ? "bg-default-900 text-white"
                      : "text-default-700 hover:bg-default-100"
                  }`}
                >
                  <t.Icon size={14} strokeWidth={1.8} className="shrink-0" />
                  <span>{t.label}</span>
                </button>
              ))}
            </nav>
            <div className="px-2 py-3 border-t border-default-100">
              <Button variant="light" size="sm" onPress={onClose} startContent={<X size={13} />} className="w-full justify-start">
                {en ? "Close" : "關閉"}
              </Button>
            </div>
          </div>

          {/* Right pane — active tab */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {onboardingHint && (
              <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 text-sm text-amber-900 flex items-start gap-2">
                <span className="text-base">👋</span>
                <span className="leading-relaxed">{onboardingHint}</span>
              </div>
            )}
            {activeTab === "publish" && <PublishTab brandId={brandId} />}
            {activeTab === "ai" && <AIPromptsEditor brandId={brandId} />}
            {activeTab === "danger" && <DangerTab brandId={brandId} brandName={brandName} onClose={onClose} />}
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}

export function InfoTab({ brandId, brandName }: { brandId: number | null; brandName: string | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  return (
    <div className="max-w-[700px] mx-auto p-8">
      <h2 className="text-2xl font-semibold text-default-900 mb-2">{en ? "Basic info" : "基本資料"}</h2>
      <p className="text-sm text-default-500 mb-6">{en ? "Name / industry / description" : "名稱 / 產業 / 描述"}</p>

      {/* 2026-05-14 (CJ Solo pricing pivot): brand name is locked post-creation.
          The "1 brand per Solo subscription" boundary depends on the AI being
          trained on this specific brand's positioning + voice + knowledge.
          Allowing self-serve rename would let users effectively get 2 brands
          on one $100 subscription. To swap or rename, customer service runs
          a Reset-Brand admin tool that wipes positioning/knowledge/outputs. */}
      <div className="bg-default-50 rounded-xl border border-default-200 p-5">
        <div className="text-xs font-semibold uppercase tracking-widest text-default-500 mb-2">
          {en ? "BRAND NAME" : "品牌名稱"}
        </div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg font-semibold text-default-900">{brandName ?? "—"}</span>
          {/* Lock icon — uses inline SVG so we don't pull in another icon dep */}
          <span title={en ? "Locked — contact support to rename" : "已鎖定 · 需要改名請聯繫客服"} className="inline-flex">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-default-400">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </span>
        </div>
        <p className="text-xs text-default-500 leading-relaxed">
          {en ? (
            <>
              Brand name is locked after creation. The Solo plan covers <strong>one brand</strong> — the AI's
              voice + knowledge + positioning is trained on this specific name.{" "}
              <a href="mailto:sowork@sowork.ai?subject=Brand rename request" className="text-primary-600 hover:underline">
                Contact support
              </a>{" "}
              to rename or swap to a new brand (we'll reset positioning + knowledge + outputs).
            </>
          ) : (
            <>
              品牌名稱建立後不能自助修改。Solo 方案包含 <strong>一個品牌</strong> — AI 的語氣、知識、定位都是針對這個名字訓練的。
              {" "}
              <a href="mailto:sowork@sowork.ai?subject=品牌改名 / 換品牌申請" className="text-primary-600 hover:underline">
                聯繫客服
              </a>
              {" "}申請改名或換成新品牌（會清空目前的定位 / 知識 / 產出紀錄）。
            </>
          )}
        </p>
      </div>

      <BrandBasicEditor brandId={brandId} en={en} />
    </div>
  );
}

/**
 * Social URL fields config — mirrors ConnectorEditor but used inline in
 * the basic info tab so users don't need a separate "連結" screen.
 * 2026-05-30 (CJ「移除連結頁，合併到品牌編輯頁」)
 */
function getSocialFields(en: boolean): Array<{ key: string; label: string; icon: any; tone: string; placeholder: string }> {
  return [
    { key: "facebook",  label: en ? "Facebook Page" : "Facebook 粉專",  icon: faFacebook,  tone: "#1877F2", placeholder: "https://www.facebook.com/yourpage" },
    { key: "instagram", label: "Instagram",    icon: faInstagram, tone: "#E1306C", placeholder: "https://www.instagram.com/yourhandle" },
    { key: "youtube",   label: "YouTube",       icon: faYoutube,   tone: "#FF0000", placeholder: "https://www.youtube.com/@yourchannel" },
    { key: "threads",   label: "Threads",       icon: faThreads,   tone: "#111111", placeholder: "https://www.threads.net/@yourhandle" },
    { key: "tiktok",    label: "TikTok",        icon: faTiktok,    tone: "#111111", placeholder: "https://www.tiktok.com/@yourhandle" },
    { key: "linkedin",  label: "LinkedIn",      icon: faLinkedin,  tone: "#0A66C2", placeholder: "https://www.linkedin.com/company/yours" },
    { key: "line",      label: en ? "LINE Official" : "LINE 官方帳號", icon: faLine, tone: "#06C755", placeholder: en ? "https://lin.ee/xxxxx or @yourLineId" : "https://lin.ee/xxxxx 或 @yourLineId" },
  ];
}

/**
 * 2026-05-18 (CJ「他對 sowork.ai 認識不正確，又沒地方調整基本資料 + 讀錯
 * 無法重新校對」): editable basic data + hard-correctable AI positioning
 * summary + a 「重新分析」 button that re-reads the website/fanpage even
 * when positioning is locked.
 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-default-500 mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function BrandBasicEditor({ brandId, en }: { brandId: number | null; en: boolean }) {
  const SOCIAL_FIELDS = getSocialFields(en);

  // Brand data (industry / description / tagline / positioningSummary)
  const q = (trpc as any).brand?.get?.useQuery?.(
    { id: brandId ?? 0 },
    { enabled: !!brandId, refetchOnWindowFocus: false },
  );
  // Connections data (website + all social links)
  const connQ = (trpc as any).brand?.getConnections?.useQuery?.(
    { brandId: brandId ?? 0 },
    { enabled: !!brandId, refetchOnWindowFocus: false },
  );

  const updateM = (trpc as any).brand?.update?.useMutation?.({
    onSuccess: () => q?.refetch?.(),
  });
  const updateConnM = (trpc as any).brand?.updateConnections?.useMutation?.({
    onSuccess: () => connQ?.refetch?.(),
  });
  const recalM = (trpc as any).brand?.recalibrate?.useMutation?.({
    onSuccess: () => { q?.refetch?.(); connQ?.refetch?.(); },
  });

  // Basic fields
  const [industry,    setIndustry]    = useState("");
  const [description, setDescription] = useState("");
  const [tagline,     setTagline]     = useState("");
  const [positioning, setPositioning] = useState("");
  // URL fields
  const [website,     setWebsite]     = useState("");
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});

  const [savedAt,   setSavedAt]   = useState<number | null>(null);
  const [recalDone, setRecalDone] = useState(false);

  // Load brand basic data
  useEffect(() => {
    const b = q?.data;
    if (!b) return;
    setIndustry(b.industry ?? "");
    setDescription(b.description ?? "");
    setTagline(b.tagline ?? "");
    setPositioning(b.positioningSummary ?? "");
  }, [q?.data]);

  // Load connections (website + social links)
  useEffect(() => {
    const c = connQ?.data as { website?: string; socialLinks?: Record<string, string> } | null | undefined;
    if (!c) return;
    setWebsite(c.website ?? "");
    setSocialLinks(c.socialLinks ?? {});
  }, [connQ?.data]);

  const updateLink = (key: string, val: string) =>
    setSocialLinks((cur) => ({ ...cur, [key]: val }));

  async function handleSave() {
    if (!brandId) return;
    // Save basic brand data
    await updateM?.mutateAsync?.({ brandId, industry, description, tagline, positioningSummary: positioning });
    // Save connections (website + all social URLs)
    await updateConnM?.mutateAsync?.({ brandId, website: website.trim() || null, socialLinks });
    setSavedAt(Date.now());
  }

  async function handleRecalibrate() {
    if (!brandId) return;
    await handleSave();
    await recalM?.mutateAsync?.({ brandId });
    setRecalDone(true);
  }

  const isSaving = updateM?.isPending || updateConnM?.isPending;

  if (q?.isLoading) {
    return <div className="mt-4 flex justify-center"><Spinner size="sm" /></div>;
  }

  return (
    <div className="space-y-4 mt-4">
      {/* ── Brand info ──────────────────────────────────────────────────── */}
      <div className="bg-default-50 rounded-xl border border-default-200 p-5">
        <Field label={en ? "Industry" : "產業"}>
          <Input size="sm" value={industry} onChange={(e) => setIndustry(e.target.value)}
            placeholder={en ? "e.g. SaaS / F&B / retail" : "例：SaaS / 餐飲 / 零售"} />
        </Field>
        <Field label={en ? "What the brand does (used by the AI)" : "品牌在做什麼（AI 會用這段認識你）"}>
          <Textarea minRows={3} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder={en ? "One paragraph the AI should treat as ground truth about this brand." : "用一段話描述這個品牌——AI 會把這段當成關於你的事實依據。"} />
        </Field>
        <Field label={en ? "Tagline" : "品牌標語 Tagline"}>
          <Input size="sm" value={tagline} onChange={(e) => setTagline(e.target.value)} />
        </Field>
        <Field label={en ? "AI positioning summary — edit to hard-correct" : "AI 推導的定位摘要 — 可直接手改校正"}>
          <Textarea minRows={5} value={positioning} onChange={(e) => setPositioning(e.target.value)}
            placeholder={en ? "If the AI misunderstood the brand, correct it here. This text is injected into every task." : "如果 AI 對品牌的理解有誤，直接在這裡改正。這段會被注入到每一個任務。"} />
          <p className="text-tiny text-default-400 mt-1">
            {en ? "Injected into all 30s/60s/99s tasks as ground truth." : "會作為事實依據注入所有 30s/60s/99s 任務。"}
          </p>
        </Field>
      </div>

      {/* ── External links ──────────────────────────────────────────────── */}
      {/* 2026-05-30: merged from ConnectorEditor — website + 7 social URLs
          in one compact inline form. AI reads these URLs before every task. */}
      <div className="bg-default-50 rounded-xl border border-default-200 p-5">
        <div className="text-xs font-semibold uppercase tracking-widest text-default-500 mb-3">
          {en ? "External links — AI reads these before each task" : "外部連結 — AI 每次任務前都會讀取"}
        </div>
        {/* Website */}
        <div className="flex items-center gap-3 mb-3">
          <FontAwesomeIcon icon={faGlobe} style={{ color: "#64748B", fontSize: 16, width: 18 }} />
          <Input
            size="sm"
            label={en ? "Official website" : "官方網站"}
            placeholder="https://example.com"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
        {/* Social platforms — 2-column grid */}
        <div className="grid gap-2 sm:grid-cols-2">
          {SOCIAL_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center gap-2">
              <FontAwesomeIcon icon={f.icon} style={{ color: f.tone, fontSize: 16, width: 18, flexShrink: 0 }} />
              <Input
                size="sm"
                label={f.label}
                placeholder={f.placeholder}
                value={socialLinks[f.key] ?? ""}
                onChange={(e) => updateLink(f.key, e.target.value)}
              />
            </div>
          ))}
        </div>
        <p className="text-tiny text-default-400 mt-3 leading-relaxed">
          {en
            ? "Auto-fill, test scenarios, and all 30s/99s tasks pull real content from these URLs so output matches your actual brand voice — not a guess."
            : "AI 自動填寫、測試情境、所有 30s/99s 任務都會去抓這些連結的真實內容，讓產出貼合品牌語氣，而不是亂猜。"}
        </p>
      </div>

      {/* ── Save bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" color="primary" isLoading={isSaving}
          isDisabled={!brandId || isSaving} onPress={handleSave}>
          {en ? "Save" : "儲存"}
        </Button>
        <Button size="sm" variant="flat" color="secondary" isLoading={recalM?.isPending}
          isDisabled={!brandId || recalM?.isPending} onPress={handleRecalibrate}
          title={en ? "Re-reads the website / social pages and rebuilds the AI's understanding" : "重新讀取官網／社群頁，重建 AI 對品牌的理解"}>
          {en ? "Re-analyze (re-read site)" : "重新分析（重讀官網/社群）"}
        </Button>
        {savedAt && !isSaving && (
          <span className="text-tiny text-success-600">{en ? "Saved ✓" : "已儲存 ✓"}</span>
        )}
        {recalDone && !recalM?.isPending && (
          <span className="text-tiny text-secondary-600">
            {en ? "Re-analysis started — updates in background." : "已開始重新分析 — 會在背景更新品牌大腦"}
          </span>
        )}
      </div>
    </div>
  );
}

export function VisualTab({ brandId }: { brandId: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  // 2026-05-12 (CJ「視覺還在開發，請開發完成」): real implementation.
  // Logo URL + 3 brand colors + font hint + guidelines, all wired to
  // brand.updateVisual which also feeds image-gen as brandContext.
  const visualQ = (trpc as any).brand?.getVisual?.useQuery?.(
    { brandId: brandId ?? 0 },
    { enabled: !!brandId, refetchOnWindowFocus: false },
  );
  const updateM = (trpc as any).brand?.updateVisual?.useMutation?.({
    onSuccess: () => visualQ?.refetch?.(),
  });

  const [logoUrl,     setLogoUrl]     = useState("");
  const [primary,     setPrimary]     = useState("#000000");
  const [secondary,   setSecondary]   = useState("#ffffff");
  const [accent,      setAccent]      = useState("#7c3aed");
  const [fontFamily,  setFontFamily]  = useState("");
  const [guidelines,  setGuidelines]  = useState("");
  const [dirty,       setDirty]       = useState(false);

  useEffect(() => {
    const v = visualQ?.data;
    if (!v) return;
    setLogoUrl(v.logoUrl ?? "");
    setPrimary(v.primaryColor ?? "#000000");
    setSecondary(v.secondaryColor ?? "#ffffff");
    setAccent(v.accentColor ?? "#7c3aed");
    setFontFamily(v.fontFamily ?? "");
    setGuidelines(v.visualGuidelines ?? "");
    setDirty(false);
  }, [visualQ?.data]);

  const save = async () => {
    if (!brandId) return;
    try {
      await updateM?.mutateAsync?.({
        brandId,
        logoUrl: logoUrl.trim() || null,
        primaryColor:   primary,
        secondaryColor: secondary,
        accentColor:    accent,
        fontFamily:     fontFamily.trim() || null,
        visualGuidelines: guidelines.trim() || null,
      });
      setDirty(false);
    } catch (e: any) {
      alert(en ? `Save failed: ${e?.message ?? "Unknown error"}` : `儲存失敗：${e?.message ?? "未知錯誤"}`);
    }
  };

  const onChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setDirty(true);
  };

  if (visualQ?.isLoading) {
    return <div className="p-12 flex justify-center"><Spinner size="sm" /></div>;
  }

  return (
    <div className="max-w-[820px] mx-auto p-8">
      <h2 className="text-2xl font-semibold text-default-900 mb-2">{en ? "Visual identity" : "視覺識別"}</h2>
      <p className="text-sm text-default-500 mb-6">
        {en
          ? "Logo · palette · font · guidelines — AI applies these when generating images so output stays on-brand"
          : "Logo · 色票 · 字型 · 識別規範 — AI 生圖時會自動套用，確保不脫離品牌調性"}
      </p>

      {/* Logo */}
      <section className="border border-default-200 rounded-xl p-5 bg-white mb-4">
        <h3 className="text-sm font-semibold text-default-900 mb-3">Logo</h3>
        <div className="flex items-start gap-4">
          <div
            className="w-20 h-20 rounded-lg border border-default-200 bg-default-50 flex items-center justify-center overflow-hidden flex-shrink-0"
          >
            {logoUrl ? (
              <img src={logoUrl} alt="logo" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <span className="text-xs text-default-400">{en ? "No logo" : "無 logo"}</span>
            )}
          </div>
          <div className="flex-1">
            <Input
              size="sm"
              label="Logo URL"
              placeholder={en ? "https://example.com/logo.png or /static/..." : "https://example.com/logo.png 或 /static/..."}
              value={logoUrl}
              onValueChange={onChange(setLogoUrl)}
              description={en ? "Paste the logo URL (PNG / SVG / JPG). File upload coming soon." : "貼上 logo 的網址（PNG / SVG / JPG 都可）。檔案上傳功能稍後上線。"}
            />
          </div>
        </div>
      </section>

      {/* Colors */}
      <section className="border border-default-200 rounded-xl p-5 bg-white mb-4">
        <h3 className="text-sm font-semibold text-default-900 mb-3">{en ? "Palette (HEX)" : "色票（HEX）"}</h3>
        <p className="text-xs text-default-500 mb-4">
          {en
            ? "AI builds the visual foundation around these three colors. Tip: Primary = logo color / Secondary = complement / Accent = CTA button color."
            : "AI 生圖時會以這三色為主視覺基調。建議：主色 = logo 主色 / 副色 = 互補色 / 強調色 = CTA 按鈕用色。"}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: en ? "Primary"   : "主色",   val: primary,   setter: setPrimary },
            { label: en ? "Secondary" : "副色",   val: secondary, setter: setSecondary },
            { label: en ? "Accent"    : "強調色", val: accent,    setter: setAccent },
          ].map((c) => (
            <label key={c.label} className="flex items-center gap-3 p-3 border border-default-200 rounded-lg bg-default-50">
              <input
                type="color"
                value={c.val}
                onChange={(e) => { c.setter(e.target.value); setDirty(true); }}
                className="w-12 h-12 rounded cursor-pointer border-0 p-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-default-600 mb-0.5">{c.label}</div>
                <input
                  type="text"
                  value={c.val}
                  onChange={(e) => { c.setter(e.target.value); setDirty(true); }}
                  className="w-full text-sm font-mono bg-transparent border-0 p-0 focus:outline-none"
                />
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Font */}
      <section className="border border-default-200 rounded-xl p-5 bg-white mb-4">
        <h3 className="text-sm font-semibold text-default-900 mb-3">{en ? "Font" : "字型"}</h3>
        <Input
          size="sm"
          label={en ? "Primary font" : "主要字型"}
          placeholder={en ? "e.g. Noto Sans TC, sans-serif or Source Han Sans" : "例：Noto Sans TC, sans-serif 或 思源黑體"}
          value={fontFamily}
          onValueChange={onChange(setFontFamily)}
          description={en ? "CSS font-family. AI picks similar-styled fonts when drafting visuals." : "CSS font-family 寫法。AI 在生視覺草稿時會優先選擇相近風格的字型。"}
        />
        {fontFamily && (
          <div className="mt-3 p-3 bg-default-50 rounded-lg" style={{ fontFamily }}>
            <div className="text-tiny text-default-500 mb-1">{en ? "Preview:" : "預覽："}</div>
            <div className="text-lg text-default-900">{en ? "Preview ABC abc 123 — " : "中文預覽 ABC abc 123 — "}{fontFamily}</div>
          </div>
        )}
      </section>

      {/* Guidelines */}
      <section className="border border-default-200 rounded-xl p-5 bg-white mb-6">
        <h3 className="text-sm font-semibold text-default-900 mb-3">{en ? "Visual guidelines (free-form)" : "識別規範（自由填寫）"}</h3>
        <p className="text-xs text-default-500 mb-3">
          {en
            ? "Visual direction for AI image gen. e.g. \"Always natural light, avoid high contrast, no stacked text, Asian faces preferred.\""
            : "給 AI 生圖時的視覺指引。例：「永遠用自然光、避免高對比、不要用堆疊文字、人物以亞洲面孔為主」。"}
        </p>
        <textarea
          value={guidelines}
          onChange={(e) => { setGuidelines(e.target.value); setDirty(true); }}
          rows={6}
          placeholder={en
            ? "e.g.:&#10;- Natural light, avoid harsh studio lighting&#10;- Generous whitespace, subject left of center&#10;- Wood / cotton / linen natural materials&#10;- No emojis or stacked text overlays"
            : "例：&#10;- 自然光為主，避免棚拍硬光&#10;- 構圖留白多，主體偏左&#10;- 木材、棉麻等天然材質為主&#10;- 不要使用 emoji 或文字疊圖"}
          className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-default-500"
        />
      </section>

      {/* Save bar */}
      <div className="flex items-center gap-3">
        <Button
          color="primary"
          size="md"
          isDisabled={!dirty || !brandId}
          isLoading={updateM?.isPending}
          onPress={save}
        >
          {en ? "Save visual identity" : "儲存視覺識別"}
        </Button>
        {dirty && <span className="text-xs text-amber-600">{en ? "Unsaved changes" : "有未儲存的變更"}</span>}
        {!dirty && visualQ?.data && <span className="text-xs text-default-400">{en ? "Saved" : "已儲存"}</span>}
      </div>
    </div>
  );
}

/**
 * 2026-05-30 — PublishTab: Buffer-style platform connection grid.
 *
 * Shows all 4 platforms (Facebook, Instagram, LinkedIn, YouTube) as cards.
 * Each card shows connection status and a Connect / Disconnect button.
 *
 * Auth flow (all platforms) — Canva-style polling:
 *   1. Click "Connect [Platform]" → popup opens synchronously (keeps user gesture)
 *   2. Popup navigates to Pipedream Connect URL for that app
 *   3. Main page polls getConnectedPlatforms every 4s while popup is open
 *   4. When platform detected as connected → auto-complete (no confirm button needed)
 *
 * Brand-scoped: external_user_id = sowork-brand-{brandId}
 *   → All products under the same brand share one Pipedream account.
 *
 * Facebook additionally:
 *   - Auto-fetches page list via getFacebookPages when polling detects auth
 *   - User picks page from dropdown → auto-saves (no manual Page ID input)
 */
export function PublishTab({ brandId }: { brandId: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";

  // ── Queries ──────────────────────────────────────────────────────────
  const fbStatusQ = (trpc as any).publish?.getBrandFacebookStatus?.useQuery?.(
    { brandId: brandId ?? 0 },
    { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 15_000 },
  );
  const platformsQ = (trpc as any).publish?.getConnectedPlatforms?.useQuery?.(
    { brandId: brandId ?? 0 },
    { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 20_000 },
  );

  // ── Mutations ─────────────────────────────────────────────────────────
  const fbConnectUrlM  = (trpc as any).publish?.getFacebookConnectUrl?.useMutation?.();
  const fbPagesM       = (trpc as any).publish?.getFacebookPages?.useMutation?.();
  const setFbPageM     = (trpc as any).publish?.setBrandFacebookPage?.useMutation?.({
    onSuccess: () => { fbStatusQ?.refetch?.(); platformsQ?.refetch?.(); },
  });
  const unbindFbM      = (trpc as any).publish?.unbindBrandFacebook?.useMutation?.({
    onSuccess: () => { fbStatusQ?.refetch?.(); platformsQ?.refetch?.(); },
  });
  const getConnectTkM  = (trpc as any).platformConnect?.getConnectToken?.useMutation?.();

  // ── Refs for popup + polling ───────────────────────────────────────────
  const popupWindowRef = useRef<Window | null>(null);
  const pollTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Local state ───────────────────────────────────────────────────────
  // pendingPlatform — popup currently open for this platform key
  const [pendingPlatform, setPendingPlatform] = useState<string | null>(null);
  // fbPages — list of pages fetched after FB auth detected
  const [fbPages, setFbPages] = useState<Array<{ id: string; name: string; category: string }>>([]);
  const [fbPickerOpen, setFbPickerOpen] = useState(false);

  const fbStatus = fbStatusQ?.data;
  const fbConnected = !!fbStatus?.connected;
  const connectedMap: Record<string, { accountId: string; name?: string }> =
    (platformsQ?.data as any)?.connected ?? {};

  // ── Cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // ── Polling: auto-detect when OAuth completes ──────────────────────────
  function startPolling(platformKey: string) {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    let elapsed = 0;
    pollTimerRef.current = setInterval(async () => {
      elapsed += 4000;
      const popupClosed = !popupWindowRef.current || popupWindowRef.current.closed;
      // Stop after 5 minutes or when popup is closed by user
      if (elapsed >= 300_000 || popupClosed) {
        clearInterval(pollTimerRef.current!);
        pollTimerRef.current = null;
        setPendingPlatform(null);
        return;
      }
      try {
        const result = await platformsQ?.refetch?.();
        const connected: Record<string, any> = (result?.data as any)?.connected ?? {};
        if (connected[platformKey]) {
          // Platform detected — stop polling
          clearInterval(pollTimerRef.current!);
          pollTimerRef.current = null;
          setPendingPlatform(null);
          try { popupWindowRef.current?.close(); } catch { /* ignore cross-origin */ }
          // Facebook: fetch page list so user can pick which page to bind
          if (platformKey === "facebook" && brandId) {
            try {
              const pages = await fbPagesM?.mutateAsync?.({ brandId });
              if ((pages?.pages?.length ?? 0) > 0) {
                setFbPages(pages!.pages);
                setFbPickerOpen(true);
              } else {
                alert(en
                  ? "Authorized but no Facebook Pages found — ensure your account manages at least one Page."
                  : "授權成功，但此帳號沒有可管理的 FB 粉專");
              }
            } catch { /* page fetch failure is non-fatal; user can retry connect */ }
          }
          fbStatusQ?.refetch?.();
        }
      } catch { /* refetch errors are transient; keep polling */ }
    }, 4000);
  }

  // ── Platform config ────────────────────────────────────────────────────
  type PlatformCfg = {
    key: string;
    label: string;
    color: string;
    icon: any;
    desc: string;
  };
  const PLATFORMS: PlatformCfg[] = [
    { key: "facebook",  label: "Facebook",  color: "#1877F2", icon: faFacebook,  desc: en ? "Publish to your Facebook Page"               : "發布到 Facebook 粉專"        },
    { key: "instagram", label: "Instagram", color: "#E1306C", icon: faInstagram, desc: en ? "Publish to your Instagram Business account"    : "發布到 Instagram 商業帳號"   },
    { key: "linkedin",  label: "LinkedIn",  color: "#0A66C2", icon: faLinkedin,  desc: en ? "Publish to your LinkedIn profile or page"       : "發布到 LinkedIn 帳號或企業頁面" },
    { key: "youtube",   label: "YouTube",   color: "#FF0000", icon: faYoutube,   desc: en ? "Upload videos to your YouTube channel"          : "上傳影片到 YouTube 頻道"     },
  ];

  // ── Open OAuth popup ────────────────────────────────────────────────────
  async function openConnectPopup(platform: PlatformCfg) {
    if (!brandId) {
      alert(en ? "Please save the brand first." : "請先儲存品牌。");
      return;
    }
    const win = window.open("about:blank", "_blank", "popup,width=620,height=720");
    if (!win) {
      alert(en
        ? "Pop-up was blocked — allow pop-ups for this site and try again."
        : "授權視窗被封鎖 — 請允許本站的彈出視窗後再試一次。");
      return;
    }
    popupWindowRef.current = win;
    try {
      win.document.write(
        `<p style="font:14px sans-serif;padding:24px;color:#555">${en ? `Opening ${platform.label} authorization…` : `正在開啟 ${platform.label} 授權…`}</p>`,
      );
      let connectUrl: string;
      if (platform.key === "facebook") {
        const r = await fbConnectUrlM?.mutateAsync?.({ brandId });
        connectUrl = r?.connectUrl ?? "";
      } else {
        const r = await getConnectTkM?.mutateAsync?.({
          platform: platform.key as "instagram" | "linkedin" | "youtube",
          brandId,
        });
        connectUrl = r?.connectLinkUrl ?? "";
        if (!connectUrl && r?.token && r?.projectId) {
          connectUrl = `https://pipedream.com/_static/connect.html?token=${r.token}&app=${platform.key}`;
        }
      }
      if (!connectUrl) {
        win.close();
        alert(en ? "Couldn't get the connect URL — contact sowork@sowork.ai" : "無法取得授權連結");
        return;
      }
      win.location.href = connectUrl;
      // Popup is open — show "Waiting for authorization…" indicator and start polling
      setPendingPlatform(platform.key);
      startPolling(platform.key);
    } catch (e: any) {
      win.close();
      alert(en ? `Failed: ${e?.message ?? "Unknown error"}` : `失敗：${e?.message ?? "未知錯誤"}`);
    }
  }

  // ── Disconnect Facebook ─────────────────────────────────────────────────
  async function disconnectFacebook() {
    if (!brandId) return;
    if (!confirm(en
      ? "Disconnect Facebook from this brand? Published posts won't be deleted."
      : "確定要解除此品牌的 Facebook 綁定？已發出的貼文不受影響。")) return;
    try {
      await unbindFbM?.mutateAsync?.({ brandId });
      platformsQ?.refetch?.();
    } catch (e: any) {
      alert(en ? `Failed: ${e?.message ?? "Unknown"}` : `解除失敗：${e?.message ?? "未知錯誤"}`);
    }
  }

  return (
    <div className="max-w-[760px] mx-auto p-8">
      <h2 className="text-2xl font-semibold text-default-900 mb-1">{en ? "Platform connections" : "平台連接"}</h2>
      <p className="text-sm text-default-500 mb-6">
        {en
          ? "Connect your accounts once. OnBrand uses your authorization to publish content directly."
          : "一次授權，之後 OnBrand 用你的授權直接發布內容。"}
      </p>

      {/* Platform card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PLATFORMS.map((p) => {
          const pdConnected = !!connectedMap[p.key];
          // For Facebook, "connected" also means brand has a page binding
          const fullyConnected = p.key === "facebook" ? fbConnected : pdConnected;
          const isPending = pendingPlatform === p.key;
          const connectedAccount = connectedMap[p.key];

          return (
            <div
              key={p.key}
              className={[
                "rounded-xl p-4 flex flex-col gap-3 transition-colors",
                fullyConnected
                  ? "border-2 border-success-400 bg-success-50/20"
                  : "border-2 border-dashed border-default-300 bg-default-100/60",
              ].join(" ")}
            >
              {/* Card header */}
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: fullyConnected ? p.color + "22" : "#e5e5e5",
                    opacity: fullyConnected ? 1 : 0.75,
                  }}
                >
                  <FontAwesomeIcon icon={p.icon} style={{ color: fullyConnected ? p.color : "#9ca3af", fontSize: 18 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${fullyConnected ? "text-default-900" : "text-default-500"}`}>{p.label}</div>
                  <div className="text-xs text-default-400 truncate">{p.desc}</div>
                </div>
                {/* Connection status badge — always visible */}
                {fullyConnected ? (
                  <span className="flex items-center gap-1 text-[11px] text-success-700 bg-success-100 border border-success-300 px-2 py-0.5 rounded-full flex-shrink-0 font-medium">
                    <CheckCircle2 size={11} /> {en ? "Connected" : "已連接"}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-default-400 bg-white border border-default-200 px-2 py-0.5 rounded-full flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-default-300 flex-shrink-0" /> {en ? "Not connected" : "尚未連接"}
                  </span>
                )}
              </div>

              {/* Connected state: account name + last connected indicator */}
              {fullyConnected && (() => {
                const connectedAtRaw = p.key === "facebook" ? (fbStatus as any)?.connectedAt : null;
                const daysSince = connectedAtRaw
                  ? Math.floor((Date.now() - new Date(connectedAtRaw).getTime()) / 86_400_000)
                  : null;
                const isStale = daysSince !== null && daysSince > 60;
                return (
                  <div className={`text-xs rounded-lg px-3 py-2 ${isStale ? "bg-warning-50 text-warning-700" : "text-default-500 bg-default-50"}`}>
                    <div>
                      {p.key === "facebook" && fbStatus?.fbPageName && (
                        <span>{en ? "Page: " : "粉專："}<strong>{fbStatus.fbPageName}</strong></span>
                      )}
                      {p.key !== "facebook" && connectedAccount?.name && (
                        <span>{en ? "Account: " : "帳號："}<strong>{connectedAccount.name}</strong></span>
                      )}
                      {!((p.key === "facebook" && fbStatus?.fbPageName) || (p.key !== "facebook" && connectedAccount?.name)) && (
                        <span className={isStale ? "" : "text-default-400"}>{en ? "Authorization active" : "授權生效中"}</span>
                      )}
                    </div>
                    {daysSince !== null && (
                      <div className={`mt-0.5 text-[10px] ${isStale ? "text-warning-600 font-medium" : "text-default-400"}`}>
                        {isStale
                          ? (en ? `⚠ Connected ${daysSince}d ago — consider re-authorizing` : `⚠ 已連接 ${daysSince} 天，建議重新授權`)
                          : (en ? `Connected ${daysSince}d ago` : `已連接 ${daysSince} 天`)}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Waiting indicator — shown while popup is open (auto-polling) */}
              {isPending && (
                <div className="flex items-center gap-2 text-[12px] text-default-500 bg-default-50 rounded-lg px-3 py-2">
                  <span className="animate-spin text-primary">⟳</span>
                  {en
                    ? `Waiting for ${p.label} authorization — complete it in the popup…`
                    : `等待 ${p.label} 授權完成，請在彈出視窗中完成操作…`}
                </div>
              )}

              {/* Connect / Re-authorize button */}
              {!isPending && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    color={fullyConnected ? "default" : "primary"}
                    variant={fullyConnected ? "bordered" : "solid"}
                    startContent={<ExternalLink size={12} />}
                    isLoading={
                      (p.key === "facebook" ? fbConnectUrlM?.isPending : getConnectTkM?.isPending)
                    }
                    onPress={() => openConnectPopup(p)}
                    className="flex-1"
                  >
                    {fullyConnected
                      ? (en ? "Re-authorize" : "重新授權")
                      : (en ? `Connect ${p.label}` : `連接 ${p.label}`)}
                  </Button>
                  {/* Disconnect — only Facebook has DB binding to clear */}
                  {p.key === "facebook" && fbConnected && (
                    <Button
                      size="sm" variant="light" color="danger"
                      isLoading={unbindFbM?.isPending}
                      onPress={disconnectFacebook}
                    >
                      {en ? "Disconnect" : "解除"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Facebook page picker — shown after polling detects auth + pages fetched */}
      {fbPickerOpen && fbPages.length > 0 && (
        <div className="mt-5 border border-primary-200 rounded-xl p-4 bg-primary-50">
          <div className="text-sm font-semibold text-default-900 mb-3">
            {en ? "Which Facebook Page should this brand publish to?" : "這個品牌要發到哪個粉絲團？"}
          </div>
          <div className="space-y-2">
            {fbPages.map((page) => (
              <Button
                key={page.id} fullWidth variant="flat" color="primary" size="sm"
                isLoading={setFbPageM?.isPending}
                onPress={async () => {
                  try {
                    await setFbPageM?.mutateAsync?.({
                      brandId: brandId!,
                      fbPageId: page.id,
                      fbPageName: page.name,
                    });
                    setFbPickerOpen(false);
                    setFbPages([]);
                  } catch (e: any) {
                    alert(en ? `Failed: ${e?.message}` : `失敗：${e?.message}`);
                  }
                }}
              >
                <span className="text-left w-full truncate">
                  {page.name}{page.category ? ` · ${page.category}` : ""}
                </span>
              </Button>
            ))}
          </div>
          <Button
            size="sm" variant="light" fullWidth className="mt-2"
            onPress={() => { setFbPickerOpen(false); setFbPages([]); }}
          >
            {en ? "Cancel" : "取消"}
          </Button>
        </div>
      )}

      <p className="mt-5 text-xs text-default-400 leading-relaxed">
        {en
          ? "OnBrand never stores your passwords. OAuth tokens are managed by Pipedream, isolated per brand. To fully revoke access, go to each platform's app settings and remove Pipedream."
          : "OnBrand 不會儲存你的密碼。OAuth token 由 Pipedream 代管，每個品牌獨立。要徹底撤銷，請至各平台設定頁面移除 Pipedream 的存取權限。"}
      </p>
    </div>
  );
}

export function DangerTab({ brandId, brandName, onClose }: { brandId: number | null; brandName: string | null; onClose: () => void }) {
  const { lang } = useLang();
  const en = lang === "en";
  // onClose retained for API compatibility
  void onClose;
  return (
    <div className="max-w-[700px] mx-auto p-8">
      <h2 className="text-2xl font-semibold text-default-900 mb-2">{en ? "Danger zone" : "危險區"}</h2>
      <p className="text-sm text-default-500 mb-6">{en ? "Irreversible actions — proceed with care" : "不可逆操作 — 慎用"}</p>
      <div className="border-2 border-danger-300 rounded-xl p-5 bg-danger-50">
        <h3 className="font-semibold text-danger-800 mb-1.5">{en ? "Delete brand" : "刪除品牌"}</h3>
        <p className="text-sm text-default-700 mb-4">
          {en
            ? <>This permanently deletes "{brandName ?? brandId}" and all its positioning / copy / visual / knowledge data. Linked products and events will be orphaned. **This cannot be undone**.</>
            : <>這會永久刪除「{brandName ?? brandId}」及其所有定位 / 文字 / 視覺 / 知識資料。對應的產品、活動會變成孤兒。**此動作不可復原**。</>}
        </p>
        <Button color="danger" variant="bordered" isDisabled>
          {en ? "Delete (coming soon)" : "刪除（接下來會接上）"}
        </Button>
      </div>
    </div>
  );
}
