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
  Card, CardHeader, CardBody, CardFooter, Chip, Divider, Tooltip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSquare, faImages, faVideo, faMobileScreenButton, faFilePowerpoint,
  faNewspaper, faPodcast, faCalendarDay, faSquarePollVertical, faFile,
  faImage, faMessage, faBullseye, faBriefcase,
} from "@fortawesome/free-solid-svg-icons";

// Mirrors MethodologyCatalog's FORMAT_ICON / FORMAT_LABEL — squad cards
// across Templates / Home / Playbooks all show the same format icon to the
// right of the name. Single source of truth lives here; Catalog re-exports.
const FORMAT_ICON: Record<string, any> = {
  feed: faSquare, carousel: faImages, reel: faVideo, shorts: faVideo,
  "video-card": faVideo, watch: faVideo, "native-video": faVideo,
  story: faMobileScreenButton, live: faPodcast, article: faNewspaper,
  newsletter: faNewspaper, document: faFilePowerpoint,
  poll: faSquarePollVertical, event: faCalendarDay, community: faMessage,
  ad: faBullseye, premiere: faVideo, marketplace: faBriefcase,
  foryou: faVideo, profile: faImage,
};
const FORMAT_LABEL: Record<string, string> = {
  feed: "貼文", carousel: "輪播", reel: "短影音", shorts: "Shorts",
  "video-card": "影片卡", watch: "影片", "native-video": "原生影片",
  story: "限時動態", live: "直播", article: "長文",
  newsletter: "電子報", document: "簡報文件", poll: "投票",
  event: "活動", community: "社群貼文", ad: "廣告",
  premiere: "首映", marketplace: "商品卡", foryou: "FYP", profile: "個人頁",
};
function formatIcon(fmt?: string | null) {
  if (!fmt) return null;
  return FORMAT_ICON[String(fmt).toLowerCase()] ?? faFile;
}
function formatLabel(fmt?: string | null) {
  if (!fmt) return null;
  return FORMAT_LABEL[String(fmt).toLowerCase()] ?? fmt;
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
      shadow="none"
      className="w-full border border-divider hover:bg-default-50 transition"
    >
      <CardHeader className="flex items-center justify-between gap-3">
        <Chip size="sm" variant="flat" color="default" className="shrink-0">
          {lk}・{tone.label}
        </Chip>
        {squad.mockup?.format && formatIcon(squad.mockup.format) && (
          <Tooltip content={formatLabel(squad.mockup.format)} placement="top">
            <FontAwesomeIcon
              icon={formatIcon(squad.mockup.format)!}
              className="text-default-400 shrink-0"
            />
          </Tooltip>
        )}
      </CardHeader>

      <CardBody className="gap-1.5 pt-1">
        <h3 className="text-medium font-semibold leading-tight line-clamp-1">
          {name}
        </h3>
        <p className="text-small text-default-500 line-clamp-2 leading-relaxed">
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
