/**
 * SquadEntityCard — verbatim port of sowork-ai-v2/client/src/components/EntityCard.tsx
 *
 * Source: https://github.com/sowork-dev/sowork-ai-v2/blob/main/client/src/components/EntityCard.tsx
 *
 * Adaptation rules (per CJ instruction "直接拿那個品牌卡片的模組，過來套用"):
 *   - Markup, padding, spacing, font sizes, button styles: ZERO changes
 *   - shadcn primitives (Card / Button / Badge) inlined as native div/button
 *     because Marketing-OS client doesn't have shadcn UI installed
 *   - Field mapping (the only departure from v2):
 *       v2 entity.name              → squad.name
 *       v2 colorMap[type]           → LAYER_TOKENS[resolveLayer(strategyLayer)]
 *       v2 statusInfo (狀態)         → layer label (L1·品牌策略)
 *       v2 onDelete (Trash2)        → onPreview (Eye icon)
 *       v2 entity.tagline (產品標語)  → methodology.author + year
 *       v2 entity.philosophy (品牌哲學)→ squad.description (locale-aware)
 *       v2 onViewPositioning button  → onClick (啟動小組)
 *       v2 onViewReport button       → onPreview (預覽工作流)
 *       v2 onAIAdvisor button        → DROPPED (squad has no advisor concept)
 */
import { LAYER_TOKENS, resolveLayer } from "../../studio/primitives/tokens";
import { useLang } from "../../lib/i18n";
import { safeLocalizedText, pickLocaleText } from "../../lib/localizeText";

// ── Eye icon (replaces v2's Trash2) ────────────────────────────────────────
function EyeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" className={className}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// ── Card props ─────────────────────────────────────────────────────────────
interface SquadEntityCardProps {
  squad: any;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  onPreview: () => void;
}

