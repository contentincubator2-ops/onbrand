/**
 * LandingPage — public marketing page at "/".
 *
 * 2026-06-12 (CJ direction「插畫風格參考 www.sowork.ai」):
 *   Redesigned with SoWork.ai's editorial-illustration visual language:
 *     - Warm cream background (#F7F2EB) instead of white
 *     - Orange (#E85D2E) primary accent instead of purple gradient
 *     - Heavy black headlines with stacked two-line composition
 *     - Pill chip above headline
 *     - Flat 2D illustration with thick black strokes on right side
 *     - Subtle dot-grid background texture
 *     - Black stats bar at bottom with tabular numerals
 *
 * Auth-check: logged-in users redirect to /home.
 */
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLang } from "../../../lib/i18n";

// 2026-06-12 (SEO perf): hover-prefetch the auth chunks. By the time
// a user clicks "Start free" or "Sign in", the chunk is already cached
// and Suspense fallback never flashes. Fire on mouseenter / focus / touchstart.
// Failures (already loaded, network blip) are silently swallowed.
const prefetchRegister = () => { import("../../../pages/auth/RegisterPage").catch(() => {}); };
const prefetchLogin = () => { import("../../../pages/auth/LoginPage").catch(() => {}); };
const prefetchProps = (fn: () => void) => ({
  onMouseEnter: fn,
  onFocus: fn,
  onTouchStart: fn,
});

// 2026-06-12 (SEO perf): HeroIllustration is desktop-only (hidden lg:flex
// on its parent). Lazy-load it as a separate chunk so mobile visitors —
// where it's invisible anyway — never pay the bytes.
const LazyHeroIllustration = React.lazy(() => import("./LandingHeroIllustration"));

// Tiny hook: returns true when viewport ≥ 1024px (Tailwind `lg` breakpoint).
// SSR-safe (returns false until mounted). No useEffect cleanup leaks.
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

// ── SoWork.ai design tokens ──────────────────────────────────────────────
const C = {
  cream: "#F7F2EB",       // page background
  ink: "#0F0F0E",          // headlines, primary text
  inkSoft: "#3A3633",      // body text
  muted: "#6B6660",        // tertiary text
  orange: "#E85D2E",       // primary CTA, accent
  orangeDark: "#C84516",   // hover
  orangeChip: "#FDE6D8",   // pill chip background
  border: "#E8DECC",       // warm border
  borderSoft: "#EFE7D6",   // softer border
  white: "#FFFFFF",
};

