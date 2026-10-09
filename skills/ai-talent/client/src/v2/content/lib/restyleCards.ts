/**
 * restyleCards — 作品頁右欄「換個寫法」要列哪幾張任務卡、照什麼順序。純函式。
 *
 * 2026-10-09（CJ「旁邊可以找其他範本參考…應該是用任務卡，而且要先顯示用戶自訂或常用的」）。
 * 順序：這個品牌自建的 → 用戶加了星號的 → 同通路其他看得到的卡（近期爆款結構）。
 * 只列同通路、同規模的卡：把一則 FB 貼文套成 LINE 訊息或一整包企劃的結構沒有意義。
 */
import { frontCardKind } from "../../platform/lib/sourceVocabulary";
import { taskPlatformOf } from "./taskTrayClient";

export const RESTYLE_KEY_PREFIX = "card:";
/** 沒展開時先擺幾張。 */
export const RESTYLE_PREVIEW_COUNT = 3;

export type RestyleTag = "own" | "favorite" | "viral" | "aeo";

export interface RestyleCardLite {
  id: string;
  tier?: string | null;
  kind?: string | null;
  platform?: string | null;
  postType?: string | null;
  label: string;
  label_en?: string | null;
  label_zh?: string | null;
  ownCardId?: string | null;
}

export interface RestyleOption {
  /** writerDrafts 用的 key（card:<taskId>），跟換人寫的 agent key 不會撞。 */
  key: string;
  taskId: string;
  name: string;
  tag: RestyleTag;
}

export function restyleKeyOf(taskId: string): string {
  return `${RESTYLE_KEY_PREFIX}${taskId}`;
}

export function isRestyleKey(key: string | null | undefined): boolean {
  return typeof key === "string" && key.startsWith(RESTYLE_KEY_PREFIX);
}

export function restyleTagLabel(tag: RestyleTag, en: boolean): string {
  if (tag === "own") return en ? "Yours" : "自建";
  if (tag === "favorite") return en ? "Favorite" : "常用";
  if (tag === "aeo") return en ? "AI search" : "AI 搜尋";
  return en ? "Viral" : "爆款結構";
}

export function buildRestyleOptions(args: {
  /** 前台看得到的全部卡（已過 isFrontVisibleCard）。 */
  tasks: RestyleCardLite[];
  currentTaskId: string;
  /** 各通路用戶自己存過的常用清單（沒存過＝null，系統預設不算常用）。 */
  storedByPlatform: Record<string, string[] | null | undefined>;
  en: boolean;
}): RestyleOption[] {
  const { tasks, currentTaskId, storedByPlatform, en } = args;
  const current = tasks.find((t) => t.id === currentTaskId) ?? null;
  const platform = taskPlatformOf(current ?? { id: currentTaskId });
  const stored = storedByPlatform[platform] ?? [];
  const starRank = new Map(stored.map((id, i) => [id, i] as const));

  const pool = tasks.filter((t) =>
    t.id !== currentTaskId
    && taskPlatformOf(t) === platform
    && t.kind !== "squad"
    && (!current?.tier || !t.tier || t.tier === current.tier));

  const rank = (t: RestyleCardLite): [number, number] => {
    if (frontCardKind(t) === "own") return [0, starRank.get(t.id) ?? 1e6];
    if (starRank.has(t.id)) return [1, starRank.get(t.id)!];
    return [2, 0];
  };
  return pool
    .map((t, i) => ({ t, i, r: rank(t) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.i - b.i)
    .map(({ t, r }) => ({
      key: restyleKeyOf(t.id),
      taskId: t.id,
      name: (en ? t.label_en : t.label_zh) || t.label,
      // 2026-10-10：官網／YouTube／新聞稿的 AI 搜尋卡不是爆款結構，標籤不能印錯。
      tag: r[0] === 0 ? "own" : r[0] === 1 ? "favorite" : frontCardKind(t) === "aeo" ? "aeo" : "viral",
    }));
}
