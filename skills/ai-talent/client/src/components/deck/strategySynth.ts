/**
 * Template-based strategy synthesis.
 *
 * Given a methodology slug + filled config, produce a human-readable
 * interpretation of what the user's strategy actually says. This is the
 * "what am I following?" view the user asked for in Phase 1 feedback.
 *
 * Works offline — no LLM required. When LLM is restored, an AI-enhanced
 * synthesis button can layer on top of this.
 */

export interface SynthBlock {
  title: string;   // heading for the block (e.g. "核心主張")
  body: string;    // multi-line narrative
}

export interface SynthResult {
  headline: string;      // 1-sentence tl;dr
  blocks: SynthBlock[];  // ordered blocks
  gaps: string[];        // fields still empty
  completeness: number;  // 0..1
}

function val(config: Record<string, any>, key: string): string | null {
  const v = config?.[key];
  if (v == null) return null;
  if (Array.isArray(v)) {
    const filtered = v.filter((x) => typeof x === "string" && x.trim());
    return filtered.length ? filtered.join("、") : null;
  }
  if (typeof v === "string") return v.trim() || null;
  return String(v);
}

function listVal(config: Record<string, any>, key: string): string[] {
  const v = config?.[key];
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x.trim());
  if (typeof v === "string" && v.trim()) return v.split("\n").map((s) => s.trim()).filter(Boolean);
  return [];
}

function computeCompleteness(
  config: Record<string, any>,
  fieldKeys: string[]
): { completeness: number; gaps: string[] } {
  const gaps: string[] = [];
  let filled = 0;
  for (const k of fieldKeys) {
    const v = val(config, k);
    if (v) filled += 1;
    else gaps.push(k);
  }
  const total = fieldKeys.length || 1;
  return { completeness: filled / total, gaps };
}

type SynthFn = (config: Record<string, any>) => SynthResult;

// ─── per-methodology synthesizers ────────────────────────────────────────────

