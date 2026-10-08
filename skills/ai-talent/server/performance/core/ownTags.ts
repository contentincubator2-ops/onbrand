import type { Queryable } from "../../platform/core/connectors/publish/connectionStore";

/** OnBrand 發布的原生貼文 id → 產出時的 perfTags，沿用 fbPageSync 的對回方式。 */
export async function ownTagsFor(brandId: number, pool?: Queryable): Promise<{
  tags: Record<string, Record<string, string>>; ownIds: Set<string>;
}> {
  const db = pool ?? (await import("../../localDb")).default;
  const tagsByPost: Record<string, Record<string, string>> = Object.create(null);
  const ownIds = new Set<string>();
  try {
    const [rows] = await db.execute(
      `SELECT sp.externalPostId, mo.metadata
         FROM scheduled_posts sp LEFT JOIN mission_outputs mo ON mo.id = sp.outputId
        WHERE sp.brandId = ? AND sp.externalPostId IS NOT NULL`, [brandId],
    );
    for (const row of rows) {
      ownIds.add(String(row.externalPostId));
      try {
        const metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
        const tags = metadata?.perfTags;
        if (tags && typeof tags === "object" && !Array.isArray(tags)) {
          tagsByPost[String(row.externalPostId)] = Object.fromEntries(
            Object.entries(tags).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
          );
        }
      } catch { /* 單筆舊 metadata 壞掉，不影響其他貼文。 */ }
    }
  } catch { /* 跟 fbPageSync 一樣，沒有產出資料表仍可回填。 */ }
  return { tags: tagsByPost, ownIds };
}
