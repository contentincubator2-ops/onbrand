/**
 * LandingPage — public marketing page at "/".
 *
 * 2026-05-16 (CJ「我還應該調整 landing page 嗎」→「主打品牌定位鎖定，
 * 主標 = 網站描述，同一句訊息一致」).
 *
 * Cold traffic used to be bounced straight to /auth/login (no landing
 * at all). This is the top-of-funnel surface: one message, one moat,
 * one CTA. The moat is the LOCKED brand positioning brain — the thing
 * ChatGPT / Jasper / Copy.ai structurally cannot do (they restart from
 * zero every prompt and drift off-brand).
 *
 * Authed visitors self-redirect to /30s so this never blocks the app.
 * Headline === meta description (single consistent message, per CJ).
 */
import React from "react";
import { Link } from "react-router-dom";
import { useLang } from "../../lib/i18n";

// One sentence, used for BOTH the H1 and <meta name="description">.
const TAGLINE_ZH = "鎖定品牌定位，AI 永遠 on-brand 不跑題";
const TAGLINE_EN = "Lock your brand positioning — AI that never drifts off-brand";
const SUBLINE_ZH =
  "台灣中小品牌的 AI 行銷工作室。先用 SoWork 方法鎖定品牌定位，之後每篇文案、每張圖都自動 on-brand —— 不像 ChatGPT 每次都從零開始、越寫越歪。";
const SUBLINE_EN =
  "An AI marketing studio for SMB brands. Lock your positioning once with the SoWork method — then every caption and image stays on-brand automatically. Unlike ChatGPT, it never restarts from zero.";

const GRAD = "linear-gradient(160deg, #6C5CE7 0%, #a29bfe 100%)";

