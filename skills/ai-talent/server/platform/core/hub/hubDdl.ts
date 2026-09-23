/**
 * Sales Hub (ExpertHub demo) — tables.
 *
 * 2026-09-16 (CJ「equip marketing team for sales reps — growth + compliance」,
 * Dallas show demo): one org (ASUS ExpertHub, concept demo) whose HQ / marketing
 * use the web admin and whose sales reps use a LINE bot. Every table is prefixed
 * `hub_` and owned by this module; nothing else in OnBrand reads them.
 *
 * `is_demo = 1` marks synthetic rows (illustrative reps, back-filled history).
 * Rows produced by real interactions at the booth (a scanned QR, a generated
 * post) are `is_demo = 0`, and the dashboard shows them as LIVE.
 */

const TAIL = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

export const HUB_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS hub_org (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slug            VARCHAR(64)  NOT NULL UNIQUE,
    name            VARCHAR(160) NOT NULL,
    disclaimer      VARCHAR(400) NOT NULL,
    positioning     JSON         NULL,
    landing_url     VARCHAR(500) NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_reps (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    market          VARCHAR(2)   NOT NULL,
    name            VARCHAR(120) NOT NULL,
    title           VARCHAR(160) NOT NULL,
    team            VARCHAR(120) NOT NULL,
    avatar_seed     VARCHAR(64)  NOT NULL,
    line_user_id    VARCHAR(64)  NULL UNIQUE,
    bind_code       VARCHAR(12)  NULL UNIQUE,
    mcp_token_hash  CHAR(64)     NULL,
    consent_at      DATETIME(3)  NULL,
    linkedin_status VARCHAR(20)  NOT NULL DEFAULT 'none',
    instagram_status VARCHAR(20) NOT NULL DEFAULT 'none',
    facebook_status VARCHAR(20)  NOT NULL DEFAULT 'none',
    network_size    INT          NOT NULL DEFAULT 0,
    is_demo         TINYINT      NOT NULL DEFAULT 1,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_org (org_id)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_solutions (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    slug            VARCHAR(80)  NOT NULL,
    name_en         VARCHAR(160) NOT NULL,
    name_zh         VARCHAR(160) NOT NULL,
    vendor          VARCHAR(160) NOT NULL,
    category        VARCHAR(80)  NOT NULL,
    industries      JSON         NULL,
    summary_en      TEXT         NOT NULL,
    summary_zh      TEXT         NOT NULL,
    features        JSON         NULL,
    audience_en     VARCHAR(300) NULL,
    audience_zh     VARCHAR(300) NULL,
    source_url      VARCHAR(500) NULL,
    featured        TINYINT      NOT NULL DEFAULT 0,
    is_asus         TINYINT      NOT NULL DEFAULT 0,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_org_slug (org_id, slug)
  ) ${TAIL}`,

  // Prices are versioned: a post may only quote a price that is active today,
  // and a price change makes older posts that quoted the old price "stale".
  `CREATE TABLE IF NOT EXISTS hub_prices (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    solution_id     INT          NOT NULL,
    plan_en         VARCHAR(120) NOT NULL,
    plan_zh         VARCHAR(120) NOT NULL,
    amount          INT          NULL,
    currency        VARCHAR(3)   NOT NULL DEFAULT 'TWD',
    billing         VARCHAR(12)  NOT NULL,
    starts_from     TINYINT      NOT NULL DEFAULT 0,
    effective_from  DATE         NOT NULL,
    effective_to    DATE         NULL,
    source_url      VARCHAR(500) NULL,
    INDEX idx_solution (solution_id)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_facts (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    kind            VARCHAR(20)  NOT NULL,
    market          VARCHAR(2)   NOT NULL,
    statement_en    TEXT         NOT NULL,
    statement_zh    TEXT         NOT NULL,
    figures         JSON         NULL,
    source_name     VARCHAR(200) NOT NULL,
    source_url      VARCHAR(500) NOT NULL,
    published_on    DATE         NULL,
    confidence      VARCHAR(20)  NOT NULL,
    INDEX idx_org_kind (org_id, kind)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_skills (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    slug            VARCHAR(80)  NOT NULL,
    name_en         VARCHAR(160) NOT NULL,
    name_zh         VARCHAR(160) NOT NULL,
    channels        JSON         NOT NULL,
    markets         JSON         NOT NULL,
    skill_md        MEDIUMTEXT   NOT NULL,
    status          VARCHAR(12)  NOT NULL DEFAULT 'draft',
    version         INT          NOT NULL DEFAULT 1,
    approved_by     VARCHAR(160) NULL,
    approved_at     DATETIME(3)  NULL,
    updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_org_slug (org_id, slug)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_posts (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    rep_id          INT          NOT NULL,
    solution_id     INT          NULL,
    skill_id        INT          NULL,
    channel         VARCHAR(20)  NOT NULL,
    market          VARCHAR(2)   NOT NULL,
    angle           VARCHAR(600) NULL,
    first_draft     MEDIUMTEXT   NULL,
    caption         MEDIUMTEXT   NOT NULL,
    compliance      JSON         NULL,
    verdict         VARCHAR(12)  NOT NULL,
    short_code      VARCHAR(12)  NULL,
    status          VARCHAR(12)  NOT NULL DEFAULT 'generated',
    post_url        VARCHAR(500) NULL,
    source          VARCHAR(12)  NOT NULL,
    model           VARCHAR(80)  NULL,
    latency_ms      INT          NULL,
    is_demo         TINYINT      NOT NULL DEFAULT 0,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    shared_at       DATETIME(3)  NULL,
    INDEX idx_org_created (org_id, created_at),
    INDEX idx_rep (rep_id)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_links (
    code            VARCHAR(12)  NOT NULL PRIMARY KEY,
    org_id          INT          NOT NULL,
    rep_id          INT          NOT NULL,
    post_id         INT          NULL,
    channel         VARCHAR(20)  NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_rep (rep_id)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_clicks (
    id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    code            VARCHAR(12)  NOT NULL,
    rep_id          INT          NOT NULL,
    post_id         INT          NULL,
    visitor_hash    CHAR(16)     NULL,
    is_demo         TINYINT      NOT NULL DEFAULT 0,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_org_created (org_id, created_at),
    INDEX idx_rep (rep_id)
  ) ${TAIL}`,

  // One row per (post, snapshot). grade says how much to trust the number:
  // verified (platform API) / tracked (our short link) / self_reported (rep
  // pasted it) / estimated (network size × typical rate).
  `CREATE TABLE IF NOT EXISTS hub_metrics (
    id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    rep_id          INT          NOT NULL,
    post_id         INT          NULL,
    channel         VARCHAR(20)  NOT NULL,
    grade           VARCHAR(16)  NOT NULL,
    impressions     INT          NOT NULL DEFAULT 0,
    engagements     INT          NOT NULL DEFAULT 0,
    leads           INT          NOT NULL DEFAULT 0,
    is_demo         TINYINT      NOT NULL DEFAULT 1,
    captured_on     DATE         NOT NULL,
    INDEX idx_org_date (org_id, captured_on),
    INDEX idx_rep (rep_id)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_events (
    id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    rep_id          INT          NULL,
    kind            VARCHAR(32)  NOT NULL,
    detail          VARCHAR(500) NULL,
    is_demo         TINYINT      NOT NULL DEFAULT 0,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_org_created (org_id, created_at)
  ) ${TAIL}`,

  // Strategy tray: preferred terms, word swaps and company-banned words.
  // Legal claim rules stay in the policy packs (code); this is what marketing
  // edits day to day, and the compliance check reads it on every post.
  `CREATE TABLE IF NOT EXISTS hub_wording (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    market          VARCHAR(2)   NOT NULL,
    kind            VARCHAR(12)  NOT NULL,
    term            VARCHAR(120) NOT NULL,
    replacement     VARCHAR(160) NULL,
    note            VARCHAR(300) NULL,
    added_by        VARCHAR(160) NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_term (org_id, market, kind, term),
    INDEX idx_org (org_id)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_regulations (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    market          VARCHAR(2)   NOT NULL,
    authority       VARCHAR(160) NOT NULL,
    title           VARCHAR(300) NOT NULL,
    summary         TEXT         NOT NULL,
    impact          TEXT         NOT NULL,
    rules           JSON         NULL,
    status          VARCHAR(12)  NOT NULL,
    effective_on    DATE         NULL,
    published_on    DATE         NULL,
    source_url      VARCHAR(500) NOT NULL,
    INDEX idx_org (org_id)
  ) ${TAIL}`,

  // 產品描述的編輯提案與紀錄。邏輯在 strategy/core/hub/solutionEdits.ts，
  // 但 schema 放這裡——見下面 HUB_ALTERS 的說明。
  `CREATE TABLE IF NOT EXISTS hub_solution_edits (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    solution_id     INT          NOT NULL,
    actor           VARCHAR(160) NOT NULL,
    action          VARCHAR(16)  NOT NULL,
    changes         JSON         NULL,
    note            VARCHAR(400) NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_solution (solution_id, created_at),
    INDEX idx_org (org_id, created_at)
  ) ${TAIL}`,

  /**
   * 用詞規範的變更紀錄（CJ 2026-09-23「仍然要有編輯歷史」）。
   *
   * 跟 hub_solution_edits 同一個形狀，但**沒有核准流程**：用詞是即時生效的
   * （加一個字，業務寫的下一篇就擋得到），硬加一道核准會讓那個承諾變成謊話。
   * 所以這裡只記錄發生過什麼，不攔。
   *
   * wording_id 不設外鍵：刪掉的那一筆，紀錄還要留著——不然「誰把這個字拿掉的」
   * 這個最常被問的問題剛好查不到。
   */
  `CREATE TABLE IF NOT EXISTS hub_wording_edits (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    wording_id      INT          NULL,
    actor           VARCHAR(160) NOT NULL,
    action          VARCHAR(16)  NOT NULL,
    market          VARCHAR(2)   NOT NULL,
    kind            VARCHAR(12)  NOT NULL,
    term            VARCHAR(120) NOT NULL,
    changes         JSON         NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_org (org_id, created_at),
    INDEX idx_wording (wording_id)
  ) ${TAIL}`,

  /**
   * 策略層通用的變更紀錄（CJ 2026-09-23「每一個 mission tray…會有權限和紀錄」）。
   * 邏輯在 strategy/core/hub/strategyEdits.ts；schema 放這裡，跟其他表一樣
   * 在啟動時建立 —— 今天早上才因為把 schema 掛在請求路徑上弄壞一次部署。
   */
  `CREATE TABLE IF NOT EXISTS hub_strategy_edits (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    entity          VARCHAR(24)  NOT NULL,
    entity_id       INT          NULL,
    actor           VARCHAR(160) NOT NULL,
    action          VARCHAR(16)  NOT NULL,
    changes         JSON         NULL,
    note            VARCHAR(400) NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    /** 這一筆在當下叫什麼。資料刪掉之後，光有 id 沒人看得懂。 */
    label           VARCHAR(200) NULL,
    /**
     * 從舊紀錄表搬過來時的原始 id。搭配下面的唯一鍵，讓搬遷可以重複執行
     * （每次部署都跑，但只會搬一次）—— 一次性的腳本最後總是會被跑第二次。
     */
    legacy_id       INT          NULL,
    INDEX idx_org (org_id, created_at),
    INDEX idx_entity (org_id, entity, entity_id),
    UNIQUE KEY uq_legacy (org_id, entity, legacy_id)
  ) ${TAIL}`,

  /**
   * 待審提案（CJ 2026-09-23「會有權限和紀錄」）。一筆資料同時只有一份。
   *
   * 不學產品那樣在每張表加 pending 欄位 —— 那要再改三張表，而且每多一種資料
   * 就要再改一次。提案本來就是暫時的、跟資料本體無關的東西，放自己的表裡更
   * 誠實：正式欄位在核准之前完全不動，那正是核准的意義。
   */
  `CREATE TABLE IF NOT EXISTS hub_strategy_pending (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    entity          VARCHAR(24)  NOT NULL,
    entity_id       INT          NOT NULL,
    changes         JSON         NOT NULL,
    proposed_by     VARCHAR(160) NOT NULL,
    proposed_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    note            VARCHAR(400) NULL,
    UNIQUE KEY uq_row (org_id, entity, entity_id)
  ) ${TAIL}`,

  /**
   * 逐類退訂（CJ 2026-09-23「退訂就只針對該類訊息退訂」）。
   *
   * 一個業務可能很需要補助消息，但不想收市場統計。全有全無的退訂會讓他為了
   * 擋掉一種而關掉全部 —— 然後補助也錯過了。所以鍵是 (rep, kind)。
   *
   * 沒有列 = 沒退訂。退訂是稀疏的，不需要替每個人每一類都存一列。
   */
  `CREATE TABLE IF NOT EXISTS hub_push_optouts (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    rep_id          INT          NOT NULL,
    kind            VARCHAR(20)  NOT NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_rep_kind (org_id, rep_id, kind)
  ) ${TAIL}`,

  /**
   * 送出紀錄。**每一次送出都要留下來，成功失敗都要。**
   *
   * 推播是對外的動作，收不回來。「到底有沒有送給他」這個問題一定會被問，而且
   * 通常是在出事的時候問。成功的紀錄證明送了，失敗的紀錄證明試過而且為什麼沒成。
   */
  `CREATE TABLE IF NOT EXISTS hub_push_log (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    fact_id         INT          NOT NULL,
    rep_id          INT          NOT NULL,
    actor           VARCHAR(160) NOT NULL,
    ok              TINYINT      NOT NULL DEFAULT 0,
    detail          VARCHAR(400) NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_org (org_id, created_at),
    INDEX idx_fact (org_id, fact_id)
  ) ${TAIL}`,

  `CREATE TABLE IF NOT EXISTS hub_approvers (
    id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    org_id          INT          NOT NULL,
    email           VARCHAR(160) NOT NULL,
    added_by        VARCHAR(160) NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_org_email (org_id, email)
  ) ${TAIL}`,
];

/**
 * 後來補上的欄位。
 *
 * 2026-09-23：這幾個 ALTER 本來住在 solutionEdits.ts，由 tRPC procedure 懶載入
 * 時才跑。結果是 **部署直接掛掉**：hub-seed.ts 在部署時跑，早於任何一個請求，
 * 讀到 `SELECT ... profile FROM hub_solutions` 就噴 Unknown column，`set -e`
 * 中止，連 symlink 都沒切——站上跑的還是上一版，而部署只在 log 裡紅一行。
 *
 * 教訓不是「seed 要記得先呼叫那支 DDL」，是 **schema 不該由請求路徑負責建立**。
 * 所以搬到這裡：ensureHubTables() 在伺服器啟動時跑，也在 seed 最前面跑，
 * 兩條進入點共用同一份定義。
 */
export const HUB_ALTERS: string[] = [
  // 提案欄位掛在方案本身：一個方案同時間只會有一份待審提案。
  `ALTER TABLE hub_solutions ADD COLUMN pending JSON NULL`,
  `ALTER TABLE hub_solutions ADD COLUMN pending_by VARCHAR(160) NULL`,
  `ALTER TABLE hub_solutions ADD COLUMN pending_at DATETIME(3) NULL`,
  `ALTER TABLE hub_solutions ADD COLUMN updated_by VARCHAR(160) NULL`,
  `ALTER TABLE hub_solutions ADD COLUMN updated_at DATETIME(3) NULL`,
  `ALTER TABLE hub_solutions ADD COLUMN created_by VARCHAR(160) NULL`,
  // 十一個 B2B 欄位 × 中英 = 二十二欄太多，而且清單還會長，所以一個 JSON。
  `ALTER TABLE hub_solutions ADD COLUMN profile JSON NULL`,

  /**
   * 2026-09-23 (CJ「要有更新日期，法規名稱還要最近修改的摘要，按下去才看到
   * 完整的法規」)。原本 title 一欄同時裝法規名稱與這次改了什麼，還中英文混在
   * 一起，六張卡並排就是一面文字牆。拆成短名 + 一句話的變動摘要，完整的留給
   * modal。順便補上中文版的 summary / impact —— 台灣的讀者不該被迫讀英文法規摘要。
   */
  `ALTER TABLE hub_regulations ADD COLUMN name_en VARCHAR(200) NULL`,
  `ALTER TABLE hub_regulations ADD COLUMN name_zh VARCHAR(200) NULL`,
  `ALTER TABLE hub_regulations ADD COLUMN change_en VARCHAR(400) NULL`,
  `ALTER TABLE hub_regulations ADD COLUMN change_zh VARCHAR(400) NULL`,
  `ALTER TABLE hub_regulations ADD COLUMN summary_zh TEXT NULL`,
  `ALTER TABLE hub_regulations ADD COLUMN impact_zh TEXT NULL`,

  /**
   * 2026-09-23 (CJ「每個市場消息，應該要匹配到公司的客戶行業標籤，這樣才能推播
   * 給對應的業務，讓業務轉給客戶」)。
   *
   * 市場消息從「可以引用的數字白名單」變成「可以轉給客戶的情報」，需要兩件事：
   * 標產業（送給誰）、標截止日（還能不能送）。產業標籤沿用 hub_solutions 那一組
   * 值，字彙表在 strategy/core/hub/industries.ts。
   *
   * expires_on 之所以必要：補助有申請期限，而**過期的補助推出去比不推更糟**
   * —— 業務轉給客戶、客戶去申請才發現結束了，那是業務要自己吞的難堪。
   */
  `ALTER TABLE hub_facts ADD COLUMN industries JSON NULL`,
  `ALTER TABLE hub_facts ADD COLUMN expires_on DATE NULL`,
  `ALTER TABLE hub_reps ADD COLUMN industries JSON NULL`,

  /**
   * 2026-09-23 (CJ「要做推播，是由建置該消息的用戶，設定推播的銷售業務員群組
   * 還有頻率」)。
   *
   * 推播設定掛在消息本身，不另外開一張表：一則消息只有一組推播設定，而且
   * 建立消息的人就是設定的人——分開存會讓「這則到底有沒有在推」要查兩個地方。
   *
   * push_audience：業務 id 清單。空 = 用產業標籤自動比對（預設行為）。
   *                指名之後就以指名的為準——建立消息的人比自動比對更清楚。
   * push_cadence：off / once / weekly / before_deadline。
   */
  `ALTER TABLE hub_facts ADD COLUMN push_audience JSON NULL`,
  `ALTER TABLE hub_facts ADD COLUMN push_cadence VARCHAR(20) NULL`,
  `ALTER TABLE hub_facts ADD COLUMN push_last_at DATETIME(3) NULL`,

  // 2026-09-23：通用紀錄表併入舊的兩張表所需要的欄位（見 hubSeed 的搬遷段）。
  `ALTER TABLE hub_strategy_edits ADD COLUMN label VARCHAR(200) NULL`,
  `ALTER TABLE hub_strategy_edits ADD COLUMN legacy_id INT NULL`,
  `ALTER TABLE hub_strategy_edits ADD UNIQUE KEY uq_legacy (org_id, entity, legacy_id)`,
];

export async function ensureHubTables(): Promise<void> {
  const { default: localPool } = await import("../../../localDb");
  for (const ddl of HUB_DDL) {
    await localPool.execute(ddl);
  }
  // ALTER 沒有 IF NOT EXISTS，重跑一定會噴。欄位是 "Duplicate column name"，
  // 索引是 "Duplicate key name" —— 兩種都是預期的，其他的要吵出來。
  for (const ddl of HUB_ALTERS) {
    await localPool.execute(ddl).catch((e: any) => {
      if (!/duplicate (column|key) name/i.test(String(e?.message ?? ""))) {
        console.warn("[hubDdl] alter:", e?.message ?? e);
      }
    });
  }
}
