/**
 * LandingPage — public marketing page at "/".
 *
 * 2026-09-30（CJ 產品頁改版，正名 onBrand Studio）：
 *   定位＝「經過訓練與認證的 AI 行銷團隊」，優勢三支柱：
 *     懂品牌大腦 ＋ 擁有任務庫 ＋ 整合公司的 AI 技能。
 *   順序（CJ 確認）：
 *     0 Hero：一句定位＋真實截圖（本週企劃），不要插畫
 *     1 痛點對照：一般 AI 工具 vs onBrand Studio
 *     2 三支柱，各配一張實際畫面
 *     3 本月爆款卡牆：landing.showcase 即時拿，跟目錄一起每月換
 *     4 七個通路＋規格圖卡
 *     5 方案：基礎版當入口、企業客製版＝專屬行銷維運團隊（建置費＋月費）
 *     6 FAQ（index.html 的 FAQPage JSON-LD 是鏡像，改這裡要一起改）
 *   語氣：平視。痛點寫成行業現況，不寫成用戶的缺點（不要「請不起…」）。
 *
 *   截圖放在 /static/landing/，取自 dev 站 SoWork 品牌（brand 2977）的真實畫面。
 *
 * Auth-check: logged-in users redirect to /planner.
 */
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLang } from "../../../lib/i18n";
import { trpc } from "../../../lib/trpc";
import { CATALOG } from "../lib/catalogFigures";
import { Icon, type IconName } from "../components/icons";

// 2026-06-12 (SEO perf): hover-prefetch the auth chunks. By the time
// a user clicks "Start free" or "Sign in", the chunk is already cached
// and Suspense fallback never flashes. Fire on mouseenter / focus / touchstart.
// Failures (already loaded, network blip) are silently swallowed.
const prefetchRegister = () => { import("./auth/RegisterPage").catch(() => {}); };
const prefetchLogin = () => { import("./auth/LoginPage").catch(() => {}); };
const prefetchProps = (fn: () => void) => ({
  onMouseEnter: fn,
  onFocus: fn,
  onTouchStart: fn,
});

// ── SoWork.ai design tokens ──────────────────────────────────────────────
const C = {
  cream: "#F7F2EB",       // page background
  creamDeep: "#FAF5EC",   // alternate section background
  ink: "#0F0F0E",          // headlines, primary text
  inkSoft: "#3A3633",      // body text
  muted: "#6B6660",        // tertiary text
  orange: "#F37E4A",       // primary CTA, accent
  orangeDark: "#C84516",   // hover
  orangeChip: "#FDE6D8",   // pill chip background
  border: "#E8DECC",       // warm border
  borderSoft: "#EFE7D6",   // softer border
  white: "#FFFFFF",
};

/** 首頁「規格圖卡」那一段列的通路（有圖片規格的七個；新聞稿沒有規格圖卡，不列）。 */
const CHANNELS: { id: string; icon: IconName; zh: string; en: string }[] = [
  { id: "facebook", icon: "facebook", zh: "Facebook", en: "Facebook" },
  { id: "instagram", icon: "instagram", zh: "Instagram", en: "Instagram" },
  { id: "threads", icon: "threads", zh: "Threads", en: "Threads" },
  { id: "line", icon: "line", zh: "LINE", en: "LINE" },
  { id: "tiktok", icon: "tiktok", zh: "TikTok", en: "TikTok" },
  { id: "email", icon: "newsletter", zh: "電子報", en: "Email" },
  { id: "website", icon: "website", zh: "官網", en: "Website" },
];
const channelOf = (id: string) => CHANNELS.find((c) => c.id === id);

