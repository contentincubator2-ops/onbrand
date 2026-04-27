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
import { Card, Button, Chip } from "@heroui/react";

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

  return (
    <Card
      shadow="sm"
      radius="lg"
      className={[
        "relative overflow-hidden border-2 border-foreground hover:shadow-medium transition-shadow bg-content1",
        disabled && !busy ? "opacity-40 pointer-events-none" : "",
      ].join(" ")}
    >
      {/* 卡片頂部 */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0"
              style={{ background: tone.bg }}
            >
              {getInitial(nameStr)}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-lg leading-tight line-clamp-1 text-foreground">
                {nameStr}
              </h3>
              <Chip
                size="sm"
                radius="sm"
                variant="solid"
                className="mt-1 h-5 text-[0.7rem] font-semibold text-white"
                style={{ background: tone.bg }}
              >
                {lk}・{tone.label}
              </Chip>
            </div>
          </div>

          <Button
            isIconOnly
            size="sm"
            variant="light"
            radius="sm"
            onPress={onPreview}
            isDisabled={disabled}
            aria-label={lang === "en" ? "Preview workflow" : "預覽工作流"}
          >
            <EyeIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <div
            className="p-4 rounded-medium border-2 border-foreground"
            style={{ background: tone.bgTint }}
          >
            <div className="text-xs font-semibold text-default-500 mb-1">
              {labels.taglineEn} / {labels.tagline}
            </div>
            <div className="text-sm text-foreground/80 line-clamp-1">
              {taglineText || (lang === "en" ? "Not set" : "尚未設定")}
            </div>
          </div>

          <div
            className="p-4 rounded-medium border-2 border-foreground"
            style={{ background: tone.bgTint }}
          >
            <div className="text-xs font-semibold text-default-500 mb-1">
              {labels.contentEn} / {labels.content}
            </div>
            <div className="text-sm text-foreground/80 line-clamp-3 leading-snug">
              {philosophyText || (lang === "en" ? "Not set" : "尚未設定")}
            </div>
          </div>
        </div>
      </div>

      {/* 操作按鈕區 */}
      <div className="px-6 pb-6 flex gap-2">
        <Button
          color="primary"
          radius="full"
          fullWidth
          isLoading={busy}
          isDisabled={disabled || busy}
          onPress={onClick}
          className="flex-1 font-semibold text-sm"
        >
          {busy ? (lang === "en" ? "Starting…" : "建立中…") : labels.positioning}
        </Button>
        <Button
          color="primary"
          variant="bordered"
          radius="full"
          fullWidth
          isDisabled={disabled}
          onPress={onPreview}
          className="flex-1 font-semibold text-sm"
        >
          {labels.report}
        </Button>
      </div>
    </Card>
  );
}
