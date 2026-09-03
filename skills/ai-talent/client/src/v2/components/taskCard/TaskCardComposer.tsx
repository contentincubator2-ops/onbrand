/**
 * TaskCardComposer — 用戶自己新增任務卡。
 *
 * 2026-09-04 (CJ「用戶自己命名任務卡，貼上自己理想中的內容(例如十篇促購文)、
 * 以及希望用戶輸入的資料(選填)，然後AI會總結成SKILL，形成任務卡，可以試寫後，
 * 確認沒問題，就新增完成」)。
 *
 * ── 三步，順序不能換 ─────────────────────────────────────────────────
 *   1. 命名 + 貼理想成品 + 指定每次要問什麼
 *   2. AI 從範例反推 SKILL（可編輯 —— 作者本人最清楚哪條規則抓錯了）
 *   3. 試寫一篇，對照量出來的字數區間，確認沒問題才上架
 *
 * ── 為什麼「貼成品」而不是「描述你想要的卡」 ─────────────────────────
 * 描述會得到抽象形容詞（溫暖、專業），成品會得到句長、節奏、開場方式、CTA 位置。
 * 所以這一頁的主角是那幾個貼範例的框，不是一堆設定選項 —— 設定能自動推導的一律
 * 不問（字數區間直接從範例量出來，就顯示在旁邊當回饋）。
 *
 * 進度條 / 背景生成 / 試寫的互動照人設 Agent（PersonaAgentPanel）的既有慣例，
 * 使用者在這個產品裡已經見過一次同樣的流程。
 */
import React from "react";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import {
  Button, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader,
  Progress, Textarea,
} from "@heroui/react";
import {
  Plus, Trash2, Wand2, FlaskConical, Check, AlertTriangle, ChevronLeft,
} from "lucide-react";

export type ComposerChannel =
  | "facebook" | "instagram" | "threads" | "linkedin" | "tiktok"
  | "youtube" | "email" | "pr" | "website";

interface AskField { label: string; type: "text" | "textarea"; required: boolean; placeholder: string }

interface CardRecord {
  id: string; name: string; channel: string;
  status: "drafting" | "ready" | "failed";
  currentStep: number; totalSteps: number; lastError: string | null;
  samples: string[]; primaryQuestion: string; primaryPlaceholder: string;
  askFields: { key: string; label: string; type: "text" | "textarea"; required: boolean; placeholder: string }[];
  skill: string;
  measured: { count: number; minChars: number; maxChars: number; medianChars: number };
  variants: number;
  lastDryRun: { at: string; caption: string } | null;
}

/** 前端也量一次字數，讓使用者邊貼邊看到區間 —— 這份只是回饋，權威在 server。 */
function measure(samples: string[]): { count: number; min: number; max: number } {
  const lens = samples.map((s) => s.trim().length).filter((n) => n > 0);
  if (lens.length === 0) return { count: 0, min: 0, max: 0 };
  return { count: lens.length, min: Math.min(...lens), max: Math.max(...lens) };
}

