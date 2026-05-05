/**
 * QuickTaskFBHome — beta home for the 快派 pivot (2026-05-05).
 *
 * Layout:
 *   [Tier tabs: 30s / 60s / 90s / 成功案例]
 *   [Brand chip — uses scope from ShellLayout outlet context]
 *   [Task chip grid — driven by trpc.quickTask.listFB]
 *
 *   click chip → input form (large textarea + chip-specific fields)
 *   click 生成 → trpc.quickTask.runQuick (30s/60s) or squad.stepExecute (90s)
 *   output → PlatformMockup variant matching post_type
 *   click image placeholder → opens MediaGenFlow (existing flow, prefills
 *     image_style_direction from the runQuick output)
 *
 * Routed at /fb for beta testing. Once validated, promote to /.
 */
import React, { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import {
  Button, Card, CardBody, Chip, Input, Skeleton, Spinner, Tabs, Tab, Textarea, User,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faWandMagicSparkles, faClock, faPaperPlane, faRotateRight,
  faClipboard, faClipboardCheck, faBolt, faLayerGroup, faStar,
} from "@fortawesome/free-solid-svg-icons";
import { PlatformMockup } from "../components/PlatformMockup";
import type { MockupVariant } from "../lib/inferMockup";

type TierKey = "30s" | "60s" | "90s" | "case";

const TIER_META: Record<TierKey, { label: string; sub: string; icon: any; color: any }> = {
  "30s":  { label: "30 秒",  sub: "單次 LLM · 文字 + 風格", icon: faBolt,         color: "primary"   },
  "60s":  { label: "60 秒",  sub: "完整貼文 · 含視覺 brief", icon: faWandMagicSparkles, color: "secondary" },
  "90s":  { label: "90 秒",  sub: "策略級 · 接既有 squad",  icon: faLayerGroup,   color: "warning"   },
  "case": { label: "成功案例", sub: "預錄 case study",         icon: faStar,         color: "success"   },
};

interface FBTaskRow {
  id: string;
  tier: "30s" | "60s" | "90s";
  postType: string;
  label: string;
  description: string;
  kind: "fast" | "mid" | "squad";
  inputs?: Array<{ key: string; label: string; type: string; required: boolean; placeholder?: string }>;
  squad_slug?: string;
}

export default function QuickTaskFBHome() {
  const ctx = useOutletContext<ShellOutletCtx>();
  const brandId = (ctx?.brandId as number | null) ?? null;
  const brandName = useMemo(() => {
    const list = (ctx?.brands as any[]) ?? [];
    const b = list.find((x) => x?.id === brandId);
    return (b?.name as string | undefined) ?? null;
  }, [ctx, brandId]);

  const [tier, setTier] = useState<TierKey>("30s");
  const [selectedTask, setSelectedTask] = useState<FBTaskRow | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [output, setOutput] = useState<any | null>(null);
  const [running, setRunning] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // tRPC: catalog
  const listQuery = (trpc as any).quickTask?.listFB?.useQuery
    ? (trpc as any).quickTask.listFB.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: [] };
  const allTasks: FBTaskRow[] = (listQuery.data as FBTaskRow[]) ?? [];

  const tasksThisTier = useMemo(
    () => allTasks.filter((t) => (tier === "case" ? false : t.tier === tier)),
    [allTasks, tier],
  );

  // tRPC: run
  const runQuickMut = (trpc as any).quickTask?.runQuick?.useMutation();

  const handleSelect = (t: FBTaskRow) => {
    setSelectedTask(t);
    setInputs({});
    setOutput(null);
    setLatencyMs(null);
    setErrorMsg(null);
  };

  const handleRun = async () => {
    if (!selectedTask) return;
    setRunning(true);
    setErrorMsg(null);
    setOutput(null);
    try {
      if (selectedTask.kind === "squad") {
        // 90s tier — pivot to existing PickerWorkspace flow.
        // For now show a hint; deeper integration in Phase E.
        setErrorMsg("90 秒任務會接到既有 squad 流程（Phase E 串接中）。請先用 30s / 60s 試試。");
        return;
      }
      const r = await runQuickMut.mutateAsync({
        taskId: selectedTask.id,
        inputs,
        brandId: brandId ?? undefined,
      });
      setOutput(r.output);
      setLatencyMs(r.latencyMs);
      if (!r.ok) setErrorMsg(`部分欄位驗證未通過: ${(r.validationErrors ?? []).slice(0, 2).join("; ")}`);
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  };

  const handleCopy = () => {
    if (!output?.caption) return;
    navigator.clipboard.writeText(output.caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Map output → MockupVariant for PlatformMockup
  const mockupVariant: MockupVariant | null = useMemo(() => {
    if (!output) return null;
    const platform = output.platform ?? "facebook";
    const format = output.post_type ?? "feed";
    return { platform: platform as any, format: format as any, label: `${platform}/${format}` };
  }, [output]);

  return (
    <div className="max-w-[1200px] mx-auto p-6 space-y-6">
      {/* Hero */}
      <div className="text-center space-y-2 py-4">
        <h1 className="text-3xl font-bold tracking-tight">
          <FontAwesomeIcon icon={faWandMagicSparkles} className="text-primary mr-2" />
          快派 — Facebook
        </h1>
        <p className="text-default-500 text-small">
          選一個任務 → 30~90 秒內看到完整貼文 + 配圖風格方向。要實際生圖再開 MediaGenFlow。
        </p>
        <p className="text-tiny text-default-400">
          Brand: <span className="font-medium text-default-700">{brandName ?? "（未選）"}</span>
        </p>
      </div>

      {/* Tier tabs */}
      <Tabs
        selectedKey={tier}
        onSelectionChange={(k) => { setTier(k as TierKey); setSelectedTask(null); setOutput(null); }}
        size="lg"
        variant="solid"
        color="primary"
        classNames={{ tabList: "gap-3", tab: "h-12 px-5" }}
      >
        {(Object.keys(TIER_META) as TierKey[]).map((k) => {
          const m = TIER_META[k];
          return (
            <Tab key={k} title={
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={m.icon} />
                <div className="text-start">
                  <p className="font-semibold leading-none">{m.label}</p>
                  <p className="text-tiny opacity-80 leading-none mt-0.5">{m.sub}</p>
                </div>
              </div>
            } />
          );
        })}
      </Tabs>

      {/* Catalog or "case" stub */}
      {tier === "case" ? (
        <Card><CardBody className="text-center text-default-500 py-12">
          <FontAwesomeIcon icon={faStar} className="text-3xl mb-2" />
          <p>成功案例（預錄 case study gallery）：Phase F 規劃中。</p>
        </CardBody></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {tasksThisTier.map((t) => (
            <Card
              key={t.id}
              isPressable
              isHoverable
              onPress={() => handleSelect(t)}
              className={selectedTask?.id === t.id ? "ring-2 ring-primary" : ""}
            >
              <CardBody className="space-y-1">
                <div className="flex items-center gap-2">
                  <Chip size="sm" variant="flat" color={TIER_META[t.tier].color}>{TIER_META[t.tier].label}</Chip>
                  <Chip size="sm" variant="flat" color="default">{t.postType}</Chip>
                </div>
                <p className="font-semibold text-small">{t.label}</p>
                <p className="text-tiny text-default-500 line-clamp-2">{t.description}</p>
              </CardBody>
            </Card>
          ))}
          {tasksThisTier.length === 0 && (
            <div className="col-span-full">
              <Skeleton className="h-32 rounded-medium" />
            </div>
          )}
        </div>
      )}

      {/* Selected task — input form */}
      {selectedTask && (
        <Card className="border-2 border-primary/30">
          <CardBody className="space-y-4">
            <div className="flex items-center gap-2">
              <Chip color="primary" variant="flat">{TIER_META[selectedTask.tier].label}</Chip>
              <p className="font-semibold">{selectedTask.label}</p>
              {latencyMs != null && (
                <Chip size="sm" variant="flat" color="success" className="ml-auto">
                  <FontAwesomeIcon icon={faClock} className="mr-1" />
                  {(latencyMs / 1000).toFixed(1)}s
                </Chip>
              )}
            </div>
            <p className="text-tiny text-default-500">{selectedTask.description}</p>

            <div className="space-y-3">
              {(selectedTask.inputs ?? []).map((f) => (
                f.type === "textarea" ? (
                  <Textarea
                    key={f.key}
                    label={f.label}
                    placeholder={f.placeholder ?? ""}
                    isRequired={f.required}
                    minRows={2}
                    value={inputs[f.key] ?? ""}
                    onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })}
                  />
                ) : (
                  <Input
                    key={f.key}
                    label={f.label}
                    placeholder={f.placeholder ?? ""}
                    isRequired={f.required}
                    value={inputs[f.key] ?? ""}
                    onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })}
                  />
                )
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                color="primary"
                size="lg"
                isLoading={running}
                startContent={!running && <FontAwesomeIcon icon={faPaperPlane} />}
                onPress={handleRun}
                isDisabled={running || (selectedTask.kind === "squad")}
              >
                {selectedTask.kind === "squad" ? "需用既有 squad 流程" : "生成"}
              </Button>
              {output && (
                <Button variant="flat" startContent={<FontAwesomeIcon icon={faRotateRight} />} onPress={handleRun}>
                  重生
                </Button>
              )}
              {output?.caption && (
                <Button
                  variant="flat"
                  color={copied ? "success" : "default"}
                  startContent={<FontAwesomeIcon icon={copied ? faClipboardCheck : faClipboard} />}
                  onPress={handleCopy}
                >
                  {copied ? "已複製" : "複製全文"}
                </Button>
              )}
            </div>

            {errorMsg && (
              <Card className="bg-warning-50 border border-warning-200">
                <CardBody className="text-warning-800 text-small">{errorMsg}</CardBody>
              </Card>
            )}
          </CardBody>
        </Card>
      )}

      {/* Output — render in matching mockup */}
      {output && mockupVariant && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 pt-2">
          <div>
            <p className="text-tiny text-default-500 mb-2 uppercase tracking-wider">Mockup 預覽</p>
            <PlatformMockup
              variant={mockupVariant}
              title={output.title ?? selectedTask?.label ?? ""}
              brief={output.description ?? ""}
              brandName={brandName}
              liveCaption={output.caption}
              liveTitle={output.title}
              liveDescription={output.description}
              liveCta={output.cta}
              liveHashtags={output.hashtags}
              liveImageStyle={output.image_style_direction?.summary}
              liveVideoStyle={output.video_style_direction?.summary}
            />
          </div>
          <div className="space-y-3">
            <p className="text-tiny text-default-500 uppercase tracking-wider">資料</p>
            {output.image_style_direction && (
              <Card>
                <CardBody className="space-y-1.5">
                  <p className="text-tiny font-semibold text-default-600">配圖風格方向</p>
                  <p className="text-small">{output.image_style_direction.summary}</p>
                  {output.image_style_direction.aspect_ratio && (
                    <Chip size="sm" variant="flat">{output.image_style_direction.aspect_ratio}</Chip>
                  )}
                  <p className="text-tiny text-default-500 pt-2 border-t border-divider">
                    要實際生圖？點圖片區（接 MediaGenFlow，Phase E 串接中）
                  </p>
                </CardBody>
              </Card>
            )}
            {output.variants && output.variants.length > 0 && (
              <Card>
                <CardBody className="space-y-2">
                  <p className="text-tiny font-semibold text-default-600">替代版本（{output.variants.length}）</p>
                  {output.variants.map((v: any, i: number) => (
                    <div key={i} className="border-l-2 border-primary-200 pl-3">
                      <p className="text-tiny font-semibold text-primary-700">{v.label}</p>
                      <p className="text-small line-clamp-3">{v.caption}</p>
                    </div>
                  ))}
                </CardBody>
              </Card>
            )}
            {output.kpi_prediction && (
              <Card>
                <CardBody className="space-y-1">
                  <p className="text-tiny font-semibold text-default-600">KPI 預估</p>
                  <p className="text-small">觸及：{output.kpi_prediction.reach_estimate ?? "—"}</p>
                  <p className="text-small">互動率：{output.kpi_prediction.engagement_rate_estimate ?? "—"}</p>
                  <p className="text-small">最佳時段：{output.kpi_prediction.best_post_time ?? "—"}</p>
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
