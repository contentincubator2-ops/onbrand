/**
 * PillarTableMockup — squad step output: N content pillars with ratios.
 *
 * Output shape (from Pillar Architect Vincent):
 *   pillars: [{ name, hypothesis, ratio, target_kpi, sample_topics: [...] }]
 *
 * Ratios MUST sum to 100. UI shows running total + warning if drift.
 */
import React from "react";
import { Input, Textarea, Chip, Progress } from "@heroui/react";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";

export interface PillarRow {
  name: string;
  hypothesis: string;
  ratio: number;        // 0-100
  target_kpi: string;
  sample_topics: string[];
  // CJ direction 2026-04-30: each pillar must declare visual direction
  // so step 5 brief writer + step 5 visual director have a consistent
  // reference for image_brief generation per pillar.
  visualDirection: string;
}

interface Props extends SquadMockupCommonProps {
  data?: { pillars: PillarRow[]; tilt?: string };
  onChange?: (next: PillarRow[]) => void;
}

// Functional pillar colors — index-based, max 5
const PILLAR_COLORS = ["#7c5dfa", "#10b981", "#f59e0b", "#3b82f6", "#ec4899"] as const;

export function PillarTableMockup({ data, readOnly = false, isActive = false, onChange }: Props) {
  const pillars = data?.pillars ?? [];
  const ratioTotal = pillars.reduce((s, p) => s + (p.ratio || 0), 0);
  const ratioOk = ratioTotal === 100;

  const updatePillar = (idx: number, patch: Partial<PillarRow>) => {
    if (!onChange) return;
    onChange(pillars.map((p, i) => i === idx ? { ...p, ...patch } : p));
  };

  return (
    <div className="flex flex-col gap-3 max-w-4xl">
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader
            icon="🏛"
            eyebrow="步驟 3 · 內容支柱"
            title={data?.tilt ? `傾斜主題：${data.tilt}` : "內容支柱定義"}
          />
          {isActive && (
            <Chip size="sm" variant="flat" color="primary" className="self-start">
              ● Vincent Shen 思考中…
            </Chip>
          )}
        </div>

        {pillars.length === 0 ? (
          <EmptyHint>尚未產出內容支柱 — 步驟 3 跑完才會填</EmptyHint>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {pillars.map((p, i) => (
                <PillarRowCard
                  key={i}
                  pillar={p}
                  index={i}
                  color={PILLAR_COLORS[i % PILLAR_COLORS.length]!}
                  readOnly={readOnly}
                  onChange={(patch) => updatePillar(i, patch)}
                />
              ))}
            </div>

            {/* Ratio summary */}
            <div className={`mt-2 flex items-center justify-between text-tiny ${ratioOk ? "text-success" : "text-warning"}`}>
              <span>比例總計</span>
              <span className="font-semibold tabular-nums">{ratioTotal} / 100</span>
            </div>
            <Progress
              size="sm"
              value={Math.min(ratioTotal, 100)}
              color={ratioOk ? "success" : "warning"}
              aria-label="ratio total"
            />
            {!ratioOk && (
              <p className="text-tiny text-warning mt-1">⚠ 比例需總和等於 100。差 {100 - ratioTotal} 點。</p>
            )}
          </>
        )}
      </NotionCard>
    </div>
  );
}

function PillarRowCard({
  pillar, index, color, readOnly, onChange,
}: {
  pillar: PillarRow;
  index: number;
  color: string;
  readOnly: boolean;
  onChange: (patch: Partial<PillarRow>) => void;
}) {
  return (
    <div className="rounded-md border border-divider p-3 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <span
          className="mt-1 w-3 h-3 rounded-full flex-shrink-0"
          style={{ background: color }}
          aria-label={`pillar ${index + 1} color`}
        />
        <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-[1fr_120px_140px] gap-2">
          <Input
            size="sm" radius="md" variant="bordered"
            label="支柱名稱" labelPlacement="outside"
            value={pillar.name}
            onValueChange={(v) => onChange({ name: v })}
            isReadOnly={readOnly}
          />
          <Input
            size="sm" radius="md" variant="bordered" type="number"
            label="比例 %" labelPlacement="outside"
            value={String(pillar.ratio ?? 0)}
            onValueChange={(v) => onChange({ ratio: Number(v) || 0 })}
            isReadOnly={readOnly}
            min={0} max={100}
          />
          <Input
            size="sm" radius="md" variant="bordered"
            label="目標 KPI" labelPlacement="outside"
            value={pillar.target_kpi}
            onValueChange={(v) => onChange({ target_kpi: v })}
            isReadOnly={readOnly}
          />
        </div>
      </div>

      <Textarea
        size="sm" radius="md" variant="bordered"
        label="假設（為什麼這個支柱在這個定位角是合理切入點）"
        labelPlacement="outside"
        minRows={2}
        value={pillar.hypothesis}
        onValueChange={(v) => onChange({ hypothesis: v })}
        isReadOnly={readOnly}
      />

      <div>
        <p className="text-tiny text-default-500 mb-1">Sample 主題（5 個）</p>
        <div className="flex flex-wrap gap-1.5">
          {(pillar.sample_topics ?? []).map((t, i) => (
            <Chip key={i} size="sm" variant="flat" className="h-6">{t}</Chip>
          ))}
          {(pillar.sample_topics ?? []).length === 0 && <EmptyHint>無</EmptyHint>}
        </div>
      </div>

      <Textarea
        size="sm" radius="md" variant="bordered"
        label="🎨 視覺方向（此支柱的視覺指引一致參考）"
        labelPlacement="outside"
        minRows={2}
        placeholder="例：使用扁平向量、藍金色系、玩家小卡感"
        value={pillar.visualDirection ?? ""}
        onValueChange={(v) => onChange({ visualDirection: v })}
        isReadOnly={readOnly}
      />
    </div>
  );
}
