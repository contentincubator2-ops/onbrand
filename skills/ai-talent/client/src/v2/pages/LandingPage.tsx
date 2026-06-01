/**
 * LandingPage — public marketing page at "/".
 *
 * 2026-05-19 (CJ): Rebuilt around 3 core differentiators:
 *   1. 168 award-backed task templates (traceable, not a black box)
 *   2. Specialized AI agents per content type (not one generic model)
 *   3. Verifiable methodology (6 dimensions, auditable outputs)
 *
 * Auth-check swaps nav CTA (Sign in → Go to app) without redirecting,
 * so logged-in users can still view and share the marketing page.
 * Login / Register buttons always navigate to their own dedicated pages.
 */
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLang } from "../../lib/i18n";

const TAGLINE_ZH = "鎖定品牌定位，AI 永遠 on-brand 不跑題";
const TAGLINE_EN = "Lock your brand positioning — AI that never drifts off-brand";
const SUBLINE_ZH = "台灣中小品牌的 AI 行銷工作室。先用 SoWork 方法鎖定品牌定位，之後每篇文案、每張圖都自動 on-brand —— 不像 ChatGPT 每次都從零開始、越寫越歪。";
const SUBLINE_EN = "An AI marketing studio for SMB brands. Lock your positioning once with the SoWork method — then every caption and image stays on-brand automatically. Unlike ChatGPT, it never restarts from zero.";

const GRAD = "linear-gradient(160deg, #6C5CE7 0%, #a29bfe 100%)";
const BLK  = "#0F0F0E";

