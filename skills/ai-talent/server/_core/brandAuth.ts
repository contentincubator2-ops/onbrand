/**
 * brandAuth — shared brand ownership guard.
 *
 * Every router that needs to verify a brand belongs to the requesting user
 * should import `assertBrandOwner` from here instead of duplicating the SQL.
 */
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

/**
 * Throws FORBIDDEN if `brandId` does not belong to `userId`.
 * Import and call at the top of any procedure that accepts a brandId.
 */
export async function assertBrandOwner(userId: number, brandId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const [rows] = (await db.execute(
    sql`SELECT id FROM brands WHERE id = ${brandId} AND userId = ${userId} LIMIT 1`
  )) as any;
  if (!rows?.length)
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
}
