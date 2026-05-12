/**
 * BrandSettingsPage — full-page brand settings (was modal in BrandSettingsSheet).
 *
 * 2026-05-12 (CJ「我不想要變成 modal，想跟品牌頁面一樣」).
 *
 * Route: /brands/settings?b=<brandId>&tab=<tab>
 * Tabs:  info | connector | publish | visual | ai | danger
 *
 * Reuses tab content components exported from BrandSettingsSheet so the
 * legacy modal entry points still work; this page is just a non-modal
 * shell around the same content.
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

type SettingsTab = "info" | "connector" | "publish" | "visual" | "ai" | "danger";

const TABS: Array<{ id: SettingsTab; label: string; Icon: any }> = [
  { id: "info",      label: "基本資料",  Icon: IdCard  },
  { id: "connector", label: "連結",      Icon: Link2   },
  { id: "publish",   label: "發布",      Icon: Share2  },
  { id: "visual",    label: "視覺",      Icon: Palette },
  { id: "ai",        label: "AI 指令",   Icon: Bot     },
  { id: "danger",    label: "危險區",    Icon: Trash2  },
];

interface ShellCtx {
  brandId: number | null;
  brands?: any[];
}

export default function BrandSettingsPage() {
  const navigate = useNavigate();
  const ctx = useOutletContext<ShellCtx | null>();
  const [search, setSearch] = useSearchParams();

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

  // Tab from URL
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
        <p className="text-sm text-default-500">尚未選擇品牌</p>
        <button
          onClick={() => navigate("/brands")}
          className="px-4 py-2 text-sm rounded-lg bg-neutral-900 text-white hover:bg-neutral-800"
        >
          回到品牌列表
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-6">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/brands")}
          className="text-sm text-default-500 hover:text-default-900 flex items-center gap-1"
        >
          <ChevronLeft size={16} /> 品牌列表
        </button>
        <span className="text-default-300">/</span>
        <span className="text-sm font-semibold text-default-900">
          {brandName ?? "—"}
        </span>
        <span className="text-default-300">/</span>
        <span className="text-sm text-default-500">設定</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
        {/* Vertical tab rail */}
        <aside className="md:sticky md:top-2 md:self-start">
          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition text-left whitespace-nowrap ${
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
        </aside>

        {/* Active tab content */}
        <main className="bg-white rounded-2xl ring-1 ring-default-200/60 min-h-[60vh]">
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
    </div>
  );
}
