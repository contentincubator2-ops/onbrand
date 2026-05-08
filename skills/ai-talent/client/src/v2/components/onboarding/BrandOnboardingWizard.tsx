/**
 * BrandOnboardingWizard — first-time user guide.
 *
 * CJ direction (2026-05-08):
 *   "對於新手，要做 onboarding 的流程指引，引導新增品牌"
 *
 * Flow (4 steps with progress bar):
 *   1. 歡迎 — explain Marketing OS in 3 dots, set expectation.
 *   2. 建品牌 — name + industry + website + FB URL all in one form.
 *      The website + FB URL feed brandRealContent so AI 自動填寫
 *      and 試寫 work on the first try (no more 五感十築 → 美妝 hallucination).
 *   3. 自動定位中 — show 14-step pipeline progress, live agent rotate.
 *      User watches; on done auto-advances.
 *   4. 完成 — CTA: "看試寫" (jumps to test panel) or "去 /30s 開始".
 *
 * Auto-shown when user has 0 brands (replaces the simple empty state).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { Modal, ModalContent, ModalBody, Button, Input, Select, SelectItem } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrademark, faGlobe, faArrowRight, faCheck, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { faFacebook } from "@fortawesome/free-brands-svg-icons";
import RunningAgentCarousel from "../quickTask/RunningAgentCarousel";

const INDUSTRIES = [
  "AI / 科技軟體",
  "電商 / 零售",
  "美妝 / 保養",
  "餐飲 / 食品",
  "教育 / 培訓",
  "金融 / 保險",
  "醫療 / 健康",
  "媒體 / 娛樂",
  "製造 / 工業",
  "房地產 / 建設",
  "旅遊 / 飯店",
  "遊戲 / 娛樂社群",
  "非營利組織",
  "其他",
];

interface Props {
  isOpen: boolean;
  onClose?: () => void;
  /** Called once a brand is created + onboarding finishes. */
  onComplete: (brandId: number) => void;
}

type Step = 1 | 2 | 3 | 4;

const STEPS: Array<{ n: Step; label: string }> = [
  { n: 1, label: "歡迎" },
  { n: 2, label: "建立品牌" },
  { n: 3, label: "自動定位" },
  { n: 4, label: "完成" },
];

