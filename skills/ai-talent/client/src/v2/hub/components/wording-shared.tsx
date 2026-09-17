/**
 * Strategy · wording trays (preferred / swaps / banned) — shared types, hooks
 * and the OnBrand-look building blocks.
 *
 * The card frame mirrors OnBrand's InlineAssetCard (BrandsPage → CopyTabInline):
 * white card, 1px #D4D4D4 border that darkens on hover, 2px black left bar once
 * the card has content, uppercase tabular eyebrow, 14/600 title. InlineAssetCard
 * itself edits a local JSON blob with Chinese-only copy, so the look is copied
 * here rather than imported.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { Plus, X } from "lucide-react";
import type { AppRouter } from "../../../../../server/routers";
import { trpc } from "../../../lib/trpc";
import { cx } from "../ui";
import { useHubLang, useT } from "../lang";

type Outputs = inferRouterOutputs<AppRouter>;
export type WordingData = Outputs["hub"]["admin"]["wording"];
export type WordingItem = WordingData["items"][number];
export type LegalRule = WordingData["legal"]["TW"][number];
export type DraftCheck = Outputs["hub"]["rep"]["checkDraft"];
export type RepRow = Outputs["hub"]["admin"]["reps"][number];

export type Market = "TW" | "US";
export const MARKETS: Market[] = ["TW", "US"];

export const SERIF = '"Source Serif Pro", "Noto Serif TC", Georgia, serif';

// ── state hooks ─────────────────────────────────────────────────────────────

const MARKET_KEY = "hub.wording.market";

/** Market tab shared by the preferred and banned pages; defaults from the display language. */
export function useWordingMarket(): [Market, (m: Market) => void] {
  const { lang } = useHubLang();
  const [market, setMarketState] = useState<Market>(() => {
    try {
      const saved = window.localStorage.getItem(MARKET_KEY);
      if (saved === "TW" || saved === "US") return saved;
    } catch {
      /* storage unavailable */
    }
    return lang === "zh" ? "TW" : "US";
  });
  const setMarket = useCallback((m: Market) => {
    setMarketState(m);
    try {
      window.localStorage.setItem(MARKET_KEY, m);
    } catch {
      /* storage unavailable */
    }
  }, []);
  return [market, setMarket];
}

export type WordingKind = WordingItem["kind"];
export interface NewWording {
  market: Market;
  kind: WordingKind;
  term: string;
  replacement?: string;
  note?: string;
}

/** What a tray card needs to add and remove its rows. */
export interface TrayActions {
  /** Resolves true once saved; errors surface through `errorFor`. */
  add: (input: NewWording) => Promise<boolean>;
  remove: (id: number) => void;
  removingId: number | null;
  addingKind: WordingKind | null;
  /** The last add/remove error, scoped to the card whose kind it concerns. */
  errorFor: (kind: WordingKind) => { message?: string } | null;
}

/** The wording tray plus add/remove, both invalidating the tray. */
export function useWording() {
  const utils = trpc.useUtils();
  const query = trpc.hub.admin.wording.useQuery(undefined, { staleTime: 15_000 });
  const add = trpc.hub.admin.addWording.useMutation({
    onSuccess: () => utils.hub.admin.wording.invalidate(),
  });
  const remove = trpc.hub.admin.removeWording.useMutation({
    onSettled: () => utils.hub.admin.wording.invalidate(),
  });
  const [removeKind, setRemoveKind] = useState<WordingKind | null>(null);
  const items = query.data?.items;

  const actions: TrayActions = {
    add: async (input) => {
      remove.reset();
      try {
        await add.mutateAsync({
          market: input.market,
          kind: input.kind,
          term: input.term.trim(),
          replacement: input.replacement?.trim() || undefined,
          note: input.note?.trim() || undefined,
        });
        return true;
      } catch {
        return false;
      }
    },
    remove: (id) => {
      add.reset();
      setRemoveKind(items?.find((w) => w.id === id)?.kind ?? null);
      remove.mutate({ id });
    },
    removingId: remove.isPending ? remove.variables?.id ?? null : null,
    addingKind: add.isPending ? add.variables?.kind ?? null : null,
    errorFor: (kind) => (add.error && add.variables?.kind === kind ? add.error : remove.error && removeKind === kind ? remove.error : null),
  };
  return { query, actions };
}

