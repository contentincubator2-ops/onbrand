/**
 * Pricing page — single-tier Drop Pro.
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

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="max-w-5xl mx-auto px-6 pt-16 pb-12 text-center">
        <h1 className="text-4xl font-bold text-neutral-900 mb-3">一個價格，所有功能</h1>
        <p className="text-lg text-neutral-600 mb-8">
          AI 小白也能輕鬆上手，月費 NT$ 990 用到飽。
        </p>

        {/* Annual toggle */}
        <div className="inline-flex items-center bg-neutral-100 rounded-full p-1 mb-12">
          <button
            onClick={() => setAnnual(false)}
            className={`px-6 py-2 rounded-full text-sm font-medium transition ${
              !annual ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"
            }`}
          >
            月繳
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`px-6 py-2 rounded-full text-sm font-medium transition ${
              annual ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"
            }`}
          >
            年繳 <span className="text-xs text-emerald-600 ml-1">省 17%</span>
          </button>
        </div>

        {/* Single plan card */}
        <div className="max-w-md mx-auto bg-white border-2 border-neutral-900 rounded-2xl p-8 shadow-lg">
          <div className="text-left">
            <p className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1">Drop Pro</p>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-5xl font-bold text-neutral-900">
                {annual ? "9,900" : "990"}
              </span>
              <span className="text-lg text-neutral-500">NT$ / {annual ? "年" : "月"}</span>
            </div>
            {annual && (
              <p className="text-xs text-neutral-500 mb-4">每月平均 NT$ 825</p>
            )}
            {!annual && <p className="text-xs text-neutral-500 mb-4">隨時取消</p>}

            <p className="text-sm text-neutral-600 my-6 pb-6 border-b border-neutral-200">
              7 天免費試用 · 免綁信用卡
            </p>

            <ul className="space-y-2 text-sm text-neutral-800 mb-8">
              {[
                ["所有 90+ 任務模板", "FB / IG / YT / TT / LinkedIn / Email / PR / 品牌 / 用戶研究"],
                ["完整 7 天內容企劃台", "多日跨平台一鍵排程"],
                ["5 個品牌資產管理", "logo / 定位 / 用詞庫 / 視覺風格"],
                ["AI 圖片生成 150 張 / 月", "OpenAI gpt-image / Flux"],
                ["AI 影片生成 10 支 / 月", "PiAPI Kling 5 秒短片"],
                ["FB 直接發布", "Pipedream Connect 安全 OAuth"],
                ["Email + LINE 客服", "工作日 24 小時內回覆"],
                ["電子發票", "個人 / B2B 統編皆可"],
              ].map(([title, desc]) => (
                <li key={title} className="flex items-start gap-2">
                  <Check size={16} className="text-neutral-900 mt-0.5 flex-shrink-0" strokeWidth={2.5} />
                  <span>
                    <strong>{title}</strong>
                    <span className="block text-xs text-neutral-500">{desc}</span>
                  </span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => {
                if (status?.expired) {
                  showToastGlobal("付款功能明天上線，請先聯繫 drop@sowork.ai");
                } else if (!status) {
                  navigate("/auth/register");
                } else {
                  showToastGlobal("付款功能明天上線，請先聯繫 drop@sowork.ai");
                }
              }}
              className="w-full py-3 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white font-semibold transition"
            >
              {status ? (status.expired ? "立即升級" : "你已是 Drop 用戶") : "開始 7 天免費試用"}
            </button>
            {!status && (
              <p className="text-center text-xs text-neutral-400 mt-3">
                註冊後立刻可用，到期前再決定要不要繼續
              </p>
            )}
          </div>
        </div>

        {/* Enterprise teaser */}
        <div className="mt-16 max-w-2xl mx-auto bg-neutral-50 rounded-xl p-6 text-left">
          <p className="text-sm font-semibold text-neutral-900 mb-1">需要更多？</p>
          <p className="text-sm text-neutral-600 mb-3">
            企業版提供無限額度、團隊成員、SLA、客製品牌風格庫、專屬 CSM。
          </p>
          <a href="mailto:drop@sowork.ai?subject=企業版洽詢" className="text-sm text-neutral-900 font-medium hover:underline">
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
          <a href="mailto:drop@sowork.ai" className="hover:text-neutral-900">drop@sowork.ai</a>
        </div>
      </div>
    </div>
  );
}
