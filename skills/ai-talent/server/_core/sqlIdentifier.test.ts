/**
 * SEC-B-07 (2026-05-04): unit test for the MySQL-identifier validator
 * inlined in squadSessionManager.ts. The regex must:
 *   - accept identifiers matching /^[A-Za-z0-9_$]{1,64}$/
 *   - reject anything containing spaces, semicolons, dashes, quotes,
 *     backticks, comments, control chars, or being >64 chars
 */
import { describe, it, expect } from "vitest";

const RE = /^[A-Za-z0-9_$]{1,64}$/;

describe("[B-07] MySQL identifier regex (squadSessionManager)", () => {
  it("accepts plain alphanumeric identifiers", () => {
    expect(RE.test("idx_mission")).toBe(true);
    expect(RE.test("uq_mission_phase")).toBe(true);
    expect(RE.test("PRIMARY")).toBe(true);
    expect(RE.test("a1_b2_c3")).toBe(true);
    expect(RE.test("$internal")).toBe(true); // $ is valid MySQL identifier
  });

  it("rejects classic SQL injection payloads", () => {
    expect(RE.test("idx_mission; DROP TABLE squads--")).toBe(false);
    expect(RE.test("a' OR '1'='1")).toBe(false);
    expect(RE.test("idx /* comment */ name")).toBe(false);
    expect(RE.test("a`b")).toBe(false);
    expect(RE.test("a\"b")).toBe(false);
  });

  it("rejects whitespace and control characters", () => {
    expect(RE.test("idx mission")).toBe(false);
    expect(RE.test("idx\tmission")).toBe(false);
    expect(RE.test("idx\nmission")).toBe(false);
    expect(RE.test("\x00bad")).toBe(false);
  });

  it("rejects unicode lookalikes (homoglyph attacks)", () => {
    expect(RE.test("idxˈmission")).toBe(false);
    expect(RE.test("idx_mіssion")).toBe(false); // Cyrillic і
  });

  it("rejects empty + over-long identifiers", () => {
    expect(RE.test("")).toBe(false);
    expect(RE.test("a".repeat(65))).toBe(false);
    expect(RE.test("a".repeat(64))).toBe(true); // exact boundary
  });

  it("rejects path traversal / file-like garbage", () => {
    expect(RE.test("../etc/passwd")).toBe(false);
    expect(RE.test("./.bashrc")).toBe(false);
  });
});
