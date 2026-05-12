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
import { useEffect, useState } from "react";
import { Modal, ModalContent, Button, Input, Spinner } from "@heroui/react";
import {
  IdCard, Link2, Palette, Bot, Trash2, X, Share2, CheckCircle2, ExternalLink,
} from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebook } from "@fortawesome/free-brands-svg-icons";
import ConnectorEditor from "./ConnectorEditor";
import AIPromptsEditor from "./AIPromptsEditor";
import { trpc } from "../../../lib/trpc";

type SettingsTab = "info" | "connector" | "publish" | "visual" | "ai" | "danger";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  brandId: number | null;
  brandName: string | null;
  /** Tab to land on when sheet opens. Defaults to "connector" (most common entry). */
  initialTab?: SettingsTab;
  /** Optional onboarding banner shown above active tab content. */
  onboardingHint?: string;
}

const TABS: Array<{ id: SettingsTab; label: string; Icon: any }> = [
  { id: "info",      label: "基本資料",  Icon: IdCard  },
  { id: "connector", label: "連結",      Icon: Link2   },
  { id: "publish",   label: "發布",      Icon: Share2  },
  { id: "visual",    label: "視覺",      Icon: Palette },
  { id: "ai",        label: "AI 指令",   Icon: Bot     },
  { id: "danger",    label: "危險區",    Icon: Trash2  },
];

export default function BrandSettingsSheet({ isOpen, onClose, brandId, brandName, initialTab, onboardingHint }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? "connector");
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
              <div className="text-tiny text-default-500 font-medium uppercase tracking-wider">設定</div>
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
                關閉
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
            {activeTab === "info" && <InfoTab brandId={brandId} brandName={brandName} />}
            {activeTab === "connector" && (
              <ConnectorEditor brandId={brandId} />
            )}
            {activeTab === "publish" && <PublishTab brandId={brandId} />}
            {activeTab === "visual" && <VisualTab brandId={brandId} />}
            {activeTab === "ai" && (
              <AIPromptsEditor brandId={brandId} />
            )}
            {activeTab === "danger" && <DangerTab brandId={brandId} brandName={brandName} onClose={onClose} />}
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}

export function InfoTab({ brandId, brandName }: { brandId: number | null; brandName: string | null }) {
  return (
    <div className="max-w-[700px] mx-auto p-8">
      <h2 className="text-2xl font-semibold text-default-900 mb-2">基本資料</h2>
      <p className="text-sm text-default-500 mb-6">名稱 / 產業 / 描述</p>
      <div className="bg-default-50 rounded-xl p-5 text-sm text-default-700 leading-relaxed">
        <div className="mb-2"><span className="text-default-500">名稱：</span>{brandName ?? "—"}</div>
        <div className="text-default-400 italic">產業 / 描述編輯介面接下來會接上（用 brand.update mutation）</div>
        <div className="text-default-400 italic mt-1">brandId: {brandId}</div>
      </div>
    </div>
  );
}

