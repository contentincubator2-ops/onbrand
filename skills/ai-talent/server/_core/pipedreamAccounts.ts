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
 * Pipedream's current Accounts API returns `app` as an object whose slug is in
 * `app.name_slug`. Older responses returned the slug directly as a string.
 * Accept both shapes so existing accounts keep working across API versions.
 */
export function getPipedreamAppSlug(app: PipedreamAccountApp | undefined): string | undefined {
  if (typeof app === "string") return app || undefined;
  if (!app || typeof app !== "object") return undefined;
  return app.name_slug ?? app.nameSlug ?? app.slug ?? undefined;
}
