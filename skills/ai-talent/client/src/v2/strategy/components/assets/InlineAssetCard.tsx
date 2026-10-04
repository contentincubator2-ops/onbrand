/**
 * InlineAssetCard — single brand-asset card with the editor INLINE.
 *
 * 2026-05-11 (CJ「文字和知識的設計風格，也改得跟定位一樣」):
 * editorial 4A discipline mirroring PositioningGrid's AssetCard:
 * white card, 1px neutral border that darkens on hover, tabular
 * eyebrow code, sans title, no pastel background, filled state
 * shown as a 2px black left-edge bar + FILLED chip. Inputs use a
 * neutral underline style instead of grey-fill boxes so the card
 * reads like an editorial form, not a UI dump.
 *
 * Per-card AI button removed (CJ 2026-05-07: 全局只要一個按鈕). Bulk
 * auto-fill is handled by parent CopyTabInline.
 */
import type { ComponentType } from "react";
import { tr } from "../../../../lib/i18n";
import { AddIcon, CloseIcon, GenerateIcon } from "../../../platform/components/icons";

type Shape = "text" | "items" | "pairs";

interface Props {
  assetKey: string;
  label: string;
  /** 可省略：文字／視覺頁的 modal 標題已經有卡名，傳 null 表示不畫圖示。
   *  2026-09-30：兩頁都傳 null，這裡卻無條件 <Icon/>，點任何一張卡整頁崩潰。 */
  Icon?: ComponentType<any> | null;
  bg: string;      // legacy — ignored under the new 4A discipline
  shape: Shape;
  value: any;
  onChange: (next: any) => void;
  brandId: number | null;
  readOnly?: boolean;
  /** True while the bulk-suggest run is filling this specific card. */
  filling?: boolean;
}

/** Detect whether the card has any meaningful user content. */
function isFilled(value: any, shape: Shape): boolean {
  if (!value) return false;
  if (shape === "text") return typeof value.text === "string" && value.text.trim().length > 0;
  if (shape === "items") {
    return Array.isArray(value.items)
      && value.items.some((x: any) => typeof x === "string" && x.trim().length > 0);
  }
  if (shape === "pairs") {
    return Array.isArray(value.pairs)
      && value.pairs.some((p: any) => p?.from?.trim() && p?.to?.trim());
  }
  return false;
}

export default function InlineAssetCard({
  assetKey: _ak, label, Icon, shape, value, onChange, readOnly, filling,
}: Props) {
  const v = value ?? {};
  const filled = isFilled(v, shape);

  // Split "01.1 標題" → eyebrow "01.1" + title "標題" (mirrors AssetCard).
  const m = label.match(/^(\S+)\s+(.+)$/);
  const eyebrow = m ? m[1] : "";
  const titleText = m ? m[2] : label;

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #D4D4D4",
        borderRadius: 8,
        padding: "14px 16px 12px",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        minHeight: 196,
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#171717"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#D4D4D4"; }}
    >
      {/* Filled accent — 2px black left edge bar */}
      {filled && (
        <span
          aria-hidden
          style={{
            position: "absolute", left: 0, top: 12, bottom: 12, width: 2,
            background: "#171717", borderRadius: 2,
          }}
        />
      )}

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {Icon && <Icon size={12} strokeWidth={1.8} style={{ color: filled ? "#171717" : "#525252", flexShrink: 0 }} />}
        {eyebrow && (
          <span style={{
            fontSize: 12, fontWeight: 700, color: "#525252",
            letterSpacing: "0.2em", textTransform: "uppercase",
            fontVariantNumeric: "tabular-nums",
          }}>
            {eyebrow}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {filling ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 12, fontWeight: 600, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "#171717",
          }}>
            <GenerateIcon size={10} className="animate-pulse" /> Writing
          </span>
        ) : filled && (
          <span style={{
            fontSize: 12, fontWeight: 600, color: "#171717",
            letterSpacing: "0.18em", textTransform: "uppercase",
          }}>
            Filled
          </span>
        )}
      </div>

      <h3 style={{
        fontSize: 14, fontWeight: 600, color: "#171717",
        lineHeight: 1.35, margin: 0, marginBottom: 8,
      }}>
        {titleText}
      </h3>

      <div
        style={{
          flex: 1,
          opacity: readOnly ? 0.55 : 1,
          pointerEvents: readOnly ? "none" : "auto",
        }}
      >
        {shape === "text" && <TextField v={v} onChange={onChange} />}
        {shape === "items" && <ListField v={v} onChange={onChange} />}
        {shape === "pairs" && <PairListField v={v} onChange={onChange} />}
      </div>
    </div>
  );
}

