/**
 * AppShell.tsx — v7 Layout Shell
 * Rail(48px) + Drawer(210px) + Main(flex:1) + RightPanel(264px)
 * All styles are inline, mirroring marketing-os-mockup-v7.html
 */
import React, { useState } from "react";
import { trpc } from "../lib/trpc";

// ─── SVG Icons ───────────────────────────────────────────────────────────────

const IconChat = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const IconTasks = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 11 12 14 22 4"/>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
  </svg>
);

const IconNotification = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

const IconKnowledge = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
);

const IconChevronDown = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

const IconChevronRight = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="9 6 15 12 9 18"/>
  </svg>
);

const IconPlus = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const IconExport = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

const IconTarget = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="6"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
);

const IconCredits = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#9B9990" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const IconArrowDown = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <polyline points="19 12 12 19 5 12"/>
  </svg>
);

const IconCheckDone = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const IconSpinner = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

const IconCircle = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/>
  </svg>
);

// ─── CreditsFooter ────────────────────────────────────────────────────────────

function CreditsFooter() {
  const { data } = trpc.credits.getBalance.useQuery();
  const total = data ? (data.planCredits + data.extraCredits - data.usedCredits) : null;
  const planTier = data?.planTier ?? "pro";
  const email = typeof window !== "undefined" ? (localStorage.getItem("userEmail") ?? "") : "";

  return (
    <div style={{
      marginTop: "auto",
      padding: "9px 12px",
      borderTop: "1px solid #E4E3E1",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          {email && (
            <div style={{ fontSize: 10, color: "#B0AFA9", marginBottom: 1, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {email}
            </div>
          )}
          <div style={{ fontSize: 10, color: "#9B9990", fontWeight: 500, textTransform: "capitalize" }}>
            {planTier}
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          background: "#F2F1EF", border: "1px solid #E4E3E1",
          borderRadius: 5, padding: "2px 7px",
        }}>
          <IconCredits />
          <span style={{ fontSize: 10, color: "#6B6A66", fontWeight: 500 }}>
            {total !== null ? total : "—"}
          </span>
          <span style={{ fontSize: 9, color: "#B0AFA9" }}>credits</span>
        </div>
      </div>
    </div>
  );
}

// ─── Rail ─────────────────────────────────────────────────────────────────────

function Rail({ activeTab, onTabChange }: { activeTab: string; onTabChange: (t: string) => void }) {
  const railStyle: React.CSSProperties = {
    width: 48, minWidth: 48,
    background: "#F2F1EF",
    borderRight: "1px solid #E4E3E1",
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "12px 0", gap: 2,
  };

  const logoStyle: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 7,
    background: "#1A1A18",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 12, fontWeight: 700, color: "#F9F9F8",
    marginBottom: 12, letterSpacing: "-0.5px",
    userSelect: "none",
  };

  const btnBase: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 7,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", background: "transparent", border: "none",
    transition: "all 0.15s", position: "relative",
  };

  const avatarStyle: React.CSSProperties = {
    width: 26, height: 26, borderRadius: "50%",
    background: "#D4D3D0",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 10, fontWeight: 600, color: "#4A4A45", cursor: "pointer",
  };

  const tabs = [
    { id: "chat",         icon: <IconChat />,         badge: false },
    { id: "tasks",        icon: <IconTasks />,        badge: true, badgeColor: "#E8631A" },
    { id: "notification", icon: <IconNotification />, badge: true, badgeColor: "#3D9A3D" },
    { id: "knowledge",    icon: <IconKnowledge />,    badge: false },
  ];

  return (
    <div style={railStyle}>
      <div style={logoStyle}>S</div>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          style={{
            ...btnBase,
            background: activeTab === tab.id ? "#E8E7E4" : "transparent",
            color: activeTab === tab.id ? "#1A1A18" : "#9B9990",
          }}
        >
          {tab.badge && (
            <div style={{
              position: "absolute", top: 5, right: 5,
              width: 6, height: 6, borderRadius: "50%",
              background: tab.badgeColor,
              border: "1.5px solid #F2F1EF",
            }} />
          )}
          {tab.icon}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <div style={avatarStyle}>C</div>
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

function Drawer() {
  const drawerStyle: React.CSSProperties = {
    width: 210, minWidth: 210,
    background: "#F2F1EF",
    borderRight: "1px solid #E4E3E1",
    display: "flex", flexDirection: "column",
    height: "100vh", overflow: "hidden",
  };

  const secLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: "#B0AFA9",
    textTransform: "uppercase", letterSpacing: "0.07em",
    padding: "8px 13px 3px",
  };

  return (
    <div style={drawerStyle}>
      {/* Header */}
      <div style={{ padding: "13px 10px 8px", display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{
          flex: 1, display: "flex", alignItems: "center", gap: 7,
          padding: "5px 8px", background: "#E8E7E4", borderRadius: 7,
          cursor: "pointer",
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: 4, background: "#1A1A18",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 700, color: "#F9F9F8", flexShrink: 0,
          }}>R</div>
          <span style={{ fontSize: 12, fontWeight: 500, color: "#1A1A18", flex: 1 }}>Rubi IP</span>
          <span style={{ color: "#9B9990", display: "flex", alignItems: "center" }}>
            <IconChevronDown />
          </span>
        </div>
        <button style={{
          width: 24, height: 24, borderRadius: 6, border: "none",
          background: "#E8E7E4", cursor: "pointer", color: "#6B6A66",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <IconPlus />
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={secLabel}>工作區</div>

        {/* Active workspace */}
        <div>
          <div style={{
            padding: "4px 9px", borderRadius: 6, margin: "1px 5px",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            background: "#FFFFFF",
          }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: "#5A9E5A" }} />
            <span style={{ fontSize: 9, color: "#C8C7C3" }}>▾</span>
            <span style={{ fontSize: 12, color: "#1A1A18", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              北美 YouTube 推廣
            </span>
          </div>
          {/* Conversations */}
          <div style={{ paddingLeft: 10, borderLeft: "1px solid #DEDDDA", margin: "2px 5px 2px 17px" }}>
            <div style={{
              padding: "3px 6px", borderRadius: 5, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5,
              background: "#FFFFFF",
            }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#E8631A", flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "#1A1A18", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                市場進入策略規劃
              </span>
              <span style={{ fontSize: 9, color: "#C8C7C3" }}>今天</span>
            </div>
            <div style={{ padding: "3px 6px", borderRadius: 5, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#DEDDDA", flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "#9B9990", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                競品分析 Cocomelon
              </span>
              <span style={{ fontSize: 9, color: "#C8C7C3" }}>昨天</span>
            </div>
            <div style={{ padding: "3px 6px", fontSize: 10, color: "#C8C7C3", cursor: "pointer" }}>+ 新對話</div>
          </div>
        </div>

        {/* Other workspaces */}
        <div style={{ padding: "4px 9px", borderRadius: 6, margin: "1px 5px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: "#C8973A" }} />
          <span style={{ fontSize: 9, color: "#C8C7C3" }}>▸</span>
          <span style={{ fontSize: 12, color: "#6B6A66", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>SEO 內容計畫</span>
        </div>
        <div style={{ padding: "4px 9px", borderRadius: 6, margin: "1px 5px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: "#C8C7C3" }} />
          <span style={{ fontSize: 9, color: "#C8C7C3" }}>▸</span>
          <span style={{ fontSize: 12, color: "#6B6A66", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>KOL 合作提案</span>
        </div>
        <div style={{ padding: "5px 12px", fontSize: 11, color: "#C8C7C3", cursor: "pointer" }}>+ 新增工作區</div>

        {/* Agents section */}
        <div style={{ ...secLabel, marginTop: 6 }}>本次 Agents</div>
        <div style={{ padding: "0 4px" }}>
          {[
            { initial: "A", name: "Alex Chen",  skill: "market-research",  statusColor: "#3D9A3D" },
            { initial: "M", name: "Mia Lin",    skill: "seo-optimizer",    statusColor: "#3D9A3D" },
            { initial: "R", name: "Ryan Wu",    skill: "content-strategy", statusColor: "#E8631A" },
          ].map(agent => (
            <div key={agent.name} style={{
              padding: "4px 8px", borderRadius: 6, margin: "1px 5px",
              display: "flex", alignItems: "center", gap: 7, cursor: "pointer",
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 5, background: "#D4D3D0",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, fontWeight: 700, color: "#4A4A45", flexShrink: 0,
              }}>{agent.initial}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "#4A4A45" }}>{agent.name}</div>
                <div style={{ fontSize: 9, color: "#9B9990" }}>{agent.skill}</div>
              </div>
              <div style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: agent.statusColor }} />
            </div>
          ))}
        </div>
      </div>

      <CreditsFooter />
    </div>
  );
}

// ─── RightPanel ───────────────────────────────────────────────────────────────

const WORKFLOW_NODES = [
  { label: "市場研究",  sub: "北美競品 + 市場規模", state: "done"    as const },
  { label: "SEO 分析",  sub: "關鍵字 + 頻道優化",   state: "done"    as const },
  { label: "內容策略",  sub: "90 天行事曆",          state: "running" as const },
  { label: "廣告規劃",  sub: "$9K/月預算分配",       state: "wait"    as const },
  { label: "PR 策略",   sub: "媒體 + KOL 佈局",      state: "wait"    as const },
];

function WorkflowNode({ label, sub, state }: { label: string; sub: string; state: "done" | "running" | "wait" }) {
  const colors = {
    done:    { border: "#C8E6C8", bg: "#F4FCF4", iconBg: "#DCEFDC", iconColor: "#3D9A3D", nameColor: "#3D9A3D" },
    running: { border: "#E4E3E1", bg: "#FAFAF9", iconBg: "#F2F1EF", iconColor: "#E8631A", nameColor: "#1A1A18" },
    wait:    { border: "#ECEAE8", bg: "#FFFFFF", iconBg: "#F2F1EF", iconColor: "#C8C7C3", nameColor: "#C8C7C3" },
  }[state];

  return (
    <div style={{
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: 8, padding: "7px 10px", marginBottom: 3,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{
          width: 17, height: 17, borderRadius: 4,
          background: colors.iconBg, color: colors.iconColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, flexShrink: 0,
        }}>
          {state === "done"    && <IconCheckDone />}
          {state === "running" && <IconSpinner />}
          {state === "wait"    && <IconCircle />}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color: colors.nameColor }}>{label}</div>
          <div style={{ fontSize: 10, color: "#B0AFA9", marginTop: 1 }}>{sub}</div>
        </div>
      </div>
    </div>
  );
}

function RightPanel() {
  const [activeTab, setActiveTab] = useState<"sop" | "knowledge" | "outputs">("sop");

  const panelStyle: React.CSSProperties = {
    width: 264, minWidth: 264,
    background: "#FAFAF9",
    borderLeft: "1px solid #E4E3E1",
    display: "flex", flexDirection: "column",
    overflow: "hidden",
  };

  const tabs = [
    { id: "sop"       as const, label: "流程" },
    { id: "knowledge" as const, label: "知識庫" },
    { id: "outputs"   as const, label: "成果" },
  ];

  return (
    <div style={panelStyle}>
      {/* Tabs */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid #E4E3E1",
        flexShrink: 0, padding: "0 4px",
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, padding: "9px 4px",
              textAlign: "center" as const,
              fontSize: 11, fontWeight: 500,
              color: activeTab === tab.id ? "#1A1A18" : "#9B9990",
              cursor: "pointer",
              borderBottom: `2px solid ${activeTab === tab.id ? "#1A1A18" : "transparent"}`,
              background: "transparent", border: "none",
              borderBottomStyle: "solid",
              borderBottomWidth: 2,
              borderBottomColor: activeTab === tab.id ? "#1A1A18" : "transparent",
              fontFamily: "inherit",
              transition: "all 0.12s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 10px" }}>
        {activeTab === "sop" && (
          <div style={{ marginBottom: 15 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: "#C8C7C3",
              textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 6,
            }}>SOP 執行流程</div>
            {WORKFLOW_NODES.map((node, i) => (
              <React.Fragment key={node.label}>
                <WorkflowNode {...node} />
                {i < WORKFLOW_NODES.length - 1 && (
                  <div style={{ textAlign: "center" as const, margin: "2px 0", color: "#E4E3E1", display: "flex", justifyContent: "center" }}>
                    <IconArrowDown />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {activeTab === "knowledge" && (
          <div>
            <div style={{
              fontSize: 10, fontWeight: 600, color: "#C8C7C3",
              textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 6,
            }}>品牌知識</div>
            {[
              { label: "品牌定位", val: "已設定" },
              { label: "目標受眾", val: "3-6 歲" },
              { label: "競品清單", val: "8 家" },
              { label: "目標市場", val: "北美" },
            ].map(item => (
              <div key={item.label} style={{
                padding: "4px 6px", borderRadius: 6,
                display: "flex", alignItems: "center", gap: 7, cursor: "pointer",
              }}>
                <span style={{ width: 16, textAlign: "center" as const, color: "#9B9990" }}>·</span>
                <span style={{ fontSize: 11, color: "#6B6A66", flex: 1 }}>{item.label}</span>
                <span style={{ fontSize: 10, color: "#C8C7C3" }}>{item.val}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "outputs" && (
          <div>
            <div style={{
              fontSize: 10, fontWeight: 600, color: "#C8C7C3",
              textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 6,
            }}>成果</div>
            {[
              { title: "市場研究報告", desc: "北美兒童 YouTube 市場分析", meta: "Alex · market-research" },
              { title: "SEO 關鍵字清單", desc: "Top 50，難度評分 + 縮圖建議", meta: "Mia · seo-optimizer" },
              { title: "90 天內容行事曆", desc: "生成中…", meta: "Ryan · content-strategy · 進行中", muted: true },
            ].map(item => (
              <div key={item.title} style={{
                background: "white", border: "1px solid #ECEAE8", borderRadius: 8,
                padding: "8px 10px", marginBottom: 4, cursor: "pointer",
                opacity: item.muted ? 0.45 : 1,
              }}>
                <div style={{ fontSize: 11, color: "#1A1A18", fontWeight: 500, marginBottom: 2 }}>{item.title}</div>
                <div style={{ fontSize: 10, color: "#9B9990", lineHeight: 1.5 }}>{item.desc}</div>
                <div style={{ fontSize: 10, color: "#C8C7C3", marginTop: 3 }}>{item.meta}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [railTab, setRailTab] = useState("chat");

  const shellStyle: React.CSSProperties = {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
    background: "#F9F9F8",
    color: "#1A1A18",
    height: "100vh",
    display: "flex",
    overflow: "hidden",
    fontSize: 13,
    lineHeight: "1.5",
  };

  const mainStyle: React.CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "#FFFFFF",
  };

  const topbarStyle: React.CSSProperties = {
    padding: "11px 20px",
    display: "flex", alignItems: "center", gap: 10,
    borderBottom: "1px solid #ECEAE8",
    flexShrink: 0, background: "#FFFFFF",
  };

  const missionBarStyle: React.CSSProperties = {
    padding: "10px 20px", background: "#FAFAF9",
    borderBottom: "1px solid #ECEAE8",
    flexShrink: 0,
    display: "flex", alignItems: "flex-start", gap: 10,
  };

  const btnGhost: React.CSSProperties = {
    padding: "4px 11px", borderRadius: 6, fontSize: 11, cursor: "pointer",
    fontFamily: "inherit", background: "transparent",
    border: "1px solid #E4E3E1", color: "#6B6A66",
    display: "flex", alignItems: "center", gap: 5,
  };

  const btnDark: React.CSSProperties = {
    padding: "4px 11px", borderRadius: 6, fontSize: 11, cursor: "pointer",
    fontFamily: "inherit", background: "#1A1A18",
    border: "none", color: "#F9F9F8", fontWeight: 500,
    display: "flex", alignItems: "center", gap: 5,
  };

  const tagStyle: React.CSSProperties = {
    padding: "2px 8px", borderRadius: 20, fontSize: 10,
    background: "#F2F1EF", color: "#6B6A66", border: "1px solid #E4E3E1",
    display: "flex", alignItems: "center", gap: 4,
  };

  const tagAccentStyle: React.CSSProperties = {
    ...tagStyle,
    background: "#FFF5EE", color: "#E8631A", border: "1px solid #F5C9A8",
  };

  return (
    <div style={shellStyle}>
      <Rail activeTab={railTab} onTabChange={setRailTab} />
      <Drawer />

      {/* Main */}
      <main style={mainStyle}>
        {/* Topbar */}
        <div style={topbarStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#9B9990" }}>
            <span>Rubi IP</span>
            <span style={{ color: "#D4D3D0" }}>/</span>
            <span>北美 YouTube 推廣</span>
            <span style={{ color: "#D4D3D0" }}>/</span>
            <span style={{ color: "#1A1A18", fontWeight: 500 }}>市場進入策略規劃</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
            <button style={btnGhost}>
              <IconExport />
              匯出
            </button>
            <button style={btnDark}>
              <IconPlus />
              新任務
            </button>
          </div>
        </div>

        {/* Mission Bar */}
        <div style={missionBarStyle}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: "#F2F1EF", border: "1px solid #E4E3E1",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, color: "#6B6A66",
          }}>
            <IconTarget />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1A18" }}>
              建立 Rubi IP 英語 YouTube 頻道，90 天達成 5,000 訂閱
            </div>
            <div style={{ fontSize: 11, color: "#9B9990", marginTop: 1 }}>
              北美市場進入計畫 · 5 Agents 協作執行
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" as const }}>
              <span style={tagAccentStyle}>北美</span>
              <span style={tagStyle}>3-6 歲</span>
              <span style={tagStyle}>YouTube</span>
              <span style={tagStyle}>90 天</span>
            </div>
          </div>
        </div>

        {/* Children slot (chat/content area) */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      </main>

      <RightPanel />
    </div>
  );
}
