/**
 * 單一定位欄位的編輯面板，以及品牌素材面板。
 */
import { useLang } from "../../../../lib/i18n";
import { Card, CardBody, Chip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { LockIcon } from "../../../platform/components/icons";
import { type SegmentSpec, SCOPE_SEGMENTS } from "../../lib/positioningSchema";
import { trpc } from "../../../../lib/trpc";
import React, { useState } from "react";
import PositioningDocPanel from "../../components/positioning/PositioningDocPanel";
import ThinkingOverlay from "../../components/positioning/ThinkingOverlay";
import SegmentEditor from "../../components/positioning/SegmentEditor";
import { readProductFacts } from "../../lib/productFacts";
import BrandAssetEditor, { type AssetKey } from "../../components/assets/BrandAssetEditor";
import SpeedCard from "../../components/positioning/SpeedCard";

export interface PipelineThinking {
  segmentTarget: string;
  text: string;
  phase: "loading" | "typing" | "writing";
  startedAt: number | null;
  stepNum: number;
  stepTotal: number;
  stepTitle: string;
}

export function PositioningPanel({
  section, scopeMode, scopeName,
  scopeBrandId, scopeProductId, scopeEventId,
  pipelineThinking, onAutoFill, locked, onBackToOverview,
}: {
  section: string;
  scopeMode: "brand" | "product" | "event" | "none";
  scopeName: string;
  scopeBrandId: number | null;
  scopeProductId: number | null;
  scopeEventId: number | null;
  pipelineThinking?: PipelineThinking | null;
  onAutoFill?: (segmentId: string) => void;
  locked?: boolean;
  /** 回定位總覽——「我的定位文件」寫入完成後的出口（CJ:「會迷路」）。 */
  onBackToOverview?: () => void;
}) {
  const { lang } = useLang();
  if (scopeMode === "none") {
    return (
      <Card shadow="none" className="border-2 border-dashed border-divider">
        <CardBody className="py-16 items-center text-center gap-3">
          <FontAwesomeIcon icon={faBookOpen} className="text-3xl text-default-500" />
          <p className="text-medium font-medium">{lang === "en" ? "No scope picked yet" : "尚未選擇 scope"}</p>
          <p className="text-small text-default-700 max-w-[320px]">
            {lang === "en"
              ? "Pick a brand, product, or campaign from the ScopeBar (top right) to edit positioning."
              : "請於右上 ScopeBar 選擇品牌 / 產品 / 活動，才能編輯定位內容。"}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div style={locked ? { position: "relative" } : undefined}>
      {locked && (
        <div style={{
          position: "sticky", top: 0, zIndex: 5,
          background: "#FEF3C7", border: "1px solid #FCD34D",
          padding: "8px 14px", borderRadius: 8, marginBottom: 12,
          fontSize: 12, color: "#92400E",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <LockIcon size={13} />
          <span>{lang === "en" ? "Positioning is locked — this section is read-only. Go to Brand settings to unlock and edit." : "定位已鎖定 — 此 segment 為唯讀。回 /brands 解鎖才能編輯。"}</span>
        </div>
      )}
      <div style={locked ? { opacity: 0.65, pointerEvents: "none" } : undefined}>
        <PositioningEditor
          section={section}
          scopeMode={scopeMode}
          scopeName={scopeName}
          brandId={scopeBrandId}
          productId={scopeProductId}
          eventId={scopeEventId}
          pipelineThinking={pipelineThinking ?? null}
          onAutoFill={onAutoFill}
          onBackToOverview={onBackToOverview}
        />
      </div>
    </div>
  );
}

export function PositioningEditor({
  section, scopeMode, scopeName, brandId, productId, eventId, pipelineThinking, onAutoFill, onBackToOverview,
}: {
  section: string;
  scopeMode: "brand" | "product" | "event";
  scopeName: string;
  brandId: number | null;
  productId: number | null;
  eventId: number | null;
  pipelineThinking: PipelineThinking | null;
  onAutoFill?: (segmentId: string) => void;
  /** 回定位總覽——「我的定位文件」寫入完成後的出口（CJ:「會迷路」）。 */
  onBackToOverview?: () => void;
}) {
  const { lang } = useLang();
  const segments: SegmentSpec[] = SCOPE_SEGMENTS[scopeMode] ?? [];
  const segmentId = section.startsWith("seg:") ? section.slice(4) : null;
  const activeSegment = segmentId ? segments.find((s) => s.id === segmentId) ?? null : null;

  // Read scope.active to get the merged positioning data for the chosen scope.
  const scopeActive = (trpc as any).scope?.active?.useQuery
    ? (trpc as any).scope.active.useQuery(
        { brandId, productId, eventId },
        { refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: null, isLoading: false };

  const dbPositioning =
    (scopeActive.data as any)?.[scopeMode]?.positioning ?? null;
  const targetId =
    scopeMode === "brand" ? brandId
    : scopeMode === "product" ? productId
    : eventId;

  // Local working copy + debounced persist via scope.savePositioning.
  const [draft, setDraft] = React.useState<Record<string, any>>({});
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  React.useEffect(() => {
    if (dbPositioning && typeof dbPositioning === "object") setDraft(dbPositioning);
  }, [dbPositioning]);

  const utils = (trpc as any).useUtils?.() ?? null;
  const saveMutation = (trpc as any).scope?.savePositioning?.useMutation
    ? (trpc as any).scope.savePositioning.useMutation({
        onSuccess: () => {
          setSaveState("saved");
          utils?.scope?.active?.invalidate?.();
        },
        onError: () => setSaveState("error"),
      })
    : null;

  const dirtyRef = React.useRef(false);
  const timerRef = React.useRef<any>(null);
  const onDraftChange = (next: Record<string, any>) => {
    setDraft(next);
    dirtyRef.current = true;
    if (!targetId || !saveMutation) return;
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveMutation.mutate({ kind: scopeMode, id: targetId, positioning: next });
      dirtyRef.current = false;
    }, 800);
  };

  if (section === "doc") {
    return (
      <PositioningDocPanel
        scopeMode={scopeMode}
        scopeId={targetId ?? null}
        scopeName={scopeName}
        // 2026-09-23（CJ「我寫入四格後，也沒有儲存或回到品牌頁面的按鈕。
        // 會迷路」）：寫入完成後要有一條明確的出口回總覽，不是靠使用者
        // 自己找左上角那顆返回。
        onBackToOverview={onBackToOverview}
      />
    );
  }
  if (section === "card") {
    return (
      <SpeedCardView scopeMode={scopeMode} data={draft} scopeName={scopeName} />
    );
  }

  // section === "seg:xxx" — render ONE segment editor
  if (!activeSegment) {
    return (
      <Card shadow="none" className="border border-divider">
        <CardBody className="py-12 items-center text-center gap-2">
          <FontAwesomeIcon icon={faBookOpen} className="text-3xl text-default-500" />
          <p className="text-medium font-medium">{lang === "en" ? "Section not found" : "找不到段落"}</p>
          <p className="text-small text-default-700">{lang === "en" ? "Pick a positioning section from the left to edit." : "請於左側選擇要編輯的定位書段落。"}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card shadow="none" className="border border-divider">
        <CardBody className="px-5 py-4 gap-1 flex-row items-center justify-between flex-wrap">
          <div>
            <p className="text-tiny text-default-700 uppercase tracking-wider">
              {scopeMode.toUpperCase()} · {activeSegment.num} {lang === "en" ? (activeSegment.titleEn ?? activeSegment.title) : activeSegment.title}
            </p>
            <h2 className="text-xl font-semibold tracking-tight">{scopeName}</h2>
          </div>
          <SaveIndicator state={saveState} hasTarget={!!targetId} />
        </CardBody>
      </Card>
      {pipelineThinking && (
        <ThinkingOverlay
          text={pipelineThinking.text}
          phase={pipelineThinking.phase}
          startedAt={pipelineThinking.startedAt ?? undefined}
          stepNum={pipelineThinking.stepNum}
          stepTotal={pipelineThinking.stepTotal}
          stepTitle={pipelineThinking.stepTitle}
        />
      )}
      <SegmentEditor
        spec={activeSegment}
        // 2026-09-25：商品事實這一段開起來要先帶出舊位置的值（售價／商品網址本來
        // 就存在 positioning 頂層），否則使用者會看到空表單，以為資料不見了，
        // 然後重打一次。第一次編輯存檔後就落在 canonical 的 facts.*。
        value={
          activeSegment.id === "facts" && scopeMode === "product"
            ? { ...readProductFacts(draft), ...(draft.facts ?? {}) }
            : draft[activeSegment.id] ?? null
        }
        onChange={(next) => onDraftChange({ ...draft, [activeSegment.id]: next })}
        onRunAgent={() => onAutoFill?.(activeSegment.id)}
        research={(draft._research as any)?.[activeSegment.id] ?? null}
        wizardMeta={(draft._wizardMeta as any)?.[activeSegment.id] ?? null}
      />
    </div>
  );
}

/* ─────────────────────────── BrandAssetPanel ───────────────────────── */
// Manual-fill panel for non-positioning brand assets (logo/colors/fonts/...).
// Reads scope.active.brand.positioning._assets[assetKey], writes via
// scope.savePositioning with debounced (800ms) auto-save.
export function BrandAssetPanel({ assetKey, brandId, locked }: { assetKey: AssetKey; brandId: number; locked?: boolean }) {
  const { lang } = useLang();
  const utils = (trpc as any).useUtils?.() ?? null;
  const scopeActive = (trpc as any).scope?.active?.useQuery
    ? (trpc as any).scope.active.useQuery(
        { brandId, productId: null, eventId: null },
        { refetchOnWindowFocus: false, staleTime: 30_000 }
      )
    : { data: null };
  const positioning = (scopeActive.data as any)?.brand?.positioning ?? {};
  const initialValue = (positioning._assets as any)?.[assetKey] ?? null;

  const [draft, setDraft] = useState<any>(initialValue);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  React.useEffect(() => { setDraft(initialValue); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [JSON.stringify(initialValue)]);

  const saveMutation = (trpc as any).scope?.savePositioning?.useMutation
    ? (trpc as any).scope.savePositioning.useMutation({
        onSuccess: () => { setSaveState("saved"); utils?.scope?.active?.invalidate?.(); },
        onError: () => setSaveState("error"),
      })
    : null;

  const timerRef = React.useRef<any>(null);
  const onChange = (next: any) => {
    // Once the user touches an AI-drafted field, it's no longer a pending
    // suggestion — drop the badge flag so it reads as confirmed content.
    const { aiSuggested: _drop, ...cleaned } = next ?? {};
    void _drop;
    setDraft(cleaned);
    if (!saveMutation) return;
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const nextAssets = { ...(positioning._assets ?? {}), [assetKey]: cleaned };
      const nextPositioning = { ...positioning, _assets: nextAssets };
      saveMutation.mutate({ kind: "brand", id: brandId, positioning: nextPositioning });
    }, 800);
  };

  return (
    <div className="flex flex-col gap-3">
      <Card shadow="none" className="border border-divider">
        <CardBody className="px-5 py-3 flex-row items-center justify-between flex-wrap">
          <p className="text-small text-default-700">
            {lang === "en"
              ? "Filled in manually · auto-saves"
              : "手動填寫 · 自動儲存"}
          </p>
          <SaveIndicator state={saveState} hasTarget={true} />
        </CardBody>
      </Card>
      <BrandAssetEditor assetKey={assetKey} value={draft} onChange={onChange} readOnly={!!locked} brandId={brandId} />
    </div>
  );
}

export function SaveIndicator({ state, hasTarget }: { state: "idle" | "saving" | "saved" | "error"; hasTarget: boolean }) {
  const { t, lang } = useLang();
  if (!hasTarget) {
    return (
      <Chip size="sm" variant="flat" color="warning" className="shrink-0">
        {lang === "en" ? "No ID bound — edits won't save" : "未綁定 ID — 編輯不會儲存"}
      </Chip>
    );
  }
  if (state === "saving") return <Chip size="sm" variant="flat" color="default" className="shrink-0">{t("saving")}</Chip>;
  if (state === "saved")  return <Chip size="sm" variant="flat" color="success" className="shrink-0">{t("saved")}</Chip>;
  if (state === "error")  return <Chip size="sm" variant="flat" color="danger"  className="shrink-0">{t("toast_save_failed")}</Chip>;
  return null;
}

export function SpeedCardView({ scopeMode, data, scopeName }: { scopeMode: string; data: any; scopeName: string }) {
  return (
    <SpeedCard
      scopeMode={scopeMode as "brand" | "product" | "event"}
      scopeName={scopeName}
      data={data}
    />
  );
}
