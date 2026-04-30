/**
 * SquadMockups — dispatcher by `mockupVariant` string from squad steps.
 *
 * Per project_squad_design_methodology.md, every squad step declares
 * `mockupVariant` in its JSON. Squad runner / step preview reads that
 * string and routes to the right component here.
 */
import React from "react";
import type { SquadMockupVariant } from "./shared";
import { IntakeFormMockup, type IntakeFormData } from "./intake";
import { PillarTableMockup, type PillarRow } from "./pillar";
import { CalendarGridMockup, type CalendarEntry } from "./calendar";
import { FBPostBriefMockup, type PostBrief } from "./brief";
import { QAReportMockup, type QAReport } from "./qa";
import { ResearchPanelMockup, type ResearchData } from "./research";

export { type SquadMockupVariant } from "./shared";
export { IntakeFormMockup, type IntakeFormData } from "./intake";
export { PillarTableMockup, type PillarRow } from "./pillar";
export { CalendarGridMockup, type CalendarEntry } from "./calendar";
export { FBPostBriefMockup, type PostBrief } from "./brief";
export { QAReportMockup, type QAReport } from "./qa";
export { ResearchPanelMockup, type ResearchData } from "./research";

export interface SquadMockupProps {
  variant: SquadMockupVariant;
  data?: any;            // shape depends on variant — caller's responsibility
  readOnly?: boolean;
  isActive?: boolean;
  onChange?: (next: any) => void;
  onSubmit?: () => void;
}

export function SquadMockup({ variant, data, readOnly, isActive, onChange, onSubmit }: SquadMockupProps) {
  switch (variant) {
    case "IntakeFormMockup":
      return <IntakeFormMockup data={data as IntakeFormData} readOnly={readOnly} isActive={isActive} onChange={onChange} onSubmit={onSubmit} />;
    case "PillarTableMockup":
      return <PillarTableMockup data={data as { pillars: PillarRow[]; tilt?: string }} readOnly={readOnly} isActive={isActive} onChange={onChange} />;
    case "CalendarGridMockup":
      return <CalendarGridMockup data={data} readOnly={readOnly} isActive={isActive} />;
    case "FBPostBriefMockup":
      return <FBPostBriefMockup data={data as { briefs: PostBrief[] }} readOnly={readOnly} isActive={isActive} onChange={onChange as any} />;
    case "QAReportMockup":
      return <QAReportMockup data={data as QAReport} readOnly={readOnly} isActive={isActive} />;
    case "ResearchPanelMockup":
      return <ResearchPanelMockup data={data as ResearchData} readOnly={readOnly} isActive={isActive} />;
    default:
      // Exhaustive switch — TypeScript will flag missing variants
      const _exhaustive: never = variant;
      return null;
  }
}
