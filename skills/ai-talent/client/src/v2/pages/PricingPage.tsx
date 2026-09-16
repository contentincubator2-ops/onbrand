/**
 * Pricing page — 3 tiers: Starter / Solo / Studio + Agency contact card.
 * 2026-05-19. CJ direction: add Starter at US$25 early / US$75 std.
 * Task counting = per execution run (all variants + images in one run = 1 use).
 */
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { showToastGlobal } from "../../components/ui/Toast";
import { useLang } from "../../lib/i18n";

type PricingFeature = {
  label: string;
  section?: boolean;
  included?: boolean;
};

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
  // 2026-09-09 approved public pricing: annual billing is 12 monthly payments
  // with no annual discount. Existing grandfathered customers remain governed
  // by the server-side effective-price rules.
  // USD: Basic US$75/mo · US$900/yr · Professional US$300/mo · US$3,600/yr
  // TWD: Basic NT$2,250/mo · NT$27,000/yr · Professional NT$9,000/mo · NT$108,000/yr
  const defaults = currency === "USD"
    ? {
        starterStd: 75,   starterAnnual: 900,
        soloStd:   300,   soloAnnual:   3600,
      }
    : {
        starterStd: 2250, starterAnnual: 27000,
        soloStd:   9000,  soloAnnual:   108000,
      };

  const TIERS = [
    {
      code: "drop_starter",
      name: "OnBrand 基礎版",
      sub: "1 個品牌 · 2 席 · 執行次數不限",
      monthly:         defaults.starterStd,
      annual:          defaults.starterAnnual,
      standardMonthly: defaults.starterStd,
      isEarlyBird: false,
      members: "2 席",
      features: [
        { label: "策略層", section: true },
        { label: "品牌定位", included: true },
        { label: "自建任務卡 3 張（存入品牌任務庫）", included: true },
        { label: "內容層", section: true },
        { label: "11 個通路選 2 個（每月可更換）", included: true },
        { label: "可用任務卡 203 張：得獎案例 99＋標竿品牌 63＋平台通則 41", included: true },
        { label: "其他", section: true },
        { label: "企劃任務開放", included: true },
        { label: "無成效加值功能", included: false },
      ] satisfies PricingFeature[],
      cta: isEn ? "Start 7-day trial" : "開始 7 天試用",
      highlight: false,
      highlightLabel: undefined as string | undefined,
      annualNote: isEn
        ? "Billed annually — US$900/yr (12 months)"
        : currency === "TWD"
          ? "年繳 NT$27,000（12 個月）"
          : "年繳 US$900（12 個月）",
      annualSavePct: 0,
    },
    {
      code: "drop_pro",
      name: "OnBrand 專業版",
      sub: "1 個品牌 · 5 席 · 執行次數不限",
      monthly:         defaults.soloStd,
      annual:          defaults.soloAnnual,
      standardMonthly: defaults.soloStd,
      isEarlyBird: false,
      members: "5 席",
      features: [
        { label: "策略層", section: true },
        { label: "品牌定位＋產品定位 10 個＋活動定位每月 1 次", included: true },
        { label: "自建任務卡 10 張（存入品牌任務庫）", included: true },
        { label: "內容層", section: true },
        { label: "11 個通路選 5 個（每月可更換）", included: true },
        { label: "可用任務卡 249 張＝上述 203 張＋爆款結構卡 46 張", included: true },
        { label: "爆款結構卡每月更新", included: true },
        { label: "其他", section: true },
        { label: "企劃任務開放｜審核工作流", included: true },
        { label: "可額外加購成效加值功能", included: true },
      ] satisfies PricingFeature[],
      cta: isEn ? "Start 7-day trial" : "開始 7 天試用",
      highlight: true,
      highlightLabel: isEn ? "MOST POPULAR" : "最多人選",
      annualNote: isEn
        ? "Billed annually — US$3,600/yr (12 months)"
        : currency === "TWD"
          ? "年繳 NT$108,000（12 個月）"
          : "年繳 US$3,600（12 個月）",
      annualSavePct: 0,
    },
  ];

  const faq: [string, string][] = [
    ["「執行次數不限」是什麼意思？", "兩個自助方案均不限制任務執行次數；差異在通路數、任務卡範圍、定位能力、自建卡張數、席次與審核工作流。"],
    ["兩個方案最大的差別是什麼？", "基礎版提供品牌定位、2 個通路與 203 張任務卡；專業版增加產品／活動定位、5 個通路、爆款結構卡、5 席與審核工作流。"],
    ["策略顧問導入與 AI 自動化報告可以單獨購買嗎？", "兩項加購均需搭配 OnBrand 專業版。AI 自動化報告的標準範圍為 1 品牌、1 市場、20 品項內。"],
  ];

  // 2026-07-15 (CJ): early-bird banner removed — offer closed, standard price only.
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 pt-14 pb-12">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-600 mb-3">
            方案與報價
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
            從個人創作者到完整團隊 — 一套工具
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
              {isEn ? "Yearly" : "年繳"} <span className="text-xs text-emerald-600 ml-1">{isEn ? "12 months" : "12 個月"}</span>
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
                    ? tier.annual.toLocaleString()
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
                {tier.features.map((feature) => feature.section ? (
                  <li key={feature.label} className="pt-2 first:pt-0 text-[11px] font-bold tracking-[0.12em] text-neutral-500">
                    {feature.label}
                  </li>
                ) : (
                  <li key={feature.label} className="flex items-start gap-2">
                    {feature.included === false ? (
                      <X size={14} className="mt-0.5 flex-shrink-0 text-neutral-400" strokeWidth={2.5} />
                    ) : (
                      <Check size={14} className="mt-0.5 flex-shrink-0 text-neutral-900" strokeWidth={2.5} />
                    )}
                    <span className={feature.included === false ? "text-neutral-500" : ""}>{feature.label}</span>
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

        {/* Professional-plan add-ons */}
        <div className="bg-neutral-50 rounded-xl p-6 flex items-center justify-between flex-wrap gap-3 max-w-3xl mx-auto">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-600 mb-1">
              專業方案限定加購
            </p>
            <p className="text-base font-semibold text-neutral-900">策略顧問導入／AI 自動化報告</p>
            <ul className="text-sm text-neutral-700 mt-2 max-w-xl space-y-1 list-disc pl-5">
              <li>策略顧問導入 NT$80,000（一次性，含客製任務卡 8 張；第 9 張起 NT$25,000／張）。</li>
              <li>AI 自動化報告 NT$48,000 建置＋NT$25,000／月維運；品項 21–50 起依級距加購。</li>
            </ul>
          </div>
          <a
            href="mailto:sowork@sowork.ai?subject=OnBrand 加購服務洽詢"
            className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium"
          >
            {isEn ? "Talk to sales →" : "聯繫業務 →"}
          </a>
        </div>

        {/* Pricing comparison note */}
        <p className="text-center text-xs text-neutral-500 mt-4 max-w-3xl mx-auto">
          {isEn
            ? "All plans include 7-day free trial · No credit card required to start · Cancel anytime"
            : "所有方案均含 7 天免費試用 · 開始不需信用卡 · 隨時取消\n本頁價格均為未稅價；報價有效期 30 日。實際導入範圍以簽約工作說明書為準。"}
        </p>

        {/* FAQ */}
        <div className="mt-16 text-left max-w-2xl mx-auto space-y-6">
          <h2 className="text-2xl font-bold text-neutral-900 text-center mb-8">常見問題</h2>
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
