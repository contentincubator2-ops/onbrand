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
 *
 * 2026-05-02 CJ direction:
 *   Context source is NOT always "brand positioning" — it depends on what the
 *   user selected when launching the mission (brand / product / event).
 *   The mockup must show a visible "正在讀取..." loading state while the agent
 *   reads the selected context object, then populate the data once ready.
 */
import React from "react";
import {
  Input, Textarea, Select, SelectItem, CheckboxGroup, Checkbox,
  Button, Chip, Spinner,
} from "@heroui/react";
import { SectionHeader, DataChip, EmptyHint, NotionCard, type SquadMockupCommonProps } from "./shared";
import { useLang } from "../../../lib/i18n";

// ── Context source types ──────────────────────────────────────────────────────

export type ContextKind = "brand" | "product" | "event";

export interface ContextSource {
  kind: ContextKind;
  id: number;
  name: string;
  /** Sub-entity: if brand was selected with a specific product */
  productId?: number;
  productName?: string;
  /** Sub-entity: if brand was selected with a specific event */
  eventId?: number;
  eventName?: string;
}

/** Reading phases for the context banner */
export type ContextReadPhase =
  | "idle"      // mission not yet started
  | "reading"   // agent is reading the context object
  | "done"      // context loaded, data populated
  | "error";    // failed to read

const KIND_ICON: Record<ContextKind, string> = {
  brand:   "🏢",
  product: "📦",
  event:   "🎪",
};

const KIND_LABEL: Record<ContextKind, string> = {
  brand:   "品牌資料",
  product: "產品資料",
  event:   "活動資料",
};

const KIND_LABEL_EN: Record<ContextKind, string> = {
  brand:   "brand info",
  product: "product info",
  event:   "event info",
};

// ── Context Reading Banner ────────────────────────────────────────────────────

function ContextReadingBanner({
  source,
  phase,
  agentName = "Lead agent",
}: {
  source: ContextSource;
  phase: ContextReadPhase;
  agentName?: string;
}) {
  const { lang } = useLang();
  const icon  = KIND_ICON[source.kind];
  const label = lang === "en" ? KIND_LABEL_EN[source.kind] : KIND_LABEL[source.kind];

  // Sub-entity tags (product / event attached to a brand selection)
  const subTags: string[] = [];
  if (source.productName) subTags.push(lang === "en" ? `Product: ${source.productName}` : `產品：${source.productName}`);
  if (source.eventName)   subTags.push(lang === "en" ? `Event: ${source.eventName}` : `活動：${source.eventName}`);

  if (phase === "idle") return null;

  return (
    <div
      className={`rounded-xl border px-4 py-3 flex items-start gap-3 transition-all
        ${phase === "reading" ? "border-primary-200 bg-primary-50"
        : phase === "done"    ? "border-success-200 bg-success-50"
        : "border-danger-200 bg-danger-50"}`}
    >
      {/* Left: animated or static icon */}
      <div className="mt-0.5 flex-shrink-0">
        {phase === "reading" ? (
          <Spinner size="sm" color="primary" />
        ) : phase === "done" ? (
          <span className="text-success text-lg">✓</span>
        ) : (
          <span className="text-danger text-lg">✗</span>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        {/* Title row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold">
            {phase === "reading"
              ? (lang === "en"
                  ? `${agentName} is reading ${icon} ${source.name}'s ${label}…`
                  : `${agentName} 正在讀取 ${icon} ${source.name} 的${label}…`)
              : phase === "done"
              ? (lang === "en"
                  ? `${icon} ${source.name} ${label} loaded`
                  : `${icon} ${source.name} ${label}已讀取完畢`)
              : (lang === "en"
                  ? `Failed to load ${source.name}'s ${label}`
                  : `讀取 ${source.name} ${label}失敗`)}
          </span>
          {phase === "reading" && (
            <Chip size="sm" color="primary" variant="flat" className="h-4 text-[10px]">
              #{source.id}
            </Chip>
          )}
        </div>

        {/* What's being read */}
        {phase === "reading" && (
          <div className="text-[11px] text-primary-600 space-y-0.5">
            <ReadingRow label={lang === "en" ? "Basic info" : "基本資訊"} phase="reading" />
            <ReadingRow label={
              lang === "en"
                ? (source.kind === "brand" ? "Brand positioning · tone · audience" : source.kind === "product" ? "Product hooks · target customer" : "Event goal · time · place")
                : (source.kind === "brand" ? "品牌定位 · 語氣 · 受眾" : source.kind === "product" ? "產品賣點 · 目標客群" : "活動目的 · 時間 · 地點")
            } phase="reading" />
            {subTags.map((t, i) => <ReadingRow key={i} label={t} phase="reading" />)}
          </div>
        )}

        {/* Done: what was found */}
        {phase === "done" && subTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {subTags.map((t, i) => (
              <Chip key={i} size="sm" color="success" variant="flat" className="h-4 text-[10px]">{t}</Chip>
            ))}
          </div>
        )}

        {phase === "error" && (
          <p className="text-[11px] text-danger-700">{lang === "en" ? "Failed to load — verify your brand, product, and event details are complete, then try again." : "無法讀取資料，請確認品牌 / 產品 / 活動已正確建立後重試。"}</p>
        )}
      </div>
    </div>
  );
}

/** Single animated row inside the reading state */
function ReadingRow({ label, phase }: { label: string; phase: ContextReadPhase }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1 h-1 rounded-full bg-primary-400 animate-pulse" />
      <span>{label}</span>
    </div>
  );
}

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
    // CJ correction 2026-04-30: date range, NOT just month — users may
    // calculate "month" differently (e.g. 5/15 → 6/14 instead of 5/1 → 5/31).
    target_date_start?: string;   // YYYY-MM-DD
    target_date_end?: string;     // YYYY-MM-DD
    tilt_override?: string;
    pillar_count?: "3" | "4" | "5";
    // Replaces posting_cadence — total post count is more direct;
    // calendar architect derives cadence from total ÷ days.
    total_posts?: number;         // 8 ~ 30 typical range
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
  /** Which brand / product / event the user selected when launching this mission */
  contextSource?: ContextSource;
  /** Phase of agent reading the context object */
  contextReadPhase?: ContextReadPhase;
  /** Name of the assigned lead agent (shown in reading banner) */
  agentName?: string;
}

