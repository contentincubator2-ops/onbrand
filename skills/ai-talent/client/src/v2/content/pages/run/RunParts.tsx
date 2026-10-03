/**
 * 成品頁用的小元件：出處標籤、分隔線、工具列按鈕、步驟徽章。
 */
import React from "react";
import { Tooltip } from "@heroui/react";
import { PR_CRAFT_REF } from "./runModel";

export function CraftChip({ taskId, en }: { taskId?: string | null; en: boolean }) {
  const [open, setOpen] = React.useState(false);
  const ref = taskId ? PR_CRAFT_REF[taskId] : undefined;
  if (!ref) return null;
  const caseLabel  = en ? ref.caseEn  : ref.case;
  const awardLabel = en ? ref.awardEn : ref.award;
  const princLabel = en ? ref.principleEn : ref.principle;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[12px] px-2 py-1 rounded-full border transition"
        style={{ borderColor: "#e4e4e7", background: "#fafafa", color: "#52525b" }}
        title={en ? "Craft reference" : "工藝依據"}
      >
        {en ? "Craft reference" : "工藝依據"}：{caseLabel}
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 left-0 rounded-lg border bg-white p-3 shadow-lg"
          style={{ width: 300, borderColor: "#e4e4e7" }}
        >
          <div className="text-[12px] font-bold text-neutral-900 mb-0.5">{caseLabel}</div>
          <div className="text-[12px] text-neutral-500 mb-2">{awardLabel}</div>
          <div className="text-[12px] leading-relaxed text-neutral-700">{princLabel}</div>
          <div className="mt-2 pt-2 border-t text-[12px] text-neutral-400" style={{ borderColor: "#f0eee6" }}>
            {en
              ? "Transferable craft principle applied — not an award certification or endorsement."
              : "套用可轉移的工藝原則，非得獎認證或案例背書。"}
          </div>
        </div>
      )}
    </div>
  );
}

export function Divider() {
  return <div className="w-px h-5 bg-default-200 mx-1" />;
}

export function ToolbarBtn({
  icon: Icon, label, active, highlight, onClick,
}: {
  icon: any; label: string; active?: boolean; highlight?: boolean; onClick?: () => void;
}) {
  return (
    <Tooltip content={label} placement="bottom">
      <button
        onClick={onClick}
        className={`w-7 h-7 rounded-md flex items-center justify-center transition ${
          active
            ? "bg-secondary/15 text-secondary"
            : highlight
              ? "bg-success-100 text-success-700"
              : "text-default-500 hover:bg-default-100 hover:text-default-800"
        }`}
        aria-label={label}
      >
        <Icon size={14} strokeWidth={1.75} />
      </button>
    </Tooltip>
  );
}

/** 步驟編號：取代「Step 1：…」這類說明橫幅，只留一個數字圓點。 */
export function StepBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-default-900 text-[10px] font-semibold text-white tabular-nums">
      {n}
    </span>
  );
}
