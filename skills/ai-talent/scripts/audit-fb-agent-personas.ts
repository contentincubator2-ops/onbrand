/**
 * audit-fb-agent-personas — 檢查 FB 任務綁的 agent 人設是否達標。
 *
 * 2026-08-23 (CJ「每一個新增的 facebook 貼文任務，agent 的設計都要按照真實
 * 人物設計，system prompt 不少於 2200 個字」)
 *
 * 這條標準不是新發明的 —— personaAgentRouter.ts 的人設分身早就是
 * 「persona + skill 合計 ≥ 2200 字，且必須緊扣真實素材」。這支腳本把同一條
 * 標準套到 FB 任務卡綁的平台 agent（agents.taskSystemPrompt）上。
 *
 * 兩件事只有一件能自動檢查：
 *   ✅ 字數 —— 這裡驗
 *   ❌ 「按照真實人物設計」—— 機器看不出來。腳本只把人設印出來讓你判斷，
 *      不會假裝驗過。空泛形容詞（專業／親切／溫暖）堆到 2200 字一樣是廢話，
 *      過了字數不等於過了標準。
 *
 * 用法：
 *   npx tsx scripts/audit-fb-agent-personas.ts            # 全部 FB 任務
 *   npx tsx scripts/audit-fb-agent-personas.ts --posts    # 只看貼文類（feed/pinned）
 *   npx tsx scripts/audit-fb-agent-personas.ts --task fb-30-caption-short
 *   npx tsx scripts/audit-fb-agent-personas.ts --show     # 連人設全文一起印
 *
 * 未達標時 exit 1，可以直接當開卡前的閘門。
 */

import { FB_30S_TASKS, labelZh } from "../server/_core/quickTaskFB";
import { FB_60S_TASKS_V2 } from "../server/_core/quickTaskFB60";
import { ALL_99S_SQUADS } from "../server/_core/quickTask100Squads";
import { ALL_99S_TASKS } from "../server/_core/quickTask100";

/** CJ 2026-08-23：FB 貼文任務的 agent system prompt 下限。 */
export const MIN_PERSONA_CHARS = 2200;

/** 「貼文」性質的 postType —— 廣告 / 留言回覆不在這條規則的射程內。 */
const POST_TYPES = new Set(["feed", "pinned", "story"]);

interface TaskRef {
  id: string;
  label: string;
  postType: string;
  agentId: number | null;
  tier: string;
}

function textZh(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "zh" in (v as any)) return String((v as any).zh ?? "");
  return "";
}

function collectTasks(): TaskRef[] {
  const out: TaskRef[] = [];
  for (const t of FB_30S_TASKS) {
    out.push({ id: t.id, label: labelZh(t), postType: t.postType, tier: "30s", agentId: (t as any).agent_id ?? null });
  }
  for (const t of FB_60S_TASKS_V2) {
    out.push({ id: t.id, label: labelZh(t), postType: t.postType, tier: "60s", agentId: (t as any).agent_id ?? null });
  }
  for (const s of ALL_99S_SQUADS) {
    if (s.platform !== "facebook") continue;
    // squad 卡的 lead agent 在 DB 的 squads.lead_agent_id，這裡先留 null，
    // 下面用 squad_slug 去查
    out.push({ id: s.id, label: textZh(s.label), postType: s.postType, tier: "99s", agentId: null });
  }
  for (const t of ALL_99S_TASKS as any[]) {
    if (!String(t.id).startsWith("fb-")) continue;
    if (out.some((e) => e.id === t.id)) continue;
    out.push({ id: t.id, label: textZh(t.label), postType: t.postType ?? "feed", tier: "99s", agentId: t.agent_id ?? null });
  }
  return out;
}

async function resolveSquadLeads(ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const { default: localPool } = await import("../server/localDb");
  const slugs = ids.map((i) => i.replace(/^fb-99-/, "fb-"));
  const ph = slugs.map(() => "?").join(",");
  const [rows]: any = await localPool.execute(
    `SELECT slug, lead_agent_id FROM squads WHERE slug IN (${ph})`,
    slugs,
  );
  const out: Record<string, number> = {};
  for (const r of rows as any[]) {
    if (r.lead_agent_id) out[String(r.slug)] = Number(r.lead_agent_id);
  }
  return out;
}

