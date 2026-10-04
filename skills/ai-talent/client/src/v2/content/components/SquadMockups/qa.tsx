/**
 * QAReportMockup — squad step 6: Squad Lead QA report.
 *
 * Renders 3 sections:
 *   1. Overall verdict + score
 *   2. Per-pillar score bars (does ratio match? content variety?)
 *   3. Per-event integration check (was each event peak covered correctly?)
 *   4. Per-item checklist with accept / 退回 button
 */
import { Chip, Progress, Button } from "@heroui/react";
import { useLang } from "../../../../lib/i18n";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";

export type QAVerdict = "pending" | "needs_revision" | "approved";

export interface QAReport {
  verdict: QAVerdict;
  overallScore: number;       // 0-100
  pillarChecks: Array<{
    pillarName: string;
    expectedRatio: number;
    actualRatio: number;
    score: number;            // 0-100
    notes: string;
  }>;
  eventChecks: Array<{
    eventName: string;
    posts: number;
    expectedPosts: number;
    score: number;
    notes: string;
  }>;
  itemChecklist: Array<{
    id: string;
    label: string;
    status: "pass" | "warning" | "fail";
    detail: string;
  }>;
}

interface Props extends SquadMockupCommonProps {
  data?: QAReport;
  onAccept?: (itemId: string) => void;
  onReject?: (itemId: string) => void;
  onRetryStep?: (stepOrder: number) => void;
}

const VERDICT_CHIP: Record<QAVerdict, { label: string; labelEn: string; color: "success" | "warning" | "default" }> = {
  pending:        { label: "等待審核", labelEn: "Awaiting review",     color: "default" },
  needs_revision: { label: "需要修訂", labelEn: "Needs revision",     color: "warning" },
  approved:       { label: "✓ 已通過", labelEn: "✓ Approved",     color: "success" },
};

const STATUS_COLOR = {
  pass:    "success",
  warning: "warning",
  fail:    "danger",
} as const;

const STATUS_ICON = {
  pass:    "✓",
  warning: "⚠",
  fail:    "✗",
} as const;

