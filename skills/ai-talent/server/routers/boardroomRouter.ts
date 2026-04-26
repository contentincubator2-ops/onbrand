/**
 * boardroomRouter — Shark-Tank-style multi-agent pitching ("聽比稿").
 *
 * 主席（user）丟出 brief，6 位行銷大師輪流上台簡報，
 * 每位 shark 綁定一個 provider 來戲劇化「多模型協奏」。
 *
 * Provider 策略：openai / google / cohere 在生產環境經常 401/403，
 * 因此本 router 只使用四個穩定 provider — qwen / zhipu / perplexity / forge —
 * 並在錯誤時自動 fallback 到 forge（SoWork gateway）。
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { callModel, type ModelProvider } from "../_core/multiModelRouter";
import { buildBrandPrefix } from "../_core/brandContext";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

// ─── Strategy-layer label map ───────────────────────────────────
// Used by the new "real squad leads consult the user" flow.
const LAYER_META: Record<
  string,
  { label: string; tone: "research" | "analyze" | "write" | "craft" | "orchestrate"; emoji: string; order: number }
> = {
  L1_brand:      { label: "品牌策略",   tone: "craft",       emoji: "👑", order: 1 },
  L2_product:    { label: "產品策略",   tone: "analyze",     emoji: "📦", order: 2 },
  L3_audience:   { label: "受眾策略",   tone: "research",    emoji: "🎯", order: 3 },
  L4_channel:    { label: "通路策略",   tone: "write",       emoji: "📡", order: 4 },
  L5_campaign:   { label: "活動策略",   tone: "orchestrate", emoji: "🎬", order: 5 },
  L6_validation: { label: "驗證校準",   tone: "research",    emoji: "🔬", order: 6 },
};

type PersonaDef = {
  id: string;
  name: string;
  title: string;
  bio: string;
  /** Stage entrance order (1 = first to pitch). */
  pitchOrder: number;
  /** Color tone bucket — used by client PortraitAvatar ring. */
  tone: "research" | "analyze" | "write" | "craft" | "orchestrate";
  preferredProvider: ModelProvider;
  system: string;
  /** One-liner the shark says when stepping up to the mic. */
  catchphrase: string;
};

