/**
 * Pricing page — single-tier OnBrand 個人.
 * 2026-05-10. CJ direction「one price, AI 小白 friendly」.
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
    : { data: null };
  const status = statusQuery?.data;

  const isEn = lang === "en";

  // 2026-05-14 (CJ「我們使用 Stripe」): wire CTA to Stripe Checkout.
  const checkoutMut = (trpc as any).stripe?.createCheckout?.useMutation
    ? (trpc as any).stripe.createCheckout.useMutation({
        onSuccess: (data: any) => {
          if (data?.url) window.location.assign(data.url);
        },
        onError: (e: any) =>
          showToastGlobal((isEn ? "Checkout failed: " : "結帳失敗：") + (e?.message ?? e)),
      })
    : null;

  // 2026-05-14 (CJ「TWD + USD 雙幣」): derive currency + amounts from status.
  // Falls back to TWD with default sticker so /pricing works for logged-out
  // visitors too.
  const currency: "TWD" | "USD" = (status as any)?.currency ?? "TWD";
  const sym = currency === "USD" ? "US$" : "NT$";
  // 2026-05-14 (CJ「美金為準，每天匯率動」): USD truth, TWD derives at live rate.
  const usdToTwd = (status as any)?.usdToTwd ?? 32;
  const r = (usd: number) => Math.round(usd * usdToTwd);
  const defaults = currency === "USD"
    ? { soloEarly: 30, soloStd: 50, soloAnnual: 300, team: 160, teamAnnual: 1600, agency: 500, agencyAnnual: 5000 }
    : { soloEarly: r(30), soloStd: r(50), soloAnnual: r(300), team: r(160), teamAnnual: r(1600), agency: r(500), agencyAnnual: r(5000) };

  // 2026-05-11 — 4-tier pricing: Solo / Team / Agency / Enterprise.
  const TIERS = [
    {
      code: "drop_pro",
      name: isEn ? "OnBrand Solo" : "OnBrand 個人",
      sub: isEn ? "For solo operators" : "個人操盤者",
      monthly: (status as any)?.priceMonthly ?? defaults.soloEarly,
      annual:  (status as any)?.priceAnnually ?? defaults.soloAnnual,
      standardMonthly: (status as any)?.standardPriceMonthly ?? defaults.soloStd,
      isEarlyBird: status?.isEarlyBird ?? true,
      members: isEn ? "1 user · 1 brand" : "1 位用戶 · 1 個品牌",
      features: isEn ? [
        "All 30s / 60s / 99s task templates",
        "30 posts · 150 AI images / month",
        "Publish + schedule to Facebook (unlimited)",
        "E-invoices (personal / B2B)",
        "Video features coming (paused for now)",
      ] : [
        "30s / 60s / 99s 全部任務模板",
        "30 篇貼文 · 150 張 AI 圖 / 月",
        "FB 直接發布 + 排程（無限）",
        "電子發票（個人 / B2B）",
        "影片功能加購中（暫時下架）",
      ],
      cta: isEn ? "Start 7-day trial" : "開始 7 天試用",
      // 2026-05-12 (CJ「solo 是主推」): highlight the solo plan since
      // that's the only one we're actively selling right now. Team /
      // Agency stay listed but de-emphasized.
      highlight: true,
      highlightLabel: isEn ? "EARLY BIRD · LOCKED FOREVER" : "早鳥優惠 · 永久保價",
    },
    {
      code: "drop_team",
      name: "OnBrand Team",
      sub: isEn ? "5-person teams · agency starter" : "5 人小團隊 / Agency 入門",
      monthly: defaults.team, annual: defaults.teamAnnual,
      members: isEn ? "5 users · 20 brands" : "5 位用戶 · 20 個品牌",
      features: isEn ? [
        "Multi-client workspace (one account, many clients)",
        "Invite clients as viewers of their own brand",
        "Monthly client work report",
        "Everything in OnBrand Solo",
      ] : [
        "多客戶 workspace（一帳號管多客戶）",
        "邀請客戶以 viewer 角色看自己品牌",
        "月度客戶工作報表",
        "OnBrand 個人全部功能",
      ],
      cta: isEn ? "Go Team" : "升級到 Team",
    },
    {
      code: "drop_agency",
      name: "OnBrand Agency",
      sub: isEn ? "Agencies · multi-client ops" : "代理商 / 多客戶營運",
      monthly: defaults.agency, annual: defaults.agencyAnnual,
      members: isEn ? "Unlimited users · unlimited brands" : "無限用戶 · 無限品牌",
      features: isEn ? [
        "White label (your logo + name)",
        "API access (plug into your workflow)",
        "Priority support + 1-on-1 onboarding",
        "Everything in OnBrand Team",
      ] : [
        "White Label（換 logo + 公司名）",
        "API 存取（接你自己的 workflow）",
        "優先客服 + 1 對 1 onboarding",
        "OnBrand Team 全部功能",
      ],
      cta: isEn ? "Go Agency" : "升級到 Agency",
    },
  ];

  const faq: [string, string][] = isEn ? [
    ["What happens when my trial ends?", "We'll email you 1 day before it ends. If you don't upgrade, your account flips to read-only — you can still sign in and view your history, but can't make new content."],
    ["Can I cancel anytime?", "Yes. Hit Cancel in Account settings whenever you want. You'll keep access until the period ends, then no more charges."],
    ["Do unused credits roll over?", "Nope. Monthly plans reset on the 1st. Annual plans also reset monthly on the 1st."],
    ["Is 10 videos a month enough?", "Yes — 10 short clips (5-10s) covers ~1 IG Reel / TikTok / YT Short per week. Need more? Try Enterprise."],
    ["Who owns the output?", "You do. We claim zero rights. Use it commercially, remix it, resell it — it's all yours."],
    ["Can I get a company invoice?", "Yes. Add your tax ID + company name in Account settings → Invoice info, and the next charge will auto-issue a B2B e-invoice."],
  ] : [
    ["試用期過了會怎樣？", "試用結束前 1 天會 email 通知。到期後若沒升級，帳號會自動切到唯讀模式（仍能登入查看歷史紀錄，但無法產出新內容）。"],
    ["可以中途取消嗎？", "可以，隨時於「帳號設定」按取消，當期到期前仍能正常使用，到期後不再扣款。"],
    ["額度沒用完會累積嗎？", "不會。月費方案每月 1 號重置，年費方案每月 1 號也會重置。"],
    ["影片生成 10 支夠嗎？", "5-10 秒短片 10 支 / 月足夠 IG Reels、TikTok、YT Shorts 一週一支的節奏。需要更多請洽企業版。"],
    ["產出的內容版權歸誰？", "全部歸您。我們不主張任何權利，您可商用、二次創作、轉售產出的素材。"],
    ["能開公司發票嗎？", "可以。在「帳號設定 → 發票資訊」填統編 + 公司名，下次扣款會自動開立 B2B 三聯式電子發票。"],
  ];

  // 2026-05-12 (CJ「我要有訂價方案的建議，1500 定價，早鳥 900」):
  // Show the early-bird offer prominently when applicable. Unauthenticated
  // visitors see this by default (status is null → isEarlyBird falls to true)
  // so /pricing functions as a conversion page.
  const showEarlyBirdBanner =
    (status?.isEarlyBird ?? true) && (TIERS[0] as any).standardMonthly > TIERS[0].monthly;

  return (
    <div className="min-h-screen bg-white">
      {showEarlyBirdBanner && (
        <div className="w-full py-3 text-center text-white text-sm font-medium"
          style={{ background: "linear-gradient(90deg, #059669 0%, #10b981 60%, #34d399 100%)" }}
        >
          {isEn
            ? <>⭐ <strong>Early-bird:</strong> {sym} <strong>{defaults.soloEarly}</strong>/mo (standard {sym} {defaults.soloStd.toLocaleString()}) — <strong>locked forever</strong> for accounts opened today.</>
            : <>⭐ <strong>限時早鳥</strong>：{sym} <strong>{defaults.soloEarly}</strong>/月（標準價 {sym} {defaults.soloStd.toLocaleString()}）— <strong>現在開通永久保價</strong>，老用戶終身不漲</>
          }
        </div>
      )}
      <div className="max-w-6xl mx-auto px-6 pt-14 pb-12">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-600 mb-3">
            {isEn ? "PRICING · CHOOSE YOUR SCALE" : "PRICING · CHOOSE YOUR SCALE"}
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
            {isEn ? "From solo to full agency — one toolkit" : "從 1 個人到整個 Agency 都用得了"}
          </h1>
          <p
            className="mx-auto text-default-700"
            style={{
              fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
              fontStyle: "italic", fontSize: 15, lineHeight: 1.7, maxWidth: 640,
            }}
          >
            {isEn
              ? "SoWork brand positioning · multi-channel consistency · scheduled publishing — all in one subscription"
              : "SoWork 品牌定位法 · 多平台一致性 · 排程發布 — 一套訂閱搞定"}
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
              {isEn ? "Yearly" : "年繳"} <span className="text-xs text-emerald-600 ml-1">{isEn ? "Save 17%" : "省 17%"}</span>
            </button>
          </div>
        </div>

        {/* 3-tier grid */}
        <div className="grid gap-5 md:grid-cols-3 mb-10">
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
              {tier.highlight && (
                <span
                  className="absolute -top-3 left-6 text-[10px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded-md"
                  style={{
                    background: (tier as any).highlightLabel?.includes("早鳥") || (tier as any).highlightLabel?.includes("EARLY")
                      ? "linear-gradient(90deg, #059669 0%, #10b981 100%)"
                      : "#171717",
                    color: "white",
                  }}
                >
                  {(tier as any).highlightLabel ?? (isEn ? "BEST FOR AGENCIES" : "最適合 Agency")}
                </span>
              )}
              <div className="mb-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-600">
                  {tier.name}
                </p>
                <p className="text-xs text-neutral-700 mt-0.5">{tier.sub}</p>
              </div>
              {/* 2026-05-12: strikethrough standard price ABOVE the big price
                  so early-bird saving (NT$ 1500 → NT$ 900) is the first
                  visual signal. Only renders for solo plan on monthly view. */}
              {(tier as any).standardMonthly && (tier as any).standardMonthly > tier.monthly && !annual && (
                <div className="mt-3 text-sm text-neutral-400 line-through tabular-nums">
                  {sym} {(tier as any).standardMonthly.toLocaleString()} / {isEn ? "month" : "月"}
                </div>
              )}
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-3xl font-bold text-neutral-900 tabular-nums">
                  {annual
                    ? (currency === "USD"
                        ? tier.annual.toLocaleString()
                        : (tier.annual / 1000).toLocaleString() + "K")
                    : tier.monthly.toLocaleString()}
                </span>
                <span className="text-sm text-neutral-700">{sym} {annual ? (isEn ? "/ year" : "/ 年") : (isEn ? "/ month" : "/ 月")}</span>
              </div>
              <p className="text-xs text-neutral-700 mt-1">
                {annual
                  ? (isEn
                      ? `~${sym} ${Math.round(tier.annual / 12).toLocaleString()} / month`
                      : `每月平均 ${sym} ${Math.round(tier.annual / 12).toLocaleString()}`)
                  : (isEn ? "Cancel anytime" : "隨時取消")}
              </p>
              {/* 2026-05-14 (CJ「美金為準，每天匯率動」): hint that TWD floats. */}
              {currency === "TWD" && (
                <p className="text-[11px] text-neutral-500 mt-1">
                  {isEn
                    ? `Billed in TWD at today's USD rate (1 USD ≈ ${usdToTwd.toFixed(2)} NTD)`
                    : `依當日匯率計算（1 USD ≈ ${usdToTwd.toFixed(2)} NTD），每天浮動`}
                </p>
              )}
              {(tier as any).isEarlyBird && (tier as any).standardMonthly && (tier as any).standardMonthly > tier.monthly && (
                <p className="text-xs text-emerald-700 mt-1 font-medium">
                  {isEn ? "⭐ Early-bird price · locked in forever" : "⭐ 早鳥優惠 · 永久保價"}
                </p>
              )}
              <p className="text-xs text-neutral-900 font-medium mt-3 pb-3 border-b border-neutral-200">
                {tier.members}
              </p>
              <ul className="space-y-2 text-sm text-neutral-800 mt-4 mb-6 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check size={14} className="text-neutral-900 mt-0.5 flex-shrink-0" strokeWidth={2.5} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  if (!status) {
                    navigate("/auth/register");
                    return;
                  }
                  if (tier.code === "enterprise" || !checkoutMut) {
                    window.location.href = "mailto:sowork@sowork.ai?subject=OnBrand Enterprise";
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

        {/* Enterprise row */}
        <div className="bg-neutral-50 rounded-xl p-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-600 mb-1">
              ENTERPRISE · CUSTOM
            </p>
            <p className="text-base font-semibold text-neutral-900">{isEn ? "Enterprise" : "企業版"}</p>
            <p className="text-sm text-neutral-700 mt-1 max-w-xl">
              {isEn
                ? "Unlimited quota · custom LoRA brand style library · SLA · dedicated CSM · on-prem deployment"
                : "無限額度 · 客製 LoRA 品牌風格庫 · SLA 承諾 · 專屬 CSM · On-prem 部署"}
            </p>
          </div>
          <a
            href={isEn ? "mailto:sowork@sowork.ai?subject=Enterprise inquiry" : "mailto:sowork@sowork.ai?subject=企業版洽詢"}
            className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium"
          >
            {isEn ? "Talk to sales →" : "聯繫業務 →"}
          </a>
        </div>

        {/* FAQ */}
        <div className="mt-16 text-left max-w-2xl mx-auto space-y-6">
          <h2 className="text-2xl font-bold text-neutral-900 text-center mb-8">{isEn ? "FAQ" : "常見問題"}</h2>
          {faq.map(([q, a]) => (
            <details key={q} className="border border-neutral-200 rounded-lg p-4">
              <summary className="cursor-pointer font-medium text-neutral-900">{q}</summary>
              <p className="mt-2 text-sm text-neutral-600">{a}</p>
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
