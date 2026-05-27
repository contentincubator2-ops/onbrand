/**
 * taskContextResolver — given a task's `derive` / `contextSources`
 * metadata + a resolved scope.active payload, returns:
 *
 *   1. A flat map of derived values per input key (for pre-fill).
 *   2. A list of human-readable "我會用 X 來跑" chips for the modal strip.
 *
 * 2026-05-11 (CJ「系統性解決 modal 重複問問題」). Keep this small +
 * dependency-free so the same shape can also run on the server when we
 * eventually move the derive step backend-side.
 */

export interface ResolverInputDerive {
  from: string[];
  mode: "auto" | "confirm" | "ask";
  shape?: "auto" | "list-names" | "summary";
}

export interface ResolvedDerive {
  /** First non-empty value found along the from[] paths, shaped to string. */
  text: string;
  /** Which path actually provided the value (for telemetry / debug). */
  source: string;
  /** Original raw value (so callers needing structure can use it too). */
  raw: any;
}

/** Walk a dot-path against a context object. Tolerates missing nodes. */
export function pickByPath(ctx: any, path: string): any {
  if (!ctx || !path) return undefined;
  return path.split(".").reduce((acc: any, key: string) => {
    if (acc == null) return acc;
    return acc[key];
  }, ctx);
}

/** Heuristic shaper — turn raw context value into a short string. */
export function shapeValue(raw: any, shape?: string): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) {
    // Array of strings
    if (raw.every((x) => typeof x === "string")) {
      return raw.filter((x) => x.trim()).join("、");
    }
    // Array of {name | label | dim | ...}
    const names = raw.map((x) => x?.name ?? x?.label ?? x?.dim ?? null).filter(Boolean);
    if (names.length > 0) {
      if (shape === "list-names") return names.join("、");
      return names.slice(0, 6).join("、") + (names.length > 6 ? ` +${names.length - 6}` : "");
    }
    return "";
  }
  if (typeof raw === "object") {
    // Try common summary keys
    const candidates = [
      raw.summary, raw.text, raw.statement, raw.value,
      raw.primary, raw.coreStatement, raw.zhTagline,
      raw.why, raw.singleMindedProposition,
    ].filter((x: any) => typeof x === "string" && x.trim());
    if (candidates.length > 0) return candidates[0]!.trim();
    // Fall back to JSON stringify (rare)
    return JSON.stringify(raw).slice(0, 200);
  }
  return "";
}

/** Resolve a single input's derive spec. Returns null if nothing found. */
export function resolveDerive(
  ctx: any,
  derive: ResolverInputDerive | undefined,
): ResolvedDerive | null {
  if (!derive) return null;
  for (const path of derive.from) {
    const raw = pickByPath(ctx, path);
    const text = shapeValue(raw, derive.shape);
    if (text) return { text, source: path, raw };
  }
  return null;
}

/** Resolve all inputs for a task. */
export function resolveTaskInputs(
  ctx: any,
  inputs: Array<{ key: string; derive?: ResolverInputDerive }>,
): Record<string, ResolvedDerive | null> {
  const out: Record<string, ResolvedDerive | null> = {};
  for (const it of inputs) {
    out[it.key] = resolveDerive(ctx, it.derive);
  }
  return out;
}

/**
 * Convert `contextSources` paths into human-readable chips for the
 * "我會用 X 來跑這個任務" confirmation strip. Filters out paths that
 * resolve to empty content (so we don't promise data that isn't there).
 */
export interface ContextChip {
  label: string;       // e.g., "競品 · 屈臣氏 / 86 小舖 / Watsons"
  source: string;      // raw path
  hasContent: boolean; // false = label still shown but greyed
}

const PATH_LABELS: Record<string, string> = {
  // ── Brand scope paths ──
  "brand.name":                            "品牌",
  "brand.industry":                        "產業",
  "brand.positioning.goldenCircle":        "黃金圈",
  "brand.positioning.goldenCircle.why":    "WHY",
  "brand.positioning.tagline.zhTagline":   "標語",
  "brand.positioning.audience.primary":    "主受眾",
  "brand.positioning.audience.matrix":     "情感矩陣",
  "brand.positioning.competition.direct":  "直接競品",
  "brand.positioning.competition.indirect":"間接競品",
  "brand.positioning.differentiation":     "差異化",
  "brand.positioning.differentiation.summary": "差異化",
  "brand.positioning.voice":               "Voice",
  "brand.positioning.voice.archetypes":    "archetypes",
  "brand.positioning.voice.tone":          "tone",
  "brand.positioning.voice.forbidden":     "forbidden",
  "brand.positioning.trends":              "趨勢",
  // ── Product scope paths (segment ids: core/audience/value/competition/strategy/marketing) ──
  "brand.positioning.core.coreStatement":      "核心定位",
  "brand.positioning.core.oneLineValueProp":   "核心主張",
  "brand.positioning.value.userFeeling":       "使用者感受",
  "brand.positioning.value.primaryEmotion":    "情緒價值",
  "brand.positioning.competition.uniqueUsp":   "獨家賣點",
  "brand.positioning.marketing.tone":          "tone",
  "brand.positioning.marketing.style":         "溝通風格",
  // ── Event scope paths ──
  "brand.positioning.smp.statement":           "SMP",
  "brand.positioning.messaging.coreMessage":   "核心訊息",
  "brand.positioning.strategy.approach":       "活動策略",
};

export function buildContextChips(ctx: any, sources: string[] | undefined): ContextChip[] {
  if (!sources || sources.length === 0) return [];
  const chips: ContextChip[] = [];
  for (const path of sources) {
    const raw = pickByPath(ctx, path);
    const shaped = shapeValue(raw);
    const baseLabel = PATH_LABELS[path] ?? path.split(".").slice(-1)[0]!;
    if (shaped) {
      const preview = shaped.length > 38 ? shaped.slice(0, 38) + "…" : shaped;
      chips.push({ label: `${baseLabel} · ${preview}`, source: path, hasContent: true });
    } else {
      chips.push({ label: `${baseLabel} · 尚未填寫`, source: path, hasContent: false });
    }
  }
  return chips;
}