export default function BrandOnboardingWizard({ isOpen, onClose, onComplete }: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [createdBrandId, setCreatedBrandId] = useState<number | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState<string>("");
  const [website, setWebsite] = useState("");
  const [fbUrl, setFbUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setCreatedBrandId(null);
      setName(""); setIndustry(""); setWebsite(""); setFbUrl(""); setErr(null);
    }
  }, [isOpen]);

  const createBrandMut = (trpc as any).brand?.create?.useMutation?.();
  const updateConnMut = (trpc as any).brand?.updateConnections?.useMutation?.();
  const startPositioningMut = (trpc as any).positioningJobs?.start?.useMutation?.();
  const runInterimMut = (trpc as any).positioningJobs?.runInterim?.useMutation?.();

  const handleCreateAndAdvance = async () => {
    if (!name.trim()) { setErr("請輸入品牌名稱"); return; }
    setErr(null);
    try {
      const r = await createBrandMut.mutateAsync({ name: name.trim() });
      const newId = Number(r?.id ?? r?.brandId ?? 0);
      if (!newId) { setErr("建立失敗，請稍後再試"); return; }
      setCreatedBrandId(newId);

      // Save connector data (website + FB)
      const socialLinks: Record<string, string> = {};
      if (fbUrl.trim()) socialLinks.facebook = fbUrl.trim();
      if (website.trim() || Object.keys(socialLinks).length > 0) {
        try {
          await updateConnMut?.mutateAsync?.({
            brandId: newId,
            website: website.trim() || null,
            socialLinks,
          });
        } catch {/* non-fatal */}
      }

      // Fire interim quick-pulse + full pipeline (background)
      runInterimMut?.mutate?.({ entityKind: "brand", entityId: newId });
      startPositioningMut?.mutate?.({ entityKind: "brand", entityId: newId, lang: "zh-TW" });

      setStep(3);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  // Poll job status while in step 3; auto-advance when done
  const job = (trpc as any).positioningJobs?.getStatus?.useQuery?.(
    { entityKind: "brand", entityId: createdBrandId ?? 0 },
    { enabled: !!createdBrandId && step === 3, refetchInterval: 4_000 },
  );
  const jobData = job?.data as any;
  useEffect(() => {
    if (step !== 3 || !jobData) return;
    if (jobData.status === "done" || jobData.status === "failed") {
      setStep(4);
    }
  }, [step, jobData?.status]);

  const handleFinish = () => {
    if (createdBrandId) onComplete(createdBrandId);
  };

  const handleSkipToFinish = () => setStep(4);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      hideCloseButton={step !== 1 && step !== 4}
      isDismissable={false}
      backdrop="blur"
      classNames={{ base: "max-h-[90vh]" }}
    >
      <ModalContent>
        <ModalBody className="p-0">
          {/* Progress bar */}
          <div className="px-6 pt-5 pb-3 border-b border-default-100">
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => {
                const isActive = s.n === step;
                const isDone = s.n < step;
                return (
                  <div key={s.n} className="flex items-center gap-2 flex-1">
                    <div
                      className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition ${
                        isDone ? "bg-emerald-500 text-white"
                          : isActive ? "bg-violet-600 text-white"
                          : "bg-default-100 text-default-400"
                      }`}
                    >
                      {isDone ? <FontAwesomeIcon icon={faCheck} className="text-[9px]" /> : s.n}
                    </div>
                    <span className={`text-xs ${isActive ? "font-semibold text-default-900" : "text-default-500"}`}>
                      {s.label}
                    </span>
                    {i < STEPS.length - 1 && (
                      <div className="flex-1 h-px bg-default-200 mx-1" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="px-6 py-6 min-h-[420px]">
            {/* STEP 1 — 歡迎 */}
            {step === 1 && (
              <div className="text-center py-4">
                <div
                  className="mx-auto mb-5 flex items-center justify-center"
                  style={{
                    width: 84, height: 84, borderRadius: 22,
                    background: "linear-gradient(135deg, #00b4bc 0%, #7c3aed 100%)",
                    boxShadow: "0 14px 36px rgba(124,58,237,0.32)",
                  }}
                >
                  <FontAwesomeIcon icon={faWandMagicSparkles} style={{ color: "white", fontSize: 32 }} />
                </div>
                <h1 className="text-2xl font-semibold mb-2">歡迎使用 Marketing OS</h1>
                <p className="text-sm text-default-600 leading-relaxed mb-6 max-w-md mx-auto">
                  我們先花 2 分鐘設定你的第一個品牌 — 系統會自動分析定位、建議文字 / 視覺 / AI 指令，
                  讓你直接開始產內容。
                </p>
                <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto mb-6">
                  {[
                    { num: "1", label: "建立品牌", desc: "填名稱、官網、FB" },
                    { num: "2", label: "自動定位", desc: "14 步深度分析" },
                    { num: "3", label: "開始產內容", desc: "30s/60s/100s 任務" },
                  ].map((s) => (
                    <div key={s.num} className="bg-default-50 rounded-xl p-3 text-center">
                      <div className="text-[10px] text-default-400 mb-0.5 font-semibold">STEP {s.num}</div>
                      <div className="text-sm font-semibold text-default-900">{s.label}</div>
                      <div className="text-[10px] text-default-500 mt-0.5 leading-tight">{s.desc}</div>
                    </div>
                  ))}
                </div>
                <Button
                  color="primary"
                  size="lg"
                  onPress={() => setStep(2)}
                  endContent={<FontAwesomeIcon icon={faArrowRight} className="text-tiny" />}
                  className="font-semibold"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #6366F1)" }}
                >
                  開始
                </Button>
              </div>
            )}

            {/* STEP 2 — 建品牌 */}
            {step === 2 && (
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #00b4bc, #7c3aed)" }}
                  >
                    <FontAwesomeIcon icon={faTrademark} style={{ color: "white", fontSize: 16 }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">建立第一個品牌</h2>
                    <p className="text-xs text-default-500">官網 + FB 連結很重要 — AI 會抓真實內容做 ground</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Input
                    label="品牌名稱"
                    placeholder="例：五感十築 / Pokemon GO 台灣社群 / adidas Taiwan"
                    value={name}
                    onValueChange={setName}
                    isRequired
                    autoFocus
                    description="系統依此名稱搜尋品牌資料"
                  />
                  <Select
                    label="產業（可選）"
                    placeholder="選一個最接近的"
                    selectedKeys={industry ? [industry] : []}
                    onSelectionChange={(keys) => setIndustry(Array.from(keys)[0] as string ?? "")}
                  >
                    {INDUSTRIES.map((i) => <SelectItem key={i}>{i}</SelectItem>)}
                  </Select>
                  <Input
                    label="官網（可選）"
                    placeholder="https://example.com"
                    value={website}
                    onValueChange={setWebsite}
                    startContent={<FontAwesomeIcon icon={faGlobe} className="text-default-400 text-tiny" />}
                  />
                  <Input
                    label="Facebook 粉專（可選）"
                    placeholder="https://www.facebook.com/yourpage"
                    value={fbUrl}
                    onValueChange={setFbUrl}
                    startContent={<FontAwesomeIcon icon={faFacebook} style={{ color: "#1877F2" }} className="text-tiny" />}
                  />
                </div>

                {err && <div className="mt-3 text-sm text-danger">⚠ {err}</div>}

                <div className="mt-5 flex items-center justify-between gap-2">
                  <Button variant="light" onPress={() => setStep(1)}>← 上一步</Button>
                  <Button
                    color="primary"
                    onPress={handleCreateAndAdvance}
                    isLoading={createBrandMut?.isPending}
                    endContent={!createBrandMut?.isPending && <FontAwesomeIcon icon={faArrowRight} className="text-tiny" />}
                    className="font-semibold"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #6366F1)" }}
                  >
                    建立並開始定位
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3 — 自動定位中 */}
            {step === 3 && (
              <div>
                <div className="text-center mb-2">
                  <h2 className="text-lg font-semibold mb-1">系統正在分析你的品牌定位</h2>
                  <p className="text-xs text-default-500">
                    14 步驟 pipeline — 包含市場洞察、目標客群、競爭格局、價值主張、訊息策略…
                    背景執行，可以略過繼續設定其他內容。
                  </p>
                </div>

                <RunningAgentCarousel
                  agents={[
                    { name: "Aiden Hsu", title: "Caption Writer", role: "撰寫定位草稿" },
                    { name: "Mandy Cheng", title: "Brand Strategist", role: "差異化分析" },
                    { name: "Jordan Hayes", title: "QA Reviewer", role: "整合審稿" },
                  ]}
                  stages={
                    jobData
                      ? [{ key: "running", label: `Step ${jobData.currentStep ?? 0} / ${jobData.totalSteps ?? 14}`, status: "running" }]
                      : null
                  }
                  accentColor="#7C3AED"
                  progressPct={jobData ? Math.round(((jobData.currentStep ?? 0) / Math.max(1, jobData.totalSteps ?? 14)) * 100) : 5}
                  elapsedText={jobData ? `${jobData.status === "running" ? "進行中" : jobData.status} · ${jobData.currentStep ?? 0}/${jobData.totalSteps ?? 14}` : "啟動中…"}
                />

                <div className="mt-2 flex items-center justify-end gap-2">
                  <Button variant="light" size="sm" onPress={handleSkipToFinish}>
                    略過，先到工作區 →
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 4 — 完成 */}
            {step === 4 && (
              <div className="text-center py-6">
                <div
                  className="mx-auto mb-4 flex items-center justify-center bg-emerald-500"
                  style={{
                    width: 72, height: 72, borderRadius: 18,
                    boxShadow: "0 10px 28px rgba(16,185,129,0.32)",
                  }}
                >
                  <FontAwesomeIcon icon={faCheck} style={{ color: "white", fontSize: 28 }} />
                </div>
                <h1 className="text-2xl font-semibold mb-2">完成了 🎉</h1>
                <p className="text-sm text-default-600 leading-relaxed mb-6 max-w-md mx-auto">
                  品牌已建立。{jobData?.status === "done"
                    ? "完整定位已產生，14 個段落都填好了。"
                    : "完整定位仍在背景產生中（左下會通知）— 你現在可以開始試寫，系統會用臨時定位ground。"}
                </p>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <Button
                    variant="bordered"
                    onPress={() => {
                      if (createdBrandId) navigate(`/brands?b=${createdBrandId}`);
                      handleFinish();
                    }}
                  >
                    進品牌工作區
                  </Button>
                  <Button
                    color="primary"
                    onPress={() => {
                      if (createdBrandId) navigate(`/30s?b=${createdBrandId}`);
                      handleFinish();
                    }}
                    endContent={<FontAwesomeIcon icon={faArrowRight} className="text-tiny" />}
                    className="font-semibold"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #6366F1)" }}
                  >
                    開始產 30s 內容
                  </Button>
                </div>
              </div>
            )}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
