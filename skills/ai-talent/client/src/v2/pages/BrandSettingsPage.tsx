/**
 * BrandSettingsPage — full-page brand settings (replaces the modal sheet).
 *
 * 2026-05-12 (CJ「我不想要變成 modal，想跟品牌頁面一樣」).
 *
 * Route: /brands/settings?b=<brandId>&tab=<tab>
 * Tabs:  info | connector | publish | visual | ai | danger
 *
 * Layout: horizontal tab bar on top + wide content below (1400px max),
 * matching BrandsPage's hero/navbar visual pattern.
 */
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, useOutletContext } from "react-router-dom";
import { IdCard, Link2, Palette, Bot, Trash2, Share2, ChevronLeft } from "lucide-react";
import ConnectorEditor from "../components/positioning/ConnectorEditor";
import AIPromptsEditor from "../components/positioning/AIPromptsEditor";
import {
  InfoTab,
  VisualTab,
  PublishTab,
  DangerTab,
} from "../components/positioning/BrandSettingsSheet";
import { trpc } from "../../lib/trpc";
import { useLang } from "../../lib/i18n";

type SettingsTab = "info" | "connector" | "publish" | "visual" | "ai" | "danger";

interface ShellCtx {
  brandId: number | null;
  brands?: any[];
}

export default function BrandSettingsPage() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const ctx = useOutletContext<ShellCtx | null>();
  const [search, setSearch] = useSearchParams();

  const TABS: Array<{ id: SettingsTab; label: string; Icon: any; hint: string }> = [
    { id: "info",      label: lang === "en" ? "Basics"    : "基本資料",  Icon: IdCard,  hint: lang === "en" ? "Name / industry / description"        : "名稱 / 產業 / 描述" },
    { id: "connector", label: lang === "en" ? "Connect"   : "連結",      Icon: Link2,   hint: lang === "en" ? "FB / IG / LinkedIn / YouTube"          : "FB / IG / LinkedIn / YouTube" },
    { id: "publish",   label: lang === "en" ? "Publish"   : "發布",      Icon: Share2,  hint: lang === "en" ? "Pick the FB page to publish to"        : "選擇要發布的 FB 粉專" },
    { id: "visual",    label: lang === "en" ? "Visual"    : "視覺",      Icon: Palette, hint: lang === "en" ? "Logo / colors / fonts"                 : "Logo / 色票 / 字型" },
    { id: "ai",        label: lang === "en" ? "AI prompts": "AI 指令",   Icon: Bot,     hint: lang === "en" ? "Custom AI instructions per platform"   : "各平台自訂 AI 指令" },
    { id: "danger",    label: lang === "en" ? "Danger"    : "危險區",    Icon: Trash2,  hint: lang === "en" ? "Delete this brand"                     : "刪除品牌" },
  ];

  // Resolve brand: ?b= override > shell context > first brand in list
  const urlB = search.get("b");
  const brandIdFromUrl = urlB ? parseInt(urlB, 10) : null;
  const brandId =
    (brandIdFromUrl && Number.isFinite(brandIdFromUrl) ? brandIdFromUrl : null) ??
    ctx?.brandId ??
    ctx?.brands?.[0]?.id ??
    null;

  // Fetch brand name for display
  const brandQ = (trpc as any).brand?.get?.useQuery?.(
    { id: brandId ?? 0 },
    { enabled: !!brandId, refetchOnWindowFocus: false },
  );
  const brandName = (brandQ?.data as any)?.name ?? null;

  // Tab from URL (default: connector)
  const initialTab = (search.get("tab") ?? "connector") as SettingsTab;
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  useEffect(() => {
    const t = search.get("tab") as SettingsTab | null;
    if (t && t !== activeTab) setActiveTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const switchTab = (t: SettingsTab) => {
    setActiveTab(t);
    const next = new URLSearchParams(search);
    next.set("tab", t);
    setSearch(next, { replace: true });
  };

  if (!brandId) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-default-500">{lang === "en" ? "No brand selected yet" : "尚未選擇品牌"}</p>
        <button
          onClick={() => navigate("/brands")}
          className="px-4 py-2 text-sm rounded-lg bg-neutral-900 text-white hover:bg-neutral-800"
        >
          {lang === "en" ? "Back to brands" : "回到品牌列表"}
        </button>
      </div>
    );
  }

  const activeTabMeta = TABS.find((t) => t.id === activeTab);

  return (
    <div className="min-h-[80vh]">
      {/* Hero — same visual rhythm as BrandsPage/edit (large header + breadcrumb) */}
      <header className="border-b border-default-200 bg-white">
        <div className="max-w-[1400px] mx-auto px-6 py-5">
          <button
            onClick={() => navigate("/brands")}
            className="text-xs text-default-500 hover:text-default-900 flex items-center gap-1 mb-3"
          >
            <ChevronLeft size={14} /> {lang === "en" ? "Brands" : "品牌列表"}
          </button>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-default-900">{brandName ?? "—"}</h1>
            <span className="text-default-300">·</span>
            <span className="text-base text-default-600">{lang === "en" ? "Brand settings" : "品牌設定"}</span>
          </div>
          <p className="text-sm text-default-500 mt-1.5">
            {activeTabMeta?.hint ?? (lang === "en" ? "Manage this brand's basics, connections, and publishing" : "管理這個品牌的基本資料、連結與發布設定")}
          </p>
        </div>

        {/* Horizontal tab bar (matches BrandsPage navbar style) */}
        <nav className="max-w-[1400px] mx-auto px-6">
          <div className="flex overflow-x-auto gap-1 -mb-px">
            {TABS.map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => switchTab(t.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm whitespace-nowrap border-b-2 transition ${
                    isActive
                      ? "border-default-900 text-default-900 font-semibold"
                      : "border-transparent text-default-600 hover:text-default-900 hover:border-default-300"
                  }`}
                >
                  <t.Icon size={14} strokeWidth={1.8} className="shrink-0" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Active tab content — wide, white bg, no extra cards (let tabs render their own) */}
      <main className="max-w-[1400px] mx-auto px-6 py-6">
        {activeTab === "info" && (
          <InfoTab brandId={brandId} brandName={brandName} />
        )}
        {activeTab === "connector" && (
          <ConnectorEditor brandId={brandId} />
        )}
        {activeTab === "publish" && (
          <PublishTab brandId={brandId} />
        )}
        {activeTab === "visual" && (
          <VisualTab brandId={brandId} />
        )}
        {activeTab === "ai" && (
          <AIPromptsEditor brandId={brandId} />
        )}
        {activeTab === "danger" && (
          <DangerTab brandId={brandId} brandName={brandName} onClose={() => navigate("/brands")} />
        )}
      </main>
    </div>
  );
}
