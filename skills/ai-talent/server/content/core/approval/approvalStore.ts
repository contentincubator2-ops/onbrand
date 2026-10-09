/**
 * approvalStore — 客戶核准連結碰資料庫的部分。規則在 approvalLink.ts。
 *
 * 這裡的每一支都不看「誰登入」：免登入的客戶與登入的團隊成員走同一條寫入路徑，
 * 呼叫端（approvalRouter）負責先確認連結有效、這一篇屬於這條連結。
 */
import { TRPCError } from "@trpc/server";
import { USER_SUPPLIED_IMAGE_MODEL } from "../image/variantImageUpdate";
import {
  outputItemCaption, outputItemMedia, resolveOutputContent, updateOutputContent, type ContentSelector,
} from "../engine/outputContentEnvelope";
import {
  asDecision, decisionAfterEdit, sameCaption,
  type ApprovalAuthorType, type ApprovalDecision, type ApprovalEventKind,
} from "./approvalLink";

export interface Queryable {
  execute: (sql: string, params?: any) => Promise<any>;
}

export interface ApprovalAuthor {
  type: ApprovalAuthorType;
  name: string;
  userId: number | null;
}

export interface ApprovalItemRow {
  id: number;
  linkId: number;
  outputId: number;
  variantIndex: number;
  contentKind: string | null;
  contentIndex: number | null;
  scheduledPostId: number | null;
  decision: string;
}

export function selectorOf(row: { variantIndex?: unknown; contentKind?: unknown; contentIndex?: unknown }): ContentSelector {
  const variantIndex = Math.max(0, Math.trunc(Number(row.variantIndex ?? 0)) || 0);
  if ((row.contentKind === "planning" || row.contentKind === "public") && row.contentIndex != null) {
    return { variantIndex, contentKind: row.contentKind, contentIndex: Math.max(0, Math.trunc(Number(row.contentIndex)) || 0) };
  }
  return { variantIndex };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};
export const toIso = iso;

export interface ApprovalPostView {
  available: boolean;
  label: string;
  caption: string;
  imageUrls: string[];
  /** 這篇的圖有沒有 AI 生成的（全是用戶自己給的圖就是 false，不掛 AI 警語）。 */
  aiImages: boolean;
  videoUrl: string | null;
  cards: Array<{ headline: string; body: string; imageUrl: string | null }>;
}

/** 這篇顯示出來的圖是不是全都由用戶自己提供（輪播看每張卡，單圖看封面）。 */
function allImagesUserSupplied(item: Record<string, any>): boolean {
  const cardImages = Array.isArray(item.cards)
    ? item.cards.map((c: any) => c?.image).filter((img: any) => img && typeof img.url === "string" && img.url.trim())
    : [];
  if (cardImages.length > 0) return cardImages.every((img: any) => img.modelId === USER_SUPPLIED_IMAGE_MODEL);
  return (item.image?.modelId ?? item.imageModelId) === USER_SUPPLIED_IMAGE_MODEL;
}

/** 一篇貼文給客戶看的樣子：只有文字與素材，不帶 prompt、metadata 或任何內部欄位。 */
export function approvalPostView(content: unknown, selector: ContentSelector): ApprovalPostView {
  const empty: ApprovalPostView = { available: false, label: "", caption: "", imageUrls: [], aiImages: false, videoUrl: null, cards: [] };
  if (content == null) return empty;
  try {
    const { item } = resolveOutputContent(content, selector);
    const media = outputItemMedia(item);
    const cards = Array.isArray(item.cards)
      ? item.cards.filter((c: any) => c && typeof c === "object").map((c: any) => ({
          headline: str(c.headline ?? c.title),
          body: str(c.body ?? c.text),
          imageUrl: str(c.image?.url) || null,
        }))
      : [];
    return {
      available: true,
      label: str(item.label),
      caption: outputItemCaption(item),
      imageUrls: media.imageUrls,
      aiImages: media.imageUrls.length > 0 && !allImagesUserSupplied(item),
      videoUrl: media.videoUrl,
      cards,
    };
  } catch {
    return empty;
  }
}

