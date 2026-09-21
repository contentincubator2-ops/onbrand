/**
 * ImageSlotFlow — 3-step media-gen flow embedded inside a mockup image slot.
 *
 * Session 7: replaces the floating MediaGenFlow wizard for visual steps.
 * The entire direction → prompt → model-pick → generate cycle happens
 * inside the aspect-square image slot of IGFeed (and other mockups).
 *
 * State machine:
 *   proposing        — auto-triggers on mount, shows spinner
 *   direction_pick   — 3 concept cards; user picks one
 *   prompt_edit      — editable prompt + compact model row
 *   generating       — spinner while API call is in flight
 *   done             — result image (URL) fills the slot
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, ScrollShadow, Skeleton, Spinner, Textarea } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight, faPalette, faRotate, faCopy, faCheck,
  faWandSparkles, faPenNib,
} from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../lib/trpc";
import { availableModels, type MediaKind, type MediaModel } from "../../lib/mediaModels";

// ── Types ─────────────────────────────────────────────────────────────────

interface Direction {
  id: string;
  title: string;
  tone: string;
  composition: string;
  palette: string;
  mood: string;
  styleRef: string;
  rationale: string;
  shotList?: string;
}

type Phase =
  | "proposing"        // auto-fetching directions (spinner)
  | "direction_pick"   // showing direction cards
  | "prompt_edit"      // prompt textarea + model selector
  | "generating"       // API call in-flight
  | "done";            // result filled

export interface ImageSlotFlowResult {
  url: string;
  modelId: string;
  promptEn: string;
}

export interface ImageSlotFlowProps {
  /** Brief from agent step output or mission description. */
  brief: string;
  brandContext?: string;
  kind?: MediaKind;
  preferredModelTags?: string[];
  brandId?: number | null;
  /** Called once generation succeeds — parent updates the slot. */
  onDone: (result: ImageSlotFlowResult) => void;
}

// ── Main component ────────────────────────────────────────────────────────

