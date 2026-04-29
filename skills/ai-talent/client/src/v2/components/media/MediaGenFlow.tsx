/**
 * MediaGenFlow — 3-step image / video generation flow.
 *
 * Per CJ direction 2026-04-29:
 *   Step 1  Design direction proposal (3-5 cards) → user picks / edits
 *   Step 2  AI prompt crafted from picked direction (English + 中文摘要)
 *   Step 3  Model picker (gpt-image / Imagen / Hailuo / Seedance / etc.)
 *
 * User can SKIP step 1 and/or 2 by using the "直接給 prompt" shortcut —
 * lands straight at Step 3 with a textarea to paste their own prompt.
 */
import React from "react";
import {
  Card, CardBody, CardHeader, Chip, Button, Tooltip, Tabs, Tab, Textarea,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Spinner, Divider,
} from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPalette, faWandSparkles, faImage, faVideo, faCheck, faCopy, faArrowRight,
  faPenNib, faRotate, faForward,
} from "@fortawesome/free-solid-svg-icons";
import {
  availableModels, type MediaKind, type MediaModel,
} from "../../lib/mediaModels";

interface MediaGenFlowProps {
  open: boolean;
  onClose: () => void;
  /** Initial brief — comes from segment / squad / quick task context. */
  initialBrief?: string;
  brandContext?: string;
  audienceContext?: string;
  /** image | video — drives model list + prompt phrasing. */
  kind?: MediaKind;
  /** Brand id for downstream generate dispatch. */
  brandId?: number | null;
  /**
   * Render inline (no Modal wrapper). Used by squad-runner when the active
   * step's outputKind is image/video — the 3-step flow takes over the middle
   * preview pane instead of popping a modal. `onClose` becomes a back/exit
   * affordance the caller controls.
   */
  inline?: boolean;
  /**
   * Tags from squad/agent.preferredModelTags. Models matching any of these
   * tags are floated to the top of the picker with a "推薦" chip. Empty/null
   * → all available models, default order.
   */
  preferredModelTags?: string[];
  /** Called when generation completes successfully (squad-runner uses this to attach the media URL to the active step). */
  onComplete?: (result: { url: string; modelId: string; promptEn: string }) => void;
}

type Phase = "input" | "directions" | "prompt" | "model";

interface Direction {
  id: string;
  title: string;
  tone: string;
  composition: string;
  palette: string;
  mood: string;
  styleRef: string;
  shotList?: string;
  rationale: string;
}

