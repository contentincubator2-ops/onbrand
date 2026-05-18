/**
 * mediaCopyRouter — three "media to copy" procedures (2026-05-18).
 *
 * 1. runPhoto  — upload image (base64) → brand-aligned platform copy via vision LLM
 * 2. runVideo  — YouTube URL → fetch oEmbed metadata → brand-aligned platform copy
 * 3. runDoc    — pre-extracted document text → brand-tone rewrite
 *
 * All procedures are protectedProcedure (JWT required).
 * Brand context is injected via buildBrandPrefix when brandId is supplied.
 * Vision calls go through invokeLLM with provider:"azure-position" (Claude sonnet —
 * the only vision-capable provider confirmed working on this stack). Falls back
 * through the standard chain if unavailable.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { buildBrandPrefix } from "../_core/brandContext";

// ─── Platform copy instructions ──────────────────────────────────────────────

const PLATFORM_INSTRUCTIONS: Record<string, string> = {
  fb: "Facebook post 150-300字, 親切自然語氣, 結尾加一句 CTA（例：留言告訴我們 / 點擊連結了解更多）",
  instagram: "IG caption 80-150字 + 空一行後列出 5-10 個 hashtag, feed post格式",
  tiktok: "TikTok caption 50-80字 + 在最後加上 3-5 個 trending hashtag, 開頭必須是能勾住注意力的 hook 句",
  youtube: "YouTube title（60字內，放第一行）+ description（300字，放 title 下方）+ tags（逗號分隔，放最後一行，前綴 Tags:）",
};

function getPlatformInstruction(platform: string): string {
  return PLATFORM_INSTRUCTIONS[platform] ?? PLATFORM_INSTRUCTIONS["fb"]!;
}

// ─── YouTube oEmbed helper ────────────────────────────────────────────────────

type OEmbedMeta = {
  title: string;
  author_name: string;
  thumbnail_url: string | null;
};

async function fetchYouTubeOEmbed(videoId: string): Promise<OEmbedMeta> {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": "SoWork-MarketingOS/1.0" } });
  if (!res.ok) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `無法取得 YouTube 影片資訊（HTTP ${res.status}）。請確認連結是公開影片。`,
    });
  }
  const data = await res.json() as any;
  return {
    title: String(data.title ?? ""),
    author_name: String(data.author_name ?? ""),
    thumbnail_url: typeof data.thumbnail_url === "string" ? data.thumbnail_url : null,
  };
}

function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match?.[1] ?? null;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const mediaCopyRouter = router({
  /**
   * runPhoto — upload a photo (base64) and get brand-aligned copy for a platform.
   *
   * The image is sent to Claude via the Anthropic vision message format.
   * Provider: azure-position (claude-sonnet-4-6) — the only confirmed vision-
   * capable endpoint on this stack. Falls through the standard cascade if unavailable.
   */
  runPhoto: protectedProcedure
    .input(
      z.object({
        imageBase64: z.string().min(1, "imageBase64 is required"),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
        platform: z.enum(["fb", "instagram", "tiktok", "youtube"]),
        brandId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const brandPrefix = await buildBrandPrefix(input.brandId ?? null, null, null, "core");
      const platformInstruction = getPlatformInstruction(input.platform);

      const systemPrompt =
        `你是一位專業的品牌行銷文案師。請依照以下品牌資訊與平台規格，看圖產出文案。` +
        `\n\n平台規格：${platformInstruction}` +
        (brandPrefix ? brandPrefix : "") +
        `\n\n語氣要求：自然、像真人朋友的口吻。不要 "親愛的客戶" 罐頭開場。直接交稿，不要前言解釋。`;

      const userPrompt =
        `請看這張圖，根據圖片內容與上方品牌資訊，產出符合規格的文案。`;

      // Strip data: URI prefix if present
      const base64Data = input.imageBase64.replace(/^data:[^;]+;base64,/, "");

      const result = await invokeLLM({
        provider: "azure-position", // claude-sonnet-4-6 — vision confirmed working
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${input.mimeType};base64,${base64Data}`,
                  detail: "high",
                },
              },
              { type: "text", text: userPrompt },
            ],
          },
        ],
        maxTokens: 800,
      });

      const content = result.choices[0]?.message?.content;
      const text = typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("")
          : "";

      return {
        copy: text.trim(),
        platform: input.platform,
        mediaType: "photo" as const,
      };
    }),

  /**
   * runVideo — provide a YouTube URL, get brand-aligned copy for a platform.
   *
   * Uses the YouTube oEmbed API (no API key needed) to fetch title + author,
   * then generates copy via the standard text LLM chain.
   */
  runVideo: protectedProcedure
    .input(
      z.object({
        youtubeUrl: z.string().url("請提供有效的 YouTube 網址"),
        platform: z.enum(["fb", "instagram", "tiktok", "youtube"]),
        brandId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Extract video ID
      const videoId = extractYouTubeVideoId(input.youtubeUrl);
      if (!videoId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "無法解析 YouTube 影片 ID，請確認網址格式（支援 youtu.be/xxx 和 youtube.com/watch?v=xxx）",
        });
      }

      // Fetch oEmbed metadata (title + author without API key)
      const meta = await fetchYouTubeOEmbed(videoId);

      const brandPrefix = await buildBrandPrefix(input.brandId ?? null, null, null, "core");
      const platformInstruction = getPlatformInstruction(input.platform);

      const systemPrompt =
        `你是一位專業的品牌行銷文案師。請依照影片資訊與平台規格，產出文案。` +
        `\n\n平台規格：${platformInstruction}` +
        (brandPrefix ? brandPrefix : "") +
        `\n\n語氣要求：自然、像真人朋友的口吻。不要 "親愛的客戶" 罐頭開場。直接交稿，不要前言解釋。`;

      const userPrompt =
        `YouTube 影片標題：「${meta.title}」\n` +
        `頻道名稱：${meta.author_name}\n\n` +
        `請根據以上影片資訊與品牌資訊，產出符合規格的文案。`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 800,
      });

      const content = result.choices[0]?.message?.content;
      const text = typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("")
          : "";

      return {
        copy: text.trim(),
        platform: input.platform,
        mediaType: "video" as const,
        videoTitle: meta.title,
        videoAuthor: meta.author_name,
      };
    }),

  /**
   * runDoc — pre-extracted text from a document (PDF/TXT) → brand-tone rewrite.
   *
   * Client-side extraction is assumed; this procedure only receives the plain text.
   */
  runDoc: protectedProcedure
    .input(
      z.object({
        docText: z.string().min(1, "docText is required").max(40000, "文件內容過長（上限 40,000 字）"),
        targetPlatform: z.string().optional(),
        brandId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const brandPrefix = await buildBrandPrefix(input.brandId ?? null, null, null, "full");

      const platformNote = input.targetPlatform
        ? `\n目標平台：${input.targetPlatform}（請依此平台的慣用語氣與長度調整文體）`
        : "";

      const systemPrompt =
        `你是一位專業的品牌文案改寫師。` +
        `請將用戶提供的文件內容，按照品牌的語氣與風格全文改寫。` +
        `\n\n改寫原則：` +
        `\n- 保留所有關鍵資訊、數據、事實（不得刪減或捏造）` +
        `\n- 調整語言風格、句子結構、用詞，使其貼合品牌語氣` +
        `\n- 適度分段，確保可讀性` +
        platformNote +
        (brandPrefix ? brandPrefix : "") +
        `\n\n直接輸出改寫後的完整文字，不要前言、不要標注「改寫後：」等前綴。`;

      const userPrompt =
        `請改寫以下文件內容：\n\n${input.docText}`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 4000,
      });

      const content = result.choices[0]?.message?.content;
      const text = typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("")
          : "";

      return {
        copy: text.trim(),
        mediaType: "doc" as const,
        targetPlatform: input.targetPlatform ?? null,
      };
    }),
});
