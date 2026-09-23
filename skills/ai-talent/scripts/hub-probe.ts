/**
 * ExpertHub demo — end-to-end probe.
 *
 * 2026-09-18: written to wrap up the Dallas booth demo. It exercises the same
 * tRPC procedures the UI calls, plus the compliance contract and the LINE bot
 * handlers, against whatever database the process is pointed at. Safe to run on
 * the VM: everything it writes is either a tracked link or a demo event row.
 *
 *   npx tsx scripts/hub-probe.ts              # no LLM calls, ~2s
 *   npx tsx scripts/hub-probe.ts --generate   # also writes one real post (costs tokens)
 *
 * Exit code is the number of failed checks, so CI/ssh can gate on it.
 */
import "dotenv/config";
import { appRouter } from "../server/routers";
import {
  createLink,
  getOrg,
  getRep,
  listFacts,
  listRegulations,
  listSkills,
  listSolutions,
  listWording,
  publicBaseUrl,
  q,
  exec,
} from "../server/platform/core/hub/hubStore";
import { complianceContextFor } from "../server/content/core/hub/generateRepPost";
import { findIssues, repairPost } from "../server/content/core/hub/complianceContract";
import { RICH_MENU_AREAS, handleMenu, handleText, simulatorContext } from "../server/platform/core/hub/lineBot";
import { hermesStatus } from "../server/platform/core/hub/hermesBridge";

const GENERATE = process.argv.includes("--generate");

let failed = 0;
let passed = 0;
const notes: string[] = [];

function ok(label: string, detail = "") {
  passed++;
  console.log(`  ok   ${label}${detail ? `  ${detail}` : ""}`);
}
function bad(label: string, detail = "") {
  failed++;
  console.log(`  FAIL ${label}${detail ? `  ${detail}` : ""}`);
}
function check(cond: unknown, label: string, detail = "") {
  cond ? ok(label, detail) : bad(label, detail);
}
function section(title: string) {
  console.log(`\n═══ ${title} ${"═".repeat(Math.max(0, 58 - title.length))}`);
}

/** Fixtures that should trip every rule in a pack, so a silent contract shows up. */
const BAD_DRAFTS: Record<string, string> = {
  TW: [
    "剛結束一場客戶會議，分享一下 ExpertHub 的方案。",
    "導入只要 NT$1,234，保證第一，唯一零風險的選擇。",
    "根據統計，87% 的企業導入後營收成長，比中華電信的方案更划算。",
  ].join("\n"),
  US: [
    "Just wrapped a customer workshop and wanted to share what ExpertHub does.",
    "It is $1,299 per seat and guaranteed to be the best option on the market.",
    "92% of companies that adopted it doubled revenue, which beats what Microsoft offers.",
  ].join("\n"),
};

