import { describe, expect, it, vi } from "vitest";
import {
  assessPipedreamFacebookPageAccess,
  findPipedreamFacebookPage,
  mergePipedreamFacebookPages,
  probePipedreamFacebookAccounts,
} from "./pipedreamFacebook";

const accounts = [
  { id: "apn_new", name: "New authorization" },
  { id: "apn_old", name: "Old authorization" },
];

describe("probePipedreamFacebookAccounts", () => {
  it("checks every duplicate account and keeps a later account's pages", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const accountId = new URL(String(url)).searchParams.get("account_id");
      return new Response(JSON.stringify({
        data: accountId === "apn_old"
          ? [{ id: "page_1", name: "SoWork" }]
          : [],
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const probes = await probePipedreamFacebookAccounts({
      apiBase: "https://api.pipedream.com/v1",
      projectId: "proj_test",
      externalUserId: "sowork-brand-2958",
      headers: { Authorization: "Bearer token" },
      accounts,
      fields: ["category"],
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(findPipedreamFacebookPage(probes, "page_1")).toEqual({
      account: accounts[1],
      page: { id: "page_1", name: "SoWork" },
    });
  });

  it("continues when one connected account proxy fails", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const accountId = new URL(String(url)).searchParams.get("account_id");
      if (accountId === "apn_new") {
        return new Response("expired", { status: 401 });
      }
      return new Response(JSON.stringify({
        data: [{ id: "page_1", name: "SoWork" }],
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const probes = await probePipedreamFacebookAccounts({
      apiBase: "https://api.pipedream.com/v1",
      projectId: "proj_test",
      externalUserId: "sowork-brand-2958",
      headers: { Authorization: "Bearer token" },
      accounts,
      fields: [],
      fetchImpl,
    });

    expect(probes[0]?.error).toContain("HTTP 401");
    expect(mergePipedreamFacebookPages(probes)).toEqual([
      { id: "page_1", name: "SoWork" },
    ]);
  });

  it("deduplicates the same Page returned by repeated authorizations", () => {
    expect(mergePipedreamFacebookPages([
      { account: accounts[0]!, pages: [{ id: "page_1", name: "SoWork" }] },
      { account: accounts[1]!, pages: [{ id: "page_1", name: "SoWork" }] },
    ])).toEqual([{ id: "page_1", name: "SoWork" }]);
  });

  it("marks a Page publish-ready when a later account has a usable Page token", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get("Authorization");
      return auth === "Bearer good-token"
        ? new Response(JSON.stringify({ id: "page_1", name: "SoWork" }), { status: 200 })
        : new Response(JSON.stringify({
          error: { message: "(#283) Requires pages_read_engagement permission" },
        }), { status: 400 });
    }) as unknown as typeof fetch;

    const pages = await assessPipedreamFacebookPageAccess([
      {
        account: accounts[0]!,
        pages: [{ id: "page_1", name: "SoWork", access_token: "bad-token" }],
      },
      {
        account: accounts[1]!,
        pages: [{ id: "page_1", name: "SoWork", access_token: "good-token" }],
      },
    ], fetchImpl);

    expect(pages).toEqual([{
      id: "page_1",
      name: "SoWork",
      category: undefined,
      publishReady: true,
    }]);
    expect(JSON.stringify(pages)).not.toContain("token");
  });

  it("returns a safe permission error when every Page token is missing scope", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { message: "(#283) Requires pages_read_engagement permission" },
    }), { status: 400 })) as unknown as typeof fetch;

    const pages = await assessPipedreamFacebookPageAccess([
      {
        account: accounts[0]!,
        pages: [{ id: "page_1", name: "SoWork", access_token: "bad-token" }],
      },
    ], fetchImpl);

    expect(pages[0]).toMatchObject({
      id: "page_1",
      publishReady: false,
      permissionError: "(#283) Requires pages_read_engagement permission",
    });
    expect(JSON.stringify(pages)).not.toContain("bad-token");
  });
});
