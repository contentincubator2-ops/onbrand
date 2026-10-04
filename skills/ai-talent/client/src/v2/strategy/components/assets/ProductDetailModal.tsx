/**
 * ProductDetailModal — 產品定位編輯 Modal
 *
 * 顯示產品的定位摘要（標語 / 受眾 / USP），並提供完整的手動編輯欄位：
 *   - 標語 (tagline)
 *   - 受眾描述 (target audience)
 *   - 獨特賣點
 *   - 常用詞彙 (preferred words — chip 輸入)
 *   - 禁用詞彙 (forbidden words — chip 輸入)
 *   - 重點推廣時間 (promotion periods — 日期區間清單)
 *
 * 儲存透過 product.upsert 將 positioning JSON patch 回 DB。
 */

import React, { useEffect, useState, useRef } from "react";
import { trpc } from "../../../../lib/trpc";
import { useLang, tr } from "../../../../lib/i18n";
import { AddIcon, CloseIcon, DeleteIcon, GenerateIcon, RegenerateIcon, CheckIcon, UploadIcon } from "../../../platform/components/icons";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { TASK_MODAL_CLASSNAMES, TASK_MODAL_HEADER } from "../../../platform/components/taskModalStyle";
import AssetPhotoGallery from "./AssetPhotoGallery";
import ProductSceneModal from "./ProductSceneModal";

interface PromotionPeriod {
  label: string;      // e.g. "母親節" "年終特賣"
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
}

interface ProductPositioning {
  tagline?: string;
  targetAudience?: string;
  usp?: string;
  preferredWords?: string[];
  forbiddenWords?: string[];
  promotionPeriods?: PromotionPeriod[];
  // other AI-generated fields passthrough
  [key: string]: any;
}

interface Props {
  productId: number;
  brandId: number;
  onClose: () => void;
  onReposition: (productId: number) => void;
  onImageUpdated?: () => void;
  /** 2026-10-04：從這個視窗直接開「上傳定位」。 */
  onUpload?: (productId: number) => void;
}

/** 把 positioning 裡各種形狀的值（字串／字串陣列／物件陣列）攤成可讀文字。 */
function showVal(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v.map((x) => (x && typeof x === "object"
      ? Object.values(x).filter((y) => typeof y === "string" && y).join(" · ")
      : String(x))).join("\n");
  }
  if (typeof v === "object") return Object.values(v).filter((y) => typeof y === "string" && y).join(" · ");
  return String(v);
}

/** 一格可編輯的固定欄位。text＝多行文字；list＝一行一項；其他形狀（競品表等）只讀。 */
function toText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v.join("\n");
  return showVal(v);
}
function FieldEditor({ field, en, edits, setEdits }: {
  field: { path: string; label: string; shape: string; value: any };
  en: boolean;
  edits: Record<string, string>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const editable = field.shape === "text" || field.shape === "list";
  const shown = edits[field.path] ?? toText(field.value);
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-zinc-400 tracking-wider">
        {field.label}
        {field.shape === "list" && <span className="ml-1 font-normal">{en ? "(one per line)" : "（一行一項）"}</span>}
      </span>
      {editable ? (
        <textarea
          value={shown}
          rows={Math.min(8, Math.max(2, shown.split("\n").length + (shown.length > 60 ? 1 : 0)))}
          onChange={(e) => { const v = e.target.value; setEdits((prev) => ({ ...prev, [field.path]: v })); }}
          className="w-full text-sm px-3 py-2 mt-0.5 bg-default-100 rounded-2xl resize-none border border-transparent focus:outline-none focus:bg-white focus:border-zinc-400"
        />
      ) : (
        <p className="text-sm text-neutral-800 mt-0.5 whitespace-pre-wrap">{shown}</p>
      )}
    </label>
  );
}