export default function MediaGenFlow({
  open, onClose, initialBrief = "", brandContext, audienceContext,
  kind = "image", brandId, inline = false, preferredModelTags, onComplete,
}: MediaGenFlowProps) {
  const [phase, setPhase] = React.useState<Phase>("input");
  const [brief, setBrief] = React.useState(initialBrief);
  const [busy, setBusy]   = React.useState(false);
  const [err, setErr]     = React.useState<string | null>(null);

  const [directions, setDirections] = React.useState<Direction[]>([]);
  const [pickedDir, setPickedDir]   = React.useState<Direction | null>(null);
  const [promptEn, setPromptEn]     = React.useState("");
  const [summaryZh, setSummaryZh]   = React.useState("");
  const [pickedModel, setPickedModel] = React.useState<MediaModel | null>(null);
  const [genResult, setGenResult]     = React.useState<{ ok: boolean; message?: string; url?: string } | null>(null);

  React.useEffect(() => {
    if (open) {
      setPhase("input");
      setBrief(initialBrief);
      setDirections([]); setPickedDir(null);
      setPromptEn(""); setSummaryZh("");
      setPickedModel(null); setGenResult(null);
      setErr(null); setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const proposeMutation = (trpc as any).media?.proposeDirection?.useMutation?.() ?? null;
  const craftMutation   = (trpc as any).media?.craftPrompt?.useMutation?.()       ?? null;
  const generateMutation= (trpc as any).media?.generate?.useMutation?.()           ?? null;

  const onProposeDirections = async () => {
    if (!brief.trim()) { setErr("請先輸入 brief"); return; }
    if (!proposeMutation) { setErr("media.proposeDirection 尚未部署"); return; }
    setBusy(true); setErr(null);
    try {
      const res: any = await proposeMutation.mutateAsync({
        kind, brief: brief.trim(), brandContext, audienceContext, count: 4,
      });
      setDirections((res?.directions as Direction[]) ?? []);
      setPhase("directions");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally { setBusy(false); }
  };

  const onPickDirection = (d: Direction) => {
    setPickedDir(d);
    onCraftPrompt(d);
  };

  const onCraftPrompt = async (d: Direction, modelHint?: string) => {
    if (!craftMutation) {
      setPhase("prompt");
      return;
    }
    setBusy(true); setErr(null);
    try {
      const res: any = await craftMutation.mutateAsync({
        kind,
        direction: d,
        brief: brief.trim(),
        modelId: modelHint ?? (kind === "video" ? "fal/seedance-v1-5-lite" : "openai/gpt-image-1"),
      });
      setPromptEn(String(res?.promptEn ?? ""));
      setSummaryZh(String(res?.summaryZh ?? ""));
      setPhase("prompt");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally { setBusy(false); }
  };

  const onSkipToPrompt = () => {
    // Skip directions — go straight to a blank prompt textarea.
    setPickedDir(null);
    setPromptEn(""); setSummaryZh("");
    setPhase("prompt");
  };

  const onPickModel = async (m: MediaModel) => {
    setPickedModel(m);
    if (m.status === "manual") {
      // copy to clipboard, signal manual workflow
      try { await navigator.clipboard.writeText(promptEn); } catch { /* */ }
      setGenResult({ ok: true, message: `Prompt 已複製。請手動貼到 ${m.name}（無 API）。` });
      setPhase("model");
      return;
    }
    if (!generateMutation) {
      setGenResult({ ok: false, message: "media.generate 尚未部署" });
      setPhase("model");
      return;
    }
    setBusy(true); setErr(null);
    try {
      const res: any = await generateMutation.mutateAsync({
        kind, modelId: m.id, promptEn, brandId,
      });
      setGenResult({
        ok: !!res?.ok,
        message: res?.message ?? (res?.ok ? "生成完成" : "Phase 2 將接入此 provider"),
        url: res?.url,
      });
      // Notify the squad-runner so it can attach the URL to the active step.
      if (res?.ok && res?.url && onComplete) {
        onComplete({ url: String(res.url), modelId: m.id, promptEn });
      }
    } catch (e: any) {
      setGenResult({ ok: false, message: e?.message ?? String(e) });
    } finally { setBusy(false); }
  };

  // Available models, with preferred-tag matches floated to the top.
  // Each model gets a derived `_recommended` flag for the chip.
  const models = React.useMemo(() => {
    const all = availableModels(kind);
    if (!preferredModelTags?.length) return all.map((m) => ({ ...m, _recommended: false }));
    const tagSet = new Set(preferredModelTags.map((t) => t.toLowerCase()));
    const score = (m: MediaModel) => {
      const ts = (m.tags ?? []).map((t) => t.toLowerCase());
      let n = 0;
      for (const t of ts) if (tagSet.has(t)) n++;
      return n;
    };
    return all
      .map((m) => ({ ...m, _recommended: score(m) > 0 }))
      .sort((a, b) => score(b) - score(a));
  }, [kind, preferredModelTags]);

  const body = (
    <>
      {phase === "input" && (
        <InputPhase
          brief={brief} setBrief={setBrief}
          onPropose={onProposeDirections}
          onSkip={onSkipToPrompt}
        />
      )}
      {phase === "directions" && (
        <DirectionsPhase
          directions={directions}
          kind={kind}
          onPick={onPickDirection}
          onRefresh={onProposeDirections}
          onSkip={onSkipToPrompt}
          busy={busy}
        />
      )}
      {phase === "prompt" && (
        <PromptPhase
          promptEn={promptEn} setPromptEn={setPromptEn}
          summaryZh={summaryZh}
          direction={pickedDir}
          onProceed={() => setPhase("model")}
          onBackToDirections={() => directions.length > 0 ? setPhase("directions") : setPhase("input")}
        />
      )}
      {phase === "model" && (
        <ModelPhase
          models={models}
          promptEn={promptEn}
          pickedModel={pickedModel}
          onPick={onPickModel}
          genResult={genResult}
          busy={busy}
        />
      )}
      {busy && <div className="flex items-center gap-2 text-tiny text-default-500"><Spinner size="sm" /> 處理中…</div>}
      {err && <p className="text-tiny text-danger">{err}</p>}
    </>
  );

  const header = (
    <>
      <Chip size="sm" variant="flat" color="default" className="uppercase tracking-wider self-start"
        startContent={<FontAwesomeIcon icon={kind === "video" ? faVideo : faImage} className="text-tiny ml-1" />}>
        {kind === "video" ? "影片生成" : "圖像生成"}
      </Chip>
      <h2 className="text-medium font-semibold">3-step 視覺產出流程</h2>
      <PhaseStepper phase={phase} />
    </>
  );

  // Inline mode — no Modal wrapper, render straight into parent layout.
  // Squad-runner uses this in the middle preview pane.
  if (inline) {
    if (!open) return null;
    return (
      <div className="flex flex-col gap-3 p-4 w-full max-w-3xl mx-auto">
        <div className="flex flex-col gap-1">{header}</div>
        <div className="flex flex-col gap-3">{body}</div>
      </div>
    );
  }

  return (
    <Modal isOpen={open} onClose={onClose} size="3xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">{header}</ModalHeader>
        <ModalBody className="gap-3">{body}</ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>關閉</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function PhaseStepper({ phase }: { phase: Phase }) {
  const steps: Array<{ id: Phase; label: string }> = [
    { id: "input",      label: "Brief" },
    { id: "directions", label: "設計方向" },
    { id: "prompt",     label: "AI Prompt" },
    { id: "model",      label: "選擇模型" },
  ];
  const idx = steps.findIndex((s) => s.id === phase);
  return (
    <div className="flex items-center gap-1 text-tiny text-default-500 flex-wrap mt-1">
      {steps.map((s, i) => (
        <React.Fragment key={s.id}>
          <span className={i <= idx ? "text-foreground font-medium" : ""}>{s.label}</span>
          {i < steps.length - 1 && <FontAwesomeIcon icon={faArrowRight} className="text-tiny text-default-300 mx-0.5" />}
        </React.Fragment>
      ))}
    </div>
  );
}

function InputPhase({
  brief, setBrief, onPropose, onSkip,
}: { brief: string; setBrief: (s: string) => void; onPropose: () => void; onSkip: () => void }) {
  return (
    <>
      <Textarea
        size="sm" radius="md" variant="bordered"
        label="Brief（你想要什麼樣的視覺？）"
        labelPlacement="outside"
        placeholder="例：為 SoWork 摘星活動主視覺，呈現拓荒者在資料宇宙中尋找方向的感覺，要有科技感但保留情感溫度。"
        minRows={4}
        value={brief}
        onValueChange={setBrief}
        autoFocus
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Button color="primary" startContent={<FontAwesomeIcon icon={faPalette} />} onPress={onPropose}
          isDisabled={!brief.trim()}>
          請 AI 提設計方向（推薦）
        </Button>
        <Tooltip content="跳過設計方向，直接寫 prompt">
          <Button variant="light" startContent={<FontAwesomeIcon icon={faForward} />} onPress={onSkip}>
            我已有想法，直接給 prompt
          </Button>
        </Tooltip>
      </div>
    </>
  );
}

function DirectionsPhase({
  directions, kind, onPick, onRefresh, onSkip, busy,
}: {
  directions: Direction[];
  kind: MediaKind;
  onPick: (d: Direction) => void;
  onRefresh: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-small text-default-500">
          AI 提了 {directions.length} 個跨度大的方向。挑一個最對的（每個都不一樣），或要 AI 重提一輪。
        </p>
        <div className="flex items-center gap-1">
          <Tooltip content="重新提案">
            <Button isIconOnly size="sm" variant="light" onPress={onRefresh} isDisabled={busy} aria-label="重新提案">
              <FontAwesomeIcon icon={faRotate} className="text-tiny" />
            </Button>
          </Tooltip>
          <Button size="sm" variant="light" startContent={<FontAwesomeIcon icon={faForward} />} onPress={onSkip}>
            跳過，直接給 prompt
          </Button>
        </div>
      </div>
      {directions.map((d) => (
        <Card key={d.id} shadow="none" isPressable onPress={() => onPick(d)}
          className="border border-divider hover:bg-default-50 transition">
          <CardBody className="p-4 gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Chip size="sm" variant="flat" color="primary">{d.title}</Chip>
              <span className="text-tiny text-default-500">{d.tone}</span>
            </div>
            <Divider />
            <Pair label="構圖">{d.composition}</Pair>
            <Pair label="色彩">{d.palette}</Pair>
            <Pair label="情緒">{d.mood}</Pair>
            <Pair label="風格參考">{d.styleRef}</Pair>
            {kind === "video" && d.shotList && <Pair label="分鏡">{d.shotList}</Pair>}
            <Pair label="為什麼這方向適合">{d.rationale}</Pair>
            <Button size="sm" color="primary" radius="md" className="self-end mt-2"
              endContent={<FontAwesomeIcon icon={faArrowRight} className="text-tiny" />}
              onPress={() => onPick(d)}>
              選這個
            </Button>
          </CardBody>
        </Card>
      ))}
    </>
  );
}

function PromptPhase({
  promptEn, setPromptEn, summaryZh, direction, onProceed, onBackToDirections,
}: {
  promptEn: string; setPromptEn: (s: string) => void;
  summaryZh: string;
  direction: Direction | null;
  onProceed: () => void;
  onBackToDirections: () => void;
}) {
  return (
    <>
      {direction && (
        <Card shadow="none" className="border border-divider bg-default-50">
          <CardBody className="px-4 py-3">
            <p className="text-tiny text-default-500 uppercase tracking-wider">已選方向</p>
            <p className="text-small font-medium">{direction.title}</p>
            <p className="text-tiny text-default-500">{direction.tone}</p>
          </CardBody>
        </Card>
      )}
      <Textarea
        size="sm" radius="md" variant="bordered"
        label="AI Prompt（英文）" labelPlacement="outside"
        placeholder="Auto-crafted from your direction — edit if needed."
        minRows={6}
        value={promptEn}
        onValueChange={setPromptEn}
      />
      {summaryZh && (
        <p className="text-tiny text-default-500 leading-relaxed">
          中文摘要：{summaryZh}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="light" startContent={<FontAwesomeIcon icon={faPenNib} />} onPress={onBackToDirections}>
          ← 上一步
        </Button>
        <Button color="primary" endContent={<FontAwesomeIcon icon={faArrowRight} />}
          isDisabled={!promptEn.trim()} onPress={onProceed}>
          挑選 AI 模型
        </Button>
      </div>
    </>
  );
}

function ModelPhase({
  models, promptEn, pickedModel, onPick, genResult, busy,
}: {
  models: Array<MediaModel & { _recommended?: boolean }>;
  promptEn: string;
  pickedModel: MediaModel | null;
  onPick: (m: MediaModel) => void;
  genResult: { ok: boolean; message?: string; url?: string } | null;
  busy: boolean;
}) {
  return (
    <>
      <p className="text-small text-default-500">
        每個模型擅長的不同。挑一個最符合你方向的：
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {models.map((m) => {
          const disabled = m.status === "soon" || busy;
          const isPicked = pickedModel?.id === m.id;
          return (
            <Card
              key={m.id} shadow="none"
              isPressable={!disabled}
              isDisabled={disabled}
              onPress={() => onPick(m)}
              className={`border transition ${isPicked ? "border-primary bg-primary-50" : "border-divider hover:bg-default-50"}`}
            >
              <CardBody className="p-3 gap-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-small font-medium">{m.name}</p>
                    {m._recommended && (
                      <Chip size="sm" variant="flat" color="primary" className="h-5 text-tiny">
                        ⭐ 推薦
                      </Chip>
                    )}
                  </div>
                  {m.status === "ready" && <Chip size="sm" variant="flat" color="success">可用</Chip>}
                  {m.status === "manual" && <Chip size="sm" variant="flat" color="warning">手動複製</Chip>}
                  {m.status === "soon" && <Chip size="sm" variant="flat" color="default">尚未串接</Chip>}
                </div>
                <p className="text-tiny text-default-500">{m.vendor}</p>
                <p className="text-tiny text-default-600 leading-relaxed">{m.strengths}</p>
                <div className="flex items-center gap-2 text-tiny text-default-400">
                  {m.costEstimateUsd != null && <span>~${m.costEstimateUsd}</span>}
                  {m.durationSecEstimate != null && <span>~{m.durationSecEstimate}s</span>}
                  {m.formats && <span>{m.formats.join(" / ")}</span>}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
      {genResult && (
        <Card shadow="none" className={`border ${genResult.ok ? "border-success-200 bg-success-50" : "border-warning-200 bg-warning-50"}`}>
          <CardBody className="p-3">
            <p className="text-small font-medium">
              {genResult.ok ? <FontAwesomeIcon icon={faCheck} className="text-success mr-2" /> : null}
              {genResult.message}
            </p>
            {genResult.url && (
              <a href={genResult.url} target="_blank" rel="noopener noreferrer" className="text-tiny text-primary truncate">
                {genResult.url}
              </a>
            )}
          </CardBody>
        </Card>
      )}
      <div className="flex items-center justify-end">
        <Tooltip content="複製 prompt">
          <Button size="sm" variant="bordered" startContent={<FontAwesomeIcon icon={faCopy} className="text-tiny" />}
            onPress={async () => {
              try { await navigator.clipboard.writeText(promptEn); } catch { /* */ }
            }}>
            複製 Prompt
          </Button>
        </Tooltip>
      </div>
    </>
  );
}

function Pair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-tiny text-default-500 uppercase tracking-wider">{label}</p>
      <p className="text-tiny text-default-700 leading-relaxed">{children}</p>
    </div>
  );
}
