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
