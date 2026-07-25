const PIPEDREAM_CONNECT_API = "https://api.pipedream.com/v1/connect";

/**
 * Pipedream scopes Connect resources by project in the URL path.
 * Supplying project_id only in the JSON body is not accepted by the API.
 */
export function getPipedreamConnectTokenUrl(projectId: string): string {
  return `${PIPEDREAM_CONNECT_API}/${encodeURIComponent(projectId)}/tokens`;
}

export function buildPipedreamAccountsUrl(
  apiBase: string,
  projectId: string,
  externalUserId: string,
  limit = 50,
): string {
  const url = new URL(`${apiBase}/connect/${projectId}/accounts`);
  url.searchParams.set("external_user_id", externalUserId);
  url.searchParams.set("limit", String(limit));
  return url.toString();
}

export function buildPipedreamProxyUrl(
  apiBase: string,
  projectId: string,
  externalUserId: string,
  accountId: string,
  targetUrl: string,
): string {
  const encodedTarget = Buffer.from(targetUrl).toString("base64url");
  const url = new URL(`${apiBase}/connect/${projectId}/proxy/${encodedTarget}`);
  url.searchParams.set("external_user_id", externalUserId);
  url.searchParams.set("account_id", accountId);
  return url.toString();
}
