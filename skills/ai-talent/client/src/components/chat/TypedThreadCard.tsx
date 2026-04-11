/**
 * TypedThreadCard.tsx - Sprint 5
 * Renders different card types in the execution thread:
 * 1. Human Message
 * 2. PM Agent Card (task decomposition)
 * 3. Team Assembly Card (squad + reasons)
 * 4. Specialist Agent Card (role, why, output)
 * 5. Review Card (decision point)
 * 6. Approval Gate (stage sign-off)
 */

export type CardType = 'human' | 'pm_agent' | 'team_assembly' | 'specialist' | 'review' | 'approval_gate';

export interface ThreadCard {
  id: string;
  cardType: CardType;
  agentName?: string;
  agentRole?: string;
  title?: string;
  content: string;
  whyThisStep?: string;
  options?: { id: string; label: string }[];
  status?: 'pending' | 'approved' | 'rejected';
  ts: Date;
}

const CARD_STYLES: Record<CardType, { border: string; bg: string; icon: string; label: string }> = {
  human: { border: 'border-amber-200', bg: 'bg-amber-50/50 dark:bg-amber-900/10', icon: '\ud83d\udce8', label: 'You' },
  pm_agent: { border: 'border-indigo-200', bg: 'bg-indigo-50/50 dark:bg-indigo-900/10', icon: '\ud83d\udccb', label: 'PM Agent' },
  team_assembly: { border: 'border-purple-200', bg: 'bg-purple-50/50 dark:bg-purple-900/10', icon: '\ud83d\udc65', label: 'Team Assembly' },
  specialist: { border: 'border-blue-200', bg: 'bg-blue-50/50 dark:bg-blue-900/10', icon: '\ud83e\udde0', label: 'Specialist' },
  review: { border: 'border-amber-300', bg: 'bg-amber-50/50 dark:bg-amber-900/10', icon: '\u2753', label: 'Decision Needed' },
  approval_gate: { border: 'border-green-300', bg: 'bg-green-50/50 dark:bg-green-900/10', icon: '\u2705', label: 'Approval Gate' },
};

function formatTime(d: Date) {
  return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
}

export default function TypedThreadCard({ card }: { card: ThreadCard }) {
  const style = CARD_STYLES[card.cardType] || CARD_STYLES.human;
  const isHuman = card.cardType === 'human';

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-4 mb-3 transition-all`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">{style.icon}</span>
        <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
          {card.agentName || style.label}
        </span>
        {card.agentRole && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 font-medium">
            {card.agentRole}
          </span>
        )}
        <span className="text-[10px] text-neutral-400 ml-auto">{formatTime(card.ts)}</span>
      </div>

      {/* Why this step */}
      {card.whyThisStep && (
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-2 italic border-l-2 border-neutral-300 pl-2">
          {card.whyThisStep}
        </div>
      )}

      {/* Title */}
      {card.title && (
        <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-100 mb-1">{card.title}</p>
      )}

      {/* Content */}
      <div className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
        {card.content}
      </div>

      {/* Review options */}
      {card.cardType === 'review' && card.options && (
        <div className="mt-3 space-y-1.5">
          {card.options.map(opt => (
            <button key={opt.id} className="block w-full text-left text-xs px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Approval gate buttons */}
      {card.cardType === 'approval_gate' && card.status === 'pending' && (
        <div className="mt-3 flex gap-2">
          <button className="flex-1 text-xs py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors font-medium">
            Approve and continue
          </button>
          <button className="flex-1 text-xs py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            Send back
          </button>
        </div>
      )}

      {/* Team Assembly members */}
      {card.cardType === 'team_assembly' && (
        <div className="mt-2 text-[11px] text-neutral-500">
          Loaded based on mission context + channel expertise
        </div>
      )}
    </div>
  );
}
