/**
 * Sales Hub shell — the same frame as OnBrand's ShellLayout (v2/app/shell):
 * a 70px icon rail with the orange workspace switcher, the active layer's
 * mission tray as icon items with hover tooltips, a brand pill top-right and
 * the content area offset 70 / 64. Styles are inline to match ShellLayout.
 *
 * 2026-09-16 (CJ「版型要按照原來 onbrand.sowork.ai：左側策略／內容／成效切換層，
 * 策略底下有品牌、產品、正面用詞、禁用詞、法規更新…；另有總管理看 dashboard」).
 */
import React from "react";
import { createPortal } from "react-dom";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faQuoteLeft,
  faBookOpen,
  faBoxOpen,
  faBrain,
  faBuilding,
  faChartLine,
  faCheck,
  faChevronDown,
  faDatabase,
  faFileLines,
  faGaugeHigh,
  faListCheck,
  faMobileScreen,
  faRightFromBracket,
  faScaleBalanced,
  faShieldHalved,
  faTrophy,
  faUsers,
  faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";
import { faFacebook, faInstagram, faLine, faLinkedin } from "@fortawesome/free-brands-svg-icons";
import OnBrandLogo from "../platform/components/OnBrandLogo";
import { trpc } from "../../lib/trpc";
import { HubLangProvider, useHubLang, type HubLang } from "./lang";

export const HUB_DISCLAIMER =
  "Concept demo built by SoWork OnBrand from publicly available information. Not affiliated with, sponsored or endorsed by ASUS.";

export function useHubTitle(page?: string) {
  React.useEffect(() => {
    const previous = document.title;
    document.title = page ? `${page} · ExpertHub Sales Hub` : "ExpertHub Sales Hub";
    return () => {
      document.title = previous;
    };
  }, [page]);
}

const ICON_W = 70;
const ORANGE = "#F97316";

type LayerId = "hq" | "strategy" | "content" | "performance";

interface TrayItem {
  to: string;
  icon: IconDefinition;
  zh: string;
  en: string;
  /** Extra path prefixes that count as this item (e.g. the run page under a channel). */
  match?: (path: string) => boolean;
}

const LAYERS: Array<{ id: LayerId; icon: IconDefinition; zh: string; en: string; to: string; items: TrayItem[] }> = [
  {
    id: "hq",
    icon: faBuilding,
    zh: "總管理",
    en: "HQ",
    to: "/hub",
    items: [
      { to: "/hub", icon: faGaugeHigh, zh: "儀表板", en: "Dashboard" },
      { to: "/hub/reps", icon: faUsers, zh: "業務名單", en: "Sales reps" },
      { to: "/hub/rep-view", icon: faMobileScreen, zh: "業務 LINE Bot", en: "Rep's LINE bot" },
    ],
  },
  {
    id: "strategy",
    icon: faBrain,
    zh: "策略",
    en: "Strategy",
    to: "/hub/strategy/brand",
    items: [
      { to: "/hub/strategy/brand", icon: faBrain, zh: "品牌", en: "Brand" },
      { to: "/hub/strategy/products", icon: faBoxOpen, zh: "產品", en: "Products" },
      // 2026-09-23 (CJ「可用詞和禁用詞都集合在同一個 mission tray」)。
      { to: "/hub/strategy/wording", icon: faQuoteLeft, zh: "用詞", en: "Wording" },
      { to: "/hub/strategy/regulations", icon: faScaleBalanced, zh: "法規更新", en: "Regulation updates" },
      { to: "/hub/strategy/facts", icon: faDatabase, zh: "市場數據", en: "Market facts" },
    ],
  },
  {
    id: "content",
    icon: faWandMagicSparkles,
    zh: "內容",
    en: "Content",
    to: "/hub/tasks/facebook",
    items: [
      { to: "/hub/tasks/facebook", icon: faFacebook, zh: "Facebook", en: "Facebook" },
      { to: "/hub/tasks/instagram", icon: faInstagram, zh: "Instagram", en: "Instagram" },
      { to: "/hub/tasks/linkedin", icon: faLinkedin, zh: "LinkedIn", en: "LinkedIn" },
      { to: "/hub/tasks/line", icon: faLine, zh: "LINE", en: "LINE" },
      { to: "/hub/content/skills", icon: faBookOpen, zh: "寫作技能庫", en: "Skill library" },
      { to: "/hub/content/checker", icon: faShieldHalved, zh: "合規檢查", en: "Compliance checker" },
      { to: "/hub/content/policies", icon: faListCheck, zh: "政策包", en: "Policy packs" },
    ],
  },
  {
    id: "performance",
    icon: faChartLine,
    zh: "成效",
    en: "Results",
    to: "/hub/performance",
    items: [
      { to: "/hub/performance", icon: faChartLine, zh: "總覽", en: "Overview" },
      { to: "/hub/performance/leaderboard", icon: faTrophy, zh: "業務排行", en: "Leaderboard" },
      { to: "/hub/performance/posts", icon: faFileLines, zh: "貼文成效", en: "Posts" },
    ],
  },
];

