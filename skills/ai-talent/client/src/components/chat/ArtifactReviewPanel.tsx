// ArtifactReviewPanel.tsx
// Right rail: Team / Artifacts / Review tabs

import { useState } from "react";

// ---- Types ----

export interface TeamMember {
  id: number;
  name: string;
  title: string;
  layer: 'strategy' | 'execution' | 'training';
  status: 'active' | 'waiting' | 'complete' | 'standby';
  owns: string;
}

export interface Artifact {
  id: string;
  type: 'campaign_brief' | 'audience_matrix' | 'messaging_angles' | 'copy_drafts' | 'creative_directions' | 'launch_checklist' | 'positioning' | 'other';
  label: string;
  version: number;
  content: string;
  createdAt: number;
  pinned?: boolean;
}

export interface ReviewItem {
  id: string;
  label: string;
  status: 'waiting_user' | 'ready' | 'approved' | 'rejected' | 'blocked';
  dependsOn?: string;
}

interface Props {
  team: TeamMember[];
  artifacts: Artifact[];
  reviews: ReviewItem[];
  onApproveReview?: (id: string) => void;
  onRejectReview?: (id: string) => void;
  onPinArtifact?: (id: string) => void;
  onExportArtifact?: (id: string) => void;
}

type Tab = 'team' | 'artifacts' | 'review';

// ---- Sub-components ----

const LAYER_COLORS: Record<string, string> = {
  strategy:  'bg-purple-600',
  execution: 'bg-blue-600',
  training:  'bg-green-600',
};

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  active:   { cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', label: 'active' },
  waiting:  { cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', label: 'waiting' },
  complete: { cls: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400', label: 'done' },
  standby:  { cls: 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500', label: 'standby' },
};

const REVIEW_STATUS: Record<string, { cls: string; label: string }> = {
  waiting_user: { cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', label: '等待決策' },
  ready:        { cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', label: '可審核' },
  approved:     { cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', label: '已批准' },
  rejected:     { cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', label: '已退回' },
  blocked:      { cls: 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500', label: '封鎖中' },
};

function TeamTab({ team }: { team: TeamMember[] }) {
  if (team.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <div className="w-10 h-10 rounded-xl bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-xl">👥</div>
        <p className="text-xs text-neutral-400">尚未組建團隊</p>
      </div>
    );
  }
  return (
    <div className="space-y-2.5 py-3">
      {team.map(member => {
        const badge = STATUS_BADGE[member.status];
        return (
          <div key={member.id} className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-full ${LAYER_COLORS[member.layer] ?? 'bg-neutral-500'} text-white flex items-center justify-center text-xs font-bold shrink-0`}>
              {member.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 truncate">{member.name}</p>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{member.title}</p>
              <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">Owns: {member.owns}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ArtifactsTab({ artifacts, onPin, onExport }: { artifacts: Artifact[]; onPin?: (id: string) => void; onExport?: (id: string) => void }) {
  if (artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <div className="w-10 h-10 rounded-xl bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-xl">📄</div>
        <p className="text-xs text-neutral-400">尚無可交付物</p>
      </div>
    );
  }
  return (
    <div className="space-y-2 py-3">
      {artifacts.map(art => (
        <div key={art.id} className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">{art.label}</p>
            <span className="text-[10px] text-neutral-400 shrink-0">v{art.version}</span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2">{art.content.slice(0, 120)}{art.content.length > 120 ? '...' : ''}</p>
          <div className="flex gap-2 mt-2">
            {onPin && (
              <button onClick={() => onPin(art.id)} className="text-[10px] text-indigo-500 hover:text-indigo-700">
                {art.pinned ? 'Unpin' : 'Pin'}
              </button>
            )}
            {onExport && (
              <button onClick={() => onExport(art.id)} className="text-[10px] text-indigo-500 hover:text-indigo-700">
                Export
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReviewTab({ reviews, onApprove, onReject }: { reviews: ReviewItem[]; onApprove?: (id: string) => void; onReject?: (id: string) => void }) {
  if (reviews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <div className="w-10 h-10 rounded-xl bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-xl">✅</div>
        <p className="text-xs text-neutral-400">無待審項目</p>
      </div>
    );
  }
  return (
    <div className="space-y-2 py-3">
      {reviews.map(item => {
        const st = REVIEW_STATUS[item.status];
        return (
          <div key={item.id} className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <p className="text-sm text-neutral-800 dark:text-neutral-100 flex-1 truncate">{item.label}</p>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>
            </div>
            {item.dependsOn && (
              <p className="text-[10px] text-neutral-400 mt-1">依賴：{item.dependsOn}</p>
            )}
            {(item.status === 'ready' || item.status === 'waiting_user') && (
              <div className="flex gap-2 mt-2">
                {onApprove && (
                  <button onClick={() => onApprove(item.id)} className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors">
                    Approve
                  </button>
                )}
                {onReject && (
                  <button onClick={() => onReject(item.id)} className="px-3 py-1 rounded-lg border border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                    Revise
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Main Panel ----

export default function ArtifactReviewPanel({ team, artifacts, reviews, onApproveReview, onRejectReview, onPinArtifact, onExportArtifact }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('team');

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'team',      label: 'Team',      count: team.length },
    { key: 'artifacts', label: 'Artifacts', count: artifacts.length },
    { key: 'review',    label: 'Review',    count: reviews.filter(r => r.status === 'ready' || r.status === 'waiting_user').length },
  ];

  return (
    <aside className="w-[352px] shrink-0 h-full flex flex-col border-l border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1e1e1e] overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors relative ${
              activeTab === tab.key
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            {tab.label}
            {(tab.count ?? 0) > 0 && (
              <span className="ml-1 text-[10px] bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 px-1.5 py-0.5 rounded-full">
                {tab.count}
              </span>
            )}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4">
        {activeTab === 'team'      && <TeamTab team={team} />}
        {activeTab === 'artifacts' && <ArtifactsTab artifacts={artifacts} onPin={onPinArtifact} onExport={onExportArtifact} />}
        {activeTab === 'review'    && <ReviewTab reviews={reviews} onApprove={onApproveReview} onReject={onRejectReview} />}
      </div>
    </aside>
  );
}
