export function isStrategyReportPresentation(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  return (metadata as { presentation?: unknown }).presentation === "strategy-report";
}

export function getStrategyPresentationMockup(metadata: unknown) {
  if (!isStrategyReportPresentation(metadata)) return null;
  return {
    platform: "generic" as const,
    format: "research-doc" as const,
    label: "generic:research-doc" as const,
  };
}
