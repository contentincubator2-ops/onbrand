type PublishPlatform = "facebook" | "instagram" | "linkedin" | "threads";
type Connections = Record<PublishPlatform, { connected: boolean; accountName: string | null }>;

/** Pass connections only after the query succeeds; unknown state must not prompt a connection. */
export function shouldShowConnectHint(platform: string | null | undefined, connections: Connections | null | undefined): boolean {
  const normalized = platform === "fb" ? "facebook" : platform === "ig" ? "instagram" : platform === "li" ? "linkedin" : platform;
  if (normalized !== "facebook" && normalized !== "instagram" && normalized !== "linkedin" && normalized !== "threads") return false;
  return connections?.[normalized]?.connected === false;
}
