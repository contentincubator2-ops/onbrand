/**
 * UnsupportedVariantPlaceholder — honest "coming soon" card for variants
 * we haven't built a faithful mockup for yet.
 *
 * Replaces the previous "fall through to platform default" approach,
 * which mis-rendered (e.g. FB Ad → FBFeed) and confused users about
 * what their squad would actually produce.
 *
 * Shows: platform icon · variant label · "即將推出" chip · the squad's
 * step list with their output types so the user can verify squad fit
 * regardless of mockup faithfulness.
 */
import React from "react";
import { Card, CardBody, Chip, Divider } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faInstagram, faFacebook, faLinkedin, faYoutube, faTiktok,
  faXTwitter, faLine, faPinterest, faSpotify,
} from "@fortawesome/free-brands-svg-icons";
import {
  faClock, faNewspaper, faWandMagicSparkles, faChevronRight,
  faEnvelope, faGlobe, faBullhorn, faLayerGroup,
  faHashtag, faMicrophone,
} from "@fortawesome/free-solid-svg-icons";
import type { MockupVariant, Platform } from "../../lib/inferMockup";
import type { MockupFields } from "./shared";
import { MockupHeader, MarkdownText } from "./shared";

const PLATFORM_ICON: Record<Platform, any> = {
  instagram:    faInstagram,
  facebook:     faFacebook,
  linkedin:     faLinkedin,
  youtube:      faYoutube,
  tiktok:       faTiktok,
  twitter:      faXTwitter,
  line:         faLine,
  pinterest:    faPinterest,
  threads:      faHashtag,   // Threads has no FA icon yet
  podcast:      faMicrophone,
  email:        faEnvelope,
  google:       faGlobe,
  web:          faGlobe,
  press:        faNewspaper,
  deck:         faLayerGroup,
  xiaohongshu:  faBullhorn,
  generic:      faNewspaper,
};

const PLATFORM_LABEL: Record<Platform, string> = {
  instagram:    "Instagram",
  facebook:     "Facebook",
  linkedin:     "LinkedIn",
  youtube:      "YouTube",
  tiktok:       "TikTok",
  twitter:      "X (Twitter)",
  line:         "LINE",
  pinterest:    "Pinterest",
  threads:      "Threads",
  podcast:      "Podcast",
  email:        "Email / EDM",
  google:       "Google Ads",
  web:          "官方網站",
  press:        "新聞稿 / PR",
  deck:         "簡報 Deck",
  xiaohongshu:  "小紅書",
  generic:      "通用",
};

interface Props extends MockupFields {
  variant: MockupVariant;
}

export function UnsupportedVariantPlaceholder({
  variant, steps, variantLabel, title, liveCaption,
}: Props) {
  const icon = PLATFORM_ICON[variant.platform];
  const label = PLATFORM_LABEL[variant.platform];
  /* 2026-08-20 (CJ「這功能出現製作中…而且為什麼沒有產出內容」— seen on
   * instagram:comment): the copy WAS produced, but this placeholder rendered
   * only the squad's step list, which quick tasks don't have — so the card
   * looked like a total failure. Whenever there is real produced copy, show
   * it. A missing mockup skin must never hide the deliverable. */
  const producedCopy = (liveCaption ?? "").trim();

  return (
    <div className="w-full max-w-[480px] mx-auto">
      <MockupHeader icon={icon} label={label} variantLabel={variantLabel ?? variant.label} />

      <Card shadow="lg" radius="lg" className="border-2 border-dashed border-divider">
        <CardBody className="px-6 py-10 gap-4 items-center text-center">
          <div className="relative">
            <span className="w-20 h-20 rounded-full bg-default-100 flex items-center justify-center">
              <FontAwesomeIcon icon={icon} className="text-4xl text-default-400" />
            </span>
            <Chip
              size="sm" variant="flat" color="warning"
              className="absolute -bottom-1 left-1/2 -translate-x-1/2"
              startContent={<FontAwesomeIcon icon={faClock} className="text-tiny ml-1" />}
            >
              即將推出
            </Chip>
          </div>

          <div>
            <p className="text-tiny tracking-wider uppercase text-default-500 mb-1">{label}</p>
            <h2 className="text-xl font-semibold tracking-tight">{variant.label}</h2>
            <p className="text-small text-default-500 mt-2 max-w-[380px]">
              {producedCopy
                ? "這個格式還沒有專屬的版型預覽，以下是本次實際產出的內容（可直接複製使用）。"
                : "此格式的精準預覽正在製作中。下列是這個 squad 預期會產出的內容 — 功能本身不受影響。"}
            </p>
          </div>

          {producedCopy && (
            <>
              <Divider className="w-full" />
              <div className="w-full text-left">
                <p className="text-tiny tracking-wider uppercase text-default-500 font-medium mb-2 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faWandMagicSparkles} /> 本次產出
                </p>
                <div className="rounded-medium bg-default-50 border border-divider px-3 py-2.5">
                  {title && <p className="text-tiny text-default-500 mb-1">{title}</p>}
                  <MarkdownText content={producedCopy} className="text-small text-default-800" />
                </div>
              </div>
            </>
          )}

          {steps && steps.length > 0 && (
            <>
              <Divider className="w-full" />
              <div className="w-full text-left">
                <p className="text-tiny tracking-wider uppercase text-default-500 font-medium mb-2 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faWandMagicSparkles} /> 此 squad 會產出
                </p>
                <ol className="space-y-1.5">
                  {steps.map((step, i) => {
                    const name = step.name ?? `Step ${i + 1}`;
                    const out = step.outputType ?? "";
                    const agent = step.assignedAgentName ?? "";
                    return (
                      <li key={i} className="flex items-start gap-2 text-small">
                        <Chip size="sm" variant="flat" className="tabular-nums shrink-0 h-5">
                          {String(i + 1).padStart(2, "0")}
                        </Chip>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-tight">{name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {agent && <span className="text-tiny text-default-500">{agent}</span>}
                            {out && (
                              <>
                                {agent && <FontAwesomeIcon icon={faChevronRight} className="text-tiny text-default-300" />}
                                <Chip size="sm" variant="bordered" classNames={{ base: "h-4", content: "text-tiny px-1" }}>
                                  {out}
                                </Chip>
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <p className="text-tiny text-default-400 text-center mt-3">
        想看其他格式預覽？切上方分頁試試 動態 / 輪播 / 限時動態 等支援格式。
      </p>
    </div>
  );
}
