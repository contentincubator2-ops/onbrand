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

type Zone = { title: string; note?: string };
export type WorkbenchSpot = {
  lane: "emotion" | "function";
  title: string;
  need: string;
  gap: string;
  ours: string;
  tagline?: { zh: string; en?: string };
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

const selectionSchema = z.object({
  audience: z.string().min(1).max(600),
  competitors: z.array(z.string().min(1).max(80)).min(1).max(8),
  advantages: z.array(z.string().min(1).max(200)).min(1).max(6),
});

export const workbenchRouter = router({
  derive: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      scenarioName: z.string().min(1).max(40).default("情境 A"),
      selection: selectionSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const [rows]: any = await localPool.execute(
        `SELECT name, positioning FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
        [input.brandId, userId],
      );
      const brand = (rows as any[])[0];
      if (!brand) throw new TRPCError({ code: "NOT_FOUND", message: "brand not found" });
      let pos: any = brand.positioning;
      if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
      pos = pos ?? {};

      // Ground material: only the segments the derivation needs, trimmed.
      const aud = pos.audience ?? {};
      const compRows: any[] = Array.isArray(pos.competition?.direct) ? pos.competition.direct : [];
      const pickedComp = compRows.filter((c) =>
        input.selection.competitors.some((n) => String(c?.name ?? "").includes(n) || n.includes(String(c?.name ?? ""))));
      const compBlock = (pickedComp.length > 0 ? pickedComp : compRows.slice(0, 4))
        .map((c) => `- ${c.name}：地位=${c.position ?? "?"}｜調性=${c.tone ?? "?"}｜弱點=${c.weakness ?? "?"}｜我方差異=${c.ourEdge ?? "?"}`)
        .join("\n");
      const diff = pos.differentiation ?? {};
      const gc = pos.goldenCircle ?? {};
      const curTagline = pos.tagline?.zhTagline ?? "";

      const sys = `你是品牌策略顧問，繁體中文。任務：依「消費者想要 × 所選競爭者無法滿足 × 所選優勢能提供」的交集邏輯，產出四區策略看板。只輸出 JSON，第一字元就是 {。

【本輪錨點 — 不可偏離】
受眾錨點（所有需求必須屬於這個受眾）：${input.selection.audience}
競爭組（缺口只能來自這幾家）：${input.selection.competitors.join("、")}
主打優勢（ours 只能從這裡選用）：${input.selection.advantages.join("、")}

【品牌研究資料】
受眾主敘事：${String(aud.primary ?? "").slice(0, 500)}
受眾痛點/需求：${JSON.stringify(aud.pains ?? [])} ${JSON.stringify(aud.needs ?? [])}
競品攻防：
${compBlock}
差異化：情感=${String(diff.emotional ?? "").slice(0, 200)}｜功能=${String(diff.functional ?? "").slice(0, 200)}｜總結=${String(diff.summary ?? "").slice(0, 200)}
黃金圈 WHY：${String(gc.why ?? "").slice(0, 200)}
現行標語：${curTagline || "（無）"}

輸出 JSON 結構：
{
  "spots": [ { "lane": "emotion|function", "title": "甜蜜點名稱（≤14字）", "need": "她要什麼（≤30字）", "gap": "所選競爭者的具體缺口（點名品牌，≤40字）", "ours": "我們憑什麼（引用所選優勢，≤40字）", "tagline": { "zh": "從這個點長出的標語（≤14字）", "en": "英文版" } } ],
  "stakes": [ { "title": "基本籌碼（她要・對手也有）", "note": "≤24字說明" } ],
  "rivalTurf": [ { "title": "對手地盤（她要・我們不跟）", "note": "為何不跟 ≤24字" } ],
  "vanity": [ { "title": "自嗨區（我們想講・她無感）", "note": "轉化建議 ≤24字" } ],
  "currentTaglineSpot": "現行標語最接近哪個 spot 的 title；無法對應則 null"
}
spots 2-4 個（情感與功能都要有）；stakes/rivalTurf/vanity 各 1-3 個。每個 spot 的 need/gap/ours 必須構成可唸出來的因果鏈。`;

      const { invokeLLM } = await import("../_core/llm");
      const r = await Promise.race([
        invokeLLM({
          messages: [
            { role: "system", content: sys },
            { role: "user", content: `品牌：${brand.name}。請產出四區策略看板。` },
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
                VALUES (?, 'brand', ?, 'workbench_derive', ?, ?, ?, ?)`,
          [userId, input.brandId, r.model || "anthropic/claude-haiku-4-5", inTok, outTok,
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
      await localPool.execute(
        `UPDATE brands SET positioning = ? WHERE id = ? AND userId = ?`,
        [JSON.stringify(pos), input.brandId, userId],
      );
      return { ok: true as const, scenario };
    }),

  /** P2 深挖此點 — per-spot deep dive: 生活場景+MOT / 內容角度（可直接
   *  當任務題目）/ 風險與對手反應。Persisted onto the spot so re-opening
   *  the scenario keeps the dig. */
  digSpot: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      scenarioId: z.string().min(1).max(40),
      spotIndex: z.number().int().min(0).max(7),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const loaded = await loadBrandPositioning(input.brandId, userId);
      if (!loaded) throw new TRPCError({ code: "NOT_FOUND", message: "brand not found" });
      const { name, pos } = loaded;
      const scenarios: any[] = Array.isArray(pos._workbench?.scenarios) ? pos._workbench.scenarios : [];
      const scn = scenarios.find((s) => s?.id === input.scenarioId);
      const spot = scn?.derived?.spots?.[input.spotIndex];
      if (!spot) return { ok: false as const, error: "找不到這個甜蜜點，請先重新推導" };

      const sys = `你是品牌策略顧問，繁體中文。針對單一「甜蜜點」往下深挖。只輸出 JSON，第一字元就是 {。

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
      await localPool.execute(
        `UPDATE brands SET positioning = ? WHERE id = ? AND userId = ?`,
        [JSON.stringify(pos), input.brandId, userId],
      );
      return { ok: true as const, dig };
    }),

  /** P2 套用為正式定位 — the scenario's anchors become the brand's canon:
   *  - brands.targetAudience ← selection.audience（= officialAudience 錨點，
   *    之後所有定位重跑與文案任務都鎖這個客群）
   *  - 指定 spot 的標語 ← positioning.tagline + brands.tagline 欄位
   *  - _workbench.appliedId 記錄已套用情境 */
  applyScenario: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      scenarioId: z.string().min(1).max(40),
      taglineSpotIndex: z.number().int().min(0).max(7).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const loaded = await loadBrandPositioning(input.brandId, userId);
      if (!loaded) throw new TRPCError({ code: "NOT_FOUND", message: "brand not found" });
      const { pos } = loaded;
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
          pos.tagline = { ...(pos.tagline ?? {}), zhTagline: tagZh, ...(tagEn ? { enTagline: tagEn } : {}) };
          applied.push(`主標語 ←「${tagZh}」（甜蜜點：${spot.title}）`);
        }
      }
      pos._workbench = { ...(pos._workbench ?? {}), appliedId: scn.id };
      await localPool.execute(
        `UPDATE brands SET positioning = ?${audienceText ? ", targetAudience = ?" : ""}${tagZh ? ", tagline = ?" : ""} WHERE id = ? AND userId = ?`,
        [JSON.stringify(pos), ...(audienceText ? [audienceText.slice(0, 600)] : []), ...(tagZh ? [tagZh] : []), input.brandId, userId],
      );
      if (audienceText) applied.unshift("受眾錨點 ← 本情境所選受眾（之後所有推導與文案鎖定此客群）");
      return { ok: true as const, applied };
    }),
});
