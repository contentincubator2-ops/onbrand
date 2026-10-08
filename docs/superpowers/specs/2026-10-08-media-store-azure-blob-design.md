# 產圖直接存 Azure Blob：media store 抽象層 — 設計規格

**日期**：2026-10-08
**分支**：`feat/media-store-azure-blob`（從 `dev` 切出）
**前情**：`platform/core/media/mediaGen.ts`、`content/core/image/imageCards.ts`、`server/index.ts` 的 covers 靜態目錄；`platform/core/connectors/publish/publicUrl.ts`（2026-10-08，Zernio 需要絕對網址）

---

## 0. 一頁摘要

產圖目前寫在 VM 磁碟 `/opt/onbrand/covers`，由 express／nginx 以 `/static/covers/<檔名>` 公開，資料庫存相對路徑。問題：每日備份不含圖片、VM 重建會遺失、磁碟線性成長、第三方（Zernio）要靠 `APP_URL` 才拼得出絕對網址。

本 PR 抽出 `mediaStore` 介面，兩種後端擇一（環境變數切換）：`local`（現狀，零行為改變）與 `azure-blob`（上傳到 Blob，回絕對 https 網址）。**資料庫既有的相對路徑不動、不搬舊圖**；新圖在 Blob 模式下存絕對網址。前端、客戶核准頁、Zernio 都已能吃絕對網址。

Azure 端已由 Claude 用 az CLI 建好（2026-10-08）：

| 環境 | Resource group | Storage account | 容器 | 公開層級 |
|---|---|---|---|---|
| dev | `sowork-staging`（eastus） | `stonbrandmediadev` | `onbrand-media` | Blob（匿名可讀 blob，不可列目錄） |
| prod | 之後建 `stonbrandmediaprod` 於 `sowork-app-production` | 同上 | 同上 |

連線字串存在 GitHub Secrets：dev environment 的 `AZURE_STORAGE_CONNECTION_STRING`。

---

## 1. 介面（新檔 `platform/core/media/mediaStore.ts`）

```ts
export type MediaKind = "cover";                      // 目前只有 covers；asset photos 另案
export interface MediaStore {
  readonly backend: "local" | "azure-blob";
  /** 存一個檔，回傳可直接放進 <img src> 與交給第三方的公開網址。 */
  put(name: string, bytes: Buffer, contentType: string): Promise<string>;
  /** 用 put 回傳的網址把位元組讀回來（圖片工具要重修圖時用）；不是自己存的網址回 null。 */
  get(url: string): Promise<Buffer | null>;
  /** 判斷網址是不是這個 store 存的。 */
  owns(url: string): boolean;
}
export function getMediaStore(): MediaStore;          // 依 MEDIA_STORAGE 選後端，單例
```

- `MEDIA_STORAGE` 未設或 `local` → `LocalMediaStore`：行為與現在完全相同（`COVERS_DIR`、`COVERS_URL_PREFIX`，回相對路徑）。
- `MEDIA_STORAGE=azure-blob` → `AzureBlobMediaStore`：
  - 套件 `@azure/storage-blob`（加進 `skills/ai-talent/package.json`）。
  - 連線：`AZURE_STORAGE_CONNECTION_STRING`；容器：`AZURE_BLOB_CONTAINER`（預設 `onbrand-media`）；blob 路徑 `covers/<name>`。
  - `put`：`uploadData(bytes, { blobHTTPHeaders: { blobContentType, blobCacheControl: "public, max-age=31536000, immutable" } })`。檔名已含時間戳與亂數，可視為不可變。
  - 回傳網址：`${MEDIA_PUBLIC_BASE_URL ?? containerClient.url}/covers/<name>`。`MEDIA_PUBLIC_BASE_URL` 留給之後接 CDN／自訂網域，預設不設。
  - `get`：解析網址 → blob 名稱 → `downloadToBuffer`；404 回 null。
  - `owns`：網址以容器公開網址或 `MEDIA_PUBLIC_BASE_URL` 開頭。
  - 啟動時若 `MEDIA_STORAGE=azure-blob` 但缺連線字串 → 直接 throw，讓部署的 health check 失敗，不要默默退回 local。
- 兩個後端都要能 `get` 對方的網址嗎？**不用**。但要能讀舊圖：`AzureBlobMediaStore.get` 對 `/static/covers/...` 的相對路徑回 null，呼叫端（圖片工具）再退回讀本機磁碟（見第 2 節）。

