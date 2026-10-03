/**
 * channelRoles — 「通路角色」：同一個品牌在不同平台上，要扮演的角色、對誰說、主打哪句話。
 *
 * 2026-10-03（CJ「用戶在不同平台，想溝通的訊息不一樣，不同平台的定位不同，應該在哪裡設定？」）：
 * 以前所有平台的生文都吃同一份品牌大腦，平台差異只靠任務卡的 prompt 與格式撐著。
 * 這裡讓策略層可以替每個平台各存一張小卡，產文時**只注入這次任務所在平台的那一張**
 * （brandContext.buildBrandBrain 的 channel 參數），不吃大腦容量、也不會把 IG 的話講到 LINE 去。
 *
 * 存放：brands.positioning.channelRoles[channelId]。比照 _customSegments 的讀寫方式——
 * 淺層 read-modify-write，不整包覆蓋（定位 pipeline 可能同時在寫別的 segment）。
 *
 * 五個欄位刻意不多：欄位一多，用戶就會填成另一份定位書。每一格都是「這個平台跟別的平台
 * 不一樣的那一件事」，品牌共通的東西（標語、價值觀、禁用詞）仍然只放在品牌定位。
 */
import { patchPositioning, loadPositioning } from "./positioningDocs";

export const ROLE_CHANNELS = ["facebook", "instagram", "threads", "line", "tiktok", "email", "website"] as const;
export type RoleChannel = (typeof ROLE_CHANNELS)[number];

export const CHANNEL_LABEL_ZH: Record<RoleChannel, string> = {
  facebook: "Facebook", instagram: "Instagram", threads: "Threads", line: "LINE",
  tiktok: "TikTok", email: "電子報", website: "官網",
};

export interface ChannelRoleFieldSpec {
  key: "role" | "audience" | "coreMessage" | "tone" | "avoid";
  label: string;
  /** 單格字數上限。前端有同一份鏡像（client/src/v2/strategy/lib/channelRoles.ts），改這裡記得一起改。 */
  max: number;
}

export const CHANNEL_ROLE_FIELDS: ChannelRoleFieldSpec[] = [
  { key: "role",        label: "這個平台在品牌裡的角色", max: 200 },
  { key: "audience",    label: "主要對誰說",             max: 200 },
  { key: "coreMessage", label: "要傳達的核心訊息",       max: 300 },
  { key: "tone",        label: "語氣差異",               max: 200 },
  { key: "avoid",       label: "不在這裡說的事",         max: 300 },
];

export interface ChannelRole {
  role: string; audience: string; coreMessage: string; tone: string; avoid: string;
  updatedAt?: string;
}

/** 各種寫法 → 七通路之一；對不上（press / youtube / linkedin…）回 null，產文就照舊不注入。 */
export function normalizeRoleChannel(raw: unknown): RoleChannel | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if ((ROLE_CHANNELS as readonly string[]).includes(s)) return s as RoleChannel;
  if (s === "fb") return "facebook";
  if (s === "ig") return "instagram";
  if (s === "th") return "threads";
  if (s === "ln") return "line";
  if (s === "tt") return "tiktok";
  if (s === "em" || s === "edm" || s === "newsletter" || s === "電子報") return "email";
  if (s === "web" || s === "blog" || s === "官網") return "website";
  return null;
}

/**
 * 任務卡 id 前綴 → 七通路。與 taskCatalogIndex.platformOfTaskId 同一套前綴規則，但這裡
 * 對不上就回 null（那邊預設 facebook）——沒有通路角色可讀的任務卡不該被當成 FB 注入 FB 的話。
 * 刻意不 import taskCatalogIndex：它會把整個任務目錄拉進來，orchestra 反而循環相依。
 */