export function VisualTab({ brandId }: { brandId: number | null }) {
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
      alert(`儲存失敗：${e?.message ?? "未知錯誤"}`);
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
      <h2 className="text-2xl font-semibold text-default-900 mb-2">視覺識別</h2>
      <p className="text-sm text-default-500 mb-6">
        Logo · 色票 · 字型 · 識別規範 — AI 生圖時會自動套用，確保不脫離品牌調性
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
              <span className="text-xs text-default-400">無 logo</span>
            )}
          </div>
          <div className="flex-1">
            <Input
              size="sm"
              label="Logo URL"
              placeholder="https://example.com/logo.png 或 /static/..."
              value={logoUrl}
              onValueChange={onChange(setLogoUrl)}
              description="貼上 logo 的網址（PNG / SVG / JPG 都可）。檔案上傳功能稍後上線。"
            />
          </div>
        </div>
      </section>

      {/* Colors */}
      <section className="border border-default-200 rounded-xl p-5 bg-white mb-4">
        <h3 className="text-sm font-semibold text-default-900 mb-3">色票（HEX）</h3>
        <p className="text-xs text-default-500 mb-4">
          AI 生圖時會以這三色為主視覺基調。建議：主色 = logo 主色 / 副色 = 互補色 / 強調色 = CTA 按鈕用色。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "主色",  val: primary,   setter: setPrimary },
            { label: "副色",  val: secondary, setter: setSecondary },
            { label: "強調色", val: accent,    setter: setAccent },
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
        <h3 className="text-sm font-semibold text-default-900 mb-3">字型</h3>
        <Input
          size="sm"
          label="主要字型"
          placeholder="例：Noto Sans TC, sans-serif 或 思源黑體"
          value={fontFamily}
          onValueChange={onChange(setFontFamily)}
          description="CSS font-family 寫法。AI 在生視覺草稿時會優先選擇相近風格的字型。"
        />
        {fontFamily && (
          <div className="mt-3 p-3 bg-default-50 rounded-lg" style={{ fontFamily }}>
            <div className="text-tiny text-default-500 mb-1">預覽：</div>
            <div className="text-lg text-default-900">中文預覽 ABC abc 123 — {fontFamily}</div>
          </div>
        )}
      </section>

      {/* Guidelines */}
      <section className="border border-default-200 rounded-xl p-5 bg-white mb-6">
        <h3 className="text-sm font-semibold text-default-900 mb-3">識別規範（自由填寫）</h3>
        <p className="text-xs text-default-500 mb-3">
          給 AI 生圖時的視覺指引。例：「永遠用自然光、避免高對比、不要用堆疊文字、人物以亞洲面孔為主」。
        </p>
        <textarea
          value={guidelines}
          onChange={(e) => { setGuidelines(e.target.value); setDirty(true); }}
          rows={6}
          placeholder="例：&#10;- 自然光為主，避免棚拍硬光&#10;- 構圖留白多，主體偏左&#10;- 木材、棉麻等天然材質為主&#10;- 不要使用 emoji 或文字疊圖"
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
          儲存視覺識別
        </Button>
        {dirty && <span className="text-xs text-amber-600">有未儲存的變更</span>}
        {!dirty && visualQ?.data && <span className="text-xs text-default-400">已儲存</span>}
      </div>
    </div>
  );
}

/**
 * 2026-05-11 — PublishTab: per-brand Facebook binding for multi-tenant SaaS.
 *
 * Flow:
 *   1. User clicks 「連接 Facebook」 → opens Pipedream Connect popup
 *      (OAuth scoped to this user's external_user_id = our userId).
 *   2. User authorises FB → Pipedream stores their access token in vault.
 *   3. User pastes the FB Page ID they want this brand to publish to
 *      → saved into brands.fbPageId.
 *   4. From now on, publish.toFacebook reads brand.fbPageId + sends
 *      connect_external_user_id so Pipedream uses THIS user's token.
 */
