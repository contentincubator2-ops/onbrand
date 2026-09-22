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

  const approved = skills.filter((s) => s.status === "approved");
  check(approved.length > 0, "approved writing skills", `${approved.length}/${skills.length}`);
  check(regs.length > 0, "regulation entries", `${regs.length}`);

  for (const market of ["TW", "US"]) {
    const w = await listWording(org.id, market);
    check(w.length > 0, `wording lists (${market})`, `${w.length}`);
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
      ["regulations", () => caller.hub.admin.regulations(), (r) => Array.isArray(r) ? r.length > 0 : r?.items?.length > 0, (r) => `${(Array.isArray(r) ? r : r?.items ?? []).length}`],
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

    // 客戶白名單刻意留空 —— 編一筆就等於編造客戶關係。
    check((byKind.customer ?? 0) === 0, "customer whitelist is deliberately empty", `${byKind.customer ?? 0} entries`);
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
