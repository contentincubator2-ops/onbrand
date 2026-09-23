/**
 * Sales Hub tRPC router (`hub.*`).
 *
 * admin.*  HQ / marketing web app — adminProcedure (role admin or company domain).
 * rep.*    the rep's LIFF pages. Identity is a LINE ID token verified server-side,
 *          or an admin session impersonating a rep for the booth simulator.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { join } from "node:path";
import { adminProcedure, publicProcedure, router } from "../core/trpc";
import {
  exec,
  getOrg,
  getRep,
  getRepByLineUser,
  issueBindCode,
  issueMcpToken,
  listFacts,
  listSkills,
  listSolutions,
  logEvent,
  q,
  type HubRep,
} from "../core/hub/hubStore";
import { POLICY_PACKS, publicPack } from "../../content/core/hub/policyPacks";

const channel = z.enum(["linkedin", "facebook", "instagram", "line"]);

async function isAdminUser(userId: number | undefined): Promise<boolean> {
  if (!userId) return false;
  const [u] = await q(`SELECT role, email FROM users WHERE id = ? LIMIT 1`, [userId]);
  return Boolean(u && (u.role === "admin" || /@sowork\.(tw|ai)$/i.test(String(u.email ?? ""))));
}

const repIdentity = z.object({
  idToken: z.string().min(10).optional(),
  repId: z.number().int().positive().optional(),
});

/** LIFF ID token → rep, or admin session + repId (simulator). */
async function resolveRep(ctx: { user: { id: number } | null }, input: z.infer<typeof repIdentity>): Promise<HubRep> {
  if (input.idToken) {
    const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
    if (!clientId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "LINE login is not configured" });
    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: input.idToken, client_id: clientId }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || !body?.sub) throw new TRPCError({ code: "UNAUTHORIZED", message: "LINE session expired — reopen from the LINE menu" });
    const rep = await getRepByLineUser(body.sub);
    if (!rep) throw new TRPCError({ code: "FORBIDDEN", message: "This LINE account isn't linked to a rep yet — send your binding code to the bot." });
    return rep;
  }
  if (input.repId && (await isAdminUser(ctx.user?.id))) {
    const rep = await getRep(input.repId);
    if (rep) return rep;
  }
  throw new TRPCError({ code: "UNAUTHORIZED", message: "Open this page from the LINE menu" });
}