export default function LandingPage() {
  const { lang, setLang } = useLang();
  const en = lang === "en";
  const [authed, setAuthed] = React.useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    let dead = false;
    fetch("/api/auth/me", { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: "{}" })
      .then((r) => {
        if (dead) return;
        if (r.ok) {
          setAuthed(true);
          navigate("/theater", { replace: true });
        }
      })
      .catch(() => {});
    document.title = en ? `OnBrand · ${TAGLINE_EN}` : `OnBrand · ${TAGLINE_ZH}`;
    const m = document.querySelector('meta[name="description"]')
      ?? (() => { const e = document.createElement("meta"); e.setAttribute("name", "description"); document.head.appendChild(e); return e; })();
    m.setAttribute("content", en ? `${TAGLINE_EN}. ${SUBLINE_EN}` : `${TAGLINE_ZH}。${SUBLINE_ZH}`);
    return () => { dead = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [en]);

  // ── Data ────────────────────────────────────────────────────────────────

  const differentiators = en ? [
    {
      n: "01",
      title: "168 Award-Backed Task Templates",
      body: "Every content task is mapped to a real, named, documented award-winning campaign — Duolingo × Shorty Award, Liquid Death × Clio Grand Prix, Dropbox × IAC Award. The craft logic is extracted from each case and encoded into the task. Traceable methodology, not a black box.",
    },
    {
      n: "02",
      title: "Specialized AI Agents — Not One Generic Model",
      body: "Each content type runs through a purpose-built AI agent with its own methodology, role, and output spec. A PR Strategist agent thinks in news angles and journalist psychology. A TikTok agent thinks in character arcs and unresolved tension. Specialization is what makes the output sound like an expert wrote it.",
    },
    {
      n: "03",
      title: "Verifiable Methodology",
      body: "Brand positioning is scored across 6 measurable dimensions. Every output has a defined structure you can audit. The award cases behind each task have public records you can look up. Built to be inspectable — because if you can't verify the logic, you can't trust it at scale.",
    },
  ] : [
    {
      n: "01",
      title: "168 個得獎案例對應的任務模板",
      body: "每一個內容任務，都對應到一個真實、有名字、有完整公開紀錄的得獎案例——Duolingo × Shorty Award、Liquid Death × Clio Grand Prix、Dropbox × IAC Award。我們萃取每個案例的工藝邏輯並編進任務中。方法論可追溯，不是黑盒子。",
    },
    {
      n: "02",
      title: "專屬 AI 專家分工——不是一個通用模型包辦",
      body: "每種內容類型都由有自己方法論、角色定位和輸出規格的專屬 AI 專家處理。PR 策略師用新聞角度和記者心理思考；TikTok 專家用角色弧和未解張力思考。正是這種分工，讓產出聽起來像是真正的專家寫的。",
    },
    {
      n: "03",
      title: "可驗證的方法論",
      body: "品牌定位跨 6 個可量化維度評分。每種輸出有明確結構讓你審計。每個任務背後的得獎案例有公開紀錄可自行查證。整個系統設計前提就是「可審查」——因為如果你無法驗證邏輯，就不可能放心地大規模使用它。",
    },
  ];

  const steps = en ? [
    ["1", "Lock positioning", "Answer the SoWork positioning flow once — Golden Circle, tagline, audience, voice. It becomes your locked brand brain."],
    ["2", "Pick a task", "FB post, IG carousel, LinkedIn newsletter, TikTok script, press release — 168 tasks across every major platform."],
    ["3", "Ship on-brand", "Multi-platform copy + images in 30–99 seconds, generated against your locked brain. Every time."],
  ] : [
    ["1", "鎖定定位", "完成一次 SoWork 定位流程——黃金圈、標語、受眾、品牌聲音。它成為你鎖定的品牌大腦。"],
    ["2", "選任務", "FB 貼文、IG 輪播、LinkedIn 電子報、TikTok 腳本、新聞稿——168 個跨平台任務。"],
    ["3", "直接發布", "30–99 秒產出多平台文案＋圖，全部對著你的品牌大腦產出。每次都是。"],
  ];

  const awardCases = en ? [
    ["TikTok Script", "Duolingo · Shorty Award — Best Brand on TikTok", "Character arc + unresolved tension: every clip is complete but makes you need the next one."],
    ["Welcome Email", "Dropbox Onboarding · IAC Award Winner", "Anchor on progress milestones, not discounts — the user feels they're completing their own task."],
    ["PR News Hook", "Liquid Death · Clio Award Grand Prix", "A counter-intuitive claim makes journalists write the story themselves — 20× earned media vs. ad spend."],
  ] : [
    ["TikTok 腳本", "Duolingo · Shorty Award 多屆最佳品牌", "角色弧 + 未解張力：每支完整但讓人必須看下一集。"],
    ["歡迎信", "Dropbox 歡迎序列 · IAC Award 最佳 Onboarding", "進度里程碑定錨，不是促銷——讓用戶覺得在完成自己的任務。"],
    ["PR 新聞鉤", "Liquid Death · Clio Award Grand Prix", "反常識主張讓媒體自動報導，PR 曝光超過廣告投入 20 倍。"],
  ];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white text-neutral-900">

      {/* ── Nav ── */}
      <header className="flex items-center justify-between px-6 md:px-10 py-5 max-w-6xl mx-auto">
        <div className="text-xl font-bold">
          OnBrand<span className="text-neutral-400"> · 對版</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <button onClick={() => setLang(en ? "zh-TW" : "en")}
            className="text-neutral-500 hover:text-neutral-900 transition">
            {en ? "繁中" : "EN"}
          </button>
          <Link to="/pricing" className="text-neutral-600 hover:text-neutral-900 px-2">
            {en ? "Pricing" : "方案"}
          </Link>
          {authed ? (
            <Link to="/theater"
              className="px-4 py-2 rounded-lg text-white font-semibold"
              style={{ background: GRAD }}>
              {en ? "Go to app" : "進入應用程式"}
            </Link>
          ) : (
            <>
              <Link to="/auth/login"
                className="text-neutral-600 hover:text-neutral-900 px-3 py-2 rounded-lg border border-neutral-200 hover:border-neutral-400 transition">
                {en ? "Sign in" : "登入"}
              </Link>
              <Link to="/auth/register"
                className="px-4 py-2 rounded-lg text-white font-semibold"
                style={{ background: GRAD }}>
                {en ? "Start free" : "免費試用"}
              </Link>
            </>
          )}
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-4xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className="inline-block text-[11px] font-semibold tracking-widest uppercase text-neutral-500 mb-5">
          {en ? "AI marketing studio" : "中小品牌的 AI 行銷工作室"}
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
          {authed ? (
            <Link to="/theater"
              className="px-7 py-3 rounded-xl text-white font-semibold text-base shadow-lg"
              style={{ background: GRAD }}>
              {en ? "Go to app →" : "進入應用程式 →"}
            </Link>
          ) : (
            <>
              <Link to="/auth/register"
                className="px-7 py-3 rounded-xl text-white font-semibold text-base shadow-lg"
                style={{ background: GRAD }}>
                {en ? "Start 7-day free trial" : "免費試用 7 天"}
              </Link>
              <Link to="/auth/login"
                className="px-7 py-3 rounded-xl font-semibold text-base border border-neutral-300 hover:border-neutral-900 transition">
                {en ? "Sign in" : "登入帳號"}
              </Link>
            </>
          )}
        </div>
        <p className="text-xs text-neutral-500 mt-4">
          {en
            ? "Early-bird US$100/mo (was US$300) · 7-day / 1000-pt trial · cancel anytime"
            : "早鳥 NT$750 / NT$3,000 起 · 7 天或 1000 點雙限試用 · 隨時取消"}
        </p>
      </section>

      {/* ── 3 Differentiators ── */}
      <section style={{ background: BLK }}>
        <div className="max-w-5xl mx-auto px-6 py-16">
          <p className="text-center text-[11px] font-semibold tracking-[0.25em] uppercase mb-3"
            style={{ color: "#6B6B68" }}>
            {en ? "What makes it different" : "三件事讓它跟所有 AI 工具都不一樣"}
          </p>
          <h2 className="text-center text-2xl font-bold mb-12 text-white">
            {en
              ? "Not a prompt wrapper. A methodology system."
              : "不是 prompt 包裝工具，是一套方法論系統"}
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {differentiators.map((d) => (
              <div key={d.n} className="rounded-2xl border p-6"
                style={{ background: "#1A1A18", borderColor: "#2A2A28" }}>
                <div className="text-3xl font-bold mb-4" style={{ color: "#3A3A38" }}>{d.n}</div>
                <div className="font-bold mb-3 text-white text-[15px]">{d.title}</div>
                <p className="text-sm leading-relaxed" style={{ color: "#9C9C98" }}>{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-center text-2xl font-bold mb-12">
          {en ? "Three steps" : "三步驟"}
        </h2>
        <div className="grid gap-6 md:grid-cols-3 text-center">
          {steps.map(([n, t, d]) => (
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

      {/* ── Award case examples ── */}
      <section className="bg-neutral-50 border-y border-neutral-200">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.25em] text-neutral-500 mb-3">
            {en ? "Proven craft, built in" : "內建 168 個得獎工藝案例"}
          </p>
          <h2 className="text-center text-2xl font-bold mb-3">
            {en
              ? "168 tasks. Each one grounded in a real, named, award-winning case."
              : "168 個任務，每個對應一個命名得獎或市場成功案例"}
          </h2>
          <p className="text-center text-neutral-600 text-sm mb-10 max-w-2xl mx-auto">
            {en
              ? "Across Facebook, Instagram, TikTok, YouTube, Email, PR, LinkedIn, Brand Strategy, KOL, and Research — every task encodes the transferable craft of a documented award or industry-proven campaign, so your output reads like an expert wrote it."
              : "涵蓋 Facebook、Instagram、TikTok、YouTube、Email、PR、LinkedIn、品牌策略、KOL、研究調查——每個任務都內建有公開紀錄的得獎或市場驗證案例的「可轉移工藝」，讓產出像專家執行的。"}
          </p>
          <div className="grid gap-4 md:grid-cols-3 max-w-4xl mx-auto">
            {awardCases.map(([t, c, d]) => (
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

      {/* ── Closing quote ── */}
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <blockquote className="text-xl font-medium leading-relaxed text-neutral-700 italic mb-2">
          {en
            ? "\"We didn't build another prompt wrapper. We built a methodology system that happens to run on AI.\""
            : "「我們沒有做另一個 prompt 包裝工具。我們建立的是一套方法論系統，而它剛好是跑在 AI 上面的。」"}
        </blockquote>
        <p className="text-sm text-neutral-400">— SoWork</p>
      </section>

      {/* ── Final CTA ── */}
      <section className="border-t border-neutral-200">
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl font-bold mb-4">
            {en ? "Stop sounding like everyone else." : "別再讓你的品牌聽起來跟別人一樣。"}
          </h2>
          <p className="text-neutral-600 mb-8">
            {en
              ? "Lock your positioning today. Early-bird pricing won't last."
              : "今天就鎖定你的品牌定位。早鳥價不會永遠都在。"}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {authed ? (
              <Link to="/theater"
                className="inline-block px-8 py-3.5 rounded-xl text-white font-semibold text-base shadow-lg"
                style={{ background: GRAD }}>
                {en ? "Go to app →" : "進入應用程式 →"}
              </Link>
            ) : (
              <>
                <Link to="/auth/register"
                  className="inline-block px-8 py-3.5 rounded-xl text-white font-semibold text-base shadow-lg"
                  style={{ background: GRAD }}>
                  {en ? "Start 7-day free trial" : "免費試用 7 天"}
                </Link>
                <Link to="/auth/login"
                  className="inline-block px-8 py-3.5 rounded-xl font-semibold text-base border border-neutral-300 hover:border-neutral-900 transition">
                  {en ? "Sign in" : "登入帳號"}
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-neutral-200 py-8 text-center text-xs text-neutral-500 space-x-4">
        <Link to="/pricing"   className="hover:text-neutral-900">{en ? "Pricing"  : "方案"}</Link>
        <Link to="/changelog" className="hover:text-neutral-900">{en ? "Updates"  : "更新日誌"}</Link>
        <Link to="/terms"     className="hover:text-neutral-900">{en ? "Terms"    : "服務條款"}</Link>
        <Link to="/privacy"   className="hover:text-neutral-900">{en ? "Privacy"  : "隱私權"}</Link>
        <Link to="/refund"    className="hover:text-neutral-900">{en ? "Refund"   : "退款"}</Link>
        <a href="mailto:sowork@sowork.ai" className="hover:text-neutral-900">sowork@sowork.ai</a>
        <div className="mt-3 text-neutral-400">© {new Date().getFullYear()} SoWork · OnBrand</div>
      </footer>

    </div>
  );
}
