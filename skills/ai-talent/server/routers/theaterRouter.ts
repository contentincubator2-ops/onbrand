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

const PLATFORM_TONE: Record<z.infer<typeof PlatformZ>, string> = {
  facebook:  "FB 中長文（90-180 字），生活化口語，痛點 → 解方 → CTA。",
  instagram: "IG 短句斷行（60-120 字），視覺先行，emoji 輕點綴，最後一行 CTA。",
  youtube:   "YT 影片描述（120-200 字），鉤子第一句，三段大綱，觀看引導。",
  threads:   "Threads 串文風格（單則 50-100 字），口語、即時、可串接，避免 hashtag 灌水。",
  line:      "LINE 廣播訊息（80-120 字），單刀直入、強行動感，含 1 個明確 CTA + 連結提示。",
  blog:      "Blog 長文摘要（150-250 字），SEO 友善開頭、明確小標暗示、結尾導讀。",
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

      return {
        usps,
        chiefOpening,
        leadThoughts,
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
    }))
    .mutation(async ({ input }) => {
      const tone = PLATFORM_TONE[input.platform];
      const importantHint = input.importantDateName
        ? `當天有「${input.importantDateName}」檔期，請自然帶入主題。`
        : "";

      const sys = `你是專業的社群文案。為以下品牌寫一則貼文。
品牌：${input.brandTagline ?? "（請從 USP 反推）"}
品牌語氣：${input.brandVoice ?? "專業、溫暖、口語"}
平台規則：${tone}
鐵則：
- 一篇貼文只聚焦 1 個 USP
- 不要把 USP 原文照搬，要用故事或情境包裝
- 不要產出 markdown / heading / bullet
- 直接輸出貼文純文字，不要前後贅述`;

      const user = `日期：${input.date}（${input.weekday}）
本篇 USP：${input.usp}
${importantHint}

請寫出這則貼文。`;

      try {
        const r = await invokeLLM({
          provider: "anthropic",
          model: "claude-haiku-4-5",
          maxTokens: 500,
          messages: [
            { role: "system", content: sys },
            { role: "user", content: user },
          ],
        });
        const caption = r.choices[0]?.message?.content?.toString().trim() ?? "";
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
