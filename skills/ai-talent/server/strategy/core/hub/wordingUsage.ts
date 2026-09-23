/**
 * wordingUsage — 這些用詞規範到底有沒有在作用。
 *
 * 2026-09-23 (CJ「優化這一頁」— /hub/strategy/preferred)。
 *
 * ── 這一頁原本的問題 ─────────────────────────────────────────────────
 * 「推薦用詞」跟「替換對照」用同一種卡片並排，看起來是同一種東西。它們不是，
 * 而且差別大到會影響決策：
 *
 *   推薦用詞 → 寫進**寫作指令**（generateRepPost 的 wordingPrompt）。
 *              那是「請你優先使用」，模型可以不照做，而且沒有任何地方檢查它做了沒有。
 *   替換對照 → **確定性字串替換**（complianceContract 的 applySwaps）。
 *              寫了就一定會發生，不經過模型。
 *
 * 一個是期望，一個是保證。老闆看著兩張一樣的卡，會以為十三條規則有同樣的效力。
 *
 * 那句「AI 撰寫時會優先使用這些用詞」本身沒有說謊，但它讓人以為事情到此為止。
 * 與其改寫文案改得更小心，不如**把真實數字放上去**——這個模組就是幹這個的：
 * 拿實際產出的貼文回頭量每一條規則。推薦用詞量「實際出現在幾篇裡」，替換對照
 * 量「實際觸發過幾次」。量不到的那些，就誠實顯示 0。
 *
 * ── 為什麼一定要用同一個 termPattern ─────────────────────────────────
 * 量測如果自己寫一套比對邏輯，就會跟真正執行的那套產生分歧，然後畫面上的數字
 * 變成第二個真相。所以比對一律走 complianceContract 匯出的 termPattern——
 * 它是 applySwaps 真正在用的那一個（ASCII 走字界，中日韓不走）。
 */
import { termPattern } from "../../../content/core/hub/complianceContract";
import type { HubWording } from "../../../platform/core/hub/hubStore";

/** 往回看幾篇。MySQL 的 prepared statement 不吃 `LIMIT ?`，所以是常數不是參數。 */
const WINDOW = 400;

export interface WordingUsage {
  id: number;
  /**
   * 分母：這個市場裡、**這條規則建立之後**產出的實際貼文數。
   *
   * 兩個限制都是必要的，而且都是查過資料才知道要加的：
   *
   * 1. `is_demo = 0` —— 展示用的歷史貼文是同一篇範例複製 88 份、只換掉追蹤連結
   *    （hubSeed.ts 的 backfillHistory）。拿它們當分母，每個詞不是 0/88 就是
   *    88/88，那是複製出來的假象，不是證據。看起來像數字的東西最會騙人。
   * 2. 規則建立之後 —— 昨天才加的推薦用詞，拿上個月的貼文量它，一定是 0，
   *    然後畫面說它「沒有作用」。那不是沒有作用，是還沒輪到它。
   */
  posts: number;
  /**
   * preferred：最終貼文裡出現這個詞的篇數（＝模型有沒有照做）。
   * swap：實際替換過的篇數（讀 compliance.wording，不是自己猜）。
   * banned：最終貼文裡**還出現**這個詞的篇數，應該是 0。
   */
  hits: number;
  /**
   * swap 專用：替換完之後最終貼文裡還留著原字的篇數。
   * 不是 0 就代表這組替換有洞（大小寫、字界、或被後面的規則改回來）。
   */
  leaked: number;
}

export interface WordingMeasurement {
  /** 計算範圍：最舊與最新那篇的時間，還有總篇數。 */
  window: { posts: number; from: string | null; to: string | null };
  byMarket: Record<string, number>;
  usage: Record<number, WordingUsage>;
}

/** 回頭量每一條用詞規範。 */
export async function measureWording(orgId: number, items: HubWording[]): Promise<WordingMeasurement> {
  const { q } = await import("../../../platform/core/hub/hubStore");
  // is_demo = 0：只量真的被寫出來的貼文。理由見 WordingUsage.posts 的註解。
  const rows = await q<{ market: string; caption: string; compliance: any; created_at: any }>(
    `SELECT market, caption, compliance, created_at FROM hub_posts
      WHERE org_id = ? AND is_demo = 0 ORDER BY id DESC LIMIT ${WINDOW}`,
    [orgId],
  );

  const byMarket: Record<string, number> = {};
  for (const r of rows) byMarket[r.market] = (byMarket[r.market] ?? 0) + 1;

  const times = rows.map((r) => new Date(r.created_at).getTime()).filter((n) => Number.isFinite(n));
  const window = {
    posts: rows.length,
    from: times.length ? new Date(Math.min(...times)).toISOString() : null,
    to: times.length ? new Date(Math.max(...times)).toISOString() : null,
  };

  // compliance.wording 是 applySwaps 真的套用過的那一份紀錄。用它，不要拿最終
  // 貼文有沒有出現取代字去猜——取代字本來就可能是模型自己寫的。
  const swapsApplied = rows.map((r) => {
    const c = typeof r.compliance === "string" ? safeJson(r.compliance) : r.compliance;
    const list = Array.isArray(c?.wording) ? c.wording : [];
    return new Set(list.map((w: any) => String(w?.from ?? "")));
  });

  const usage: Record<number, WordingUsage> = {};
  for (const item of items) {
    const born = new Date(item.createdAt).getTime();
    let posts = 0;
    let hits = 0;
    let leaked = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.market !== item.market) continue;
      // 規則建立之前的貼文不算 —— 它們沒有機會遵守一條還不存在的規則。
      const at = new Date(r.created_at).getTime();
      if (Number.isFinite(born) && Number.isFinite(at) && at < born) continue;
      posts++;
      const inCaption = termPattern(item.term).test(String(r.caption ?? ""));
      if (item.kind === "swap") {
        if (swapsApplied[i]?.has(item.term)) hits++;
        if (inCaption) leaked++;
      } else if (inCaption) {
        hits++;
      }
    }
    usage[item.id] = { id: item.id, posts, hits, leaked };
  }

  return { window, byMarket, usage };
}

function safeJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ── 規則之間會不會打架 ──────────────────────────────────────────────────

export type ConflictKind =
  | "preferred_also_banned"
  | "swap_target_banned"
  | "swap_from_preferred"
  | "swap_chain"
  | "duplicate_term";

export interface WordingConflict {
  kind: ConflictKind;
  market: string;
  ids: number[];
  en: string;
  zh: string;
}

/**
 * 找出互相打架的規則。
 *
 * 純函式（不碰資料庫），因為這幾條判斷是這一頁最容易寫錯也最值得測的部分。
 *
 * swap_target_banned 那條要解釋一下，它是唯一一個會真的讓貼文變成不合格的：
 * 執行順序是「檢查 → 修補 → 替換 → 再檢查一次」（generateRepPost 第 305-308 行）。
 * 替換排在修補**後面**，所以一組把禁用詞換進去的替換，最後那次檢查抓得到、
 * 但已經沒有任何修補步驟在它後面了——那篇會被標記成不合格，而不是被修好。
 */
export function findWordingConflicts(items: HubWording[]): WordingConflict[] {
  const out: WordingConflict[] = [];
  const norm = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase();

  for (const market of [...new Set(items.map((i) => i.market))]) {
    const mine = items.filter((i) => i.market === market);
    const banned = mine.filter((i) => i.kind === "banned");
    const preferred = mine.filter((i) => i.kind === "preferred");
    const swaps = mine.filter((i) => i.kind === "swap");

    for (const p of preferred) {
      const clash = banned.find((b) => norm(b.term) === norm(p.term));
      if (clash) {
        out.push({
          kind: "preferred_also_banned", market, ids: [p.id, clash.id],
          en: `“${p.term}” is both preferred and banned — the prompt tells the writer to use it and never to use it.`,
          zh: `「${p.term}」同時是推薦用詞與禁用詞——寫作指令會同時要求使用它和禁止使用它。`,
        });
      }
    }

    for (const s of swaps) {
      const target = norm(s.replacement);
      if (!target) continue;

      const bannedTarget = banned.find((b) => norm(b.term) === target);
      if (bannedTarget) {
        out.push({
          kind: "swap_target_banned", market, ids: [s.id, bannedTarget.id],
          en: `The swap writes “${s.replacement}”, which is banned. Swaps run after the repair step, so the final check flags the post instead of fixing it.`,
          zh: `這組替換會寫進「${s.replacement}」，而它是禁用詞。替換排在修補之後，所以最後那次檢查只會把那篇標記成不合格，不會修好它。`,
        });
      }

      const alsoPreferred = preferred.find((p) => norm(p.term) === norm(s.term));
      if (alsoPreferred) {
        out.push({
          kind: "swap_from_preferred", market, ids: [s.id, alsoPreferred.id],
          en: `“${s.term}” is a preferred term, but this swap replaces it — the prompt asks for a word that gets taken back out.`,
          zh: `「${s.term}」是推薦用詞，但這組替換又會把它換掉——指令要求寫的字最後會被拿走。`,
        });
      }

      // applySwaps 依序執行，所以 A→B 之後 B→C 會把 A 一路變成 C。
      const chained = swaps.find((o) => o.id !== s.id && norm(o.term) === target);
      if (chained) {
        out.push({
          kind: "swap_chain", market, ids: [s.id, chained.id],
          en: `“${s.term}” becomes “${s.replacement}”, which another swap then turns into “${chained.replacement}”. Swaps run in order, so the result is “${chained.replacement}”.`,
          zh: `「${s.term}」會變成「${s.replacement}」，然後另一組替換又把它變成「${chained.replacement}」。替換是依序執行的，所以最後的結果是「${chained.replacement}」。`,
        });
      }
    }

    // 同一種類裡出現同一個詞兩次。清單看起來沒事，但維護的人會改到其中一筆。
    const seen = new Map<string, HubWording>();
    for (const i of mine) {
      const key = `${i.kind}:${norm(i.term)}`;
      const first = seen.get(key);
      if (first) {
        out.push({
          kind: "duplicate_term", market, ids: [first.id, i.id],
          en: `“${i.term}” is listed twice. Editing one leaves the other in place.`,
          zh: `「${i.term}」重複列了兩次。改了其中一筆，另一筆還在。`,
        });
      } else {
        seen.set(key, i);
      }
    }
  }

  return out;
}
