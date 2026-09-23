/**
 * wordingEdits — 用詞規範的變更紀錄。
 *
 * 2026-09-23 (CJ「只要寫使用詞、禁用詞，可以編輯，不需要寫為什麼。仍然要有編輯歷史」)。
 *
 * ── 為什麼沒有核准流程 ───────────────────────────────────────────────
 * 產品描述是「提案 → 核准 → 生效」，用詞不是。用詞那一頁上寫著「即時生效：
 * 業務寫的下一篇就會套用」，而那句話是真的（addWording 直接寫 hub_wording，
 * 下一次 generateRepPost 就讀得到）。硬加一道核准會讓那句承諾變成謊話，
 * 而且禁用詞最常見的使用情境就是「法務剛打電話來，現在就要擋住」。
 *
 * 所以這裡只做紀錄，不做閘門。誰、什麼時候、把哪個字怎麼了。
 *
 * ── 為什麼不寫「為什麼」 ─────────────────────────────────────────────
 * CJ 的決定：欄位只有詞本身。理由欄在實務上會變成兩種東西——空的，或者一句
 * 「行銷部要求」。與其留一個沒人填的格子，不如讓紀錄自己回答：這個字是誰在
 * 什麼時候加的，要追的時候去問那個人。
 */
import localPool from "../../../localDb";

export type WordingAction = "added" | "edited" | "removed";

export interface WordingEdit {
  id: number;
  wordingId: number | null;
  actor: string;
  action: WordingAction;
  market: string;
  kind: string;
  term: string;
  changes: Array<{ field: string; from: string; to: string }>;
  createdAt: string;
}

/** 一次拿多少筆。MySQL 的 prepared statement 不吃 `LIMIT ?`。 */
const PAGE = 80;

export async function logWordingEdit(args: {
  orgId: number;
  wordingId: number | null;
  actor: string;
  action: WordingAction;
  market: string;
  kind: string;
  term: string;
  changes?: Array<{ field: string; from: string; to: string }>;
}): Promise<void> {
  await localPool.execute(
    `INSERT INTO hub_wording_edits (org_id, wording_id, actor, action, market, kind, term, changes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [args.orgId, args.wordingId, args.actor, args.action, args.market, args.kind, args.term,
     JSON.stringify(args.changes ?? [])],
  );
}

export async function listWordingEdits(orgId: number, market?: string): Promise<WordingEdit[]> {
  const [rows]: any = market
    ? await localPool.execute(
        `SELECT id, wording_id, actor, action, market, kind, term, changes, created_at
           FROM hub_wording_edits WHERE org_id = ? AND market = ? ORDER BY id DESC LIMIT ${PAGE}`,
        [orgId, market],
      )
    : await localPool.execute(
        `SELECT id, wording_id, actor, action, market, kind, term, changes, created_at
           FROM hub_wording_edits WHERE org_id = ? ORDER BY id DESC LIMIT ${PAGE}`,
        [orgId],
      );
  return (rows as any[]).map((r) => ({
    id: r.id,
    wordingId: r.wording_id ?? null,
    actor: r.actor,
    action: r.action,
    market: r.market,
    kind: r.kind,
    term: r.term,
    changes: typeof r.changes === "string" ? safeJson(r.changes) : (r.changes ?? []),
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/**
 * 就地修改一筆用詞，並且記下改了什麼。
 *
 * 回傳 `changed`：沒有真的變動就不寫紀錄。前後一模一樣的「變更」會把紀錄洗掉，
 * 而紀錄的價值全在於稀少——一頁都是雜訊的紀錄等於沒有紀錄。
 */
export async function editWording(args: {
  orgId: number;
  id: number;
  actor: string;
  term: string;
  replacement: string | null;
}): Promise<{ changed: boolean }> {
  const [rows]: any = await localPool.execute(
    `SELECT market, kind, term, replacement FROM hub_wording WHERE id = ? AND org_id = ? LIMIT 1`,
    [args.id, args.orgId],
  );
  const before = (rows as any[])[0];
  if (!before) throw new Error("That entry is gone — someone may have removed it.");

  const term = args.term.trim();
  if (!term) throw new Error("The word can't be empty.");
  const replacement = args.replacement?.trim() || null;

  const changes: Array<{ field: string; from: string; to: string }> = [];
  if (term !== String(before.term)) changes.push({ field: "term", from: String(before.term), to: term });
  if ((replacement ?? "") !== (before.replacement ?? "")) {
    changes.push({ field: "replacement", from: String(before.replacement ?? ""), to: replacement ?? "" });
  }
  if (!changes.length) return { changed: false };

  // 替換對照沒有取代字就不成立 —— 它的整個作用就是那個字。
  if (before.kind === "swap" && !replacement) {
    throw new Error("A swap needs the word to use instead.");
  }

  await localPool.execute(
    `UPDATE hub_wording SET term = ?, replacement = ? WHERE id = ? AND org_id = ?`,
    [term, replacement, args.id, args.orgId],
  );
  await logWordingEdit({
    orgId: args.orgId,
    wordingId: args.id,
    actor: args.actor,
    action: "edited",
    market: String(before.market),
    kind: String(before.kind),
    term,
    changes,
  });
  return { changed: true };
}

function safeJson(s: string): any {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