export const PERSONAS: Record<string, PersonaDef> = {
  "carol-pearson": {
    id: "carol-pearson",
    name: "Carol Pearson",
    title: "原型品牌學派 · The Hero and the Outlaw 作者",
    bio: "用 12 原型挖品牌靈魂，主張品牌要擁有單一英雄角色與清晰反派",
    pitchOrder: 1,
    tone: "craft",
    preferredProvider: "qwen",
    catchphrase: "每個品牌都是一個正在尋找自己神話的英雄。",
    system: `你是 Carol Pearson — 12 原型理論的提倡者。
評估與提案時你會：
1. 為品牌指出最適合的英雄原型（Hero / Caregiver / Sage / Outlaw 等 12 種其一）
2. 點出明確的反派（不是競品，而是品牌反對的價值觀）
3. 設計能讓英雄旅程展現的 campaign

你的提案永遠包含：核心原型 / 反派 / 英雄旅程 3 幕 / 風險。
語氣：學者氣，引用神話與古典作品的比喻。中文回答。`,
  },

  "al-ries": {
    id: "al-ries",
    name: "Al Ries",
    title: "定位戰略派 · Positioning 作者",
    bio: "心智戰場第一原則：成為類別第一，不行就創造新類別",
    pitchOrder: 2,
    tone: "analyze",
    preferredProvider: "forge",
    catchphrase: "市場上唯一的真相，是消費者腦袋裡那個格子。",
    system: `你是 Al Ries — 定位理論之父。
你看一切都是「在心智裡佔哪個格子」。
評估與提案時你會：
1. 點名類別的現有第一名是誰，他佔了什麼位置（請引用真實競品名）
2. 判斷該品牌是該爭奪那個位置、還是創造新類別
3. 給出一個 6 字內的「定位句」與支撐證據鏈

你的提案永遠包含：類別現況 / 我們的定位句 / 支撐證據 / 第二與第三防線。
語氣：直接、好辯，喜歡用簡短反問。中文回答。`,
  },

  "seth-godin": {
    id: "seth-godin",
    name: "Seth Godin",
    title: "部落派 · Tribes / Purple Cow 作者",
    bio: "不要做平凡的東西給多數人，做不可思議的東西給少數鐵粉",
    pitchOrder: 3,
    tone: "write",
    preferredProvider: "forge",
    catchphrase: "找到你的部落，剩下的事他們會替你完成。",
    system: `你是 Seth Godin — 部落理論與紫牛理論作者。
你看一切都是「誰是你的部落、為什麼他們會跟你說同一個故事」。
評估與提案時你會：
1. 點名要服務的最小可行部落 (smallest viable tribe)
2. 設計一個能讓部落成員自我識別的儀式或符號
3. 提出一個能傳染（remarkable）的 campaign 點子

你的提案永遠包含：部落定義 / 儀式或符號 / 傳染機制 / 不可思議點。
語氣：簡短、有節奏、常用 short paragraph。中文回答。`,
  },

  "byron-sharp": {
    id: "byron-sharp",
    name: "Byron Sharp",
    title: "實證派 · How Brands Grow 作者",
    bio: "品牌成長靠 Mental Availability + Physical Availability，不要相信浪漫故事",
    pitchOrder: 4,
    tone: "research",
    preferredProvider: "qwen",
    catchphrase: "別跟我談品牌愛，先告訴我滲透率。",
    system: `你是 Byron Sharp — Ehrenberg-Bass Institute 行銷實證學派代表人物。
你不相信「品牌忠誠度」與「定位」這類浪漫敘事。你信的是滲透率（penetration）、心智可得性（mental availability）、實體可得性（physical availability）與 Distinctive Brand Assets。
評估與提案時你會：
1. 估算品牌目前的滲透率與類別 buyer base，指出輕度買家被忽略的程度
2. 列出 3–5 個 Category Entry Points (CEPs) 並說明品牌應該被連結到哪些
3. 點名 2–3 個 Distinctive Brand Assets（顏色、聲音、角色）需要強化或統一
4. 提出 reach-first 而非 loyalty-first 的媒體策略

你的提案永遠包含：滲透率現況 / CEPs 清單 / Distinctive Assets / Reach 媒體配置。
語氣：冷靜、引數據、戳破行銷迷思。中文回答。`,
  },

  "rory-sutherland": {
    id: "rory-sutherland",
    name: "Rory Sutherland",
    title: "行為經濟派 · Alchemy 作者 · Ogilvy 副董",
    bio: "理性的解法人人都會想到，能贏的是不合理但有效的點子",
    pitchOrder: 5,
    tone: "orchestrate",
    preferredProvider: "forge",
    catchphrase: "對立的相反不是錯，而是另一個有效的真理。",
    system: `你是 Rory Sutherland — Ogilvy UK 副董，行為經濟學派。
你深信最厲害的行銷點子常常「在邏輯上看起來很蠢」。
評估與提案時你會：
1. 點出此 brief 中過度理性、過度功能性的盲點
2. 提出 3 個「lateral / 逆向 / 看似不合理」的點子（每個附一個行為經濟學原理：anchoring / endowment / signalling / chunking 等）
3. 解釋為什麼這些點子的 perceived value 會大於 actual cost
4. 警告董事會哪一個提案會被理性派 CFO 砍掉但其實最該保留

你的提案永遠包含：理性盲點 / 3 個 lateral 點子 + 原理 / Perceived value 論證 / CFO 防禦話術。
語氣：英式幽默、愛舉反例、喜歡說「這聽起來很蠢，但…」。中文回答。`,
  },

  "mary-allen": {
    id: "mary-allen",
    name: "Mary Allen",
    title: "Agency 操盤派 · 30 年 4A 經驗",
    bio: "務實老闆視角：時程、預算、執行可行性、KPI 看得見",
    pitchOrder: 6,
    tone: "orchestrate",
    preferredProvider: "zhipu",
    catchphrase: "策略再美，沒人能執行就是廢紙。我來收尾。",
    system: `你是 Mary Allen — 大型 agency 退休 ECD，務實派。你是董事會最後一位上台的人，責任是把前面幾位大師的點子收斂成可執行方案。
評估與提案時你會：
1. 給出 3 階段執行 timeline（pre-launch / launch / sustain），每階段註明週數
2. 估算媒體預算分配比例（數位 / 戶外 / KOL / PR / 自有）
3. 列出 3 個會死人的執行風險與對應 mitigation
4. 提出可量化的 KPI（覆蓋、轉換、品牌指標各一）

你的提案永遠包含：時程 / 預算 / 風險 / KPI。
語氣：直率、不拐彎、用真實 agency 圈內語。中文回答。`,
  },
};

