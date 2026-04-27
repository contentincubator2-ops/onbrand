/**
 * StepEditor — editable step row for MissionDetail.
 *
 * Each step is one of two states:
 *   "view"  — read-only summary chip (default)
 *   "edit"  — name + description + requiredSkill + outputType editable
 *
 * onChange fires the full updated step back to the parent. The parent
 * (MissionDetail) compares the array against the original to determine
 * dirty state and surfaces the fork prompt.
 */
import React from "react";
import type { MosAccent } from "../../../studio/primitives/tokens";
import { ACCENTS } from "../../../studio/primitives/tokens";

export interface StepDraft {
  order: number;
  name: string;
  description?: string;
  requiredSkill?: string | null;
  outputType?: string | null;
  assignedAgentId?: number | null;
  assignedAgentName?: string | null;
  prompt?: string | null;
}

export default function StepEditor({
  step,
  index,
  accent,
  expanded,
  onToggle,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  step: StepDraft;
  index: number;
  accent: MosAccent;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<StepDraft>) => void;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const tone = ACCENTS[accent];

  return (
    <div className="border border-divider bg-white">
      {/* Row header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className="w-8 h-8 rounded-full text-white text-[0.72rem] font-semibold flex items-center justify-center shrink-0"
          style={{ background: tone.bg }}
        >
          0{index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[1rem] text-foreground truncate">{step.name}</div>
          <div className="text-[0.72rem] text-default-500 truncate">
            {step.assignedAgentName ?? "未派工"}
            {step.requiredSkill && ` · ${step.requiredSkill}`}
            {step.outputType && ` · ${step.outputType}`}
          </div>
        </div>
        <div className="flex items-center gap-1 text-[0.7rem] tracking-[0.16em] uppercase">
          {onMoveUp && (
            <button onClick={onMoveUp} className="px-2 py-1 text-default-400 hover:text-foreground">↑</button>
          )}
          {onMoveDown && (
            <button onClick={onMoveDown} className="px-2 py-1 text-default-400 hover:text-foreground">↓</button>
          )}
          <button
            onClick={onToggle}
            className={[
              "px-3 py-1 border transition",
              expanded
                ? "border-foreground text-foreground bg-background"
                : "border-divider text-default-500 hover:text-foreground hover:border-foreground",
            ].join(" ")}
          >
            {expanded ? "收合" : "編輯"}
          </button>
          {onRemove && (
            <button onClick={onRemove} className="px-2 py-1 text-default-400 hover:text-danger">
              ×
            </button>
          )}
        </div>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t border-divider px-4 py-4 space-y-3 bg-background">
          <Field label="步驟名稱">
            <input
              value={step.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="w-full bg-white border border-divider px-3 py-2 text-[0.88rem] text-foreground focus:outline-none focus:border-foreground"
            />
          </Field>

          <Field label="說明">
            <textarea
              value={step.description ?? ""}
              onChange={(e) => onChange({ description: e.target.value })}
              rows={2}
              className="w-full bg-white border border-divider px-3 py-2 text-[0.88rem] text-foreground focus:outline-none focus:border-foreground"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="所需技能">
              <input
                value={step.requiredSkill ?? ""}
                onChange={(e) => onChange({ requiredSkill: e.target.value })}
                placeholder="kebab-case"
                className="w-full bg-white border border-divider px-3 py-2 text-[0.82rem] text-foreground focus:outline-none focus:border-foreground"
              />
            </Field>
            <Field label="產出類型">
              <select
                value={step.outputType ?? ""}
                onChange={(e) => onChange({ outputType: e.target.value })}
                className="w-full bg-white border border-divider px-3 py-2 text-[0.82rem] text-foreground focus:outline-none focus:border-foreground"
              >
                <option value="">—</option>
                <option value="brief">brief</option>
                <option value="research">research</option>
                <option value="doc">doc</option>
                <option value="deliverable">deliverable</option>
                <option value="plan">plan</option>
                <option value="asset">asset</option>
              </select>
            </Field>
          </div>

          <Field label="提示詞 (Prompt)">
            <textarea
              value={step.prompt ?? ""}
              onChange={(e) => onChange({ prompt: e.target.value })}
              rows={4}
              placeholder="這個 step 要交給 agent 的 prompt — 留空則用 squad 預設"
              className="w-full bg-white border border-divider px-3 py-2 text-[0.82rem] text-foreground font-mono focus:outline-none focus:border-foreground"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[0.62rem] tracking-[0.22em] uppercase text-default-400 mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}
