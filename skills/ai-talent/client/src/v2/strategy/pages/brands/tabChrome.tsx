/**
 * 品牌頁的分頁外框：動作列、分頁圖示與導覽項。
 */
import { useLang } from "../../../../lib/i18n";
import { Button } from "@heroui/react";
import { PlayIcon, LockIcon, RegenerateIcon } from "../../../platform/components/icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React from "react";

/* ─────────────────────────── TabActionBar ───────────────────────────
 *
 * Shared action bar for 定位 / 文字 / 視覺 tabs. State-aware label:
 *   locked        → button disabled "已鎖定 — 解鎖才能編輯"
 *   running (定位) → 暫停 / 跳過此步 / 停止
 *   paused  (定位) → 繼續
 *   has content   → 重新___ (rotate icon)
 *   empty         → 開始___ (play icon)
 *
 * Uses Notion-style line icons (Lucide) instead of FontAwesome.
 */
export function TabActionBar({
  tab, label, locked, hasContent, statusText, subText,
  pipelineStatus, onPause, onResume, onSkip, onStop, onAction, busy,
}: {
  tab: "positioning" | "copy" | "visual";
  label: string;
  locked: boolean;
  hasContent: boolean;
  statusText: string;
  subText?: string;
  pipelineStatus?: string;
  onPause?: () => void;
  onResume?: () => void;
  onSkip?: () => void;
  onStop?: () => void;
  onAction: () => void;
  /** Non-pipeline tabs (visual/copy) don't have a running/paused pipeline
   *  state — `busy` covers a one-shot mutation in flight (e.g. visual
   *  auto-fill) so the button still shows a loading state. */
  busy?: boolean;
}) {
  const { lang } = useLang();
  const isRunning = pipelineStatus === "running";
  const isPaused  = pipelineStatus === "paused";
  return (
    <div style={{
      borderBottom: "1px solid #E5E7EB",
      background: "#FAFAFA",
      padding: "16px 28px",
    }}>
      <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#18181B", margin: 0 }}>
            {locked
              ? (lang === "en" ? `${label} is locked — unlock to edit` : `${label}已鎖定 — 解鎖才能編輯`)
              : isRunning || busy
                ? (lang === "en" ? "Analyzing…" : "正在分析中…")
                : statusText}
          </p>
          {subText && (
            <p style={{ fontSize: 12, color: "#71717A", margin: "2px 0 0" }}>
              {subText}
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {tab === "positioning" && isRunning && (
            <>
              <Button size="sm" variant="bordered" onPress={onPause}>{lang === "en" ? "Pause" : "暫停"}</Button>
              <Button size="sm" variant="bordered" onPress={onSkip}>{lang === "en" ? "Skip step" : "跳過此步"}</Button>
              <Button size="sm" variant="bordered" color="danger" onPress={onStop}>{lang === "en" ? "Stop" : "停止"}</Button>
            </>
          )}
          {tab === "positioning" && isPaused && (
            <Button
              size="sm"
              onPress={onResume}
              startContent={<PlayIcon size={14} strokeWidth={2} />}
              style={{ background: "#18181B", color: "white" }}
            >
              {lang === "en" ? "Continue" : "繼續"}
            </Button>
          )}
          {(!isRunning && !isPaused) && (
            <Button
              size="lg"
              isDisabled={locked || busy}
              isLoading={busy}
              onPress={onAction}
              startContent={
                busy ? undefined :
                locked ? <LockIcon size={15} strokeWidth={2} /> :
                hasContent ? <RegenerateIcon size={15} strokeWidth={2} /> :
                <PlayIcon size={15} strokeWidth={2} />
              }
              style={{
                background: locked ? "#E4E4E7" : "#18181B",
                color: locked ? "#A1A1AA" : "white",
                fontSize: 14, fontWeight: 600,
                cursor: locked ? "not-allowed" : "pointer",
              }}
            >
              {locked
                ? (lang === "en" ? "Locked" : "已鎖定")
                : busy
                  ? (lang === "en" ? "Generating…" : "生成中…")
                  : hasContent
                    ? (lang === "en" ? `Redo ${label.toLowerCase()}` : `重新${label}`)
                    : (lang === "en" ? `Start ${label.toLowerCase()}` : `開始${label}`)}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 2026-09-23（CJ「在看到品牌定位卡片之上，有太多按鈕了…策略總監化為一個
 * ICON。問用戶是否需要策略監測或健檢，若需要，才會啟動」）：策略總監／
 * 策略監測／策略健檢三個區塊的統一收合入口——單色線條圖示 + 文字標籤的
 * 小圓角按鈕，點下去才等於「使用者說需要」，對應區塊才真的掛載（不是
 * 只是 CSS 收合，未點開時 StrategyAlertsPanel 的查詢
 * 都不會發出）。active 狀態純用墨色深淺分，不上色——跟這個頁面其餘卡片
 * 同一套紀律。
 */
export function StrategyToolIcon({
  active, onClick, icon, label, title, count,
}: { active: boolean; onClick: () => void; icon: any; label: string;
     /** 需要比標籤講更多時（例如「上傳定位資料」要說明吃哪些格式）。預設用 label。 */
     title?: string;
     /** 2026-09-30：策略監測的未讀情報數。0／沒給就不顯示。 */
     count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
        active
          ? "bg-neutral-900 border-neutral-900 text-white"
          : "bg-white border-neutral-300 text-neutral-600 hover:border-neutral-900 hover:text-neutral-900"
      }`}
    >
      <FontAwesomeIcon icon={icon} style={{ fontSize: 12 }} />
      {label}
      {!!count && count > 0 && (
        <span className={`min-w-[18px] rounded-full px-1.5 text-[11px] leading-[18px] text-center tabular-nums ${
          active ? "bg-white text-neutral-900" : "bg-neutral-900 text-white"
        }`}>{count > 99 ? "99+" : count}</span>
      )}
    </button>
  );
}

/* ─────────────────────────── VisualNavItem ─────────────────────────── */
// Sidebar item for visual assets — shows hover-reveal + button, purple badge for 最新.
export function VisualNavItem({ label, badge, active, onClick }: {
  label: string; badge?: string; active: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center",
        padding: "4px 12px", borderRadius: 8,
        background: active ? "rgba(24,24,27,0.06)" : hovered ? "#F5F4F2" : "none",
        border: "none", cursor: "pointer",
        fontSize: 12, fontWeight: active ? 600 : 400,
        color: active ? "rgb(24,24,27)" : "rgb(15,16,21)",
        textAlign: "left", transition: "background 0.12s",
        gap: 6,
      }}
    >
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 12, fontWeight: 700, padding: "1px 6px", borderRadius: 20,
          background: "rgba(24,24,27,0.08)", color: "rgb(24,24,27)",
          flexShrink: 0,
        }}>{badge}</span>
      )}
      {hovered && (
        <span style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
          background: "rgba(24,24,27,0.08)", display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 12, color: "rgb(24,24,27)", fontWeight: 700,
        }}>+</span>
      )}
    </button>
  );
}
