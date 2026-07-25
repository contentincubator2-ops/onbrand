import { describe, expect, it } from "vitest";
import { getPipedreamAppSlug } from "./pipedreamAccounts";

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