export default function ImageSlotFlow({
  brief, brandContext, kind = "image",
  preferredModelTags, brandId, onDone,
}: ImageSlotFlowProps) {
  const [phase, setPhase] = useState<Phase>("proposing");
  const [directions, setDirections] = useState<Direction[]>([]);
  const [pickedDir, setPickedDir] = useState<Direction | null>(null);
  const [promptEn, setPromptEn] = useState("");
  const [pickedModel, setPickedModel] = useState<MediaModel | null>(null);
  const [genResult, setGenResult] = useState<ImageSlotFlowResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const proposeMutation = (trpc as any).media?.proposeDirection?.useMutation?.() ?? null;
  const craftMutation   = (trpc as any).media?.craftPrompt?.useMutation?.()       ?? null;
  const generateMutation= (trpc as any).media?.generate?.useMutation?.()           ?? null;

  // Stable ref so the auto-propose effect doesn't fire twice in StrictMode
  const proposedRef = useRef(false);

  // Available models (ready + manual), preferred ones floated first
  const models = React.useMemo(() => {
    const all = availableModels(kind);
    if (!preferredModelTags?.length) return all;
    const tagSet = new Set(preferredModelTags.map((t) => t.toLowerCase()));
    const score = (m: MediaModel) =>
      (m.tags ?? []).filter((t) => tagSet.has(t.toLowerCase())).length;
    return [...all].sort((a, b) => score(b) - score(a));
  }, [kind, preferredModelTags]);

  // Auto-propose on mount
  const propose = useCallback(async () => {
    setPhase("proposing");
    setErr(null);
    if (!proposeMutation) {
      // No backend yet — skip to prompt edit with empty prompt
      setPhase("prompt_edit");
      return;
    }
    try {
      const res: any = await proposeMutation.mutateAsync({
        kind, brief: brief.trim() || "社群貼文主視覺",
        brandContext, count: 3,
      });
      setDirections((res?.directions as Direction[]) ?? []);
      setPhase("direction_pick");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setPhase("direction_pick"); // still show (empty) cards + error
    }
  }, [proposeMutation, kind, brief, brandContext]);

  useEffect(() => {
    if (proposedRef.current) return;
    proposedRef.current = true;
    propose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePickDir = useCallback(async (d: Direction) => {
    setPickedDir(d);
    setPhase("prompt_edit");
    setErr(null);
    if (!craftMutation) {
      setPromptEn(`${d.composition}. ${d.mood}. ${d.palette}. Style: ${d.styleRef}.`);
      return;
    }
    try {
      const res: any = await craftMutation.mutateAsync({
        kind, direction: d, brief: brief.trim(),
        modelId: kind === "video" ? "piapi/kling-v2-master" : "openai/gpt-image-2",
      });
      setPromptEn(String(res?.promptEn ?? ""));
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }, [craftMutation, kind, brief]);

  const handleGenerate = useCallback(async (m: MediaModel) => {
    setPickedModel(m);
    if (m.status === "manual") {
      try { await navigator.clipboard.writeText(promptEn); setCopied(true); } catch { /**/ }
      setErr(`指令已複製。請手動貼到 ${m.name}（無 API）。`);
      return;
    }
    if (!generateMutation) {
      setErr("media.generate 尚未部署");
      return;
    }
    setPhase("generating");
    setErr(null);
    try {
      const res: any = await generateMutation.mutateAsync({
        kind, modelId: m.id, promptEn, brandId,
      });
      if (res?.ok && res?.url) {
        const result: ImageSlotFlowResult = { url: String(res.url), modelId: m.id, promptEn };
        setGenResult(result);
        setPhase("done");
        onDone(result);
      } else {
        setErr(res?.message ?? "生成失敗，請重試");
        setPhase("prompt_edit");
      }
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setPhase("prompt_edit");
    }
  }, [generateMutation, kind, promptEn, brandId, onDone]);

  // ── Render ────────────────────────────────────────────────────────────

  // Done — show result image
  if (phase === "done" && genResult?.url) {
    return (
      <div className="absolute inset-0">
        <img src={genResult.url} alt="generated" className="w-full h-full object-cover" />
        <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-2 py-1 flex items-center justify-between">
          <span className="text-white text-tiny truncate">{genResult.modelId.split("/").pop()}</span>
          <Button
            size="sm" variant="flat" className="text-white h-6 text-tiny"
            onPress={() => { setPhase("direction_pick"); proposedRef.current = false; propose(); }}
          >
            重新生成
          </Button>
        </div>
      </div>
    );
  }

  // Generating — spinner overlay
  if (phase === "generating") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-default-50/90">
        <Spinner size="lg" color="primary" />
        <p className="text-tiny text-default-600 font-medium">
          {pickedModel?.name ?? "AI"} 生成中…
        </p>
        <p className="text-tiny text-default-400">通常需要 {pickedModel?.durationSecEstimate ?? 30} 秒</p>
      </div>
    );
  }

  // Proposing — spinner
  if (phase === "proposing") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-default-50/80">
        <Spinner size="md" color="secondary" />
        <p className="text-tiny text-secondary">AI 構思設計方向中…</p>
      </div>
    );
  }

  // Direction pick
  if (phase === "direction_pick") {
    return (
      <div className="absolute inset-0 flex flex-col bg-content1">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-2.5 py-1.5 border-b border-divider bg-default-50/80">
          <div className="flex items-center gap-1.5">
            <FontAwesomeIcon icon={faPalette} className="text-secondary text-tiny" />
            <span className="text-tiny font-semibold text-default-700">選設計方向</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              isIconOnly size="sm" variant="light" radius="full"
              onPress={() => { proposedRef.current = false; propose(); }}
              aria-label="重新提案"
            >
              <FontAwesomeIcon icon={faRotate} className="text-tiny text-default-500" />
            </Button>
            <Button
              size="sm" variant="light" className="text-tiny h-6 px-2 text-default-500"
              onPress={() => { setPickedDir(null); setPromptEn(""); setPhase("prompt_edit"); }}
            >
              自訂指令 →
            </Button>
          </div>
        </div>

        {/* Direction cards */}
        <ScrollShadow className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {err && <p className="text-tiny text-danger px-1">{err}</p>}
          {directions.length === 0 && !err && (
            <div className="flex items-center justify-center h-24">
              <p className="text-tiny text-default-400">提案為空，請重新提案</p>
            </div>
          )}
          {directions.map((d) => (
            <button
              key={d.id}
              onClick={() => handlePickDir(d)}
              className="w-full text-left rounded-lg border border-divider bg-default-50 hover:bg-secondary/5 hover:border-secondary/40 transition p-2.5 space-y-1"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-tiny font-semibold text-secondary">{d.title}</span>
                <span className="text-tiny text-default-400 shrink-0">{d.tone}</span>
              </div>
              <p className="text-tiny text-default-600 leading-snug line-clamp-2">{d.composition}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-tiny text-default-400">🎨 {d.palette.slice(0, 24)}</span>
                <span className="text-tiny text-default-400">✦ {d.mood.slice(0, 20)}</span>
              </div>
              <div className="flex justify-end">
                <span className="text-tiny text-secondary font-medium flex items-center gap-0.5">
                  選這個 <FontAwesomeIcon icon={faArrowRight} className="text-tiny" />
                </span>
              </div>
            </button>
          ))}
        </ScrollShadow>
      </div>
    );
  }

  // Prompt edit + model selection
  if (phase === "prompt_edit") {
    return (
      <div className="absolute inset-0 flex flex-col bg-content1">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-2.5 py-1.5 border-b border-divider bg-default-50/80">
          <div className="flex items-center gap-1.5">
            <FontAwesomeIcon icon={faWandSparkles} className="text-primary text-tiny" />
            <span className="text-tiny font-semibold text-default-700">指令 + 模型</span>
          </div>
          <Button
            size="sm" variant="light" className="text-tiny h-6 px-2 text-default-500"
            onPress={() => directions.length > 0 ? setPhase("direction_pick") : propose()}
          >
            ← {directions.length > 0 ? "換方向" : "重新提案"}
          </Button>
        </div>

        <ScrollShadow className="flex-1 overflow-y-auto p-2 space-y-2">
          {/* Selected direction badge */}
          {pickedDir && (
            <div className="rounded-md bg-secondary/8 border border-secondary/20 px-2 py-1">
              <p className="text-tiny text-secondary font-medium">{pickedDir.title}</p>
              <p className="text-tiny text-default-500 truncate">{pickedDir.tone}</p>
            </div>
          )}

          {/* Prompt textarea */}
          <div className="relative">
            <Textarea
              size="sm"
              variant="bordered"
              placeholder="Describe the image you want to generate…"
              minRows={3}
              maxRows={5}
              classNames={{ input: "text-tiny", inputWrapper: "text-tiny" }}
              value={promptEn}
              onValueChange={setPromptEn}
            />
            <button
              className="absolute top-1.5 right-1.5 text-default-400 hover:text-default-600 transition"
              onClick={async () => {
                try { await navigator.clipboard.writeText(promptEn); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {/**/}
              }}
              title="複製指令"
            >
              <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="text-tiny" />
            </button>
          </div>

          {err && <p className="text-tiny text-danger leading-snug">{err}</p>}

          {/* Model buttons — compact row/grid */}
          <div>
            <p className="text-tiny text-default-500 mb-1.5 flex items-center gap-1">
              <FontAwesomeIcon icon={faPenNib} className="text-tiny" />
              選模型後直接生成
            </p>
            <div className="grid grid-cols-2 gap-1">
              {models.slice(0, 6).map((m) => {
                const isRecommended = !!preferredModelTags?.length &&
                  (m.tags ?? []).some((t) => preferredModelTags.includes(t));
                return (
                  <button
                    key={m.id}
                    disabled={!promptEn.trim()}
                    onClick={() => handleGenerate(m)}
                    className={[
                      "flex flex-col items-start rounded-md border px-2 py-1.5 text-left transition",
                      "disabled:opacity-40 disabled:cursor-not-allowed",
                      isRecommended
                        ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                        : "border-divider bg-default-50 hover:bg-default-100",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-1 w-full min-w-0">
                      <span className="text-tiny font-medium text-foreground truncate">{m.name.split(" ").slice(0, 3).join(" ")}</span>
                      {isRecommended && <span className="text-tiny text-primary shrink-0">⭐</span>}
                      {m.status === "manual" && <span className="text-tiny text-warning shrink-0">📋</span>}
                    </div>
                    <span className="text-tiny text-default-400 truncate w-full">
                      {m.costEstimateUsd != null ? `~$${m.costEstimateUsd}` : ""}
                      {m.durationSecEstimate != null ? ` · ~${m.durationSecEstimate}s` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            {models.length > 6 && (
              <p className="text-tiny text-default-400 mt-1 text-center">+ {models.length - 6} 個更多模型</p>
            )}
          </div>
        </ScrollShadow>
      </div>
    );
  }

  return null;
}
