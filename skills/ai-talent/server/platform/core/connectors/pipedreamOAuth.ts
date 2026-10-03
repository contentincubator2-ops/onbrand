const PLATFORM_OAUTH_APP_ENV: Record<string, string> = {
  facebook: "PIPEDREAM_FACEBOOK_OAUTH_APP_ID",
};

/**
 * Return the Pipedream custom OAuth client ID (`oa_...`) for a platform.
 *
 * Pipedream's managed Facebook Pages OAuth app can list Pages but currently
 * does not have Meta's pages_read_engagement / pages_manage_posts approval.
 * A custom Meta OAuth client is therefore required for production publishing.
 */
export function getPipedreamOAuthAppId(
  platform: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const envName = PLATFORM_OAUTH_APP_ENV[platform];
  if (!envName) return undefined;

  const value = env[envName]?.trim();
  return value || undefined;
}
