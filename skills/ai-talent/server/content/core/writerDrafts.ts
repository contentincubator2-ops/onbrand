/**
 * 換人寫的稿件保管（2026-09-29，CJ「按下不同 agent，本文就會改寫成不同風格」）。
 *
 * 一篇貼文只有一份「本文」（item.caption），但每一位寫過它的 agent 的稿都留在
 * item.writerDrafts[key]。換人時：
 *   1. 目前的本文（含用戶手改過的字）存回「目前那一位」的稿 —— 切回去就是原樣。
 *   2. 新那一位的稿寫進 writerDrafts，並成為本文。
 * 還沒換過人的貼文沒有 activeWriter，視為原本的主筆（LEAD_WRITER_KEY）。
 */
export const LEAD_WRITER_KEY = "lead";

export interface WriterDraft {
  name: string;
  title?: string;
  agentId?: number;
  caption: string;
  savedAt: string;
}

export interface WriterRef {
  key: string;
  name: string;
  title?: string;
  agentId?: number;
}

export function switchWriter<T extends Record<string, any>>(item: T, writer: WriterRef, caption: string, now = new Date()): T {
  const drafts: Record<string, WriterDraft> = { ...(item.writerDrafts ?? {}) };
  const prevKey = typeof item.activeWriter === "string" && item.activeWriter ? item.activeWriter : LEAD_WRITER_KEY;
  const savedAt = now.toISOString();
  const prevCaption = typeof item.caption === "string" ? item.caption : "";
  if (prevKey !== writer.key || !drafts[prevKey]) {
    const prev = drafts[prevKey];
    drafts[prevKey] = {
      name: prev?.name ?? (prevKey === LEAD_WRITER_KEY ? "" : prevKey),
      ...(prev?.title ? { title: prev.title } : {}),
      ...(prev?.agentId ? { agentId: prev.agentId } : {}),
      caption: prevCaption,
      savedAt,
    };
  }
  drafts[writer.key] = {
    name: writer.name,
    ...(writer.title ? { title: writer.title } : {}),
    ...(writer.agentId ? { agentId: writer.agentId } : {}),
    caption,
    savedAt,
  };
  return { ...item, caption, writerDrafts: drafts, activeWriter: writer.key };
}