---

## 2. 改寫寫入點

| 檔案 | 改法 |
|---|---|
| `platform/core/media/mediaGen.ts` | `saveCoverFile`、`saveB64`、`downloadAndSave` 改成 `await getMediaStore().put(name, buf, contentType)`（`saveCoverFile` 因此變 async，呼叫端跟著 await）。`coverFilePath(url)` 保留給 local 舊圖；新增 `readCoverBytes(url)`：先 `getMediaStore().get(url)`，null 再走 `coverFilePath` 讀磁碟。所有原本用 `coverFilePath` 讀檔的地方改用 `readCoverBytes`。 |
| `content/core/image/imageCards.ts` | 第 225～310 行自己的 `COVERS_DIR` 寫檔改成 `getMediaStore().put`。 |
| `content/routers/imageCardRouter.ts`、`content/core/image/taskIllustration.ts` | 若有直接寫 covers 目錄，改走 store；若只是呼叫 mediaGen 則不用動。 |
| `server/index.ts` | express static 的 covers 目錄**保留**（舊圖與 local 模式都靠它）。 |
| `strategy/core/brand/assetPhotos.ts` | **不動**（產品照片有自己的刪除與權限邏輯，另案）。 |

contentType 由副檔名決定：png→`image/png`、jpg／jpeg→`image/jpeg`、webp→`image/webp`、mp4→`video/mp4`。

---

## 3. 環境變數（`.env.example`）

```
# 產圖存哪：local（VM 磁碟，預設）或 azure-blob
MEDIA_STORAGE=local
# MEDIA_STORAGE=azure-blob 時必填
AZURE_STORAGE_CONNECTION_STRING=
AZURE_BLOB_CONTAINER=onbrand-media
# 選填：接 CDN 或自訂網域時覆蓋公開網址前綴（不含結尾斜線）
MEDIA_PUBLIC_BASE_URL=
```

Ops workflow：仿 `admin-write-zernio-env.yml` 新增 `.github/workflows/admin-write-media-env.yml`，inputs：`target`（dev／prod）、`media_storage`（keep／local／azure-blob）、`container`（字串，預設 `onbrand-media`）；連線字串只從 `secrets.AZURE_STORAGE_CONNECTION_STRING` 來。dev job `environment: dev`。**選項字串一律加引號**（YAML 布林值教訓）。

健康檢查內部視圖多回 `media: { backend, publicBase }`（不含連線字串）。

---

## 4. 測試

| 檔案 | 要驗 |
|---|---|
| `platform/core/media/mediaStore.test.ts` | local：`put` 寫到 `COVERS_DIR`、回相對路徑、`get` 讀回、`owns` 判斷。azure-blob：用注入的假 `ContainerClient`（`getBlockBlobClient().uploadData`／`downloadToBuffer`）驗 blob 名稱 `covers/<name>`、contentType、cache-control、回傳網址、`MEDIA_PUBLIC_BASE_URL` 覆蓋、404 回 null、缺連線字串時 throw。 |
| `mediaGen.test.ts`（若有） | `saveCoverFile` 透過 store；`readCoverBytes` 先問 store 再退回磁碟。 |
| `imageCards` 相關測試 | 寫入改走 store。 |

驗證：`cd skills/ai-talent && COVERS_DIR=<暫存> npx vitest run server/platform/core/media server/content/core/image server/content/routers/imageCardRouter* && npx tsc --noEmit && npx tsc --noEmit -p client`。

---

## 5. 明確不做

- 不搬舊圖、不改資料庫既有路徑。
- 不動 asset photos（產品照片）。
- 不接 CDN；只留 `MEDIA_PUBLIC_BASE_URL` 接點。
- 不 push、不開 PR；commit 中文訊息 `feat(media): …`，結尾 `Co-Authored-By: Codex <noreply@openai.com>`。

## 6. 上線步驟（Claude／Shawn）

1. 合進 dev 部署後，跑 `admin-write-media-env`：target=dev、media_storage=azure-blob。
2. 在 dev 產一張圖，確認網址是 `https://stonbrandmediadev.blob.core.windows.net/onbrand-media/covers/...`，瀏覽器可開、客戶核准頁可見、Zernio 發布成功。
3. prod：建 `stonbrandmediaprod`，連線字串放 repo 層級 secret，再切。
