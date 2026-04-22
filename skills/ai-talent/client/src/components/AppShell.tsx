/**
 * AppShell.tsx — v7 Layout Shell
 * Rail(48px) + Drawer(210px) + Main(flex:1) + RightPanel(264px)
 * All styles are inline, mirroring marketing-os-mockup-v7.html
 */
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { MissionModal } from "./MissionModal";
import type { DBSquad } from '../types/squad';
import { useLang } from "../lib/i18n";
import Settings from "../pages/Settings";

// ─── Persisted brand selection key ──────────────────────────────────────────
// Written when user clicks a brand in the top-left picker, read by AppShell
// and MissionChatCore on mount so the brand context is consistent across
// page-level navigations. A `brand-changed` window event lets already-mounted
// components react without a full reload.
const BRAND_KEY = "sowork.selectedBrandId";
function readPersistedBrandId(): number | null {
  try {
    const raw = localStorage.getItem(BRAND_KEY);
    return raw ? Number(raw) || null : null;
  } catch { return null; }
}
function persistBrandId(id: number) {
  try { localStorage.setItem(BRAND_KEY, String(id)); } catch {}
  try { window.dispatchEvent(new CustomEvent("brand-changed", { detail: { brandId: id } })); } catch {}
}

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

const IconPackage = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

// Brain: neural-node glyph, matches BrandBrainBar's NeuralIcon aesthetic
const IconBrain = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="4"  r="1.2" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="20" r="1.2" fill="currentColor" stroke="none"/>
    <circle cx="4"  cy="12" r="1.2" fill="currentColor" stroke="none"/>
    <circle cx="20" cy="12" r="1.2" fill="currentColor" stroke="none"/>
    <line x1="12" y1="9.8" x2="12" y2="5.2"/>
    <line x1="12" y1="14.2" x2="12" y2="18.8"/>
    <line x1="9.8" y1="12" x2="5.2" y2="12"/>
    <line x1="14.2" y1="12" x2="18.8" y2="12"/>
  </svg>
);

