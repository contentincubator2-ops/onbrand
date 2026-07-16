/**
 * FBPostBriefMockup — squad step 5 output: per-post brief cards.
 *
 * Each card renders one post brief from the calendar:
 *   - date / pillar tag / format
 *   - hook (large)
 *   - copy excerpt
 *   - CTA chip
 *   - image direction (visual brief — feeds MediaGenFlow if approved)
 */
import React from "react";
import { Card, CardBody, Chip, Textarea, Input } from "@heroui/react";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";

export interface PostBrief {
  date: string;            // YYYY-MM-DD
  pillarIndex: number;     // 0-4
  pillarName: string;
  format: "post" | "reel" | "carousel" | "long-text" | "story";
  hook: string;            // headline / opening line
  copy: string;            // body excerpt
  cta: string;             // call-to-action text
  imageDirection: string;  // visual brief for next-stage MediaGenFlow
  eventAnchor?: string;
}

interface Props extends SquadMockupCommonProps {
  data?: { briefs: PostBrief[] };
  onChange?: (idx: number, patch: Partial<PostBrief>) => void;
}

const PILLAR_COLORS = ["#7c5dfa", "#10b981", "#f59e0b", "#3b82f6", "#ec4899"] as const;
const FORMAT_LABEL: Record<PostBrief["format"], string> = {
  "post":      "📝 圖文",
  "reel":      "🎬 Reel",
  "carousel":  "🖼 輪播圖文",
  "long-text": "📊 長文",
  "story":     "📱 Story",
};

export function FBPostBriefMockup({ data, readOnly = false, isActive = false, onChange }: Props) {
  const briefs = data?.briefs ?? [];

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader
            icon="✍"
            eyebrow="步驟 5 · 每篇企劃摘要"
            title={`${briefs.length} 篇企劃摘要`}
          />
          {isActive && (
            <Chip size="sm" variant="flat" color="primary" className="self-start">
              ● Aiden Hsu 撰寫中…（{briefs.length}/16-20 篇）
            </Chip>
          )}
        </div>
        {briefs.length === 0 ? (
          <EmptyHint>步驟 5 跑完才會有企劃摘要</EmptyHint>
        ) : (
          <p className="text-tiny text-default-500">
            每張卡 = 行事曆的一個時段。下游小組（fb-post-writer-from-brief）會把每張卡轉成可發布的最終貼文。
          </p>
        )}
      </NotionCard>

      {briefs.map((b, i) => (
        <BriefCard
          key={i}
          brief={b}
          color={PILLAR_COLORS[b.pillarIndex % 5]!}
          readOnly={readOnly}
          onChange={(patch) => onChange?.(i, patch)}
        />
      ))}
    </div>
  );
}

function BriefCard({
  brief, color, readOnly, onChange,
}: {
  brief: PostBrief;
  color: string;
  readOnly: boolean;
  onChange: (patch: Partial<PostBrief>) => void;
}) {
  return (
    <Card shadow="none" className="border border-divider">
      <CardBody className="p-4 gap-3">
        {/* Header: date / pillar / format / event anchor */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-tiny text-default-500 tabular-nums font-medium">{brief.date}</span>
            <Chip
              size="sm"
              variant="flat"
              classNames={{ content: "flex items-center gap-1" }}
              startContent={<span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
            >
              {brief.pillarName}
            </Chip>
            <Chip size="sm" variant="flat" color="default">
              {FORMAT_LABEL[brief.format]}
            </Chip>
          </div>
          {brief.eventAnchor && (
            <Chip size="sm" variant="flat" color="danger">⭐ {brief.eventAnchor}</Chip>
          )}
        </div>

        {/* Hook */}
        <Input
          size="md" radius="md" variant="bordered"
          label="開場鉤（開場一句吸引眼球）" labelPlacement="outside"
          value={brief.hook}
          onValueChange={(v) => onChange({ hook: v })}
          isReadOnly={readOnly}
          classNames={{
            input: "text-medium font-medium",
          }}
        />

        {/* Copy */}
        <Textarea
          size="sm" radius="md" variant="bordered"
          label="文案內容（200 字內）" labelPlacement="outside"
          minRows={3}
          value={brief.copy}
          onValueChange={(v) => onChange({ copy: v })}
          isReadOnly={readOnly}
        />

        {/* CTA + image direction */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            size="sm" radius="md" variant="bordered"
            label="CTA" labelPlacement="outside"
            value={brief.cta}
            onValueChange={(v) => onChange({ cta: v })}
            isReadOnly={readOnly}
          />
          <Textarea
            size="sm" radius="md" variant="bordered"
            label="視覺方向（→ 走 MediaGenFlow 3 步驟）" labelPlacement="outside"
            minRows={2}
            value={brief.imageDirection}
            onValueChange={(v) => onChange({ imageDirection: v })}
            isReadOnly={readOnly}
          />
        </div>
      </CardBody>
    </Card>
  );
}
