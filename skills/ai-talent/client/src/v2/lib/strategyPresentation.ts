export function isStrategyReportPresentation(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  return (metadata as { presentation?: unknown }).presentation === "strategy-report";
}

const TARGET_IG_MOCKUPS: Record<string, { platform: "instagram"; format: "feed" | "story" | "live" | "document"; label: string }> = {
  "ig-99-youtility": { platform: "instagram", format: "feed", label: "instagram:feed" },
  "ig-baer-youtility": { platform: "instagram", format: "feed", label: "instagram:feed" },
  "ig-99-visual-story": { platform: "instagram", format: "story", label: "instagram:story" },
  "ig-chrisdo-visual-story": { platform: "instagram", format: "story", label: "instagram:story" },
  "ig-99-live-first": { platform: "instagram", format: "live", label: "instagram:live" },
  "ig-fanzo-live-first": { platform: "instagram", format: "live", label: "instagram:live" },
  "ig-99-document": { platform: "instagram", format: "document", label: "instagram:document" },
  "ig-garyvee-document": { platform: "instagram", format: "document", label: "instagram:document" },
  "ig-99-radical-transparency": { platform: "instagram", format: "feed", label: "instagram:feed" },
  "ig-hollis-radical-transparency": { platform: "instagram", format: "feed", label: "instagram:feed" },
};

export function getStrategyPresentationMockup(metadata: unknown, taskId?: string | null) {
  if (!isStrategyReportPresentation(metadata)) return null;
  const normalizedTaskId = String(taskId ?? "").replace(/^([a-z]+)-100-/, "$1-99-");
  if (TARGET_IG_MOCKUPS[normalizedTaskId]) return TARGET_IG_MOCKUPS[normalizedTaskId];
  return {
    platform: "generic" as const,
    format: "research-doc" as const,
    label: "generic:research-doc" as const,
  };
}
