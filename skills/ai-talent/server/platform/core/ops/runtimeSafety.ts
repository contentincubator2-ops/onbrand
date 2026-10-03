/**
 * Runtime safety switches for cloned environments.
 *
 * Every switch defaults to enabled so existing production behaviour is
 * unchanged. A cloned environment must explicitly set a switch to `false`
 * (or `0`/`off`/`no`) before it receives production data or credentials.
 */
export type RuntimeFeature =
  | "BACKGROUND_WORKERS_ENABLED"
  | "OUTBOUND_EMAIL_ENABLED"
  | "LIVE_BILLING_ENABLED"
  | "SOCIAL_PUBLISH_ENABLED"
  | "PROJECT_SYNC_ENABLED"
  | "STARTUP_BACKFILL_ENABLED";

const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export function isRuntimeFeatureEnabled(feature: RuntimeFeature): boolean {
  const raw = process.env[feature];
  if (raw == null || raw.trim() === "") return true;
  return !FALSE_VALUES.has(raw.trim().toLowerCase());
}

export function getDisabledRuntimeFeatures(): RuntimeFeature[] {
  const features: RuntimeFeature[] = [
    "BACKGROUND_WORKERS_ENABLED",
    "OUTBOUND_EMAIL_ENABLED",
    "LIVE_BILLING_ENABLED",
    "SOCIAL_PUBLISH_ENABLED",
    "PROJECT_SYNC_ENABLED",
    "STARTUP_BACKFILL_ENABLED",
  ];
  return features.filter((feature) => !isRuntimeFeatureEnabled(feature));
}