// ── Chip Input ────────────────────────────────────────────────────────────────
function ChipInput({
  label, chips, onChange, placeholder, color = "indigo",
}: {
  label: string;
  chips: string[];
  onChange: (chips: string[]) => void;
  placeholder?: string;
  color?: "indigo" | "red";
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const v = input.trim();
    if (!v || chips.includes(v)) { setInput(""); return; }
    onChange([...chips, v]);
    setInput("");
  };

  const remove = (i: number) => onChange(chips.filter((_, idx) => idx !== i));

  const chipBg = color === "red"
    ? "bg-red-50 border-red-200 text-red-700"
    : "bg-zinc-50 border-zinc-200 text-zinc-700";

  return (
    <div>
      <label className="block text-xs font-semibold text-neutral-600 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {chips.map((c, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[12px] font-medium ${chipBg}`}
          >
            {c}
            <button onClick={() => remove(i)} className="opacity-60 hover:opacity-100">
              <CloseIcon size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
          }}
          placeholder={placeholder ?? tr("Type and press Enter to add", "輸入後按 Enter 新增")}
          className="flex-1 text-sm px-3 py-1.5 border border-transparent bg-default-100 rounded-2xl focus:outline-none focus:bg-white focus:border-zinc-400"
        />
        <button
          onClick={add}
          disabled={!input.trim()}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-40 transition"
        >
          <AddIcon size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Promotion Period Row ──────────────────────────────────────────────────────
