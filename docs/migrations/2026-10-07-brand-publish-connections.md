# 品牌發布供應商連線表

由 scripts/migrate.ts 於部署時自動執行；本文件僅供查閱。

建立發布連線表並冪等升級唯一鍵，不修改或回填 brands 舊欄位。每品牌、供應商、平台只保留一列，換帳號覆蓋該列；disconnected 列保留。

```sql
-- 品牌在某供應商那邊的「租戶」：Zernio profileId、bundle teamId、Pipedream external user id……
CREATE TABLE brand_publish_tenants (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  brandId     INT          NOT NULL,
  provider    VARCHAR(24)  NOT NULL,                 -- 'zernio' | 'bundle' | 'pipedream' | ...
  tenantId    VARCHAR(128) NOT NULL,
  createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_bpt_brand_provider (brandId, provider)
);

-- 該租戶底下、某平台、某個已授權帳號（粉專／IG 商業帳號／頻道……）
CREATE TABLE brand_publish_connections (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  brandId         INT          NOT NULL,
  provider        VARCHAR(24)  NOT NULL,
  platform        VARCHAR(24)  NOT NULL,             -- onBrand 內部值：facebook | instagram | linkedin | threads | x | youtube | tiktok
  accountId       VARCHAR(128) NOT NULL,             -- 供應商端帳號 id（Zernio account _id）
  accountLabel    VARCHAR(255) NULL,                 -- displayName，給 UI
  accountUsername VARCHAR(255) NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'connected',   -- 'connected' | 'disconnected'
  connectedAt     DATETIME(3)  NULL,
  disconnectedAt  DATETIME(3)  NULL,
  meta            JSON         NULL,                 -- 供應商專屬雜項（profileUrl 等），不再開新欄位
  createdAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_bpc_brand_provider_platform (brandId, provider, platform),
  KEY idx_bpc_lookup (brandId, provider, platform, status)
);
```

既有環境先查 `information_schema.STATISTICS`（`TABLE_SCHEMA = DATABASE()`）。
新索引存在時輸出 `already exists, skipped`；否則同組保留 id 最大的一列，
再移除舊索引並建立新索引。若兩個索引都不存在，也先清重複再補建新索引。
以下 SQL 僅在舊索引存在且新索引不存在時執行：

```sql
DELETE older FROM brand_publish_connections older
JOIN brand_publish_connections newer
  ON older.brandId = newer.brandId AND older.provider = newer.provider
  AND older.platform = newer.platform AND older.id < newer.id;
ALTER TABLE brand_publish_connections
  DROP INDEX uq_bpc_brand_provider_platform_account,
  ADD UNIQUE KEY uq_bpc_brand_provider_platform (brandId, provider, platform);
```
