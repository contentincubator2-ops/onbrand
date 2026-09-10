/**
 * assign-x-agents — 替 X（x-）任務卡指派 agent。
 *
 * 2026-09-10（接在「補上 X 通路」之後）
 *
 * ── 為什麼需要這一支 ──────────────────────────────────────────────────
 * quickTaskX.ts 的 10 張卡 `agent_id` 全部留空。那不是忘記填 —— agent_id 是
 * mos_db `agents.id`，填錯會讓卡片綁到別人的人設，而那批卡是在沒有 DB 的
 * 環境寫的，驗不了 id 存不存在。留空的代價只是 UI 顯示通用頭像；填錯的代價
 * 是使用者拿到一個不是這張卡該有的口吻，而且沒有任何地方會報錯。
 *
 * 所以指派這件事必須在有 DB 的機器上跑，並且要人看過才落地。
 *
 * ── 兩條規則 ─────────────────────────────────────────────────────────
 * ① 評分重用 `matchAgents`，不另外發明一套。系統已經有一個 agent 匹配器，
 *    第二套評分只會跟它漂移（FORMAT_RULES 的教訓）。
 *
 * ② **人設不達標就不指派。** FB 貼文卡的標準是 agents.taskSystemPrompt
 *    ≥ 2200 字（見 audit-fb-agent-personas.ts / project_fb_agent_persona_standard）。
 *    X 的單推只有 280 字元，但口吻的難度不會因為字少而降低 —— 反而更高，
 *    因為沒有鋪陳的空間。達不到門檻就留空並列在報告裡，不要為了把欄位填滿
 *    而綁一個空泛人設上去。
 *
 * ── 用法 ─────────────────────────────────────────────────────────────
 *   npm run db:assign-x-agents                 # 只提案，不改檔
 *   npm run db:assign-x-agents -- --apply      # 寫回 quickTaskX.ts
 *   npm run db:assign-x-agents -- --user 1     # 指定 matchAgents 的 userId
 *   npm run db:assign-x-agents -- --show       # 連候選人的人設節錄一起印
 *
 * exit 1 的情況：有卡片找不到達標的 agent（可以當上架前的閘門），
 * 或 --apply 時寫檔失敗。
 *
 * ⚠️ 這支腳本只驗「字數」與「匹配分數」。**「按照真實人物設計」機器看不出來** ——
 * 報告會把候選人的人設印出來讓你判斷，不會假裝驗過。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { X_30S_TASKS } from "../server/content/core/quickTaskX";

/** 與 audit-fb-agent-personas.ts 同一條門檻。改要一起改。 */
const MIN_PERSONA_CHARS = 2200;

const TARGET_FILE = "server/content/core/quickTaskX.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

function labelZh(card: any): string {
  const l = card?.label;
  return typeof l === "string" ? l : String(l?.zh ?? l?.en ?? card?.id ?? "");
}

function descZh(card: any): string {
  const d = card?.description;
  return typeof d === "string" ? d : String(d?.zh ?? d?.en ?? "");
}

interface Candidate {
  id: number;
  name: string;
  title: string;
  matchScore: number;
  personaChars: number;
  personaExcerpt: string;
  passes: boolean;
}

/** 這張卡要找什麼樣的人。丟給 matchAgents 當 taskDescription。 */
function briefFor(card: any): string {
  return [
    labelZh(card),
    descZh(card),
    card.primary_question ?? "",
    card.postType === "thread"
      ? "X 討論串，5–8 則，每一則都要能單獨被轉推"
      : "X 單推，280 字元硬上限，第一行就是全部，沒有鋪陳空間",
  ].filter(Boolean).join("｜");
}

async function loadPersonas(ids: number[]): Promise<Map<number, { chars: number; excerpt: string }>> {
  const out = new Map<number, { chars: number; excerpt: string }>();
  if (!ids.length) return out;
  const { default: localPool } = await import("../server/localDb");
  const ph = ids.map(() => "?").join(",");
  const [rows]: any = await localPool.execute(
    `SELECT id, taskSystemPrompt, bio, experienceDetail FROM agents WHERE id IN (${ph})`,
    ids,
  );
  for (const r of rows as any[]) {
    // 與 FB 稽核同一套算法：人設全文＝taskSystemPrompt ＋ bio ＋ 經歷細節。
    const text = [r.taskSystemPrompt, r.bio, r.experienceDetail]
      .filter((v) => typeof v === "string")
      .join("\n");
    out.set(Number(r.id), { chars: text.length, excerpt: text.replace(/\s+/g, " ").slice(0, 220) });
  }
  return out;
}

async function candidatesFor(card: any, userId: number): Promise<Candidate[]> {
  const { matchAgents } = await import("../server/content/core/agentMatcher");
  let matches: any[] = [];
  try {
    matches = await matchAgents({
      userId,
      taskType: "social_content",
      taskDescription: briefFor(card),
      layer: "execution",
      limit: 5,
    });
  } catch (e: any) {
    console.error(`  ✗ matchAgents 失敗（${card.id}）：${String(e?.message ?? e).slice(0, 120)}`);
    return [];
  }
  const personas = await loadPersonas(matches.map((m) => Number(m.id)));
  return matches.map((m) => {
    const p = personas.get(Number(m.id)) ?? { chars: 0, excerpt: "" };
    return {
      id: Number(m.id),
      name: String(m.name ?? ""),
      title: String(m.title ?? ""),
      matchScore: Number(m.matchScore ?? 0),
      personaChars: p.chars,
      personaExcerpt: p.excerpt,
      passes: p.chars >= MIN_PERSONA_CHARS,
    };
  });
}

