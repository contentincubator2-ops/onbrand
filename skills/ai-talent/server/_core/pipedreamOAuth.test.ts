import { describe, expect, it } from "vitest";
import { getPipedreamOAuthAppId } from "./pipedreamOAuth";

describe("getPipedreamOAuthAppId", () => {
  it("returns the configured Facebook custom OAuth client", () => {
    expect(getPipedreamOAuthAppId("facebook", {
      PIPEDREAM_FACEBOOK_OAUTH_APP_ID: "  oa_custom123  ",
    })).toBe("oa_custom123");
  });

  it("does not configure unrelated platforms or empty values", () => {
    expect(getPipedreamOAuthAppId("instagram", {
      PIPEDREAM_FACEBOOK_OAUTH_APP_ID: "oa_custom123",
    })).toBeUndefined();
    expect(getPipedreamOAuthAppId("facebook", {
      PIPEDREAM_FACEBOOK_OAUTH_APP_ID: " ",
    })).toBeUndefined();
  });
});