async function main() {
  console.log(`ExpertHub probe — db=${process.env.LOCAL_DB_NAME} base=${publicBaseUrl()} generate=${GENERATE}`);
  const before = { posts: 0, events: 0 };
  {
    const [p] = await q(`SELECT COALESCE(MAX(id), 0) AS m FROM hub_posts`);
    const [e] = await q(`SELECT COALESCE(MAX(id), 0) AS m FROM hub_events`);
    before.posts = Number(p?.m ?? 0);
    before.events = Number(e?.m ?? 0);
  }
  const createdCodes: string[] = [];

  // ── 1. Seed data ────────────────────────────────────────────────────────────
  section("Strategy layer data");
  const org = await getOrg();
  check(org?.id, "org row", org ? `#${org.id} ${org.name}` : "missing");
  check(String(org.disclaimer ?? "").length > 10, "disclaimer present", `${String(org.disclaimer ?? "").slice(0, 48)}…`);

  const [solutions, facts, skills, regs] = await Promise.all([
    listSolutions(org.id),
    listFacts(org.id),
    listSkills(org.id),
    listRegulations(org.id),
  ]);
  check(solutions.length > 0, "solutions", `${solutions.length}`);
  const noPrice = solutions.filter((s) => s.prices.length === 0).map((s) => s.slug);
  check(noPrice.length === 0, "every solution has a price", noPrice.join(", ") || `${solutions.length}/${solutions.length}`);

  check(facts.length > 0, "market facts", `${facts.length}`);
  const uncited = facts.filter((f) => !f.sourceUrl || !f.sourceName).map((f) => f.id);
  check(uncited.length === 0, "every fact carries a citation", uncited.length ? `missing: ${uncited.join(",")}` : "");

  // ── 策略層的統一檢索（CJ 2026-09-23「get data ready for AI」） ─────────────
  //
  // 這一段驗的是「agent 下條件撈得到對的東西」。它壞掉的方式很安靜：投影漏掉
  // 一種資料，agent 只是撈不到，不會報錯——然後它會拿殘缺的資料去寫東西。
  try {
    const { buildStrategyIndex } = await import("../server/strategy/core/hub/strategyIndex");
    const { filterStrategy, STRATEGY_ENTITIES } = await import("../server/strategy/core/hub/strategyRegistry");
    const index = await buildStrategyIndex(org.id);
    check(index.length > 0, "strategy index builds", `${index.length} records`);

    // 五種資料都要投影得出來。少一種＝那個 tray 對 AI 不存在。
    const seen = new Set(index.map((r) => r.entity));
    const missing = STRATEGY_ENTITIES.filter((e) => !seen.has(e.id)).map((e) => e.id);
    check(missing.length === 0, "every strategy tray is in the index", missing.join(", ") ||
      STRATEGY_ENTITIES.map((e) => `${e.id}:${index.filter((r) => r.entity === e.id).length}`).join(" "));

    // 每一筆都要有標題，否則 agent 撈到一筆空的，還是會拿去用。
    const untitled = index.filter((r) => !r.title.en.trim() && !r.title.zh.trim());
    check(untitled.length === 0, "no record is title-less", untitled.map((r) => `${r.entity}#${r.id}`).join(", ") || "all titled");

    // 可引用的一定要有出處。這是 AI 拿資料去寫東西之前唯一的擋板。
    const quotableNoSource = index.filter((r) => r.quotable && !r.source);
    check(quotableNoSource.length === 0, "everything quotable carries a source",
      quotableNoSource.map((r) => `${r.entity}#${r.id}`).join(", ") || `${index.filter((r) => r.quotable).length} quotable`);

    // 實際跑一次 agent 會下的那種條件。
    const today = new Date().toISOString().slice(0, 10);
    const twManufacturing = filterStrategy(index, {
      market: "TW", industries: ["manufacturing"], liveOn: today, withSource: true,
    });
    check(twManufacturing.length > 0, "a realistic agent query returns something",
      `TW + manufacturing + live + sourced → ${twManufacturing.length}`);
    const narrowed = filterStrategy(index, { entity: ["fact"], quotableOnly: true, limit: 5 });
    check(narrowed.length <= 5, "the limit is honoured", `${narrowed.length} rows`);
  } catch (e: any) {
    bad("strategy index", e?.message ?? String(e));
  }

  // ── 通用編輯／核准／紀錄（CJ 2026-09-23「每一個 mission tray…權限和紀錄」） ──
  //
  // 真的跑一次「提案 → 正式欄位沒變 → 核准 → 正式欄位變了」。這一段驗的是核准
  // 這件事有沒有作用——如果提案當下就寫進正式欄位，那個核准按鈕就只是裝飾，
  // 而這個 repo 踩過一次那個坑。
  try {
    const m = await import("../server/strategy/core/hub/strategyEdits");
    const { strategyEntity, STRATEGY_ENTITIES } = await import("../server/strategy/core/hub/strategyRegistry");

    // 每一種資料的資料表都要真的存在，否則那個 tray 的編輯是個永遠會炸的按鈕。
    const missingTables: string[] = [];
    for (const e of STRATEGY_ENTITIES) {
      const [row] = await q(
        `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
        [e.table],
      );
      if (!Number(row?.n)) missingTables.push(`${e.id}→${e.table}`);
    }
    check(missingTables.length === 0, "every strategy entity points at a real table", missingTables.join(", ") || `${STRATEGY_ENTITIES.length} tables`);

    // 2026-09-23 搬遷：舊的兩張紀錄表併進 hub_strategy_edits。
    // 驗「沒有弄丟」比驗「搬過去了」重要 —— 稽核紀錄少一筆是補不回來的。
    for (const [table, entity, idCol] of [
      ["hub_solution_edits", "solution", "solution_id"],
      ["hub_wording_edits", "wording", "wording_id"],
    ] as const) {
      const [exists] = await q(
        `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
        [table],
      );
      if (!Number(exists?.n)) continue;
      const [old] = await q(`SELECT COUNT(*) AS n FROM ${table} WHERE org_id = ?`, [org.id]);
      const [moved] = await q(
        `SELECT COUNT(*) AS n FROM hub_strategy_edits WHERE org_id = ? AND entity = ? AND legacy_id IS NOT NULL`,
        [org.id, entity],
      );
      check(
        Number(moved?.n) >= Number(old?.n),
        `every ${entity} history row was carried over`,
        `${moved?.n} of ${old?.n} legacy rows`,
      );
      void idCol;
    }

    // 搬遷可以重複執行：再跑一次不該長出任何東西。
    const [beforeAgain] = await q(`SELECT COUNT(*) AS n FROM hub_strategy_edits WHERE org_id = ?`, [org.id]);
    await m.migrateLegacyEdits(org.id);
    const [afterAgain] = await q(`SELECT COUNT(*) AS n FROM hub_strategy_edits WHERE org_id = ?`, [org.id]);
    check(
      Number(beforeAgain?.n) === Number(afterAgain?.n),
      "running the migration twice adds nothing",
      `${beforeAgain?.n} → ${afterAgain?.n}`,
    );

    /**
     * 上面那兩條在 demo 資料庫上是 "0 of 0" —— 這裡從來沒有人透過介面改過產品
     * 或用詞，所以舊表是空的。那證明了搬遷不會重複執行，但**沒有證明它真的會
     * 搬**。空資料上跑過的搬遷等於沒跑過。
     *
     * 所以自己種一筆舊紀錄進去，跑一次，確認它到了新表而且欄位對得上，再清掉。
     */
    const legacyProbeId = 990000 + (Date.now() % 9000);
    try {
      await exec(
        `INSERT INTO hub_wording_edits (id, org_id, wording_id, actor, action, market, kind, term, changes)
         VALUES (?, ?, NULL, 'hub-probe-legacy', 'added', 'TW', 'preferred', 'probe-legacy-term', ?)`,
        [legacyProbeId, org.id, JSON.stringify([{ field: "term", from: "", to: "probe-legacy-term" }])],
      );
      const moved = await m.migrateLegacyEdits(org.id);
      check(moved.wording >= 1, "the migration actually moves a legacy row", `moved ${moved.wording}`);

      const [landed] = await q(
        `SELECT actor, action, label, changes FROM hub_strategy_edits
          WHERE org_id = ? AND entity = 'wording' AND legacy_id = ? LIMIT 1`,
        [org.id, legacyProbeId],
      );
      check(landed != null, "the moved row is findable by its legacy id", landed ? "found" : "MISSING");
      check(String(landed?.label ?? "") === "probe-legacy-term", "the old `term` column lands in `label`", String(landed?.label ?? "(none)"));
      // 舊表的 "added" 要在搬遷時對齊成 "created"，資料裡只留一套詞彙。
      check(String(landed?.action ?? "") === "created", "the old verb is translated, not copied", String(landed?.action ?? "(none)"));

      const again = await m.migrateLegacyEdits(org.id);
      check(again.wording === 0, "re-running does not duplicate the moved row", `second pass moved ${again.wording}`);
    } finally {
      await exec(`DELETE FROM hub_wording_edits WHERE id = ? AND org_id = ?`, [legacyProbeId, org.id]);
      await exec(`DELETE FROM hub_strategy_edits WHERE org_id = ? AND legacy_id = ?`, [org.id, legacyProbeId]);
    }
    const [leftover2] = await q(
      `SELECT COUNT(*) AS n FROM hub_strategy_edits WHERE org_id = ? AND actor = 'hub-probe-legacy'`,
      [org.id],
    );
    check(Number(leftover2?.n) === 0, "probe left no legacy test rows behind", `${leftover2?.n} rows`);

    const [reg] = await q(`SELECT id, name_zh FROM hub_regulations WHERE org_id = ? ORDER BY id LIMIT 1`, [org.id]);
    if (reg) {
      const original = String(reg.name_zh ?? "");
      const probed = `${original} (probe)`;
      try {
        const r = await m.proposeStrategyEdit({
          orgId: org.id, entity: "regulation", entityId: reg.id,
          actor: "hub-probe-author", proposed: { name_zh: probed },
        });
        check(!r.applied && r.changes.length === 1, "a proposal does not apply itself", `applied=${r.applied} changes=${r.changes.length}`);

        const [mid] = await q(`SELECT name_zh FROM hub_regulations WHERE id = ?`, [reg.id]);
        check(String(mid?.name_zh ?? "") === original, "the live value is untouched while it waits", `still "${String(mid?.name_zh ?? "").slice(0, 24)}"`);

        // 作者不能核准自己的提案。
        let selfApproved = false;
        try {
          await m.approveStrategyEdit({ orgId: org.id, entity: "regulation", entityId: reg.id, actor: "hub-probe-author" });
          selfApproved = true;
        } catch { /* 預期 */ }
        check(!selfApproved, "the author cannot approve their own proposal", selfApproved ? "IT LET THEM" : "blocked");

        await m.approveStrategyEdit({ orgId: org.id, entity: "regulation", entityId: reg.id, actor: "hub-probe-approver" });
        const [after] = await q(`SELECT name_zh FROM hub_regulations WHERE id = ?`, [reg.id]);
        check(String(after?.name_zh ?? "") === probed, "approving applies the change", `now "${String(after?.name_zh ?? "").slice(0, 30)}"`);

        // 白名單：不在 editableFields 裡的欄位要被擋，不是靜默忽略。
        let wrote = false;
        try {
          await m.proposeStrategyEdit({
            orgId: org.id, entity: "regulation", entityId: reg.id,
            actor: "hub-probe-author", proposed: { org_id: 999999 } as any,
          });
          wrote = true;
        } catch { /* 預期 */ }
        check(!wrote, "a field outside the whitelist is refused", wrote ? "IT ACCEPTED org_id" : "refused");
      } finally {
        // 還原，並清掉探針留下的紀錄與提案。
        await exec(`UPDATE hub_regulations SET name_zh = ? WHERE id = ? AND org_id = ?`, [original, reg.id, org.id]);
        await exec(`DELETE FROM hub_strategy_pending WHERE org_id = ? AND entity = 'regulation' AND entity_id = ?`, [org.id, reg.id]);
        await exec(`DELETE FROM hub_strategy_edits WHERE org_id = ? AND actor LIKE 'hub-probe-%'`, [org.id]);
      }
      const [restored] = await q(`SELECT name_zh FROM hub_regulations WHERE id = ?`, [reg.id]);
      check(String(restored?.name_zh ?? "") === String(reg.name_zh ?? ""), "probe left the regulation as it found it", "restored");
    }
  } catch (e: any) {
    bad("generic strategy editing", e?.message ?? String(e));
  }

  // ── 推播設定（CJ 2026-09-23「由建置該消息的用戶設定群組與頻率」） ──────────
  try {
    const { readPushSettings, dueToday, CADENCES } = await import("../server/strategy/core/hub/factPush");
    const rows = await q(`SELECT id, push_cadence, push_audience, push_last_at, expires_on FROM hub_facts WHERE org_id = ?`, [org.id]);
    check(rows.length > 0, "push settings columns exist", `${rows.length} rows readable`);

    const bad2 = rows.filter((r: any) => r.push_cadence && !(CADENCES as readonly string[]).includes(String(r.push_cadence)));
    check(bad2.length === 0, "no unknown cadence is stored", bad2.map((r: any) => `#${r.id}:${r.push_cadence}`).join(", ") || "ok");

    // 過期的東西即使被指名也不能送。這一條錯了，業務要替我們向客戶道歉。
    const today = new Date().toISOString().slice(0, 10);
    const leaks = rows.filter((r: any) => {
      const s = readPushSettings(r);
      if (s.cadence === "off") return false;
      const exp = r.expires_on ? new Date(r.expires_on).toISOString().slice(0, 10) : null;
      return dueToday({ settings: s, autoAudience: [1], expiresOn: exp, forwardable: true, today }).due
        && exp != null && exp < today;
    });
    check(leaks.length === 0, "nothing expired would still be pushed", leaks.map((r: any) => `#${r.id}`).join(", ") || "ok");
  } catch (e: any) {
    bad("fact push settings", e?.message ?? String(e));
  }

  // ── 推播佇列與逐類退訂（CJ 2026-09-23） ───────────────────────────────────
  //
  // 這一段是唯一會對外送訊息的功能，所以驗的重點是**不該送的一定不會送**。
  // 探針不按送出——那是人的動作。
  try {
    const pq = await import("../server/strategy/core/hub/pushQueue");
    const { listReps } = await import("../server/platform/core/hub/hubStore");
    const repRows = await listReps(org.id);

    // 退訂比「技術上送得到」優先：退訂的人就算綁了帳號也不該收到。
    const withLine = { id: 1, name: "bound", lineUserId: "U1" };
    const both = pq.buildRecipients({ audience: [1], reps: [withLine], optedOut: new Set([1]) });
    check(both[0]?.blockedBy === "opted_out", "opting out beats having an account", String(both[0]?.blockedBy));

    // 沒綁 LINE 的人會出現在清單上，但標成送不到 —— 不是靜默消失。
    const unbound = repRows.filter((r: any) => !r.lineUserId);
    const shown = pq.buildRecipients({
      audience: repRows.map((r: any) => r.id),
      reps: repRows.map((r: any) => ({ id: r.id, name: r.name, lineUserId: r.lineUserId })),
      optedOut: new Set(),
    });
    check(shown.length === repRows.length, "the queue lists everyone, reachable or not", `${shown.length}/${repRows.length}`);
    check(
      shown.filter((r) => !r.deliverable).length === unbound.length,
      "everyone without a LINE binding is marked undeliverable",
      `${unbound.length} of ${repRows.length} reps have no LINE account`,
    );
    if (unbound.length === repRows.length) {
      notes.push("no rep has a LINE binding yet — pressing send would deliver nothing");
    }

    // 每一則推播都要帶退訂指示。沒有退訂就不該有推播。
    const sample = pq.pushText({
      statement: "測試", sourceName: "來源", expiresOn: "2026-09-29", kindLabel: "補助方案", zh: true,
    });
    check(sample.includes("停止補助方案"), "every push carries its own opt-out line", "present");
    check(sample.includes("出處：來源"), "every push carries its source", "present");

    // 退訂的文字解析：認錯一個比漏認一個糟。
    check(pq.parseOptOut("停止補助").kind === "subsidy", "a plain opt-out reply is understood", "停止補助 → subsidy");
    check(pq.parseOptOut("停止").kind === null, "an opt-out with no category is not guessed", "asks which one");
    check(pq.parseOptOut("幫我寫一篇補助的貼文").intent === null, "an ordinary message is left alone", "not an opt-out");

    const optOuts = await pq.listOptOuts(org.id);
    check(true, "current opt-outs", optOuts.length ? optOuts.map((o) => `${o.repId}:${o.kind}`).join(", ") : "none");
    const log = await pq.listPushLog(org.id, 5);
    check(Array.isArray(log), "push log reads back", `${log.length} recent`);
  } catch (e: any) {
    bad("push queue", e?.message ?? String(e));
  }

  // ── 市場消息的產業配對（CJ 2026-09-23） ───────────────────────────────────
  //
  // 這一段算的是**誰會收到哪則消息**。算錯的後果不是畫面難看：標錯產業 → 業務
  // 收不到補助 → 他的客戶錯過申請期限。所以逐條驗，而且獨立重算一次。
  try {
    const { routeFacts, perRepCounts, unreachable } = await import("../server/strategy/core/hub/factRouting");
    const { unknownIndustries, INDUSTRIES, ALL_INDUSTRIES } = await import("../server/strategy/core/hub/industries");
    const { listReps } = await import("../server/platform/core/hub/hubStore");
    const repRows = await listReps(org.id);
    const today = new Date().toISOString().slice(0, 10);

    // 標籤打錯字是唯一會靜默失效的錯 —— 比對不到就是比對不到，不會有人收到錯的。
    const badFactTags = facts.flatMap((f: any) => unknownIndustries(f.industries ?? []).map((i: string) => `#${f.id}:${i}`));
    const badRepTags = repRows.flatMap((r: any) => unknownIndustries(r.industries ?? []).map((i: string) => `${r.name}:${i}`));
    check(badFactTags.length === 0, "every fact's industry tag is in the vocabulary", badFactTags.join(", ") || `${INDUSTRIES.length} + ${ALL_INDUSTRIES}`);
    check(badRepTags.length === 0, "every rep's industry tag is in the vocabulary", badRepTags.join(", ") || `${repRows.length} reps tagged`);

    const tagged = repRows.filter((r: any) => (r.industries ?? []).length > 0);
    check(tagged.length === repRows.length, "every rep says which industries they cover", `${tagged.length}/${repRows.length}`);

    const routing = routeFacts(facts as any, repRows as any, today);
    const orphans = unreachable(facts as any, routing);
    check(orphans.length === 0, "no live, forwardable fact reaches nobody", orphans.map((f: any) => `#${f.id}`).join(", ") || "all routed");

    // 市場不能跨 —— 台灣的補助出現在美國業務手機上是很難解釋的錯。
    const crossed = Object.entries(routing).flatMap(([id, info]: any) => {
      const f: any = facts.find((x: any) => String(x.id) === id);
      return info.repIds.filter((rid: number) => repRows.find((r: any) => r.id === rid)?.market !== f?.market).map(() => `#${id}`);
    });
    check(crossed.length === 0, "routing never crosses markets", crossed.join(", ") || "TW stays TW, US stays US");

    // 過期的絕對不能還在推。這一條錯了，業務會替我們向客戶道歉。
    const expiredStillSent = facts.filter((f: any) => f.expiresOn && f.expiresOn < today && routing[f.id]?.forwardable);
    check(expiredStillSent.length === 0, "nothing past its deadline is still being sent", expiredStillSent.map((f: any) => `#${f.id}`).join(", ") || "ok");

    const counts = perRepCounts(routing, repRows as any);
    const zero = counts.filter((c) => c.count === 0);
    check(true, "items each rep receives", counts.map((c) => `${c.name.split(" ")[0]}:${c.count}`).join(" "));
    if (zero.length) notes.push(`${zero.length} rep(s) would receive nothing: ${zero.map((c) => c.name).join(", ")}`);
  } catch (e: any) {
    bad("fact routing", e?.message ?? String(e));
  }

  const approved = skills.filter((s) => s.status === "approved");
  check(approved.length > 0, "approved writing skills", `${approved.length}/${skills.length}`);
  check(regs.length > 0, "regulation entries", `${regs.length}`);

  // ── 法規卡上的數字（CJ 2026-09-23「regulation update，請同樣使用任務卡」） ──
  //
  // 每張卡上掛著「已套用至政策包」。那是**手動維護的欄位**，沒有東西驗證政策包
  // 真的跟著改了。驗得動的是另一半：法規指名的檢查在政策包裡存不存在。對不上就
  // 是死對應——法規卡寫著「影響：核准價格」，政策包裡卻沒有這項檢查。
  try {
    const { coverRegulations, overdueCount, brokenMappings } = await import(
      "../server/strategy/core/hub/regulationCoverage"
    );
    const { POLICY_PACKS } = await import("../server/content/core/hub/policyPacks");
    const packRuleIds = {
      TW: POLICY_PACKS.TW.rules.map((r) => r.id),
      US: POLICY_PACKS.US.rules.map((r) => r.id),
    };
    const today = new Date().toISOString().slice(0, 10);
    const cov = coverRegulations(regs as any, packRuleIds, today);

    check(Object.keys(cov).length === regs.length, "every regulation got covered", `${Object.keys(cov).length}/${regs.length}`);

    // 2026-09-23 (CJ「要有更新日期，法規名稱還要最近修改的摘要」)。卡片上的
    // 名稱與摘要是新欄位，靠部署時的 seed 填。profile 那次就是 seed 沒跑成功、
    // 探針也沒量，結果我回報「已完成」而畫面是空的。這次先量。
    const thin = regs.filter((r) => !r.nameZh || !r.nameEn || !r.changeZh || !r.changeEn);
    check(thin.length === 0, "every regulation has a short name and a what-changed line", thin.map((r) => `#${r.id}`).join(", ") || `${regs.length} filled`);

    // 短名不該還是那句「中文法規名 — 英文變動說明」的長標題。
    const stillLong = regs.filter((r) => r.nameZh === r.title || r.nameZh.length > 60);
    check(stillLong.length === 0, "the card name is a short name, not the full title", stillLong.map((r) => `#${r.id}`).join(", ") || "ok");

    const noZh = regs.filter((r) => !r.summaryZh || !r.impactZh);
    check(noZh.length === 0, "every regulation reads in Chinese too", noZh.map((r) => `#${r.id}`).join(", ") || `${regs.length} bilingual`);

    const broken = brokenMappings(cov);
    check(
      broken.length === 0,
      "every check a regulation names exists in its policy pack",
      broken.length ? broken.map((b) => `#${b.id}: ${b.unknown.join(",")}`).join("; ") : "no dead mappings",
    );

    // 逾期的算法獨立重算一次 —— 這是整頁唯一會變紅的數字，算錯比不算更糟。
    const recount = regs.filter((r) => r.status !== "applied" && r.effectiveOn && r.effectiveOn <= today).length;
    check(overdueCount(cov) === recount, "the overdue count agrees with a plain recount", `${overdueCount(cov)} vs ${recount}`);
    if (overdueCount(cov)) {
      notes.push(`${overdueCount(cov)} regulation(s) in force but not marked applied`);
    }

    // 沒有生效日的那些不該冒出天數 —— 那會憑空生出一個期限。
    const phantom = regs.filter((r) => !r.effectiveOn && (cov[r.id]?.overdueDays != null || cov[r.id]?.daysUntil != null));
    check(phantom.length === 0, "a rule with no effective date gets no countdown", phantom.map((r) => `#${r.id}`).join(", ") || "ok");
  } catch (e: any) {
    bad("regulation coverage", e?.message ?? String(e));
  }

  for (const market of ["TW", "US"]) {
    const w = await listWording(org.id, market);
    check(w.length > 0, `wording lists (${market})`, `${w.length}`);
  }

  // ── 用詞規範的效力量測（CJ 2026-09-23「優化這一頁」） ─────────────────────
  //
  // 正面用詞那一頁現在每條規則旁邊掛一個數字。數字是斷言，要驗。特別是分母：
  // 拿展示用的歷史貼文（同一篇範例複製 88 份）去算，每個詞不是 0/88 就是 88/88,
  // 那是複製出來的假象。所以量測只算 is_demo = 0。
  try {
    const { measureWording, findWordingConflicts } = await import("../server/strategy/core/hub/wordingUsage");
    const all = await listWording(org.id);
    const measured = await measureWording(org.id, all);

    const missing = all.filter((w) => !measured.usage[w.id]);
    check(missing.length === 0, "every wording rule got measured", missing.map((w) => w.term).join(", ") || `${all.length} rules`);

    // `real` 是 MySQL 的保留字（REAL 是資料型別），不能當欄位別名。
    const [{ demo_posts = 0, live_posts = 0 } = {} as any] = await q<{ demo_posts: number; live_posts: number }>(
      `SELECT SUM(is_demo = 1) AS demo_posts, SUM(is_demo = 0) AS live_posts FROM hub_posts WHERE org_id = ?`,
      [org.id],
    );
    const counted = Object.values(measured.byMarket).reduce((a, b) => a + b, 0);
    check(
      counted === Number(live_posts),
      "the denominator counts real posts only, not demo history",
      `counted ${counted}, real ${live_posts}, demo ${demo_posts}`,
    );

    // hits 永遠不能大於 posts —— 比率大於 1 的數字會讓整頁失去可信度。
    const impossible = Object.values(measured.usage).filter((u) => u.hits > u.posts);
    check(impossible.length === 0, "no rule reports more hits than posts", impossible.map((u) => `#${u.id} ${u.hits}/${u.posts}`).join(", ") || "ok");

    const conflicts = findWordingConflicts(all);
    check(true, "wording conflicts", conflicts.length ? conflicts.map((c) => `${c.market}:${c.kind}`).join(", ") : "none — the seeded rules agree with each other");

    // 2026-09-23 (CJ「只要寫使用詞、禁用詞，可以編輯，不需要寫為什麼。仍然要有
    // 編輯歷史」)。沒有理由欄，所以紀錄就是理由——它壞掉的話，這份清單就變成
    // 一堆沒有人知道為什麼存在的字。真的跑一次新增→編輯→刪除。
    const we = await import("../server/strategy/core/hub/wordingEdits");
    const probeTerm = `probe-word-${Date.now()}`;
    let probeId: number | null = null;
    try {
      await exec(
        `INSERT INTO hub_wording (org_id, market, kind, term, added_by) VALUES (?, 'TW', 'preferred', ?, 'hub-probe')`,
        [org.id, probeTerm],
      );
      const [row] = await q(`SELECT id FROM hub_wording WHERE org_id = ? AND term = ? LIMIT 1`, [org.id, probeTerm]);
      probeId = row?.id ?? null;
      await we.logWordingEdit({
        orgId: org.id, wordingId: probeId, actor: "hub-probe", action: "added",
        market: "TW", kind: "preferred", term: probeTerm,
      });

      const renamed = `${probeTerm}-v2`;
      const r = await we.editWording({ orgId: org.id, id: probeId!, actor: "hub-probe", term: renamed, replacement: null });
      check(r.changed, "editing a word in place reports a change", `changed=${r.changed}`);

      // 前後一樣就不該留紀錄 —— 紀錄的價值全在稀少。
      const again = await we.editWording({ orgId: org.id, id: probeId!, actor: "hub-probe", term: renamed, replacement: null });
      check(!again.changed, "a no-op edit leaves no record", `changed=${again.changed}`);

      const log = await we.listWordingEdits(org.id, "TW");
      const mine2 = log.filter((h) => h.term.startsWith("probe-word-"));
      check(mine2.length === 2, "the record has the add and the edit, and nothing else", `${mine2.length} entries`);
      const edited = mine2.find((h) => h.action === "edited");
      check(
        edited?.changes?.[0]?.from === probeTerm && edited?.changes?.[0]?.to === renamed,
        "the record carries both sides of the change",
        JSON.stringify(edited?.changes ?? []),
      );
      check(Boolean(edited?.actor), "the record says who did it", edited?.actor ?? "(nobody)");
    } finally {
      if (probeId) await exec(`DELETE FROM hub_wording WHERE id = ? AND org_id = ?`, [probeId, org.id]);
      // 2026-09-23：紀錄搬家之後，logWordingEdit 寫的是 hub_strategy_edits。
      // 這裡原本只清舊表，所以探針的列一次次累積（第二次跑就變 4 筆，上面那條
      // 「剛好兩筆」的檢查就紅了）。**清理要跟著寫入的地方走。**
      await exec(`DELETE FROM hub_wording_edits WHERE org_id = ? AND term LIKE 'probe-word-%'`, [org.id]);
      await exec(
        `DELETE FROM hub_strategy_edits WHERE org_id = ? AND entity = 'wording' AND label LIKE 'probe-word-%'`,
        [org.id],
      );
    }
    const leftover = await q(`SELECT id FROM hub_wording WHERE org_id = ? AND term LIKE 'probe-word-%'`, [org.id]);
    check(leftover.length === 0, "probe left the wording lists as it found them", `${leftover.length} rows`);
  } catch (e: any) {
    bad("wording usage", e?.message ?? String(e));
  }

  const reps = await q(`SELECT id, name, market, line_user_id FROM hub_reps WHERE org_id = ? ORDER BY id`, [org.id]);
  check(reps.length > 0, "reps", `${reps.length}`);
  const markets = new Set(reps.map((r: any) => r.market));
  check(markets.has("TW") && markets.has("US"), "reps cover both markets", [...markets].join("/"));

  // ── 2. Compliance contract ──────────────────────────────────────────────────
  section("Compliance contract");
  for (const market of ["TW", "US"] as const) {
    const wording = await listWording(org.id, market);
    const ctx = complianceContextFor({
      market,
      solutions,
      facts,
      wording,
      trackedLink: `${publicBaseUrl()}/r/PROBE01`,
    });
    const issues = findIssues(BAD_DRAFTS[market], ctx);
    const hit = new Set(issues.map((i) => i.rule));
    const expected = ctx.pack.rules.map((r) => r.id);
    const missed = expected.filter((r) => !hit.has(r));
    check(missed.length === 0, `${market}: all ${expected.length} rules fire on a bad draft`, missed.length ? `silent: ${missed.join(", ")}` : [...hit].join(", "));

    const repaired = repairPost(BAD_DRAFTS[market], ctx);
    const left = findIssues(repaired.text, ctx);
    check(left.length === 0, `${market}: deterministic repair clears the draft`, left.length ? left.map((i) => i.rule).join(", ") : "");
    check(repaired.text.trim().length > 40, `${market}: repair leaves a usable post`, `${repaired.text.trim().length} chars`);
    if (repaired.text.includes("undefined") || repaired.text.includes("null")) {
      bad(`${market}: repair output is clean`, "contains undefined/null");
    } else {
      ok(`${market}: repair output is clean`);
    }
  }

  // ── 3. Admin app (the screens HQ clicks at the booth) ───────────────────────
  section("Admin API");
  const [adminUser] = await q(
    `SELECT id, email FROM users WHERE role = 'admin' OR email LIKE '%@sowork.tw' OR email LIKE '%@sowork.ai' ORDER BY id LIMIT 1`,
  );
  if (!adminUser) {
    bad("admin user exists", "no admin in users table — HQ cannot log in");
  } else {
    ok("admin user exists", adminUser.email);
    const caller = appRouter.createCaller({ user: { id: adminUser.id } } as any);
    const probes: Array<[string, () => Promise<any>, (r: any) => boolean, (r: any) => string]> = [
      ["overview", () => caller.hub.admin.overview(), (r) => r && typeof r === "object", (r) => JSON.stringify(r).slice(0, 90)],
      ["strategy", () => caller.hub.admin.strategy(), (r) => r?.solutions?.length > 0, (r) => `${r?.solutions?.length} solutions, ${r?.facts?.length} facts`],
      ["wording", () => caller.hub.admin.wording(), (r) => r?.items?.length > 0 && !!r?.legal?.TW && !!r?.legal?.US, (r) => `${r?.items?.length} editable, legal packs TW+US`],
      ["regulations", () => caller.hub.admin.regulations(), (r) => r?.items?.length > 0 && !!r?.coverage, (r) => `${r?.items?.length} updates, coverage for ${Object.keys(r?.coverage ?? {}).length}`],
      ["content", () => caller.hub.admin.content(), (r) => !!r, (r) => `${r?.skills?.length ?? 0} skills`],
      ["reps", () => caller.hub.admin.reps(), (r) => Array.isArray(r) ? r.length > 0 : r?.reps?.length > 0, (r) => `${(Array.isArray(r) ? r : r?.reps ?? []).length}`],
      ["performance", () => caller.hub.admin.performance(), (r) => !!r, (r) => JSON.stringify(r).slice(0, 90)],
      ["posts", () => caller.hub.admin.posts({ limit: 10 }), (r) => (Array.isArray(r) ? r : r?.posts ?? []).length > 0, (r) => `${(Array.isArray(r) ? r : r?.posts ?? []).length} rows`],
      ["feed", () => caller.hub.admin.feed({ sinceId: 0 }), (r) => !!r, () => ""],
      ["integrations", () => caller.hub.admin.integrations(), (r) => !!r, (r) => JSON.stringify(r).slice(0, 110)],
    ];
    for (const [name, run, valid, describe] of probes) {
      try {
        const r = await run();
        check(valid(r), `hub.admin.${name}`, describe(r));
      } catch (e: any) {
        bad(`hub.admin.${name}`, e?.message ?? String(e));
      }
    }

    // A post detail page is what CJ opens to show the six checks.
    const [somePost] = await q(`SELECT id FROM hub_posts ORDER BY id DESC LIMIT 1`);
    if (somePost) {
      try {
        const p = await caller.hub.admin.post({ postId: somePost.id });
        const checks = (p as any)?.compliance?.checks ?? [];
        check(checks.length === 6, "post detail shows six checks", `#${somePost.id} → ${checks.length}`);
        const withDraft = (p as any)?.firstDraft;
        check(!!withDraft, "post detail keeps the first draft (before/after)", withDraft ? `${String(withDraft).length} chars` : "missing");
      } catch (e: any) {
        bad("hub.admin.post", e?.message ?? String(e));
      }
    }

    // Booth QR + rep view.
    const repId = reps[0]?.id;
    if (repId) {
      try {
        const b = await caller.hub.admin.boothLink({ repId });
        check(!!b, "hub.admin.boothLink", JSON.stringify(b).slice(0, 90));
      } catch (e: any) {
        bad("hub.admin.boothLink", e?.message ?? String(e));
      }
    }

    // ── 4. LINE bot — six menu buttons, via the simulator path ────────────────
    section("LINE bot handlers");
    const bound = reps.find((r: any) => r.line_user_id) ?? reps[0];
    const botCtx = await simulatorContext(bound.id);
    check(!!botCtx?.rep, "simulator context resolves a rep", botCtx?.rep ? `${botCtx.rep.name} (${botCtx.rep.market})` : "none");
    for (const area of RICH_MENU_AREAS) {
      try {
        const msgs = await handleMenu(botCtx, area.action);
        check(Array.isArray(msgs) && msgs.length > 0, `menu: ${area.action}`, `${msgs.length} message(s) — ${area.en}`);
      } catch (e: any) {
        bad(`menu: ${area.action}`, e?.message ?? String(e));
      }
    }
    try {
      const msgs = await handleText(botCtx, "What should I say to a customer who thinks it is too expensive?");
      check(Array.isArray(msgs) && msgs.length > 0, "free-text question answered", `${msgs.length} message(s)`);
    } catch (e: any) {
      bad("free-text question answered", e?.message ?? String(e));
    }

    // ── 5. Rep app (LIFF pages, reached with an admin session in the booth) ───
    section("Rep API");
    try {
      const s = await caller.hub.rep.session({ repId: bound.id });
      check(s?.solutions?.length > 0 && s?.skills?.length >= 0, "hub.rep.session", `${s?.solutions?.length} solutions, ${s?.skills?.length} skills, pack ${(s as any)?.pack?.id}`);
    } catch (e: any) {
      bad("hub.rep.session", e?.message ?? String(e));
    }
    try {
      const r: any = await caller.hub.rep.checkDraft({ repId: bound.id, text: BAD_DRAFTS[bound.market] });
      const flagged = (r?.compliance?.checks ?? []).filter((c: any) => c.status !== "pass").length;
      check(flagged > 0, "hub.rep.checkDraft catches a bad draft", `${flagged}/6 not clean, verdict ${r?.compliance?.verdict}`);
    } catch (e: any) {
      bad("hub.rep.checkDraft", e?.message ?? String(e));
    }

    if (GENERATE) {
      section("Live generation");
      const t0 = Date.now();
      try {
        const g: any = await caller.hub.rep.generate({
          repId: bound.id,
          solutionId: solutions[0].id,
          channel: "linkedin",
        });
        const flagged = (g?.compliance?.checks ?? []).filter((c: any) => c.status === "flagged").length;
        check(g?.caption?.length > 80, "post generated", `#${g.postId} ${g.caption.length} chars in ${Date.now() - t0}ms via ${g.model}`);
        check(flagged === 0, "generated post ends compliant", `${flagged} still flagged`);
        check(!!g?.trackedLink, "tracked link attached", g?.trackedLink);
        notes.push(`generated demo post #${g.postId} in ${Date.now() - t0}ms — removed again by the cleanup step`);
      } catch (e: any) {
        bad("hub.rep.generate", e?.message ?? String(e));
      }
    }
  }

  // ── Product editing / approval (CJ 2026-09-23) ──────────────────────────────
  section("Product editing");
  try {
    const m = await import("../server/strategy/core/hub/solutionEdits");
    await m.ensureSolutionEditTables();

    // 這幾個欄位是「核准才生效」的前提 —— 少一個，編輯就會直接蓋掉正式內容。
    const cols = await q<{ COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'hub_solutions'`,
    );
    const have = new Set(cols.map((c) => String(c.COLUMN_NAME)));
    const need = ["pending", "pending_by", "pending_at", "updated_by", "updated_at", "created_by"];
    const missing = need.filter((c) => !have.has(c));
    check(missing.length === 0, "approval columns exist on hub_solutions", missing.join(", ") || need.length + " present");

    // 2026-09-23：這一段是被一次事故逼出來的。profile 欄位的 DDL 原本掛在請求
    // 路徑上，部署時的 seed 讀不到它，整個部署中止，站上留在上一版——而探針
    // 全綠，因為它根本沒有量過 profile。沒被量到的東西就是沒有上線。
    check(have.has("profile"), "profile column exists on hub_solutions", have.has("profile") ? "present" : "MISSING — the seed will abort the deploy");

    const { normaliseProfile, postSafeProfileLines, PROFILE_FIELDS } = await import("../server/strategy/core/hub/solutionProfile");
    const profileRows = await q<{ slug: string; profile: any }>(
      `SELECT slug, profile FROM hub_solutions WHERE org_id = ?`,
      [org.id],
    );
    const blank = profileRows
      .filter((r) => {
        const p = normaliseProfile(typeof r.profile === "string" ? JSON.parse(r.profile || "{}") : r.profile);
        return Object.keys(p).length === 0;
      })
      .map((r) => r.slug);
    check(
      blank.length === 0 && profileRows.length > 0,
      "every solution has a filled profile",
      blank.length ? `blank: ${blank.join(", ")}` : `${profileRows.length}/${profileRows.length}`,
    );

    // 不可進貼文的欄位（競品比較、未公布藍圖、ROI、專利賠償）不能從這支流出去。
    const sampleRaw = profileRows.find((r) => r.profile)?.profile;
    if (sampleRaw) {
      const sample = normaliseProfile(typeof sampleRaw === "string" ? JSON.parse(sampleRaw) : sampleRaw);
      const lines = postSafeProfileLines(sample, false).join("\n");
      const leaked = PROFILE_FIELDS.filter((f) => !f.postSafe && sample[f.key]?.en && lines.includes(sample[f.key]!.en.slice(0, 40)));
      check(leaked.length === 0, "post-unsafe profile fields stay out of the writer", leaked.map((f) => f.key).join(", ") || `${PROFILE_FIELDS.filter((f) => !f.postSafe).length} held back`);
    }

    const approvers = await m.listApprovers(org.id);
    check(true, "approver list", approvers.length ? approvers.map((a) => a.email).join(", ") : "empty — falls back to platform admins");

    // 名單空的時候只有管理員能核准；有名單的時候只認名單。兩條都驗。
    const adminCan = await m.canApprove(org.id, "nobody@example.com", true);
    const strangerCan = await m.canApprove(org.id, "nobody@example.com", false);
    if (approvers.length === 0) {
      check(adminCan && !strangerCan, "empty list falls back to platform admins only", `admin=${adminCan} stranger=${strangerCan}`);
    } else {
      check(!strangerCan, "a non-approver cannot approve", `stranger=${strangerCan}`);
    }

    // 2026-09-23 (CJ「做核准人名單的管理 UI」)。
    //
    // 那個 modal 上寫了三句警告，每一句都是對後端行為的斷言。文案寫得再清楚，
    // 如果行為其實不是那樣，就是把使用者騙進一個錯誤的心智模型。所以這裡真的
    // 加一個人進去量，量完拿掉。
    //
    // 只在名單本來就是空的時候跑 —— 不去動展場現場真的設好的設定。
    if (approvers.length === 0) {
      const ghost = `probe-ghost-${Date.now()}@example.invalid`;
      try {
        await m.addApprover(org.id, ghost, "hub-probe");
        const after = await m.listApprovers(org.id);
        const row = after.find((a) => a.email === ghost);

        // 警告三：email 打錯的那一列要看得出來沒有帳號。
        check(row != null && row.hasLogin === false, "an address with no account is flagged", `hasLogin=${row?.hasLogin}`);

        // 警告一：名單一有人，平台管理員就不再能核准 —— modal 上那句
        //「會把核准權從所有平台管理員手上拿走」講的就是這個。
        const adminNow = await m.canApprove(org.id, "nobody@example.com", true);
        check(!adminNow, "one entry takes approval away from platform admins", `admin=${adminNow}`);

        // 而名單上的人可以（大小寫不影響）。
        const ghostCan = await m.canApprove(org.id, ghost.toUpperCase(), false);
        check(ghostCan, "someone on the list can approve, case-insensitively", `listed=${ghostCan}`);
      } finally {
        const after = await m.listApprovers(org.id);
        for (const a of after.filter((x) => x.email.startsWith("probe-ghost-"))) {
          await m.removeApprover(org.id, a.id);
        }
      }
      const restored = await m.listApprovers(org.id);
      check(restored.length === 0, "probe left the approver list as it found it", `${restored.length} rows`);
      check(await m.canApprove(org.id, "nobody@example.com", true), "removing the last entry hands approval back to admins", "admin=true");
    }

    // diff 是審核的人唯一看得到的東西，算錯就是審了個假的差異。
    const noChange = m.diffFields({ name_en: "A", summary_en: "B" }, { name_en: "  A  " });
    check(noChange.length === 0, "whitespace-only edit is not a change", `${noChange.length}`);
    const realChange = m.diffFields({ name_en: "A", summary_en: "B" }, { summary_en: "C" });
    check(
      realChange.length === 1 && realChange[0]?.from === "B" && realChange[0]?.to === "C",
      "a real edit carries both sides",
      JSON.stringify(realChange),
    );

    const edits = await m.listEdits(org.id, undefined, 5);
    check(Array.isArray(edits), "edit log reads back", `${edits.length} recent`);
  } catch (e: any) {
    bad("product editing", e?.message ?? String(e));
  }

  // ── Brand assets (CJ 2026-09-22) ────────────────────────────────────────────
  section("Brand assets");
  try {
    const { listBrandAssets, approvedDestinations, activeQuietPeriods } = await import("../server/strategy/core/hub/brandAssets");
    const assets = await listBrandAssets(org.id);
    const byKind: Record<string, number> = {};
    for (const a of assets) byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
    check(assets.length > 0, "brand assets seeded", JSON.stringify(byKind));

    const dests = await approvedDestinations(org.id);
    check(dests.length > 0, "approved destinations reach the writer", dests.map((d) => d.label).join(", "));
    const badUrl = dests.filter((d) => !/^https?:\/\//.test(d.url)).map((d) => d.label);
    check(badUrl.length === 0, "every destination is an absolute URL", badUrl.join(", "));

    const quiet = await activeQuietPeriods(org.id);
    check(quiet.length > 0, "a quiet period is in effect today", quiet.map((q2) => `${q2.label} ${q2.startsOn}->${q2.endsOn}`).join("; "));
    const past = await activeQuietPeriods(org.id, "2020-01-01");
    check(past.length === 0, "the same window is inactive on an old date", `${past.length} active`);

    // 2026-09-22 (CJ「我只要你寫進入模擬的資料就好」): 客戶白名單改成填虛構客戶。
    // 顧慮只對真實公司名成立，所以驗的是「每一筆都標示了是示範／虛構」。
    const customers = assets.filter((a) => a.kind === "customer");
    check(customers.length > 0, "customer whitelist has demo entries", `${customers.length}`);

    // 2026-09-23 (CJ「會有權限和紀錄」)。品牌資料的核准閘門。
    //
    // 這裡有一個刻意的不對稱要驗：**許可等核准，限制立刻生效。** 導流目的地是
    // 「可以連去哪」，沒核准就先不算數（少講幾句，安全）；緘默期是「不可以發文」，
    // 沒核准就先不生效的話，錯的方向是在財報靜默期照常發文——那是這整套要防的事。
    const { isApproved } = await import("../server/strategy/core/hub/brandAssets");
    const unapproved = assets.filter((a) => !isApproved(a.payload));
    check(true, "brand entries waiting for approval",
      unapproved.length ? unapproved.map((a) => `${a.kind}#${a.id}`).join(", ") : "none — everything seeded is live");

    // 既有種子資料沒有這個旗標，一定要被當成已核准，否則寫作端會瞬間少掉素材。
    const seededLive = assets.filter((a) => a.payload?.approved === undefined);
    check(seededLive.every((a) => isApproved(a.payload)),
      "an entry with no approval flag counts as approved", `${seededLive.length} legacy rows stay live`);

    // 未核准的目的地不該出現在寫作端。
    const destLabels = new Set(dests.map((d) => d.label));
    const leaked = assets.filter((a) => a.kind === "destination" && !isApproved(a.payload) && destLabels.has(String(a.payload.label ?? "")));
    check(leaked.length === 0, "an unapproved destination never reaches the writer", leaked.map((a) => `#${a.id}`).join(", ") || "ok");
    const unlabelled = customers
      .filter((c) => !/示範|虛構|demo|fictional/i.test(String(c.payload.permission ?? "")))
      .map((c) => String(c.payload.name ?? "?"));
    check(unlabelled.length === 0, "every customer is labelled as a demo entry", unlabelled.join(", "));

    // 三段緘默期只有一段該生效 —— 那正是這張卡要示範的行為。
    check((byKind.quiet ?? 0) >= 3 && quiet.length === 1, "several windows on file, exactly one in effect", `${byKind.quiet ?? 0} on file, ${quiet.length} active`);
  } catch (e: any) {
    bad("brand assets", e?.message ?? String(e));
  }

  // ── 6. Tracked links ────────────────────────────────────────────────────────
  section("Tracked links");
  const repForLink = await getRep(reps[0].id);
  if (repForLink) {
    const code = await createLink(org.id, repForLink.id, "probe");
    createdCodes.push(code);
    const [row] = await q(`SELECT code, rep_id FROM hub_links WHERE code = ?`, [code]);
    check(row?.rep_id === repForLink.id, "createLink stores a resolvable code", `${publicBaseUrl()}/r/${code}`);
    const base = publicBaseUrl();
    check(/^https?:\/\//.test(base) && !base.endsWith("/"), "publicBaseUrl is a clean origin", base);
    if (base.includes("localhost")) notes.push(`publicBaseUrl is ${base} — QR codes will not work off this machine`);
  }

  // ── 7. Hermes ───────────────────────────────────────────────────────────────
  section("Hermes");
  const h = hermesStatus();
  console.log(`  info hermes: ${JSON.stringify(h)}`);
  if (!(h as any)?.configured) notes.push("Hermes is not configured — the bot answers through OnBrand's own model (planned fallback)");

  // ── 8. LINE credentials ─────────────────────────────────────────────────────
  section("LINE credentials");
  for (const k of ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN", "LINE_LIFF_ID", "LINE_LOGIN_CHANNEL_ID"]) {
    const present = Boolean(process.env[k]);
    console.log(`  ${present ? "ok  " : "info"} ${k}${present ? " set" : " not set"}`);
  }
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    notes.push("LINE is not connected — demo the bot with the on-screen simulator, not a phone");
  }

  // ── Cleanup: leave the demo database exactly as we found it ────────────────
  section("Cleanup");
  if (before.posts > 0 && before.events > 0) {
    const posts = await exec(`DELETE FROM hub_posts WHERE id > ?`, [before.posts]);
    const events = await exec(`DELETE FROM hub_events WHERE id > ?`, [before.events]);
    // Links come from two places: the ones we made by hand, and the one
    // generateRepPost attaches to the post it just wrote.
    const orphaned = await exec(`DELETE FROM hub_links WHERE post_id > ?`, [before.posts]);
    const mine = createdCodes.length
      ? await exec(`DELETE FROM hub_links WHERE code IN (${createdCodes.map(() => "?").join(",")})`, createdCodes)
      : { affectedRows: 0 };
    const links = { affectedRows: orphaned.affectedRows + mine.affectedRows };
    console.log(`  ok   removed probe rows  ${posts.affectedRows} post(s), ${events.affectedRows} event(s), ${links.affectedRows} link(s)`);
  } else {
    console.log("  info skipped cleanup — empty tables, nothing to key off");
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(64)}`);
  console.log(`${passed} passed, ${failed} failed`);
  for (const n of notes) console.log(`note: ${n}`);
  process.exit(failed);
}

main().catch((e) => {
  console.error("probe crashed:", e?.stack ?? e);
  process.exit(99);
});