export function QAReportMockup({ data, readOnly = false, isActive = false, onAccept, onReject }: Props) {
  const { lang } = useLang();
  if (!data || !data.verdict) {
    return (
      <NotionCard>
        <SectionHeader icon="🛡" eyebrow={lang === "en" ? "Step 6 · Quality review" : "步驟 6 · 品質審核"} title={lang === "en" ? "Squad lead final review" : "小組組長終審"} />
        <EmptyHint>{!data ? (lang === "en" ? "The QA report appears after Step 6 finishes" : "Step 6 跑完才會有 QA 報告") : (lang === "en" ? "Incomplete data — verdict missing" : "資料不完整 — 缺 verdict")}</EmptyHint>
      </NotionCard>
    );
  }
  // Guard each list with default — LLM may omit some sections
  const pillarChecks = Array.isArray(data.pillarChecks) ? data.pillarChecks : [];
  const eventChecks  = Array.isArray(data.eventChecks)  ? data.eventChecks  : [];
  const itemChecklist = Array.isArray(data.itemChecklist) ? data.itemChecklist : [];
  const overallScore = typeof data.overallScore === "number" ? data.overallScore : 0;
  const v = VERDICT_CHIP[data.verdict] ?? VERDICT_CHIP.pending;

  return (
    <div className="flex flex-col gap-3 max-w-4xl">
      {/* Section 1: Overall verdict */}
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader icon="🛡" eyebrow={lang === "en" ? "Step 6 · Quality review" : "步驟 6 · 品質審核"} title={lang === "en" ? "Squad Lead final review" : "Squad Lead 終審"} />
          {isActive && (
            <Chip size="sm" variant="flat" color="primary" className="self-start">
              {lang === "en" ? "● Claire Hsu is reviewing…" : "● Claire Hsu 審核中…"}
            </Chip>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Chip size="lg" variant="flat" color={v.color}>{lang === "en" ? v.labelEn : v.label}</Chip>
          <div className="flex items-center gap-2">
            <span className="text-tiny text-default-500">{lang === "en" ? "Total score" : "總分"}</span>
            <span className="text-large font-bold tabular-nums">{overallScore} / 100</span>
          </div>
        </div>
        <Progress
          size="sm"
          value={overallScore}
          color={overallScore >= 80 ? "success" : overallScore >= 60 ? "warning" : "danger"}
          aria-label="overall score"
        />
      </NotionCard>

      {/* Section 2: Per-pillar */}
      <NotionCard>
        <SectionHeader eyebrow={lang === "en" ? "Pillar ratio review" : "支柱比例審核"} title={lang === "en" ? "Ratio and content variety" : "比例與內容多樣性"} />
        <div className="flex flex-col gap-3">
          {pillarChecks.map((p, i) => {
            const ratioOk = p.actualRatio === p.expectedRatio;
            return (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-tiny">
                  <span className="font-medium text-foreground">{p.pillarName}</span>
                  <div className="flex items-center gap-2">
                    <span className={ratioOk ? "text-success" : "text-warning"}>
                      {lang === "en" ? `Actual ${p.actualRatio}% / Expected ${p.expectedRatio}%` : `實際 ${p.actualRatio}% / 預期 ${p.expectedRatio}%`}
                    </span>
                    <span className="font-semibold tabular-nums">{p.score}/100</span>
                  </div>
                </div>
                <Progress size="sm" value={p.score} color={p.score >= 80 ? "success" : "warning"} aria-label="pillar score" />
                {p.notes && <p className="text-tiny text-default-500">{p.notes}</p>}
              </div>
            );
          })}
        </div>
      </NotionCard>

      {/* Section 3: Per-event */}
      {eventChecks.length > 0 && (
        <NotionCard>
          <SectionHeader eyebrow="EVENT CHECKS" title={lang === "en" ? "Event integration" : "活動整合度"} />
          <div className="flex flex-col gap-2">
            {eventChecks.map((e, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-3 p-2 rounded-md border border-divider"
              >
                <div className="min-w-0">
                  <p className="text-small font-medium">⭐ {e.eventName}</p>
                  <p className="text-tiny text-default-500">{e.notes}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-tiny text-default-500">
                    {lang === "en" ? `Covered ${e.posts} / Expected ${e.expectedPosts} posts` : `覆蓋 ${e.posts} / 期望 ${e.expectedPosts} 篇`}
                  </span>
                  <Chip size="sm" variant="flat" color={e.score >= 80 ? "success" : "warning"}>
                    {e.score}
                  </Chip>
                </div>
              </div>
            ))}
          </div>
        </NotionCard>
      )}

      {/* Section 4: Item-level checklist */}
      <NotionCard>
        <SectionHeader eyebrow="ITEM CHECKLIST" title={lang === "en" ? "Item-by-item checklist" : "逐項審核清單"} />
        <div className="flex flex-col gap-2">
          {itemChecklist.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 p-2 rounded-md border border-divider"
            >
              <div className="flex items-start gap-2 min-w-0">
                <Chip size="sm" variant="flat" color={STATUS_COLOR[item.status]}>
                  {STATUS_ICON[item.status]}
                </Chip>
                <div className="min-w-0">
                  <p className="text-small font-medium">{item.label}</p>
                  <p className="text-tiny text-default-500">{item.detail}</p>
                </div>
              </div>
              {!readOnly && (
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="flat" color="success" onPress={() => onAccept?.(item.id)}>
                    {lang === "en" ? "Accept" : "接受"}
                  </Button>
                  <Button size="sm" variant="flat" color="warning" onPress={() => onReject?.(item.id)}>
                    {lang === "en" ? "Send back" : "退回"}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </NotionCard>
    </div>
  );
}
