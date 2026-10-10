/**
 * 圖片卡生成後的工具列（2026-10-04 CJ「生成後的多張圖，要讓用戶有機會可以替換任何一張的底圖，
 * 底圖的樣式也要給多點選擇，右側改成 Tesla 的 icon UI」）。
 *
 * 一排圖示磚（底圖／樣式／標題／修改／版本／尺寸），點一個在下方展開那個工具的選項，
 * 選項本身也是圖示磚。這個檔只管畫面與選擇；生成、扣點、存版本都在 ImageCardPage。
 */
import React, { useEffect, useRef, useState } from "react";
import { Button, Input, Spinner } from "@heroui/react";
import { Icon, type IconName } from "../../../platform/components/icons";
import { showToastGlobal } from "../../../platform/components/Toast";
import { uploadBrandPhoto, IMAGE_ACCEPT } from "../../../strategy/lib/uploadBrandPhoto";

export type ToolId = "base" | "style" | "title" | "edit" | "versions" | "sizes";

const TOOLS: Array<{ id: ToolId; icon: IconName; zh: string; en: string }> = [
  { id: "base", icon: "image", zh: "底圖", en: "Background" },
  { id: "style", icon: "generate", zh: "樣式", en: "Style" },
  { id: "title", icon: "toolTitle", zh: "標題", en: "Title" },
  { id: "edit", icon: "toolEdit", zh: "修改", en: "Edit" },
  { id: "versions", icon: "toolVersions", zh: "版本", en: "Versions" },
  { id: "sizes", icon: "toolSizes", zh: "尺寸", en: "Sizes" },
];

/** 畫面樣式 id → 圖示（清單本身來自伺服器，沒配到圖示的用相機）。 */
const STYLE_ICON: Record<string, IconName> = {
  photo: "styleCamera", fresh: "styleFresh", minimal: "styleMinimal", illustration: "styleIllustration",
  watercolor: "styleWatercolor", render3d: "style3d", film: "styleFilm", brandblock: "styleBlock",
};

const tile = (on: boolean) =>
  `rounded-lg border-2 flex flex-col items-center justify-center gap-1 transition ${on ? "border-default-900 text-default-900" : "border-default-200 text-default-500 hover:border-default-400"}`;

