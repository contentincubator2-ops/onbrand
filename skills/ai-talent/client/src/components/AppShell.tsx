/**
 * AppShell.tsx — v7 Layout Shell
 * Rail(48px) + Drawer(210px) + Main(flex:1) + RightPanel(264px)
 * All styles are inline, mirroring marketing-os-mockup-v7.html
 */
import React, { useState, useEffect } from "react";
import { trpc } from "../lib/trpc";
import { MissionModal } from "./MissionModal";
import type { SquadOption } from '../data/taskSquads';
import { WORKSPACE_SQUADS, findSquadBySlug } from '../data/taskSquads';

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

// Claude-style: folder with a plus — new workspace
const IconFolder = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
  </svg>
);

// Claude-style: pencil/compose — new mission
const IconCompose = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
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


const IconPackage = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

const IconSettings = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
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

function Rail({ activeTab, onTabChange, notifCount }: {
  activeTab: string;
  onTabChange: (t: string) => void;
  notifCount: number;
}) {
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
    { id: "tasks",        icon: <IconTasks />,        badge: false, label: "任務" },
    { id: "chat",         icon: <IconChat />,         badge: false, label: "對話" },
    { id: "outputs",      icon: <IconPackage />,      badge: false, label: "產出" },
    { id: "settings",     icon: <IconSettings />,     badge: false, label: "設定" },
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
              background: (tab as any).badgeColor ?? '#3D9A3D',
              border: "1.5px solid #F2F1EF",
            }} />
          )}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            {tab.icon}
            <span style={{ fontSize: 8, color: "inherit", lineHeight: 1 }}>{tab.label}</span>
          </div>
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <div style={avatarStyle}>C</div>
    </div>
  );
}

// ─── ResourceStats ────────────────────────────────────────────────────────────
// Model name 美化對照表
const MODEL_DISPLAY: Record<string, string> = {
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-3.5-turbo': 'GPT-3.5',
  'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
  'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
  'claude-3-haiku-20240307': 'Claude 3 Haiku',
  'claude-3-opus-20240229': 'Claude 3 Opus',
  'gemini-pro': 'Gemini Pro',
  'gemini-1.5-pro': 'Gemini 1.5 Pro',
};
function fmtModel(m: string): string {
  return MODEL_DISPLAY[m] ?? m.split('/').pop()?.replace(/-/g, ' ').replace(/\w/g, c => c.toUpperCase()) ?? m;
}

