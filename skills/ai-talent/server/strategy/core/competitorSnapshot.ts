/**
 * competitorSnapshot — 選一個具名競爭者，比對「這個接觸點對方有沒有活躍、
 * 用哪些內容形式」跟「策略訴求跟我們有什麼不同」。
 *
 * 2026-09-14（CJ「例如facebook當中，競爭者有沒有做直播，有沒有做自然貼文，
 * 策略層是我們的策略訴求跟競爭者有何差異」）：沿用 strategyMonitor 同一條
 * scout→LLM digest 管線（perplexityScout 抓情報，LLM 只能從情報裡歸納，
 * 查不到就答「不明」，不能用常識腦補）——差別是這裡套用在使用者「選定的
 *單一競爭者」上，輸出的是逐接觸點比對，不是策略提醒 feed。
 *
 * 誠實邊界：這是「web 情報 + LLM 歸納」的研究快照（researchedAt 有時間戳），
 * 不是即時追蹤——查不到證據的通路一律回 active:"unknown"，不猜。
 *
 * 快取：同一個 (brandId, competitorName) 14 天內重複選，不重跑研究，直接
 * 回快取——這是實際壓成本的作法。CJ 說先不設「幾次內不能換競爭者」的門檻，
 * 先觀察真實用量再決定要不要加限制。
 */
import localPool from "../../localDb";
import { invokeLLM } from "../../platform/core/llm";
import { perplexityScout } from "../../platform/core/scouts/perplexityScout";
import type { IntelItem, ScoutContext } from "../../platform/core/scouts/types";
import { TOUCHPOINTS } from "../../platform/core/touchpoints";

