/**
 * 隱私政策 — onBrand Studio Privacy Policy (PDPA-compliant).
 * 2026-05-10. 由法律顧問 review 正式版替換 (TODO).
 */
import { Link } from "react-router-dom";
import { useLang } from "../../../../lib/i18n";

export default function PrivacyPage() {
  const { lang } = useLang();
  const isEn = lang === "en";

  return (
    <div className="min-h-screen bg-neutral-50 py-12 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-neutral-200 p-10">
        <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900">
          {isEn ? "← Back to home" : "← 返回首頁"}
        </Link>
        <h1 className="text-3xl font-bold mt-4 mb-2">
          {isEn ? "Privacy Policy" : "隱私政策"}
        </h1>
        <p className="text-sm text-neutral-500 mb-8">
          {isEn ? "Last updated: 2026-05-10" : "最後更新：2026-05-10"}
        </p>

        <section className="prose prose-sm max-w-none space-y-6 text-neutral-800 leading-relaxed">
          <h2 className="text-lg font-semibold">
            {isEn ? "1. What we collect" : "1. 蒐集的資料"}
          </h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>{isEn ? "Sign-up info: " : "註冊資訊："}</strong>
              {isEn
                ? "name, email, password (stored as a hash), sign-up IP."
                : "姓名、email、密碼（雜湊儲存）、註冊 IP。"}
            </li>
            <li>
              <strong>{isEn ? "Usage info: " : "使用資訊："}</strong>
              {isEn
                ? "login times, action logs, browser type, device info."
                : "登入時間、操作紀錄、瀏覽器類型、裝置資訊。"}
            </li>
            <li>
              <strong>{isEn ? "Content data: " : "內容資料："}</strong>
              {isEn
                ? "the brands, projects, and outputs you create (used to deliver the service)."
                : "您建立的品牌、任務、內容產出（用於提供服務）。"}
            </li>
            <li>
              <strong>{isEn ? "Payment info: " : "付款資訊："}</strong>
              {isEn
                ? "handled by Stripe — we don't store credit card numbers."
                : "由 Stripe 金流處理，我們不儲存信用卡卡號。"}
            </li>
            <li>
              <strong>{isEn ? "Support info: " : "通訊資訊："}</strong>
              {isEn
                ? "your messages with us over support email or LINE."
                : "您透過客服 email 或 LINE 與我們的對話紀錄。"}
            </li>
          </ul>

          <h2 className="text-lg font-semibold">
            {isEn ? "2. Why we collect it" : "2. 蒐集目的"}
          </h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              {isEn
                ? "Deliver, maintain, and improve onBrand Studio."
                : "提供、維護及改善 onBrand Studio 服務。"}
            </li>
            <li>
              {isEn
                ? "Process payments, issue invoices, send renewal reminders."
                : "處理付款、開立發票、續訂提醒。"}
            </li>
            <li>
              {isEn
                ? "Customer support, technical help, dispute resolution."
                : "客戶服務、技術支援、爭議處理。"}
            </li>
            <li>
              {isEn
                ? "System security, abuse prevention."
                : "系統安全監控、防止濫用。"}
            </li>
            <li>
              {isEn
                ? "Anonymous product analytics, to improve features."
                : "產品分析（匿名化），用於功能優化。"}
            </li>
          </ul>

          <h2 className="text-lg font-semibold">
            {isEn ? "3. Third-party providers" : "3. 第三方服務商"}
          </h2>
          <p>
            {isEn
              ? "We use the following providers to handle specific data. Their use of the data is governed by their own privacy policies:"
              : "我們使用以下服務商處理特定資料；他們對資料的處理同樣受其隱私政策約束："}
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Anthropic / OpenAI:</strong>{" "}
              {isEn
                ? "process copy / visual generation requests (no persistent storage)."
                : "處理文案 / 視覺生成請求（不持久儲存）。"}
            </li>
            <li>
              <strong>PiAPI:</strong>{" "}
              {isEn
                ? "processes image and video generation requests."
                : "處理圖片、影片生成請求。"}
            </li>
            <li>
              <strong>Stripe:</strong>{" "}
              {isEn
                ? "processes card payments and issues receipts (PCI-DSS compliant; we never see card numbers)."
                : "處理刷卡、寄送收據（符合 PCI-DSS 規範；我們不接觸卡號）。"}
            </li>
            <li>
              <strong>Pipedream:</strong>{" "}
              {isEn
                ? "holds OAuth tokens for Facebook publishing."
                : "處理 Facebook 發布的 OAuth Token 託管。"}
            </li>
            <li>
              <strong>Microsoft Azure:</strong>{" "}
              {isEn ? "hosting and database." : "主機與資料庫。"}
            </li>
          </ul>

          <h2 className="text-lg font-semibold">
            {isEn ? "4. How long we keep your data" : "4. 資料保存期限"}
          </h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              {isEn
                ? "While your account is active: we keep everything related to it."
                : "帳號活躍期間：保存所有相關資料。"}
            </li>
            <li>
              {isEn
                ? "After you cancel: 30 days, so you can restore the account."
                : "取消訂閱後：保留 30 天供帳號復原。"}
            </li>
            <li>
              {isEn
                ? "After you delete the account: permanently destroyed within 30 days (except records the law requires us to keep)."
                : "帳號刪除後：30 天內永久銷毀（除法律要求保留之記錄）。"}
            </li>
            <li>
              {isEn
                ? "Invoice records: retained for 7 years, per tax law."
                : "發票相關紀錄：依稅法規定保存 7 年。"}
            </li>
          </ul>

          <h2 className="text-lg font-semibold">
            {isEn
              ? "5. Your rights (Taiwan PDPA §3)"
              : "5. 您的權利（個資法 §3）"}
          </h2>
          <p>
            {isEn
              ? "You can ask us to do any of the following at any time:"
              : "您可隨時向我們行使以下權利："}
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              {isEn
                ? "View your personal data."
                : "查詢、閱覽您的個資。"}
            </li>
            <li>
              {isEn
                ? "Get a copy (Account Settings → Export my data → one-click JSON)."
                : "製給複製本（請至「帳號設定 → 匯出我的資料」一鍵下載 JSON）。"}
            </li>
            <li>
              {isEn ? "Request additions or corrections." : "請求補充或更正。"}
            </li>
            <li>
              {isEn
                ? "Ask us to stop collecting, processing, or using it."
                : "請求停止蒐集、處理或利用。"}
            </li>
            <li>
              {isEn
                ? "Delete it (i.e. close your account)."
                : "請求刪除（即帳號註銷）。"}
            </li>
          </ul>

          <h2 className="text-lg font-semibold">
            {isEn ? "6. Cookies" : "6. Cookie 使用"}
          </h2>
          <p>
            {isEn
              ? "We use essential cookies to keep you signed in and maintain your session. We don't use third-party advertising cookies."
              : "我們使用必要 cookie 維持登入狀態與會話。我們不使用第三方廣告 cookie。"}
          </p>

          <h2 className="text-lg font-semibold">
            {isEn ? "7. Kids' privacy" : "7. 兒童隱私"}
          </h2>
          <p>
            {isEn
              ? "This service isn't for users under 18. Don't submit personal data for minors."
              : "本服務不對未滿 18 歲使用者提供，請勿提供未成年人個資。"}
          </p>

          <h2 className="text-lg font-semibold">
            {isEn ? "8. Changes to this policy" : "8. 政策變更"}
          </h2>
          <p>
            {isEn
              ? "We'll email you 14 days before any material change takes effect."
              : "如有重大變更，會於生效前 14 天透過 email 通知。"}
          </p>

          <h2 className="text-lg font-semibold">
            {isEn ? "9. Data protection contact" : "9. 聯絡個資專責"}
          </h2>
          <p>
            <a href="mailto:sowork@sowork.ai" className="text-blue-600 underline">
              sowork@sowork.ai
            </a>
            {isEn
              ? ' (use subject line "Privacy" to speed things up)'
              : "（標題請註明「個資相關」加速處理）"}
          </p>
        </section>
      </div>
    </div>
  );
}