export default function LandingPage() {
  const { lang, setLang } = useLang();
  const en = lang === "en";

  // Authed users shouldn't see marketing — bounce to the app.
  React.useEffect(() => {
    let dead = false;
    fetch("/api/auth/me", { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: "{}" })
      .then((r) => { if (!dead && r.ok) window.location.replace("/30s"); })
      .catch(() => {});
    // Headline === site description (single consistent message).
    document.title = en ? `OnBrand · ${TAGLINE_EN}` : `OnBrand · ${TAGLINE_ZH}`;
    const m = document.querySelector('meta[name="description"]')
      ?? (() => { const e = document.createElement("meta"); e.setAttribute("name", "description"); document.head.appendChild(e); return e; })();
    m.setAttribute("content", en ? `${TAGLINE_EN}. ${SUBLINE_EN}` : `${TAGLINE_ZH}。${SUBLINE_ZH}`);
    return () => { dead = true; };
  }, [en]);

  const moat = en ? [
    ["Locked positioning", "Set your brand DNA once with the SoWork method. It's locked — the AI can't drift, and competitors can't copy a positioning they can't see."],
    ["Always on-brand", "Every caption, post and image is generated against the locked brain. No more \"that doesn't sound like us\" rewrites."],
    ["One setup → every platform", "FB / IG / LinkedIn / YouTube / Email / PR — produced in parallel from the same brand truth, in 30–99 seconds."],
  ] : [
    ["鎖定的品牌定位", "用 SoWork 方法一次鎖定品牌 DNA。鎖定後 AI 不會跑題，對手也抄不走一個他們看不見的定位。"],
    ["永遠 on-brand", "每篇文案、貼文、圖都對著鎖定的品牌大腦產出。不用再一直「這不像我們」重寫。"],
    ["設定一次 → 多平台齊發", "FB / IG / LinkedIn / YouTube / 電子報 / 新聞稿，同一份品牌定位並行產出，30–99 秒完成。"],
  ];

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 md:px-10 py-5 max-w-6xl mx-auto">
        <div className="text-xl font-bold">OnBrand<span className="text-neutral-400"> · 對版</span></div>
        <div className="flex items-center gap-3 text-sm">
          <button onClick={() => setLang(en ? "zh-TW" : "en")}
            className="text-neutral-500 hover:text-neutral-900 transition">
            {en ? "繁中" : "EN"}
          </button>
          <Link to="/pricing" className="text-neutral-600 hover:text-neutral-900 px-2">
            {en ? "Pricing" : "方案"}
          </Link>
          <Link to="/auth/login" className="text-neutral-600 hover:text-neutral-900 px-2">
            {en ? "Sign in" : "登入"}
          </Link>
          <Link to="/auth/register"
            className="px-4 py-2 rounded-lg text-white font-semibold"
            style={{ background: GRAD }}>
            {en ? "Start free" : "免費試用"}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className="inline-block text-[11px] font-semibold tracking-widest uppercase text-neutral-500 mb-5">
          {en ? "AI marketing for SMB brands" : "中小品牌的 AI 行銷工作室"}
        </div>
        <h1 className="font-bold tracking-tight leading-tight mb-6"
          style={{ fontSize: "clamp(2rem, 5vw, 3.4rem)" }}>
          <span style={{ background: GRAD, WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            {en ? TAGLINE_EN : TAGLINE_ZH}
          </span>
        </h1>
        <p className="mx-auto text-neutral-600 mb-9"
          style={{ maxWidth: 620, fontSize: 17, lineHeight: 1.75 }}>
          {en ? SUBLINE_EN : SUBLINE_ZH}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link to="/auth/register"
            className="px-7 py-3 rounded-xl text-white font-semibold text-base shadow-lg"
            style={{ background: GRAD }}>
            {en ? "Start 7-day free trial" : "免費試用 7 天"}
          </Link>
          <Link to="/pricing"
            className="px-7 py-3 rounded-xl font-semibold text-base border border-neutral-300 hover:border-neutral-900 transition">
            {en ? "See pricing" : "看方案"}
          </Link>
        </div>
        <p className="text-xs text-neutral-500 mt-4">
          {en
            ? "Early-bird US$100/mo (was US$300) · 7-day trial · cancel anytime"
            : "早鳥 US$100/月（標準 US$300）· 7 天試用 · 隨時取消"}
        </p>
      </section>

      {/* The moat */}
      <section className="bg-neutral-50 border-y border-neutral-200">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-center text-2xl font-bold mb-3">
            {en ? "Why it stays on-brand when ChatGPT doesn't" : "為什麼它不跑題，ChatGPT 會"}
          </h2>
          <p className="text-center text-neutral-600 text-sm mb-12 max-w-2xl mx-auto">
            {en
              ? "Generic AI tools restart from a blank prompt every time. OnBrand generates against a positioning brain you lock once."
              : "通用 AI 工具每次都從空白 prompt 重來。OnBrand 對著你「鎖定一次」的品牌大腦產出，所以不會越寫越歪。"}
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {moat.map(([t, d]) => (
              <div key={t} className="bg-white rounded-2xl border border-neutral-200 p-6">
                <div className="w-9 h-9 rounded-lg mb-4 flex items-center justify-center text-white font-bold"
                  style={{ background: GRAD }}>✦</div>
                <div className="font-bold mb-2">{t}</div>
                <p className="text-sm text-neutral-600 leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-center text-2xl font-bold mb-12">
          {en ? "Three steps" : "三步驟"}
        </h2>
        <div className="grid gap-6 md:grid-cols-3 text-center">
          {(en
            ? [["1", "Lock positioning", "Answer the SoWork positioning flow once. It becomes your locked brand brain."],
               ["2", "Pick a task", "FB post, IG carousel, LinkedIn, newsletter — pick a 30/60/99-second task."],
               ["3", "Ship on-brand", "Get multi-platform copy + images, already on-brand. Edit, schedule, publish."]]
            : [["1", "鎖定定位", "完成一次 SoWork 定位流程，它成為你鎖定的品牌大腦。"],
               ["2", "選任務", "FB 貼文、IG 輪播、LinkedIn、電子報 —— 選一個 30/60/99 秒任務。"],
               ["3", "直接發布", "拿到多平台文案＋圖，已經 on-brand。微調、排程、發布。"]]
          ).map(([n, t, d]) => (
            <div key={n}>
              <div className="text-3xl font-bold mb-2"
                style={{ background: GRAD, WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{n}</div>
              <div className="font-bold mb-2">{t}</div>
              <p className="text-sm text-neutral-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Award-craft (option B — marketing surface) */}
      <section className="bg-neutral-50 border-t border-neutral-200">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.25em] text-neutral-500 mb-3">
            {en ? "Built on award craft" : "內建 168 個得獎工藝案例"}
          </p>
          <h2 className="text-center text-2xl font-bold mb-3">
            {en
              ? "168 tasks. 168 unique named award or market-proven cases."
              : "168 個任務，每個對應一個命名得獎或市場成功案例"}
          </h2>
          <p className="text-center text-neutral-600 text-sm mb-10 max-w-2xl mx-auto">
            {en
              ? "Across Facebook, Instagram, TikTok, YouTube, Email, PR, LinkedIn, Brand Strategy, KOL, and Research — every task type encodes the transferable craft of a real documented award or industry-proven campaign, so your output reads like an expert wrote it, not a generic AI."
              : "涵蓋 Facebook、Instagram、TikTok、YouTube、Email、PR、LinkedIn、品牌策略、KOL、研究調查——每一種任務類型，都內建一個有公開記錄的得獎或市場驗證案例的「可轉移工藝」，讓產出像專家執行的，不是通用 AI 套版。"}
          </p>
          <div className="grid gap-4 md:grid-cols-3 max-w-4xl mx-auto">
            {(en ? [
              ["TikTok Hook", "Duolingo @duolingo · Shorty Award Best Brand on TikTok", "Character arc + unresolved tension: every clip is complete but makes you need the next one."],
              ["Welcome Email", "Dropbox Onboarding · IAC Award Winner", "Anchor on progress milestones, not discounts — the user feels they're completing their own task."],
              ["PR News Hook", "Liquid Death · Clio Award Grand Prix", "A slightly counter-intuitive claim makes journalists write the story themselves — 20× earned media vs. ad spend."],
            ] : [
              ["TikTok 腳本", "Duolingo @duolingo · Shorty Award 多屆最佳品牌", "角色弧 + 未解張力：每支完整但讓人必須看下一集。"],
              ["歡迎信", "Dropbox 歡迎序列 · IAC Award 最佳 Onboarding", "進度里程碑定錨，不是促銷——讓用戶覺得在完成自己的任務。"],
              ["PR 新聞鉤", "Liquid Death · Clio Award Grand Prix", "反常識主張讓媒體自動報導，PR 曝光超過廣告投入 20 倍。"],
            ]).map(([t, c, d]) => (
              <div key={t} className="bg-white rounded-2xl border border-neutral-200 p-6">
                <div className="font-bold mb-1">{t}</div>
                <div className="text-[11px] text-neutral-500 mb-3">{c}</div>
                <p className="text-sm text-neutral-600 leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[11px] text-neutral-400 mt-8">
            {en
              ? "Transferable craft principles applied across 168 tasks. Not an award certification or endorsement; case names are illustrative references."
              : "可轉移工藝原則套用於 168 個任務，非得獎認證或案例背書；案例名稱為示意參考。"}
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-neutral-200">
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl font-bold mb-4">
            {en ? "Stop sounding like everyone else." : "別再讓你的品牌聽起來跟別人一樣。"}
          </h2>
          <p className="text-neutral-600 mb-8">
            {en ? "Lock your positioning today. Early-bird pricing won't last."
                : "今天就鎖定你的品牌定位。早鳥價不會永遠都在。"}
          </p>
          <Link to="/auth/register"
            className="inline-block px-8 py-3.5 rounded-xl text-white font-semibold text-base shadow-lg"
            style={{ background: GRAD }}>
            {en ? "Start 7-day free trial" : "免費試用 7 天"}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-200 py-8 text-center text-xs text-neutral-500 space-x-4">
        <Link to="/pricing" className="hover:text-neutral-900">{en ? "Pricing" : "方案"}</Link>
        <Link to="/terms" className="hover:text-neutral-900">{en ? "Terms" : "服務條款"}</Link>
        <Link to="/privacy" className="hover:text-neutral-900">{en ? "Privacy" : "隱私權"}</Link>
        <Link to="/refund" className="hover:text-neutral-900">{en ? "Refund" : "退款"}</Link>
        <a href="mailto:sowork@sowork.ai" className="hover:text-neutral-900">sowork@sowork.ai</a>
        <div className="mt-3 text-neutral-400">© {new Date().getFullYear()} SoWork · OnBrand</div>
      </footer>
    </div>
  );
}
