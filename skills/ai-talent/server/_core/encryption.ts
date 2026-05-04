/**
 * AES-256-GCM encryption for sensitive fields (OAuth tokens, API keys).
 * Key: ENCRYPTION_KEY env var (64-char hex = 32 bytes), fallback: derive from JWT_SECRET.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (key && key.length === 64) return Buffer.from(key, "hex");
  // Derive from JWT_SECRET as fallback. JWT_SECRET is validated by env.ts
  // (zod min(32) at startup), so absence here = misconfigured deployment.
  // SEC-B-01 (2026-05-04): removed `?? "default-insecure-key"` literal —
  // any code that fell through to the literal would encrypt every OAuth
  // token / API key with a constant string published in the source repo.
  // Now we throw fail-fast so the misconfig is visible immediately.
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "ENCRYPTION_KEY (64-hex) or JWT_SECRET (≥32 chars) must be set; " +
      "refusing to encrypt with a default/empty key.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

/** Encrypt plaintext → base64(iv + authTag + ciphertext) */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/** Decrypt base64-encoded value back to plaintext */
export function decrypt(encoded: string): string {
  const key = getEncryptionKey();
  const data = Buffer.from(encoded, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Returns true if the string looks like an encrypted blob */
export function isEncrypted(value: string): boolean {
  try {
    const buf = Buffer.from(value, "base64");
    return buf.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}
