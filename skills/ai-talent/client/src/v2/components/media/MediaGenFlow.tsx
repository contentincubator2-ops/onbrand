/**
 * MediaGenFlow — 3-step image / video generation flow.
 *
 * Per CJ direction 2026-04-29:
 *   Step 1  Design direction proposal (3-5 cards) → user picks / edits
 *   Step 2  AI prompt crafted from picked direction (English + 中文摘要)
 *   Step 3  Model picker (gpt-image / Imagen / Hailuo / Seedance / etc.)
 *
 * User can SKIP step 1 and/or 2 by using the "直接給指令" shortcut —
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
import { useLang } from "../../../lib/i18n";

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
  const { lang } = useLang();
  const [phase, setPhase] = React.useState<Phase>("input");
  const [brief, setBrief] = React.useState(initialBrief);
  const [busy, setBusy]   = React.useState(false);
  const [err, setErr]     = React.useState<string | null>(null);

  const [directions, setDirections] = React.useState<Direction[]>([]);
  const [pickedDir, setPickedDir]   = React.useState<Direction | null>(null);
  const [promptEn, setPromptEn]     = React.useState("");
  const [summaryZh, setSummaryZh]   = React.useState("");
  const [pickedModel, setPickedModel] = React.useState<MediaModel | null>(null);
  const [genResult, setGenResult]     = React.useState<{ ok: boolean; message?: string; url?: string; canSwitchTo?: "nano-banana" } | null>(null);

  // 2026-07-25 (CJ product-faithful gen「📦 使用真實產品圖」): brands with
  // real product photos (IRIS/Iris Girls seeded from 91APP) can composite
  // the ACTUAL product instead of an AI-imagined one. When enabled, the
  // generation runs on gpt-image-2 subject-reference (/images/edits) with the
  // fidelity guard — see project_product_faithful_imagegen quality bar.
  const productImagesQ = (trpc as any).media?.listProductImages?.useQuery?.(
    { brandId: brandId ?? 0 },
    { enabled: !!brandId && kind === "image", refetchOnWindowFocus: false, staleTime: 60_000 },
  ) ?? { data: null };
  const productImages: Array<{ productId: number; name: string; imageUrl: string }> =
    (productImagesQ.data as any)?.products ?? [];
  const [useProduct, setUseProduct] = React.useState(false);
  const [pickedProduct, setPickedProduct] = React.useState<{ productId: number; name: string; imageUrl: string } | null>(null);
  const productMode = useProduct && kind === "image" && !!pickedProduct;

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
    if (!brief.trim()) { setErr(lang === "en" ? "Enter a brief first" : "請先輸入需求說明"); return; }
    if (!proposeMutation) { setErr(lang === "en" ? "media.proposeDirection not deployed yet" : "media.proposeDirection 尚未部署"); return; }
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
        // 2026-05-05: fal removed; default video → piapi/kling-v2-master
        modelId: modelHint ?? (kind === "video" ? "piapi/kling-v2-master" : "openai/gpt-image-2"),
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
      setGenResult({ ok: true, message: lang === "en" ? `Prompt copied. Paste it into ${m.name} (no API).` : `指令已複製。請手動貼到 ${m.name}（無 API）。` });
      setPhase("model");
      return;
    }
    if (!generateMutation) {
      setGenResult({ ok: false, message: lang === "en" ? "media.generate not deployed yet" : "media.generate 尚未部署" });
      setPhase("model");
      return;
    }
    setBusy(true); setErr(null);
    try {
      // Keep the chosen model even with a product reference. No silent fallback.
      const effectiveModelId = m.id;
      const res: any = await generateMutation.mutateAsync({
        kind, modelId: effectiveModelId, promptEn, brandId,
        ...(productMode ? { imageUrl: pickedProduct!.imageUrl, subjectMode: "product" as const } : {}),
      });
      setGenResult({
        ok: !!res?.ok,
        message: res?.message ?? (res?.ok ? (lang === "en" ? "Generated" : "生成完成") : (lang === "en" ? "Phase 2 will wire this provider" : "Phase 2 將接入此 provider")),
        url: res?.url,
        canSwitchTo: res?.canSwitchTo,
      });
      // Notify the squad-runner so it can attach the URL to the active step.
      if (res?.ok && res?.url && onComplete) {
        onComplete({ url: String(res.url), modelId: effectiveModelId, promptEn });
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
      {/* 2026-07-25 (CJ product-faithful gen): real-product subject picker —
          shown when the brand has products with photos. When on, generation
          routes to gpt-image-2 /images/edits with the real photo + fidelity guard. */}
      {kind === "image" && (phase === "prompt" || phase === "model") && productImages.length > 0 && (
        <div className="rounded-lg border border-default-200 bg-default-50 px-3 py-2.5">
          <label className="flex items-center gap-2 cursor-pointer flex-wrap">
            <input
              type="checkbox"
              checked={useProduct}
              onChange={(e) => {
                setUseProduct(e.target.checked);
                if (e.target.checked && !pickedProduct) setPickedProduct(productImages[0] ?? null);
              }}
            />
            <span className="text-small font-medium">📦 {lang === "en" ? "Use real product photo" : "使用真實產品圖"}</span>
            <span className="text-tiny text-default-500">
              {lang === "en"
                ? "Composite the actual product into the scene (GPT Image 2 reference mode)"
                : "把真實產品原貌合成進場景 — 自動改用 GPT Image 2 產品保真模式"}
            </span>
          </label>
          {useProduct && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {productImages.slice(0, 12).map((p) => (
                <button
                  key={p.productId}
                  onClick={() => setPickedProduct(p)}
                  title={p.name}
                  className={`w-14 h-14 rounded-md overflow-hidden border-2 transition ${
                    pickedProduct?.productId === p.productId ? "border-primary" : "border-transparent hover:border-default-300"
                  }`}
                >
                  <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                </button>
              ))}
              {pickedProduct && (
                <span className="text-tiny text-default-600 self-center ml-1 truncate max-w-[200px]">{pickedProduct.name}</span>
              )}
            </div>
          )}
        </div>
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
      {busy && <div className="flex items-center gap-2 text-tiny text-default-500"><Spinner size="sm" /> {lang === "en" ? "Working…" : "處理中…"}</div>}
      {err && <p className="text-tiny text-danger">{err}</p>}
    </>
  );

  const header = (
    <>
      <Chip size="sm" variant="flat" color="default" className="uppercase tracking-wider self-start"
        startContent={<FontAwesomeIcon icon={kind === "video" ? faVideo : faImage} className="text-tiny ml-1" />}>
        {kind === "video" ? (lang === "en" ? "Video gen" : "影片生成") : (lang === "en" ? "Image gen" : "圖像生成")}
      </Chip>
      <h2 className="text-medium font-semibold">{lang === "en" ? "3-step visual gen flow" : "三步視覺產出流程"}</h2>
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
          <Button variant="light" onPress={onClose}>{lang === "en" ? "Close" : "關閉"}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function PhaseStepper({ phase }: { phase: Phase }) {
  const { lang } = useLang();
  const steps: Array<{ id: Phase; label: string }> = [
    { id: "input",      label: lang === "en" ? "Brief" : "視覺指引" },
    { id: "directions", label: lang === "en" ? "Direction" : "設計方向" },
    { id: "prompt",     label: "AI Prompt" },
    { id: "model",      label: lang === "en" ? "Pick model" : "選擇模型" },
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
  const { lang } = useLang();
  return (
    <>
      <Textarea
        size="sm" radius="md" variant="bordered"
        label={lang === "en" ? "Brief (what visual do you want?)" : "視覺簡報（你想要什麼樣的視覺？）"}
        labelPlacement="outside"
        placeholder={lang === "en"
          ? "e.g. Hero visual for SoWork's launch — pioneers finding their way in a data universe; techy but warm."
          : "例：為 SoWork 摘星活動主視覺，呈現拓荒者在資料宇宙中尋找方向的感覺，要有科技感但保留情感溫度。"}
        minRows={4}
        value={brief}
        onValueChange={setBrief}
        autoFocus
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Button color="primary" startContent={<FontAwesomeIcon icon={faPalette} />} onPress={onPropose}
          isDisabled={!brief.trim()}>
          {lang === "en" ? "Ask AI for directions (recommended)" : "請 AI 提設計方向（推薦）"}
        </Button>
        <Tooltip content={lang === "en" ? "Skip directions — go straight to prompt" : "跳過設計方向，直接寫指令"}>
          <Button variant="light" startContent={<FontAwesomeIcon icon={faForward} />} onPress={onSkip}>
            {lang === "en" ? "I have ideas — write prompt" : "我已有想法，直接給指令"}
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
  const { lang } = useLang();
  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-small text-default-500">
          {lang === "en"
            ? `AI proposed ${directions.length} wide-spread directions. Pick the one that fits, or refresh.`
            : `AI 提了 ${directions.length} 個跨度大的方向。挑一個最對的（每個都不一樣），或要 AI 重提一輪。`}
        </p>
        <div className="flex items-center gap-1">
          <Tooltip content={lang === "en" ? "Refresh" : "重新提案"}>
            <Button isIconOnly size="sm" variant="light" onPress={onRefresh} isDisabled={busy} aria-label={lang === "en" ? "refresh" : "重新提案"}>
              <FontAwesomeIcon icon={faRotate} className="text-tiny" />
            </Button>
          </Tooltip>
          <Button size="sm" variant="light" startContent={<FontAwesomeIcon icon={faForward} />} onPress={onSkip}>
            {lang === "en" ? "Skip — write prompt" : "跳過，直接給指令"}
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
            <Pair label={lang === "en" ? "Composition" : "構圖"}>{d.composition}</Pair>
            <Pair label={lang === "en" ? "Palette" : "色彩"}>{d.palette}</Pair>
            <Pair label={lang === "en" ? "Mood" : "情緒"}>{d.mood}</Pair>
            <Pair label={lang === "en" ? "Style ref" : "風格參考"}>{d.styleRef}</Pair>
            {kind === "video" && d.shotList && <Pair label={lang === "en" ? "Shots" : "分鏡"}>{d.shotList}</Pair>}
            <Pair label={lang === "en" ? "Why this fits" : "為什麼這方向適合"}>{d.rationale}</Pair>
            <Button size="sm" color="primary" radius="md" className="self-end mt-2"
              endContent={<FontAwesomeIcon icon={faArrowRight} className="text-tiny" />}
              onPress={() => onPick(d)}>
              {lang === "en" ? "Pick this" : "選這個"}
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
  const { lang } = useLang();
  return (
    <>
      {direction && (
        <Card shadow="none" className="border border-divider bg-default-50">
          <CardBody className="px-4 py-3">
            <p className="text-tiny text-default-500 uppercase tracking-wider">{lang === "en" ? "Selected direction" : "已選方向"}</p>
            <p className="text-small font-medium">{direction.title}</p>
            <p className="text-tiny text-default-500">{direction.tone}</p>
          </CardBody>
        </Card>
      )}
      <Textarea
        size="sm" radius="md" variant="bordered"
        label={lang === "en" ? "AI Prompt (English)" : "AI 指令（英文）"} labelPlacement="outside"
        placeholder="Auto-crafted from your direction — edit if needed."
        minRows={6}
        value={promptEn}
        onValueChange={setPromptEn}
      />
      {summaryZh && (
        <p className="text-tiny text-default-500 leading-relaxed">
          {lang === "en" ? `Summary: ${summaryZh}` : `中文摘要：${summaryZh}`}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="light" startContent={<FontAwesomeIcon icon={faPenNib} />} onPress={onBackToDirections}>
          {lang === "en" ? "← Back" : "← 上一步"}
        </Button>
        <Button color="primary" endContent={<FontAwesomeIcon icon={faArrowRight} />}
          isDisabled={!promptEn.trim()} onPress={onProceed}>
          {lang === "en" ? "Pick AI model" : "挑選 AI 模型"}
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
  genResult: { ok: boolean; message?: string; url?: string; canSwitchTo?: "nano-banana" } | null;
  busy: boolean;
}) {
  const { lang } = useLang();
  return (
    <>
      <p className="text-small text-default-500">
        {lang === "en" ? "Each model has different strengths. Pick the one that fits your direction:" : "每個模型擅長的不同。挑一個最符合你方向的："}
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
                        {lang === "en" ? "⭐ Recommended" : "⭐ 推薦"}
                      </Chip>
                    )}
                  </div>
                  {m.status === "ready" && <Chip size="sm" variant="flat" color="success">{lang === "en" ? "Ready" : "可用"}</Chip>}
                  {m.status === "manual" && <Chip size="sm" variant="flat" color="warning">{lang === "en" ? "Manual copy" : "手動複製"}</Chip>}
                  {m.status === "soon" && <Chip size="sm" variant="flat" color="default">{lang === "en" ? "Coming soon" : "尚未串接"}</Chip>}
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
              {typeof genResult.message === "string" ? genResult.message : ""}
            </p>
            {!genResult.ok && genResult.canSwitchTo === "nano-banana" && (
              <Button isDisabled={busy} onPress={() => {
                const nano = models.find(m => m.id === "google/nano-banana");
                if (nano) onPick(nano);
              }}>{lang === "en" ? "Use Nano Banana" : "改用 Nano Banana"}</Button>
            )}
            {genResult.url && (
              <a href={genResult.url} target="_blank" rel="noopener noreferrer" className="text-tiny text-primary truncate">
                {genResult.url}
              </a>
            )}
          </CardBody>
        </Card>
      )}
      <div className="flex items-center justify-end">
        <Tooltip content={lang === "en" ? "Copy prompt" : "複製指令"}>
          <Button size="sm" variant="bordered" startContent={<FontAwesomeIcon icon={faCopy} className="text-tiny" />}
            onPress={async () => {
              try { await navigator.clipboard.writeText(promptEn); } catch { /* */ }
            }}>
            {lang === "en" ? "Copy prompt" : "複製指令"}
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
