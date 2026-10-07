# 品牌發布供應商連線表

在目標環境手動執行一次；僅建立新表，不修改或回填 brands 舊欄位。
部署新程式前先完成此 migration。dev 與 prod 分別執行。

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
  UNIQUE KEY uq_bpc_brand_provider_platform_account (brandId, provider, platform, accountId),
  KEY idx_bpc_lookup (brandId, provider, platform, status)
);
```
