const PIPEDREAM_CONNECT_API = "https://api.pipedream.com/v1/connect";

/**
 * Pipedream scopes Connect resources by project in the URL path.
 * Supplying project_id only in the JSON body is not accepted by the API.
 */
export function getPipedreamConnectTokenUrl(projectId: string): string {
  return `${PIPEDREAM_CONNECT_API}/${encodeURIComponent(projectId)}/tokens`;
}
