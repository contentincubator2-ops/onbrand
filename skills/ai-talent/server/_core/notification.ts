/**
 * Owner notification — sends alerts to the workspace owner.
 * Currently a stub; Sprint 4 will integrate with actual notification channels.
 */

export interface OwnerNotification {
  title: string;
  content: string;
}

/**
 * Notify the workspace owner (stub implementation).
 * In production, this routes to Slack/LINE/email based on owner preferences.
 */
export async function notifyOwner(notification: OwnerNotification): Promise<void> {
  // TODO Sprint 4: Route to actual notification channel (Slack/LINE/email)
  console.log(`[notifyOwner] ${notification.title}: ${notification.content.slice(0, 100)}`);
}