function PeriodRow({
  period,
  onChange,
  onRemove,
  lang,
}: {
  period: PromotionPeriod;
  onChange: (p: PromotionPeriod) => void;
  onRemove: () => void;
  lang: "zh-TW" | "en";
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
      <input
        value={period.label}
        onChange={(e) => onChange({ ...period, label: e.target.value })}
        placeholder={lang === "en" ? "Label (e.g. Mother's Day)" : "名稱（如：母親節）"}
        className="text-sm px-2.5 py-1.5 border border-transparent bg-default-100 rounded-2xl focus:outline-none focus:bg-white focus:border-zinc-400"
      />
      <input
        type="date"
        value={period.startDate}
        onChange={(e) => onChange({ ...period, startDate: e.target.value })}
        className="text-xs px-2 py-1.5 border border-transparent bg-default-100 rounded-2xl focus:outline-none focus:bg-white focus:border-zinc-400"
      />
      <input
        type="date"
        value={period.endDate}
        onChange={(e) => onChange({ ...period, endDate: e.target.value })}
        className="text-xs px-2 py-1.5 border border-transparent bg-default-100 rounded-2xl focus:outline-none focus:bg-white focus:border-zinc-400"
      />
      <button onClick={onRemove} className="p-1.5 text-neutral-400 hover:text-red-500 transition">
        <DeleteIcon size={13} />
      </button>
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────
export default function ProductDetailModal({ productId, brandId, onClose, onReposition, onImageUpdated, onUpload }: Props) {
  const { lang } = useLang();
  const en = lang === "en";
  const [sceneOpen, setSceneOpen] = useState(false);

  // Fetch product
  const productQ = (trpc as any).product?.get?.useQuery(
    { id: productId },
    { enabled: !!productId, refetchOnWindowFocus: false },
  );
  const product: any = productQ?.data ?? null;
  const productPositioning: ProductPositioning = (() => {
    try {
      return typeof product?.positioning === "string"
        ? JSON.parse(product.positioning)
        : (product?.positioning ?? {});
    } catch { return {}; }
  })();

  // 2026-10-04（CJ「貼完解析成功、增加很多欄位後，產品定位的內容並沒有太多改變、欄位也都一樣」）：
  // 這個視窗以前只畫六個寫死的欄位（標語／受眾／賣點／詞彙…），上傳文件寫進去的
  // 二十幾格（核心功能、痛點、競品…）與自訂卡片根本沒地方顯示。改成把引擎讀得到的欄位
  // 連同目前的值全部列出來。
  const coverageQ = (trpc as any).positioningDocs?.coverage?.useQuery(
    { scope: "product", scopeId: productId },
    { enabled: !!productId, refetchOnWindowFocus: false },
  );
  const filledFields: { path: string; label: string; shape: string; value: any }[] = coverageQ?.data?.filled ?? [];
  const customSegments: { id: string; title: string; fields: { key: string; label: string; value: string }[] }[] =
    coverageQ?.data?.customSegments ?? [];
  const missingFields: { path: string; label: string; shape: string }[] = coverageQ?.data?.missing ?? [];
  const missingCount = missingFields.length;

  // Upsert mutation
  const upsertMut = (trpc as any).product?.upsert?.useMutation?.({
  });
  // Editable state
  // 2026-10-04：標語／受眾／賣點不再有各自寫死的輸入框——它們就是下方「AI 讀到的定位」
  // 裡的 core.zhTagline／audience.primary／competition.uniqueUsp，統一在那邊編輯。
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [segEdits, setSegEdits] = useState<Record<string, Record<string, string>>>({});
  const [showMissing, setShowMissing] = useState(false);
  const [preferred, setPreferred] = useState<string[]>([]);
  const [forbidden, setForbidden] = useState<string[]>([]);
  const [periods, setPeriods] = useState<PromotionPeriod[]>([]);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [listsDirty, setListsDirty] = useState(false);
  const initialised = useRef(false);

  // Hydrate from product data
  useEffect(() => {
    if (!product || initialised.current) return;
    initialised.current = true;
    const pos: ProductPositioning = (() => {
      try {
        return typeof product.positioning === "string"
          ? JSON.parse(product.positioning)
          : (product.positioning ?? {});
      } catch { return {}; }
    })();
    setPreferred(Array.isArray(pos.preferredWords) ? pos.preferredWords : []);
    setForbidden(Array.isArray(pos.forbiddenWords) ? pos.forbiddenWords : []);
    setPeriods(Array.isArray(pos.promotionPeriods) ? pos.promotionPeriods : []);
  }, [product]);

  // Mark dirty when user edits
  const mark = () => { if (initialised.current) { setDirty(true); setListsDirty(true); } };

  const fieldUpdateMut = (trpc as any).positioningDocs?.updateFields?.useMutation?.();
  const segUpdateMut = (trpc as any).positioningDocs?.updateCustomSegment?.useMutation?.();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!product) return;
    setSaving(true); setSaveError(null);
    try {
      // 1) 詞彙／推廣時段走既有 upsert（它會整包寫回 positioning，所以必須排在欄位更新之前，
      //    否則會用載入當下的舊快照蓋掉剛改的欄位）。
      if (listsDirty) {
        const existingPos: ProductPositioning = (() => {
          try {
            return typeof product.positioning === "string"
              ? JSON.parse(product.positioning)
              : (product.positioning ?? {});
          } catch { return {}; }
        })();
        await upsertMut?.mutateAsync?.({
          id: productId,
          brandId,
          slug: product.slug ?? `product-${productId}`,
          name: product.name,
          positioning: {
            ...existingPos,
            preferredWords: preferred.length > 0 ? preferred : undefined,
            forbiddenWords: forbidden.length > 0 ? forbidden : undefined,
            promotionPeriods: periods.length > 0 ? periods : undefined,
          },
        });
      }
      // 2) 固定欄位逐格更新（server 重新讀最新的 positioning 再寫，不會蓋掉別人）。
      const shapeOf = new Map<string, string>([...filledFields, ...missingFields].map((f) => [f.path, f.shape]));
      const changed = Object.entries(edits).map(([path, text]) => ({
        path,
        value: shapeOf.get(path) === "list"
          ? text.split("\n").map((x) => x.trim()).filter(Boolean)
          : text,
      }));
      if (changed.length > 0) await fieldUpdateMut?.mutateAsync?.({ scope: "product", scopeId: productId, fields: changed });
      // 3) 自訂卡片
      for (const seg of customSegments) {
        const e = segEdits[seg.id];
        if (!e) continue;
        await segUpdateMut?.mutateAsync?.({
          scope: "product", scopeId: productId, segmentId: seg.id, title: seg.title,
          fields: seg.fields.map((f) => ({ label: f.label, value: (e[f.key] ?? f.value).trim() || f.value })),
        });
      }
      setEdits({}); setSegEdits({}); setListsDirty(false); setDirty(false);
      await Promise.all([productQ?.refetch?.(), coverageQ?.refetch?.()]);
      onImageUpdated?.();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setSaveError(String(e?.message ?? "儲存失敗"));
    } finally {
      setSaving(false);
    }
  };

  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <Modal isOpen onClose={onClose} size="2xl" scrollBehavior="inside" backdrop="blur" classNames={TASK_MODAL_CLASSNAMES}>
      <ModalContent>
        <ModalHeader className={TASK_MODAL_HEADER}>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-widest text-neutral-400">
              {en ? "PRODUCT" : "產品"}
            </p>
            <p className="text-[18px] text-neutral-900 truncate font-bold">
              {productQ?.isLoading ? "…" : product?.name ?? "—"}
            </p>
          </div>
        </ModalHeader>

        {/* Body — scrollable */}
        <ModalBody className="px-6 py-4 gap-6">

          {/* 引擎讀得到的定位：上傳／貼上／AI 產出寫進來的欄位全列出來 */}
          <div className="rounded-2xl bg-default-100 p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1.5">
                <GenerateIcon size={13} className="text-zinc-500" />
                <span className="text-[12px] font-bold uppercase tracking-widest text-zinc-600">
                  {en ? "What the AI reads" : "AI 讀到的定位"}
                </span>
                {filledFields.length > 0 && (
                  <span className="text-[12px] text-neutral-400">
                    {en ? `${filledFields.length} fields` : `${filledFields.length} 格`}
                  </span>
                )}
              </div>
              {onUpload && (
                <button
                  type="button"
                  onClick={() => onUpload(productId)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white text-neutral-800 hover:bg-neutral-50 shadow-sm"
                >
                  <UploadIcon size={12} />{en ? "Upload / paste" : "上傳／貼上定位"}
                </button>
              )}
            </div>
            {filledFields.length === 0 && customSegments.length === 0 && !showMissing ? (
              <p className="text-xs text-neutral-500">
                {en ? "Nothing written yet. Upload a document, paste text, or re-run positioning." : "還沒有任何定位內容。可以上傳文件、貼上文字，或按「重新定位」讓 AI 產出。"}
              </p>
            ) : null}
            <div className="grid gap-3">
              {filledFields.map((f) => (
                <FieldEditor key={f.path} field={f} en={en} edits={edits} setEdits={setEdits} />
              ))}
              {customSegments.map((seg) => (
                <div key={seg.id} className="rounded-xl bg-white p-3">
                  <span className="text-[12px] font-bold text-neutral-700">{seg.title}</span>
                  <div className="mt-1.5 grid gap-2">
                    {seg.fields.map((fl) => (
                      <label key={fl.key} className="block">
                        <span className="text-[12px] font-semibold text-zinc-400">{fl.label}</span>
                        <textarea
                          rows={2}
                          value={segEdits[seg.id]?.[fl.key] ?? fl.value}
                          onChange={(e) => {
                            const v = e.target.value;
                            setSegEdits((prev) => ({ ...prev, [seg.id]: { ...(prev[seg.id] ?? {}), [fl.key]: v } }));
                          }}
                          className="w-full text-sm px-3 py-2 mt-0.5 bg-default-100 rounded-2xl resize-none border border-transparent focus:outline-none focus:bg-white focus:border-zinc-400"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {showMissing && missingFields.map((f) => (
                <FieldEditor key={f.path} field={{ ...f, value: undefined }} en={en} edits={edits} setEdits={setEdits} />
              ))}
            </div>
            {missingCount > 0 && (
              <button
                type="button"
                onClick={() => setShowMissing((v) => !v)}
                className="mt-3 text-[12px] font-medium text-neutral-500 hover:text-neutral-900"
              >
                {showMissing
                  ? (en ? "Hide empty fields" : "收起還沒內容的欄位")
                  : (en ? `+ Fill in ${missingCount} empty fields` : `＋ 補充另外 ${missingCount} 個空欄位`)}
              </button>
            )}
          </div>

          {/* ── Editable Section ── */}
          <div className="space-y-5">
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider border-b border-neutral-100 pb-2">
              {en ? "Edit & Refine" : "手動編輯與精修"}
            </p>

            {/*
              2026-09-10 (CJ「允許用戶上傳照片到品牌或個別產品。我們的 AI 不用
              再從網站爬產品照片了」)：貼網址改成真的上傳。主圖仍然鏡射進
              positioning.imageUrl（server 端做，見 assetPhotos.ts），所以
              onImageUpdated 這個既有 callback 還是要接著呼叫，讓外層的
              「產品縮圖」跟著刷新。
            */}
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                {en ? "Product photos" : "產品照片"}
              </label>
              <AssetPhotoGallery
                brandId={brandId}
                scope="product"
                scopeId={productId}
                scopeLabel={en ? "this product" : "這個產品"}
                onChange={() => { productQ?.refetch?.(); onImageUpdated?.(); }}
              />
              {/* 2026-09-21：產品保真生圖的入口——這條 API 之前沒有任何畫面在用。 */}
              <button
                type="button"
                onClick={() => setSceneOpen(true)}
                className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-neutral-400 text-neutral-800"
              >
                {en ? "Make a scene from these photos" : "用這些照片做場景圖"}
              </button>
              {sceneOpen && (
                <ProductSceneModal brandId={brandId} productId={productId} onClose={() => setSceneOpen(false)} />
              )}
            </div>

            {/* Preferred words */}
            <ChipInput
              label={en ? "Preferred Words / Phrases" : "常用詞彙"}
              chips={preferred}
              onChange={(c) => { setPreferred(c); mark(); }}
              placeholder={en ? "Add word → Enter" : "輸入詞彙後按 Enter"}
              color="indigo"
            />

            {/* Forbidden words */}
            <ChipInput
              label={en ? "Forbidden Words / Phrases" : "禁用詞彙"}
              chips={forbidden}
              onChange={(c) => { setForbidden(c); mark(); }}
              placeholder={en ? "Add forbidden word → Enter" : "輸入禁用詞後按 Enter"}
              color="red"
            />

            {/* Promotion periods */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-neutral-600">
                  {en ? "Key Promotion Periods" : "重點推廣時間"}
                </label>
                <button
                  onClick={() => {
                    setPeriods([...periods, { label: "", startDate: "", endDate: "" }]);
                    mark();
                  }}
                  className="text-[12px] font-medium text-zinc-600 hover:text-zinc-800 flex items-center gap-1"
                >
                  <AddIcon size={11} /> {en ? "Add period" : "新增時間"}
                </button>
              </div>
              {periods.length === 0 ? (
                <p className="text-xs text-neutral-400 italic">
                  {en ? "No promotion periods set — add key dates like holidays or launch windows." : "尚未設定推廣時間，可加入節日、上市期、特賣季等重要時段。"}
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[12px] font-semibold uppercase text-neutral-400 tracking-wider px-0.5">
                    <span>{en ? "Label" : "名稱"}</span>
                    <span>{en ? "Start" : "開始"}</span>
                    <span>{en ? "End" : "結束"}</span>
                    <span />
                  </div>
                  {periods.map((p, i) => (
                    <PeriodRow
                      key={i}
                      period={p}
                      lang={lang}
                      onChange={(updated) => {
                        const next = [...periods];
                        next[i] = updated;
                        setPeriods(next);
                        mark();
                      }}
                      onRemove={() => {
                        setPeriods(periods.filter((_, idx) => idx !== i));
                        mark();
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </ModalBody>

        {saveError && <p className="px-6 pb-1 text-xs text-danger-600">{saveError}</p>}
        <ModalFooter className="justify-between items-center">
          <button
            onClick={() => onReposition(productId)}
            title={en ? "Re-run positioning" : "重新執行定位"}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-neutral-500 hover:text-neutral-900 px-1"
          >
            <RegenerateIcon size={12} />
            {en ? "Re-position" : "重新定位"}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="h-11 px-5 rounded-full text-sm text-neutral-600 hover:bg-neutral-100 transition"
            >
              {en ? "Cancel" : "取消"}
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={(!dirty && !saved && Object.keys(edits).length === 0 && Object.keys(segEdits).length === 0) || saving}
              className="h-11 px-6 rounded-full text-sm font-semibold transition disabled:opacity-50"
              style={{ background: saved ? "#10B981" : "#171717", color: "white" }}
            >
              {saving
                ? (en ? "Saving…" : "儲存中…")
                : saved
                  ? <span className="inline-flex items-center gap-1"><CheckIcon size={11} />{en ? "Saved" : "已儲存"}</span>
                  : (en ? "Save changes" : "儲存修改")}
            </button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
