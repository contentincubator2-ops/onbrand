/**
 * IntakeFormMockup — used by squad steps with mockupVariant="IntakeFormMockup".
 *
 * Per project_squad_design_methodology.md, intake is mandatory for every
 * squad. 4 sections:
 *   📦 系統已有     — read-only chips of bucket-A data
 *   🌐 Web 摘要     — auto-research summary (read-only)
 *   👤 用戶必填     — bucket-B form fields
 *   ⚠ 缺口警告     — banner if bucket-A is sparse
 *
 * Two modes:
 *   - readOnly=true  → step 0 display (load + auto-derive only)
 *   - readOnly=false → step 1 (user edits before pipeline advances)
 */
import React from "react";
import {
  Input, Textarea, Select, SelectItem, CheckboxGroup, Checkbox,
  Button, Chip,
} from "@heroui/react";
import { SectionHeader, DataChip, EmptyHint, NotionCard, type SquadMockupCommonProps } from "./shared";

export interface IntakeFormData {
  // bucket A — read-only system data
  systemData?: {
    brandName?: string;
    industry?: string;
    voice?: string;
    audience?: string;
    eventsThisMonth?: Array<{ name: string; startAt: string; endAt: string }>;
    products?: string[];
    visualSystem?: { logo?: string; colors?: string[]; fonts?: string[] };
    fbHistorySummary?: string; // optional, only if OAuth
  };
  // bucket C — web research summary auto-fetched at intake
  webSummary?: {
    audiencePainsPreview?: string;
    competitorPillarsPreview?: string;
    primeTime?: string;
  };
  // bucket B — user input (form values)
  userInput?: {
    target_month?: string;        // YYYY-MM-DD (1st of month)
    tilt_override?: string;
    pillar_count?: "3" | "4" | "5";
    posting_cadence?: "3" | "4" | "5";
    kpi_focus?: "reach" | "saves" | "shares" | "convert";
    event_focus?: string[];       // ["SMP", "messaging", "creative", "all"]
    date_locks?: Array<{ date: string; theme: string }>;
    fb_oauth_token?: string;
  };
  // gaps surfaced
  gaps?: string[];
}

interface Props extends SquadMockupCommonProps {
  data?: IntakeFormData;
  onChange?: (next: IntakeFormData["userInput"]) => void;
  onSubmit?: () => void;
}