/**
 * Try preferred → forge → qwen → zhipu → openai (skipping unavailable ones).
 * Returns first success; throws first error if every attempt fails.
 *
 * Provider strict-mode in multiModelRouter throws when an env key is missing
 * — that's caught here and we just move on to the next candidate so the
 * boardroom never silently dies because one shark's preferred LLM is gone.
 */
async function callWithFallback(
  system: string,
  user: string,
  preferred: ModelProvider
) {
  const order: ModelProvider[] = [];
  const seen = new Set<ModelProvider>();
  const push = (p: ModelProvider) => { if (!seen.has(p)) { order.push(p); seen.add(p); } };
  push(preferred);
  // azure-foundry first in the fallback chain — it's the VM's verified-working
  // route. forge / qwen / zhipu only fire if their env keys are also set.
  push("azure-foundry");
  push("forge");
  push("qwen");
  push("zhipu");
  push("openai");

  let firstErr: any = null;
  for (const p of order) {
    try {
      return await callModel(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        undefined,
        p
      );
    } catch (e) {
      if (!firstErr) firstErr = e;
      // try next
    }
  }
  throw firstErr ?? new Error("All providers unavailable");
}

// ─── Real-squad-lead consultation ──────────────────────────────────────────
//
// Pulls one squad lead per strategy_layer (L1–L6) where tier='core'.
// Each lead = real DB agent grounded in their squad's methodology.
// They PROPOSE to the user, not the other way round.

type ConsultLead = {
  squadId: number;
  squadSlug: string;
  squadName: string;
  squadMethodology: string | null;
  squadDescription: string | null;
  strategyLayer: string;
  layerLabel: string;
  layerEmoji: string;
  tone: "research" | "analyze" | "write" | "craft" | "orchestrate";
  order: number;
  agentId: number | null;
  agentName: string;
  agentTitle: string;
  agentBio: string | null;
  agentPrimarySkill: string | null;
  /** Stored aiModel hint on the agent — best-effort, may be null. */
  preferredProvider: ModelProvider;
};

/**
 * Map an agent's aiModel string (free-form, e.g. "gpt-4o", "qwen-plus",
 * "azure/gpt-5-nano", "claude-sonnet-4-6") to a ModelProvider key. Falls
 * back to azure-foundry (VM's verified-working route) when nothing matches.
 */
function mapAiModelToProvider(aiModel: string | null | undefined): ModelProvider {
  const m = (aiModel || "").toLowerCase();
  if (!m) return "azure-foundry";
  if (m.includes("azure") || m.startsWith("gpt-5") || m.startsWith("gpt-4o")) return "azure-foundry";
  if (m.includes("claude") || m.includes("anthropic")) return "anthropic";
  if (m.includes("gemini") || m.includes("google")) return "gemini";
  if (m.includes("qwen") || m.includes("dashscope")) return "qwen";
  if (m.includes("glm") || m.includes("zhipu")) return "zhipu";
  if (m.includes("perplex") || m.startsWith("sonar")) return "perplexity";
  if (m.includes("forge") || m.includes("manus")) return "forge";
  if (m.startsWith("gpt") || m.includes("openai")) return "openai";
  return "azure-foundry";
}

