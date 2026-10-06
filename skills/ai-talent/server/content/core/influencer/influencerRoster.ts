/**
 * influencerRoster — 品牌的「網紅庫」：研究過的網紅存起來，下次換產品或活動直接勾選，不用再貼連結。
 *
 * 2026-10-06（CJ「可以讓用戶上傳過的網紅，不用重複上傳」）。
 *
 *   · 跟著品牌存（不同品牌的名單分開）；同一個品牌同一條連結只有一筆。
 *   · 存的不只是連結：讀到的內容與口吻卡也存。下次研究同一位時不重讀連結、不重整理口吻——
 *     快一半，也不用再付一次數據商的錢。真正每次都要重做的只有「配賣點、想點子」，因為那跟這次的主體有關。
 *   · 內容會過期：超過 FRESH_DAYS 天就當成舊的，下次研究時重讀（用戶也可以手動更新）。
 *   · 這張表是名單，不是研究結果：每次配的賣點、想的點子、寫的信仍然在 influencer_batches。
 */
import { createHash } from "node:crypto";
import localPool from "../../../localDb";
import { classifyLink } from "./influencerLink";
import type { PersonResult } from "./influencerAngles";

export const INFLUENCER_PROFILES_DDL = `
  CREATE TABLE IF NOT EXISTS influencer_profiles (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    brandId     INT           NOT NULL,
    urlKey      CHAR(40)      NOT NULL,
    url         VARCHAR(600)  NOT NULL,
    name        VARCHAR(80)   NULL,
    email       VARCHAR(190)  NULL,
    platform    VARCHAR(20)   NULL,
    handle      VARCHAR(80)   NULL,
    followers   VARCHAR(40)   NULL,
    displayName VARCHAR(80)   NULL,
    profile     VARCHAR(255)  NULL,
    source      VARCHAR(24)   NULL,
    voice       TEXT          NULL,
    material    MEDIUMTEXT    NULL,
    readAt      DATETIME(3)   NULL,
    createdAt   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_brand_url (brandId, urlKey),
    INDEX idx_brand_updated (brandId, updatedAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/** 存下來的內容幾天內算新的。 */
export const FRESH_DAYS = 30;
export const ROSTER_MAX = 300;
const MATERIAL_CAP = 6000;

/** 同一位網紅的不同寫法（大小寫、結尾斜線、追蹤參數、www）要認成同一筆。 */
export function urlKeyOf(rawUrl: string): string {
  const link = classifyLink(rawUrl);
  let norm = (link?.url ?? String(rawUrl ?? "")).trim();
  try {
    const u = new URL(norm);
    // 社群個人頁：帳號就是身分，查詢參數（?igsh=、?lang=）不算。YouTube 影片與一般網頁保留查詢參數。
    const keepQuery = !link || link.platform === "web" || link.platform === "podcast" || (link.platform === "youtube" && !link.handle);
    norm = `${u.hostname.replace(/^(www|m|mobile)\./, "")}${u.pathname.replace(/\/+$/, "")}${keepQuery ? u.search : ""}`;
  } catch { /* 不是合法網址就用原字串 */ }
  return createHash("sha1").update(norm.toLowerCase()).digest("hex");
}

export interface RosterRow {
  id: number;
  url: string;
  name: string | null;
  email: string | null;
  platform: string | null;
  handle: string | null;
  followers: string | null;
  displayName: string | null;
  profile: string | null;
  /** 有存到可以直接用的內容（不用重讀連結）。 */
  hasMaterial: boolean;
  /** 內容超過 FRESH_DAYS 天，下次研究會重讀。 */
  stale: boolean;
  readAt: string | null;
}

export function isFresh(readAt: unknown, now = Date.now()): boolean {
  const t = readAt instanceof Date ? readAt.getTime() : readAt ? new Date(String(readAt)).getTime() : NaN;
  return Number.isFinite(t) && now - t < FRESH_DAYS * 86_400_000;
}

function toRow(r: any): RosterRow {
  const hasMaterial = !!r.hasMaterial;
  return {
    id: Number(r.id), url: String(r.url), name: r.name ?? null, email: r.email ?? null, platform: r.platform ?? null,
    handle: r.handle ?? null, followers: r.followers ?? null, displayName: r.displayName ?? null, profile: r.profile ?? null,
    hasMaterial, stale: hasMaterial && !isFresh(r.readAt), readAt: r.readAt ? new Date(r.readAt).toISOString() : null,
  };
}

/** 這個品牌的網紅庫（最近用過的在前）。不回內容全文與口吻卡——清單用不到。 */
export async function loadRoster(brandId: number): Promise<RosterRow[]> {
  const [rows]: any = await localPool.execute(
    `SELECT id, url, name, email, platform, handle, followers, displayName, profile, readAt,
            (material IS NOT NULL AND CHAR_LENGTH(material) > 0) AS hasMaterial
       FROM influencer_profiles WHERE brandId = ? ORDER BY updatedAt DESC LIMIT ${ROSTER_MAX}`, [brandId]);
  return (rows as any[]).map(toRow);
}

export interface SavedProfile { material: string; voice: string | null; readAt: Date | null; followers: string | null; displayName: string | null; source: string | null }

/** 研究前查：這幾條連結裡哪些已經有存內容。key＝urlKey。 */
export async function loadSaved(brandId: number, urls: string[]): Promise<Map<string, SavedProfile>> {
  const out = new Map<string, SavedProfile>();
  const keys = Array.from(new Set(urls.map(urlKeyOf)));
  if (!keys.length) return out;
  const [rows]: any = await localPool.execute(
    `SELECT urlKey, material, voice, readAt, followers, displayName, source FROM influencer_profiles
      WHERE brandId = ? AND urlKey IN (${keys.map(() => "?").join(",")})`, [brandId, ...keys]);
  for (const r of rows as any[]) {
    if (!r.material) continue;
    out.set(String(r.urlKey), {
      material: String(r.material), voice: r.voice ? String(r.voice) : null, readAt: r.readAt ? new Date(r.readAt) : null,
      followers: r.followers ?? null, displayName: r.displayName ?? null, source: r.source ?? null,
    });
  }
  return out;
}

const cut = (v: unknown, n: number) => { const s = String(v ?? "").trim(); return s ? s.slice(0, n) : null; };

/**
 * 存一位進網紅庫（有就更新）。
 * content 有給＝這次讀到了新內容（或整理了口吻），一起存並把 readAt 設成現在；
 * 沒給＝只更新名字、Email 這些欄位，內容與口吻留著不動（COALESCE：新值是 NULL 就保留舊值）。
 */
export async function upsertProfile(
  brandId: number, p: Pick<PersonResult, "url" | "name" | "email" | "platform" | "handle" | "followers" | "displayName" | "profile" | "source">,
  content?: { material?: string; voice?: string; fresh?: boolean },
): Promise<void> {
  const material = content?.material ? content.material.slice(0, MATERIAL_CAP) : null;
  await localPool.execute(
    `INSERT INTO influencer_profiles (brandId, urlKey, url, name, email, platform, handle, followers, displayName, profile, source, voice, material, readAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${material && content?.fresh ? "CURRENT_TIMESTAMP(3)" : "NULL"})
     ON DUPLICATE KEY UPDATE
       url = VALUES(url),
       name = COALESCE(VALUES(name), name), email = COALESCE(VALUES(email), email),
       platform = COALESCE(VALUES(platform), platform), handle = COALESCE(VALUES(handle), handle),
       followers = COALESCE(VALUES(followers), followers), displayName = COALESCE(VALUES(displayName), displayName),
       profile = COALESCE(VALUES(profile), profile), source = COALESCE(VALUES(source), source),
       voice = COALESCE(VALUES(voice), voice), material = COALESCE(VALUES(material), material),
       readAt = COALESCE(VALUES(readAt), readAt), updatedAt = CURRENT_TIMESTAMP(3)`,
    [brandId, urlKeyOf(p.url), p.url.slice(0, 600), cut(p.name, 80), cut(p.email, 190), cut(p.platform, 20), cut(p.handle, 80),
      cut(p.followers, 40), cut(p.displayName, 80), cut(p.profile, 255), p.source && p.source !== "none" ? cut(p.source, 24) : null,
      cut(content?.voice, 2000), material],
  );
}

export async function removeProfile(brandId: number, id: number): Promise<void> {
  await localPool.execute(`DELETE FROM influencer_profiles WHERE id = ? AND brandId = ?`, [id, brandId]);
}

/**
 * 網紅庫還是空的品牌：把以前批次裡的人帶進來（2026-10-06 之前研究過的人只存在批次裡）。
 * 有口吻卡與素材摘錄的就一起帶，但不設 readAt——那些內容是什麼時候讀的已經不可考，下次研究時重讀。
 */
export async function backfillFromBatches(brandId: number): Promise<number> {
  const [rows]: any = await localPool.execute(
    `SELECT people FROM influencer_batches WHERE brandId = ? ORDER BY updatedAt DESC LIMIT 10`, [brandId]);
  const seen = new Set<string>();
  let n = 0;
  for (const r of rows as any[]) {
    let people: PersonResult[] = [];
    try { const v = typeof r.people === "string" ? JSON.parse(r.people) : r.people; if (Array.isArray(v)) people = v; } catch { /* skip */ }
    for (const p of people) {
      if (!p?.url || !classifyLink(p.url)) continue;
      const key = urlKeyOf(p.url);
      if (seen.has(key)) continue;
      seen.add(key);
      await upsertProfile(brandId, p, { material: p.materialDigest, voice: p.voice }).catch(() => {});
      n++;
    }
  }
  return n;
}
