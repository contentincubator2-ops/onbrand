/**
 * SquadEntityCard — pure HeroUI Card, no inline styles, no custom tokens.
 * Layer color comes from LAYER_TOKENS[layer].heroColor (HeroUI semantic).
 */
import { LAYER_TOKENS, resolveLayer } from "../../studio/primitives/tokens";
import { useLang } from "../../lib/i18n";
import { safeLocalizedText, pickLocaleText } from "../../lib/localizeText";
import {
  Avatar, Button, Card, CardBody, CardFooter, CardHeader, Chip,
} from "@heroui/react";

function EyeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

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
    if (typeof summary === "string" && summary.trim()) return formatSlug(summary.trim());
    return "";
  })();

  const stepCount = Array.isArray(squad.steps) ? squad.steps.length : (squad.stepCount ?? 0);
  const memberCount = Array.isArray(squad.members) ? squad.members.length : 0;
  const philosophyText = (() => {
    const localized = safeLocalizedText(squad.description, lang);
    if (localized) return localized;
    const parts: string[] = [];
    if (squad.lead?.name) parts.push(lang === "en" ? `Led by ${squad.lead.name}` : `由 ${squad.lead.name} 領隊`);
    if (stepCount)  parts.push(lang === "en" ? `${stepCount} workflow steps` : `${stepCount} 個工作步驟`);
    if (memberCount) parts.push(lang === "en" ? `${memberCount} specialists`  : `${memberCount} 位成員`);
    return parts.join(lang === "en" ? " · " : "、");
  })();

  const nameStr = pickLocaleText(squad.name, lang) || String(squad.slug ?? "?");
  const initial = nameStr.charAt(0).toUpperCase();
  const labels = lang === "en"
    ? { tagline: "Methodology", content: "Description", positioning: "Launch Squad", report: "Preview Workflow" }
    : { tagline: "方法論",       content: "描述",        positioning: "啟動小組",     report: "預覽工作流" };

  return (
    <Card
      shadow="sm"
      isHoverable
      isDisabled={disabled && !busy}
      className="overflow-hidden"
    >
      <CardHeader className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar
            name={initial}
            color={tone.heroColor}
            radius="full"
            size="md"
            classNames={{ name: "font-bold text-base" }}
          />
          <div className="min-w-0">
            <h3 className="font-semibold text-medium leading-tight line-clamp-1">
              {nameStr}
            </h3>
            <Chip size="sm" color={tone.heroColor} variant="flat" className="mt-1">
              {lk}・{tone.label}
            </Chip>
          </div>
        </div>

        <Button
          isIconOnly
          size="sm"
          variant="light"
          onPress={onPreview}
          isDisabled={disabled}
          aria-label={lang === "en" ? "Preview workflow" : "預覽工作流"}
        >
          <EyeIcon className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardBody className="gap-3 pt-0">
        <Card shadow="none" className="bg-default-100">
          <CardBody className="py-2 px-3">
            <p className="text-tiny font-semibold uppercase tracking-wider text-default-500">
              {labels.tagline}
            </p>
            <p className="text-small line-clamp-1">
              {taglineText || (lang === "en" ? "Not set" : "尚未設定")}
            </p>
          </CardBody>
        </Card>

        <Card shadow="none" className="bg-default-100">
          <CardBody className="py-2 px-3">
            <p className="text-tiny font-semibold uppercase tracking-wider text-default-500">
              {labels.content}
            </p>
            <p className="text-small line-clamp-3 leading-snug">
              {philosophyText || (lang === "en" ? "Not set" : "尚未設定")}
            </p>
          </CardBody>
        </Card>
      </CardBody>

      <CardFooter className="gap-2">
        <Button
          color={tone.heroColor}
          fullWidth
          isLoading={busy}
          isDisabled={disabled || busy}
          onPress={onClick}
        >
          {busy ? (lang === "en" ? "Starting…" : "建立中…") : labels.positioning}
        </Button>
        <Button
          color={tone.heroColor}
          variant="bordered"
          fullWidth
          isDisabled={disabled}
          onPress={onPreview}
        >
          {labels.report}
        </Button>
      </CardFooter>
    </Card>
  );
}
