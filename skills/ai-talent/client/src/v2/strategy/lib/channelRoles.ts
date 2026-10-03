/**
 * channelRoles（client）— 「通路角色」：每個平台各一張小卡的欄位、平台清單與預覽規則。
 *
 * 伺服器端是 server/strategy/core/channelRoles.ts，欄位 key 與單格字數上限是它的鏡像，
 * 改那邊記得一起改這裡（client 不得 value-import server，所以是手抄一份；
 * server 側的 channelRoles.test.ts 會讀這份檔案比對，兩邊不能悄悄分家）。
 */
import type { IconName } from "../../platform/components/icons";

export type ChannelId = "facebook" | "instagram" | "threads" | "line" | "tiktok" | "email" | "website";

export interface ChannelMeta {
  id: ChannelId;
  icon: IconName;
  zh: string; en: string;
  /** 沒填時卡片上顯示的一句話：這個平台「通常」可以扮演什麼角色（舉例，不是預設值）。 */
  hintZh: string; hintEn: string;
}

/** 順序＝內容層七通路順序。 */
export const CHANNELS: ChannelMeta[] = [
  { id: "facebook",  icon: "facebook",   zh: "Facebook",  en: "Facebook",
    hintZh: "例如：長期關係與社群互動、活動與優惠的主要公告處",
    hintEn: "e.g. long-term community, the main place for events and offers" },
  { id: "instagram", icon: "instagram",  zh: "Instagram", en: "Instagram",
    hintZh: "例如：被看見、建立品牌質感與生活風格的櫥窗",
    hintEn: "e.g. discovery — the showcase for brand taste and lifestyle" },
  { id: "threads",   icon: "threads",    zh: "Threads",   en: "Threads",
    hintZh: "例如：像朋友一樣說話、即時觀點與話題參與",
    hintEn: "e.g. talk like a friend — real-time takes and topic participation" },
  { id: "line",      icon: "line",       zh: "LINE",      en: "LINE",
    hintZh: "例如：老客回購與會員關係，一對一的距離",
    hintEn: "e.g. repeat customers and members — a one-to-one distance" },
  { id: "tiktok",    icon: "tiktok",     zh: "TikTok",    en: "TikTok",
    hintZh: "例如：用前三秒抓到陌生人，講一件事就好",
    hintEn: "e.g. win strangers in three seconds — one idea per video" },
  { id: "email",     icon: "newsletter", zh: "電子報",    en: "Newsletter",
    hintZh: "例如：給願意讀完的人更深的內容與專屬資訊",
    hintEn: "e.g. deeper content and exclusive info for people who read through" },
  { id: "website",   icon: "website",    zh: "官網",      en: "Website",
    hintZh: "例如：品牌的正式說法與可被搜尋、被引用的長期內容",
    hintEn: "e.g. the brand's official account — searchable, citable, long-lived" },
];

export type ChannelRoleKey = "role" | "audience" | "coreMessage" | "tone" | "avoid";

export interface ChannelRoleFieldSpec {
  key: ChannelRoleKey;
  zh: string; en: string;
  hintZh: string; hintEn: string;
  /** server CHANNEL_ROLE_FIELDS.max 的鏡像。 */
  max: number;
  rows: number;
}

export const CHANNEL_ROLE_FIELDS: ChannelRoleFieldSpec[] = [
  { key: "role", max: 200, rows: 2,
    zh: "這個平台在品牌裡的角色", en: "Role in the brand",
    hintZh: "它負責品牌的哪一件事？例如：被看見／維繫老客／公告／教育",
    hintEn: "What does it do for the brand? e.g. discovery / retention / announcements / education" },
  { key: "audience", max: 200, rows: 2,
    zh: "主要對誰說", en: "Who we talk to here",
    hintZh: "這個平台上的人，跟品牌其他平台的受眾有什麼不同？",
    hintEn: "How is the audience here different from the brand's other platforms?" },
  { key: "coreMessage", max: 300, rows: 3,
    zh: "要傳達的核心訊息", en: "Core message",
    hintZh: "在這個平台上，品牌最想讓人記住的一兩句話",
    hintEn: "The one or two lines the brand most wants remembered on this platform" },
  { key: "tone", max: 200, rows: 2,
    zh: "語氣差異", en: "Tone difference",
    hintZh: "跟品牌共通語氣比，這裡要更輕／更正式／更直接…",
    hintEn: "Compared with the brand's shared voice — lighter, more formal, more direct…" },
  { key: "avoid", max: 300, rows: 3,
    zh: "不在這裡說的事", en: "Not said here",
    hintZh: "哪些話題或說法留給其他平台，不要在這裡出現",
    hintEn: "Topics or phrasings that belong on other platforms" },
];

export type ChannelRoleValue = Record<ChannelRoleKey, string> & { updatedAt?: string };

export const EMPTY_ROLE: ChannelRoleValue = { role: "", audience: "", coreMessage: "", tone: "", avoid: "" };

export function normalizeRole(raw: any): ChannelRoleValue {
  const out: ChannelRoleValue = { ...EMPTY_ROLE };
  for (const f of CHANNEL_ROLE_FIELDS) out[f.key] = typeof raw?.[f.key] === "string" ? raw[f.key] : "";
  if (typeof raw?.updatedAt === "string") out.updatedAt = raw.updatedAt;
  return out;
}

export function roleFilledCount(r: Partial<ChannelRoleValue> | null | undefined): number {
  return CHANNEL_ROLE_FIELDS.filter((f) => String(r?.[f.key] ?? "").trim()).length;
}

export function roleIsEmpty(r: Partial<ChannelRoleValue> | null | undefined): boolean {
  return roleFilledCount(r) === 0;
}

/** 卡片頭部的代表句：最能代表這個平台「說什麼」的那格，沒有就退到角色。 */
export function roleHeadline(r: Partial<ChannelRoleValue> | null | undefined): string | null {
  const t = String(r?.coreMessage ?? "").trim() || String(r?.role ?? "").trim();
  return t || null;
}

/** 把 AI／貼上的提案併進目前表單：只覆蓋提案裡有值的格，其他保留。 */
export function mergeProposal(cur: ChannelRoleValue, proposal: Partial<ChannelRoleValue>): ChannelRoleValue {
  const next = { ...cur };
  for (const f of CHANNEL_ROLE_FIELDS) {
    const v = String(proposal[f.key] ?? "").trim();
    if (v) next[f.key] = [...v].slice(0, f.max).join("");
  }
  return next;
}

/** 提案會覆蓋掉用戶已經寫的哪幾格（要讓用戶知道自己在蓋掉什麼）。 */
export function overwrittenKeys(cur: ChannelRoleValue, proposal: Partial<ChannelRoleValue>): ChannelRoleKey[] {
  return CHANNEL_ROLE_FIELDS
    .filter((f) => String(proposal[f.key] ?? "").trim() && cur[f.key].trim() && cur[f.key].trim() !== String(proposal[f.key]).trim())
    .map((f) => f.key);
}
