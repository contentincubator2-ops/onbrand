import type { PipedreamAccountSummary } from "./pipedreamAccounts";
import { buildPipedreamProxyUrl } from "./pipedreamConnect";

export type PipedreamFacebookPage = {
  id: string;
  name: string;
  category?: string;
  access_token?: string;
};

export type PipedreamFacebookAccountProbe = {
  account: PipedreamAccountSummary;
  pages: PipedreamFacebookPage[];
  error?: string;
};

type ProbeFacebookAccountsInput = {
  apiBase: string;
  projectId: string;
  externalUserId: string;
  headers: Record<string, string>;
  accounts: PipedreamAccountSummary[];
  fields: string[];
  limit?: number;
  fetchImpl?: typeof fetch;
};

/**
 * Probe every connected Facebook account instead of trusting a single account
 * record. Pipedream creates another account record on every completed Connect
 * flow, and an older record may be stale or may not expose the selected Page.
 */
export async function probePipedreamFacebookAccounts({
  apiBase,
  projectId,
  externalUserId,
  headers,
  accounts,
  fields,
  limit = 50,
  fetchImpl = fetch,
}: ProbeFacebookAccountsInput): Promise<PipedreamFacebookAccountProbe[]> {
  const fieldList = Array.from(new Set(["id", "name", ...fields])).join(",");
  const targetUrl =
    `https://graph.facebook.com/v25.0/me/accounts?fields=${encodeURIComponent(fieldList)}&limit=${limit}`;

  return Promise.all(accounts.map(async (account) => {
    try {
      const response = await fetchImpl(
        buildPipedreamProxyUrl(
          apiBase,
          projectId,
          externalUserId,
          account.id,
          targetUrl,
        ),
        { headers, signal: AbortSignal.timeout(15_000) },
      );
      if (!response.ok) {
        const body = await response.text();
        return {
          account,
          pages: [],
          error: `HTTP ${response.status}: ${body.slice(0, 200)}`,
        };
      }

      const data = (await response.json()) as { data?: unknown };
      const pages = Array.isArray(data.data)
        ? data.data.filter(
          (page): page is PipedreamFacebookPage =>
            !!page
            && typeof page === "object"
            && typeof (page as { id?: unknown }).id === "string"
            && typeof (page as { name?: unknown }).name === "string",
        )
        : [];
      return { account, pages };
    } catch (error) {
      return {
        account,
        pages: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }));
}

export function mergePipedreamFacebookPages(
  probes: PipedreamFacebookAccountProbe[],
): PipedreamFacebookPage[] {
  const pages = new Map<string, PipedreamFacebookPage>();
  for (const probe of probes) {
    for (const page of probe.pages) {
      if (!pages.has(page.id)) pages.set(page.id, page);
    }
  }
  return [...pages.values()];
}

export function findPipedreamFacebookPage(
  probes: PipedreamFacebookAccountProbe[],
  pageId: string,
): { account: PipedreamAccountSummary; page: PipedreamFacebookPage } | undefined {
  for (const probe of probes) {
    const page = probe.pages.find((candidate) => candidate.id === pageId);
    if (page) return { account: probe.account, page };
  }
  return undefined;
}
