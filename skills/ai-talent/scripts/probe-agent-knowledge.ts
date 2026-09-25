/**
 * probe-agent-knowledge — 在正式機上用「部署中的那份」agentKnowledge 載入器，
 * 確認 agent 的工作守則 / 專業執行卡 / 綁定 Skill 真的會進 prompt。
 *
 *   npx tsx scripts/probe-agent-knowledge.ts 180837 180563
 *   npx tsx scripts/probe-agent-knowledge.ts --product-strategy   # 全部 153 位
 *
 * 唯讀。只印段落標題與字數，不印 taskSystemPrompt 內文。
 * 有任何一位應該有知識卻組不出來時 exit 1。
 */
import localPool from "../server/localDb";
import { loadAgentKnowledgeMany } from "../server/_core/agentKnowledge";

async function main() {
  const args = process.argv.slice(2);
  let ids = args.map(Number).filter((n) => Number.isFinite(n) && n > 0);

  if (args.includes("--product-strategy")) {
    const [rows]: any = await localPool.execute(
      `SELECT id FROM agents WHERE primarySkillBundleKey = 'product-strategy-agent-card-v1' ORDER BY id`,
    );
    ids = (rows as any[]).map((r) => Number(r.id));
  }
  if (!ids.length) throw new Error("usage: probe-agent-knowledge.ts <id...> | --product-strategy");

  const [rows]: any = await localPool.execute(
    `SELECT * FROM agents WHERE id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  const knowledge = await loadAgentKnowledgeMany(ids);

  let bad = 0;
  const lengths: number[] = [];
  const skillLens: number[] = [];
  for (const a of rows as any[]) {
    const k = knowledge.get(Number(a.id)) ?? "";
    const tspLen = String(a.taskSystemPrompt ?? "").length;
    const expectsCard = !!a.agentCard;
    const has = {
      tsp: k.includes("# 工作守則"),
      card: k.includes("# 專業執行卡"),
      skill: k.includes("# 你綁定的專業 Skill"),
    };
    const ok = (!tspLen || has.tsp) && (!expectsCard || has.card) && (!a.primarySkillBundleKey || has.skill);
    if (!ok) bad++;
    lengths.push(k.length);
    const si = k.indexOf("# 你綁定的專業 Skill");
    if (si >= 0) skillLens.push(k.length - si);
    if (ids.length <= 20 || !ok) {
      console.log(
        `${ok ? "✓" : "✗"} ${a.id} ${a.name} | taskSystemPrompt ${tspLen} 字 → 工作守則 ${has.tsp ? "有" : "無"}`
        + ` | 執行卡 ${has.card ? "有" : "無"} | Skill ${has.skill ? "有" : "無"} | 注入 ${k.length} 字`,
      );
    }
  }
  const missing = ids.filter((id) => !(rows as any[]).some((r) => Number(r.id) === id));
  if (missing.length) { console.log(`✗ 找不到 agent：${missing.join(", ")}`); bad += missing.length; }

  // 卡片版本分布（看得出後台是否有新一批升版）
  const versions: Record<string, number> = {};
  for (const a of rows as any[]) {
    let c: any = a.agentCard;
    try { if (typeof c === "string") c = JSON.parse(c); } catch { c = null; }
    const v = c ? `${c.version ?? "?"}/${c.status ?? "?"}` : "（無卡）";
    versions[v] = (versions[v] ?? 0) + 1;
  }
  console.log(`\n卡片版本：${JSON.stringify(versions)}`);

  // 綁定 Skill 的欄位清單：只印欄位名與字數，找出內文放在哪一欄
  const skillIds = new Set<number>();
  for (const a of rows as any[]) {
    let s: any = a.attached_skill_ids;
    try { if (typeof s === "string") s = JSON.parse(s); } catch { s = []; }
    if (Array.isArray(s)) s.forEach((x: any) => skillIds.add(Number(x)));
  }
  if (skillIds.size) {
    const [sRows]: any = await localPool.execute(
      `SELECT * FROM skills WHERE id IN (${[...skillIds].map(() => "?").join(",")})`,
      [...skillIds],
    );
    for (const s of sRows as any[]) {
      const cols = Object.entries(s)
        .map(([k, v]) => `${k}=${v == null ? "null" : typeof v === "object" ? `json${JSON.stringify(v).length}` : String(v).length}`)
        .join(" ");
      console.log(`Skill ${s.id} ${s.slug} active=${s.is_active} | ${cols}`);
    }
  }

  lengths.sort((x, y) => x - y);
  skillLens.sort((x, y) => x - y);
  console.log(`Skill 注入字數：min ${skillLens[0] ?? 0} / max ${skillLens[skillLens.length - 1] ?? 0}（${skillLens.length} 位）`);
  console.log(`\n共 ${ids.length} 位，失敗 ${bad} 位；注入字數 min ${lengths[0] ?? 0} / max ${lengths[lengths.length - 1] ?? 0}`);
  await localPool.end();
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
