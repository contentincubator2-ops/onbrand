/**
 * mediaHubRouter — Media Hub / 媒體中心
 *
 * The "Print Center" of Marketing OS：把策略 / 文案變成可上架的投放包。
 *
 * V1 範圍：
 *   - 6 個通路（Meta Ads = full ready, 其餘 = preview only）
 *   - prepareCampaign：吃 (asset, channel, config) → 用 LLM 生成 5 組
 *     ad copy variants，回 structured payload + Meta Ads CSV row 陣列
 *   - 真的 push 到 Meta API 不在 V1（要 OAuth + ad account 審核）
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { callModel } from "../_core/multiModelRouter";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

type ChannelDef = {
  id: string;
  name: string;
  platform: string;
  category: "ads" | "social" | "outreach" | "email";
  /** v1 ready means CSV / structured export is supported */
  status: "ready" | "preview";
  /** UI accent color */
  color: string;
  /** UI emoji-style logo char */
  logo: string;
  /** Short description shown on tile */
  pitch: string;
  /** What user gets at the end */
  exportFormat: string;
};

export const CHANNELS: ChannelDef[] = [
  {
    id: "meta-ads",
    name: "Meta Ads",
    platform: "Facebook + Instagram Ads",
    category: "ads",
    status: "ready",
    color: "#1877F2",
    logo: "Ⓜ",
    pitch: "5 組 ad copy 變體 + Meta Ads Manager bulk-upload CSV",
    exportFormat: "CSV (Meta Ads Manager schema)",
  },
  {
    id: "ig-schedule",
    name: "IG 排程",
    platform: "Instagram Feed + Stories",
    category: "social",
    status: "ready",
    color: "#E1306C",
    logo: "📷",
    pitch: "30 天貼文 schedule + 每篇 caption + hashtag 包",
    exportFormat: "CSV (Buffer / Hootsuite import schema)",
  },
  {
    id: "google-ads",
    name: "Google Ads",
    platform: "Google Search + Display",
    category: "ads",
    status: "preview",
    color: "#4285F4",
    logo: "G",
    pitch: "Search RSA 15 headlines + 4 descriptions + 關鍵字組",
    exportFormat: "CSV (Google Ads Editor schema)",
  },
  {
    id: "linkedin-ads",
    name: "LinkedIn Ads",
    platform: "LinkedIn Sponsored Content",
    category: "ads",
    status: "preview",
    color: "#0A66C2",
    logo: "in",
    pitch: "B2B 短文案 + 受眾建議 + InMail 樣版",
    exportFormat: "CSV (LinkedIn Campaign Manager)",
  },
  {
    id: "kol-brief",
    name: "KOL 派稿",
    platform: "KOL / Influencer outreach",
    category: "outreach",
    status: "preview",
    color: "#7849C2",
    logo: "✦",
    pitch: "KOL brief 一頁紙 + 個人化 outreach email",
    exportFormat: "PDF + Email batch",
  },
  {
    id: "email-blast",
    name: "Email 派送",
    platform: "Email Marketing",
    category: "email",
    status: "preview",
    color: "#E07AAE",
    logo: "✉",
    pitch: "Subject line A/B + body HTML + CTA 設計",
    exportFormat: "HTML + MJML",
  },
];

// ───── Asset library: pull recent quick-task outputs / boardroom adoptions ────
//
// V1 — we don't yet have a unified asset_library table, so this returns
// brand_brain entries (positioning / voice) as "ambient assets" plus a stub
// for the recent outputs which client passes in via sessionStorage.

