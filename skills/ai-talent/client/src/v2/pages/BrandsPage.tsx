/**
 * BrandsPage — Canva-style 品牌工具組 page.
 *
 * Mirrors Canva's Brand Hub:
 *   1. Pastel hero with centered "{brand} 品牌工具組" title
 *   2. Promo banner ("讓你的品牌在不同設計間都生動無比") with side art
 *   3. Two-column body:
 *       - Left rail sub-nav (所有資產 / 準則 / 品牌範本 / 標誌 / 顏色 ...
 *         + brand switcher dropdown at top)
 *       - Right grid of pastel asset tiles (4 per row), each opens the
 *         relevant section. Hooks into existing brandBrain data where
 *         it already exists (品牌定位 / 受眾 / 語調 / 競品).
 *
 * No new backend tables required — visual identity tiles (標誌/顏色/字型/
 * 照片/圖像/圖示/圖表) are placeholders that point at "即將推出" or the
 * Pipedream sync flow when applicable.
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";

type SectionId =
  | "all" | "guidelines" | "templates"
  | "logo" | "colors" | "fonts" | "voice"
  | "photos" | "images" | "icons" | "charts"
  | "positioning" | "audience" | "competitor";

const SUBNAV: Array<{ id: SectionId; label: string; badge?: string }> = [
  { id: "all",          label: "所有資產" },
  { id: "guidelines",   label: "品牌準則" },
  { id: "templates",    label: "品牌範本", badge: "最新" },
  { id: "logo",         label: "標誌" },
  { id: "colors",       label: "顏色" },
  { id: "fonts",        label: "字型" },
  { id: "voice",        label: "品牌口吻" },
  { id: "positioning",  label: "品牌定位" },
  { id: "audience",     label: "目標受眾" },
  { id: "competitor",   label: "競品洞察" },
  { id: "photos",       label: "照片" },
  { id: "images",       label: "圖像" },
  { id: "icons",        label: "圖示" },
  { id: "charts",       label: "圖表" },
];

type AssetTile = {
  id: SectionId;
  label: string;
  bg: string;
  art: React.ReactNode;
  ready: boolean;
  // Hook-up: function returning a count badge (or null if no data hookup).
  count?: number | null;
};

export default function BrandsPage() {
  const navigate = useNavigate();
  const { brandId, setBrandId, brands } = useOutletContext<ShellOutletCtx>();
  const [section, setSection] = useState<SectionId>("all");
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const currentBrand = useMemo(
    () => brands.find((b: any) => b.id === brandId) ?? brands[0] ?? null,
    [brands, brandId]
  );
  const brandName = currentBrand?.name ?? "我的品牌";

  // Brain entries (positioning / audience / voice / competitor / other)
  const brainQuery = (trpc as any).brandBrain?.list?.useQuery
    ? (trpc as any).brandBrain.list.useQuery(
        { brandId: brandId ?? 0 },
        { enabled: !!brandId, refetchOnWindowFocus: false }
      )
    : { data: [], isLoading: false };
  const brainEntries: Record<string, any[]> =
    ((brainQuery.data as any)?.entries as Record<string, any[]>) ?? {};

  const countByCat = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [cat, arr] of Object.entries(brainEntries)) {
      out[cat] = Array.isArray(arr) ? arr.length : 0;
    }
    // alias: tile uses "competitor" singular, server returns "competitors"
    out["competitor"] = out["competitors"] ?? 0;
    return out;
  }, [brainEntries]);

  const TILES: AssetTile[] = [
    {
      id: "templates", label: "品牌範本", bg: "#FBE9DA", ready: false,
      art: <ArtTemplates />,
    },
    {
      id: "logo", label: "標誌", bg: "#EAD9F5", ready: false,
      art: <ArtLogo />,
    },
    {
      id: "colors", label: "顏色", bg: "#FFE0CD", ready: false,
      art: <ArtColors />,
    },
    {
      id: "fonts", label: "字型", bg: "#D9EBD7", ready: false,
      art: <ArtFonts />,
    },
    {
      id: "voice", label: "品牌口吻", bg: "#E7DAF5", ready: true,
      art: <ArtQuote />, count: countByCat["voice"] ?? 0,
    },
    {
      id: "positioning", label: "品牌定位", bg: "#FCE7DD", ready: true,
      art: <ArtPositioning />, count: countByCat["positioning"] ?? 0,
    },
    {
      id: "audience", label: "目標受眾", bg: "#DEF1EE", ready: true,
      art: <ArtAudience />, count: countByCat["audience"] ?? 0,
    },
    {
      id: "competitor", label: "競品洞察", bg: "#FCE0EA", ready: true,
      art: <ArtCompetitor />, count: countByCat["competitor"] ?? 0,
    },
    {
      id: "photos", label: "照片", bg: "#D9EAD9", ready: false,
      art: <ArtPhotos />,
    },
    {
      id: "images", label: "圖像", bg: "#FCEAD0", ready: false,
      art: <ArtImage />,
    },
    {
      id: "icons", label: "圖示", bg: "#E5DAF5", ready: false,
      art: <ArtIcons />,
    },
    {
      id: "charts", label: "圖表", bg: "#D9E6F5", ready: false,
      art: <ArtChart />,
    },
  ];

  const visibleTiles =
    section === "all" ? TILES : TILES.filter((t) => t.id === section);

  const onTileClick = (t: AssetTile) => {
    if (!t.ready) {
      alert(`${t.label}（即將推出）`);
      return;
    }
    setSection(t.id);
  };

  return (
    <main className="pb-16">
      {/* ─── HERO ───────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #C8E8DA 0%, #DDD5F2 45%, #F5D5E2 100%)",
        }}
      >
        <div className="absolute top-5 right-6 z-10">
          <button
            onClick={() => alert("品牌資產同步（即將推出）")}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[0.78rem] text-white rounded-full transition shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
            style={{ background: "#5B3CC8" }}
          >
            <span aria-hidden>✦</span>
            <span>同步品牌資產</span>
          </button>
        </div>

        <div className="max-w-[1280px] mx-auto px-8 pt-20 pb-14">
          <div className="flex items-center justify-center gap-3">
            <div
              className="w-9 h-7 rounded-md"
              style={{ background: "#0A0A0A" }}
              aria-hidden
            />
            <h1 className="font-display text-[2.6rem] leading-[1.05] text-mos-ink tracking-[-0.02em]">
              {brandName} 品牌工具組
            </h1>
          </div>
        </div>
      </section>

      {/* ─── PROMO BANNER ──────────────────────────────────────────────── */}
      <section className="max-w-[1280px] mx-auto px-8 mt-10">
        <div
          className="relative overflow-hidden rounded-2xl px-7 py-7 flex items-center justify-between gap-6"
          style={{ background: "#E1E5FB" }}
        >
          <div className="max-w-[480px]">
            <h2 className="font-display text-[1.25rem] text-mos-ink tracking-[-0.01em]">
              讓你的品牌在不同設計間都生動無比
            </h2>
            <p className="mt-2 text-[0.84rem] text-mos-body leading-relaxed">
              在品牌工具組內即可備妥你的品牌資產與準則。Marketing OS 會自動把它們餵給每位 agent，維持一致的品牌形象。
            </p>
            <button
              onClick={() => setSection("guidelines")}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 text-[0.78rem] text-white rounded-full transition shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
              style={{ background: "#5B3CC8" }}
            >
              <span aria-hidden>👑</span>
              <span>建立品牌準則</span>
            </button>
          </div>

          <div className="hidden md:block relative w-[340px] h-[140px]">
            <div
              className="absolute inset-0 rounded-xl flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, #1FB8B3 0%, #5B3CC8 50%, #E94F7A 100%)",
              }}
            >
              <span className="font-display text-[5rem] text-white tracking-[-0.04em] leading-none">Aa</span>
            </div>
            <div className="absolute -bottom-4 left-6 flex gap-1">
              <span className="w-10 h-3 rounded-sm" style={{ background: "#1F4FD9" }} />
              <span className="w-10 h-3 rounded-sm" style={{ background: "#E94F7A" }} />
              <span className="w-10 h-3 rounded-sm" style={{ background: "#1FB8B3" }} />
              <span className="w-10 h-3 rounded-sm" style={{ background: "#FFD53D" }} />
            </div>
          </div>
        </div>
      </section>

      {/* ─── BODY: left rail + grid ─────────────────────────────────────── */}
      <section className="max-w-[1280px] mx-auto px-8 mt-10 grid grid-cols-[240px_1fr] gap-8">
        {/* Left rail */}
        <aside className="border-r border-mos-hair pr-6">
          <div className="text-[0.62rem] tracking-[0.28em] uppercase text-mos-soft mb-2">
            品牌
          </div>

          {/* Brand switcher */}
          <div className="relative mb-5">
            <button
              onClick={() => setSwitcherOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-white border border-mos-hair rounded-lg hover:border-mos-ink transition"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-5 h-4 rounded-sm bg-mos-ink shrink-0" aria-hidden />
                <span className="text-[0.86rem] text-mos-ink truncate">{brandName}</span>
              </span>
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-mos-muted shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </button>

            {switcherOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setSwitcherOpen(false)} />
                <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-white border border-mos-hair rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.08)] py-1 max-h-[280px] overflow-y-auto">
                  {brands.map((b: any) => (
                    <button
                      key={b.id}
                      onClick={() => { setBrandId(b.id); setSwitcherOpen(false); }}
                      className={[
                        "w-full text-left flex items-center gap-2 px-3 py-2 text-[0.84rem] hover:bg-mos-paper",
                        b.id === brandId ? "text-mos-ink font-medium" : "text-mos-body",
                      ].join(" ")}
                    >
                      <span className="w-4 h-3 rounded-sm bg-mos-ink/80" aria-hidden />
                      <span className="truncate">{b.name}</span>
                    </button>
                  ))}
                  {brands.length === 0 && (
                    <div className="px-3 py-2 text-[0.78rem] text-mos-muted">尚無品牌</div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Sub-nav */}
          <nav className="flex flex-col gap-0.5">
            {SUBNAV.map((s) => {
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={[
                    "flex items-center justify-between px-3 py-2 rounded-lg text-[0.86rem] transition",
                    active
                      ? "bg-mos-ink text-white"
                      : "text-mos-body hover:bg-mos-paper hover:text-mos-ink",
                  ].join(" ")}
                >
                  <span>{s.label}</span>
                  {s.badge && (
                    <span
                      className={[
                        "text-[0.6rem] tracking-[0.16em] uppercase px-1.5 py-0.5 rounded-sm",
                        active ? "bg-white/20" : "bg-[#5B3CC8] text-white",
                      ].join(" ")}
                    >
                      {s.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Asset grid */}
        <div>
          <div className="flex items-end justify-between mb-5">
            <h2 className="font-display text-[1.4rem] text-mos-ink tracking-[-0.015em]">
              {section === "all"
                ? "所有資產"
                : SUBNAV.find((s) => s.id === section)?.label}
            </h2>
            <div className="text-[0.78rem] text-mos-muted">
              {section === "all" ? `${TILES.length} 個類別` : "1 個類別"}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {visibleTiles.map((t) => (
              <button
                key={t.id}
                onClick={() => onTileClick(t)}
                className="group text-left overflow-hidden rounded-2xl transition hover:shadow-[0_6px_18px_rgba(0,0,0,0.08)]"
              >
                <div
                  className="relative h-[220px] flex items-center justify-center"
                  style={{ background: t.bg }}
                >
                  {t.art}
                  {!t.ready && (
                    <span className="absolute top-2 right-2 text-[0.58rem] tracking-[0.18em] uppercase bg-white/90 text-mos-muted px-2 py-0.5 rounded-full">
                      即將推出
                    </span>
                  )}
                  {typeof t.count === "number" && t.count > 0 && (
                    <span className="absolute top-2 left-2 text-[0.6rem] tracking-[0.16em] uppercase bg-white/95 text-mos-ink px-2 py-0.5 rounded-full">
                      {t.count} 筆
                    </span>
                  )}
                </div>
                <div className="px-1 pt-3 pb-1 flex items-center justify-between">
                  <span className="text-[0.92rem] text-mos-ink font-medium">
                    {t.label}
                  </span>
                  <span aria-hidden className="text-[0.78rem]" style={{ color: "#5B3CC8" }}>👑</span>
                </div>
              </button>
            ))}
          </div>

          {visibleTiles.length === 0 && (
            <div className="text-[0.82rem] text-mos-muted py-10">沒有資產。</div>
          )}
        </div>
      </section>
    </main>
  );
}

/* ──────────────────────────── inline SVG art ─────────────────────────── */

function ArtTemplates() {
  return (
    <svg viewBox="0 0 200 140" className="w-[80%] h-[80%]">
      <rect x="10" y="20" width="80" height="100" rx="6" fill="#fff"/>
      <rect x="20" y="32" width="50" height="6" rx="2" fill="#FBC4A0"/>
      <rect x="20" y="44" width="40" height="5" rx="2" fill="#F2D7C2"/>
      <path d="M20 80 L40 60 L60 90 L80 70 L80 110 L20 110 Z" fill="#FBC4A0"/>
      <rect x="100" y="20" width="80" height="100" rx="6" fill="#fff"/>
      <circle cx="155" cy="48" r="14" fill="#5B3CC8"/>
      <text x="155" y="53" textAnchor="middle" fontSize="14" fill="#fff" fontWeight="600">CO</text>
      <rect x="110" y="78" width="60" height="5" rx="2" fill="#E5C9DA"/>
      <rect x="110" y="88" width="40" height="5" rx="2" fill="#F1DCE6"/>
    </svg>
  );
}

function ArtLogo() {
  return (
    <svg viewBox="0 0 200 140" className="w-[60%] h-[60%]">
      <circle cx="100" cy="70" r="50" fill="#5B3CC8"/>
      <text x="100" y="80" textAnchor="middle" fontSize="34" fill="#fff" fontWeight="700">CO</text>
    </svg>
  );
}

function ArtColors() {
  const swatches = [
    "#F5A86A", "#E78959", "#D86C5C", "#A23F52",
    "#5B3CC8", "#9A6FE0", "#C9A6F5", "#E8DAF5",
    "#3D9B6B", "#4FB07F", "#7FCAA0", "#B0E0C2",
  ];
  return (
    <div className="grid grid-cols-4 gap-1 w-[70%]">
      {swatches.map((c, i) => (
        <div key={i} className="aspect-square rounded-sm" style={{ background: c }} />
      ))}
    </div>
  );
}

function ArtFonts() {
  return (
    <svg viewBox="0 0 200 140" className="w-[80%] h-[80%]">
      <text x="35" y="80" fontSize="60" fontWeight="700" fill="#3D9B6B">文</text>
      <text x="100" y="80" fontSize="60" fontFamily="Georgia, serif" fontStyle="italic" fontWeight="700" fill="#3D9B6B">A</text>
      <text x="140" y="80" fontSize="60" fontFamily="Georgia, serif" fontStyle="italic" fontWeight="500" fill="#7FCAA0">a</text>
    </svg>
  );
}

function ArtQuote() {
  return (
    <svg viewBox="0 0 200 140" className="w-[70%] h-[70%]">
      <path d="M40 40 Q40 30 50 30 L70 30 Q80 30 80 40 L80 60 Q80 80 60 90 L55 80 Q70 75 70 60 L60 60 Q40 60 40 50 Z" fill="#9A6FE0"/>
      <path d="M105 40 Q105 30 115 30 L135 30 Q145 30 145 40 L145 60 Q145 80 125 90 L120 80 Q135 75 135 60 L125 60 Q105 60 105 50 Z" fill="#9A6FE0"/>
      <rect x="40" y="100" width="120" height="6" rx="3" fill="#C9A6F5"/>
      <rect x="40" y="112" width="80" height="6" rx="3" fill="#E8DAF5"/>
    </svg>
  );
}

function ArtPositioning() {
  return (
    <svg viewBox="0 0 200 140" className="w-[75%] h-[75%]">
      <circle cx="100" cy="70" r="50" fill="none" stroke="#D86C5C" strokeWidth="2" strokeDasharray="3 3"/>
      <circle cx="100" cy="70" r="32" fill="none" stroke="#D86C5C" strokeWidth="2"/>
      <circle cx="100" cy="70" r="14" fill="#D86C5C"/>
      <circle cx="100" cy="70" r="4" fill="#fff"/>
    </svg>
  );
}

function ArtAudience() {
  return (
    <svg viewBox="0 0 200 140" className="w-[80%] h-[80%]" stroke="#3D9B6B" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="60" cy="55" r="14"/>
      <path d="M40 100 Q40 80 60 80 Q80 80 80 100"/>
      <circle cx="140" cy="55" r="14"/>
      <path d="M120 100 Q120 80 140 80 Q160 80 160 100"/>
      <circle cx="100" cy="40" r="10"/>
      <path d="M85 75 Q85 60 100 60 Q115 60 115 75"/>
    </svg>
  );
}

function ArtCompetitor() {
  return (
    <svg viewBox="0 0 200 140" className="w-[80%] h-[80%]">
      <rect x="20" y="80" width="30" height="40" fill="#F0B5C8"/>
      <rect x="60" y="50" width="30" height="70" fill="#E78AA5"/>
      <rect x="100" y="30" width="30" height="90" fill="#D86C5C"/>
      <rect x="140" y="65" width="30" height="55" fill="#F0B5C8"/>
    </svg>
  );
}

function ArtPhotos() {
  return (
    <svg viewBox="0 0 200 140" className="w-[80%] h-[80%]">
      <rect x="20" y="30" width="160" height="90" rx="6" fill="#fff"/>
      <rect x="20" y="30" width="160" height="60" rx="6" fill="#A8D9D2"/>
      <circle cx="155" cy="50" r="8" fill="#FFD53D"/>
      <path d="M20 90 L60 65 L100 90 L130 70 L180 90 L180 90 Z" fill="#3D9B6B"/>
    </svg>
  );
}

function ArtImage() {
  return (
    <svg viewBox="0 0 200 140" className="w-[70%] h-[70%]">
      <circle cx="100" cy="70" r="38" fill="#FFD53D"/>
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * Math.PI * 2) / 12;
        const x1 = 100 + Math.cos(a) * 42;
        const y1 = 70 + Math.sin(a) * 42;
        const x2 = 100 + Math.cos(a) * 58;
        const y2 = 70 + Math.sin(a) * 58;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#F5A86A" strokeWidth="6" strokeLinecap="round"/>;
      })}
      <circle cx="100" cy="70" r="22" fill="#F5A86A"/>
    </svg>
  );
}

