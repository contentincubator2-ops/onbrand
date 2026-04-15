/**
 * ChatCore.tsx — v7 Chat核心元件
 * 負責：messages 列表 + input 區域
 * 樣式遵循 marketing-os-mockup-v7.html
 * Layout: flex column, height 100%
 *   上半：messages scroll area
 *   下半：input wrap（固定底部）
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { trpc } from "../lib/trpc";
import TaskProgressTracker, { type TaskStep } from "./chat/TaskProgressTracker";
import TypedThreadCard from "./chat/TypedThreadCard";
import SquadRecommendCards from "./chat/SquadRecommendCards";
import { MissionHomePage } from "./chat/MissionHomePage";

// ─── A2A Patterns ────────────────────────────────────────────────────────────

const A2A_PATTERNS: { regex: RegExp; workflowId: string }[] = [
  { regex: /品牌上市|brand.launch|全套.*行銷|行銷.*全套|完整.*上市|上市.*計劃|上市.*策略/i, workflowId: "brand-launch-v1" },
  { regex: /市場調研|市場研究|market.research|競品.*分析.*消費者|消費者.*洞察.*報告/i, workflowId: "market-research-v1" },
  { regex: /品牌定位|定位報告|positioning.*report|brand.*positioning/i, workflowId: "brand-positioning-v1" },
  { regex: /社群.*月曆|內容.*規劃|content.*calendar|月.*內容排程/i, workflowId: "content-calendar-v1" },
  { regex: /廣告.*文案.*組合|全套.*廣告|ad.*copy.*set|fb.*ig.*廣告/i, workflowId: "ad-copy-v1" },
  { regex: /競品.*分析|competitor.*analysis|競爭.*報告/i, workflowId: "competitor-analysis-v1" },
  { regex: /seo.*分析|關鍵字.*研究|seo.*growth/i, workflowId: "seo-growth-v1" },
];

export function detectA2AWorkflow(text: string): string | null {
  for (const p of A2A_PATTERNS) {
    if (p.regex.test(text)) return p.workflowId;
  }
  return null;
}

export function isTaskLike(text: string): boolean {
  return /幫我|請|做一份|產出|撰寫|分析|規劃|設計|研究|執行|建立|生成|整理|報告|文案|策略|campaign|seo|廣告/i.test(text);
}

function detectTaskType(text: string): string {
  if (/文案|copywriting|廣告.*文字|copy/i.test(text)) return "copywriting";
  if (/社群|social|instagram|facebook|linkedin|twitter/i.test(text)) return "social_media";
  if (/seo|搜尋|關鍵字|keyword/i.test(text)) return "seo";
  if (/email|郵件|電子報|newsletter/i.test(text)) return "email";
  if (/分析|analysis|報告|report|調研/i.test(text)) return "analysis";
  if (/策略|strategy|規劃|plan/i.test(text)) return "strategy";
  return "general";
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  contentType?: string;
  imageSuggestion?: string;
  taskId?: number;
  ts: number;
  model?: string;
  agentName?: string;
  agentTitle?: string;
  agentModel?: string | null;
  isStreaming?: boolean;
  pendingApproval?: boolean;
  approved?: boolean;
  sopProposed?: boolean;
  sopBuilt?: boolean;
  exportFormat?: "ppt" | "word" | "copy" | "none";
  squadRecommend?: { squads: any[]; missionId: number; brandId: number };
}

interface AssembledAgent {
  id: number;
  name: string;
  title: string;
  layer: string;
  specialty?: string | null;
}

interface ExecutionStep {
  step: number;
  agentName: string;
  agentTitle: string;
  layer: string;
  action: string;
}

interface TeamAssemblyState {
  phase: "analyzing" | "assembling" | "proposal" | "executing" | "done";
  agents: AssembledAgent[];
  plan: ExecutionStep[];
  taskType?: string;
  taskText?: string;
}

interface RelayStepState {
  id: number;
  label: string;
  agentName: string;
  agentTitle: string;
  layer: string;
  status: "pending" | "running" | "done";
  eta: string;
  summary?: string;
  expanded?: boolean;
}

interface SquadStepState {
  currentStep: number;
  totalSteps: number;
  agentName?: string;
  agentTitle?: string;
  agentRole?: string;
  isComplete: boolean;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ChatCoreProps {
  initialBrandId?: number | null;
  activeMissionId?: number | null;
  preselectedAgent?: { id: number; name: string; title?: string; type: "agent" | "squad" } | null;
  onClearAgent?: () => void;
  onMissionCreated?: (id: number) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatModelName(raw: string): string {
  if (!raw) return "";
  const r = raw.toLowerCase();
  if (r.includes("claude") && r.includes("sonnet") && (r.includes("4") || r.includes("3-7") || r.includes("3.7"))) return "Claude Sonnet 4";
  if (r.includes("claude") && r.includes("opus")) return "Claude Opus 4";
  if (r.includes("claude") && r.includes("haiku")) return "Claude Haiku 3.5";
  if (r.includes("claude")) return "Claude";
  if (r.includes("gpt-4o")) return "GPT-4o";
  if (r.includes("gpt-4")) return "GPT-4";
  if (r.includes("gemini-2.0-flash")) return "Gemini 2.0 Flash";
  if (r.includes("gemini-1.5-pro")) return "Gemini 1.5 Pro";
  if (r.includes("gemini")) return "Gemini";
  if (r.includes("deepseek")) return "DeepSeek R1";
  if (r.includes("llama")) return "Llama 3";
  return raw;
}

function renderContent(raw: string): { main: string; thinking: string } {
  try {
    const d = JSON.parse(raw);
    if (d.publishable_content) return { main: d.publishable_content, thinking: d.thinking || "" };
    if (d.thinking && !d.content && !d.output) return { main: "", thinking: d.thinking };
    if (d.content || d.output) return { main: d.content || d.output, thinking: d.thinking || "" };
  } catch {}
  return { main: raw, thinking: "" };
}

function formatText(text: string): string {
  if (!text) return "";
  let html = text
    .replace(/^### (.+)$/gm, '<h3 style="font-size:0.95em;font-weight:700;margin:1em 0 0.3em;color:inherit">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:1.05em;font-weight:700;margin:1.2em 0 0.4em;color:inherit">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:1.15em;font-weight:700;margin:1.2em 0 0.4em;color:inherit">$1</h1>')
    .replace(/((?:\|.+\|\n?)+)/g, (block) => {
      const rows = block.trim().split("\n").filter((r) => r.trim());
      const isHeader = rows[1]?.replace(/[\s|:-]/g, "") === "";
      let table = '<table style="border-collapse:collapse;width:100%;margin:0.5em 0;font-size:0.85em">';
      rows.forEach((row, i) => {
        if (isHeader && i === 1) return;
        const cells = row.split("|").filter((_, ci) => ci > 0 && ci < row.split("|").length - 1);
        const tag = isHeader && i === 0 ? "th" : "td";
        const style =
          tag === "th"
            ? "background:#f5f5f5;font-weight:600;padding:4px 8px;border:1px solid #ddd;text-align:left"
            : "padding:4px 8px;border:1px solid #ddd;vertical-align:top";
        table += "<tr>" + cells.map((c) => `<${tag} style="${style}">${c.trim()}</${tag}>`).join("") + "</tr>";
      });
      table += "</table>";
      return table;
    })
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #e5e5e5;margin:0.8em 0">')
    .replace(/^[\-\*] (.+)$/gm, '<li style="margin:0.2em 0 0.2em 1.2em;list-style:disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin:0.2em 0 0.2em 1.5em;list-style:decimal">$1</li>')
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:0.85em;font-family:monospace">$1</code>')
    .replace(/\n\n/g, '</p><p style="margin:0.5em 0">')
    .replace(/\n/g, "<br/>");
  return `<p style="margin:0">${html}</p>`;
}

// ─── TeamAssemblyPanel ────────────────────────────────────────────────────────

function AgentAvatar({ name, layer }: { name: string; layer: string }) {
  const colors: Record<string, string> = {
    strategy: "#374151",
    execution: "#4B5563",
    training: "#6B7280",
  };
  const bg = colors[layer] ?? "#6B7280";
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%",
      background: bg, color: "white",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 13, fontWeight: 700, flexShrink: 0,
    }}>
      {name.charAt(0)}
    </div>
  );
}

function LayerBadge({ layer }: { layer: string }) {
  const label: Record<string, string> = { strategy: "策略層", execution: "執行層", training: "訓練層" };
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 20,
      background: "#F2F1EF", color: "#6B6A66", border: "1px solid #E4E3E1",
    }}>
      {label[layer] ?? layer}
    </span>
  );
}

function TeamAssemblyPanel({
  state,
  relaySteps,
  onApprove,
  onToggleSummary,
}: {
  state: TeamAssemblyState;
  relaySteps: RelayStepState[];
  onApprove: () => void;
  onToggleSummary: (id: number) => void;
}) {
  const activeStep = relaySteps.find((s) => s.status === "running");
  const completedCount = relaySteps.filter((s) => s.status === "done").length;
  const progress = relaySteps.length ? Math.round((completedCount / relaySteps.length) * 100) : 0;

  const phaseLabel = {
    analyzing: "分析任務中...",
    assembling: "組建自主代理團隊中...",
    proposal: "Team Proposal 已準備完成",
    executing: "自主代理接力執行中",
    done: "任務已由 AI 團隊完成",
  }[state.phase];

  const phaseIcon = {
    analyzing: "...", assembling: "...", proposal: "ready", executing: "running", done: "done",
  }[state.phase];

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 4px" }}>
      <div style={{
        background: "white", border: "1px solid #ECEAE8",
        borderRadius: 14, overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #1A1A18, #2D2D28)",
          padding: "14px 18px", display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "rgba(255,255,255,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
          }}>
            {phaseIcon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "white", fontWeight: 600, fontSize: 13 }}>{phaseLabel}</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 }}>Autonomous Agent Operations</div>
          </div>
          {(state.phase === "analyzing" || state.phase === "assembling") && (
            <div style={{ display: "flex", gap: 4 }}>
              {[0, 150, 300].map((d) => (
                <span key={d} style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "rgba(255,255,255,0.5)",
                  display: "inline-block",
                  animation: "bounce 1s infinite",
                  animationDelay: `${d}ms`,
                }} />
              ))}
            </div>
          )}
        </div>

        {/* Progress bar */}
        {relaySteps.length > 0 && (
          <div style={{ padding: "12px 18px", borderBottom: "1px solid #F5F5F4" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#9B9990", textTransform: "uppercase", letterSpacing: "0.07em" }}>執行進度</span>
              <span style={{ fontSize: 10, color: "#C8C7C3" }}>{completedCount}/{relaySteps.length} steps</span>
            </div>
            <div style={{ height: 6, background: "#F2F1EF", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", background: "#1A1A18", borderRadius: 3, transition: "width 0.5s", width: `${progress}%` }} />
            </div>
            {activeStep && (
              <div style={{ fontSize: 11, color: "#6B6A66", marginTop: 6 }}>
                目前由 <strong style={{ color: "#1A1A18" }}>{activeStep.agentName}</strong> 執行：{activeStep.label}
              </div>
            )}
          </div>
        )}

        {/* Agents */}
        {state.agents.length > 0 && (
          <div style={{ padding: "12px 18px", borderBottom: "1px solid #F5F5F4" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#9B9990", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>本次任務團隊</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {state.agents.map((agent) => (
                <div key={agent.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <AgentAvatar name={agent.name} layer={agent.layer} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1A1A18" }}>{agent.name}</span>
                      <LayerBadge layer={agent.layer} />
                    </div>
                    <div style={{ fontSize: 11, color: "#9B9990", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plan steps */}
        {state.plan.length > 0 && (
          <div style={{ padding: "12px 18px", borderBottom: "1px solid #F5F5F4" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#9B9990", textTransform: "uppercase", letterSpacing: "0.07em" }}>Task Breakdown</span>
              {state.phase === "proposal" && (
                <button
                  onClick={onApprove}
                  style={{
                    padding: "6px 16px", borderRadius: 8, border: "none",
                    background: "#1A1A18", color: "white", fontSize: 12,
                    fontWeight: 600, cursor: "pointer",
                  }}
                >
                  開始執行
                </button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {relaySteps.map((step, i) => (
                <div key={step.id} style={{ position: "relative", paddingLeft: 40 }}>
                  {i < relaySteps.length - 1 && (
                    <div style={{
                      position: "absolute", left: 15, top: 34, bottom: -14,
                      width: 1, background: "#ECEAE8",
                    }} />
                  )}
                  <div style={{
                    position: "absolute", left: 0, top: 0,
                    width: 30, height: 30, borderRadius: "50%",
                    background: step.status === "done" ? "#4B5563" : step.status === "running" ? "#1A1A18" : "#F2F1EF",
                    color: step.status === "pending" ? "#9B9990" : "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                    border: step.status === "running" ? "2px solid #9B9990" : "none",
                  }}>
                    {step.status === "done" ? "✓" : step.id}
                  </div>
                  <div style={{
                    background: "#FAFAF9", border: `1px solid ${step.status === "running" ? "#DEDDDA" : "#ECEAE8"}`,
                    borderRadius: 10, padding: "10px 14px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A18" }}>Step {step.id}. {step.label}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 20,
                        background: step.status === "done" ? "#EAFBEA" : step.status === "running" ? "#F2F1EF" : "#F2F1EF",
                        color: step.status === "done" ? "#3D9A3D" : step.status === "running" ? "#E8631A" : "#9B9990",
                        border: `1px solid ${step.status === "done" ? "#C8E6C8" : "#E4E3E1"}`,
                      }}>
                        {step.status === "done" ? "已完成" : step.status === "running" ? "執行中..." : "待執行"}
                      </span>
                      <span style={{ fontSize: 10, color: "#C8C7C3" }}>ETA {step.eta}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#9B9990", marginTop: 3 }}>{step.agentName} · {step.agentTitle}</div>
                    {step.summary && (
                      <div style={{ marginTop: 6 }}>
                        <button
                          onClick={() => onToggleSummary(step.id)}
                          style={{ fontSize: 11, color: "#6B6A66", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        >
                          {step.expanded ? "收合摘要" : "查看摘要"}
                        </button>
                        {step.expanded && (
                          <div style={{
                            marginTop: 6, background: "white", border: "1px solid #ECEAE8",
                            borderRadius: 8, padding: "8px 12px",
                            fontSize: 11, color: "#6B6A66", lineHeight: 1.6,
                          }}>
                            {step.summary}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {state.phase === "proposal" && (
          <div style={{ padding: "12px 18px", background: "#FAFAF9" }}>
            <p style={{ fontSize: 12, color: "#6B6A66" }}>批准後，AI 團隊會一棒接一棒自動完成任務。</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Send Icon ────────────────────────────────────────────────────────────────

const IconSend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

// ─── ChatCore ────────────────────────────────────────────────────────────────

export default function ChatCore({
  initialBrandId,
  activeMissionId,
  preselectedAgent,
  onClearAgent,
  onMissionCreated,
}: ChatCoreProps = {}) {

  // ── Conversations state ──────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Array<{
    id: string;
    title: string;
    messages: Msg[];
    brandId?: number;
    brandName?: string;
    createdAt: number;
  }>>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: string; content: string }>>([]);

  // ── A2A state ────────────────────────────────────────────────────────────
  const [a2aSteps, setA2aSteps] = useState<TaskStep[]>([]);
  const [a2aProgress, setA2aProgress] = useState(0);
  const [a2aTaskName, setA2aTaskName] = useState<string | undefined>(undefined);

  // ── Team assembly state ──────────────────────────────────────────────────
  const [teamAssembly, setTeamAssembly] = useState<TeamAssemblyState | null>(null);
  const [relaySteps, setRelaySteps] = useState<RelayStepState[]>([]);
  const [pendingTask, setPendingTask] = useState("");
  const [awaitingApproval, setAwaitingApproval] = useState(false);

  // ── Squad state ──────────────────────────────────────────────────────────
  const [squadStep, setSquadStep] = useState<SquadStepState>({ currentStep: 0, totalSteps: 10, isComplete: false });
  const [streamingAgentName, setStreamingAgentName] = useState<string | null>(null);
  const [streamingAgentTitle, setStreamingAgentTitle] = useState<string | null>(null);
  const [streamingModel, setStreamingModel] = useState<string | null>(null);
  const [streamingThinking, setStreamingThinking] = useState<string>("");
  const [isStopped, setIsStopped] = useState(false);
  // ── New feature state ───────────────────────────────────────────────────
  const [confirmedMsgIds, setConfirmedMsgIds] = useState<Set<string>>(new Set());
  const [activeWorkspaceKey, setActiveWorkspaceKey] = useState<string>("strategy");
  const [currentMissionId, setCurrentMissionId] = useState<number | null>(null);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const stopRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const autoStartedRef = useRef<Set<number>>(new Set());

  // ── tRPC hooks ───────────────────────────────────────────────────────────
  const [activeBrandId, setActiveBrandId] = useState<number | null>(null);
  const createAndExecute = trpc.task.createAndExecute.useMutation();
  const workflowStart = trpc.workflow.start.useMutation();
  const saveMessage = trpc.conversation.saveMessage.useMutation();
  const createMission = trpc.mission.create.useMutation();
  const confirmOutput = trpc.output.confirm.useMutation();
  const saveMissionMsg = trpc.message.save.useMutation();
  const savedMessagesQuery = trpc.message.list.useQuery(
    { missionId: activeMissionId! },
    { enabled: !!activeMissionId, refetchOnWindowFocus: false }
  );
  const brandsQuery = trpc.brand.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const missionDataQuery = trpc.mission.getById.useQuery(
    { id: activeMissionId! },
    { enabled: !!activeMissionId, refetchOnWindowFocus: false }
  );
  const matchQuery = trpc.agent.matchForTask.useQuery(
    { taskDescription: pendingTask },
    { enabled: pendingTask.length > 0, refetchOnWindowFocus: false }
  );
  const historyQuery = trpc.conversation.list.useQuery(
    activeMissionId
      ? ({ missionId: activeMissionId } as any)
      : { brandId: activeBrandId ?? undefined },
    { enabled: activeMissionId ? !!activeMissionId : !!activeBrandId, refetchOnWindowFocus: false }
  );

  // ── Derived state ─────────────────────────────────────────────────────────
  const brands = brandsQuery.data ?? [];
  const active = conversations.find((c) => c.id === activeId) ?? null;
  const activeBrand = brands.find((b: any) => b.id === activeBrandId) ?? brands[0] ?? null;

  // ── Stop handler ─────────────────────────────────────────────────────────
  const handleStop = () => {
    stopRef.current = true;
    setIsStopped(true);
    readerRef.current?.cancel();
    sseRef.current?.close();
    setLoading(false);
    setStreamingAgentName(null);
    setStreamingAgentTitle(null);
    setStreamingModel(null);
    setStreamingThinking("");
  };

  // ── Workflow poll ─────────────────────────────────────────────────────────
  const pollWorkflowResult = async (jobId: string): Promise<any> => {
    const token = localStorage.getItem("authToken");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(
          `/trpc/workflow.status?input=${encodeURIComponent(JSON.stringify({ jobId }))}`,
          { headers }
        );
        const data = await res.json();
        const status = data?.result?.data?.json ?? data?.result?.data;
        if (!status) continue;
        if (status.status === "completed" && status.result) { setA2aProgress(100); return status.result; }
        if (status.status === "failed") throw new Error(status.error || "Workflow task failed");
        const pct = typeof status.progress === "number" ? status.progress : Math.min((i + 1) * 5, 90);
        setA2aProgress(pct);
      } catch (pollErr: any) {
        if (pollErr?.message?.includes("failed")) throw pollErr;
      }
    }
    throw new Error("Workflow timeout after 60 seconds");
  };

  // ── Effects ───────────────────────────────────────────────────────────────

  // Sync activeBrandId from mission data (most reliable source)
  useEffect(() => {
    const mBrandId = (missionDataQuery.data as any)?.brandId;
    if (mBrandId && mBrandId !== activeBrandId) {
      setActiveBrandId(mBrandId);
    }
  }, [missionDataQuery.data, activeBrandId]);

  useEffect(() => {
    if (brandsQuery.isSuccess && brands.length > 0 && !activeBrandId) {
      const preferred = initialBrandId ? brands.find((b: any) => b.id === initialBrandId) : null;
      const def = preferred ?? brands.find((b: any) => b.isDefault) ?? brands[0];
      setActiveBrandId(def.id);
    }
  }, [brandsQuery.isSuccess, brands.length, activeBrandId, brands, initialBrandId]);

  useEffect(() => {
    if (preselectedAgent) setTimeout(() => chatInputRef.current?.focus(), 150);
  }, [preselectedAgent]);

  // Mission init — set up conversation container when switching missions
  useEffect(() => {
    if (!activeMissionId || !missionDataQuery.data) return;
    const missionData = missionDataQuery.data as any;
    const missionConvId = `conv-mission-${activeMissionId}`;
    setActiveId(missionConvId);
    setConversationHistory([]);
    setTeamAssembly(null);
    setRelaySteps([]);
    setPendingTask("");
    setAwaitingApproval(false);
    setSquadStep({ currentStep: 0, totalSteps: 10, isComplete: false });
    setStreamingAgentName(null);
    setStreamingAgentTitle(null);
    setConversations((prev) => {
      const existing = prev.find((c) => c.id === missionConvId);
      if (existing) return prev;
      return [{ id: missionConvId, title: missionData.title, messages: [], createdAt: Date.now() }, ...prev];
    });
  }, [activeMissionId, missionDataQuery.data]);

  // History load
  useEffect(() => {
    if (activeMissionId) return;
    if (!historyQuery.data || historyQuery.data.length === 0) return;
    const convHistoryId = `conv-history-${activeBrandId}`;
    if (conversations.some((c) => c.id === convHistoryId)) return;
    const msgs: Msg[] = historyQuery.data.map((row: any) => {
      const parsed = renderContent(row.content);
      return { id: `db-${row.id}`, role: row.role as "user" | "assistant", content: parsed.main, thinking: parsed.thinking, taskId: row.taskId ?? undefined, ts: new Date(row.createdAt).getTime() };
    });
    if (msgs.length > 0) {
      setConversations([{ id: convHistoryId, title: "歷史對話", messages: msgs, brandId: activeBrandId ?? undefined, brandName: activeBrand?.name, createdAt: msgs[0].ts }]);
      setActiveId(convHistoryId);
      setConversationHistory(msgs.slice(-5).map((m) => ({ role: m.role, content: m.content })));
    }
  }, [historyQuery.data, conversations.length, activeBrandId, activeBrand?.name]);

  // Load mission message history from DB
  useEffect(() => {
    if (!activeMissionId || !savedMessagesQuery.data || savedMessagesQuery.data.length === 0) return;
    const missionConvId = `conv-mission-${activeMissionId}`;
    setConversations((prev) => {
      const conv = prev.find((c) => c.id === missionConvId);
      // Only load if the conversation exists but has 0 or just welcome msg (avoid overwriting in-progress chat)
      if (!conv) return prev;
      if (conv.messages.length > 1) return prev;
      const loadedMsgs: Msg[] = (savedMessagesQuery.data as any[]).map((m: any) => ({
        id: `db-msg-${m.id}`,
        role: m.role as "user" | "assistant",
        content: m.content,
        ts: new Date(m.createdAt).getTime(),
      }));
      if (loadedMsgs.length === 0) return prev;
      return prev.map((c) => c.id === missionConvId ? { ...c, messages: loadedMsgs } : c);
    });
  }, [savedMessagesQuery.data, activeMissionId]);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length, loading, teamAssembly, relaySteps]);

  // Submit shortcut
  useEffect(() => {
    const handler = () => { handleSend(); };
    document.addEventListener("submit-shortcut", handler);
    return () => document.removeEventListener("submit-shortcut", handler);
  }, [input, activeBrandId, activeMissionId, conversations, conversationHistory]);

  // Match query → team assembly
  useEffect(() => {
    if (!matchQuery.data || pendingTask === "") return;
    const agents = matchQuery.data.agents?.length
      ? matchQuery.data.agents
      : [{ id: 0, name: "策略總監", title: "CMO / 首席行銷官", layer: "strategy", specialty: "品牌策略與任務拆解" }];
    const plan = matchQuery.data.plan?.length
      ? matchQuery.data.plan
      : agents.map((a: any, i: number) => ({ step: i + 1, agentName: a.name, agentTitle: a.title, layer: a.layer, action: i === 0 ? "分析任務與制定策略" : i === 1 ? "執行內容產出" : "整合輸出與交付" }));
    setTeamAssembly({ phase: "assembling", agents, plan, taskType: matchQuery.data.taskType, taskText: pendingTask });
    const timer = setTimeout(() => {
      const relays = plan.map((step: any, idx: number) => ({
        id: idx + 1, label: step.action, agentName: step.agentName, agentTitle: step.agentTitle,
        layer: step.layer, status: "pending" as const,
        eta: idx === 0 ? "1-2 分鐘" : idx === 1 ? "2-4 分鐘" : "1 分鐘",
        summary: undefined, expanded: false,
      }));
      setRelaySteps(relays);
      setTeamAssembly((prev) => prev ? { ...prev, phase: "proposal" } : prev);
      setAwaitingApproval(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, [matchQuery.data, pendingTask]);

  // ── Core functions ────────────────────────────────────────────────────────

  const runRelayAnimation = () => {
    relaySteps.forEach((step, idx) => {
      setTimeout(() => {
        setRelaySteps((prev) => prev.map((s) => s.id === step.id ? { ...s, status: "running" } : s));
      }, idx * 1600);
      setTimeout(() => {
        setRelaySteps((prev) => prev.map((s) => s.id === step.id ? { ...s, status: "done", summary: `${step.agentName} 已完成「${step.label}」，產出核心結果並交接給下一位代理。` } : s));
      }, idx * 1600 + 1100);
    });
  };

  const executeSquadChat = async (text: string, convId: string): Promise<boolean> => {
    const missionData = missionDataQuery.data as any;
    const squadSlug: string = missionData?.squadSlug ?? "";
    if (!squadSlug) return false;
    const token = localStorage.getItem("authToken");
    if (!token) return false;
    const isNegativeFeedback = /不對|不好|不滿意|不喜歡|不要這個|不是這樣|重做|重新|撤销|差太遠|跟我想的不一樣|no|wrong|redo|again/i.test(text);
    if (isNegativeFeedback) {
      const clarifyMsgId = `clarify-${Date.now()}`;
      const clarifyContent = `我聽到了，你對這個方向不满意。讓我確認一下：

**不满意的地方是？**（請選擇其一）
1️⃣ 內容方向不對，請告訴我你想要的方向
2️⃣ 分析結果不準確，我重新搜尋資料
3️⃣ 說明風格不對，我調整語調重做
4️⃣ 完全不對，用其他 Agent 重新分析

單純回覆數字或告訴我具體哪裡不對，我馬上重做。`;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? { ...c, messages: [...c.messages, { id: clarifyMsgId, role: "assistant" as const, content: clarifyContent, agentName: streamingAgentName ?? undefined, ts: Date.now() }] }
            : c
        )
      );
      return true;
    }
    setLoading(true);
    setStreamingAgentName(null);
    setStreamingAgentTitle(null);
    let streamBuffer = "";
    let lastAgentModel: string | null = null;
    const streamMsgId = `squad-stream-${Date.now()}`;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? { ...c, messages: [...c.messages, { id: streamMsgId, role: "assistant" as const, content: "", ts: Date.now() }] }
          : c
      )
    );
    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userMessage: text,
          conversationHistory: conversationHistory.slice(-12),
          missionId: activeMissionId ?? currentMissionId ?? undefined,
          workspace: (missionDataQuery.data as any)?.workspace ?? undefined,
        }),
      });
      if (!resp.ok || !resp.body) throw new Error(`chat HTTP ${resp.status}`);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let lastAgentName: string | undefined;
      let lastAgentTitle: string | undefined;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        let curEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) { curEvent = line.slice(7).trim(); }
          else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (curEvent === "relay_step") {
                const rsId = data.id ?? 0;
                setRelaySteps((prev) => {
                  const exists = prev.find((s) => s.id === rsId);
                  if (data.status === "done") return prev.map((s) => s.id === rsId ? { ...s, status: "done" as const, summary: data.summary ?? streamBuffer.slice(0, 400) } : s);
                  if (exists) return prev.map((s) => s.id === rsId ? { ...s, status: "running" as const, agentName: data.agentName ?? s.agentName, agentTitle: data.agentTitle ?? s.agentTitle } : s);
                  return [...prev, { id: rsId, label: data.label ?? `Step ${rsId}`, agentName: data.agentName ?? "", agentTitle: data.agentTitle ?? "", layer: data.layer ?? "execution", status: "running" as const, eta: "", summary: "" }];
                });
            if (data.agentName) { lastAgentName = data.agentName; setStreamingAgentName(data.agentName); }
            if (data.agentTitle) { lastAgentTitle = data.agentTitle; setStreamingAgentTitle(data.agentTitle); }
          } else if (curEvent === "delta") {
            streamBuffer += data.text;
            setConversations((prev) =>
              prev.map((c) =>
                c.id === convId
                  ? { ...c, messages: c.messages.map((m) => m.id === streamMsgId ? { ...m, content: streamBuffer } : m) }
                  : c
              )
            );
          } else if (curEvent === "done") {
            setRelaySteps((prev) => prev.map((s) => s.status === "running" ? { ...s, status: "done" as const, summary: streamBuffer.slice(0, 400) } : s));
          }
        } catch { /* ignore */ }
      }
    }
      }
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? { ...c, messages: c.messages.map((m) => m.id === streamMsgId ? { ...m, content: streamBuffer || "（Agent 回覆完成）", agentName: lastAgentName, agentTitle: lastAgentTitle, agentModel: lastAgentModel } : m) }
            : c
        )
      );
      setConversationHistory((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: streamBuffer }].slice(-14));
      // Persist assistant response to mission_messages
      if (activeMissionId && streamBuffer) {
        saveMissionMsg.mutate({ missionId: activeMissionId, role: "assistant", content: streamBuffer });
      }
      setLoading(false);
      return true;
    } catch (err: any) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? { ...c, messages: c.messages.map((m) => m.id === streamMsgId ? { ...m, content: `Squad chat 錯誤：${err?.message ?? "未知"}，切換一般模式...` } : m) }
            : c
        )
      );
      setLoading(false);
      return false;
    }
  };

  const executeTask = async (text: string, convId: string) => {
    const workflowId = detectA2AWorkflow(text);
    if (workflowId) {
      sseRef.current?.close();
      setA2aSteps([]);
      setA2aProgress(0);
      setA2aTaskName(undefined);
      const token = localStorage.getItem("authToken");
      const url = `/api/a2a/stream?workflowId=${workflowId}${activeBrand?.id ? `&brandId=${activeBrand.id}` : ""}`;
      const sse = new EventSource(url + (token ? `&_token=${encodeURIComponent(token)}` : ""));
      sseRef.current = sse;
      sse.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type === "workflow_start") { setA2aTaskName(event.name); setA2aSteps([]); }
          else if (event.type === "node_start") { setA2aSteps((prev) => { const exists = prev.find((s) => s.id === event.step); if (exists) return prev.map((s) => s.id === event.step ? { ...s, status: "running" } : s); return [...prev, { id: event.step, label: event.nodeName, status: "running" }]; }); setA2aProgress(Math.round(((event.step - 1) / event.total) * 100)); }
          else if (event.type === "node_done") { setA2aSteps((prev) => prev.map((s) => s.id === event.step ? { ...s, status: "done" } : s)); setA2aProgress(Math.round((event.step / event.total) * 100)); }
          else if (event.type === "node_error") { setA2aSteps((prev) => prev.map((s) => s.label === event.nodeName ? { ...s, status: "error" } : s)); }
          else if (event.type === "workflow_done") { setA2aProgress(100); }
          else if (event.type === "result") {
            const outputs = Object.entries(event.result.nodeResults as Record<string, any>)
              .filter(([, v]) => v.output)
              .map(([nodeId, v]) => `**${nodeId.replace(/-/g, " ")}**\n${v.output?.slice(0, 400)}...`)
              .join("\n\n---\n\n");
            const content = outputs || "工作流已完成";
            const aMsg: Msg = { id: `a2a-${Date.now()}`, role: "assistant", content, ts: Date.now() };
            setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, messages: [...c.messages, aMsg] } : c));
            saveMessage.mutate({ brandId: activeBrand?.id, missionId: activeMissionId ?? undefined, role: "assistant", content });
            sse.close();
            setLoading(false);
            setTeamAssembly((prev) => prev ? { ...prev, phase: "done" } : prev);
          }
        } catch {}
      };
      sse.onerror = () => { sse.close(); setLoading(false); };
      return;
    }
    try {
      const { jobId } = await workflowStart.mutateAsync({
        userRequest: text,
        brand: activeBrand?.name,
        industry: (activeBrand as any)?.industry,
        taskType: detectTaskType(text),
      });
      if (!jobId) throw new Error("No jobId returned from workflow.start");
      const workflowResult = await pollWorkflowResult(jobId as string);
      let content = "", thinking = "", resultModel = "", resultAgentName = "", resultAgentTitle = "";
      if (workflowResult && typeof workflowResult === "object") {
        content = workflowResult.publishable_content ?? workflowResult.output ?? workflowResult.result ?? JSON.stringify(workflowResult);
        thinking = workflowResult.thinking ?? "";
        resultModel = workflowResult.model ?? "";
        resultAgentName = workflowResult.agent?.name ?? "";
        resultAgentTitle = workflowResult.agent?.title ?? "";
      } else if (typeof workflowResult === "string") {
        try { const p = JSON.parse(workflowResult); content = p.publishable_content ?? workflowResult; thinking = p.thinking ?? ""; resultModel = p.model ?? ""; resultAgentName = p.agent?.name ?? ""; resultAgentTitle = p.agent?.title ?? ""; }
        catch { content = workflowResult; }
      } else { content = "任務已完成，但未有產出內容"; }
      const aMsg: Msg = { id: `a-${Date.now()}`, role: "assistant", content, thinking, ts: Date.now(), model: resultModel || undefined, agentName: resultAgentName || undefined, agentTitle: resultAgentTitle || undefined };
      setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, messages: [...c.messages, aMsg] } : c));
      saveMessage.mutate({ brandId: activeBrand?.id, missionId: activeMissionId ?? undefined, role: "assistant", content });
      setConversationHistory((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content }].slice(-10));
      setTeamAssembly((prev) => prev ? { ...prev, phase: "done" } : prev);
    } catch (err: any) {
      try {
        let description = text;
        if (activeBrand) {
          const soworkAnalysis = activeBrand.soworkAnalysis as Record<string, unknown> | null | undefined;
          description = text + `\n\n[品牌背景：${activeBrand.name}，目標受眾：${(activeBrand as any).targetAudience || ""}，品牌定位：${soworkAnalysis?.positioning as string || ""}]`;
        }
        const result = await createAndExecute.mutateAsync({ title: text, description, brandId: activeBrand?.id, conversationHistory: conversationHistory.slice(-5) });
        let content = "", thinking = "";
        if (result.output) { try { const p = JSON.parse(result.output); content = p.publishable_content ?? result.output; thinking = p.thinking ?? ""; } catch { content = result.output; } }
        else if (result.error) { content = `很抱歉，發生錯誤：${result.error}`; }
        const aMsg: Msg = { id: `a-${Date.now()}`, role: "assistant", content, thinking, ts: Date.now() };
        setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, messages: [...c.messages, aMsg] } : c));
        saveMessage.mutate({ brandId: activeBrand?.id, missionId: activeMissionId ?? undefined, role: "assistant", content });
        setConversationHistory((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content }].slice(-10));
        setTeamAssembly((prev) => prev ? { ...prev, phase: "done" } : prev);
      } catch (fallbackErr: any) {
        setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, messages: [...c.messages, { id: `e-${Date.now()}`, role: "assistant" as const, content: `很抱歉，發生錯誤：${fallbackErr?.message ?? "未知錯誤"}`, ts: Date.now() }] } : c));
      }
    } finally {
      setLoading(false);
    }
  };

  const approveExecution = async () => {
    if (!teamAssembly?.taskText || !activeId) return;
    setAwaitingApproval(false);
    setLoading(true);
    setTeamAssembly((prev) => prev ? { ...prev, phase: "executing" } : prev);
    runRelayAnimation();
    await executeTask(teamAssembly.taskText, activeId);
    setPendingTask("");
  };

  const handleSend = async () => {
    const rawText = input.trim();
    if (!rawText || loading) return;
    stopRef.current = false;
    setIsStopped(false);
    setStreamingThinking("");
    setStreamingModel(null);
    const text = preselectedAgent
      ? `[指定${preselectedAgent.type === "agent" ? "Agent" : "Squad"}：${preselectedAgent.name}] ${rawText}`
      : rawText;
    setInput("");
    if (preselectedAgent && onClearAgent) onClearAgent();
    let convId = activeId;
    if (!convId) {
      const id = `conv-${Date.now()}`;
      setConversations((prev) => [{ id, title: text.slice(0, 30), messages: [], brandId: activeBrand?.id, brandName: activeBrand?.name, createdAt: Date.now() }, ...prev]);
      setActiveId(id);
      convId = id;
    }
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: text, ts: Date.now() };
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, title: c.messages.length === 0 ? text.slice(0, 32) : c.title, messages: [...c.messages, userMsg] } : c));
    saveMessage.mutate({ brandId: activeBrand?.id, missionId: activeMissionId ?? undefined, role: "user", content: text });
    // Persist to mission_messages if mission is active
    if (activeMissionId) {
      saveMissionMsg.mutate({ missionId: activeMissionId, role: "user", content: text });
    }

    // ── Auto-create mission on first message ──────────────────────────────
    const currentConvMessages = conversations.find(c => c.id === convId)?.messages ?? [];
    if (!activeMissionId && !currentMissionId && currentConvMessages.length === 0) {
      try {
        const newMission = await createMission.mutateAsync({
          workspace: '',
          brandId: activeBrand?.id,
          title: rawText.slice(0, 40),
        });
        if (newMission?.id) {
          setCurrentMissionId(newMission.id);
          if (onMissionCreated) onMissionCreated(newMission.id);
        }
      } catch {
        // non-blocking — ignore if mission create fails
      }
    }

    const missionSlug = (missionDataQuery.data as any)?.squadSlug;
    if (activeMissionId && missionSlug) {
      const handled = await executeSquadChat(text, convId);
      if (handled) return;
    }
    if (isTaskLike(text)) {
      setTeamAssembly({ phase: "analyzing", agents: [], plan: [], taskText: text });
      setRelaySteps([]);
      setPendingTask(text);
      return;
    }
    setLoading(true);
    await executeTask(text, convId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const toggleSummary = (id: number) => {
    setRelaySteps((prev) => prev.map((s) => s.id === id ? { ...s, expanded: !s.expanded } : s));
  };

  // ── Textarea auto-resize ──────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const activeBrandName = activeBrand?.name ?? "";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "#FFFFFF",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
    }}>
      {/* ── Chat toolbar ── */}
      <div style={{
        flexShrink: 0,
        padding: "6px 20px",
        borderBottom: "1px solid #ECEAE8",
        background: "#FAFAF9",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <button
          onClick={() => {
            const summaryText = "請總結以上對話的重點，包含：主要決策、行動項目、待確認事項。";
            setInput(summaryText);
            setTimeout(() => { const ev = new Event("submit-shortcut"); document.dispatchEvent(ev); }, 50);
          }}
          disabled={loading || !active || (active.messages.length === 0)}
          style={{
            padding: "3px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
            fontFamily: "inherit", background: "transparent",
            border: "1px solid #E4E3E1", color: "#6B6A66",
            display: "flex", alignItems: "center", gap: 4,
            opacity: (loading || !active || (active?.messages.length === 0)) ? 0.4 : 1,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          總結對話
        </button>

        {/* 清空對話按鈕 */}
        <button
          onClick={async () => {
            if (!window.confirm("確定要清空目前對話？定位進度也會重置。")) return;
            // 清空前端狀態
            if (active) {
              setConversations((prev) =>
                prev.map((c) => c.id === active.id ? { ...c, messages: [] } : c)
              );
            }
            setRelaySteps([]);
            setConversationHistory([]);
            setTeamAssembly(null);
            setStreamingAgentName(null);
            setStreamingAgentTitle(null);
            // 清空後端 positioning_sessions（strategy workspace）
            if (activeMissionId) {
              try {
                const token = localStorage.getItem("authToken");
                await fetch(`/api/chat/reset-positioning`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ missionId: activeMissionId }),
                });
          } catch { /* non-fatal */ }
        }
      }}
      disabled={loading || !active || (active?.messages.length === 0)}
      style={{
        padding: "3px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
        fontFamily: "inherit", background: "transparent",
        border: "1px solid #E4E3E1", color: "#9B4040",
        display: "flex", alignItems: "center", gap: 4,
        opacity: (loading || !active || (active?.messages.length === 0)) ? 0.4 : 1,
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14H6L5 6"/>
        <path d="M10 11v6M14 11v6"/>
        <path d="M9 6V4h6v2"/>
      </svg>
      清空對話
    </button>

    {/* 新增對話按鈕 */}
    <button
      onClick={() => {
        // 建立新對話，重置所有 relay/team 狀態
        const newId = `conv-new-${Date.now()}`;
        const newConv = { id: newId, title: "新對話", messages: [], createdAt: Date.now() };
        setConversations((prev) => [newConv, ...prev]);
        setActiveId(newId);
        setRelaySteps([]);
        setConversationHistory([]);
        setTeamAssembly(null);
        setStreamingAgentName(null);
        setStreamingAgentTitle(null);
        setInput("");
        setTimeout(() => chatInputRef.current?.focus(), 100);
      }}
      disabled={loading}
      style={{
        padding: "3px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
        fontFamily: "inherit", background: "transparent",
        border: "1px solid #E4E3E1", color: "#4A6B4A",
        display: "flex", alignItems: "center", gap: 4,
        opacity: loading ? 0.4 : 1,
        marginLeft: "auto",
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      新增對話
    </button>
      </div>

      {/* ── Squad progress bar ── */}
      {activeMissionId && (missionDataQuery.data as any)?.squadSlug && squadStep.currentStep > 0 && (
        <div style={{
          padding: "8px 20px",
          borderBottom: "1px solid #ECEAE8",
          background: "#FAFAF9",
          flexShrink: 0,
        }}>
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {streamingAgentName && <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A18" }}>{streamingAgentName}</span>}
                {streamingAgentTitle && <span style={{ fontSize: 11, color: "#9B9990" }}>· {streamingAgentTitle}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: "#C8C7C3" }}>Step {squadStep.currentStep}/{squadStep.totalSteps}{squadStep.isComplete ? " ✅" : ""}</span>
                <button
                  onClick={() => setInput("我想換一支不同的小組來執行這個任務，請列出可選的 Squad 選項")}
                  style={{ fontSize: 10, color: "#9B9990", background: "#F2F1EF", border: "1px solid #E4E3E1", padding: "2px 8px", borderRadius: 20, cursor: "pointer" }}
                >
                  換 Squad
                </button>
              </div>
            </div>
            <div style={{ height: 3, background: "#ECEAE8", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", background: "#1A1A18", borderRadius: 2,
                transition: "width 0.5s",
                width: `${Math.round((squadStep.currentStep / squadStep.totalSteps) * 100)}%`,
              }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Status badges ── */}
      {(loading || awaitingApproval) && (
        <div style={{ padding: "6px 20px", borderBottom: "1px solid #ECEAE8", display: "flex", gap: 8, flexShrink: 0, background: "#FAFAF9" }}>
          {loading && (
            <span style={{
              fontSize: 11, color: "#B07A30", background: "#FFF8EE",
              border: "1px solid #F5C9A8", padding: "2px 8px", borderRadius: 20,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} />
              執行中…
            </span>
          )}
          {awaitingApproval && (
            <span style={{
              fontSize: 11, color: "#4A4A45", background: "#F2F1EF",
              border: "1px solid #E4E3E1", padding: "2px 8px", borderRadius: 20,
            }}>
              等待批准
            </span>
          )}
        </div>
      )}

      {/* ── Messages scroll area ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          background: "#FFFFFF",
        }}
        className="messages-scroll"
      >
        {/* Empty state — show when no USER messages yet (welcome assistant msg doesn't count) */}
        {(!active || active.messages.filter(m => m.role === "user").length === 0) && !loading && !teamAssembly && (

              <MissionHomePage
                workspace={(missionDataQuery.data as any)?.workspace ?? "strategy"}
                brandName={activeBrandName ?? undefined}
                missionId={activeMissionId}
                onTaskSelect={(task) => {
                  setInput(task);
                  setTimeout(() => { const ev = new Event("submit-shortcut"); document.dispatchEvent(ev); }, 50);
                }}
              />
        )}

        {/* Loading card (streaming) */}
        {loading && !teamAssembly && (
          <div style={{
            background: "#FAFAF9",
            border: "1px solid #ECEAE8",
            borderRadius: 11,
            overflow: "hidden",
            maxWidth: 480,
          }}>
            <div style={{
              padding: "8px 12px",
              borderBottom: "1px solid #F5F5F4",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#E8631A", animation: "pulse 1.5s infinite" }} />
              {streamingAgentName && <span style={{ fontSize: 11, fontWeight: 600, color: "#1A1A18" }}>{streamingAgentName}</span>}
              {streamingAgentTitle && <span style={{ fontSize: 10, color: "#9B9990" }}>{streamingAgentTitle}</span>}
              {!streamingAgentName && <span style={{ fontSize: 11, color: "#9B9990" }}>思考中...</span>}
              <button
                onClick={handleStop}
                style={{
                  marginLeft: "auto", fontSize: 10, color: "#C8C7C3",
                  background: "none", border: "1px solid #E4E3E1", borderRadius: 5,
                  padding: "2px 7px", cursor: "pointer",
                }}
              >
                ⏹ 停止
              </button>
            </div>
            <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 150, 300].map((d) => (
                  <span key={d} style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: "#E8631A", display: "inline-block",
                    animation: `bounce 1s infinite`,
                    animationDelay: `${d}ms`,
                  }} />
                ))}
              </div>
              <span style={{ fontSize: 11, color: "#9B9990", fontStyle: "italic" }}>
                {streamingThinking ? streamingThinking.slice(0, 200) + (streamingThinking.length > 200 ? "…" : "") : "分析任務中，請稍候…"}
              </span>
            </div>
          </div>
        )}

        {/* Team assembly panel */}
        {teamAssembly && (
          <TeamAssemblyPanel
            state={teamAssembly}
            relaySteps={relaySteps}
            onApprove={approveExecution}
            onToggleSummary={toggleSummary}
          />
        )}

        {/* TypedThreadCard execution thread */}
        {relaySteps.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#C8C7C3", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
              Execution Thread
            </div>
            {relaySteps.filter((s) => s.status === "done").map((step, i, arr) => {
              type CardType = "human_request" | "pm_agent" | "team_assembly" | "specialist" | "review_request" | "approval_result";
              let cardType: CardType = "specialist";
              if (i === 0) cardType = "pm_agent";
              else if (step.layer === "strategy" || step.agentTitle?.includes("PM") || step.agentTitle?.includes("策略")) cardType = "pm_agent";
              else if (step.label?.includes("組隊") || step.label?.includes("分工") || step.label?.includes("team")) cardType = "team_assembly";
              else if (step.label?.includes("審核") || step.label?.includes("review") || step.label?.includes("確認")) cardType = "review_request";
              else if (i === arr.length - 1 && step.label?.includes("核准")) cardType = "approval_result";
              else cardType = "specialist";
              return (
                <TypedThreadCard
                  key={step.id}
                  cardType={cardType}
                  agentName={step.agentName}
                  label={step.label}
                  status={step.status}
                  content={step.summary || ""}
                  stepIndex={i + 1}
                  totalSteps={relaySteps.length}
                  nextAction={i < arr.length - 1 ? `下一步：${arr[i + 1]?.agentName ?? "下位成員"}執行` : undefined}
                  collapsible={true}
                />
              );
            })}
          </div>
        )}

        {/* TaskProgressTracker */}
        {(a2aSteps.length > 0 || (loading && a2aSteps.length > 0)) && (
          <TaskProgressTracker taskName={a2aTaskName} steps={a2aSteps} progress={a2aProgress} onComplete={() => {}} />
        )}

        {isStopped && (
          <div style={{ fontSize: 11, color: "#C8C7C3", textAlign: "center", padding: "8px 0" }}>⏹ 已停止生成</div>
        )}

        {/* Bottom anchor */}
        <div ref={bottomRef} />
      </div>

      {/* ── Input wrap ── */}
      <div style={{
        flexShrink: 0,
        padding: "12px 20px 16px",
        borderTop: "1px solid #ECEAE8",
        background: "#FAFAF9",
      }}>
        {/* Pre-selected agent tag */}
        {preselectedAgent && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 10px", marginBottom: 8,
            borderRadius: 8, background: "#FFF5EE",
            border: "1px solid #F5C9A8",
            fontSize: 12,
          }}>
            <span>{preselectedAgent.type === "agent" ? "A" : "S"}</span>
            <span style={{ fontWeight: 500, color: "#E8631A" }}>{preselectedAgent.name}</span>
            {preselectedAgent.title && <span style={{ color: "#B07A30", fontSize: 11 }}>· {preselectedAgent.title}</span>}
            <span style={{ fontSize: 11, color: "#C8973A", marginLeft: 4 }}>已選擇，輸入你的任務 👇</span>
            <button
              onClick={onClearAgent}
              style={{ marginLeft: "auto", background: "none", border: "none", color: "#C8C7C3", cursor: "pointer", fontSize: 12 }}
            >✕</button>
          </div>
        )}

        {/* Thread reply bar (show last agent reply info if available) */}
        {active && active.messages.length > 0 && (() => {
          const lastAgentMsg = [...(active.messages)].reverse().find(m => m.role === "assistant" && m.agentName);
          if (!lastAgentMsg) return null;
          return (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 11, color: "#9B9990", marginBottom: 6, padding: "0 2px",
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: "50%",
                background: "#D4D3D0",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 7, fontWeight: 700, color: "#4A4A45", flexShrink: 0,
              }}>
                {lastAgentMsg.agentName?.charAt(0) ?? "A"}
              </div>
              <span>回覆 {lastAgentMsg.agentName ?? "Agent"}</span>
            </div>
          );
        })()}

        {/* Input box */}
        <div style={{
          background: "white",
          border: "1.5px solid #E4E3E1",
          borderRadius: 12,
          padding: "10px 12px 8px",
          display: "flex",
          alignItems: "flex-end",
          gap: 10,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          transition: "border-color 0.2s, box-shadow 0.2s",
        }}>
          <textarea
            ref={chatInputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              preselectedAgent
                ? `告訴 ${preselectedAgent.name} 你要完成的任務…`
                : activeBrandName
                ? `告訴我你想為「${activeBrandName}」完成什麼任務…`
                : "選擇品牌後開始輸入任務…"
            }
            rows={1}
            disabled={loading}
            style={{
              flex: 1,
              resize: "none",
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 14,
              color: "#1A1A18",
              fontFamily: "inherit",
              lineHeight: 1.6,
              maxHeight: 160,
            }}
          />
          {/* Cursor blink animation only when empty */}
          {!input && !loading && (
            <style>{`
              @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
              @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
              @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
              @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
            `}</style>
          )}
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{
              flexShrink: 0,
              width: 32, height: 32,
              borderRadius: 8,
              background: input.trim() && !loading ? "#1A1A18" : "#E4E3E1",
              border: "none",
              color: input.trim() && !loading ? "white" : "#9B9990",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: input.trim() && !loading ? "pointer" : "default",
              transition: "all 0.15s",
            }}
          >
            <IconSend />
          </button>
        </div>
        <div style={{ fontSize: 10, color: "#C8C7C3", textAlign: "center", marginTop: 6 }}>
          Enter 送出 · Shift+Enter 換行
        </div>
      </div>
    </div>
  );
}
