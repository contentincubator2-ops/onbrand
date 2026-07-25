import { describe, expect, it } from "vitest";
import {
  getPipedreamAccounts,
  getPipedreamAppSlug,
} from "./pipedreamAccounts";

describe("getPipedreamAccounts", () => {
  const account = {
    id: "apn_test",
    name: "Test account",
    app: { name_slug: "facebook_pages" },
  };

  it("reads the current top-level array response", () => {
    expect(getPipedreamAccounts([account])).toEqual([account]);
  });

  it("keeps compatibility with the legacy data envelope", () => {
    expect(getPipedreamAccounts({ data: [account] })).toEqual([account]);
  });

  it("ignores malformed response values and account entries", () => {
    expect(getPipedreamAccounts({ data: null })).toEqual([]);
    expect(getPipedreamAccounts([null, {}, { id: 123 }, account])).toEqual([account]);
  });
});

describe("getPipedreamAppSlug", () => {
  it("reads the current Pipedream Accounts API object shape", () => {
    expect(getPipedreamAppSlug({ name_slug: "facebook_pages" })).toBe("facebook_pages");
  });

  it("keeps compatibility with legacy string responses", () => {
    expect(getPipedreamAppSlug("facebook_pages")).toBe("facebook_pages");
  });

  it("accepts SDK-style camelCase and generic slug fallbacks", () => {
    expect(getPipedreamAppSlug({ nameSlug: "linkedin" })).toBe("linkedin");
    expect(getPipedreamAppSlug({ slug: "youtube" })).toBe("youtube");
  });

  it("returns undefined when no app slug is present", () => {
    expect(getPipedreamAppSlug(undefined)).toBeUndefined();
    expect(getPipedreamAppSlug(null)).toBeUndefined();
    expect(getPipedreamAppSlug({})).toBeUndefined();
  });
});
