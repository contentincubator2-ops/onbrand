# A2A Marketing — 命名架構（Phase A, 2026-04-18）

## 核心概念

系統圍繞三個核心實體：**Mission**、**Squad**、**Agent**。

- **Mission** (任務)：用戶發起的工作單位。每個 mission 有一個主題、workspace、brand 等。
- **Squad** (團隊)：為完成 mission 組合好的 AI 專家團隊。每個 squad 是**預先定義的模板**，包含固定成員。
- **Agent** (代理人)：Squad 中的個別 AI 專家，有具體的技能（skills）、模型（aiModel）、角色（role）。

### 資料關係
```
Mission (tasks)  ──1:1──►  Squad Template (predefined)
                              │
                              └──N:1──►  Agents (pre-configured members)
```

---

## 三個實體層的命名結構

### 1. Squads（Squad 模板 + 執行實例）

| 層 | 檔案/表 | 職責 |
|---|---|---|
| **DB 表** | `squads` | **Squad 模板庫**（671 個預定義團隊，含成員 JSON）|
| **DB 表** | `squads` | Squad 執行實例（每次 mission 開始時產生） |
| **DB 表** | `squad_agents` | 執行實例下的成員記錄 |
| **TRPC Router** | `squadTemplateRouter.ts` | Squad 模板 CRUD、推薦（`trpc.squad.*`）|
| **Express REST** | `missionSquadRoute.ts` | `GET /api/missions/:missionId/squad` REST endpoint |
| **前端組件** | `mission-chat/SquadRecommendCards.tsx` | Squad 推薦 UI |
| **前端組件** | `mission-chat/MissionHomePage.tsx` | 顯示 squad chips 讓用戶選擇 |

**關鍵 squadTemplateRouter API:**
- `getRecommendedSquads` — 按 workspace + brand + mission 評分推薦 6 個 squads
- `getMembersById` — 回傳指定 squad 的成員 + workflow steps
- `assemble` — 用戶確認後建立 `squads` + `squad_agents` 實例
- `squadLeadOpen` — Squad Lead 生成開場問題

### 2. Mission Chat（任務對話與執行）

| 層 | 檔案/表 | 職責 |
|---|---|---|
| **DB 表** | `missions` | Mission 元資料（title, workspace, brandId, status）|
| **DB 表** | `mission_task_units` | Mission 下的子任務單位 |
| **DB 表** | `agent_chats` | Mission 中 agent 產生的聊天訊息 |
| **TRPC Router** | `missionRouter.ts` | Mission CRUD（`trpc.mission.*`）|
| **Express SSE** | `missionChatHandler.ts` | `POST /api/stream/squad-chat` 即時對話流 |
| **前端組件** | `MissionChatCore.tsx` | Mission 對話核心 UI（120KB 主組件）|
| **前端資料夾** | `mission-chat/` | 24 個 mission chat 相關子組件 |

**前端子組件清單 (`mission-chat/`):**
- `MissionHomePage.tsx` — Mission 起始頁（squad chips 選擇）
- `AgentBubbleHeader.tsx` — Agent 訊息 header
- `AgentNavigation.tsx` — Agent 切換導航
- `ChatInput.tsx` — 輸入框
- `MessageBubble.tsx` — 訊息氣泡
- `MarkdownRenderer.tsx` — Markdown 渲染
- `MentionAutocomplete.tsx` — @mention 下拉選單
- `TaskProgressTracker.tsx` — 進度條
- `TypedThreadCard.tsx` — 打字效果訊息
- `RightPanel.tsx` — 右側 agents panel
- `Sidebar.tsx` — 左側 sidebar
- ...等其他 UI 組件

### 3. Agents（AI 代理人）

| 層 | 檔案/表 | 職責 |
|---|---|---|
| **DB 表** | `agents` | 所有 agents（17,095 筆，含 primarySkill, aiModel, title）|
| **DB 表** | `agent_embeddings` | Agent 的語意向量（用於推薦）|
| **DB 表** | `agent_chats` | Agent 產生的聊天訊息 |
| **TRPC Router** | `agentRouter.ts` | Agent CRUD |
| **Server Util** | `agentContextLoader.ts` | 載入 agent 完整 context（skills, brand knowledge）|
| **Server Util** | `agentMatcher.ts` | Agent 語意匹配（embedding-based）|

