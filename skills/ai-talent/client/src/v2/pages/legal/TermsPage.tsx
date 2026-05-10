/**
 * 服務條款 — Drop Pro Terms of Service.
 * 2026-05-10. 由 SoWork 法律顧問 review 後正式版替換 (TODO).
 */
import React from "react";
import { Link } from "react-router-dom";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-neutral-50 py-12 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-neutral-200 p-10">
        <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900">← 返回首頁</Link>
        <h1 className="text-3xl font-bold mt-4 mb-2">服務條款</h1>
        <p className="text-sm text-neutral-500 mb-8">最後更新：2026-05-10</p>

        <section className="prose prose-sm max-w-none space-y-6 text-neutral-800 leading-relaxed">
          <h2 className="text-lg font-semibold">1. 服務提供方</h2>
          <p>
            本服務（以下簡稱「Drop」或「本服務」）由 摘星社群行銷顧問股份有限公司
            （以下簡稱「我們」）提供。本條款是您與我們之間的正式協議。
            註冊或使用 Drop 即表示您同意本條款全部內容。
          </p>

          <h2 className="text-lg font-semibold">2. 服務內容</h2>
          <p>
            Drop 是 AI 驅動的行銷內容生成與企劃工具。功能包含但不限於：文案產出、
            視覺設計建議、影片生成、跨平台發布、品牌資產管理、多日企劃排程等。
          </p>

          <h2 className="text-lg font-semibold">3. 帳號註冊</h2>
          <p>
            您需提供真實、準確、完整的個人資料。一個自然人或法人僅可註冊一個帳號。
            若發現帳號資訊不實或濫用，我們有權暫停或終止服務。
          </p>

          <h2 className="text-lg font-semibold">4. 訂閱與付款</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>免費試用：新用戶可免費使用 Drop 全部功能 7 天，免綁信用卡。</li>
            <li>付費方案：Drop Pro 月費 NT$ 990 / 月，或年繳 NT$ 9,900（折抵約 17%）。</li>
            <li>自動續訂：訂閱會自動續扣，您可隨時於「帳號設定」取消，當期到期前仍可繼續使用。</li>
            <li>付款方式：信用卡、行動支付（綠界金流，明日上線）。</li>
            <li>發票：採電子發票，系統會自動寄送至您註冊的 email。</li>
          </ul>

          <h2 className="text-lg font-semibold">5. 退費政策</h2>
          <p>請參閱 <Link to="/refund" className="text-blue-600 underline">退費條款</Link>。</p>

          <h2 className="text-lg font-semibold">6. 使用限制</h2>
          <p>您同意不會：</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>用 Drop 產出違法、侵權、煽動、騷擾或其他違反公序良俗的內容。</li>
            <li>嘗試破解、反編譯或其他未經授權的方式接入服務後端。</li>
            <li>分享、轉售帳號予第三方使用。</li>
            <li>在試用期或付費期間以惡意自動化腳本超過合理使用範圍。</li>
          </ul>

          <h2 className="text-lg font-semibold">7. 內容權利</h2>
          <p>
            您透過 Drop 產出的所有內容，所有權歸您所有。我們不主張任何權利。
            您同意我們得在不識別您身分的前提下，蒐集匿名使用數據以改善服務品質。
          </p>

          <h2 className="text-lg font-semibold">8. 服務變更與終止</h2>
          <p>
            我們保留隨時調整功能、定價或終止服務的權利。如有調整，會於生效前
            14 天透過 email 通知您，您可選擇於下次續訂前取消訂閱。
          </p>

          <h2 className="text-lg font-semibold">9. 免責聲明</h2>
          <p>
            Drop 為輔助創作工具，AI 生成內容可能含有不準確、過時或不適當之資訊。
            您於使用前應自行檢視，我們對使用結果不負保證責任。
          </p>

          <h2 className="text-lg font-semibold">10. 準據法與爭議解決</h2>
          <p>
            本條款適用中華民國法律。如發生爭議，雙方應先誠信協商；協商不成，
            以台灣台北地方法院為第一審管轄法院。
          </p>

          <h2 className="text-lg font-semibold">11. 聯絡方式</h2>
          <p>
            <a href="mailto:drop@sowork.ai" className="text-blue-600 underline">drop@sowork.ai</a>
          </p>
        </section>
      </div>
    </div>
  );
}