const IconSettings = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
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
  const { t } = useLang();
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
    { id: "tasks",        icon: <IconTasks />,        badge: false, label: t("tab_tasks") },
    { id: "chat",         icon: <IconChat />,         badge: false, label: t("tab_chat") },
    { id: "brain",        icon: <IconBrain />,        badge: false, label: t("tab_brain") },
    { id: "outputs",      icon: <IconPackage />,      badge: false, label: t("tab_outputs") },
    { id: "settings",     icon: <IconSettings />,     badge: false, label: t("tab_settings") },
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
      {/* Logout button */}
      <button
        title={t("logout")}
        onClick={() => {
          localStorage.clear();
          window.location.href = "/login";
        }}
        style={{
          ...btnBase,
          color: "#9B9990",
          marginBottom: 4,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span style={{ fontSize: 8, color: "inherit", lineHeight: 1 }}>{t("logout")}</span>
      </button>
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
  onMissionSelect?: (missionId: number, brandId?: number, workspace?: string) => void;
  onNewTask?: (wsKey: string) => void;
}) {
  const { t } = useLang();
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
        <div style={{ padding: "3px 6px", fontSize: 10, color: "#C8C7C3" }}>{t("loading")}</div>
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
            onClick={() => onMissionSelect?.(mission.id, brandId ?? undefined, wsKey)}
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
              if (window.confirm(t("confirm_delete_mission"))) {
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
            title={t("delete_mission_btn")}
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
  onMissionSelect?: (missionId: number, brandId?: number, workspace?: string) => void;
  onNewImpromptu?: () => void;
  workspaces: any[];
}) {
  const { t } = useLang();
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
        <span>{t("section_impromptu")}</span>
        <button
          onClick={onNewImpromptu}
          title={t("start_impromptu")}
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
          <IconCompose /> {t("start_impromptu")}
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
                onClick={() => onMissionSelect?.(m.id, brandId ?? undefined, undefined)}
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
  onCollapse,
}: {
  onMissionSelect?: (missionId: number, brandId?: number, workspace?: string) => void;
  onNewTask?: (wsKey: string) => void;
  activeMissionId?: number | null;
  onNewMission?: () => void;
  onNewWorkspace?: () => void;
  onCollapse?: () => void;
}) {
  const { t } = useLang();
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
  const navigate = useNavigate();
  const urlParams = useParams<{ brandId?: string; missionId?: string; workspace?: string }>();
  const urlBrandId = urlParams.brandId ? Number(urlParams.brandId) : null;

  const [selectedBrandIdx, setSelectedBrandIdx] = useState(0);
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false);
  const deleteBrand = trpc.brand.delete.useMutation({
    onSuccess: () => { refetchBrands(); setBrandDropdownOpen(false); },
  });
  const brandList = (brands as any[]) ?? [];
  const selectedBrand = brandList[selectedBrandIdx] ?? null;
  const selectedBrandId: number | null = selectedBrand?.id ?? null;

  // ── Brand selection sync ────────────────────────────────────────────────
  // Priority: URL :brandId param > localStorage > brand[0]
  // Once brands load, align selectedBrandIdx to URL/localStorage/default.
  useEffect(() => {
    if (!brandList.length) return;
    const targetId = urlBrandId ?? readPersistedBrandId();
    if (targetId) {
      const idx = brandList.findIndex((b: any) => b.id === targetId);
      if (idx >= 0 && idx !== selectedBrandIdx) {
        setSelectedBrandIdx(idx);
        return;
      }
    }
    // If URL has no brand and localStorage has no brand, persist the default
    if (!targetId && selectedBrand?.id) persistBrandId(selectedBrand.id);
  }, [brandList.length, urlBrandId]);

  // Listen for external brand changes (from other components or tabs)
  useEffect(() => {
    const onChange = (e: any) => {
      const id = e?.detail?.brandId;
      if (!id) return;
      const idx = brandList.findIndex((b: any) => b.id === id);
      if (idx >= 0) setSelectedBrandIdx(idx);
    };
    window.addEventListener("brand-changed", onChange);
    return () => window.removeEventListener("brand-changed", onChange);
  }, [brandList]);

  // Helper — user clicks a brand in the picker
  const switchBrand = (brand: any) => {
    if (!brand?.id) return;
    persistBrandId(brand.id);
    const idx = brandList.findIndex((b: any) => b.id === brand.id);
    if (idx >= 0) setSelectedBrandIdx(idx);
    setBrandDropdownOpen(false);
    // Navigate to the brand-scoped root so any active mission clears and
    // downstream components (MissionChatCore, BrandBrainBar) re-fetch.
    navigate(`/b/${brand.id}/_/m/_`);
  };

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
      title: t("new_impromptu_title"),
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
    <div style={{ ...drawerStyle, position: "relative" }}>
      {/* Collapse button — top-right edge */}
      {onCollapse && (
        <button
          onClick={onCollapse}
          title={t("collapse_sidebar")}
          style={{
            position: "absolute",
            top: 6, right: 4,
            zIndex: 5,
            width: 20, height: 20,
            border: "none",
            background: "transparent",
            color: "#8C8B87",
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 4,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#E4E3E1"; (e.currentTarget as HTMLButtonElement).style.color = "#1A1A18"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#8C8B87"; }}
        >◀</button>
      )}
      {/* Brand Switcher Header */}
      <div style={{ padding: "13px 10px 8px", position: "relative" }}>
        {brandsLoading ? (
          <div style={{ padding: "5px 8px", fontSize: 11, color: "#9B9990" }}>{t("loading_brands")}</div>
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
            <IconPlus /> {t("create_brand")}
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
                {selectedBrand?.name ?? t("select_brand")}
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
                      onClick={() => switchBrand(brand)}
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
                        if (window.confirm(t("confirm_delete_brand", { name: brand.name }))) {
                          deleteBrand.mutate({ id: brand.id });
                        }
                      }}
                      style={{
                        background: "none", border: "none",
                        color: "#C8C7C3", cursor: "pointer",
                        fontSize: 14, padding: "0 2px",
                        flexShrink: 0, lineHeight: 1,
                      }}
                      title={t("delete_brand")}
                    >×</button>
                  </div>
                ))}
                <div
                  onClick={() => { window.location.href = "/onboarding"; setBrandDropdownOpen(false); }}
                  style={{ padding: "8px 12px", cursor: "pointer", fontSize: 11, color: "#9B9990", borderTop: "1px solid #F2F1EF", display: "flex", alignItems: "center", gap: 5 }}
                >
                  <IconPlus /> {t("create_new_brand")}
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
          <span>{t("section_workspace")}</span>
          <button
            onClick={onNewWorkspace}
            title={t("add_workspace")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9990", display: "flex", alignItems: "center", padding: "1px 3px", borderRadius: 4 }}
          >
            <IconFolder />
          </button>
        </div>

        {wsLoading && (
          <div style={{ padding: "5px 13px", fontSize: 11, color: "#9B9990" }}>{t("loading")}</div>
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
            {t("no_workspaces")}
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
            {t("new_mission")}
          </button>
        </div>

      </div>

      {/* 可用資源 — 固定在 drawer 底部 */}
      <div style={{ borderTop: "1px solid #E4E3E1", flexShrink: 0 }}>
        <div style={{ ...secLabel, display: "flex", alignItems: "center", gap: 5, marginTop: 0 }}>
          <span>{t("section_resources")}</span>
          {isMissionPending && (
            <span style={{ fontSize: 9, color: "#9B9990", fontWeight: 400, letterSpacing: 0 }}>⚙ {t("matching")}</span>
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

// ─── BrandBrainTab (Knowledge Base + Brain context panel) ────────────────────
// SoWork orange: #C9823A

const BRAIN_ORANGE = "#C9823A";
const BRAIN_ORANGE_LIGHT = "#FFF7ED";
const BRAIN_ORANGE_BORDER = "#F5C9A8";
const TOKEN_BUDGET = 2000;
const CHARS_PER_TOKEN = 4;

const BRAIN_CATEGORY_META: Record<string, { labelKey: string; emoji: string; bg: string; text: string; border: string }> = {
  positioning: { labelKey: "bb_category_positioning", emoji: "📍", bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA" },
  audience:    { labelKey: "bb_category_audience",    emoji: "👥", bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  voice:       { labelKey: "bb_category_voice",       emoji: "🗣️", bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0" },
  competitors: { labelKey: "bb_category_competitor",  emoji: "⚔️", bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA" },
  custom:      { labelKey: "bb_category_other",       emoji: "📝", bg: "#F9FAFB", text: "#374151", border: "#E5E7EB" },
};

function BrandBrainTab({ brandId }: { brandId?: number | null }) {
  const { t } = useLang();
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null);
  const [activeFilter, setActiveFilter] = React.useState<string | null>(null);

  const brandBrainQuery = (trpc as any).brandBrain?.list?.useQuery
    ? (trpc as any).brandBrain.list.useQuery(
        { brandId: brandId! },
        { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 15_000 }
      )
    : { data: null, isLoading: false };

  const allItems: any[] = brandBrainQuery.data ?? [];
  const items = activeFilter ? allItems.filter((i: any) => (i.category ?? i.key) === activeFilter) : allItems;

  // Token usage
  const totalChars = allItems.reduce((sum: number, item: any) => sum + (item.content?.length ?? 0) + (item.title?.length ?? 0), 0);
  const usedTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
  const pct = Math.min(100, Math.round((usedTokens / TOKEN_BUDGET) * 100));
  const meterColor = pct >= 90 ? "#EF4444" : pct > 60 ? "#F59E0B" : BRAIN_ORANGE;

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return null;
    try { return new Date(d).toLocaleDateString("zh-TW", { month: "short", day: "numeric" }); }
    catch { return d; }
  };

  const isEmpty = allItems.length === 0;

  return (
    <div>
      {/* ── Header with icon + token meter ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px", marginBottom: 8,
        background: BRAIN_ORANGE_LIGHT,
        border: `1px solid ${BRAIN_ORANGE_BORDER}`,
        borderRadius: 10,
      }}>
        {/* Orange brain icon */}
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: `linear-gradient(135deg, ${BRAIN_ORANGE}, #E8631A)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 2px 6px rgba(201,130,58,0.35)`,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.88A2.5 2.5 0 0 1 9.5 2Z"/>
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.88A2.5 2.5 0 0 0 14.5 2Z"/>
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: BRAIN_ORANGE }}>{t("section_brand_brain")}</span>
            <span style={{
              fontSize: 9, fontWeight: 600,
              background: "white", border: `1px solid ${BRAIN_ORANGE_BORDER}`,
              borderRadius: 8, padding: "0 5px", color: "#9B7A55",
            }}>
              {t("brain_n_knowledge", { n: allItems.length })}
            </span>
          </div>
          {/* Token meter */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{
              flex: 1, height: 4, borderRadius: 2,
              background: "#EDE9E4", overflow: "hidden",
            }}>
              <div style={{
                height: "100%", width: `${pct}%`,
                background: meterColor, borderRadius: 2,
                transition: "width 0.4s",
              }} />
            </div>
            <span style={{ fontSize: 9, color: pct >= 90 ? "#EF4444" : "#9B7A55", flexShrink: 0 }}>
              {t("brain_tokens_used", { used: usedTokens, total: TOKEN_BUDGET })}
            </span>
          </div>
        </div>
      </div>

      {/* ── Full warning ── */}
      {pct >= 90 && (
        <div style={{
          fontSize: 10, color: "#B91C1C",
          background: "#FEF2F2", border: "1px solid #FECACA",
          borderRadius: 6, padding: "5px 8px", marginBottom: 8,
        }}>
          {t("brain_full_warning")}
        </div>
      )}

      {/* ── Category filter chips ── */}
      {allItems.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          <button
            onClick={() => setActiveFilter(null)}
            style={{
              fontSize: 9, padding: "2px 8px", borderRadius: 10,
              border: `1px solid ${activeFilter === null ? BRAIN_ORANGE : "#E4E3E1"}`,
              background: activeFilter === null ? BRAIN_ORANGE_LIGHT : "white",
              color: activeFilter === null ? BRAIN_ORANGE : "#6B6A66",
              cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
            }}
          >
            {t("filter_all")}
          </button>
          {Object.entries(BRAIN_CATEGORY_META).map(([cat, meta]) => {
            const count = allItems.filter((i: any) => (i.category ?? i.key) === cat).length;
            if (count === 0) return null;
            return (
              <button
                key={cat}
                onClick={() => setActiveFilter(activeFilter === cat ? null : cat)}
                style={{
                  fontSize: 9, padding: "2px 8px", borderRadius: 10,
                  border: `1px solid ${activeFilter === cat ? meta.border : "#E4E3E1"}`,
                  background: activeFilter === cat ? meta.bg : "white",
                  color: activeFilter === cat ? meta.text : "#6B6A66",
                  cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                }}
              >
                {meta.emoji} {t(meta.labelKey as any)} {count}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Knowledge items ── */}
      {isEmpty ? (
        <div style={{
          textAlign: "center" as const, padding: "20px 8px",
          color: "#C8C7C3", fontSize: 11, lineHeight: 1.8,
        }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>🧠</div>
          <div style={{ fontWeight: 600, color: "#9B9990" }}>{t("brain_empty_title")}</div>
          <div style={{ fontSize: 10, marginTop: 4 }}>
            {t("brain_empty_hint")}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((item: any, idx: number) => {
            const cat = item.category ?? item.key ?? "custom";
            const meta = BRAIN_CATEGORY_META[cat] ?? BRAIN_CATEGORY_META.custom;
            const title = item.title ?? item.key ?? t("knowledge_item_fallback");
            const content = item.content ?? item.value ?? "";
            const date = fmtDate(item.updatedAt ?? item.updated_at);
            const isExp = expandedKey === `${cat}-${idx}`;
            const hasContent = content.length > 0;

            return (
              <div key={`${cat}-${idx}`}>
                <div
                  onClick={() => setExpandedKey(isExp ? null : `${cat}-${idx}`)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 7,
                    padding: "8px 9px", borderRadius: 8, cursor: "pointer",
                    background: isExp ? meta.bg : "white",
                    border: `1px solid ${isExp ? meta.border : "#ECEAE8"}`,
                    transition: "all 0.12s",
                  }}
                >
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "2px 5px",
                    borderRadius: 4, background: meta.bg,
                    color: meta.text, border: `1px solid ${meta.border}`,
                    flexShrink: 0, marginTop: 1,
                  }}>
                    {meta.emoji}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#1A1A18", lineHeight: 1.3 }}>
                      {title}
                    </div>
                    {!isExp && hasContent && (
                      <div style={{ fontSize: 10, color: "#9B9990", lineHeight: 1.4, marginTop: 1 }}>
                        {content.slice(0, 50)}{content.length > 50 ? "…" : ""}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                    {date && (
                      <span style={{
                        fontSize: 9, color: "#22C55E",
                        background: "#F0FDF4", border: "1px solid #BBF7D0",
                        borderRadius: 4, padding: "1px 5px",
                      }}>
                        {date}
                      </span>
                    )}
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#9B9990" strokeWidth="2.5" strokeLinecap="round"
                      style={{ transform: isExp ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s" }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>
                </div>
                {isExp && (
                  <div style={{
                    margin: "2px 0 4px", padding: "9px 10px",
                    background: meta.bg, border: `1px solid ${meta.border}`,
                    borderRadius: 7, fontSize: 11, color: "#1A1A18", lineHeight: 1.7,
                  }}>
                    {hasContent
                      ? <span style={{ whiteSpace: "pre-wrap" }}>{content}</span>
                      : <span style={{ color: "#C8C7C3", fontStyle: "italic" }}>{t("no_content_yet")}</span>
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Footer hint ── */}
      <div style={{
        marginTop: 10, fontSize: 10, color: "#9B9990",
        textAlign: "center" as const, lineHeight: 1.6,
      }}>
        {t("brain_auto_read_hint")}<br/>
        <span style={{ color: BRAIN_ORANGE, fontWeight: 600 }}>{t("brain_add_hint")}</span>
      </div>
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
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
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

// ─── AgentExecutionTimeline ────────────────────────────────────────────────────
// Claude Code–style vertical step timeline with agent avatars

const AGENT_COLORS = [
  '#E8631A', '#0A6EFA', '#7C3AED', '#059669', '#DC2626', '#0891B2', '#D97706', '#BE185D',
];

function AgentExecutionTimeline({ steps }: { steps: SquadStepProgress[] }) {
  const { t } = useLang();
  const doneCount = steps.filter(s => s.status === 'done').length;

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Progress header */}
      {steps.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 12, padding: '6px 8px',
          background: doneCount === steps.length ? '#ECFDF5' : '#EFF6FF',
          borderRadius: 6,
          border: `1px solid ${doneCount === steps.length ? '#BBF7D0' : '#BFDBFE'}`,
        }}>
          {/* Progress bar */}
          <div style={{
            flex: 1, height: 4, background: '#E5E7EB', borderRadius: 2, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: steps.length > 0 ? `${(doneCount / steps.length) * 100}%` : '0%',
              background: doneCount === steps.length
                ? 'linear-gradient(90deg, #059669, #10B981)'
                : 'linear-gradient(90deg, #3B82F6, #60A5FA)',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <span style={{
            fontSize: 10, fontWeight: 600, flexShrink: 0,
            color: doneCount === steps.length ? '#065F46' : '#1D4ED8',
          }}>
            {doneCount}/{steps.length}
          </span>
        </div>
      )}

      {steps.map((step, idx) => {
        const isDone = step.status === 'done';
        const isRunning = step.status === 'running';
        const isWaiting = step.status === 'waiting';
        const isLast = idx === steps.length - 1;
        const accentColor = isDone ? '#059669' : isRunning ? '#3B82F6' : '#9CA3AF';
        const bgColor = isDone ? '#ECFDF5' : isRunning ? '#EFF6FF' : '#F9FAFB';
        const borderColor = isDone ? '#6EE7B7' : isRunning ? '#93C5FD' : '#E5E7EB';

        return (
          <div key={step.step} style={{ display: 'flex', gap: 0 }}>
            {/* Left track: avatar + connector */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 36, flexShrink: 0 }}>
              {/* Avatar */}
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: bgColor,
                border: `2px solid ${accentColor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, zIndex: 1, position: 'relative',
                boxShadow: isRunning ? '0 0 0 4px rgba(59,130,246,0.12)' : 'none',
                transition: 'all 0.3s',
              }}>
                {isDone ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : isRunning ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"
                    style={{ animation: 'spin 1.2s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
                    <path d="M21 3v5h-5"/>
                  </svg>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF' }}>
                    {step.agentName?.charAt(0) ?? '·'}
                  </span>
                )}
                {/* Pulse ring when running */}
                {isRunning && (
                  <span style={{
                    position: 'absolute', inset: -5,
                    borderRadius: '50%', border: '1.5px solid rgba(59,130,246,0.4)',
                    animation: 'pulseRing 1.8s ease-out infinite',
                  }} />
                )}
              </div>
              {/* Connector */}
              {!isLast && (
                <div style={{
                  width: 2, flex: 1, minHeight: 12,
                  background: isDone
                    ? 'linear-gradient(to bottom, #6EE7B7, #BBF7D0)'
                    : '#E5E7EB',
                  margin: '3px 0',
                  transition: 'background 0.4s',
                }} />
              )}
            </div>

            {/* Content */}
            <div style={{
              flex: 1,
              paddingLeft: 10,
              paddingBottom: isLast ? 4 : 12,
              paddingTop: 2,
              minWidth: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: isDone ? '#065F46' : isRunning ? '#1D4ED8' : '#6B7280',
                  whiteSpace: 'nowrap' as const,
                  overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120,
                }}>
                  {step.agentName}
                </span>
                <span style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 8,
                  background: bgColor, color: accentColor, border: `1px solid ${borderColor}`,
                  fontWeight: 600, letterSpacing: 0.2, flexShrink: 0,
                }}>
                  {isDone ? t("status_completed") : isRunning ? t("status_running") : t("status_pending")}
                </span>
              </div>
              {step.agentTitle && (
                <div style={{ fontSize: 10, color: '#9CA3AF', lineHeight: 1.4, marginTop: 1 }}>
                  {step.agentTitle}
                </div>
              )}
              {step.label && (
                <div style={{
                  fontSize: 10.5,
                  color: isRunning ? '#2563EB' : isDone ? '#6B7280' : '#D1D5DB',
                  marginTop: 2, lineHeight: 1.3,
                  fontStyle: isWaiting ? 'italic' : 'normal',
                }}>
                  {step.label}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RightPanel({
  missionId, brandId, activeSquad, missionSquadSlug, missionWorkspace,
  width, onWidthChange, squadStepProgress = [],
}: {
  missionId?: number | null;
  brandId?: number | null;
  activeSquad?: DBSquad | null;
  missionSquadSlug?: string | null;
  missionWorkspace?: string | null;
  width?: number;
  onWidthChange?: (w: number) => void;
  squadStepProgress?: SquadStepProgress[];
}) {
  const { t } = useLang();
  // ── Resolve squad: prefer chip selection, fall back to stored slug ──────────
  const slugQuery = trpc.squad.getSquadBySlug.useQuery(
    { slug: missionSquadSlug ?? "" },
    { enabled: !activeSquad && !!missionSquadSlug, staleTime: 60_000, refetchOnWindowFocus: false }
  );
  const effectiveSquad: DBSquad | null = activeSquad ?? (slugQuery.data as any) ?? null;

  // ── Fetch agents + workflow steps when a squad is selected ─────────────────
  const agentsQuery = trpc.squad.getMembersById.useQuery(
    { squadId: effectiveSquad?.squadId ?? 0 },
    { enabled: !!effectiveSquad?.squadId, staleTime: 5 * 60_000, refetchOnWindowFocus: false }
  );
  const agentsData = agentsQuery.data as any;

  // ── Fetch brand brain item count to auto-open section ────────────────────
  const brandBrainCountQuery = (trpc as any).brandBrain?.list?.useQuery
    ? (trpc as any).brandBrain.list.useQuery(
        { brandId: brandId! },
        { enabled: !!brandId, staleTime: 60_000, refetchOnWindowFocus: false }
      )
    : { data: null };
  const brandBrainCount = ((brandBrainCountQuery.data as any[]) ?? []).length;

  // Auto-open brandbrain when it has data
  useEffect(() => {
    if (brandBrainCount > 0) {
      setOpenSections(prev => prev.brandbrain ? prev : { ...prev, brandbrain: true });
    }
  }, [brandBrainCount]);

  // ── Fetch alternative squad leads ──────────────────────────────────────────
  const alternativesQuery = trpc.squad.getAlternativeLeads.useQuery(
    { workspace: missionWorkspace ?? "strategy", excludeSquadId: effectiveSquad?.squadId, limit: 6 },
    { enabled: !!effectiveSquad, staleTime: 5 * 60_000, refetchOnWindowFocus: false }
  );
  const alternatives = (alternativesQuery.data ?? []) as any[];

  // ── Poll current squad session step (for live sidebar highlighting) ─────────
  const sessionStepQuery = trpc.squad.getSessionStep.useQuery(
    { missionId: missionId ?? 0 },
    {
      enabled: !!missionId && !!effectiveSquad,
      // Poll every 3s. React Query v5: refetchInterval callback receives Query object.
      refetchInterval: (query: any) => {
        const status = (query?.state?.data as any)?.status;
        return status === "complete" ? 15_000 : 3_000;
      },
      refetchOnWindowFocus: false,
    }
  );
  const activeStep = (sessionStepQuery.data as any)?.currentStep as number | undefined;
  // Per-step conclusions saved by saveStepResultOnly (keyed by stepOrder as string)
  const stepResults = ((sessionStepQuery.data as any)?.stepResults ?? {}) as Record<string, string>;

  // Merge stepResults into steps[] as `conclusion` so done steps can render a summary.
  // We keep the original agentsData.steps untouched and produce an enriched copy here.
  const enrichedSteps = React.useMemo(() => {
    const raw = (agentsData?.steps ?? []) as any[];
    if (!raw.length) return raw;
    return raw.map((s, i) => {
      const order = s.order ?? s.step ?? i + 1;
      const conclusion = stepResults[String(order)] ?? stepResults[order as any] ?? null;
      return conclusion ? { ...s, conclusion } : s;
    });
  }, [agentsData?.steps, stepResults]);

  // ── Accordion ──────────────────────────────────────────────────────────────
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({
    requirements: true, sop: false, agents: false, alternatives: false, brandbrain: false,
  });
  // ── Hidden sections (X-button closed — re-add via panel picker) ────────────
  const [hiddenSections, setHiddenSections] = React.useState<Record<string, boolean>>({});
  // ── Section priority (floats a section to top when user action triggers it)
  const [sectionPriority, setSectionPriority] = React.useState<string | null>(null);

  // ── Section picker dropdown state
  const [showSectionPicker, setShowSectionPicker] = React.useState(false);
  const pickerRef = React.useRef<HTMLDivElement>(null);

  const handleSectionPriority = React.useCallback((key: string) => {
    setSectionPriority(key);
    setOpenSections(prev => ({ ...prev, [key]: true }));
    // Auto-reset after 30s so the panel returns to normal order
    setTimeout(() => setSectionPriority(null), 30_000);
  }, []);

  // Click-outside handler: close picker dropdown
  useEffect(() => {
    if (!showSectionPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowSectionPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSectionPicker]);

  // Listen to global section-priority events (from BrandBrainBar, SaveToBrainButton, @mention)
  useEffect(() => {
    const handler = (e: CustomEvent) => handleSectionPriority(e.detail?.key);
    window.addEventListener("section-priority" as any, handler);
    return () => window.removeEventListener("section-priority" as any, handler);
  }, [handleSectionPriority]);

  useEffect(() => {
    // Preserve brandbrain open state across squad changes — it's brand-specific, not squad-specific
    if (effectiveSquad) {
      // Squad chosen but not yet executing: open sop/validation/agents/requirements
      setOpenSections(prev => ({ sop: true, validation: true, agents: true, requirements: true, alternatives: true, brandbrain: prev.brandbrain ?? false }));
    } else {
      setOpenSections(prev => ({ requirements: true, sop: false, agents: false, alternatives: false, brandbrain: prev.brandbrain ?? false }));
    }
  }, [effectiveSquad?.squadId]);

  // When squad execution starts: focus on SOP + agents; collapse the rest
  useEffect(() => {
    if (squadStepProgress.length > 0) {
      setOpenSections((prev) => ({
        ...prev,
        sop: true,
        agents: true,
        validation: false,
        requirements: false,
        brandbrain: false,
      }));
    }
  }, [squadStepProgress.length > 0]);

  const toggleSection = (key: string) =>
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const emptyHint = (text: string) => (
    <div style={{ padding: "16px 8px", textAlign: "center", color: "#C5C5C0", fontSize: 11, lineHeight: 1.8 }}>
      {text}
    </div>
  );

  // Order when a squad is selected: 執行流程 → 商業驗證 → 協作成員 → 任務需求 → 品牌大腦
  const baseSections = [
    {
      key: "sop",
      label: t("section_workflow"),
      content: effectiveSquad
        ? <DBSquadMethodologyPanel
            squadName={agentsData?.squadName ?? effectiveSquad.name}
            description={effectiveSquad.description ?? ""}
            methodology={agentsData?.methodology ?? (effectiveSquad as any).methodology ?? ""}
            leadTitle={agentsData?.lead?.title ?? effectiveSquad.lead?.title ?? ""}
            steps={enrichedSteps}
            showcases={agentsData?.showcases ?? []}
            isLoading={agentsQuery.isLoading}
            activeStep={activeStep}
          />
        : emptyHint("選擇執行方式\n查看對應流程"),
    },
    // Commercial Validation — only shown when squad has showcases
    ...((agentsData?.showcases ?? []).length > 0 ? [{
      key: "validation",
      label: t("section_commercial_validation"),
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(agentsData?.showcases ?? []).map((sc: any, i: number) => (
            <div key={i} style={{
              background: "#FAFAF9",
              border: "1px solid #E7E5E4",
              borderLeft: "3px solid #D6B96B",
              borderRadius: 6,
              padding: "9px 10px",
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#1A1A18", marginBottom: 3 }}>
                {sc.company ?? sc.brand ?? "案例"}
              </div>
              {sc.result && (
                <div style={{ fontSize: 11, color: "#6B6A66", lineHeight: 1.5, marginBottom: 3 }}>
                  {sc.result}
                </div>
              )}
              {sc.description && (
                <div style={{ fontSize: 10, color: "#9B9990", lineHeight: 1.4 }}>
                  {sc.description}
                </div>
              )}
              {sc.source && (
                <div style={{ fontSize: 9, color: "#B5B4B0", marginTop: 4, fontStyle: "italic" }}>
                  {sc.source}
                </div>
              )}
            </div>
          ))}
        </div>
      ),
    }] : []),
    {
      key: "agents",
      label: t("section_agents"),
      content: (
        <div>
          {effectiveSquad
            ? <DBAgentMembersList
                lead={agentsData?.lead ?? null}
                agents={agentsData?.agents ?? []}
                steps={agentsData?.steps ?? []}
                isLoading={agentsQuery.isLoading}
                activeStep={activeStep}
              />
            : emptyHint("選擇執行方式\n查看協作成員")}
        </div>
      ),
    },
    {
      key: "requirements",
      label: t("section_task_requirements"),
      content: (
        <SquadRequirementsPanel
          missionId={missionId}
          squadSlug={effectiveSquad?.slug ?? null}
          workspace={missionWorkspace ?? null}
        />
      ),
    },
    // "備選專家" section removed by user request (2026-04-20). Query + renderer
    // are left in place below in case we revive it later.
    {
      key: "brandbrain",
      label: t("section_brand_brain"),
      content: <BrandBrainTab brandId={brandId} />,
    },
  ];

  // Dynamic section ordering: lift prioritized section to top
  const orderedSections = sectionPriority
    ? [
        ...baseSections.filter(s => s.key === sectionPriority),
        ...baseSections.filter(s => s.key !== sectionPriority),
      ]
    : baseSections;
  // Filter out hidden (X-button closed) sections — re-add via panel picker
  const sections = orderedSections.filter(s => !hiddenSections[s.key]);

  const panelWidth = width ?? 264;

  const RP_TILE = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">
  <circle cx="24" cy="24" r="2" fill="#1A1A18" opacity="0.10"/>
  <circle cx="24" cy="0" r="1.3" fill="#1A1A18" opacity="0.06"/>
  <circle cx="24" cy="48" r="1.3" fill="#1A1A18" opacity="0.06"/>
  <circle cx="0" cy="24" r="1.3" fill="#1A1A18" opacity="0.06"/>
  <circle cx="48" cy="24" r="1.3" fill="#1A1A18" opacity="0.06"/>
  <circle cx="0" cy="0" r="1" fill="#1A1A18" opacity="0.04"/>
  <circle cx="48" cy="0" r="1" fill="#1A1A18" opacity="0.04"/>
  <circle cx="0" cy="48" r="1" fill="#1A1A18" opacity="0.04"/>
  <circle cx="48" cy="48" r="1" fill="#1A1A18" opacity="0.04"/>
  <line x1="24" y1="22" x2="24" y2="1.3" stroke="#1A1A18" stroke-width="0.6" opacity="0.05"/>
  <line x1="24" y1="26" x2="24" y2="46.7" stroke="#1A1A18" stroke-width="0.6" opacity="0.05"/>
  <line x1="22" y1="24" x2="1.3" y2="24" stroke="#1A1A18" stroke-width="0.6" opacity="0.05"/>
  <line x1="26" y1="24" x2="46.7" y2="24" stroke="#1A1A18" stroke-width="0.6" opacity="0.05"/>
</svg>`;
  const RP_PATTERN = `url("data:image/svg+xml,${encodeURIComponent(RP_TILE)}")`;

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      const next = Math.max(200, Math.min(540, startW + delta));
      onWidthChange?.(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div style={{
      width: panelWidth, minWidth: 200,
      background: "#FAFAF9",
      borderLeft: "1px solid #E4E3E1",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      position: "relative" as const,
      flexShrink: 0,
    }}>
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        style={{
          position: "absolute" as const, left: 0, top: 0, bottom: 0, width: 4,
          cursor: "col-resize", zIndex: 10,
          background: "transparent",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(26,26,24,0.08)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
      />
      {/* ── Compact panel header ── */}
      <div style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 8px 5px 12px",
        borderBottom: "1px solid #E4E3E1",
        background: "rgba(250,250,249,0.95)",
      }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: "#9B9990", letterSpacing: "0.03em" }}>
          {t("section_tools_panel")}
        </span>
        <div style={{ position: "relative" }} ref={pickerRef}>
          <button
            onClick={() => setShowSectionPicker(p => !p)}
            title="選擇顯示的面板"
            style={{
              padding: "2px 8px",
              borderRadius: 5,
              border: "1px solid #E4E3E1",
              fontSize: 10.5, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
              background: showSectionPicker ? "rgba(26,26,24,0.08)" : "transparent",
              color: "#6B6A66",
              display: "flex", alignItems: "center", gap: 4,
            }}
            onMouseEnter={e => { if (!showSectionPicker) (e.currentTarget as HTMLButtonElement).style.background = "rgba(26,26,24,0.05)"; }}
            onMouseLeave={e => { if (!showSectionPicker) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            {t("tools_panel_pill")}
          </button>
          {showSectionPicker && (
            <div style={{
              position: "absolute", right: 0, top: "calc(100% + 4px)",
              background: "#FFFFFF",
              border: "1px solid #E4E3E1",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)",
              zIndex: 50,
              minWidth: 150,
              padding: "4px 0",
            }}>
              {baseSections.map((section) => {
                const isVisible = !hiddenSections[section.key];
                return (
                  <button
                    key={section.key}
                    onClick={() => {
                      const willBeVisible = !isVisible;
                      setHiddenSections(prev => ({ ...prev, [section.key]: !willBeVisible }));
                      if (willBeVisible) {
                        // Re-showing a closed section: expand it and scroll into view
                        setOpenSections(prev => ({ ...prev, [section.key]: true }));
                        setTimeout(() => {
                          const el = document.getElementById(`rp-section-${section.key}`);
                          el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        }, 50);
                      }
                      setShowSectionPicker(false);
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      width: "100%",
                      padding: "6px 12px",
                      background: "transparent", border: "none",
                      cursor: "pointer", fontFamily: "inherit",
                      fontSize: 11,
                      color: isVisible ? "#1A1A18" : "#9B9990",
                      fontWeight: isVisible ? 500 : 400,
                      textAlign: "left",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(26,26,24,0.05)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  >
                    {/* Checkbox — checked = visible in panel */}
                    <span style={{
                      width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                      border: `1.5px solid ${isVisible ? "#1A1A18" : "#C8C7C3"}`,
                      background: isVisible ? "#1A1A18" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {isVisible && <span style={{ color: "#FFFFFF", fontSize: 9, lineHeight: 1 }}>✓</span>}
                    </span>
                    {section.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Section cards ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px 12px" }} className="right-panel-scroll">
        {sections.map((section, idx) => {
          const isPriority = section.key === sectionPriority && idx === 0;
          const isOpen = !!openSections[section.key];
          return (
            <div
              id={`rp-section-${section.key}`}
              key={section.key}
              style={{
                marginBottom: 8,
                borderRadius: 8,
                border: `1px solid ${isPriority ? "#E8C99A" : "#E0DFDb"}`,
                overflow: "hidden",
                boxShadow: isPriority
                  ? "0 2px 10px rgba(201,130,58,0.12), 0 1px 3px rgba(0,0,0,0.06)"
                  : "0 1px 6px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)",
                position: "relative",
                transition: "box-shadow 0.25s, border-color 0.25s",
              }}>
              {/* Neural pattern background */}
              <div style={{
                position: "absolute", inset: 0,
                backgroundImage: RP_PATTERN,
                backgroundSize: "48px 48px",
                backgroundRepeat: "repeat",
                pointerEvents: "none",
              }} />
              {/* Frosted overlay */}
              <div style={{
                position: "absolute", inset: 0,
                background: isPriority ? "rgba(255,251,245,0.94)" : "rgba(250,250,249,0.94)",
                pointerEvents: "none",
                transition: "background 0.25s",
              }} />

              {/* ── Panel header ── */}
              <div style={{
                position: "relative",
                display: "flex", alignItems: "center",
                borderBottom: isOpen ? `1px solid ${isPriority ? "#F0DFC0" : "#ECEAE8"}` : "none",
              }}>
                {/* Toggle button (takes most of the width) */}
                <button
                  onClick={() => toggleSection(section.key)}
                  style={{
                    flex: 1,
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 8px 8px 10px",
                    background: "transparent", border: "none",
                    cursor: "pointer", fontFamily: "inherit",
                    userSelect: "none", textAlign: "left",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(26,26,24,0.04)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  {/* Dot */}
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                    background: isPriority ? "#C9823A" : (isOpen ? "#1A1A18" : "#C8C7C3"),
                    opacity: isPriority ? 1 : (isOpen ? 0.5 : 0.35),
                    transition: "background 0.2s, opacity 0.2s",
                  }} />
                  {/* Label */}
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: isPriority ? "#C9823A" : (isOpen ? "#1A1A18" : "#6B6A66"),
                    letterSpacing: "0.02em", flex: 1,
                    transition: "color 0.2s",
                  }}>
                    {section.label}
                  </span>
                  {/* Chevron */}
                  <svg
                    width="11" height="11" viewBox="0 0 24 24" fill="none"
                    stroke={isPriority ? "#C9823A" : "#9B9990"} strokeWidth="2.5" strokeLinecap="round"
                    style={{
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease", flexShrink: 0,
                    }}
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>

                {/* X close button — hide section entirely (re-add via 面板 picker) */}
                <button
                  onClick={() => setHiddenSections(prev => ({ ...prev, [section.key]: true }))}
                  title="關閉此面板（可從上方「面板」重新開啟）"
                  style={{
                    flexShrink: 0,
                    width: 24, height: 32,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "transparent", border: "none",
                    cursor: "pointer", color: "#C8C7C3",
                    fontSize: 14, lineHeight: 1,
                    paddingRight: 6,
                    opacity: isOpen ? 1 : 0.4,
                    transition: "color 0.15s, opacity 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#9B9990"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#C8C7C3"; }}
                >
                  ×
                </button>
              </div>

              {/* ── Section body — independent scroll ── */}
              {/* sop expands to full content height — the outer right panel scrolls. */}
              {/* Other sections keep a cap so any single one can't dominate. */}
              {isOpen && (
                <div style={{
                  position: "relative",
                  maxHeight: section.key === "sop" ? undefined : 300,
                  overflowY: section.key === "sop" ? "visible" : "auto",
                  overscrollBehavior: "contain",
                  padding: "10px 12px 12px",
                }}>
                  {section.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DBSquadMethodologyPanel ──────────────────────────────────────────────────
// Renders methodology steps from squad_workflow_templates (real DB data)

function DBSquadMethodologyPanel({
  squadName, description, methodology, leadTitle, steps, showcases, isLoading, activeStep,
}: {
  squadName: string;
  description: string;
  methodology: string;
  leadTitle: string;
  steps: any[];
  showcases: any[];
  isLoading: boolean;
  activeStep?: number; // 0 = lead intake, 1+ = workflow steps
}) {
  const { t } = useLang();
  return (
    <div>
      {/* Squad header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A18", marginBottom: 2 }}>
          {squadName}
        </div>

        {description && (
          <div style={{ fontSize: 11, color: "#6B6A66", lineHeight: 1.5 }}>{description}</div>
        )}
        {methodology && (
          <div style={{
            marginTop: 6, fontSize: 10, color: "#9B9990",
            background: "#F4F4F2", borderRadius: 4, padding: "3px 7px",
            display: "inline-block", fontStyle: "italic",
            letterSpacing: 0.2,
          }}>
            {methodology}
          </div>
        )}
      </div>

      <div style={{ height: 1, background: "#E7E5E4", marginBottom: 12 }} />

      {/* Steps — Timeline style */}
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ height: 36, background: "#F2F1EF", borderRadius: 8, opacity: 0.6, animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
      ) : steps.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {steps.map((step: any, i: number) => {
            const stepNum = step.step ?? i + 1;
            const isActive = activeStep !== undefined && activeStep > 0 && activeStep === stepNum;
            const isDone   = activeStep !== undefined && activeStep > stepNum;
            const isLast   = i === steps.length - 1;
            const title    = step.title ?? step.name ?? step.skill ?? step.role_key ?? `步驟 ${i + 1}`;
            // "conclusion" = real execution output if present, else description as fallback.
            // Raw LLM output may contain markdown — strip common markers so the 2-line clamp reads cleanly.
            const rawConclusion: string | null = step.conclusion ?? step.output ?? step.result ?? step.description ?? null;
            const conclusion = rawConclusion
              ? rawConclusion
                  .replace(/^#{1,6}\s+/gm, "")      // drop heading markers
                  .replace(/^\s*[-*•]\s+/gm, "")    // drop bullet markers
                  .replace(/\*\*|__/g, "")           // drop bold markers
                  .replace(/`+/g, "")                // drop code ticks
                  .replace(/\s+/g, " ")              // collapse whitespace/newlines
                  .trim()
                  .slice(0, 240)
              : null;

            // ── Node (left track) — sized by state
            const nodeSize = isActive ? 28 : isDone ? 22 : 18;
            const nodeColor = isActive ? "#0A6EFA" : isDone ? "#059669" : "#C8C7C3";
            const nodeBg    = isActive ? "#EFF6FF" : isDone ? "#ECFDF5" : "#FAFAF9";
            const trackWidth = 30;

            return (
              <div key={i} style={{ display: "flex", alignItems: "stretch" }}>
                {/* Left track */}
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  width: trackWidth, flexShrink: 0, paddingTop: isActive ? 2 : 1,
                }}>
                  <div style={{
                    width: nodeSize, height: nodeSize, borderRadius: "50%",
                    background: nodeBg,
                    border: `${isActive ? 2.5 : 2}px solid ${nodeColor}`,
                    color: nodeColor,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: isActive ? 12 : 10, fontWeight: 700, flexShrink: 0,
                    boxShadow: isActive ? "0 0 0 5px rgba(10,110,250,0.12)" : "none",
                    transition: "all 0.3s",
                    zIndex: 1,
                  }}>
                    {isDone ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={nodeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    ) : isActive ? (
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: "#0A6EFA", display: "inline-block",
                        animation: "pulse 1.2s infinite",
                      }} />
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#9B9990" }}>{stepNum}</span>
                    )}
                  </div>
                  {!isLast && (
                    <div style={{
                      width: 2, flex: 1, minHeight: isActive ? 14 : 8,
                      background: isDone ? "#A7F3D0" : "#E4E3E1",
                      margin: "3px 0",
                      transition: "background 0.4s",
                    }} />
                  )}
                </div>

                {/* Content — differs by state */}
                <div style={{ flex: 1, paddingLeft: 10, paddingBottom: isLast ? 2 : (isActive ? 14 : 6), minWidth: 0 }}>
                  {isActive ? (
                    // ── ACTIVE ── large highlighted card
                    <div style={{
                      background: "linear-gradient(180deg, #EFF6FF 0%, #F8FBFF 100%)",
                      border: "1px solid #BFDBFE",
                      borderLeft: "3px solid #0A6EFA",
                      borderRadius: 8,
                      padding: "10px 12px 12px",
                      boxShadow: "0 1px 4px rgba(10,110,250,0.08)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{
                          fontSize: 9.5, fontWeight: 700, color: "#0A6EFA",
                          letterSpacing: 0.5, textTransform: "uppercase",
                          background: "#DBEAFE", padding: "1.5px 6px", borderRadius: 3,
                          display: "inline-flex", alignItems: "center", gap: 3,
                        }}>
                          <span style={{
                            width: 5, height: 5, borderRadius: "50%", background: "#0A6EFA",
                            animation: "pulse 1.2s infinite",
                          }} />
                          {t("status_running")}
                        </span>
                        <span style={{ fontSize: 10, color: "#6B6A66" }}>{t("step_prefix")} {stepNum}</span>
                      </div>
                      <div style={{
                        fontSize: 14, fontWeight: 700, color: "#0A4FAA",
                        marginBottom: 6, lineHeight: 1.35, letterSpacing: 0.2,
                      }}>
                        {title}
                      </div>
                      {step.description && (
                        <div style={{ fontSize: 11.5, color: "#1F2937", lineHeight: 1.6 }}>
                          {step.description}
                        </div>
                      )}
                    </div>
                  ) : isDone ? (
                    // ── DONE ── title + conclusion (dim)
                    <div style={{ paddingTop: 1 }}>
                      <div style={{
                        fontSize: 11.5, fontWeight: 600, color: "#059669",
                        marginBottom: conclusion ? 2 : 0, letterSpacing: 0.1,
                      }}>
                        {title}
                      </div>
                      {conclusion && (
                        <div style={{
                          fontSize: 10.5, color: "#6B7280",
                          lineHeight: 1.5,
                          display: "-webkit-box", WebkitLineClamp: 2 as any, WebkitBoxOrient: "vertical" as any,
                          overflow: "hidden",
                        }}>
                          {conclusion}
                        </div>
                      )}
                    </div>
                  ) : (
                    // ── UPCOMING ── title only, compact
                    <div style={{
                      fontSize: 11.5, fontWeight: 500, color: "#6B6A66",
                      paddingTop: 2, letterSpacing: 0.1,
                    }}>
                      {title}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "#C8C7C3", textAlign: "center", padding: "12px 0" }}>
          {t("squad_no_workflow")}
        </div>
      )}

      {/* showcases moved to dedicated "validation" section in RightPanel */}
    </div>
  );
}

// ─── DBAgentMembersList ───────────────────────────────────────────────────────
// Renders real DB agents: lead (teal card) + members

function DBAgentMembersList({
  lead, agents, steps, isLoading, activeStep,
}: {
  lead: any | null;
  agents: any[];
  steps?: any[];   // enriched steps from getMembersById
  isLoading: boolean;
  activeStep?: number; // 0 = lead active, 1+ = agent at that step index
}) {
  const { t } = useLang();
  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ height: 68, background: "#F2F1EF", borderRadius: 8, opacity: 0.6 }} />
        ))}
      </div>
    );
  }

  const allMembers = [lead, ...agents].filter(Boolean);

  if (!allMembers.length) {
    return (
      <div style={{ padding: "12px 0", textAlign: "center", fontSize: 11, color: "#C8C7C3" }}>
        {t("squad_no_agents")}
      </div>
    );
  }

  const AGENT_AVATAR_COLORS = ["#0A6EFA", "#E8631A", "#7C3AED", "#059669", "#DC2626", "#0891B2"];

  // Build agentId → steps[] map for step assignment badges
  const stepsByAgent = React.useMemo(() => {
    const map: Record<number, { order: number; name: string; primarySkill: string | null; aiModel: string | null }[]> = {};
    if (steps && steps.length > 0) {
      for (const step of steps) {
        const id: number | null = step.assignedAgentId ?? null;
        if (id != null) {
          if (!map[id]) map[id] = [];
          map[id].push({
            order: step.order ?? step.step ?? 0,
            name:  step.name ?? step.title ?? "",
            primarySkill: step.assignedAgentPrimarySkill ?? null,
            aiModel:      step.assignedAgentAiModel      ?? null,
          });
        }
      }
    }
    return map;
  }, [steps]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {allMembers.map((agent: any, i: number) => {
        const isActive = activeStep !== undefined && (
          (agent.isLead && activeStep === 0) ||
          (!agent.isLead && activeStep === i)
        );
        const isDone = activeStep !== undefined && !agent.isLead && activeStep > i;
        const avatarColor = isDone ? "#9B9990" : isActive ? "#0A6EFA" : AGENT_AVATAR_COLORS[i % AGENT_AVATAR_COLORS.length];
        const assignedSteps = stepsByAgent[agent.agentId] ?? [];

        return (
          <div
            key={agent.agentId ?? i}
            style={{
              padding: "8px 10px",
              background: isActive ? "#EFF6FF" : agent.isLead ? "#F0FDF4" : "#FFFFFF",
              border: `1px solid ${isActive ? "#BFDBFE" : agent.isLead ? "#BBF7D0" : "#E4E3E1"}`,
              borderRadius: 8,
              transition: "all 0.3s",
              boxShadow: isActive ? "0 0 0 2px rgba(10,110,250,0.08)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Avatar with avatar URL support */}
              {agent.avatarUrl ? (
                <img src={agent.avatarUrl} alt={agent.name}
                  style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `2px solid ${avatarColor}22` }} />
              ) : (
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: isDone ? "#ECFDF5" : isActive ? "#EFF6FF" : "#F2F1EF",
                  border: `2px solid ${avatarColor}`,
                  color: avatarColor, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0,
                  boxShadow: isActive ? "0 0 0 4px rgba(10,110,250,0.1)" : "none",
                  transition: "all 0.3s",
                }}>
                  {isDone ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={avatarColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (agent.name ?? "A").charAt(0)}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? "#0A6EFA" : "#1A1A18" }}>
                    {agent.name}
                  </span>
                  {agent.isLead && (
                    <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "#DCFCE7", color: "#059669", fontWeight: 600 }}>
                      Lead
                    </span>
                  )}
                  {isActive && (
                    <span style={{
                      fontSize: 9, padding: "1px 5px", borderRadius: 4,
                      background: "#EFF6FF", color: "#2563EB", fontWeight: 600,
                      display: "inline-flex", alignItems: "center", gap: 2,
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#3B82F6", display: "inline-block", animation: "pulse 1.2s infinite" }} />
                      {t("status_running")}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: "#9B9990", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {agent.title}
                </div>
              </div>
            </div>
            {/* Skill + model chips */}
            {(agent.primarySkill || agent.aiModel) && (
              <div style={{ display: "flex", gap: 3, marginTop: 5, flexWrap: "wrap" as const }}>
                {agent.primarySkill && (
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: "#F0F4FF", color: "#4A6FA5", border: "1px solid #D0DCEF" }}>
                    {agent.primarySkill}
                  </span>
                )}
                {agent.aiModel && (
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: "#F5F0FF", color: "#6B4FA5", border: "1px solid #DDD0EF" }}>
                    {fmtModel(agent.aiModel)}
                  </span>
                )}
              </div>
            )}
            {/* Step assignment rows — shows which step(s) this agent handles */}
            {assignedSteps.length > 0 && (
              <div style={{ marginTop: 6, borderTop: "1px solid #F0EFED", paddingTop: 5, display: "flex", flexDirection: "column", gap: 3 }}>
                {assignedSteps.map((s) => (
                  <div key={s.order} style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                    <span style={{
                      flexShrink: 0,
                      fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                      background: isActive ? "#DBEAFE" : "#F2F1EF",
                      color: isActive ? "#2563EB" : "#7C7B77",
                      marginTop: 1,
                    }}>
                      Step {s.order}
                    </span>
                    <span style={{ fontSize: 9, color: "#5A5955", lineHeight: 1.4, flex: 1, minWidth: 0 }}>
                      {s.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── DBAlternativesList ────────────────────────────────────────────────────────
// Renders alternative squad lead agents from other squads

function DBAlternativesList({ alternatives, isLoading }: { alternatives: any[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[1,2,3].map(i => (
          <div key={i} style={{ height: 56, background: "#F2F1EF", borderRadius: 8, opacity: 0.6 }} />
        ))}
      </div>
    );
  }

  if (!alternatives.length) {
    return (
      <div style={{ padding: "12px 0", textAlign: "center", fontSize: 11, color: "#C8C7C3" }}>
        無備選專家資料
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {alternatives.map((alt: any, i: number) => (
        <div
          key={alt.agentId ?? i}
          style={{
            padding: "10px 10px", background: "#FFFFFF",
            border: "1px solid #E7E5E4", borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: "#1A1A18", marginBottom: 2 }}>
            {alt.name}
          </div>
          <div style={{ fontSize: 10, color: "#6B6A66", marginBottom: 6 }}>
            {alt.title}
            {alt.squadName && (
              <span style={{ color: "#B0AFA9" }}> · {alt.squadName}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
            {alt.primarySkill && (
              <span style={{
                fontSize: 10, padding: "2px 7px", borderRadius: 20,
                background: "#F5F5F4", color: "#6B6A66", border: "1px solid #E4E3E1",
              }}>
                {alt.primarySkill}
              </span>
            )}
            {alt.aiModel && (
              <span style={{
                fontSize: 10, padding: "2px 7px", borderRadius: 20,
                background: "#F5F5F4", color: "#6B6A66", border: "1px solid #E4E3E1",
              }}>
                {alt.aiModel}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── SquadRequirementsPanel ───────────────────────────────────────────────────
// Three-section layout: 🔍 基本資訊 / 🔑 平台授權 / 📤 成果交付
// Users provide facts + connect platforms + choose output channels.
// Market research, competitor analysis, audience data = agents' job.

const SECTION_ORDER = ["identity", "access", "output"] as const;
const SECTION_META: Record<string, { icon: string; titleKey: string; subKey: string }> = {
  identity: { icon: "🔍", titleKey: "section_basic_info",    subKey: "section_basic_info_sub" },
  access:   { icon: "🔑", titleKey: "section_platform_auth", subKey: "section_platform_auth_sub" },
  output:   { icon: "📤", titleKey: "section_deliverables",  subKey: "section_deliverables_sub" },
};

/** For oauth/output items: display a "連結" action button */
function isActionType(type: string) {
  return type === "oauth" || type === "output";
}

/** Placeholder label for a provider */
function providerActionLabel(type: string, provider?: string) {
  if (type === "output") {
    if (provider === "email") return "輸入 Email";
    if (provider === "line")  return "輸入 LINE ID";
    return "授權連結";
  }
  return "連結帳戶";
}

/** Inline edit placeholder text */
function actionPlaceholder(type: string, provider?: string) {
  if (provider === "email") return "收件地址 example@email.com";
  if (provider === "line")  return "LINE ID 或手機號碼";
  if (type === "output")    return "貼上授權 Token（暫時）";
  return "貼上 API Key 或 Access Token（暫時）";
}

function SquadRequirementsPanel({
  missionId,
  squadSlug,
  workspace,
}: {
  missionId?: number | null;
  squadSlug?: string | null;
  workspace?: string | null;
}) {
  const { t } = useLang();
  const requirementsQuery = (trpc as any).squad?.getRequirements?.useQuery
    ? (trpc as any).squad.getRequirements.useQuery(
        { squadSlug: squadSlug ?? "", workspace: workspace ?? undefined },
        { staleTime: 5 * 60_000, refetchOnWindowFocus: false }
      )
    : { data: null };

  const valuesQuery = (trpc as any).mission?.getRequirementValues?.useQuery
    ? (trpc as any).mission.getRequirementValues.useQuery(
        { missionId: missionId!, squadSlug: squadSlug ?? "" },
        { enabled: !!missionId && !!squadSlug, staleTime: 5_000, refetchOnWindowFocus: false }
      )
    : { data: null, refetch: () => {} };

  const setValueMutation = (trpc as any).mission?.setRequirementValue?.useMutation
    ? (trpc as any).mission.setRequirementValue.useMutation({
        onSuccess: () => (valuesQuery as any).refetch?.(),
      })
    : { mutate: () => {}, isPending: false };

  const config       = requirementsQuery.data as any;
  const requirements: any[] = config?.requirements ?? [];
  const outputs: Record<string, string[]> = config?.outputs ?? {};
  const values: Record<string, string>    = (valuesQuery.data as any) ?? {};

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");

  const startEdit = (id: string) => { setEditingId(id); setEditValue(values[id] ?? ""); };
  const cancelEdit = () => setEditingId(null);
  const commitEdit = (id: string) => {
    if (missionId && squadSlug && editValue.trim()) {
      setValueMutation.mutate({ missionId, squadSlug, requirementId: id, value: editValue.trim() });
    }
    setEditingId(null);
  };

  const totalCount    = requirements.length;
  const filledCount   = requirements.filter((r: any) => !!values[r.id]?.trim()).length;
  const reqDone       = requirements.filter((r: any) => r.required && !!values[r.id]?.trim()).length;
  const reqTotal      = requirements.filter((r: any) => r.required).length;
  const unlockedGates = new Set(requirements.filter((r: any) => !!values[r.id]?.trim()).map((r: any) => `with_${r.id}`));

  // Group by section, fallback to identity
  const bySection: Record<string, any[]> = { identity: [], access: [], output: [] };
  for (const req of requirements) {
    const s = req.section ?? "identity";
    if (bySection[s]) bySection[s].push(req);
    else bySection.identity.push(req);
  }

  // ── Empty states ─────────────────────────────────────────────────────────
  if (!missionId) return (
    <div style={{ padding: "16px 4px", textAlign: "center" as const, color: "#C5C4C0", fontSize: 11, lineHeight: 1.8 }}>
      選擇任務後<br />查看需求清單
    </div>
  );
  if (!squadSlug) return (
    <div style={{ padding: "14px 4px", textAlign: "center" as const, color: "#C5C4C0", fontSize: 11, lineHeight: 1.8 }}>
      選擇一個 Squad<br />查看所需資料清單
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Progress header ── */}
      {totalCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1, height: 3, background: "#EEEDE9", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 2, transition: "width 0.35s",
              background: reqDone >= reqTotal && reqTotal > 0 ? "#10B981" : "#5B7FDB",
              width: `${totalCount ? Math.round(filledCount / totalCount * 100) : 0}%`,
            }} />
          </div>
          <span style={{ fontSize: 10, color: "#9B9990", whiteSpace: "nowrap" as const, flexShrink: 0 }}>
            {filledCount}/{totalCount}{reqTotal > 0 && reqDone >= reqTotal ? " ✓" : ""}
          </span>
        </div>
      )}

      {/* ── Three sections ── */}
      {SECTION_ORDER.map(sectionKey => {
        const items = bySection[sectionKey] ?? [];
        if (items.length === 0) return null;
        const meta = SECTION_META[sectionKey];
        return (
          <div key={sectionKey} style={{ marginBottom: 12 }}>
            {/* Section header */}
            <div style={{
              display: "flex", alignItems: "baseline", gap: 5,
              marginBottom: 4, paddingBottom: 3,
              borderBottom: "1px solid #EEEDE9",
            }}>
              <span style={{ fontSize: 11 }}>{meta.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#6B6A66" }}>{t(meta.titleKey as any)}</span>
              <span style={{ fontSize: 9, color: "#C5C4C0" }}>{t(meta.subKey as any)}</span>
            </div>

            {/* Items */}
            <div style={{ display: "flex", flexDirection: "column" as const }}>
              {items.map((req: any) => {
                const filled    = !!values[req.id]?.trim();
                const isEditing = editingId === req.id;
                const isAction  = isActionType(req.type);

                return (
                  <div key={req.id}>
                    {/* Row — collapsed */}
                    {!isEditing && (
                      <div
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "5px 2px",
                          borderBottom: "1px solid #F5F4F2",
                          cursor: "pointer",
                        }}
                        onClick={() => startEdit(req.id)}
                        title={req.hint ?? ""}
                      >
                        {/* status icon */}
                        <span style={{
                          fontSize: 12, flexShrink: 0, width: 14, textAlign: "center" as const,
                          color: filled ? "#10B981" : req.required ? "#D1A04A" : "#D0CEC9",
                        }}>
                          {filled ? "✓" : "○"}
                        </span>

                        {/* label */}
                        <span style={{
                          fontSize: 11, color: filled ? "#3A3A38" : "#6B6A66",
                          flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                          fontWeight: filled ? 500 : 400,
                        }}>
                          {req.label}
                          {req.required && !filled && (
                            <span style={{ color: "#E8A838", fontSize: 10, marginLeft: 3 }}>*</span>
                          )}
                        </span>

                        {/* right side: pill if filled, action button or type badge if not */}
                        {filled ? (
                          <span style={{
                            fontSize: 10,
                            color: isAction ? "#059669" : "#059669",
                            background: isAction ? "#F0FDF4" : "#F0FDF4",
                            border: "1px solid #D1FAE5", borderRadius: 10,
                            padding: "0 7px", maxWidth: 90, overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap" as const, flexShrink: 0,
                          }}>
                            {isAction ? (req.provider === "email" || req.provider === "line" ? values[req.id] : "已連結 ✓") : values[req.id]}
                          </span>
                        ) : isAction ? (
                          <span style={{
                            fontSize: 10, color: "#5B7FDB", background: "#EEF2FF",
                            border: "1px solid #C7D2FE", borderRadius: 10,
                            padding: "1px 8px", flexShrink: 0, whiteSpace: "nowrap" as const,
                          }}>
                            🔗 {providerActionLabel(req.type, req.provider)}
                          </span>
                        ) : (
                          <>
                            <span style={{
                              fontSize: 9, color: "#B5B4B0", background: "#F3F2F0",
                              borderRadius: 4, padding: "1px 5px", flexShrink: 0,
                            }}>
                              {req.type}
                            </span>
                            <span style={{ fontSize: 11, color: "#C5C4C0", flexShrink: 0, lineHeight: 1 }}>✎</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Inline edit — expands in place */}
                    {isEditing && (
                      <div style={{
                        padding: "8px 6px 10px", background: "#F9F9F8",
                        borderBottom: "1px solid #E8E7E3",
                        borderLeft: `2px solid ${isAction ? "#10B981" : "#5B7FDB"}`,
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#3A3A38", marginBottom: 6 }}>
                          {req.label}
                          {req.required && <span style={{ color: "#E8A838", marginLeft: 3 }}>*</span>}
                          {req.hint && (
                            <span style={{ fontSize: 10, fontWeight: 400, color: "#9B9990", marginLeft: 6 }}>
                              {req.hint}
                            </span>
                          )}
                        </div>

                        {/* Input control by type */}
                        {req.type === "select" ? (
                          <select
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            autoFocus
                            style={{
                              width: "100%", fontSize: 11, border: "1px solid #D1D5DB",
                              borderRadius: 5, padding: "5px 6px", background: "#FFF", fontFamily: "inherit",
                            }}
                          >
                            <option value="">選擇…</option>
                            {(req.options ?? []).map((o: string) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        ) : req.type === "boolean" ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            {["是", "否"].map(opt => (
                              <button key={opt} onClick={() => setEditValue(opt)} style={{
                                fontSize: 11, border: `1px solid ${editValue === opt ? "#5B7FDB" : "#D1D5DB"}`,
                                borderRadius: 5, padding: "4px 18px", cursor: "pointer",
                                background: editValue === opt ? "#EEF2FF" : "#FFF", fontFamily: "inherit",
                              }}>{opt}</button>
                            ))}
                          </div>
                        ) : isAction ? (
                          /* oauth / output: text input with context-aware placeholder */
                          <input
                            autoFocus
                            type={req.provider === "email" ? "email" : "text"}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            placeholder={actionPlaceholder(req.type, req.provider)}
                            onKeyDown={e => { if (e.key === "Enter") commitEdit(req.id); if (e.key === "Escape") cancelEdit(); }}
                            style={{
                              width: "100%", fontSize: 11, border: "1px solid #A7F3D0",
                              borderRadius: 5, padding: "5px 8px", boxSizing: "border-box" as const,
                              fontFamily: "inherit", outline: "none", background: "#FFF",
                            }}
                          />
                        ) : (
                          <input
                            autoFocus
                            type={req.type === "url" ? "url" : "text"}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            placeholder={req.hint ?? req.label}
                            onKeyDown={e => { if (e.key === "Enter") commitEdit(req.id); if (e.key === "Escape") cancelEdit(); }}
                            style={{
                              width: "100%", fontSize: 11, border: "1px solid #CBD5E1",
                              borderRadius: 5, padding: "5px 8px", boxSizing: "border-box" as const,
                              fontFamily: "inherit", outline: "none", background: "#FFF",
                            }}
                          />
                        )}

                        <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                          <button onClick={() => commitEdit(req.id)} style={{
                            fontSize: 10, background: "#1A1A18", color: "#FFF", border: "none",
                            borderRadius: 5, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit",
                          }}>儲存</button>
                          <button onClick={cancelEdit} style={{
                            fontSize: 10, background: "none", border: "1px solid #E4E3E1",
                            borderRadius: 5, padding: "4px 10px", cursor: "pointer",
                            color: "#6B6A66", fontFamily: "inherit",
                          }}>取消</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ── Outputs ── */}
      {Object.keys(outputs).length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 10, borderTop: "1px solid #EEEDE9" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#9B9990", marginBottom: 6, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>
            交付物
          </div>

          {/* Default always-unlocked chips */}
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
            {(outputs["default"] ?? []).map((item: string, i: number) => (
              <span key={i} style={{
                fontSize: 10, background: "#F3F2F0", color: "#3A3A38",
                borderRadius: 10, padding: "2px 8px", lineHeight: 1.6,
              }}>
                {item}
              </span>
            ))}
          </div>

          {/* Gated — unlocked by connecting a platform or filling an output */}
          {Object.entries(outputs)
            .filter(([gate]) => gate !== "default")
            .map(([gate, items]) => {
              if (!items.length) return null;
              const unlocked   = unlockedGates.has(gate);
              const reqId      = gate.replace(/^with_/, "");
              const matchReq   = requirements.find((r: any) => r.id === reqId);
              const matchLabel = matchReq?.label ?? reqId;
              const isConn     = isActionType(matchReq?.type ?? "");
              return (
                <div key={gate} style={{ marginTop: 7 }}>
                  <div style={{ fontSize: 9, color: unlocked ? "#059669" : "#B5B4B0", marginBottom: 4 }}>
                    {unlocked ? "✓" : (isConn ? "🔗" : "+")} {isConn ? "連結" : "填"}「{matchLabel}」解鎖：
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
                    {items.map((item: string, i: number) => (
                      <span key={i} style={{
                        fontSize: 10, borderRadius: 10, padding: "2px 8px", lineHeight: 1.6,
                        background: unlocked ? "#ECFDF5" : "#F5F4F2",
                        color: unlocked ? "#059669" : "#B5B4B0",
                        border: `1px solid ${unlocked ? "#A7F3D0" : "#E8E7E3"}`,
                      }}>
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export interface SquadStepProgress {
  step: number;
  agentName: string;
  agentTitle: string;
  label: string;
  status: "waiting" | "running" | "done";
}

interface AppShellProps {
  children: React.ReactNode;
  onMissionSelect?: (missionId: number, brandId?: number, workspace?: string) => void;
  onNewTask?: (wsKey: string) => void;
  activeMissionId?: number | null;
  activeSquad?: DBSquad | null;
  squadStepProgress?: SquadStepProgress[];
}


// ─── BrainPanel ───────────────────────────────────────────────────────────────
// Shows the Brand Brain knowledge base scoped to the currently-selected
// workspace / brand / mission. Drawer stays unchanged — this panel simply
// replaces the main content area when the 大腦 rail tab is active.

function BrainPanel({
  brandId,
  missionId,
}: {
  brandId?: number | null;
  missionId?: number | null;
}) {
  const brainQ = (trpc as any).brandBrain?.list?.useQuery
    ? (trpc as any).brandBrain.list.useQuery(
        { brandId: brandId ?? 0 },
        { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: null, isLoading: false };

  // backend returns { brandId, entries }, where entries is { positioning: [], audience: [], ... }
  // flatten all category arrays into a single array
  const brainData = brainQ.data as any;
  const items: any[] = useMemo(() => {
    if (!brainData?.entries) return [];
    return Object.values(brainData.entries).flat() as any[];
  }, [brainData]);
  const BUDGET = 8000;
  const used = useMemo(() => items.reduce(
    (s, i) => s + (i.content?.length ?? 0) + (i.title?.length ?? 0),
    0
  ), [items]);
  const pct = Math.min(100, Math.round((used / BUDGET) * 100));

  if (!brandId) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        color: "#9B9990", fontSize: 13,
      }}>
        請先選擇品牌 / Select a brand to view its brain
      </div>
    );
  }

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      background: "#FAFAF9", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 24px",
        borderBottom: "1px solid #E4E3E1",
        background: "#FFFFFF",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A18", letterSpacing: "-0.01em" }}>
            品牌大腦
          </div>
          <div style={{ fontSize: 11, color: "#8C8B87", marginTop: 2 }}>
            此工作區 / 任務的記憶與知識庫 · {items.length} 項
            {missionId ? ` · Mission #${missionId}` : ""}
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 10, color: "#6B6A66",
        }}>
          <div style={{ width: 120, height: 6, background: "#E4E3E1", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              width: `${pct}%`, height: "100%",
              background: pct >= 90 ? "#D14343" : "#1A1A18",
              transition: "width 0.3s",
            }} />
          </div>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{used}/{BUDGET}</span>
        </div>
      </div>

      {/* Item list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        {brainQ.isLoading ? (
          <div style={{ color: "#9B9990", fontSize: 12 }}>載入中…</div>
        ) : items.length === 0 ? (
          <div style={{
            padding: "48px 0", textAlign: "center",
            color: "#9B9990", fontSize: 12,
          }}>
            尚未累積任何知識。從對話中把重點「釘」到大腦即可在這裡看到。
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((it: any, i: number) => (
              <div
                key={it.id ?? i}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E4E3E1",
                  borderRadius: 8,
                  padding: "12px 14px",
                }}
              >
                {it.title && (
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: "#1A1A18",
                    marginBottom: 4,
                  }}>
                    {it.title}
                  </div>
                )}
                <div style={{
                  fontSize: 12, color: "#4A4945", lineHeight: 1.55,
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {it.content}
                </div>
                {(it.kind || it.createdAt) && (
                  <div style={{
                    fontSize: 10, color: "#9B9990", marginTop: 6,
                    display: "flex", gap: 8,
                  }}>
                    {it.kind && <span>· {it.kind}</span>}
                    {it.createdAt && <span>· {new Date(it.createdAt).toLocaleDateString("zh-TW")}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SettingsPanel ────────────────────────────────────────────────────────────
// Wraps the Settings page so the main area background and padding match
// the rest of the shell.

function SettingsPanel() {
  return (
    <div style={{
      flex: 1, overflowY: "auto",
      background: "#FAFAF9",
      padding: "24px 32px",
    }}>
      <Settings />
    </div>
  );
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

export default function AppShell({ children, onMissionSelect, onNewTask, activeMissionId, activeSquad, squadStepProgress = [] }: AppShellProps) {
  const { t } = useLang();
  const [railTab, setRailTab] = useState("chat");
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("rightPanelWidth") : null;
    return stored ? parseInt(stored, 10) : 264;
  });
  const handleRightWidthChange = React.useCallback((w: number) => {
    setRightPanelWidth(w);
    localStorage.setItem("rightPanelWidth", String(w));
  }, []);
  const [newMissionOpen, setNewMissionOpen] = useState(false);
  const [newMissionWsKey, setNewMissionWsKey] = useState("strategy");
  const [newWsOpen, setNewWsOpen] = useState(false);
  const [newWsLabel, setNewWsLabel] = useState("");

  // Drawer collapse — persisted
  const [drawerCollapsed, setDrawerCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("drawerCollapsed") === "1"; } catch { return false; }
  });
  const toggleDrawer = React.useCallback(() => {
    setDrawerCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem("drawerCollapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  // Chat fullscreen — persisted, toggled via button or Cmd/Ctrl+\
  const [chatFullscreen, setChatFullscreen] = useState<boolean>(() => {
    try { return localStorage.getItem("chatFullscreen") === "1"; } catch { return false; }
  });
  const toggleFullscreen = React.useCallback(() => {
    setChatFullscreen(prev => {
      const next = !prev;
      try { localStorage.setItem("chatFullscreen", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Cmd/Ctrl + \ toggles fullscreen
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleFullscreen();
      }
      // Esc exits fullscreen
      if (e.key === "Escape" && chatFullscreen) {
        setChatFullscreen(false);
        try { localStorage.setItem("chatFullscreen", "0"); } catch {}
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatFullscreen, toggleFullscreen]);

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
      {!chatFullscreen && <Rail activeTab={railTab} onTabChange={setRailTab} notifCount={notifCount} />}
      {chatFullscreen ? null : drawerCollapsed ? (
        /* Collapsed drawer — thin 16px strip with expand button */
        <div
          onClick={toggleDrawer}
          title="展開側欄"
          style={{
            width: 16, minWidth: 16,
            background: "#F2F1EF",
            borderRight: "1px solid #E4E3E1",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            color: "#8C8B87",
            userSelect: "none",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#EAE9E6"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#F2F1EF"; }}
        >
          ▶
        </div>
      ) : (
        <Drawer
          onMissionSelect={onMissionSelect}
          onNewTask={(wsKey) => { setNewMissionWsKey(wsKey); setNewMissionOpen(true); }}
          activeMissionId={activeMissionId}
          onNewMission={() => { setNewMissionWsKey(activeMissionWorkspace ?? "strategy"); setNewMissionOpen(true); }}
          onNewWorkspace={() => setNewWsOpen(true)}
          onCollapse={toggleDrawer}
        />
      )}

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
            {/* Fullscreen toggle */}
            <button
              onClick={toggleFullscreen}
              title={chatFullscreen ? "退出全螢幕 (Esc)" : "全螢幕對話 (Ctrl+\\)"}
              style={{
                ...btnGhost,
                padding: "4px 9px",
                display: "flex", alignItems: "center", gap: 4,
                fontSize: 12,
                color: chatFullscreen ? "#E8631A" : "#6B6A66",
                border: chatFullscreen ? "1px solid #F5C9A8" : "1px solid transparent",
                background: chatFullscreen ? "#FFF5EE" : "transparent",
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>{chatFullscreen ? "⛶" : "⛶"}</span>
              <span style={{ fontSize: 11 }}>{chatFullscreen ? "退出" : "全螢幕"}</span>
            </button>
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

        {/* Children slot (chat/content area) or Rail-switched panels */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {railTab === "outputs"  ? <ExportsPanel brandId={selectedBrandId} />
           : railTab === "brain"    ? <BrainPanel brandId={selectedBrandId} missionId={activeMissionId} />
           : railTab === "settings" ? <SettingsPanel />
           : children}
        </div>
      </main>

      {!chatFullscreen && (
        <RightPanel
          missionId={activeMissionId}
          brandId={selectedBrandId}
          activeSquad={activeSquad ?? null}
          missionSquadSlug={activeMissionSquadSlug}
          missionWorkspace={activeMissionWorkspace}
          width={rightPanelWidth}
          onWidthChange={handleRightWidthChange}
          squadStepProgress={squadStepProgress}
        />
      )}

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
            <h2 style={{ fontSize:17, fontWeight:700, color:"#1A1A18", margin:"0 0 18px" }}>{t("add_workspace")}</h2>
            <form onSubmit={(e) => { e.preventDefault(); if (newWsLabel.trim()) createWorkspace.mutate({ label: newWsLabel.trim() }); }}>
              <input
                autoFocus
                type="text"
                value={newWsLabel}
                onChange={(e) => setNewWsLabel(e.target.value)}
                placeholder={t("workspace_placeholder")}
                style={{ width:"100%", border:"1.5px solid #E2E8F0", borderRadius:8, padding:"9px 12px", fontSize:13, color:"#1A1A18", outline:"none", fontFamily:"inherit", boxSizing:"border-box" as const, marginBottom:16 }}
              />
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button type="button" onClick={() => { setNewWsOpen(false); setNewWsLabel(""); }}
                  style={{ background:"transparent", border:"1px solid #E8EAF0", borderRadius:8, padding:"7px 16px", fontSize:12, cursor:"pointer", color:"#5A5A5A" }}>
                  {t("cancel")}
                </button>
                <button type="submit" disabled={!newWsLabel.trim() || createWorkspace.isPending}
                  style={{ background: newWsLabel.trim() ? "#1A1A18" : "#E8EAF0", color: newWsLabel.trim() ? "#FFFFFF" : "#9B9990", border:"none", borderRadius:8, padding:"7px 18px", fontSize:12, fontWeight:600, cursor: newWsLabel.trim() ? "pointer" : "not-allowed" }}>
                  {createWorkspace.isPending ? t("creating") : t("create")}
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
        onCreated={(missionId, workspace) => {
          setNewMissionOpen(false);
          // Pass brandId + workspace so the router can build the canonical
          // URL /b/:brandId/:workspace/m/:missionId (not the legacy /m/:id)
          onMissionSelect?.(missionId, selectedBrandId ?? undefined, workspace);
        }}
      />
    </div>
  );
}
