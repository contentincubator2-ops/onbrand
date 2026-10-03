/**
 * CampaignPostModal — 活動企劃上的「這一篇」：寫好的初稿、改、走狀態。
 *
 * 2026-10-02（CJ 看著活動地圖「想要真實產出…開一個彈跳視窗，開始編輯修改嗎？最後可以按草稿、
 * 還是修改中、還是送審中、或是已發布？」→ 定案）：
 *   · 點「寫這篇」→ 任務視窗直接開寫（PlatformTaskModal autoRun）→ 寫好回到這個視窗，
 *     打開就是初稿，不是空白框。一篇一篇點、一篇一篇寫，不做整期一鍵。
 *   · 左邊是貼文的樣子，右邊是本文（直接打字，停手自動存）＋一句話請 AI 改。
 *     換圖、換人重寫等完整功能在成品頁，這裡給一個入口，不再複製一份。
 *   · 狀態由系統走，按鈕只有下一步：
 *       個人版：草稿 →「定稿」→ 已核准 →「標記已發布」→ 已發布
 *       團隊版：草稿 →「送審」→ 待審核 →（主管在審核佇列放行／退回）→ 已核准 → 已發布
 *     關掉視窗就是草稿，不用按「存草稿」。「修改中」不是狀態。
 *   · 待審核、已核准（團隊版）、已發布的本文唯讀：審核過的字被偷偷改掉，審核就沒有意義。
 *
 * 2026-10-02（CJ「送審時要先問我應該要排的時間…在行事曆上看到該篇內容…我也不知道送審給誰」）：
 *   送審／定稿前先定「排在哪天幾點」（預設是企劃上那天 20:00；已經排過就帶原本的時間），
 *   團隊版再選「送給誰」（review.reviewers：同團隊的 owner／admin）。按下去＝排進行事曆
 *   ＋送審（指定那一位），本週企劃上就會出現這一篇：自己看到「送審中」，審核人看到「待審」。
 *
 * 2026-10-02（CJ「這邊可以讓它也可直接生成圖嗎？」）：點預覽的圖片區或「做圖」，直接在這裡做：
 * 從本文產生圖片指令（image.promptFromCaption）→ 用預設模型產圖（image.generate，gpt-image-2，
 * 兩模型政策：失敗不自動換模型）→ 存回這一篇（output.updateVariantImage，舊圖留版本可切回）。
 * 自己寫指令、改用 Nano Banana、用真實產品照，還是在成品頁。多張卡片的貼文每張各有圖，也在成品頁做。
 *
 * 放行為什麼不在這裡：活動屬於建立它的帳號（events.userId），主管開不了別人的活動頁；
 * 放行一律在審核佇列（/review），那裡本來就是主管的入口。
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Spinner, Textarea } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faImage, faPenNib, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import { showToastGlobal } from "../../../platform/components/Toast";
import { toastWithUpgrade } from "../../../platform/lib/upgradeToast";
import { TASK_MODAL_CLASSNAMES, TASK_MODAL_HEADER } from "../../../platform/components/taskModalStyle";
import { PlatformMockup } from "../PlatformMockup";
import type { MockupVariant } from "../../lib/inferMockup";
import { getIgPublicVariantImageSize, getRunContentMutationLocator, resolveRunContent, type RunContentKind } from "../../lib/strategyContentEnvelope";
import { CHANNEL_META, channelLabel } from "../../../platform/lib/channelMeta";
import { phaseShort } from "../../../strategy/lib/campaignStage";
import type { CampaignPlanItem } from "../../../strategy/lib/campaignSchema";
import { postStateChip, postStateLabel, postStateOf, type CampaignPostState } from "../../../strategy/lib/campaignPostStatus";
import type { ItemThumb } from "./CampaignMap";

const md = (s: string) => s.slice(5).replace("-", "/");
/** ISO → 台北的日期與時間（本週企劃一律用台北時間）。 */
const tpeParts = (iso: string) => {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }),
    time: d.toLocaleTimeString("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }),
  };
};
const tidy = (s: unknown) => (typeof s === "string" ? s : "").replace(/\\r\\n|\\n|\\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

/** 活動的通路 → 預覽用哪一種貼文外框。只看通路、不猜形式（形式判斷在成品頁那一份，不再多抄一份）。 */
function mockupFor(platform: string, hasCards: boolean): MockupVariant {
  const v = (p: string, f: string): MockupVariant => ({ platform: p as any, format: f as any, label: `${p}:${f}` });
  switch (platform) {
    case "facebook":  return v("facebook", hasCards ? "carousel" : "feed");
    case "instagram": return v("instagram", hasCards ? "carousel" : "feed");
    case "threads":   return v("threads", "post");
    case "line":      return v("line", "broadcast");
    case "email":     return v("email", "edm");
    case "website":   return v("web", "blog");
    default:          return v("generic", "generic");
  }
}

export default function CampaignPostModal({
  eventId, brandId, item, thumb, phaseMessage, en, onClose,
}: {
  eventId: number;
  brandId: number | null;
  item: CampaignPlanItem;
  thumb: ItemThumb | null;
  phaseMessage: string;
  en: boolean;
  onClose: () => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const navigate = useNavigate();
  const utils = (trpc as any).useUtils();
  const outputId = Number(item.outputId ?? thumb?.outputId ?? 0);
  const state: CampaignPostState = postStateOf(outputId, thumb?.state);
  const refreshStatus = () => {
    utils?.campaign?.itemThumbs?.invalidate?.({ eventId });
    utils?.campaign?.get?.invalidate?.({ eventId });
  };

  const outQ = (trpc as any).output.getById.useQuery(
    { id: outputId },
    {
      enabled: outputId > 0, refetchOnWindowFocus: false,
      // 圖還在畫（caption_ready）就每 4 秒問一次，跟成品頁同一個節奏。
      refetchInterval: (q: any) => (q?.state?.data?.progress === "caption_ready" ? 4000 : false),
    },
  );
  const data: any = outQ.data;

  // 團隊版（方案有審核工作流）才有送審；判斷跟 ReviewBar 同一份。
  const billingQ = (trpc as any).billing.getStatus.useQuery(undefined, { staleTime: 60_000, refetchOnWindowFocus: false });
  const team = !!(billingQ.data as any)?.quota?.reviewWorkflow;

  // ── 內容：版本陣列或策略包，取對外的那幾個版本 ──
  const resolved = React.useMemo(() => {
    if (!data) return { kind: "legacy" as RunContentKind, variants: [] as any[] };
    let parsed: unknown;
    try { parsed = JSON.parse(data.content); } catch { parsed = [{ label: L("主版本", "Main"), caption: data.content ?? "" }]; }
    const r = resolveRunContent<any>(parsed, data?.mission?.taskId ?? null, data?.metadata);
    if (r.isStrategyEnvelope) return { kind: "publicVariants" as RunContentKind, variants: r.publicVariants };
    return { kind: "legacy" as RunContentKind, variants: r.legacyVariants };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const [idx, setIdx] = React.useState(0);
  const variant = resolved.variants[Math.min(idx, Math.max(0, resolved.variants.length - 1))] ?? null;
  const serverCaption = tidy(variant?.caption);
  const [text, setText] = React.useState<string | null>(null);
  React.useEffect(() => { setText(null); }, [outputId, idx]);
  const caption = text ?? serverCaption;
  const cards: any[] | undefined = Array.isArray(variant?.cards) && variant.cards.length ? variant.cards : undefined;
  const editable = !!variant && !cards && (state === "draft" || state === "revision" || (state === "approved" && !team));

  // ── 打字：停手 1 秒自動存（關窗前也會補存） ──
  const saveMut = (trpc as any).output.updateVariantCaption.useMutation({
    onSuccess: () => { utils?.output?.getById?.invalidate?.({ id: outputId }); utils?.campaign?.itemThumbs?.invalidate?.({ eventId }); },
    onError: (e: any) => showToastGlobal(L(`儲存失敗：${e?.message ?? ""}`, `Save failed: ${e?.message ?? ""}`)),
  });
  const pending = React.useRef<{ timer: any; value: string } | null>(null);
  const flush = React.useCallback(() => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    saveMut.mutate({ id: outputId, ...getRunContentMutationLocator(resolved.kind, idx), caption: p.value });
  }, [saveMut, outputId, resolved.kind, idx]);
  const onType = (v: string) => {
    setText(v);
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { value: v, timer: setTimeout(() => flushRef.current(), 1000) };
    // 已核准的稿（個人版）一動就回到草稿——定稿的意思是「這一版」。
    if (state === "approved" && !team && !statusMut.isPending) statusMut.mutate({ id: outputId, status: "draft" });
  };
  // 只在視窗卸下時補存（flush 每次 render 都是新的，直接當依賴會變成每打一個字就存一次）。
  const flushRef = React.useRef(flush);
  flushRef.current = flush;
  React.useEffect(() => () => { flushRef.current(); }, []);
  const close = () => { flush(); onClose(); };

  // ── 一句話請 AI 改 ──
  const [ask, setAsk] = React.useState("");
  const refineMut = (trpc as any).quickTask.refineCaption.useMutation({
    onSuccess: (r: any) => {
      if (!r?.ok || !r?.rewritten) { showToastGlobal(L("AI 這次沒改成，再試一次。", "The rewrite didn't come back — try again.")); return; }
      setAsk("");
      onType(tidy(r.rewritten));
      flush();
    },
    onError: (e: any) => toastWithUpgrade(e?.message ?? L("改寫失敗", "Rewrite failed"), en),
  });

  // ── 直接做圖（2026-10-02）──
  const promptMut = (trpc as any).image.promptFromCaption.useMutation();
  const genMut = (trpc as any).image.generate.useMutation();
  const saveImgMut = (trpc as any).output.updateVariantImage.useMutation();
  const [imgStep, setImgStep] = React.useState<"" | "prompt" | "draw" | "save">("");
  /** 活動的通路 → image.generate 的通路代碼（不認得就不帶，伺服器用預設尺寸）。 */
  const imgChannel = ({ facebook: "fb", instagram: "ig", tiktok: "tiktok", email: "email" } as Record<string, string>)[item.platform];
  const makeImage = async () => {
    const brandIdOf = Number(data?.brand?.id ?? brandId ?? 0);
    if (!brandIdOf || !variant || imgStep) return;
    if (!caption.trim()) { showToastGlobal(L("先寫好本文，才知道要畫什麼。", "Write the post first.")); return; }
    flush();
    const size = getIgPublicVariantImageSize(resolved.kind, variant?.format);
    try {
      setImgStep("prompt");
      const p = await promptMut.mutateAsync({
        brandId: brandIdOf, caption: caption.slice(0, 6000),
        ...(imgChannel ? { channel: imgChannel } : {}), ...(size ? { size } : {}),
        ...(variant?.imageStyle ? { imageStyle: String(variant.imageStyle).slice(0, 3000) } : {}),
      });
      const promptZh = String(p?.promptZh || p?.prompt || "").trim();
      if (!promptZh) throw new Error(L("這次沒產生出圖片指令", "No image prompt came back"));
      setImgStep("draw");
      const r = await genMut.mutateAsync({
        brandId: brandIdOf, prompt: promptZh, modelChoice: "gpt-image-2",
        ...(imgChannel ? { channel: imgChannel } : {}), ...(size ? { size } : {}),
      });
      if (r?.status === "failed" || !r?.url) {
        showToastGlobal(r?.canSwitchTo
          ? L("這次沒有產出圖。可以再試一次，或到成品頁改用 Nano Banana。", "No image this time — try again, or switch model in the full editor.")
          : L("這次沒有產出圖，請再試一次。", "No image this time — please try again."));
        return;
      }
      setImgStep("save");
      await saveImgMut.mutateAsync({
        id: outputId, ...getRunContentMutationLocator(resolved.kind, idx),
        imageUrl: r.url, prompt: r?.effectivePrompt ?? promptZh, promptZh: r?.normalizedDisplayPrompt ?? promptZh,
        modelId: r?.model ?? undefined, requestedModelId: r?.requestedModel ?? undefined,
      });
      utils?.output?.getById?.invalidate?.({ id: outputId });
      utils?.campaign?.itemThumbs?.invalidate?.({ eventId });
      showToastGlobal(L("圖做好了（前一張有保留，在成品頁可以切回去）。", "Image ready (the previous one is kept in the full editor)."));
    } catch (e: any) {
      toastWithUpgrade(e?.message ?? L("做圖失敗", "Image failed"), en);
    } finally {
      setImgStep("");
    }
  };
  // 審核中、已發布的不動圖（跟本文同一條規則）；多張卡片的貼文到成品頁做。
  const canMakeImage = !!variant && !cards && editable;

  // ── 狀態動作 ──
  const statusMut = (trpc as any).output.updateStatus.useMutation({ onSuccess: refreshStatus, onError: (e: any) => showToastGlobal(e?.message ?? "") });
  const [note, setNote] = React.useState("");
  const submitMut = (trpc as any).review.submit.useMutation();

  // ── 排在哪天幾點＋送給誰 ──
  const [when, setWhen] = React.useState(() => thumb?.schedule ? tpeParts(thumb.schedule.at) : { date: item.date, time: "20:00" });
  React.useEffect(() => { if (thumb?.schedule) setWhen(tpeParts(thumb.schedule.at)); }, [thumb?.schedule?.at]);
  const whenIso = `${when.date}T${when.time}:00+08:00`;
  const whenMs = new Date(whenIso).getTime();
  const whenBad = !when.date || !when.time || !Number.isFinite(whenMs);
  const whenPast = !whenBad && whenMs < Date.now() + 60_000;
  const reviewersQ = (trpc as any).review.reviewers.useQuery(undefined, { enabled: team, staleTime: 60_000, refetchOnWindowFocus: false });
  const reviewers: Array<{ userId: number; name: string; email: string; role: string }> = reviewersQ.data ?? [];
  const [reviewer, setReviewer] = React.useState<number | null>(null);
  const reviewerId = reviewer ?? reviewers[0]?.userId ?? null;
  const scheduleMut = (trpc as any).calendar.schedule.useMutation();
  const rescheduleMut = (trpc as any).calendar.reschedule.useMutation();
  const [working, setWorking] = React.useState(false);
  /** 排進行事曆：還沒排就排；排過了而時間改了就改時間。 */
  const ensureScheduled = async () => {
    const sch = thumb?.schedule;
    if (sch) {
      if (new Date(sch.at).getTime() !== whenMs) await rescheduleMut.mutateAsync({ id: sch.id, scheduledAt: whenIso });
      return;
    }
    await scheduleMut.mutateAsync({ outputId, ...getRunContentMutationLocator(resolved.kind, idx), platform: item.platform, scheduledAt: whenIso });
  };
  const afterAction = () => {
    refreshStatus();
    utils?.planner?.week?.invalidate?.();
    utils?.calendar?.range?.invalidate?.();
    utils?.review?.invalidate?.();
  };
  /** 團隊版：排進行事曆＋送給指定的人審。 */
  const sendForReview = async () => {
    if (!reviewerId || whenBad || whenPast) return;
    flush();
    setWorking(true);
    try {
      await ensureScheduled();
      await submitMut.mutateAsync({ missionId, outputId, reviewerIds: [reviewerId], note: note.trim() || undefined });
      const who = reviewers.find((r) => r.userId === reviewerId)?.name ?? "";
      showToastGlobal(L(`已排在 ${md(when.date)} ${when.time}，送給 ${who} 審核`, `Scheduled ${md(when.date)} ${when.time}, sent to ${who}`));
      setNote("");
    } catch (e: any) {
      toastWithUpgrade(e?.message ?? L("送審失敗", "Couldn't submit"), en);
    } finally {
      setWorking(false);
      afterAction();
    }
  };
  /** 個人版：排進行事曆＋定稿。 */
  const finalize = async () => {
    if (whenBad || whenPast) return;
    flush();
    setWorking(true);
    try {
      await ensureScheduled();
      await statusMut.mutateAsync({ id: outputId, status: "approved" });
      showToastGlobal(L(`已定稿，排在 ${md(when.date)} ${when.time}`, `Finalized for ${md(when.date)} ${when.time}`));
    } catch (e: any) {
      showToastGlobal(e?.message ?? L("沒有成功，再試一次", "Didn't work — try again"));
    } finally {
      setWorking(false);
      afterAction();
    }
  };
  const schedText = thumb?.schedule ? (() => { const p = tpeParts(thumb.schedule!.at); return `${md(p.date)} ${p.time}`; })() : null;
  const [url, setUrl] = React.useState(thumb?.publishedUrl ?? "");
  React.useEffect(() => { setUrl(thumb?.publishedUrl ?? ""); }, [thumb?.publishedUrl]);
  const publishMut = (trpc as any).campaign.markPublished.useMutation({
    onSuccess: () => refreshStatus(),
    onError: (e: any) => showToastGlobal(e?.message ?? ""),
  });
  const missionId = Number(data?.mission?.id ?? thumb?.missionId ?? 0);
  const busy = working || statusMut.isPending || publishMut.isPending;

  const chip = postStateChip(state);
  const imageUrl = variant?.imageUrl ?? variant?.image?.url ?? undefined;
  const imageStatus = variant?.imageStatus ?? variant?.image?.status ?? undefined;

  return (
    <Modal isOpen onClose={close} size="5xl" scrollBehavior="inside" backdrop="blur" classNames={TASK_MODAL_CLASSNAMES}>
      <ModalContent>
        <ModalHeader className={TASK_MODAL_HEADER}>
          <div className="flex items-center gap-2.5 min-w-0">
            <FontAwesomeIcon icon={CHANNEL_META[item.platform]?.icon ?? faPenNib} className="text-neutral-900 shrink-0" style={{ fontSize: 18 }} />
            <p className="text-[15px] text-neutral-900 font-semibold truncate">
              {md(item.date)}・{channelLabel(item.platform, en)}・{item.taskLabel}
            </p>
            <Chip size="sm" color={chip.color} variant={chip.variant} className="shrink-0">{postStateLabel(state, en)}</Chip>
            {item.paid && <Chip size="sm" className="shrink-0 bg-foreground text-background">{L("廣告", "Ad")}</Chip>}
          </div>
          <p className="text-tiny font-normal text-default-500 mt-1 truncate">
            {en ? phaseShort(item.phase, true) : `${phaseShort(item.phase, false)}期`}
            {phaseMessage ? `｜${phaseMessage}` : ""}
          </p>
        </ModalHeader>

        <ModalBody>
          {!outputId ? (
            <p className="text-small text-default-500 py-8 text-center">{L("這一篇還沒寫。", "This post hasn't been written yet.")}</p>
          ) : outQ.isLoading ? (
            <div className="flex items-center gap-3 py-10 justify-center"><Spinner size="sm" /><span className="text-small text-default-500">{L("載入中…", "Loading…")}</span></div>
          ) : !variant ? (
            <div className="py-8 text-center flex flex-col items-center gap-3">
              <p className="text-small text-default-500">{L("這一篇的內容格式要在成品頁看。", "Open this one in the full editor.")}</p>
              <Button size="sm" variant="bordered" onPress={() => navigate(`/run/${outputId}`)}>{L("打開成品頁", "Open full editor")}</Button>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
              {/* 左：貼文的樣子（跟著右邊的字即時變） */}
              <div className="min-w-0 rounded-2xl bg-default-50 p-3">
                <PlatformMockup
                  variant={mockupFor(item.platform, !!cards)}
                  title={data?.title ?? ""} brief=""
                  brandName={data?.product?.name ?? data?.brand?.name ?? ""}
                  brandLogoUrl={data?.product?.logoUrl ?? data?.brand?.logoUrl ?? null}
                  liveCaption={caption}
                  liveHashtags={variant?.hashtags ?? []}
                  liveImageUrl={imageUrl ?? undefined}
                  liveImageStatus={imageStatus as any}
                  liveCards={cards as any}
                  onGenerateImage={canMakeImage && !imgStep ? () => { void makeImage(); } : undefined}
                />
                {imgStep && (
                  <p className="text-tiny text-default-500 mt-2 flex items-center gap-2"><Spinner size="sm" />
                    {imgStep === "prompt" ? L("從本文想畫面…", "Working out the picture from the text…")
                      : imgStep === "draw" ? L("畫圖中，大約 30–60 秒…", "Drawing — about 30–60s…")
                      : L("存到這一篇…", "Saving…")}
                  </p>
                )}
                {data?.progress === "caption_ready" && (
                  <p className="text-tiny text-default-500 mt-2 flex items-center gap-2"><Spinner size="sm" />{L("圖還在畫，好了會自動出現。", "The image is still rendering.")}</p>
                )}
              </div>

              {/* 右：本文、請 AI 改、完整編輯器 */}
              <div className="min-w-0 flex flex-col gap-3">
                {resolved.variants.length > 1 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {resolved.variants.map((v: any, i: number) => (
                      <Button key={i} size="sm" radius="full" variant={i === idx ? "solid" : "flat"}
                        className={i === idx ? "bg-foreground text-background" : ""}
                        onPress={() => { flush(); setIdx(i); }}>
                        {String(v?.label ?? L(`版本 ${i + 1}`, `Version ${i + 1}`)).slice(0, 16)}
                      </Button>
                    ))}
                  </div>
                )}
                {state === "revision" && thumb?.reviewNote && (
                  <p className="rounded-xl bg-danger-50 text-danger-700 px-3 py-2 text-small">{L("退回理由：", "Note: ")}{thumb.reviewNote}</p>
                )}
                <Textarea
                  label={L("本文", "Post text")} labelPlacement="outside"
                  value={cards ? cards.map((c) => [c?.headline, c?.body].filter(Boolean).join("\n")).join("\n\n") : caption}
                  onValueChange={onType} isReadOnly={!editable}
                  minRows={10} maxRows={22} variant="bordered" radius="lg"
                  description={editable
                    ? (saveMut.isPending ? L("儲存中…", "Saving…") : L("直接改，停手就自動存。", "Edits save automatically."))
                    : cards ? L("多張卡片的內容請到成品頁改。", "Edit multi-card posts in the full editor.")
                    : state === "in_review" ? L("審核中的稿不能改；被退回後就能改。", "Locked while in review.")
                    : state === "published" ? L("已經發出去了。", "Already published.")
                    : L("已核准的稿不在這裡改。", "Approved posts are locked here.")}
                />
                {editable && (
                  <div className="flex gap-2 items-end">
                    <Input size="sm" variant="bordered" radius="lg" value={ask} onValueChange={setAsk}
                      placeholder={L("請 AI 改：例如「語氣再硬一點」「第一句更短」", "Ask AI: e.g. \"punchier opening\"")}
                      onKeyDown={(e) => { if (e.key === "Enter" && ask.trim() && !refineMut.isPending) refineMut.mutate(refinePayload()); }} />
                    <Button size="sm" radius="lg" variant="flat" isLoading={refineMut.isPending} isDisabled={!ask.trim()}
                      startContent={!refineMut.isPending && <FontAwesomeIcon icon={faWandMagicSparkles} />}
                      onPress={() => refineMut.mutate(refinePayload())}>{L("改", "Rewrite")}</Button>
                  </div>
                )}
                {canMakeImage && (
                  <Button size="sm" radius="lg" variant="flat" className="self-start" isLoading={!!imgStep}
                    startContent={!imgStep && <FontAwesomeIcon icon={faImage} />}
                    onPress={() => { void makeImage(); }}>
                    {imageUrl ? L("重做這張圖", "Redo the image") : L("幫這篇做圖", "Make an image")}
                  </Button>
                )}
                <button type="button" className="self-start text-tiny text-default-500 hover:text-foreground flex items-center gap-1.5"
                  onClick={() => { flush(); navigate(`/run/${outputId}`); }}>
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-[10px]" />
                  {L("在成品頁打開（換圖、換人重寫、排程）", "Open full editor (images, writers, scheduling)")}
                </button>
              </div>
            </div>
          )}
        </ModalBody>

        {outputId > 0 && variant && (
          <ModalFooter className="flex-col items-stretch gap-2">
            {(state === "draft" || state === "revision") && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="text-small text-default-600 w-14 shrink-0">{L("排在", "Post at")}</span>
                  <Input type="date" size="sm" variant="bordered" radius="lg" className="w-[160px]" aria-label={L("日期", "Date")}
                    value={when.date} onValueChange={(v) => setWhen((w) => ({ ...w, date: v }))} />
                  <Input type="time" size="sm" variant="bordered" radius="lg" className="w-[120px]" aria-label={L("時間", "Time")}
                    value={when.time} onValueChange={(v) => setWhen((w) => ({ ...w, time: v }))} />
                  {whenPast && <span className="text-tiny text-danger">{L("這個時間已經過了，選之後的時間。", "That time has passed.")}</span>}
                  {!whenPast && when.date !== item.date && <span className="text-tiny text-default-500">{L(`企劃原本排在 ${md(item.date)}`, `Plan said ${md(item.date)}`)}</span>}
                </div>
                {team ? (
                  <div className="flex gap-2 items-center flex-wrap">
                    <span className="text-small text-default-600 w-14 shrink-0">{L("送給", "Reviewer")}</span>
                    {reviewersQ.isLoading ? <Spinner size="sm" /> : reviewers.length ? (
                      <select value={reviewerId ?? ""} onChange={(e) => setReviewer(Number(e.target.value) || null)} aria-label={L("審核人", "Reviewer")}
                        className="h-8 rounded-lg border-2 border-default-200 bg-transparent px-2 text-small min-w-[180px]">
                        {reviewers.map((r) => (
                          <option key={r.userId} value={r.userId}>{r.name}{r.role === "owner" ? L("（擁有者）", " (owner)") : L("（管理者）", " (admin)")}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-small text-default-500">
                        {L("團隊裡還沒有可以審核的管理者。", "No admin on your team can review yet.")}
                        <button type="button" className="underline ml-1" onClick={() => navigate("/settings/workspace")}>{L("邀請成員", "Invite")}</button>
                      </span>
                    )}
                    <Input size="sm" variant="bordered" radius="lg" value={note} onValueChange={setNote} className="flex-1 min-w-[180px]"
                      placeholder={L("給審核的人一句話（選填）", "Note for the reviewer (optional)")} />
                    <Button radius="lg" className="bg-foreground text-background font-semibold shrink-0" isLoading={working}
                      isDisabled={busy || !missionId || !reviewerId || whenBad || whenPast} onPress={sendForReview}>
                      {state === "revision" ? L("改好了，再送審", "Resubmit") : L("送審", "Send for review")}
                    </Button>
                  </div>
                ) : (
                  <div className="flex justify-end gap-2 items-center">
                    <span className="text-tiny text-default-500 mr-auto">{L("關掉視窗就是草稿；確定這一版再按定稿，會排進本週企劃。", "Closing keeps it as a draft.")}</span>
                    <Button radius="lg" className="bg-foreground text-background font-semibold" isLoading={working} isDisabled={busy || whenBad || whenPast} onPress={finalize}>
                      {L("定稿並排程", "Finalize & schedule")}
                    </Button>
                  </div>
                )}
              </div>
            )}
            {state === "in_review" && (
              <div className="flex items-center gap-2">
                <span className="text-small text-default-600">
                  {L(`送審中・等 ${thumb?.reviewerName ?? "主管"} 審核`, `In review · waiting for ${thumb?.reviewerName ?? "a reviewer"}`)}
                  {schedText ? L(`・排在 ${schedText}`, ` · ${schedText}`) : ""}
                </span>
                <Button size="sm" variant="light" className="ml-auto" onPress={() => navigate("/planner")}>{L("看本週企劃", "Open planner")}</Button>
              </div>
            )}
            {state === "approved" && (
              <div className="flex gap-2 items-center">
                {schedText && <span className="text-small text-default-600 shrink-0">{L(`排在 ${schedText}`, `Scheduled ${schedText}`)}</span>}
                {!team && (
                  <Button size="sm" variant="light" isDisabled={busy} onPress={() => statusMut.mutate({ id: outputId, status: "draft" })}>{L("改回草稿", "Back to draft")}</Button>
                )}
                <Input size="sm" variant="bordered" radius="lg" value={url} onValueChange={setUrl} className="flex-1"
                  placeholder={L("發出去後貼上貼文連結（選填，成效會用它接回這一篇）", "Post link once live (optional)")} />
                <Button radius="lg" className="bg-foreground text-background font-semibold shrink-0" isLoading={publishMut.isPending} isDisabled={busy}
                  onPress={() => publishMut.mutate({ eventId, itemId: item.id, published: true, url: url.trim() || undefined })}>
                  {L("標記已發布", "Mark published")}
                </Button>
              </div>
            )}
            {state === "published" && (
              <div className="flex gap-2 items-center">
                {thumb?.publishedUrl
                  ? <a href={thumb.publishedUrl} target="_blank" rel="noreferrer" className="text-small underline truncate">{thumb.publishedUrl}</a>
                  : <span className="text-small text-default-500">{L("已發布（沒有貼連結）。", "Published (no link).")}</span>}
                <Button size="sm" variant="light" className="ml-auto" isDisabled={busy}
                  onPress={() => publishMut.mutate({ eventId, itemId: item.id, published: false })}>{L("標錯了，改回已核准", "Undo")}</Button>
              </div>
            )}
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  );

  function refinePayload() {
    return {
      currentCaption: caption || " ", userFeedback: ask.trim(),
      brandId: brandId ?? data?.mission?.brandId ?? undefined,
      eventId,
      taskId: String(data?.mission?.taskId ?? item.taskId) || undefined,
    };
  }
}
