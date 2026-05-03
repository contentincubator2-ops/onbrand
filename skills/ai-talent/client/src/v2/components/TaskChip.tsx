/**
 * TaskChip — universal "what does this produce?" label.
 *
 * Wraps inferMockupVariant() into a Chip with the platform brand
 * icon + the task label (e.g. "Facebook 月行事曆", "Instagram Reels",
 * "YouTube 縮圖", "LinkedIn Post").
 *
 * Used on every surface where a squad / agent / skill / mission is
 * listed so the user instantly sees what they're picking.
 */
import React, { useMemo } from "react";
import { Chip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faInstagram, faFacebook, faLinkedin, faYoutube, faTiktok,
  faXTwitter, faLine, faPinterest,
} from "@fortawesome/free-brands-svg-icons";
import {
  faNewspaper, faEnvelope, faGlobe, faBullhorn,
  faLayerGroup, faHashtag, faMicrophone,
} from "@fortawesome/free-solid-svg-icons";
import {
  inferMockupVariant,
  inferMockupVariantFromAgent,
  inferMockupVariantFromSkill,
  type MockupVariant,
  type Platform,
} from "../lib/inferMockup";

const PLATFORM_ICON: Record<Platform, any> = {
  instagram:    faInstagram,
  facebook:     faFacebook,
  linkedin:     faLinkedin,
  youtube:      faYoutube,
  tiktok:       faTiktok,
  twitter:      faXTwitter,
  line:         faLine,
  pinterest:    faPinterest,
  threads:      faHashtag,
  podcast:      faMicrophone,
  email:        faEnvelope,
  google:       faGlobe,
  web:          faGlobe,
  press:        faNewspaper,
  deck:         faLayerGroup,
  xiaohongshu:  faBullhorn,
  generic:      faNewspaper,
};

export type TaskChipKind = "squad" | "agent" | "skill" | "mission" | "explicit";

export interface TaskChipProps {
  /** Source entity to infer variant from. For "explicit" kind, pass
   *  variant directly. */
  entity?: any;
  variant?: MockupVariant;
  kind?: TaskChipKind;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function TaskChip({
  entity, variant, kind = "squad", size = "sm", className,
}: TaskChipProps) {
  const v: MockupVariant = useMemo(() => {
    if (variant) return variant;
    if (kind === "agent")  return inferMockupVariantFromAgent(entity);
    if (kind === "skill")  return inferMockupVariantFromSkill(entity);
    // squad / mission / fallback — inferMockupVariant honors entity.mockup if present
    return inferMockupVariant(entity);
  }, [entity, variant, kind]);

  // Prefer explicit LLM-classified task label when present
  const explicitLabel: string | null = entity?.taskLabel ?? entity?.task_label_zh ?? null;
  const displayLabel = explicitLabel?.trim() || v.label;
  const isGeneric = v.platform === "generic";

  return (
    <Chip
      size={size}
      variant="flat"
      color={isGeneric ? "default" : "secondary"}
      className={className}
      startContent={<FontAwesomeIcon icon={PLATFORM_ICON[v.platform]} className="text-tiny ml-1" />}
    >
      {displayLabel}
    </Chip>
  );
}
