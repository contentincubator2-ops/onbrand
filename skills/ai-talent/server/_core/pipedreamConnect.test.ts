import { describe, expect, it } from "vitest";
import { getPipedreamConnectTokenUrl } from "./pipedreamConnect";

describe("getPipedreamConnectTokenUrl", () => {
  it("scopes token creation to the Pipedream project path", () => {
    expect(getPipedreamConnectTokenUrl("proj_bys056n")).toBe(
      "https://api.pipedream.com/v1/connect/proj_bys056n/tokens",
    );
  });

  it("encodes unexpected path characters", () => {
    expect(getPipedreamConnectTokenUrl("proj_test/value")).toBe(
      "https://api.pipedream.com/v1/connect/proj_test%2Fvalue/tokens",
    );
  });
});
