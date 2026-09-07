/**
 * OAuth Access Token encryption using AES-256-GCM.
 * 
 * Key source: TOKEN_ENCRYPTION_KEY env var (64-char hex = 256-bit).
 * Fallback: derives from JWT_SECRET via SHA-256.
 * 
 * Design: IV and authTag are stored separately from ciphertext,
 * enabling field-level storage in DB (e.g. brandIntegrations table).
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;   // 96-bit IV — GCM standard
const KEY_LENGTH = 32;  // 256-bit key

// ─── Key Management ──────────────────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;

  if (raw) {
    if (raw.length !== 64) {
      throw new Error(
        "[tokenEncryption] TOKEN_ENCRYPTION_KEY must be exactly 64 hex chars (256 bits). " +
        `Got ${raw.length} chars.`
      );
    }
    return Buffer.from(raw, "hex");
  }

  // Fallback: deterministic key derived from JWT_SECRET
  const jwtSecret = process.env.JWT_SECRET;
  // SEC-B-01 (2026-05-04): also enforce 32-char minimum so a short / weak
  // JWT_SECRET can't be silently derived from. env.ts already validates ≥32
  // at startup, but defense in depth.
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
      "[tokenEncryption] Neither TOKEN_ENCRYPTION_KEY (64 hex) nor JWT_SECRET (≥32 chars) is set.",
    );
  }
  console.warn(
    "[tokenEncryption] TOKEN_ENCRYPTION_KEY not set — deriving key from JWT_SECRET. " +
    "Set TOKEN_ENCRYPTION_KEY in production."
  );
  return createHash("sha256").update(jwtSecret).digest(); // 32 bytes
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EncryptedToken {
  /** AES-GCM ciphertext, hex-encoded */
  encrypted: string;
  /** 96-bit initialization vector, hex-encoded */
  iv: string;
  /** 128-bit GCM authentication tag, hex-encoded */
  authTag: string;
}

// ─── Encrypt ─────────────────────────────────────────────────────────────────

/**
 * Encrypts a plain OAuth access token using AES-256-GCM.
 * Returns { encrypted, iv, authTag } — store all three fields in DB.
 *
 * @example
 * const { encrypted, iv, authTag } = encryptAccessToken(oauthToken);
 * await db.update(brandIntegrations).set({ accessToken: encrypted, tokenIv: iv, tokenAuthTag: authTag })
 */
export function encryptAccessToken(plainToken: string): EncryptedToken {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encryptedBuf = Buffer.concat([
    cipher.update(plainToken, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: encryptedBuf.toString("hex"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

// ─── Decrypt ─────────────────────────────────────────────────────────────────

/**
 * Decrypts an AES-256-GCM encrypted access token.
 * Throws if the authTag is invalid (tampered ciphertext).
 *
 * @example
 * const plain = decryptAccessToken(row.accessToken, row.tokenIv, row.tokenAuthTag);
 */
export function decryptAccessToken(
  encrypted: string,
  iv: string,
  authTag: string
): string {
  const key = getEncryptionKey();

  const ivBuf = Buffer.from(iv, "hex");
  const authTagBuf = Buffer.from(authTag, "hex");
  const encryptedBuf = Buffer.from(encrypted, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, ivBuf);
  decipher.setAuthTag(authTagBuf);

  return Buffer.concat([
    decipher.update(encryptedBuf),
    decipher.final(),
  ]).toString("utf8");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Serialize EncryptedToken to a single string for single-column storage.
 * Format: hex(iv):hex(authTag):hex(ciphertext)
 */
export function serializeEncryptedToken(token: EncryptedToken): string {
  return `${token.iv}:${token.authTag}:${token.encrypted}`;
}

/**
 * Deserialize a single-column encrypted token back to EncryptedToken.
 */
export function deserializeEncryptedToken(serialized: string): EncryptedToken {
  const [iv, authTag, encrypted] = serialized.split(":");
  if (!iv || !authTag || !encrypted) {
    throw new Error("[tokenEncryption] Invalid serialized token format");
  }
  return { iv, authTag, encrypted };
}
