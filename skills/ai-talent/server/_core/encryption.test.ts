/**
 * Unit tests for _core/encryption.ts
 * Tests: encrypt/decrypt round-trip, different ciphertexts, isEncrypted, invalid input.
 * No DB connection needed — pure crypto functions.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("encryption", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Use a fixed 32-byte (64 hex char) test key
    process.env.ENCRYPTION_KEY = "a".repeat(64);
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalEnv.ENCRYPTION_KEY;
    // Bust module cache so env changes take effect
    vi.resetModules();
  });

  it("encrypt → decrypt round-trip produces original plaintext", async () => {
    const { encrypt, decrypt } = await import("./_core/encryption");
    const plaintext = "my-secret-oauth-token-12345";
    const ciphertext = encrypt(plaintext);
    const decrypted = decrypt(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it("different plaintexts produce different ciphertexts", async () => {
    const { encrypt } = await import("./_core/encryption");
    const c1 = encrypt("tokenA");
    const c2 = encrypt("tokenB");
    expect(c1).not.toBe(c2);
  });

  it("same plaintext produces different ciphertexts (random IV)", async () => {
    const { encrypt } = await import("./_core/encryption");
    const plaintext = "same-value";
    const c1 = encrypt(plaintext);
    const c2 = encrypt(plaintext);
    // Different due to random IV
    expect(c1).not.toBe(c2);
  });

  it("isEncrypted returns true for an encrypted value", async () => {
    const { encrypt, isEncrypted } = await import("./_core/encryption");
    const ciphertext = encrypt("hello");
    expect(isEncrypted(ciphertext)).toBe(true);
  });

  it("isEncrypted returns false for a short plaintext string", async () => {
    const { isEncrypted } = await import("./_core/encryption");
    expect(isEncrypted("short")).toBe(false);
  });

  it("isEncrypted returns false for an empty string", async () => {
    const { isEncrypted } = await import("./_core/encryption");
    expect(isEncrypted("")).toBe(false);
  });

  it("decrypt throws on tampered ciphertext (auth tag mismatch)", async () => {
    const { encrypt, decrypt } = await import("./_core/encryption");
    const ciphertext = encrypt("sensitive-token");
    // Tamper: flip a character in the base64 string
    const buf = Buffer.from(ciphertext, "base64");
    buf[20] ^= 0xff; // flip bits in auth tag region
    const tampered = buf.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("does not throw on invalid base64 in isEncrypted", async () => {
    const { isEncrypted } = await import("./_core/encryption");
    // Should not throw — just return false
    expect(() => isEncrypted("!!!not-base64???")).not.toThrow();
  });

  it("falls back to JWT_SECRET derivation when ENCRYPTION_KEY is missing", async () => {
    delete process.env.ENCRYPTION_KEY;
    process.env.JWT_SECRET = "test-jwt-secret-at-least-32-characters-long";
    vi.resetModules();
    const { encrypt, decrypt } = await import("./_core/encryption");
    const plaintext = "fallback-test";
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });
});

// Need vi for resetModules — import at top-level
import { vi } from "vitest";
