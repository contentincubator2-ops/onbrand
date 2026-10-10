/**
 * canvaOutputImage — 「在 Canva 編輯」回來後，把帶回來的圖寫進貼文的那一格。
 *
 * 來回的流程（開設計、匯出、存進素材庫）在策略層的 canvaEdit.ts；寫進貼文是內容層的事，
 * 所以這一段放在這裡，由組裝層（server/routers/index.ts）用 registerCanvaOutputWriter 接上。
 */
import localPool from "../../../localDb";
import type { CanvaOutputWriter } from "../../../strategy/core/brand/canvaEdit";
import { updateOutputContent } from "../engine/outputContentEnvelope";
import { applyVariantImageUpdate, USER_SUPPLIED_IMAGE_MODEL } from "./variantImageUpdate";

/** 把一張用戶自己的圖存成某一篇某一格的圖（前一張留版本可切回）。跟 output.updateVariantImage 同一段邏輯。 */
export const setOutputOwnImage: CanvaOutputWriter = async (args, pool = localPool) => {
  const [rows]: any = await pool.execute(
    `SELECT o.content FROM mission_outputs o JOIN missions m ON m.id = o.missionId WHERE o.id = ? AND m.userId = ? LIMIT 1`,
    [args.outputId, args.ownerId],
  );
  const row = (rows as any[])[0];
  if (!row) return false;
  const input = { ...args.locator, imageUrl: args.imageUrl, modelId: USER_SUPPLIED_IMAGE_MODEL, requestedModelId: USER_SUPPLIED_IMAGE_MODEL };
  const updated = updateOutputContent(row.content, args.locator, (item) => applyVariantImageUpdate(item, input as any));
  await pool.execute(`UPDATE mission_outputs SET content = ?, updatedAt = NOW() WHERE id = ?`, [updated.content, args.outputId]);
  return true;
};