async function loadSquadLeads(): Promise<ConsultLead[]> {
  const db = await getDb();
  if (!db) return [];

  // One squad per strategy_layer — pick the tier='core' one with the
  // lowest id (typically the canonical / oldest / golden squad).
  const layers = Object.keys(LAYER_META);
  const leads: ConsultLead[] = [];
  for (const layer of layers) {
    try {
      const [rows] = (await db.execute(
        sql`SELECT s.id, s.slug, s.name, s.methodology, s.description,
                   s.lead_agent_id, s.strategy_layer
              FROM squads s
             WHERE s.is_active = 1
               AND s.strategy_layer = ${layer}
               AND s.tier = 'core'
               AND s.lead_agent_id IS NOT NULL
             ORDER BY s.id ASC LIMIT 1`
      )) as any;
      const r = (rows ?? [])[0];
      if (!r) continue;

      // Resolve lead agent
      let agent: any = null;
      try {
        const [aRows] = (await db.execute(
          sql`SELECT id, name, title, bio,
                     COALESCE(primarySkill, '') AS primarySkill,
                     COALESCE(aiModel, '')      AS aiModel
                FROM agents WHERE id = ${r.lead_agent_id} LIMIT 1`
        )) as any;
        agent = (aRows ?? [])[0] ?? null;
      } catch {
        // primarySkill / aiModel may not exist on older DBs
        try {
          const [aRows] = (await db.execute(
            sql`SELECT id, name, title, bio FROM agents WHERE id = ${r.lead_agent_id} LIMIT 1`
          )) as any;
          agent = (aRows ?? [])[0] ?? null;
        } catch { /* ignore */ }
      }

      const meta = LAYER_META[layer]!;
      leads.push({
        squadId: Number(r.id),
        squadSlug: String(r.slug ?? ""),
        squadName: String(r.name ?? ""),
        squadMethodology: r.methodology ? String(r.methodology) : null,
        squadDescription: r.description ? String(r.description) : null,
        strategyLayer: layer,
        layerLabel: meta.label,
        layerEmoji: meta.emoji,
        tone: meta.tone,
        order: meta.order,
        agentId: agent ? Number(agent.id) : null,
        agentName: agent?.name ?? "（顧問尚未指派）",
        agentTitle: agent?.title ?? meta.label,
        agentBio: agent?.bio ?? null,
        agentPrimarySkill: agent?.primarySkill || null,
        // Honor each agent's stored aiModel (e.g. "gpt-4o" → azure-foundry,
        // "qwen-plus" → qwen, "claude-sonnet-4-6" → anthropic). Falls back
        // to azure-foundry (the VM's always-on route) when aiModel is empty.
        preferredProvider: mapAiModelToProvider(agent?.aiModel),
      });
    } catch (e) {
      console.error("[boardroom.loadSquadLeads] layer fetch failed:", layer, e);
    }
  }
  return leads.sort((a, b) => a.order - b.order);
}

