/** 共用於發布／重試的 toast 與排程失敗卡片。 */
export function isNotConnectedError(msg: string): boolean {
  return msg.includes("尚未連接此平台");
}

/** Planner: scheduled_posts rows that the publish worker marked failed. */
export function isFailedScheduled(it: any): boolean {
  return it?.kind === "scheduled" && String(it?.status ?? "") === "failed";
}

/** One short line for the planner popup; lastError is optional (server may not expose it). */
export function failedNote(it: any, en: boolean): string {
  const err = String(it?.lastError ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  const base = en
    ? "This post didn't publish."
    : "這篇沒有發布成功。";
  return err ? `${base} ${err}` : `${base}${en ? " Open it to schedule again." : "打開成品可重新排程。"}`;
}
