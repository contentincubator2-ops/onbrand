/**
 * theaterRouter — backend for 內容企劃台 (CJ 2026-05-07).
 *
 * Three procedures, all simple:
 *
 *   runStart    : load brand positioning → derive USP pool + chief opening
 *   generateCell: per-cell caption (one LLM call, platform-tuned prompt)
 *   generateImage: per-cell Flux image (PiAPI flux-schnell, square)
 *
 * Frontend orchestrates pacing (2 caption workers + 1 image worker). The
 * router stays stateless so retries are trivial and one stuck cell never
 * blocks the rest.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getBrandPositioningById } from "../positioningBridge";
import { invokeLLM } from "../_core/llm";
import { dispatchGenerate } from "../_core/mediaGen";
import { fetchViralPatterns, type ViralPatterns } from "../_core/socialListeningScout";
import localPool from "../localDb";

// Per-(brand, platform, day) scout cache. The cache key encloses the
// YYYY-MM-DD so it auto-expires daily. Viral patterns don't shift in
// minutes — caching avoids 6 perplexity calls every time the user
// presses 重新企劃 within the same day.
const scoutCache = new Map<string, { patterns: ViralPatterns | null; cachedAt: number }>();
const SCOUT_TTL_MS = 24 * 60 * 60 * 1000;
function scoutCacheKey(brandId: number, platform: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `b${brandId}::${platform}::${today}`;
}

const PlatformZ = z.enum([
  "facebook", "instagram", "youtube", "threads", "line", "blog",
]);

// ─── Hook + CTA pools (Phase 1: caption diversity) ──────────────────────
//
// Pre-allocated so two consecutive days never share the same hook on the
// same platform. Solves CJ's #1 + #7 feedback ("每篇都是『你有沒有遇過』
// 開頭" + "CTA 都是『留言告訴我』").

const HOOK_KEYS = [
  "story", "number", "contrast", "question",
  "observation", "self_deprecate", "scenario", "myth_break",
] as const;
type HookKey = (typeof HOOK_KEYS)[number];

const HOOK_PLAYBOOK: Record<HookKey, string> = {
  story:           "故事開場 — 第一句以「上週遇到 / 前幾天 / 有個客人...」這種具體事件切入，禁止用問句或統計。",
  number:          "數字驚奇 — 第一句必須含一個具體數字 / 比例 / 倍數（87% 的人 / 3 個月內 / 4 倍）。禁止用「你有沒有...」這種模糊問句開頭。",
  contrast:        "對比反差 — 第一句結構必須是「以前 X，後來才 Y」或「大家都以為 X，但其實 Y」。",
  question:        "問句啟動 — 第一句是真的問題（不是修辭），用「你 / 妳 / 你們」當主詞，問一個讓讀者立刻想回答的事。",
  observation:     "短觀察 — 第一句以「最近發現 / 最近這陣子...」帶出觀察，不要立刻跳結論。",
  self_deprecate:  "自嘲 — 第一句用「身為 ___ 我居然...」或「我以為自己 X，結果...」這種自我挖苦的語氣。",
  scenario:        "具象場景 — 第一句直接寫一個畫面（晚上 8 點 / 打開冰箱 / 滑著手機...），讓讀者像看電影一樣進入。",
  myth_break:      "破除迷思 — 第一句先點出常見誤解（「很多人以為 X」），第二句翻轉。",
};

const CTA_KEYS = [
  "comment_engage", "click_link", "share_friend", "tag_friend",
  "save", "purchase", "follow_up", "subscribe",
] as const;
type CtaKey = (typeof CTA_KEYS)[number];

const CTA_PLAYBOOK: Record<CtaKey, string> = {
  comment_engage:  "結尾請讀者「留言告訴我 / 你的看法是？/ 你也是嗎？」— 引發互動。",
  click_link:      "結尾引導「點下方連結 / 看詳情 / 立即預訂」— 純導流。",
  share_friend:    "結尾引導「分享給也在煩惱的朋友 / 把這篇 tag 給...」— 推薦擴散。",
  tag_friend:      "結尾「標記一個你覺得需要看到的朋友」— 標記擴散，不是分享。",
  save:            "結尾「收藏這篇 / 之後翻出來用 / 存起來備用」— 不要求互動，要求保留。",
  purchase:        "結尾直接導購「現在就點 / 立即下單 / 加入購物車」— 不要含蓄。",
  follow_up:       "結尾預告下一篇「明天我們會講 ___ / 下篇繼續 / 鎖定明天」— 養觀眾回訪習慣。",
  subscribe:       "結尾「加 LINE 第一手收到 / 訂閱頻道 / 追蹤帳號」— 收割長期關係。",
};

/**
 * Detect & strip "LLM restart-rewrite" patterns.
 *
 * Two flavors observed in production:
 *
 *  A) Inline restart (no paragraph break):
 *     "...堅信的「\n超過 300 萬筆...堅信的「黃金出沒時段」..."
 *
 *  B) Paragraph-level restart (the common case):
 *     "Pokemon GO 只要加個 Discord 群就夠了，但其實光靠一個群，你很
 *
 *      Pokemon GO 只要加個 Discord 群就夠了，但其實光靠一個群，你很可能..."
 *     → first paragraph is a stub, second is the full version,
 *       second STARTS WITH the same chars as the stub.
 *
 * dedupeRestart handles both. Always runs on every QA output — the LLM
 * polish can't be trusted to dedupe even when explicitly told to.
 */
