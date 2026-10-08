/**
 * performanceRouter — 成效層的「資料來源狀態」。
 *
 * 2026-09-07 (CJ「屆時會客製化製作，請你隱藏市場數據層，但用模擬數據，
 * 為每個品牌製作成效層」)。
 *
 * 成效層的畫面本身是前端既有的模擬資料（perfMockData，
 * 強制顯示「⚠ 模擬資料」橫幅）。這支只負責一件事：**誠實回報每一個資料
 * 來源現在串接到什麼程度**，讓串接卡片不用猜。
 *
 * 三個來源，三種真實狀態：
 *   meta_page   粉專貼文 —— brand_integrations 裡真的有 FB 連結就是 connected。
 *               發布用的 OAuth 早就要了 pages_read_engagement，貼文 insights
 *               不需要再授權一次，差的只是回填的 job（屆時導入時做）。
 *   meta_ads    廣告帳號 —— 需要 ads_read 與選廣告帳號，目前沒有這種整合，
 *               一律 not_connected。
 *   commerce    電商後台 —— SHOPLINE / 91APP / Shopify 各自要商家憑證，
 *               或用匯出檔備援。是 NT$48,000 建置的主體，一律 not_connected。
 *
 * 不做的事：不在這裡回任何成效數字。真數字要等回填 job；假數字只能從
 * 前端那份標了橫幅的 mock 來，絕不從 API 端出去 —— API 回的數字沒有橫幅。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { assertBrandAccess } from "../../platform/core/brandAuth";
import {
  TRAY_SOURCES, TRAYS, LENS_TEMPLATES, listDimensions, upsertDimension, deleteDimension,
  listLenses, createLens, updateLens, deleteLens, listRules, addRule, deleteRule,
  loadFacts, setFactTag, sourceSummary, listImports, createImport, deleteImport, lastMapping, upsertFacts,
} from "../core/perfStore";
import { pivot, resolveTag, judgeValue, BUILTIN_DIMS, METRIC_LABELS, JUDGE_LABELS, SOURCE_LABELS, UNTAGGED, type LensConfig } from "../core/perfPivot";
import { deriveDimensions, proposeLens, autoTag } from "../core/perfAI";
import { parseTable, guessSource, guessMapping, buildFacts, IMPORT_SOURCES, ROWCOUNT } from "../core/perfImport";
import { syncFbPage, resolvePage, FbSyncError, fbSyncEnabled } from "../core/fbPageSync";
import { syncBrandZernioAnalytics, ZernioAnalyticsSyncError, isAnalyticsPlatform, SOURCE_BY_PLATFORM } from "../core/zernioAnalyticsSync";
import { listConnectedByBrand } from "../../platform/core/connectors/publish/connectionStore";
import { getPublishProvider } from "../../platform/core/connectors/publish/publishProvider";
import { utmContent, campaignCode, campaignLink, cleanLandingUrl } from "../../platform/core/perfUtm";
import {
  buildCampaignPerf, applyMatch, applyAlias, loadCampaignEvent, saveCampaignPerf, publishedPosts, listCampaigns,
  type PerfFact, type ExtFact, type CampaignPerfStore,
} from "../core/campaignPerf";

const trayInput = z.enum(TRAYS as [string, ...string[]]);
const ymdInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fileInput = z.string().max(110 * 1024 * 1024);
const dimKeyInput = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const dimValuesInput = z.array(z.object({ code: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/), label: z.string().min(1).max(40) })).max(40);
const lensConfigInput = z.object({
  rowDim: z.string().min(1).max(40),
  colDim: z.string().max(40).nullable().optional(),
  stages: z.array(z.object({ metric: z.string().max(30), label: z.string().max(20).optional() })).max(10),
  judge: z.string().max(30),
  sources: z.array(z.string().max(20)).max(10).optional(),
});

export type SourceStatus = "connected" | "not_connected" | "needs_setup";

export interface SourceConnection {
  id: "meta_page" | "meta_ads" | "commerce";
  status: SourceStatus;
  /** 已連結時的顯示名稱（粉專名稱／帳號 id）。 */
  label: string | null;
  connectedAt: string | null;
  /** 這個來源要怎麼接上 —— 給串接卡片的一句話。 */
  howZh: string;
  howEn: string;
  /** true = 可以由用戶自助完成；false = 屬於導入時由我們設定。 */
  selfServe: boolean;
}