export default function TaskCardComposer({
  isOpen, onClose, brandId, channel, channelLabel, onPublished, initialCardId,
}: {
  isOpen: boolean;
  onClose: () => void;
  brandId: number | null;
  channel: ComposerChannel;
  channelLabel: string;
  onPublished?: () => void;
  /**
   * 接續一張已經建好但還沒上架的卡。沒有這條路，使用者中途關掉視窗後那張卡
   * 就無處可回 —— 它不在任務頁（只列 ready），也沒有別的入口。
   */
  initialCardId?: string | null;
}) {
  const { lang } = useLang();
  const en = lang === "en";

  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [name, setName] = React.useState("");
  const [samples, setSamples] = React.useState<string[]>([""]);
  const [primaryQuestion, setPrimaryQuestion] = React.useState("");
  const [primaryPlaceholder, setPrimaryPlaceholder] = React.useState("");
  const [askFields, setAskFields] = React.useState<AskField[]>([]);
  const [variants, setVariants] = React.useState(1);

  const [cardId, setCardId] = React.useState<string | null>(initialCardId ?? null);
  const [skillDraft, setSkillDraft] = React.useState("");
  const [dryInputs, setDryInputs] = React.useState<Record<string, string>>({});
  const [dryResult, setDryResult] = React.useState<{ caption: string; chars: number; inRange: boolean; expected: { minChars: number; maxChars: number } } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // 每次開窗同步一次起始狀態。帶 initialCardId 就直接跳到步驟 2 —— 那張卡的
  // 範例早就貼過了，再走一次步驟 1 等於要求使用者重貼。
  React.useEffect(() => {
    if (!isOpen) return;
    if (initialCardId) { setCardId(initialCardId); setStep(2); setSkillDraft(""); }
    else { setCardId(null); setStep(1); }
    setError(null); setDryResult(null); setBusy(null);
  }, [isOpen, initialCardId]);

  const utils = (trpc as any).useUtils?.() ?? null;

  // SKILL 在背景生成，所以要輪詢。跑完（或失敗）就停 —— 一直輪會白燒請求。
  const cardQuery = (trpc as any).brandTaskCard?.get?.useQuery?.(
    { brandId: brandId ?? 0, cardId: cardId ?? "" },
    {
      enabled: !!brandId && !!cardId,
      refetchInterval: (data: any) =>
        data && (data.skill || data.status === "failed") ? false : 2500,
    },
  ) ?? { data: null };
  const card: CardRecord | null = cardQuery.data ?? null;

  // SKILL 一生出來就灌進可編輯的草稿框（只灌一次，別蓋掉使用者的編輯）。
  React.useEffect(() => {
    if (card?.skill && !skillDraft) setSkillDraft(card.skill);
  }, [card?.skill]);

  const createMut = (trpc as any).brandTaskCard?.create?.useMutation?.({
    onSuccess: (r: any) => { setCardId(r.cardId); setStep(2); setBusy(null); },
    onError: (e: any) => { setError(e?.message ?? "建立失敗"); setBusy(null); },
  }) ?? null;
  const updateMut = (trpc as any).brandTaskCard?.update?.useMutation?.({
    onError: (e: any) => setError(e?.message ?? "儲存失敗"),
  }) ?? null;
  const distilMut = (trpc as any).brandTaskCard?.distil?.useMutation?.({
    onSuccess: () => { setSkillDraft(""); setBusy(null); cardQuery.refetch?.(); },
    onError: (e: any) => { setError(e?.message ?? "重新生成失敗"); setBusy(null); },
  }) ?? null;
  const dryRunMut = (trpc as any).brandTaskCard?.dryRun?.useMutation?.({
    onSuccess: (r: any) => { setDryResult(r); setBusy(null); },
    onError: (e: any) => { setError(e?.message ?? "試寫失敗"); setBusy(null); },
  }) ?? null;
  const publishMut = (trpc as any).brandTaskCard?.publish?.useMutation?.({
    onSuccess: () => {
      setBusy(null);
      utils?.quickTask?.listFB?.invalidate?.();
      onPublished?.();
      reset();
      onClose();
    },
    onError: (e: any) => { setError(e?.message ?? "上架失敗"); setBusy(null); },
  }) ?? null;

  function reset(): void {
    setStep(1); setName(""); setSamples([""]); setPrimaryQuestion("");
    setPrimaryPlaceholder(""); setAskFields([]); setVariants(1);
    setCardId(null); setSkillDraft(""); setDryInputs({}); setDryResult(null);
    setBusy(null); setError(null);
  }

  const m = measure(samples);
  const filledSamples = samples.map((s) => s.trim()).filter((s) => s.length >= 20);
  const step1Ready = name.trim().length > 0 && primaryQuestion.trim().length >= 2 && filledSamples.length >= 1;

  function submitStep1(): void {
    if (!brandId) return;
    setError(null); setBusy("create");
    createMut?.mutate({
      brandId, name: name.trim(), channel,
      samples: filledSamples,
      primaryQuestion: primaryQuestion.trim(),
      primaryPlaceholder: primaryPlaceholder.trim(),
      askFields: askFields
        .filter((f) => f.label.trim())
        .map((f) => ({ label: f.label.trim(), type: f.type, required: f.required, placeholder: f.placeholder.trim() })),
      variants,
    });
  }

  async function goToDryRun(): Promise<void> {
    if (!brandId || !cardId) return;
    setError(null);
    // 使用者改過 SKILL 就先存 —— 試寫必須用他眼前那一份，不是 AI 原本那份。
    if (skillDraft.trim() && skillDraft.trim() !== card?.skill) {
      setBusy("save");
      try { await updateMut?.mutateAsync({ brandId, cardId, skill: skillDraft.trim() }); }
      finally { setBusy(null); }
    }
    setStep(3);
  }

  // ── 畫面 ──────────────────────────────────────────────────────────
  const stepLabel = en
    ? ["Paste your examples", "Review the SKILL", "Test-write it"][step - 1]
    : ["貼上你的範例", "檢查 SKILL", "試寫看看"][step - 1];

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { onClose(); }}
      // 2026-09-04 (CJ「這個文字編輯的空間要放大，現在太小了，可以全版」):
      // 第 2 步是「讀一份一千多字的規則並逐條改」，那是文件編輯不是填表 ——
      // 在一個 3xl 的框裡開 14 行的窗看它，等於用吸管讀文件。這一步給全螢幕，
      // 其他兩步維持原尺寸（它們是短輸入，全螢幕只會讓內容飄在正中間很空）。
      size={step === 2 ? "full" : "3xl"}
      scrollBehavior="inside"
      classNames={{ base: step === 2 ? "" : "max-h-[92vh]" }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Wand2 size={16} className="text-primary-500" />
            <span className="text-medium font-semibold">
              {en ? `New ${channelLabel} task card` : `新增${channelLabel}任務卡`}
            </span>
            <Chip size="sm" variant="flat">{en ? `Step ${step} / 3` : `第 ${step} / 3 步`}</Chip>
          </div>
          <p className="text-tiny text-default-500 font-normal">{stepLabel}</p>
        </ModalHeader>

        <ModalBody className={`gap-4 ${step === 2 ? "flex flex-col" : ""}`}>
          {error && (
            <div className="rounded-medium border border-danger-200 bg-danger-50 px-3 py-2 text-tiny text-danger-700">
              {error}
            </div>
          )}

          {/* ── 步驟 1：命名 + 貼範例 + 要問什麼 ───────────────────────── */}
          {step === 1 && (
            <>
              <Input
                label={en ? "Card name" : "任務卡名稱"}
                placeholder={en ? "e.g. Promo post" : "例：促購文"}
                value={name}
                onValueChange={setName}
                isRequired
              />

              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-small font-medium">
                    {en ? "Paste your ideal output" : "貼上你理想中的成品"}
                    <span className="text-danger-500 ml-1">*</span>
                  </p>
                  {m.count > 0 && (
                    <Chip size="sm" variant="flat">
                      {en
                        ? `${m.count} samples · ${m.min}–${m.max} chars`
                        : `${m.count} 篇 · ${m.min}–${m.max} 字`}
                    </Chip>
                  )}
                </div>
                <p className="text-tiny text-default-500">
                  {en
                    ? "The more real posts you paste, the closer the card gets. Length limits are measured from them — you never type a number."
                    : "貼得越多篇、越接近你真的發過的文，這張卡就越準。字數上下限直接從這些範例量出來，你不用填任何數字。"}
                </p>
                {samples.map((s, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <Textarea
                        minRows={4}
                        placeholder={en ? `Sample ${i + 1}` : `範例 ${i + 1}`}
                        value={s}
                        onValueChange={(v) => setSamples((prev) => prev.map((x, j) => (j === i ? v : x)))}
                      />
                      {s.trim().length > 0 && s.trim().length < 20 && (
                        <p className="text-tiny text-warning-600 mt-1">
                          {en ? "Too short to learn from (needs 20+ chars)" : "太短了，學不到東西（至少 20 字）"}
                        </p>
                      )}
                    </div>
                    {samples.length > 1 && (
                      <Button
                        size="sm" variant="light" isIconOnly className="mt-1"
                        onPress={() => setSamples((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 size={14} className="text-danger-500" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  size="sm" variant="flat" startContent={<Plus size={14} />}
                  isDisabled={samples.length >= 20}
                  onPress={() => setSamples((prev) => [...prev, ""])}
                >
                  {en ? "Paste another" : "再貼一篇"}
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-small font-medium">
                  {en ? "What should we ask you each time?" : "每次跑這張卡要問你什麼？"}
                  <span className="text-danger-500 ml-1">*</span>
                </p>
                <Input
                  placeholder={en ? "e.g. Which product is this promo for?" : "例：這次要促銷哪個商品？"}
                  value={primaryQuestion}
                  onValueChange={setPrimaryQuestion}
                />
                <Input
                  size="sm"
                  placeholder={en ? "Optional: example answer shown in the box" : "選填：輸入框裡的範例提示"}
                  value={primaryPlaceholder}
                  onValueChange={setPrimaryPlaceholder}
                />
              </div>

              <div className="space-y-2">
                <p className="text-small font-medium">
                  {en ? "Extra fields (optional)" : "額外要問的欄位（選填）"}
                </p>
                <p className="text-tiny text-default-500">
                  {en
                    ? "Only add a field for a fact the model must not invent — a date, a price, a promo code."
                    : "只有「模型不能自己編」的事實才值得開一格 —— 日期、價格、優惠碼這種。其他的寫在上面那個主問題裡一次問完就好。"}
                </p>
                {askFields.map((f, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      size="sm" className="flex-1"
                      placeholder={en ? "Field label, e.g. Promo ends" : "欄位名稱，例：優惠截止日"}
                      value={f.label}
                      onValueChange={(v) => setAskFields((prev) => prev.map((x, j) => (j === i ? { ...x, label: v } : x)))}
                    />
                    <Chip
                      size="sm"
                      variant={f.required ? "solid" : "bordered"}
                      color={f.required ? "warning" : "default"}
                      className="cursor-pointer shrink-0"
                      onClick={() => setAskFields((prev) => prev.map((x, j) => (j === i ? { ...x, required: !x.required } : x)))}
                    >
                      {f.required ? (en ? "required" : "必填") : (en ? "optional" : "選填")}
                    </Chip>
                    <Button
                      size="sm" variant="light" isIconOnly
                      onPress={() => setAskFields((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 size={14} className="text-danger-500" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm" variant="flat" startContent={<Plus size={14} />}
                  isDisabled={askFields.length >= 8}
                  onPress={() => setAskFields((prev) => [...prev, { label: "", type: "text", required: false, placeholder: "" }])}
                >
                  {en ? "Add a field" : "加一格"}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <p className="text-small font-medium">{en ? "Versions per run" : "每次產幾個版本"}</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Chip
                      key={n} size="sm"
                      variant={variants === n ? "solid" : "bordered"}
                      color={variants === n ? "primary" : "default"}
                      className="cursor-pointer"
                      onClick={() => setVariants(n)}
                    >
                      {n}
                    </Chip>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── 步驟 2：SKILL ────────────────────────────────────────── */}
          {step === 2 && (
            <>
              {!card?.skill && card?.status !== "failed" && (
                <div className="space-y-2 py-4">
                  <p className="text-small font-medium">
                    {en ? "Reading your samples…" : "正在讀你的範例，反推寫作規則…"}
                  </p>
                  <Progress
                    size="sm" color="primary"
                    aria-label={en ? "Distilling" : "生成中"}
                    value={((card?.currentStep ?? 1) / (card?.totalSteps ?? 3)) * 100}
                  />
                  <p className="text-tiny text-default-500">
                    {en
                      ? "Usually 20–60 seconds. You can keep this open."
                      : "通常 20–60 秒。這個視窗可以開著等。"}
                  </p>
                </div>
              )}

              {card?.status === "failed" && (
                <div className="rounded-medium border border-danger-200 bg-danger-50 px-3 py-2 space-y-2">
                  <p className="text-small font-semibold text-danger-700">
                    {en ? "Distilling failed" : "SKILL 生成失敗"}
                  </p>
                  <p className="text-tiny text-danger-700">{card.lastError}</p>
                  <Button
                    size="sm" color="danger" variant="flat"
                    isLoading={busy === "distil"}
                    onPress={() => { setBusy("distil"); setError(null); distilMut?.mutate({ brandId: brandId!, cardId: cardId! }); }}
                  >
                    {en ? "Retry" : "重試"}
                  </Button>
                </div>
              )}

              {card?.skill && (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Chip size="sm" color="success" variant="flat" startContent={<Check size={12} />}>
                      {en ? "SKILL ready" : "SKILL 已生成"}
                    </Chip>
                    <Chip size="sm" variant="flat">
                      {en
                        ? `${card.measured.count} samples · target ${card.measured.minChars}–${card.measured.maxChars} chars`
                        : `依 ${card.measured.count} 篇範例 · 目標 ${card.measured.minChars}–${card.measured.maxChars} 字`}
                    </Chip>
                  </div>
                  <p className="text-tiny text-default-500">
                    {en
                      ? "This is what the card will follow every run. Edit anything that got the wrong idea — you know your writing better than the model does."
                      : "這就是這張卡每次執行會遵守的規則。哪一條抓錯了直接改 —— 你比模型清楚自己的寫法。"}
                  </p>
                  <Textarea
                    // disableAutosize + 固定高度：讓框吃滿視窗剩下的空間，而不是
                    // 跟著內容長高再被 modal 的捲軸截斷 —— 後者會變成「框裡捲一次、
                    // modal 再捲一次」的雙層捲動，改長文件時最惱人。
                    disableAutosize
                    value={skillDraft}
                    onValueChange={setSkillDraft}
                    classNames={{
                      base: "flex-1",
                      inputWrapper: "h-[calc(100vh-340px)] min-h-[320px] items-start",
                      input: "h-full text-small leading-relaxed font-mono resize-none",
                    }}
                  />
                  <Button
                    size="sm" variant="light" startContent={<Wand2 size={13} />}
                    isLoading={busy === "distil"}
                    onPress={() => { setBusy("distil"); setError(null); distilMut?.mutate({ brandId: brandId!, cardId: cardId! }); }}
                  >
                    {en ? "Regenerate from samples" : "重新從範例生成"}
                  </Button>
                </>
              )}
            </>
          )}

          {/* ── 步驟 3：試寫 ─────────────────────────────────────────── */}
          {step === 3 && card && (
            <>
              <p className="text-small text-default-700">
                {en
                  ? "Answer the card's own question, then test-write. Nothing is saved to your projects and no credits are used."
                  : "回答這張卡自己的問題，然後試寫。試寫不會存進專案、也不扣點數。"}
              </p>

              <div className="space-y-2">
                <p className="text-small font-medium">{card.primaryQuestion}</p>
                <Textarea
                  minRows={3}
                  placeholder={card.primaryPlaceholder}
                  value={dryInputs.topic ?? ""}
                  onValueChange={(v) => setDryInputs((prev) => ({ ...prev, topic: v }))}
                />
              </div>

              {card.askFields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <p className="text-tiny font-medium text-default-700">
                    {f.label}{f.required && <span className="text-danger-500 ml-1">*</span>}
                  </p>
                  <Input
                    size="sm"
                    placeholder={f.placeholder}
                    value={dryInputs[f.key] ?? ""}
                    onValueChange={(v) => setDryInputs((prev) => ({ ...prev, [f.key]: v }))}
                  />
                </div>
              ))}

              <Button
                size="sm" color="secondary" startContent={<FlaskConical size={14} />}
                isLoading={busy === "dry"}
                isDisabled={!(dryInputs.topic ?? "").trim()}
                onPress={() => {
                  setBusy("dry"); setError(null); setDryResult(null);
                  dryRunMut?.mutate({ brandId: brandId!, cardId: cardId!, inputs: dryInputs });
                }}
              >
                {en ? "Test-write one" : "試寫一篇"}
              </Button>

              {dryResult && (
                <div className="rounded-medium border border-divider bg-content1 p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Chip
                      size="sm" variant="flat"
                      color={dryResult.inRange ? "success" : "warning"}
                      startContent={dryResult.inRange ? <Check size={12} /> : <AlertTriangle size={12} />}
                    >
                      {dryResult.chars} {en ? "chars" : "字"}
                    </Chip>
                    <span className="text-tiny text-default-500">
                      {en
                        ? `your samples: ${dryResult.expected.minChars}–${dryResult.expected.maxChars}`
                        : `你的範例區間：${dryResult.expected.minChars}–${dryResult.expected.maxChars} 字`}
                    </span>
                  </div>
                  <p className="text-small text-default-800 whitespace-pre-wrap">{dryResult.caption}</p>
                  <p className="text-tiny text-default-400">
                    {en
                      ? "Not what you wanted? Go back and edit the SKILL, then test again."
                      : "不對味的話回上一步改 SKILL，再試一次。"}
                  </p>
                </div>
              )}
            </>
          )}
        </ModalBody>

        <ModalFooter className="gap-2">
          {step > 1 && (
            <Button
              variant="light" size="sm" startContent={<ChevronLeft size={14} />}
              onPress={() => setStep((s) => (s === 3 ? 2 : 1) as 1 | 2 | 3)}
            >
              {en ? "Back" : "上一步"}
            </Button>
          )}
          <Button variant="flat" size="sm" onPress={() => { onClose(); }}>
            {en ? "Close" : "關閉"}
          </Button>
          {step === 1 && (
            <Button
              color="primary" size="sm"
              isLoading={busy === "create"}
              isDisabled={!step1Ready || !brandId}
              onPress={submitStep1}
            >
              {en ? "Distil into a SKILL" : "讓 AI 總結成 SKILL"}
            </Button>
          )}
          {step === 2 && (
            <Button
              color="primary" size="sm"
              isLoading={busy === "save"}
              isDisabled={!card?.skill}
              onPress={() => void goToDryRun()}
            >
              {en ? "Next: test-write" : "下一步：試寫"}
            </Button>
          )}
          {step === 3 && (
            <Button
              color="primary" size="sm"
              isLoading={busy === "publish"}
              isDisabled={!cardId}
              onPress={() => { setBusy("publish"); setError(null); publishMut?.mutate({ brandId: brandId!, cardId }); }}
            >
              {en ? "Add the card" : "確認新增"}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
