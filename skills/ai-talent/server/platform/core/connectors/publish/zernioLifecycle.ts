import { createZernioClient } from "../zernio";
import { createZernioAdapter } from "./zernioAdapter";
import type { Queryable } from "./connectionStore";

async function warn(message: string, meta: Record<string, unknown>): Promise<void> {
  try {
    const { logError } = await import("../../../routers/opsRouter");
    await logError({ source: "zernio.lifecycle", level: "warn", message, meta });
  } catch { console.warn("[zernio.lifecycle] Unable to record cleanup warning"); }
}

/** Best effort: failure must not prevent brand deletion or subscription termination. */
export async function disconnectBrand(pool: Queryable, brandId: number): Promise<void> {
  const apiKey = process.env.ZERNIO_API_KEY;
  if (!apiKey) return;
  try {
    const adapter = createZernioAdapter({ client: createZernioClient({ apiKey }), pool, brandNameOf: async () => "" });
    const result = await adapter.disconnectAll({ brandId });
    if (result.failed) await warn("品牌帳號未完全解除，請檢查仍在計費的連線。", { brandId, ...result });
  } catch {
    await warn("品牌帳號解除失敗，請檢查仍在計費的連線。", { brandId });
  }
}

export async function disconnectBrandsForOwner(pool: Queryable, owner: { userId: number; workspaceId: number | null }): Promise<void> {
  if (!process.env.ZERNIO_API_KEY) return;
  try {
    // migrate.ts creates brands.workspaceId even though the legacy Drizzle brands model omits it.
    const [brands] = await pool.execute(`SELECT id FROM brands WHERE ${owner.workspaceId != null ? "workspaceId" : "userId"} = ?`,
      [owner.workspaceId ?? owner.userId]);
    for (const brand of brands) await disconnectBrand(pool, Number(brand.id));
  } catch {
    await warn("退訂品牌連線清理失敗，請檢查仍在計費的連線。", owner);
  }
}
