import { describe, expect, it } from "vitest";
import { friendlyError } from "./friendlyError";

describe("friendlyError", () => {
  it("passes through a short human-readable server message", () => {
    expect(friendlyError(new Error("本週額度已用完"), "fb")).toBe("本週額度已用完");
  });
  it("replaces zod / tRPC noise with the fallback", () => {
    expect(friendlyError(new Error('[{"code":"invalid_type","path":["brandId"]}]'), "fb")).toBe("fb");
    expect(friendlyError(new Error("TRPCClientError: boom"), "fb")).toBe("fb");
    expect(friendlyError(new TypeError("Failed to fetch"), "fb")).toBe("fb");
  });
  it("replaces empty or very long messages", () => {
    expect(friendlyError(undefined, "fb")).toBe("fb");
    expect(friendlyError(new Error("x".repeat(200)), "fb")).toBe("fb");
  });
});
