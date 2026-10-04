/**
 * 任務卡目錄：清單、卡片詳情、任務 tray、通路設定。
 */
import { protectedProcedure } from "../../../platform/core/trpc";
import { z } from "zod";
import { resolveTaskTemplate } from "../../core/catalog/taskRegistry";
import { TRPCError } from "@trpc/server";
import { sourceForTemplate, ALL_CRAFT_REFS } from "../../core/catalog/craftSource";
import { platformOfTaskId, buildTaskCatalogIndex, is99sOrchestraListed } from "../../core/catalog/taskCatalogIndex";
import { evergreenRationaleFor } from "../../core/catalog/evergreenRationale";
import { taskCardAddedAt } from "../../core/catalog/taskCardDates";
import { TASKS, TASK_LABEL_EN } from "./taskDefs";
import { packNavForBrand, resolveBrandPack, expandPackCards } from "../../core/catalog/brandPacks";
import { planQuotaFor, loadBrandPositioning, resolveChannels, filterTasksByPlan, daysUntilSwap, isHiddenContentPlatform, isUnlimited } from "../../../platform/core/billing/planGate";
import { isRecentViral } from "../../core/catalog/taskSource";
import { storedTray, defaultTray, MAX_TRAY } from "../../core/catalog/taskTray";
import localPool from "../../../localDb";
import { assertBrandAccess } from "../../../platform/core/brandAuth";
import { listBrandTaskCards, cardTemplate } from "../../core/catalog/brandTaskCards";
import { listAllFBTasks } from "../../core/catalog/quickTaskFB";
import { IG_30S_TASKS } from "../../core/catalog/quickTaskIG";
import { YT_30S_TASKS } from "../../core/catalog/quickTaskYT";
import { TT_30S_TASKS } from "../../core/catalog/quickTaskTikTok";
import { LI_30S_TASKS } from "../../core/catalog/quickTaskLI";
import { EMAIL_30S_TASKS } from "../../core/catalog/quickTaskEmail";
import { PR_30S_TASKS } from "../../core/catalog/quickTaskPR";
import { BRAND_30S_TASKS } from "../../core/catalog/quickTaskBrand";
import { RESEARCH_30S_TASKS } from "../../core/catalog/quickTaskResearch";
import { WEBSITE_30S_TASKS } from "../../core/catalog/quickTaskWebsite";
import { X_30S_TASKS } from "../../core/catalog/quickTaskX";
import { TH_30S_TASKS } from "../../core/catalog/quickTaskThreads";
import { LN_30S_TASKS } from "../../core/catalog/quickTaskLine";
import { KOL_30S_TASKS } from "../../core/catalog/quickTaskKOL";
import { COBRAND_30S_TASKS } from "../../core/catalog/quickTaskCobrand";
import { FB_60S_TASKS_V2, getFB60OrchestraConfig } from "../../core/catalog/quickTaskFB60";
import { IG_60S_TASKS, getIG60OrchestraConfig } from "../../core/catalog/quickTaskIG60";
import { YT_60S_TASKS, getYT60OrchestraConfig } from "../../core/catalog/quickTaskYT60";
import { ALL_99S_SQUADS } from "../../core/catalog/quickTask100Squads";
import { legacyTaskId, normalizeTaskId } from "../../../platform/core/tierCompat";
import { ALL_99S_TASKS } from "../../core/catalog/quickTask100";
import { MULTI_60S_TASKS, getMulti60OrchestraConfig } from "../../core/catalog/quickTaskMulti60";
import { MEDIA_PHOTO_TASKS, MEDIA_VIDEO_TASKS, MEDIA_DOC_TASKS } from "../../core/catalog/quickTaskMedia";
import { callWithFallback, tryParseJson } from "./helpers";

