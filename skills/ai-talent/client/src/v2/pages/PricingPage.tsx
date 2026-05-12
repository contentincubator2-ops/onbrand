/**
 * Pricing page — single-tier OnBrand 個人.
 * 2026-05-10. CJ direction「one price, AI 小白 friendly」.
 */
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { showToastGlobal } from "../../components/ui/Toast";

export default function PricingPage() {
  const navigate = useNavigate();
  const [annual, setAnnual] = React.useState(false);
  const statusQuery = (trpc as any).billing?.getStatus?.useQuery
    ? (trpc as any).billing.getStatus.useQuery()
    : { data: null };
  const status = statusQuery?.data;

  // 2026-05-11 — 4-tier pricing: Solo / Team / Agency / Enterprise. CJ
  // direction「Team / Agency 方案是 $1M 真正的槓桿」.
  const TIERS = [
    {
      code: "drop_pro",
      name: "OnBrand Pro",
      sub: "個人操盤者",
      monthly: 990, annual: 9900,
      members: "1 位用戶 · 5 個品牌",
      features: [
        "所有 90+ 任務模板",
        "FB 直接發布 + 排程（無限）",
        "AI 圖 150 / 影片 10 / 月",
        "電子發票（個人 / B2B）",
      ],
      cta: "開始 7 天試用",
    },
    {
      code: "drop_team",
      name: "OnBrand Team",
      sub: "5 人小團隊 / Agency 入門",
      monthly: 4990, annual: 49900,
      members: "5 位用戶 · 20 個品牌",
      features: [
        "多客戶 workspace（一帳號管多客戶）",
        "邀請客戶以 viewer 角色看自己品牌",
        "月度客戶工作報表",
        "OnBrand Pro 全部功能",
      ],
      cta: "升級到 Team",
      highlight: true,
    },
    {
      code: "drop_agency",
      name: "OnBrand Agency",
      sub: "代理商 / 多客戶營運",
      monthly: 14990, annual: 149900,
      members: "無限用戶 · 無限品牌",
      features: [
        "White Label（換 logo + 公司名）",
        "API 存取（接你自己的 workflow）",
        "優先客服 + 1 對 1 onboarding",
        "OnBrand Team 全部功能",
      ],
      cta: "升級到 Agency",
    },
  ];

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
            從 1 個人到整個 Agency 都用得了
          </h1>
          <p
            className="mx-auto text-default-700"
            style={{
              fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
              fontStyle: "italic", fontSize: 15, lineHeight: 1.7, maxWidth: 640,
            }}
          >
            SoWork 品牌定位法 · 多平台一致性 · 排程發布 — 一套訂閱搞定
          </p>

          {/* Annual toggle */}
          <div className="mt-6 inline-flex items-center bg-neutral-100 rounded-full p-1">
            <button
              onClick={() => setAnnual(false)}
              className={`px-5 py-1.5 rounded-full text-sm font-medium transition ${
                !annual ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"
              }`}
            >
              月繳
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-5 py-1.5 rounded-full text-sm font-medium transition ${
                annual ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"
              }`}
            >
              年繳 <span className="text-xs text-emerald-600 ml-1">省 17%</span>
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
                  style={{ background: "#171717", color: "white" }}
                >
                  最適合 Agency
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
                  {annual ? (tier.annual / 1000).toLocaleString() + "K" : tier.monthly.toLocaleString()}
                </span>
                <span className="text-sm text-neutral-700">NT$ / {annual ? "年" : "月"}</span>
              </div>
              <p className="text-xs text-neutral-700 mt-1">
                {annual ? `每月平均 NT$ ${Math.round(tier.annual / 12).toLocaleString()}` : "隨時取消"}
              </p>
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
                  } else {
                    showToastGlobal("付款功能即將上線（綠界整合中）— 請先聯繫 sowork@sowork.tw");
                  }
                }}
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
            <p className="text-base font-semibold text-neutral-900">企業版</p>
            <p className="text-sm text-neutral-700 mt-1 max-w-xl">
              無限額度 · 客製 LoRA 品牌風格庫 · SLA 承諾 · 專屬 CSM · On-prem 部署
            </p>
          </div>
          <a
            href="mailto:sowork@sowork.tw?subject=企業版洽詢"
            className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium"
          >
            聯繫業務 →
          </a>
        </div>

        {/* FAQ */}
        <div className="mt-16 text-left max-w-2xl mx-auto space-y-6">
          <h2 className="text-2xl font-bold text-neutral-900 text-center mb-8">常見問題</h2>
          {[
            ["試用期過了會怎樣？", "試用結束前 1 天會 email 通知。到期後若沒升級，帳號會自動切到唯讀模式（仍能登入查看歷史紀錄，但無法產出新內容）。"],
            ["可以中途取消嗎？", "可以，隨時於「帳號設定」按取消，當期到期前仍能正常使用，到期後不再扣款。"],
            ["額度沒用完會累積嗎？", "不會。月費方案每月 1 號重置，年費方案每月 1 號也會重置。"],
            ["影片生成 10 支夠嗎？", "5-10 秒短片 10 支 / 月足夠 IG Reels、TikTok、YT Shorts 一週一支的節奏。需要更多請洽企業版。"],
            ["產出的內容版權歸誰？", "全部歸您。我們不主張任何權利，您可商用、二次創作、轉售產出的素材。"],
            ["能開公司發票嗎？", "可以。在「帳號設定 → 發票資訊」填統編 + 公司名，下次扣款會自動開立 B2B 三聯式電子發票。"],
          ].map(([q, a]) => (
            <details key={q} className="border border-neutral-200 rounded-lg p-4">
              <summary className="cursor-pointer font-medium text-neutral-900">{q}</summary>
              <p className="mt-2 text-sm text-neutral-600">{a}</p>
            </details>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-20 pt-8 border-t border-neutral-200 text-xs text-neutral-500 space-x-4">
          <Link to="/terms" className="hover:text-neutral-900">服務條款</Link>
          <Link to="/privacy" className="hover:text-neutral-900">隱私政策</Link>
          <Link to="/refund" className="hover:text-neutral-900">退費條款</Link>
          <a href="mailto:sowork@sowork.tw" className="hover:text-neutral-900">sowork@sowork.tw</a>
        </div>
      </div>
    </div>
  );
}
