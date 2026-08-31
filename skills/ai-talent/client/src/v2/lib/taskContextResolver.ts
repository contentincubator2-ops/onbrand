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
    // 2026-08-31 (CJ「context 當中 values 出現了 items" body 等程式碼文案」):
    // positioning.values 的形狀是 { items: [{ label, body }] }，沒有任何一個
    // summary 類的鍵，於是掉進下面的 JSON fallback，把整段 JSON 當文案顯示
    // 給使用者看。凡是 { items: [...] } 這種包一層的結構都交回陣列分支處理
    // ——它已經會挑 name / label / dim。goldenCircle 之外的多數 segment
    // （values / competition.direct / _assets.*）都是這個形狀。
    // 只要是 items 陣列就由陣列分支決定結果，抽不出東西時回空字串讓 chip
    // 顯示「尚未填寫」。不可以再往下掉到 JSON fallback —— 空的 items 會變成
    // 「{"items":[]}」出現在使用者眼前。
    if (Array.isArray(raw.items)) return shapeValue(raw.items, shape);

    // 2026-09-01 (CJ 截圖：CONTEXT 出現 `Voice · {"tone":["嚴謹而溫潤",…`):
    // positioning.voice 的形狀是 { tone, samples, forbidden, archetypes }，
    // 既沒有 summary 類的鍵，也沒有 items，於是整包 JSON 被當成文案顯示。
    // 與其一個形狀一個形狀補，改成通用規則：挑第一個「字串陣列」屬性。
    // voice → tone、_assets.preferred_terms → items（上面已處理）都命中。
    for (const v of Object.values(raw)) {
      if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string")) {
        const joined = shapeValue(v, shape);
        if (joined) return joined;
      }
    }
    // 再退一步：第一個非空的字串屬性。
    for (const v of Object.values(raw)) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    // 什麼都抽不出來就回空字串，讓 chip 顯示「尚未填寫」。
    // **永遠不要把原始 JSON 顯示給使用者** —— 那是這個函式最初的失誤。
    return "";
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
  // ── Event scope paths (segment ids: brief/context/audience/objectives/awards/smp/messaging/creative/guidelines/channels/journey) ──
  "brand.positioning.audience.primaryAudience":      "核心受眾",
  "brand.positioning.smp.singleMindedProposition":   "SMP",
  "brand.positioning.messaging.coreMessage":         "核心訊息",
  "brand.positioning.creative.coreTranslation":      "創意 hook",
  "brand.positioning.context.coreProblem":           "核心問題",
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