export const catalogProcedures = {
  /**
   * 一張卡的「憑什麼」：用途、出處、模型實際被餵的參考、長青的背後邏輯、
   * 需要的輸入、上架日、方案。給 CardDetailDrawer 用。
   *
   * 2026-09-08 (CJ「任務卡可以點選看出處…加上日期」)。走 resolveTaskTemplate，
   * 所以自建卡與品牌任務包的卡也查得到；craftRef 只有全域目錄有。
   */
  cardDetail: protectedProcedure
    .input(z.object({ taskId: z.string().min(1).max(80) }))
    .query(async ({ input }) => {
      const t: any = await resolveTaskTemplate(input.taskId);
      if (!t) throw new TRPCError({ code: "NOT_FOUND", message: `找不到任務卡 ${input.taskId}` });
      const pick = (v: unknown, k: "zh" | "en"): string =>
        typeof v === "string" ? v : (v && typeof v === "object" && k in (v as any) ? String((v as any)[k] ?? "") : "");
      const source = sourceForTemplate(t);
      const id = String(t.id);
      return {
        id,
        platform: platformOfTaskId(id),
        tier: String(t.tier ?? "30s"),
        postType: String(t.postType ?? "feed"),
        labelZh: pick(t.label, "zh"),
        labelEn: pick(t.label, "en"),
        descriptionZh: pick(t.description, "zh"),
        descriptionEn: pick(t.description, "en"),
        source,
        /** 得獎／標竿：模型實際被餵的那一則參考（craftSource 的來源）。 */
        craftRef: source.type === "award" || source.type === "benchmark" ? (ALL_CRAFT_REFS[id] ?? null) : null,
        /** 長青：背後邏輯。 */
        rationale: source.type === "evergreen" ? evergreenRationaleFor(id) : null,
        addedAt: taskCardAddedAt(id),
        inputs: Array.isArray(t.inputs)
          ? t.inputs.map((i: any) => ({ key: String(i.key), label: String(i.label ?? i.key), required: !!i.required }))
          : [],
        planTier: source.type === "viral" ? "pro" : "basic",
      };
    }),

  list: protectedProcedure.query(() => {
    return Object.values(TASKS).map((t) => ({
      id: t.id,
      label: t.label,
      squadName: t.squadName,
      squadTagline: t.squadTagline,
      etaSeconds: t.etaSeconds,
      finalKind: t.finalKind,
      fields: t.fields,
      stages: t.stages.map((s) => ({
        id: s.id,
        label: s.label,
        description: s.description,
        isOrchestrator: !!s.isOrchestrator,
        agents: s.agents.map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          skill: a.skill,
          avatar: a.avatar,
          tone: a.tone,
          provider: a.preferredProvider,
        })),
      })),
    }));
  }),

  // ─── Quick-task pivot 2026-05-05 ───────────────────────────────────
  // listFB: returns the entire FB task catalog (30s/60s/90s) for the new
  // home page chips. Includes bound agent metadata (avatar/name/title)
  // so cards can render the agent face as the thumbnail.
  /**
   * 2026-08-29 —— 這個品牌的頻道列與 pill。
   *
   * 回 null 代表「沒有客製包」，前端就顯示今天的全部頻道。有包的話，側邊欄
   * 只渲染包裡宣告的頻道 —— 建設公司不該看到 TikTok 開場鉤子和 KOL 邀約信。
   *
   * 跟 listFB 分開是因為呼叫端不同：頻道列在 ShellLayout（每頁都在），
   * 任務清單在 PlatformTaskPage（只有 /tasks 才在）。合併會讓側邊欄去拉
   * 一份 200 筆的目錄。
   */
  brandNav: protectedProcedure
    .input(
      z.object({
        brandId: z.number().optional(),
        brandName: z.string().optional(),
      }).optional(),
    )
    .query(({ input }) => {
      return packNavForBrand({ brandId: input?.brandId, brandName: input?.brandName });
    }),

  /**
   * 任務托盤：這個品牌在這個通路平常擺哪幾張卡。
   *
   * 回「存的」與「預設的」兩份，解析交給 client —— 只有 client 手上有完整
   * 的可見清單（全域目錄 ＋ 品牌任務包 ＋ 用戶自建卡）。server 若自己解析，
   * 會把自建卡當成不存在而丟掉，那正好是這個功能要支援的東西。
   *
   * 預設仍由 server 算：預設只會挑全域卡，catalogue 就夠了。
   */
  tray: protectedProcedure
    .input(z.object({ brandId: z.number(), platform: z.string().min(1).max(24) }))
    .query(async ({ ctx, input }) => {
      // 2026-10-04：原本沒驗品牌歸屬——任何登入的人都讀得到別人品牌的托盤。
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const quota = await planQuotaFor(ctx.user!.id);
      const positioning = await loadBrandPositioning(input.brandId);
      const channels = resolveChannels(positioning, quota);
      const cat = buildTaskCatalogIndex();
      const allowed = filterTasksByPlan(cat as any[], quota, channels);
      // 這個通路有幾張爆款卡是被方案鎖住的。選卡器要誠實顯示升級提示，
      // 數字不能寫死在前端 —— 卡片會增加，寫死的數字第二天就是錯的。
      const viralLocked = quota.viralTaskCards === false
        ? (cat as any[]).filter((t) =>
            t.platform === input.platform && isRecentViral(t.source)).length
        : 0;
      return {
        stored: storedTray(positioning, input.platform),
        fallback: defaultTray(allowed as any[], input.platform),
        maxTray: MAX_TRAY,
        viralLocked,
      };
    }),

  /**
   * 全部通路的托盤，一次拿完。給「我的任務卡」總覽頁用（2026-10-04，CJ「可以在
   * 不同的平台中，管理到自己常用的」）——那一頁要同時列七個通路，一個通路打一次
   * tray 等於七次重算方案閘門。解析同樣交給 client（理由見 tray）。
   */
  trays: protectedProcedure
    .input(z.object({ brandId: z.number(), platforms: z.array(z.string().min(1).max(24)).min(1).max(16) }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const quota = await planQuotaFor(ctx.user!.id);
      const positioning = await loadBrandPositioning(input.brandId);
      const channels = resolveChannels(positioning, quota);
      const allowed = filterTasksByPlan(buildTaskCatalogIndex() as any[], quota, channels);
      const byPlatform: Record<string, { stored: string[] | null; fallback: string[] }> = {};
      for (const p of new Set(input.platforms)) {
        byPlatform[p] = { stored: storedTray(positioning, p), fallback: defaultTray(allowed as any[], p) };
      }
      return { maxTray: MAX_TRAY, byPlatform };
    }),

  /** 存這個通路的托盤。空陣列＝回到系統預設。 */
  setTray: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      platform: z.string().min(1).max(24),
      taskIds: z.array(z.string().min(1).max(80)).max(MAX_TRAY),
    }))
    .mutation(async ({ ctx, input }) => {
      // 2026-10-04：原本沒驗品牌歸屬就整欄覆寫 positioning。
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const positioning = (await loadBrandPositioning(input.brandId)) ?? {};
      const base = typeof positioning === "object" && positioning ? positioning : {};
      const tray = { ...((base as any).__tray ?? {}) };
      if (input.taskIds.length) tray[input.platform] = input.taskIds;
      else delete tray[input.platform];          // 清空＝回到預設
      const next = { ...base, __tray: tray };
      const { default: localPool } = await import("../../../localDb");
      await localPool.execute(
        `UPDATE brands SET positioning = ? WHERE id = ?`,
        [JSON.stringify(next), input.brandId],
      );
      return { taskIds: input.taskIds, isDefault: input.taskIds.length === 0 };
    }),

  /**
   * 這個品牌目前啟用哪些通路、還剩幾天可以換。
   *
   * 前台需要它來畫「已選 2/2，還有 18 天可更換」那一排；沒有它的話通路
   * 選擇只能讀不能改，用戶會被鎖在預設值上，等於這個賣點不存在。
   */
  channels: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      const quota = await planQuotaFor(ctx.user!.id);
      const positioning = await loadBrandPositioning(input.brandId);
      const sel = resolveChannels(positioning, quota);
      // 2026-09-07 自建卡「已用 N / 上限 M」。由 server 算：前台手上的
      // ownCardsQuery 是單一通路的清單，拿它對全品牌的上限會算錯。
      let ownUsed = 0;
      try { ownUsed = (await listBrandTaskCards(input.brandId)).length; } catch { /* 顯示用，讀不到就 0 */ }
      return {
        platforms: sel.platforms,
        limit: quota.platforms,
        swappedAt: sel.swappedAt,
        daysUntilSwap: daysUntilSwap(sel, quota),
        canSwapNow: daysUntilSwap(sel, quota) === 0,
        ownCards: { used: ownUsed, limit: quota.ownTaskCards },
      };
    }),

  /**
   * 更換啟用的通路。
   *
   * 兩道檢查：數量不得超過方案額度、冷卻期內不得更換。冷卻是產品規則
   * （每月換一次），不是技術限制 —— 沒有它的話「每月可更換一次」這句
   * 文案就是空的。
   */
  setChannels: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      platforms: z.array(z.string().min(1).max(24)).min(1).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      const quota = await planQuotaFor(ctx.user!.id);
      const positioning = (await loadBrandPositioning(input.brandId)) ?? {};
      const sel = resolveChannels(positioning, quota);
      // 2026-09-29 已下架的通路（planGate.HIDDEN_CONTENT_PLATFORMS）不能再被選。
      const hidden = input.platforms.filter(isHiddenContentPlatform);
      if (hidden.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `這些通路已不提供：${hidden.join("、")}` });
      }

      if (!isUnlimited(quota.platforms) && input.platforms.length > quota.platforms) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `你的方案最多同時開 ${quota.platforms} 個通路（選了 ${input.platforms.length} 個）。`,
        });
      }
      const wait = daysUntilSwap(sel, quota);
      if (wait > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `通路每 ${quota.platformSwapDays} 天可更換一次，還要 ${wait} 天。`,
        });
      }

      const next = {
        ...(typeof positioning === "object" && positioning ? positioning : {}),
        __channels: { platforms: input.platforms, swappedAt: new Date().toISOString() },
      };
      const { default: localPool } = await import("../../../localDb");
      await localPool.execute(
        `UPDATE brands SET positioning = ? WHERE id = ?`,
        [JSON.stringify(next), input.brandId],
      );
      return { platforms: input.platforms, daysUntilSwap: quota.platformSwapDays ?? 0 };
    }),

  listFB: protectedProcedure
    .input(
      z.object({
        // 2026-08-29：帶了 brandId（或 brandName）才有辦法判斷這個品牌有沒有
        // 客製任務包。維持 optional —— 舊呼叫端不傳就是全域目錄，行為不變。
        brandId: z.number().optional(),
        brandName: z.string().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
    // ── 2026-09-06 方案閘門 ────────────────────────────────────────────
    // 目錄要依方案過濾：爆款結構卡是 2,250 → 9,000 的升級鉤子，通路數是
    // 兩級的另一條線。在這之前兩者都沒擋，2,250 的用戶拿得到全部 249 張、
    // 11 個通路 —— 升級沒有任何理由。
    const gateQuota = await planQuotaFor(ctx.user!.id);
    // 讀不到品牌就走方案預設，不要讓目錄整個掛掉。
    const gatePositioning = input?.brandId ? await loadBrandPositioning(input.brandId) : null;
    const gateChannels = resolveChannels(gatePositioning, gateQuota);
    // Despite the name, this catalog now spans FB + IG (and other channels
    // as they ship). Frontend channel-icon row filters by task.platform /
    // postType prefix.
    const fbTasks = listAllFBTasks();
    const igTasks = IG_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "instagram",
    }));
    const ytTasks = YT_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "youtube",
    }));
    const ttTasks = TT_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "tiktok",
    }));
    const liTasks = LI_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "linkedin",
    }));
    const emTasks = EMAIL_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "email",
    }));
    const prTasks = PR_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "pr",
    }));
    const brTasks = BRAND_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "brand",
    }));
    const rsTasks = RESEARCH_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "audience",
    }));
    // 2026-05-12 — KOL outreach 30s tasks
    // 2026-08-29 官網頻道：品牌自己的長文與產品頁，不是社群通路。
    const webTasks = WEBSITE_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "website",
    }));
    // 2026-09-10 X 通路。
    const xTasks = X_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "x",
    }));
    // 2026-09-29 Threads／LINE 通路的全域卡。
    const thTasks = TH_30S_TASKS.map((t) => ({ ...t, kind: "fast" as const, platform: "threads" }));
    const lnTasks = LN_30S_TASKS.map((t) => ({ ...t, kind: "fast" as const, platform: "line" }));
    const kolTasks = KOL_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "kol",
    }));
    // 2026-10-01 異業合作（活動企劃的一條線）。
    const cobrandTasks = COBRAND_30S_TASKS.map((t) => ({ ...t, kind: "fast" as const, platform: "cobrand" }));
    // 60s production-package tasks (2026-05-06) — multi-agent collab
    const fb60Tasks = FB_60S_TASKS_V2.map((t) => ({ ...t, kind: "fast" as const, platform: "facebook" }));
    const ig60Tasks = IG_60S_TASKS.map((t) => ({ ...t, kind: "fast" as const, platform: "instagram" }));
    const yt60Tasks = YT_60S_TASKS.map((t) => ({ ...t, kind: "fast" as const, platform: "youtube" }));
    // 100s tasks split into:
    //  - SQUAD-based (FB + IG with full multi-step squad infrastructure):
    //    runs via squad.stepExecute → /picker workspace UI
    //  - Orchestra-based fallback (other channels — Phase 2: build squads)
    // Resolve real squad rosters from DB so each card shows its actual lead
    // agent + team members (not generic AI Agent avatar).
    // 100s→99s rename compat: the in-code index uses new "fb-99-…" slugs;
    // the production `squads` table may still hold legacy "fb-100-…" slugs
    // (no DB migration). Query BOTH forms and key the map by the NEW slug
    // so squad cards keep their real lead-agent + team avatars regardless.
    const squadSlugs = ALL_99S_SQUADS.map((s) => s.squad_slug);
    const squadSlugQuery = Array.from(
      new Set(squadSlugs.flatMap((s) => [s, legacyTaskId(s)].filter(Boolean) as string[])),
    );
    const squadAgentMap: Record<string, { leadAgentId: number | null; agentIds: number[] }> = {};
    if (squadSlugQuery.length > 0) {
      try {
        const placeholders = squadSlugQuery.map(() => "?").join(",");
        const [rows]: any = await localPool.execute(
          `SELECT slug, lead_agent_id, agents FROM squads WHERE slug IN (${placeholders})`,
          squadSlugQuery,
        );
        for (const r of rows as any[]) {
          let agentIds: number[] = [];
          try {
            const parsed = typeof r.agents === "string" ? JSON.parse(r.agents) : r.agents;
            if (Array.isArray(parsed)) {
              agentIds = parsed
                .map((a: any) => Number(a?.id ?? a?.agent_id))
                .filter((n: number) => Number.isFinite(n) && n > 0);
            }
          } catch { /* ignore parse errors */ }
          squadAgentMap[normalizeTaskId(r.slug)] = { leadAgentId: r.lead_agent_id ?? null, agentIds };
        }
      } catch { /* squads table query failure non-fatal */ }
    }
    const tasks99Squads = ALL_99S_SQUADS.map((s) => {
      const sq = squadAgentMap[s.squad_slug];
      return {
        id: s.id,
        tier: "99s" as const,
        postType: s.postType,
        platform: s.platform,
        label: s.label,
        description: s.description,
        kind: "squad" as const,
        squad_slug: s.squad_slug,
        methodology: s.methodology,
        // attach lead agent for hero avatar + member ids for team stack
        agent_id: sq?.leadAgentId ?? null,
        squad_member_ids: sq?.agentIds ?? [],
      };
    });
    // Orchestra-based 100s tasks for channels without squads yet (filtered to
    // exclude FB + IG since those now have proper squads above)
    // 2026-05-18 (CJ): fb-99-carousel-5 is the one FB 99s task that runs
    // via the orchestra (multi-card carousel), not a squad — let it
    // through so it appears in the 99s tab; other fb-/ig- stay squad-driven.
    // 2026-08-23: allowlist 與平台推斷改從 _core/taskCatalogIndex 拿。這兩段邏輯
    // 原本只存在這個函式裡，client 那 7 份 pill 對照表只能自己再抄一份，
    // 於是 FB 與 IG 都漂出死 key 而沒人發現。現在 router 與防漂移測試共用同一份。
    const tasks99Orchestra = ALL_99S_TASKS
      .filter((t) => is99sOrchestraListed(t.id))
      .map((t) => ({ ...t, kind: "fast" as const, platform: platformOfTaskId(t.id) }));
    const tasks100 = [...tasks99Squads, ...tasks99Orchestra];
    // 2026-05-18 (CJ「KOL 完整邀約話術包應在 KOL 類別」): kl-* 曾經漏掉而
    // fallback 成 facebook。規則現在在 platformOfTaskId 一處維護。
    const multi60Tasks = MULTI_60S_TASKS.map((t) => ({
      ...t, kind: "fast" as const, platform: platformOfTaskId(t.id),
    }));
    // 2026-05-18 (CJ「media to copy」): photo/video/doc tasks — isMediaTask:true
    // tells the frontend to route directly to the upload page (ctaPath) instead
    // of opening the standard orchestra modal.
    const mediaTasks = [
      ...MEDIA_PHOTO_TASKS,
      ...MEDIA_VIDEO_TASKS,
      ...MEDIA_DOC_TASKS,
    ].map((t) => ({
      ...t,
      kind: "fast" as const,
      isMediaTask: true as const,
      // 2026-07-20 (CJ QA「任務卡作者顯示 AI Agent」): agent_id now comes
      // from the media task template — was hard-coded null, which made all
      // 9 media cards fall back to the generic "AI Agent" persona.
      squadName: null,
    }));

    const globalTasks: any[] = [
      ...fbTasks, ...fb60Tasks, ...ig60Tasks, ...yt60Tasks, ...multi60Tasks,
      ...tasks100,
      ...igTasks, ...ytTasks, ...ttTasks, ...liTasks, ...emTasks, ...prTasks, ...brTasks, ...rsTasks, ...kolTasks, ...cobrandTasks,
      ...webTasks, ...xTasks, ...thTasks, ...lnTasks,
      ...mediaTasks,
    ];

    // 2026-08-29 (CJ「每個品牌，只出現他的定位、任務，不會出現他用不到的」):
    // 有客製包的品牌，整份目錄由包取代 —— 不是全域再加幾張，是只有包裡那些。
    // 疊加模式解決不了原本的問題（客戶還是得滑過 200 張用不到的卡）。
    // 沒有包的品牌走 globalTasks，行為與這次改動前完全一致。
    //
    // 這裡換掉 tasks 而不是在 return 前才過濾，是因為下面要靠 tasks 蒐集
    // agent_id 去查頭像與團隊名單；晚換的話包裡的 agent 會查不到。
    const brandPack = resolveBrandPack({ brandId: input?.brandId, brandName: input?.brandName });
    const baseTasks: any[] = brandPack
      ? expandPackCards(brandPack, new Map(globalTasks.map((t) => [t.id, t])))
      : globalTasks;

    // 2026-09-04：這個品牌自己建的卡。**疊加**在上面（pack 也一樣）——
    // 「有 pack 就完全取代全域」那條規則是為了不讓客戶滑過 200 張用不到的卡，
    // 而使用者自己做的卡，按定義就是他用得到的那些。
    // 只列 status === "ready" 的：還在生成 SKILL 的卡按下去只會拿到空 prompt
    // 寫出來的東西（同 registerBrandTaskCardSource 的閘門）。
    const ownCards: any[] = input?.brandId
      ? (await listBrandTaskCards(input.brandId))
          .filter((c) => c.status === "ready")
          .map((c) => ({
            ...cardTemplate(c),
            kind: "fast" as const,
            platform: c.channel,
            /** UI 靠這個標出「我自己的卡」，並提供編輯入口。 */
            ownCardId: c.id,
          }))
      : [];
    const tasks: any[] = [...ownCards, ...baseTasks];
    // 2026-09-08 上架日：目錄卡從 git 歷史查，自建卡用它自己的 createdAt。
    // 前台靠這個標「新上架」與「本月新卡 N 張」，日期只有一個來源。
    for (const t of tasks) {
      if (t.addedAt !== undefined) continue;
      t.addedAt = t.ownCardId
        ? (typeof t.createdAt === "string" ? t.createdAt.slice(0, 10) : null)
        : taskCardAddedAt(String(t.id));
    }
    // 60s production-package universal team agent IDs (used by orchestra)
    // Emma Zhang / Helen Sung / David Wang / Sophie Ho / Jordan Hayes / Mandy / Nancy / Nina / Anna / Zeyu / Nathan
    const UNIVERSAL_60S_IDS = [30005, 180163, 30003, 60012, 239184, 180170, 180157, 180165, 60071, 60062];
    // Resolve 60s orchestra config for each task to get strategist + specialty + image director
    const orchestraLookup = (id: string) =>
      getFB60OrchestraConfig(id) ?? getIG60OrchestraConfig(id) ??
      getYT60OrchestraConfig(id) ?? getMulti60OrchestraConfig(id);
    // Collect unique agent_ids that need lookup (covers both fb + ig + collab team)
    const teamIdsByTask: Record<string, number[]> = {};
    for (const t of tasks) {
      if (t.tier !== "60s") continue;
      const cfg = orchestraLookup(t.id);
      if (!cfg) continue;
      const ids: number[] = [];
      if (t.agent_id) ids.push(t.agent_id);
      if (cfg.imageDirectorId) ids.push(cfg.imageDirectorId);
      if (cfg.strategistAgentId) ids.push(cfg.strategistAgentId);
      if (cfg.specialtyAgentId) ids.push(cfg.specialtyAgentId);
      ids.push(...UNIVERSAL_60S_IDS.slice(0, 5)); // Emma/Helen/David/Sophie/Jordan core 5
      teamIdsByTask[t.id] = Array.from(new Set(ids));
    }
    // Also collect squad team member IDs so each 100s squad card can render
    // a proper team avatar stack (lead + first 4 members).
    const squadTeamIds: number[] = [];
    for (const sq of Object.values(squadAgentMap)) {
      if (sq.leadAgentId) squadTeamIds.push(sq.leadAgentId);
      squadTeamIds.push(...sq.agentIds.slice(0, 5));
    }
    const agentIds: number[] = Array.from(new Set([
      ...tasks.flatMap((t: any) => (t.agent_id ? [Number(t.agent_id)] : [])),
      ...Object.values(teamIdsByTask).flat(),
      ...squadTeamIds,
    ]));
    const agentMap: Record<number, { id: number; name: string; title: string; avatarUrl: string | null }> = {};
    if (agentIds.length > 0) {
      const placeholders = agentIds.map(() => "?").join(",");
      try {
        const [rows]: any = await localPool.execute(
          `SELECT id, name, title, avatarUrl FROM agents WHERE id IN (${placeholders})`,
          agentIds,
        );
        for (const r of (rows as any[])) {
          agentMap[r.id] = { id: r.id, name: r.name, title: r.title, avatarUrl: r.avatarUrl ?? null };
        }
      } catch { /* agent metadata failure non-fatal — UI shows fallback */ }
    }
    return filterTasksByPlan(tasks.map((t: any) => {
      // Derive platform: explicit override (IG tasks) wins; else infer from
      // task id prefix (fb-* / ig-*) for back-compat with older FB rows.
      const platform =
        t.platform ??
        (t.id?.startsWith("ig-") ? "instagram"
          : t.id?.startsWith("yt-") ? "youtube"
          : t.id?.startsWith("tt-") ? "tiktok"
          : t.id?.startsWith("li-") ? "linkedin"
          : t.id?.startsWith("em-") ? "email"
          : t.id?.startsWith("pr-") ? "pr"
          : t.id?.startsWith("br-") ? "brand"
          : t.id?.startsWith("rs-") ? "audience"
          : t.id?.startsWith("fb-") ? "facebook"
          : "facebook");
      // 2026-05-11 — label may be a string (legacy) or { en, zh } structured.
      // Frontend chip + modal title only need a single string, so flatten to
      // zh (the primary display locale). Bilingual parts are surfaced
      // separately as label_en / label_zh below so the modal can render
      // "EN · 中文" without manual concatenation drift.
      const labelStr = typeof t.label === "string"
        ? t.label
        : (t.label?.zh ?? t.label?.en ?? t.id);
      // 2026-07-18 多市場: description is bilingual too — flatten to the
      // zh string (legacy field) + surface description_en for the EN UI.
      const descStr = typeof t.description === "string"
        ? t.description
        : (t.description?.zh ?? t.description?.en ?? "");
      const base = {
        id: t.id, tier: t.tier, postType: t.postType, platform,
        label: labelStr, description: descStr, kind: t.kind,
        description_en: typeof t.description === "object" && t.description?.en ? t.description.en : null,
        // 2026-09-05 — 結構來源。這是個白名單，漏掉這行前台的來源 pill 會
        // 一律顯示「長青公式」而且沒有任何東西會報錯。未標記的卡由
        // resolveTaskSource 補成 evergreen，所以前台永遠拿得到值。
        source: sourceForTemplate(t),
      };
      if (t.kind === "squad") {
        // 100s squad tasks: surface lead agent + team roster + a primary
        // input so user can provide brief context (auto-injected as topic
        // when squad runs inline via runSquadAuto).
        const leadId = t.agent_id ?? null;
        const memberIds: number[] = Array.isArray(t.squad_member_ids) ? t.squad_member_ids : [];
        const team = memberIds.map((id: number) => agentMap[id]).filter(Boolean);
        const squadLabelEn = typeof t.label === "object" && t.label?.en ? t.label.en : (TASK_LABEL_EN[t.id] ?? null);
        return {
          ...base,
          label_en: squadLabelEn,
          label_zh: typeof t.label === "object" && t.label?.zh ? t.label.zh : null,
          squad_slug: t.squad_slug,
          methodology: t.methodology ?? null,
          inputs: [{ key: "topic", label: "本次活動 / 主題 / 重點", type: "textarea", required: true }],
          primary_question: t.primary_question ?? "本次想交付什麼？簡單說明主題、活動、目標即可（AI 專家會自動搜尋節慶、趨勢資料）",
          primary_input: t.primary_input ?? { key: "topic", placeholder: "例：5 月母親節限時優惠 / 新品上市 / 客戶見證輯", type: "textarea" as const },
          agent: leadId ? (agentMap[leadId] ?? null) : null,
          team: team.length > 0 ? team : undefined,
          skill_slug: null,
        };
      }
      // For 60s tasks, surface the full collab team so cards can show
      // "8 位 agent 協作" badge + tooltip with team roster.
      const teamIds = teamIdsByTask[t.id] ?? [];
      const team = teamIds.map((id) => agentMap[id]).filter(Boolean);
      return {
        ...base,
        inputs: t.inputs ?? [],
        // 2026-09-04：這一層是明確列欄位的重塑，不是整包 spread —— 沒列到的
        // key 會被靜靜丟掉。自建卡的標記就是這樣消失的（dev probe 抓到）。
        ownCardId: t.ownCardId ?? null,
        eta_seconds: t.tier === "30s" ? 30 : 60,
        preferredModel: t.preferredModel,
        agent_id: t.agent_id ?? null,
        skill_slug: t.skill_slug ?? null,
        primary_question: t.primary_question ?? null,
        scene: t.scene ?? null,
        illustration_url: t.illustration_url ?? null,
        primary_input: t.primary_input ?? null,
        // 2026-05-11 — surface bilingual label parts + context wiring so the
        // intake modal can render "EN · 中文" + the "我會用 X 來跑" strip.
        // 2026-05-19 — also look up TASK_LABEL_EN for tasks with plain-string labels.
        label_en: typeof t.label === "object" && t.label?.en ? t.label.en : (TASK_LABEL_EN[t.id] ?? null),
        label_zh: typeof t.label === "object" && t.label?.zh ? t.label.zh : null,
        contextSources: t.contextSources ?? null,
        agent: t.agent_id ? (agentMap[t.agent_id] ?? null) : null,
        team: team.length > 0 ? team : undefined,
      };
    }), gateQuota, gateChannels);
  }),

  route: protectedProcedure
    .input(z.object({ text: z.string().min(2) }))
    .mutation(async ({ input }) => {
      const catalog = Object.values(TASKS).map((t) => {
        const fieldKeys = t.fields.map((f) => f.key).join(",");
        return `- ${t.id}（${t.squadName}）needs: [${fieldKeys}]`;
      }).join("\n");

      const system = `你是路由器。從以下 squad 清單挑出最匹配用戶意圖的 taskId，從用戶輸入抽出對應欄位值。

清單：
${catalog}

輸出嚴格 JSON：{"taskId":"...","inputs":{...},"confidence":0.0-1.0}
不匹配回 {"taskId":null,"confidence":0}。`;

      try {
        const r = await callWithFallback(
          [
            { role: "system", content: system },
            { role: "user", content: input.text },
          ],
          "forge"
        );
        const parsed = tryParseJson(r.content);
        if (!parsed || !parsed.taskId || !TASKS[parsed.taskId]) {
          return { taskId: null as string | null, inputs: {}, confidence: 0 };
        }
        return {
          taskId: parsed.taskId as string,
          inputs: (parsed.inputs ?? {}) as Record<string, string>,
          confidence: Number(parsed.confidence ?? 0.5),
        };
      } catch {
        return { taskId: null as string | null, inputs: {}, confidence: 0 };
      }
    }),
};
