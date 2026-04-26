/**
 * boardroomRouter — Shark-Tank-style multi-agent pitching.
 *
 * User submits a brief. Multiple personas (Carol Pearson / Al Ries /
 * Seth Godin / Mary Allen) each pitch a competing proposal. User reads
 * 4 cards side-by-side and picks / merges / rejects.
 *
 * Each persona is bound to a specific provider where possible, to
 * dramatise the multi-model orchestration story. Falls back to whatever
 * provider is available.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { callModel, type ModelProvider } from "../_core/multiModelRouter";

type PersonaDef = {
  id: string;
  name: string;
  title: string;
  /** One-line elevator: shown on the card header. */
  bio: string;
  preferredProvider: ModelProvider;
  system: string;
};

export const PERSONAS: Record<string, PersonaDef> = {
  "carol-pearson": {
    id: "carol-pearson",
    name: "Carol Pearson",
    title: "原型品牌學派 · The Hero and the Outlaw 作者",
    bio: "用 12 原型挖品牌靈魂，主張品牌要擁有單一英雄角色與清晰反派",
    preferredProvider: "openai",
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
    preferredProvider: "perplexity",
    system: `你是 Al Ries — 定位理論之父。
你看一切都是「在心智裡佔哪個格子」。
評估與提案時你會：
1. 點名類別的現有第一名是誰，他佔了什麼位置
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
    preferredProvider: "google",
    system: `你是 Seth Godin — 部落理論與紫牛理論作者。
你看一切都是「誰是你的部落、為什麼他們會跟你說同一個故事」。
評估與提案時你會：
1. 點名要服務的最小可行部落 (smallest viable tribe)
2. 設計一個能讓部落成員自我識別的儀式或符號
3. 提出一個能傳染（remarkable）的 campaign 點子

你的提案永遠包含：部落定義 / 儀式或符號 / 傳染機制 / 不可思議點。
語氣：簡短、有節奏、常用 short paragraph。中文回答。`,
  },

  "mary-allen": {
    id: "mary-allen",
    name: "Mary Allen",
    title: "Agency 操盤派 · 30 年 4A 經驗",
    bio: "務實老闆視角：時程、預算、執行可行性、KPI 看得見",
    preferredProvider: "cohere",
    system: `你是 Mary Allen — 大型 agency 退休 ECD，務實派。
你看一切都是「能不能執行、預算合不合、媒體買得到嗎、KPI 會多醜」。
評估與提案時你會：
1. 給出 3 階段執行 timeline（pre-launch / launch / sustain）
2. 估算媒體預算分配比例
3. 列出 3 個會死人的執行風險與對應 mitigation
4. 提出可量化的 KPI

你的提案永遠包含：時程 / 預算 / 風險 / KPI。
語氣：直率、不拐彎、用真實 agency 圈內語。中文回答。`,
  },
};

export const boardroomRouter = router({
  listPersonas: protectedProcedure.query(() => {
    return Object.values(PERSONAS).map((p) => ({
      id: p.id,
      name: p.name,
      title: p.title,
      bio: p.bio,
      preferredProvider: p.preferredProvider,
    }));
  }),

  run: protectedProcedure
    .input(
      z.object({
        brief: z.string().min(10),
        personaIds: z.array(z.string()).min(1).max(6),
        brandName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const personas: PersonaDef[] = input.personaIds
        .map((id) => PERSONAS[id])
        .filter((p): p is PersonaDef => Boolean(p));

      const userPrompt = `董事長提交的 brief：

${input.brief}

${input.brandName ? `品牌：${input.brandName}` : ""}

請依你的派系觀點，提出一份完整的提案。500-800 字，不要前綴自我介紹，直接進入提案。最後用一行寫「⚠ 我最大的擔憂：...」做為自我反駁。`;

      const pitches = await Promise.all(
        personas.map(async (p) => {
          try {
            const result = await callModel(
              [
                { role: "system", content: p.system },
                { role: "user", content: userPrompt },
              ],
              undefined,
              p.preferredProvider
            );
            return {
              personaId: p.id,
              name: p.name,
              title: p.title,
              bio: p.bio,
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
        pitches,
        timestamp: new Date().toISOString(),
      };
    }),
});