export const COMPETITOR_SNAPSHOT_DDL = `
  CREATE TABLE IF NOT EXISTS competitor_snapshots (
    id             INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    brandId        INT          NOT NULL,
    competitorName VARCHAR(120) NOT NULL,
    channels       JSON         NULL,
    strategyDiff   JSON         NULL,
    scoutItemCount INT          NOT NULL DEFAULT 0,
    note           VARCHAR(255) NULL,
    researchedAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uniq_competitor_snapshot (brandId, competitorName),
    KEY idx_competitor_snapshot_brand (brandId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/** 快取幾天內視為新鮮，不重跑研究。 */
export const SNAPSHOT_FRESH_DAYS = 14;

export type ChannelActive = "yes" | "no" | "unknown";

export interface Evidence { title: string; url?: string; source: string }

export interface ChannelFinding {
  channel: string;
  active: ChannelActive;
  formats: string[];
  evidence: Evidence[];
}

export interface StrategyDiffFinding {
  theirAngle: string;
  ourAngle: string;
  difference: string;
  confidence: "known" | "unknown";
  evidence: Evidence[];
}

export interface CompetitorSnapshot {
  brandId: number;
  competitorName: string;
  channels: ChannelFinding[];
  strategyDiff: StrategyDiffFinding;
  note: string;
  researchedAt: string;
  stale: boolean;
}

const CONTENT_CHANNELS = TOUCHPOINTS.filter((t) => t.deployMethod !== "embed-widget").map((t) => t.id);

const UNKNOWN_DIFF: StrategyDiffFinding = {
  theirAngle: "", ourAngle: "", difference: "", confidence: "unknown", evidence: [],
};

function unknownChannels(): ChannelFinding[] {
  return CONTENT_CHANNELS.map((channel) => ({ channel, active: "unknown" as const, formats: [], evidence: [] }));
}

async function loadOurAnchors(brandId: number): Promise<{ name: string; industry: string; audience: string; differentiation: string; tagline: string }> {
  const [rows]: any = await localPool.execute(
    `SELECT name, industry, positioning FROM brands WHERE id = ? LIMIT 1`, [brandId],
  );
  const b = (rows as any[])[0] ?? {};
  const pos = typeof b.positioning === "string" ? (() => { try { return JSON.parse(b.positioning); } catch { return {}; } })() : (b.positioning ?? {});
  const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  return {
    name: String(b.name ?? ""),
    industry: String(b.industry ?? ""),
    audience: s(pos?.audience?.primary, 300),
    differentiation: s(typeof pos?.differentiation === "string" ? pos.differentiation : pos?.differentiation?.summary, 300),
    tagline: s(pos?.tagline?.zhTagline ?? pos?.tagline, 80),
  };
}

function digestPrompt(
  anchors: Awaited<ReturnType<typeof loadOurAnchors>>,
  competitorName: string,
  items: IntelItem[],
): string {
  const list = items.map((it, i) =>
    `[${i}] ${it.title}\n    來源：${it.source}${it.publishedAt ? `　日期：${it.publishedAt}` : ""}${it.url ? `　${it.url}` : ""}\n    ${String(it.content ?? "").slice(0, 400)}`,
  ).join("\n");
  return [
    `你是品牌的競品研究顧問。下面是我們品牌的策略錨點，以及關於競爭者「${competitorName}」掃到的公開網路情報。`,
    `你的工作有兩件：`,
    `1. 逐一判斷這些通路，競爭者是否活躍、用哪些內容形式：${CONTENT_CHANNELS.join("、")}。`,
    `2. 比較競爭者的策略訴求跟我們的差異。`,
    ``,
    `【我們品牌】${anchors.name}${anchors.industry ? `（${anchors.industry}）` : ""}`,
    `【我們的受眾錨點】${anchors.audience || "（未填）"}`,
    `【我們的差異化錨點】${anchors.differentiation || "（未填）"}`,
    `【我們的標語錨點】${anchors.tagline || "（未填）"}`,
    `【競爭者】${competitorName}`,
    ``,
    `【情報】`,
    list || "（沒有掃到任何情報）",
    ``,
    `規則（很重要）：`,
    `1. 每個通路的 active 和每個 evidence 都必須指回至少一則情報的編號 —— 情報裡完全沒提到的通路，active 一律填 "unknown"，formats 留空陣列，不能憑常識腦補「這種產業通常都有」。`,
    `2. formats 只能從這些詞裡選：organic_post（自然貼文）、live（直播）、stories（限時動態/短影音）、ads（廣告）。`,
    `3. strategyDiff.confidence 沒有情報佐證就填 "unknown"，theirAngle/ourAngle/difference 留空字串。`,
    `4. 全部繁體中文（台灣用語）。只輸出 JSON，不要前言。`,
    ``,
    `輸出格式：{"channels":[{"channel":"facebook","active":"yes","formats":["organic_post","live"],"evidence":[0]}],"strategyDiff":{"theirAngle":"…","ourAngle":"…","difference":"…","confidence":"known","evidence":[1]}}`,
    `channels 陣列必須包含這些通路、順序不拘：${CONTENT_CHANNELS.join("、")}。`,
  ].join("\n");
}

export function parseSnapshotJson(raw: string, items: IntelItem[]): { channels: ChannelFinding[]; strategyDiff: StrategyDiffFinding } {
  const cleaned = String(raw ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let obj: any = null;
  try { obj = JSON.parse(cleaned); } catch {
    const s = cleaned.indexOf("{");
    if (s >= 0) { try { obj = JSON.parse(cleaned.slice(s)); } catch { obj = null; } }
  }
  const evidenceOf = (arr: unknown): Evidence[] =>
    (Array.isArray(arr) ? arr : [])
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < items.length)
      .map((n) => ({ title: items[n]!.title, url: items[n]!.url, source: items[n]!.source }));

  const byChannel = new Map<string, ChannelFinding>();
  for (const c of CONTENT_CHANNELS) byChannel.set(c, { channel: c, active: "unknown", formats: [], evidence: [] });
  const rawChannels = Array.isArray(obj?.channels) ? obj.channels : [];
  for (const c of rawChannels) {
    const channel = String(c?.channel ?? "");
    if (!byChannel.has(channel)) continue;
    const active: ChannelActive = c?.active === "yes" || c?.active === "no" ? c.active : "unknown";
    const formats = (Array.isArray(c?.formats) ? c.formats : [])
      .map((f: unknown) => String(f))
      .filter((f: string) => ["organic_post", "live", "stories", "ads"].includes(f));
    byChannel.set(channel, { channel, active, formats: active === "yes" ? formats : [], evidence: evidenceOf(c?.evidence) });
  }

  const rawDiff = obj?.strategyDiff;
  const confidence: "known" | "unknown" = rawDiff?.confidence === "known" ? "known" : "unknown";
  const strategyDiff: StrategyDiffFinding = confidence === "known"
    ? {
        theirAngle: String(rawDiff?.theirAngle ?? "").trim().slice(0, 300),
        ourAngle: String(rawDiff?.ourAngle ?? "").trim().slice(0, 300),
        difference: String(rawDiff?.difference ?? "").trim().slice(0, 300),
        confidence,
        evidence: evidenceOf(rawDiff?.evidence),
      }
    : UNKNOWN_DIFF;

  return { channels: CONTENT_CHANNELS.map((c) => byChannel.get(c)!), strategyDiff };
}

async function researchCompetitor(brandId: number, competitorName: string): Promise<Omit<CompetitorSnapshot, "stale">> {
  const researchedAt = new Date().toISOString();
  if (!(await perplexityScout.isAvailable?.({} as ScoutContext))) {
    return { brandId, competitorName, channels: unknownChannels(), strategyDiff: UNKNOWN_DIFF, note: "no_scout：尚未設定 Web 市調的 API key", researchedAt };
  }
  const anchors = await loadOurAnchors(brandId);
  const ctx: ScoutContext = {
    brandId, brandName: anchors.name, industry: anchors.industry || undefined,
    keywords: [competitorName], competitors: [competitorName],
    industryTags: anchors.industry ? [anchors.industry] : [],
    days: 60, limit: 10, loadCred: async () => null,
  };
  let scoutItems: IntelItem[] = [];
  try { scoutItems = await perplexityScout.fetch(ctx); }
  catch (e) {
    return { brandId, competitorName, channels: unknownChannels(), strategyDiff: UNKNOWN_DIFF, note: `scout_error：${String((e as Error)?.message ?? e).slice(0, 200)}`, researchedAt };
  }
  if (!scoutItems.length) {
    return { brandId, competitorName, channels: unknownChannels(), strategyDiff: UNKNOWN_DIFF, note: "no_items：沒掃到關於這個競爭者的公開情報", researchedAt };
  }
  let raw = "";
  try {
    const r = await invokeLLM({ messages: [{ role: "user", content: digestPrompt(anchors, competitorName, scoutItems) }], maxTokens: 1400 });
    raw = String((r as any)?.choices?.[0]?.message?.content ?? "");
  } catch (e) {
    return { brandId, competitorName, channels: unknownChannels(), strategyDiff: UNKNOWN_DIFF, note: `llm_error：${String((e as Error)?.message ?? e).slice(0, 200)}`, researchedAt };
  }
  const { channels, strategyDiff } = parseSnapshotJson(raw, scoutItems);
  return { brandId, competitorName, channels, strategyDiff, note: `ok：${scoutItems.length} 則情報`, researchedAt };
}

function rowToSnapshot(row: any): CompetitorSnapshot {
  const researchedAt = new Date(row.researchedAt).toISOString();
  const stale = Date.now() - new Date(row.researchedAt).getTime() > SNAPSHOT_FRESH_DAYS * 86_400_000;
  return {
    brandId: Number(row.brandId),
    competitorName: String(row.competitorName),
    channels: typeof row.channels === "string" ? JSON.parse(row.channels) : (row.channels ?? unknownChannels()),
    strategyDiff: typeof row.strategyDiff === "string" ? JSON.parse(row.strategyDiff) : (row.strategyDiff ?? UNKNOWN_DIFF),
    note: String(row.note ?? ""),
    researchedAt,
    stale,
  };
}

/**
 * 拿一份競爭者比對快照：14 天內有快取就直接回快取；否則重新研究並寫回快取。
 * `forceRefresh` 保留給之後如果要加「手動重新整理」按鈕用。
 */
export async function getOrResearchCompetitorSnapshot(
  brandId: number, competitorName: string, opts?: { forceRefresh?: boolean },
): Promise<CompetitorSnapshot> {
  if (!opts?.forceRefresh) {
    const [rows]: any = await localPool.execute(
      `SELECT * FROM competitor_snapshots WHERE brandId = ? AND competitorName = ? LIMIT 1`,
      [brandId, competitorName],
    );
    const row = (rows as any[])[0];
    if (row) {
      const snap = rowToSnapshot(row);
      if (!snap.stale) return snap;
    }
  }
  const fresh = await researchCompetitor(brandId, competitorName);
  await localPool.execute(
    `INSERT INTO competitor_snapshots (brandId, competitorName, channels, strategyDiff, scoutItemCount, note, researchedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE channels = VALUES(channels), strategyDiff = VALUES(strategyDiff),
       scoutItemCount = VALUES(scoutItemCount), note = VALUES(note), researchedAt = VALUES(researchedAt)`,
    [brandId, competitorName, JSON.stringify(fresh.channels), JSON.stringify(fresh.strategyDiff), fresh.channels.filter((c) => c.active !== "unknown").length, fresh.note, new Date(fresh.researchedAt)],
  );
  return { ...fresh, stale: false };
}