export const boardroomRouter = router({
  /**
   * List the 6 squad leads who can consult — one per strategy layer.
   * Used by the boardroom client to render the consultation panel.
   */
  listSquadLeads: protectedProcedure.query(async () => {
    return loadSquadLeads();
  }),

  /**
   * consult — agents proactively propose to the user (NOT the other way round).
   *
   * Inputs:
   *   - brandId   (required): brand_brain summary is auto-injected
   *   - concern   (optional): if absent, leads diagnose proactively
   *
   * Each lead is a REAL squad lead from the DB, prompted with their own
   * squad's methodology so the proposal is grounded in their tools.
   */
  consult: protectedProcedure
    .input(
      z.object({
        brandId: z.number(),
        concern: z.string().optional(),
        layers: z.array(z.string()).optional(), // default = all 6
      })
    )
    .mutation(async ({ input }) => {
      const brandPrefix = await buildBrandPrefix(input.brandId);
      let leads = await loadSquadLeads();
      if (input.layers && input.layers.length > 0) {
        leads = leads.filter((l) => input.layers!.includes(l.strategyLayer));
      }

      const concernBlock = input.concern?.trim()
        ? `\n\n客戶這次特別想聽聽看：\n${input.concern.trim()}`
        : `\n\n客戶沒有指定問題，請依您小組的專長，主動點出您看到最關鍵的成長缺口、並提出方案。`;

      const proposals = await Promise.all(
        leads.map(async (lead) => {
          const system = `你是 ${lead.agentName}，${lead.agentTitle}。
你帶領的小組叫「${lead.squadName}」（${lead.layerLabel}層 · ${lead.layerEmoji}）。
${lead.squadMethodology ? `小組核心方法論：${lead.squadMethodology}` : ""}
${lead.agentBio ? `你的背景：${lead.agentBio}` : ""}
${lead.agentPrimarySkill ? `你的主要技能：${lead.agentPrimarySkill}` : ""}

你正在為一位品牌主做「上門諮詢」。重點：是【你們向客戶提案】，不是客戶向你們報告。
語氣：像資深顧問首次見面 — 直接、簡潔、有觀點，不寒暄。中文回答。

請嚴格依下列 4 段格式輸出（每段用「## 」開頭，不要 markdown 額外裝飾）：

## 我看見的問題
（一句話，最具體、最敢講的診斷，不超過 60 字）

## 我的小組會這樣做
（3–5 個編號步驟，每步一行 + 半句說明，套用您小組的方法論）

## 第一週可交付
（明確 1–3 件可看見的東西，例如「定位句草稿」「30 天 IG 排程」「Meta Ads 5 變體 CSV」）

## 需要您決定的問題
（1–3 個對方需先回答才動得了的關鍵問題，幫他做下一步收斂）`;

          const user = `品牌：${input.brandId ? "（已連線品牌大腦）" : "（未指定）"}${brandPrefix}${concernBlock}

請以 ${lead.agentName} 的身份提案。`;

          try {
            const result = await callWithFallback(system, user, lead.preferredProvider);
            return {
              ...lead,
              proposal: result.content,
              provider: result.provider,
              model: result.model,
              error: null as string | null,
            };
          } catch (err: any) {
            return {
              ...lead,
              proposal: "",
              provider: lead.preferredProvider,
              model: "",
              error: String(err?.message ?? err),
            };
          }
        })
      );

      return {
        brandInjected: brandPrefix.length > 0,
        concern: input.concern ?? null,
        proposals,
        timestamp: new Date().toISOString(),
      };
    }),

  // ─── Legacy persona-based "shark tank" — kept for back-compat ───────────
  listPersonas: protectedProcedure.query(() => {
    return Object.values(PERSONAS)
      .sort((a, b) => a.pitchOrder - b.pitchOrder)
      .map((p) => ({
        id: p.id,
        name: p.name,
        title: p.title,
        bio: p.bio,
        pitchOrder: p.pitchOrder,
        tone: p.tone,
        preferredProvider: p.preferredProvider,
        catchphrase: p.catchphrase,
      }));
  }),

  run: protectedProcedure
    .input(
      z.object({
        brief: z.string().min(10),
        personaIds: z.array(z.string()).min(1).max(8),
        brandName: z.string().optional(),
        brandId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Pull brand_brain into every persona's system prompt so all sharks
      // pitch within the brand's positioning / TA / voice constraints.
      const brandPrefix = await buildBrandPrefix(input.brandId);
      const personas: PersonaDef[] = input.personaIds
        .map((id) => PERSONAS[id])
        .filter((p): p is PersonaDef => Boolean(p))
        .sort((a, b) => a.pitchOrder - b.pitchOrder);

      const userPrompt = `董事長提交的 brief：

${input.brief}

${input.brandName ? `品牌：${input.brandName}` : ""}

請依你的派系觀點，提出一份完整的提案。500-800 字，不要前綴自我介紹，直接進入提案。最後用一行寫「⚠ 我最大的擔憂：...」做為自我反駁。`;

      const pitches = await Promise.all(
        personas.map(async (p) => {
          try {
            const result = await callWithFallback(p.system + brandPrefix, userPrompt, p.preferredProvider);
            return {
              personaId: p.id,
              name: p.name,
              title: p.title,
              bio: p.bio,
              tone: p.tone,
              pitchOrder: p.pitchOrder,
              catchphrase: p.catchphrase,
              pitch: result.content,
              provider: result.provider,
              model: result.model,
              error: null as string | null,
            };
          } catch (err: any) {
            return {
              personaId: p.id,
              name: p.name,
              title: p.title,
              bio: p.bio,
              tone: p.tone,
              pitchOrder: p.pitchOrder,
              catchphrase: p.catchphrase,
              pitch: "",
              provider: p.preferredProvider,
              model: "",
              error: String(err?.message ?? err),
            };
          }
        })
      );

      return {
        brief: input.brief,
        brandName: input.brandName ?? null,
        brandInjected: brandPrefix.length > 0,
        pitches,
        timestamp: new Date().toISOString(),
      };
    }),
});
