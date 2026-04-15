/**
 * Unified Notification Service
 * Supports: In-App, Email (via Manus built-in), LINE Notify, Telegram Bot, WhatsApp (CallMeBot)
 */
import { getDb } from "./db";
import {
  notifications,
  notificationPreferences,
  type NotificationPreference,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

export type NotifyType = "task_completed" | "task_failed" | "task_started" | "system";

export interface NotifyPayload {
  userId: number;
  type: NotifyType;
  title: string;
  body?: string;
  taskId?: number;
  agentId?: number;
}

// ── Get or create user notification preferences ───────────────────────────────
async function getPrefs(userId: number, db: Awaited<ReturnType<typeof getDb>>): Promise<NotificationPreference | null> {
  if (!db) return null;
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

// ── Save in-app notification ──────────────────────────────────────────────────
async function saveInApp(payload: NotifyPayload, db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) return;
  await db.insert(notifications).values({
    userId: payload.userId,
    type: payload.type,
    title: payload.title,
    body: payload.body ?? null,
    taskId: payload.taskId ?? null,
    agentId: payload.agentId ?? null,
    isRead: false,
  });
}

// ── LINE Notify ───────────────────────────────────────────────────────────────
async function sendLine(token: string, message: string) {
  try {
    const res = await fetch("https://notify-api.line.me/api/notify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ message }),
    });
    if (!res.ok) {
      console.error("[LINE Notify] Failed:", res.status, await res.text());
    }
  } catch (e) {
    console.error("[LINE Notify] Error:", e);
  }
}

// ── Telegram Bot ──────────────────────────────────────────────────────────────
async function sendTelegram(botToken: string, chatId: string, text: string) {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    if (!res.ok) {
      console.error("[Telegram] Failed:", res.status, await res.text());
    }
  } catch (e) {
    console.error("[Telegram] Error:", e);
  }
}

// ── WhatsApp (via webhook URL) ────────────────────────────────────────────────
async function sendWhatsApp(webhookUrl: string, message: string) {
  try {
    // Supports CallMeBot or any POST-based WhatsApp webhook
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) {
      console.error("[WhatsApp] Failed:", res.status, await res.text());
    }
  } catch (e) {
    console.error("[WhatsApp] Error:", e);
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function notifyUser(payload: NotifyPayload): Promise<void> {
  const db = await getDb();
  const prefs = await getPrefs(payload.userId, db);

  // Determine if this event type should trigger notification
  const shouldNotify = (() => {
    if (!prefs) return true; // Default: notify everything
    if (payload.type === "task_completed" && !prefs.notifyOnTaskCompleted) return false;
    if (payload.type === "task_failed" && !prefs.notifyOnTaskFailed) return false;
    if (payload.type === "task_started" && !prefs.notifyOnTaskStarted) return false;
    return true;
  })();

  if (!shouldNotify) return;

  const message = `${payload.title}${payload.body ? `\n${payload.body}` : ""}`;

  // 1. In-App (always save if inAppEnabled or no prefs)
  if (!prefs || prefs.inAppEnabled) {
    await saveInApp(payload, db);
  }

  // 2. LINE Notify
  if (prefs?.lineEnabled && prefs.lineToken) {
    await sendLine(prefs.lineToken, `\n【AI Marketer】${message}`);
  }

  // 3. Telegram
  if (prefs?.telegramEnabled && prefs.telegramBotToken && prefs.telegramChatId) {
    await sendTelegram(
      prefs.telegramBotToken,
      prefs.telegramChatId,
      `*【AI Marketer】*\n${message}`
    );
  }

  // 4. WhatsApp
  if (prefs?.whatsappEnabled && prefs.whatsappWebhookUrl) {
    await sendWhatsApp(prefs.whatsappWebhookUrl, `【AI Marketer】${message}`);
  }

  // 5. Email (via Manus built-in notifyOwner for owner; for general users, log for now)
  if (prefs?.emailEnabled) {
    // Use Manus built-in notification as email fallback for owner
    // For non-owner users, this would require a dedicated email service (SendGrid, etc.)
    try {
      await notifyOwner({ title: payload.title, content: payload.body ?? "" });
    } catch (e) {
      console.error("[Email] notifyOwner failed:", e);
    }
  }
}
