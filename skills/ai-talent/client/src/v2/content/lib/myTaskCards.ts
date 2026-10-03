/**
 * myTaskCards — 「我的任務卡」總覽頁每個通路要列哪幾列。純函式，頁面只負責畫。
 *
 * 列兩種卡：常用清單裡的（照常用的順序）＋這個品牌自建但不在常用裡的（已上架的在前，
 * 還沒上架的在最後）。沒加常用的內建卡不列——那是各通路頁「看全部」的工作。
 */
import { frontCardKind, frontCardKindLabel } from "../../platform/lib/sourceVocabulary";

export interface OwnCardLite {
  id: string;
  name: string;
  channel: string;
  status: "drafting" | "ready" | "failed";
  skill?: string | null;
}

interface TaskLite {
  id: string;
  label: string;
  label_en?: string | null;
  label_zh?: string | null;
  ownCardId?: string | null;
}

export interface MyCardRow {
  id: string;
  name: string;
  favorite: boolean;
  /** 自建卡：可以改名、編輯、複製、上下架、刪除。 */
  own: boolean;
  /** 任務頁列得出來、可以直接開始寫（內建卡，或已上架的自建卡）。 */
  runnable: boolean;
  status: OwnCardLite["status"] | null;
  /** SKILL 已經有了、只差按上架。 */
  canPublish: boolean;
  kindLabel: string;
  statusLabel: string | null;
}

export function ownStatusLabel(card: Pick<OwnCardLite, "status" | "skill">, en: boolean): string | null {
  if (card.status === "ready") return null;                       // 已上架是常態，不用標
  if (card.status === "failed") return en ? "Failed to build" : "生成失敗";
  return card.skill ? (en ? "Not published" : "未上架") : (en ? "Building…" : "生成中");
}

export function buildMyCardRows(args: {
  tasks: TaskLite[];
  trayIds: string[];
  ownCards: OwnCardLite[];
  en: boolean;
}): MyCardRow[] {
  const { tasks, trayIds, ownCards, en } = args;
  const lang = en ? "en" : "zh";
  const taskById = new Map(tasks.map((t) => [t.id, t] as const));
  const ownById = new Map(ownCards.map((c) => [c.id, c] as const));
  const rows: MyCardRow[] = [];
  const seen = new Set<string>();

  for (const id of trayIds) {
    const t = taskById.get(id);
    if (!t || seen.has(id)) continue;
    seen.add(id);
    const own = ownById.get(t.ownCardId ?? id) ?? null;
    const kind = frontCardKind(t);
    rows.push({
      id,
      name: own?.name ?? ((en ? t.label_en : t.label_zh) || t.label),
      favorite: true,
      own: !!own,
      runnable: true,
      status: own ? own.status : null,
      canPublish: false,
      kindLabel: kind ? frontCardKindLabel(kind, lang) : "",
      statusLabel: null,
    });
  }

  const rest = ownCards.filter((c) => !seen.has(c.id));
  const order = (c: OwnCardLite) => (c.status === "ready" ? 0 : 1);
  for (const c of [...rest].sort((a, b) => order(a) - order(b))) {
    rows.push({
      id: c.id,
      name: c.name,
      favorite: false,
      own: true,
      // 已上架但任務清單裡找不到（例如方案降級後這個通路被關掉）就不給「開始寫」。
      runnable: c.status === "ready" && taskById.has(c.id),
      status: c.status,
      canPublish: c.status !== "ready" && !!c.skill,
      kindLabel: frontCardKindLabel("own", lang),
      statusLabel: ownStatusLabel(c, en),
    });
  }
  return rows;
}
