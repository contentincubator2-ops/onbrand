/**
 * Sales Hub — idempotent seed + synthetic history for the concept demo.
 *
 * Real inputs: positioning, facts, skills, solutions (all sourced).
 * Synthetic (is_demo = 1): reps and 21 days of posts / clicks / metrics, so the
 * dashboard has a shape before the booth adds live rows on top.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureHubTables } from "../../../platform/core/hub/hubDdl";
import { exec, getOrg, listReps, listSolutions, q, ymd } from "../../../platform/core/hub/hubStore";
import { HUB_FACTS, HUB_ORG, HUB_REGULATIONS, HUB_REPS, HUB_SKILLS, HUB_WORDING } from "./hubSeedData";

const here = dirname(fileURLToPath(import.meta.url));

interface SolutionSeed {
  slug: string;
  name_zh: string;
  name_en: string;
  vendor: string;
  category: string;
  industries: string[];
  summary_zh: string;
  summary_en: string;
  features: Array<{ zh: string; en: string }>;
  audience_zh?: string;
  audience_en?: string;
  prices: Array<{ plan_zh: string; plan_en: string; amount: number | null; billing: string; starts_from: boolean }>;
  source_url: string;
  featured?: boolean;
}

export function loadSolutionSeeds(): SolutionSeed[] {
  const file = join(here, "hubSolutions.json");
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, "utf8"));
}

export async function seedHub(opts: { reset?: boolean } = {}) {
  await ensureHubTables();

  if (opts.reset) {
    const [org] = await q(`SELECT id FROM hub_org WHERE slug = ?`, [HUB_ORG.slug]);
    if (org) {
      for (const t of ["hub_events", "hub_metrics", "hub_clicks", "hub_links", "hub_posts", "hub_skills", "hub_facts", "hub_reps", "hub_wording", "hub_regulations"]) {
        await exec(`DELETE FROM ${t} WHERE org_id = ?`, [org.id]);
      }
      await exec(`DELETE p FROM hub_prices p JOIN hub_solutions s ON s.id = p.solution_id WHERE s.org_id = ?`, [org.id]);
      await exec(`DELETE FROM hub_solutions WHERE org_id = ?`, [org.id]);
    }
  }

  await exec(
    `INSERT INTO hub_org (slug, name, disclaimer, positioning, landing_url) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), disclaimer = VALUES(disclaimer), positioning = VALUES(positioning), landing_url = VALUES(landing_url)`,
    [HUB_ORG.slug, HUB_ORG.name, HUB_ORG.disclaimer, JSON.stringify(HUB_ORG.positioning), HUB_ORG.landingUrl],
  );
  const org = await getOrg(HUB_ORG.slug);

  // Facts: replace wholesale (they're small and fully owned by the seed).
  await exec(`DELETE FROM hub_facts WHERE org_id = ?`, [org.id]);
  for (const f of HUB_FACTS) {
    await exec(
      `INSERT INTO hub_facts (org_id, kind, market, statement_en, statement_zh, figures, source_name, source_url,
         published_on, confidence, industries, expires_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [org.id, f.kind, f.market, f.statement_en, f.statement_zh, JSON.stringify(f.figures), f.source_name, f.source_url,
       f.published_on, f.confidence, JSON.stringify(f.industries ?? []), f.expires_on ?? null],
    );
  }

  for (const s of HUB_SKILLS) {
    await exec(
      `INSERT INTO hub_skills (org_id, slug, name_en, name_zh, channels, markets, skill_md, status, approved_by, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name_en = VALUES(name_en), name_zh = VALUES(name_zh), channels = VALUES(channels),
         markets = VALUES(markets), skill_md = VALUES(skill_md)`,
      [org.id, s.slug, s.name_en, s.name_zh, JSON.stringify(s.channels), JSON.stringify(s.markets), s.skill_md, s.status,
       s.status === "approved" ? "Marketing · Content Lead" : null, s.status === "approved" ? new Date() : null],
    );
  }

  // Wording: insert-only, so terms marketing adds or removes at the booth survive redeploys.
  for (const w of HUB_WORDING) {
    await exec(
      `INSERT IGNORE INTO hub_wording (org_id, market, kind, term, replacement, note, added_by) VALUES (?, ?, ?, ?, ?, ?, 'Marketing · Brand Lead')`,
      [org.id, w.market, w.kind, w.term, w.replacement ?? null, w.note ?? null],
    );
  }

  await exec(`DELETE FROM hub_regulations WHERE org_id = ?`, [org.id]);
  for (const r of HUB_REGULATIONS) {
    await exec(
      `INSERT INTO hub_regulations (org_id, market, authority, title, name_en, name_zh, change_en, change_zh,
         summary, summary_zh, impact, impact_zh, rules, status, effective_on, published_on, source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [org.id, r.market, r.authority, r.title, r.name.en, r.name.zh, r.change.en, r.change.zh,
       r.summary, r.summaryZh, r.impact, r.impactZh, JSON.stringify(r.rules), r.status,
       r.effective_on, r.published_on, r.source_url],
    );
  }

  // 2026-09-22 (CJ 品牌頁): 操作性品牌資料。只在該類別還完全沒資料時寫入，
  // 所以展場上手改過的內容不會被下一次部署的 hub-seed 蓋掉。
  {
    const { seedBrandAssets } = await import("./brandAssetSeed");
    const r = await seedBrandAssets(org.id).catch((e) => {
      console.warn("[hub-seed] brand assets skipped:", e?.message ?? e);
      return { added: 0, skipped: 0, removed: 0 };
    });
    console.log(`[hub-seed] brand assets: +${r.added} added, ${r.skipped} left alone, ${r.removed} stale removed`);
  }

  const solutions = loadSolutionSeeds();
  for (const s of solutions) {
    await exec(
      `INSERT INTO hub_solutions (org_id, slug, name_en, name_zh, vendor, category, industries, summary_en, summary_zh, features,
         audience_en, audience_zh, source_url, featured, is_asus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name_en = VALUES(name_en), name_zh = VALUES(name_zh), vendor = VALUES(vendor),
         category = VALUES(category), industries = VALUES(industries), summary_en = VALUES(summary_en),
         summary_zh = VALUES(summary_zh), features = VALUES(features), audience_en = VALUES(audience_en),
         audience_zh = VALUES(audience_zh), source_url = VALUES(source_url), featured = VALUES(featured), is_asus = VALUES(is_asus)`,
      [org.id, s.slug, s.name_en, s.name_zh, s.vendor, s.category, JSON.stringify(s.industries ?? []), s.summary_en, s.summary_zh,
       JSON.stringify(s.features ?? []), s.audience_en ?? null, s.audience_zh ?? null, s.source_url, s.featured ? 1 : 0,
       /asus|華碩/i.test(s.vendor) ? 1 : 0],
    );
    const [row] = await q(`SELECT id FROM hub_solutions WHERE org_id = ? AND slug = ?`, [org.id, s.slug]);
    await exec(`DELETE FROM hub_prices WHERE solution_id = ?`, [row.id]);
    for (const p of s.prices ?? []) {
      await exec(
        `INSERT INTO hub_prices (solution_id, plan_en, plan_zh, amount, currency, billing, starts_from, effective_from, source_url)
         VALUES (?, ?, ?, ?, 'TWD', ?, ?, '2026-09-16', ?)`,
        [row.id, p.plan_en, p.plan_zh, p.amount, p.billing, p.starts_from ? 1 : 0, s.source_url],
      );
    }
  }

  // 2026-09-23 (CJ「DEMO 頁面請都先幫我寫好」): 產品 profile。
  // 只在該方案還沒有 profile 時寫入——展場上改過的不會被下次部署蓋掉。
  {
    const { SOLUTION_PROFILES, fallbackProfile } = await import("./solutionProfileSeed");
    const { normaliseProfile } = await import("./solutionProfile");
    let filled = 0;
    for (const row of await q(`SELECT id, slug, name_en, name_zh, profile FROM hub_solutions WHERE org_id = ?`, [org.id])) {
      const existing = normaliseProfile(typeof row.profile === "string" ? JSON.parse(row.profile || "{}") : row.profile);
      if (Object.keys(existing).length) continue;
      const seed = SOLUTION_PROFILES[row.slug] ?? fallbackProfile(row.name_en, row.name_zh);
      await exec(`UPDATE hub_solutions SET profile = ? WHERE id = ?`, [JSON.stringify(normaliseProfile(seed)), row.id]);
      filled++;
    }
    console.log(`[hub-seed] solution profiles: ${filled} filled`);
  }

  const existingReps = await listReps(org.id);
  for (const r of HUB_REPS) {
    if (existingReps.some((e) => e.avatarSeed === r.seed)) continue;
    await exec(
      `INSERT INTO hub_reps (org_id, market, name, title, team, avatar_seed, consent_at, linkedin_status, instagram_status,
         facebook_status, network_size, industries, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [org.id, r.market, r.name, r.title, r.team, r.seed, r.consent ? new Date(Date.now() - 30 * 86_400_000) : null,
       r.linkedin, r.instagram, r.facebook, r.networkSize, JSON.stringify(r.industries ?? [])],
    );
  }

  /**
   * 既有業務的產業標籤回填（CJ 2026-09-23）。
   *
   * 上面那個迴圈刻意跳過已存在的業務，而且必須繼續跳過——業務身上帶著展場現場
   * 綁定的 LINE 帳號（line_user_id / bind_code / mcp_token_hash / consent_at），
   * 重新插入會把綁定弄丟。
   *
   * 但那也表示新增的 industries 欄位對既有的人永遠是 NULL，而**沒標產業的人
   * 會收到全部的消息**——配對等於沒有作用。探針抓到的就是這個（0/11 有標，
   * 每位台灣業務都收到一模一樣的 7 則）。
   *
   * 所以只補那一欄，而且只在它還是空的時候補：展場上手動改過的分工不會被
   * 下一次部署蓋掉。
   */
  {
    let filled = 0;
    for (const r of HUB_REPS) {
      const { affectedRows } = await exec(
        `UPDATE hub_reps SET industries = ?
          WHERE org_id = ? AND avatar_seed = ?
            AND (industries IS NULL OR JSON_LENGTH(industries) = 0)`,
        [JSON.stringify(r.industries ?? []), org.id, r.seed],
      );
      filled += affectedRows;
    }
    console.log(`[hub-seed] rep industry coverage: ${filled} backfilled`);
  }

  // 2026-10-04：示範業務的履歷與個人寫法。同樣只補空的——理由同上。
  {
    const { DEMO_REP_PROFILES } = await import("../../../platform/core/hub/repProfile");
    let filled = 0;
    for (const [seed, profile] of Object.entries(DEMO_REP_PROFILES)) {
      const { affectedRows } = await exec(
        `UPDATE hub_reps SET profile = ? WHERE org_id = ? AND avatar_seed = ? AND profile IS NULL`,
        [JSON.stringify(profile), org.id, seed],
      );
      filled += affectedRows;
    }
    console.log(`[hub-seed] rep profiles: ${filled} filled`);
  }

  /**
   * 2026-09-23：把產品與用詞的舊紀錄表併進通用的 hub_strategy_edits。
   *
   * 每次部署都跑，但靠 (org_id, entity, legacy_id) 的唯一鍵只會搬一次——
   * **一次性的腳本最後總是會被跑第二次**，與其靠紀律不如靠資料庫。
   * 舊表留著不刪：刪稽核紀錄是不可逆的。
   */
  {
    // 2026-09-24：LINE 綁定鏡射進通路身分對照表。可重複執行。
    const { backfillLineIdentities } = await import("../../../platform/core/hub/channelIdentity");
    const n = await backfillLineIdentities(org.id).catch((e) => {
      console.warn("[hub-seed] line identity backfill skipped:", e?.message ?? e);
      return 0;
    });
    console.log(`[hub-seed] channel identities: +${n} line`);
  }

  {
    const { migrateLegacyEdits } = await import("./strategyEdits");
    const moved = await migrateLegacyEdits(org.id);
    console.log(`[hub-seed] legacy edit history: +${moved.solutions} solution, +${moved.wording} wording`);
  }

  return {
    orgId: org.id, facts: HUB_FACTS.length, skills: HUB_SKILLS.length, solutions: solutions.length,
    reps: HUB_REPS.length, wording: HUB_WORDING.length, regulations: HUB_REGULATIONS.length,
  };
}

