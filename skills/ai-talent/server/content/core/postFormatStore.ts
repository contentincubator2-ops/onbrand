/**
 * postFormatStore — 貼文形式候選的持久層（post_format_candidates）。
 *
 * 2026-08-23 (CJ「候選佇列，你審核後才建卡」)
 *
 * 這一層存在的理由是**跨月去重**。掃描每月跑一次，同一個形式幾乎一定會被
 * 重複掃到；沒有去重，第二個月的佇列就是第一個月的複本，人會停止看它。
 *
 * 去重鍵 = (platform, market, candidateKey)，而且**不看 status**。
 * 這點很關鍵：如果只跟 pending 去重，被你否決掉的形式會每個月原地復活，
 * 佇列永遠收斂不了。被否決過的東西必須維持在被否決的狀態，只更新
 * seenCount / lastSeenAt / evidence —— 讓你看得出「這個我拒過，但它又出現
 * 了 3 次」，那是重新考慮的訊號，而不是一筆新候選。
 *
 * 建表走 server/index.ts 的 CREATE TABLE IF NOT EXISTS 啟動流程（本檔的
 * POST_FORMAT_CANDIDATES_DDL 就是那份 DDL 的來源）。
 */

import type { FormatCandidate } from "./postFormatScout";
import { candidateKey } from "./postFormatScout";

export const POST_FORMAT_CANDIDATES_DDL = `
  CREATE TABLE IF NOT EXISTS post_format_candidates (
    id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    platform      VARCHAR(32)  NOT NULL DEFAULT 'facebook',
    market        VARCHAR(8)   NOT NULL,
    language      VARCHAR(16)  NULL,
    kind          VARCHAR(16)  NOT NULL DEFAULT 'format',
    candidateKey  VARCHAR(191) NOT NULL,
    name          VARCHAR(255) NOT NULL,
    nameEn        VARCHAR(255) NULL,
    mechanism     TEXT         NULL,
    whyItWorks    TEXT         NULL,
    evidence      LONGTEXT     NULL,
    duplicateOf   VARCHAR(64)  NULL,
    status        VARCHAR(16)  NOT NULL DEFAULT 'pending',
    seenCount     INT          NOT NULL DEFAULT 1,
    firstSeenAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    lastSeenAt    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    reviewedBy    INT          NULL,
    reviewedAt    DATETIME(3)  NULL,
    reviewNote    TEXT         NULL,
    shippedTaskId VARCHAR(64)  NULL,
    UNIQUE KEY uniq_post_format_candidate (platform, market, candidateKey),
    KEY idx_post_format_status (status, kind, lastSeenAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export type CandidateStatus = "pending" | "approved" | "rejected" | "shipped";

export interface UpsertOutcome {
  inserted: number;
  merged: number;
}

/**
 * 合併兩份佐證，用 URL 去重、保留較早的那一次，最多留 8 條。
 * 匯出是為了單獨測 —— 合併邏輯出錯會讓證據無聲消失。
 */
export function mergeEvidence(
  existing: FormatCandidate["evidence"],
  incoming: FormatCandidate["evidence"],
  cap = 8,
): FormatCandidate["evidence"] {
  const seen = new Set<string>();
  const out: FormatCandidate["evidence"] = [];
  for (const e of [...existing, ...incoming]) {
    if (!e?.url || seen.has(e.url)) continue;
    seen.add(e.url);
    out.push(e);
    if (out.length >= cap) break;
  }
  return out;
}

function parseEvidence(raw: unknown): FormatCandidate["evidence"] {
  if (!raw) return [];
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * 寫入一批候選。已存在的只更新 seenCount / lastSeenAt / evidence，
 * **不碰 status、reviewNote、shippedTaskId** —— 人的判斷不該被排程覆寫。
 */
export async function upsertCandidates(cands: FormatCandidate[]): Promise<UpsertOutcome> {
  const { default: localPool } = await import("../../localDb");
  let inserted = 0;
  let merged = 0;

  for (const c of cands) {
    const key = candidateKey(c.name, c.nameEn);
    const [rows]: any = await localPool.execute(
      `SELECT id, evidence FROM post_format_candidates
        WHERE platform = ? AND market = ? AND candidateKey = ? LIMIT 1`,
      [c.platform, c.market, key],
    );
    const existing = (rows as any[])[0];

    if (existing) {
      const next = mergeEvidence(parseEvidence(existing.evidence), c.evidence);
      await localPool.execute(
        `UPDATE post_format_candidates
            SET seenCount = seenCount + 1,
                lastSeenAt = CURRENT_TIMESTAMP(3),
                evidence = ?
          WHERE id = ?`,
        [JSON.stringify(next), existing.id],
      );
      merged++;
      continue;
    }

    await localPool.execute(
      `INSERT INTO post_format_candidates
         (platform, market, language, kind, candidateKey, name, nameEn,
          mechanism, whyItWorks, evidence, duplicateOf, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.platform, c.market, c.language, c.kind, key, c.name, c.nameEn,
        c.mechanism, c.whyItWorks, JSON.stringify(c.evidence), c.duplicateOf,
        // 對得到現有卡的直接落在 rejected（第二道閘：無現卡覆蓋），但仍然入庫
        // 並保留 duplicateOf，讓你看得到「這個掃到了，但我們已經有」。
        c.duplicateOf ? "rejected" : "pending",
      ],
    );
    inserted++;
  }

  return { inserted, merged };
}
