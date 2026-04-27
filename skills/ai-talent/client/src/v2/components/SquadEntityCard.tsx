/**
 * SquadEntityCard — HeroUI "Card with Divider" pattern.
 *
 * No avatar by design (per CJ): squads are abstract methodology teams,
 * not people. The header carries name + layer chip; body holds the
 * description; footer shows step / member counts.
 *
 * The whole card is pressable — clicking anywhere triggers preview.
 */
import { LAYER_TOKENS, resolveLayer } from "../../studio/primitives/tokens";
import { useLang } from "../../lib/i18n";
import { safeLocalizedText, pickLocaleText } from "../../lib/localizeText";
import {
  Card, CardHeader, CardBody, CardFooter, Chip, Divider,
} from "@heroui/react";

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

  // Prefer server-pre-computed shape (entity.listForHome) but fall back to raw squad.
  const name: string = squad.name && typeof squad.name === "string"
    ? squad.name
    : (pickLocaleText(squad.name, lang) || String(squad.slug ?? "?"));

  const subtitle: string | null = squad.subtitle ?? (() => {
    if (squad.methodology?.author) {
      const yr = squad.methodology?.year ? ` · ${squad.methodology.year}` : "";
      return `${squad.methodology.author}${yr}`;
    }
    return null;
  })();

  const description: string | null = (() => {
    if (typeof squad.description === "string" && squad.description.trim()) return squad.description;
    const localized = safeLocalizedText(squad.description, lang);
    if (localized) return localized;
    return null;
  })();

  const stats: Array<{ value: number | string; label: string }> = Array.isArray(squad.stats)
    ? squad.stats
    : (() => {
        const stepCount = Array.isArray(squad.steps) ? squad.steps.length : (squad.stepCount ?? 0);
        const memberCount = Array.isArray(squad.members) ? squad.members.length : 0;
        return [
          { value: stepCount,   label: "步驟" },
          { value: memberCount, label: "成員" },
        ].filter((s) => Number(s.value) > 0);
      })();

  return (
    <Card
      isPressable
      isHoverable
      onPress={busy || disabled ? undefined : onPreview}
      isDisabled={disabled && !busy}
      shadow="sm"
      className="w-full"
    >
      <CardHeader className="flex items-center justify-between gap-3">
        <h3 className="text-medium font-semibold leading-tight line-clamp-1">
          {name}
        </h3>
        <Chip size="sm" color={tone.heroColor} variant="flat" className="shrink-0">
          {lk}・{tone.label}
        </Chip>
      </CardHeader>

      <Divider />

      <CardBody className="gap-1.5">
        {subtitle && (
          <p className="text-tiny font-semibold uppercase tracking-wider text-default-500">
            {subtitle}
          </p>
        )}
        <p className="text-small text-default-700 line-clamp-3 leading-snug">
          {description || (lang === "en" ? "No description yet." : "尚無描述。")}
        </p>
      </CardBody>

      {stats.length > 0 && (
        <>
          <Divider />
          <CardFooter className="gap-4 text-tiny text-default-500">
            {stats.map((s, i) => (
              <span key={i}>
                <b className="text-default-700">{s.value}</b> {s.label}
              </span>
            ))}
            {busy && (
              <span className="ml-auto text-tiny text-primary">
                {lang === "en" ? "Starting…" : "啟動中…"}
              </span>
            )}
          </CardFooter>
        </>
      )}
    </Card>
  );
}
