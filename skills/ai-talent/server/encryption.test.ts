import { describe, it, expect } from "vitest";
import { encrypt, decrypt, isEncrypted } from "./_core/encryption";

describe("encryption", () => {
  it("encrypts and decrypts correctly", () => {
    const plain = "oauth-token-abc123";
    const enc = encrypt(plain);
    expect(decrypt(enc)).toBe(plain);
  });

  it("different plaintexts produce different ciphertexts", () => {
    expect(encrypt("tokenA")).not.toBe(encrypt("tokenB"));
  });

  it("same plaintext produces different ciphertexts (random IV)", () => {
    const t = "same-token";
    expect(encrypt(t)).not.toBe(encrypt(t));
  });

  it("isEncrypted detects encrypted blobs", () => {
    const enc = encrypt("test");
    expect(isEncrypted(enc)).toBe(true);
    expect(isEncrypted("plaintext")).toBe(false);
    expect(isEncrypted("sw-12345678")).toBe(false);
  });

  it("does not throw on malformed base64", () => {
    expect(() => isEncrypted("!!!not-base64!!!")).not.toThrow();
  });
});
