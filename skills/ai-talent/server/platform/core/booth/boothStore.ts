/**
 * boothStore — 展場訪客的身分與他自己的試用帳號。
 *
 * 2026-09-19 (CJ「用戶可以被 hermes agent on line or whatsapp 引導，提供自己的
 * 公司名和網址後，我們可以逐步盤查他有的產品，建立它的產品資料」)。
 *
 * ── 為什麼每位訪客都要有自己的 user ──────────────────────────────────
 * brands / products 都掛在 userId 底下，所有既有的查詢也都帶 userId。與其在
 * 每個呼叫點特別處理「展場的共用帳號」，不如讓每位訪客就是一個 user——資料
 * 天然隔離，訪客之間看不到彼此，而且「只能試用」(CJ 2026-09-19) 直接沿用既有
 * 的 trial 方案：7 天、1000 點、不續點。點數本身就是每人成本的上限。
 *
 * 他們沒有 passwordHash，所以登不進網頁後台——這正是「只能試用」的意思：
 * 對話走得完，但要留著就得走正式註冊。
 *
 * openId 是 users 表唯一的必填識別碼，所以拿它當通道身分：`booth:<channel>:<id>`。
 */
import localPool from "../../../localDb";

const TAIL = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

const BOOTH_DDL = [
  `CREATE TABLE IF NOT EXISTS booth_visitors (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    channel         VARCHAR(10)  NOT NULL COMMENT 'line | whatsapp | web',
    channel_user_id VARCHAR(120) NOT NULL,
    event_slug      VARCHAR(40)  NOT NULL DEFAULT 'dallas',
    display_name    VARCHAR(120) NULL,
    company         VARCHAR(200) NULL,
    website         VARCHAR(500) NULL,
    user_id         INT          NULL COMMENT 'the trial account we made for them',
    brand_id        INT          NULL,
    style_token     CHAR(24)     NULL COMMENT 'opens /booth/style for this visitor',
    consent_at      DATETIME(3)  NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uniq_channel_user (channel, channel_user_id),
    UNIQUE KEY uniq_style_token (style_token),
    INDEX idx_event (event_slug, created_at)
  ) ${TAIL}`,
];

export async function ensureBoothTables(): Promise<void> {
  for (const ddl of BOOTH_DDL) await localPool.execute(ddl);
}

export interface BoothVisitor {
  id: number;
  channel: string;
  channelUserId: string;
  eventSlug: string;
  displayName: string | null;
  company: string | null;
  website: string | null;
  userId: number | null;
  brandId: number | null;
  styleToken: string | null;
  consentAt: Date | null;
}

function row(r: any): BoothVisitor {
  return {
    id: r.id,
    channel: r.channel,
    channelUserId: r.channel_user_id,
    eventSlug: r.event_slug,
    displayName: r.display_name ?? null,
    company: r.company ?? null,
    website: r.website ?? null,
    userId: r.user_id ?? null,
    brandId: r.brand_id ?? null,
    styleToken: r.style_token ?? null,
    consentAt: r.consent_at ?? null,
  };
}

export async function getVisitor(channel: string, channelUserId: string): Promise<BoothVisitor | null> {
  const [rows]: any = await localPool.execute(
    `SELECT * FROM booth_visitors WHERE channel = ? AND channel_user_id = ? LIMIT 1`,
    [channel, channelUserId],
  );
  const r = (rows as any[])[0];
  return r ? row(r) : null;
}

export async function getVisitorById(id: number): Promise<BoothVisitor | null> {
  const [rows]: any = await localPool.execute(`SELECT * FROM booth_visitors WHERE id = ? LIMIT 1`, [id]);
  const r = (rows as any[])[0];
  return r ? row(r) : null;
}

export async function getVisitorByStyleToken(token: string): Promise<BoothVisitor | null> {
  if (!/^[a-z0-9]{24}$/i.test(token)) return null;
  const [rows]: any = await localPool.execute(`SELECT * FROM booth_visitors WHERE style_token = ? LIMIT 1`, [token]);
  const r = (rows as any[])[0];
  return r ? row(r) : null;
}

/** 同一個人重掃一次 QR 不該變成第二位訪客，所以認 (channel, channel_user_id)。 */
export async function upsertVisitor(args: {
  channel: string;
  channelUserId: string;
  eventSlug?: string;
  displayName?: string | null;
}): Promise<BoothVisitor> {
  const existing = await getVisitor(args.channel, args.channelUserId);
  if (existing) {
    if (args.displayName && args.displayName !== existing.displayName) {
      await localPool.execute(`UPDATE booth_visitors SET display_name = ? WHERE id = ?`, [args.displayName, existing.id]);
      return { ...existing, displayName: args.displayName };
    }
    return existing;
  }
  const [ins]: any = await localPool.execute(
    `INSERT INTO booth_visitors (channel, channel_user_id, event_slug, display_name, consent_at)
     VALUES (?, ?, ?, ?, NOW(3))`,
    [args.channel, args.channelUserId, args.eventSlug ?? "dallas", args.displayName ?? null],
  );
  const created = await getVisitorById(ins.insertId);
  if (!created) throw new Error("booth visitor insert did not stick");
  return created;
}

export async function updateVisitor(id: number, patch: Partial<{
  company: string;
  website: string;
  userId: number;
  brandId: number;
  styleToken: string;
}>): Promise<void> {
  const cols: Record<string, string> = {
    company: "company",
    website: "website",
    userId: "user_id",
    brandId: "brand_id",
    styleToken: "style_token",
  };
  const sets: string[] = [];
  const params: Array<string | number> = [];
  for (const [key, col] of Object.entries(cols)) {
    const v = (patch as Record<string, unknown>)[key];
    if (v !== undefined) { sets.push(`${col} = ?`); params.push(v as string | number); }
  }
  if (!sets.length) return;
  params.push(id);
  await localPool.execute(`UPDATE booth_visitors SET ${sets.join(", ")} WHERE id = ?`, params);
}

/**
 * 訪客自己的試用帳號。沒有 email、沒有密碼——他登不進網頁後台，全程走對話。
 * 「只能試用」(CJ) 就落在 plan = trial：7 天、1000 點、不續點。
 */
export async function ensureTrialUser(visitor: BoothVisitor): Promise<number> {
  if (visitor.userId) return visitor.userId;

  const openId = `booth:${visitor.channel}:${visitor.channelUserId}`.slice(0, 64);
  const [existing]: any = await localPool.execute(`SELECT id FROM users WHERE openId = ? LIMIT 1`, [openId]);
  const found = (existing as any[])[0];
  if (found) {
    await updateVisitor(visitor.id, { userId: found.id });
    return found.id;
  }

  // planCode 不用寫：migrate 給了 `VARCHAR(32) NOT NULL DEFAULT 'trial'`，
  // 新 user 天生就是試用。credits 跟一般註冊一樣給 1000，點數由
  // pointsService 在第一次讀取時依方案補上。
  const [ins]: any = await localPool.execute(
    `INSERT INTO users (openId, name, isActive, authMethod, credits, role) VALUES (?, ?, 1, 'password', 1000, 'user')`,
    [openId, visitor.displayName ?? visitor.company ?? "Booth visitor"],
  );
  const userId = ins.insertId;
  await updateVisitor(visitor.id, { userId });
  return userId;
}

export function newStyleToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 24; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