const syncInput = z.object({ brandId: z.number().int().positive(), days: z.number().int().min(7).max(365).default(120) });
async function syncSocial(input: z.infer<typeof syncInput>) {
  try {
    return await syncBrandZernioAnalytics(input.brandId, input.days);
  } catch (error) {
    if (error instanceof ZernioAnalyticsSyncError) throw new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
    throw error;
  }
}

export const performanceRouter = router({
  /** 這個品牌三個資料來源的真實狀態。 */
  connections: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }): Promise<SourceConnection[]> => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const { default: pool } = await import("../../localDb");
      const socialConnections = (await listConnectedByBrand(pool, input.brandId, "zernio")).filter(c => isAnalyticsPlatform(c.platform));
      let fb: { status: string; selectedResourceId: string | null; connectedAt: any; authorizedResources: any } | null = null;
      try {
        const { default: localPool } = await import("../../localDb");
        const [rows]: any = await localPool.execute(
          `SELECT status, selectedResourceId, connectedAt, authorizedResources
             FROM brand_integrations
            WHERE brandId = ? AND userId = ? AND integrationType = 'facebook_pages'
            ORDER BY id DESC LIMIT 1`,
          [input.brandId, ctx.user!.id],
        );
        fb = (rows as any[])[0] ?? null;
      } catch { fb = null; /* 讀不到就當沒連，不要讓成效頁掛掉 */ }

      // 已選粉專的名稱：authorizedResources 是 JSON 清單，用 selectedResourceId 對回去
      let pageLabel: string | null = null;
      if (fb?.selectedResourceId) {
        try {
          const list = typeof fb.authorizedResources === "string"
            ? JSON.parse(fb.authorizedResources) : fb.authorizedResources;
          const hit = Array.isArray(list)
            ? list.find((r: any) => String(r?.id) === String(fb!.selectedResourceId)) : null;
          pageLabel = hit?.name ?? String(fb.selectedResourceId);
        } catch { pageLabel = String(fb.selectedResourceId); }
      }
      // status enum 是 connected | disconnected | error（drizzle schema），沒有 'active'。
      // 2026-09-29：發布流程實際用的是 brands.fbPageId（fbPageSync 也是），這裡一起算。
      const page = await resolvePage(input.brandId).catch(() => null);
      const fbConnected = (!!fb && fb.status === "connected" && !!fb.selectedResourceId) || !!page || socialConnections.length > 0;
      if (!pageLabel && page) pageLabel = page.pageName ?? page.pageId;
      if (socialConnections.length) pageLabel = socialConnections.map(c => c.accountLabel || c.accountUsername || c.accountId).join("、");
      const sources = await sourceSummary(input.brandId).catch(() => ({} as Record<string, { facts: number; latest: string | null }>));
      const socialSources = Object.values(SOURCE_BY_PLATFORM);
      const fbFacts = socialSources.reduce((n, source) => n + (sources[source]?.facts ?? 0), 0);
      const latestSocial = socialSources.map(source => sources[source]?.latest).filter((d): d is string => !!d).sort().pop() ?? null;
      const connectedAt = socialConnections.map(c => c.connectedAt).filter((d): d is Date | string => !!d)
        .map(d => new Date(d).toISOString()).sort().pop();
      const adsFacts = (sources.meta_ads?.facts ?? 0) + (sources.google_ads?.facts ?? 0) + (sources.ga4?.facts ?? 0);
      const shopFacts = (sources.shopline?.facts ?? 0) + (sources["91app"]?.facts ?? 0) + (sources.shopify?.facts ?? 0);

      return [
        {
          id: "meta_page",
          status: fbConnected ? "connected" : "not_connected",
          label: fbConnected ? pageLabel : null,
          connectedAt: connectedAt ?? (fbConnected && fb?.connectedAt ? new Date(fb.connectedAt).toISOString() : latestSocial),
          howZh: fbConnected
            ? (fbFacts ? `社群貼文成效（Facebook／Instagram／Threads／LinkedIn）：已回填 ${fbFacts} 篇，每天自動更新。` : "社群帳號已連結，按「同步成效」回填 Facebook／Instagram／Threads／LinkedIn 貼文成效，之後每天自動更新。舊連線請先到品牌設定重新授權。")
            : "社群貼文成效（Facebook／Instagram／Threads／LinkedIn）：到品牌設定連接帳號；先前已連接的帳號請重新授權一次，以取得成效讀取權限。",
          howEn: fbConnected
            ? (fbFacts ? `Social post performance (Facebook / Instagram / Threads / LinkedIn): ${fbFacts} posts backfilled; refreshed daily.` : "Social account connected. Sync performance to backfill Facebook / Instagram / Threads / LinkedIn posts, then refresh daily. Reauthorize older connections in brand settings first.")
            : "Social post performance (Facebook / Instagram / Threads / LinkedIn): connect in brand settings. Reauthorize older connections once to grant analytics access.",
          selfServe: true,
        },
        {
          id: "meta_ads",
          status: adsFacts ? "connected" : "not_connected",
          label: adsFacts ? `匯入 ${adsFacts} 筆` : null,
          connectedAt: null,
          howZh: adsFacts
            ? "已有廣告／GA4 匯入資料。API 直連會在導入時設定。"
            : "先上傳 Meta 廣告、Google 廣告或 GA4 的匯出檔；API 直連由 SoWork 在導入時與你一起設定。",
          howEn: adsFacts
            ? "Ad / GA4 exports imported. Direct API sync is set up during onboarding."
            : "Upload Meta Ads, Google Ads or GA4 exports now; direct API sync is set up with SoWork during onboarding.",
          selfServe: true,
        },
        {
          id: "commerce",
          status: shopFacts ? "connected" : "not_connected",
          label: shopFacts ? `匯入 ${shopFacts} 筆` : null,
          connectedAt: null,
          howZh: shopFacts
            ? "已有電商訂單匯入資料。API 直連屬於電商營運報告建置範圍。"
            : "上傳 SHOPLINE／91APP／Shopify 的訂單匯出檔即可開始；API 直連屬於電商營運報告建置範圍。",
          howEn: shopFacts
            ? "Commerce orders imported. Direct API sync is part of the e-commerce reporting build."
            : "Upload SHOPLINE / 91APP / Shopify order exports to start; direct API sync is part of the e-commerce reporting build.",
          selfServe: true,
        },
      ];
    }),

  // ─── 2026-09-29 視角 / 漏斗 ────────────────────────────────────────────

  /** 一個 tray 的工作區：維度、這個 tray 的視角、可用範本、各來源資料狀況。 */
  workspace: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), tray: trayInput }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const [dims, lenses, sources, rules, imports, page] = await Promise.all([
        listDimensions(input.brandId), listLenses(input.brandId, input.tray), sourceSummary(input.brandId),
        listRules(input.brandId), listImports(input.brandId), resolvePage(input.brandId).catch(() => null),
      ]);
      const traySources = TRAY_SOURCES[input.tray] ?? [];
      const trayFacts = traySources.length
        ? traySources.reduce((n, s) => n + (sources[s]?.facts ?? 0), 0)
        : Object.values(sources).reduce((n, s) => n + s.facts, 0);
      return {
        dims,
        builtinDims: Object.entries(BUILTIN_DIMS).map(([key, v]) => ({ key, label: v.label })),
        lenses,
        templates: [...LENS_TEMPLATES]
          .sort((a, b) => Number(b.trays.includes(input.tray)) - Number(a.trays.includes(input.tray)))
          .map((t) => ({ key: t.key, name: t.name, nameEn: t.nameEn, config: t.config, recommended: t.trays.includes(input.tray) })),
        sources, traySources, trayFacts, rules, imports,
        fbPage: page,
        fbSyncEnabled: fbSyncEnabled(),
        metricLabels: METRIC_LABELS, judgeLabels: JUDGE_LABELS, sourceLabels: SOURCE_LABELS,
      };
    }),

  /** 從範本開始：範本需要的維度（族群／USP／產品）若還沒有，先從定位推出來。 */
  useTemplate: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), tray: trayInput, templateKey: z.string().max(40) }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const t = LENS_TEMPLATES.find((x) => x.key === input.templateKey);
      if (!t) throw new TRPCError({ code: "BAD_REQUEST", message: "沒有這個範本" });
      const need = [t.config.rowDim, t.config.colDim].filter((k): k is string => !!k && !(k in BUILTIN_DIMS));
      const have = new Set((await listDimensions(input.brandId)).map((d) => d.key));
      const missing = need.filter((k) => !have.has(k));
      let derived: { usedModel: boolean } | null = null;
      if (missing.length) {
        const d = await deriveDimensions(input.brandId);
        derived = { usedModel: d.usedModel };
        const LABEL: Record<string, string> = { ta: "目標族群", usp: "USP", product: "產品" };
        for (const k of missing) {
          const values = (d as unknown as Record<string, { code: string; label: string }[]>)[k] ?? [];
          await upsertDimension(input.brandId, { key: k, label: LABEL[k] ?? k, values }, "positioning");
        }
      }
      const sources = TRAY_SOURCES[input.tray] ?? [];
      const config: LensConfig = { ...t.config, sources: sources.length ? sources : undefined };
      const id = await createLens(input.brandId, ctx.user!.id, input.tray, t.name, "template", config);
      return { id, derived };
    }),

  saveLens: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(), tray: trayInput, id: z.number().int().positive().optional(),
      name: z.string().min(1).max(80), config: lensConfigInput,
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      if (input.id) { await updateLens(input.brandId, input.id, input.name, input.config); return { id: input.id }; }
      return { id: await createLens(input.brandId, ctx.user!.id, input.tray, input.name, "custom", input.config) };
    }),

  removeLens: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      await deleteLens(input.brandId, input.id);
      return { ok: true };
    }),

  saveDimension: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), key: dimKeyInput, label: z.string().min(1).max(60), values: dimValuesInput }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      if (input.key in BUILTIN_DIMS) throw new TRPCError({ code: "BAD_REQUEST", message: "內建維度不能改" });
      await upsertDimension(input.brandId, input, "user");
      return { ok: true };
    }),

  removeDimension: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), key: z.string().max(40) }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      await deleteDimension(input.brandId, input.key);
      return { ok: true };
    }),

  /** 視角報表：矩陣＋總計＋覆蓋率。 */
  report: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), lensId: z.number().int().positive(), from: ymdInput, to: ymdInput }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const lens = await findLens(input.brandId, input.lensId);
      const [dims, rules] = await Promise.all([listDimensions(input.brandId), listRules(input.brandId)]);
      const facts = await loadFacts(input.brandId, input.from, input.to, lens.config.sources);
      return { lens, result: pivot(facts, lens.config, dims, rules) };
    }),

  /** 點格子：這個組合底下的事實（貼文／廣告／流量），照判讀指標排序。 */
  cellFacts: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(), lensId: z.number().int().positive(), from: ymdInput, to: ymdInput,
      row: z.string().max(60), col: z.string().max(60).nullable(),
    }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const lens = await findLens(input.brandId, input.lensId);
      const [dims, rules] = await Promise.all([listDimensions(input.brandId), listRules(input.brandId)]);
      const facts = await loadFacts(input.brandId, input.from, input.to, lens.config.sources);
      const hit = facts.filter((f) =>
        resolveTag(f, lens.config.rowDim, rules) === input.row
        && (!lens.config.colDim || input.col == null || resolveTag(f, lens.config.colDim, rules) === input.col));
      const scored = hit.map((f) => ({ ...f, judge: judgeValue(lens.config.judge, f.metrics) }));
      scored.sort((a, b) => (b.judge ?? -Infinity) - (a.judge ?? -Infinity));
      return { total: hit.length, facts: scored.slice(0, 60) };
    }),

  setFactTag: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), factId: z.number().int().positive(), dimKey: z.string().max(40), value: z.string().max(40).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      await setFactTag(input.brandId, input.factId, input.dimKey, input.value);
      return { ok: true };
    }),

  addRule: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), dimKey: z.string().max(40), valueCode: z.string().max(40), pattern: z.string().min(1).max(300) }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      await addRule(input.brandId, input, "user");
      return { ok: true };
    }),

  removeRule: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      await deleteRule(input.brandId, input.id);
      return { ok: true };
    }),

  /** AI 補標：把這個視角用到、還沒標的事實分類（一次最多 120 筆）。 */
  autoTag: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), lensId: z.number().int().positive(), from: ymdInput, to: ymdInput }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const lens = await findLens(input.brandId, input.lensId);
      const [dims, rules] = await Promise.all([listDimensions(input.brandId), listRules(input.brandId)]);
      const keys = [lens.config.rowDim, lens.config.colDim].filter((k): k is string => !!k && !(k in BUILTIN_DIMS));
      const target = dims.filter((d) => keys.includes(d.key));
      if (!target.length) return { tagged: 0, looked: 0 };
      const facts = (await loadFacts(input.brandId, input.from, input.to, lens.config.sources))
        .filter((f) => target.some((d) => resolveTag(f, d.key, rules) === UNTAGGED))
        .slice(0, 120);
      let tagged = 0;
      for (let i = 0; i < facts.length; i += 40) {
        const batch = facts.slice(i, i + 40);
        const res = await autoTag(batch, target).catch((e) => { console.warn("[perf.autoTag]", e?.message); return {} as Record<string, Record<string, string>>; });
        for (const [id, tags] of Object.entries(res)) {
          for (const [k, v] of Object.entries(tags)) await setFactTag(input.brandId, Number(id), k, v);
          tagged++;
        }
      }
      return { tagged, looked: facts.length };
    }),

  /** 四平台社群貼文回填（手動觸發；與背景 worker 共用同步）。 */
  syncSocial: protectedProcedure
    .input(syncInput)
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      return syncSocial(input);
    }),

  /** 舊端點保留：Facebook 改走 Zernio 時，一併同步四個支援的平台。 */
  syncFacebook: protectedProcedure
    .input(syncInput)
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      if (getPublishProvider("facebook") === "zernio") return syncSocial(input);
      try {
        return await syncFbPage(input.brandId, input.days);
      } catch (e) {
        if (e instanceof FbSyncError) throw new TRPCError({ code: "PRECONDITION_FAILED", message: e.message });
        throw e;
      }
    }),

  /** 匯入第一步：解析檔案、猜平台、猜欄位對應（上次同來源的對應優先），回前 5 列預覽。 */
  importPreview: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), fileName: z.string().max(200), contentBase64: fileInput, source: z.enum(IMPORT_SOURCES).optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const table = parseTable(await fileToCsv(input.fileName, input.contentBase64));
      if (!table.headers.length) throw new TRPCError({ code: "BAD_REQUEST", message: "讀不到表頭，請確認是 CSV 或 Excel 匯出檔" });
      const source = input.source ?? guessSource(table.headers);
      const mapping = guessMapping(table.headers, source, await lastMapping(input.brandId, source));
      return { source, headers: table.headers, sample: table.rows.slice(0, 5), rowCount: table.rows.length, mapping, rowCountKey: ROWCOUNT };
    }),

  /** 匯入第二步：照確認過的對應寫入。 */
  importCommit: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(), fileName: z.string().max(200), contentBase64: fileInput,
      source: z.enum(IMPORT_SOURCES), mapping: z.record(z.string().max(60)), fallbackDate: ymdInput,
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const table = parseTable(await fileToCsv(input.fileName, input.contentBase64));
      const built = buildFacts(table, input.mapping, input.source, input.fallbackDate);
      if (!built.facts.length) throw new TRPCError({ code: "BAD_REQUEST", message: "沒有任何一列對到數字欄位，請檢查欄位對應" });
      const importId = await createImport(input.brandId, ctx.user!.id, input.source, input.fileName, built.facts.length, input.mapping);
      await upsertFacts(input.brandId, built.facts.map((f) => ({ ...f, importId })));
      return { importId, facts: built.facts.length, skipped: built.skipped, metrics: built.metricsFound };
    }),

  removeImport: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      await deleteImport(input.brandId, input.id);
      return { ok: true };
    }),

  /** 「照你原本的報告」「貼 AI 對話串」：讀文字 → 視角提議卡（還沒寫入）。 */
  proposeLens: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(), kind: z.enum(["chat", "report"]),
      text: z.string().max(60_000).optional(), fileName: z.string().max(200).optional(), contentBase64: fileInput.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      let text = input.text ?? "";
      if (!text && input.contentBase64 && input.fileName) text = await fileToText(input.fileName, input.contentBase64);
      if (text.trim().length < 20) throw new TRPCError({ code: "BAD_REQUEST", message: "內容太短，讀不出分析視角" });
      const proposal = await proposeLens(input.kind, text, await listDimensions(input.brandId));
      if (!proposal) throw new TRPCError({ code: "BAD_REQUEST", message: "沒有讀出可用的視角，換一段更完整的內容試試" });
      return proposal;
    }),

  /** 確認提議卡：新維度建起來、既有維度補上新值，然後建視角。 */
  acceptProposal: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(), tray: trayInput, origin: z.enum(["chat", "report"]),
      name: z.string().min(1).max(80), config: lensConfigInput, note: z.string().max(500).optional(),
      dims: z.array(z.object({ key: dimKeyInput, label: z.string().min(1).max(60), values: dimValuesInput })).max(2),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      for (const d of input.dims) {
        if (!(d.key in BUILTIN_DIMS)) await upsertDimension(input.brandId, d, input.origin === "chat" ? "ai_chat" : "ai_report");
      }
      const sources = TRAY_SOURCES[input.tray] ?? [];
      const id = await createLens(input.brandId, ctx.user!.id, input.tray, input.name, input.origin,
        { ...input.config, sources: input.config.sources?.length ? input.config.sources : (sources.length ? sources : undefined) }, input.note);
      return { id };
    }),

  /** 產出頁：這篇內容目前的成效標籤＋品牌可選的維度。 */
  // ─── 2026-09-30 活動 tray：活動企劃的目標 vs 真的發出去的貼文（core/campaignPerf.ts） ───

  /** 這個品牌有企劃的活動（定稿的排前面）。 */
  campaignList: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      return listCampaigns(input.brandId, ctx.user!.id);
    }),

  /** 一檔活動的成效：各段目標 vs 實際、每一篇對上沒、待確認的貼文。 */
  campaignReport: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), eventId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const ev = await loadCampaignEvent(input.eventId, ctx.user!.id);
      if (!ev || ev.brandId !== input.brandId) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個活動" });
      const plan = ev.pos?.campaignPlan;
      if (!plan?.items?.length) throw new TRPCError({ code: "BAD_REQUEST", message: "這檔活動還沒有企劃" });
      // 合作類的線（網紅 kol、異業合作 cobrand）是要做的事，不是品牌粉專上的貼文，不進貼文對照。
      const items = (plan.items as any[]).filter((i) => i?.platform !== "kol" && i?.platform !== "cobrand").map((i) => ({
        id: String(i.id), phase: String(i.phase), date: String(i.date), platform: String(i.platform),
        angle: String(i.angle ?? ""), paid: !!i.paid, outputId: i.outputId ? Number(i.outputId) : null, enabled: i.enabled !== false,
      }));
      const dates = items.filter((i) => i.enabled).map((i) => i.date).sort();
      const addDays = (s: string, n: number) => new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
      const from = addDays(dates[0] ?? new Date().toISOString().slice(0, 10), -14);
      const to = addDays(dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10), 7);
      const [rawFacts, published, page] = await Promise.all([
        loadFacts(input.brandId, from, to),
        publishedPosts(input.brandId, items.map((i) => i.outputId ?? 0)),
        resolvePage(input.brandId).catch(() => null),
      ]);
      const facts: PerfFact[] = rawFacts.filter((f: any) => f.source === "fb_page").map((f: any) => ({
        key: `${f.source}:${f.entityId}`, source: f.source, entityId: String(f.entityId), date: f.date,
        text: String(f.text ?? f.entityLabel ?? ""), permalink: f.permalink ?? null, metrics: f.metrics ?? {},
      }));
      // 第 2 步：廣告／GA4／電商匯入，靠 UTM 或名稱對應歸檔（campaignPerf.campaignOf）。
      const external: ExtFact[] = rawFacts.filter((f: any) => f.source !== "fb_page").map((f: any) => ({
        source: f.source, date: f.date, label: String(f.entityLabel ?? f.entityId ?? ""),
        tags: f.tags ?? {}, metrics: f.metrics ?? {},
      }));
      const store = (ev.pos?.campaignPerf ?? {}) as CampaignPerfStore;
      const kpiPhases = plan.kpi?.phases ?? null;
      const report = buildCampaignPerf({
        items, kpiPhases, published, facts, store, eventId: ev.id, external,
        today: new Date().toISOString().slice(0, 10),
      });
      const landingUrl = cleanLandingUrl(store.landingUrl);
      return {
        event: { id: ev.id, name: ev.name, startAt: ev.startAt, endAt: ev.endAt },
        code: campaignCode(ev.id),
        landingUrl,
        aliases: store.aliases ?? [],
        locked: !!plan.lockedAt,
        kpi: plan.kpi ? { budget: plan.kpi.budget ?? null, goals: plan.kpi.goals ?? [] } : null,
        fbPage: page,
        fbSyncEnabled: fbSyncEnabled(),
        ...report,
        // 每一篇的追蹤連結（設了導流網址才有）。
        items: report.items.map((i) => ({
          ...i,
          link: landingUrl ? campaignLink(landingUrl, { eventId: ev.id, itemId: i.id, phase: i.phase, platform: i.platform, paid: i.paid }) : null,
        })),
      };
    }),

  /** 活動導流網址（每一篇的追蹤連結由它加上 UTM）；null＝清掉。 */
  campaignLanding: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), eventId: z.number().int().positive(), url: z.string().max(500).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const ev = await loadCampaignEvent(input.eventId, ctx.user!.id);
      if (!ev || ev.brandId !== input.brandId) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個活動" });
      const url = cleanLandingUrl(input.url);
      if (input.url && !url) throw new TRPCError({ code: "BAD_REQUEST", message: "網址要是 http:// 或 https:// 開頭" });
      await saveCampaignPerf(input.eventId, ctx.user!.id, { ...((ev.pos?.campaignPerf ?? {}) as CampaignPerfStore), landingUrl: url });
      return { ok: true, landingUrl: url };
    }),

  /** 匯入檔名稱對應：名稱含這幾個字的列算這檔（Meta 廣告行銷活動名稱等）。 */
  campaignAlias: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(), eventId: z.number().int().positive(),
      alias: z.string().min(2).max(80), op: z.enum(["add", "remove"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const ev = await loadCampaignEvent(input.eventId, ctx.user!.id);
      if (!ev || ev.brandId !== input.brandId) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個活動" });
      const next = applyAlias((ev.pos?.campaignPerf ?? {}) as CampaignPerfStore, input.alias, input.op);
      await saveCampaignPerf(input.eventId, ctx.user!.id, next);
      return { ok: true, aliases: next.aliases ?? [] };
    }),

  /** 待確認的貼文：配對到某一格／企劃外／不是這檔／放回待確認。 */
  campaignMatch: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(), eventId: z.number().int().positive(),
      key: z.string().min(3).max(240),
      action: z.enum(["match", "extra", "dismiss", "clear"]),
      itemId: z.string().max(80).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const ev = await loadCampaignEvent(input.eventId, ctx.user!.id);
      if (!ev || ev.brandId !== input.brandId) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個活動" });
      if (input.action === "match" && !(ev.pos?.campaignPlan?.items ?? []).some((i: any) => i?.id === input.itemId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "企劃上找不到這一篇" });
      }
      const next = applyMatch((ev.pos?.campaignPerf ?? {}) as CampaignPerfStore, input.key, input.action, input.itemId ?? null);
      await saveCampaignPerf(input.eventId, ctx.user!.id, next);
      return { ok: true };
    }),

  /** 粉專沒有的數字（名單、訂單、營收…）手動填；null＝清掉。 */
  campaignManual: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(), eventId: z.number().int().positive(),
      phase: z.enum(["teaser", "launch", "sustain", "lastcall", "encore"]),
      metric: z.string().regex(/^[a-z]{2,20}$/),
      value: z.number().min(0).max(1_000_000_000).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const ev = await loadCampaignEvent(input.eventId, ctx.user!.id);
      if (!ev || ev.brandId !== input.brandId) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個活動" });
      const store = (ev.pos?.campaignPerf ?? {}) as CampaignPerfStore;
      const manual = { ...(store.manual ?? {}) };
      const row = { ...(manual[input.phase] ?? {}) };
      if (input.value == null) delete row[input.metric]; else row[input.metric] = input.value;
      manual[input.phase] = row;
      await saveCampaignPerf(input.eventId, ctx.user!.id, { ...store, manual });
      return { ok: true };
    }),

  outputTags: protectedProcedure
    .input(z.object({ outputId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const o = await outputOf(ctx.user!.id, input.outputId);
      if (!o.brandId) return { brandId: null, dims: [], tags: {} as Record<string, string> };
      return { brandId: o.brandId, dims: await listDimensions(o.brandId), tags: (o.metadata?.perfTags ?? {}) as Record<string, string> };
    }),

  /** 產出頁：設定這篇的成效標籤（發布後回填時，貼文會自動帶著這些標籤進漏斗）。 */
  tagOutput: protectedProcedure
    .input(z.object({ outputId: z.number().int().positive(), tags: z.record(z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/)) }))
    .mutation(async ({ ctx, input }) => {
      const o = await outputOf(ctx.user!.id, input.outputId);
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(input.tags)) if (/^[a-z][a-z0-9_]{0,39}$/.test(k)) clean[k] = v;
      const { default: localPool } = await import("../../localDb");
      await localPool.execute(
        `UPDATE mission_outputs SET metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()), '$.perfTags', CAST(? AS JSON)) WHERE id = ?`,
        [JSON.stringify(clean), input.outputId],
      );
      // 已經發布、已經回填過的貼文：標籤直接補到事實上，不必等下次同步。
      if (o.brandId && o.externalPostId) {
        for (const [k, v] of Object.entries(clean)) {
          await localPool.execute(
            `UPDATE perf_facts SET tags = JSON_SET(COALESCE(tags, JSON_OBJECT()), ?, ?)
              WHERE brandId = ? AND source = 'fb_page' AND (entityId = ? OR entityId LIKE ?)`,
            [`$."${k}"`, v, o.brandId, o.externalPostId, `%\\_${String(o.externalPostId).split("_").pop()}`],
          );
        }
      }
      return { ok: true, utmContent: utmContent(clean) };
    }),
});

