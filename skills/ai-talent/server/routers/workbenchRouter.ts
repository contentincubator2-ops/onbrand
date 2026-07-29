/**
 * workbenchRouter — 策略工作台（品牌大腦 P1，2026-07-28 CJ「開工」）.
 *
 * The brand-brain strategy workbench: user picks three anchors —
 *   受眾 (which audience lens) × 競爭組 (which competitors) × 主打優勢 —
 * and `derive` synthesises the four-zone board from EXISTING positioning
 * segments (audience / competition / differentiation / goldenCircle):
 *   🎯 spots      — she wants it · chosen rivals can't · chosen strengths can
 *   ⚔️ stakes     — table stakes (everyone does it; must match, never lead)
 *   🚫 rivalTurf  — real demand we strategically concede
 *   💤 vanity     — we love saying it; she doesn't care
 * Each spot carries the derivation chain (need ← gap ← ours) plus one
 * tagline candidate, so 標語 visibly grows out of a specific sweet spot.
 *
 * Results persist to positioning._workbench.scenarios[] (named scenarios,
 * compare/apply comes in P3). Single LLM call, ~30s, nginx-safe.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import localPool from "../localDb";
import { startPositioningJob, type PositioningStep, type StepContext } from "../_core/positioningJobRunner";

/** LLM call + JSON parse for cascade steps (cost recorded via ctx). */
async function stepJSON(ctx: StepContext, stepId: string, sys: string, user: string, maxTokens = 1500): Promise<any | null> {
  const { invokeLLM } = await import("../_core/llm");
  const r = await invokeLLM({
    messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    maxTokens,
  });
  const raw = r.choices[0]?.message?.content;
  const text = typeof raw === "string" ? raw : "";
  const inTok = r.usage?.prompt_tokens ?? 0;
  const outTok = r.usage?.completion_tokens ?? 0;
  await ctx.recordUsage(`workbench_cascade:${stepId}`, r.model || "anthropic/claude-haiku-4-5", inTok, outTok, (inTok * 1.0 + outTok * 5.0) / 1_000_000);
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jt = m ? m[1]!.trim() : text.trim();
  try { return JSON.parse(jt); } catch {
    const s = jt.indexOf("{");
    if (s >= 0) { try { return JSON.parse(jt.slice(s)); } catch {} }
  }
  return null;
}

type Zone = { title: string; note?: string };
export type WorkbenchSpot = {
  lane: "emotion" | "function";
  title: string;
  need: string;
  gap: string;
  ours: string;
  tagline?: { zh: string; en?: string };
  /** 2026-07-29 (CJ「其中一個甜蜜點，必須要是定位書的內容」): true =
   *  this spot IS the brand's existing official positioning restated as a
   *  need←gap←ours chain — never an AI invention. Always spots[0]. */
  official?: boolean;
};
export type WorkbenchDerived = {
  spots: WorkbenchSpot[];
  stakes: Zone[];
  rivalTurf: Zone[];
  vanity: Zone[];
  currentTaglineSpot?: string | null;
};
/** P2 (2026-07-28): per-spot deep-dive payload persisted on spot.dig. */
export type SpotDig = {
  scenes: Array<{ scene: string; mot: string }>;
  contentAngles: string[];
  risks: string[];
};