/** The demo rep for a market: Amy (TW) / Priya (US), falling back to any rep in that market. */
export function useMarketRep(market: Market) {
  const reps = trpc.hub.admin.reps.useQuery(undefined, { staleTime: 60_000 });
  const rep = useMemo(() => {
    const list = reps.data ?? [];
    const seed = market === "TW" ? "amy" : "priya";
    return list.find((r) => r.avatarSeed === seed) ?? list.find((r) => r.market === market) ?? null;
  }, [reps.data, market]);
  return { rep, reps };
}

/** Swap the textarea to the other market's preset only while it still holds an untouched preset. */
export function usePresetText(market: Market, presets: Record<Market, string>) {
  const [text, setText] = useState(presets[market]);
  useEffect(() => {
    setText((cur) => (MARKETS.some((m) => presets[m] === cur) || !cur.trim() ? presets[market] : cur));
    // presets is a module constant at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market]);
  return [text, setText] as const;
}

export function marketName(market: Market, t: (en: string, zh: string) => string) {
  return market === "TW" ? t("Taiwan", "台灣") : t("United States", "美國");
}

// ── regex → readable ────────────────────────────────────────────────────────

/**
 * Rough human view of a policy-pack claim pattern. Optional groups go in
 * [brackets], alternatives are joined with a slash:
 * `(全台|台灣|業界)?(最便宜|最低價)(的)?` → "[全台/台灣/業界](最便宜/最低價)[的]",
 * `\b(the )?(cheapest|lowest[- ]priced?)\b` → "[the] (cheapest/lowest-priced)",
 * `#1\b|\bnumber one\b` → "#1 / number one".
 */
export function humanizePattern(source: string): string {
  const s = source
    .replace(/\(\?<?[!=](?:[^()\\]|\\.)*\)/g, "") // lookarounds
    .replace(/\\b/g, "")
    .replace(/\\s[?*+]?/g, " ")
    .replace(/\[([^\]])[^\]]*\]/g, "$1") // [- ] → -
    .replace(/\(\?:/g, "(");
  let i = 0;
  const seq = (depth: number): string => {
    const alts: string[] = [];
    let out = "";
    while (i < s.length) {
      const ch = s[i];
      if (ch === "\\") {
        out += s[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === "(") {
        i++;
        const inner = seq(depth + 1);
        if (s[i] === ")") i++;
        const optional = s[i] === "?";
        if (optional) i++;
        const body = inner.trim();
        const trail = /\s$/.test(inner) ? " " : "";
        out += (optional ? `[${body}]` : inner.includes("/") ? `(${body})` : body) + trail;
        continue;
      }
      if (ch === ")") {
        if (depth > 0) break;
        i++;
        continue;
      }
      if (ch === "|") {
        alts.push(out);
        out = "";
        i++;
        continue;
      }
      if (ch !== "?" && ch !== "^" && ch !== "$") out += ch; // priced? → priced
      i++;
    }
    alts.push(out);
    return depth === 0 ? alts.map((a) => a.replace(/\s{2,}/g, " ").trim()).join(" / ") : alts.join("/");
  };
  return seq(0) || source;
}

// ── look ────────────────────────────────────────────────────────────────────

/** OnBrand's editorial section divider (BrandsPage SectionLabel). */
export function SectionLabel({ label, counter, intro }: { label: string; counter?: string; intro?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: intro ? 6 : 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#525252", letterSpacing: "0.22em", textTransform: "uppercase" }}>{label}</span>
        <div style={{ flex: 1, height: 1, background: "#D4D4D4" }} />
        {counter ? (
          <span style={{ fontSize: 12, fontWeight: 500, color: "#525252", letterSpacing: "0.15em", fontVariantNumeric: "tabular-nums" }}>
            {counter}
          </span>
        ) : null}
      </div>
      {intro ? (
        <p style={{ fontSize: 12.5, lineHeight: 1.7, color: "#404040", fontFamily: SERIF, fontStyle: "italic", maxWidth: 700, margin: 0 }}>
          {intro}
        </p>
      ) : null}
    </div>
  );
}

/** Taiwan / United States pills with per-market counts. */
export function MarketTabs({
  market,
  onChange,
  counts,
}: {
  market: Market;
  onChange: (m: Market) => void;
  counts?: Partial<Record<Market, number>>;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Market", "市場")}>
      {MARKETS.map((m) => {
        const on = market === m;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(m)}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px]",
              on ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100",
            )}
          >
            <span className={cx("text-[11px] font-semibold tracking-wide", on ? "text-stone-300" : "text-stone-400")}>{m}</span>
            {marketName(m, t)}
            {counts?.[m] != null ? <span className={cx("tabular-nums", on ? "text-stone-300" : "text-stone-400")}>{counts[m]}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** "Live" note: tray edits reach the next post without a redeploy. */
export function LiveNote({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-stone-600">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
      {children}
    </span>
  );
}

/** InlineAssetCard look: header (icon + eyebrow + right), title, body. */
export function AssetCardFrame({
  Icon,
  eyebrow,
  right,
  title,
  hint,
  filled,
  children,
  className,
}: {
  Icon: React.ElementType;
  eyebrow?: string;
  right?: React.ReactNode;
  title: string;
  hint?: React.ReactNode;
  filled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx("relative flex min-w-0 flex-col rounded-lg border border-[#D4D4D4] bg-white transition-colors hover:border-[#171717]", className)}
      style={{ padding: "14px 16px 12px", minHeight: 196 }}
    >
      {filled ? (
        <span aria-hidden style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 2, background: "#171717", borderRadius: 2 }} />
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Icon size={12} strokeWidth={1.8} style={{ color: filled ? "#171717" : "#525252", flexShrink: 0 }} aria-hidden />
        {eyebrow ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: "#525252", letterSpacing: "0.2em", textTransform: "uppercase", fontVariantNumeric: "tabular-nums" }}>
            {eyebrow}
          </span>
        ) : null}
        <div style={{ flex: 1 }} />
        {right}
      </div>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: "#171717", lineHeight: 1.35, margin: 0, marginBottom: hint ? 2 : 8 }}>{title}</h3>
      {hint ? <p className="mb-2 text-[12px] leading-snug text-stone-500">{hint}</p> : null}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/** "3 TERMS" style counter chip for the card header. */