---

## 命名規則總結

### 保留 `squad` 的場景（模板概念）
- DB 表名：`squads`, `squads`, `squad_agents`, `squad_templates`（未來）
- TRPC router key：`trpc.squad.*`（前端兼容）
- 業務邏輯：`squadTemplateRouter` (管理 squad 模板)
- Squad 內部概念：`SquadChip`, `SquadRecommendCards`, `squadSlug`, `squadId`

### 改為 `mission` 的場景（執行單位概念）
- TRPC router：`missionRouter` (管理 mission CRUD)
- Express SSE：`missionChatHandler` (mission 的 chat streaming)
- Express REST：`missionSquadRouter` (mission 下的 squad resource)
- 前端組件：`MissionChatCore`, `MissionHomePage`, `mission-chat/` 資料夾

---

## Phase A 重命名對照表

| 舊名稱 | 新名稱 | 類型 |
|---|---|---|
| `squadRouter.ts` | `squadTemplateRouter.ts` | TRPC Router 檔 |
| `export const squadRouter` | `export const squadTemplateRouter` | TRPC Router 變數 |
| `squadChatRoute.ts` | `missionChatHandler.ts` | Express SSE 檔 |
| `export const squadChatRouter` | `export const missionChatHandler` | Express 變數 |
| `squadRoute.ts` | `missionSquadRoute.ts` | Express REST 檔 |
| `export const squadRouter` (REST) | `export const missionSquadRouter` | Express 變數 |
| `components/ChatCore.tsx` | `components/MissionChatCore.tsx` | 前端檔 |
| `function ChatCore` | `function MissionChatCore` | React 組件 |
| `ChatCoreProps` | `MissionChatCoreProps` | TS interface |
| `[ChatCore]` log prefix | `[MissionChatCore]` | 日誌標記 |
| `components/chat/` | `components/mission-chat/` | 前端資料夾 |

---

## API Endpoints 對照

| Endpoint | 用途 | 檔案 |
|---|---|---|
| `trpc.squad.getRecommendedSquads` | Squad 模板推薦 | `squadTemplateRouter.ts` |
| `trpc.squad.getMembersById` | 取得指定 squad 成員 | `squadTemplateRouter.ts` |
| `trpc.squad.assemble` | 組建 squad 執行實例 | `squadTemplateRouter.ts` |
| `trpc.mission.create` | 建立新 mission | `missionRouter.ts` |
| `trpc.mission.list` | 列出用戶的 missions | `missionRouter.ts` |
| `POST /api/stream/squad-chat` | Mission 執行即時對話 (SSE) | `missionChatHandler.ts` |
| `GET /api/missions/:missionId/squad` | Mission 的 squad 資源 | `missionSquadRoute.ts` |

---

## 設計原則

1. **Squad = 模板**：Squad 預先定義，成員固定，不需要動態「配對」
2. **Mission = 執行**：每個 mission 選一個 squad 執行，可多次執行同樣的 squad
3. **Agent = 個體**：17K agents 共享庫，squad 引用它們的 ID
4. **命名一致性**：REST/SSE/TRPC/Component 層命名統一，減少理解成本
5. **向後兼容**：TRPC 的 `trpc.squad.*` key 保留不改（前端兼容性）

## Phase B Step 7 更新（2026-04-18）

**移除 MissionHomePage 中的 ResourceBanner「正在配對」**
- 原因：Squad 模板已預定義成員，沒有動態配對的概念
- 用戶選 squad chip → 直接顯示該 squad 內的 agents（無等待動畫）
- 保留：squad chips UI、`trpc.squad.getRecommendedSquads` 推薦邏輯
- 刪除：`ResourceBanner` 組件、`trpc.resource.summaryByMission` 前端調用