// ─── helpers

async function outputOf(userId: number, outputId: number): Promise<{ brandId: number | null; metadata: any; externalPostId: string | null }> {
  const { default: localPool } = await import("../../localDb");
  const [rows]: any = await localPool.execute(
    `SELECT m.brandId, m.userId, mo.metadata,
            (SELECT sp.externalPostId FROM scheduled_posts sp WHERE sp.outputId = mo.id AND sp.externalPostId IS NOT NULL ORDER BY sp.id DESC LIMIT 1) AS externalPostId
       FROM mission_outputs mo JOIN missions m ON m.id = mo.missionId
      WHERE mo.id = ? LIMIT 1`,
    [outputId],
  );
  const r = (rows as any[])[0];
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這篇產出" });
  if (r.brandId) await assertBrandAccess(userId, r.brandId);
  else if (r.userId !== userId) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這篇產出" });
  const metadata = typeof r.metadata === "string" ? (() => { try { return JSON.parse(r.metadata); } catch { return {}; } })() : (r.metadata ?? {});
  return { brandId: r.brandId ?? null, metadata, externalPostId: r.externalPostId ?? null };
}

async function findLens(brandId: number, id: number) {
  for (const tray of TRAYS) {
    const hit = (await listLenses(brandId, tray)).find((l) => l.id === id);
    if (hit) return hit;
  }
  throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個視角" });
}

