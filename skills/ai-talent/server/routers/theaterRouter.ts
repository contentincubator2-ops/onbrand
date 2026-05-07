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
const PLATFORM_GUIDE: Record<z.infer<typeof PlatformZ>, string> = {
  facebook: `FB 台灣熱門貼文結構（120-200 字，繁體中文）。
從以下「鉤子型開場」隨機挑一個切角寫：
- 故事型：「上週遇到一個媽媽客人，她說…」
- 對比型：「以前我以為 X，後來才發現 Y…」
- 數字型：「3 個月內，我們發現 87% 的人都…」
- 問句型：「你有沒有遇過這種情況？__」
中段：用 1-2 個生活化具體場景帶出 USP（不是條列式）。
結尾：行動引導（「留言告訴我…」「點下方連結…」「分享給也在煩惱的朋友」）。`,

  instagram: `IG 台灣熱門貼文結構（60-120 字，繁體中文，斷行多）。
第一行 = 視覺鉤子（「這 3 個動作毀了你的腰」/「拍下這 5 個畫面，回家照片瞬間升級」）。
中段：4-6 行短句，每行斷開，不寫長段落。
適度 emoji（2-4 個，不灌水），結尾 1 行 CTA + 3-5 個精準 hashtag（不要 #love #photooftheday 灌水）。`,

  youtube: `YT 影片描述（120-200 字，繁體中文）。
第一句 = 主題 hook，吸引點開。
中段：條列式 3 點影片亮點（用「✓」或「→」），每點一行。
最後：訂閱引導 + 章節時間戳暗示（不需真的給時間）。
不要把標題照抄到第一句。`,

  threads: `Threads 台灣熱門結構（單則 50-100 字，繁體中文）。
口語、像朋友聊天的語氣。
熱門切角：
- 反思型：「我發現一件事…」
- 提問型：「大家覺得 X 還是 Y？」
- 短觀察：「最近 ___，你們也是嗎？」
- 自嘲型：「身為 ___，我居然 ___」
不寫條列，不灌 hashtag（最多 1-2 個），可以用「…」「→」收尾留白。`,

  line: `LINE OA 廣播訊息（80-120 字，繁體中文）。
單刀直入：第一句是 offer 或活動主題，不是品牌名。
中段：1 個關鍵 benefit + 時效（例：「這週五前」/「限量 100 組」）。
結尾：明確 CTA（「點下方連結」「回覆 1 索取」），語氣親切但有力。`,

  blog: `Blog SEO 長文摘要（150-250 字，繁體中文）。
第一段：用問題切入，帶出讀者搜尋意圖。
第二段：3-4 句點出本文會解答的具體面向（暗示 H2 小標分節）。
結尾：引導讀者繼續往下看（「下文我們將從 ___ 切入…」）。
SEO 友善：自然帶入 1-2 個關鍵字，不要硬塞。`,
};

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
    }))
    .query(async ({ ctx, input }) => {
      const pos = await getBrandPositioningById(input.brandId, ctx.user.id);

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

      return {
        usps,
        chiefOpening,
        leadThoughts,
        // Phase 1 — caption diversity
        hookPlan,
        ctaPlan,
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
    }))
    .mutation(async ({ input }) => {
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

      const sys = `你是台灣本地市場的社群文案，熟悉繁體中文使用者的閱讀習慣。
為以下品牌寫一則 ${input.platform} 貼文。

品牌：${input.brandTagline ?? "（請從 USP 反推主張）"}
品牌語氣：${input.brandVoice ?? "口語、溫暖、誠實"}

【平台原生結構（必讀）】
${guide}
${hookInstruction}${ctaInstruction}

【鐵則 — 違反任一條都算失敗】
1. 一篇貼文只聚焦 1 個 USP，不要試圖塞多個賣點。
2. 不要把 USP 原文照搬到貼文裡 — 用故事 / 場景 / 具體例子包裝，讓讀者自己感覺到。
3. **絕對不要把貼文標題或主題重複講兩次**。第一句和第二句不能在意思上重複。
4. 不要寫「祝大家 X 快樂」「希望大家 X」這種制式套話。
5. 不要使用 markdown / heading / bullet（除非平台規則明確要求）。
6. 字數要落在平台規則的範圍內，不要過長或過短。
7. 直接輸出貼文純文字，**不要寫「這是一則 ___ 貼文：」這種前綴**。
8. **嚴格遵守上方指定的 Hook 類型與 CTA 意圖** — 如果今天分配的是「數字驚奇」，就不能用「你有沒有遇過...」開場；如果今天 CTA 是「分享給朋友」，就不能寫「留言告訴我」。`;

      const user = `日期：${input.date}（${input.weekday}）
本篇要溝通的 USP：「${input.usp}」
${importantHint}

請依照平台原生結構 + 指定 Hook 類型 + 指定 CTA 意圖，直接寫出這則貼文。`;

      try {
        const r = await invokeLLM({
          provider: "anthropic",
          model: "claude-haiku-4-5",
          maxTokens: 600,
          messages: [
            { role: "system", content: sys },
            { role: "user", content: user },
          ],
        });
        let caption = r.choices[0]?.message?.content?.toString().trim() ?? "";
        // Strip common preamble leaks ("這是一則 FB 貼文：")
        caption = caption.replace(/^(以下是|這是)?[一個]?[則篇]?\s*[FBIYTGtbreadlinkBlog一-鿿]+貼文[：:]\s*/i, "").trim();
        // Strip surrounding quotes if model wrapped output
        if ((caption.startsWith("「") && caption.endsWith("」")) ||
            (caption.startsWith("\"") && caption.endsWith("\""))) {
          caption = caption.slice(1, -1).trim();
        }
        return { ok: true as const, caption };
      } catch (e: any) {
        return { ok: false as const, caption: "", error: String(e?.message ?? e) };
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
});
