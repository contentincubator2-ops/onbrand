/**
 * 服務條款 — onBrand Studio Terms of Service.
 * 2026-05-10. 由 SoWork 法律顧問 review 後正式版替換 (TODO).
 */
import { Link } from "react-router-dom";
import { useLang } from "../../../../lib/i18n";

export default function TermsPage() {
  const { lang } = useLang();
  const isEn = lang === "en";

  return (
    <div className="min-h-screen bg-neutral-50 py-12 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-neutral-200 p-10">
        <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900">
          {isEn ? "← Back to home" : "← 返回首頁"}
        </Link>
        <h1 className="text-3xl font-bold mt-4 mb-2">
          {isEn ? "Terms of Service" : "服務條款"}
        </h1>
        <p className="text-sm text-neutral-500 mb-8">
          {isEn ? "Last updated: 2026-05-19" : "最後更新：2026-05-19"}
        </p>

        <section className="prose prose-sm max-w-none space-y-6 text-neutral-800 leading-relaxed">
          <h2 className="text-lg font-semibold">
            {isEn ? "1. Who provides this service" : "1. 服務提供方"}
          </h2>
          <p>
            {isEn
              ? `This service ("onBrand Studio" or "the Service") is provided by SoWork 摘星社群行銷顧問股份有限公司 ("we", "us"). These terms are a binding agreement between you and us. By signing up for or using onBrand Studio, you agree to all of them.`
              : "本服務（以下簡稱「onBrand Studio」或「本服務」）由 摘星社群行銷顧問股份有限公司（以下簡稱「我們」）提供。本條款是您與我們之間的正式協議。註冊或使用 onBrand Studio 即表示您同意本條款全部內容。"}
          </p>

          <h2 className="text-lg font-semibold">
            {isEn ? "2. What onBrand Studio does" : "2. 服務內容"}
          </h2>
          <p>
            {isEn
              ? "onBrand Studio is an AI-powered marketing content and planning tool. Features include (but aren't limited to): copywriting, visual design suggestions, video generation, cross-channel publishing, brand asset management, and multi-day campaign scheduling."
              : "onBrand Studio 是 AI 驅動的行銷內容生成與企劃工具。功能包含但不限於：文案產出、視覺設計建議、影片生成、跨平台發布、品牌資產管理、多日企劃排程等。"}
          </p>

          <h2 className="text-lg font-semibold">
            {isEn ? "3. Your account" : "3. 帳號註冊"}
          </h2>
          <p>
            {isEn
              ? "You'll need to give us real, accurate, complete information. One person or one company gets one account. If we find the info is fake or the account is being abused, we may suspend or close it."
              : "您需提供真實、準確、完整的個人資料。一個自然人或法人僅可註冊一個帳號。若發現帳號資訊不實或濫用，我們有權暫停或終止服務。"}
          </p>

          <h2 className="text-lg font-semibold">
            {isEn ? "4. Subscription and payment" : "4. 訂閱與付款"}
          </h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              {isEn
                ? "Free trial: new users get full access to onBrand Studio for 7 days. No credit card required."
                : "免費試用：新用戶可免費使用 onBrand Studio 全部功能 7 天，免綁信用卡。"}
            </li>
            <li>
              {isEn
                ? <>Paid plans (Starter / Solo): see current prices at <a href="/pricing" className="text-blue-600 underline">/pricing</a>. Annual billing = 10 months' rate for 12 months of service (2 months free). Subscribers who joined during the past early-bird period keep their locked price as promised.</>
                : <>付費方案（Starter / Solo）：現行定價請見 <a href="/pricing" className="text-blue-600 underline">/pricing</a>。年繳 = 以 10 個月月費計、使用 12 個月（送 2 個月）。過去早鳥期間訂閱之用戶，依原承諾維持保價。</>}
            </li>
            <li>
              {isEn
                ? "Auto-renewal: subscriptions renew automatically. You can cancel anytime in Account Settings — your current period stays active until it ends."
                : "自動續訂：訂閱會自動續扣，您可隨時於「帳號設定」取消，當期到期前仍可繼續使用。"}
            </li>
            <li>
              {isEn
                ? "Payment methods: credit card via Stripe (PCI-DSS compliant)."
                : "付款方式：信用卡（由 Stripe 處理，符合 PCI-DSS 規範）。"}
            </li>
            <li>
              {isEn
                ? "Invoices: we issue electronic invoices automatically to the email on your account."
                : "發票：採電子發票，系統會自動寄送至您註冊的 email。"}
            </li>
          </ul>

          <h2 className="text-lg font-semibold">
            {isEn ? "5. Refund policy" : "5. 退費政策"}
          </h2>
          <p>
            {isEn ? "See our " : "請參閱 "}
            <Link to="/refund" className="text-blue-600 underline">
              {isEn ? "refund terms" : "退費條款"}
            </Link>
            {isEn ? "." : "。"}
          </p>

          <h2 className="text-lg font-semibold">
            {isEn ? "6. What you can't do" : "6. 使用限制"}
          </h2>
          <p>{isEn ? "You agree not to:" : "您同意不會："}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              {isEn
                ? "Use onBrand Studio to produce illegal, infringing, inflammatory, harassing, or otherwise harmful content."
                : "用 onBrand Studio 產出違法、侵權、煽動、騷擾或其他違反公序良俗的內容。"}
            </li>
            <li>
              {isEn
                ? "Attempt to reverse-engineer, decompile, or otherwise access the backend without authorization."
                : "嘗試破解、反編譯或其他未經授權的方式接入服務後端。"}
            </li>
            <li>
              {isEn
                ? "Share or resell your account to anyone else."
                : "分享、轉售帳號予第三方使用。"}
            </li>
            <li>
              {isEn
                ? "Hammer the service with automated scripts beyond reasonable use, during trial or paid periods."
                : "在試用期或付費期間以惡意自動化腳本超過合理使用範圍。"}
            </li>
          </ul>

          <h2 className="text-lg font-semibold">
            {isEn ? "7. Who owns the content" : "7. 內容權利"}
          </h2>
          <p>
            {isEn
              ? "Anything you generate through onBrand Studio is yours. We don't claim rights to it. You do agree that we can collect anonymous usage data — with no way to identify you — to make the product better."
              : "您透過 onBrand Studio 產出的所有內容，所有權歸您所有。我們不主張任何權利。您同意我們得在不識別您身分的前提下，蒐集匿名使用數據以改善服務品質。"}
          </p>

          <h2 className="text-lg font-semibold">
            {isEn ? "8. Changes and ending the service" : "8. 服務變更與終止"}
          </h2>
          <p>
            {isEn
              ? "We may adjust features, pricing, or discontinue the service. If we do, we'll email you 14 days before any change takes effect, so you can cancel before the next renewal."
              : "我們保留隨時調整功能、定價或終止服務的權利。如有調整，會於生效前 14 天透過 email 通知您，您可選擇於下次續訂前取消訂閱。"}
          </p>

          <h2 className="text-lg font-semibold">
            {isEn ? "9. Disclaimer" : "9. 免責聲明"}
          </h2>
          <p>
            {isEn
              ? "onBrand Studio is an assistive creative tool. AI-generated content may be inaccurate, out of date, or inappropriate. Review it before you use it — we don't guarantee outcomes."
              : "onBrand Studio 為輔助創作工具，AI 生成內容可能含有不準確、過時或不適當之資訊。您於使用前應自行檢視，我們對使用結果不負保證責任。"}
          </p>

          <h2 className="text-lg font-semibold">
            {isEn ? "10. Governing law and disputes" : "10. 準據法與爭議解決"}
          </h2>
          <p>
            {isEn
              ? "These terms are governed by the laws of the Republic of China (Taiwan). For any dispute, both sides will negotiate in good faith first; if that fails, the Taipei District Court has first-instance jurisdiction."
              : "本條款適用中華民國法律。如發生爭議，雙方應先誠信協商；協商不成，以台灣台北地方法院為第一審管轄法院。"}
          </p>

          <h2 className="text-lg font-semibold">
            {isEn ? "11. Contact" : "11. 聯絡方式"}
          </h2>
          <p>
            <a href="mailto:sowork@sowork.ai" className="text-blue-600 underline">
              sowork@sowork.ai
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
