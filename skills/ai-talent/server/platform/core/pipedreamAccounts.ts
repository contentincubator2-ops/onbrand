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
  healthy?: boolean;
  dead?: boolean | null;
  created_at?: string;
  updated_at?: string;
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

/**
 * Prefer healthy, recently-created accounts when an external user has
 * authorized the same app more than once. Repeated Connect flows create
 * distinct account records, so callers must not assume the first API item is
 * always usable.
 */
export function prioritizePipedreamAccounts(
  accounts: PipedreamAccountSummary[],
): PipedreamAccountSummary[] {
  return accounts
    .map((account, index) => ({ account, index }))
    .sort((left, right) => {
      const leftHealthy = left.account.healthy === false || left.account.dead
        ? 0
        : 1;
      const rightHealthy = right.account.healthy === false || right.account.dead
        ? 0
        : 1;
      if (leftHealthy !== rightHealthy) return rightHealthy - leftHealthy;

      const leftCreated = Date.parse(left.account.created_at ?? "");
      const rightCreated = Date.parse(right.account.created_at ?? "");
      const leftTime = Number.isFinite(leftCreated) ? leftCreated : 0;
      const rightTime = Number.isFinite(rightCreated) ? rightCreated : 0;
      if (leftTime !== rightTime) return rightTime - leftTime;
      return left.index - right.index;
    })
    .map(({ account }) => account);
}