async function main() {
  const onlyPosts = process.argv.includes("--posts");
  const show = process.argv.includes("--show");
  const taskArg = process.argv.indexOf("--task");
  const onlyTask = taskArg >= 0 ? process.argv[taskArg + 1] : null;

  let tasks = collectTasks();
  if (onlyTask) tasks = tasks.filter((t) => t.id === onlyTask);
  if (onlyPosts) tasks = tasks.filter((t) => POST_TYPES.has(t.postType));

  if (tasks.length === 0) {
    console.log("沒有符合條件的任務");
    process.exit(0);
  }

  // squad 卡的 agent 要從 squads.lead_agent_id 補
  const squadless = tasks.filter((t) => t.agentId === null && t.tier === "99s").map((t) => t.id);
  const leads = await resolveSquadLeads(squadless).catch(() => ({} as Record<string, number>));
  for (const t of tasks) {
    if (t.agentId === null) {
      const slug = t.id.replace(/^fb-99-/, "fb-");
      if (leads[slug]) t.agentId = leads[slug]!;
    }
  }

  const agentIds = Array.from(new Set(tasks.map((t) => t.agentId).filter((n): n is number => !!n)));
  const { default: localPool } = await import("../server/localDb");
  const ph = agentIds.map(() => "?").join(",");
  const [rows]: any = agentIds.length
    ? await localPool.execute(
        `SELECT id, name, englishName, title, taskSystemPrompt, bio, experienceDetail
           FROM agents WHERE id IN (${ph})`,
        agentIds,
      )
    : [[]];
  const agents = new Map<number, any>();
  for (const r of rows as any[]) agents.set(Number(r.id), r);

  const fail: string[] = [];
  const missing: string[] = [];
  const pass: string[] = [];

  console.log(`── FB agent 人設稽核（下限 ${MIN_PERSONA_CHARS} 字）──`);
  console.log(`任務 ${tasks.length} 個 / 綁到 ${agentIds.length} 位 agent\n`);

  for (const t of tasks.sort((a, b) => a.id.localeCompare(b.id))) {
    const inScope = POST_TYPES.has(t.postType);
    const scopeTag = inScope ? "貼文" : t.postType;

    if (!t.agentId) {
      console.log(`  ？ ${t.id.padEnd(30)} [${scopeTag}] 沒有綁 agent — ${t.label}`);
      if (inScope) missing.push(t.id);
      continue;
    }
    const a = agents.get(t.agentId);
    if (!a) {
      console.log(`  ？ ${t.id.padEnd(30)} [${scopeTag}] agent ${t.agentId} 不在 agents 表`);
      if (inScope) missing.push(t.id);
      continue;
    }

    const prompt = String(a.taskSystemPrompt ?? "");
    const n = prompt.length;
    const ok = n >= MIN_PERSONA_CHARS;
    const mark = ok ? "✅" : inScope ? "❌" : "－";
    console.log(
      `  ${mark} ${t.id.padEnd(30)} [${scopeTag}] ${String(n).padStart(5)} 字  ` +
      `${a.name}（${a.englishName ?? "-"}）｜${a.title}`,
    );
    if (show && prompt) {
      console.log("      ┌" + "─".repeat(70));
      for (const line of prompt.split("\n")) console.log("      │ " + line);
      console.log("      └" + "─".repeat(70));
    }
    if (inScope) (ok ? pass : fail).push(`${t.id}（${a.name}，${n} 字）`);
  }

  console.log("\n── 結果（只計貼文類任務）──");
  console.log(`  達標 ${pass.length} / 未達標 ${fail.length} / 無法判定 ${missing.length}`);
  if (fail.length) {
    console.log("\n  未達 " + MIN_PERSONA_CHARS + " 字：");
    for (const f of fail) console.log("    · " + f);
  }
  if (missing.length) {
    console.log("\n  查不到 agent（要先補綁定）：");
    for (const m of missing) console.log("    · " + m);
  }

  console.log(
    "\n  ⚠ 字數只是門檻的一半。「按照真實人物設計」機器驗不了 —— " +
    "用 --show 把人設印出來自己看：有沒有具體的口頭禪／句型／立場，" +
    "還是只有『專業、親切、溫暖』這種堆字數的形容詞。",
  );

  process.exit(fail.length > 0 || missing.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[audit] 失敗：", e?.message ?? e);
  process.exit(1);
});
