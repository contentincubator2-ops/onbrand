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

async function rowsOf(query: ReturnType<typeof sql>): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const [rows] = (await db.execute(query)) as any;
  return (rows as any[]) ?? [];
}

/**
 * A product or event is reachable when the caller created it, or when it hangs
 * under a brand the caller can access (team members work on the owner's rows).
 */
async function assertChildAccess(userId: number, table: "products" | "events", id: number, label: string): Promise<void> {
  const rows = await rowsOf(
    table === "products"
      ? sql`SELECT userId, brandId FROM products WHERE id = ${id} LIMIT 1`
      : sql`SELECT userId, brandId FROM events WHERE id = ${id} LIMIT 1`,
  );
  const row = rows[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: `${label} not found` });
  if (Number(row.userId) === userId) return;
  if (row.brandId != null) {
    try {
      await assertBrandAccess(userId, Number(row.brandId));
      return;
    } catch { /* fall through to NOT_FOUND below */ }
  }
  throw new TRPCError({ code: "NOT_FOUND", message: `${label} not found` });
}

export const assertProductAccess = (userId: number, productId: number) =>
  assertChildAccess(userId, "products", productId, "Product");
export const assertEventAccess = (userId: number, eventId: number) =>
  assertChildAccess(userId, "events", eventId, "Event");

/**
 * Guard for procedures that take a brand / product / event scope from the
 * client and feed it to buildBrandPrefix / buildBrandBrain, which load by id
 * with no user filter. Absent or non-positive ids are skipped.
 */
export async function assertScopeAccess(
  userId: number,
  scope: { brandId?: number | null; productId?: number | null; eventId?: number | null },
): Promise<void> {
  const pos = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
  if (pos(scope.brandId)) await assertBrandAccess(userId, scope.brandId);
  if (pos(scope.productId)) await assertProductAccess(userId, scope.productId);
  if (pos(scope.eventId)) await assertEventAccess(userId, scope.eventId);
}

/** Throws NOT_FOUND unless the mission was created by `userId`. */
export async function assertMissionOwner(userId: number, missionId: number): Promise<void> {
  const rows = await rowsOf(sql`SELECT id FROM missions WHERE id = ${missionId} AND userId = ${userId} LIMIT 1`);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Mission not found" });
}
