/**
 * emailService.ts — dual-provider email (Resend OR SendGrid).
 *
 * 2026-05-08 (P0-A fix): previous version called sgMail.setApiKey()
 * with EITHER key, but SendGrid SDK rejects Resend keys → all sends
 * silent-failed. Now we detect by key prefix:
 *   - RESEND_API_KEY (starts with "re_") → use Resend REST API
 *   - SENDGRID_API_KEY (starts with "SG.") → use @sendgrid/mail
 * If both are set, Resend wins (preferred provider for trial).
 */

import sgMail from "@sendgrid/mail";
import { isRuntimeFeatureEnabled } from "../core/ops/runtimeSafety";

type EmailData = {
  to: string;
  subject: string;
  html: string;
};

type Provider = "resend" | "sendgrid" | "none";

function detectProvider(): Provider {
  if (process.env.RESEND_API_KEY?.startsWith("re_")) return "resend";
  if (process.env.SENDGRID_API_KEY?.startsWith("SG.")) return "sendgrid";
  return "none";
}

let _sgInitialized = false;
function initSendGrid() {
  if (_sgInitialized) return;
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("Missing SENDGRID_API_KEY");
  sgMail.setApiKey(apiKey);
  _sgInitialized = true;
}

async function sendViaResend(data: EmailData, fromAddr: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY!;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:    fromAddr,
      to:      data.to,
      subject: data.subject,
      html:    data.html,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${text.slice(0, 240)}`);
  }
}

/**
 * Send an email using SendGrid
 */
/**
 * SEC: Mask email address for logs (PII protection / GDPR Art.5(1)(c)).
 * "alice@example.com" → "al***@example.com"
 */
function maskEmail(addr: string): string {
  const at = addr.indexOf("@");
  if (at < 1) return "***";
  const local = addr.slice(0, at);
  const domain = addr.slice(at);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}${domain}`;
}

export async function sendEmail(data: EmailData): Promise<void> {
  if (!isRuntimeFeatureEnabled("OUTBOUND_EMAIL_ENABLED")) {
    console.warn(`[email] Suppressed by OUTBOUND_EMAIL_ENABLED=false for ${maskEmail(data.to)}`);
    throw new Error("Outbound email is disabled in this environment");
  }

  const fromAddr = process.env.EMAIL_FROM || "noreply@sowork.ai";
  const provider = detectProvider();

  try {
    if (provider === "resend") {
      await sendViaResend(data, fromAddr);
    } else if (provider === "sendgrid") {
      initSendGrid();
      await sgMail.send({
        to: data.to,
        from: fromAddr,
        subject: data.subject,
        html: data.html,
      });
    } else {
      throw new Error("No email provider configured (set RESEND_API_KEY or SENDGRID_API_KEY)");
    }

    // SEC: don't log raw email — only masked form
    console.log(`[email] Sent via ${provider} to ${maskEmail(data.to)}: ${data.subject}`);
  } catch (error) {
    console.error(`[email] Failed to send via ${provider}:`, error);
    throw new Error("Failed to send email");
  }
}

/**
 * Send email verification email
 */
export async function sendEmailVerification(data: {
  to: string;
  name: string;
  verifyUrl: string;
}): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>驗證您的電子郵件</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">歡迎加入 onBrand Studio</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px; margin-bottom: 20px;">您好 <strong>${data.name}</strong>，</p>
          <p style="font-size: 16px; margin-bottom: 20px;">感謝您註冊 onBrand Studio！請點擊下方按鈕驗證您的電子郵件地址：</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.verifyUrl}" style="display: inline-block; background: #667eea; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">驗證電子郵件</a>
          </div>
          <p style="font-size: 14px; color: #666; margin-bottom: 10px;">或複製以下連結到瀏覽器：</p>
          <p style="font-size: 12px; color: #999; word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">${data.verifyUrl}</p>
          <p style="font-size: 14px; color: #666; margin-top: 20px;">此連結將在 24 小時後失效。</p>
          <p style="font-size: 14px; color: #999; margin-top: 30px;">如果您沒有註冊 onBrand Studio，請忽略此郵件。</p>
        </div>
        <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #999;">
          <p>&copy; 2025 onBrand Studio. All rights reserved.</p>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: data.to,
    subject: "驗證您的電子郵件 - onBrand Studio",
    html,
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordReset(data: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>重設您的密碼</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">重設密碼</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px; margin-bottom: 20px;">您好 <strong>${data.name}</strong>，</p>
          <p style="font-size: 16px; margin-bottom: 20px;">我們收到了您重設密碼的請求。請點擊下方按鈕重設您的密碼：</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.resetUrl}" style="display: inline-block; background: #667eea; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">重設密碼</a>
          </div>
          <p style="font-size: 14px; color: #666; margin-bottom: 10px;">或複製以下連結到瀏覽器：</p>
          <p style="font-size: 12px; color: #999; word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">${data.resetUrl}</p>
          <p style="font-size: 14px; color: #666; margin-top: 20px;">此連結將在 1 小時後失效。</p>
          <p style="font-size: 14px; color: #999; margin-top: 30px;">如果您沒有請求重設密碼，請忽略此郵件。</p>
        </div>
        <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #999;">
          <p>&copy; 2025 onBrand Studio. All rights reserved.</p>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: data.to,
    subject: "重設您的密碼 - onBrand Studio",
    html,
  });
}