export default function LandingPage() {
  const { lang, setLang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();

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
        // first-login) into guided brand creation, not an empty planner.
        let brandCount = 1;
        try { brandCount = Number((await r.json())?.brandCount ?? 1); } catch {}
        if (dead) return;
        navigate(brandCount > 0 ? "/planner" : "/brands?all=1", { replace: true });
      })
      .catch(() => {});
    document.title = en
      ? "onBrand Studio · A trained, certified AI marketing team"
      : "onBrand Studio｜經過訓練與認證的 AI 行銷團隊";
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
        ? "onBrand Studio is a trained, certified AI marketing team: it knows your Brand Brain, carries a task library refreshed monthly, and can take on your company's own AI skills. Copy and images for 8 channels, done by one team. 7-day free trial, no card."
        : "onBrand Studio 是經過訓練與認證的 AI 行銷團隊：懂你的品牌大腦、擁有每月更新的任務庫，還能整合貴公司自己的 AI 技能。FB、IG、Threads、LINE、TikTok、電子報、官網、新聞稿八個通路的文案與圖片，一支團隊完成。7 天免費試用，免綁卡。",
    );
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [en]);

  // 本月爆款卡牆與規格圖卡：跟任務目錄同一份資料，每月自動換。
  const showcase = trpc.landing.showcase.useQuery(undefined, { staleTime: 60 * 60 * 1000, retry: 1 });

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.cream }}>

      {/* ── Top nav ─────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-6 lg:px-12 py-5"
        style={{ borderBottom: `1px solid ${C.borderSoft}` }}
      >
        <BrandMark size="lg" />

        <nav className="flex items-center gap-4 md:gap-6 text-sm font-medium" style={{ color: C.inkSoft }}>
          <a href="#pillars" className="hidden md:inline hover:opacity-70 transition">
            {en ? "Product" : "產品"}
          </a>
          <a href="#viral" className="hidden md:inline hover:opacity-70 transition">
            {en ? "This month" : "本月爆款"}
          </a>
          <a href="#plans" className="hidden md:inline hover:opacity-70 transition">
            {en ? "Plans" : "方案"}
          </a>
          <a href="#faq" className="hidden md:inline hover:opacity-70 transition">
            FAQ
          </a>
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

      <main className="flex-1">
        {/* ── 0 · Hero：一句定位＋真實截圖 ─────────────────────────── */}
        <section className="relative">
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
          <div className="relative max-w-[1200px] mx-auto px-6 lg:px-12 pt-12 lg:pt-16 pb-12 text-center">
            <Chip>{en ? "Agency-grade strategy × real social data, every month" : "4A 品牌策略方法 × 每月真實社群數據"}</Chip>

            <h1
              className="font-black tracking-tight leading-[1.1] mt-6 mb-6"
              style={{
                color: C.ink,
                fontSize: "clamp(2.2rem, 5vw, 3.8rem)",
                letterSpacing: "-0.02em",
              }}
            >
              {en ? (
                <>A trained, certified<br />AI marketing team</>
              ) : (
                <>經過訓練與認證的<br />AI 行銷團隊</>
              )}
            </h1>

            <p className="text-[17px] leading-[1.75] mx-auto mb-2 max-w-[680px] font-semibold" style={{ color: C.ink }}>
              {en
                ? "AI writes fast but doesn't know your brand. People who know your brand never have enough time."
                : "AI 寫得快，但不懂品牌；懂品牌的人，時間永遠不夠。"}
            </p>
            <p className="text-[15px] leading-[1.8] mx-auto mb-8 max-w-[680px]" style={{ color: C.inkSoft }}>
              {en
                ? "onBrand Studio's AI marketing team has read your Brand Brain, carries a task library refreshed every month, and can take on your company's own AI skills."
                : "onBrand Studio 的 AI 行銷團隊讀過你的品牌大腦、帶著每月更新的任務庫，也能接上貴公司自己的 AI 技能。"}
            </p>

            <div className="flex flex-wrap justify-center gap-3 mb-12">
              <PrimaryCta en={en} />
              <Link
                to="/auth/login"
                {...prefetchProps(prefetchLogin)}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-[15px] font-bold transition hover:bg-white"
                style={{ background: "transparent", color: C.ink, border: `2px solid ${C.ink}` }}
              >
                {en ? "Sign in" : "已有帳號 · 登入"}
                <span aria-hidden>→</span>
              </Link>
            </div>

            <Screenshot
              src="/static/landing/planner.jpg"
              width={1600}
              height={900}
              alt={en
                ? "This week's plan: the content director and agents pitch angles, you adopt one, and the week's posts are scheduled across channels"
                : "本週企劃：內容總監與團隊提案，你採用後，一週各通路的貼文就排好了"}
              priority
            />
            <p className="text-[13px] mt-3" style={{ color: C.muted }}>
              {en ? "This week's plan — the team pitches, you decide, the week is scheduled." : "本週企劃：團隊提案、你來決定，一週的貼文就排好了。"}
            </p>
          </div>
        </section>

        {/* ── 1 · 痛點對照 ─────────────────────────────────────────── */}
        <PainSection en={en} />

        {/* ── 2 · 三支柱 ───────────────────────────────────────────── */}
        <PillarsSection en={en} />

        {/* ── 3 · 本月爆款卡牆 ─────────────────────────────────────── */}
        <ViralWall en={en} cards={showcase.data?.viralCards} loading={showcase.isLoading} failed={showcase.isError} />

        {/* ── 4 · 七個通路＋規格圖卡 ───────────────────────────────── */}
        <ChannelsSection en={en} specs={showcase.data?.imageSpecs} />

        {/* ── 5 · 方案 ─────────────────────────────────────────────── */}
        <PlansSection en={en} />

        {/* ── 6 · FAQ (also mirrored in FAQPage JSON-LD in index.html) ─ */}
        <FAQSection en={en} />
      </main>

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
          <div className="flex justify-center mb-4">
            <BrandMark size="sm" />
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
                © {new Date().getFullYear()} SoWork · onBrand Studio. All rights reserved.
              </>
            ) : (
              <>
                營運者：SoWork 摘星社群行銷顧問股份有限公司 · 服務地區：台灣
                <br />
                © {new Date().getFullYear()} SoWork · onBrand Studio. 版權所有。
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────────

function BrandMark({ size }: { size: "lg" | "sm" }) {
  const lg = size === "lg";
  return (
    <div className="flex items-center gap-2">
      {/* SoWork-style droplet logo */}
      <svg width={lg ? 24 : 18} height={lg ? 28 : 22} viewBox="0 0 24 28" fill="none" aria-hidden>
        <path
          d="M12 2 C 16 8, 22 14, 22 19 A 10 10 0 0 1 2 19 C 2 14, 8 8, 12 2 Z"
          fill={C.orange}
          stroke={C.ink}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      </svg>
      <span className={lg ? "text-[20px] font-extrabold" : "text-[15px] font-extrabold"} style={{ color: C.ink }}>
        onBrand <span style={{ color: C.orange }}>Studio</span>
      </span>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-block text-[12px] font-bold px-3 py-1.5 rounded-md"
      style={{ background: C.orangeChip, color: C.orangeDark }}
    >
      {children}
    </span>
  );
}

function SectionHead({ chip, title, sub }: { chip: string; title: string; sub?: string }) {
  return (
    <div className="text-center mb-10">
      <Chip>{chip}</Chip>
      <h2
        className="font-black tracking-tight mt-3 mb-3"
        style={{ color: C.ink, fontSize: "clamp(1.7rem, 3.4vw, 2.5rem)", letterSpacing: "-0.02em" }}
      >
        {title}
      </h2>
      {sub && (
        <p className="text-[15px] leading-[1.75] mx-auto max-w-[640px]" style={{ color: C.muted }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function PrimaryCta({ en }: { en: boolean }) {
  return (
    <Link
      to="/auth/register"
      {...prefetchProps(prefetchRegister)}
      className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-[15px] font-bold transition-transform hover:-translate-y-0.5"
      style={{ background: C.orange, color: C.white, boxShadow: `0 6px 0 ${C.orangeDark}` }}
    >
      {en ? "Start 7-day free trial" : "免費試用 7 天"}
      <span aria-hidden>→</span>
    </Link>
  );
}

/** 真實產品截圖，套一個簡單的瀏覽器外框。 */
function Screenshot({ src, alt, width, height, priority }: {
  src: string; alt: string; width: number; height: number; priority?: boolean;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden mx-auto text-left"
      style={{ background: C.white, border: `2px solid ${C.ink}`, boxShadow: `6px 6px 0 ${C.ink}` }}
    >
      <div className="flex items-center gap-1.5 px-3 py-2" style={{ borderBottom: `1.5px solid ${C.borderSoft}` }} aria-hidden>
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: C.border }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: C.border }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: C.border }} />
      </div>
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="block w-full h-auto"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 1 · 痛點對照
// ─────────────────────────────────────────────────────────────────────────
function PainSection({ en }: { en: boolean }) {
  const ROWS: [string, string][] = en
    ? [
        ["Starts from a blank page every time — you re-explain your brand again and again.", "The team reads your Brand Brain first: positioning, voice and banned words are already known."],
        ["Doesn't know what is actually working this month.", "Every month we break down posts that really spread, with the numbers and sources attached."],
        ["After writing, you still schedule it and make the images yourself.", "The weekly plan lays out every channel you use; images are generated to each platform's specs."],
      ]
    : [
        ["每次都從空白開始，品牌要重新交代一遍。", "團隊先讀過品牌大腦，定位、語氣、禁用詞都記得。"],
        ["不知道這個月什麼寫法真的有效。", "每月拆解真實傳開的貼文，附數字與出處。"],
        ["寫完還要自己排程、自己配圖。", "本週企劃一次排好你用的每個通路，圖片照各平台規格生成。"],
      ];
  return (
    <section className="py-16 lg:py-20" style={{ background: C.creamDeep, borderTop: `1px solid ${C.borderSoft}` }}>
      <div className="max-w-[1000px] mx-auto px-6">
        <SectionHead
          chip={en ? "Why a team" : "為什麼是團隊"}
          title={en ? "Writing isn't the slow part." : "寫一篇貼文，最花時間的不是寫。"}
        />
        <div className="rounded-2xl overflow-hidden" style={{ border: `2px solid ${C.ink}`, background: C.white }}>
          <div className="grid grid-cols-2 text-[13px] font-black tracking-wide" style={{ borderBottom: `2px solid ${C.ink}` }}>
            <div className="px-5 py-3" style={{ color: C.muted }}>{en ? "Generic AI tools" : "一般 AI 工具"}</div>
            <div className="px-5 py-3" style={{ color: C.orangeDark, borderLeft: `2px solid ${C.ink}`, background: C.orangeChip }}>onBrand Studio</div>
          </div>
          {ROWS.map(([pain, fix], i) => (
            <div
              key={i}
              className="grid grid-cols-2 text-[14px] leading-[1.7]"
              style={{ borderTop: i === 0 ? "none" : `1px solid ${C.borderSoft}` }}
            >
              <div className="px-5 py-4" style={{ color: C.muted }}>{pain}</div>
              <div className="px-5 py-4 font-semibold" style={{ color: C.ink, borderLeft: `2px solid ${C.ink}` }}>{fix}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 2 · 三支柱
// ─────────────────────────────────────────────────────────────────────────
function PillarsSection({ en }: { en: boolean }) {
  const PILLARS = [
    {
      n: "01",
      title: en ? "Knows your Brand Brain" : "懂品牌大腦",
      body: en
        ? "SoWork's 14-step Brand Positioning Method builds your Brand Brain: audience, competitive landscape, origin story, voice. Once it's locked, every post the team writes starts from here."
        : "用 SoWork 14 步品牌定位法建立品牌大腦：目標受眾、競爭格局、品牌故事、語氣。鎖定之後，團隊寫的每一篇都從這裡出發。",
      img: { src: "/static/landing/brand-brain.jpg", w: 1600, h: 900 },
      alt: en ? "Brand Brain board with audience, competition and brand story sections" : "品牌大腦看板：目標受眾、競爭格局、品牌故事等段落",
    },
    {
      n: "02",
      title: en ? "Owns a task library" : "擁有任務庫",
      body: en
        ? "Each task card is a proven way to write. Viral-structure cards come from posts that really spread in the last three months, each with its metric, the month it was measured and the reference article."
        : "每張任務卡都是一種驗證過的寫法。爆款結構卡拆自近三個月真實傳開的貼文，每張附傳播數字、量測年月與參考文章。",
      img: { src: "/static/landing/task-library.jpg", w: 1600, h: 900 },
      alt: en ? "Facebook task library with viral-structure cards showing reference posts and metrics" : "Facebook 任務庫：爆款結構卡附參考貼文與傳播數字",
    },
    {
      n: "03",
      title: en ? "Takes on your company's AI skills" : "整合公司的 AI 技能",
      body: en
        ? "Already have a way of writing that works, or internal AI skills? Paste your best posts and the AI distils them into a reusable task card. On Enterprise, we bring your internal skills in as dedicated cards."
        : "貴公司已經有好用的寫法或內部 AI 技能？貼上成品，AI 會反推成可重複使用的任務卡。企業客製版由我們把內部 SKILL 整批做成專屬任務卡。",
      img: { src: "/static/landing/own-skill.jpg", w: 764, h: 720 },
      alt: en ? "Create a task card: paste your ideal posts and let AI distil a SKILL" : "新增任務卡：貼上理想中的成品，讓 AI 總結成 SKILL",
    },
  ];
  return (
    <section id="pillars" className="py-16 lg:py-24" style={{ borderTop: `1px solid ${C.borderSoft}` }}>
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
        <SectionHead
          chip={en ? "What the team brings" : "團隊帶來什麼"}
          title={en ? "Three things a good marketing team has." : "一支好的行銷團隊，該有的三件事。"}
        />
        <div className="space-y-16 lg:space-y-24">
          {PILLARS.map((p, i) => (
            <div
              key={p.n}
              className={`flex flex-col gap-8 lg:gap-12 items-center ${i % 2 === 1 ? "lg:flex-row-reverse" : "lg:flex-row"}`}
            >
              <div className="w-full lg:w-[38%]">
                <div className="text-[13px] font-black tracking-[0.2em] mb-2" style={{ color: C.orange }}>{p.n}</div>
                <h3 className="font-black mb-3" style={{ color: C.ink, fontSize: "clamp(1.5rem, 2.6vw, 2rem)" }}>{p.title}</h3>
                <p className="text-[15px] leading-[1.85]" style={{ color: C.inkSoft }}>{p.body}</p>
              </div>
              <div className={`w-full ${p.img.w < 1000 ? "lg:w-[48%] max-w-[560px]" : "lg:w-[62%]"}`}>
                <Screenshot src={p.img.src} width={p.img.w} height={p.img.h} alt={p.alt} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 3 · 本月爆款卡牆
// ─────────────────────────────────────────────────────────────────────────
type ViralCard = {
  id: string; platform: string; labelZh: string; labelEn: string;
  short: string; metric: string; asOf: string; caveat: string | null; url: string | null;
  shortEn?: string | null; metricEn?: string | null; caveatEn?: string | null;
};

function ViralWall({ en, cards, loading, failed }: {
  en: boolean; cards: ViralCard[] | undefined; loading: boolean; failed: boolean;
}) {
  // 拿不到資料就整段不出現——空的證據區比沒有更傷。
  if (failed || (!loading && (!cards || cards.length === 0))) return null;
  return (
    <section id="viral" className="py-16 lg:py-24" style={{ background: C.creamDeep, borderTop: `1px solid ${C.borderSoft}` }}>
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
        <SectionHead
          chip={en ? "Refreshed monthly" : "每月更新"}
          title={en ? "This month's viral-structure cards" : "本月爆款卡"}
          sub={en
            ? "Only cards from the last three months that can show their numbers. When a card ages out, it comes off the shelf."
            : "只放近三個月、交得出數字的卡。過了三個月自動下架，這一區永遠是新的。"}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading
            ? [0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl h-[220px] animate-pulse" style={{ background: C.white, border: `1.5px solid ${C.border}` }} />
              ))
            : cards!.map((c) => {
                const ch = channelOf(c.platform);
                return (
                  <article
                    key={c.id}
                    className="rounded-xl p-5 flex flex-col"
                    style={{ background: C.white, border: `1.5px solid ${C.ink}` }}
                  >
                    <div className="flex items-center gap-2 text-[12px] font-bold mb-3" style={{ color: C.muted }}>
                      {ch && <Icon name={ch.icon} size={14} />}
                      <span>{ch ? (en ? ch.en : ch.zh) : c.platform}</span>
                      <span className="ml-auto tabular-nums">{c.asOf}</span>
                    </div>
                    <h3 className="text-[15px] font-bold leading-snug mb-3" style={{ color: C.ink }}>
                      {en ? c.labelEn || c.labelZh : c.labelZh}
                    </h3>
                    <div className="text-[12px] mb-2" style={{ color: C.inkSoft }}>
                      {en ? "Reference: " : "參考貼文："}{en ? (c.shortEn || c.short) : c.short}
                    </div>
                    <div className="text-[20px] font-black leading-snug mb-3" style={{ color: C.orangeDark }}>
                      {en ? (c.metricEn || c.metric) : c.metric}
                    </div>
                    {c.caveat && (
                      <div className="text-[12px] leading-relaxed mb-3" style={{ color: C.muted }}>
                        {en ? "Note: " : "註："}{en ? (c.caveatEn || c.caveat) : c.caveat}
                      </div>
                    )}
                    {c.url && (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-auto inline-flex items-center gap-1.5 text-[12px] font-semibold underline hover:opacity-70"
                        style={{ color: C.ink }}
                      >
                        {en ? "Read the source" : "看參考文章"} <Icon name="external" size={11} />
                      </a>
                    )}
                  </article>
                );
              })}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 4 · 七個通路＋規格圖卡
// ─────────────────────────────────────────────────────────────────────────
type ImageSpec = {
  id: string; channel: string; labelZh: string; labelEn: string;
  descZh: string; descEn: string; width: number; height: number;
};

function ChannelsSection({ en, specs }: { en: boolean; specs: ImageSpec[] | undefined }) {
  const [active, setActive] = React.useState("facebook");
  const list = (specs ?? []).filter((s) => s.channel === active);
  const total = specs?.length ?? 0;
  return (
    <section id="channels" className="py-16 lg:py-24" style={{ borderTop: `1px solid ${C.borderSoft}` }}>
      <div className="max-w-[1100px] mx-auto px-6 lg:px-12">
        <SectionHead
          chip={en ? `${CHANNELS.length} channels` : `${CHANNELS.length} 個通路`}
          title={en ? "Copy and images, to each platform's spec." : "文案和圖片，照各平台的規格做。"}
          sub={total > 0
            ? (en
                ? `${total} image spec cards. Aspect ratio is locked when the image is generated — never cropped afterwards.`
                : `${total} 張規格圖卡。比例在生成當下就鎖定，不靠事後裁切。`)
            : undefined}
        />
        <div className="flex flex-wrap justify-center gap-2 mb-8" role="tablist">
          {CHANNELS.map((ch) => {
            const on = ch.id === active;
            return (
              <button
                key={ch.id}
                role="tab"
                aria-selected={on}
                onClick={() => setActive(ch.id)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[14px] font-semibold transition"
                style={{
                  background: on ? C.ink : C.white,
                  color: on ? C.white : C.ink,
                  border: `1.5px solid ${C.ink}`,
                }}
              >
                <Icon name={ch.icon} size={15} />
                {en ? ch.en : ch.zh}
              </button>
            );
          })}
        </div>
        {specs && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-4 rounded-xl p-4"
                style={{ background: C.white, border: `1.5px solid ${C.border}` }}
              >
                <div className="w-14 h-14 flex-shrink-0 flex items-center justify-center" aria-hidden>
                  <div
                    style={{
                      aspectRatio: `${s.width} / ${s.height}`,
                      width: s.width >= s.height ? "100%" : "auto",
                      height: s.width >= s.height ? "auto" : "100%",
                      background: C.orangeChip,
                      border: `1.5px solid ${C.orangeDark}`,
                      borderRadius: 4,
                    }}
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] font-bold" style={{ color: C.ink }}>{en ? s.labelEn : s.labelZh}</div>
                  <div className="text-[12px] tabular-nums" style={{ color: C.muted }}>{s.width} × {s.height}</div>
                  <div className="text-[12px] leading-snug mt-0.5" style={{ color: C.inkSoft }}>{en ? s.descEn : s.descZh}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 5 · 方案：基礎版當入口，企業客製版＝專屬行銷維運團隊
// 價格來源：PricingPage.tsx（台幣未稅）。改價要兩邊一起改。
// ─────────────────────────────────────────────────────────────────────────
function PlansSection({ en }: { en: boolean }) {
  const basic = en
    ? ["2 seats · 1 brand", `Pick 2 of ${CATALOG.channels} channels (swap monthly)`, "Brand positioning + 3 cards built from your own posts", "Scheduling and direct publishing to FB / IG"]
    : ["2 席 · 1 個品牌", `${CATALOG.channels} 個通路選 2（每月可換）`, "品牌定位 ＋ 用你自己的貼文建 3 張任務卡", "排程與 FB／IG 直接發布"];
  const enterprise = en
    ? ["We inventory your internal AI writing skills and turn them into dedicated task cards", "Multiple brands and markets", "Strategy, content and performance layers, each maintained by our team", "Performance layer and e-commerce reporting"]
    : ["盤點貴公司內部的 AI 寫作 SKILL，做成專屬任務卡", "多品牌、多市場", "策略、內容、成效三層，都有專人維運", "成效層與電商營運報告"];
  return (
    <section id="plans" className="py-16 lg:py-24" style={{ background: C.creamDeep, borderTop: `1px solid ${C.borderSoft}` }}>
      <div className="max-w-[1000px] mx-auto px-6">
        <SectionHead
          chip={en ? "Plans" : "方案"}
          title={en ? "Start with the basics, or bring in a dedicated team." : "從基礎版開始，或請一支專屬團隊。"}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-2xl p-7 flex flex-col" style={{ background: C.white, border: `2px solid ${C.ink}` }}>
            <div className="text-[13px] font-black tracking-wide mb-1" style={{ color: C.muted }}>{en ? "Basic" : "基礎版"}</div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-[34px] font-black tabular-nums" style={{ color: C.ink }}>NT$2,250</span>
              <span className="text-[14px]" style={{ color: C.muted }}>{en ? "/ month, excl. tax" : "／月（未稅）"}</span>
            </div>
            <p className="text-[14px] mb-5" style={{ color: C.inkSoft }}>
              {en ? "Your own AI marketing team, starting today." : "今天就有一支自己的 AI 行銷團隊。"}
            </p>
            <PlanList items={basic} />
            <div className="mt-auto pt-6"><PrimaryCta en={en} /></div>
          </div>

          <div className="rounded-2xl p-7 flex flex-col" style={{ background: C.ink, color: C.white, border: `2px solid ${C.ink}` }}>
            <div className="text-[13px] font-black tracking-wide mb-1" style={{ color: C.orange }}>{en ? "Enterprise" : "企業客製版"}</div>
            <div className="text-[26px] font-black leading-tight mb-1">{en ? "A dedicated marketing ops team" : "專屬行銷維運團隊"}</div>
            <p className="text-[14px] mb-5 opacity-80">
              {en ? "Setup fee + monthly fee, quoted per company." : "建置費 ＋ 月費，依公司報價。"}
            </p>
            <PlanList items={enterprise} dark />
            <div className="mt-auto pt-6">
              <a
                href="mailto:sowork@sowork.ai?subject=onBrand%20Studio%20%E4%BC%81%E6%A5%AD%E5%AE%A2%E8%A3%BD%E7%89%88"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-[15px] font-bold transition hover:opacity-90"
                style={{ background: C.white, color: C.ink }}
              >
                {en ? "Talk to us" : "聯絡我們"} <span aria-hidden>→</span>
              </a>
            </div>
          </div>
        </div>
        <p className="text-center text-[14px] mt-6" style={{ color: C.muted }}>
          <Link to="/pricing" className="underline hover:opacity-70" style={{ color: C.ink }}>
            {en ? "See all plans, including Professional →" : "看完整方案（含專業版）→"}
          </Link>
        </p>
      </div>
    </section>
  );
}

function PlanList({ items, dark }: { items: string[]; dark?: boolean }) {
  return (
    <ul className="space-y-2.5">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5 text-[14px] leading-snug">
          <Icon name="check" size={13} style={{ color: C.orange, marginTop: 3, flexShrink: 0 }} />
          <span style={{ color: dark ? C.white : C.inkSoft, opacity: dark ? 0.9 : 1 }}>{t}</span>
        </li>
      ))}
    </ul>
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
// FAQSection — mirrors the FAQPage JSON-LD in index.html.
// Accordion pattern (click to expand). Cream bg, thick black borders.
// ─────────────────────────────────────────────────────────────────────────
function FAQSection({ en }: { en: boolean }) {
  const FAQS = en
    ? [
        {
          q: "How is onBrand Studio different from writing with ChatGPT?",
          a: "ChatGPT starts from a blank page every time, so you keep re-explaining your brand and the copy drifts. onBrand Studio's team reads your Brand Brain first — built with SoWork's 14-step Brand Positioning Method — and writes with task cards that are proven ways to write, so every channel sounds like you.",
        },
        {
          q: "Where do the viral-structure cards come from, and how often are they updated?",
          a: "Every month we pick posts that really spread from public reporting in Taiwan and abroad, and break down the structure you can reuse. Each card carries its spread metric, the month it was measured and the reference article; a card that cannot show its numbers is not published. Only cards from the last three months are listed, and older ones come off automatically. (Professional plan)",
        },
        {
          q: "Can the team use our company's own way of writing?",
          a: "Yes. Paste your best posts and the AI distils them into a reusable task card — length, rhythm and CTA placement are measured from your samples. On Enterprise, we inventory your internal AI writing skills and turn them into dedicated cards.",
        },
        {
          q: "Which channels are supported?",
          a: `Facebook, Instagram, Threads, LINE, TikTok, Email, your website and press releases — ${CATALOG.channels} channels, with image spec cards for the social platforms.`,
        },
        {
          q: "How long does it take to get started?",
          a: "The 14-step positioning flow takes about 10 minutes. After that you can produce a single post, a content pack, or a full campaign plan.",
        },
        {
          q: "Is there a free trial?",
          a: "Yes — a 7-day / 1,000-point trial, no credit card required. Start by completing the 14-step Brand Positioning flow.",
        },
        {
          q: "What's the relationship between onBrand Studio and SoWork?",
          a: "onBrand Studio is built by SoWork (摘星社群行銷顧問股份有限公司), a Taiwan-based brand marketing consultancy. It turns SoWork's methodology into an AI marketing team.",
        },
      ]
    : [
        {
          q: "onBrand Studio 跟 ChatGPT 寫文案有什麼差別？",
          a: "ChatGPT 每次都從空白頁開始，品牌要一再重新交代，越寫越不像你。onBrand Studio 的團隊先讀過用 SoWork 14 步品牌定位法建立的品牌大腦，再用驗證過的任務卡來寫，所以每個通路都是你的口吻。",
        },
        {
          q: "爆款結構卡從哪來、多久更新？",
          a: "我們每個月從台灣與國際的公開報導中，挑出真的傳開的貼文，拆出可以套用的結構。每張卡附傳播數字、量測年月與參考文章，交不出數字的不上架。前台只列近三個月的卡，過期自動下架。（專業方案）",
        },
        {
          q: "可以用我們公司自己的寫法嗎？",
          a: "可以。貼上你們最好的成品，AI 會反推成可重複使用的任務卡，字數、節奏、CTA 位置都從範例量出來。企業客製版由我們盤點貴公司內部的 AI 寫作 SKILL，整批做成專屬任務卡。",
        },
        {
          q: "支援哪些平台？",
          a: `Facebook、Instagram、Threads、LINE、TikTok、電子報、官網、新聞稿，共 ${CATALOG.channels} 個通路，社群平台都有對應尺寸的規格圖卡。`,
        },
        {
          q: "我需要多久時間才能上手？",
          a: "14 步品牌定位流程約 10 分鐘完成。完成後即可產出單篇貼文、跨平台內容套組，或完整的活動企劃。",
        },
        {
          q: "有免費試用嗎？",
          a: "有，7 天 / 1,000 點雙限試用，免綁信用卡。完成註冊即可開始 14 步品牌定位流程。",
        },
        {
          q: "onBrand Studio 和 SoWork 是什麼關係？",
          a: "onBrand Studio 是 SoWork（摘星社群行銷顧問股份有限公司）打造的 AI 行銷團隊。SoWork 是台灣的品牌行銷顧問公司，把多年的方法論訓練成這支團隊。",
        },
      ];

  const [openIdx, setOpenIdx] = React.useState<number | null>(0);

  return (
    <section
      id="faq"
      className="py-16 lg:py-20 relative"
      style={{ background: C.cream, borderTop: `1px solid ${C.borderSoft}` }}
    >
      <div className="max-w-3xl mx-auto px-6">
        <SectionHead
          chip="FAQ"
          title={en ? "Common questions, straight answers." : "常被問的，直接回你。"}
          sub={en
            ? "Still curious? Email sowork@sowork.ai — we reply within one business day."
            : "還沒回答到你的問題？寄信給 sowork@sowork.ai，一個工作天內回覆。"}
        />

        {/* Accordion */}
        <div className="space-y-3">
          {FAQS.map((faq, i) => {
            const isOpen = openIdx === i;
            return (
              <div
                key={i}
                className="rounded-xl overflow-hidden transition"
                style={{
                  background: C.white,
                  border: `1.5px solid ${C.ink}`,
                  boxShadow: isOpen ? `4px 4px 0 ${C.ink}` : "none",
                }}
              >
                <button
                  onClick={() => setOpenIdx(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[#FAF5EC]"
                  aria-expanded={isOpen}
                >
                  <span className="font-bold text-[15px] leading-snug" style={{ color: C.ink }}>
                    {faq.q}
                  </span>
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-black text-[14px] transition-transform"
                    style={{
                      background: isOpen ? C.orange : C.orangeChip,
                      color: isOpen ? C.white : C.orangeDark,
                      transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
                    }}
                  >
                    +
                  </span>
                </button>
                {isOpen && (
                  <div
                    className="px-5 pb-5 text-[14px] leading-[1.8]"
                    style={{ color: C.inkSoft, borderTop: `1px solid ${C.borderSoft}` }}
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
          <PrimaryCta en={en} />
        </div>
      </div>
    </section>
  );
}