function dedupeRestart(text: string): string {
  if (!text) return text;
  let out = text.trim();

  // Pattern B — paragraph-level. Walk paragraphs front-to-back; if any
  // paragraph N is a strict prefix of paragraph N+1 (or shares a long
  // prefix with it), drop N. Repeat until stable.
  for (let pass = 0; pass < 3; pass++) {
    const paras = out.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    if (paras.length < 2) break;
    let mutated = false;
    const kept: string[] = [];
    for (let i = 0; i < paras.length; i++) {
      const cur = paras[i] ?? "";
      const next = paras[i + 1] ?? "";
      // Stub must be shorter, ≥ 8 chars, and lack an end-of-sentence finish
      const stubLooksIncomplete =
        cur.length >= 8 &&
        cur.length < next.length &&
        !/[。！？]$/.test(cur);
      if (stubLooksIncomplete) {
        // Compare prefix — if next starts with cur (or first 12+ chars of cur)
        const head = cur.length > 30 ? cur.slice(0, 30) : cur;
        if (next.startsWith(head) || next.startsWith(cur.slice(0, 15))) {
          // Skip cur — it's the abandoned stub
          mutated = true;
          continue;
        }
      }
      kept.push(cur);
    }
    if (!mutated) break;
    out = kept.join("\n\n").trim();
  }

  // Pattern A — inline (within first 320 chars), the original heuristic
  for (const len of [40, 32, 24, 18]) {
    if (out.length <= len * 2) continue;
    const head = out.slice(0, len).trim();
    if (!head) continue;
    if (/[。！？]/.test(head)) continue; // legit complete first sentence
    const second = out.indexOf(head, len + 1);
    if (second > 0 && second <= 320) {
      out = out.slice(second).trim();
      break;
    }
  }
  return out;
}

// Backwards-compat alias for any old callers (none currently — kept for
// future surgery without thrashing imports)
const stripRestartPrefix = dedupeRestart;
void stripRestartPrefix;

/** Round-robin allocate hooks ensuring no two consecutive days on the
 *  same platform repeat. Stable per-brand seed so re-runs reproduce. */
function allocatePlan<K extends string>(
  pool: readonly K[],
  days: string[],
  platforms: string[],
  seed: number,
): Record<string, K> {
  const out: Record<string, K> = {};
  const prevByPlatform: Record<string, K | null> = {};
  let cursor = seed % pool.length;
  for (const date of days) {
    for (const platform of platforms) {
      let pick = pool[cursor % pool.length] as K;
      // If same as last on this platform, advance once
      let safety = 0;
      while (pick === prevByPlatform[platform] && safety < pool.length) {
        cursor++;
        pick = pool[cursor % pool.length] as K;
        safety++;
      }
      out[`${date}::${platform}`] = pick;
      prevByPlatform[platform] = pick;
      cursor++;
    }
  }
  return out;
}

/**
 * Platform-specific writing guidance — captures the structures actually
 * used in viral Taiwan posts on each platform. NOT generic "FB 中長文 +
 * CTA" boilerplate. Real local patterns (痛點開場 / 對比反差 / 數字
 * 鉤子 / 串文式提問 / 直購式廣播 / SEO 長文標題 H2 結構).
 */
// IMPORTANT: PLATFORM_GUIDE describes *format* (字數 / 段落 / hashtag /
// emoji / CTA-position) only. Hook openings + CTA copy are NOT specified
// here — those are owned by HOOK_PLAYBOOK + CTA_PLAYBOOK and injected per
// cell by runStart's allocation. Letting the guide also list hooks
// re-introduces the "你有沒有遇過" overlap CJ flagged in QA.
const PLATFORM_GUIDE: Record<z.infer<typeof PlatformZ>, string> = {
  facebook: `FB 貼文格式（120-200 字，繁體中文）。
段落結構：開場 hook（1-2 句，依今日指定 hook 類型）→ 中段 1-2 個生活化具體場景帶出 USP（不寫條列）→ 結尾 CTA（依今日指定 CTA 意圖）。
不寫 markdown，不寫 emoji 灌水，hashtag ≤ 3 個。`,

  instagram: `IG 貼文格式（60-120 字，繁體中文，斷行多）。
段落結構：第一行 = 視覺鉤子（依今日指定 hook 類型寫成短句）→ 4-6 行短句斷開（不寫長段落）→ 結尾 CTA（依今日指定 CTA 意圖）。
適度 emoji（2-4 個，不灌水），結尾配 3-5 個精準 hashtag（不要 #love #photooftheday 灌水）。`,

  youtube: `YT 影片描述（120-200 字，繁體中文）。
段落結構：第一句 hook（依今日指定 hook 類型）→ 條列 3 點影片亮點（用「✓」或「→」每點一行）→ 結尾 CTA（依今日指定 CTA 意圖）。
不要把標題照抄到第一句。可暗示章節時間戳但不必給實際時間。`,

  threads: `Threads 格式（單則 50-100 字，繁體中文）。
口語、像朋友聊天的語氣。單則完整：第一句 hook（依今日指定 hook 類型）→ 1-2 句展開 → 結尾 CTA（依今日指定 CTA 意圖）。
不寫條列，不灌 hashtag（最多 1-2 個），可以用「…」「→」收尾留白。`,

  line: `LINE OA 廣播訊息（80-120 字，繁體中文）。
單刀直入：第一句 hook（依今日指定 hook 類型，但偏向 offer 導向）→ 中段 1 個關鍵 benefit + 時效（例：「這週五前」/「限量 100 組」）→ 結尾 CTA（依今日指定 CTA 意圖）。
語氣親切但有力，不寫 emoji 海。`,

  blog: `Blog SEO 長文摘要（150-250 字，繁體中文）。
第一段：用問題切入，帶出讀者搜尋意圖。
第二段：3-4 句點出本文會解答的具體面向（暗示 H2 小標分節）。
結尾：引導讀者繼續往下看（「下文我們將從 ___ 切入…」）。
SEO 友善：自然帶入 1-2 個關鍵字，不要硬塞。`,
};

