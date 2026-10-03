/**
 * ImageCardPage — 一張圖片任務卡（/image/:cardId）。
 *
 * 2026-09-29（CJ「圖片獨立成任務卡」＋「參考大家用 Claude 生圖的流程」）三步：
 *   1. 選方向：貼上（或帶入）文案 → AI 先用文字提 3 個畫面方向，選了才生圖（便宜、快、選錯代價最低）。
 *   2. 對話修改：直接說「暖一點」「產品放大」——每改一次留一版，可切回。不給參數面板。
 *   3. 輸出：標題是可編輯疊層（AI 圖一律不烤字）；可延伸成同平台／其他平台的其他尺寸。
 *
 * 2026-10-04（CJ「產出圖片後，想要有圖文搭配預覽，並且一起排程……目前圖片修改完後，就直接
 * 下載而已，無法一起排程到行事曆」）：圖做好後多一步「圖文預覽與排程」——用該平台的貼文外框
 * 看圖＋文案擺在一起的樣子，選時間排進本週企劃。行事曆排的是「產出」，所以排之前先把圖
 * （含疊好的標題）和文案存成一篇（imageCard.saveAsPost）；從文字任務過來的就寫回那一篇。
 *
 * 比例鐵律（CJ「不能生成後再裁，要嚴格限制在指令當中」）：每個尺寸都是在該尺寸的原生
 * 比例下「重新生成」（拿目前這張當參考），不是把這張裁成別的比例。
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { Button, Spinner, Textarea, Input, Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { showToastGlobal } from "../../platform/components/Toast";
import type { ShellOutletCtx } from "../../platform/lib/shellContext";
import type { ImageCardInfo } from "../../platform/lib/imageCardHandoff";
import { clearImageCardHandoff, readImageCardHandoff, takeImageSubjectHandoff } from "../../platform/lib/imageCardHandoff";
import BrandLibrary from "../../strategy/components/assets/BrandLibrary";
import AiImageNotice from "../../platform/components/AiImageNotice";
import { PlatformMockup } from "../components/PlatformMockup";
import { imageCardMockup } from "../lib/imageCardMockup";

type Model = "gpt-image-2" | "nano-banana";

interface Direction { id: string; titleZh: string; sceneZh: string; paletteZh: string; whyZh: string; promptEn: string }
interface Version { url: string; note: string }
interface Slot { versions: Version[]; active: number }

const CHANNEL_ZH: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", threads: "Threads", line: "LINE",
  tiktok: "TikTok", email: "電子報", website: "官網",
};

const QUICK_EDITS = ["暖一點", "背景乾淨一點", "產品放大", "光線更明亮", "換一個場景"];

/** 標題疊層的位置：跟卡片規格的 titleZone 一致（prompt 也是在那裡留白）。 */
function overlayStyle(zone: ImageCardInfo["titleZone"]): React.CSSProperties {
  const base: React.CSSProperties = { position: "absolute", left: "7%", right: "7%", textAlign: "center" };
  if (zone === "top") return { ...base, top: "8%" };
  if (zone === "bottom") return { ...base, bottom: "10%" };
  if (zone === "left") return { position: "absolute", left: "6%", width: "42%", top: "50%", transform: "translateY(-50%)", textAlign: "left" };
  return { ...base, top: "50%", transform: "translateY(-50%)" };
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

/** 原圖＋（選擇性）標題疊層，畫成規格像素，回傳 data URL。下載、圖文預覽、排程存檔都用這一張。 */
async function composeTitled(card: ImageCardInfo, url: string, title: string, dark: boolean): Promise<string> {
  const img = await loadImage(url);
  const c = document.createElement("canvas");
  c.width = card.width; c.height = card.height;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0, card.width, card.height);
  if (title.trim() && card.titleZone !== "none") {
    const size = Math.round(Math.min(card.width, card.height) * 0.075);
    g.font = `700 ${size}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
    g.fillStyle = dark ? "#171717" : "#FFFFFF";
    g.shadowColor = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
    g.shadowBlur = size * 0.25;
    const left = card.titleZone === "left";
    g.textAlign = left ? "left" : "center";
    g.textBaseline = "middle";
    const maxW = left ? card.width * 0.42 : card.width * 0.86;
    // 逐字換行（中文沒有空白可斷）。
    const lines: string[] = [];
    let line = "";
    for (const ch of title.trim()) {
      if (g.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; } else line += ch;
    }
    if (line) lines.push(line);
    const lh = size * 1.25;
    const blockH = lh * lines.length;
    const x = left ? card.width * 0.06 : card.width / 2;
    const y0 = card.titleZone === "top" ? card.height * 0.08 + lh / 2
      : card.titleZone === "bottom" ? card.height * 0.9 - blockH + lh / 2
      : card.height / 2 - blockH / 2 + lh / 2;
    lines.forEach((l, i) => g.fillText(l, x, y0 + i * lh));
  }
  const mime = card.format === "png" ? "image/png" : "image/jpeg";
  return c.toDataURL(mime, 0.92);
}

async function downloadWithTitle(card: ImageCardInfo, url: string, title: string, dark: boolean) {
  const a = document.createElement("a");
  a.href = await composeTitled(card, url, title, dark);
  a.download = `${card.id}-${card.width}x${card.height}.${card.format === "png" ? "png" : "jpg"}`;
  a.click();
}

export default function ImageCardPage() {
  const { cardId = "" } = useParams();
  const navigate = useNavigate();
  const { lang } = useLang();
  const ctx = useOutletContext<ShellOutletCtx>();
  const brandId = ctx?.brandId ?? null;

  const listQ = trpc.imageCard.list.useQuery(undefined, { staleTime: 5 * 60_000 });
  const cards = (listQ.data?.cards ?? []) as ImageCardInfo[];
  const card = cards.find((c) => c.id === cardId);

  const productsQ = (trpc as any).media?.listProductImages?.useQuery(
    { brandId: brandId ?? 0 }, { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 60_000 },
  ) ?? { data: null };
  const products: Array<{ productId: number; name: string; imageUrl: string }> = productsQ.data?.products ?? [];

  const [copy, setCopy] = useState("");
  const [fromRunId, setFromRunId] = useState<string | number | undefined>();
  const [fromLocator, setFromLocator] = useState<{ variantIndex?: number; contentKind?: "planning" | "public"; contentIndex?: number }>({});
  useEffect(() => {
    const h = readImageCardHandoff();
    if (h?.copy) { setCopy(h.copy); setFromRunId(h.fromRunId); setFromLocator(h.locator ?? {}); }
  }, []);

  const [model, setModel] = useState<Model>("gpt-image-2");
  const [product, setProduct] = useState<{ name: string; imageUrl: string } | null>(null);
  // 2026-09-30（CJ「素材庫…可以自己選取，當成作圖使用」）：從素材庫「用這張作圖」過來的，
  // 或在這裡按「從素材庫挑」的——不一定是某個產品的照片，所以另外記著，縮圖列才畫得出來。
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryPick, setLibraryPick] = useState<{ name: string; imageUrl: string } | null>(null);
  useEffect(() => {
    const h = takeImageSubjectHandoff();
    if (h?.url) {
      const picked = { name: h.label, imageUrl: h.url };
      setLibraryPick(picked);
      setProduct(picked);
    }
  }, []);
  const [directions, setDirections] = useState<Direction[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [customScene, setCustomScene] = useState("");
  const [headline, setHeadline] = useState("");
  const [showTitle, setShowTitle] = useState(true);
  const [darkTitle, setDarkTitle] = useState(false);
  const [showSafe, setShowSafe] = useState(true);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [editText, setEditText] = useState("");
  const [failure, setFailure] = useState<{ msg: string; canNano: boolean } | null>(null);
  const [extendPick, setExtendPick] = useState<string[]>([]);
  const [extended, setExtended] = useState<Record<string, { status: "running" | "ready" | "failed"; url?: string; msg?: string }>>({});

  // 卡片換了（從延伸結果點進另一張卡）就重來。
  useEffect(() => {
    setDirections([]); setPicked(null); setSlots([]); setActiveSlot(0); setFailure(null); setExtended({}); setExtendPick([]);
  }, [cardId]);
  useEffect(() => { if (card && !card.nanoBanana && model === "nano-banana") setModel("gpt-image-2"); }, [card, model]);

  const proposeMut = trpc.imageCard.propose.useMutation();
  const renderMut = trpc.imageCard.render.useMutation();

  // ── 圖文預覽與排程 ──
  const savePostMut = trpc.imageCard.saveAsPost.useMutation();
  const scheduleMut = trpc.calendar.schedule.useMutation();
  const [postOpen, setPostOpen] = useState(false);
  /** 預覽用的圖：有標題就是疊好標題的那張（data URL），沒有就是原圖。 */
  const [postImage, setPostImage] = useState<string | null>(null);
  const [schedDate, setSchedDate] = useState(() => {
    const d = new Date(Date.now() + 24 * 3600_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [schedTime, setSchedTime] = useState("20:00");
  /** 從文字任務過來的，預設把圖放回那一篇；用戶可以改成另存一篇新的。 */
  const [asNewPost, setAsNewPost] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const brand = ((ctx?.brands ?? []) as any[]).find((b) => b?.id === brandId);

  const scenePrompt = useMemo(() => {
    if (picked === "custom") return customScene.trim();
    return directions.find((d) => d.id === picked)?.promptEn ?? "";
  }, [picked, customScene, directions]);

  const current: Version | null = slots[activeSlot]?.versions[slots[activeSlot].active] ?? null;
  const busy = renderMut.isPending;

  if (!listQ.isLoading && !card) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center text-default-500">
        {lang === "en" ? "This image card doesn't exist." : "找不到這張圖片卡。"}
        <div className="mt-4"><Button variant="flat" onPress={() => navigate("/tasks/fb")}>{lang === "en" ? "Back" : "回任務列表"}</Button></div>
      </div>
    );
  }
  if (!card) return <div className="py-20 flex justify-center"><Spinner /></div>;

  async function propose() {
    if (!brandId) { showToastGlobal(lang === "en" ? "Pick a brand first." : "請先選擇品牌。"); return; }
    if (copy.trim().length < 2) { showToastGlobal(lang === "en" ? "Paste the copy first." : "先貼上文案。"); return; }
    try {
      const r = await proposeMut.mutateAsync({ brandId, cardId: card!.id, copy: copy.trim(), productName: products.some((p) => p.imageUrl === product?.imageUrl) ? product?.name : undefined });
      setDirections(r.directions as Direction[]);
      setPicked((r.directions[0] as Direction | undefined)?.id ?? null);
      if (!headline) setHeadline(r.headlineZh);
    } catch (e: any) {
      showToastGlobal(String(e?.message ?? e).slice(0, 160));
    }
  }

  async function render(opts: { reference?: string; instruction?: string; newSlot?: boolean; targetCard?: ImageCardInfo; useModel?: Model }) {
    if (!brandId || !scenePrompt) return null;
    const target = opts.targetCard ?? card!;
    const m = opts.useModel ?? (target.nanoBanana ? model : "gpt-image-2");
    const r = await renderMut.mutateAsync({
      brandId, cardId: target.id, scenePromptEn: scenePrompt, modelChoice: m,
      productImageUrl: opts.reference ? undefined : product?.imageUrl,
      referenceImageUrl: opts.reference, instruction: opts.instruction,
    });
    return r;
  }

  async function generateFirst(useModel?: Model) {
    setFailure(null);
    try {
      const r = await render({ useModel });
      if (r?.status === "ready" && r.url) {
        setSlots([{ versions: [{ url: r.url, note: lang === "en" ? "First draft" : "初稿" }], active: 0 }]);
        setActiveSlot(0);
      } else if (r) {
        setFailure({ msg: r.errorMsg ?? "", canNano: r.canSwitchTo === "nano-banana" && card!.nanoBanana });
      }
    } catch (e: any) { setFailure({ msg: String(e?.message ?? e), canNano: false }); }
  }

  async function refine(instruction: string) {
    if (!current || !instruction.trim()) return;
    setFailure(null);
    try {
      const r = await render({ reference: current.url, instruction: instruction.trim() });
      if (r?.status === "ready" && r.url) {
        setSlots((prev) => prev.map((s, i) => i !== activeSlot ? s : {
          versions: [...s.versions, { url: r.url!, note: instruction.trim() }], active: s.versions.length,
        }));
        setEditText("");
      } else if (r) setFailure({ msg: r.errorMsg ?? "", canNano: false });
    } catch (e: any) { setFailure({ msg: String(e?.message ?? e), canNano: false }); }
  }

  async function addToSeries() {
    if (!current) return;
    setFailure(null);
    try {
      const r = await render({
        reference: current.url,
        instruction: "Next image in the same series: a different angle, moment or detail of the same story, same palette, lighting and style.",
      });
      if (r?.status === "ready" && r.url) {
        setSlots((prev) => [...prev, { versions: [{ url: r.url!, note: lang === "en" ? "Series" : "同系列" }], active: 0 }]);
        setActiveSlot(slots.length);
      } else if (r) setFailure({ msg: r.errorMsg ?? "", canNano: false });
    } catch (e: any) { setFailure({ msg: String(e?.message ?? e), canNano: false }); }
  }

  async function runExtend() {
    if (!current || !extendPick.length) return;
    const targets = cards.filter((c) => extendPick.includes(c.id));
    for (const t of targets) {
      setExtended((p) => ({ ...p, [t.id]: { status: "running" } }));
      try {
        const r = await render({ reference: current.url, targetCard: t });
        setExtended((p) => ({ ...p, [t.id]: r?.status === "ready" ? { status: "ready", url: r.url } : { status: "failed", msg: r?.errorMsg } }));
      } catch (e: any) {
        setExtended((p) => ({ ...p, [t.id]: { status: "failed", msg: String(e?.message ?? e) } }));
      }
    }
  }

  const titled = showTitle && headline.trim().length > 0 && card.titleZone !== "none";
  const fromOutputId = !asNewPost && fromRunId != null && Number.isFinite(Number(fromRunId)) ? Number(fromRunId) : undefined;

  async function openPost() {
    if (!current) return;
    // 一組多張時，貼文的主圖是第一張；標題也只疊在第一張。
    const base = slots[0]!.versions[slots[0]!.active]!.url;
    setPostImage(base);
    setPostOpen(true);
    if (!titled) return;
    try { setPostImage(await composeTitled(card!, base, headline, darkTitle)); }
    catch { showToastGlobal(lang === "en" ? "Could not draw the title on the image." : "標題疊不上去，先用沒有標題的圖預覽。"); }
  }

  /** 把圖＋文案存成一篇產出（或寫回來源那篇）。schedule=true 再排進行事曆。 */
  async function savePost(schedule: boolean) {
    if (!brandId || !current) return;
    if (!fromOutputId && copy.trim().length < 2) {
      showToastGlobal(lang === "en" ? "Add the copy first." : "先填上文案，才能跟圖一起排程。");
      return;
    }
    setPostError(null);
    const scheduledAt = `${schedDate}T${schedTime}:00+08:00`;
    if (schedule && !(new Date(scheduledAt).getTime() > Date.now())) {
      showToastGlobal(lang === "en" ? "Pick a time in the future." : "排程時間要選未來的時間。");
      return;
    }
    try {
      const urls = slots.map((sl) => sl.versions[sl.active]!.url);
      const saved = await savePostMut.mutateAsync({
        brandId, cardId: card!.id, copy,
        // 寫回來源文案時只帶一張（那一則只有一個圖位）。
        imageUrls: fromOutputId ? [urls[0]!] : urls,
        imageB64: titled && postImage?.startsWith("data:image/") ? postImage : undefined,
        fromOutputId,
        ...(fromOutputId ? fromLocator : {}),
      });
      clearImageCardHandoff();
      if (!schedule) {
        showToastGlobal(lang === "en" ? "Saved as a post." : "已存成貼文。");
        navigate(`/run/${saved.outputId}`);
        return;
      }
      await scheduleMut.mutateAsync({ outputId: saved.outputId, ...saved.locator, platform: card!.channel, scheduledAt });
      showToastGlobal(lang === "en" ? "Scheduled. See it in this week's plan." : "已排進行事曆。");
      navigate(`/planner?w=${schedDate}&ho=${saved.outputId}`);
    } catch (e: any) {
      // 被閘道擋下的錯誤（例如 413）不是 tRPC 形狀，message 可能是空的或一串 JSON——一定要讓人看得到失敗。
      const msg = String(e?.message ?? "").trim();
      setPostError(msg && !msg.startsWith("{") && !msg.startsWith("<") ? msg.slice(0, 200) : (lang === "en" ? "Couldn't save. Please try again." : "沒有存成功，請再試一次。"));
    }
  }
  const postBusy = savePostMut.isPending || scheduleMut.isPending;


  const ratioCss = `${card.width} / ${card.height}`;
  const sameChannel = cards.filter((c) => c.channel === card.channel && c.id !== card.id);
  const otherChannels = cards.filter((c) => c.channel !== card.channel);
  const step = current ? 2 : 1;

  return (
    <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-6">
      {/* 標頭 */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-tiny text-default-500">
            {CHANNEL_ZH[card.channel] ?? card.channel} · {lang === "en" ? "Image" : "圖片"}
          </p>
          <h1 className="text-xl font-semibold text-default-900 mt-0.5">{lang === "en" ? card.labelEn : card.labelZh}</h1>
          <p className="text-tiny text-default-500 mt-1 tabular-nums">
            {card.ratio} · {card.width}×{card.height}
            {card.maxImages > 1 ? ` · ${lang === "en" ? `up to ${card.maxImages}` : `最多 ${card.maxImages} 張`}` : ""}
            {" · "}{card.noteZh}
          </p>
        </div>
        {fromRunId != null && (
          <Button size="sm" variant="light" onPress={() => navigate(`/run/${fromRunId}`)}>
            ← {lang === "en" ? "Back to the post" : "回到文案"}
          </Button>
        )}
      </div>

      {/* 步驟列 */}
      <ol className="mt-4 flex items-center gap-2 text-tiny text-default-500">
        {[lang === "en" ? "1 Direction" : "1 選方向", lang === "en" ? "2 Refine" : "2 對話修改", lang === "en" ? "3 Preview, schedule & resize" : "3 圖文預覽・排程・延伸尺寸"].map((s, i) => (
          <li key={s} className={`px-2.5 py-1 rounded-full ${(i === 0 && step === 1) || (i > 0 && step === 2) ? "bg-default-900 text-white" : "bg-default-100"}`}>{s}</li>
        ))}
      </ol>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-6">
        {/* 左：預覽 */}
        <div>
          <div className="mx-auto" style={{ maxWidth: card.width >= card.height ? 720 : 440 }}>
            <div className="relative w-full overflow-hidden rounded-lg border border-default-200 bg-default-100" style={{ aspectRatio: ratioCss }}>
              {current ? (
                <>
                  <img src={current.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <AiImageNotice overlay />
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-default-400 text-tiny p-6 text-center">
                  {busy ? <Spinner size="sm" /> : null}
                  {busy
                    ? (lang === "en" ? "Generating at the exact ratio…" : "正在用這個比例生成…")
                    : (lang === "en" ? "Your image will appear here at the exact platform ratio." : "圖片會以平台的實際比例顯示在這裡。")}
                </div>
              )}
              {showSafe && card.safeZone && (
                <>
                  {card.safeZone.top > 0 && <div className="absolute left-0 right-0 top-0 bg-black/25 pointer-events-none" style={{ height: `${card.safeZone.top * 100}%` }} />}
                  {card.safeZone.bottom > 0 && <div className="absolute left-0 right-0 bottom-0 bg-black/25 pointer-events-none" style={{ height: `${card.safeZone.bottom * 100}%` }} />}
                  {card.safeZone.left > 0 && <div className="absolute left-0 top-0 bottom-0 bg-black/15 pointer-events-none" style={{ width: `${card.safeZone.left * 100}%` }} />}
                  {card.safeZone.right > 0 && <div className="absolute right-0 top-0 bottom-0 bg-black/15 pointer-events-none" style={{ width: `${card.safeZone.right * 100}%` }} />}
                </>
              )}
              {current && showTitle && headline.trim() && card.titleZone !== "none" && (
                <div style={overlayStyle(card.titleZone)} className="pointer-events-none">
                  <span
                    className="font-bold leading-tight"
                    style={{
                      fontSize: "clamp(16px, 3vw, 40px)",
                      color: darkTitle ? "#171717" : "#fff",
                      textShadow: darkTitle ? "0 0 10px rgba(255,255,255,.5)" : "0 1px 12px rgba(0,0,0,.45)",
                    }}
                  >
                    {headline}
                  </span>
                </div>
              )}
              {current && busy && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center"><Spinner /></div>
              )}
            </div>

            {/* 版本列（對話修改的每一版） */}
            {slots[activeSlot] && slots[activeSlot].versions.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {slots[activeSlot].versions.map((v, i) => (
                  <button key={v.url} onClick={() => setSlots((p) => p.map((s, si) => si !== activeSlot ? s : { ...s, active: i }))}
                    title={v.note}
                    className={`shrink-0 rounded-md overflow-hidden border-2 ${slots[activeSlot].active === i ? "border-default-900" : "border-transparent"}`}>
                    <img src={v.url} alt="" style={{ height: 56, aspectRatio: ratioCss, objectFit: "cover" }} />
                    <span className="block text-[10px] text-default-500 px-1 py-0.5 truncate max-w-[90px]">v{i + 1} · {v.note}</span>
                  </button>
                ))}
              </div>
            )}

            {/* 多圖（輪播／相簿） */}
            {card.maxImages > 1 && slots.length > 0 && (
              <div className="mt-3">
                <p className="text-tiny text-default-500 mb-1.5">
                  {lang === "en" ? `Set: ${slots.length} / ${card.maxImages}` : `這一組：${slots.length} / ${card.maxImages} 張`}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {slots.map((s, i) => (
                    <button key={i} onClick={() => setActiveSlot(i)}
                      className={`shrink-0 rounded-md overflow-hidden border-2 ${activeSlot === i ? "border-default-900" : "border-transparent"}`}>
                      <img src={s.versions[s.active].url} alt="" style={{ height: 64, aspectRatio: ratioCss, objectFit: "cover" }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {current && (
              <div className="mt-3 flex items-center gap-3 flex-wrap text-tiny text-default-600">
                {card.titleZone !== "none" && (
                  <>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} />{lang === "en" ? "Title overlay" : "顯示標題"}</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={darkTitle} onChange={(e) => setDarkTitle(e.target.checked)} />{lang === "en" ? "Dark text" : "黑字"}</label>
                  </>
                )}
                {card.safeZone && (
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={showSafe} onChange={(e) => setShowSafe(e.target.checked)} />{lang === "en" ? "Show platform UI areas" : "顯示平台介面遮擋區"}</label>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 右：步驟面板 */}
        <div className="space-y-5">
          {!current && (
            <section className="space-y-3">
              <Textarea
                label={lang === "en" ? "Post copy" : "文案"}
                placeholder={lang === "en" ? "Paste the copy — we turn it into an image." : "貼上文案，我們幫你轉成圖片。"}
                minRows={4} maxRows={10} value={copy} onValueChange={setCopy}
              />
              {/* 2026-09-29（CJ「選擇產品圖，要用縮圖呈現」）：同一個產品常有好幾張照片（生的、擺盤、包裝），
                  下拉選單只看得到重複的品名，分不出是哪一張——改成縮圖直接看照片挑。 */}
              <div>
                <p className="text-tiny text-default-500 mb-1.5">
                  {lang === "en" ? "Product / subject photo" : "產品照／主體照片"}
                  {product && <span className="ml-1.5 text-default-700">· {product.name}</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setProduct(null)}
                    className={`w-16 h-16 rounded-lg border-2 text-[11px] text-default-500 bg-default-50 flex items-center justify-center ${!product ? "border-default-900" : "border-default-200 hover:border-default-400"}`}>
                    {lang === "en" ? "None" : "不使用"}
                  </button>
                  {libraryPick && !products.some((p) => p.imageUrl === libraryPick.imageUrl) && (
                    <button type="button" title={libraryPick.name}
                      onClick={() => setProduct(libraryPick)}
                      className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 bg-white ${product?.imageUrl === libraryPick.imageUrl ? "border-default-900" : "border-default-200 hover:border-default-400"}`}>
                      <img src={libraryPick.imageUrl} alt={libraryPick.name} className="w-full h-full object-cover" />
                      {product?.imageUrl === libraryPick.imageUrl && <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-default-900 text-white text-[10px] leading-4 text-center">✓</span>}
                    </button>
                  )}
                  {products.map((p) => {
                    const on = product?.imageUrl === p.imageUrl;
                    return (
                      <button key={p.imageUrl} type="button" title={p.name}
                        onClick={() => setProduct({ name: p.name, imageUrl: p.imageUrl })}
                        className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 bg-white ${on ? "border-default-900" : "border-default-200 hover:border-default-400"}`}>
                        <img src={p.imageUrl} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                        {on && <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-default-900 text-white text-[10px] leading-4 text-center">✓</span>}
                      </button>
                    );
                  })}
                  {brandId && (
                    <button type="button" onClick={() => setLibraryOpen(true)}
                      className="w-16 h-16 rounded-lg border-2 border-dashed border-default-300 text-[11px] leading-tight text-default-500 bg-white hover:border-default-500 hover:text-default-700 flex items-center justify-center text-center px-1">
                      {lang === "en" ? "From library" : "從素材庫挑"}
                    </button>
                  )}
                  {brandId && (
                    <Modal isOpen={libraryOpen} onClose={() => setLibraryOpen(false)} size="4xl" scrollBehavior="inside">
                      <ModalContent>
                        <ModalHeader>{lang === "en" ? "Pick from your asset library" : "從素材庫挑一張"}</ModalHeader>
                        <ModalBody className="pb-6">
                          <BrandLibrary brandId={brandId} lang={lang === "en" ? "en" : "zh-TW"} mode="pick"
                            onPick={(it) => {
                              const picked = { name: it.source === "product" ? it.sourceLabel : (lang === "en" ? "Library" : "素材庫"), imageUrl: it.url };
                              setLibraryPick(picked); setProduct(picked); setLibraryOpen(false);
                            }} />
                        </ModalBody>
                      </ModalContent>
                    </Modal>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-tiny">
                <span className="text-default-500">{lang === "en" ? "Model" : "模型"}</span>
                <select className="border border-default-200 rounded-md px-2 py-1 bg-white" value={model} onChange={(e) => setModel(e.target.value as Model)}>
                  <option value="gpt-image-2">GPT Image 2</option>
                  <option value="nano-banana" disabled={!card.nanoBanana}>
                    Nano Banana{card.nanoBanana ? "" : (lang === "en" ? " (ratio not supported)" : "（不支援這個比例）")}
                  </option>
                </select>
              </div>
              <p className="text-[11px] text-default-400">
                {lang === "en" ? "Brand colours and imagery style are applied automatically." : "品牌色與圖像風格會自動套用（在品牌視覺頁設定）。"}
              </p>
              <Button color="primary" onPress={propose} isLoading={proposeMut.isPending} isDisabled={!brandId}>
                {directions.length ? (lang === "en" ? "Suggest again" : "重新提方向") : (lang === "en" ? "Suggest 3 directions" : "先提 3 個畫面方向")}
              </Button>

              {directions.length > 0 && (
                <div className="space-y-2">
                  {directions.map((d) => (
                    <button key={d.id} onClick={() => setPicked(d.id)}
                      className={`w-full text-left rounded-lg border p-3 transition ${picked === d.id ? "border-default-900 bg-default-50" : "border-default-200 hover:border-default-400"}`}>
                      <p className="text-small font-semibold">{d.titleZh}</p>
                      <p className="text-tiny text-default-600 mt-1 leading-relaxed">{d.sceneZh}</p>
                      <p className="text-[11px] text-default-400 mt-1">{d.paletteZh} · {d.whyZh}</p>
                    </button>
                  ))}
                  <button onClick={() => setPicked("custom")}
                    className={`w-full text-left rounded-lg border p-3 ${picked === "custom" ? "border-default-900 bg-default-50" : "border-default-200"}`}>
                    <p className="text-small font-semibold">{lang === "en" ? "Describe my own" : "自己描述"}</p>
                    {picked === "custom" && (
                      <Textarea className="mt-2" minRows={2} value={customScene} onValueChange={setCustomScene}
                        placeholder={lang === "en" ? "e.g. morning light on a wooden table…" : "例：木桌上的晨光，產品放在手邊…"} />
                    )}
                  </button>
                  <Input label={lang === "en" ? "Title on the image (editable, not drawn by AI)" : "圖上標題（可改，不會讓 AI 畫字）"}
                    value={headline} onValueChange={setHeadline} size="sm" />
                  <Button color="primary" className="w-full" onPress={() => generateFirst()} isLoading={busy} isDisabled={!scenePrompt}>
                    {lang === "en" ? "Generate this direction" : "生成這個方向"}
                  </Button>
                </div>
              )}
            </section>
          )}

          {current && (
            <section className="space-y-3">
              <p className="text-small font-semibold">{lang === "en" ? "What should change?" : "想怎麼改？"}</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_EDITS.map((q) => (
                  <button key={q} disabled={busy} onClick={() => refine(q)}
                    className="px-2.5 py-1 rounded-full text-tiny border border-default-200 hover:border-default-400 disabled:opacity-50">{q}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input size="sm" value={editText} onValueChange={setEditText}
                  placeholder={lang === "en" ? "e.g. make the product bigger" : "例：產品再大一點、背景換成戶外"}
                  onKeyDown={(e) => { if (e.key === "Enter") refine(editText); }} />
                <Button size="sm" color="primary" onPress={() => refine(editText)} isLoading={busy} isDisabled={!editText.trim()}>
                  {lang === "en" ? "Apply" : "修改"}
                </Button>
              </div>
              <Input label={lang === "en" ? "Title on the image" : "圖上標題"} value={headline} onValueChange={setHeadline} size="sm" />
              {/* 2026-10-04：圖做好後的主要出口是「跟文案一起預覽、排程」，下載退成次要。 */}
              <Button color="primary" className="w-full" onPress={openPost} isDisabled={busy || !brandId}>
                {lang === "en" ? "Preview with copy & schedule" : "圖文預覽與排程"}
              </Button>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="flat" onPress={() => downloadWithTitle(card, current.url, showTitle ? headline : "", darkTitle).catch(() => showToastGlobal("下載失敗"))}>
                  {lang === "en" ? "Download" : "下載"}（{card.width}×{card.height}）
                </Button>
                {card.maxImages > 1 && slots.length < card.maxImages && (
                  <Button size="sm" variant="bordered" onPress={addToSeries} isDisabled={busy}>
                    {lang === "en" ? "+ Next image in the set" : "＋ 再做一張同系列"}
                  </Button>
                )}
                <Button size="sm" variant="light" onPress={() => { setSlots([]); setActiveSlot(0); }}>
                  {lang === "en" ? "Change direction" : "換方向"}
                </Button>
              </div>
            </section>
          )}

          {failure && (
            <div className="rounded-lg border border-warning-300 bg-warning-50 px-3 py-2.5 space-y-2">
              <p className="text-tiny font-semibold text-warning-800">{lang === "en" ? "This image wasn't generated." : "這張圖沒有產出成功（點數已退回）。"}</p>
              {failure.msg && <p className="text-[12px] text-warning-700 whitespace-pre-line">{failure.msg}</p>}
              {failure.canNano && !current && (
                <Button size="sm" variant="bordered" onPress={() => { setModel("nano-banana"); generateFirst("nano-banana"); }}>
                  {lang === "en" ? "Try Nano Banana" : "改用 Nano Banana"}
                </Button>
              )}
            </div>
          )}

          {current && (
            <section className="space-y-2 border-t border-default-200 pt-4">
              <p className="text-small font-semibold">{lang === "en" ? "Extend to other sizes" : "延伸成其他尺寸"}</p>
              <p className="text-[11px] text-default-400 leading-relaxed">
                {lang === "en"
                  ? "Each size is regenerated natively at its own ratio from this image — never cropped."
                  : "每個尺寸都用這張當參考、在該尺寸的原生比例重新生成，不是裁切。每張各扣一次點數。"}
              </p>
              {[{ title: CHANNEL_ZH[card.channel], list: sameChannel }, { title: lang === "en" ? "Other channels" : "其他通路", list: otherChannels }]
                .filter((g) => g.list.length)
                .map((g) => (
                  <details key={g.title} open={g.list === sameChannel}>
                    <summary className="text-tiny text-default-600 cursor-pointer py-1">{g.title}（{g.list.length}）</summary>
                    <div className="grid grid-cols-1 gap-1 mt-1">
                      {g.list.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-tiny">
                          <input type="checkbox" checked={extendPick.includes(c.id)}
                            onChange={(e) => setExtendPick((p) => e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id))} />
                          <span>{g.list === otherChannels ? `${CHANNEL_ZH[c.channel]}・` : ""}{c.labelZh}</span>
                          <span className="text-default-400 tabular-nums">{c.ratio} · {c.width}×{c.height}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                ))}
              <Button size="sm" color="primary" variant="flat" onPress={runExtend} isDisabled={!extendPick.length || busy}>
                {lang === "en" ? `Generate ${extendPick.length} size(s)` : `生成 ${extendPick.length} 個尺寸`}
              </Button>
              {Object.keys(extended).length > 0 && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {cards.filter((c) => extended[c.id]).map((c) => {
                    const x = extended[c.id];
                    return (
                      <div key={c.id} className="text-tiny">
                        <div className="relative rounded-md overflow-hidden border border-default-200 bg-default-100" style={{ aspectRatio: `${c.width} / ${c.height}` }}>
                          {x.status === "ready" && x.url ? <><img src={x.url} alt="" className="absolute inset-0 w-full h-full object-cover" /><AiImageNotice overlay /></>
                            : x.status === "running" ? <div className="absolute inset-0 flex items-center justify-center"><Spinner size="sm" /></div>
                            : <div className="absolute inset-0 p-2 text-warning-700 text-[11px] overflow-hidden">{x.msg ?? "失敗"}</div>}
                        </div>
                        <p className="mt-1 text-default-600">{CHANNEL_ZH[c.channel]}・{c.labelZh}</p>
                        {x.status === "ready" && x.url && (
                          <div className="flex gap-2">
                            <button className="underline text-default-500" onClick={() => downloadWithTitle(c, x.url!, showTitle ? headline : "", darkTitle)}>
                              {lang === "en" ? "Download" : "下載"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          <Modal isOpen={postOpen} onClose={() => { if (!postBusy) setPostOpen(false); }} size="4xl" scrollBehavior="inside">
            <ModalContent>
              <ModalHeader className="flex-col items-start gap-0.5">
                <span>{lang === "en" ? "Preview with copy & schedule" : "圖文預覽與排程"}</span>
                <span className="text-tiny font-normal text-default-500">
                  {CHANNEL_ZH[card.channel] ?? card.channel}・{lang === "en" ? card.labelEn : card.labelZh}
                  {slots.length > 1 ? (lang === "en" ? ` · ${slots.length} images` : `・共 ${slots.length} 張`) : ""}
                </span>
              </ModalHeader>
              <ModalBody className="pb-6">
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px] gap-6">
                  <div className="min-w-0">
                    <PlatformMockup
                      variant={imageCardMockup(card.id, card.channel, fromOutputId ? 1 : slots.length)}
                      title="" brief=""
                      brandName={brand?.name ?? null}
                      brandLogoUrl={brand?.logoUrl ?? brand?.logo_url ?? null}
                      liveCaption={copy}
                      liveImageUrl={postImage ?? current?.url}
                      liveImageStatus="ready"
                      liveCards={!fromOutputId && slots.length > 1
                        ? slots.map((sl, i) => ({ headline: "", body: "", image: { style: null, url: i === 0 && postImage ? postImage : sl.versions[sl.active]!.url, status: "ready" } }))
                        : undefined}
                    />
                  </div>
                  <div className="space-y-4">
                    {fromOutputId ? (
                      <div className="text-tiny text-default-500 leading-relaxed">
                        {lang === "en"
                          ? "This image goes back onto the post you came from; its copy stays as written there."
                          : "這張圖會放回你帶文案過來的那一篇（文案以那一篇為準，要改請回文案頁）。"}
                        <div className="mt-1.5 flex gap-3">
                          <button className="underline underline-offset-2" onClick={() => navigate(`/run/${fromOutputId}`)}>
                            {lang === "en" ? "Open that post" : "看那一篇"}
                          </button>
                          <button className="underline underline-offset-2" onClick={() => setAsNewPost(true)}>
                            {lang === "en" ? "Save as a new post instead" : "改成另存一篇新貼文"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <Textarea label={lang === "en" ? "Post copy" : "文案"} minRows={5} maxRows={12} value={copy} onValueChange={setCopy}
                        placeholder={lang === "en" ? "The copy that goes out with this image." : "跟這張圖一起發出去的文案。"} />
                    )}
                    <div>
                      <p className="text-tiny text-default-500 mb-1.5">{lang === "en" ? "Publish time (Taipei)" : "發布時間（台北時間）"}</p>
                      <div className="flex gap-2">
                        <input type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)}
                          className="flex-1 min-w-0 border border-default-200 rounded-md px-2 py-1.5 text-small bg-white" />
                        <input type="time" value={schedTime} onChange={(e) => setSchedTime(e.target.value)}
                          className="w-[104px] border border-default-200 rounded-md px-2 py-1.5 text-small bg-white" />
                      </div>
                    </div>
                    <Button color="primary" className="w-full" onPress={() => savePost(true)} isLoading={postBusy} isDisabled={!schedDate || !schedTime}>
                      {lang === "en" ? "Schedule to calendar" : "排進行事曆"}
                    </Button>
                    {postError && (
                      <p className="rounded-md border border-warning-300 bg-warning-50 px-2.5 py-2 text-tiny text-warning-800">{postError}</p>
                    )}
                    <Button variant="flat" className="w-full" onPress={() => savePost(false)} isDisabled={postBusy}>
                      {lang === "en" ? "Save as a post, schedule later" : "先存成貼文，晚點再排"}
                    </Button>
                    {!fromOutputId && slots.length > 1 && titled && (
                      <p className="text-[11px] text-default-400">{lang === "en" ? "The title is placed on the first image only." : "標題只會放在第一張。"}</p>
                    )}
                  </div>
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>

          <p className="text-[11px] text-default-400">
            {lang === "en" ? "Spec source: " : "規格依據："}
            {/* source 可能是網址，也可能是內部文件名（漏項清單）——後者不能丟進 new URL，會整頁炸掉。 */}
            {/^https?:\/\//.test(card.source)
              ? <a className="underline" href={card.source} target="_blank" rel="noreferrer">{new URL(card.source).hostname}</a>
              : <span>{card.source}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}
