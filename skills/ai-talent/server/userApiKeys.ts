/**
 * User API Key helpers
 * Generates, stores, and validates SoWork API keys.
 * Key format: "sw-<32 hex chars>"
 */

import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { userApiKeys } from "../drizzle/schema";

/**
 * Generate a new random API key in the "sw-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" format.
 */
export function generateApiKey(): string {
  return "sw-" + randomBytes(16).toString("hex");
}

/**
 * Persist a new API key for a user and return the generated key string.
 */
export async function createUserApiKey(
  userId: number,
  label?: string
): Promise<string> {
  const db = await getDb();
  const apiKey = generateApiKey();
  await db.insert(userApiKeys).values({ userId, apiKey, label: label ?? null });
  return apiKey;
}

/**
 * Validate an incoming API key.
 * Returns the associated userId on success, or null if the key is invalid / inactive.
 * Side-effect: updates lastUsed timestamp on a valid key.
 */
export async function validateApiKey(apiKey: string): Promise<number | null> {
  const db = await getDb();

  const [row] = await db
    .select()
    .from(userApiKeys)
    .where(eq(userApiKeys.apiKey, apiKey))
    .limit(1);

  if (!row || !row.isActive) return null;

  // Update lastUsed (fire-and-forget; don't block the response)
  db.update(userApiKeys)
    .set({ lastUsed: new Date() })
    .where(eq(userApiKeys.apiKey, apiKey))
    .catch((err) => console.error("[userApiKeys] lastUsed update failed:", err));

  return row.userId;
}

/**
 * Revoke (deactivate) an API key.
 * Returns true if a key was found and deactivated.
 */
export async function revokeApiKey(apiKey: string): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .update(userApiKeys)
    .set({ isActive: false })
    .where(eq(userApiKeys.apiKey, apiKey));
  return (result as any)[0]?.affectedRows > 0;
}
