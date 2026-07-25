import { describe, expect, it } from "vitest";
import { createBundleSocialClient, isBundleMissingTeamError } from "./bundleSocial";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

/** Record every request the client makes and reply with a canned response. */
function stubFetch(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Call[] = [];
  let index = 0;

  const fetchImpl = (async (input: any, init: any = {}) => {
    const { status = 200, body } = responses[index++] ?? { body: {} };
    calls.push({
      url: String(input),
      method: init.method ?? "GET",
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    };
  }) as unknown as typeof fetch;

  return { calls, fetchImpl };
}

function client(stub: { fetchImpl: typeof fetch }) {
  return createBundleSocialClient({ apiKey: "pk_test_123", fetchImpl: stub.fetchImpl });
}

describe("isBundleMissingTeamError", () => {
  it("recognises a team that was deleted outside OnBrand", () => {
    expect(isBundleMissingTeamError(new Error("bundle.social 404: No team found"))).toBe(true);
    expect(isBundleMissingTeamError(new Error("bundle.social 404: no team found"))).toBe(true);
  });

  it("does not swallow unrelated failures", () => {
    expect(isBundleMissingTeamError(new Error("bundle.social 500: boom"))).toBe(false);
    expect(isBundleMissingTeamError(new Error("bundle.social 404: No upload found"))).toBe(false);
    expect(isBundleMissingTeamError("not an error")).toBe(false);
    expect(isBundleMissingTeamError(undefined)).toBe(false);
  });
});

describe("createBundleSocialClient", () => {
  it("creates a team through the documented endpoint with the API key header", async () => {
    const stub = stubFetch([{ body: { id: "team_abc", name: "OnBrand #2958" } }]);

    const team = await client(stub).createTeam("OnBrand #2958");

    expect(team.id).toBe("team_abc");
    expect(stub.calls[0]!.url).toBe("https://api.bundle.social/api/v1/team/");
    expect(stub.calls[0]!.method).toBe("POST");
    expect(stub.calls[0]!.headers["x-api-key"]).toBe("pk_test_123");
    expect(stub.calls[0]!.body).toEqual({ name: "OnBrand #2958" });
  });

  it("creates a portal link carrying the requested platforms", async () => {
    const stub = stubFetch([{ body: { url: "https://bundle.social/connect?token=x" } }]);

    const link = await client(stub).createPortalLink({
      teamId: "team_abc",
      socialAccountTypes: ["FACEBOOK"],
      redirectUrl: "https://onbrand.sowork.ai/calendar?b=2958",
      expiresIn: 30,
    });

    expect(link.url).toBe("https://bundle.social/connect?token=x");
    expect(stub.calls[0]!.url).toBe("https://api.bundle.social/api/v1/social-account/create-portal-link");
    expect(stub.calls[0]!.body).toEqual({
      teamId: "team_abc",
      socialAccountTypes: ["FACEBOOK"],
      redirectUrl: "https://onbrand.sowork.ai/calendar?b=2958",
      expiresIn: 30,
    });
  });

  it("looks up a connected account by team and type", async () => {
    const stub = stubFetch([{ body: { id: "sa_1", type: "FACEBOOK", channels: [{ id: "ch_1" }] } }]);

    const account = await client(stub).getSocialAccount({ teamId: "team_abc", type: "FACEBOOK" });

    expect(account?.id).toBe("sa_1");
    expect(stub.calls[0]!.url).toBe(
      "https://api.bundle.social/api/v1/social-account/by-type?teamId=team_abc&type=FACEBOOK",
    );
    expect(stub.calls[0]!.method).toBe("GET");
  });

  it("treats a missing connection as null rather than an error", async () => {
    const stub = stubFetch([{ status: 404, body: { message: "not found" } }]);

    await expect(
      client(stub).getSocialAccount({ teamId: "team_abc", type: "FACEBOOK" }),
    ).resolves.toBeNull();
  });

  it("surfaces the API status and message when a call fails", async () => {
    const stub = stubFetch([{ status: 500, body: { message: "boom" } }]);

    await expect(client(stub).createTeam("OnBrand #2958"))
      .rejects.toThrow(/500.*boom/);
  });

  it("registers remote media and returns the upload id", async () => {
    const stub = stubFetch([{ body: { id: "upload_abc" } }]);

    const upload = await client(stub).uploadFromUrl({
      teamId: "team_abc",
      url: "https://cdn.example.com/a.jpg",
    });

    expect(upload.id).toBe("upload_abc");
    expect(stub.calls[0]!.url).toBe("https://api.bundle.social/api/v1/upload/from-url");
    expect(stub.calls[0]!.body).toEqual({ teamId: "team_abc", url: "https://cdn.example.com/a.jpg" });
  });

  it("creates a post and returns the platform result", async () => {
    const stub = stubFetch([{
      body: {
        id: "post_1",
        status: "SCHEDULED",
        externalData: { FACEBOOK: { id: "123_456", permalink: "https://facebook.com/123_456" } },
      },
    }]);

    const post = await client(stub).createPost({
      teamId: "team_abc",
      title: "t",
      postDate: "2026-07-25T10:00:00.000Z",
      status: "SCHEDULED",
      socialAccountTypes: ["FACEBOOK"],
      data: { FACEBOOK: { type: "POST", text: "t" } },
      referenceKey: "onbrand-1",
    });

    expect(post.id).toBe("post_1");
    expect(stub.calls[0]!.url).toBe("https://api.bundle.social/api/v1/post/");
    expect(stub.calls[0]!.method).toBe("POST");
  });
});
