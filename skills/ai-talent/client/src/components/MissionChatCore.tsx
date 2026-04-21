/**
 * MissionChatCore.tsx — Mission 對話核心元件
 * 負責：messages 列表 + input 區域（每個 Mission 的執行對話）
 * 樣式遵循 marketing-os-mockup-v7.html
 * Layout: flex column, height 100%
 *   上半：messages scroll area
 *   下半：input wrap（固定底部）
 *
 * Renamed from ChatCore.tsx in Phase A (2026-04-18)
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { trpc } from "../lib/trpc";
import TaskProgressTracker, { type TaskStep } from "./mission-chat/TaskProgressTracker";
import SquadRecommendCards from "./mission-chat/SquadRecommendCards";
import { MissionHomePage } from "./mission-chat/MissionHomePage";
import { AgentBubbleHeader } from "./mission-chat/AgentBubbleHeader";
import { SaveToBrainButton } from "./mission-chat/SaveToBrainButton";
import { MentionAutocomplete, useMentionParser, type MentionAgent } from "./mission-chat/MentionAutocomplete";
import { PositioningBar } from "./mission-chat/PositioningBar";
import { MarkdownRenderer } from "./mission-chat/MarkdownRenderer";
import { BrandPositioningBook, parsePositioningData } from "./mission-chat/BrandPositioningBook";
import DeliverableBlock, { type DeliverableItem } from "./mission-chat/DeliverableBlock";
import { CustomSquadDialog } from "./mission-chat/CustomSquadDialog";
import { BrandBrainBar } from "./mission-chat/BrandBrainBar";
import type { DBSquad } from '../types/squad';

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
  agentAvatar?: string | null;
  agentModel?: string | null;
  agentSkill?: string | null;
  agentRole?: string;
  isStreaming?: boolean;
  pendingApproval?: boolean;
  approved?: boolean;
  sopProposed?: boolean;
  sopBuilt?: boolean;
  exportFormat?: "ppt" | "word" | "copy" | "none";
  squadRecommend?: { squads: any[]; missionId: number; brandId: number };
  // Squad step metadata
  squadStep?: number;
  squadTotalSteps?: number;
  squadStepLabel?: string;
  isSquadLead?: boolean;
  isSecondOpinion?: boolean;
  suggestions?: string[];      // 後續建議選項
  savedToBrain?: boolean;
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

export interface SquadStepProgress {
  step: number;
  agentName: string;
  agentTitle: string;
  label: string;
  status: "waiting" | "running" | "done";
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MissionChatCoreProps {
  initialBrandId?: number | null;
  activeMissionId?: number | null;
  preselectedAgent?: { id: number; name: string; title?: string; type: "agent" | "squad" } | null;
  onClearAgent?: () => void;
  onMissionCreated?: (id: number) => void;
  onSquadSelect?: (taskLabel: string, squad: DBSquad) => void;
  onSquadPreview?: (squad: DBSquad | null) => void;
  onSquadStepProgress?: (progress: SquadStepProgress[]) => void;
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

// ─── MissionChatCore ────────────────────────────────────────────────────────

export default function MissionChatCore({
  initialBrandId,
  activeMissionId,
  preselectedAgent,
  onClearAgent,
  onMissionCreated,
  onSquadSelect,
  onSquadPreview,
  onSquadStepProgress,
}: MissionChatCoreProps = {}) {

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
  const [currentStepLabel, setCurrentStepLabel] = useState<string | null>(null);
  const [streamingAgentName, setStreamingAgentName] = useState<string | null>(null);
  const [streamingAgentTitle, setStreamingAgentTitle] = useState<string | null>(null);
  const [streamingModel, setStreamingModel] = useState<string | null>(null);
  const [streamingThinking, setStreamingThinking] = useState<string>("");
  const [isStopped, setIsStopped] = useState(false);
  // ── New feature state ───────────────────────────────────────────────────
  const [confirmedMsgIds, setConfirmedMsgIds] = useState<Set<string>>(new Set());
  const [activeWorkspaceKey, setActiveWorkspaceKey] = useState<string>("strategy");
  const [selectedSquadForMission, setSelectedSquadForMission] = useState<DBSquad | null>(null);

  const [mentionAnchorRect, setMentionAnchorRect] = useState<DOMRect | null>(null);

  // ── Squad step progress (for RELAY-based sidebar) ─────────────────────────
  const [squadStepProgress, setSquadStepProgress] = useState<SquadStepProgress[]>([]);
  // ── A2A step reply state — user controls when to advance ─────────────────
  const [awaitingStepReply, setAwaitingStepReply] = useState(false);
  const [awaitingStepInfo, setAwaitingStepInfo] = useState<{
    agentName: string; agentTitle: string; agentSkill: string; agentModel: string;
    nextStep: number; totalSteps: number;
    completedLabel?: string | null; // label of the completed step (e.g. "任務確認")
  } | null>(null);
  // ── PositioningBar state ──────────────────────────────────────────────────
  const [positioningBarText, setPositioningBarText] = useState<string | null>(null);
  const [positioningBarIcp, setPositioningBarIcp] = useState<string>("");
  const [positioningMsgId, setPositioningMsgId] = useState<string | null>(null);
  // ── CustomSquadDialog state ───────────────────────────────────────────────
  const [customSquadDialogOpen, setCustomSquadDialogOpen] = useState(false);
  // ── Email export state ────────────────────────────────────────────────────
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  // ── Agent turn counters — cap user-agent back-and-forth at 2 turns per agent ─
  const MAX_TURNS_PER_AGENT = 2;
  const [agentTurnCounts, setAgentTurnCounts] = useState<Record<string, number>>({});
  // Reset turn counters whenever the active mission changes
  useEffect(() => { setAgentTurnCounts({}); }, [activeMissionId]);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const stopRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const autoStartedRef = useRef<Set<number>>(new Set());
  // RELAY parsing refs
  const activeStreamMsgIdRef = useRef<string | null>(null);
  const relayMsgIdRef = useRef<string | null>(null);
  const relayStepCountRef = useRef(0);

  // ── tRPC hooks ───────────────────────────────────────────────────────────
  const [activeBrandId, setActiveBrandId] = useState<number | null>(null);
  const createAndExecute = trpc.task.createAndExecute.useMutation();
  const workflowStart = trpc.workflow.start.useMutation();
  const saveMessage = trpc.conversation.saveMessage.useMutation();
  const createMission = trpc.mission.create.useMutation();
  const updateMission = trpc.mission.update.useMutation();
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
  // ── Squad steps query (for CustomSquadDialog step enrichment) ───────────────
  const missionSquadSlug = (missionDataQuery.data as any)?.squadSlug as string | undefined;
  const squadBySlugQuery = trpc.squad.getSquadBySlug.useQuery(
    { slug: missionSquadSlug ?? "" },
    { enabled: !!missionSquadSlug, staleTime: 5 * 60_000, refetchOnWindowFocus: false }
  );
  const squadMembersQuery = trpc.squad.getMembersById.useQuery(
    { squadId: (squadBySlugQuery.data as any)?.squadId ?? 0 },
    { enabled: !!(squadBySlugQuery.data as any)?.squadId, staleTime: 5 * 60_000, refetchOnWindowFocus: false }
  );
  const dbSquadSteps: any[] = (squadMembersQuery.data as any)?.steps ?? [];

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

  // ── Continue to next step (user-controlled A2A advance) ──────────────────
  // Auto-mode has been permanently removed — every step requires explicit user
  // confirmation. See Day 3 note in missionChatRouter about runAutoSquadFlow removal.
  const handleContinueToNextStep = () => {
    const convId = activeId;
    const squadSlug = (missionDataQuery.data as any)?.squadSlug as string | undefined;
    if (!convId || !squadSlug) return;
    setAwaitingStepReply(false);
    setAwaitingStepInfo(null);
    setLoading(true);
    setStreamingAgentName(null);
    setStreamingAgentTitle(null);
    executeSquadChat("繼續", convId, squadSlug, false);
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
    setCurrentStepLabel(null);
    setStreamingAgentName(null);
    setStreamingAgentTitle(null);
    setSquadStepProgress([]);
    setPositioningBarText(null);
    setPositioningBarIcp("");
    setEmailDialogOpen(false);
    setEmailSent(false);
    setEmailInput("");
    activeStreamMsgIdRef.current = null;
    relayMsgIdRef.current = null;
    relayStepCountRef.current = 0;
    setConversations((prev) => {
      const existing = prev.find((c) => c.id === missionConvId);
      if (existing) return prev;
      return [{ id: missionConvId, title: missionData.title, messages: [], createdAt: Date.now() }, ...prev];
    });
  }, [activeMissionId, missionDataQuery.data]);

  // Reset squad selection when mission changes
  useEffect(() => {
    setSelectedSquadForMission(null);
  }, [activeMissionId]);

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
      // Only load if the conversation exists and is still empty (avoid overwriting in-progress chat)
      if (!conv) return prev;
      if (conv.messages.length > 0) return prev;
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

  // ── Squad Lead Auto-start — REMOVED 2026-04-21 ─────────────────────────────
  // Previously: when a mission has a squadSlug and no saved messages, auto-
  // triggered executeSquadChat("開始任務") after 1500ms. This caused confusion
  // because users would see analysis running before they had a chance to
  // review squad details, type their intent, or confirm.
  //
  // New behavior: Mission starts only when user explicitly sends a message
  // via ChatInput. MissionHomePage is shown until the first user message.
  // `autoStartedRef` is retained elsewhere for other purposes (if any).

  // Propagate squad step progress to parent
  useEffect(() => {
    onSquadStepProgress?.(squadStepProgress);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squadStepProgress]);

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

  const executeSquadChat = async (text: string, convId: string, squadSlugOverride?: string, isAutoAdvance?: boolean): Promise<boolean> => {
    const missionData = missionDataQuery.data as any;
    // On first message, missionData.squadSlug may not yet be in cache (updateMission.mutate is async).
    // Accept an explicit override so the first message still reaches the squad path.
    const squadSlug: string = squadSlugOverride ?? missionData?.squadSlug ?? "";
    if (!squadSlug) return false;
    // Token is OPTIONAL: users who signed in via the new LoginPage have only a
    // session cookie (no localStorage token). The fetch below sends cookies via
    // credentials:"include", and the server's verifyToken accepts either source.
    const token = localStorage.getItem("authToken");
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
    // For auto-advance: loading is already true, agents cleared — skip redundant sets
    if (!isAutoAdvance) {
      setLoading(true);
      setStreamingAgentName(null);
      setStreamingAgentTitle(null);
      setSquadStepProgress([]);
      relayStepCountRef.current = 0;
      relayMsgIdRef.current = null;
    }
    // Track A2A auto-advance signal from server
    let squadHasMoreSteps = false;
    let streamBuffer = "";
    let lastAgentModel: string | null = null;
    // Capture the last relay_step "done" data for the continue/reply banner
    let lastRelayStepDoneData: any = null;
    const streamMsgId = `squad-stream-${Date.now()}`;
    activeStreamMsgIdRef.current = streamMsgId;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? { ...c, messages: [...c.messages, { id: streamMsgId, role: "assistant" as const, content: "", ts: Date.now() }] }
          : c
      )
    );
    // Helper: process RELAY markers in buffered text and route content to correct bubbles
    const processRelayMarkers = (buffer: string): string => {
      // Format: [RELAY:slug:name:title:layer]  (all `:` separators)
      const relayRegex = /\[RELAY:([^:\]]+):([^:\]]+):([^:\]]+):([^\]]+)\]/g;
      let match;
      let remainderStart = 0;
      let processed = buffer;
      const regexCopy = new RegExp(relayRegex.source, relayRegex.flags);
      while ((match = regexCopy.exec(buffer)) !== null) {
        const [fullMatch, slug, name, title, layer] = match;
        const beforeRelay = buffer.slice(remainderStart, match.index);
        // Flush text before this RELAY marker into the current active bubble
        const currentMsgId = activeStreamMsgIdRef.current;
        if (currentMsgId && beforeRelay) {
          setConversations((prev) => prev.map((c) => c.id === convId
            ? { ...c, messages: c.messages.map((m) => m.id === currentMsgId
                ? { ...m, content: (m.content ?? "") + beforeRelay, isStreaming: true }
                : m
              )}
            : c
          ));
        }
        // Mark previous relay bubble as no longer streaming
        if (currentMsgId) {
          setConversations((prev) => prev.map((c) => c.id === convId
            ? { ...c, messages: c.messages.map((m) => m.id === currentMsgId
                ? { ...m, isStreaming: false }
                : m
              )}
            : c
          ));
        }
        // Create a new bubble for this relay agent
        const newMsgId = `relay-${Date.now()}-${relayStepCountRef.current}`;
        relayMsgIdRef.current = newMsgId;
        relayStepCountRef.current += 1;
        const stepNum = relayStepCountRef.current;
        const agentName = name.trim();
        const agentTitle = title.trim();
        const layerTrimmed = layer.trim();
        setConversations((prev) => prev.map((c) => c.id === convId
          ? { ...c, messages: [...c.messages, {
              id: newMsgId, role: "assistant" as const, content: "",
              ts: Date.now(), isStreaming: true,
              agentName,
              agentTitle,
              squadStep: stepNum,
              squadTotalSteps: undefined,
              squadStepLabel: `Step ${stepNum}`,
              isSquadLead: layerTrimmed === "strategy",
            }]
          }
          : c
        ));
        activeStreamMsgIdRef.current = newMsgId;
        // Update step progress: mark previous as done, new as running
        setSquadStepProgress((prev) => [
          ...prev.map((s) => s.status === "running" ? { ...s, status: "done" as const } : s),
          { step: stepNum, agentName, agentTitle, label: `Step ${stepNum}`, status: "running" as const },
        ]);
        // Update streaming agent display name
        setStreamingAgentName(agentName);
        setStreamingAgentTitle(agentTitle);
        remainderStart = match.index + fullMatch.length;
      }
      // Return remaining text after the last RELAY (or the full buffer if no markers)
      return buffer.slice(remainderStart);
    };

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        credentials: "include", // also send session cookie (new LoginPage flow)
        headers: token
          ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
          : { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: text,
          conversationHistory: conversationHistory.slice(-12),
          missionId: activeMissionId ?? undefined,
          workspace: (missionDataQuery.data as any)?.workspace ?? undefined,
          squadSlug: squadSlug || undefined, // pass to server as hint (first-message race condition fix)
        }),
      });
      if (!resp.ok || !resp.body) throw new Error(`chat HTTP ${resp.status}`);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let lastAgentName: string | undefined;
      let lastAgentTitle: string | undefined;
      // Accumulated delta text — flushed via processRelayMarkers each chunk
      let pendingDelta = "";
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
                const isSecondOpinion = data.isSecondOpinion ?? false;

                if (data.status === "done") {
                  // Capture step completion data for the continue/reply UI
                  if (data.isSynthesis) {
                    // Squad Lead 最終整合完成 → 標記流程完成，讓用戶直接與 Squad Lead 討論定案
                    setSquadStep((prev) => ({ ...prev, isComplete: true }));
                    // 不顯示 "繼續" banner，讓用戶自由輸入與 Squad Lead 討論
                    squadHasMoreSteps = false;
                  } else if (data.hasMoreSteps === true) {
                    squadHasMoreSteps = true;
                    lastRelayStepDoneData = data;
                  } else if (data.hasMoreSteps === false && typeof data.totalSteps === "number") {
                    // All specialist steps done (synthesis will follow automatically in same SSE)
                    setSquadStep((prev) => ({ ...prev, currentStep: data.totalSteps, totalSteps: data.totalSteps, isComplete: false }));
                  }
                  // Only update relaySteps for non-squad relay (squad uses message bubbles)
                  if (typeof data.step !== "number") {
                    setRelaySteps((prev) => prev.map((s) => s.id === rsId
                      ? { ...s, status: "done" as const, summary: data.summary ?? streamBuffer.slice(0, 400) }
                      : s
                    ));
                  }
                  if (!isSecondOpinion) {
                    const curId = activeStreamMsgIdRef.current;
                    setConversations((prev) => prev.map((c) => c.id === convId
                      ? { ...c, messages: c.messages.map((m) => m.id === curId
                          ? { ...m, isStreaming: false, agentName: data.agentName ?? m.agentName, agentTitle: data.agentTitle ?? m.agentTitle }
                          : m
                        )}
                      : c
                    ));
                  }
                } else {
                  // step running — 把 agent 身份注入 message（串流開始前）
                  // Squad relay steps (have data.step + data.totalSteps) are rendered via
                  // AgentBubbleHeader in message bubbles — do NOT add to relaySteps to
                  // avoid double rendering in TypedThreadCards.
                  const isSquadRelay = typeof data.step === "number" && typeof data.totalSteps === "number";
                  if (!isSquadRelay) {
                    setRelaySteps((prev) => {
                      const exists = prev.find((s) => s.id === rsId);
                      if (exists) return prev.map((s) => s.id === rsId
                        ? { ...s, status: "running" as const, agentName: data.agentName ?? s.agentName, agentTitle: data.agentTitle ?? s.agentTitle }
                        : s
                      );
                      return [...prev, { id: rsId, label: data.label ?? `Step ${rsId}`, agentName: data.agentName ?? "", agentTitle: data.agentTitle ?? "", layer: data.layer ?? "execution", status: "running" as const, eta: "", summary: "" }];
                    });
                  }
                  // Update squad sidebar timeline for squad relay steps (via relay_step SSE,
                  // not RELAY text markers — without this the sidebar stays empty)
                  if (isSquadRelay && !isSecondOpinion) {
                    setSquadStepProgress((prev) => [
                      ...prev.map((s) => s.status === "running" ? { ...s, status: "done" as const } : s),
                      {
                        step: data.step,
                        agentName: data.agentName ?? "",
                        agentTitle: data.agentTitle ?? "",
                        label: data.label ?? `Step ${data.step}`,
                        status: "running" as const,
                      },
                    ]);
                  }

                  if (data.isSynthesis) {
                    // Squad Lead 最終整合 → 新開一個 bubble，不覆蓋 Specialist 的輸出
                    const synthMsgId = `synthesis-${Date.now()}`;
                    activeStreamMsgIdRef.current = synthMsgId;
                    const synthMsg: Msg = {
                      id: synthMsgId, role: "assistant", content: "", ts: Date.now(),
                      isStreaming: true,
                      agentName:   data.agentName  ?? "",
                      agentTitle:  data.agentTitle  ?? "",
                      agentAvatar: data.agentAvatar ?? null,
                      agentRole:   "squad_lead",
                      agentSkill:  data.agentSkill  ?? "",
                      agentModel:  data.agentModel  ?? "",
                      isSquadLead: true,
                      squadStep:        data.step,
                      squadTotalSteps:  data.totalSteps,
                      squadStepLabel:   data.label ?? "最終整合建議",
                    };
                    setConversations((prev) => prev.map((c) => c.id === convId
                      ? { ...c, messages: [...c.messages, synthMsg] }
                      : c
                    ));
                    // 更新 Squad Lead 身份顯示
                    if (data.agentName) { lastAgentName = data.agentName; setStreamingAgentName(data.agentName); }
                    if (data.agentTitle) { lastAgentTitle = data.agentTitle; setStreamingAgentTitle(data.agentTitle); }
                    if (data.label) { setCurrentStepLabel(data.label); }
                  } else if (!isSecondOpinion) {
                    const curId = activeStreamMsgIdRef.current;
                    setConversations((prev) => prev.map((c) => c.id === convId
                      ? { ...c, messages: c.messages.map((m) => m.id === curId
                          ? { ...m,
                              isStreaming: true,
                              agentName: data.agentName ?? m.agentName,
                              agentTitle: data.agentTitle ?? m.agentTitle,
                              agentAvatar: data.agentAvatar ?? m.agentAvatar,
                              agentRole: data.agentRole ?? m.agentRole,
                              agentSkill: data.agentSkill ?? m.agentSkill,
                              agentModel: data.agentModel ?? m.agentModel,
                              squadStep: data.step,
                              squadTotalSteps: data.totalSteps,
                              squadStepLabel: data.label,
                              isSquadLead: data.layer === "strategy" && data.step === 0,
                            }
                          : m
                        )}
                      : c
                    ));
                  } else {
                    // 第二意見：插入新的 assistant message
                    const soId = `so-${Date.now()}`;
                    (window as any).__soMsgId = soId;
                    const soMsg: Msg = {
                      id: soId, role: "assistant", content: "", ts: Date.now(),
                      isStreaming: true, isSecondOpinion: true,
                      agentName: data.agentName, agentTitle: data.agentTitle,
                      agentAvatar: data.agentAvatar ?? null,
                    };
                    setConversations((prev) => prev.map((c) => c.id === convId
                      ? { ...c, messages: [...c.messages, soMsg] }
                      : c
                    ));
                  }

                  if (data.agentName) { lastAgentName = data.agentName; setStreamingAgentName(data.agentName); }
                  if (data.agentTitle) { lastAgentTitle = data.agentTitle; setStreamingAgentTitle(data.agentTitle); }
                  if (data.label) { setCurrentStepLabel(data.label); }
                  // Update squad step progress bar
                  if (typeof data.step === "number" && typeof data.totalSteps === "number") {
                    setSquadStep({ currentStep: data.step + 1, totalSteps: data.totalSteps + 1, isComplete: false,
                      agentName: data.agentName, agentTitle: data.agentTitle });
                  }
                }

              } else if (curEvent === "second_opinion_delta") {
                const soId = (window as any).__soMsgId;
                if (soId) {
                  setConversations((prev) => prev.map((c) => c.id === convId
                    ? { ...c, messages: c.messages.map((m) => m.id === soId
                        ? { ...m, content: (m.content ?? "") + (data.text ?? "") }
                        : m
                      )}
                    : c
                  ));
                }
              } else if (curEvent === "suggestions") {
                const items: string[] = data.items ?? [];
                const curId = activeStreamMsgIdRef.current;
                setConversations((prev) => prev.map((c) => c.id === convId
                  ? { ...c, messages: c.messages.map((m) => m.id === curId
                      ? { ...m, suggestions: items }
                      : m
                    )}
                  : c
                ));
              } else if (curEvent === "delta") {
                streamBuffer += data.text ?? "";
                pendingDelta += data.text ?? "";
                // Process any RELAY markers embedded in the accumulated delta
                const remaining = processRelayMarkers(pendingDelta);
                pendingDelta = "";
                // Append non-RELAY remainder to the currently active bubble
                if (remaining) {
                  const curId = activeStreamMsgIdRef.current;
                  if (curId) {
                    setConversations((prev) =>
                      prev.map((c) =>
                        c.id === convId
                          ? { ...c, messages: c.messages.map((m) => m.id === curId
                              ? { ...m, content: (m.content ?? "") + remaining }
                              : m
                            )}
                          : c
                      )
                    );
                  }
                }
              } else if (curEvent === "done") {
                setRelaySteps((prev) => prev.map((s) => s.status === "running" ? { ...s, status: "done" as const, summary: streamBuffer.slice(0, 400) } : s));
                // Mark all squad step progress as done
                setSquadStepProgress((prev) => prev.map((s) => s.status === "running" ? { ...s, status: "done" as const } : s));
              }
            } catch { /* ignore */ }
          }
        }
      }
      // Flush any remaining text into the active bubble
      if (pendingDelta) {
        const curId = activeStreamMsgIdRef.current;
        if (curId) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? { ...c, messages: c.messages.map((m) => m.id === curId
                    ? { ...m, content: (m.content ?? "") + pendingDelta }
                    : m
                  )}
                : c
            )
          );
        }
      }
      // Finalize the last active bubble
      const finalMsgId = activeStreamMsgIdRef.current ?? streamMsgId;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? { ...c, messages: c.messages.map((m) => m.id === finalMsgId
                ? { ...m, isStreaming: false, agentName: m.agentName ?? lastAgentName, agentTitle: m.agentTitle ?? lastAgentTitle, agentModel: lastAgentModel }
                : m
              )}
            : c
        )
      );
      setConversationHistory((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: streamBuffer }].slice(-14));
      // Persist assistant response to mission_messages
      if (activeMissionId && streamBuffer) {
        saveMissionMsg.mutate({ missionId: activeMissionId, role: "assistant", content: streamBuffer });
      }
      // PositioningBar detection: show if final output contains positioning statement
      if (/Positioning Statement|定位陳述|品牌定位書|核心定位句/i.test(streamBuffer)) {
        // Extract a short snippet for the bar
        const posMatch = streamBuffer.match(/(?:Positioning Statement|定位陳述|核心定位句)[^\n]*\n?([^\n]{10,120})/i);
        const posText = posMatch ? posMatch[1].trim() : streamBuffer.slice(0, 120);
        const icpMatch = streamBuffer.match(/(?:目標客群|ICP|受眾)[^\n：:]*[：:]\s*([^\n]{5,80})/i);
        const icpText = icpMatch ? icpMatch[1].trim() : "";
        setPositioningBarText(posText);
        setPositioningBarIcp(icpText);
        // Track which message ID contains the positioning book
        setPositioningMsgId(activeStreamMsgIdRef.current ?? streamMsgId);
      }
      // ── Step done: show Continue / Reply UI (user controls when to advance) ─
      if (squadHasMoreSteps) {
        // Show "continue or reply" banner — don't auto-advance
        setAwaitingStepReply(true);
        setAwaitingStepInfo({
          agentName:      lastRelayStepDoneData?.agentName  ?? streamingAgentName  ?? "",
          agentTitle:     lastRelayStepDoneData?.agentTitle ?? streamingAgentTitle ?? "",
          agentSkill:     lastRelayStepDoneData?.agentSkill ?? "",
          agentModel:     lastRelayStepDoneData?.agentModel ?? "",
          nextStep:       lastRelayStepDoneData?.nextStepIndex ?? 1,
          totalSteps:     lastRelayStepDoneData?.totalSteps ?? 1,
          completedLabel: lastRelayStepDoneData?.label ?? null, // e.g. "任務確認" for lead step
        });
        setLoading(false);
      } else {
        setAwaitingStepReply(false);
        setAwaitingStepInfo(null);
        setLoading(false);
      }
      return true;
    } catch (err: any) {
      const errMsgId = activeStreamMsgIdRef.current ?? streamMsgId;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? { ...c, messages: c.messages.map((m) => m.id === errMsgId ? { ...m, content: `Squad chat 錯誤：${err?.message ?? "未知"}，切換一般模式...` } : m) }
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

  // Derive the current "active agent key" — the agent the next user message will reply to.
  // Falls back to "squad-lead" before any specialist step has begun.
  const currentAgentKey = (() => {
    const running = squadStepProgress.find((s) => s.status === "running");
    if (running?.agentName) return running.agentName;
    const lastDone = [...squadStepProgress].reverse().find((s) => s.status === "done");
    if (lastDone?.agentName) return lastDone.agentName;
    return "squad-lead";
  })();
  const currentAgentTurns = agentTurnCounts[currentAgentKey] ?? 0;
  const turnsLeft = MAX_TURNS_PER_AGENT - currentAgentTurns;
  // Per-agent 2-turn cap removed — users can discuss with any member as long as they want.
  const isAtTurnLimit = false;
  void turnsLeft; // keep symbol referenced for any downstream analytics

  const handleSend = async () => {
    const rawText = input.trim();
    if (!rawText || loading) return;
    // Enforce per-agent 2-turn discussion cap
    if (isAtTurnLimit) return;
    // Increment turn counter for the agent this message targets
    setAgentTurnCounts((prev) => ({
      ...prev,
      [currentAgentKey]: (prev[currentAgentKey] ?? 0) + 1,
    }));

    // First-message: persist selected squad
    const active = conversations.find((c) => c.id === activeId);
    const isFirstUserMsg = !active || active.messages.filter(m => m.role === "user").length === 0;
    if (isFirstUserMsg && activeMissionId && selectedSquadForMission) {
      updateMission.mutate({
        id: activeMissionId,
        squadSlug: selectedSquadForMission.slug,
      });
      onSquadSelect?.(rawText, selectedSquadForMission);
      // Reset squad session so the workflow always starts from Step 0 (Lead intake)
      const _tok = localStorage.getItem("authToken");
      fetch("/api/chat/reset-squad-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(_tok ? { Authorization: `Bearer ${_tok}` } : {}) },
        body: JSON.stringify({ missionId: activeMissionId }),
      }).catch(() => {});
    }

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

    // If awaiting reply to current agent step, dismiss banner before sending
    // The server will detect "continue" signal or treat message as reply to same agent
    if (awaitingStepReply) {
      setAwaitingStepReply(false);
      setAwaitingStepInfo(null);
    }

    // On first message, updateMission.mutate() (squad slug) hasn't propagated to query cache yet.
    // Fall back to selectedSquadForMission.slug so the first message still routes to squadChat.
    const missionSlug = (missionDataQuery.data as any)?.squadSlug
      ?? (isFirstUserMsg && selectedSquadForMission ? selectedSquadForMission.slug : null);
    if (activeMissionId && missionSlug) {
      const handled = await executeSquadChat(text, convId, missionSlug);
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
    const val = e.target.value;
    setInput(val);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
    // Update anchor rect for MentionAutocomplete positioning
    if (val.includes("@")) {
      setMentionAnchorRect(el.getBoundingClientRect());
      // Notify right panel to float "協作成員" section to top
      window.dispatchEvent(new CustomEvent("section-priority", { detail: { key: "agents" } }));
    }
  };

  // ── @Mention helpers ──────────────────────────────────────────────────────
  // Derive unique agents seen in this conversation for @mention autocomplete
  const mentionAgents: MentionAgent[] = useMemo(() => {
    const seen = new Map<string, MentionAgent>();
    active?.messages.forEach(m => {
      if (m.role === "assistant" && m.agentName && !seen.has(m.agentName)) {
        seen.set(m.agentName, {
          id: m.agentName.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0), // stable name-based id
          name: m.agentName,
          title: m.agentTitle ?? "",
          avatarUrl: m.agentAvatar ?? null,
          isLead: m.isSquadLead,
        });
      }
    });
    return Array.from(seen.values());
  }, [active?.messages]);

  const { isMentioning, query: mentionQuery, mentionStart } = useMentionParser(input);

  const handleMentionSelect = useCallback((agent: MentionAgent) => {
    const before = input.slice(0, mentionStart);
    const after = input.slice(mentionStart + 1 + mentionQuery.length);
    setInput(`${before}@${agent.name} ${after}`);
    setMentionAnchorRect(null);
    setTimeout(() => chatInputRef.current?.focus(), 50);
  }, [input, mentionStart, mentionQuery]);

  // ── Render ────────────────────────────────────────────────────────────────

  const activeBrandName = activeBrand?.name ?? "";

  const isShowingHomepage = !!(
    activeMissionId
    && missionDataQuery.isSuccess
    && savedMessagesQuery.isSuccess
    && (savedMessagesQuery.data as any[]).length === 0
    && !(active?.messages.length)   // hide once squad lead (or user) sends any message
    && !loading                      // hide immediately when auto-start begins
    && !teamAssembly
  );

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "#FFFFFF",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
    }}>
      {/* ── Squad progress bar removed — progress is shown in right panel SOP section ── */}
      {false && activeMissionId && (missionDataQuery.data as any)?.squadSlug && squadStep.currentStep > 0 && (
        <div style={{
          padding: "10px 20px",
          borderBottom: "1px solid #ECEAE8",
          background: squadStep.isComplete ? "#F0FDF4" : "#FAFAF9",
          flexShrink: 0,
          transition: "background 0.4s",
        }}>
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {!squadStep.isComplete && (
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: "#0A6EFA",
                    animation: "pulse 1.5s ease-in-out infinite",
                    flexShrink: 0,
                  }} />
                )}
                {squadStep.isComplete && (
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    background: "#059669",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                )}
                <span style={{ fontSize: 12, fontWeight: 600, color: squadStep.isComplete ? "#059669" : "#1A1A18" }}>
                  {squadStep.isComplete
                    ? "Squad 執行完成"
                    : streamingAgentName
                    ? `${streamingAgentName} 執行中…`
                    : currentStepLabel || "分析中…"
                  }
                </span>
                {!squadStep.isComplete && streamingAgentTitle && (
                  <span style={{ fontSize: 11, color: "#9B9990" }}>· {streamingAgentTitle}</span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: squadStep.isComplete ? "#059669" : "#6B6A66",
                  background: squadStep.isComplete ? "#ECFDF5" : "#F2F1EF",
                  border: `1px solid ${squadStep.isComplete ? "#BBF7D0" : "#E4E3E1"}`,
                  borderRadius: 20, padding: "1px 8px",
                }}>
                  {squadStep.currentStep} / {squadStep.totalSteps}
                </span>
                {!squadStep.isComplete && (
                  <button
                    onClick={() => setInput("我想換一支不同的小組來執行這個任務，請列出可選的 Squad 選項")}
                    style={{ fontSize: 10, color: "#9B9990", background: "transparent", border: "1px solid #E4E3E1", padding: "2px 8px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    換 Squad
                  </button>
                )}
              </div>
            </div>
            {/* Step segment bar */}
            <div style={{ display: "flex", gap: 3, height: 4 }}>
              {Array.from({ length: squadStep.totalSteps }).map((_, i) => {
                const isDone = i < squadStep.currentStep;
                const isActive = i === squadStep.currentStep - 1 && !squadStep.isComplete;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1, height: "100%",
                      borderRadius: 2,
                      background: isDone
                        ? (squadStep.isComplete ? "#059669" : "#0A6EFA")
                        : "#E4E3E1",
                      transition: "background 0.4s",
                      position: "relative" as const,
                      overflow: "hidden",
                    }}
                  >
                    {isActive && (
                      <div style={{
                        position: "absolute" as const, top: 0, left: 0, bottom: 0,
                        width: "60%",
                        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
                        animation: "shimmer 1.5s infinite",
                      }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <style>{`
            @keyframes shimmer {
              0%   { transform: translateX(-100%); }
              100% { transform: translateX(300%); }
            }
          `}</style>
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

      {/* ── PositioningBar ── */}
      {positioningBarText && (
        <div style={{ padding: "0 20px 4px", flexShrink: 0 }}>
          <PositioningBar
            positioningText={positioningBarText}
            icp={positioningBarIcp}
            onDismiss={() => setPositioningBarText(null)}
            onViewBook={positioningMsgId ? () => {
              // Scroll to the message containing the positioning book
              const el = document.getElementById(`msg-${positioningMsgId}`);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                // Brief highlight animation
                el.style.background = "rgba(10,110,250,0.06)";
                el.style.borderRadius = "10px";
                el.style.transition = "background 0.5s";
                setTimeout(() => { el.style.background = ""; el.style.borderRadius = ""; }, 1500);
              }
            } : undefined}
          />
        </div>
      )}

      {/* ── BrandBrainBar — positioning + knowledge context strip ── */}
      {activeMissionId && activeBrand?.id && (
        <BrandBrainBar
          brandId={activeBrand.id}
          missionId={activeMissionId}
        />
      )}

      {/* ── Chat toolbar ── */}
      <div style={{
        flexShrink: 0,
        padding: "6px 20px",
        borderTop: "1px solid #ECEAE8",
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

        {/* 儲存為我的 Squad — shown once squad has run at least 1 step */}
        {activeMissionId && (missionDataQuery.data as any)?.squadSlug && squadStepProgress.length > 0 && (
          <button
            onClick={() => setCustomSquadDialogOpen(true)}
            style={{
              padding: "3px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
              fontFamily: "inherit",
              background: "linear-gradient(135deg, #C9823A, #E8631A)",
              border: "none", color: "white",
              display: "flex", alignItems: "center", gap: 4,
              boxShadow: "0 1px 4px rgba(201,130,58,0.3)",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
            儲存為我的 Squad
          </button>
        )}
      </div>

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
        {/* MissionHomePage: 顯示當 missionData 載入完成 且 DB 確認 0 訊息 且 記憶體也無 user 訊息 */}
        {isShowingHomepage && (
              <MissionHomePage
                workspace={(missionDataQuery.data as any)?.workspace ?? "strategy"}
                missionTitle={(missionDataQuery.data as any)?.title ?? undefined}
                missionId={activeMissionId}
                brandId={(missionDataQuery.data as any)?.brandId ?? null}
                onMissionSelect={(text) => {
                  setInput(text);
                  setTimeout(() => { const ev = new Event("submit-shortcut"); document.dispatchEvent(ev); }, 50);
                }}
                onSquadPreview={(squad) => {
                  setSelectedSquadForMission(squad);
                  onSquadPreview?.(squad);
                }}
              />
        )}

        {/* ── Chat message bubbles ── */}
        {!isShowingHomepage && active && active.messages.map((msg) => (
          <div key={msg.id} id={`msg-${msg.id}`} style={{
            display: "flex",
            flexDirection: "column",
            alignItems: msg.role === "user" ? "flex-end" : "flex-start",
            gap: 4,
          }}>
            {/* Squad AgentBubbleHeader — shown before assistant content */}
            {msg.role === "assistant" && msg.squadStep !== undefined && (
              <AgentBubbleHeader
                agentName={msg.agentName ?? "Agent"}
                agentTitle={msg.agentTitle}
                agentAvatar={msg.agentAvatar}
                agentSkill={msg.agentSkill}
                agentModel={msg.agentModel}
                stepLabel={msg.squadStepLabel}
                stepIndex={msg.squadStep}
                totalSteps={msg.squadTotalSteps}
                isStreaming={msg.isStreaming}
                isSecondOpinion={msg.isSecondOpinion}
                isLead={msg.isSquadLead}
                showHandoff={!msg.isSquadLead && !msg.isSecondOpinion && (msg.squadStep ?? 0) >= 1}
              />
            )}

            {/* Message bubble */}
            <div style={{
              maxWidth: msg.role === "user" ? 480 : "100%",
              background: msg.role === "user" ? "#1A1A18" : "transparent",
              color: msg.role === "user" ? "#FFFFFF" : "#1A1A18",
              borderRadius: msg.role === "user" ? 14 : 0,
              padding: msg.role === "user" ? "10px 14px" : msg.squadStep !== undefined ? "0 0 0 12px" : "0",
              fontSize: 14,
              lineHeight: 1.65,
              whiteSpace: msg.role === "user" ? "pre-wrap" : undefined,
              borderLeft: msg.squadStep !== undefined
                ? `3px solid ${msg.isSquadLead ? "#0A6EFA" : msg.isSecondOpinion ? "#7C3AED" : "#E4E3E1"}`
                : "none",
            }}>
              {msg.role === "assistant" && msg.agentName && msg.squadStep === undefined && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  marginBottom: 6, fontSize: 12, color: "#6B6A66",
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    background: "#1A1A18", display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff",
                    flexShrink: 0,
                  }}>
                    {msg.agentName.charAt(0)}
                  </div>
                  <span style={{ fontWeight: 600 }}>{msg.agentName}</span>
                  {msg.agentTitle && <span style={{ color: "#9CA3AF" }}>· {msg.agentTitle}</span>}
                </div>
              )}
              <div style={{ fontSize: 14, lineHeight: 1.65, color: msg.role === "user" ? "#fff" : "#1A1A18" }}>
                {msg.role === "user" ? (
                  <span>{msg.content}</span>
                ) : (
                  <MarkdownRenderer
                    content={msg.content}
                    isStreaming={msg.isStreaming}
                  />
                )}
              </div>

              {/* BrandPositioningBook — shown after final positioning output */}
              {msg.role === "assistant" && !msg.isStreaming && (() => {
                const bookData = parsePositioningData(msg.content);
                if (!bookData) return null;
                return (
                  <BrandPositioningBook
                    data={{ ...bookData, brandName: activeBrand?.name }}
                    onSaveToBrain={() => {
                      if (activeBrand?.id) {
                        // Fire save to brain
                      }
                    }}
                  />
                );
              })()}
            </div>

            {/* SaveToBrainButton — shown below completed squad step messages */}
            {msg.role === "assistant" && !msg.isStreaming && msg.squadStep !== undefined && activeBrand?.id && (
              <SaveToBrainButton
                brandId={activeBrand.id}
                content={msg.content ?? ""}
                title={msg.squadStepLabel ?? `Step ${msg.squadStep} 輸出`}
                missionId={activeMissionId ?? undefined}
              />
            )}

            {/* DeliverableBlock — Squad Lead 最終輸出成品卡（Canva 模式：任務有終點） */}
            {msg.role === "assistant" && !msg.isStreaming && msg.isSquadLead && msg.content && msg.content.length > 50 && (() => {
              const deliverableItems: DeliverableItem[] = [{
                id: parseInt(msg.id.replace(/\D/g, "").slice(-8) || "1"),
                title: msg.squadStepLabel ?? "任務成品",
                content: msg.content,
                outputType: "text",
                deliverableLevel: 1,
                deliverableTool: "none",
                finalizedStatus: "draft",
              }];
              return (
                <div style={{ marginTop: 8 }}>
                  <DeliverableBlock
                    items={deliverableItems}
                    onCopy={(text) => {
                      navigator.clipboard.writeText(text);
                    }}
                  />
                </div>
              );
            })()}

            {/* Suggestion chips — only shown on final step or non-squad messages (auto-advance handles intermediate steps) */}
            {msg.suggestions && msg.suggestions.length > 0
              && (msg.squadStep === undefined || squadStep.isComplete)
              && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {msg.suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(s)}
                    style={{
                      fontSize: 12, padding: "5px 12px", borderRadius: 20,
                      border: "1px solid #E4E3E1", background: "#FAFAF9",
                      cursor: "pointer", color: "#4A4A45", fontFamily: "inherit",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = "#1A1A18";
                      (e.currentTarget as HTMLElement).style.background = "#F5F5F3";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = "#E4E3E1";
                      (e.currentTarget as HTMLElement).style.background = "#FAFAF9";
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* ── A2A Step: Continue / Reply Banner ─────────────────────────────── */}
        {awaitingStepReply && awaitingStepInfo && !loading && (
          <div style={{
            background: "linear-gradient(135deg, #FFF8F0, #FFF3E6)",
            border: "1.5px solid #F5C9A8",
            borderRadius: 14,
            padding: "14px 18px",
            maxWidth: 640,
            boxShadow: "0 2px 12px rgba(201,130,58,0.12)",
            animation: "slideInUp 0.3s cubic-bezier(0.16,1,0.3,1)",
          }}>
            {/* Agent identity row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "linear-gradient(135deg, #C9823A, #E8631A)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, color: "white", flexShrink: 0,
              }}>
                {awaitingStepInfo.agentName?.charAt(0) ?? "A"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A18" }}>
                  {awaitingStepInfo.agentName}
                  {awaitingStepInfo.agentTitle && (
                    <span style={{ fontWeight: 400, color: "#6B6A66", marginLeft: 6 }}>— {awaitingStepInfo.agentTitle}</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                  {awaitingStepInfo.agentSkill && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "1px 8px", borderRadius: 20,
                      background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A",
                    }}>
                      🔧 {awaitingStepInfo.agentSkill}
                    </span>
                  )}
                  {awaitingStepInfo.agentModel && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "1px 8px", borderRadius: 20,
                      background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE",
                    }}>
                      ⚡ {formatModelName(awaitingStepInfo.agentModel)}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: "#9B9990", padding: "1px 4px" }}>
                    {awaitingStepInfo.completedLabel
                      ? `${awaitingStepInfo.completedLabel} 完成 · 共 ${awaitingStepInfo.totalSteps} 步`
                      : `Step ${awaitingStepInfo.nextStep - 1} 完成 · 共 ${awaitingStepInfo.totalSteps} 步`}
                  </span>
                </div>
              </div>
            </div>
            {/* Prompt text */}
            <p style={{ fontSize: 12, color: "#6B6A66", margin: "0 0 12px 0", lineHeight: 1.6 }}>
              💬 可以繼續與 <strong style={{ color: "#1A1A18" }}>{awaitingStepInfo.agentName}</strong> 深入討論此步驟的成果，或選擇執行方式繼續。
            </p>
            {/* Step-by-step only — auto-execution has been permanently removed */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => handleContinueToNextStep()}
                style={{
                  padding: "8px 18px", borderRadius: 8, border: "none",
                  background: "linear-gradient(135deg, #1A1A18, #2D2D28)",
                  color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 6,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                }}
              >
                繼續第 {awaitingStepInfo.nextStep} 步
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
              <span style={{ fontSize: 11, color: "#C8C7C3" }}>或直接輸入問題與此 Agent 繼續對話</span>
            </div>
          </div>
        )}

        {/* Loading card (streaming) — Perplexity-style thinking indicator */}
        {loading && !teamAssembly && (
          <div style={{
            background: "#FAFAF9",
            border: "1px solid #E4E3E1",
            borderRadius: 12,
            overflow: "hidden",
            maxWidth: 520,
          }}>
            {/* Agent header strip */}
            <div style={{
              padding: "8px 14px",
              borderBottom: "1px solid #F0EFEd",
              display: "flex", alignItems: "center", gap: 8,
              background: "#F5F5F3",
            }}>
              {/* Animated avatar */}
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                background: streamingAgentName ? "#0A6EFA" : "#1A1A18",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, color: "white", flexShrink: 0,
                boxShadow: "0 0 0 4px rgba(10,110,250,0.12)",
                animation: "pulse 2s ease-in-out infinite",
              }}>
                {streamingAgentName ? streamingAgentName.charAt(0) : "·"}
              </div>
              {streamingAgentName && (
                <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A18" }}>{streamingAgentName}</span>
              )}
              {streamingAgentTitle && (
                <span style={{ fontSize: 11, color: "#9B9990" }}>· {streamingAgentTitle}</span>
              )}
              {!streamingAgentName && (
                <span style={{ fontSize: 11, color: "#9B9990" }}>
                  {activeMissionId && (missionDataQuery.data as any)?.squadSlug
                    ? "A2A 交接中，準備下一位 Agent…"
                    : "分析任務中..."}
                </span>
              )}
              <button
                onClick={handleStop}
                style={{
                  marginLeft: "auto", fontSize: 10, color: "#9B9990",
                  background: "none", border: "1px solid #E4E3E1", borderRadius: 6,
                  padding: "2px 8px", cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 3,
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                </svg>
                停止
              </button>
            </div>
            <div style={{ padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
              {/* Typing dots */}
              <div style={{ display: "flex", gap: 3, paddingTop: 3, flexShrink: 0 }}>
                {[0, 160, 320].map((d) => (
                  <span key={d} style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: "#0A6EFA", display: "inline-block",
                    animation: `bounce 1.2s ${d}ms ease-in-out infinite`,
                  }} />
                ))}
              </div>
              <span style={{ fontSize: 12, color: "#6B6A66", fontStyle: "italic", lineHeight: 1.6 }}>
                {streamingThinking
                  ? streamingThinking.slice(0, 200) + (streamingThinking.length > 200 ? "…" : "")
                  : (!streamingAgentName && activeMissionId && (missionDataQuery.data as any)?.squadSlug)
                  ? "正在將成果交給下一位 Agent，請稍候…"
                  : "正在思考最佳策略..."}
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

        {/* Execution Thread removed — same content is already rendered upstream
            (TeamAssemblyPanel + chat-message relay steps), so the duplicate
            TypedThreadCard list below was redundant. */}

        {/* TaskProgressTracker */}
        {(a2aSteps.length > 0 || (loading && a2aSteps.length > 0)) && (
          <TaskProgressTracker taskName={a2aTaskName} steps={a2aSteps} progress={a2aProgress} onComplete={() => {}} />
        )}

        {isStopped && (
          <div style={{ fontSize: 11, color: "#C8C7C3", textAlign: "center", padding: "8px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="#C8C7C3">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
            </svg>
            已停止生成
          </div>
        )}

        {/* Layer 2: Pin to requirements — shown after each completed relay step */}
        {activeMissionId && relaySteps.filter(s => s.status === "done" && s.summary).map((step) => (
          <div key={`pin-${step.id}`} style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
            <button
              onClick={() => {
                const md = missionDataQuery.data as any;
                const existingObj = md?.objective ?? "";
                const snippet = step.summary!.length > 300 ? step.summary!.slice(0, 300) + "…" : step.summary!;
                const newObj = existingObj ? existingObj : snippet;
                updateMission.mutate({ id: activeMissionId, objective: newObj });
              }}
              title="儲存到任務需求"
              style={{
                background: "none", border: "1px solid #E4E3E1",
                borderRadius: 6, padding: "2px 8px",
                fontSize: 10, color: "#9B9990", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 3,
                fontFamily: "inherit",
                opacity: 0,
                transition: "opacity 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "0"; }}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
              </svg>
              更新需求
            </button>
          </div>
        ))}

        {/* ── Squad Completion Panel ── */}
        {squadStep.isComplete && activeMissionId && !loading && (
          <div style={{
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: 14,
            overflow: "hidden",
            animation: "slideInUp 0.35s cubic-bezier(0.16,1,0.3,1)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          }}>
            {/* Green success header bar */}
            <div style={{
              background: "linear-gradient(135deg, #059669 0%, #0A6EFA 100%)",
              padding: "14px 20px",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              {/* Checkmark icon */}
              <div style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: "rgba(255,255,255,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>Squad 執行完成</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 1 }}>
                  {squadStepProgress.length} 位 Agent · {squadStep.totalSteps - 1} 個步驟全部完成
                </div>
              </div>
              {/* Agent avatar row */}
              <div style={{ display: "flex", marginLeft: "auto" }}>
                {squadStepProgress.slice(0, 4).map((sp, i) => (
                  <div
                    key={i}
                    title={sp.agentName}
                    style={{
                      width: 26, height: 26, borderRadius: "50%",
                      background: ["#7C3AED", "#0A6EFA", "#059669", "#D97706"][i % 4],
                      border: "2px solid rgba(255,255,255,0.5)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700, color: "white",
                      marginLeft: i === 0 ? 0 : -8,
                      zIndex: 4 - i,
                      position: "relative",
                    }}
                  >
                    {sp.agentName?.charAt(0) ?? "A"}
                  </div>
                ))}
                {squadStepProgress.length > 4 && (
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: "rgba(255,255,255,0.25)",
                    border: "2px solid rgba(255,255,255,0.5)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 700, color: "white",
                    marginLeft: -8, position: "relative",
                  }}>
                    +{squadStepProgress.length - 4}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons grid */}
            <div style={{ padding: "14px 20px", display: "flex", flexWrap: "wrap", gap: 8 }}>
              {/* Copy all */}
              <button
                onClick={() => {
                  const allContent = active?.messages
                    .filter(m => m.role === "assistant" && m.squadStep !== undefined && m.content)
                    .map(m => `## ${m.squadStepLabel ?? m.agentName ?? "Agent"}\n\n${m.content}`)
                    .join("\n\n---\n\n") ?? "";
                  navigator.clipboard.writeText(allContent).then(() => alert("已複製到剪貼簿！"));
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 8, fontSize: 12,
                  background: "#F0FDF4", border: "1px solid #BBF7D0",
                  color: "#065F46", cursor: "pointer", fontFamily: "inherit",
                  fontWeight: 500, transition: "all 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#DCFCE7"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#F0FDF4"; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                複製全部成果
              </button>

              {/* Email */}
              {!emailDialogOpen && !emailSent && (
                <button
                  onClick={() => setEmailDialogOpen(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 14px", borderRadius: 8, fontSize: 12,
                    background: "#EFF6FF", border: "1px solid #BFDBFE",
                    color: "#1D4ED8", cursor: "pointer", fontFamily: "inherit",
                    fontWeight: 500, transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#DBEAFE"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#EFF6FF"; }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  Email 給我
                </button>
              )}
              {emailSent && (
                <span style={{
                  fontSize: 12, color: "#059669",
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "8px 14px", borderRadius: 8,
                  background: "#F0FDF4", border: "1px solid #BBF7D0",
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Email 已送出
                </span>
              )}

              {/* Save to Brain */}
              {activeBrand?.id && (
                <button
                  onClick={() => {
                    const allContent = active?.messages
                      .filter(m => m.role === "assistant" && m.squadStep !== undefined && m.content)
                      .map(m => `[${m.squadStepLabel ?? m.agentName}] ${m.content}`)
                      .join("\n\n") ?? "";
                    if (allContent) {
                      const token = localStorage.getItem("authToken");
                      fetch(`/api/brand-brain/${activeBrand.id}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({
                          category: "custom",
                          title: `Squad 完整成果 — ${new Date().toLocaleDateString("zh-TW")}`,
                          content: allContent.slice(0, 2000), sourceMissionId: activeMissionId,
                        }),
                      }).then(() => alert("成果已存入品牌大腦！")).catch(() => {});
                    }
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 14px", borderRadius: 8, fontSize: 12,
                    background: "#F5F3FF", border: "1px solid #DDD6FE",
                    color: "#6D28D9", cursor: "pointer", fontFamily: "inherit",
                    fontWeight: 500, transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#EDE9FE"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#F5F3FF"; }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.88A2.5 2.5 0 0 1 9.5 2Z"/>
                    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.88A2.5 2.5 0 0 0 14.5 2Z"/>
                  </svg>
                  存入品牌大腦
                </button>
              )}

              {/* Deep analysis */}
              <button
                onClick={() => setInput("我想針對某個環節深入分析，或調整方向重新執行")}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 8, fontSize: 12,
                  background: "transparent", border: "1px solid #E5E7EB",
                  color: "#6B7280", cursor: "pointer", fontFamily: "inherit",
                  fontWeight: 500, transition: "all 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F9FAFB"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                深入分析 / 調整方向
              </button>
            </div>

            {/* Email input dialog */}
            {emailDialogOpen && !emailSent && (
              <div style={{
                margin: "0 20px 16px",
                padding: "12px 14px",
                background: "#F8FAFF",
                borderRadius: 10,
                border: "1px solid #BFDBFE",
                animation: "slideInUp 0.2s ease",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: "#1D4ED8",
                  marginBottom: 8, textTransform: "uppercase" as const,
                  letterSpacing: "0.06em",
                }}>
                  將完整成果 Email 發送至
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    placeholder="your@email.com"
                    autoFocus
                    style={{
                      flex: 1, padding: "8px 12px", borderRadius: 7,
                      border: "1.5px solid #BFDBFE", fontSize: 13,
                      fontFamily: "inherit", outline: "none",
                      background: "#FFFFFF",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={e => { e.target.style.borderColor = "#3B82F6"; }}
                    onBlur={e => { e.target.style.borderColor = "#BFDBFE"; }}
                    onKeyDown={e => {
                      if (e.key === "Enter" && emailInput.includes("@")) {
                        e.preventDefault();
                        (e.currentTarget.nextElementSibling as HTMLButtonElement)?.click();
                      }
                      if (e.key === "Escape") setEmailDialogOpen(false);
                    }}
                  />
                  <button
                    disabled={!emailInput.includes("@") || emailSending}
                    onClick={async () => {
                      if (!emailInput.includes("@")) return;
                      setEmailSending(true);
                      const allContent = active?.messages
                        .filter(m => m.role === "assistant" && m.squadStep !== undefined && m.content)
                        .map(m => `## ${m.squadStepLabel ?? m.agentName ?? "Agent"}\n\n${m.content}`)
                        .join("\n\n---\n\n") ?? "";
                      const missionTitle = (missionDataQuery.data as any)?.title ?? "行銷任務";
                      const token = localStorage.getItem("authToken");
                      try {
                        const resp = await fetch("/api/chat/email-results", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({
                            recipientEmail: emailInput,
                            subject: `${activeBrand?.name ?? ""} ${missionTitle} — AI Squad 成果報告`,
                            content: allContent,
                            missionId: activeMissionId,
                          }),
                        });
                        if (resp.ok) { setEmailSent(true); setEmailDialogOpen(false); }
                        else { alert("發送失敗，請稍後再試"); }
                      } catch { alert("發送失敗，請稍後再試"); }
                      finally { setEmailSending(false); }
                    }}
                    style={{
                      padding: "8px 16px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                      background: emailInput.includes("@") && !emailSending ? "#1D4ED8" : "#E5E7EB",
                      color: emailInput.includes("@") && !emailSending ? "#FFFFFF" : "#9CA3AF",
                      border: "none",
                      cursor: emailInput.includes("@") && !emailSending ? "pointer" : "not-allowed",
                      fontFamily: "inherit",
                      display: "flex", alignItems: "center", gap: 5,
                      transition: "all 0.15s",
                      flexShrink: 0,
                    }}
                  >
                    {emailSending ? (
                      <>
                        <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                        發送中
                      </>
                    ) : "發送"}
                  </button>
                  <button
                    onClick={() => setEmailDialogOpen(false)}
                    style={{
                      background: "none", border: "none", color: "#9CA3AF",
                      cursor: "pointer", fontSize: 16, padding: "4px", lineHeight: 1,
                    }}
                    title="取消"
                  >×</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bottom anchor */}
        <div ref={bottomRef} />
      </div>

      {/* ── Input wrap ── */}
      <style>{`
        @keyframes chatInputSlideIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{
        flexShrink: 0,
        padding: "12px 20px 16px",
        borderTop: "1px solid #ECEAE8",
        background: "#FAFAF9",
        display: isShowingHomepage ? "none" : undefined,
        animation: !isShowingHomepage ? "chatInputSlideIn 0.3s ease" : undefined,
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

        {/* Layer 1: Requirements context indicator */}
        {activeMissionId && (() => {
          const md = missionDataQuery.data as any;
          const hasReqs = md && (md.objective || md.audience || md.successMetrics || md.constraints);
          const count = [md?.objective, md?.audience, md?.successMetrics, md?.constraints].filter(Boolean).length;
          if (!hasReqs) return null;
          return (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 10px 6px",
              fontSize: 10, color: "#059669",
            }}>
              <span style={{
                background: "#ECFDF5", border: "1px solid #BBF7D0",
                borderRadius: 10, padding: "1px 8px", fontWeight: 600,
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
                <span>任務需求已套用 ({count} 項)</span>
              </span>
            </div>
          );
        })()}

        {/* @mention autocomplete — rendered in portal-like fixed position */}
        <MentionAutocomplete
          visible={isMentioning && mentionAgents.length > 0}
          query={mentionQuery}
          agents={mentionAgents}
          anchorRect={mentionAnchorRect}
          onSelect={handleMentionSelect}
          onClose={() => setMentionAnchorRect(null)}
        />

        {/* Input box */}
        <div
          style={{
            background: "white",
            border: "1.5px solid #E4E3E1",
            borderRadius: 14,
            padding: "10px 12px 8px",
            display: "flex",
            alignItems: "flex-end",
            gap: 10,
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
          onFocusCapture={e => {
            const el = e.currentTarget as HTMLDivElement;
            el.style.borderColor = "#1A1A18";
            el.style.boxShadow = "0 0 0 4px rgba(26,26,24,0.06), 0 2px 8px rgba(0,0,0,0.06)";
          }}
          onBlurCapture={e => {
            const el = e.currentTarget as HTMLDivElement;
            el.style.borderColor = "#E4E3E1";
            el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)";
          }}
        >
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
            disabled={loading || isAtTurnLimit}
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
            disabled={!input.trim() || loading || isAtTurnLimit}
            style={{
              flexShrink: 0,
              width: 32, height: 32,
              borderRadius: 8,
              background: input.trim() && !loading && !isAtTurnLimit ? "#1A1A18" : "#E4E3E1",
              border: "none",
              color: input.trim() && !loading && !isAtTurnLimit ? "white" : "#9B9990",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: input.trim() && !loading && !isAtTurnLimit ? "pointer" : "default",
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

      {/* ── Custom Squad Save Dialog ── */}
      <CustomSquadDialog
        isOpen={customSquadDialogOpen}
        onClose={() => setCustomSquadDialogOpen(false)}
        currentSteps={(() => {
          // Prefer runtime progress (user-observed steps) enriched with DB step metadata
          if (squadStepProgress.length > 0) {
            return squadStepProgress.map((sp, i) => {
              // Try to match DB step by agentName or label to get description + agentSlug
              const dbStep = dbSquadSteps.find(
                (s: any) => s.agentName === sp.agentName || s.name === sp.label
              );
              return {
                order: i + 1,
                name: sp.label ?? sp.agentName ?? `Step ${i + 1}`,
                description: dbStep?.description ?? sp.agentTitle ?? undefined,
                assignedAgentName: sp.agentName,
                assignedAgentSlug: dbStep?.agentSlug ?? undefined,
              };
            });
          }
          // Fallback: use raw DB steps when squad hasn't started yet
          if (dbSquadSteps.length > 0) {
            return dbSquadSteps.map((s: any, i: number) => ({
              order: s.step ?? i + 1,
              name: s.name ?? `Step ${i + 1}`,
              description: s.description,
              assignedAgentName: s.agentName,
              assignedAgentSlug: s.agentSlug,
            }));
          }
          return [];
        })()}
        baseSquadName={
          (squadMembersQuery.data as any)?.squadName
          ?? (missionDataQuery.data as any)?.squadSlug?.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
          ?? ""
        }
        baseSquadDescription={(squadBySlugQuery.data as any)?.description ?? ""}
        brandId={(missionDataQuery.data as any)?.brandId ?? activeBrand?.id ?? null}
        missionId={activeMissionId}
      />
    </div>
  );
}
