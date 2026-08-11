import { describe, expect, it } from "vitest";
import { isMissingTableError } from "./mysqlErrors";

describe("isMissingTableError", () => {
  it("recognizes direct MySQL code and errno forms", () => {
    expect(isMissingTableError({ code: "ER_NO_SUCH_TABLE" })).toBe(true);
    expect(isMissingTableError({ errno: 1146 })).toBe(true);
  });

  it("recognizes a missing-table error wrapped by Drizzle", () => {
    expect(isMissingTableError({
      message: "Failed query",
      cause: { code: "ER_NO_SUCH_TABLE", errno: 1146 },
    })).toBe(true);
  });

  it("does not hide transient or permission errors", () => {
    expect(isMissingTableError({ code: "ER_LOCK_DEADLOCK", errno: 1213 })).toBe(false);
    expect(isMissingTableError({ cause: { code: "ER_TABLEACCESS_DENIED_ERROR", errno: 1142 } })).toBe(false);
  });
});