const adminRouter = router({
  overview: adminProcedure.query(async () => {
    const org = await getOrg();
    const { getOverview } = await import("../../performance/core/hub/hubStats");
    return { org: { name: org.name, disclaimer: org.disclaimer }, overview: await getOverview(org.id) };
  }),

  feed: adminProcedure.input(z.object({ sinceId: z.number().int().min(0).default(0) })).query(async ({ input }) => {
    const org = await getOrg();
    const { getLiveFeed } = await import("../../performance/core/hub/hubStats");
    return getLiveFeed(org.id, input.sinceId);
  }),

  strategy: adminProcedure.query(async () => {
    const org = await getOrg();
    const [solutions, facts] = await Promise.all([listSolutions(org.id), listFacts(org.id)]);
    return { positioning: org.positioning, solutions, facts, disclaimer: org.disclaimer };
  }),

  wording: adminProcedure.query(async () => {
    const org = await getOrg();
    const { listWording } = await import("../core/hub/hubStore");
    const { POLICY_PACKS: packs, publicPack: view } = await import("../../content/core/hub/policyPacks");
    return {
      items: await listWording(org.id),
      // Legal claim rules live in code (policy packs) — shown read-only beside marketing's list.
      legal: { TW: view(packs.TW).blockedWording, US: view(packs.US).blockedWording },
    };
  }),

  addWording: adminProcedure
    .input(z.object({
      market: z.enum(["TW", "US"]),
      kind: z.enum(["preferred", "swap", "banned"]),
      term: z.string().trim().min(1).max(120),
      replacement: z.string().trim().max(160).optional(),
      note: z.string().trim().max(300).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.kind === "swap" && !input.replacement) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A swap needs the word to use instead" });
      }
      const org = await getOrg();
      const [u] = await q(`SELECT email FROM users WHERE id = ?`, [ctx.user.id]);
      await exec(
        `INSERT INTO hub_wording (org_id, market, kind, term, replacement, note, added_by) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE replacement = VALUES(replacement), note = VALUES(note), added_by = VALUES(added_by)`,
        [org.id, input.market, input.kind, input.term, input.replacement || null, input.note || null, u?.email ?? "admin"],
      );
      await logEvent(org.id, null, "wording_added", `${input.kind} · ${input.market} · ${input.term}`);
      return { ok: true };
    }),

  removeWording: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const org = await getOrg();
    const [w] = await q(`SELECT kind, market, term FROM hub_wording WHERE id = ? AND org_id = ?`, [input.id, org.id]);
    await exec(`DELETE FROM hub_wording WHERE id = ? AND org_id = ?`, [input.id, org.id]);
    if (w) await logEvent(org.id, null, "wording_removed", `${w.kind} · ${w.market} · ${w.term}`);
    return { ok: true };
  }),

  /**
   * 品牌頁的操作性資料（導流目的地／識別寫法／官方帳號／客戶白名單／緘默期）。
   * 五類共用一組 CRUD —— 它們的差別只在表單欄位，那是前端的事。
   */
  /**
   * 產品描述的編輯／核准／紀錄（CJ 2026-09-23）。
   *
   * 編輯不直接改正式欄位——提案存在 pending，核准才合併過去。業務與 AI 讀到的
   * 永遠是已核准的版本，否則「核准」就只是個沒有作用的按鈕。
   */
  solutionEditing: adminProcedure.query(async ({ ctx }) => {
    const org = await getOrg();
    const m = await import("../../strategy/core/hub/solutionEdits");
    await m.ensureSolutionEditTables();
    const [u] = await q(`SELECT email, role FROM users WHERE id = ? LIMIT 1`, [ctx.user.id]);
    const email = String(u?.email ?? "");
    return {
      me: email,
      canApprove: await m.canApprove(org.id, email, u?.role === "admin"),
      approvers: await m.listApprovers(org.id),
      history: await m.listEdits(org.id, undefined, 60),
    };
  }),

  solutionHistory: adminProcedure
    .input(z.object({ solutionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const org = await getOrg();
      const m = await import("../../strategy/core/hub/solutionEdits");
      await m.ensureSolutionEditTables();
      return { history: await m.listEdits(org.id, input.solutionId, 50) };
    }),

  editSolution: adminProcedure
    .input(z.object({
      solutionId: z.number().int().positive(),
      // 2026-09-23 (CJ「編輯的功能，要可以編輯產品現在呈現的每個欄位」)。
      fields: z.object({
        name_en: z.string().max(160).optional(),
        name_zh: z.string().max(160).optional(),
        vendor: z.string().max(160).optional(),
        category: z.string().max(80).optional(),
        summary_en: z.string().max(4000).optional(),
        summary_zh: z.string().max(4000).optional(),
        audience_en: z.string().max(300).optional(),
        audience_zh: z.string().max(300).optional(),
        source_url: z.string().max(500).optional(),
        featured: z.string().max(1).optional(),
      }),
      features: z.array(z.object({ en: z.string().max(400), zh: z.string().max(400) })).max(20).optional(),
      prices: z.array(z.object({
        planEn: z.string().max(120),
        planZh: z.string().max(120),
        // 一個明確的 null 代表「客製化報價」。0 絕對不能當成價格存進去 ——
        // 0 進了核准金額清單，業務寫「$0」就會通過價格檢查。
        amount: z.number().int().min(1).max(100_000_000).nullable(),
        billing: z.enum(["month", "year", "one_time", "quote"]),
        startsFrom: z.boolean(),
      })).max(12).optional(),
      // 2026-09-23 CJ 的四組 B2B 欄位。鍵值由 solutionProfile.PROFILE_KEYS 決定，
      // 這裡收下整包再由 normaliseProfile 把不認識的鍵丟掉。
      profile: z.record(z.string(), z.object({
        en: z.string().max(2000),
        zh: z.string().max(2000),
        source: z.enum(["listing", "demo"]).optional(),
      })).optional(),
      note: z.string().max(400).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const org = await getOrg();
      const m = await import("../../strategy/core/hub/solutionEdits");
      await m.ensureSolutionEditTables();
      const [u] = await q(`SELECT email FROM users WHERE id = ? LIMIT 1`, [ctx.user.id]);
      const r = await m.proposeEdit({
        orgId: org.id, solutionId: input.solutionId, actor: String(u?.email ?? `user:${ctx.user.id}`),
        proposed: input.fields, features: input.features, prices: input.prices, profile: input.profile, note: input.note,
      });
      await logEvent(org.id, null, "solution_edit_proposed", `#${input.solutionId} · ${r.changed} field(s)`);
      return r;
    }),

  approveSolutionEdit: adminProcedure
    .input(z.object({ solutionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const org = await getOrg();
      const m = await import("../../strategy/core/hub/solutionEdits");
      await m.ensureSolutionEditTables();
      const [u] = await q(`SELECT email, role FROM users WHERE id = ? LIMIT 1`, [ctx.user.id]);
      const email = String(u?.email ?? "");
      if (!(await m.canApprove(org.id, email, u?.role === "admin"))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not on the approver list for this organisation." });
      }
      try {
        const r = await m.approveEdit({ orgId: org.id, solutionId: input.solutionId, actor: email });
        await logEvent(org.id, null, "solution_edit_approved", `#${input.solutionId} · ${r.applied} field(s)`);
        return r;
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: String(e?.message ?? e) });
      }
    }),

  rejectSolutionEdit: adminProcedure
    .input(z.object({ solutionId: z.number().int().positive(), note: z.string().max(400).optional() }))
    .mutation(async ({ ctx, input }) => {
      const org = await getOrg();
      const m = await import("../../strategy/core/hub/solutionEdits");
      await m.ensureSolutionEditTables();
      const [u] = await q(`SELECT email, role FROM users WHERE id = ? LIMIT 1`, [ctx.user.id]);
      const email = String(u?.email ?? "");
      if (!(await m.canApprove(org.id, email, u?.role === "admin"))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not on the approver list for this organisation." });
      }
      await m.rejectEdit({ orgId: org.id, solutionId: input.solutionId, actor: email, note: input.note });
      await logEvent(org.id, null, "solution_edit_rejected", `#${input.solutionId}`);
      return { ok: true };
    }),

  createSolution: adminProcedure
    .input(z.object({
      nameEn: z.string().min(2).max(160),
      nameZh: z.string().min(1).max(160),
      vendor: z.string().min(2).max(160),
      category: z.string().min(2).max(80),
      summaryEn: z.string().min(20).max(4000),
      summaryZh: z.string().min(10).max(4000),
      sourceUrl: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const org = await getOrg();
      const m = await import("../../strategy/core/hub/solutionEdits");
      await m.ensureSolutionEditTables();
      const [u] = await q(`SELECT email FROM users WHERE id = ? LIMIT 1`, [ctx.user.id]);
      const r = await m.createSolution({ orgId: org.id, actor: String(u?.email ?? `user:${ctx.user.id}`), ...input });
      await logEvent(org.id, null, "solution_created", `${input.nameEn} — ${input.vendor}`);
      return r;
    }),

  draftSolutionCopy: adminProcedure
    .input(z.object({
      name: z.string().max(160).default(""),
      vendor: z.string().max(160).default(""),
      notes: z.string().min(15).max(2000),
    }))
    .mutation(async ({ input }) => {
      const { draftSolutionCopy } = await import("../../strategy/core/hub/draftSolutionCopy");
      try {
        return await draftSolutionCopy(input);
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: String(e?.message ?? e) });
      }
    }),

  /** 替某一個 profile 欄位補寫。只用這個產品已核准的內容 + 使用者的筆記。 */
  draftProfileField: adminProcedure
    .input(z.object({
      solutionId: z.number().int().positive(),
      fieldKey: z.string().max(40),
      notes: z.string().max(2000).default(""),
      language: z.enum(["zh-TW", "en-US"]).default("zh-TW"),
    }))
    .mutation(async ({ input }) => {
      const org = await getOrg();
      const { profileField } = await import("../../strategy/core/hub/solutionProfile");
      const field = profileField(input.fieldKey);
      if (!field) throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown field '${input.fieldKey}'.` });

      const sol = (await listSolutions(org.id)).find((s) => s.id === input.solutionId);
      if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solution not found." });

      const zh = input.language === "zh-TW";
      const { formatPrice: fmtPrice } = await import("../core/hub/hubStore");
      const { draftProfileField } = await import("../../strategy/core/hub/draftSolutionCopy");
      try {
        return await draftProfileField({
          fieldKey: field.key,
          ask: zh ? field.ask[1] : field.ask[0],
          solutionName: zh ? sol.nameZh : sol.nameEn,
          vendor: sol.vendor,
          summary: zh ? sol.summaryZh : sol.summaryEn,
          features: sol.features.map((f: any) => (zh ? f.zh : f.en)).filter(Boolean),
          prices: sol.prices.map((p) => fmtPrice(p, input.language)),
          notes: input.notes,
        });
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: String(e?.message ?? e) });
      }
    }),

  setApprover: adminProcedure
    .input(z.object({ email: z.string().email().max(160).optional(), removeId: z.number().int().positive().optional() }))
    .mutation(async ({ ctx, input }) => {
      const org = await getOrg();
      const m = await import("../../strategy/core/hub/solutionEdits");
      await m.ensureSolutionEditTables();
      const [u] = await q(`SELECT email, role FROM users WHERE id = ? LIMIT 1`, [ctx.user.id]);
      // 誰能改核准名單？只有平台管理員 —— 否則任何人都能把自己加進去，
      // 這個閘門就等於不存在。
      if (u?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only a platform admin can change the approver list." });
      }
      if (input.removeId) await m.removeApprover(org.id, input.removeId);
      else if (input.email) await m.addApprover(org.id, input.email, String(u?.email ?? ""));
      return { approvers: await m.listApprovers(org.id) };
    }),

  brandAssets: adminProcedure.query(async () => {
    const org = await getOrg();
    const { ensureBrandAssetTable, listBrandAssets, activeQuietPeriods } = await import("../../strategy/core/hub/brandAssets");
    await ensureBrandAssetTable();
    return {
      items: await listBrandAssets(org.id),
      // 頁面要能一眼看出「現在正在緘默期」，那是整張卡最重要的狀態。
      activeQuiet: await activeQuietPeriods(org.id),
    };
  }),

  saveBrandAsset: adminProcedure
    .input(z.object({
      kind: z.enum(["destination", "identity", "account", "customer", "quiet"]),
      id: z.number().int().positive().nullable().default(null),
      payload: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input }) => {
      const org = await getOrg();
      const { ensureBrandAssetTable, saveBrandAsset } = await import("../../strategy/core/hub/brandAssets");
      await ensureBrandAssetTable();
      const id = await saveBrandAsset({ orgId: org.id, kind: input.kind, id: input.id, payload: input.payload });
      await logEvent(org.id, null, "brand_asset_saved", `${input.kind} #${id}`);
      return { id };
    }),

  removeBrandAsset: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const org = await getOrg();
      const { removeBrandAsset } = await import("../../strategy/core/hub/brandAssets");
      await removeBrandAsset(org.id, input.id);
      await logEvent(org.id, null, "brand_asset_removed", `#${input.id}`);
      return { ok: true };
    }),

  regulations: adminProcedure.query(async () => {
    const org = await getOrg();
    const { listRegulations } = await import("../core/hub/hubStore");
    return listRegulations(org.id);
  }),

  content: adminProcedure.query(async () => {
    const org = await getOrg();
    const skills = await listSkills(org.id);
    const usage = await q(`SELECT skill_id, COUNT(*) n FROM hub_posts WHERE org_id = ? GROUP BY skill_id`, [org.id]);
    return {
      skills: skills.map((s) => ({ ...s, uses: Number(usage.find((u) => u.skill_id === s.id)?.n ?? 0) })),
      packs: [publicPack(POLICY_PACKS.TW), publicPack(POLICY_PACKS.US)],
    };
  }),

  approveSkill: adminProcedure.input(z.object({ skillId: z.number().int() })).mutation(async ({ ctx, input }) => {
    const org = await getOrg();
    const [u] = await q(`SELECT email FROM users WHERE id = ?`, [ctx.user.id]);
    await exec(
      `UPDATE hub_skills SET status = 'approved', version = version + 1, approved_by = ?, approved_at = NOW(3) WHERE id = ? AND org_id = ?`,
      [u?.email ?? "admin", input.skillId, org.id],
    );
    await logEvent(org.id, null, "skill_approved", `skill #${input.skillId}`);
    return { ok: true };
  }),

  reps: adminProcedure.query(async () => {
    const org = await getOrg();
    const { getLeaderboard } = await import("../../performance/core/hub/hubStats");
    const board = await getLeaderboard(org.id);
    const codes = await q(`SELECT id, bind_code, mcp_token_hash IS NOT NULL has_mcp FROM hub_reps WHERE org_id = ?`, [org.id]);
    return board.map((r) => {
      const c = codes.find((x) => x.id === r.id);
      return { ...r, bindCode: c?.bind_code ?? null, hasMcpToken: Boolean(c?.has_mcp) };
    });
  }),

  issueBindCode: adminProcedure.input(z.object({ repId: z.number().int() })).mutation(async ({ input }) => {
    return { code: await issueBindCode(input.repId) };
  }),

  performance: adminProcedure.query(async () => {
    const org = await getOrg();
    const stats = await import("../../performance/core/hub/hubStats");
    const [leaderboard, channels, recentPosts] = await Promise.all([
      stats.getLeaderboard(org.id), stats.getChannelBreakdown(org.id), stats.getRecentPosts(org.id, 40),
    ]);
    return { leaderboard, channels, recentPosts };
  }),

  /** One post for the content run page (mockup + compliance). */
  post: adminProcedure.input(z.object({ postId: z.number().int() })).query(async ({ input }) => {
    const org = await getOrg();
    const [p] = await q(
      `SELECT p.*, r.name rep_name, r.title rep_title, r.market rep_market, r.avatar_seed,
              s.name_en solution_en, s.name_zh solution_zh, s.vendor, k.slug skill_slug, k.name_en skill_en, k.name_zh skill_zh
         FROM hub_posts p
         JOIN hub_reps r ON r.id = p.rep_id
         LEFT JOIN hub_solutions s ON s.id = p.solution_id
         LEFT JOIN hub_skills k ON k.id = p.skill_id
        WHERE p.id = ? AND p.org_id = ? LIMIT 1`,
      [input.postId, org.id],
    );
    if (!p) throw new TRPCError({ code: "NOT_FOUND" });
    const { publicBaseUrl } = await import("../core/hub/hubStore");
    const [c] = await q(`SELECT COUNT(*) n FROM hub_clicks WHERE code = ?`, [p.short_code]);
    return {
      id: p.id as number,
      channel: p.channel as "linkedin" | "facebook" | "instagram" | "line",
      market: p.market as "TW" | "US",
      caption: p.caption as string,
      firstDraft: p.first_draft as string | null,
      angle: p.angle as string | null,
      compliance: typeof p.compliance === "string" ? JSON.parse(p.compliance) : p.compliance,
      verdict: p.verdict as string,
      status: p.status as string,
      source: p.source as string,
      model: p.model as string | null,
      latencyMs: p.latency_ms as number | null,
      isDemo: Boolean(p.is_demo),
      createdAt: p.created_at as string,
      trackedLink: p.short_code ? `${publicBaseUrl()}/r/${p.short_code}` : null,
      clicks: Number(c?.n ?? 0),
      rep: { id: p.rep_id as number, name: p.rep_name as string, title: p.rep_title as string, market: p.rep_market as string, avatarSeed: p.avatar_seed as string },
      solution: p.solution_id ? { id: p.solution_id as number, nameEn: p.solution_en as string, nameZh: p.solution_zh as string, vendor: p.vendor as string } : null,
      skill: p.skill_id ? { slug: p.skill_slug as string, nameEn: p.skill_en as string, nameZh: p.skill_zh as string } : null,
    };
  }),

  posts: adminProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(30) })).query(async ({ input }) => {
    const org = await getOrg();
    const { getRecentPosts } = await import("../../performance/core/hub/hubStats");
    return getRecentPosts(org.id, input.limit);
  }),

  simulatorMenu: adminProcedure
    .input(z.object({ repId: z.number().int(), action: z.enum(["write", "featured", "lookup", "share", "stats", "ask"]) }))
    .mutation(async ({ input }) => {
      const bot = await import("../core/hub/lineBot");
      return bot.handleMenu(await bot.simulatorContext(input.repId), input.action);
    }),

  simulatorPostback: adminProcedure
    .input(z.object({ repId: z.number().int(), data: z.string().max(300) }))
    .mutation(async ({ input }) => {
      const bot = await import("../core/hub/lineBot");
      return bot.handlePostback(await bot.simulatorContext(input.repId), input.data);
    }),

  simulatorSay: adminProcedure
    .input(z.object({ repId: z.number().int(), text: z.string().min(1).max(2000) }))
    .mutation(async ({ input }) => {
      const bot = await import("../core/hub/lineBot");
      return bot.handleText(await bot.simulatorContext(input.repId), input.text);
    }),

  integrations: adminProcedure.query(async () => {
    const { hermesStatus } = await import("../core/hub/hermesBridge");
    return {
      line: {
        messaging: Boolean(process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN),
        liff: Boolean(process.env.LINE_LIFF_ID),
        login: Boolean(process.env.LINE_LOGIN_CHANNEL_ID),
        liffId: process.env.LINE_LIFF_ID ?? null,
      },
      hermes: hermesStatus(),
      writerModel: process.env.HUB_WRITER_MODEL || "claude-sonnet-5",
    };
  }),

  setupRichMenu: adminProcedure.mutation(async () => {
    const { setupRichMenu } = await import("../core/hub/lineBot");
    const image = process.env.HUB_RICHMENU_IMAGE || join(process.cwd(), "server", "platform", "assets", "hub-richmenu.jpg");
    return setupRichMenu(image);
  }),

  /** A stable, post-less link per rep for the booth QR ("scan and watch the dashboard"). */
  boothLink: adminProcedure.input(z.object({ repId: z.number().int() })).query(async ({ input }) => {
    const org = await getOrg();
    const rep = await getRep(input.repId);
    if (!rep) throw new TRPCError({ code: "NOT_FOUND" });
    const [existing] = await q(`SELECT code FROM hub_links WHERE rep_id = ? AND channel = 'booth' LIMIT 1`, [rep.id]);
    let code = existing?.code as string | undefined;
    if (!code) {
      const { createLink } = await import("../core/hub/hubStore");
      code = await createLink(org.id, rep.id, "booth");
    }
    const { publicBaseUrl } = await import("../core/hub/hubStore");
    const [c] = await q(`SELECT COUNT(*) n FROM hub_clicks WHERE code = ?`, [code]);
    return { code, url: `${publicBaseUrl()}/r/${code}`, qrPath: `/r/${code}/qr.svg`, clicks: Number(c?.n ?? 0), repName: rep.name };
  }),

  issueMcpToken: adminProcedure.input(z.object({ repId: z.number().int() })).mutation(async ({ input }) => {
    return { token: await issueMcpToken(input.repId) };
  }),
});