const MAX_FILE_BYTES = 12 * 1024 * 1024;

export function decodeBuffer(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf.subarray(2));
  const utf8 = new TextDecoder("utf-8").decode(buf);
  // 台灣 Excel 另存的 CSV 常是 Big5；UTF-8 解出一堆替代字元就改用 Big5
  if ((utf8.match(/�/g)?.length ?? 0) > 3) {
    try { return new TextDecoder("big5").decode(buf); } catch { /* ICU 不完整就算了 */ }
  }
  return utf8;
}

async function runExtract(mode: "table" | "text", fileName: string, buf: Buffer): Promise<string> {
  const ext = fileName.toLowerCase().match(/\.(xlsx|pptx)$/)?.[1];
  if (!ext) throw new TRPCError({ code: "BAD_REQUEST", message: "只支援 .csv / .xlsx / .pptx" });
  const tmp = join(tmpdir(), `perf-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  await fs.writeFile(tmp, buf);
  try {
    const script = join(process.cwd(), "scripts", "perf", "extract.py");
    const { stdout } = await promisify(execFile)("python3", [script, mode, tmp], { timeout: 60_000, maxBuffer: 32 * 1024 * 1024 });
    return stdout;
  } catch (e: any) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `檔案解析失敗：${String(e?.stderr || e?.message || e).slice(0, 200)}` });
  } finally {
    fs.unlink(tmp).catch(() => {});
  }
}

async function fileToCsv(fileName: string, b64: string): Promise<string> {
  const buf = Buffer.from(b64, "base64");
  if (buf.length > MAX_FILE_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "檔案超過 12MB" });
  if (/\.xlsx$/i.test(fileName)) return runExtract("table", fileName, buf);
  return decodeBuffer(buf);
}

async function fileToText(fileName: string, b64: string): Promise<string> {
  const buf = Buffer.from(b64, "base64");
  if (buf.length > 80 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "檔案超過 80MB" });
  if (/\.(xlsx|pptx)$/i.test(fileName)) return runExtract("text", fileName, buf);
  return decodeBuffer(buf).slice(0, 60_000);
}