export function CountChip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: "#171717", letterSpacing: "0.18em", textTransform: "uppercase", fontVariantNumeric: "tabular-nums" }}>
      {children}
    </span>
  );
}

export function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12.5, color: "#525252", fontStyle: "italic", padding: "4px 0", fontFamily: SERIF }}>{children}</div>
  );
}

/** × remove, grey → red on hover. */
export function RemoveButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex shrink-0 items-center rounded p-0.5 text-[#525252] hover:text-[#B91C1C] disabled:cursor-wait disabled:opacity-40"
    >
      <X size={12} aria-hidden />
    </button>
  );
}

/** Underline-style input used in the add rows. */
export const UnderlineInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function UnderlineInput(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="text"
      {...props}
      className={cx(
        "min-w-0 border-0 border-b border-[#D4D4D4] bg-transparent px-0 py-1 text-[16px] text-[#171717] outline-none placeholder:text-stone-400 focus:border-[#171717] sm:text-[13px]",
        className,
      )}
    />
  );
});

/** "+ Add" text button in OnBrand's style. */
export function AddButton({ children, disabled, pending }: { children: React.ReactNode; disabled?: boolean; pending?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={cx(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium tracking-[0.02em]",
        disabled ? "cursor-not-allowed border-stone-200 text-stone-400" : "border-[#171717] bg-[#171717] text-white hover:bg-[#262626]",
        pending && "cursor-wait",
      )}
    >
      <Plus size={11} aria-hidden />
      {children}
    </button>
  );
}

/** Highlights each needle inside text (Latin needles case-insensitively). */
export function Highlighted({ text, needles, markClass }: { text: string; needles: string[]; markClass?: string }) {
  const parts = useMemo(() => {
    const clean = [...new Set(needles.map((n) => n.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
    if (!clean.length) return [text];
    const re = new RegExp(`(${clean.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    return text.split(re);
  }, [text, needles]);
  const lower = needles.map((n) => n.trim().toLowerCase());
  return (
    <>
      {parts.map((p, i) =>
        lower.includes(p.toLowerCase()) && p ? (
          <mark key={i} className={cx("rounded-sm bg-emerald-100 px-0.5 text-emerald-900", markClass)}>
            {p}
          </mark>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
}