// ── synthetic history ───────────────────────────────────────────────────────

/**
 * A plausible pre-check draft for a history post whose report says rules were
 * fixed: put back what the checker would have removed, so HQ's before/after
 * view shows the kind of draft reps actually write.
 */
function messyDraft(clean: string, rules: Set<string>, market: "TW" | "US", code: string): string {
  const zh = market === "TW";
  let t = clean;
  if (rules.has("disclosure")) {
    t = t.replace(
      /我(在|任職於)華碩\s?(ExpertHub\s?)?服務[，。、]?|（我任職於華碩 ASUS，本文為個人分享）\n?|Disclosure: I work at ASUS\. Views are my own\.\n*|I work at ASUS[,.]?\s*(and\s+)?/g,
      "",
    );
  }
  if (rules.has("link")) {
    t = t.replace(new RegExp(`https?://\\S*/r/${code}`, "g"), "https://experthub.asus.com/smb");
  }
  if (rules.has("claims")) t = (zh ? "保證有效！" : "Guaranteed results! ") + t;
  if (rules.has("price")) t = `${t.trimEnd()}\n${zh ? "現在只要 NT$499/月！" : "Now only $299/month!"}`;
  if (rules.has("evidence")) t = `${t.trimEnd()}\n${zh ? "導入後營收平均成長 35%。" : "Customers see 35% more revenue on average."}`;
  if (rules.has("competitors")) t = `${t.trimEnd()}\n${zh ? "比中華電信的方案更划算。" : "Better value than Microsoft's bundle."}`;
  return t;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Back-fills 21 days of posts/clicks/metrics for the fictional reps. Captions
 * are copied from real generated sample posts (see scripts/hub-seed.ts
 * --samples), so what HQ reads in "recent posts" is genuine model output.
 */
export async function backfillHistory() {
  const org = await getOrg(HUB_ORG.slug);
  await exec(`DELETE FROM hub_metrics WHERE org_id = ? AND is_demo = 1`, [org.id]);
  await exec(`DELETE FROM hub_clicks WHERE org_id = ? AND is_demo = 1`, [org.id]);
  await exec(`DELETE FROM hub_events WHERE org_id = ? AND is_demo = 1`, [org.id]);
  await exec(`DELETE l FROM hub_links l JOIN hub_posts p ON p.id = l.post_id WHERE p.org_id = ? AND p.is_demo = 1 AND p.source = 'backfill'`, [org.id]);
  await exec(`DELETE FROM hub_posts WHERE org_id = ? AND is_demo = 1 AND source = 'backfill'`, [org.id]);

  const samples = await q(`SELECT * FROM hub_posts WHERE org_id = ? AND source = 'sample'`, [org.id]);
  if (!samples.length) throw new Error("no sample posts — run scripts/hub-seed.ts --samples first");
  const reps = (await listReps(org.id)).filter((r) => r.isDemo && r.consentAt);
  const solutions = await listSolutions(org.id);
  const rand = mulberry32(20260916);
  const pickOne = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const DAY = 86_400_000;
  let posts = 0, clicks = 0;

  for (const rep of reps) {
    const channels = [
      ...(rep.market === "TW" ? ["facebook", "facebook", "line"] : []),
      "linkedin", "linkedin",
      ...(rep.instagramStatus === "connected" ? ["instagram"] : []),
    ];
    const activity = 0.25 + rand() * 0.35; // chance of posting on a given day
    for (let daysAgo = 20; daysAgo >= 1; daysAgo--) {
      if (rand() > activity) continue;
      const channel = pickOne(channels);
      const sample = samples.find((s) => s.market === rep.market && s.channel === channel)
        ?? samples.find((s) => s.market === rep.market) ?? samples[0];
      const at = new Date(Date.now() - daysAgo * DAY + Math.floor(rand() * 9) * 3_600_000);
      const code = `d${rep.id.toString(36)}${daysAgo.toString(36)}${Math.floor(rand() * 1296).toString(36)}`.slice(0, 12);
      const verdict = rand() < 0.62 ? "clean" : rand() < 0.93 ? "auto_fixed" : "needs_review";
      // The sample's own report is clean; give non-clean history posts a report
      // whose checks agree with their verdict, weighted like real rep drafts
      // (missing disclosure and untracked links are the common misses).
      // mysql2 returns JSON columns already parsed and shared across loops — clone before editing.
      const report = structuredClone(typeof sample.compliance === "string" ? JSON.parse(sample.compliance) : sample.compliance);
      let hit = new Set<string>();
      if (verdict !== "clean") {
        const weights: Array<[string, number]> = [["disclosure", 0.34], ["link", 0.24], ["claims", 0.18], ["price", 0.12], ["evidence", 0.08], ["competitors", 0.04]];
        const pickRule = () => { let r = rand(); for (const [id, w] of weights) { if ((r -= w) <= 0) return id; } return "disclosure"; };
        hit = new Set([pickRule(), ...(rand() < 0.35 ? [pickRule()] : [])]);
        report.verdict = verdict;
        report.issuesCaught = hit.size;
        report.checks = report.checks.map((c: any) =>
          hit.has(c.rule)
            ? { ...c, status: verdict === "needs_review" ? "flagged" : "fixed", detail: verdict === "needs_review" ? "Held for marketing review." : "Auto-corrected before sharing." }
            : c,
        );
      }
      const { insertId: postId } = await exec(
        `INSERT INTO hub_posts (org_id, rep_id, solution_id, skill_id, channel, market, first_draft, caption, compliance, verdict,
           short_code, status, source, model, latency_ms, is_demo, created_at, shared_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'shared', 'backfill', ?, ?, 1, ?, ?)`,
        [org.id, rep.id, sample.solution_id ?? pickOne(solutions)?.id ?? null, sample.skill_id, channel, rep.market,
         // The sample's caption carries the sample's own tracked link; swap in this post's code so a
         // click on a history post is credited to the right rep and post.
         verdict === "clean"
           ? String(sample.first_draft ?? "").split(`/r/${sample.short_code}`).join(`/r/${code}`)
           : messyDraft(String(sample.caption).split(`/r/${sample.short_code}`).join(`/r/${code}`), hit, rep.market, code),
         String(sample.caption).split(`/r/${sample.short_code}`).join(`/r/${code}`),
         JSON.stringify(report),
         verdict, code, sample.model, sample.latency_ms, at, new Date(at.getTime() + 20 * 60_000)],
      );
      await exec(`INSERT IGNORE INTO hub_links (code, org_id, rep_id, post_id, channel, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [code, org.id, rep.id, postId, channel, at]);
      posts++;

      // Metrics by what the platform actually allows.
      const reach = rep.networkSize * (0.2 + rand() * 0.7);
      let grade: string;
      if (channel === "linkedin") grade = rep.linkedinStatus === "connected" ? "verified" : "estimated";
      else if (channel === "instagram") grade = "verified";
      else if (channel === "facebook") grade = rand() < 0.55 ? "self_reported" : "estimated";
      else grade = "tracked";
      const impressions = grade === "tracked" ? 0 : Math.round(reach);
      const engagements = grade === "tracked" ? 0 : Math.round(reach * (0.012 + rand() * 0.04));
      const leads = rand() < 0.18 ? 1 + Math.floor(rand() * 2) : 0;
      const capturedOn = new Date(at.getTime() + 2 * DAY);
      if (capturedOn.getTime() < Date.now()) {
        await exec(
          `INSERT INTO hub_metrics (org_id, rep_id, post_id, channel, grade, impressions, engagements, leads, is_demo, captured_on)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [org.id, rep.id, postId, channel, grade, impressions, engagements, leads, ymd(capturedOn)],
        );
      }
      const clickCount = Math.round((channel === "line" ? rep.networkSize * 0.02 : reach * 0.008) * (0.5 + rand()));
      for (let i = 0; i < clickCount; i++) {
        const t = new Date(at.getTime() + Math.floor(rand() * 3 * DAY));
        if (t.getTime() > Date.now()) continue;
        await exec(`INSERT INTO hub_clicks (org_id, code, rep_id, post_id, is_demo, created_at) VALUES (?, ?, ?, ?, 1, ?)`,
          [org.id, code, rep.id, postId, t]);
        clicks++;
      }
      if (daysAgo <= 2) {
        await exec(`INSERT INTO hub_events (org_id, rep_id, kind, detail, is_demo, created_at) VALUES (?, ?, 'post_shared', ?, 1, ?)`,
          [org.id, rep.id, `${channel} · ${verdict}`, at]);
      }
    }
  }
  return { posts, clicks };
}
