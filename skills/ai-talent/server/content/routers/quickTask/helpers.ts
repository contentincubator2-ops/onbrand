/**
 * quickTask router 的輔助：受眾標籤、LLM 備援呼叫、前情脈絡、方案閘門快取。
 */
import localPool from "../../../localDb";
import { type ModelProvider, callModel } from "../../../platform/core/llm/multiModelRouter";
import { type TaskGateInfo } from "../../../platform/core/billing/planGate";
import { buildTaskCatalogIndex } from "../../core/catalog/taskCatalogIndex";

/**
 * 2026-08-11: turn a workbench spot reference into the audience label stored
 * alongside the produced content.
 *
 * The client sends only { scenarioId, spotIndex }; the labels are read here
 * from the brand's own positioning._workbench so they always match the
 * scenario that actually produced them, and so a long audience anchor never
 * has to travel through a URL.
 *
 * Best-effort by design: attribution is a nice-to-have on top of the content,
 * never a reason to fail someone's task. Any miss (no ref, brand gone,
 * scenario deleted, index out of range) simply yields an untagged run.
 */
export async function resolveAudienceTag(
  userId: number,
  brandId: number | undefined,
  spotRef: { scenarioId: string; spotIndex: number } | null | undefined,
): Promise<{ audience: string; spotTitle: string | null; scenarioId: string; spotIndex: number } | null> {
  if (!spotRef || !brandId) return null;
  try {
    const { default: localPool } = await import("../../../localDb");
    const [rows]: any = await localPool.execute(
      `SELECT positioning FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
      [brandId, userId],
    );
    let pos: any = (rows as any[])[0]?.positioning;
    if (!pos) return null;
    if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { return null; } }

    const scenarios: any[] = Array.isArray(pos?._workbench?.scenarios) ? pos._workbench.scenarios : [];
    const scn = scenarios.find((s) => s?.id === spotRef.scenarioId);
    if (!scn) return null;

    const audience = String(scn?.selection?.audience ?? "").trim();
    if (!audience) return null;
    const spot = scn?.derived?.spots?.[spotRef.spotIndex];

    return {
      audience: audience.slice(0, 600),
      spotTitle: spot?.title ? String(spot.title).slice(0, 120) : null,
      scenarioId: spotRef.scenarioId,
      spotIndex: spotRef.spotIndex,
    };
  } catch (e) {
    console.warn("[resolveAudienceTag] non-fatal:", (e as Error)?.message);
    return null;
  }
}

export function tryParseJson(s: string): any | null {
  if (!s) return null;
  let t = s.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const start = t.search(/[{\[]/);
  if (start > 0) t = t.slice(start);
  const lastBrace = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (lastBrace >= 0) t = t.slice(0, lastBrace + 1);
  try { return JSON.parse(t); } catch { return null; }
}

export async function callWithFallback(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  preferred: ModelProvider
): Promise<{ content: string; provider: ModelProvider; model: string; fellBack: boolean }> {
  try {
    const r = await callModel(messages, undefined, preferred);
    return { ...r, fellBack: false };
  } catch (e) {
    if (preferred === "forge") throw e;
    try {
      const r = await callModel(messages, undefined, "forge");
      return { ...r, fellBack: true };
    } catch {
      throw e;
    }
  }
}

export function buildPriorContext(
  prior: Array<{ stageLabel: string; agentName: string; agentRole: string; output: string }>
): string {
  if (!prior.length) return "";
  const grouped: Record<string, Array<{ agentName: string; agentRole: string; output: string }>> = {};
  for (const p of prior) {
    (grouped[p.stageLabel] ??= []).push({ agentName: p.agentName, agentRole: p.agentRole, output: p.output });
  }
  const sections: string[] = [];
  for (const [stage, items] of Object.entries(grouped)) {
    sections.push(`【上一階段：${stage}】`);
    for (const it of items) {
      sections.push(`◆ ${it.agentName}（${it.agentRole}）的交付：\n${it.output}`);
    }
  }
  return `\n\n[同事的接力交付]\n${sections.join("\n\n")}\n`;
}

/**
 * 執行前閘門用的「這張卡是什麼」：通路 + 來源類型。
 *
 * 從目錄索引查而不是從 template 推 —— 平台的推導規則以 taskCatalogIndex
 * 為準（listFB 也是用它），兩邊才不會一邊擋、一邊放。
 * 查不到的（用戶自建、品牌任務包客製）回 null，閘門自然不觸發：那些卡
 * 本來就是品牌專屬的。
 */
export let gateInfoCache: Map<string, TaskGateInfo> | null = null;

export function gateInfoFor(taskId: string): TaskGateInfo {
  if (!gateInfoCache) {
    gateInfoCache = new Map();
    for (const t of buildTaskCatalogIndex()) {
      gateInfoCache.set(t.id, { platform: t.platform, sourceType: t.source?.type ?? null });
    }
  }
  return gateInfoCache.get(taskId) ?? { platform: null, sourceType: null };
}