export function PublishTab({ brandId }: { brandId: number | null }) {
  const statusQ = (trpc as any).publish?.getBrandFacebookStatus?.useQuery?.(
    { brandId: brandId ?? 0 },
    { enabled: !!brandId, refetchOnWindowFocus: false },
  );
  const setPageM = (trpc as any).publish?.setBrandFacebookPage?.useMutation?.({
    onSuccess: () => statusQ?.refetch?.(),
  });
  const unbindM = (trpc as any).publish?.unbindBrandFacebook?.useMutation?.({
    onSuccess: () => statusQ?.refetch?.(),
  });
  const connectM = (trpc as any).publish?.getFacebookConnectUrl?.useMutation?.();

  const [pageId, setPageId] = useState("");
  const [pageName, setPageName] = useState("");
  const [connectStarted, setConnectStarted] = useState(false);

  useEffect(() => {
    const d = statusQ?.data;
    if (d?.fbPageId) setPageId(d.fbPageId);
    if (d?.fbPageName) setPageName(d.fbPageName);
  }, [statusQ?.data]);

  const status = statusQ?.data;
  const isConnected = !!status?.connected;
  const isLoading = !!statusQ?.isLoading;

  async function handleConnect() {
    try {
      const r = await connectM?.mutateAsync?.({});
      if (r?.connectUrl) {
        window.open(r.connectUrl, "_blank", "noopener,noreferrer,width=600,height=700");
        setConnectStarted(true);
      }
    } catch (e: any) {
      alert(`無法開啟 Pipedream Connect：${e?.message ?? "未知錯誤"}`);
    }
  }

  async function handleSave() {
    if (!brandId || !pageId.trim()) return;
    try {
      await setPageM?.mutateAsync?.({
        brandId,
        fbPageId: pageId.trim(),
        fbPageName: pageName.trim() || undefined,
      });
    } catch (e: any) {
      alert(`儲存失敗：${e?.message ?? "未知錯誤"}`);
    }
  }

  async function handleUnbind() {
    if (!brandId) return;
    if (!confirm("確定要解除此品牌的 Facebook 綁定？已發出的貼文不會被刪除。")) return;
    try {
      await unbindM?.mutateAsync?.({ brandId });
      setPageId("");
      setPageName("");
    } catch (e: any) {
      alert(`解除失敗：${e?.message ?? "未知錯誤"}`);
    }
  }

  return (
    <div className="max-w-[760px] mx-auto p-8">
      <h2 className="text-2xl font-semibold text-default-900 mb-2">發布設定</h2>
      <p className="text-sm text-default-500 mb-6">
        為這個品牌連接你自己的 Facebook 粉專，「直接發 FB」會用你的授權發到你選定的粉專。
      </p>

      {/* Facebook section */}
      <div className="border border-default-200 rounded-xl p-5 bg-white">
        <div className="flex items-center gap-3 mb-4">
          <FontAwesomeIcon icon={faFacebook} style={{ color: "#1877F2", fontSize: 22 }} />
          <div className="flex-1">
            <div className="text-sm font-semibold text-default-900">Facebook 粉專</div>
            <div className="text-xs text-default-500">透過 Pipedream Connect 安全授權 · 隨時可解除</div>
          </div>
          {isConnected && (
            <span className="flex items-center gap-1 text-xs text-success-700 bg-success-50 border border-success-200 px-2 py-1 rounded-full">
              <CheckCircle2 size={12} /> 已連接
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="py-6 flex justify-center"><Spinner size="sm" /></div>
        ) : (
          <>
            {/* Step 1: OAuth */}
            <div className="mb-5">
              <div className="text-xs font-medium text-default-700 mb-2">
                1. 授權 Facebook 帳號
              </div>
              <Button
                size="sm"
                variant={isConnected ? "bordered" : "solid"}
                color={isConnected ? "default" : "primary"}
                startContent={<ExternalLink size={13} />}
                isLoading={connectM?.isPending}
                onPress={handleConnect}
              >
                {isConnected ? "重新授權 / 換帳號" : "連接 Facebook"}
              </Button>
              {connectStarted && !isConnected && (
                <p className="text-xs text-default-500 mt-2">
                  在新分頁完成授權後回來這裡填入粉專 ID。
                </p>
              )}
            </div>

            {/* Step 2: page ID */}
            <div className="mb-4">
              <div className="text-xs font-medium text-default-700 mb-2">
                2. 想用哪個粉專？
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  size="sm"
                  label="粉專 ID"
                  placeholder="例：123456789012345"
                  value={pageId}
                  onValueChange={setPageId}
                  description="可在粉專「關於」頁面找到"
                />
                <Input
                  size="sm"
                  label="粉專名稱（顯示用）"
                  placeholder="選填，例：摘星行銷"
                  value={pageName}
                  onValueChange={setPageName}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                color="primary"
                isDisabled={!pageId.trim() || !brandId}
                isLoading={setPageM?.isPending}
                onPress={handleSave}
              >
                儲存綁定
              </Button>
              {isConnected && (
                <Button
                  size="sm"
                  variant="light"
                  color="danger"
                  isLoading={unbindM?.isPending}
                  onPress={handleUnbind}
                >
                  解除綁定
                </Button>
              )}
            </div>

            {status?.connectedAt && (
              <p className="text-xs text-default-400 mt-3">
                上次連接：{new Date(status.connectedAt).toLocaleString("zh-TW")}
              </p>
            )}
          </>
        )}
      </div>

      <div className="mt-4 text-xs text-default-400 leading-relaxed">
        說明：Drop 不會儲存你的 Facebook 密碼。OAuth token 由 Pipedream 代管，
        每位用戶獨立。解除綁定只會從 Drop 端清除指向關係，要徹底撤銷請至
        Facebook 設定 → 已連結應用程式移除 Pipedream。
      </div>
    </div>
  );
}

export function DangerTab({ brandId, brandName, onClose }: { brandId: number | null; brandName: string | null; onClose: () => void }) {
  return (
    <div className="max-w-[700px] mx-auto p-8">
      <h2 className="text-2xl font-semibold text-default-900 mb-2">危險區</h2>
      <p className="text-sm text-default-500 mb-6">不可逆操作 — 慎用</p>
      <div className="border-2 border-danger-300 rounded-xl p-5 bg-danger-50">
        <h3 className="font-semibold text-danger-800 mb-1.5">刪除品牌</h3>
        <p className="text-sm text-default-700 mb-4">
          這會永久刪除「{brandName ?? brandId}」及其所有定位 / 文字 / 視覺 / 知識資料。對應的產品、活動會變成孤兒。**此動作不可復原**。
        </p>
        <Button color="danger" variant="bordered" isDisabled>
          刪除（接下來會接上）
        </Button>
      </div>
    </div>
  );
}