/** HTML-escape a value interpolated into an email body. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Shared frame for account / billing notices: dark header, one paragraph block, one button. */
function noticeHtml(o: { title: string; name: string; paragraphs: string[]; cta?: { label: string; url: string }; footnote?: string }): string {
  const p = o.paragraphs.map((t) => `<p style="font-size: 16px; margin-bottom: 20px;">${t}</p>`).join("\n          ");
  const cta = o.cta
    ? `<div style="text-align: center; margin: 30px 0;">
            <a href="${o.cta.url}" style="display: inline-block; background: #18181b; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">${esc(o.cta.label)}</a>
          </div>`
    : "";
  const foot = o.footnote ? `<p style="font-size: 14px; color: #666; margin-top: 20px;">${o.footnote}</p>` : "";
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${esc(o.title)}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #18181b; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">${esc(o.title)}</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px; margin-bottom: 20px;">您好 <strong>${esc(o.name)}</strong>，</p>
          ${p}
          ${cta}
          ${foot}
        </div>
        <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #999;">
          <p>&copy; onBrand Studio</p>
        </div>
      </body>
    </html>
  `;
}

const SUPPORT_NOTE = "有任何問題請回信或寫信到 sowork@sowork.ai。";

/** A renewal charge failed. Sent from the Stripe webhook (invoice.payment_failed). */
export async function sendPaymentFailed(data: { to: string; name: string; accountUrl: string }): Promise<void> {
  await sendEmail({
    to: data.to,
    subject: "訂閱扣款未成功，請更新付款方式 - onBrand Studio",
    html: noticeHtml({
      title: "訂閱扣款未成功",
      name: data.name,
      paragraphs: ["這一期的 onBrand Studio 訂閱費用沒有扣款成功，常見原因是信用卡過期或額度不足。在付款方式更新之前，產出任務會先暫停，您的品牌資料與內容都還在。"],
      cta: { label: "更新付款方式", url: data.accountUrl },
      footnote: `更新後系統會自動重新扣款並恢復使用。${SUPPORT_NOTE}`,
    }),
  });
}

/** The account is verified and the trial has started. */
export async function sendWelcome(data: { to: string; name: string; appUrl: string }): Promise<void> {
  await sendEmail({
    to: data.to,
    subject: "帳號已開通，從建立品牌開始 - onBrand Studio",
    html: noticeHtml({
      title: "帳號已開通",
      name: data.name,
      paragraphs: [
        "您的 onBrand Studio 帳號已經驗證完成，免費試用現在開始。",
        "第一步是建立品牌：貼上官網或粉專網址，系統會整理出品牌定位。之後每一篇內容都會依這份定位產出。",
      ],
      cta: { label: "建立第一個品牌", url: data.appUrl },
      footnote: SUPPORT_NOTE,
    }),
  });
}

/** Someone added this (already registered) user to their workspace. */
export async function sendWorkspaceInvite(data: {
  to: string; name: string; inviterName: string; workspaceName: string; roleLabel: string; appUrl: string;
}): Promise<void> {
  await sendEmail({
    to: data.to,
    subject: `${data.inviterName} 邀請您加入「${data.workspaceName}」 - onBrand Studio`,
    html: noticeHtml({
      title: "您已加入團隊",
      name: data.name,
      paragraphs: [
        `${esc(data.inviterName)} 已將您加入 onBrand Studio 的團隊「${esc(data.workspaceName)}」，您的角色是<strong>${esc(data.roleLabel)}</strong>。`,
        "登入後即可看到這個團隊的品牌與內容。",
      ],
      cta: { label: "前往 onBrand Studio", url: data.appUrl },
      footnote: `如果您不認識邀請人，${SUPPORT_NOTE}`,
    }),
  });
}

/** The user turned renewal off; access continues until `endsOn`. */
export async function sendSubscriptionCanceled(data: {
  to: string; name: string; endsOn: string | null; accountUrl: string;
}): Promise<void> {
  const until = data.endsOn
    ? `在 <strong>${esc(data.endsOn)}</strong> 之前仍可照常使用，之後不會再扣款。`
    : "當期到期前仍可照常使用，之後不會再扣款。";
  await sendEmail({
    to: data.to,
    subject: "訂閱已取消 - onBrand Studio",
    html: noticeHtml({
      title: "訂閱已取消",
      name: data.name,
      paragraphs: [
        `我們已收到您的取消申請。${until}`,
        "到期後您的品牌資料與內容會保留，隨時可以重新訂閱。如果改變主意，到期前可以在帳號頁恢復訂閱。",
      ],
      cta: { label: "查看訂閱狀態", url: data.accountUrl },
      footnote: SUPPORT_NOTE,
    }),
  });
}
