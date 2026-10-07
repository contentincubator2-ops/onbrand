export type PublishProvider = "pipedream" | "bundle" | "zernio";

const KNOWN_PROVIDERS = new Set<string>(["pipedream", "bundle", "zernio"]);

/**
 * Decide which backend publishes a given platform.
 *
 * `PUBLISH_PROVIDER_<PLATFORM>` wins over the global `PUBLISH_PROVIDER` so a
 * single platform can be migrated without touching the others. Anything blank
 * or unrecognised falls back to "pipedream" — the switch must never silently
 * route traffic somewhere unexpected because of a typo.
 */
export function getPublishProvider(
  platform: string,
  env: NodeJS.ProcessEnv = process.env,
): PublishProvider {
  const perPlatform = env[`PUBLISH_PROVIDER_${platform.toUpperCase()}`]?.trim();
  const raw = (perPlatform || env.PUBLISH_PROVIDER?.trim() || "").toLowerCase();
  return KNOWN_PROVIDERS.has(raw) ? (raw as PublishProvider) : "pipedream";
}
