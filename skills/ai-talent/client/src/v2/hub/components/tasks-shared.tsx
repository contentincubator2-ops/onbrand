/**
 * Sales Hub content layer — shared bits for the channel task tray and run page,
 * following OnBrand's PlatformTaskPage / RunPage look.
 */
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faFacebook, faInstagram, faLine, faLinkedin } from "@fortawesome/free-brands-svg-icons";
import type { MockupVariant } from "../../content/lib/inferMockup";

export type HubChannel = "facebook" | "instagram" | "linkedin" | "line";

export const CHANNEL_META: Record<HubChannel, { label: string; color: string; icon: IconDefinition; variant: MockupVariant }> = {
  facebook: { label: "Facebook", color: "#1877F2", icon: faFacebook, variant: { platform: "facebook", format: "feed", label: "Facebook post" } as MockupVariant },
  instagram: { label: "Instagram", color: "#E1306C", icon: faInstagram, variant: { platform: "instagram", format: "feed", label: "Instagram post" } as MockupVariant },
  linkedin: { label: "LinkedIn", color: "#0A66C2", icon: faLinkedin, variant: { platform: "linkedin", format: "feed", label: "LinkedIn post" } as MockupVariant },
  line: { label: "LINE", color: "#06C755", icon: faLine, variant: { platform: "line", format: "broadcast", label: "LINE message" } as MockupVariant },
};

export const isChannel = (c: string | undefined): c is HubChannel => !!c && c in CHANNEL_META;


/** The "agent" each writing skill is presented as, like OnBrand's task-card agents. */
export const SKILL_AGENTS: Record<string, { name: string; roleEn: string; roleZh: string }> = {
  "owner-pain-story": { name: "Mia", roleEn: "Story writer", roleZh: "故事寫手" },
  "market-insight": { name: "Leo", roleEn: "Insight analyst", roleZh: "洞察分析師" },
  "solution-spotlight": { name: "Ivy", roleEn: "Product specialist", roleZh: "產品專員" },
  "subsidy-explainer": { name: "Ken", roleEn: "Subsidy advisor", roleZh: "補助顧問" },
  "ai-myth-buster": { name: "Nora", roleEn: "AI explainer", roleZh: "AI 解說員" },
  "event-invite": { name: "Ray", roleEn: "Event host", roleZh: "活動主持" },
};

export function agentFor(slug: string) {
  return SKILL_AGENTS[slug] ?? { name: "Sam", roleEn: "Copywriter", roleZh: "文案寫手" };
}

export const agentAvatar = (seed: string) =>
  `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=f5f4f2`;

/** `description:` line from a SKILL.md frontmatter. */
export function skillDescription(md: string): string {
  return md.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
}
