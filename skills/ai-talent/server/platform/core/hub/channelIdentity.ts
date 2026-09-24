/**
 * channelIdentity — 業務在各通路上的身分對照表。
 *
 * 2026-09-24，依 WhatsApp 工程師的三點建議建立：
 *
 *   1. 不需要 parent BSUID（只有一個商業組合「SoWork 摘星」），所以長度現在
 *      就能定下來，不必等 Meta。
 *   2. 直接用 VARCHAR(255)，不要卡在剛好 131／135 —— 多留的空間幾乎沒成本，
 *      也不用再改第二次。
 *   3. **不要把 BSUID 直接加在 hub_reps 上**，用獨立的對照表。
 *
 * 第三點是這支存在的理由，值得展開：
 *
 * ── 為什麼不是 hub_reps 上的一個欄位 ─────────────────────────────────
 * **BSUID 會變。** 使用者換手機號碼，Meta 就重新產生一個，並發 webhook 通知。
 * 如果它是 hub_reps 上的一欄，更新就是覆寫——舊值消失，而「這個人以前是哪個
 * id」正好是出事時唯一能查的線索。
 *
 * 對照表可以把舊的那一列標記為退役而不是刪掉，歷史就留著了。而且 LINE、
 * WhatsApp、之後任何通路共用同一個結構，不必每加一個通路就往 hub_reps 上
 * 再長一欄。
 *
 * ── LINE 目前還是以 hub_reps.line_user_id 為準 ───────────────────────
 * LINE 的綁定正在跑（展場上就靠它），所以**不在這一次搬過來**。改成雙寫：
 * bindLineUser 同時寫這張表，加上一次性回填。等 WhatsApp 這邊跑順、這個結構
 * 被真實流量驗過，再把 LINE 的讀取切過來。
 *
 * 拿正在用的東西去換一個更漂亮的結構，是這個 repo 今天已經避開兩次的錯。
 */

export type IdentityChannel = "line" | "whatsapp";

export interface ChannelIdentity {
  id: number;
  repId: number;
  channel: IdentityChannel;
  /** 通路自己的使用者識別碼。WhatsApp 是 BSUID，LINE 是 userId。 */
  externalId: string;
  /** 電話號碼。WhatsApp 使用者啟用 username 之後可能就沒有了。 */
  waId: string | null;
  username: string | null;
  /** 退役時間。不是 null 代表這個 id 已經被換掉，留著只是為了查得到歷史。 */
  retiredAt: string | null;
  updatedAt: string;
}

async function db() {
  const { default: localPool } = await import("../../../localDb");
  return localPool;
}

const row = (r: any): ChannelIdentity => ({
  id: r.id,
  repId: r.rep_id,
  channel: r.channel,
  externalId: r.external_id,
  waId: r.wa_id ?? null,
  username: r.username ?? null,
  retiredAt: r.retired_at ? new Date(r.retired_at).toISOString() : null,
  updatedAt: new Date(r.updated_at).toISOString(),
});

/** 這個通路 id 屬於誰。只看還在用的，不看退役的。 */
export async function findRepByExternalId(
  orgId: number,
  channel: IdentityChannel,
  externalId: string,
): Promise<ChannelIdentity | null> {
  const [rows]: any = await (await db()).execute(
    `SELECT * FROM hub_channel_identities
      WHERE org_id = ? AND channel = ? AND external_id = ? AND retired_at IS NULL LIMIT 1`,
    [orgId, channel, externalId],
  );
  const r = (rows as any[])[0];
  return r ? row(r) : null;
}

export async function listIdentities(orgId: number, repId?: number): Promise<ChannelIdentity[]> {
  const [rows]: any = repId
    ? await (await db()).execute(
        `SELECT * FROM hub_channel_identities WHERE org_id = ? AND rep_id = ? ORDER BY id DESC`,
        [orgId, repId],
      )
    : await (await db()).execute(
        `SELECT * FROM hub_channel_identities WHERE org_id = ? ORDER BY id DESC LIMIT 200`,
        [orgId],
      );
  return (rows as any[]).map(row);
}

/**
 * 綁定（或更新）一個通路身分。
 *
 * 一個 external_id 同時只屬於一位業務——同一個人重新綁到別的業務身上時，舊的
 * 那一列會被改寫而不是留下兩筆互相矛盾的對照。
 *
 * `waId` 與 `username` 刻意用「有給才更新」：WhatsApp 的 webhook 有時候帶電話
 * 號碼有時候不帶（30 天回看條件），如果每次都覆寫，一則不帶號碼的訊息就會把
 * 我們先前知道的號碼清掉。**不知道**與**沒有**是兩件事。
 */
export async function linkIdentity(args: {
  orgId: number;
  repId: number;
  channel: IdentityChannel;
  externalId: string;
  waId?: string | null;
  username?: string | null;
}): Promise<void> {
  await (await db()).execute(
    `INSERT INTO hub_channel_identities (org_id, rep_id, channel, external_id, wa_id, username)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       rep_id = VALUES(rep_id),
       wa_id = COALESCE(VALUES(wa_id), wa_id),
       username = COALESCE(VALUES(username), username),
       retired_at = NULL,
       updated_at = CURRENT_TIMESTAMP(3)`,
    [args.orgId, args.repId, args.channel, args.externalId, args.waId ?? null, args.username ?? null],
  );
}

/**
 * id 換了（WhatsApp 使用者換手機號碼 → BSUID 重新產生）。
 *
 * 舊的那一列**退役而不是刪除**。「這個人以前是哪個 id」正好是出事時唯一能查的
 * 線索，而那也正是資料已經被覆寫的時候。
 *
 * 回傳是不是真的接上了：接不上（不認得舊 id）要讓呼叫端知道，因為那代表這個
 * 人對我們而言是個全新的陌生人，需要重新綁定。
 */
export async function rotateExternalId(args: {
  orgId: number;
  channel: IdentityChannel;
  previous: string;
  current: string;
}): Promise<{ linked: boolean; repId: number | null }> {
  const existing = await findRepByExternalId(args.orgId, args.channel, args.previous);
  if (!existing) return { linked: false, repId: null };

  const pool = await db();
  await pool.execute(
    `UPDATE hub_channel_identities SET retired_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [existing.id],
  );
  await linkIdentity({
    orgId: args.orgId,
    repId: existing.repId,
    channel: args.channel,
    externalId: args.current,
    // 換號碼之後舊的電話號碼一定過期了，不要帶過去。
    waId: null,
    username: existing.username,
  });
  return { linked: true, repId: existing.repId };
}

/**
 * 把既有的 LINE 綁定鏡射進來。
 *
 * 可以重複執行。LINE 目前仍以 hub_reps.line_user_id 為準，這裡只是讓結構先
 * 就位、也先有真實資料可以看。
 */
export async function backfillLineIdentities(orgId: number): Promise<number> {
  const [res]: any = await (await db()).execute(
    `INSERT IGNORE INTO hub_channel_identities (org_id, rep_id, channel, external_id)
     SELECT org_id, id, 'line', line_user_id FROM hub_reps
      WHERE org_id = ? AND line_user_id IS NOT NULL AND line_user_id <> ''`,
    [orgId],
  );
  return Number(res?.affectedRows ?? 0);
}
