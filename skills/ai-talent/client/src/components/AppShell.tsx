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
    { id: "chat",         icon: <IconChat />,         badge: false },
    { id: "tasks",        icon: <IconTasks />,        badge: false },
    { id: "notification", icon: <IconNotification />, badge: notifCount > 0, badgeColor: "#3D9A3D" },
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

// ─── ResourceStats ────────────────────────────────────────────────────────────
function ResourceStats({ resourceData, isLoading }: { resourceData: any; isLoading: boolean }) {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const items = [
    {
      key: 'agents',
      label: 'Agents',
      value: resourceData?.agents ?? null,
      detail: resourceData?.agents ? ('共 ' + resourceData.agents.toLocaleString() + ' 位可用 Agents，專精此工作區任務') : null,
    },
    {
      key: 'skills',
      label: 'Skills',
      value: resourceData?.skills ?? null,
      detail: resourceData?.skills ? ('涵蓋 ' + resourceData.skills + ' 種不同技能') : null,
    },
    {
      key: 'providers',
      label: 'AI Providers',
      value: resourceData?.providers ?? null,
      detail: resourceData?.providerList?.length
        ? resourceData.providerList.join(' · ')
        : (resourceData?.providers ? (resourceData.providers + ' 家 AI 供應商') : null),
    },
  ];

  return (
    <div style={{ padding: '0 10px 8px' }}>
      {items.map(item => (
        <div key={item.key}>
          <div
            onClick={() => setExpanded(expanded === item.key ? null : item.key)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '3px 4px', cursor: 'pointer', borderRadius: 5,
              background: expanded === item.key ? '#ECEAE8' : 'transparent',
            }}
          >
            <span style={{ fontSize: 11, color: '#6B6A66' }}>{item.label}</span>
            <span style={{
              fontSize: 11, fontWeight: 600, color: '#1A1A18',
              background: '#F2F1EF', border: '1px solid #E4E3E1',
              borderRadius: 4, padding: '1px 7px',
              cursor: 'pointer',
            }}>
              {isLoading ? '…' : item.value !== null && item.value !== undefined ? item.value : '—'}
            </span>
          </div>
          {expanded === item.key && item.detail && (
            <div style={{
              margin: '2px 4px 4px', padding: '5px 8px',
              background: '#FFFFFF', border: '1px solid #E4E3E1',
              borderRadius: 6, fontSize: 10, color: '#6B6A66', lineHeight: 1.5,
            }}>
              {item.detail}
            </div>
          )}
        </div>
      ))}
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
      <div
        onClick={() => onNewTask?.(wsKey)}
        style={{ padding: "3px 6px", fontSize: 10, color: "#C8C7C3", cursor: "pointer" }}
      >
        + 新增任務
      </div>
    </div>
  );
}


// ─── RecentMissions ───────────────────────────────────────────────────────────

function RecentMissions({
  brandId,
  activeMissionId,
  onMissionSelect,
  workspaces,
}: {
  brandId: number | null;
  activeMissionId?: number | null;
  onMissionSelect?: (missionId: number) => void;
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
  if (!brandId || missionList.length === 0) return null;

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#B0AFA9', textTransform: 'uppercase' as const, letterSpacing: '0.07em', padding: '8px 13px 3px' }}>
        歷史任務
      </div>
      {missionList.map((m: any) => (
        <div
          key={m.id}
          onMouseEnter={() => setHoveredId(m.id)}
          onMouseLeave={() => setHoveredId(null)}
          style={{ position: 'relative', margin: '1px 5px' }}
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
                  color: activeMissionId === m.id ? '#1A1A18' : '#9B9990',
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
}: {
  onMissionSelect?: (missionId: number) => void;
  onNewTask?: (wsKey: string) => void;
  activeMissionId?: number | null;
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

  // Resource summary (optional chaining for missing router)
  const resourceQuery = (trpc as any).resource?.summary?.useQuery
    ? (trpc as any).resource.summary.useQuery({ workspace: activeWsKey }, { refetchOnWindowFocus: false })
    : { data: null, isLoading: false };
  const resourceData = resourceQuery.data;

  const toggleWs = (key: string) => {
    setExpandedWs(prev => ({ ...prev, [key]: !prev[key] }));
    setActiveWsKey(key);
  };

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
        {/* Workspaces */}
        <div style={secLabel}>工作區</div>

        {wsLoading && (
          <div style={{ padding: "5px 13px", fontSize: 11, color: "#9B9990" }}>載入中…</div>
        )}

        {wsList.map((ws: any) => {
          const isExpanded = expandedWs[ws.wsKey] !== false; // default expanded
          return (
            <div key={ws.wsKey}>
              <div
                style={{
                  padding: "4px 9px", borderRadius: 6, margin: "1px 5px",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                  background: "transparent",
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
                <button
                  onClick={() => onNewTask?.(ws.wsKey)}
                  title="新增任務"
                  style={{
                    width: 18, height: 18, borderRadius: 4, border: "none",
                    background: "transparent", cursor: "pointer", color: "#9B9990",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <IconPlus />
                </button>
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

        <RecentMissions
          brandId={selectedBrandId}
          activeMissionId={activeMissionId}
          onMissionSelect={onMissionSelect}
          workspaces={wsList}
        />

        {/* 可用資源 section */}
        <div style={{ ...secLabel, marginTop: 6 }}>可用資源</div>
        <div style={{ padding: "0 10px 8px" }}>
          <ResourceStats resourceData={resourceData} isLoading={resourceQuery.isLoading} />
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
  onMissionSelect?: (missionId: number) => void;
  onNewTask?: (wsKey: string) => void;
  activeMissionId?: number | null;
}

export default function AppShell({ children, onMissionSelect, onNewTask, activeMissionId }: AppShellProps) {
  const [railTab, setRailTab] = useState("chat");

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

  // Mission + workspace for breadcrumb
  const { data: activeMissionData } = (trpc as any).mission?.getById?.useQuery
    ? (trpc as any).mission.getById.useQuery(
        { id: activeMissionId },
        { enabled: !!activeMissionId, refetchOnWindowFocus: false }
      )
    : { data: null };
  const activeMissionTitle = (activeMissionData as any)?.title ?? null;
  const activeMissionWorkspace = (activeMissionData as any)?.workspace ?? null;

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
      <Rail activeTab={railTab} onTabChange={setRailTab} notifCount={notifCount} />
      <Drawer
        onMissionSelect={onMissionSelect}
        onNewTask={onNewTask}
        activeMissionId={activeMissionId}
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
