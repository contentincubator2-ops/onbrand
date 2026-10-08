/**
 * CampaignPostAdvanced — 活動貼文視窗裡展開的「進階修改」。
 *
 * 2026-10-08（CJ「按了進階修改後，直接在該彈跳視窗展開進階修改可以有的選項」，不要跳到成品頁）：
 *   · 換人重寫：主筆＋REWRITE_AGENTS。寫過的稿原樣切回（伺服器留在 item.writerDrafts），
 *     沒寫過的以主筆的稿為底重寫——跟成品頁主筆桌同一套規則。
 *   · 換圖：自己寫／從本文產生圖片指令、選模型（兩模型政策，不自動換）、用真實產品照、切回之前的圖。
 *   · 排程在視窗下方本來就有，這裡不再放一份。
 * 存檔、產圖都由 CampaignPostModal 做（同一條路），這裡只管選項。
 */
import React from "react";
import { Button, Spinner, Textarea } from "@heroui/react";
import { trpc } from "../../../../lib/trpc";
import { showToastGlobal } from "../../../platform/components/Toast";
import { toastWithUpgrade } from "../../../platform/lib/upgradeToast";
import { REWRITE_AGENTS } from "../../pages/run/runModel";
import { RUN_IMAGE_MODEL_OPTIONS } from "../../lib/runImageModelOptions";
import { findValidRunProductSelection, type RunProductImage } from "../../lib/runProductSelection";
import { toComplianceInput } from "../RegulationComplianceNote";

export type AdvancedWriter = { key: string; name: string; title?: string; agentId?: number };
export type AdvancedImageOpts = { prompt?: string; model?: string; subjectImageUrl?: string };