/** Editorial textarea — borderless, underline-style focus, serif body. */
function TextField({ v, onChange }: { v: any; onChange: (next: any) => void }) {
  return (
    <textarea
      placeholder={tr("Click to type, or press “Auto-fill” above to let AI do it", "點此輸入，或按上方「自動填寫」交給 AI")}
      value={v?.text ?? ""}
      onChange={(e) => onChange({ ...v, text: e.target.value })}
      rows={5}
      style={{
        width: "100%",
        background: "transparent",
        border: "none",
        outline: "none",
        resize: "vertical",
        fontSize: 13,
        lineHeight: 1.65,
        color: "#171717",
        fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
        padding: "6px 0",
        borderTop: "1px solid #D4D4D4",
      }}
      onFocus={(e) => { e.target.style.borderTopColor = "#171717"; }}
      onBlur={(e) => { e.target.style.borderTopColor = "#D4D4D4"; }}
    />
  );
}

function ListField({ v, onChange }: { v: any; onChange: (next: any) => void }) {
  const items: string[] = Array.isArray(v?.items) ? v.items : [];
  const setItems = (next: string[]) => onChange({ ...v, items: next });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {items.length === 0 && (
        <div style={{
          fontSize: 12.5, color: "#525252", fontStyle: "italic",
          padding: "4px 0",
          fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
        }}>
          {tr("Not filled in yet", "尚未填寫")}
        </div>
      )}
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid #D4D4D4", padding: "4px 0" }}>
          <span style={{
            fontSize: 12, color: "#525252", fontFamily: "system-ui",
            letterSpacing: "0.1em", minWidth: 18, textAlign: "right",
          }}>
            {String(i + 1).padStart(2, "0")}
          </span>
          <input
            type="text"
            value={it}
            onChange={(e) => setItems(items.map((x, j) => j === i ? e.target.value : x))}
            placeholder={tr(`Item ${i + 1}`, `條目 ${i + 1}`)}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              fontSize: 13, color: "#171717", padding: "2px 0",
            }}
          />
          <button
            onClick={() => setItems(items.filter((_, j) => j !== i))}
            title={tr("Delete", "刪除")}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: "#525252", padding: 2, display: "flex",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#B91C1C"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#525252"; }}
          >
            <CloseIcon size={12} />
          </button>
        </div>
      ))}
      <button
        onClick={() => setItems([...items, ""])}
        style={{
          alignSelf: "flex-start", marginTop: 6, padding: "3px 0",
          fontSize: 12, color: "#525252", background: "transparent",
          border: "none", cursor: "pointer", display: "flex",
          alignItems: "center", gap: 4, letterSpacing: "0.05em",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#171717"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#525252"; }}
      >
        <AddIcon size={11} /> {tr("Add item", "新增條目")}
      </button>
    </div>
  );
}

function PairListField({ v, onChange }: { v: any; onChange: (next: any) => void }) {
  const pairs: { from: string; to: string }[] = Array.isArray(v?.pairs) ? v.pairs : [];
  const setPairs = (next: { from: string; to: string }[]) => onChange({ ...v, pairs: next });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {pairs.length === 0 && (
        <div style={{
          fontSize: 12.5, color: "#525252", fontStyle: "italic",
          padding: "4px 0",
          fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
        }}>
          {tr("Not filled in yet", "尚未填寫")}
        </div>
      )}
      {pairs.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid #D4D4D4", padding: "4px 0" }}>
          <input
            type="text" placeholder={tr("Originally said", "原本說的")}
            value={p.from}
            onChange={(e) => setPairs(pairs.map((x, j) => j === i ? { ...x, from: e.target.value } : x))}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#404040", padding: "2px 0" }}
          />
          <span style={{ color: "#525252", fontSize: 12, flexShrink: 0 }}>→</span>
          <input
            type="text" placeholder={tr("Change to", "改成說的")}
            value={p.to}
            onChange={(e) => setPairs(pairs.map((x, j) => j === i ? { ...x, to: e.target.value } : x))}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#171717", fontWeight: 500, padding: "2px 0" }}
          />
          <button
            onClick={() => setPairs(pairs.filter((_, j) => j !== i))}
            title={tr("Delete", "刪除")}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#525252", padding: 2, display: "flex" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#B91C1C"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#525252"; }}
          >
            <CloseIcon size={12} />
          </button>
        </div>
      ))}
      <button
        onClick={() => setPairs([...pairs, { from: "", to: "" }])}
        style={{
          alignSelf: "flex-start", marginTop: 6, padding: "3px 0",
          fontSize: 12, color: "#525252", background: "transparent",
          border: "none", cursor: "pointer", display: "flex",
          alignItems: "center", gap: 4, letterSpacing: "0.05em",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#171717"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#525252"; }}
      >
        <AddIcon size={11} /> {tr("Add pair", "新增對照")}
      </button>
    </div>
  );
}
