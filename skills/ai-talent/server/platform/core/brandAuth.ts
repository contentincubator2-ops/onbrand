/**
 * brandAuth — shared brand ownership guard.
 *
 * Every router that needs to verify a brand belongs to the requesting user
 * should import `assertBrandOwner` from here instead of duplicating the SQL.
 */
import { TRPCError } from "@trpc/server";
import { getDb } from "../../db";
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

/**
 * Throws NOT_FOUND unless the user owns the brand or belongs to it through
 * brand_members. Use this for tenant-scoped integrations shared by a team.
 */
export async function assertBrandAccess(userId: number, brandId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const [rows] = (await db.execute(
    sql`SELECT b.id
        FROM brands b
        LEFT JOIN brand_members bm
          ON bm.brandId = b.id AND bm.userId = ${userId}
        WHERE b.id = ${brandId}
          AND (b.userId = ${userId} OR bm.userId IS NOT NULL)
        LIMIT 1`
  )) as any;
  if (!rows?.length)
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
}
