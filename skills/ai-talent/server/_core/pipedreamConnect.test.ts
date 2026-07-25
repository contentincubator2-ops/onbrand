import { describe, expect, it } from "vitest";
import {
  buildPipedreamAccountsUrl,
  buildPipedreamProxyUrl,
  getPipedreamConnectTokenUrl,
} from "./pipedreamConnect";

describe("Pipedream Connect URLs", () => {
  it("scopes token creation to the Pipedream project path", () => {
    expect(getPipedreamConnectTokenUrl("proj_bys056n")).toBe(
      "https://api.pipedream.com/v1/connect/proj_bys056n/tokens",
    );
  });

  it("encodes unexpected token-path characters", () => {
    expect(getPipedreamConnectTokenUrl("proj_test/value")).toBe(
      "https://api.pipedream.com/v1/connect/proj_test%2Fvalue/tokens",
    );
  });

  it("uses the project account-list endpoint and external-user filter", () => {
    const url = new URL(buildPipedreamAccountsUrl(
      "https://api.pipedream.com/v1",
      "proj_123",
      "sowork-brand-2958",
    ));

    expect(url.pathname).toBe("/v1/connect/proj_123/accounts");
    expect(url.searchParams.get("external_user_id")).toBe("sowork-brand-2958");
    expect(url.searchParams.get("limit")).toBe("50");
  });

  it("builds a URL-safe Connect Proxy request", () => {
    const target = "https://graph.facebook.com/v25.0/me/accounts?fields=id,name";
    const url = new URL(buildPipedreamProxyUrl(
      "https://api.pipedream.com/v1",
      "proj_123",
      "sowork-brand-2958",
      "apn_123",
      target,
    ));
    const encodedTarget = url.pathname.split("/").at(-1)!;

    expect(Buffer.from(encodedTarget, "base64url").toString()).toBe(target);
    expect(url.searchParams.get("account_id")).toBe("apn_123");
    expect(url.searchParams.get("external_user_id")).toBe("sowork-brand-2958");
  });
});