function ArtIcons() {
  return (
    <svg viewBox="0 0 200 140" className="w-[80%] h-[80%]" stroke="#5B3CC8" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M40 50 a8 8 0 0 1 16 0 c0 6 -8 8 -8 14 M48 75 v1"/>
      <path d="M95 40 v6 M110 50 v18 a4 4 0 0 1 -4 4 H86 a4 4 0 0 1 -4 -4 V50 H110 Z M91 78 v3 M101 78 v3"/>
      <path d="M150 60 h12 v-6 a4 4 0 0 0 -4 -4 h-4 a4 4 0 0 0 -4 4 V72 a6 6 0 0 0 6 6 h6 a6 6 0 0 0 6 -6 H150"/>
      <path d="M40 110 c0 -6 4 -10 10 -10 c6 0 10 4 10 10"/>
      <path d="M86 100 a8 8 0 0 1 16 0 a8 8 0 0 1 -16 0 Z"/>
      <rect x="148" y="98" width="22" height="16" rx="2"/>
      <path d="M150 102 l9 6 l9 -6"/>
    </svg>
  );
}

function ArtChart() {
  return (
    <svg viewBox="0 0 200 140" className="w-[75%] h-[75%]">
      <path d="M100 70 L100 25 A45 45 0 0 1 145 70 Z" fill="#1F7FD4"/>
      <path d="M100 70 L145 70 A45 45 0 0 1 115 112 Z" fill="#5B3CC8"/>
      <path d="M100 70 L115 112 A45 45 0 0 1 70 100 Z" fill="#E78AA5"/>
      <path d="M100 70 L70 100 A45 45 0 0 1 55 70 Z" fill="#F5A86A"/>
      <path d="M100 70 L55 70 A45 45 0 0 1 100 25 Z" fill="#FFD53D"/>
    </svg>
  );
}
