import { describe, expect, it } from "vitest";

// tRPC throws at router construction for reserved procedure names, which tsc
// and unit tests of the handlers never notice — importing is the test.
describe("hubRouter", () => {
  it("constructs", async () => {
    const { hubRouter } = await import("./hubRouter");
    expect(Object.keys(hubRouter._def.procedures)).toEqual(
      expect.arrayContaining(["admin.overview", "admin.simulatorMenu", "rep.generate", "rep.checkDraft"]),
    );
  });
});