/**
 * 把 agent_id 寫回卡片定義。
 *
 * 錨點用每張卡都有的 `skill_slug:` 那一行 —— 它在 label/description 之後、
 * systemPrompt 之前，位置穩定。已經有 agent_id 的卡直接跳過（不覆蓋人工
 * 指派的結果）。
 */
/** 卡片定義的錨點：從 `id: "<taskId>"` 那一行找到同一張卡的 `skill_slug:`。
 *  匯出是為了讓它可以被單獨驗證 —— 寫錯不會報錯，只會靜靜失效。 */
export function anchorFor(taskId: string): RegExp {
  // 字元類別裡的 ] 與 \ 都要跳脫。這裡寫錯不會報錯，只會讓 taskId 不被跳脫，
  // 目前的 id 剛好沒有正則特殊字元 —— 也就是說錯了也看不出來，所以寫對它。
  const esc = taskId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(\\n    id: "${esc}",[\\s\\S]*?)(\\n    skill_slug:)`);
}

function applyAssignments(assignments: Map<string, Candidate>): number {
  const path = resolve(process.cwd(), TARGET_FILE);
  let src = readFileSync(path, "utf8");
  let written = 0;
  for (const [taskId, cand] of assignments) {
    const idBlock = anchorFor(taskId);
    const m = src.match(idBlock);
    if (!m) {
      console.error(`  ✗ 找不到 ${taskId} 的 skill_slug 錨點，略過`);
      continue;
    }
    if (m[1].includes("agent_id:")) continue; // 已經有了，不覆蓋
    const line = `\n    agent_id: ${cand.id}, // ${cand.name}${cand.title ? " — " + cand.title : ""}`;
    src = src.replace(idBlock, `$1${line}$2`);
    written += 1;
  }
  if (written) writeFileSync(path, src, "utf8");
  return written;
}

async function main() {
  const userId = Number(arg("user") ?? 1);
  const apply = has("apply");
  const show = has("show");

  console.log(`── X 任務卡 agent 指派（人設下限 ${MIN_PERSONA_CHARS} 字）──`);
  console.log(`卡片 ${X_30S_TASKS.length} 張 · matchAgents userId=${userId}\n`);

  const assignments = new Map<string, Candidate>();
  const unassignable: Array<{ id: string; reason: string; best?: Candidate }> = [];

  for (const card of X_30S_TASKS as any[]) {
    if (card.agent_id) {
      console.log(`⏭  ${card.id.padEnd(24)} 已指派 agent_id=${card.agent_id}，略過`);
      continue;
    }
    const cands = await candidatesFor(card, userId);
    if (!cands.length) {
      unassignable.push({ id: card.id, reason: "matchAgents 沒有回候選人" });
      console.log(`✗  ${card.id.padEnd(24)} 沒有候選人`);
      continue;
    }
    // 先看達標的，再按匹配分數。分數高但人設不達標的不選。
    const eligible = cands.filter((c) => c.passes).sort((a, b) => b.matchScore - a.matchScore);
    const best = eligible[0];
    const topOverall = [...cands].sort((a, b) => b.matchScore - a.matchScore)[0]!;

    console.log(`${best ? "✓" : "△"}  ${card.id.padEnd(24)} ${labelZh(card)}`);
    for (const c of cands) {
      const mark = c.passes ? "  " : " !";
      console.log(
        `  ${mark} ${String(c.matchScore).padStart(3)}分  ${String(c.personaChars).padStart(5)}字  ` +
        `${c.name}${c.title ? "（" + c.title + "）" : ""}${c.passes ? "" : "  ← 人設未達標"}`,
      );
      if (show && c.personaExcerpt) console.log(`        ${c.personaExcerpt}…`);
    }
    if (best) {
      assignments.set(card.id, best);
      console.log(`     → 指派 ${best.name}（id=${best.id}）`);
    } else {
      unassignable.push({ id: card.id, reason: "候選人的人設全部未達標", best: topOverall });
      console.log(`     → 不指派。分數最高的 ${topOverall.name} 只有 ${topOverall.personaChars} 字`);
    }
    console.log();
  }

  console.log("─".repeat(70));
  console.log(`可指派 ${assignments.size} 張 · 待處理 ${unassignable.length} 張`);

  if (unassignable.length) {
    console.log(`\n待處理（**不要**為了填滿欄位隨便綁一個）：`);
    for (const u of unassignable) {
      console.log(`  ${u.id.padEnd(24)} ${u.reason}${u.best ? `（最接近：${u.best.name} ${u.best.personaChars} 字）` : ""}`);
    }
    console.log(`\n處理方式二選一：`);
    console.log(`  · 把現有 agent 的 taskSystemPrompt 補到 ${MIN_PERSONA_CHARS} 字以上，並緊扣真實人物`);
    console.log(`  · 新建一個 X 專用的 agent（單推的口吻難度在「沒有鋪陳空間」，不是字少）`);
  }

  if (apply) {
    const n = applyAssignments(assignments);
    console.log(`\n✓ 已寫入 ${TARGET_FILE}：${n} 張卡加上 agent_id`);
    console.log(`  請跑一次 npx tsc --noEmit 並人工看過每一個人設是否真的適合這張卡。`);
  } else {
    console.log(`\n（只提案。要寫回 ${TARGET_FILE} 請加 --apply）`);
  }

  console.log(`\n⚠️  這支只驗字數與匹配分數。「按照真實人物設計」機器看不出來 ——`);
  console.log(`   用 --show 把人設印出來自己判斷，空泛形容詞堆到 ${MIN_PERSONA_CHARS} 字一樣是廢話。`);

  if (unassignable.length) process.exit(1);
}

// 只有被直接執行時才跑。被 import（驗證 anchorFor 用）時不要連 DB。
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/assign-x-agents.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
