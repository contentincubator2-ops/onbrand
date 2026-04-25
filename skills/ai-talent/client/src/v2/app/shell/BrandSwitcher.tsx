/**
 * BrandSwitcher — small dropdown in the top bar.
 * Multi-tenant ready: when org context lands (Sprint 2) the same
 * component renders org → brand cascade.
 */
import React from "react";

interface Brand { id: number; name: string; }

export default function BrandSwitcher({
  brands,
  selectedId,
  onSelect,
}: {
  brands: Brand[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selected = brands.find((b) => b.id === selectedId) ?? null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 border border-mos-hair text-[0.74rem] text-mos-ink hover:bg-mos-paper transition"
      >
        <span className="w-5 h-5 rounded-full bg-mos-teal text-white text-[0.6rem] flex items-center justify-center font-display">
          {(selected?.name ?? "·")[0]}
        </span>
        <span className="max-w-[140px] truncate">{selected?.name ?? "選擇品牌"}</span>
        <span className="text-mos-soft">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[110%] z-50 min-w-[220px] bg-white border border-mos-hair shadow-lift py-1">
          {brands.length === 0 && (
            <div className="px-3 py-2 text-[0.74rem] text-mos-soft">尚無品牌</div>
          )}
          {brands.map((b) => (
            <button
              key={b.id}
              onClick={() => { onSelect(b.id); setOpen(false); }}
              className={[
                "w-full text-left px-3 py-2 text-[0.78rem] transition",
                b.id === selectedId
                  ? "bg-mos-paper text-mos-ink"
                  : "text-mos-body hover:bg-mos-paper",
              ].join(" ")}
            >
              {b.name}
            </button>
          ))}
          <div className="border-t border-mos-hair mt-1 pt-1">
            <a
              href="/onboarding"
              className="block px-3 py-2 text-[0.72rem] tracking-[0.14em] uppercase text-mos-muted hover:bg-mos-paper hover:text-mos-ink"
            >
              + 新增品牌
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
