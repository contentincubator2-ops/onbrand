/**
 * 退費條款 — OnBrand Refund Policy.
 * 2026-05-10.
 */
import React from "react";
import { Link } from "react-router-dom";
import { useLang } from "../../../lib/i18n";

export default function RefundPage() {
  const { lang } = useLang();
  const isEn = lang === "en";

  return (
    <div className="min-h-screen bg-neutral-50 py-12 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-neutral-200 p-10">
        <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900">
          {isEn ? "← Back to home" : "← 返回首頁"}
        </Link>
        <h1 className="text-3xl font-bold mt-4 mb-2">
          {isEn ? "Refund Policy" : "退費條款"}
        </h1>
        <p className="text-sm text-neutral-500 mb-8">
          {isEn ? "Last updated: 2026-05-19" : "最後更新：2026-05-19"}
        </p>

        <section className="prose prose-sm max-w-none space-y-6 text-neutral-800 leading-relaxed">
          <h2 className="text-lg font-semibold">
            {isEn ? "Free trial" : "免費試用"}
          </h2>
          <p>
            {isEn
              ? "New users get a free trial limited to 7 days or 1,000 trial points — whichever runs out first. No credit card needed. There are no charges during the trial — and nothing to refund."
              : "新用戶享有免費試用，上限為 7 天或 1,000 試用點數（先到先停），無須綁定信用卡。試用期內無任何費用，亦不需退費程序。"}
          </p>

          <h2 className="text-lg font-semibold">
            {isEn ? "Monthly plan refunds" : "月費方案退費"}
          </h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              {isEn ? (
                <>
                  Within <strong>7 days</strong> of payment, and if you've run no more than 3 projects, you can request a full refund.
                </>
              ) : (
                <>
                  付款後 <strong>7 日內</strong>，且累計使用次數未超過 3 個任務，可申請全額退費。
                </>
              )}
            </li>
            <li>
              {isEn ? (
                <>
                  <strong>After 7 days</strong>, the current period isn't refundable — but you can cancel right away to stop the next renewal.
                </>
              ) : (
                <>
                  付款後 <strong>超過 7 日</strong>，本期費用恕不退還，但您可立即取消訂閱避免下期續扣。
                </>
              )}
            </li>
            <li>
              {isEn
                ? "After you cancel, you keep full access until the current period ends."
                : "取消訂閱後，當期到期前仍可正常使用。"}
            </li>
          </ul>

          <h2 className="text-lg font-semibold">
            {isEn ? "Yearly plan refunds" : "年費方案退費"}
          </h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              {isEn ? (
                <>
                  Within <strong>14 days</strong> of payment, and if you haven't used the service yet, you can request a full refund.
                </>
              ) : (
                <>
                  付款後 <strong>14 日內</strong>且尚未使用，可申請全額退費。
                </>
              )}
            </li>
            <li>
              {isEn ? (
                <>
                  <strong>After 14 days</strong>, we deduct used months at the monthly equivalent of your plan and refund the remaining balance.
                </>
              ) : (
                <>
                  付款後 <strong>超過 14 日</strong>，按已使用月份數扣除（以您方案的月費均攤計算）後退還餘額。
                </>
              )}
            </li>
            <li>
              {isEn
                ? "Example: paid US$ 3,000 / year (Solo annual, $300×10), used 3 months — monthly equivalent = US$3,000÷12 = US$250; refund = 3,000 − (250 × 3) = US$ 2,250."
                : "例：年繳 Solo 方案（US$3,000，$300×10），使用 3 個月後申請，每月均攤 US$3,000÷12 = US$250，退還 3,000 - (250×3) = US$2,250（依當日匯率換算 TWD）。"}
            </li>
          </ul>

          <h2 className="text-lg font-semibold">
            {isEn ? "When refunds aren't issued" : "不予退費情形"}
          </h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              {isEn ? "Account suspended for violating the " : "違反"}
              <Link to="/terms" className="text-blue-600 underline">
                {isEn ? "Terms of Service" : "服務條款"}
              </Link>
              {isEn ? "." : "導致帳號被停用。"}
            </li>
            <li>
              {isEn
                ? "Extra costs charged by third-party services (Anthropic / PiAPI / Pipedream, etc.) caused by your misuse."
                : "第三方服務（Anthropic / PiAPI / Pipedream 等）因您濫用導致額外費用。"}
            </li>
            <li>
              {isEn
                ? "Electronic invoice already issued and more than 14 days have passed (per tax law) — we can offer credit or extended service instead."
                : "已開立電子發票且超過 14 日（依稅法規定）— 可改以折抵或服務延長處理。"}
            </li>
          </ul>

          <h2 className="text-lg font-semibold">
            {isEn ? "How to request a refund" : "退費申請流程"}
          </h2>
          <ol className="list-decimal pl-6 space-y-1">
            <li>
              {isEn ? "Email " : "email 至 "}
              <a href="mailto:sowork@sowork.ai" className="text-blue-600 underline">
                sowork@sowork.ai
              </a>
              {isEn ? ' with the subject "Refund request".' : "，標題「退費申請」。"}
            </li>
            <li>
              {isEn
                ? "Include: your account email, order date, and reason for the refund."
                : "內文附上：註冊 email、訂單時間、退費原因。"}
            </li>
            <li>
              {isEn ? (
                <>
                  We'll reply with our decision within <strong>3 business days</strong>.
                </>
              ) : (
                <>
                  我們於 <strong>3 個工作天內</strong>回覆審核結果。
                </>
              )}
            </li>
            <li>
              {isEn ? (
                <>
                  Once approved, the refund lands on your original payment method within <strong>7 business days</strong>.
                </>
              ) : (
                <>
                  核准後 <strong>7 個工作天內</strong>退至原付款方式。
                </>
              )}
            </li>
          </ol>

          <h2 className="text-lg font-semibold">
            {isEn ? "Disputes" : "爭議處理"}
          </h2>
          <p>
            {isEn ? "If you disagree with our decision, the dispute process in section 10 of the " : "如對退費結果有疑慮，可循"}
            <Link to="/terms" className="text-blue-600 underline">
              {isEn ? "Terms of Service" : "服務條款"}
            </Link>
            {isEn ? " applies." : "第 10 條爭議解決機制處理。"}
          </p>
        </section>
      </div>
    </div>
  );
}