function ResourceStats({ resourceData, isLoading }: { resourceData: any; isLoading: boolean }) {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const skillChips: string[]    = (resourceData?.skillList   ?? []).slice(0, 20);
  const modelChips: string[]    = (resourceData?.providerList ?? []).map((m: string) => fmtModel(m));
  const agentDesc: string | null = resourceData?.agents != null
    ? `${resourceData.agents.toLocaleString()} 位專業行銷 Agent 待命中`
    : null;

  const items = [
    { key: 'agents',    label: 'Agents',    value: resourceData?.agents,    chips: [] as string[],  detail: agentDesc },
    { key: 'skills',    label: 'Skills',    value: resourceData?.skills,    chips: skillChips,       detail: null },
    { key: 'providers', label: 'AI Models', value: resourceData?.providers, chips: modelChips,       detail: null },
  ];

  return (
    <div>
      {items.map(item => {
        const hasDetail = item.chips.length > 0 || !!item.detail;
        const isOpen = expanded === item.key;
        return (
          <div key={item.key}>
            <div
              onClick={() => hasDetail && setExpanded(isOpen ? null : item.key)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '4px 6px', borderRadius: 5,
                cursor: hasDetail ? 'pointer' : 'default',
                background: isOpen ? '#ECEAE8' : 'transparent',
              }}
            >
              <span style={{ fontSize: 11, color: '#6B6A66' }}>{item.label}</span>
              <span style={{
                fontSize: 11, fontWeight: 600, color: '#1A1A18',
                background: '#F2F1EF', border: '1px solid #E4E3E1',
                borderRadius: 4, padding: '1px 7px', minWidth: 28, textAlign: 'center',
              }}>
                {/* Show value if available; fall back to loading only when truly no data */}
                {item.value != null ? Number(item.value).toLocaleString() : (isLoading ? '…' : '—')}
              </span>
            </div>

            {isOpen && hasDetail && (
              <div style={{
                margin: '2px 4px 6px', padding: '6px 8px',
                background: '#FFFFFF', border: '1px solid #E4E3E1', borderRadius: 6,
              }}>
                {item.chips.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {item.chips.map((chip, i) => (
                      <span key={i} style={{
                        fontSize: 9, padding: '2px 6px',
                        background: '#F2F1EF', border: '1px solid #E4E3E1',
                        borderRadius: 10, color: '#6B6A66', whiteSpace: 'nowrap',
                      }}>{chip}</span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: '#6B6A66', lineHeight: 1.5 }}>{item.detail}</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── WorkspaceMissions ────────────────────────────────────────────────────────

function WorkspaceMissions({
  wsKey,
  brandId,
  activeMissionId,
  onMissionSelect,
  onNewTask,
}: {
  wsKey: string;
  brandId: number | null;
  activeMissionId?: number | null;
  onMissionSelect?: (missionId: number) => void;
  onNewTask?: (wsKey: string) => void;
}) {
  const { data: missions, isLoading, refetch: refetchMissions } = trpc.mission.list.useQuery(
    { workspace: wsKey, brandId: brandId ?? undefined },
    { enabled: !!brandId, refetchOnWindowFocus: false }
  );
  const [hoveredMission, setHoveredMission] = useState<number | null>(null);
  const deleteMission = trpc.mission.delete.useMutation({
    onSuccess: () => { refetchMissions(); },
  });

  return (
    <div style={{ paddingLeft: 10, borderLeft: "1px solid #DEDDDA", margin: "2px 5px 2px 17px" }}>
      {isLoading && (
        <div style={{ padding: "3px 6px", fontSize: 10, color: "#C8C7C3" }}>載入中…</div>
      )}
      {(missions ?? []).map((mission: any) => (
        <div
          key={mission.id}
          onMouseEnter={() => setHoveredMission(mission.id)}
          onMouseLeave={() => setHoveredMission(null)}
          style={{
            padding: "3px 6px", borderRadius: 5, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5,
            background: activeMissionId === mission.id ? "#FFFFFF" : "transparent",
          }}
        >
          <div style={{
            width: 4, height: 4, borderRadius: "50%",
            background: activeMissionId === mission.id ? "#E8631A" : "#DEDDDA",
            flexShrink: 0,
          }} />
          <span
            onClick={() => onMissionSelect?.(mission.id)}
            style={{
              fontSize: 11,
              color: activeMissionId === mission.id ? "#1A1A18" : "#9B9990",
              fontWeight: activeMissionId === mission.id ? 500 : 400,
              flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {mission.title?.length > 20 ? mission.title.slice(0, 20) + "…" : mission.title}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm("刪除此任務？")) {
                deleteMission.mutate({ id: mission.id });
              }
            }}
            style={{
              opacity: hoveredMission === mission.id ? 1 : 0,
              background: "none", border: "none",
              color: "#C8C7C3", cursor: "pointer",
              fontSize: 12, padding: "0 3px",
              transition: "opacity 0.1s",
              flexShrink: 0,
            }}
            title="刪除任務"
          >×</button>
        </div>
      ))}
    </div>
  );
}


// ─── RecentMissions ───────────────────────────────────────────────────────────

function RecentMissions({
  brandId,
  activeMissionId,
  onMissionSelect,
  onNewImpromptu,
  workspaces,
}: {
  brandId: number | null;
  activeMissionId?: number | null;
  onMissionSelect?: (missionId: number) => void;
  onNewImpromptu?: () => void;
  workspaces: any[];
}) {
  const queryResult = (trpc as any).mission?.listUncategorized?.useQuery
    ? (trpc as any).mission.listUncategorized.useQuery(
        { brandId: brandId ?? undefined },
        { enabled: !!brandId, refetchOnWindowFocus: false }
      )
    : { data: [], refetch: () => {} };
  const missions = queryResult.data;
  const refetch = queryResult.refetch;

  const renameMutation = (trpc as any).mission?.rename?.useMutation
    ? (trpc as any).mission.rename.useMutation({ onSuccess: () => refetch() })
    : { mutate: () => {} };

  const moveMutation = (trpc as any).mission?.move?.useMutation
    ? (trpc as any).mission.move.useMutation({ onSuccess: () => refetch() })
    : { mutate: () => {} };

  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [moveMenuId, setMoveMenuId] = React.useState<number | null>(null);
  const [hoveredId, setHoveredId] = React.useState<number | null>(null);

  const missionList = (missions ?? []) as any[];
  if (!brandId) return null;

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#B0AFA9', textTransform: 'uppercase' as const, letterSpacing: '0.07em', padding: '8px 13px 3px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 8 }}>
        <span>即興任務</span>
        <button
          onClick={onNewImpromptu}
          title="開始即興任務"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B9990', display: 'flex', alignItems: 'center', padding: '1px 3px', borderRadius: 4 }}
        >
          <IconCompose />
        </button>
      </div>
      {missionList.length === 0 && (
        <div
          onClick={onNewImpromptu}
          style={{ padding: '4px 13px 8px', fontSize: 11, color: '#E8631A', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontWeight: 500 }}
        >
          <IconCompose /> 開始即興任務
        </div>
      )}
      {missionList.map((m: any) => (
        <div
          key={m.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('missionId', String(m.id));
            e.dataTransfer.effectAllowed = 'move';
          }}
          onMouseEnter={() => setHoveredId(m.id)}
          onMouseLeave={() => setHoveredId(null)}
          style={{ position: 'relative', margin: '1px 5px', cursor: 'grab' }}
        >
          {editingId === m.id ? (
            <input
              autoFocus
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={() => {
                if (editTitle.trim()) renameMutation.mutate({ id: m.id, title: editTitle.trim() });
                setEditingId(null);
              }}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') {
                  if (editTitle.trim()) renameMutation.mutate({ id: m.id, title: editTitle.trim() });
                  setEditingId(null);
                }
                if (e.key === 'Escape') setEditingId(null);
              }}
              style={{
                width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 5,
                border: '1px solid #E8631A', background: 'white', outline: 'none',
                color: '#1A1A18', boxSizing: 'border-box' as const,
              }}
            />
          ) : (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 6px', borderRadius: 5, cursor: 'pointer',
                background: activeMissionId === m.id ? '#FFFFFF' : 'transparent',
              }}
            >
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: activeMissionId === m.id ? '#E8631A' : '#DEDDDA', flexShrink: 0 }} />
              <span
                onClick={() => onMissionSelect?.(m.id)}
                style={{
                  fontSize: 11, flex: 1,
                  color: activeMissionId === m.id ? '#1A1A18' : '#4A4A45',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {m.title?.length > 22 ? m.title.slice(0, 22) + '\u2026' : m.title}
              </span>
              {hoveredId === m.id && (
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button
                    onClick={() => { setEditingId(m.id); setEditTitle(m.title); }}
                    title="\u7de8\u8f2f\u6a19\u984c"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B9990', fontSize: 10, padding: '0 2px' }}
                  >{'\u270e'}</button>
                  <button
                    onClick={() => setMoveMenuId(moveMenuId === m.id ? null : m.id)}
                    title="\u642c\u79fb\u5230\u5de5\u4f5c\u5340"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B9990', fontSize: 10, padding: '0 2px' }}
                  >{'\u2192'}</button>
                </div>
              )}
              {moveMenuId === m.id && (
                <div style={{
                  position: 'absolute', right: 0, top: '100%', zIndex: 200,
                  background: 'white', border: '1px solid #E4E3E1', borderRadius: 7,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)', minWidth: 130, overflow: 'hidden',
                }}>
                  {workspaces.map((ws: any) => (
                    <div
                      key={ws.wsKey}
                      onClick={() => { moveMutation.mutate({ id: m.id, workspace: ws.wsKey }); setMoveMenuId(null); }}
                      style={{ padding: '7px 12px', fontSize: 11, cursor: 'pointer', color: '#1A1A18' }}
                    >
                      {ws.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

function Drawer({
  onMissionSelect,
  onNewTask,
  activeMissionId,
  onNewMission,
  onNewWorkspace,
}: {
  onMissionSelect?: (missionId: number) => void;
  onNewTask?: (wsKey: string) => void;
  activeMissionId?: number | null;
  onNewMission?: () => void;
  onNewWorkspace?: () => void;
}) {
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

  // Brand data
  const { data: brands, isLoading: brandsLoading, refetch: refetchBrands } = trpc.brand.listByMember.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );
  const [selectedBrandIdx, setSelectedBrandIdx] = useState(0);
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false);
  const deleteBrand = trpc.brand.delete.useMutation({
    onSuccess: () => { refetchBrands(); setBrandDropdownOpen(false); },
  });
  const brandList = (brands as any[]) ?? [];
  const selectedBrand = brandList[selectedBrandIdx] ?? null;
  const selectedBrandId: number | null = selectedBrand?.id ?? null;

  // Workspace data
  const { data: workspaces, isLoading: wsLoading } = trpc.workspace.list.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );
  const wsList = (workspaces as any[]) ?? [];
  const [expandedWs, setExpandedWs] = useState<Record<string, boolean>>({});
  const [activeWsKey, setActiveWsKey] = useState<string>('strategy');

  // Database-level resource summary (fallback when no active mission) — show ALL agents/skills/models
  const resourceQuery = (trpc as any).resource?.summary?.useQuery
    ? (trpc as any).resource.summary.useQuery({ workspace: "global" }, { refetchOnWindowFocus: false, staleTime: 0 })
    : { data: null, isLoading: false };

  // Mission-level semantic resource summary (polls until ready)
  // Use direct typed call (not conditional) so React Query properly re-fetches on missionId change
  const missionResourceQuery = trpc.resource.summaryByMission.useQuery(
    { missionId: activeMissionId ?? 0 },
    {
      enabled: !!activeMissionId,
      refetchInterval: (query: any) => {
        const status = (query.state.data as any)?.status;
        return status === 'ready' || status === 'error' ? false : 2000;
      },
      refetchOnWindowFocus: false,
    }
  );

  const missionResource = activeMissionId ? missionResourceQuery.data : null;
  const isMissionPending = !!activeMissionId && (!missionResource || (missionResource as any)?.status === 'pending');
  // When mission ready → show mission-specific counts; otherwise always show global counts
  const effectiveResourceData = (missionResource as any)?.status === 'ready' ? missionResource : resourceQuery.data;
  // Only show "..." when global data itself is loading — not while mission is pending
  const effectiveResourceLoading = resourceQuery.isLoading;

  // Trigger semantic computation for existing missions that have no computed resources yet
  const triggerCompute = trpc.resource.triggerCompute.useMutation();
  React.useEffect(() => {
    if (activeMissionId && isMissionPending) {
      triggerCompute.mutate({ missionId: activeMissionId });
    }
  }, [activeMissionId]);

  const toggleWs = (key: string) => {
    setExpandedWs(prev => ({ ...prev, [key]: !prev[key] }));
    setActiveWsKey(key);
  };

  // 即興任務：直接建立，不開 modal
  const utils = trpc.useUtils();
  const createImpromptu = trpc.mission.create.useMutation({
    onSuccess: (data) => {
      utils.mission.listUncategorized.invalidate();
      onMissionSelect?.(data.id);
    },
  });
  const handleNewImpromptu = () => {
    createImpromptu.mutate({
      workspace: "",
      brandId: selectedBrandId ?? undefined,
      title: "新對話",
    });
  };

  // 拖曳移動：即興任務 → 工作區
  const [dragOverWs, setDragOverWs] = useState<string | null>(null);
  const moveMission = (trpc as any).mission?.move?.useMutation
    ? (trpc as any).mission.move.useMutation({
        onSuccess: () => {
          utils.mission.listUncategorized.invalidate();
          utils.mission.list.invalidate();
        },
      })
    : { mutate: () => {} };

  return (
    <div style={drawerStyle}>
      {/* Brand Switcher Header */}
      <div style={{ padding: "13px 10px 8px", position: "relative" }}>
        {brandsLoading ? (
          <div style={{ padding: "5px 8px", fontSize: 11, color: "#9B9990" }}>載入品牌中…</div>
        ) : brandList.length === 0 ? (
          <button
            onClick={() => { window.location.href = "/onboarding"; }}
            style={{
              width: "100%", padding: "7px 10px", borderRadius: 7,
              background: "#E8631A", border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 600, color: "white",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}
          >
            <IconPlus /> 建立品牌
          </button>
        ) : (
          <div style={{ position: "relative" }}>
            <div
              onClick={() => setBrandDropdownOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "5px 8px", background: "#E8E7E4", borderRadius: 7,
                cursor: "pointer",
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: 4, background: "#1A1A18",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 700, color: "#F9F9F8", flexShrink: 0,
              }}>
                {(selectedBrand?.name ?? "?").charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, color: "#1A1A18", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedBrand?.name ?? "選擇品牌"}
              </span>
              <span style={{ color: "#9B9990", display: "flex", alignItems: "center" }}>
                <IconChevronDown />
              </span>
            </div>
            {brandDropdownOpen && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                background: "white", border: "1px solid #E4E3E1", borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)", marginTop: 4, overflow: "hidden",
              }}>
                {brandList.map((brand: any, idx: number) => (
                  <div
                    key={brand.id}
                    style={{
                      padding: "8px 12px", cursor: "pointer", fontSize: 12,
                      color: idx === selectedBrandIdx ? "#E8631A" : "#1A1A18",
                      background: idx === selectedBrandIdx ? "#FFF5EE" : "white",
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <div
                      onClick={() => { setSelectedBrandIdx(idx); setBrandDropdownOpen(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: 3, background: "#1A1A18",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 8, fontWeight: 700, color: "#F9F9F8", flexShrink: 0,
                      }}>
                        {brand.name.charAt(0).toUpperCase()}
                      </div>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {brand.name}
                      </span>
                      {idx === selectedBrandIdx && <span style={{ marginLeft: "auto", color: "#E8631A", flexShrink: 0 }}>✓</span>}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`確定刪除品牌「${brand.name}」？`)) {
                          deleteBrand.mutate({ id: brand.id });
                        }
                      }}
                      style={{
                        background: "none", border: "none",
                        color: "#C8C7C3", cursor: "pointer",
                        fontSize: 14, padding: "0 2px",
                        flexShrink: 0, lineHeight: 1,
                      }}
                      title="刪除品牌"
                    >×</button>
                  </div>
                ))}
                <div
                  onClick={() => { window.location.href = "/onboarding"; setBrandDropdownOpen(false); }}
                  style={{ padding: "8px 12px", cursor: "pointer", fontSize: 11, color: "#9B9990", borderTop: "1px solid #F2F1EF", display: "flex", alignItems: "center", gap: 5 }}
                >
                  <IconPlus /> 建立新品牌
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* 即興任務 section — above workspaces */}
        <RecentMissions
          brandId={selectedBrandId}
          activeMissionId={activeMissionId}
          onMissionSelect={onMissionSelect}
          onNewImpromptu={handleNewImpromptu}
          workspaces={wsList}
        />

        <div style={{ margin: "4px 10px", borderTop: "1px solid #E4E3E1" }} />

        {/* Workspaces header row */}
        <div style={{ ...secLabel, display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 8 }}>
          <span>工作區</span>
          <button
            onClick={onNewWorkspace}
            title="新增工作區"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9990", display: "flex", alignItems: "center", padding: "1px 3px", borderRadius: 4 }}
          >
            <IconFolder />
          </button>
        </div>

        {wsLoading && (
          <div style={{ padding: "5px 13px", fontSize: 11, color: "#9B9990" }}>載入中…</div>
        )}

        {wsList.map((ws: any) => {
          const isExpanded = expandedWs[ws.wsKey] !== false; // default expanded
          const isDragTarget = dragOverWs === ws.wsKey;
          return (
            <div key={ws.wsKey}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverWs(ws.wsKey); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverWs(null); }}
              onDrop={(e) => {
                e.preventDefault();
                const missionId = Number(e.dataTransfer.getData('missionId'));
                if (missionId) moveMission.mutate({ id: missionId, workspace: ws.wsKey });
                setDragOverWs(null);
              }}
            >
              <div
                style={{
                  padding: "4px 9px", borderRadius: 6, margin: "1px 5px",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                  background: isDragTarget ? "#EAF4EA" : "transparent",
                  border: isDragTarget ? "1px dashed #5A9E5A" : "1px solid transparent",
                  transition: "background 0.1s, border 0.1s",
                }}
              >
                <div style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: "#5A9E5A" }} />
                <span
                  onClick={() => toggleWs(ws.wsKey)}
                  style={{ fontSize: 9, color: "#C8C7C3" }}
                >
                  {isExpanded ? "▾" : "▸"}
                </span>
                <span
                  onClick={() => toggleWs(ws.wsKey)}
                  style={{ fontSize: 12, color: "#1A1A18", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {ws.label}
                </span>
              </div>
              {isExpanded && (
                <WorkspaceMissions
                  wsKey={ws.wsKey}
                  brandId={selectedBrandId}
                  activeMissionId={activeMissionId}
                  onMissionSelect={onMissionSelect}
                  onNewTask={onNewTask}
                />
              )}
            </div>
          );
        })}

        {/* Fallback if no workspaces loaded yet */}
        {!wsLoading && wsList.length === 0 && (
          <div style={{ padding: "5px 13px", fontSize: 11, color: "#C8C7C3" }}>
            暫無工作區
          </div>
        )}

        {/* 新任務 button — left-aligned with mission items (WorkspaceMissions margin 17px + paddingLeft 10px = 27px) */}
        <div style={{ padding: "4px 8px 6px 27px" }}>
          <button
            onClick={onNewMission}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 6,
              background: "none", border: "1px dashed #DEDDDA", borderRadius: 6,
              padding: "5px 10px", cursor: "pointer", color: "#9B9990", fontSize: 11,
              fontFamily: "inherit",
            }}
          >
            <IconCompose />
            新任務
          </button>
        </div>

      </div>

      {/* 可用資源 — 固定在 drawer 底部 */}
      <div style={{ borderTop: "1px solid #E4E3E1", flexShrink: 0 }}>
        <div style={{ ...secLabel, display: "flex", alignItems: "center", gap: 5, marginTop: 0 }}>
          <span>可用資源</span>
          {isMissionPending && (
            <span style={{ fontSize: 9, color: "#9B9990", fontWeight: 400, letterSpacing: 0 }}>⚙ 配對中…</span>
          )}
        </div>
        <div style={{ padding: "0 10px 6px" }}>
          <ResourceStats resourceData={effectiveResourceData} isLoading={effectiveResourceLoading} />
        </div>
      </div>

      <CreditsFooter />
    </div>
  );
}

// ─── RightPanel ───────────────────────────────────────────────────────────────

// WORKFLOW_NODES 硬編碼已移除

function PositioningProgress({ missionId, brandId }: { missionId: number | null | undefined; brandId: number | null | undefined }) {
  const { data: steps } = (trpc as any).positioning?.getSteps?.useQuery
    ? (trpc as any).positioning.getSteps.useQuery(
        { missionId: missionId! },
        { enabled: !!missionId, refetchInterval: 3000, refetchOnWindowFocus: false }
      )
    : { data: null };

  // 沒有 DB 資料時顯示空白等待狀態，不顯示假資料
  const stepList = (steps ?? []) as any[];

  // 找出當前進行中的步驟（running 或 confirm 狀態）
  const activeStep = stepList.find((s: any) => s.state === 'running' || s.state === 'confirm');

  // 空狀態：尚未開始任何步驟
  if (stepList.length === 0) {
    return (
      <div style={{ padding: '12px 0' }}>
        <div style={{
          padding: '10px 12px', borderRadius: 8,
          background: '#FAFAF9', border: '1px solid #E7E5E4',
          fontSize: 11, color: '#A8A29E', textAlign: 'center' as const,
        }}>
          <div style={{ fontSize: 16, marginBottom: 4 }}>⏳</div>
          <div>開始對話後</div>
          <div>步驟進度會顯示在這裡</div>
        </div>
        <div style={{
          marginTop: 10, padding: '7px 10px',
          background: '#FFF8F5', border: '1px solid #FDDCCC',
          borderRadius: 7,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%',
              background: '#E8631A', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 700, flexShrink: 0,
            }}>品</div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#44403C' }}>劉品妤 · Squad Lead</div>
              <div style={{ fontSize: 9, color: '#A8A29E' }}>每步自動 QA 品質控管</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {stepList.map((s: any, i: number) => (
        <React.Fragment key={i}>
          <WorkflowNode
            label={s.title ?? s.label ?? ''}
            sub={s.agent ? `${s.agent} · ${s.description ?? s.sub ?? ''}` : s.description ?? s.sub ?? ''}
            state={s.state === 'confirm' ? 'running' : (s.state as any ?? 'wait')}
          />
          {i < stepList.length - 1 && (
            <div style={{ textAlign: 'center' as const, margin: '2px 0', color: '#E4E3E1', display: 'flex', justifyContent: 'center' }}>
              <IconArrowDown />
            </div>
          )}
        </React.Fragment>
      ))}

      {/* ── 當前步驟狀態說明 ── */}
      {activeStep && (
        <div style={{
          marginTop: 12, padding: '8px 10px',
          background: activeStep.state === 'confirm' ? '#F0FDF8' : '#FAFAF9',
          border: `1px solid ${activeStep.state === 'confirm' ? '#1DBEAA' : '#E7E5E4'}`,
          borderRadius: 8,
        }}>
          {activeStep.state === 'confirm' ? (
            <div style={{ fontSize: 10, color: '#1DBEAA', fontWeight: 600 }}>
              ✦ 劉品妤已完成 QA 審核
              <div style={{ fontSize: 10, color: '#78716C', fontWeight: 400, marginTop: 3 }}>
                請在對話視窗確認成果，說「繼續」推進下一步
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 10, color: '#78716C' }}>
              <span style={{ color: '#F97316' }}>⟳</span> {activeStep.agent || '分析中'}...
            </div>
          )}
        </div>
      )}

      {/* Squad Lead 說明 */}
      <div style={{
        marginTop: 10, padding: '7px 10px',
        background: '#FFF8F5', border: '1px solid #FDDCCC',
        borderRadius: 7,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 18, height: 18, borderRadius: '50%',
            background: '#E8631A', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 700, flexShrink: 0,
          }}>品</div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#44403C' }}>劉品妤 · Squad Lead</div>
            <div style={{ fontSize: 9, color: '#A8A29E' }}>每步自動 QA 品質控管</div>
          </div>
        </div>
      </div>
    </div>
  );
}

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


// ─── BrandBrainTab ────────────────────────────────────────────────────────────

function BrandBrainTab({ brandId }: { brandId?: number | null }) {
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [addingNew, setAddingNew] = React.useState(false);

  // Fetch brand brain data from API
  const brandBrainQuery = (trpc as any).brandBrain?.list?.useQuery
    ? (trpc as any).brandBrain.list.useQuery(
        { brandId: brandId! },
        { enabled: !!brandId, refetchOnWindowFocus: false }
      )
    : { data: null, isLoading: false };

  const brandBrainItems = brandBrainQuery.data ?? [];

  // Default items to show when no real data
  const defaultItems = [
    { key: "品牌定位", updatedAt: null, content: null },
    { key: "目標受眾", updatedAt: null, content: null },
    { key: "品牌語調", updatedAt: null, content: null },
    { key: "競品地圖", updatedAt: null, content: null },
  ];

  const items = brandBrainItems.length > 0 ? brandBrainItems : defaultItems;

  const fmtDate = (d: string | null) => {
    if (!d) return "未建立";
    try {
      const dt = new Date(d);
      return ;
    } catch { return d; }
  };

  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 600, color: "#C8C7C3",
        textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 10,
      }}>🧠 品牌大腦</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {items.map((item: any) => {
          const key = item.key ?? item.category ?? "未知";
          const date = item.updatedAt ?? item.updated_at ?? null;
          const isExpanded = expanded === key;
          const hasContent = !!(item.content ?? item.value);
          return (
            <div key={key}>
              <div
                onClick={() => setExpanded(isExpanded ? null : key)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 8px", borderRadius: 7, cursor: "pointer",
                  background: isExpanded ? "#F0EEF9" : "white",
                  border: "1px solid #ECEAE8",
                  transition: "all 0.12s",
                }}
              >
                <span style={{ fontSize: 11, color: "#1A1A18", flex: 1, fontWeight: 500 }}>{key}</span>
                <span style={{
                  fontSize: 9, color: date ? "#3D9A3D" : "#C8C7C3",
                  background: date ? "#F0FDF4" : "#F2F1EF",
                  border: '1px solid ' + (date ? '#C8E6C8' : '#E4E3E1'),
                  borderRadius: 4, padding: "1px 6px", flexShrink: 0,
                }}>
                  {fmtDate(date)}
                </span>
                <span style={{ fontSize: 9, color: "#9B9990" }}>{isExpanded ? "▲" : "▼"}</span>
              </div>
              {isExpanded && (
                <div style={{
                  margin: "2px 0 4px", padding: "8px 10px",
                  background: "#F8F8FF", border: "1px solid #E0DEF5",
                  borderRadius: 7, fontSize: 11, color: "#4A4A45", lineHeight: 1.6,
                }}>
                  {hasContent
                    ? (item.content ?? item.value)
                    : <span style={{ color: "#C8C7C3", fontStyle: "italic" }}>尚未建立此知識項目</span>
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setAddingNew(true)}
        style={{
          marginTop: 10, width: "100%",
          padding: "7px 0", borderRadius: 7,
          border: "1px dashed #C8C7C3", background: "transparent",
          color: "#9B9990", fontSize: 11, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
        }}
      >
        <span>+</span> 手動新增知識
      </button>

      {addingNew && (
        <div style={{
          marginTop: 6, padding: "10px",
          background: "#FAFAF9", border: "1px solid #E4E3E1",
          borderRadius: 8, fontSize: 11,
        }}>
          <div style={{ color: "#9B9990", textAlign: "center" as const }}>
            手動新增功能開發中…
          </div>
          <button
            onClick={() => setAddingNew(false)}
            style={{ marginTop: 6, width: "100%", padding: "4px", background: "none", border: "none", color: "#C8C7C3", cursor: "pointer", fontSize: 11 }}
          >取消</button>
        </div>
      )}
    </div>
  );
}

// ─── MembersTab ───────────────────────────────────────────────────────────────

function MembersTab({ missionId, brandId }: { missionId?: number | null; brandId?: number | null }) {
  const [assembling, setAssembling] = React.useState(false);
  const [squadUid, setSquadUid] = React.useState<string | null>(null);
  const [squadTitle, setSquadTitle] = React.useState<string>("");
  const [squadStatus, setSquadStatus] = React.useState<string | null>(null);
  const [openingMsg, setOpeningMsg] = React.useState<string | null>(null);
  const [openingAgent, setOpeningAgent] = React.useState<string>("");

  // 輪詢 squad status
  const statusQuery = (trpc as any).squad?.getStatus?.useQuery
    ? (trpc as any).squad.getStatus.useQuery(
        { missionId: missionId! },
        { enabled: !!missionId && !squadUid, refetchInterval: 2000, refetchOnWindowFocus: false }
      )
    : { data: null };

  // 取得 squad agents（有 squadUid 才查）
  const agentsQuery = (trpc as any).squad?.getAgents?.useQuery
    ? (trpc as any).squad.getAgents.useQuery(
        { squadUid: squadUid ?? "" },
        { enabled: !!squadUid, refetchOnWindowFocus: false }
      )
    : { data: null };

  const assembbleMutation = (trpc as any).squad?.assemble?.useMutation
    ? (trpc as any).squad.assemble.useMutation({
        onSuccess: (data: any) => {
          setSquadUid(data.squadUid);
          setSquadTitle(data.title);
          setSquadStatus("ready");
          setAssembling(false);
        },
        onError: () => setAssembling(false),
      })
    : null;

  const squadLeadOpenMutation = (trpc as any).squad?.squadLeadOpen?.useMutation
    ? (trpc as any).squad.squadLeadOpen.useMutation({
        onSuccess: (data: any) => {
          setOpeningMsg(data.message);
          setOpeningAgent(data.agentName ?? "劉品妤");
          setSquadStatus("running");
        },
      })
    : null;

  // 同步外部已存在的 squad（頁面刷新後）
  React.useEffect(() => {
    const sq = statusQuery.data;
    if (sq && sq.squadUid && !squadUid) {
      setSquadUid(sq.squadUid);
      setSquadTitle(sq.title ?? "");
      setSquadStatus(sq.status);
    }
  }, [statusQuery.data]);

  // squad ready 後自動觸發 squadLeadOpen
  React.useEffect(() => {
    if (squadStatus === "ready" && squadUid && !openingMsg && squadLeadOpenMutation) {
      squadLeadOpenMutation.mutate({ squadUid, missionId: missionId! });
    }
  }, [squadStatus, squadUid]);

  const handleAssemble = () => {
    if (!missionId || !brandId || !assembbleMutation) return;
    setAssembling(true);
    assembbleMutation.mutate({
      missionId, brandId, workspace: "strategy", squadType: "brand_positioning",
    });
  };

  const agents = (agentsQuery.data ?? []) as any[];

  const statusIcon = (s: string) => s === "done" ? "✅" : s === "running" ? "⏳" : "⏸️";

  // ── 未選任務 ───────────────────────────────────────────────────────────────
  if (!missionId) {
    return (
      <div style={{ padding: "30px 0", textAlign: "center" as const, color: "#C8C7C3", fontSize: 11 }}>
        選擇任務後顯示成員
      </div>
    );
  }

  // ── 尚未組隊 ───────────────────────────────────────────────────────────────
  if (!squadUid && !assembling) {
    return (
      <div style={{ padding: "20px 8px" }}>
        <div style={{ textAlign: "center" as const, marginBottom: 16 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>👥</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A18", marginBottom: 4 }}>召集你的行銷小組</div>
          <div style={{ fontSize: 11, color: "#9B9990", lineHeight: 1.5 }}>
            PM 已為這個任務推薦了<br />最適合的 Agent 組合
          </div>
        </div>
        {/* 預覽成員陣容 */}
        <div style={{ marginBottom: 14, display: "flex", flexDirection: "column" as const, gap: 5 }}>
          {[
            { name: "劉品妤", role: "Squad Lead · AI 品牌故事 CMO", lead: true },
            { name: "Mark Liu", role: "市場研究師" },
            { name: "Amy Chen", role: "消費者洞察師" },
            { name: "Sarah Chen", role: "品牌策略師" },
            { name: "David Wang", role: "策略定位師" },
            { name: "Jessica Wu", role: "品牌文案師" },
            { name: "Tom Lin", role: "行銷通路師" },
          ].map((m, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8,
              background: m.lead ? "#F0FDF8" : "white",
              border: `1px solid ${m.lead ? "#1DBEAA" : "#ECEAE8"}`,
              borderRadius: 8, padding: "7px 9px",
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: m.lead ? "#1DBEAA" : "#1A1A18", color: "white",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, flexShrink: 0,
              }}>{m.name.charAt(0)}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1A1A18" }}>{m.name}</div>
                <div style={{ fontSize: 10, color: "#9B9990" }}>{m.role}</div>
              </div>
              {m.lead && <div style={{ marginLeft: "auto", fontSize: 9, background: "#1DBEAA", color: "white", padding: "2px 5px", borderRadius: 4 }}>Lead</div>}
            </div>
          ))}
        </div>
        <button
          onClick={handleAssemble}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 8,
            background: "#1A1A18", color: "white",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: "none", fontFamily: "inherit",
          }}
        >
          ✅ 確認組隊，開始召集
        </button>
      </div>
    );
  }

  // ── 召集中 ─────────────────────────────────────────────────────────────────
  if (assembling || (squadUid && squadStatus === "assembling")) {
    return (
      <div style={{ padding: "30px 8px", textAlign: "center" as const }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A18", marginBottom: 4 }}>成員召集中...</div>
        <div style={{ fontSize: 11, color: "#9B9990" }}>正在為這個品牌建立專屬小組</div>
      </div>
    );
  }

  // ── Squad Lead 開場（ready → running）─────────────────────────────────────
  if (squadUid && (squadStatus === "ready" || squadStatus === "running") && !openingMsg) {
    return (
      <div style={{ padding: "20px 8px", textAlign: "center" as const }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>🎯</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A18", marginBottom: 4 }}>小組就緒！</div>
        <div style={{ fontSize: 11, color: "#9B9990" }}>Squad Lead 正在分析品牌...</div>
        <div style={{ marginTop: 12, fontSize: 10, color: "#C8C7C3" }}>⏳</div>
      </div>
    );
  }

  // ── Squad Lead 開場訊息 ────────────────────────────────────────────────────
  return (
    <div>
      {/* Squad 標題 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#C8C7C3", textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>
          👥 {squadTitle || "品牌定位小組"}
        </div>
      </div>

      {/* Squad Lead 開場 */}
      {openingMsg && (
        <div style={{
          background: "#F0FDF8", border: "1px solid #1DBEAA",
          borderRadius: 9, padding: "10px 11px", marginBottom: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%",
              background: "#1DBEAA", color: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700,
            }}>劉</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#1A1A18" }}>{openingAgent || "劉品妤"}</div>
              <div style={{ fontSize: 9, color: "#9B9990" }}>Squad Lead · AI 品牌故事 CMO</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#1A1A18", lineHeight: 1.6, whiteSpace: "pre-wrap" as const }}>
            {openingMsg}
          </div>
        </div>
      )}

      {/* 成員清單 */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 5 }}>
        {agents.length > 0 ? agents.map((m: any, i: number) => (
          <div key={i} style={{
            background: "white", border: "1px solid #ECEAE8",
            borderRadius: 8, padding: "8px 10px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                background: "#1A1A18", color: "white",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, flexShrink: 0,
              }}>{(m.agentName ?? "A").charAt(0)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1A1A18" }}>{m.agentName}</div>
                <div style={{ fontSize: 10, color: "#9B9990" }}>{m.agentRole} · {m.model}</div>
              </div>
              <div style={{ fontSize: 13 }}>{statusIcon(m.status)}</div>
            </div>
          </div>
        )) : (
          // Fallback：用靜態清單顯示
          [
            { name: "Mark Liu", role: "市場研究師" },
            { name: "Amy Chen", role: "消費者洞察師" },
            { name: "Sarah Chen", role: "品牌策略師" },
            { name: "David Wang", role: "策略定位師" },
            { name: "Jessica Wu", role: "品牌文案師" },
            { name: "Tom Lin", role: "行銷通路師" },
            { name: "PM Agent", role: "行銷計劃師" },
          ].map((m, i) => (
            <div key={i} style={{
              background: "white", border: "1px solid #ECEAE8",
              borderRadius: 8, padding: "8px 10px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: "#1A1A18", color: "white",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700,
                }}>{m.name.charAt(0)}</div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#1A1A18" }}>{m.name}</div>
                  <div style={{ fontSize: 10, color: "#9B9990" }}>{m.role}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RightPanel({
  missionId, brandId, activeSquad, taskSquads, missionSquadSlug, missionWorkspace,
}: {
  missionId?: number | null;
  brandId?: number | null;
  activeSquad?: SquadOption | null;
  taskSquads?: SquadOption[];
  missionSquadSlug?: string | null;
  missionWorkspace?: string | null;
}) {
  const [activeTab, setActiveTab] = useState<"sop" | "brandbrain" | "members">("sop");

  // Resolve the squad to display:
  // 1. activeSquad from current session (user just clicked a chip)
  // 2. squad stored on the mission in DB (persists across sessions)
  // 3. null → show fallback
  const storedSquad = missionSquadSlug ? findSquadBySlug(missionSquadSlug) : null;
  const effectiveSquad = activeSquad ?? storedSquad;

  // Workspace squads for the members tab
  const wsSquads = WORKSPACE_SQUADS[missionWorkspace ?? "strategy"] ?? [];
  const effectiveAllSquads = (taskSquads ?? []).length > 0 ? (taskSquads ?? []) : wsSquads;
  const otherSquads = effectiveAllSquads.filter(s => s.squadSlug !== effectiveSquad?.squadSlug);

  // Auto-switch to 流程 tab whenever effective squad changes
  useEffect(() => {
    if (effectiveSquad) setActiveTab("sop");
  }, [effectiveSquad?.squadSlug]);

  const panelStyle: React.CSSProperties = {
    width: 264, minWidth: 264,
    background: "#FAFAF9",
    borderLeft: "1px solid #E4E3E1",
    display: "flex", flexDirection: "column",
    overflow: "hidden",
  };

  const tabs = [
    { id: "sop"        as const, label: "流程" },
    { id: "brandbrain" as const, label: "品牌大腦" },
    { id: "members"    as const, label: "成員" },
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
              background: "transparent", border: "none",
              borderBottom: `2px solid ${activeTab === tab.id ? "#1A1A18" : "transparent"}`,
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
          effectiveSquad
            ? <SquadMethodologyPanel squad={effectiveSquad} />
            : <div style={{ marginBottom: 15 }}><PositioningProgress missionId={missionId} brandId={brandId} /></div>
        )}

        {activeTab === "brandbrain" && (
          <BrandBrainTab brandId={brandId} />
        )}

        {activeTab === "members" && (
          effectiveSquad && otherSquads.length > 0
            ? <SquadMembersList squads={otherSquads} />
            : <MembersTab missionId={missionId} brandId={brandId} />
        )}
      </div>
    </div>
  );
}

// ─── SquadMethodologyPanel ─────────────────────────────────────────────────────

function SquadMethodologyPanel({ squad }: { squad: SquadOption }) {
  return (
    <div>
      {/* Squad header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A18", marginBottom: 2 }}>
          {squad.name}
        </div>
        <div style={{ fontSize: 11, color: "#9B9990", marginBottom: 6 }}>
          {squad.leadTitle}
        </div>
        <div style={{ fontSize: 11, color: "#6B6A66", lineHeight: 1.5 }}>
          {squad.tagline}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "#E7E5E4", marginBottom: 14 }} />

      {/* Methodology steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {squad.steps.map((step, i) => (
          <div key={step.phase} style={{ display: "flex", gap: 10 }}>
            {/* Step number */}
            <div style={{
              width: 20, height: 20, borderRadius: "50%",
              background: "#1A1A18", color: "#FFFFFF",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1,
            }}>
              {i + 1}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A18", marginBottom: 2 }}>
                {step.phase}
              </div>
              <div style={{ fontSize: 11, color: "#9B9990", lineHeight: 1.5 }}>
                {step.description}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SquadMembersList ──────────────────────────────────────────────────────────

function SquadMembersList({ squads }: { squads: SquadOption[] }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#9B9990", marginBottom: 10, fontWeight: 500, letterSpacing: 0.3, textTransform: "uppercase" as const }}>
        協作成員
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {squads.map((squad) => (
          <div
            key={squad.squadSlug}
            style={{
              padding: "9px 10px",
              background: "#FFFFFF",
              border: "1px solid #E7E5E4",
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 500, color: "#1A1A18", marginBottom: 1 }}>
              {squad.name}
            </div>
            <div style={{ fontSize: 11, color: "#9B9990" }}>
              {squad.leadTitle}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── BrandPositioningBar ──────────────────────────────────────────────────────

function BrandPositioningBar({ brandId }: { brandId: number | null }) {
  const { data: pos, refetch } = (trpc as any).brand?.getPositioning?.useQuery
    ? (trpc as any).brand.getPositioning.useQuery(
        { brandId: brandId! },
        { enabled: !!brandId, refetchOnWindowFocus: false }
      )
    : { data: null, refetch: () => {} };

  const generateEstimate = (trpc as any).brand?.generateEstimate?.useMutation
    ? (trpc as any).brand.generateEstimate.useMutation({ onSuccess: () => refetch() })
    : { mutate: () => {}, isLoading: false };

  // 自動觸發推估（若無 tagline）
  React.useEffect(() => {
    if (brandId && pos && !pos.tagline && !generateEstimate.isLoading) {
      generateEstimate.mutate({ brandId });
    }
  }, [brandId, pos]);

  if (!brandId) return null;

  const p = pos as any;
  const isLoading = !p || (!p.tagline && generateEstimate.isLoading);
  const isEmpty = p && !p.tagline && !generateEstimate.isLoading;

  const tags = [
    p?.targetMarket,
    p?.audienceA,
    p?.audienceB,
    p?.emotionalDiff,
    p?.functionalDiff,
  ].filter(Boolean) as string[];

  return (
    <div style={{
      padding: '14px 20px',
      borderBottom: '1px solid #F0EFED',
      background: '#FAFAF9',
      flexShrink: 0,
    }}>
      {isLoading ? (
        <div style={{ fontSize: 11, color: '#B0AFA9' }}>AI 正在推估品牌定位…</div>
      ) : isEmpty ? (
        <div style={{ fontSize: 11, color: '#B0AFA9' }}>品牌定位尚未設定</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A18' }}>
                {p?.tagline}
              </span>
              {p?.isEstimate === 1 && (
                <span style={{
                  fontSize: 9, color: '#E8631A', border: '1px solid #F5C4A8',
                  borderRadius: 4, padding: '1px 5px', fontWeight: 500, flexShrink: 0,
                }}>
                  ✦ 推估中
                </span>
              )}
            </div>
            {p?.valueProposition && (
              <div style={{ fontSize: 11, color: '#6B6A66', marginTop: 2 }}>
                {typeof p.valueProposition === 'string' ? p.valueProposition : JSON.stringify(p.valueProposition)}
              </div>
            )}
            {tags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                {tags.map((tag, i) => (
                  <span key={i} style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 10,
                    background: i === 0 ? '#FFF0E8' : '#F2F1EF',
                    color: i === 0 ? '#E8631A' : '#6B6A66',
                    border: i === 0 ? '1px solid #F5C4A8' : '1px solid #E4E3E1',
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          {p?.isEstimate === 1 && (
            <div style={{ fontSize: 10, color: '#B0AFA9', flexShrink: 0, maxWidth: 140, lineHeight: 1.4 }}>
              待品牌定位完成後<br/>自動更新並套用
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── AppShell ─────────────────────────────────────────────────────────────────

interface AppShellProps {
  children: React.ReactNode;
  onMissionSelect?: (missionId: number) => void;
  onNewTask?: (wsKey: string) => void;
  activeMissionId?: number | null;
  activeSquad?: SquadOption | null;
  taskSquads?: SquadOption[];
}


// ─── ExportsPanel ─────────────────────────────────────────────────────────────

function ExportsPanel({ brandId }: { brandId?: number | null }) {
  const [exports, setExports] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!brandId) return;
    setLoading(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
    fetch('/api/exports' + (brandId ? '?brandId=' + brandId : ''), {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setExports(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [brandId]);

  const typeIcon = (type: string) => {
    if (type === "ppt" || type === "presentation") return "📊";
    if (type === "report" || type === "doc") return "📄";
    if (type === "copy" || type === "text") return "✍️";
    return "📦";
  };

  const typeLabel = (type: string) => {
    if (type === "ppt" || type === "presentation") return "PPT";
    if (type === "report") return "報告";
    if (type === "doc") return "文件";
    if (type === "copy" || type === "text") return "文案";
    return "其他";
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("zh-TW"); } catch { return d; }
  };

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      background: "#FAFAF9", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "20px 24px 16px",
        borderBottom: "1px solid #ECEAE8",
        background: "white",
        flexShrink: 0,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#1A1A18", margin: 0 }}>
          📦 任務產出
        </h2>
        <p style={{ fontSize: 12, color: "#9B9990", marginTop: 4, marginBottom: 0 }}>
          所有任務生成的 PPT、報告、文案等產出
        </p>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {loading ? (
          <div style={{ textAlign: "center" as const, padding: "60px 0", color: "#C8C7C3", fontSize: 13 }}>
            載入中…
          </div>
        ) : exports.length === 0 ? (
          <div style={{ textAlign: "center" as const, padding: "60px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A18", marginBottom: 6 }}>尚無產出</div>
            <div style={{ fontSize: 12, color: "#9B9990" }}>完成任務後，產出將自動出現在這裡</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {exports.map((item: any, i: number) => (
              <div key={i} style={{
                background: "white", border: "1px solid #ECEAE8",
                borderRadius: 10, padding: "14px 16px",
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: "#F2F1EF", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    fontSize: 18, flexShrink: 0,
                  }}>
                    {typeIcon(item.outputType ?? item.type ?? "")}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1A18", marginBottom: 2 }}>
                      {item.missionTitle ?? item.title ?? "未命名產出"}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                      <span style={{
                        fontSize: 10, padding: "1px 7px", borderRadius: 4,
                        background: "#F2F1EF", color: "#6B6A66",
                        border: "1px solid #E4E3E1",
                      }}>
                        {typeLabel(item.outputType ?? item.type ?? "")}
                      </span>
                      {item.createdAt && (
                        <span style={{ fontSize: 10, color: "#C8C7C3" }}>
                          {fmtDate(item.createdAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {item.content && (
                  <div style={{
                    fontSize: 11, color: "#6B6A66", lineHeight: 1.5,
                    maxHeight: 48, overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as any,
                  }}>
                    {item.content.slice(0, 150)}
                  </div>
                )}
                {item.fileUrl && (
                  <a
                    href={item.fileUrl}
                    download
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                      padding: "6px 12px", borderRadius: 6,
                      background: "#1A1A18", color: "white",
                      fontSize: 11, fontWeight: 500, textDecoration: "none",
                      marginTop: "auto",
                    }}
                  >
                    ⬇ 下載
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AppShell({ children, onMissionSelect, onNewTask, activeMissionId, activeSquad, taskSquads }: AppShellProps) {
  const [railTab, setRailTab] = useState("chat");
  const [newMissionOpen, setNewMissionOpen] = useState(false);
  const [newMissionWsKey, setNewMissionWsKey] = useState("strategy");
  const [newWsOpen, setNewWsOpen] = useState(false);
  const [newWsLabel, setNewWsLabel] = useState("");

  const shellUtils = trpc.useUtils();
  const createWorkspace = trpc.workspace.create.useMutation({
    onSuccess: () => {
      shellUtils.workspace.list.invalidate();
      setNewWsOpen(false);
      setNewWsLabel("");
    },
  });

  // Notifications for badge
  const { data: notifData } = trpc.notifications.list.useQuery(
    { unreadOnly: true, limit: 20 },
    { refetchOnWindowFocus: false }
  );
  const notifCount = (notifData as any[])?.length ?? 0;

  // Brand for topbar
  const { data: brands } = trpc.brand.listByMember.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );
  const brandList = (brands as any[]) ?? [];
  const [selectedBrandIdx] = useState(0);
  const selectedBrand = brandList[selectedBrandIdx] ?? null;
  const selectedBrandId: number | null = (selectedBrand as any)?.id ?? null;

  // Workspace list for MissionModal (React Query deduplicates with Drawer's query)
  const { data: shellWorkspaces } = trpc.workspace.list.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );
  const shellWsList = (shellWorkspaces as any[]) ?? [];

  // Mission + workspace for breadcrumb
  const { data: activeMissionData } = (trpc as any).mission?.getById?.useQuery
    ? (trpc as any).mission.getById.useQuery(
        { id: activeMissionId },
        { enabled: !!activeMissionId, refetchOnWindowFocus: false }
      )
    : { data: null };
  const activeMissionTitle = (activeMissionData as any)?.title ?? null;
  const activeMissionWorkspace = (activeMissionData as any)?.workspace ?? null;
  const activeMissionSquadSlug = (activeMissionData as any)?.squadSlug ?? null;

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
      <Rail activeTab={railTab} onTabChange={setRailTab} notifCount={notifCount} />
      <Drawer
        onMissionSelect={onMissionSelect}
        onNewTask={(wsKey) => { setNewMissionWsKey(wsKey); setNewMissionOpen(true); }}
        activeMissionId={activeMissionId}
        onNewMission={() => { setNewMissionWsKey(activeMissionWorkspace ?? "strategy"); setNewMissionOpen(true); }}
        onNewWorkspace={() => setNewWsOpen(true)}
      />

      {/* Main */}
      <main style={mainStyle}>
        {/* Topbar */}
        <div style={topbarStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#9B9990" }}>
            <span>{selectedBrand?.name ?? "SoWork AI"}</span>
            {activeMissionWorkspace && (
              <>
                <span style={{ color: "#D4D3D0" }}>/</span>
                <span>{activeMissionWorkspace === "strategy" ? "策略定位" : activeMissionWorkspace === "website" ? "官網" : activeMissionWorkspace === "facebook" ? "Facebook" : activeMissionWorkspace}</span>
              </>
            )}
            {activeMissionTitle ? (
              <>
                <span style={{ color: "#D4D3D0" }}>/</span>
                <span style={{ color: "#1A1A18", fontWeight: 500 }}>{activeMissionTitle.length > 20 ? activeMissionTitle.slice(0, 20) + "…" : activeMissionTitle}</span>
              </>
            ) : (
              <>
                <span style={{ color: "#D4D3D0" }}>/</span>
                <span style={{ color: "#1A1A18", fontWeight: 500 }}>Marketing OS</span>
              </>
            )}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 5, alignItems: "center" }}>
            {/* Notification Bell */}
            <div style={{ position: "relative", marginRight: 4 }}>
              <button
                style={{ ...btnGhost, padding: "4px 8px" }}
                onClick={() => setRailTab("notification")}
              >
                <IconNotification />
              </button>
              {notifCount > 0 && (
                <div style={{
                  position: "absolute", top: 2, right: 2,
                  width: 7, height: 7, borderRadius: "50%",
                  background: "#E8631A", border: "1.5px solid white",
                }} />
              )}
            </div>
          </div>
        </div>

        <BrandPositioningBar brandId={selectedBrandId} />

        {/* Children slot (chat/content area) or Exports panel */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {railTab === "outputs"
            ? <ExportsPanel brandId={selectedBrandId} />
            : children
          }
        </div>
      </main>

      <RightPanel
        missionId={activeMissionId}
        brandId={selectedBrandId}
        activeSquad={activeSquad ?? null}
        taskSquads={taskSquads ?? []}
        missionSquadSlug={activeMissionSquadSlug}
        missionWorkspace={activeMissionWorkspace}
      />

      {/* New Workspace inline modal */}
      {newWsOpen && (
        <div
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
          onClick={() => { setNewWsOpen(false); setNewWsLabel(""); }}
        >
          <div
            style={{ background:"#FFFFFF", borderRadius:16, padding:"28px 32px", width:"100%", maxWidth:400, boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize:17, fontWeight:700, color:"#1A1A18", margin:"0 0 18px" }}>新增工作區</h2>
            <form onSubmit={(e) => { e.preventDefault(); if (newWsLabel.trim()) createWorkspace.mutate({ label: newWsLabel.trim() }); }}>
              <input
                autoFocus
                type="text"
                value={newWsLabel}
                onChange={(e) => setNewWsLabel(e.target.value)}
                placeholder="例：Instagram、電商、公關"
                style={{ width:"100%", border:"1.5px solid #E2E8F0", borderRadius:8, padding:"9px 12px", fontSize:13, color:"#1A1A18", outline:"none", fontFamily:"inherit", boxSizing:"border-box" as const, marginBottom:16 }}
              />
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button type="button" onClick={() => { setNewWsOpen(false); setNewWsLabel(""); }}
                  style={{ background:"transparent", border:"1px solid #E8EAF0", borderRadius:8, padding:"7px 16px", fontSize:12, cursor:"pointer", color:"#5A5A5A" }}>
                  取消
                </button>
                <button type="submit" disabled={!newWsLabel.trim() || createWorkspace.isPending}
                  style={{ background: newWsLabel.trim() ? "#1A1A18" : "#E8EAF0", color: newWsLabel.trim() ? "#FFFFFF" : "#9B9990", border:"none", borderRadius:8, padding:"7px 18px", fontSize:12, fontWeight:600, cursor: newWsLabel.trim() ? "pointer" : "not-allowed" }}>
                  {createWorkspace.isPending ? "建立中…" : "建立"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <MissionModal
        open={newMissionOpen}
        defaultWorkspace={newMissionWsKey}
        brandId={selectedBrandId ?? undefined}
        brandName={(selectedBrand as any)?.name}
        workspaces={shellWsList}
        onClose={() => setNewMissionOpen(false)}
        onCreated={(missionId) => {
          setNewMissionOpen(false);
          onMissionSelect?.(missionId);
        }}
      />
    </div>
  );
}