export function ToolTabs({ lang, tool, setTool, badges }: {
  lang: string; tool: ToolId | null; setTool: (t: ToolId | null) => void; badges?: Partial<Record<ToolId, number>>;
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5" role="tablist">
      {TOOLS.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={tool === t.id} onClick={() => setTool(tool === t.id ? null : t.id)}
          className={`relative h-16 ${tile(tool === t.id)}`}>
          <Icon name={t.icon} size={18} />
          <span className="text-[10px] leading-none">{lang === "en" ? t.en : t.zh}</span>
          {!!badges?.[t.id] && (
            <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-default-900 text-white text-[10px] leading-4 text-center tabular-nums">{badges[t.id]}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── 風格參考圖 ─────────────────────────────────────────────────────────

/** 一次最多幾張（伺服器 imageCards.MAX_STYLE_REFS 的鏡像；伺服器才是準的）。 */
export const MAX_STYLE_REFS = 3;
/** 樣式面板裡「照我的參考圖」這個選項的 id（不是伺服器的樣式 id）。 */
export const STYLE_FROM_REFS = "__refs";

/**
 * 風格參考圖（2026-10-10 CJ「大家的習慣，就是自己上傳幾張圖給 AI，請 AI 學那張圖」）：
 * 上傳 1–3 張喜歡的圖，AI 照它的畫法、配色與構圖來畫（CJ「就是要學得很像啊」），只把內容換成文案與方向。
 * 上傳走素材庫同一支（asset_photos），所以之後也能在素材庫找到。
 */
export function StyleRefStrip({ lang, brandId, refs, setRefs, disabled }: {
  lang: string; brandId: number | null; refs: string[]; setRefs: (r: string[]) => void; disabled?: boolean;
}) {
  const en = lang === "en";
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const room = MAX_STYLE_REFS - refs.length;

  async function upload(files: FileList | null) {
    const picked = Array.from(files ?? []).filter((x) => x.type.startsWith("image/") || !x.type);
    if (!picked.length || !brandId) return;
    if (picked.length > room) showToastGlobal(en ? `Up to ${MAX_STYLE_REFS} reference images.` : `風格參考圖最多 ${MAX_STYLE_REFS} 張。`);
    setUploading(true);
    const next = [...refs];
    try {
      for (const f of picked.slice(0, room)) {
        const up = await uploadBrandPhoto(brandId, f);
        if (!next.includes(up.url)) next.push(up.url);
      }
    } catch (e: any) {
      showToastGlobal(String(e?.message ?? e).slice(0, 200), "error");
    } finally {
      setRefs(next);
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <p className="text-tiny text-default-500 mb-1.5">
        {en ? "Style reference images (optional)" : "風格參考圖（選填）"}
        {refs.length > 0 && <span className="ml-1.5 text-default-700 tabular-nums">· {refs.length}/{MAX_STYLE_REFS}</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {refs.map((u) => (
          <div key={u} className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-default-900 bg-white">
            <img src={u} alt="" className="w-full h-full object-cover" />
            <button type="button" disabled={disabled} onClick={() => setRefs(refs.filter((x) => x !== u))}
              title={en ? "Remove" : "移除"} aria-label={en ? "Remove reference image" : "移除這張參考圖"}
              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-default-900 text-white flex items-center justify-center">
              <Icon name="close" size={9} />
            </button>
          </div>
        ))}
        {room > 0 && brandId && (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || disabled}
            title={en ? "Upload images whose look you like" : "上傳你喜歡的圖，讓 AI 學它的畫風"}
            className="w-16 h-16 rounded-lg border-2 border-dashed border-default-300 bg-white text-default-500 hover:border-default-500 hover:text-default-800 flex flex-col items-center justify-center gap-1 disabled:opacity-50">
            {uploading ? <Spinner size="sm" /> : <Icon name="upload" size={18} />}
            <span className="text-[10px] leading-none">{en ? "Upload" : "上傳"}</span>
          </button>
        )}
        <input ref={fileRef} type="file" hidden multiple accept={IMAGE_ACCEPT} onChange={(e) => void upload(e.target.files)} />
      </div>
      <p className="text-[11px] text-default-400 leading-relaxed mt-1.5">
        {en
          ? "AI follows these closely — medium, colours, layout — and swaps in your own content. Use images you have the right to use."
          : "AI 會照這幾張的畫法、配色與構圖來畫，內容換成你的。請用你有權使用的圖。"}
      </p>
    </div>
  );
}

// ── 樣式 ───────────────────────────────────────────────────────────────

export interface StyleInfo { id: string; labelZh: string; labelEn: string }

export function StylePanel({ lang, styles, selected, onSelect, scope, setScope, slideNo, total, busy, onApply, brandId, refs, setRefs }: {
  lang: string; styles: StyleInfo[]; selected: string | null; onSelect: (id: string | null) => void;
  scope: "slide" | "all"; setScope: (s: "slide" | "all") => void;
  slideNo: number; total: number; busy: boolean; onApply: () => void;
  brandId: number | null; refs: string[]; setRefs: (r: string[]) => void;
}) {
  const en = lang === "en";
  const eff = total > 1 ? scope : "slide";
  const fromRefs = selected === STYLE_FROM_REFS;
  // 參考圖全移掉了，「照我的參考圖」就不能再是選中的樣式。
  useEffect(() => { if (fromRefs && !refs.length) onSelect(null); }, [fromRefs, refs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-2.5">
      <StyleRefStrip lang={lang} brandId={brandId} refs={refs} disabled={busy}
        setRefs={(r) => { setRefs(r); if (r.length) onSelect(STYLE_FROM_REFS); }} />
      {refs.length > 0 && (
        <button type="button" role="radio" aria-checked={fromRefs} onClick={() => onSelect(STYLE_FROM_REFS)}
          className={`w-full h-10 flex-row gap-2 ${tile(fromRefs)}`}>
          <Icon name="images" size={16} />
          <span className="text-tiny leading-none">{en ? "Follow my reference images" : "照我的參考圖"}</span>
        </button>
      )}
      {total > 1 && (
        <div className="flex gap-1.5 text-tiny">
          {([["slide", en ? `This slide (${slideNo})` : `這一張（第 ${slideNo} 張）`], ["all", en ? `Whole set (${total})` : `整組（${total} 張）`]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setScope(k)}
              className={`px-2.5 py-1 rounded-full border ${scope === k ? "border-default-900 bg-default-900 text-white" : "border-default-200 text-default-600 hover:border-default-400"}`}>{label}</button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-4 gap-1.5" role="radiogroup">
        {styles.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={selected === s.id} onClick={() => onSelect(s.id)} className={`h-16 ${tile(selected === s.id)}`}>
            <Icon name={STYLE_ICON[s.id] ?? "styleCamera"} size={18} />
            <span className="text-[10px] leading-none">{en ? s.labelEn : s.labelZh}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-default-400 leading-relaxed">
        {eff === "all"
          ? (en ? `Regenerates all ${total} images in this style — one charge per image. The set stays consistent.` : `整組 ${total} 張都用這個樣式重新生成，每張各扣一次點數；整組風格會一致。`)
          : total > 1
            ? (en ? "Only this slide changes, so it will look different from the others." : "只改這一張，會和其他張的樣子不一樣。")
            : (en ? "Regenerates this image in the chosen style — one charge." : "用選的樣式重新生成這一張，扣一次點數。")}
      </p>
      <Button size="sm" color="primary" className="w-full" onPress={onApply} isDisabled={!selected || busy} isLoading={busy}>
        {fromRefs ? (en ? "Redraw in my reference style" : "照參考圖重畫") : (en ? "Apply style" : "套用樣式")}
      </Button>
    </div>
  );
}

// ── 底圖 ───────────────────────────────────────────────────────────────

export interface PickedPhoto { name: string; url: string }
type BaseSub = "scene" | "photo" | "colour" | "product" | null;

const NEUTRALS = ["#FFFFFF", "#F5EFE6", "#E8F0FE", "#111111"];

export function BasePanel({ lang, brandId, busy, products, colours, canKeepScene, pending, setPending, fit, setFit, onOpenLibrary, onScene, onUsePhoto, onSolid }: {
  lang: string; brandId: number | null; busy: boolean;
  products: Array<{ name: string; imageUrl: string }>;
  colours: string[];
  /** 這一張有沒有「要畫什麼」的描述——沒有的話（原圖直接用過）換場景要用戶自己寫。 */
  canKeepScene: boolean;
  pending: PickedPhoto | null; setPending: (p: PickedPhoto | null) => void;
  fit: "cover" | "contain"; setFit: (f: "cover" | "contain") => void;
  onOpenLibrary: () => void;
  onScene: (text: string) => void;
  onUsePhoto: (mode: "asis" | "ai") => void;
  onSolid: (color: string, color2?: string) => void;
}) {
  const en = lang === "en";
  const [sub, setSub] = useState<BaseSub>(null);
  const [sceneText, setSceneText] = useState("");
  const [colour, setColour] = useState("#FFFFFF");
  const [gradient, setGradient] = useState(false);
  const [colour2, setColour2] = useState("#F5EFE6");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 從素材庫挑好（由頁面設定 pending）就切到「怎麼用這張」。
  useEffect(() => { if (pending) setSub("photo"); }, [pending]);

  async function upload(files: FileList | null) {
    const f = Array.from(files ?? []).find((x) => x.type.startsWith("image/") || !x.type);
    if (!f || !brandId) return;
    setUploading(true);
    try {
      const up = await uploadBrandPhoto(brandId, f);
      setPending({ name: f.name, url: up.url });
    } catch (e: any) {
      showToastGlobal(String(e?.message ?? e).slice(0, 200), "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const sw = [...colours, ...NEUTRALS.filter((c) => !colours.includes(c))];
  const tiles: Array<{ id: string; icon: IconName; label: string; on: boolean; click: () => void; show?: boolean }> = [
    { id: "scene", icon: "generate", label: en ? "New scene" : "換場景", on: sub === "scene", click: () => setSub("scene") },
    { id: "upload", icon: "upload", label: en ? "Upload" : "上傳", on: false, click: () => fileRef.current?.click() },
    { id: "library", icon: "images", label: en ? "Library" : "素材庫", on: false, click: onOpenLibrary },
    { id: "colour", icon: "toolFill", label: en ? "Colour" : "純色底", on: sub === "colour", click: () => setSub("colour") },
    { id: "product", icon: "image", label: en ? "Product" : "產品照", on: sub === "product", click: () => setSub("product"), show: products.length > 0 },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-1.5">
        {tiles.filter((t) => t.show !== false).map((t) => (
          <button key={t.id} type="button" onClick={t.click} disabled={busy || (t.id === "upload" && uploading)} className={`h-16 disabled:opacity-50 ${tile(t.on)}`}>
            {t.id === "upload" && uploading ? <Spinner size="sm" /> : <Icon name={t.icon} size={18} />}
            <span className="text-[10px] leading-none">{t.label}</span>
          </button>
        ))}
      </div>
      <input ref={fileRef} type="file" hidden accept={IMAGE_ACCEPT} onChange={(e) => void upload(e.target.files)} />

      {sub === "scene" && (
        <div className="space-y-2">
          <Input size="sm" value={sceneText} onValueChange={setSceneText}
            label={en ? "What scene do you want? (optional)" : "想要什麼場景？（選填）"}
            placeholder={en ? "e.g. a sunny street corner, people queuing" : "例：陽光下的街角，有人排隊"} />
          <Button size="sm" color="primary" className="w-full" isDisabled={busy || (!canKeepScene && !sceneText.trim())} isLoading={busy} onPress={() => onScene(sceneText)}>
            {en ? "Redraw this slide with a new scene" : "換個場景重畫這一張"}
          </Button>
          <p className="text-[11px] text-default-400">
            {canKeepScene
              ? (en ? "Leave it empty and AI picks a different scene. One charge." : "不填就讓 AI 另想一個場景。扣一次點數。")
              : (en ? "Describe the scene — this slide has no AI scene yet. One charge." : "這一張目前沒有 AI 的場景描述，請寫一下想要的場景。扣一次點數。")}
          </p>
        </div>
      )}

      {sub === "product" && (
        <div className="flex flex-wrap gap-2">
          {products.map((p) => (
            <button key={p.imageUrl} type="button" title={p.name} onClick={() => setPending({ name: p.name, url: p.imageUrl })}
              className={`w-14 h-14 rounded-lg overflow-hidden border-2 ${pending?.url === p.imageUrl ? "border-default-900" : "border-default-200 hover:border-default-400"}`}>
              <img src={p.imageUrl} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {sub === "photo" && pending && (
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <img src={pending.url} alt="" className="w-14 h-14 rounded-lg object-cover border border-default-200" />
            <p className="text-tiny text-default-600 truncate">{pending.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-tiny">
            {([["cover", en ? "Fill (crops edges)" : "填滿（會裁邊）"], ["contain", en ? "Keep whole (blurred fill)" : "完整保留（補糊化底）"]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFit(k)}
                className={`px-2.5 py-1 rounded-full border ${fit === k ? "border-default-900 bg-default-900 text-white" : "border-default-200 text-default-600 hover:border-default-400"}`}>{label}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" color="primary" isDisabled={busy} isLoading={busy} onPress={() => onUsePhoto("asis")}>
              {en ? "Use as is (free)" : "原圖直接用（免點數）"}
            </Button>
            <Button size="sm" variant="bordered" isDisabled={busy} onPress={() => onUsePhoto("ai")}>
              {en ? "AI recompose" : "AI 重新構圖（扣點）"}
            </Button>
          </div>
        </div>
      )}

      {sub === "colour" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {sw.map((c) => (
              <button key={c} type="button" aria-label={c} onClick={() => setColour(c)}
                className={`w-8 h-8 rounded-full border-2 ${colour === c ? "border-default-900" : "border-default-200"}`} style={{ backgroundColor: c }} />
            ))}
            <input type="color" value={colour} onChange={(e) => setColour(e.target.value.toUpperCase())} aria-label={en ? "Custom colour" : "自選顏色"}
              className="w-8 h-8 rounded-full border border-default-200 bg-white p-0.5" />
          </div>
          <label className="flex items-center gap-2 text-tiny text-default-600">
            <input type="checkbox" checked={gradient} onChange={(e) => setGradient(e.target.checked)} />
            {en ? "Add a second colour (gradient, top to bottom)" : "加第二個顏色（由上到下漸層）"}
            {gradient && <input type="color" value={colour2} onChange={(e) => setColour2(e.target.value.toUpperCase())} className="w-7 h-7 rounded-full border border-default-200 bg-white p-0.5" />}
          </label>
          <Button size="sm" color="primary" className="w-full" isDisabled={busy} isLoading={busy} onPress={() => onSolid(colour, gradient ? colour2 : undefined)}>
            {en ? "Use this background (free)" : "用這個底色（免點數）"}
          </Button>
        </div>
      )}
    </div>
  );
}
