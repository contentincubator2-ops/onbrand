/**
 * 退費條款 — OnBrand Refund Policy.
 * 2026-05-10.
 */
import React from "react";
import { Link } from "react-router-dom";

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-neutral-50 py-12 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-neutral-200 p-10">
        <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900">← 返回首頁</Link>
        <h1 className="text-3xl font-bold mt-4 mb-2">退費條款</h1>
        <p className="text-sm text-neutral-500 mb-8">最後更新：2026-05-10</p>

        <section className="prose prose-sm max-w-none space-y-6 text-neutral-800 leading-relaxed">
          <h2 className="text-lg font-semibold">免費試用</h2>
          <p>
            新用戶享有 7 天免費試用，無須綁定信用卡。試用期內無任何費用，亦不需退費程序。
          </p>

          <h2 className="text-lg font-semibold">月費方案退費</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>付款後 <strong>7 日內</strong>，且累計使用次數未超過 3 個任務，可申請全額退費。</li>
            <li>付款後 <strong>超過 7 日</strong>，本期費用恕不退還，但您可立即取消訂閱避免下期續扣。</li>
            <li>取消訂閱後，當期到期前仍可正常使用。</li>
          </ul>

          <h2 className="text-lg font-semibold">年費方案退費</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>付款後 <strong>14 日內</strong>且尚未使用，可申請全額退費。</li>
            <li>付款後 <strong>超過 14 日</strong>，按已使用月份扣除（NT$ 990 / 月）後退還餘額。</li>
            <li>例：年繳 9,900 元，使用 3 個月後申請，退還 9,900 - (990×3) = 6,930 元。</li>
          </ul>

          <h2 className="text-lg font-semibold">不予退費情形</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>違反<Link to="/terms" className="text-blue-600 underline">服務條款</Link>導致帳號被停用。</li>
            <li>第三方服務（Anthropic / PiAPI / Pipedream 等）因您濫用導致額外費用。</li>
            <li>已開立電子發票且超過 14 日（依稅法規定）— 可改以折抵或服務延長處理。</li>
          </ul>

          <h2 className="text-lg font-semibold">退費申請流程</h2>
          <ol className="list-decimal pl-6 space-y-1">
            <li>email 至 <a href="mailto:sowork@sowork.tw" className="text-blue-600 underline">sowork@sowork.tw</a>，標題「退費申請」。</li>
            <li>內文附上：註冊 email、訂單時間、退費原因。</li>
            <li>我們於 <strong>3 個工作天內</strong>回覆審核結果。</li>
            <li>核准後 <strong>7 個工作天內</strong>退至原付款方式。</li>
          </ol>

          <h2 className="text-lg font-semibold">爭議處理</h2>
          <p>
            如對退費結果有疑慮，可循<Link to="/terms" className="text-blue-600 underline">服務條款</Link>第 10 條爭議解決機制處理。
          </p>
        </section>
      </div>
    </div>
  );
}
