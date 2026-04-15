/**
 * Utility helpers for the SoWork Enterprise client
 */

/** Format a date to a human-readable string */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Get or generate a userId stored in localStorage */
export function getUserId(): string {
  let userId = localStorage.getItem("userId");
  if (!userId) {
    userId = `user_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem("userId", userId);
  }
  return userId;
}

/** Concatenate class names (simple join, no dependencies) */
export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
