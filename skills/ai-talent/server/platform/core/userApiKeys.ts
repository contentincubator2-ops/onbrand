/**
 * User API Key helpers
 * Generates, stores, and validates SoWork API keys.
 * Key format: "sw-<32 hex chars>"
 *
 * SEC-2: API keys are now stored as SHA-256 hashes. Only the raw key is returned
 * at creation time — it is never persisted in plaintext.
 */

import { createHash, randomBytes } from "crypto";
import { eq, and } from "drizzle-orm";
import { getDb } from "../../db";
import { userApiKeys } from "../../../drizzle/schema";

/**
 * Hash a raw API key using SHA-256.
 */
function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Generate a new random API key in the "sw-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" format.
 */
function generateRawKey(): string {
  return "sw-" + randomBytes(16).toString("hex"); // sw-<32 hex chars>
}

/**
 * Persist a new API key for a user. Only the SHA-256 hash is stored in the DB.
 * Returns the plaintext key — this is the only time it is available.
 */
export async function createUserApiKey(
  userId: number,
  label?: string | null
): Promise<string> {
  const db = await getDb();
  const rawKey = generateRawKey();
  const keyHash = hashApiKey(rawKey);

  await db.insert(userApiKeys).values({
    userId,
    apiKey: keyHash,       // SEC-2: store hash, never plaintext
    label: label ?? null,
  });

  return rawKey; // only returned once; never stored in plaintext
}

/**
 * Validate an incoming API key by hashing it and comparing with the stored hash.
 * Returns the associated userId on success, or null if the key is invalid / inactive.
 * Side-effect: updates lastUsed timestamp on a valid key.
 */
export async function validateApiKey(rawKey: string): Promise<number | null> {
  const db = await getDb();
  const keyHash = hashApiKey(rawKey);

  const [row] = await db
    .select()
    .from(userApiKeys)
    .where(
      and(
        eq(userApiKeys.apiKey, keyHash),
        eq(userApiKeys.isActive, true)
      )
    )
    .limit(1);

  if (!row) return null;

  // Update lastUsed (fire-and-forget; don't block the response)
  db.update(userApiKeys)
    .set({ lastUsed: new Date() })
    .where(eq(userApiKeys.apiKey, keyHash))
    .catch((err) => console.error("[userApiKeys] lastUsed update failed:", err));

  return row.userId;
}

/**
 * Revoke (deactivate) an API key.
 * Accepts raw key — hashes it before lookup.
 * Returns true if a key was found and deactivated.
 */
export async function revokeApiKey(rawKey: string): Promise<boolean> {
  const db = await getDb();
  const keyHash = hashApiKey(rawKey);
  const result = await db
    .update(userApiKeys)
    .set({ isActive: false })
    .where(eq(userApiKeys.apiKey, keyHash));
  return (result as any)[0]?.affectedRows > 0;
}
