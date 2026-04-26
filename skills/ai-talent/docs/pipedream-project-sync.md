# Project Sync via Pipedream

從 Facebook / Instagram / YouTube / 官網 / Google Drive / OneDrive / Dropbox 同步資產到 Marketing OS 專案。

## 架構

```
┌──────────────┐  1. start sync   ┌──────────────┐  2. trigger    ┌─────────────────┐
│  Frontend    │ ────────────────▶│  Backend     │ ──────────────▶│  Pipedream      │
│  (modal)     │                  │  tRPC + DB   │  (HTTP POST)   │  Workflow       │
└──────────────┘                  └──────────────┘                └─────────────────┘
       ▲                                  ▲                               │
       │ 4. poll status                   │ 3. callback (assets)          │
       │                                  └───────────────────────────────┘
       │                                     /api/project-sync/callback
       └─── status query ──────────────────
```

## 後端 .env

每個 source 一個 webhook URL（指向你建立的 Pipedream HTTP trigger）：

```bash
PIPEDREAM_WEBHOOK_FACEBOOK=https://eoXXXXXXXXXX.m.pipedream.net
PIPEDREAM_WEBHOOK_INSTAGRAM=https://eoXXXXXXXXXX.m.pipedream.net
PIPEDREAM_WEBHOOK_YOUTUBE=https://eoXXXXXXXXXX.m.pipedream.net
PIPEDREAM_WEBHOOK_WEBSITE=https://eoXXXXXXXXXX.m.pipedream.net
PIPEDREAM_WEBHOOK_GOOGLE_DRIVE=https://eoXXXXXXXXXX.m.pipedream.net
PIPEDREAM_WEBHOOK_ONEDRIVE=https://eoXXXXXXXXXX.m.pipedream.net
PIPEDREAM_WEBHOOK_DROPBOX=https://eoXXXXXXXXXX.m.pipedream.net

PUBLIC_APP_URL=https://marketing-os.sowork.ai
```

> 沒設定的 source 會在 `start` 時立刻把 job 標記為 `failed`，UI 會在錯誤訊息提示要設哪個 env。

## Pipedream Workflow 範本

每個 source 一個 workflow。觸發 payload：

```json
{
  "jobId": 42,
  "webhookSecret": "abc123…",
  "source": "facebook",
  "params": { "pageUrl": "https://www.facebook.com/sowork", "limit": "30" },
  "userId": 7,
  "brandId": 12,
  "missionId": null,
  "callbackUrl": "https://marketing-os.sowork.ai/api/project-sync/callback?jobId=42"
}
```

### Workflow 步驟

1. **HTTP Trigger** — 接收上面的 payload。
2. **Connect Account** — 用 Pipedream Connect 連接該 source 的帳號（FB Pages、IG Business、YouTube、Drive、OneDrive、Dropbox）。Connect 會引導使用者 OAuth，第一次同步前先在 Pipedream UI 點 connect。
3. **List / Fetch** — 用 source 的 SDK 抓取資產：
   - **Facebook**：`/{page-id}/posts?fields=id,message,full_picture,created_time,permalink_url`
   - **Instagram**：`/{ig-user-id}/media?fields=id,caption,media_url,thumbnail_url,permalink,media_type,timestamp`
   - **YouTube**：`channels.list` → `playlistItems.list` → `videos.list`
   - **Website**：用 `axios` + `cheerio` 抓 og:image / 文章 / sitemap
   - **Google Drive**：`drive.files.list({ q: "'{folderId}' in parents" })` 遞迴
   - **OneDrive**：`/me/drive/root:/{folderPath}:/children`
   - **Dropbox**：`/2/files/list_folder`
4. **POST callback** — 每批 ~50 筆 POST 一次：

```js
await axios.post(steps.trigger.event.body.callbackUrl, {
  jobId: steps.trigger.event.body.jobId,
  secret: steps.trigger.event.body.webhookSecret,
  status: "running",
  progressPct: 50,
  assets: items.map(p => ({
    kind: "post",
    title: p.message?.slice(0, 200),
    externalId: p.id,
    externalUrl: p.permalink_url,
    mediaUrl: p.full_picture,
    thumbnailUrl: p.full_picture,
    textContent: p.message,
    meta: { createdTime: p.created_time },
  })),
});
```

5. **Final POST**：

```js
await axios.post(callbackUrl, { jobId, secret, status: "done", progressPct: 100 });
```

失敗時：

```js
await axios.post(callbackUrl, { jobId, secret, status: "failed", errorMsg: e.message });
```

## DB 表

- `project_sync_jobs` — 每次同步一列，含 source、params、status、progressPct、assetCount、webhookSecret
- `project_assets` — 同步下來的資產（kind = post / image / video / doc / page / audio）

兩張表 migration 已加入 `scripts/migrate.ts`，跑 `npm run db:migrate` 自動建立。

## Asset kind 規範

| kind | 用途 |
|---|---|
| `post`  | FB/IG 貼文 |
| `image` | 單張圖片 |
| `video` | 影片（含 YouTube） |
| `doc`   | 文件 / 部落格文章 |
| `audio` | Podcast / 錄音 |
| `page`  | 網站頁面（含截圖） |

## Asset 用途

之後可以：
- 在 mission 內用 `@asset` 引用，作為 LLM context
- Brand brain 自動抓 assets 萃取品牌語氣 / 視覺風格
- 任務輸出時直接挑選 asset 作為素材

## 開發測試

不接 Pipedream 也可以測：直接用 curl POST callback 餵假資料：

```bash
# 1. 用 UI 啟動 sync（會 failed because no webhook env）
# 2. 拿到 jobId（看 DB 或 status 回應）
# 3. 直接餵 assets：
curl -X POST 'http://localhost:3000/api/project-sync/callback?jobId=42' \
  -H 'Content-Type: application/json' \
  -d '{
    "secret": "PASTE_FROM_DB",
    "status": "done",
    "progressPct": 100,
    "assets": [
      { "kind":"post", "title":"Test post", "externalUrl":"https://fb.com/p/1" }
    ]
  }'
```
