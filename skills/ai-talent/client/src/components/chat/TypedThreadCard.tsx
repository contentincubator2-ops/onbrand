/**
 * TypedThreadCard.tsx - Sprint 6
 * Renders completed relay steps as enhanced typed cards
 */

type CardType = 'pm_agent' | 'specialist';

interface Props {
  cardType: CardType;
  agentName: string;
  label: string;
  status: 'pending' | 'running' | 'done';
  content: string;
  stepIndex: number;
  totalSteps: number;
}

const CARD_CFG: Record<CardType, { border: string; bg: string; icon: string; roleLabel: string }> = {
  pm_agent: { border: 'border-indigo-200 dark:border-indigo-800', bg: 'bg-indigo-50/50 dark:bg-indigo-900/10', icon: '\ud83d\udccb', roleLabel: 'PM Agent' },
  specialist: { border: 'border-blue-200 dark:border-blue-800', bg: 'bg-blue-50/50 dark:bg-blue-900/10', icon: '\ud83e\udde0', roleLabel: 'Specialist' },
};

export default function TypedThreadCard({ cardType, agentName, label, status, content, stepIndex, totalSteps }: Props) {
  const cfg = CARD_CFG[cardType] || CARD_CFG.specialist;
  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-3 mb-2 transition-all`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">{cfg.icon}</span>
        <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">{agentName}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">{cfg.roleLabel}</span>
        <span className="text-[10px] text-neutral-400 ml-auto">Step {stepIndex}/{totalSteps}</span>
      </div>
      <p className="text-xs font-medium text-neutral-800 dark:text-neutral-100 mb-1">{label}</p>
      {content && (
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 border-l-2 border-neutral-300 pl-2 leading-relaxed">
          {content}
        </div>
      )}
      {status === 'done' && (
        <div className="mt-1 flex items-center gap-1">
          <span className="text-green-600 text-[10px]">\u2713</span>
          <span className="text-[10px] text-green-600">Completed</span>
        </div>
      )}
    </div>
  );
}
