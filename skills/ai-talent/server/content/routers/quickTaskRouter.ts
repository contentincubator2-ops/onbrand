/**
 * quickTaskRouter — 30 秒產出 · 預製 Squad 接力交付
 *
 * 架構修正（v3）：
 *   每個任務 = 一個「已分工好的 Squad」，成員 skill **完全獨立不重複**。
 *   避免兩個成員都在「寫 hook」這種偽分工。改成像真實 agency：
 *     - 受眾研究員（research skill）
 *     - hook 寫手（writing skill）
 *     - 表現編輯（A/B 變體 skill）
 *   每人做一件別人不會的事，串成接力，最後 orchestrator 整合。
 *
 * Squad 結構：
 *   stages[]：管線階段
 *   每個 stage 1-2 位成員（不再有兩位同 skill 並行）
 *   多人並行只發生在「同一階段需要不同視角」（如內部 vs 外部分析）
 *
 * Provider 容錯：preferred 失敗 → forge fallback（同 v2）
 */
import { router } from "../../platform/core/trpc";

/* ──────────────────────────── SQUAD CATALOG ────────────────────────────── */

/* ──────────────────────────── HELPERS ──────────────────────────────────── */

// Brand context now lives in _core/brandContext.ts so every router
// uses the same source of truth + same 1-min cache.

// 2026-05-05 quick-task pivot

// 2026-05-12 (CJ「KOL 提供說法不提供名單」)
// 2026-08-29 官網頻道 (web-)：品牌自己的部落格長文 / 品牌專欄 / 案例 / 產品頁。
// 2026-08-29 per-brand 任務包。有 pack 的品牌，頻道與卡片完全由 pack 決定。
// 2026-09-02: task id → template + config 的唯一解析點。這條鏈本來在這個檔案
// 裡手抄了五次，抄第五次時漏了 KOL 的 config（KOL 任務按「換人重寫」直接炸）。
// 2026-09-04 用戶自建任務卡。listFB 疊加，執行則走 taskRegistry 的來源註冊。
// 2026-05-18 (CJ「media to copy」): photo/video/doc media task catalog
import { catalogProcedures } from "./quickTask/catalogProcedures";
import { runProcedures } from "./quickTask/runProcedures";
import { refineProcedures } from "./quickTask/refineProcedures";
import { squadAutoProcedures } from "./quickTask/squadAutoProcedures";
export { RUN_SQUAD_AUTO_SINGLE_FLIGHT_TTL_MS, RUN_SQUAD_AUTO_MAX_CONCURRENT_PER_USER } from "./quickTask/runSquadAutoGuard";

/* ──────────────────────────── ROUTER ───────────────────────────────────── */

export const quickTaskRouter = router({
  ...catalogProcedures,


  ...runProcedures,








  ...refineProcedures,




  ...squadAutoProcedures,





});
