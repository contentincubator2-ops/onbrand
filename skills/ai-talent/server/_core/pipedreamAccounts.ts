export type PipedreamAccountApp =
  | string
  | {
      name_slug?: string | null;
      nameSlug?: string | null;
      slug?: string | null;
    }
  | null;

export type PipedreamAccountSummary = {
  id: string;
  name?: string;
  app?: PipedreamAccountApp;
};

/**
 * Pipedream has returned both a top-level account array and a legacy
 * `{ data: [...] }` envelope from the Connect Accounts API. Normalize both
 * shapes at the boundary so callers do not silently treat valid accounts as
 * an empty list when the response format changes.
 */
export function getPipedreamAccounts(response: unknown): PipedreamAccountSummary[] {
  const candidates = Array.isArray(response)
    ? response
    : response && typeof response === "object" && Array.isArray((response as { data?: unknown }).data)
      ? (response as { data: unknown[] }).data
      : [];

  return candidates.filter(
    (candidate): candidate is PipedreamAccountSummary =>
      !!candidate
      && typeof candidate === "object"
      && typeof (candidate as { id?: unknown }).id === "string",
  );
}

/**
 * Pipedream's current Accounts API returns `app` as an object whose slug is in
 * `app.name_slug`. Older responses returned the slug directly as a string.
 * Accept both shapes so existing accounts keep working across API versions.
 */
export function getPipedreamAppSlug(app: PipedreamAccountApp | undefined): string | undefined {
  if (typeof app === "string") return app || undefined;
  if (!app || typeof app !== "object") return undefined;
  return app.name_slug ?? app.nameSlug ?? app.slug ?? undefined;
}