export async function insertApprovalEvent(pool: Queryable, e: {
  linkId: number; itemId: number; outputId: number; kind: ApprovalEventKind; author: ApprovalAuthor;
  body?: string | null; beforeText?: string | null; afterText?: string | null;
}): Promise<number> {
  const [r]: any = await pool.execute(
    `INSERT INTO approval_events (linkId, itemId, outputId, kind, authorType, authorName, authorUserId, body, beforeText, afterText)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.linkId, e.itemId, e.outputId, e.kind, e.author.type, e.author.name, e.author.userId,
     e.body ?? null, e.beforeText ?? null, e.afterText ?? null],
  );
  return Number(r?.insertId ?? 0);
}

/**
 * 把一篇的文字換掉並留下修改前後。立即生效（CJ 定案）。
 *
 * base：對方開始改的那一版。跟現在的文字不同＝有人在他編輯期間改過，
 * 直接蓋掉會吃掉別人的修改，所以回 CONFLICT 讓他重新整理。
 */
export async function writeApprovalCaption(pool: Queryable, args: {
  ownerId: number; item: ApprovalItemRow; author: ApprovalAuthor; caption: string;
  base?: string; kind: "edit" | "restore";
}): Promise<{ changed: boolean; eventId: number | null; decision: ApprovalDecision }> {
  const { item } = args;
  const [rows]: any = await pool.execute(
    `SELECT o.content, o.metadata, o.status,
            (SELECT sp.status FROM scheduled_posts sp WHERE sp.id = ? LIMIT 1) AS spStatus
       FROM mission_outputs o JOIN missions m ON m.id = o.missionId
      WHERE o.id = ? AND m.userId = ? LIMIT 1`,
    [item.scheduledPostId ?? 0, item.outputId, args.ownerId],
  );
  const row = (rows as any[])[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "這一篇已經不在了。" });
  if (row.status === "published" || row.spStatus === "published") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "這一篇已經發布，不能再修改。" });
  }
  const selector = selectorOf(item);
  const current = outputItemCaption(resolveOutputContent(row.content, selector).item);
  if (args.base !== undefined && !sameCaption(args.base, current)) {
    throw new TRPCError({ code: "CONFLICT", message: "這一篇剛剛被更新過。請重新整理，看過最新的內容再修改。" });
  }
  const decisionNow = asDecision(item.decision);
  if (sameCaption(current, args.caption)) return { changed: false, eventId: null, decision: decisionNow };

  const updated = updateOutputContent(row.content, selector, (it) => ({ ...it, caption: args.caption }));
  // 法規合規紀錄是針對舊文字做的：文字被人改過，就標成「之後修改過」（跟成品頁手改同一條規則）。
  let md: any = null;
  try { md = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata; } catch { md = null; }
  if (item.contentKind == null && md && typeof md === "object" && Array.isArray(md.regulationCompliance)) {
    const { mergeComplianceRecord } = await import("../engine/regulationCompliance");
    md.regulationCompliance = mergeComplianceRecord(md.regulationCompliance, updated.resolved.index, null);
    await pool.execute(
      `UPDATE mission_outputs SET content = ?, metadata = ?, updatedAt = NOW() WHERE id = ?`,
      [updated.content, JSON.stringify(md), item.outputId],
    );
  } else {
    await pool.execute(`UPDATE mission_outputs SET content = ?, updatedAt = NOW() WHERE id = ?`, [updated.content, item.outputId]);
  }

  const eventId = await insertApprovalEvent(pool, {
    linkId: item.linkId, itemId: item.id, outputId: item.outputId, kind: args.kind, author: args.author,
    beforeText: current, afterText: args.caption,
  });
  const next = decisionAfterEdit(decisionNow, args.author.type);
  if (next !== decisionNow) {
    await pool.execute(`UPDATE approval_link_items SET decision = ?, decidedBy = NULL, decidedAt = NULL WHERE id = ?`, [next, item.id]);
  }
  return { changed: true, eventId, decision: next };
}

/**
 * 團隊在 app 裡改了文字（成品頁存檔）：如果這一篇正掛在有效的核准連結上，
 * 補一筆紀錄，並把客戶那邊的狀態退回待確認——他核准的是舊文字。
 *
 * rawBefore：存檔前的 mission_outputs.content，用來判斷改到的是連結上的哪一個版本。
 * 這支永遠不丟錯：紀錄寫不進去，不能讓存檔失敗。
 */
export async function recordTeamCaptionEdit(pool: Queryable, args: {
  outputId: number; rawBefore: unknown; kind: string; index: number; before: string; after: string;
  actorId: number;
}): Promise<number> {
  try {
    if (sameCaption(args.before, args.after)) return 0;
    const [rows]: any = await pool.execute(
      `SELECT i.id, i.linkId, i.outputId, i.variantIndex, i.contentKind, i.contentIndex, i.scheduledPostId, i.decision
         FROM approval_link_items i JOIN approval_links l ON l.id = i.linkId
        WHERE i.outputId = ? AND l.revokedAt IS NULL AND l.expiresAt > NOW()`,
      [args.outputId],
    );
    const hits = (rows as any[]).filter((r) => {
      try {
        const res = resolveOutputContent(args.rawBefore, selectorOf(r));
        return res.kind === args.kind && res.index === args.index;
      } catch { return false; }
    });
    if (hits.length === 0) return 0;
    const [u]: any = await pool.execute(`SELECT name, email FROM users WHERE id = ? LIMIT 1`, [args.actorId]);
    const who = (u as any[])[0];
    const author: ApprovalAuthor = { type: "team", name: String(who?.name || who?.email || "團隊").slice(0, 60), userId: args.actorId };
    for (const r of hits) {
      await insertApprovalEvent(pool, {
        linkId: Number(r.linkId), itemId: Number(r.id), outputId: args.outputId, kind: "edit", author,
        beforeText: args.before, afterText: args.after,
      });
      if (asDecision(r.decision) !== "pending") {
        await pool.execute(`UPDATE approval_link_items SET decision = 'pending', decidedBy = NULL, decidedAt = NULL WHERE id = ?`, [r.id]);
      }
    }
    return hits.length;
  } catch (e) {
    console.warn("[approval] recordTeamCaptionEdit failed", (e as Error)?.message);
    return 0;
  }
}