export default function CampaignPostAdvanced({
  en, outputId, locator, variant, caption, brandId, scope, lead, imgBusy, imgArgs,
  flushTyping, applyCaption, makeImage, onOpenFull,
}: {
  en: boolean;
  outputId: number;
  locator: Record<string, unknown>;
  variant: any;
  caption: string;
  brandId: number;
  /** refineCaption 的範圍：改寫要守這張卡的字數與形式。 */
  scope: { brandId?: number; eventId?: number; taskId?: string };
  lead: AdvancedWriter;
  imgBusy: boolean;
  /** image.promptFromCaption 要的通路與尺寸（跟視窗的「做圖」同一份）。 */
  imgArgs: Record<string, unknown>;
  flushTyping: () => Promise<void>;
  applyCaption: (text: string, extra?: Record<string, unknown>) => Promise<void>;
  makeImage: (opts?: AdvancedImageOpts) => Promise<void>;
  onOpenFull: () => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const utils = (trpc as any).useUtils();

  // ── 換人重寫 ──
  const refineMut = (trpc as any).quickTask.refineCaption.useMutation();
  const drafts: Record<string, { caption?: string }> = variant?.writerDrafts ?? {};
  const activeKey: string = variant?.activeWriter ?? "lead";
  const writers = React.useMemo(() => [
    { ...lead, pitch: L("原本寫這篇的人", "Wrote the original"), instruction: undefined as string | undefined },
    ...REWRITE_AGENTS.filter((a) => a.agentId !== lead.agentId).map((a) => ({
      key: String(a.agentId), name: a.name, agentId: a.agentId,
      title: en ? a.titleEn : a.title, pitch: en ? a.styleEn : a.style,
      instruction: en ? a.instructionEn : a.instruction,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [en, lead.key, lead.name, lead.title, lead.agentId]);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const pickWriter = async (key: string) => {
    const w = writers.find((x) => x.key === key);
    if (!w || busyKey || key === activeKey) return;
    const writer: AdvancedWriter = { key: w.key, name: w.name, title: w.title || undefined, agentId: w.agentId };
    setBusyKey(key);
    try {
      await flushTyping();
      const cached = drafts[key]?.caption;
      if (typeof cached === "string" && cached.trim()) { await applyCaption(cached, { writer }); return; }
      const base = activeKey === "lead" ? caption : (drafts.lead?.caption ?? caption);
      if (!base.trim()) { showToastGlobal(L("還沒有文案可以改寫。", "Nothing to rewrite yet.")); return; }
      const r = await refineMut.mutateAsync({
        currentCaption: base,
        userFeedback: w.instruction ?? L("請用你的寫法重寫這篇。", "Rewrite this in your own style."),
        agentId: w.agentId, agentName: w.name, agentTitle: w.title,
        ...scope,
      });
      if (!r?.ok || !r?.rewritten) { showToastGlobal(L("這次沒改成，再試一次。", "The rewrite didn't come back — try again.")); return; }
      await applyCaption(String(r.rewritten), {
        writer, ...(r.regulationCompliance ? { regulationCompliance: toComplianceInput(r.regulationCompliance) } : {}),
      });
    } catch (e: any) {
      toastWithUpgrade(e?.message ?? L("改寫失敗", "Rewrite failed"), en);
    } finally {
      setBusyKey(null);
    }
  };

  // ── 換圖 ──
  const [prompt, setPrompt] = React.useState("");
  const [model, setModel] = React.useState<string>(RUN_IMAGE_MODEL_OPTIONS[0].value);
  const productsQ = (trpc as any).media.listProductImages.useQuery(
    { brandId }, { enabled: brandId > 0, refetchOnWindowFocus: false, staleTime: 60_000 },
  );
  const products: RunProductImage[] = (productsQ.data as any)?.products ?? [];
  const [useProduct, setUseProduct] = React.useState(false);
  const [picked, setPicked] = React.useState<RunProductImage | null>(null);
  const validProduct = findValidRunProductSelection(picked, products);
  const promptMut = (trpc as any).image.promptFromCaption.useMutation({
    onSuccess: (p: any) => {
      const s = String(p?.promptZh || p?.prompt || "").trim();
      if (s) setPrompt(s); else showToastGlobal(L("這次沒產生出圖片指令。", "No image prompt came back."));
    },
    onError: (e: any) => toastWithUpgrade(e?.message ?? L("沒有成功，再試一次", "Didn't work — try again"), en),
  });
  const suggestPrompt = () => {
    if (!caption.trim()) { showToastGlobal(L("先寫好本文，才知道要畫什麼。", "Write the post first.")); return; }
    promptMut.mutate({
      brandId, caption: caption.slice(0, 6000), ...imgArgs,
      ...(variant?.imageStyle ? { imageStyle: String(variant.imageStyle).slice(0, 3000) } : {}),
      ...(useProduct && validProduct ? { product: { name: validProduct.name.slice(0, 200), imageUrl: validProduct.imageUrl.slice(0, 500) } } : {}),
    });
  };
  const draw = () => {
    if (useProduct && !validProduct) { showToastGlobal(L("先選一張產品照。", "Pick a product photo first.")); return; }
    void makeImage({
      prompt: prompt.trim() || undefined, model,
      ...(useProduct && validProduct ? { subjectImageUrl: validProduct.imageUrl } : {}),
    });
  };
  const selectVersionMut = (trpc as any).output.selectVariantImageVersion.useMutation({
    onSuccess: () => {
      utils?.output?.getById?.invalidate?.({ id: outputId });
      utils?.campaign?.itemThumbs?.invalidate?.();
      showToastGlobal(L("已切回這張圖（不用重新生成）。", "Switched back (no regeneration)."));
    },
    onError: (e: any) => showToastGlobal(L(`切換圖片失敗：${e?.message ?? ""}`, `Couldn't switch image: ${e?.message ?? ""}`)),
  });
  const versions: Array<{ url: string; modelId?: string; promptZh?: string }> = Array.isArray(variant?.imageVersions) ? variant.imageVersions : [];
  const currentUrl: string | undefined = variant?.imageUrl ?? variant?.image?.url ?? undefined;

  const heading = "text-small font-semibold text-foreground";
  return (
    <div className="rounded-2xl border border-default-200 p-3 flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <p className={heading}>{L("換人重寫", "Rewrite by another writer")}</p>
        <div className="grid grid-cols-2 gap-2">
          {writers.map((w) => {
            const active = w.key === activeKey;
            const written = !active && !!drafts[w.key]?.caption?.trim();
            return (
              <button key={w.key} type="button" disabled={!!busyKey || active} onClick={() => { void pickWriter(w.key); }}
                className={`text-left rounded-xl border px-3 py-2 transition ${active ? "border-foreground bg-default-100" : "border-default-200 hover:border-default-400"} ${busyKey && busyKey !== w.key ? "opacity-50" : ""}`}>
                <span className="flex items-center gap-1.5 text-small font-medium text-foreground">
                  <span className="truncate">{w.name}</span>
                  {busyKey === w.key && <Spinner size="sm" />}
                  {active && <span className="text-tiny font-normal text-default-500 shrink-0">{L("目前", "Current")}</span>}
                  {written && <span className="text-tiny font-normal text-default-500 shrink-0">{L("寫過", "Drafted")}</span>}
                </span>
                <span className="block text-tiny text-default-500 truncate">{[w.title, w.pitch].filter(Boolean).join("・")}</span>
              </button>
            );
          })}
        </div>
        <p className="text-tiny text-default-500">{L("每位寫過的稿都留著，點回去就是原樣，不會重寫。", "Every writer's draft is kept — switching back restores it as it was.")}</p>
      </section>

      <section className="flex flex-col gap-2">
        <p className={heading}>{L("換圖", "Change the image")}</p>
        <Textarea
          aria-label={L("圖片指令", "Image prompt")} value={prompt} onValueChange={setPrompt}
          minRows={2} maxRows={8} variant="bordered" radius="lg"
          placeholder={L("想要的畫面（留白＝照本文自動想）", "Describe the picture (blank = worked out from the post)")}
        />
        <div className="flex gap-2 items-center flex-wrap">
          <Button size="sm" radius="lg" variant="flat" isLoading={promptMut.isPending} isDisabled={imgBusy} onPress={suggestPrompt}>
            {L("從本文產生指令", "Draft a prompt from the post")}
          </Button>
          <select value={model} onChange={(e) => setModel(e.target.value)} aria-label={L("生圖模型", "Image model")}
            className="h-8 rounded-lg border-2 border-default-200 bg-transparent px-2 text-small min-w-0 max-w-full">
            {RUN_IMAGE_MODEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{en ? o.en : o.zh}</option>)}
          </select>
        </div>
        {products.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-small">
              <input type="checkbox" checked={useProduct}
                onChange={(e) => { setUseProduct(e.target.checked); if (e.target.checked && !validProduct) setPicked(products[0] ?? null); }} />
              {L("使用真實產品照", "Use a real product photo")}
            </label>
            {useProduct && (
              <div className="flex gap-2 flex-wrap items-center">
                {products.slice(0, 16).map((p) => (
                  <button key={p.imageUrl} type="button" title={p.name} onClick={() => setPicked(p)}
                    className={`w-12 h-12 rounded-md overflow-hidden border-2 transition ${validProduct?.imageUrl === p.imageUrl ? "border-foreground" : "border-transparent hover:border-default-300"}`}>
                    <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                  </button>
                ))}
                {validProduct && <span className="text-tiny text-default-600 truncate max-w-[160px]">{validProduct.name}</span>}
              </div>
            )}
          </div>
        )}
        <Button size="sm" radius="lg" className="self-start bg-foreground text-background font-semibold" isLoading={imgBusy} isDisabled={promptMut.isPending} onPress={draw}>
          {currentUrl ? L("照這些設定重做圖", "Redo the image with these settings") : L("照這些設定做圖", "Make the image with these settings")}
        </Button>
        {versions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-tiny text-default-500">{L("之前的圖：點一下切回去，不用重新生成。", "Earlier images — click to switch back, no regeneration.")}</p>
            <div className="flex gap-2 flex-wrap">
              {currentUrl && (
                <div className="relative w-16 h-16 rounded-md overflow-hidden border-2 border-foreground">
                  <img src={currentUrl} alt="" className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 inset-x-0 bg-foreground text-background text-[9px] leading-[14px] text-center">{L("使用中", "In use")}</span>
                </div>
              )}
              {versions.map((v) => (
                <button key={v.url} type="button" disabled={selectVersionMut.isPending || imgBusy}
                  title={`${v.modelId ?? ""}${v.promptZh ? `\n${v.promptZh}` : ""}`.slice(0, 200)}
                  onClick={() => selectVersionMut.mutate({ id: outputId, ...locator, imageUrl: v.url })}
                  className="w-16 h-16 rounded-md overflow-hidden border-2 border-transparent hover:border-foreground transition disabled:opacity-50">
                  <img src={v.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <p className="text-tiny text-default-500">
        {L("排程在視窗下方「排在」。其他功能在", "Scheduling is at the bottom of this window. Everything else is in the ")}
        <button type="button" className="underline hover:text-foreground" onClick={onOpenFull}>{L("完整編輯頁", "full editor")}</button>
        {L("。", ".")}
      </p>
    </div>
  );
}
