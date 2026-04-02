import { describe, it, expect, beforeEach } from "vitest";
import { encryptAccessToken, decryptAccessToken, serializeEncryptedToken, deserializeEncryptedToken } from "./_core/tokenEncryption";

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64); // 64 hex chars = 256 bits
});

describe("encryptAccessToken", () => {
  it("returns { encrypted, iv, authTag } with correct hex format", () => {
    const result = encryptAccessToken("ya29.oauth-token-example");
    expect(result).toHaveProperty("encrypted");
    expect(result).toHaveProperty("iv");
    expect(result).toHaveProperty("authTag");
    expect(result.iv).toMatch(/^[a-f0-9]{24}$/);    // 12 bytes = 24 hex chars
    expect(result.authTag).toMatch(/^[a-f0-9]{32}$/); // 16 bytes = 32 hex chars
  });

  it("generates different IV each call (random IV)", () => {
    const r1 = encryptAccessToken("same-token");
    const r2 = encryptAccessToken("same-token");
    expect(r1.iv).not.toBe(r2.iv);
    expect(r1.encrypted).not.toBe(r2.encrypted);
  });

  it("ciphertext is not equal to plaintext", () => {
    const plain = "ya29.secret-oauth-token";
    const { encrypted } = encryptAccessToken(plain);
    expect(encrypted).not.toBe(plain);
    expect(encrypted).not.toContain(plain);
  });
});

describe("decryptAccessToken", () => {
  it("round-trip: encrypt then decrypt returns original token", () => {
    const plain = "ya29.a0AfH6SMBxxx_test_token";
    const { encrypted, iv, authTag } = encryptAccessToken(plain);
    expect(decryptAccessToken(encrypted, iv, authTag)).toBe(plain);
  });

  it("throws on tampered ciphertext (GCM integrity check)", () => {
    const { encrypted, iv, authTag } = encryptAccessToken("valid-token");
    const tampered = encrypted.slice(0, -4) + "0000";
    expect(() => decryptAccessToken(tampered, iv, authTag)).toThrow();
  });

  it("throws on wrong authTag", () => {
    const { encrypted, iv } = encryptAccessToken("valid-token");
    const badTag = "0".repeat(32);
    expect(() => decryptAccessToken(encrypted, iv, badTag)).toThrow();
  });
});

describe("serialize / deserialize", () => {
  it("serializes and deserializes correctly", () => {
    const token = encryptAccessToken("test-oauth");
    const s = serializeEncryptedToken(token);
    const d = deserializeEncryptedToken(s);
    expect(d.iv).toBe(token.iv);
    expect(d.authTag).toBe(token.authTag);
    expect(d.encrypted).toBe(token.encrypted);
  });

  it("decrypts after serialize/deserialize round-trip", () => {
    const plain = "ya29.round-trip-test";
    const s = serializeEncryptedToken(encryptAccessToken(plain));
    const { encrypted, iv, authTag } = deserializeEncryptedToken(s);
    expect(decryptAccessToken(encrypted, iv, authTag)).toBe(plain);
  });
});
