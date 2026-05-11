/**
 * 隱私政策 — Drop Privacy Policy (PDPA-compliant).
 * 2026-05-10. 由法律顧問 review 正式版替換 (TODO).
 */
import React from "react";
import { Link } from "react-router-dom";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-neutral-50 py-12 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-neutral-200 p-10">
        <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900">← 返回首頁</Link>
        <h1 className="text-3xl font-bold mt-4 mb-2">隱私政策</h1>
        <p className="text-sm text-neutral-500 mb-8">最後更新：2026-05-10</p>

        <section className="prose prose-sm max-w-none space-y-6 text-neutral-800 leading-relaxed">
          <h2 className="text-lg font-semibold">1. 蒐集的資料</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>註冊資訊：</strong>姓名、email、密碼（雜湊儲存）、註冊 IP。</li>
            <li><strong>使用資訊：</strong>登入時間、操作紀錄、瀏覽器類型、裝置資訊。</li>
            <li><strong>內容資料：</strong>您建立的品牌、任務、內容產出（用於提供服務）。</li>
            <li><strong>付款資訊：</strong>由綠界金流處理，我們不儲存信用卡卡號。</li>
            <li><strong>通訊資訊：</strong>您透過客服 email 或 LINE 與我們的對話紀錄。</li>
          </ul>

          <h2 className="text-lg font-semibold">2. 蒐集目的</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>提供、維護及改善 Drop 服務。</li>
            <li>處理付款、開立發票、續訂提醒。</li>
            <li>客戶服務、技術支援、爭議處理。</li>
            <li>系統安全監控、防止濫用。</li>
            <li>產品分析（匿名化），用於功能優化。</li>
          </ul>

          <h2 className="text-lg font-semibold">3. 第三方服務商</h2>
          <p>我們使用以下服務商處理特定資料；他們對資料的處理同樣受其隱私政策約束：</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Anthropic / OpenAI：</strong>處理文案 / 視覺生成請求（不持久儲存）。</li>
            <li><strong>PiAPI：</strong>處理圖片、影片生成請求。</li>
            <li><strong>綠界 ECPay：</strong>處理刷卡、發票開立。</li>
            <li><strong>Pipedream：</strong>處理 Facebook 發布的 OAuth Token 託管。</li>
            <li><strong>Microsoft Azure：</strong>主機與資料庫。</li>
          </ul>

          <h2 className="text-lg font-semibold">4. 資料保存期限</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>帳號活躍期間：保存所有相關資料。</li>
            <li>取消訂閱後：保留 30 天供帳號復原。</li>
            <li>帳號刪除後：30 天內永久銷毀（除法律要求保留之記錄）。</li>
            <li>發票相關紀錄：依稅法規定保存 7 年。</li>
          </ul>

          <h2 className="text-lg font-semibold">5. 您的權利（個資法 §3）</h2>
          <p>您可隨時向我們行使以下權利：</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>查詢、閱覽您的個資。</li>
            <li>製給複製本（請至「帳號設定 → 匯出我的資料」一鍵下載 JSON）。</li>
            <li>請求補充或更正。</li>
            <li>請求停止蒐集、處理或利用。</li>
            <li>請求刪除（即帳號註銷）。</li>
          </ul>

          <h2 className="text-lg font-semibold">6. Cookie 使用</h2>
          <p>
            我們使用必要 cookie 維持登入狀態與會話。我們不使用第三方廣告 cookie。
          </p>

          <h2 className="text-lg font-semibold">7. 兒童隱私</h2>
          <p>本服務不對未滿 18 歲使用者提供，請勿提供未成年人個資。</p>

          <h2 className="text-lg font-semibold">8. 政策變更</h2>
          <p>
            如有重大變更，會於生效前 14 天透過 email 通知。
          </p>

          <h2 className="text-lg font-semibold">9. 聯絡個資專責</h2>
          <p>
            <a href="mailto:sowork@sowork.tw" className="text-blue-600 underline">sowork@sowork.tw</a>
            （標題請註明「個資相關」加速處理）
          </p>
        </section>
      </div>
    </div>
  );
}