const repRouter = router({
  session: publicProcedure.input(repIdentity).query(async ({ ctx, input }) => {
    const rep = await resolveRep(ctx as any, input);
    const org = await getOrg();
    const [solutions, skills] = await Promise.all([listSolutions(org.id), listSkills(org.id)]);
    return {
      rep: { id: rep.id, name: rep.name, title: rep.title, market: rep.market, avatarSeed: rep.avatarSeed },
      disclaimer: org.disclaimer,
      solutions: solutions.map((s) => ({
        id: s.id, slug: s.slug, nameEn: s.nameEn, nameZh: s.nameZh, vendor: s.vendor, featured: s.featured,
        summaryEn: s.summaryEn, summaryZh: s.summaryZh,
      })),
      skills: skills
        .filter((s) => s.status === "approved" && s.markets.includes(rep.market))
        .map((s) => ({ slug: s.slug, nameEn: s.nameEn, nameZh: s.nameZh, channels: s.channels })),
      pack: publicPack(POLICY_PACKS[rep.market]),
    };
  }),

  generate: publicProcedure
    .input(repIdentity.extend({
      solutionId: z.number().int(),
      channel,
      skillSlug: z.string().max(80).optional(),
      angle: z.string().max(600).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rep = await resolveRep(ctx as any, input);
      const { generateRepPost } = await import("../../content/core/hub/generateRepPost");
      return generateRepPost({
        repId: rep.id, solutionId: input.solutionId, channel: input.channel,
        skillSlug: input.skillSlug ?? null, angle: input.angle ?? null,
        source: input.idToken ? "line" : "simulator",
      });
    }),

  checkDraft: publicProcedure
    .input(repIdentity.extend({ text: z.string().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const rep = await resolveRep(ctx as any, input);
      const { checkOwnDraft } = await import("../../content/core/hub/generateRepPost");
      return checkOwnDraft({ repId: rep.id, text: input.text });
    }),

  post: publicProcedure
    .input(repIdentity.extend({ postId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const rep = await resolveRep(ctx as any, input);
      const [p] = await q(
        `SELECT id, caption, first_draft, channel, short_code, compliance, verdict FROM hub_posts WHERE id = ? AND rep_id = ? LIMIT 1`,
        [input.postId, rep.id],
      );
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        id: p.id, caption: p.caption, firstDraft: p.first_draft as string | null, channel: p.channel, shortCode: p.short_code, verdict: p.verdict,
        trackedLink: p.short_code ? `${(await import("../core/hub/hubStore")).publicBaseUrl()}/r/${p.short_code}` : null,
        compliance: typeof p.compliance === "string" ? JSON.parse(p.compliance) : p.compliance,
      };
    }),

  markShared: publicProcedure
    .input(repIdentity.extend({ postId: z.number().int(), url: z.string().url().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const rep = await resolveRep(ctx as any, input);
      await exec(
        `UPDATE hub_posts SET status = ?, shared_at = COALESCE(shared_at, NOW(3)), post_url = COALESCE(?, post_url) WHERE id = ? AND rep_id = ?`,
        [input.url ? "reported" : "shared", input.url ?? null, input.postId, rep.id],
      );
      const org = await getOrg();
      await logEvent(org.id, rep.id, input.url ? "post_reported" : "post_shared", `post #${input.postId}`);
      return { ok: true };
    }),
});

export const hubRouter = router({ admin: adminRouter, rep: repRouter });
