/**
 * ProductDetailModal — 產品定位編輯 Modal
 *
 * 顯示產品的定位摘要（標語 / 受眾 / USP），並提供完整的手動編輯欄位：
 *   - 標語 (tagline)
 *   - 受眾描述 (target audience)
 *   - 獨特賣點 (USP)
 *   - 常用詞彙 (preferred words — chip 輸入)
 *   - 禁用詞彙 (forbidden words — chip 輸入)
 *   - 重點推廣時間 (promotion periods — 日期區間清單)
 *
 * 儲存透過 product.upsert 將 positioning JSON patch 回 DB。
 */

import React, { useEffect, useState, useRef } from "react";
import { trpc } from "../../lib/trpc";
import { useLang } from "../../lib/i18n";
import { X, Plus, Trash2, RefreshCw, Sparkles } from "lucide-react";

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
    : "bg-indigo-50 border-indigo-200 text-indigo-700";

  return (
    <div>
      <label className="block text-xs font-semibold text-neutral-600 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {chips.map((c, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${chipBg}`}
          >
            {c}
            <button onClick={() => remove(i)} className="opacity-60 hover:opacity-100">
              <X size={10} />
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
          placeholder={placeholder ?? "輸入後按 Enter 新增"}
          className="flex-1 text-sm px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-indigo-400"
        />
        <button
          onClick={add}
          disabled={!input.trim()}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-40 transition"
        >
          <Plus size={12} />
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
        className="text-sm px-2.5 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-indigo-400"
      />
      <input
        type="date"
        value={period.startDate}
        onChange={(e) => onChange({ ...period, startDate: e.target.value })}
        className="text-xs px-2 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-indigo-400"
      />
      <input
        type="date"
        value={period.endDate}
        onChange={(e) => onChange({ ...period, endDate: e.target.value })}
        className="text-xs px-2 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-indigo-400"
      />
      <button onClick={onRemove} className="p-1.5 text-neutral-400 hover:text-red-500 transition">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────
export default function ProductDetailModal({ productId, brandId, onClose, onReposition }: Props) {
  const { lang } = useLang();
  const en = lang === "en";

  // Fetch product
  const productQ = (trpc as any).product?.get?.useQuery?.(
    { id: productId },
    { enabled: !!productId, refetchOnWindowFocus: false },
  );
  const product: any = productQ?.data ?? null;

  // Upsert mutation
  const upsertMut = (trpc as any).product?.upsert?.useMutation?.({
    onSuccess: () => {
      productQ?.refetch?.();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  // Editable state
  const [tagline, setTagline] = useState("");
  const [audience, setAudience] = useState("");
  const [usp, setUsp] = useState("");
  const [preferred, setPreferred] = useState<string[]>([]);
  const [forbidden, setForbidden] = useState<string[]>([]);
  const [periods, setPeriods] = useState<PromotionPeriod[]>([]);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
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
    setTagline(pos.tagline ?? "");
    setAudience(pos.targetAudience ?? pos.audience?.primary ?? "");
    setUsp(pos.usp ?? pos.differentiation?.functional ?? "");
    setPreferred(Array.isArray(pos.preferredWords) ? pos.preferredWords : []);
    setForbidden(Array.isArray(pos.forbiddenWords) ? pos.forbiddenWords : []);
    setPeriods(Array.isArray(pos.promotionPeriods) ? pos.promotionPeriods : []);
  }, [product]);

  // Mark dirty when user edits
  const mark = () => { if (initialised.current) setDirty(true); };

  const handleSave = () => {
    if (!product) return;
    const existingPos: ProductPositioning = (() => {
      try {
        return typeof product.positioning === "string"
          ? JSON.parse(product.positioning)
          : (product.positioning ?? {});
      } catch { return {}; }
    })();
    // Merge: preserve AI-generated fields, overwrite the user-edited ones
    const newPos: ProductPositioning = {
      ...existingPos,
      tagline: tagline.trim() || undefined,
      targetAudience: audience.trim() || undefined,
      usp: usp.trim() || undefined,
      preferredWords: preferred.length > 0 ? preferred : undefined,
      forbiddenWords: forbidden.length > 0 ? forbidden : undefined,
      promotionPeriods: periods.length > 0 ? periods : undefined,
    };
    upsertMut?.mutate?.({
      id: productId,
      brandId,
      slug: product.slug ?? `product-${productId}`,
      name: product.name,
      positioning: newPos,
    });
    setDirty(false);
  };

  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-neutral-100 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-0.5">
              {en ? "PRODUCT" : "產品"}
            </p>
            <h2 className="text-xl font-bold text-neutral-900">
              {productQ?.isLoading ? "…" : product?.name ?? "—"}
            </h2>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => onReposition(productId)}
              title={en ? "Re-run positioning" : "重新執行定位"}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition"
            >
              <RefreshCw size={12} />
              {en ? "Re-position" : "重新定位"}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* AI Positioning Summary */}
          {(tagline || audience || usp) && (
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-xl p-4 border border-indigo-100">
              <div className="flex items-center gap-1.5 mb-3">
                <Sparkles size={13} className="text-indigo-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">
                  {en ? "AI Positioning Summary" : "AI 定位摘要"}
                </span>
              </div>
              <div className="grid gap-2">
                {tagline && (
                  <div>
                    <span className="text-[9px] font-semibold uppercase text-indigo-400 tracking-wider">
                      {en ? "Tagline" : "標語"}
                    </span>
                    <p className="text-sm font-semibold text-neutral-900 mt-0.5">{tagline}</p>
                  </div>
                )}
                {usp && (
                  <div>
                    <span className="text-[9px] font-semibold uppercase text-indigo-400 tracking-wider">USP</span>
                    <p className="text-sm text-neutral-700 mt-0.5">{usp}</p>
                  </div>
                )}
                {audience && (
                  <div>
                    <span className="text-[9px] font-semibold uppercase text-indigo-400 tracking-wider">
                      {en ? "Audience" : "目標受眾"}
                    </span>
                    <p className="text-sm text-neutral-600 mt-0.5">{audience}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Editable Section ── */}
          <div className="space-y-5">
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider border-b border-neutral-100 pb-2">
              {en ? "Edit & Refine" : "手動編輯與精修"}
            </p>

            {/* Tagline */}
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                {en ? "Tagline / Slogan" : "標語 / Slogan"}
              </label>
              <input
                value={tagline}
                onChange={(e) => { setTagline(e.target.value); mark(); }}
                placeholder={en ? "e.g. Fresh from the farm, direct to your table" : "例：直送農場新鮮，品牌最短距離"}
                className="w-full text-sm px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:border-indigo-400"
              />
            </div>

            {/* Audience */}
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                {en ? "Target Audience" : "目標受眾"}
              </label>
              <textarea
                value={audience}
                onChange={(e) => { setAudience(e.target.value); mark(); }}
                placeholder={en ? "Who is this product for?" : "這個產品是給誰的？描述主要受眾的特徵、需求和痛點"}
                rows={3}
                className="w-full text-sm px-3 py-2 border border-neutral-200 rounded-lg resize-none focus:outline-none focus:border-indigo-400"
              />
            </div>

            {/* USP */}
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                {en ? "Unique Selling Point (USP)" : "獨特賣點 (USP)"}
              </label>
              <textarea
                value={usp}
                onChange={(e) => { setUsp(e.target.value); mark(); }}
                placeholder={en ? "What makes this product uniquely valuable?" : "這個產品跟競品最大的差異是什麼？為什麼值得選擇？"}
                rows={3}
                className="w-full text-sm px-3 py-2 border border-neutral-200 rounded-lg resize-none focus:outline-none focus:border-indigo-400"
              />
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
                  className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <Plus size={11} /> {en ? "Add period" : "新增時間"}
                </button>
              </div>
              {periods.length === 0 ? (
                <p className="text-xs text-neutral-400 italic">
                  {en ? "No promotion periods set — add key dates like holidays or launch windows." : "尚未設定推廣時間，可加入節日、上市期、特賣季等重要時段。"}
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[9px] font-semibold uppercase text-neutral-400 tracking-wider px-0.5">
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
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-neutral-200 text-sm text-neutral-600 hover:border-neutral-400 transition"
          >
            {en ? "Cancel" : "取消"}
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty && !saved || upsertMut?.isPending}
            className="flex-1 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50"
            style={{ background: saved ? "#10B981" : "#171717", color: "white" }}
          >
            {upsertMut?.isPending
              ? (en ? "Saving…" : "儲存中…")
              : saved
                ? (en ? "Saved ✓" : "已儲存 ✓")
                : (en ? "Save changes" : "儲存修改")}
          </button>
        </div>
      </div>
    </div>
  );
}