export default function LandingPage() {
  const { lang, setLang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  React.useEffect(() => {
    let dead = false;
    fetch("/api/auth/me", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(async (r) => {
        if (dead) return;
        if (!r.ok) return;
        // 2026-07-15 (activation Leak A): send brandless users (incl. OAuth
        // first-login) into guided brand creation, not the empty /theater.
        let brandCount = 1;
        try { brandCount = Number((await r.json())?.brandCount ?? 1); } catch {}
        if (dead) return;
        navigate(brandCount > 0 ? "/home" : "/brands?all=1", { replace: true });
      })
      .catch(() => {});
    document.title = en
      ? "OnBrand · Always on-brand. Your AI marketing studio."
      : "OnBrand · 永遠 on-brand · 你的 AI 行銷工作室";
    const m =
      document.querySelector('meta[name="description"]') ??
      (() => {
        const e = document.createElement("meta");
        e.setAttribute("name", "description");
        document.head.appendChild(e);
        return e;
      })();
    m.setAttribute(
      "content",
      en
        ? "Lock your brand positioning once. Every caption stays on-brand. Brand Brain · Single/Pack/Campaign · 7-Day Publisher · 249 task cards, 208 with a stated source."
        : "鎖定一次品牌定位，每篇貼文自動 on-brand。品牌大腦 · 單篇/套組/企劃 · 七日發布台 · 249 張任務卡，208 張有出處。",
    );
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [en]);

  // Bottom stats bar (mirrors sowork.ai's "44+ / 2,526 / 187..." strip)
  const STATS = en
    ? [
        ["16,113", "AI Marketing Agents"],
        ["249", "Task Cards · 208 Sourced"],
        ["711", "Specialized Squads"],
        ["2,526", "Skill Modules"],
        ["60", "Award Cases"],
        ["14", "Steps to Brand Brain"],
        ["11", "Channels"],
      ]
    : [
        ["16,113", "個 AI 行銷專家"],
        ["249", "張任務卡 · 208 張有出處"],
        ["711", "個專屬軍團"],
        ["2,526", "個技能模組"],
        ["60", "個得獎案例"],
        ["14", "步建品牌大腦"],
        ["11", "個通路"],
      ];

  // 4 core USPs (single source of truth; mirrors Login/Register)
  const FEATURES = en
    ? [
        ["01", "Brand Brain", "Lock your positioning once. Every post stays on-brand."],
        ["02", "Content Tiers", "A single post · a content pack · a full campaign."],
        ["03", "7-Day Publisher", "Schedule a whole week across channels in one click."],
        ["04", "Sourced", "249 task cards — 208 with a stated structural source."],
      ]
    : [
        ["01", "品牌大腦", "鎖定一次品牌定位 · 每篇貼文自動 on-brand"],
        ["02", "三種規格", "單篇內容 · 內容套組 · 完整企劃"],
        ["03", "七日發布台", "一次排好 7 天 × 全平台內容"],
        ["04", "有出處", "249 張任務卡，208 張說得出結構出處"],
      ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.cream }}>

      {/* ── Top nav ─────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-6 lg:px-12 py-5"
        style={{ borderBottom: `1px solid ${C.borderSoft}` }}
      >
        <div className="flex items-center gap-2">
          {/* SoWork-style droplet logo */}
          <svg width="24" height="28" viewBox="0 0 24 28" fill="none" aria-hidden>
            <path
              d="M12 2 C 16 8, 22 14, 22 19 A 10 10 0 0 1 2 19 C 2 14, 8 8, 12 2 Z"
              fill={C.orange}
              stroke={C.ink}
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[20px] font-extrabold" style={{ color: C.ink }}>
            OnBrand<span style={{ color: C.orange }}>.ai</span>
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium" style={{ color: C.inkSoft }}>
          <a href="#features" className="hover:opacity-70 transition">
            {en ? "Product" : "產品"}
          </a>
          <a href="#how" className="hover:opacity-70 transition">
            {en ? "How it works" : "運作方式"}
          </a>
          <Link to="/pricing" className="hover:opacity-70 transition">
            {en ? "Pricing" : "定價"}
          </Link>
          <Link to="/changelog" className="hover:opacity-70 transition">
            {en ? "Updates" : "觀點"}
          </Link>
          <button
            onClick={() => setLang(en ? "zh-TW" : "en")}
            className="hover:opacity-70 transition"
          >
            {en ? "繁中" : "EN"}
          </button>
          <Link
            to="/auth/login"
            {...prefetchProps(prefetchLogin)}
            className="px-4 py-2 rounded-lg font-semibold transition"
            style={{
              border: `1.5px solid ${C.ink}`,
              color: C.ink,
            }}
          >
            {en ? "Sign in" : "登入"}
          </Link>
        </nav>
      </header>

      {/* ── Main hero: split 55/45 ──────────────────────────────────── */}
      <main className="flex-1 relative">
        {/* Subtle dot-grid background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle, ${C.ink} 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
            opacity: 0.045,
          }}
          aria-hidden
        />

        <div className="relative flex flex-col lg:flex-row max-w-[1400px] mx-auto px-6 lg:px-12 py-12 lg:py-16 gap-10 lg:gap-8 items-center">

          {/* ── Left: copy + CTAs (55%) ───────────────────────────── */}
          <div className="w-full lg:w-[55%]">
            {/* Pill chip */}
            <div
              className="inline-block text-[12px] font-bold px-3 py-1.5 rounded-md mb-6"
              style={{
                background: C.orangeChip,
                color: C.orangeDark,
              }}
            >
              {en ? "Marketing's Forward Deployed Engineer" : "行銷界的 Forward Deployed Engineer"}
            </div>

            {/* Hero headline — heavy, two-line stacked */}
            <h1
              className="font-black tracking-tight leading-[1.05] mb-6"
              style={{
                color: C.ink,
                fontSize: "clamp(2.4rem, 5.4vw, 4.2rem)",
                letterSpacing: "-0.02em",
              }}
            >
              {en ? (
                <>
                  Always
                  <br />
                  on-brand.
                </>
              ) : (
                <>
                  永遠 on-brand
                  <br />
                  的 AI 行銷工作室
                </>
              )}
            </h1>

            {/* Sub-lead */}
            <p
              className="text-[17px] leading-[1.7] mb-3 max-w-[540px] font-medium"
              style={{ color: C.ink }}
            >
              {en
                ? "Agent: 16,113 AI experts · Skill: 249 sourced task cards · Data: your locked Brand Brain"
                : "Agent：16,113 個 AI 專家 · Skill：249 張有出處的任務卡 · Data：你鎖定的品牌大腦"}
            </p>
            <p
              className="text-[15px] leading-[1.75] mb-8 max-w-[540px]"
              style={{ color: C.muted }}
            >
              {en
                ? "OnBrand isn't another one-click AI generator. SoWork's 14-step Brand Positioning Method writes your Why, TA, Differentiation and Voice into a Brand Brain. Set it once. Every channel — Facebook, Instagram, YouTube, TikTok, Email, PR — stays on-brand automatically. We don't hand you content — we deploy your strategy to every touchpoint."
                : "OnBrand 不是另一個「AI 一鍵生成」工具。SoWork 14 步品牌定位法把你的 WHY、TA、差異化、Voice 全部寫進品牌大腦。鎖定一次，所有平台（FB、IG、YouTube、TikTok、EDM、PR）都自動跟著你的調性走。我們給你的不是內容，是把你的品牌策略部署到每一個接觸點。"}
            </p>

            {/* CTAs — primary orange + secondary ghost */}
            <div className="flex flex-wrap gap-3 mb-10">
              <Link
                to="/auth/register"
                {...prefetchProps(prefetchRegister)}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-[15px] font-bold transition-transform hover:-translate-y-0.5"
                style={{
                  background: C.orange,
                  color: C.white,
                  boxShadow: `0 6px 0 ${C.orangeDark}`,
                }}
              >
                {en ? "Start free trial" : "免費試用"}
                <span aria-hidden>→</span>
              </Link>
              <Link
                to="/auth/login"
                {...prefetchProps(prefetchLogin)}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-[15px] font-bold transition hover:bg-white"
                style={{
                  background: "transparent",
                  color: C.ink,
                  border: `2px solid ${C.ink}`,
                }}
              >
                {en ? "Sign in" : "已有帳號 · 登入"}
                <span aria-hidden>→</span>
              </Link>
            </div>

            {/* 4 USP mini-cards */}
            <div id="features" className="grid grid-cols-2 gap-3 max-w-[540px]">
              {FEATURES.map(([n, title, desc]) => (
                <div
                  key={n}
                  className="p-4 rounded-xl transition hover:-translate-y-0.5"
                  style={{
                    background: C.white,
                    border: `1.5px solid ${C.ink}`,
                  }}
                >
                  <div
                    className="text-[12px] font-black tracking-[0.2em] mb-2"
                    style={{ color: C.orange }}
                  >
                    {n}
                  </div>
                  <div
                    className="text-[14px] font-bold mb-1 leading-snug"
                    style={{ color: C.ink }}
                  >
                    {title}
                  </div>
                  <div
                    className="text-[12px] leading-relaxed"
                    style={{ color: C.muted }}
                  >
                    {desc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: editorial illustration (45%, desktop-only) ─── */}
          <div className="w-full lg:w-[45%] flex justify-center lg:justify-end">
            {isDesktop && (
              <React.Suspense fallback={
                <div
                  className="rounded-3xl w-full max-w-[520px] aspect-[460/380]"
                  style={{ background: "#FAEBD9", border: `2.5px dashed ${C.ink}40` }}
                  aria-label={en ? "Loading illustration" : "插畫載入中"}
                />
              }>
                <LazyHeroIllustration en={en} />
              </React.Suspense>
            )}
          </div>
        </div>
      </main>

      {/* ── Bottom stats bar ───────────────────────────────────────── */}
      <section
        id="how"
        className="overflow-x-auto"
        style={{ background: C.ink, color: C.white }}
      >
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-6 flex items-center gap-8 lg:gap-12 min-w-max lg:min-w-0 lg:justify-between">
          {STATS.map(([num, label]) => (
            <div key={label} className="flex items-center gap-2 whitespace-nowrap">
              <div
                className="text-[26px] lg:text-[30px] font-black tabular-nums"
                style={{ color: C.orange, letterSpacing: "-0.02em" }}
              >
                {num}
              </div>
              <div className="text-[12px] lg:text-[12px] opacity-70 leading-tight max-w-[80px]">
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ section (also mirrored in FAQPage JSON-LD in index.html) ─ */}
      <FAQSection en={en} />

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer
        className="py-10 text-center text-[12px]"
        style={{
          background: C.cream,
          color: C.muted,
          borderTop: `1px solid ${C.borderSoft}`,
        }}
      >
        <div className="max-w-[1400px] mx-auto px-6">
          {/* Brand mark */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <svg width="18" height="22" viewBox="0 0 24 28" fill="none" aria-hidden>
              <path
                d="M12 2 C 16 8, 22 14, 22 19 A 10 10 0 0 1 2 19 C 2 14, 8 8, 12 2 Z"
                fill={C.orange}
                stroke={C.ink}
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-[15px] font-extrabold" style={{ color: C.ink }}>
              OnBrand<span style={{ color: C.orange }}>.ai</span>
            </span>
          </div>

          {/* Social icons */}
          <div className="flex items-center justify-center gap-3 mb-5">
            <SocialIcon
              href="https://www.facebook.com/SoWorkAI"
              label="Facebook"
              ink={C.ink}
              orange={C.orange}
              path="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.89h-2.33v6.99A10 10 0 0 0 22 12z"
            />
            <SocialIcon
              href="https://www.instagram.com/sowork.ai/"
              label="Instagram"
              ink={C.ink}
              orange={C.orange}
              path="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38a3.7 3.7 0 0 1-1.38.9c-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.85 5.85 0 0 0-2.13 1.38A5.85 5.85 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91a5.85 5.85 0 0 0 1.38 2.13 5.85 5.85 0 0 0 2.13 1.38c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.85 5.85 0 0 0 2.13-1.38 5.85 5.85 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.85 5.85 0 0 0-1.38-2.13A5.85 5.85 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 5.84A6.16 6.16 0 1 0 12 18.16 6.16 6.16 0 0 0 12 5.84zm0 10.16A4 4 0 1 1 12 8a4 4 0 0 1 0 8zm6.4-11.85a1.44 1.44 0 1 1 0 2.88 1.44 1.44 0 0 1 0-2.88z"
            />
            <SocialIcon
              href="https://www.youtube.com/@SoWorkAI"
              label="YouTube"
              ink={C.ink}
              orange={C.orange}
              path="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8A3 3 0 0 0 2.6 20c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"
            />
            <SocialIcon
              href="https://www.linkedin.com/company/sowork-ai/"
              label="LinkedIn"
              ink={C.ink}
              orange={C.orange}
              path="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.61 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.99 0 1.78-.77 1.78-1.72V1.72C24 .77 23.21 0 22.22 0z"
            />
            <SocialIcon
              href="https://www.sowork.ai/"
              label="SoWork.ai"
              ink={C.ink}
              orange={C.orange}
              path="M12 2 C 16 8, 22 14, 22 19 A 10 10 0 0 1 2 19 C 2 14, 8 8, 12 2 Z"
              filled
            />
          </div>

          {/* Footer links */}
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mb-3">
            <Link to="/pricing" className="hover:opacity-70">{en ? "Pricing" : "方案"}</Link>
            <span className="opacity-30">·</span>
            <Link to="/changelog" className="hover:opacity-70">{en ? "Updates" : "更新日誌"}</Link>
            <span className="opacity-30">·</span>
            <Link to="/terms" className="hover:opacity-70">{en ? "Terms" : "服務條款"}</Link>
            <span className="opacity-30">·</span>
            <Link to="/privacy" className="hover:opacity-70">{en ? "Privacy" : "隱私權"}</Link>
            <span className="opacity-30">·</span>
            <Link to="/refund" className="hover:opacity-70">{en ? "Refund" : "退款"}</Link>
            <span className="opacity-30">·</span>
            <a href="mailto:sowork@sowork.ai" className="hover:opacity-70">sowork@sowork.ai</a>
          </div>

          {/* Operator / parent */}
          <div className="text-[12px] opacity-60 leading-relaxed">
            {en ? (
              <>
                Operated by SoWork 摘星社群行銷顧問股份有限公司 · Service area: Taiwan
                <br />
                © {new Date().getFullYear()} SoWork · OnBrand. All rights reserved.
              </>
            ) : (
              <>
                營運者：SoWork 摘星社群行銷顧問股份有限公司 · 服務地區：台灣
                <br />
                © {new Date().getFullYear()} SoWork · OnBrand. 版權所有。
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SocialIcon — flat-stroke icon button that matches the editorial style:
// thick black-bordered round button with orange hover.
// ─────────────────────────────────────────────────────────────────────────
function SocialIcon({
  href, label, path, ink, orange, filled,
}: {
  href: string;
  label: string;
  path: string;
  ink: string;
  orange: string;
  filled?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex items-center justify-center w-9 h-9 rounded-full transition hover:-translate-y-0.5"
      style={{
        background: "#FFFFFF",
        border: `1.5px solid ${ink}`,
        color: ink,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = orange; (e.currentTarget as HTMLAnchorElement).style.color = "#fff"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "#fff"; (e.currentTarget as HTMLAnchorElement).style.color = ink; }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "currentColor"} aria-hidden>
        <path d={path} />
      </svg>
    </a>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// FAQSection — 7 FAQs that mirror the FAQPage JSON-LD in index.html.
// Accordion pattern (click to expand). Cream bg, thick black borders.
// ─────────────────────────────────────────────────────────────────────────
function FAQSection({ en }: { en: boolean }) {
  const FAQS = en
    ? [
        {
          q: "How is OnBrand different from ChatGPT for writing copy?",
          a: "ChatGPT starts from a blank page every time, so the longer you use it the more off-brand it drifts. OnBrand runs SoWork's 14-step Brand Positioning Method first — your Why, your audience, your differentiation, your voice — and locks the result into a Brand Brain. Every caption afterwards is built on that single source of truth, so it sounds like you, on every platform.",
        },
        {
          q: "How long does it take to get started?",
          a: "The 14-step positioning flow takes about 10 minutes. After that, your first post is ready in 30 seconds, a multi-platform pack in 60, and a full campaign in 99.",
        },
        {
          q: "What kind of brands is OnBrand for?",
          a: "F&B, fashion, beauty, wellness, tech, pet, real estate, education — any SMB brand, in-house marketing team, or agency-of-one that wants every caption to stay on-brand.",
        },
        {
          q: "Which channels does OnBrand support?",
          a: "Facebook, Instagram, YouTube, TikTok, Email (EDM), PR press releases, LinkedIn, and brand strategy — seven channels total. Each has its own task library with documented award craft.",
        },
        {
          q: "Is there a free trial?",
          a: "Yes — a 7-day / 1,000-point dual-limit trial, no credit card required. Start by completing the 14-step Brand Positioning flow.",
        },
        {
          q: "What's the relationship between OnBrand and SoWork?",
          a: "OnBrand is the AI product built by SoWork (摘星社群行銷顧問股份有限公司), a Taiwan-based brand marketing consultancy. OnBrand encodes SoWork's accumulated methodology into a self-serve tool.",
        },
        {
          q: "What does 'sourced' mean for the 249 task cards?",
          a: "208 of the 249 task cards state where their structure comes from: 99 are deconstructed from named award-winning work (FB ad copy uses Aviation Gin's anti-consensus framing, Cannes Lions Silver; the IG Reels script uses Adobe's Unfinished-Film open invitation), 63 from named benchmark brands or methodologies, and 46 from real viral content with the spread metric and the month measured. The other 41 are platform conventions — we say plainly they have no source. The publishing check is hard: a card that cannot name its award or produce its numbers fails the automated tests.",
        },
      ]
    : [
        {
          q: "OnBrand 跟 ChatGPT 寫文案有什麼差別？",
          a: "ChatGPT 每篇都從空白頁從零開始，所以越用越不像你的品牌。OnBrand 先用 SoWork 14 步品牌定位法把你的 WHY、TA、差異化、Voice 寫進品牌大腦，之後每篇文案都以這份大腦為骨架自動產出——所有平台都跟著你的調性走，不會「越寫越歪」。",
        },
        {
          q: "我需要多久時間才能上手？",
          a: "14 步品牌定位流程約 10 分鐘完成。完成後即可產出單篇貼文、跨平台內容套組，或完整的活動企劃。",
        },
        {
          q: "OnBrand 適合哪些行業？",
          a: "餐飲、服飾、美妝、健康、科技、寵物、房產、教育——任何有自己品牌定位的台灣中小企業、行銷代理商、in-house 行銷專員都適用。",
        },
        {
          q: "支援哪些社群與內容平台？",
          a: "Facebook、Instagram、YouTube、TikTok、LinkedIn、Email（EDM）、PR 新聞稿、官網、KOL、品牌策略、受眾——共 11 個通路。每張任務卡都標示出處類型：得獎案例、標竿品牌、爆款結構或平台通則。",
        },
        {
          q: "有免費試用嗎？",
          a: "有，7 天 / 1,000 點雙限試用，免綁信用卡。完成註冊即可開始 14 步品牌定位流程。",
        },
        {
          q: "OnBrand 和 SoWork 是什麼關係？",
          a: "OnBrand 是 SoWork（摘星社群行銷顧問股份有限公司）推出的 AI 產品。SoWork 是台灣資深品牌行銷顧問公司，把累積多年的方法論做成 AI 工具，就是 OnBrand。",
        },
        {
          q: "任務卡的「出處」是什麼？",
          a: "249 張任務卡裡有 208 張說得出結構出處：99 張拆自具名得獎作品（例如 FB 廣告主文用 Aviation Gin（Cannes Lions Silver）的反共識前置、IG Reels 腳本用 Adobe《The Unfinished Film》的開放邀請）、63 張拆自具名標竿品牌或方法論、46 張拆自真實爆紅內容並附傳播數字與量測年月。另外 41 張是平台通則，我們明講它沒有出處。上架檢核是硬性的：說不出獎項、交不出數字的卡，自動化測試直接擋掉。",
        },
      ];

  const [openIdx, setOpenIdx] = React.useState<number | null>(0);

  return (
    <section
      id="faq"
      className="py-16 lg:py-20 relative"
      style={{ background: "#FAF5EC", borderTop: `1px solid #EFE7D6` }}
    >
      <div className="max-w-3xl mx-auto px-6">
        {/* Pill chip */}
        <div className="text-center mb-3">
          <span
            className="inline-block text-[12px] font-bold px-3 py-1.5 rounded-md"
            style={{ background: "#FDE6D8", color: "#C84516" }}
          >
            FAQ
          </span>
        </div>

        {/* Section headline */}
        <h2
          className="text-center font-black tracking-tight mb-3"
          style={{
            color: "#0F0F0E",
            fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)",
            letterSpacing: "-0.02em",
          }}
        >
          {en ? "Common questions, straight answers." : "常被問的，直接回你。"}
        </h2>
        <p className="text-center text-[14px] mb-10" style={{ color: "#6B6660" }}>
          {en
            ? "Still curious? Email sowork@sowork.ai — we reply within one business day."
            : "還沒回答到你的問題？寄信給 sowork@sowork.ai，一個工作天內回覆。"}
        </p>

        {/* Accordion */}
        <div className="space-y-3">
          {FAQS.map((faq, i) => {
            const isOpen = openIdx === i;
            return (
              <div
                key={i}
                className="rounded-xl overflow-hidden transition"
                style={{
                  background: "#FFFFFF",
                  border: `1.5px solid #0F0F0E`,
                  boxShadow: isOpen ? "4px 4px 0 #0F0F0E" : "none",
                }}
              >
                <button
                  onClick={() => setOpenIdx(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[#FAF5EC]"
                  aria-expanded={isOpen}
                >
                  <span
                    className="font-bold text-[15px] leading-snug"
                    style={{ color: "#0F0F0E" }}
                  >
                    {faq.q}
                  </span>
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-black text-[14px] transition-transform"
                    style={{
                      background: isOpen ? "#E85D2E" : "#FDE6D8",
                      color: isOpen ? "#FFFFFF" : "#C84516",
                      transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
                    }}
                  >
                    +
                  </span>
                </button>
                {isOpen && (
                  <div
                    className="px-5 pb-5 text-[14px] leading-[1.8]"
                    style={{ color: "#3A3633", borderTop: `1px solid #EFE7D6` }}
                  >
                    <div className="pt-4">{faq.a}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-10">
          <Link
            to="/auth/register"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-[15px] font-bold transition-transform hover:-translate-y-0.5"
            style={{
              background: "#E85D2E",
              color: "#FFFFFF",
              boxShadow: "0 6px 0 #C84516",
            }}
          >
            {en ? "Start free trial" : "免費試用"} <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
