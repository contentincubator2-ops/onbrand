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
 *   - 危險區 (delete brand)
 *
 * Opens via the gear icon top-right of Brand workspace header.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, ModalContent, Button, Input, Textarea, Spinner } from "@heroui/react";
import { CloseIcon, DeleteIcon, DoneIcon, ExternalIcon, ShareIcon, InfoIcon, CheckIcon, WarningIcon } from "../../../platform/components/icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebook, faInstagram, faLinkedin, faYoutube, faLine, faThreads, faTiktok } from "@fortawesome/free-brands-svg-icons";
import { faGlobe } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { useNavigate } from "react-router-dom";
import { showToastGlobal } from "../../../platform/components/Toast";
import { HelpTip } from "../../../platform/components/HelpTip";

// 2026-05-30 (CJ「modal 只留設定類 tab，內容類交給主頁面」):
// 基本資料 和 視覺 都已在主工作區有完整 tab，不在 modal 重複。
// Modal = 設定齒輪 = 平台授權 / 危險區 兩項純設定。
type SettingsTab = "publish" | "danger";

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
  // Modal = 純設定（外部連接 + 危險操作）
  return [
    { id: "publish", label: en ? "Platform auth" : "平台授權", Icon: ShareIcon },
    { id: "danger",  label: en ? "Danger zone"   : "危險區",   Icon: DeleteIcon },
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
              <Button variant="light" size="sm" onPress={onClose} startContent={<CloseIcon size={13} />} className="w-full justify-start">
                {en ? "Close" : "關閉"}
              </Button>
            </div>
          </div>

          {/* Right pane — active tab */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {onboardingHint && (
              <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 text-sm text-amber-900 flex items-start gap-2">
                <span className="text-base"><InfoIcon size={14} /></span>
                <span className="leading-relaxed">{onboardingHint}</span>
              </div>
            )}
            {activeTab === "publish" && <PublishTab brandId={brandId} />}
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
    // 2026-07-19 (CJ「每一列的卡片數量不一致，不容易讀取」): widen the column
    // and keep a consistent 2-per-row field rhythm inside every card.
    <div className="max-w-[960px] mx-auto p-8">
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
              品牌名稱建立後不能自助修改。自助方案（基礎／專業）都只包含 <strong>一個品牌</strong> — AI 的語氣、知識、定位都是針對這個名字訓練的。
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
    { key: "facebook",  label: en ? "Facebook Page" : "Facebook 粉專",  icon: faFacebook,  tone: "#18181b", placeholder: "https://www.facebook.com/yourpage" },
    { key: "instagram", label: "Instagram",    icon: faInstagram, tone: "#18181b", placeholder: "https://www.instagram.com/yourhandle" },
    { key: "youtube",   label: "YouTube",       icon: faYoutube,   tone: "#18181b", placeholder: "https://www.youtube.com/@yourchannel" },
    { key: "threads",   label: "Threads",       icon: faThreads,   tone: "#111111", placeholder: "https://www.threads.net/@yourhandle" },
    { key: "tiktok",    label: "TikTok",        icon: faTiktok,    tone: "#111111", placeholder: "https://www.tiktok.com/@yourhandle" },
    { key: "linkedin",  label: "LinkedIn",      icon: faLinkedin,  tone: "#18181b", placeholder: "https://www.linkedin.com/company/yours" },
    { key: "line",      label: en ? "LINE Official" : "LINE 官方帳號", icon: faLine, tone: "#18181b", placeholder: en ? "https://lin.ee/xxxxx or @yourLineId" : "https://lin.ee/xxxxx 或 @yourLineId" },
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
  const q = (trpc as any).brand?.get?.useQuery(
    { id: brandId ?? 0 },
    { enabled: !!brandId, refetchOnWindowFocus: false },
  );
  // Connections data (website + all social links)
  const connQ = (trpc as any).brand?.getConnections?.useQuery(
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
      {/* 2026-07-19 (CJ 排版): short inputs pair up 2-per-row; long textareas
          span the full width — consistent rhythm with the links card below. */}
      <div className="bg-default-50 rounded-xl border border-default-200 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={en ? "Industry" : "產業"}>
            <Input size="sm" value={industry} onChange={(e) => setIndustry(e.target.value)}
              placeholder={en ? "e.g. SaaS / F&B / retail" : "例：SaaS / 餐飲 / 零售"} />
          </Field>
          <Field label={en ? "Tagline" : "品牌標語"}>
            <Input size="sm" value={tagline} onChange={(e) => setTagline(e.target.value)} />
          </Field>
        </div>
        <Field label={en ? "What the brand does (used by the AI)" : "品牌在做什麼（AI 會用這段認識你）"}>
          <Textarea minRows={3} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder={en ? "One paragraph the AI should treat as ground truth about this brand." : "用一段話描述這個品牌——AI 會把這段當成關於你的事實依據。"} />
        </Field>
        <Field label={en ? "AI positioning summary — edit to hard-correct" : "AI 推導的定位摘要 — 可直接手改校正"}>
          <Textarea minRows={5} value={positioning} onChange={(e) => setPositioning(e.target.value)}
            placeholder={en ? "If the AI misunderstood the brand, correct it here. This text is injected into every task." : "如果 AI 對品牌的理解有誤，直接在這裡改正。這段會被注入到每一個任務。"} />
          <p className="text-tiny text-default-400 mt-1">
            {en ? "Injected into every task as ground truth." : "會作為事實依據注入所有任務。"}
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
        {/* 2026-07-19 (CJ 排版): website joins the same 2-column grid as the
            social links — 8 uniform cells, every row has exactly two. */}
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faGlobe} style={{ color: "#64748B", fontSize: 16, width: 18, flexShrink: 0 }} />
            <Input
              size="sm"
              label={en ? "Official website" : "官方網站"}
              placeholder="https://example.com"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>
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
            ? "Auto-fill, test scenarios, and every task pull real content from these URLs so output matches your actual brand voice — not a guess."
            : "AI 自動填寫、測試情境、所有任務都會去抓這些連結的真實內容，讓產出貼合品牌語氣，而不是亂猜。"}
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
          <span className="text-tiny text-success-600 inline-flex items-center gap-1"><CheckIcon size={10} />{en ? "Saved" : "已儲存"}</span>
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

/** Platform connections and account lifecycle are managed by Zernio. */
export function PublishTab({ brandId }: { brandId: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";

  // Zernio keeps connection state separate from legacy brand bindings.
  const zernioProvidersQ = trpc.zernioConnect.getProviders.useQuery();
  const connectionsQ = trpc.zernioConnect.connections.useQuery(
    { brandId: brandId ?? 0 }, { enabled: !!brandId },
  );
  type ZernioPlatformKey = keyof NonNullable<typeof connectionsQ.data>;
  type ZernioStatus = { connected: boolean; account: { accountId: string; name: string; username: string | null } | null;
    pendingScheduled: number; legacyConnected: boolean };
  const zernioConnectM = trpc.zernioConnect.getConnectUrl.useMutation();
  const zernioStatusM = trpc.zernioConnect.getConnectionStatus.useMutation();
  const zernioDisconnectM = trpc.zernioConnect.disconnect.useMutation();
  const zernioUrlRef = useRef<Record<string, string | undefined>>({});
  const [zernioStatus, setZernioStatus] = useState<Record<string, ZernioStatus>>({});
  // A successful sync overrides the local snapshot; failed syncs leave it available to every member.
  const isConnected = (platform: ZernioPlatformKey) =>
    zernioStatus[platform]?.connected ?? connectionsQ.data?.[platform]?.connected ?? false;
  const zernioGeneration = useRef(0);
  const zernioApiRef = useRef({ connect: zernioConnectM.mutateAsync, status: zernioStatusM.mutateAsync });
  zernioApiRef.current = { connect: zernioConnectM.mutateAsync, status: zernioStatusM.mutateAsync };

  const warmZernio = async (platform: ZernioPlatformKey, generation = zernioGeneration.current) => {
    if (!brandId) return;
    try {
      const { url } = await zernioApiRef.current.connect({ brandId, platform, redirectUrl: window.location.href });
      if (generation === zernioGeneration.current) zernioUrlRef.current[platform] = url;
    } catch { /* Retry from the connect button. */ }
  };
  useEffect(() => {
    const generation = ++zernioGeneration.current;
    zernioUrlRef.current = {};
    setZernioStatus({});
    setVerifyingPlatform(null);
    if (!brandId || !zernioProvidersQ.data) return;
    const keys = (Object.keys(zernioProvidersQ.data) as ZernioPlatformKey[]).filter(key => ["facebook", "instagram", "linkedin", "threads"].includes(key));
    for (const platform of keys) {
      void zernioApiRef.current.status({ brandId, platform }).then(status => {
        if (generation === zernioGeneration.current) setZernioStatus(m => ({ ...m, [platform]: status }));
      }).catch(() => {});
    }
    void (async () => {
      for (const platform of keys) {
        if (generation !== zernioGeneration.current) return;
        await warmZernio(platform, generation);
      }
    })();
    return () => { ++zernioGeneration.current; };
  }, [brandId, zernioProvidersQ.data]);

  // OAuth may outlast the 30-second poll, especially when selecting a Page.
  useEffect(() => {
    if (!brandId || !zernioProvidersQ.data) return;
    const platforms = (Object.keys(zernioProvidersQ.data) as ZernioPlatformKey[]).filter(key => ["facebook", "instagram", "linkedin", "threads"].includes(key));
    if (!platforms.length) return;
    const generation = zernioGeneration.current;
    const refreshOnFocus = () => {
      for (const platform of platforms) {
        void zernioApiRef.current.status({ brandId, platform }).then(status => {
          if (generation === zernioGeneration.current) setZernioStatus(m => ({ ...m, [platform]: status }));
        }).catch(() => {});
      }
    };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [brandId, zernioProvidersQ.data]);

  useEffect(() => {
    if (!brandId || !zernioProvidersQ.data) return;
    const url = new URL(window.location.href);
    const rawPlatform = url.searchParams.get("connected") ?? url.searchParams.get("platform");
    const platform = (rawPlatform === "twitter" ? "x" : rawPlatform) as ZernioPlatformKey | null;
    if (!platform || !["facebook", "instagram", "linkedin", "threads"].includes(platform) || (!url.searchParams.has("connected") && !url.searchParams.has("error"))) return;
    const generation = zernioGeneration.current;
    if (url.searchParams.has("error")) alert(url.searchParams.get("error_message") || (en ? "Authorization failed." : "授權失敗，請重新連接。"));
    void zernioApiRef.current.status({ brandId, platform }).then(status => {
      if (generation === zernioGeneration.current) setZernioStatus(m => ({ ...m, [platform]: status }));
    }).catch(() => {});
    for (const key of ["connected", "profileId", "accountId", "username", "request_id", "stage", "error", "platform", "error_message", "is_user_fixable", "error_reason"]) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [brandId, zernioProvidersQ.data, en]);

  async function connectZernio(platform: ZernioPlatformKey, mode: "connect" | "reconnect" | "replace" = isConnected(platform) ? "reconnect" : "connect") {
    if (!brandId) return;
    if (mode === "replace" && !confirm(en
      ? "Switching accounts will automatically disconnect the current account and stop its billing."
      : "換成其他帳號後，目前的帳號會自動解除並停止計費。")) return;
    const generationAtClick = zernioGeneration.current;
    const previousAccountId = zernioStatus[platform]?.account?.accountId;
    // Open synchronously to retain the user gesture while fetching a mode-specific URL.
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      alert(en ? "Please allow pop-ups to authorize this account." : "請允許開啟彈出視窗以完成授權。");
      return;
    }
    popup.opener = null;
    setPendingPlatform(platform);
    try {
      const url = mode === "connect" && zernioUrlRef.current[platform]
        ? zernioUrlRef.current[platform]!
        : (await zernioApiRef.current.connect({ brandId, platform, mode, redirectUrl: window.location.href })).url;
      if (generationAtClick !== zernioGeneration.current) { popup.close(); return; }
      popup.location.href = url;
      delete zernioUrlRef.current[platform];
    } catch (e) {
      popup.close();
      if (generationAtClick === zernioGeneration.current) alert(e instanceof Error ? e.message : String(e));
      return;
    } finally {
      if (generationAtClick === zernioGeneration.current) setPendingPlatform(null);
    }
    setVerifyingPlatform(platform);
    const generation = zernioGeneration.current;
    const deadline = Date.now() + 30_000;
    void (async () => {
      try {
        while (Date.now() < deadline) {
          await new Promise<void>(resolve => setTimeout(resolve, 2000));
          if (generation !== zernioGeneration.current || Date.now() > deadline) return;
          try {
            const status = await zernioApiRef.current.status({ brandId, platform });
            if (generation !== zernioGeneration.current) return;
            setZernioStatus(m => ({ ...m, [platform]: status }));
            if (status.connected && (!previousAccountId || status.account?.accountId !== previousAccountId || popup.closed)) return;
          } catch { /* OAuth registration may not be visible yet. */ }
        }
      } finally {
        if (generation === zernioGeneration.current) {
          setVerifyingPlatform(null);
          void warmZernio(platform);
        }
      }
    })();
  }
  async function disconnectZernio(platform: ZernioPlatformKey) {
    if (!brandId) return;
    const pending = zernioStatus[platform]?.pendingScheduled ?? 0;
    const message = pending > 0
      ? (en ? `There are ${pending} scheduled posts. They will fail when due after disconnection. Zernio billing stops; published posts are unaffected. Disconnect anyway?`
        : `目前有 ${pending} 篇排程，解除後到時間會標記失敗。解除後 Zernio 停止計費，已發出的貼文不受影響。仍要解除？`)
      : (en ? "Zernio billing stops after disconnection; published posts are unaffected. Disconnect?"
        : "解除後 Zernio 停止計費，已發出的貼文不受影響。確定解除？");
    if (!confirm(message)) return;
    const generation = zernioGeneration.current;
    try {
      await zernioDisconnectM.mutateAsync({ brandId, platform });
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally {
      try {
        const status = await zernioApiRef.current.status({ brandId, platform });
        if (generation === zernioGeneration.current) setZernioStatus(m => ({ ...m, [platform]: status }));
      } catch { /* Keep the previous state if the service is unavailable. */ }
    }
  }

  // ── Local state ───────────────────────────────────────────────────────
  const [pendingPlatform, setPendingPlatform]   = useState<string | null>(null);
  /** Platform currently being verified post-OAuth (polling Zernio) */
  const [verifyingPlatform, setVerifyingPlatform] = useState<string | null>(null);
  // ── Platform config ────────────────────────────────────────────────────
  type PlatformCfg = { key: ZernioPlatformKey; label: string; color: string; icon: any; desc: string };
  const PLATFORMS: PlatformCfg[] = [
    { key: "facebook",  label: "Facebook",  color: "#18181b", icon: faFacebook,  desc: en ? "Publish to your Facebook Page"              : "發布到 Facebook 粉專"        },
    { key: "instagram", label: "Instagram", color: "#18181b", icon: faInstagram, desc: en ? "Publish to Instagram Business account"       : "發布到 Instagram 商業帳號"   },
    { key: "linkedin",  label: "LinkedIn",  color: "#18181b", icon: faLinkedin,  desc: en ? "Publish to your LinkedIn profile or page"    : "發布到 LinkedIn 帳號或企業頁面" },
    // X is a hidden front-stage channel (planGate) and is intentionally not listed.
    { key: "threads",   label: "Threads",   color: "#18181b", icon: faThreads,   desc: en ? "Publish to your Threads account (500 characters max)" : "發布到 Threads 帳號（上限 500 字）" },
  ];

  return (
    <div className="max-w-[760px] mx-auto p-8">
      <h2 className="text-2xl font-semibold text-default-900 mb-1">{en ? "Platform connections" : "平台連接"}</h2>
      <p className="text-sm text-default-500 mb-6">
        {en
          ? "Connect your accounts once. onBrand Studio uses your authorization to publish content directly."
          : "一次授權，之後 onBrand Studio 用你的授權直接發布內容。"}
      </p>

      {/* Platform card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PLATFORMS.map((p) => {
          const fullyConnected = isConnected(p.key);
          const legacyZernio = !fullyConnected && !!zernioStatus[p.key]?.legacyConnected;
          const isPending   = pendingPlatform   === p.key;
          const isVerifying = verifyingPlatform === p.key;

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
                  <span className="flex items-center gap-1 text-[12px] text-success-700 bg-success-100 border border-success-300 px-2 py-0.5 rounded-full flex-shrink-0 font-medium">
                    <DoneIcon size={11} /> {en ? "Connected" : "已連接"}
                  </span>
                ) : legacyZernio ? (
                  <span className="text-[12px] text-warning-700 bg-warning-50 border border-warning-200 px-2 py-0.5 rounded-full">
                    {en ? "Re-authorization required" : "待重新授權"}
                  </span>
                ) : isVerifying ? (
                  <span className="flex items-center gap-1 text-[12px] text-primary-600 bg-primary-50 border border-primary-200 px-2 py-0.5 rounded-full flex-shrink-0 font-medium animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0" />
                    {en ? "Verifying…" : "確認中…"}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[12px] text-default-400 bg-white border border-default-200 px-2 py-0.5 rounded-full flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-default-300 flex-shrink-0" /> {en ? "Not connected" : "尚未連接"}
                  </span>
                )}
              </div>

              {legacyZernio && <p className="text-xs text-warning-700">
                {en ? "Our publishing service has been upgraded. Please re-authorize once." : "發布服務已升級，請重新授權一次。"}
              </p>}
              {/* Connected state: account name + last connected indicator */}
              {fullyConnected && (
                <div className="text-xs text-default-500 bg-default-50 rounded-lg px-3 py-2">
                  {zernioStatus[p.key] ? zernioStatus[p.key].account?.name : connectionsQ.data?.[p.key]?.accountName}
                </div>
              )}

              {/* Connect / Re-authorize button */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  color={fullyConnected ? "default" : "primary"}
                  variant={fullyConnected ? "bordered" : "solid"}
                  startContent={(isPending || isVerifying) ? undefined : <ExternalIcon size={12} />}
                  isLoading={isPending || isVerifying}
                  isDisabled={isPending || isVerifying}
                  onPress={() => void connectZernio(p.key as ZernioPlatformKey)}
                  className="flex-1"
                >
                  {isPending
                    ? (en ? `Connecting ${p.label}…` : `連接 ${p.label} 中…`)
                    : isVerifying
                      ? (en ? "Verifying connection…" : "確認授權中…")
                      : fullyConnected || legacyZernio
                        ? (en ? "Re-authorize" : "重新授權")
                        : (en ? `Connect ${p.label}` : `連接 ${p.label}`)}
                </Button>
                {fullyConnected && (<>
                  <Button size="sm" variant="bordered" isDisabled={isPending || isVerifying}
                    onPress={() => void connectZernio(p.key as ZernioPlatformKey, "replace")}>
                    {en ? "Switch account" : "換帳號"}
                  </Button>
                  <Button size="sm" variant="light" color="danger" isLoading={zernioDisconnectM.isPending}
                    onPress={() => void disconnectZernio(p.key as ZernioPlatformKey)}>
                    {en ? "Disconnect" : "解除連接"}
                  </Button>
                </>)}
                </div>

            </div>
          );
        })}
      </div>

      <p className="mt-5 text-xs text-default-400 leading-relaxed">
        {en
          ? "onBrand Studio never stores your passwords. Authorization is held by our publishing service, Zernio, isolated per brand. To revoke it, use Disconnect on that platform."
          : "onBrand Studio 不會儲存你的密碼。授權由發布服務 Zernio 代管，每個品牌獨立。要撤銷授權，按該平台的『解除連接』即可。"}
      </p>
    </div>
  );
}

export function DangerTab({ brandId, brandName, onClose }: { brandId: number | null; brandName: string | null; onClose: () => void }) {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const [confirmed, setConfirmed] = useState(false);

  // Fetch brand list so we can redirect to another brand after deletion
  const brandsQ = (trpc as any).brand?.list?.useQuery(undefined, {
    refetchOnWindowFocus: false, staleTime: 30_000,
  });
  const allBrands: Array<{ id: number; name: string }> = brandsQ?.data ?? [];

  const deleteMut = (trpc as any).brand?.delete?.useMutation
    ? (trpc as any).brand.delete.useMutation({
        onSuccess: () => {
          showToastGlobal(en ? `Brand "${brandName ?? brandId}" deleted` : `品牌「${brandName ?? brandId}」已刪除`, "success");
          onClose();
          // Navigate to another brand, or to /brands if none left
          const next = allBrands.find((b) => b.id !== brandId);
          navigate(next ? `/brands?b=${next.id}` : "/brands", { replace: true });
        },
        onError: (e: any) => {
          showToastGlobal((typeof e?.message === "string" ? e.message : null) ?? (en ? "Delete failed" : "刪除失敗"));
        },
      })
    : null;

  const handleDelete = () => {
    if (!brandId || !deleteMut) return;
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    deleteMut.mutate({ id: brandId });
  };

  return (
    <div className="max-w-[700px] mx-auto p-8">
      <h2 className="text-2xl font-semibold text-default-900 mb-2">{en ? "Danger zone" : "危險區"}</h2>
      <p className="text-sm text-default-500 mb-6">{en ? "Irreversible actions — proceed with care" : "不可逆操作 — 慎用"}</p>
      <div className="border-2 border-danger-300 rounded-xl p-5 bg-danger-50">
        <h3 className="font-semibold text-danger-800 mb-1.5">{en ? "Delete brand" : "刪除品牌"}</h3>
        <p className="text-sm text-default-700 mb-4">
          {en
            ? <>This permanently deletes &ldquo;{brandName ?? brandId}&rdquo; and all its positioning / copy / visual / knowledge data. Linked products and events will be orphaned. <strong>This cannot be undone.</strong></>
            : <>這會永久刪除「{brandName ?? brandId}」及其所有定位 / 文字 / 視覺 / 知識資料。對應的產品、活動會變成孤兒。<strong>此動作不可復原。</strong></>}
        </p>
        {confirmed && (
          <p className="text-sm font-semibold text-danger-700 mb-3">
            <WarningIcon size={13} /> {en ? "Are you sure? Click again to confirm deletion." : "確定嗎？再按一次確認刪除。"}
          </p>
        )}
        <Button
          color="danger"
          variant={confirmed ? "solid" : "bordered"}
          isDisabled={!brandId || !deleteMut || deleteMut?.isPending}
          isLoading={deleteMut?.isPending}
          onPress={handleDelete}
        >
          {confirmed
            ? (en ? "Confirm delete" : "確認刪除")
            : (en ? "Delete brand" : "刪除品牌")}
        </Button>
        {confirmed && (
          <Button variant="light" className="ml-2" onPress={() => setConfirmed(false)}>
            {en ? "Cancel" : "取消"}
          </Button>
        )}
      </div>
    </div>
  );
}
