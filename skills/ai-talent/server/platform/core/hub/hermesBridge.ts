/**
 * Sales Hub — "Ask AI" bridge to Hermes Agent.
 *
 * Integration pattern (Hermes docs, v0.21): OnBrand owns the LINE webhook and
 * identity; each rep maps to one Hermes profile under a multiplexing gateway.
 * We call that profile's OpenAI-compatible API server, and Hermes calls back
 * into OnBrand through the MCP endpoint with the profile's own rep token — so
 * identity travels as a credential, never as text the model could fake.
 *
 * Env (deliberately NOT HERMES_API_URL, which llm.ts uses as an LLM provider):
 *   HUB_HERMES_URL        e.g. http://127.0.0.1:8642
 *   HUB_HERMES_PROFILES   JSON {"<repId>": {"profile": "amy", "key": "..."}}
 *
 * If Hermes is unreachable or the rep has no profile, the same question goes
 * to OnBrand's own LLM with the catalog + facts + policy in context, and the
 * answer is labelled as such in the event log.
 */

import { packFor } from "../../../content/core/hub/policyPacks";
import { formatPrice, getOrg, listFacts, listSolutions, logEvent, type HubRep } from "./hubStore";

interface HermesProfile { profile: string; key: string }

function profileFor(repId: number): HermesProfile | null {
  try {
    const map = JSON.parse(process.env.HUB_HERMES_PROFILES || "{}");
    const p = map[String(repId)];
    return p?.profile && p?.key ? p : null;
  } catch {
    return null;
  }
}

export function hermesStatus() {
  const url = process.env.HUB_HERMES_URL;
  let profiles = 0;
  try { profiles = Object.keys(JSON.parse(process.env.HUB_HERMES_PROFILES || "{}")).length; } catch { /* ignore */ }
  return { configured: Boolean(url), profiles };
}

async function askHermes(rep: HubRep, text: string): Promise<string | null> {
  const base = process.env.HUB_HERMES_URL?.replace(/\/$/, "");
  const profile = profileFor(rep.id);
  if (!base || !profile) return null;
  try {
    const res = await fetch(`${base}/p/${encodeURIComponent(profile.profile)}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${profile.key}`,
        "Content-Type": "application/json",
        "X-Hermes-Session-Id": `line-${rep.id}`,
      },
      body: JSON.stringify({ model: "hermes-agent", messages: [{ role: "user", content: text }] }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      console.warn(`[hub.hermes] ${res.status} for profile ${profile.profile}`);
      return null;
    }
    const j: any = await res.json();
    const answer = j?.choices?.[0]?.message?.content;
    return typeof answer === "string" && answer.trim() ? answer.trim() : null;
  } catch (err: any) {
    console.warn("[hub.hermes] unreachable:", err?.message ?? err);
    return null;
  }
}

async function askFallback(rep: HubRep, text: string): Promise<string> {
  const org = await getOrg();
  const [solutions, facts] = await Promise.all([listSolutions(org.id), listFacts(org.id)]);
  const pack = packFor(rep.market);
  const zh = pack.language === "zh-TW";
  const catalog = solutions
    .map((s) => `- ${zh ? s.nameZh : s.nameEn} (${s.vendor}): ${zh ? s.summaryZh : s.summaryEn} | ${s.prices.map((p) => formatPrice(p, pack.language)).join("; ")}`)
    .join("\n");
  const factLines = facts
    .filter((f) => f.confidence !== "needs_verification")
    .map((f) => `- ${zh ? f.statementZh : f.statementEn} (${f.sourceName})`)
    .join("\n");
  const system = [
    zh
      ? `你是 ${rep.name}（華碩 ExpertHub 業務）的 AI 行銷助理。回答要具體、簡短（250 字內），適合在 LINE 上閱讀，不用 Markdown 標題。`
      : `You are the AI marketing assistant for ${rep.name}, an ASUS ExpertHub sales rep. Be concrete and brief (under 120 words), readable in LINE, no markdown headers.`,
    zh ? "只能使用下列方案、價格與數據；不確定就說不確定。" : "Use only the solutions, prices and facts below; say so when unsure.",
    pack.promptRules,
    zh ? "## 方案目錄" : "## Catalog",
    catalog,
    zh ? "## 核准市場數據" : "## Approved facts",
    factLines,
  ].join("\n");
  const { invokeLLM } = await import("../llm");
  const res = await invokeLLM({
    messages: [{ role: "system", content: system }, { role: "user", content: text }],
    provider: "anthropic",
    model: process.env.HUB_ASSISTANT_MODEL || "claude-haiku-4-5-20251001",
    maxTokens: 600,
    signal: AbortSignal.timeout(40_000),
  });
  const content = res.choices?.[0]?.message?.content;
  return (typeof content === "string" ? content : "").trim() || (zh ? "我暫時想不到好答案，換個問法試試？" : "I don't have a good answer — try rephrasing?");
}

/** LINE renders plain text only — drop Markdown emphasis, headings and rules. */
export function plainForLine(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function askAssistant(rep: HubRep, text: string): Promise<{ text: string; via: "hermes" | "onbrand" }> {
  const answer = await askAssistantRaw(rep, text);
  return { ...answer, text: plainForLine(answer.text) };
}

async function askAssistantRaw(rep: HubRep, text: string): Promise<{ text: string; via: "hermes" | "onbrand" }> {
  const viaHermes = await askHermes(rep, text);
  const org = await getOrg();
  if (viaHermes) {
    await logEvent(org.id, rep.id, "ask_ai_answer", "via Hermes Agent");
    return { text: viaHermes, via: "hermes" };
  }
  const answer = await askFallback(rep, text);
  await logEvent(org.id, rep.id, "ask_ai_answer", hermesStatus().configured ? "Hermes unavailable → OnBrand LLM" : "via OnBrand LLM");
  return { text: answer, via: "onbrand" };
}
