/**
 * Pricing page — 3 tiers: Starter / Solo / Studio + Agency contact card.
 * 2026-05-19. CJ direction: add Starter at US$25 early / US$75 std.
 * Task counting = per execution run (all variants + images in one run = 1 use).
 */
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { showToastGlobal } from "../../components/ui/Toast";
import { useLang } from "../../lib/i18n";

export default function PricingPage() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const [annual, setAnnual] = React.useState(false);
  const statusQuery = (trpc as any).billing?.getStatus?.useQuery
    ? (trpc as any).billing.getStatus.useQuery()
    // Treat a missing tRPC hook (e.g. deploy misconfiguration) as "still loading"
    // so a logged-in user is never misrouted to /auth/register.
    : { data: null, isLoading: true };
  const status = statusQuery?.data;
  // isLoading: don't redirect to /auth/register while the query is still in-flight;
  // a logged-in user whose billing status hasn't returned yet would otherwise get
  // bounced to the register page incorrectly.
  const statusLoading = statusQuery?.isLoading ?? false;

  const isEn = lang === "en";

  const checkoutMut = (trpc as any).stripe?.createCheckout?.useMutation
    ? (trpc as any).stripe.createCheckout.useMutation({
        onSuccess: (data: any) => {
          if (data?.url) window.location.assign(data.url);
        },
        onError: (e: any) =>
          showToastGlobal((isEn ? "Checkout failed: " : "結帳失敗：") + (e?.message ?? e)),
      })
    : null;

  const currency: "TWD" | "USD" = (status as any)?.currency ?? "TWD";
  const sym = currency === "USD" ? "US$" : "NT$";
  const usdToTwd = (status as any)?.usdToTwd ?? 32;
  const r = (usd: number) => Math.round(usd * usdToTwd);

  // ─── Pricing truth ─────────────────────────────────────────────────────────
  // 2026-07-15 (CJ「取消早鳥優惠，只呈現原價」): early-bird offer is CLOSED
  // for new signups — display standard price only. Existing flagged users keep
  // their locked price via getEffectivePrice (server-side, untouched here).
  // Annual = monthly ×10 (2 months free) in both currencies.
  // USD:  Starter US$75/mo · US$750/yr   ·  Solo US$300/mo · US$3,000/yr
  // TWD:  Starter NT$2,250/mo · NT$22,500/yr · Solo NT$9,000/mo · NT$90,000/yr
  const defaults = currency === "USD"
    ? {
        starterStd: 75,   starterAnnual: 750,
        soloStd:   300,   soloAnnual:   3000,
      }
    : {
        starterStd: 2250, starterAnnual: 22500,
        soloStd:   9000,  soloAnnual:   90000,
      };

  const TIERS = [
    {
      code: "drop_starter",
      name: "OnBrand Starter",
      sub: isEn ? "50 runs / mo · 1 brand · text + images" : "每月 50 次執行 · 1 個品牌 · 文案 + 圖",
      monthly:         defaults.starterStd,
      annual:          defaults.starterAnnual,
      standardMonthly: defaults.starterStd,
      isEarlyBird: false,
      members: isEn ? "1 brand · 1 user" : "1 個品牌 · 1 位用戶",
      features: isEn ? [
        "50 runs / month (each run = all variants + images)",
        "Single-post & content-pack task templates",
        "AI images (Flux / GPT Image-1 / Imagen / Ideogram)",
        "Brand brain positioning (USP · voice · audience)",
        "E-invoices (personal / B2B)",
        "Deep-research campaigns — available on Solo and above",
      ] : [
        "每月 50 次執行（每次含所有文案變體 + 圖）",
        "單篇與套組全任務模板",
        "AI 圖（Flux / GPT Image-1 / Imagen / Ideogram）",
        "品牌大腦定位（USP · 語氣 · 受眾）",
        "電子發票（個人 / B2B）",
        "深度研究企劃：升級 Solo 解鎖",
      ],
      cta: isEn ? "Start 7-day trial" : "開始 7 天試用",
      highlight: false,
      highlightLabel: undefined as string | undefined,
      annualNote: isEn
        ? "Billed annually — US$750/yr (2 months free)"
        : currency === "TWD"
          ? "年繳 NT$22,500（每月平均 NT$1,875，省 NT$4,500）"
          : "年繳 US$750（每月平均 US$62.5，送 2 個月）",
      annualSavePct: 17,
    },
    {
      code: "drop_pro",
      name: "OnBrand Solo",
      sub: isEn ? "Unlimited runs · 1 brand · text + images" : "無限次執行 · 1 個品牌 · 文案 + 圖",
      monthly:         defaults.soloStd,
      annual:          defaults.soloAnnual,
      standardMonthly: defaults.soloStd,
      isEarlyBird: false,
      members: isEn ? "1 brand · 1 user" : "1 個品牌 · 1 位用戶",
      features: isEn ? [
        "Unlimited runs (single / pack / campaign — all templates)",
        "Unlimited AI images (Flux / GPT Image-1 / Imagen / Ideogram)",
        "Deep-research campaign pipeline",
        "E-invoices (personal / B2B)",
        "Video generation — coming soon",
        "Brand rename or swap — contact support",
      ] : [
        "無限次執行（單篇 / 套組 / 企劃全任務模板）",
        "無限 AI 圖（Flux / GPT Image-1 / Imagen / Ideogram）",
        "深度研究企劃流程",
        "電子發票（個人 / B2B）",
        "影片生成：roadmap 加購包",
        "改名 / 換品牌：聯繫客服",
      ],
      cta: isEn ? "Start 7-day trial" : "開始 7 天試用",
      highlight: true,
      highlightLabel: isEn ? "MOST POPULAR" : "最多人選",
      annualNote: isEn
        ? "Billed annually — US$3,000/yr (~US$250/mo, 2 months free)"
        : currency === "TWD"
          ? "年繳 NT$90,000（每月平均 NT$7,500，省 NT$18,000）"
          : "年繳 US$3,000（每月平均 US$250，送 2 個月）",
      annualSavePct: 17,
    },
  ];

  const faq: [string, string][] = isEn ? [
    ["What counts as a 'run' in Starter?", "One run = one task execution, no matter how many variants or images are generated. If a content-pack task produces 5 caption variants + 5 images, that still counts as 1 run. System failures are automatically refunded — unsatisfied with the output and re-running counts as a new run."],
    ["What happens when my trial ends?", "Trial stops when EITHER the 7 days OR your 1,000 trial points run out — whichever comes first. We'll email you 1 day before expiry. After that, your account becomes read-only — you can still sign in and view history, but can't produce new content."],
    ["Can I cancel anytime?", "Yes. Hit Cancel in Account settings whenever you want. You'll keep access until the current period ends, then no more charges."],
    ["Do Starter's 50 runs roll over?", "No. The 50 runs reset on the 1st of each month. Annual plans also reset monthly on the 1st."],
    ["Can I upgrade from Starter to Solo later?", "Yes — upgrade any time in Account settings. The change takes effect immediately and billing switches to the Solo rate."],
    ["Who owns the output?", "You do. We claim zero rights. Use it commercially, remix it, resell it — it's all yours."],
    ["Can I get a company invoice?", "Yes. Add your tax ID + company name in Account settings → Invoice info, and the next charge will auto-issue a B2B e-invoice."],
    ["What's the difference between Single, Pack, and Campaign tasks?", "Single = one fast output (1 variant). Pack = 5 variants + 5 images generated in parallel. Campaign = deep-research pipeline with live web data, competitive analysis, and full content strategy (Solo+ only)."],
  ] : [
    ["Starter 的「50 次執行」是什麼意思？", "一次執行 = 跑一次任務，不管產出幾個變體或圖片都算 1 次。例如套組任務產出 5 份文案 + 5 張圖，仍算 1 次。系統錯誤自動退回；對輸出不滿意而主動重跑，算新的 1 次。"],
    ["試用期過了會怎樣？", "試用在「7 天到期」或「1,000 試用點數用完」時停止，先到先停。到期前 1 天會 email 通知。若沒升級，帳號切到唯讀模式（仍能登入查歷史，但無法產出新內容）。"],
    ["可以中途取消嗎？", "可以，隨時於「帳號設定」取消。當期到期前仍能正常使用，到期後不再扣款。"],
    ["Starter 的 50 次用不完會累積嗎？", "不會，每月 1 號重置。年費方案每月 1 號也重置（不累積）。"],
    ["之後可以從 Starter 升級到 Solo 嗎？", "可以，隨時在帳號設定升級，立即生效並改按 Solo 費率計費。"],
    ["產出的內容版權歸誰？", "全部歸您。我們不主張任何權利，可商用、二次創作、轉售。"],
    ["能開公司發票嗎？", "可以。在「帳號設定 → 發票資訊」填統編 + 公司名，下次扣款自動開立 B2B 三聯式電子發票。"],
    ["單篇 / 套組 / 企劃任務有什麼差別？", "單篇 = 單一快速輸出（1 個變體）。套組 = 5 個文案變體 + 5 張圖並行產出。企劃 = 附帶即時網路研究、競品分析、完整內容策略的深度研究流程（Solo 以上才有）。"],
  ];

  // 2026-07-15 (CJ): early-bird banner removed — offer closed, standard price only.
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 pt-14 pb-12">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-600 mb-3">
            PRICING · CHOOSE YOUR SCALE
          </p>
          <h1
            className="font-semibold tracking-tight leading-tight mb-3"
            style={{
              fontSize: "clamp(1.8rem, 3.5vw, 2.75rem)",
              background: "linear-gradient(135deg, #00b4bc 0%, #7c3aed 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {isEn ? "From solo creator to full agency — one toolkit" : "從個人創作者到整個 Agency — 一套工具"}
          </h1>
          <p
            className="mx-auto text-default-700"
            style={{
              fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
              fontStyle: "italic", fontSize: 15, lineHeight: 1.7, maxWidth: 640,
            }}
          >
            {isEn
              ? "SoWork brand positioning · multi-channel consistency · award-craft task library — all in one subscription"
              : "SoWork 品牌定位法 · 多平台一致性 · 得獎工藝任務庫 — 一套訂閱搞定"}
          </p>

          {/* Annual toggle */}
          <div className="mt-6 inline-flex items-center bg-neutral-100 rounded-full p-1">
            <button
              onClick={() => setAnnual(false)}
              className={`px-5 py-1.5 rounded-full text-sm font-medium transition ${
                !annual ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"
              }`}
            >
              {isEn ? "Monthly" : "月繳"}
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-5 py-1.5 rounded-full text-sm font-medium transition ${
                annual ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"
              }`}
            >
              {isEn ? "Yearly" : "年繳"} <span className="text-xs text-emerald-600 ml-1">{isEn ? "2 months free" : "送 2 個月"}</span>
            </button>
          </div>
        </div>

        {/* 2-tier grid */}
        <div className="grid gap-5 md:grid-cols-2 mb-6 max-w-3xl mx-auto">
          {TIERS.map((tier) => (
            <div
              key={tier.code}
              className="bg-white rounded-2xl p-6 flex flex-col"
              style={{
                border: tier.highlight ? "2px solid #171717" : "1px solid #D4D4D4",
                boxShadow: tier.highlight ? "0 8px 32px -8px rgba(0,0,0,0.12)" : undefined,
                position: "relative",
              }}
            >
              {tier.highlightLabel && (
                <span
                  className="absolute -top-3 left-6 text-[10px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded-md"
                  style={{
                    background: tier.highlight
                      ? "#171717"
                      : "linear-gradient(90deg, #059669 0%, #10b981 100%)",
                    color: "white",
                  }}
                >
                  {tier.highlightLabel}
                </span>
              )}
              <div className="mb-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-600">
                  {tier.name}
                </p>
                <p className="text-xs text-neutral-700 mt-0.5">{tier.sub}</p>
              </div>

              <div className="flex items-baseline gap-1.5 mt-3">
                <span className="text-3xl font-bold text-neutral-900 tabular-nums">
                  {annual
                    ? (currency === "USD"
                        ? tier.annual.toLocaleString()
                        : (tier.annual / 1000).toLocaleString() + "K")
                    : tier.monthly.toLocaleString()}
                </span>
                <span className="text-sm text-neutral-700">
                  {sym} {annual ? (isEn ? "/ year" : "/ 年") : (isEn ? "/ month" : "/ 月")}
                </span>
              </div>
              <p className="text-xs text-neutral-700 mt-1">
                {annual
                  ? ((tier as any).annualNote
                      ? (tier as any).annualNote
                      : (isEn
                          ? `~${sym} ${Math.round(tier.annual / 12).toLocaleString()} / month`
                          : `每月平均 ${sym} ${Math.round(tier.annual / 12).toLocaleString()}`))
                  : (isEn ? "Cancel anytime" : "隨時取消")}
              </p>
              {currency === "TWD" && (
                <p className="text-[11px] text-neutral-500 mt-1">
                  {isEn
                    ? "Fixed NTD pricing — no exchange rate fluctuation"
                    : "固定台幣定價，不受匯率影響"}
                </p>
              )}
              <p className="text-xs text-neutral-900 font-medium mt-3 pb-3 border-b border-neutral-200">
                {tier.members}
              </p>
              <ul className="space-y-2 text-sm text-neutral-800 mt-4 mb-6 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check
                      size={14}
                      className={`mt-0.5 flex-shrink-0 ${f.includes("roadmap") || f.includes("upgrade") || f.includes("升級") ? "text-neutral-400" : "text-neutral-900"}`}
                      strokeWidth={2.5}
                    />
                    <span className={f.includes("roadmap") || f.includes("upgrade") || f.includes("升級") ? "text-neutral-400" : ""}>
                      {f}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  // Wait for billing status to load before deciding route.
                  // "statusLoading" covers the brief window between mount and
                  // first response — don't misroute a logged-in user to register.
                  if (!status && !statusLoading) {
                    navigate("/auth/register");
                    return;
                  }
                  if (!status) return; // still loading — do nothing
                  if (!checkoutMut) {
                    window.location.href = "mailto:sowork@sowork.ai?subject=OnBrand Upgrade";
                    return;
                  }
                  const wsId = (status as any)?.workspaceId ?? (status as any)?.defaultWorkspaceId;
                  if (!wsId) {
                    showToastGlobal(isEn
                      ? "Couldn't find your workspace — please reload and try again."
                      : "找不到 workspace，請重新整理頁面再試一次。");
                    return;
                  }
                  checkoutMut.mutate({
                    planCode: tier.code as any,
                    workspaceId: Number(wsId),
                    annual,
                  });
                }}
                disabled={checkoutMut?.isPending}
                className="w-full py-2.5 rounded-lg font-semibold text-sm transition"
                style={{
                  background: tier.highlight ? "#171717" : "white",
                  color: tier.highlight ? "white" : "#171717",
                  border: tier.highlight ? "none" : "1px solid #171717",
                }}
              >
                {tier.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Agency / Enterprise */}
        <div className="bg-neutral-50 rounded-xl p-6 flex items-center justify-between flex-wrap gap-3 max-w-3xl mx-auto">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-600 mb-1">
              AGENCY · CUSTOM
            </p>
            <p className="text-base font-semibold text-neutral-900">{isEn ? "Agency / Enterprise" : "Agency / 企業版"}</p>
            <p className="text-sm text-neutral-700 mt-1 max-w-xl">
              {isEn
                ? "Unlimited brands · multi-user seats · white label · API access · priority support — pricing tailored to your team"
                : "無限品牌 · 多 user seats · White Label · API access · 優先客服 — 依團隊規模客製報價"}
            </p>
          </div>
          <a
            href={isEn ? "mailto:sowork@sowork.ai?subject=Agency / Enterprise inquiry" : "mailto:sowork@sowork.ai?subject=Agency 方案洽詢"}
            className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium"
          >
            {isEn ? "Talk to sales →" : "聯繫業務 →"}
          </a>
        </div>

        {/* Pricing comparison note */}
        <p className="text-center text-xs text-neutral-500 mt-4 max-w-3xl mx-auto">
          {isEn
            ? "All plans include 7-day free trial · No credit card required to start · Cancel anytime"
            : "所有方案均含 7 天免費試用 · 開始不需信用卡 · 隨時取消"}
        </p>

        {/* FAQ */}
        <div className="mt-16 text-left max-w-2xl mx-auto space-y-6">
          <h2 className="text-2xl font-bold text-neutral-900 text-center mb-8">{isEn ? "FAQ" : "常見問題"}</h2>
          {faq.map(([q, a]) => (
            <details key={q} className="border border-neutral-200 rounded-lg p-4">
              <summary className="cursor-pointer font-medium text-neutral-900">{q}</summary>
              <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-20 pt-8 border-t border-neutral-200 text-xs text-neutral-500 space-x-4">
          <Link to="/terms" className="hover:text-neutral-900">{t("footer_terms")}</Link>
          <Link to="/privacy" className="hover:text-neutral-900">{t("footer_privacy")}</Link>
          <Link to="/refund" className="hover:text-neutral-900">{t("footer_refund")}</Link>
          <a href="mailto:sowork@sowork.ai" className="hover:text-neutral-900">sowork@sowork.ai</a>
        </div>
      </div>
    </div>
  );
}
