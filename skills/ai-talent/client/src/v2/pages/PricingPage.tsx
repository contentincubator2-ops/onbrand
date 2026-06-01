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
    : { data: null, isLoading: false };
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
  // USD:  Starter US$25 early / US$75 std  · annual US$300 (×12, no saving)
  //       Solo    US$100 early / US$300 std · annual US$1,100 (×11, 1 month free)
  // TWD:  Starter NT$750 early / NT$2,250 std · annual NT$7,500  (×10, 2 months free)
  //       Solo    NT$3,000 early / NT$9,000 std · annual NT$30,000 (×10, 2 months free)
  const defaults = currency === "USD"
    ? {
        starterEarly: 25,   starterStd: 75,   starterAnnual: 300,
        soloEarly:   100,   soloStd:   300,   soloAnnual:   1100,
      }
    : {
        starterEarly: 750,  starterStd: 2250, starterAnnual: 7500,
        soloEarly:   3000,  soloStd:   9000,  soloAnnual:   30000,
      };

  const TIERS = [
    {
      code: "drop_starter",
      name: "OnBrand Starter",
      sub: isEn ? "50 runs / mo · 1 brand · text + images" : "每月 50 次執行 · 1 個品牌 · 文案 + 圖",
      monthly:         defaults.starterEarly,
      annual:          defaults.starterAnnual,
      standardMonthly: defaults.starterStd,
      isEarlyBird: true,
      members: isEn ? "1 brand · 1 user" : "1 個品牌 · 1 位用戶",
      features: isEn ? [
        "50 runs / month (each run = all variants + images)",
        "30s & 60s task templates",
        "AI images (Flux / GPT Image-1 / Imagen / Ideogram)",
        "Brand brain positioning (USP · voice · audience)",
        "Publish + schedule to FB / IG",
        "E-invoices (personal / B2B)",
        "99s deep research — available on Solo and above",
      ] : [
        "每月 50 次執行（每次含所有文案變體 + 圖）",
        "30s 及 60s 全任務模板",
        "AI 圖（Flux / GPT Image-1 / Imagen / Ideogram）",
        "品牌大腦定位（USP · 語氣 · 受眾）",
        "FB / IG 直接發布 + 排程",
        "電子發票（個人 / B2B）",
        "99s 深度研究任務：升級 Solo 解鎖",
      ],
      cta: isEn ? "Start 7-day trial" : "開始 7 天試用",
      highlight: false,
      highlightLabel: isEn ? "EARLY BIRD · LOCKED FOREVER" : "早鳥優惠 · 永久保價",
      // Starter annual = $25×12 = $300, no extra discount
      annualNote: isEn
        ? "Billed annually — US$300/yr (same $25/mo rate, 12-month commitment)"
        : currency === "TWD"
          ? "年繳 NT$7,500（每月平均 NT$625，省 NT$1,500）"
          : "年繳 US$300（同樣 $25/月，鎖定 12 個月）",
      annualSavePct: currency === "TWD" ? 17 : 0,
    },
    {
      code: "drop_pro",
      name: "OnBrand Solo",
      sub: isEn ? "Unlimited runs · 1 brand · text + images" : "無限次執行 · 1 個品牌 · 文案 + 圖",
      monthly:         defaults.soloEarly,
      annual:          defaults.soloAnnual,
      standardMonthly: defaults.soloStd,
      isEarlyBird: true,
      members: isEn ? "1 brand · 1 user" : "1 個品牌 · 1 位用戶",
      features: isEn ? [
        "Unlimited runs (30s / 60s / 99s — all templates)",
        "Unlimited AI images (Flux / GPT Image-1 / Imagen / Ideogram)",
        "99s deep-research pipeline",
        "Publish + schedule to FB / IG (unlimited)",
        "E-invoices (personal / B2B)",
        "Video generation — coming soon",
        "Brand rename or swap — contact support",
      ] : [
        "無限次執行（30s / 60s / 99s 全任務模板）",
        "無限 AI 圖（Flux / GPT Image-1 / Imagen / Ideogram）",
        "99s 深度研究流程",
        "FB / IG 直接發布 + 排程（無限）",
        "電子發票（個人 / B2B）",
        "影片生成：roadmap 加購包",
        "改名 / 換品牌：聯繫客服",
      ],
      cta: isEn ? "Start 7-day trial" : "開始 7 天試用",
      highlight: true,
      highlightLabel: isEn ? "MOST POPULAR · EARLY BIRD" : "最多人選 · 早鳥優惠",
      annualNote: isEn
        ? "Billed annually — US$1,100/yr (~US$92/mo, one month free)"
        : currency === "TWD"
          ? "年繳 NT$30,000（每月平均 NT$2,500，省 NT$6,000）"
          : "年繳 US$1,100（每月平均約 US$92，送 1 個月）",
      annualSavePct: currency === "TWD" ? 17 : 8,
    },
  ];

  const faq: [string, string][] = isEn ? [
    ["What counts as a 'run' in Starter?", "One run = one task execution, no matter how many variants or images are generated. If a 60s task produces 5 caption variants + 5 images, that still counts as 1 run. System failures are automatically refunded — unsatisfied with the output and re-running counts as a new run."],
    ["What happens when my trial ends?", "Trial stops when EITHER the 7 days OR your 1,000 trial points run out — whichever comes first. We'll email you 1 day before expiry. After that, your account becomes read-only — you can still sign in and view history, but can't produce new content."],
    ["Can I cancel anytime?", "Yes. Hit Cancel in Account settings whenever you want. You'll keep access until the current period ends, then no more charges."],
    ["Do Starter's 50 runs roll over?", "No. The 50 runs reset on the 1st of each month. Annual plans also reset monthly on the 1st."],
    ["Can I upgrade from Starter to Solo later?", "Yes — upgrade any time in Account settings. Your early-bird Starter price is locked for as long as you stay on Starter, but when you upgrade to Solo you lock in Solo's early-bird price instead."],
    ["Who owns the output?", "You do. We claim zero rights. Use it commercially, remix it, resell it — it's all yours."],
    ["Can I get a company invoice?", "Yes. Add your tax ID + company name in Account settings → Invoice info, and the next charge will auto-issue a B2B e-invoice."],
    ["What's the difference between 30s, 60s, and 99s tasks?", "30s = single fast output (1 variant). 60s = 5 variants + 5 images in parallel (~60 seconds). 99s = deep-research pipeline with live web data, competitive analysis, and full content strategy (Solo+ only)."],
  ] : [
    ["Starter 的「50 次執行」是什麼意思？", "一次執行 = 跑一次任務，不管產出幾個變體或圖片都算 1 次。例如 60s 任務產出 5 份文案 + 5 張圖，仍算 1 次。系統錯誤自動退回；對輸出不滿意而主動重跑，算新的 1 次。"],
    ["試用期過了會怎樣？", "試用在「7 天到期」或「1,000 試用點數用完」時停止，先到先停。到期前 1 天會 email 通知。若沒升級，帳號切到唯讀模式（仍能登入查歷史，但無法產出新內容）。"],
    ["可以中途取消嗎？", "可以，隨時於「帳號設定」取消。當期到期前仍能正常使用，到期後不再扣款。"],
    ["Starter 的 50 次用不完會累積嗎？", "不會，每月 1 號重置。年費方案每月 1 號也重置（不累積）。"],
    ["之後可以從 Starter 升級到 Solo 嗎？", "可以，隨時在帳號設定升級。Starter 早鳥價只要繼續訂閱就永久保價；升級到 Solo 時，會鎖定當時 Solo 的早鳥價。"],
    ["產出的內容版權歸誰？", "全部歸您。我們不主張任何權利，可商用、二次創作、轉售。"],
    ["能開公司發票嗎？", "可以。在「帳號設定 → 發票資訊」填統編 + 公司名，下次扣款自動開立 B2B 三聯式電子發票。"],
    ["30s / 60s / 99s 任務有什麼差別？", "30s = 單一快速輸出（1 個變體）。60s = 5 個文案變體 + 5 張圖並行（約 60 秒）。99s = 附帶即時網路研究、競品分析、完整內容策略的深度研究流程（Solo 以上才有）。"],
  ];

  const showEarlyBirdBanner = status?.isEarlyBird ?? true;

  return (
    <div className="min-h-screen bg-white">
      {showEarlyBirdBanner && (
        <div className="w-full py-3 text-center text-white text-sm font-medium"
          style={{ background: "linear-gradient(90deg, #059669 0%, #10b981 60%, #34d399 100%)" }}
        >
          {isEn
            ? <>⭐ <strong>Early-bird:</strong> Starter {sym}<strong>{defaults.starterEarly}</strong>/mo · Solo {sym}<strong>{defaults.soloEarly}</strong>/mo — <strong>locked forever</strong> for accounts opened today.</>
            : <>⭐ <strong>限時早鳥</strong>：Starter {sym}<strong>{defaults.starterEarly}</strong>/月 · Solo {sym}<strong>{defaults.soloEarly}</strong>/月 — <strong>現在開通永久保價</strong></>
          }
        </div>
      )}
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

              {/* Strikethrough standard price */}
              {(tier as any).standardMonthly > tier.monthly && !annual && (
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
              {(tier as any).isEarlyBird && (tier as any).standardMonthly > tier.monthly && (
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