export function roleChannelOfTaskId(id: unknown): RoleChannel | null {
  const s = String(id ?? "");
  const prefix = s.slice(0, s.indexOf("-") + 1);
  switch (prefix) {
    case "fb-": return "facebook";
    case "ig-": return "instagram";
    case "th-": return "threads";
    case "ln-": return "line";
    case "tt-": return "tiktok";
    case "em-": return "email";
    case "web-": return "website";
    default: return null;
  }
}

export function isRoleChannel(s: unknown): s is RoleChannel {
  return typeof s === "string" && (ROLE_CHANNELS as readonly string[]).includes(s);
}

/** 收斂成固定五格、各自截到上限。LLM 回傳與 client 送來的資料都走這裡。 */
export function cleanChannelRole(input: any): ChannelRole {
  const out: ChannelRole = { role: "", audience: "", coreMessage: "", tone: "", avoid: "" };
  for (const f of CHANNEL_ROLE_FIELDS) {
    const v = typeof input?.[f.key] === "string" ? input[f.key].trim() : "";
    out[f.key] = [...v].slice(0, f.max).join("");
  }
  return out;
}

export function isEmptyChannelRole(r: Partial<ChannelRole> | null | undefined): boolean {
  return !r || CHANNEL_ROLE_FIELDS.every((f) => !String((r as any)[f.key] ?? "").trim());
}

/** positioning.channelRoles 取出已填的通路（空的略過）。 */
export function channelRolesOf(pos: Record<string, any> | null | undefined): Partial<Record<RoleChannel, ChannelRole>> {
  const raw = pos?.channelRoles;
  const out: Partial<Record<RoleChannel, ChannelRole>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const ch of ROLE_CHANNELS) {
    const v = raw[ch];
    if (!v || typeof v !== "object") continue;
    const cleaned = cleanChannelRole(v);
    if (isEmptyChannelRole(cleaned)) continue;
    out[ch] = { ...cleaned, ...(typeof v.updatedAt === "string" ? { updatedAt: v.updatedAt } : {}) };
  }
  return out;
}

/** prompt 裡的一行：只印有填的格。 */
export function channelRoleBody(r: ChannelRole): string {
  return CHANNEL_ROLE_FIELDS
    .map((f) => (r[f.key] ? `${f.label}：${r[f.key]}` : ""))
    .filter(Boolean)
    .join("；");
}

/** 進 prompt 的上限（五格合計）。五格上限加總 1,150，這裡留一點餘裕給標籤。 */
export const CHANNEL_ROLE_PROMPT_MAX = 1_400;

export async function saveChannelRole(args: {
  brandId: number; userId: number; channel: RoleChannel; role: ChannelRole;
}): Promise<ChannelRole> {
  const cleaned = cleanChannelRole(args.role);
  const saved: ChannelRole = { ...cleaned, updatedAt: new Date().toISOString() };
  await patchPositioning("brand", args.brandId, args.userId, (cur) => {
    const roles = (cur.channelRoles && typeof cur.channelRoles === "object") ? { ...cur.channelRoles } : {};
    if (isEmptyChannelRole(cleaned)) delete roles[args.channel];
    else roles[args.channel] = saved;
    return { ...cur, channelRoles: roles };
  });
  return saved;
}

export async function loadChannelRoles(brandId: number, userId: number) {
  return channelRolesOf(await loadPositioning("brand", brandId, userId));
}

/**
 * 「只准引用，不准創作」的確定性檢查，跟 positioningDocsRouter.isVerbatim 同一條規則：
 * 忽略空白與 markdown 符號差異，不忽略內容差異。貼上的 ChatGPT 對話要逐字對映，
 * 模型很愛把「給 25-35 歲的人」順成「給 25 到 35 歲的族群」，純 prompt 擋不住。
 */
export function isVerbatimIn(value: string, sourceText: string): boolean {
  const norm = (t: string) => t.replace(/[\s　]+/g, "").replace(/[*_`~]/g, "").trim();
  const needle = norm(value);
  return needle.length >= 2 && norm(sourceText).includes(needle);
}