async function loadBrandPositioning(brandId: number, userId: number): Promise<{ name: string; pos: any } | null> {
  const [rows]: any = await localPool.execute(
    `SELECT name, positioning FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
    [brandId, userId],
  );
  const brand = (rows as any[])[0];
  if (!brand) return null;
  let pos: any = brand.positioning;
  if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
  return { name: brand.name, pos: pos ?? {} };
}

async function loadEventPositioning(eventId: number, brandId: number, userId: number): Promise<{ name: string; pos: any } | null> {
  const [rows]: any = await localPool.execute(
    `SELECT name, positioning FROM events WHERE id = ? AND brandId = ? AND userId = ? LIMIT 1`,
    [eventId, brandId, userId],
  );
  const ev = (rows as any[])[0];
  if (!ev) return null;
  let pos: any = ev.positioning;
  if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
  return { name: ev.name, pos: pos ?? {} };
}

/** 2026-07-29 (「穩定了」— generalize workbench to events): a scenario can
 *  live on a brand OR on an event. `entityId` is the row that owns the
 *  scenario/scoreboard (brand.positioning._workbench or event.positioning._workbench).
 *  Events have no competition/differentiation/goldenCircle segments of their
 *  own, so when scoped to an event we still borrow those from the PARENT
 *  brand (brandId) as read-only ground material — never write back to it. */
type Scope = { entityKind: "brand" | "event"; entityId: number; brandId: number };

async function loadScopedPositioning(scope: Scope, userId: number): Promise<{ name: string; pos: any } | null> {
  return scope.entityKind === "event"
    ? loadEventPositioning(scope.entityId, scope.brandId, userId)
    : loadBrandPositioning(scope.entityId, userId);
}
async function saveScopedPositioning(scope: Scope, userId: number, pos: any): Promise<void> {
  const table = scope.entityKind === "event" ? "events" : "brands";
  await localPool.execute(
    `UPDATE ${table} SET positioning = ? WHERE id = ? AND userId = ?`,
    [JSON.stringify(pos), scope.entityId, userId],
  );
}

const selectionSchema = z.object({
  audience: z.string().min(1).max(600),
  competitors: z.array(z.string().min(1).max(80)).min(1).max(8),
  advantages: z.array(z.string().min(1).max(200)).min(1).max(6),
});

const scopeSchema = {
  brandId: z.number().int().positive(),
  eventId: z.number().int().positive().optional().nullable(),
};
function toScope(input: { brandId: number; eventId?: number | null }): Scope {
  return input.eventId
    ? { entityKind: "event", entityId: input.eventId, brandId: input.brandId }
    : { entityKind: "brand", entityId: input.brandId, brandId: input.brandId };
}

export const workbenchRouter = router({
  derive: protectedProcedure
    .input(z.object({
      ...scopeSchema,
      scenarioName: z.string().min(1).max(40).default("情境 A"),
      selection: selectionSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const scope = toScope(input);
      const loaded = await loadScopedPositioning(scope, userId);
      if (!loaded) throw new TRPCError({ code: "NOT_FOUND", message: `${scope.entityKind} not found` });
      const { name: entityName, pos } = loaded;

      // Ground material differs by scope:
      //  - brand: audience/competition/differentiation/goldenCircle/tagline
      //    all live on the brand's own positioning.
      //  - event: audience/SMP/creative live on the event's own positioning;
      //    competition/differentiation are borrowed (read-only) from the
      //    parent brand, since events don't do their own competitive analysis.
      const brandPos = scope.entityKind === "event"
        ? (await loadBrandPositioning(scope.brandId, userId))?.pos ?? {}
        : pos;
      const aud = pos.audience ?? {};
      const audPrimary = scope.entityKind === "event"
        ? [aud.primaryAudience, aud.keyInsight].filter(Boolean).join("\n")
        : String(aud.primary ?? "");
      const audSecondary = scope.entityKind === "event" ? String(aud.secondaryAudience ?? "") : "";
      const compRows: any[] = Array.isArray(brandPos.competition?.direct) ? brandPos.competition.direct : [];
      const pickedComp = compRows.filter((c) =>
        input.selection.competitors.some((n) => String(c?.name ?? "").includes(n) || n.includes(String(c?.name ?? ""))));
      const compBlock = (pickedComp.length > 0 ? pickedComp : compRows.slice(0, 4))
        .map((c) => `- ${c.name}：地位=${c.position ?? "?"}｜調性=${c.tone ?? "?"}｜弱點=${c.weakness ?? "?"}｜我方差異=${c.ourEdge ?? "?"}`)
        .join("\n");
      const diff = brandPos.differentiation ?? {};

      // "Official positioning" ground text — what spots[0] must restate:
      //  - brand: differentiation summary + goldenCircle WHY + current tagline
      //  - event: SMP (single-minded proposition) + core message/creative
      const officialGroundText = scope.entityKind === "event"
        ? `SMP（單一核心命題）：${String(pos.smp?.singleMindedProposition ?? "").slice(0, 300)}\n核心訊息：${String(pos.messaging?.coreMessage ?? "").slice(0, 200)}\n創意核心轉譯：${String(pos.creative?.coreTranslation ?? "").slice(0, 200)}`
        : `差異化：情感=${String(diff.emotional ?? "").slice(0, 200)}｜功能=${String(diff.functional ?? "").slice(0, 200)}｜總結=${String(diff.summary ?? "").slice(0, 200)}\n黃金圈 WHY：${String(brandPos.goldenCircle?.why ?? "").slice(0, 200)}\n現行標語：${brandPos.tagline?.zhTagline || "（無）"}`;
      const curTagline = scope.entityKind === "event"
        ? (pos.smp?.singleMindedProposition ?? "")
        : (brandPos.tagline?.zhTagline ?? "");
      const officialLabel = scope.entityKind === "event" ? "活動「現有 SMP／核心訊息」" : "品牌「現有正式定位」";

      const sys = `你是${scope.entityKind === "event" ? "活動" : "品牌"}策略顧問，繁體中文。任務：依「消費者想要 × 所選競爭者無法滿足 × 所選優勢能提供」的交集邏輯，產出四區策略看板。只輸出 JSON，第一字元就是 {。

【本輪錨點 — 不可偏離】
受眾錨點（所有需求必須屬於這個受眾）：${input.selection.audience}
競爭組（缺口只能來自這幾家）：${input.selection.competitors.join("、")}
主打優勢（ours 只能從這裡選用）：${input.selection.advantages.join("、")}

【${scope.entityKind === "event" ? "活動" : "品牌"}研究資料】
受眾主敘事：${audPrimary.slice(0, 500)}${audSecondary ? `\n次受眾：${audSecondary.slice(0, 200)}` : ""}
${scope.entityKind === "brand" ? `受眾痛點/需求：${JSON.stringify(aud.pains ?? [])} ${JSON.stringify(aud.needs ?? [])}\n` : ""}競品攻防：
${compBlock}
${officialGroundText}

【定位書錨點 — 最重要規則】
spots[0] 必須是${officialLabel}本身：把上方${scope.entityKind === "event" ? "SMP／核心訊息" : "差異化總結／黃金圈 WHY／現行標語"}所承載的正式定位，忠實改寫成 need←gap←ours 因果鏈——不可加入正式定位沒有的新主張，不可稀釋或改向，並標 "official": true。
其餘 spots 才是依本輪錨點推導的延伸機會（"official": false），且不可與正式定位矛盾。

輸出 JSON 結構：
{
  "spots": [ { "lane": "emotion|function", "title": "甜蜜點名稱（≤14字）", "need": "她要什麼（≤30字）", "gap": "所選競爭者的具體缺口（點名品牌，≤40字）", "ours": "我們憑什麼（引用所選優勢，≤40字）", "official": true|false, "tagline": { "zh": "從這個點長出的${scope.entityKind === "event" ? "SMP／一句話主張" : "標語"}（≤14字）", "en": "英文版" } } ],
  "stakes": [ { "title": "基本籌碼（她要・對手也有）", "note": "≤24字說明" } ],
  "rivalTurf": [ { "title": "對手地盤（她要・我們不跟）", "note": "為何不跟 ≤24字" } ],
  "vanity": [ { "title": "自嗨區（我們想講・她無感）", "note": "轉化建議 ≤24字" } ],
  "currentTaglineSpot": "現行${scope.entityKind === "event" ? "SMP" : "標語"}最接近哪個 spot 的 title；無法對應則 null"
}
spots 2-4 個（情感與功能都要有）；stakes/rivalTurf/vanity 各 1-3 個。每個 spot 的 need/gap/ours 必須構成可唸出來的因果鏈。`;

      const { invokeLLM } = await import("../_core/llm");
      const r = await Promise.race([
        invokeLLM({
          messages: [
            { role: "system", content: sys },
            { role: "user", content: `${scope.entityKind === "event" ? "活動" : "品牌"}：${entityName}。請產出四區策略看板。` },
          ],
          maxTokens: 2800,
        }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("LLM timeout")), 40_000)),
      ]);
      const raw = r.choices[0]?.message?.content;
      const text = typeof raw === "string" ? raw : "";
      try {
        const inTok = r.usage?.prompt_tokens ?? 0;
        const outTok = r.usage?.completion_tokens ?? 0;
        await localPool.execute(
          `INSERT INTO usage_log (userId, entityKind, entityId, kind, model, inputTokens, outputTokens, costUsd)
                VALUES (?, ?, ?, 'workbench_derive', ?, ?, ?, ?)`,
          [userId, scope.entityKind, scope.entityId, r.model || "anthropic/claude-haiku-4-5", inTok, outTok,
           (inTok * 1.0 + outTok * 5.0) / 1_000_000],
        );
      } catch { /* non-fatal */ }

      const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonText = m ? m[1]!.trim() : text.trim();
      let derived: WorkbenchDerived | null = null;
      try { derived = JSON.parse(jsonText); } catch {
        const start = jsonText.indexOf("{");
        if (start >= 0) { try { derived = JSON.parse(jsonText.slice(start)); } catch {} }
      }
      if (!derived || !Array.isArray(derived.spots) || derived.spots.length === 0) {
        return { ok: false as const, error: "推導結果解析失敗，請再試一次" };
      }
      // 定位書錨點保險：official spot 必須存在且排第一（LLM 漏標時補標）。
      const offIdx = derived.spots.findIndex((s: any) => s?.official === true);
      if (offIdx > 0) {
        const [off] = derived.spots.splice(offIdx, 1);
        derived.spots.unshift(off!);
      } else if (offIdx === -1) {
        (derived.spots[0] as any).official = true;
      }

      // Persist scenario (replace same-name, append otherwise)
      const wb = (pos._workbench && typeof pos._workbench === "object") ? pos._workbench : { scenarios: [] };
      const scenarios: any[] = Array.isArray(wb.scenarios) ? wb.scenarios : [];
      const scenario = {
        id: `${Date.now().toString(36)}`,
        name: input.scenarioName,
        selection: input.selection,
        derived,
        createdAt: new Date().toISOString(),
      };
      const idx = scenarios.findIndex((s) => s?.name === input.scenarioName);
      if (idx >= 0) scenarios[idx] = scenario; else scenarios.push(scenario);
      pos._workbench = { ...(pos._workbench ?? {}), scenarios: scenarios.slice(-8), activeId: scenario.id };
      await saveScopedPositioning(scope, userId, pos);
      return { ok: true as const, scenario };
    }),

  /** P2 深挖此點 — per-spot deep dive: 生活場景+MOT / 內容角度（可直接
   *  當任務題目）/ 風險與對手反應。Persisted onto the spot so re-opening
   *  the scenario keeps the dig. */
  digSpot: protectedProcedure
    .input(z.object({
      ...scopeSchema,
      scenarioId: z.string().min(1).max(40),
      spotIndex: z.number().int().min(0).max(7),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const scope = toScope(input);
      const loaded = await loadScopedPositioning(scope, userId);
      if (!loaded) throw new TRPCError({ code: "NOT_FOUND", message: `${scope.entityKind} not found` });
      const { name, pos } = loaded;
      const scenarios: any[] = Array.isArray(pos._workbench?.scenarios) ? pos._workbench.scenarios : [];
      const scn = scenarios.find((s) => s?.id === input.scenarioId);
      const spot = scn?.derived?.spots?.[input.spotIndex];
      if (!spot) return { ok: false as const, error: "找不到這個甜蜜點，請先重新推導" };

      const sys = `你是${scope.entityKind === "event" ? "活動" : "品牌"}策略顧問，繁體中文。針對單一「甜蜜點」往下深挖。只輸出 JSON，第一字元就是 {。

【甜蜜點】${spot.title}
推導鏈：${spot.need} ←（對手缺口）${spot.gap} ←（我方能力）${spot.ours}
受眾錨點：${String(scn.selection?.audience ?? "").slice(0, 300)}
品牌：${name}

輸出 JSON：
{
  "scenes": [ { "scene": "具體生活場景（≤30字）", "mot": "該場景的購買關鍵時刻（≤30字）" } ],
  "contentAngles": [ "可直接當社群任務題目的內容角度（≤20字）" ],
  "risks": [ "風險或對手可能的反應與我們的預防（≤36字）" ]
}
scenes 3 個、contentAngles 4-6 個、risks 2-3 個。全部必須緊扣這個甜蜜點，不可泛談。`;
      const { invokeLLM } = await import("../_core/llm");
      const r = await Promise.race([
        invokeLLM({
          messages: [
            { role: "system", content: sys },
            { role: "user", content: "請深挖這個甜蜜點。" },
          ],
          maxTokens: 1400,
        }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("LLM timeout")), 35_000)),
      ]);
      const raw = r.choices[0]?.message?.content;
      const text = typeof raw === "string" ? raw : "";
      const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonText = m ? m[1]!.trim() : text.trim();
      let dig: SpotDig | null = null;
      try { dig = JSON.parse(jsonText); } catch {
        const start = jsonText.indexOf("{");
        if (start >= 0) { try { dig = JSON.parse(jsonText.slice(start)); } catch {} }
      }
      if (!dig || !Array.isArray(dig.contentAngles)) return { ok: false as const, error: "深挖結果解析失敗，請再試一次" };
      spot.dig = dig;
      await saveScopedPositioning(scope, userId, pos);
      return { ok: true as const, dig };
    }),

  /** P2 套用為正式定位 — the scenario's anchors become the brand's canon:
   *  - brands.targetAudience ← selection.audience（= officialAudience 錨點，
   *    之後所有定位重跑與文案任務都鎖這個客群）
   *  - 指定 spot 的標語 ← positioning.tagline + brands.tagline 欄位
   *  - _workbench.appliedId 記錄已套用情境 */
  applyScenario: protectedProcedure
    .input(z.object({
      ...scopeSchema,
      scenarioId: z.string().min(1).max(40),
      taglineSpotIndex: z.number().int().min(0).max(7).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const scope = toScope(input);
      const isEvent = scope.entityKind === "event";
      const loaded = await loadScopedPositioning(scope, userId);
      if (!loaded) throw new TRPCError({ code: "NOT_FOUND", message: `${scope.entityKind} not found` });
      const { name: entityName, pos } = loaded;
      const scenarios: any[] = Array.isArray(pos._workbench?.scenarios) ? pos._workbench.scenarios : [];
      const scn = scenarios.find((s) => s?.id === input.scenarioId);
      if (!scn?.derived) return { ok: false as const, error: "找不到情境，請先推導" };

      const applied: string[] = [];
      const audienceText = String(scn.selection?.audience ?? "").trim();

      let tagZh: string | null = null;
      let tagEn: string | null = null;
      if (input.taglineSpotIndex != null) {
        const spot = scn.derived.spots?.[input.taglineSpotIndex];
        if (spot?.tagline?.zh) {
          tagZh = String(spot.tagline.zh);
          tagEn = spot.tagline.en ? String(spot.tagline.en) : null;
          if (isEvent) {
            // Event's tagline-equivalent anchor is the SMP.
            pos.smp = { ...(pos.smp ?? {}), singleMindedProposition: tagZh };
            applied.push(`SMP ←「${tagZh}」（甜蜜點：${spot.title}）`);
          } else {
            pos.tagline = { ...(pos.tagline ?? {}), zhTagline: tagZh, ...(tagEn ? { enTagline: tagEn } : {}) };
            applied.push(`主標語 ←「${tagZh}」（甜蜜點：${spot.title}）`);
          }
        }
      }
      // Lock the applied audience anchor into the entity's own audience
      // segment for events (brands additionally get a flat targetAudience
      // column that other readers use).
      if (audienceText && isEvent) {
        pos.audience = { ...(pos.audience ?? {}), primaryAudience: audienceText.slice(0, 600) };
      }
      pos._workbench = { ...(pos._workbench ?? {}), appliedId: scn.id };
      if (isEvent) {
        await saveScopedPositioning(scope, userId, pos);
      } else {
        await localPool.execute(
          `UPDATE brands SET positioning = ?${audienceText ? ", targetAudience = ?" : ""}${tagZh ? ", tagline = ?" : ""} WHERE id = ? AND userId = ?`,
          [JSON.stringify(pos), ...(audienceText ? [audienceText.slice(0, 600)] : []), ...(tagZh ? [tagZh] : []), scope.entityId, userId],
        );
      }
      if (audienceText) applied.unshift("受眾錨點 ← 本情境所選受眾（之後所有推導與文案鎖定此客群）");

      // ── 2026-07-29 (CJ「當然要跟著重生。品牌工具、黃金圈等等，應該要跟著
      // 上方的策略工作台而變動」): downstream CASCADE. The page's two natures:
      //   第一〜三幕（受眾/競品/趨勢/起源/價值觀）= research EVIDENCE — the
      //   workbench selects FROM them, never overwrites them.
      //   第四〜五幕＋工具（差異化/黃金圈/語氣/標語評分/AI 指令庫）= strategy
      //   EXPRESSION — regenerated here so the whole page follows the applied
      //   scenario. 速查卡 is a derived view of tagline/goldenCircle/
      //   differentiation, so it updates for free.
      // Runs as a positioning job (in-process, per-step retry, progress
      // pollable via positioningJobs.getStatusBatch).
      const spots: any[] = Array.isArray(scn.derived?.spots) ? scn.derived.spots : [];
      const scenarioBlock =
        `【已套用的策略情境（本次所有輸出必須與其一致）】\n` +
        `受眾錨點：${audienceText.slice(0, 400)}\n` +
        `競爭組：${(scn.selection?.competitors ?? []).join("、")}\n` +
        `主打優勢：${(scn.selection?.advantages ?? []).join("、")}\n` +
        `甜蜜點：\n` +
        spots.map((s: any, i: number) => `${i + 1}. ${s.title}｜她要=${s.need}｜對手缺口=${s.gap}｜我們=${s.ours}`).join("\n") +
        (tagZh ? `\n${isEvent ? "SMP" : "主標語"}：${tagZh}${tagEn ? `（${tagEn}）` : ""}` : "");
      const SYS = `你是${isEvent ? "活動" : "品牌"}策略顧問，繁體中文。只輸出 JSON，第一字元就是 {。`;
      const entityIdForSteps = scope.entityId;

      const steps: PositioningStep[] = isEvent ? [
        {
          id: "messaging", label: "訊息架構（依情境重生）", deps: [],
          run: async (c) => {
            const msg = await stepJSON(c, "messaging", SYS,
              `${scenarioBlock}\n\n依此情境重寫活動訊息架構。輸出 JSON：\n{"coreMessage":"核心訊息（80-150字）","supportingPoints":["支撐訊息1","支撐訊息2","支撐訊息3"],"proofs":["證據/案例/數據1","證據2"]}`, 1200);
            if (!msg?.coreMessage) throw new Error("messaging parse failed");
            return { messaging: msg };
          },
        },
        {
          id: "creative", label: "創意概念（依情境重生）", deps: [],
          run: async (c) => {
            const cur = await loadEventPositioning(entityIdForSteps, scope.brandId, userId);
            const smp = String(cur?.pos?.smp?.singleMindedProposition ?? tagZh ?? "").slice(0, 200);
            const cr = await stepJSON(c, "creative", SYS,
              `${scenarioBlock}\n\nSMP（不可矛盾）：${smp}\n\n依此情境重寫創意概念——大創意須能被一句話講完、一個比喻記住。輸出 JSON：\n{"creativeTheme":"創意主題/big idea（≤60字）","coreMetaphor":"核心比喻（≤60字）","coreTranslation":"核心轉譯一句話 hook（≤30字）"}`, 1200);
            if (!cr?.creativeTheme) throw new Error("creative parse failed");
            return { creative: cr };
          },
        },
      ] : [
        {
          id: "differentiation", label: "差異化戰略（依情境重生）", deps: [],
          run: async (c) => {
            const d = await stepJSON(c, "differentiation", SYS,
              `${scenarioBlock}\n\n依此情境重寫品牌差異化戰略。輸出 JSON：\n{"emotional":"情感差異化（為什麼愛我，80-150字）","functional":"功能差異化（為什麼選我，80-150字）","summary":"差異化總結一句（≤60字）"}`, 1200);
            if (!d?.summary) throw new Error("differentiation parse failed");
            return { differentiation: d };
          },
        },
        {
          id: "goldenCircle", label: "品牌黃金圈（依情境重生）", deps: [],
          run: async (c) => {
            const cur = await loadBrandPositioning(entityIdForSteps, userId);
            const origin = String(cur?.pos?.origin?.story ?? "").slice(0, 300);
            const values = JSON.stringify(cur?.pos?.values?.items ?? []).slice(0, 300);
            const g = await stepJSON(c, "goldenCircle", SYS,
              `${scenarioBlock}\n\n品牌起源（不可矛盾）：${origin}\n核心價值觀：${values}\n\n依此情境重寫黃金圈——WHY 仍須根植於起源與價值觀，HOW/WHAT 反映所選優勢與受眾。輸出 JSON：\n{"why":"品牌願景（100-200字）","how":"品牌使命/方法（100-200字）","what":"產品服務（80-150字）"}`, 1600);
            if (!g?.why) throw new Error("goldenCircle parse failed");
            return { goldenCircle: g };
          },
        },
        {
          id: "voice", label: "品牌個性與語氣（依情境重生）", deps: [],
          run: async (c) => {
            const v = await stepJSON(c, "voice", SYS,
              `${scenarioBlock}\n\n依此情境定義品牌個性與溝通風格（語氣必須說給「受眾錨點」那個人聽）。輸出 JSON：\n{"archetypes":["主原型（英雄/智者/創造者/照顧者/探險家/反叛者/魔法師/一般人/戀人/弄臣/統治者/純真者擇一）","次原型"],"tone":["語調詞1","語調詞2","語調詞3","語調詞4"],"forbidden":["溝通禁區1","溝通禁區2","溝通禁區3"],"samples":[{"generic":"一般說法","ours":"我們的說法"}]}\nsamples 3 組。`, 1400);
            if (!v?.tone) throw new Error("voice parse failed");
            return { voice: v };
          },
        },
        ...(tagZh ? [{
          id: "taglineScore", label: "標語評分（新標語）", deps: [] as string[],
          run: async (c: StepContext) => {
            const t = await stepJSON(c, "taglineScore", SYS,
              `${scenarioBlock}\n\n對主標語做 6 維度評分（每維 1-100）：記憶(Memorability)/差異(Uniqueness)/情感(Emotional)/簡潔(Clarity)/國際化(Global)/可延展(Extensible)。輸出 JSON：\n{"rows":[{"dim":"記憶","code":"Memorability","score":分數,"comment":"30-60字評析"}],"total":總分0-100}`, 1400);
            if (!Array.isArray(t?.rows)) throw new Error("taglineScore parse failed");
            return { taglineScore: t };
          },
        }] : []),
        {
          id: "aiPrompts", label: "AI 指令庫（8 平台人設重生）",
          deps: ["differentiation", "goldenCircle", "voice"],
          run: async (c) => {
            const { generateAiPromptForPlatform } = await import("./brandKnowledgeRouter");
            const platforms = ["facebook", "instagram", "youtube", "threads", "tiktok", "linkedin", "email", "press"] as const;
            const generated: Record<string, { text: string; image: string }> = {};
            for (const p of platforms) {
              try {
                const r = await generateAiPromptForPlatform(entityIdForSteps, userId, p);
                if (r.ok) generated[p] = r.value;
              } catch { /* per-platform best effort */ }
            }
            if (Object.keys(generated).length === 0) throw new Error("aiPrompts: all platforms failed");
            // read-modify-write —mergePositioning 是整鍵覆蓋，_aiPrompts 需保留
            // 未成功平台的既有值。
            const cur = await loadBrandPositioning(entityIdForSteps, userId);
            const merged = { ...(cur?.pos?._aiPrompts ?? {}), ...generated };
            const nextPos = { ...(cur?.pos ?? {}), _aiPrompts: merged };
            await localPool.execute(
              `UPDATE brands SET positioning = ? WHERE id = ? AND userId = ?`,
              [JSON.stringify(nextPos), entityIdForSteps, userId],
            );
            return {};
          },
        },
      ];

      startPositioningJob({
        userId,
        entityKind: scope.entityKind,
        entityId: scope.entityId,
        brandName: entityName,
        description: scenarioBlock,
        steps,
      });

      return { ok: true as const, applied, cascade: true as const, cascadeSteps: steps.length };
    }),
});