const SYNTH: Record<string, SynthFn> = {
  "brand-archetype-positioning": (c) => {
    const arch = val(c, "primaryArchetype");
    const shadow = val(c, "shadow");
    const desire = val(c, "coreDesire");
    const { completeness, gaps } = computeCompleteness(c, ["primaryArchetype", "shadow", "coreDesire"]);
    return {
      headline: arch
        ? `你的品牌人格是「${arch}」原型，核心渴望是${desire || "（尚未填寫）"}。`
        : "尚未選定主原型 — 12 個 Jung 原型中挑一個最能代表品牌情感人格的。",
      blocks: [
        {
          title: "你在跟誰對話",
          body: arch
            ? `以「${arch}」原型的語氣、節奏、符號系統跟顧客互動。所有文案、視覺、客服用語都應該落在這個人格之內。`
            : "填完主原型後會自動生成說明。",
        },
        {
          title: "核心渴望驅動什麼決策",
          body: desire
            ? `顧客選擇你，是因為你幫他們實現：${desire}。產品功能、定價、活動設計都要回到這個渴望做取捨。`
            : "核心渴望沒填，等於還沒決定你的情感承諾。",
        },
        ...(shadow
          ? [{
              title: "要警覺的陰影面",
              body: `「${shadow}」是這個原型容易失控的一面。做內容、回應顧客時避免滑進這個狀態。`,
            }]
          : []),
      ],
      gaps,
      completeness,
    };
  },

  "mind-positioning": (c) => {
    const word = val(c, "ownedWord");
    const enemy = val(c, "enemy");
    const rationale = val(c, "rationale");
    const { completeness, gaps } = computeCompleteness(c, ["ownedWord", "enemy", "rationale"]);
    return {
      headline: word
        ? `要在顧客心智中佔下「${word}」這個字眼${enemy ? `，對手是${enemy}` : ""}。`
        : "尚未決定要佔的字眼 — 這是 Ries & Trout 定位法的核心。",
      blocks: [
        {
          title: "所有溝通都為了一個字",
          body: word
            ? `每一則廣告、每一篇貼文、每一次客服回應，都應該強化「${word}」這個聯想。不相關的訊息要捨。`
            : "填完「要佔的字眼」後會生成具體執行準則。",
        },
        ...(enemy
          ? [{
              title: "你在搶誰的位置",
              body: `對手：${enemy}。你的訊息要讓顧客在腦中把你跟對手直接比較，然後選你。`,
            }]
          : []),
        ...(rationale
          ? [{ title: "為什麼你能贏", body: rationale }]
          : []),
      ],
      gaps,
      completeness,
    };
  },

  "category-design-positioning": (c) => {
    const cat = val(c, "newCategory");
    const frame = val(c, "problemFraming");
    const { completeness, gaps } = computeCompleteness(c, ["newCategory", "problemFraming"]);
    return {
      headline: cat
        ? `你不是在做「更好的 X」— 你在設計一個叫「${cat}」的新類別，並當第一名。`
        : "還沒命名新類別 — 類別設計法要求品牌先設計出一個市場還沒有的類別。",
      blocks: [
        {
          title: "不要跟舊類別比較",
          body: cat
            ? `所有訊息避免「我們比 X 更 ___」這種措辭。改成「${cat}是一種新的 ___，解決 ___」。`
            : "填完新類別名稱後會生成具體措辭規則。",
        },
        ...(frame
          ? [{ title: "要重新框架的問題", body: frame }]
          : []),
      ],
      gaps,
      completeness,
    };
  },

  "differentiation-positioning": (c) => {
    const diff = val(c, "diffPoint");
    const proofs = listVal(c, "proof");
    const { completeness, gaps } = computeCompleteness(c, ["diffPoint", "proof"]);
    return {
      headline: diff
        ? `你的品牌依靠「${diff}」這個差異點贏得選擇。`
        : "尚未鎖定核心差異點 — Trout 強調要選一個對手做不到、顧客在乎的點。",
      blocks: [
        {
          title: "所有溝通都圍繞這個差異",
          body: diff
            ? `文案、活動、客服回應都要反覆放大「${diff}」。其他優點降到次要位置。`
            : "填完差異點後會生成具體運用指引。",
        },
        proofs.length > 0
          ? {
              title: `${proofs.length} 個證據點`,
              body: proofs.map((p, i) => `${i + 1}. ${p}`).join("\n"),
            }
          : { title: "需要證據", body: "目前還沒列出可證據點。沒有證據的差異點會被當成廣告話術。" },
      ],
      gaps,
      completeness,
    };
  },

  "competitive-perceptual-mapping": (c) => {
    const x = val(c, "axisX");
    const y = val(c, "axisY");
    const target = val(c, "targetCell");
    const { completeness, gaps } = computeCompleteness(c, ["axisX", "axisY", "targetCell"]);
    return {
      headline: target
        ? `你要佔的位置：「${target}」。`
        : "感知地圖還沒畫出來 — 需要 X/Y 兩軸 + 目標象限。",
      blocks: [
        {
          title: "決策軸",
          body: x && y
            ? `X 軸：${x}\nY 軸：${y}\n把主要競品放上這張圖，避開擁擠區。`
            : "X/Y 軸還沒定義。",
        },
        ...(target ? [{ title: "目標象限", body: target }] : []),
      ],
      gaps,
      completeness,
    };
  },

  "purpose-driven-positioning": (c) => {
    const why = val(c, "why");
    const how = val(c, "how");
    const what = val(c, "what");
    const { completeness, gaps } = computeCompleteness(c, ["why", "how", "what"]);
    return {
      headline: why
        ? `你的 Why：${why.length > 40 ? why.slice(0, 40) + "…" : why}`
        : "Golden Circle 的核心是 Why — 尚未填寫。",
      blocks: [
        { title: "Why（信念）", body: why || "還沒填寫。顧客買的是信念，不是功能。" },
        { title: "How（做法）", body: how || "還沒填寫。" },
        { title: "What（產品/服務）", body: what || "還沒填寫。" },
        {
          title: "溝通順序",
          body: "對外溝通永遠從 Why 開始，再 How，再 What。大多數品牌的錯誤是反過來。",
        },
      ],
      gaps,
      completeness,
    };
  },

  "blue-ocean-positioning": (c) => {
    const E = listVal(c, "eliminate");
    const R = listVal(c, "reduce");
    const Ra = listVal(c, "raise");
    const Cr = listVal(c, "create");
    const { completeness, gaps } = computeCompleteness(c, ["eliminate", "reduce", "raise", "create"]);
    return {
      headline: `你的藍海：消除 ${E.length} 項慣例、降低 ${R.length} 項、提升 ${Ra.length} 項、創造 ${Cr.length} 項。`,
      blocks: [
        { title: "消除（業界視為必要但其實沒人要的）", body: E.length ? E.map((x) => `• ${x}`).join("\n") : "還沒列。" },
        { title: "降低（過度投入的）", body: R.length ? R.map((x) => `• ${x}`).join("\n") : "還沒列。" },
        { title: "提升（業界不夠好的）", body: Ra.length ? Ra.map((x) => `• ${x}`).join("\n") : "還沒列。" },
        { title: "創造（業界從未提供的）", body: Cr.length ? Cr.map((x) => `• ${x}`).join("\n") : "還沒列。" },
      ],
      gaps,
      completeness,
    };
  },

  "brand-equity-cbbe": (c) => {
    const sal = val(c, "salience");
    const perf = val(c, "performance");
    const res = val(c, "resonance");
    const { completeness, gaps } = computeCompleteness(c, ["salience", "performance", "resonance"]);
    return {
      headline: res
        ? `品牌金字塔頂端（共鳴）：${res.length > 40 ? res.slice(0, 40) + "…" : res}`
        : "CBBE 金字塔由下往上還沒堆完。",
      blocks: [
        { title: "1. 認知（誰是你？）", body: sal || "還沒填。沒認知就沒後面。" },
        { title: "2. 績效（做什麼？）", body: perf || "還沒填。" },
        { title: "3. 共鳴（死忠點）", body: res || "還沒填。共鳴是品牌最深的護城河。" },
      ],
      gaps,
      completeness,
    };
  },

  "brand-story-positioning": (c) => {
    const hero = val(c, "hero");
    const problem = val(c, "problem");
    const plan = val(c, "guidePlan");
    const stakes = val(c, "stakes");
    const { completeness, gaps } = computeCompleteness(c, ["hero", "problem", "guidePlan", "stakes"]);
    return {
      headline: hero
        ? `故事主角是顧客（想要：${hero.length > 30 ? hero.slice(0, 30) + "…" : hero}），你是引導者。`
        : "StoryBrand 要求顧客是英雄、品牌是引導者。尚未填寫英雄想要什麼。",
      blocks: [
        { title: "英雄（顧客）想要", body: hero || "還沒填。" },
        { title: "面對的問題", body: problem || "還沒填。" },
        { title: "你（引導者）的計畫", body: plan || "還沒填。" },
        { title: "成功 / 失敗的後果", body: stakes || "還沒填。" },
        {
          title: "溝通結構",
          body: "所有對外訊息（首頁、廣告、email）都按：主角想要 → 遇到問題 → 你提出計畫 → 呼籲行動 → 顯示成功/失敗。",
        },
      ],
      gaps,
      completeness,
    };
  },

  "brand-narrative-cultural": (c) => {
    const tension = val(c, "culturalTension");
    const myth = val(c, "myth");
    const { completeness, gaps } = computeCompleteness(c, ["culturalTension", "myth"]);
    return {
      headline: tension
        ? `你在對話的文化矛盾：${tension.length > 40 ? tension.slice(0, 40) + "…" : tension}`
        : "文化品牌要先找到一個時代的文化矛盾。",
      blocks: [
        { title: "要對話的文化矛盾", body: tension || "還沒填。品牌的力量來自解開時代矛盾，不是解決功能問題。" },
        { title: "要說的神話", body: myth || "還沒填。" },
      ],
      gaps,
      completeness,
    };
  },
};

/**
 * Main entry. Returns `null` if no synthesizer exists for the slug
 * (caller should hide the synthesis section entirely in that case).
 */
export function synthesizeStrategy(
  methodologySlug: string | undefined | null,
  config: Record<string, any> | undefined | null
): SynthResult | null {
  if (!methodologySlug) return null;
  const fn = SYNTH[methodologySlug];
  if (!fn) return null;
  return fn(config ?? {});
}
