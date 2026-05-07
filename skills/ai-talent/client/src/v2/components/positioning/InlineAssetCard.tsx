/**
 * InlineAssetCard — single brand-asset card with the editor INLINE.
 *
 * Replaces the old click-to-navigate AssetCard behaviour. User edits in
 * place; values auto-save (debounced 800ms) via parent's onChange.
 *
 * AI 一鍵協助填 button calls trpc.brandKnowledge.suggestForAsset, fills
 * the editor with the suggestion (user can still edit after).
 */
import { useState } from "react";
import { trpc } from "../../../lib/trpc";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Sparkles, Plus, X } from "lucide-react";
import { Textarea, Input, Button, Tooltip } from "@heroui/react";

type Shape = "text" | "items" | "pairs";

interface Props {
  assetKey: string;
  label: string;
  icon: any;       // FontAwesome icon
  bg: string;      // tile color
  shape: Shape;
  value: any;
  onChange: (next: any) => void;
  brandId: number | null;
  readOnly?: boolean;
}

export default function InlineAssetCard({
  assetKey, label, icon, bg, shape, value, onChange, brandId, readOnly,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const suggestMut = (trpc as any).brandKnowledge?.suggestForAsset?.useMutation?.();

  const handleAI = async () => {
    if (!brandId || readOnly) return;
    setErr(null); setBusy(true);
    try {
      const r = await suggestMut?.mutateAsync?.({ brandId, assetKey: assetKey as any });
      if (!r?.ok) { setErr(r?.error || "AI 協助填寫失敗"); return; }
      onChange(r.value);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const v = value ?? {};

  return (
    <div
      className="rounded-xl border border-default-200 transition hover:shadow-sm"
      style={{ background: bg, padding: 14, minHeight: 200, display: "flex", flexDirection: "column" }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <FontAwesomeIcon icon={icon} className="text-default-600 shrink-0" />
          <span className="text-sm font-semibold text-default-800 truncate">{label}</span>
        </div>
        <Tooltip content={readOnly ? "已鎖定" : "AI 根據品牌定位 + 知識庫協助填寫"} placement="top">
          <button
            onClick={handleAI}
            disabled={!brandId || busy || readOnly}
            className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full transition shrink-0 ${
              busy ? "bg-violet-100 text-violet-700 cursor-wait"
              : readOnly ? "bg-default-100 text-default-400 cursor-not-allowed"
              : "bg-violet-50 text-violet-700 hover:bg-violet-100 cursor-pointer"
            }`}
          >
            <Sparkles size={11} className={busy ? "animate-pulse" : ""} />
            {busy ? "產生中…" : "AI 協助填"}
          </button>
        </Tooltip>
      </div>

      {err && <div className="text-[11px] text-danger mb-1.5 px-1">{err}</div>}

      <div className="flex-1" style={readOnly ? { opacity: 0.55, pointerEvents: "none" } : undefined}>
        {shape === "text" && <TextField v={v} onChange={onChange} />}
        {shape === "items" && <ListField v={v} onChange={onChange} />}
        {shape === "pairs" && <PairListField v={v} onChange={onChange} />}
      </div>
    </div>
  );
}

function TextField({ v, onChange }: { v: any; onChange: (next: any) => void }) {
  return (
    <Textarea
      size="sm"
      variant="flat"
      minRows={4}
      maxRows={10}
      placeholder="尚未填寫 — 直接輸入，或按右上「AI 協助填」"
      value={v?.text ?? ""}
      onValueChange={(s) => onChange({ ...v, text: s })}
      classNames={{ inputWrapper: "bg-white/70" }}
    />
  );
}

function ListField({ v, onChange }: { v: any; onChange: (next: any) => void }) {
  const items: string[] = Array.isArray(v?.items) ? v.items : [];
  const setItems = (next: string[]) => onChange({ ...v, items: next });
  return (
    <div className="flex flex-col gap-1.5">
      {items.length === 0 && (
        <div className="text-[11px] text-default-400 italic px-1 py-1.5">
          尚未填寫 — 點下方 + 自己輸入，或按右上「AI 協助填」
        </div>
      )}
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            size="sm"
            variant="flat"
            value={it}
            onValueChange={(s) => setItems(items.map((x, j) => j === i ? s : x))}
            placeholder={`條目 ${i + 1}`}
            classNames={{ inputWrapper: "bg-white/70" }}
          />
          <button
            onClick={() => setItems(items.filter((_, j) => j !== i))}
            className="text-default-400 hover:text-danger p-1 shrink-0"
            title="刪除"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <button
        onClick={() => setItems([...items, ""])}
        className="self-start text-[11px] text-default-500 hover:text-default-800 flex items-center gap-1 mt-1 px-1"
      >
        <Plus size={11} /> 新增條目
      </button>
    </div>
  );
}

function PairListField({ v, onChange }: { v: any; onChange: (next: any) => void }) {
  const pairs: { from: string; to: string }[] = Array.isArray(v?.pairs) ? v.pairs : [];
  const setPairs = (next: { from: string; to: string }[]) => onChange({ ...v, pairs: next });
  return (
    <div className="flex flex-col gap-1.5">
      {pairs.length === 0 && (
        <div className="text-[11px] text-default-400 italic px-1 py-1.5">
          尚未填寫 — 點下方 + 自己輸入，或按右上「AI 協助填」
        </div>
      )}
      {pairs.map((p, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            size="sm" variant="flat" placeholder="原本說的"
            value={p.from}
            onValueChange={(s) => setPairs(pairs.map((x, j) => j === i ? { ...x, from: s } : x))}
            classNames={{ inputWrapper: "bg-white/70" }}
          />
          <span className="text-default-400 shrink-0">→</span>
          <Input
            size="sm" variant="flat" placeholder="改成說的"
            value={p.to}
            onValueChange={(s) => setPairs(pairs.map((x, j) => j === i ? { ...x, to: s } : x))}
            classNames={{ inputWrapper: "bg-white/70" }}
          />
          <button
            onClick={() => setPairs(pairs.filter((_, j) => j !== i))}
            className="text-default-400 hover:text-danger p-1 shrink-0"
            title="刪除"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <button
        onClick={() => setPairs([...pairs, { from: "", to: "" }])}
        className="self-start text-[11px] text-default-500 hover:text-default-800 flex items-center gap-1 mt-1 px-1"
      >
        <Plus size={11} /> 新增對照
      </button>
    </div>
  );
}