export function IntakeFormMockup({ data = {}, readOnly = false, onChange, onSubmit }: Props) {
  const sys = data.systemData ?? {};
  const web = data.webSummary ?? {};
  const ui  = data.userInput  ?? {};
  const gaps = data.gaps ?? [];

  const update = (patch: Partial<NonNullable<IntakeFormData["userInput"]>>) => {
    onChange?.({ ...ui, ...patch });
  };

  const requiredFilled = !!(
    ui.target_month && ui.tilt_override && ui.pillar_count
    && ui.posting_cadence && ui.kpi_focus
  );

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      {/* ── 📦 系統已有 ─────────────────────────────────────────── */}
      <NotionCard>
        <SectionHeader
          icon="📦"
          eyebrow="BUCKET A · 系統已有（自動撈）"
          title="這次 squad 不需要再問你的"
        />
        <div className="flex flex-wrap gap-2">
          <DataChip label="品牌"     value={sys.brandName} />
          <DataChip label="產業"     value={sys.industry} />
          <DataChip label="語氣"     value={sys.voice} />
          <DataChip label="主受眾"   value={sys.audience} />
          <DataChip label="當月活動" value={sys.eventsThisMonth?.length ?? 0} />
          <DataChip label="關聯產品" value={sys.products?.length ?? 0} />
        </div>
        {sys.eventsThisMonth && sys.eventsThisMonth.length > 0 && (
          <div className="mt-2 text-tiny text-default-500">
            活動：{sys.eventsThisMonth.map((e) => `${e.name} (${e.startAt})`).join(" · ")}
          </div>
        )}
        {sys.fbHistorySummary && (
          <p className="text-tiny text-default-500 mt-2">FB 已發貼文摘要：{sys.fbHistorySummary}</p>
        )}
      </NotionCard>

      {/* ── 🌐 Web 摘要 ────────────────────────────────────────── */}
      <NotionCard>
        <SectionHeader
          icon="🌐"
          eyebrow="BUCKET C · Web 補強（intake agent 已預跑）"
          title="先看一眼網路上目前的訊號"
        />
        <div className="flex flex-col gap-1.5 text-tiny text-default-700 leading-relaxed">
          <div><span className="text-default-500">受眾痛點預覽：</span>{web.audiencePainsPreview ?? <EmptyHint>跑 intake 才會有</EmptyHint>}</div>
          <div><span className="text-default-500">競品 Pillar 預覽：</span>{web.competitorPillarsPreview ?? <EmptyHint>跑 intake 才會有</EmptyHint>}</div>
          <div><span className="text-default-500">FB Prime Time：</span>{web.primeTime ?? <EmptyHint>跑 intake 才會有</EmptyHint>}</div>
        </div>
      </NotionCard>

      {/* ── 👤 用戶必填 ────────────────────────────────────────── */}
      <NotionCard>
        <SectionHeader
          icon="👤"
          eyebrow="BUCKET B · 用戶必填"
          title="這 4 個你決定，AI 不該猜"
          color="primary"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            size="sm" radius="md" variant="bordered" type="date"
            label="規劃月份" labelPlacement="outside"
            value={ui.target_month ?? ""}
            onValueChange={(v) => update({ target_month: v })}
            isRequired
            isReadOnly={readOnly}
          />
          <Select
            size="sm" radius="md" variant="bordered"
            label="Pillar 數量（3-5）" labelPlacement="outside"
            placeholder="選 3 / 4 / 5"
            selectedKeys={ui.pillar_count ? new Set([ui.pillar_count]) : new Set()}
            onSelectionChange={(keys) => {
              const k = Array.from(keys as Set<string>)[0] as "3" | "4" | "5";
              update({ pillar_count: k });
            }}
            isRequired
            isDisabled={readOnly}
          >
            {["3", "4", "5"].map((n) => (
              <SelectItem key={n}>{n} 個 pillar</SelectItem>
            ))}
          </Select>
          <Select
            size="sm" radius="md" variant="bordered"
            label="Posting Cadence" labelPlacement="outside"
            placeholder="每週幾篇"
            selectedKeys={ui.posting_cadence ? new Set([ui.posting_cadence]) : new Set()}
            onSelectionChange={(keys) => {
              const k = Array.from(keys as Set<string>)[0] as "3" | "4" | "5";
              update({ posting_cadence: k });
            }}
            isRequired
            isDisabled={readOnly}
          >
            {["3", "4", "5"].map((n) => (
              <SelectItem key={n}>每週 {n} 篇</SelectItem>
            ))}
          </Select>
          <Select
            size="sm" radius="md" variant="bordered"
            label="KPI Focus" labelPlacement="outside"
            placeholder="主要指標"
            selectedKeys={ui.kpi_focus ? new Set([ui.kpi_focus]) : new Set()}
            onSelectionChange={(keys) => {
              const k = Array.from(keys as Set<string>)[0] as NonNullable<IntakeFormData["userInput"]>["kpi_focus"];
              update({ kpi_focus: k });
            }}
            isRequired
            isDisabled={readOnly}
          >
            <SelectItem key="reach">Reach 觸及</SelectItem>
            <SelectItem key="saves">Saves 收藏</SelectItem>
            <SelectItem key="shares">Shares 分享</SelectItem>
            <SelectItem key="convert">Convert 轉換</SelectItem>
          </Select>
        </div>
        <Textarea
          size="sm" radius="md" variant="bordered"
          label="Tilt 確認 / 編輯（intake agent 已從品牌定位推導）"
          labelPlacement="outside"
          minRows={3}
          placeholder="一句話描述你想壟斷的語意空間"
          value={ui.tilt_override ?? ""}
          onValueChange={(v) => update({ tilt_override: v })}
          isReadOnly={readOnly}
          className="mt-2"
        />

        {/* Optional event focus */}
        {sys.eventsThisMonth && sys.eventsThisMonth.length > 0 && (
          <div className="mt-2">
            <p className="text-tiny text-default-500 mb-1.5">活動強調方向（選填，可複選）</p>
            <CheckboxGroup
              value={ui.event_focus ?? []}
              onValueChange={(v) => update({ event_focus: v as string[] })}
              orientation="horizontal"
              isDisabled={readOnly}
            >
              <Checkbox value="SMP">SMP 命題</Checkbox>
              <Checkbox value="messaging">訊息架構</Checkbox>
              <Checkbox value="creative">創意概念</Checkbox>
              <Checkbox value="all">全部</Checkbox>
            </CheckboxGroup>
          </div>
        )}

        {/* FB OAuth (optional) */}
        <div className="mt-2 flex items-center gap-2">
          <Chip size="sm" variant="flat" color={ui.fb_oauth_token ? "success" : "default"}>
            FB 掃描 {ui.fb_oauth_token ? "已連接" : "未連接"}
          </Chip>
          {!ui.fb_oauth_token && !readOnly && (
            <Button
              size="sm" variant="bordered" radius="md"
              onPress={() => update({ fb_oauth_token: "demo-token" })}
            >
              連接 Facebook 頁面（選填）
            </Button>
          )}
        </div>
      </NotionCard>

      {/* ── ⚠ 缺口警告 ────────────────────────────────────────── */}
      {gaps.length > 0 && (
        <NotionCard className="border-warning-200 bg-warning-50">
          <SectionHeader icon="⚠" eyebrow="缺口警告" title="影響此 squad 品質的資料缺失" color="warning" />
          <ul className="list-disc list-inside text-tiny text-warning-800 leading-relaxed space-y-1">
            {gaps.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </NotionCard>
      )}

      {/* Submit (only step 1 user checkpoint) */}
      {!readOnly && (
        <div className="flex justify-end">
          <Button
            color="primary"
            size="md"
            isDisabled={!requiredFilled}
            onPress={onSubmit}
          >
            確認 & 開始跑 Squad
          </Button>
        </div>
      )}
    </div>
  );
}