export function IntakeFormMockup({
  data, readOnly = false, isActive = false,
  onChange, onSubmit,
  contextSource,
  contextReadPhase = "idle",
  agentName = "Lead agent",
}: Props) {
  const { lang } = useLang();
  // Null-safe — `data = {}` default doesn't apply when explicit null
  // is passed (only undefined). Live mode passes null until LLM returns.
  const safe = data ?? {};
  const sys = safe.systemData ?? {};
  const web = safe.webSummary ?? {};
  const ui  = safe.userInput  ?? {};
  const gaps = safe.gaps ?? [];

  const update = (patch: Partial<NonNullable<IntakeFormData["userInput"]>>) => {
    onChange?.({ ...ui, ...patch });
  };

  const requiredFilled = !!(
    ui.target_date_start && ui.target_date_end
    && ui.tilt_override && ui.pillar_count
    && ui.total_posts && ui.kpi_focus
  );

  // Derive section header label from context source kind
  const bucketAIcon  = contextSource ? KIND_ICON[contextSource.kind]  : "📦";
  const bucketALabel = contextSource
    ? (lang === "en" ? KIND_LABEL_EN[contextSource.kind] : KIND_LABEL[contextSource.kind])
    : (lang === "en" ? "System data" : "系統資料");

  return (
    <div className="flex flex-col gap-4 max-w-3xl">

      {/* ── Context Reading Banner (shows while agent reads brand/product/event) ── */}
      {contextSource && contextReadPhase !== "idle" && (
        <ContextReadingBanner
          source={contextSource}
          phase={contextReadPhase}
          agentName={agentName}
        />
      )}

      {/* ── 系統資料（自動帶入）─────────────────────────────────── */}
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader
            icon={bucketAIcon}
            eyebrow={bucketALabel}
            title={
              contextReadPhase === "reading"
                ? (lang === "en" ? "Loading — fields will fill in shortly…" : "正在讀取中，稍候自動填入…")
                : contextReadPhase === "done"
                ? (lang === "en"
                    ? `Auto-filled from ${contextSource?.name ?? "your selection"}`
                    : `已從 ${contextSource?.name ?? "所選物件"} 自動帶入`)
                : (lang === "en"
                    ? "Auto-filled from your selected brand / product / event"
                    : "已從選擇的品牌 / 產品 / 活動自動帶入")
            }
          />
          {/* Legacy active chip when no contextSource provided */}
          {isActive && !contextSource && (
            <Chip size="sm" variant="flat" color="primary" className="self-start">
              ● {lang === "en" ? `${agentName} gathering…` : `${agentName} 蒐集中…`}
            </Chip>
          )}
          {/* Reading spinner chip */}
          {contextReadPhase === "reading" && (
            <Chip size="sm" variant="flat" color="primary" className="self-start flex items-center gap-1">
              <Spinner size="sm" className="scale-75" /> {lang === "en" ? "Loading" : "讀取中"}
            </Chip>
          )}
        </div>

        {/* Skeleton rows while reading */}
        {contextReadPhase === "reading" ? (
          <div className="flex flex-wrap gap-2">
            {(lang === "en"
              ? ["Brand", "Industry", "Tone", "Main audience", "Events this month", "Linked products"]
              : ["品牌", "產業", "語氣", "主受眾", "當月活動", "關聯產品"]
            ).map((l) => (
              <div
                key={l}
                className="h-6 rounded-full bg-default-200 animate-pulse"
                style={{ width: `${48 + l.length * 10}px` }}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <DataChip label={lang === "en" ? "Brand" : "品牌"}     value={sys.brandName} />
            <DataChip label={lang === "en" ? "Industry" : "產業"}     value={sys.industry} />
            <DataChip label={lang === "en" ? "Tone" : "語氣"}     value={sys.voice} />
            <DataChip label={lang === "en" ? "Audience" : "主受眾"}   value={sys.audience} />
            <DataChip label={lang === "en" ? "Events this month" : "當月活動"} value={sys.eventsThisMonth?.length ?? 0} />
            <DataChip label={lang === "en" ? "Linked products" : "關聯產品"} value={sys.products?.length ?? 0} />
          </div>
        )}

        {sys.eventsThisMonth && sys.eventsThisMonth.length > 0 && (
          <div className="mt-2 text-tiny text-default-500">
            {lang === "en" ? "Events:" : "活動："}{sys.eventsThisMonth.map((e) => `${e.name} (${e.startAt})`).join(" · ")}
          </div>
        )}
        {sys.fbHistorySummary && (
          <p className="text-tiny text-default-500 mt-2">{lang === "en" ? `Past FB posts: ${sys.fbHistorySummary}` : `FB 已發貼文摘要：${sys.fbHistorySummary}`}</p>
        )}
      </NotionCard>

      {/* ── 市場觀察（intake 已預跑）──────────────────────────── */}
      <NotionCard>
        <SectionHeader
          icon="🌐"
          eyebrow={lang === "en" ? "Market signals" : "市場觀察"}
          title={lang === "en" ? "Live signals from the web (auto-fetched at session start)" : "網路上目前的訊號（intake 已先預跑）"}
        />
        <div className="flex flex-col gap-1.5 text-tiny text-default-700 leading-relaxed">
          <div><span className="text-default-500">{lang === "en" ? "Audience pains preview: " : "受眾痛點預覽："}</span>{web.audiencePainsPreview ?? <EmptyHint>{lang === "en" ? "Run intake first" : "跑 intake 才會有"}</EmptyHint>}</div>
          <div><span className="text-default-500">{lang === "en" ? "Competitor pillars preview: " : "競品支柱預覽："}</span>{web.competitorPillarsPreview ?? <EmptyHint>{lang === "en" ? "Run intake first" : "跑 intake 才會有"}</EmptyHint>}</div>
          <div><span className="text-default-500">{lang === "en" ? "FB Prime Time: " : "FB Prime Time："}</span>{web.primeTime ?? <EmptyHint>{lang === "en" ? "Run intake first" : "跑 intake 才會有"}</EmptyHint>}</div>
        </div>
      </NotionCard>

      {/* ── 用戶決定的策略選擇 ──────────────────────────────── */}
      <NotionCard>
        <SectionHeader
          icon="👤"
          eyebrow={lang === "en" ? "Strategy picks" : "策略選擇"}
          title={lang === "en" ? "You decide these — too important to automate" : "這幾項由你決定（AI 不該替你猜）"}
          color="primary"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            size="sm" radius="md" variant="bordered" type="date"
            label={lang === "en" ? "Start date" : "規劃起始日（年月日）"} labelPlacement="outside"
            value={ui.target_date_start ?? ""}
            onValueChange={(v) => update({ target_date_start: v })}
            isRequired
            isReadOnly={readOnly}
          />
          <Input
            size="sm" radius="md" variant="bordered" type="date"
            label={lang === "en" ? "End date" : "規劃結束日（年月日）"} labelPlacement="outside"
            value={ui.target_date_end ?? ""}
            onValueChange={(v) => update({ target_date_end: v })}
            isRequired
            isReadOnly={readOnly}
          />
          <Select
            size="sm" radius="md" variant="bordered"
            label={lang === "en" ? "Pillar count (3-5)" : "支柱數量（3-5）"} labelPlacement="outside"
            placeholder={lang === "en" ? "Pick 3 / 4 / 5" : "選 3 / 4 / 5"}
            selectedKeys={ui.pillar_count ? new Set([ui.pillar_count]) : new Set()}
            onSelectionChange={(keys) => {
              const k = Array.from(keys as Set<string>)[0] as "3" | "4" | "5";
              update({ pillar_count: k });
            }}
            isRequired
            isDisabled={readOnly}
          >
            {["3", "4", "5"].map((n) => (
              <SelectItem key={n}>{lang === "en" ? `${n} pillars` : `${n} 個支柱`}</SelectItem>
            ))}
          </Select>
          <Input
            size="sm" radius="md" variant="bordered" type="number"
            label={lang === "en" ? "Total posts (during this period)" : "總篇數（這段期間總共要發幾篇）"} labelPlacement="outside"
            placeholder={lang === "en" ? "e.g. 16" : "例：16"}
            value={ui.total_posts != null ? String(ui.total_posts) : ""}
            onValueChange={(v) => update({ total_posts: Number(v) || undefined })}
            min={4} max={60}
            isRequired
            isReadOnly={readOnly}
          />
          <Select
            size="sm" radius="md" variant="bordered"
            label="KPI Focus" labelPlacement="outside"
            placeholder={lang === "en" ? "Main metric" : "主要指標"}
            selectedKeys={ui.kpi_focus ? new Set([ui.kpi_focus]) : new Set()}
            onSelectionChange={(keys) => {
              const k = Array.from(keys as Set<string>)[0] as NonNullable<IntakeFormData["userInput"]>["kpi_focus"];
              update({ kpi_focus: k });
            }}
            isRequired
            isDisabled={readOnly}
          >
            <SelectItem key="reach">{lang === "en" ? "Reach" : "Reach 觸及"}</SelectItem>
            <SelectItem key="saves">{lang === "en" ? "Saves" : "Saves 收藏"}</SelectItem>
            <SelectItem key="shares">{lang === "en" ? "Shares" : "Shares 分享"}</SelectItem>
            <SelectItem key="convert">{lang === "en" ? "Convert" : "Convert 轉換"}</SelectItem>
          </Select>
        </div>
        <Textarea
          size="sm" radius="md" variant="bordered"
          label={lang === "en" ? "Positioning angle — confirm or adjust" : "定位角確認 / 編輯（AI 專家已從品牌定位推導）"}
          labelPlacement="outside"
          minRows={3}
          placeholder={lang === "en" ? "One line describing the semantic space you want to own" : "一句話描述你想壟斷的語意空間"}
          value={ui.tilt_override ?? ""}
          onValueChange={(v) => update({ tilt_override: v })}
          isReadOnly={readOnly}
          className="mt-2"
        />

        {/* Optional event focus */}
        {sys.eventsThisMonth && sys.eventsThisMonth.length > 0 && (
          <div className="mt-2">
            <p className="text-tiny text-default-500 mb-1.5">{lang === "en" ? "Event focus (optional, multi-select)" : "活動強調方向（選填，可複選）"}</p>
            <CheckboxGroup
              value={ui.event_focus ?? []}
              onValueChange={(v) => update({ event_focus: v as string[] })}
              orientation="horizontal"
              isDisabled={readOnly}
            >
              <Checkbox value="SMP">{lang === "en" ? "SMP angle" : "SMP 命題"}</Checkbox>
              <Checkbox value="messaging">{lang === "en" ? "Messaging" : "訊息架構"}</Checkbox>
              <Checkbox value="creative">{lang === "en" ? "Creative" : "創意概念"}</Checkbox>
              <Checkbox value="all">{lang === "en" ? "All" : "全部"}</Checkbox>
            </CheckboxGroup>
          </div>
        )}

        {/* FB OAuth (optional) */}
        <div className="mt-2 flex items-center gap-2">
          <Chip size="sm" variant="flat" color={ui.fb_oauth_token ? "success" : "default"}>
            {lang === "en" ? `FB scan ${ui.fb_oauth_token ? "connected" : "not connected"}` : `FB 掃描 ${ui.fb_oauth_token ? "已連接" : "未連接"}`}
          </Chip>
          {!ui.fb_oauth_token && !readOnly && (
            <Button
              size="sm" variant="bordered" radius="md"
              onPress={() => update({ fb_oauth_token: "demo-token" })}
            >
              {lang === "en" ? "Connect Facebook page (optional)" : "連接 Facebook 頁面（選填）"}
            </Button>
          )}
        </div>
      </NotionCard>

      {/* ── 資料缺失提醒 ────────────────────────────────────── */}
      {gaps.length > 0 && (
        <NotionCard className="border-warning-200 bg-warning-50">
          <SectionHeader icon="⚠" eyebrow={lang === "en" ? "Heads up" : "提醒"} title={lang === "en" ? "These aren't ready yet — will affect output quality" : "這些資料還沒準備好，會影響輸出品質"} color="warning" />
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
            {lang === "en" ? "Confirm & run squad" : "確認 & 開始執行"}
          </Button>
        </div>
      )}
    </div>
  );
}
