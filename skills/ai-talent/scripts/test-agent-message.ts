/**
 * test-agent-message.ts — sanity test for AgentMessage envelope.
 * Run via: npx tsx scripts/test-agent-message.ts
 */
import {
  createAgentMessage, parseAgentMessage, safeParseAgentMessage,
  legacyRowToAgentMessage,
} from "../server/_core/agentMessage";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail?: string) => {
  if (ok) { pass++; console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`); }
  else    { fail++; console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

// Test 1: createAgentMessage produces a valid envelope with sane defaults
try {
  const m1 = createAgentMessage({
    from: "topic-researcher",
    to: "calendar-architect",
    intent: "提供 FB 月行事曆主題候選清單",
    outputKind: "structured_table",
    status: "drafted",
    conclusion: { themes: ["金融知識普及", "投資心理學", "市場時事評論"] },
    thinking: "從受眾痛點 + 競品內容軸線交叉分析…",
    upstream: ["step-0-intake"],
    adapter: { modelId: "claude-opus-4-6", adapterUsed: "claude", attempts: 1 },
  });
  const parsed = parseAgentMessage(m1);
  t("create + strict parse roundtrip", parsed.v === 1 && parsed.outputKind === "structured_table");
  t("default fields populated", Array.isArray(parsed.sources) && Array.isArray(parsed.errors));
  t("conclusion preserved", (parsed.conclusion as any).themes?.length === 3);
} catch (e: any) {
  t("create roundtrip", false, e.message);
}

// Test 2: safeParseAgentMessage rejects garbage
const r2 = safeParseAgentMessage({ from: "x" });
t("safeParse rejects missing required fields", !r2.ok);
if (!r2.ok) t("error includes 'to' field name", r2.errors.some((e) => e.includes("to")));

// Test 3: legacyRowToAgentMessage covers all status mappings
const legacyStatuses = ["pending", "asking", "drafted", "confirmed", "skipped", "failed"];
for (const s of legacyStatuses) {
  const m = legacyRowToAgentMessage({
    step_order: 1, status: s, agent_name: "x", agent_output: "test",
  });
  t(`legacy status '${s}' maps to canonical`, !!m.status, `→ ${m.status}`);
}

// Test 4: legacy row preserves agent name + output
const m4 = legacyRowToAgentMessage({
  step_order: 3, status: "drafted",
  agent_id: 42, agent_name: "audience-strategist",
  agent_output: "主受眾：30-45 歲都會專業者…",
  user_input: null, updated_at: new Date(),
});
t("legacy.from = agent_name", m4.from === "audience-strategist");
t("legacy.conclusion.text preserved", String((m4.conclusion as any).text).includes("30-45 歲"));
t("legacy.upstream lineage from step_order", m4.upstream[0] === "step-2");

console.log("");
console.log(`=== ${pass} pass / ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
