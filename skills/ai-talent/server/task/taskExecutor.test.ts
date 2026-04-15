import { describe, it, expect, vi } from "vitest";
import { validateResponse, retryWithBackoff } from "./taskExecutor";

describe("validateResponse", () => {
  it("returns true for valid JSON", () => {
    expect(validateResponse('{"thinking":"ok","publishable_content":"hello"}')).toBe(true);
  });
  it("returns true for fenced JSON block", () => {
    expect(validateResponse('```json\n{"key":"value"}\n```')).toBe(true);
  });
  it("returns false for plain text", () => {
    expect(validateResponse("just a string")).toBe(false);
  });
  it("returns false for null/undefined", () => {
    expect(validateResponse(null)).toBe(false);
    expect(validateResponse(undefined)).toBe(false);
  });
});

describe("retryWithBackoff", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await retryWithBackoff(fn, 2, 0)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("retries on failure then succeeds", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      if (++calls < 3) throw new Error("temp fail");
      return "success";
    });
    expect(await retryWithBackoff(fn, 3, 0)).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it("throws after max retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("permanent"));
    await expect(retryWithBackoff(fn, 2, 0)).rejects.toThrow("permanent");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
