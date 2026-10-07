/**
 * approvalLink — 客戶核准連結的規則（純函式，有測試）。
 *
 * 2026-10-07（CJ「排完一篇或選定某個範圍的文章後，讓他人點連結提供修改意見或直接修改，
 * 每篇修改都有紀錄」；痛點＝來回過稿的時間和流程）。
 *
 * 三條定案：
 *   · 客戶直接修改＝立即生效，留修改前後、可還原。不走「建議→作者接受」，那會多一次來回。
 *   · 所有付費方案都有（planGate.assertApprovalLinkAllowed），試用沒有。
 *   · 客戶核准不動發布關卡（publishGate）。連結是團隊成員自己建的，如果客戶核准等於放行，
 *     任何成員都能建一條連結自己按核准，繞過團隊內部審核。兩件事分開記。
 */
import { randomBytes } from "node:crypto";

export type ApprovalDecision = "pending" | "approved" | "changes_requested";
export type ApprovalAuthorType = "client" | "team";
export type ApprovalEventKind = "comment" | "edit" | "restore" | "approved" | "changes_requested" | "reopened";
export type ApprovalLinkState = "active" | "expired" | "revoked";

export const APPROVAL_LIMITS = {
  itemsPerLink: 60,
  name: 40,
  comment: 2000,
  caption: 8000,
  title: 120,
  note: 600,
  /** 一條連結最多留幾筆紀錄——免登入的入口要有天花板。 */
  eventsPerLink: 3000,
  expiryDays: [7, 14, 30] as const,
} as const;

/** 連結上的 token：192 bits，網址安全。猜不到是這條連結唯一的鎖。 */
export function newApprovalToken(): string {
  return randomBytes(24).toString("base64url");
}

export const APPROVAL_TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

export function approvalLinkState(
  link: { expiresAt: Date | string | null; revokedAt: Date | string | null },
  now: Date = new Date(),
): ApprovalLinkState {
  if (link.revokedAt) return "revoked";
  const exp = link.expiresAt instanceof Date ? link.expiresAt.getTime() : Date.parse(String(link.expiresAt ?? ""));
  if (Number.isFinite(exp) && exp <= now.getTime()) return "expired";
  return "active";
}

export interface ApprovalProgress { total: number; approved: number; changes: number; pending: number }

export function approvalProgress(items: ReadonlyArray<{ decision?: string | null }>): ApprovalProgress {
  let approved = 0, changes = 0;
  for (const it of items) {
    if (it.decision === "approved") approved++;
    else if (it.decision === "changes_requested") changes++;
  }
  return { total: items.length, approved, changes, pending: items.length - approved - changes };
}

/**
 * 文字被改了以後，這一篇的核准狀態要不要動。
 *
 *   客戶自己改 → 不動。他改完再按核准是最常見的順序；他核准後又順手改一個字，也還是他認可的版本。
 *   團隊改     → 一律回到待確認。客戶核准的是舊文字；「要修改」的也該回到客戶手上再看一次。
 */
export function decisionAfterEdit(current: ApprovalDecision, by: ApprovalAuthorType): ApprovalDecision {
  return by === "team" ? "pending" : current;
}

export function asDecision(v: unknown): ApprovalDecision {
  return v === "approved" || v === "changes_requested" ? v : "pending";
}

/** 決定對應的紀錄種類。回到待確認＝「重新開啟」。 */
export function eventKindForDecision(d: ApprovalDecision): ApprovalEventKind {
  return d === "pending" ? "reopened" : d;
}

/** 顯示名稱：去掉控制字元與頭尾空白、壓成單行。空的回 null（呼叫端要擋）。 */
export function cleanAuthorName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, APPROVAL_LIMITS.name);
  return s || null;
}

/** 比對「你開始改的那一版」與現在的文字：只忽略換行寫法與結尾空白，其餘差一個字都算不同。 */
export function sameCaption(a: string, b: string): boolean {
  const n = (s: string) => s.replace(/\r\n?/g, "\n").replace(/\s+$/g, "");
  return n(a) === n(b);
}

const PLATFORM_ALIAS: Record<string, string> = {
  fb: "facebook", ig: "instagram", li: "linkedin", yt: "youtube", tt: "tiktok", newsletter: "email", edm: "email",
};
const KNOWN_PLATFORMS = new Set([
  "facebook", "instagram", "threads", "line", "tiktok", "email", "website", "linkedin", "youtube", "x", "pr",
]);

/** scheduled_posts.platform／missions.workspace 各有各的寫法，收成一種。認不得回 other。 */
export function normalizeApprovalPlatform(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase();
  const p = PLATFORM_ALIAS[s] ?? s;
  return KNOWN_PLATFORMS.has(p) ? p : "other";
}

/**
 * 免登入寫入的節流：同一條連結在一段時間內最多幾次。
 * 行程內記憶體就夠——這只是防呆與防灌水，真正的上限是 eventsPerLink。
 */
export function createWriteLimiter(max = 40, windowMs = 5 * 60_000) {
  const hits = new Map<string, number[]>();
  return {
    allow(key: string, now = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) { hits.set(key, recent); return false; }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      }
      return true;
    },
  };
}