function layerForPath(path: string): LayerId {
  if (path.startsWith("/hub/strategy")) return "strategy";
  if (path.startsWith("/hub/tasks") || path.startsWith("/hub/run") || path.startsWith("/hub/content")) return "content";
  if (path.startsWith("/hub/performance")) return "performance";
  return "hq";
}

/** Longest matching prefix wins; exact match for the layer's root item. */
function activeItemFor(items: TrayItem[], path: string): string | null {
  let best: TrayItem | null = null;
  for (const it of items) {
    const hit = path === it.to || path.startsWith(`${it.to}/`);
    if (hit && (!best || it.to.length > best.to.length)) best = it;
  }
  return best?.to ?? null;
}

function RailItem({ item, active, lang, onClick }: { item: TrayItem; active: boolean; lang: HubLang; onClick: () => void }) {
  const [hovered, setHovered] = React.useState(false);
  const [top, setTop] = React.useState(0);
  const ref = React.useRef<HTMLButtonElement>(null);
  const label = lang === "zh" ? item.zh : item.en;
  return (
    <>
      <button
        ref={ref}
        onClick={onClick}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        style={{
          width: 64, height: 44, margin: "1px auto 0",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "none", border: "none", padding: 0, cursor: "pointer",
          color: active ? ORANGE : hovered ? "#374151" : "#9ca3af",
          transition: "color 0.1s", position: "relative",
        }}
        onMouseEnter={() => {
          if (ref.current) {
            const r = ref.current.getBoundingClientRect();
            setTop(r.top + r.height / 2);
          }
          setHovered(true);
        }}
        onMouseLeave={() => setHovered(false)}
      >
        <span
          style={{
            position: "absolute", inset: "4px 6px", borderRadius: 10, pointerEvents: "none",
            background: active ? "rgba(249,115,22,0.10)" : hovered ? "rgba(0,0,0,0.05)" : "transparent",
            transition: "background 0.1s",
          }}
        />
        <span style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, position: "relative" }}>
          <FontAwesomeIcon icon={item.icon} />
        </span>
      </button>
      {hovered &&
        createPortal(
          <div
            style={{
              position: "fixed", left: ICON_W + 10, top, transform: "translateY(-50%)",
              background: "#1f2937", color: "white", fontSize: 12, fontWeight: 500,
              padding: "5px 12px", borderRadius: 7, pointerEvents: "none", zIndex: 9999,
              whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", letterSpacing: "0.01em",
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}

function LayerSwitcher({ current, lang, onNavigate }: { current: LayerId; lang: HubLang; onNavigate: (to: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const cur = LAYERS.find((l) => l.id === current) ?? LAYERS[0];
  return (
    <div ref={wrapRef} style={{ position: "relative", padding: "0 3px 10px", borderBottom: "1px solid #f1f5f9", marginBottom: 8 }}>
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={lang === "zh" ? "切換工作區" : "Switch workspace"}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
          width: "100%", height: 50, border: "none", borderRadius: 12,
          background: ORANGE, color: "#fff", cursor: "pointer", transition: "filter 0.15s ease",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.07)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
      >
        <FontAwesomeIcon icon={cur.icon} style={{ fontSize: 15 }} />
        <span style={{ display: "flex", alignItems: "center", gap: 3, lineHeight: 1 }}>
          <span style={{ fontSize: lang === "zh" ? 12 : 10.5, fontWeight: 800, letterSpacing: "0.02em" }}>{lang === "zh" ? cur.zh : cur.en}</span>
          <FontAwesomeIcon icon={faChevronDown} style={{ fontSize: 7 }} />
        </span>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute", left: "100%", top: 0, marginLeft: 8, width: 188, background: "#fff",
            borderRadius: 12, border: "1px solid #e5e7eb",
            boxShadow: "0 12px 32px rgba(0,0,0,0.14), 0 4px 8px rgba(0,0,0,0.04)", padding: 6, zIndex: 60,
          }}
        >
          {LAYERS.map((opt) => {
            const active = opt.id === current;
            return (
              <button
                key={opt.id}
                role="menuitem"
                onClick={() => { setOpen(false); onNavigate(opt.to); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px",
                  border: "none", borderRadius: 8, textAlign: "left",
                  background: active ? "#FFF7ED" : "transparent", color: active ? "#C2410C" : "#374151",
                  cursor: "pointer", transition: "background 0.12s ease",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#f9fafb"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <FontAwesomeIcon icon={opt.icon} style={{ fontSize: 14, width: 16 }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: active ? 800 : 600 }}>
                  {lang === "zh" ? opt.zh : opt.en}
                  <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: "#9ca3af" }}>{lang === "zh" ? opt.en : opt.zh}</span>
                </span>
                {active && <FontAwesomeIcon icon={faCheck} style={{ fontSize: 12 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LangToggle() {
  const { lang, setLang } = useHubLang();
  const isEn = lang === "en";
  return (
    <button
      onClick={() => setLang(isEn ? "zh" : "en")}
      aria-label={isEn ? "切換為中文" : "Switch to English"}
      title={isEn ? "中文" : "English"}
      style={{
        position: "relative", width: 48, height: 22, borderRadius: 11, border: "1.5px solid #e5e7eb",
        background: "#f9fafb", cursor: "pointer", padding: 0, margin: "0 auto",
      }}
    >
      <span
        style={{
          position: "absolute", top: 1, left: isEn ? 23 : 1, width: 21, height: 17, borderRadius: 9,
          background: ORANGE, transition: "left 0.15s ease",
        }}
      />
      <span style={{ position: "relative", display: "flex", justifyContent: "space-around", fontSize: 10, fontWeight: 800, lineHeight: "19px" }}>
        <span style={{ color: isEn ? "#9ca3af" : "#fff" }}>中</span>
        <span style={{ color: isEn ? "#fff" : "#9ca3af" }}>EN</span>
      </span>
    </button>
  );
}

function AccountButton() {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState<string | null>(null);
  const { lang } = useHubLang();
  React.useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setEmail(j?.user?.email ?? j?.email ?? null))
      .catch(() => undefined);
  }, []);
  const logout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch { /* ignore */ }
    window.location.href = "/auth/login";
  };
  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={lang === "zh" ? "帳號" : "Account"}
        style={{
          width: 36, height: 36, borderRadius: 18, border: "none", cursor: "pointer",
          background: "#171717", color: "#fff", fontSize: 14, fontWeight: 700,
        }}
      >
        {(email ?? "S").charAt(0).toUpperCase()}
      </button>
      {open && (
        <div
          style={{
            position: "fixed", left: ICON_W + 8, bottom: 12, width: 260, background: "#fff", borderRadius: 16,
            border: "1px solid #e5e7eb", boxShadow: "0 12px 32px rgba(0,0,0,0.14)", padding: 12, zIndex: 70,
          }}
        >
          <div style={{ fontSize: 12, color: "#6b7280" }}>{lang === "zh" ? "已登入" : "Signed in as"}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginTop: 2, wordBreak: "break-all" }}>{email ?? "—"}</div>
          <button
            onClick={logout}
            style={{
              marginTop: 10, width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
              borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            <FontAwesomeIcon icon={faRightFromBracket} /> {lang === "zh" ? "登出" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

function BrandPill() {
  const [open, setOpen] = React.useState(false);
  const { lang } = useHubLang();
  const strategy = trpc.hub.admin.strategy.useQuery(undefined, { staleTime: 60_000, enabled: open });
  const wording = trpc.hub.admin.wording.useQuery(undefined, { staleTime: 30_000, enabled: open });
  const count = (kind: string) => (wording.data?.items ?? []).filter((w: any) => w.kind === kind).length;
  const rows: Array<[string, React.ReactNode]> = [
    [lang === "zh" ? "方案" : "Solutions", strategy.data?.solutions.length ?? "…"],
    [lang === "zh" ? "市場數據" : "Market facts", strategy.data?.facts.length ?? "…"],
    [lang === "zh" ? "正面用詞" : "Preferred terms", wording.data ? count("preferred") + count("swap") : "…"],
    [lang === "zh" ? "禁用詞" : "Banned words", wording.data ? count("banned") : "…"],
  ];
  return (
    <div style={{ position: "fixed", right: 12, top: 10, zIndex: 50, width: "min(280px, calc(100vw - 90px))" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", height: 40, borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)", display: "flex", alignItems: "center", gap: 8, padding: "0 10px", cursor: "pointer",
        }}
      >
        <span style={{ width: 24, height: 24, borderRadius: 6, background: "#111827", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
          EH
        </span>
        <span style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: 700, color: "#1f2937", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          ASUS ExpertHub
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#9a3412", background: "#FFF7ED", borderRadius: 4, padding: "2px 5px" }}>
          {lang === "zh" ? "概念示範" : "Concept demo"}
        </span>
        <FontAwesomeIcon icon={faChevronDown} style={{ fontSize: 10, color: "#9ca3af" }} />
      </button>
      {open && (
        <div
          style={{
            marginTop: 6, background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
            boxShadow: "0 12px 32px rgba(0,0,0,0.14)", padding: 12,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#9ca3af", textTransform: "uppercase" }}>
            {lang === "zh" ? "品牌大腦" : "Brand brain"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            {rows.map(([k, v]) => (
              <div key={k} style={{ border: "1px solid #f3f4f6", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#111827", fontVariantNumeric: "tabular-nums" }}>{v}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{k}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.5, color: "#9ca3af" }}>{HUB_DISCLAIMER}</div>
        </div>
      )}
    </div>
  );
}

function ShellFrame() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { lang } = useHubLang();
  const layerId = layerForPath(pathname);
  const layer = LAYERS.find((l) => l.id === layerId)!;
  const activeTo = activeItemFor(layer.items, pathname);
  useHubTitle();

  return (
    <div className="min-h-screen" style={{ background: "rgb(252,251,254)" }}>
      <aside
        style={{
          position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 40, width: ICON_W, background: "#fff",
          borderRight: "1px solid #f3f4f6", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          <OnBrandLogo glyphOnly size={32} onClick={() => navigate("/hub")} />
          <span
            style={{
              position: "absolute", top: 4, right: 4, fontSize: 8, fontWeight: 800, color: "#fff",
              background: "#C2410C", padding: "1.5px 4px", borderRadius: 3, letterSpacing: "0.04em",
            }}
          >
            DEMO
          </span>
        </div>
        <LayerSwitcher current={layerId} lang={lang} onNavigate={navigate} />
        <nav style={{ flex: 1, overflowY: "auto", padding: "0 3px", scrollbarWidth: "none" }} aria-label={lang === "zh" ? layer.zh : layer.en}>
          {layer.items.map((it) => (
            <RailItem key={it.to} item={it} lang={lang} active={activeTo === it.to} onClick={() => navigate(it.to)} />
          ))}
        </nav>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 0 14px" }}>
          <LangToggle />
          <AccountButton />
        </div>
      </aside>

      <BrandPill />

      <div style={{ paddingLeft: ICON_W, paddingTop: 64 }}>
        <main className="mx-auto min-w-0 max-w-[1320px] px-4 pb-6 md:px-6">
          <Outlet />
          <footer className="mt-12 border-t border-neutral-200 pb-8 pt-6 text-center text-[12px] text-neutral-400">{HUB_DISCLAIMER}</footer>
        </main>
      </div>
    </div>
  );
}

export default function HubShell() {
  return (
    <HubLangProvider>
      <ShellFrame />
    </HubLangProvider>
  );
}