/** Load active brand-level caption rules from BOTH sources:
 *
 *  1. brand_caption_rules table — explicit rules added via the
 *     Theater 修改規則 modal (one rule per row, scope='brand').
 *
 *  2. brands.positioning._assets — text-discipline assets from the
 *     /brands page 文字 tab (用詞 / 替換對照 / 品牌準則 / 禁用詞 etc.)
 *     These get auto-translated into rule strings here so the user
 *     never needs to re-type them as Theater rules.
 *
 *  Both sources merged into a single string[] returned to the writer.
 */
async function loadBrandRules(brandId: number, userId: number): Promise<string[]> {
  const out: string[] = [];

  // 1. Explicit rules from brand_caption_rules table
  try {
    const [rows]: any = await localPool.execute(
      `SELECT rule FROM brand_caption_rules
        WHERE brandId = ? AND userId = ? AND active = 1 AND scope = 'brand'
        ORDER BY id ASC`,
      [brandId, userId],
    );
    for (const r of (rows as any[])) {
      const t = String(r.rule || "").trim();
      if (t) out.push(t);
    }
  } catch { /* non-fatal */ }

  // 2. Derive rules from /brands 文字 tab assets
  try {
    const [posRows]: any = await localPool.execute(
      `SELECT positioning FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
      [brandId, userId],
    );
    const row = (posRows as any[])[0];
    if (!row) return out;
    let pos: any = row.positioning;
    if (typeof pos === "string") {
      try { pos = JSON.parse(pos); } catch { pos = null; }
    }
    const assets = pos?._assets ?? {};

    // banned_words.items[] → "不要使用「X」"
    const banned: string[] = Array.isArray(assets.banned_words?.items) ? assets.banned_words.items : [];
    for (const w of banned) {
      const t = String(w || "").trim();
      if (t) out.push(`不要使用「${t}」這個詞或變體。`);
    }

    // preferred_terms.items[] → soft hint
    const preferred: string[] = Array.isArray(assets.preferred_terms?.items) ? assets.preferred_terms.items : [];
    if (preferred.length > 0) {
      out.push(`遇到合適情境，優先使用品牌愛用詞：${preferred.slice(0, 12).map((x) => String(x).trim()).filter(Boolean).join("、")}。`);
    }

    // term_substitutions.pairs[{from, to}] → "不要說 X，改說 Y"
    const subs: Array<{ from: string; to: string }> = Array.isArray(assets.term_substitutions?.pairs) ? assets.term_substitutions.pairs : [];
    for (const p of subs) {
      const f = String(p?.from || "").trim();
      const tt = String(p?.to || "").trim();
      if (f && tt) out.push(`不要說「${f}」，改說「${tt}」。`);
    }

    // voice_principles.items[] → 1 rule each
    const vps: string[] = Array.isArray(assets.voice_principles?.items) ? assets.voice_principles.items : [];
    for (const v of vps) {
      const t = String(v || "").trim();
      if (t) out.push(t);
    }

    // branded_terms.items[] → preserve as-is
    const branded: string[] = Array.isArray(assets.branded_terms?.items) ? assets.branded_terms.items : [];
    if (branded.length > 0) {
      out.push(`提到以下品牌術語時，保留原文不翻譯不改寫：${branded.slice(0, 10).map((x) => String(x).trim()).filter(Boolean).join("、")}。`);
    }

    // abbreviations.pairs[{from, to}] → 縮寫展開規則 (only if user supplied)
    const abbs: Array<{ from: string; to: string }> = Array.isArray(assets.abbreviations?.pairs) ? assets.abbreviations.pairs : [];
    for (const p of abbs.slice(0, 6)) {
      const f = String(p?.from || "").trim();
      const tt = String(p?.to || "").trim();
      if (f && tt) out.push(`縮寫「${f}」第一次出現時，建議補上全稱「${tt}」。`);
    }
  } catch { /* non-fatal — writer still gets explicit rules */ }

  return out;
}

export const theaterRouter = router({
  /**
   * Load brand positioning, derive 5-7 USPs, ask LLM for the chief's
   * opening line. Single call, < 4s.
   */
  runStart: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      platforms: z.array(PlatformZ).min(1),
      importantDates: z.array(z.object({
        date: z.string(),
        name: z.string(),
      })).default([]),
      // Phase 1: dates list so we can pre-allocate hook/CTA plans server-side
      dates: z.array(z.string()).optional(),
      // Phase 3b: 素材 (products + photos) — surfaces in chief opening
      // and injected into per-cell prompts as additional context.
      products: z.array(z.object({
        name: z.string(),
        usp: z.string(),
        launchDate: z.string().optional(),
      })).max(20).optional(),
      photos: z.array(z.object({
        url: z.string(),
        tag: z.string(),
        note: z.string().optional(),
      })).max(20).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const [pos, brandRules, lockState] = await Promise.all([
        getBrandPositioningById(input.brandId, ctx.user.id),
        loadBrandRules(input.brandId, ctx.user.id),
        // Pull tabLocks so the chief station can ack the lock state
        (async () => {
          try {
            const [rows]: any = await localPool.execute(
              `SELECT tabLocks FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
              [input.brandId, ctx.user.id],
            );
            const row = (rows as any[])[0];
            let parsed: any = row?.tabLocks;
            if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch { parsed = null; } }
            return {
              positioning: !!parsed?.positioning,
              copy:        !!parsed?.copy,
              visual:      !!parsed?.visual,
            };
          } catch {
            return { positioning: false, copy: false, visual: false };
          }
        })(),
      ]);

      // USP pool — prefer differentiators, fall back to messagingPillars,
      // last resort: synthesize from positioningSummary.
      let usps: string[] = [];
      if (pos?.differentiators && pos.differentiators.length > 0) {
        usps = pos.differentiators.slice(0, 7);
      } else if (pos?.messagingPillars && pos.messagingPillars.length > 0) {
        usps = pos.messagingPillars.slice(0, 7);
      } else if (pos?.usp) {
        usps = [pos.usp];
      }
      if (usps.length === 0) {
        usps = ["核心價值（待品牌定位完成後自動填入）"];
      }

      const platformLabels = input.platforms.join(" / ");
      const dateChips = input.importantDates.length
        ? input.importantDates.map((d) => `${d.date}「${d.name}」`).join("、")
        : "無特別檔期";

      // Chief opening + per-platform lead thoughts in ONE LLM call.
      // Returns JSON: { chief: "...", leads: { facebook: "...", ig: "..." } }
      // Single 3-4s round-trip beats 7 sequential calls.
      const platformContext: Record<string, string> = {
        facebook:  "FB lead — 規劃中長文節奏（90-180 字 / 篇）。",
        instagram: "IG lead — Reel + Carousel + Static 混合節奏。",
        youtube:   "YT lead — 主片 + Shorts 配比；一週導向同 1 個 USP。",
        threads:   "Threads lead — 串文短打、即時感、口語。",
        line:      "LINE lead — 1:1 廣播訊息、強 CTA、導購為主。",
        blog:      "Blog lead — SEO 長文、結構分明、深度內容。",
      };
      const askedPlatforms = input.platforms;
      const platformAsks = askedPlatforms
        .map((p) => `${p}: ${platformContext[p]}`)
        .join("\n");

      let chiefOpening = "";
      let leadThoughts: Record<string, string> = {};
      try {
        const r = await invokeLLM({
          provider: "anthropic",
          model: "claude-haiku-4-5",
          maxTokens: 800,
          messages: [
            {
              role: "system",
              content: `你是內容企劃台的劇本設計師。為以下 7 位 AI agent 各寫一段 1-2 句的「上場台詞」：
1 位總策畫 Claire Hsu（Joe Pulizzi 風格）— 開場宣告本週主軸 + USP 分配原則。
${askedPlatforms.length} 位平台 lead — 各自接棒、口語、第一人稱、明確說出他這個平台的節奏與本週重點。

輸出嚴格 JSON：
{
  "chief": "Claire 的 2 句開場白",
  "leads": {
    ${askedPlatforms.map((p) => `"${p}": "該平台 lead 的 1-2 句台詞"`).join(",\n    ")}
  }
}
不加 markdown / 解釋 / 額外文字。每段台詞不超過 60 字。中文。`,
            },
            {
              role: "user",
              content: `品牌：${pos?.tagline ?? "（無）"}
TA：${pos?.targetAudience ?? "（無）"}
品牌語氣：${pos?.brandVoice ?? "口語、專業"}
USP 候選：${usps.join("、")}
本週重要日子：${dateChips}
${(input.products?.length ?? 0) > 0 ? `\n本次強調的產品：\n${input.products!.map((p) => `  · ${p.name}（USP: ${p.usp}${p.launchDate ? `; ${p.launchDate} 上市` : ""}）`).join("\n")}` : ""}
${(input.photos?.length ?? 0) > 0 ? `\n可運用素材：${input.photos!.length} 張用戶上傳照片（tag: ${input.photos!.map((ph) => ph.tag).join("/")}）` : ""}

各平台規格：
${platformAsks}

請輸出 JSON。`,
            },
          ],
        });
        const raw = r.choices[0]?.message?.content?.toString().trim() ?? "";
        // Strip code fences if present
        const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed = JSON.parse(cleaned);
        chiefOpening = String(parsed.chief ?? "").trim();
        if (parsed.leads && typeof parsed.leads === "object") {
          for (const p of askedPlatforms) {
            const v = (parsed.leads as any)[p];
            if (typeof v === "string" && v.trim()) leadThoughts[p] = v.trim();
          }
        }
      } catch (e) {
        // graceful fallback — formulaic but never crashes
        chiefOpening = `本週主軸：把 ${usps[0]} 推到最前面。一篇貼文聚焦 1 個 USP，${platformLabels} 各組 lead 等等接手。`;
      }

      // Fill missing leads with formulaic fallback
      const fallbackLine: Record<string, string> = {
        facebook:  `FB 我來。中長文節奏，痛點 → 解方 → CTA。`,
        instagram: `IG 換我講。視覺先行，Reel 配 Carousel，每篇 1 個 USP。`,
        youtube:   `YT 一週 1 主片 + 2 Shorts，導向同 1 個 USP。`,
        threads:   `Threads 走串文，每天 1-2 條短打、即時感。`,
        line:      `LINE 一週 2 次廣播，週中預熱 + 週末導購。`,
        blog:      `Blog 我規劃 1-2 篇長文，SEO + USP 對齊。`,
      };
      for (const p of askedPlatforms) {
        if (!leadThoughts[p]) leadThoughts[p] = fallbackLine[p] ?? "我這條線接手。";
      }

      // Phase 1: pre-allocate hook + CTA plans across (date × platform).
      // Seed from brandId so re-runs are stable (idempotent for redo).
      const planDays = input.dates && input.dates.length > 0
        ? input.dates
        : []; // frontend always passes dates now; empty = no plan needed
      const hookPlan = allocatePlan(HOOK_KEYS, planDays, input.platforms, input.brandId);
      const ctaPlan  = allocatePlan(CTA_KEYS,  planDays, input.platforms, input.brandId * 7);

      // Phase 1.5 — Real per-platform viral pattern scout (Perplexity).
      // Fires 6 (or N) parallel queries, one per selected platform, each
      // bounded to the brand's industry. Cached per (brand, platform, day)
      // so reruns within the same day skip the API call.
      // Total wall-time impact: ~5-8s (parallel), capped at 12s by the
      // scout's internal timeout. Failures degrade gracefully to null.
      const industry = pos?.industry ?? null;
      const brandTaglineForScout = pos?.tagline ?? `品牌 ${input.brandId}`;
      const platformScoutResults = await Promise.all(
        input.platforms.map(async (p) => {
          const cacheKey = scoutCacheKey(input.brandId, p);
          const hit = scoutCache.get(cacheKey);
          if (hit && Date.now() - hit.cachedAt < SCOUT_TTL_MS) {
            return [p, hit.patterns] as const;
          }
          const platformLabel = ({
            facebook:  "Facebook",
            instagram: "Instagram",
            youtube:   "YouTube",
            threads:   "Threads",
            line:      "LINE OA",
            blog:      "部落格 / 長文",
          } as Record<string, string>)[p] ?? p;
          const patterns = await fetchViralPatterns({
            channel: p === "blog" ? "press" : p,  // scout knows: instagram/facebook/youtube/threads/line/press
            topic: `${brandTaglineForScout} ${platformLabel} 高互動爆款結構`,
            industry: industry ?? undefined,
            brandId: input.brandId,
            kind: "viral",
          }).catch(() => null);
          scoutCache.set(cacheKey, { patterns, cachedAt: Date.now() });
          return [p, patterns] as const;
        }),
      );
      const scoutByPlatform: Record<string, string[]> = {};
      for (const [p, patterns] of platformScoutResults) {
        if (!patterns || patterns.patterns.length === 0) {
          scoutByPlatform[p] = [];
          continue;
        }
        // Compress each pattern down to a 1-line takeaway for prompt injection
        scoutByPlatform[p] = patterns.patterns.slice(0, 5).map((it) => {
          const head = (it.title || "").slice(0, 60);
          const body = (it.excerpt || "").slice(0, 180).replace(/\s+/g, " ");
          return `《${head}》${body}`.trim();
        });
      }

      return {
        usps,
        chiefOpening,
        leadThoughts,
        // Phase 1 — caption diversity
        hookPlan,
        ctaPlan,
        // Phase 1.5 — real per-platform viral patterns from Perplexity
        scoutByPlatform,
        scoutIndustry: industry,
        // Phase 3a — user-defined brand rules (will also be injected
        // server-side per cell, but we surface them so the UI can show
        // the rule chips on the brain bar)
        brandRules,
        // Brand workspace lock states — frontend uses these to show
        // '採用已鎖定的品牌定位' acknowledgment in the chief opening.
        lockState,
        positioning: pos ? {
          tagline: pos.tagline,
          targetAudience: pos.targetAudience,
          brandVoice: pos.brandVoice,
        } : null,
      };
    }),

  /**
   * Generate a single cell's caption. Platform-tuned tone. ~2-4s per call.
   */
  generateCell: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      platform: PlatformZ,
      date: z.string(),
      weekday: z.string(),
      usp: z.string(),
      importantDateName: z.string().nullable().optional(),
      brandTagline: z.string().nullable().optional(),
      brandVoice: z.string().nullable().optional(),
      // Phase 1 — diversity controls (frontend pulls from runStart's plans)
      hook: z.enum(HOOK_KEYS).optional(),
      cta:  z.enum(CTA_KEYS).optional(),
      // Phase 1.5 — real viral patterns scouted from Perplexity for this
      // platform + brand industry. Frontend passes the platform's array.
      scoutPatterns: z.array(z.string()).max(8).optional(),
      // Phase 3a — user-defined caption rules. Server fetches brand-scoped
      // rules from DB; client passes run-scoped + post-scoped rules here.
      adhocRules: z.array(z.string()).max(20).optional(),
      // Phase 3b — 素材 (產品 / 照片) for caption context
      products: z.array(z.object({
        name: z.string(), usp: z.string(), launchDate: z.string().optional(),
      })).max(10).optional(),
      photoTags: z.array(z.string()).max(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const brandRules = await loadBrandRules(input.brandId, ctx.user.id);
      const allRules = [...brandRules, ...(input.adhocRules ?? [])].filter(Boolean);
      const rulesInstruction = allRules.length > 0
        ? `\n【品牌規則 — 強制遵守，違反等於失敗】
${allRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
        : "";

      // Phase 3b: products + photo tags injected as soft context.
      // Writer can naturally weave product names / use available photo
      // types in visual descriptions; not strictly enforced.
      const materialsInstruction = (input.products?.length ?? 0) > 0 || (input.photoTags?.length ?? 0) > 0
        ? `\n【可運用素材】${
            (input.products?.length ?? 0) > 0
              ? `\n產品：${input.products!.map((p) => `${p.name}（${p.usp}${p.launchDate ? `; ${p.launchDate} 上市` : ""}）`).join("、")}`
              : ""
          }${
            (input.photoTags?.length ?? 0) > 0
              ? `\n可用照片類型：${input.photoTags!.join("、")}（如 USP 帶到視覺，自然提及這些畫面類型）`
              : ""
          }`
        : "";
      const guide = PLATFORM_GUIDE[input.platform];
      const importantHint = input.importantDateName
        ? `當天有「${input.importantDateName}」檔期，請從 USP 與這個檔期的「真實連結」切入（例如母親節 = 媽媽的具體場景，不是「祝媽媽快樂」這種空話）。`
        : "";

      // Phase 1: hook + cta enforcement. Pre-allocated by runStart so two
      // consecutive cells on the same platform never share the same hook.
      const hookInstruction = input.hook
        ? `\n【今日 Hook 類型 — 強制執行】\n${HOOK_PLAYBOOK[input.hook]}\n禁止用其他 hook 類型開場。`
        : "";
      const ctaInstruction = input.cta
        ? `\n【今日 CTA 意圖 — 強制執行】\n${CTA_PLAYBOOK[input.cta]}\n禁止用其他 CTA 結尾。`
        : "";

      // Phase 1.5: real Perplexity scout patterns for this platform.
      // Anchor the writer to actual high-engagement structures from the
      // brand's industry, not LLM-trained boilerplate. We DO NOT ask the
      // LLM to mimic exact wording — only to absorb the structural cues.
      const scoutInstruction = (input.scoutPatterns && input.scoutPatterns.length > 0)
        ? `\n【本週 ${input.platform.toUpperCase()} 真實爆款參考（來自 Perplexity scout 抓取）】
以下是本週同產業 ${input.platform} 高互動貼文的真實結構摘要 — 學它的「結構與節奏」（段落長度、開場語氣、結尾收法），但**不要照抄字句、不要直接套品牌**：
${input.scoutPatterns.slice(0, 4).map((p, i) => `${i + 1}. ${p}`).join("\n")}`
        : "";

      const sys = `你是台灣本地市場的社群文案，熟悉繁體中文使用者的閱讀習慣。
為以下品牌寫一則 ${input.platform} 貼文。

品牌：${input.brandTagline ?? "（請從 USP 反推主張）"}
品牌語氣：${input.brandVoice ?? "口語、溫暖、誠實"}

【平台原生結構（必讀）】
${guide}
${hookInstruction}${ctaInstruction}${scoutInstruction}${rulesInstruction}${materialsInstruction}

【鐵則 — 違反任一條都算失敗】
1. 一篇貼文只聚焦 1 個 USP，不要試圖塞多個賣點。
2. 不要把 USP 原文照搬到貼文裡 — 用故事 / 場景 / 具體例子包裝，讓讀者自己感覺到。
3. **絕對不要把貼文標題或主題重複講兩次**。第一句和第二句不能在意思上重複。
4. 不要寫「祝大家 X 快樂」「希望大家 X」這種制式套話。
5. 不要使用 markdown / heading / bullet（除非平台規則明確要求）。
6. 字數要落在平台規則的範圍內，不要過長或過短。
7. 直接輸出貼文純文字，**不要寫「這是一則 ___ 貼文：」這種前綴**。
8. **嚴格遵守上方指定的 Hook 類型與 CTA 意圖** — 如果今天分配的是「數字驚奇」，就不能用「你有沒有遇過...」開場；如果今天 CTA 是「分享給朋友」，就不能寫「留言告訴我」。

備註：你寫到一半發現要改沒關係，可以重新寫。後面有資深編輯（QA agent）會掃過你的草稿、清掉重複開頭與斷句、把節奏調順。專心把訊息寫好就行。`;

      // Phase 2: structured per-platform output. The shape varies by
      // platform so the cell mockup can render IG hashtags, YT chapters,
      // LINE subject etc. — without these the cells looked identical
      // across platforms (CJ feedback #2 '各平台沒真正差異化').
      const structuredFieldHint = ({
        facebook:  `"hashtags": []   // FB hashtags ≤ 3 個（FB 觀眾不愛 hashtag）`,
        instagram: `"hashtags": []   // IG 精準 hashtag 3-5 個（不要 #love 灌水）`,
        youtube:   `"chapters": []   // YT 章節 2-4 個 ["00:00 開場", "01:30 重點 1", ...]`,
        threads:   `"thread": []     // Threads 串文 1-3 則（單則 50-100 字，可選；單則就用 ["..."]）`,
        line:      `"subject": ""    // LINE 推播主旨（≤ 20 字，給用戶通知列看的）`,
        blog:      `"headline": "", "h2": []  // Blog 主標 + 2-4 個 H2 小標暗示`,
      } as Record<string, string>)[input.platform] ?? `"extra": null`;

      const user = `日期：${input.date}（${input.weekday}）
本篇要溝通的 USP：「${input.usp}」
${importantHint}

請依照平台原生結構 + 指定 Hook 類型 + 指定 CTA 意圖寫這則貼文。

【輸出格式（嚴格 JSON）】
{
  "caption": "完整貼文純文字（含換行）",
  ${structuredFieldHint}
}
不要在 JSON 外加任何文字 / markdown 圍籬 / 解釋。`;

      try {
        const r = await invokeLLM({
          provider: "anthropic",
          model: "claude-haiku-4-5",
          maxTokens: 800,
          messages: [
            { role: "system", content: sys },
            { role: "user", content: user },
          ],
        });
        const raw = r.choices[0]?.message?.content?.toString().trim() ?? "";
        // Strip code fences if present
        const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        let caption = "";
        let structured: Record<string, any> = {};
        try {
          const parsed = JSON.parse(cleaned);
          caption = String(parsed.caption ?? "").trim();
          // Pull all non-caption keys as structured extras
          for (const [k, v] of Object.entries(parsed)) {
            if (k !== "caption") structured[k] = v;
          }
        } catch {
          // Plaintext fallback — model didn't honour JSON. Treat as caption.
          caption = cleaned
            .replace(/^(以下是|這是)?[一個]?[則篇]?\s*[FBIYTGtbreadlinkBlog一-鿿]+貼文[：:]\s*/i, "")
            .trim();
          if ((caption.startsWith("「") && caption.endsWith("」")) ||
              (caption.startsWith("\"") && caption.endsWith("\""))) {
            caption = caption.slice(1, -1).trim();
          }
        }
        return { ok: true as const, caption, structured };
      } catch (e: any) {
        return { ok: false as const, caption: "", structured: {}, error: String(e?.message ?? e) };
      }
    }),

  /**
   * QA pass — Chun-Hao Chen (資深社群編輯) reviews the writer's draft.
   * Cleans:
   *   · 重複開頭 / 寫到一半重啟的副本
   *   · 被切斷的句子（缺尾標點、開頭引號沒收尾）
   *   · 亂入的 markdown / preamble
   *   · 違反指定 hook / CTA 但內容值得保留 → 微調首尾
   *   · 跟其他 cell 的相似度太高（暫不檢查跨 cell — 留 v2）
   *
   * Programmatic stripRestartPrefix() runs first as cheap shortcut, then
   * Haiku polish for the soft issues.
   *
   * Wall: ~1-2s per call. Frontend runs concurrency 2 to compress total.
   */
  qaReviewCell: protectedProcedure
    .input(z.object({
      draft:    z.string().min(1).max(5000),
      platform: PlatformZ,
      hook:     z.enum(HOOK_KEYS).optional(),
      cta:      z.enum(CTA_KEYS).optional(),
      usp:      z.string(),
    }))
    .mutation(async ({ input }) => {
      // 1) Cheap programmatic dedupe (the restart-pattern we already know)
      let cleaned = dedupeRestart(input.draft);

      // 2) LLM polish for soft issues. Keep model output tightly scoped:
      //    plain-text caption only, no commentary, no markdown.
      const expectedHookHint = input.hook
        ? `這篇預期的 hook 類型是「${input.hook}」`
        : "";
      const expectedCtaHint = input.cta
        ? `這篇預期的 CTA 是「${input.cta}」`
        : "";

      try {
        const r = await invokeLLM({
          provider: "anthropic",
          model: "claude-haiku-4-5",
          maxTokens: 800,
          messages: [
            {
              role: "system",
              content: `你是 Chun-Hao Chen，資深社群編輯。任務：把寫手的草稿掃過一遍，做「最小幅度的修補」：
1. 如果草稿裡有「寫到一半重啟、第一句出現兩次、開頭斷句」的情況 → 保留比較完整的那一份，刪掉殘稿。
2. 如果有「被切斷的句子（缺結尾標點、開引號沒收尾）」→ 補完。
3. 如果有「markdown / heading / bullet / 前綴自介」混入 → 拿掉。
4. 如果語氣明顯偏離預期 hook / CTA → 微調首尾，**不要重寫整篇**。
5. 如果草稿本來就乾淨 → **直接原樣回傳**，不要為改而改。
6. **絕對不要重新編造內容、不要替換 USP、不要加你自己的觀點**。

輸出規則：
- 只回傳清理後的純文字 caption（保留原本的換行 / emoji / hashtag）
- 不加「這是修改後的版本：」這種前綴
- 不加任何 markdown 圍籬`,
            },
            {
              role: "user",
              content: `平台：${input.platform}
本篇 USP：「${input.usp}」
${expectedHookHint}
${expectedCtaHint}

【寫手草稿】
${cleaned}

請輸出清理後的乾淨版。`,
            },
          ],
        });
        let polished = r.choices[0]?.message?.content?.toString().trim() ?? cleaned;
        // Same noise stripping as writer output
        polished = polished.replace(/^(以下是|這是|清理後)?[一個]?[則篇]?[版本的]?\s*[一-鿿\w]*[：:\s]+/u, "").trim();
        if ((polished.startsWith("「") && polished.endsWith("」")) ||
            (polished.startsWith("\"") && polished.endsWith("\""))) {
          polished = polished.slice(1, -1).trim();
        }
        // BELT-AND-SUSPENDERS: run dedupe again on LLM output. The polish
        // model frequently echoes the input verbatim or re-introduces the
        // restart pattern even when explicitly told to remove it.
        polished = dedupeRestart(polished);
        // Safety: if QA returned empty or radically shorter, prefer the
        // dedup'd cleaned version
        if (!polished || polished.length < cleaned.length * 0.4) {
          return { ok: true as const, caption: cleaned, polished: false as const };
        }
        return { ok: true as const, caption: polished, polished: true as const };
      } catch (e: any) {
        // QA fail → return programmatic-clean version (still better than draft)
        return { ok: true as const, caption: dedupeRestart(cleaned), polished: false as const, error: String(e?.message ?? e) };
      }
    }),

  /**
   * Generate the cell's hero image via PiAPI flux-schnell. ~6-12s.
   * Caption is converted into a visual brief first (cheap LLM call), then
   * sent to Flux.
   */
  generateImage: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      platform: PlatformZ,
      caption: z.string().min(1).max(3000),
      brandTagline: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      // 1) Caption → short visual brief
      let brief = "";
      try {
        const r = await invokeLLM({
          provider: "anthropic",
          model: "claude-haiku-4-5",
          maxTokens: 180,
          messages: [
            {
              role: "system",
              content: "Convert the social post caption into a 1-2 sentence English visual brief for a text-to-image model. Photorealistic, brand-friendly, no text in image, no logos. Output only the brief.",
            },
            {
              role: "user",
              content: `Brand: ${input.brandTagline ?? "(unknown)"}\nPlatform: ${input.platform}\nCaption:\n${input.caption}`,
            },
          ],
        });
        brief = r.choices[0]?.message?.content?.toString().trim() ?? "";
      } catch {
        brief = `Photorealistic editorial scene representing: ${input.caption.slice(0, 120)}`;
      }

      // 2) Flux schnell — fastest, square
      const aspect = input.platform === "youtube" ? "16:9"
        : input.platform === "instagram" ? "1:1"
        : input.platform === "blog" ? "16:9"
        : "1:1";
      try {
        const r = await dispatchGenerate("piapi/flux-schnell", {
          prompt: brief,
          aspectRatio: aspect as any,
          brandId: input.brandId,
        });
        if (r.status === "ready" && r.url) {
          return { ok: true as const, imageUrl: r.url, brief };
        }
        return { ok: false as const, imageUrl: null, brief, error: r.errorMsg ?? `image gen ${r.status}` };
      } catch (e: any) {
        return { ok: false as const, imageUrl: null, brief, error: String(e?.message ?? e) };
      }
    }),

  // ─── Brand caption rules CRUD (Phase 3a) ────────────────────────────
  // User adds rules via the 修改規則 modal. Only brand-scope rules are
  // persisted; run/post-scope are handled transiently in client memory.

  listBrandRules: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      try {
        const [rows]: any = await localPool.execute(
          `SELECT id, rule, scope, active, createdAt
             FROM brand_caption_rules
            WHERE brandId = ? AND userId = ?
            ORDER BY id DESC`,
          [input.brandId, ctx.user.id],
        );
        return (rows as any[]).map((r) => ({
          id: Number(r.id),
          rule: String(r.rule),
          scope: String(r.scope),
          active: Number(r.active) === 1,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        }));
      } catch (e: any) {
        console.error("[theater.listBrandRules]", e?.message ?? e);
        return [];
      }
    }),

  addBrandRule: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      rule:    z.string().min(2).max(300),
      scope:   z.enum(["brand"]).default("brand"),
    }))
    .mutation(async ({ ctx, input }) => {
      const [r]: any = await localPool.execute(
        `INSERT INTO brand_caption_rules (brandId, userId, rule, scope, active)
              VALUES (?, ?, ?, ?, 1)`,
        [input.brandId, ctx.user.id, input.rule.trim(), input.scope],
      );
      return { ok: true as const, id: Number(r?.insertId ?? 0) };
    }),

  removeBrandRule: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await localPool.execute(
        `DELETE FROM brand_caption_rules WHERE id = ? AND userId = ?`,
        [input.id, ctx.user.id],
      );
      return { ok: true as const };
    }),

  // Phase 3a: inline edit save — frontend dblclicks a cell, edits text,
  // commits. We don't persist captions to a table (they're transient
  // run state) — this is just the simple shape for client to call.
  // Currently no-op on server; left as a tRPC procedure so future
  // versions can audit/log edits or sync to a saved-runs store.
  // ─── Brand tab locks (定位 / 文字 / 視覺) ───────────────────────────
  // Locking a tab marks its content as canonical. Theater / 30s / 60s /
  // 100s all read positioning regardless, but the LOCK is a user
  // commitment that reads "this is approved" — UI shows it, editors go
  // read-only, and downstream agents are told this is final-form.

  getTabLocks: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      try {
        const [rows]: any = await localPool.execute(
          `SELECT tabLocks FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
          [input.brandId, ctx.user.id],
        );
        const row = (rows as any[])[0];
        if (!row) return { positioning: null, copy: null, visual: null };
        let parsed: any = row.tabLocks;
        if (typeof parsed === "string") {
          try { parsed = JSON.parse(parsed); } catch { parsed = null; }
        }
        const out = parsed ?? {};
        return {
          positioning: out.positioning ?? null,
          copy:        out.copy        ?? null,
          visual:      out.visual      ?? null,
        };
      } catch {
        return { positioning: null, copy: null, visual: null };
      }
    }),

  lockTab: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      tab: z.enum(["positioning", "copy", "visual"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const [rows]: any = await localPool.execute(
        `SELECT tabLocks FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
        [input.brandId, ctx.user.id],
      );
      const row = (rows as any[])[0];
      if (!row) throw new Error("brand not found");
      let cur: any = row.tabLocks;
      if (typeof cur === "string") { try { cur = JSON.parse(cur); } catch { cur = {}; } }
      cur = cur ?? {};
      cur[input.tab] = { at: new Date().toISOString(), by: ctx.user.id };
      await localPool.execute(
        `UPDATE brands SET tabLocks = ? WHERE id = ? AND userId = ?`,
        [JSON.stringify(cur), input.brandId, ctx.user.id],
      );
      return { ok: true as const, lock: cur[input.tab] };
    }),

  unlockTab: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      tab: z.enum(["positioning", "copy", "visual"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const [rows]: any = await localPool.execute(
        `SELECT tabLocks FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
        [input.brandId, ctx.user.id],
      );
      const row = (rows as any[])[0];
      if (!row) throw new Error("brand not found");
      let cur: any = row.tabLocks;
      if (typeof cur === "string") { try { cur = JSON.parse(cur); } catch { cur = {}; } }
      cur = cur ?? {};
      cur[input.tab] = null;
      await localPool.execute(
        `UPDATE brands SET tabLocks = ? WHERE id = ? AND userId = ?`,
        [JSON.stringify(cur), input.brandId, ctx.user.id],
      );
      return { ok: true as const };
    }),

  saveCellEdit: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      cellKey: z.string(),
      caption: z.string().min(1).max(8000),
    }))
    .mutation(async () => {
      return { ok: true as const };
    }),
});