export function SquadEntityCard({
  squad, busy, disabled, onClick, onPreview,
}: SquadEntityCardProps) {
  const { lang } = useLang();
  const lk = resolveLayer(squad.strategyLayer);
  const tone = LAYER_TOKENS[lk];

  // ── Field mapping: tagline (v2 產品標語 → 方法論) ────────────────────────
  const formatSlug = (s: string) =>
    s.replace(/[-_]+/g, " ")
     .split(" ").filter(Boolean)
     .map((w) => /^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w)
     .join(" ");
  const taglineText = (() => {
    if (squad.methodology?.author) {
      const yr = squad.methodology?.year ? ` · ${squad.methodology.year}` : "";
      return `${squad.methodology.author}${yr}`;
    }
    const summary = squad.methodology?.summary;
    if (typeof summary === "string" && summary.trim()) {
      return formatSlug(summary.trim());
    }
    return "";
  })();

  // ── Field mapping: philosophy (v2 品牌哲學 → 描述) ───────────────────────
  const stepCount =
    Array.isArray(squad.steps) ? squad.steps.length : (squad.stepCount ?? 0);
  const memberCount =
    Array.isArray(squad.members) ? squad.members.length : 0;
  const philosophyText = (() => {
    const localized = safeLocalizedText(squad.description, lang);
    if (localized) return localized;
    const parts: string[] = [];
    if (squad.lead?.name) {
      parts.push(lang === "en"
        ? `Led by ${squad.lead.name}`
        : `由 ${squad.lead.name} 領隊`);
    }
    if (stepCount) parts.push(lang === "en"
      ? `${stepCount} workflow steps`
      : `${stepCount} 個工作步驟`);
    if (memberCount) parts.push(lang === "en"
      ? `${memberCount} specialists`
      : `${memberCount} 位成員`);
    return parts.join(lang === "en" ? " · " : "、");
  })();

  // Localized name & initial
  const nameStr = pickLocaleText(squad.name, lang) || String(squad.slug ?? "?");
  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  // i18n labels (replaces v2 entityLabels[type])
  const labels = lang === "en"
    ? { taglineEn: "METHODOLOGY", tagline: "Methodology", contentEn: "DESCRIPTION", content: "Description", positioning: "Launch Squad", report: "Preview Workflow" }
    : { taglineEn: "METHODOLOGY", tagline: "方法論",       contentEn: "DESCRIPTION", content: "描述",       positioning: "啟動小組",     report: "預覽工作流" };

  // ── v2 markup, near-verbatim ────────────────────────────────────────────
  return (
    <div
      className={[
        "relative overflow-hidden border-2 hover:shadow-lg transition-shadow rounded-lg bg-white",
        disabled && !busy ? "opacity-40 pointer-events-none" : "",
      ].join(" ")}
      style={{ borderColor: "#1A1A1A" }}
    >
      {/* 卡片頂部 */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* 實體圖標 */}
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0"
              style={{ background: tone.bg }}
            >
              {getInitial(nameStr)}
            </div>

            {/* 實體名稱和狀態 */}
            <div className="min-w-0">
              <h3 className="font-semibold text-lg leading-tight line-clamp-1">
                {nameStr}
              </h3>
              {/* v2 status badge → layer badge */}
              <span
                className="inline-flex items-center mt-1 px-2 py-0.5 rounded text-[0.7rem] font-semibold text-white"
                style={{ background: tone.bg }}
              >
                {lk}・{tone.label}
              </span>
            </div>
          </div>

          {/* 預覽按鈕（v2 原本是 Trash2 刪除位） */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPreview(); }}
            disabled={disabled}
            aria-label={lang === "en" ? "Preview workflow" : "預覽工作流"}
            className="text-gray-400 hover:text-mos-orange h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-gray-100 transition shrink-0"
          >
            <EyeIcon className="h-4 w-4" />
          </button>
        </div>

        {/* 內容區塊 */}
        <div className="space-y-4">
          {/* 標語區塊 */}
          <div
            className="p-4 rounded-lg"
            style={{ background: tone.bgTint, border: "1.5px solid #1A1A1A" }}
          >
            <div className="text-xs font-semibold text-gray-500 mb-1">
              {labels.taglineEn} / {labels.tagline}
            </div>
            <div className="text-sm text-gray-700 line-clamp-1">
              {taglineText || (lang === "en" ? "Not set" : "尚未設定")}
            </div>
          </div>

          {/* 哲學/價值主張區塊 */}
          <div
            className="p-4 rounded-lg"
            style={{ background: tone.bgTint, border: "1.5px solid #1A1A1A" }}
          >
            <div className="text-xs font-semibold text-gray-500 mb-1">
              {labels.contentEn} / {labels.content}
            </div>
            <div className="text-sm text-gray-700 line-clamp-3 leading-snug">
              {philosophyText || (lang === "en" ? "Not set" : "尚未設定")}
            </div>
          </div>
        </div>
      </div>

      {/* 操作按鈕區 */}
      <div className="px-6 pb-6 flex gap-2">
        {/* 啟動按鈕（gradient orange, v2 主 CTA） */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          disabled={disabled || busy}
          className="flex-1 text-white font-semibold text-sm px-3 py-2 transition-all hover:opacity-90 hover:-translate-y-0.5 disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, #EA580C, #F97316)",
            borderRadius: "50px",
            border: "none",
            boxShadow: "0 2px 8px rgba(234,88,12,0.25)",
          }}
        >
          {busy ? (lang === "en" ? "Starting…" : "建立中…") : labels.positioning}
        </button>

        {/* 預覽按鈕（outline orange, v2 次 CTA） */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPreview(); }}
          disabled={disabled}
          className="flex-1 font-semibold text-sm px-3 py-2 transition hover:bg-orange-50 disabled:opacity-50"
          style={{ borderRadius: "50px", border: "1.5px solid #EA580C", color: "#EA580C", background: "white" }}
        >
          {labels.report}
        </button>
      </div>
    </div>
  );
}