export const mediaHubRouter = router({
  listChannels: protectedProcedure.query(() => CHANNELS),

  listBrandAssets: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const [rows] = (await db.execute(
          sql`SELECT id, category, title, content
              FROM brand_brain
              WHERE brand_id = ${input.brandId}
              ORDER BY updated_at DESC
              LIMIT 20`
        )) as any;
        return (rows ?? []).map((r: any) => ({
          id: `brain-${r.id}`,
          source: "brand-brain" as const,
          category: r.category,
          title: r.title,
          content: r.content,
        }));
      } catch {
        return [];
      }
    }),

  prepareCampaign: protectedProcedure
    .input(
      z.object({
        channelId: z.string(),
        brandName: z.string().optional(),
        brandId: z.number().optional(),
        /** Source asset — copy / pitch / strategy */
        assetText: z.string().min(10),
        config: z.object({
          objective: z
            .enum(["awareness", "traffic", "conversion", "engagement", "leadgen"])
            .default("conversion"),
          dailyBudget: z.number().min(50).default(500),
          durationDays: z.number().min(1).max(90).default(14),
          audience: z.string().optional(),
          tone: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      const channel = CHANNELS.find((c) => c.id === input.channelId);
      if (!channel) throw new Error(`Unknown channel: ${input.channelId}`);

      const totalBudget = input.config.dailyBudget * input.config.durationDays;

      // Brand context
      let brandPrefix = "";
      if (input.brandId) {
        try {
          const db = await getDb();
          if (db) {
            const [rows] = (await db.execute(
              sql`SELECT category, title, content FROM brand_brain
                  WHERE brand_id = ${input.brandId} ORDER BY updated_at DESC LIMIT 8`
            )) as any;
            if (rows && rows.length > 0) {
              brandPrefix =
                "\n\n[品牌大腦摘要]\n" +
                rows
                  .map((r: any) => `- ${r.category} / ${r.title}: ${r.content}`)
                  .join("\n");
            }
          }
        } catch {
          /* ignore */
        }
      }

      // Channel-specific system prompt
      const systemByChannel: Record<string, string> = {
        "meta-ads": `你是 Meta Ads campaign manager。輸出嚴格 JSON：
{
  "variants": [ // 5 個
    {
      "primary_text": "string (≤ 125 字)",
      "headline": "string (≤ 40 字)",
      "description": "string (≤ 30 字)",
      "cta": "Shop Now | Learn More | Sign Up | Get Offer | Book Now",
      "angle": "string — 這個變體的訴求角度"
    }
  ],
  "audience_suggestion": {
    "age": "18-65",
    "interests": ["..."],
    "behaviors": ["..."]
  },
  "placement": ["facebook_feed","instagram_feed","instagram_stories","reels"]
}
不要 markdown，只回純 JSON。`,
        "ig-schedule": `你是 Instagram content planner。輸出嚴格 JSON：
{
  "schedule": [ // 30 篇
    {
      "day": 1,
      "type": "feed | reel | story | carousel",
      "hook": "string",
      "caption": "string (≤ 200 字)",
      "hashtags": ["#a","#b","..."]
    }
  ]
}
產出 30 天，類型混用，不要 markdown。`,
        "google-ads": `你是 Google Ads RSA specialist。輸出嚴格 JSON：
{ "headlines": ["≤30 字 x 15"], "descriptions": ["≤90 字 x 4"], "keywords": ["..."], "negative_keywords": ["..."] }`,
        "linkedin-ads": `你是 LinkedIn B2B campaign expert。輸出嚴格 JSON：
{ "intro_text": "string", "headline": "string", "audience": { "job_titles": [], "industries": [], "company_size": "" }, "inmail_template": "string" }`,
        "kol-brief": `你是 KOL outreach specialist。輸出嚴格 JSON：
{ "kol_brief": { "campaign_goal": "", "deliverables": [], "key_messages": [], "do": [], "dont": [] }, "outreach_email": "string" }`,
        "email-blast": `你是 email marketing copywriter。輸出嚴格 JSON：
{ "subject_a": "string", "subject_b": "string", "preview_text": "string", "body_html": "string with simple HTML", "cta_button_text": "string" }`,
      };

      const userPrompt = `素材：
${input.assetText}

${input.brandName ? `品牌：${input.brandName}` : ""}
${brandPrefix}

投放設定：
- 目標：${input.config.objective}
- 日預算：NT$ ${input.config.dailyBudget}
- 期間：${input.config.durationDays} 天（總預算 NT$ ${totalBudget.toLocaleString()}）
${input.config.audience ? `- 受眾備註：${input.config.audience}` : ""}
${input.config.tone ? `- 語氣：${input.config.tone}` : ""}

請依上面 JSON schema 輸出，不要包 markdown，不要前言。`;

      // Use forge first (proven stable), fall back to qwen for Chinese content
      let result;
      try {
        result = await callModel(
          [
            { role: "system", content: (systemByChannel[channel.id] ?? systemByChannel["meta-ads"]) as string },
            { role: "user", content: userPrompt },
          ],
          undefined,
          "forge"
        );
      } catch (e) {
        result = await callModel(
          [
            { role: "system", content: (systemByChannel[channel.id] ?? systemByChannel["meta-ads"]) as string },
            { role: "user", content: userPrompt },
          ],
          undefined,
          "qwen"
        );
      }

      // Parse JSON, tolerant of code fences
      let payload: any = null;
      const raw = result.content.trim();
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
      try {
        payload = JSON.parse(cleaned);
      } catch {
        // try to extract first {...} block
        const m = cleaned.match(/\{[\s\S]*\}$/);
        if (m) {
          try {
            payload = JSON.parse(m[0]);
          } catch {
            /* still null */
          }
        }
      }

      // Build Meta Ads CSV rows when applicable
      let csvRows: string[][] | null = null;
      if (channel.id === "meta-ads" && payload?.variants) {
        const headers = [
          "Campaign Name",
          "Ad Set Name",
          "Ad Name",
          "Daily Budget",
          "Objective",
          "Primary Text",
          "Headline",
          "Description",
          "Call to Action",
          "Angle",
        ];
        csvRows = [headers];
        const campaignName = `${input.brandName ?? "Brand"}_${input.config.objective}_${new Date()
          .toISOString()
          .slice(0, 10)}`;
        for (const [i, v] of payload.variants.entries()) {
          csvRows.push([
            campaignName,
            `AdSet_${i + 1}`,
            `Ad_${i + 1}_${v.angle ?? "variant"}`,
            String(input.config.dailyBudget),
            input.config.objective,
            v.primary_text ?? "",
            v.headline ?? "",
            v.description ?? "",
            v.cta ?? "Learn More",
            v.angle ?? "",
          ]);
        }
      }

      return {
        channel,
        config: input.config,
        totalBudget,
        payload,
        csvRows,
        rawText: result.content,
        provider: result.provider,
        model: result.model,
        timestamp: new Date().toISOString(),
      };
    }),
});
