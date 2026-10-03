/**
 * 修稿與輔助：換人重寫、潤飾輸入、改寫草稿、影片腳本。
 */
import { protectedProcedure } from "../../../platform/core/trpc";
import { z } from "zod";
import { callModel } from "../../../platform/core/llm/multiModelRouter";
import { loadAgentKnowledge } from "../../../platform/core/agents/agentKnowledge";
import localPool from "../../../localDb";
import { TRPCError } from "@trpc/server";
import { resolveTaskTemplate } from "../../core/catalog/taskRegistry";
import { findFirstUrl, fetchUrlSummary, formatUrlSummaryForPrompt } from "../../../platform/core/web/urlContext";
import { isWuganVoiceTemplate, validateWuganVoice, repairWuganVoice } from "../../core/engine/wuganVoiceContract";
import { buildBrandPrefix as buildBrandContext } from "../../../strategy/core/brand/brandContext";

export const refineProcedures = {
  // refineCaption — AI chat-style refinement. User sees the current caption +
  // gives feedback ("更年輕一點" / "把第二段刪掉" / "加入媽媽節情緒"), the
  // agent rewrites it inline. Replaces the old "換語氣 → 跳到 /brands" flow.
  refineCaption: protectedProcedure
    .input(z.object({
      // 2026-07-07: was 5000 — long-form outputs (email sequences, PR
      // toolkits, YT scripts) exceeded it and the rewrite-agent picker
      // failed with a zod error on those tasks.
      currentCaption: z.string().min(1).max(20000),
      userFeedback: z.string().min(1).max(1000),
      // Canonical mos_db id wins over display labels.
      agentId: z.number().int().positive().optional(),
      agentName: z.string().max(120).optional(),
      agentTitle: z.string().max(200).optional(),
      brandId: z.number().optional(),
      // 2026-09-29：原本那篇是替哪個產品／活動寫的——改寫也要讀同一份範圍。
      productId: z.number().optional(),
      eventId: z.number().optional(),
      // 2026-09-29：這篇是哪張卡 —— 帶了就套這張卡的字數與形式（rewriteContract.ts）。
      taskId: z.string().max(80).optional(),
      // Conversation history (optional) — last 6 turns
      history: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(3000),
      })).max(12).optional(),
    }))
    .mutation(async ({ input }) => {
      const { callModel } = await import("../../../platform/core/llm/multiModelRouter");
      const { buildBrandPrefix } = await import("../../../strategy/core/brand/brandContext");
      const { loadAgentKnowledge } = await import("../../../platform/core/agents/agentKnowledge");
      const brandPrefix = await buildBrandPrefix(input.brandId, input.productId ?? null, input.eventId ?? null, "full").catch(() => "");

      let agentName = input.agentName ?? "資深文案";
      let agentTitle = input.agentTitle ?? "Brand Copywriter";
      let agentKnowledge = "";
      if (input.agentId) {
        const [rows]: any = await localPool.execute(
          `SELECT id, name, title FROM agents WHERE id = ? AND isAvailable = 1 LIMIT 1`,
          [input.agentId],
        );
        const agent = rows?.[0];
        if (!agent) throw new TRPCError({ code: "BAD_REQUEST", message: "Selected rewrite agent is unavailable." });
        agentName = agent.name || agentName;
        agentTitle = agent.title || agentTitle;
        agentKnowledge = await loadAgentKnowledge(agent.id, { source: "quickTask.refineCaption" }).catch(() => "");
      }

      const contract = await import("../../core/engine/rewriteContract");
      let spec: import("../../core/engine/rewriteContract").RewriteSpec = {};
      if (input.taskId) {
        const { resolveOrchestraConfig } = await import("../../core/catalog/taskRegistry");
        const [tpl, cfg]: any = await Promise.all([
          resolveTaskTemplate(input.taskId).catch(() => null),
          resolveOrchestraConfig(input.taskId).catch(() => null),
        ]);
        const label = tpl?.label;
        spec = {
          label: typeof label === "string" ? label : (label?.zh ?? label?.en ?? null),
          minChars: cfg?.captionMinChars ?? null,
          maxChars: cfg?.captionMaxChars ?? null,
        };
      }



      const system =
        `你是 ${agentName}（${agentTitle}），正在跟用戶討論這篇文案的修改方向。\n` +
        `任務：根據用戶的修改意見，**重寫**整篇文案。輸出格式：\n` +
        `1. 第一段：1-2 句說明你怎麼理解用戶的意見、改了什麼\n` +
        `2. 接著 3 個 newline 分隔\n` +
        `3. 最後是完整的**修改後文案**（不要省略，不要寫 "如下"，直接給完整版）\n\n` +
        `重要：保留原本能用的部分，只動用戶提到的地方。語氣自然口語。\n` +
        (agentKnowledge ? `\n【此 agent 的工作守則與專業能力】\n${agentKnowledge}\n` : "") +
        brandPrefix +
        // 合約接在最後：最後讀到的最有力，換人時個人風格不能蓋過這張卡的形式。
        contract.rewriteContractBlock(spec);

      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: system },
        { role: "user", content: `這是目前的文案：\n\n${input.currentCaption}` },
        ...(input.history ?? []),
        { role: "user", content: input.userFeedback },
      ];
      try {
        // 2026-05-17: was "qwen" (Chinese model, zh-TW policy violation)
        // → anthropic for Taiwan-correct output.
        const parse = (raw: string) => {
          const text = (raw ?? "").trim();
          // Split on triple newline to separate explanation from rewritten caption
          let parts = text.split(/\n\n\n+/);
          // 2026-07-07 (verified live on /run/2887): models sometimes use a
          // markdown horizontal rule as the separator instead of blank lines —
          // the triple-newline split then fails and the explanation + '---'
          // leak into the published caption. Fall back to splitting on the hr.
          if (parts.length === 1) {
            parts = text.split(/\n+[-—_*]{3,}\s*\n+/);
          }
          const explanation = parts.length > 1 ? (parts[0] ?? "").trim() : "";
          let rewritten = parts.length > 1 ? parts.slice(1).join("\n\n").trim() : text;
          rewritten = rewritten.replace(/^(?:[-—_*]{3,}\s*\n+)+/, "").replace(/\n+(?:[-—_*]{3,}\s*)+$/, "").trim();
          return { explanation, rewritten: contract.stripMarkdown(rewritten) };
        };
        const r = await callModel(messages, undefined, "anthropic");
        let { explanation, rewritten } = parse(r.content ?? "");
        // 驗證重試：超過這張卡的字數上限 25% → 帶著實際字數要求濃縮一次。還是太長就照給，不硬截斷。
        if (contract.isOverLimit(rewritten, spec)) {
          const r2 = await callModel([
            ...messages,
            { role: "assistant", content: r.content ?? "" },
            { role: "user", content: contract.shortenRequest(rewritten, spec) },
          ], undefined, "anthropic").catch(() => null);
          const second = r2 ? parse(r2.content ?? "") : null;
          if (second?.rewritten && contract.countChars(second.rewritten) < contract.countChars(rewritten)) {
            rewritten = second.rewritten;
            explanation = explanation || second.explanation;
          }
        }
        // Brand-rule hard enforcement: an inline rewrite must not
        // reintroduce banned words / skip substitutions.
        // 2026-09-30（CJ「換人重寫、對話修改也要合規檢查」）：接著過法規合規檢查。
        let regulationCompliance: import("../../core/engine/regulationCompliance").RegulationComplianceRecord | null = null;
        try {
          const { enforceBrandAndRegulations } = await import("../../core/engine/regulationCompliance");
          const checked = await enforceBrandAndRegulations(input.brandId, rewritten);
          rewritten = checked.text;
          regulationCompliance = checked.record;
        } catch { /* fail-safe */ }
        return { explanation, rewritten, ok: true, regulationCompliance };
      } catch (e: any) {
        return { explanation: "", rewritten: "", ok: false, error: e?.message ?? String(e) };
      }
    }),

  // 2026-05-18 (CJ「建立任務時加 AI 潤稿，潤完直接改寫輸入框」): a
  // conservative, task-aware polish of the user's brief BEFORE it goes
  // to the executing agent. Rewrites in place (client replaces textarea).
  // Hard rule: never fabricate facts — only restructure/clarify what the
  // user wrote and bracket any missing specifics as 「[請補充 …]」.
  polishInput: protectedProcedure
    .input(z.object({
      taskId: z.string().min(1).max(64),
      text: z.string().min(1).max(8000),
      taskLabel: z.string().max(200).optional(),
      primaryQuestion: z.string().max(400).optional(),
      brandId: z.number().optional(),
      productId: z.number().optional(),
      eventId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      // light cost guard — this is a tiny call but still bills tokens
      try {
        const { preflightCostCheck } = await import("../../../platform/core/llm/llmWithBilling");
        const g = await preflightCostCheck(userId);
        if (!g.ok) throw new TRPCError({ code: "FORBIDDEN", message: g.reason });
      } catch (e) { if (e instanceof TRPCError) throw e; /* guard optional */ }

      const { callModel } = await import("../../../platform/core/llm/multiModelRouter");
      const { buildBrandPrefix } = await import("../../../strategy/core/brand/brandContext");
      // 2026-09-29：完整品牌大腦＋這張任務選的產品／活動（以前只給精簡 digest、不帶產品）。
      const brandPrefix = await buildBrandPrefix(input.brandId, input.productId ?? null, input.eventId ?? null, "full").catch(() => "");

      // 2026-09-01 (CJ「AI 潤稿當中的十築，根本不是官網定義的十築」):
      // brandPrefix 是通用的品牌 digest，沒有任何任務專屬知識，所以模型會
      // 自己編領域詞彙。把該任務的 polishHint 帶進來。
      // 2026-09-02: 這裡本來只查 pack + FB + IG + Website，其他頻道的
      // polishHint 寫了也讀不到。改走 registry，全部頻道一致。
      const polishTemplate = await resolveTaskTemplate(input.taskId);
      const hintBlock = polishTemplate?.polishHint
        ? `

【這個任務必須知道的事實 —— 只能從這裡取用專有名詞，不要自己造】
${polishTemplate.polishHint}`
        : "";

      // 使用者按下潤稿時往往還沒有想法（CJ：「我按下生活實踐的文章時，一定是
      // 毫無頭緒，想獲得你的想法」）。素材太短時「整理」沒有意義，模型只能
      // 反問使用者要他補充 —— 剛好跟使用情境相反。改成提案模式。
      const bare = input.text.trim();
      const proposeMode = bare.length < 40;

      // 2026-05-18 (CJ「只填網址時，AI 潤稿也要讀取該網址」): if the user
      // pasted (mostly) a URL, polishing the bare link is useless. Detect
      // + fetch the page and feed its content in, so the polish produces
      // a real brief grounded in the actual page — still no fabrication
      // beyond what the page / user wrote.
      let urlBlock = "";
      let fetchedUrl: string | null = null;
      try {
        const { findFirstUrl, fetchUrlSummary, formatUrlSummaryForPrompt } =
          await import("../../../platform/core/web/urlContext");
        const url = findFirstUrl(input.text);
        if (url) {
          const summary = await fetchUrlSummary(url);
          if (summary) {
            fetchedUrl = url;
            urlBlock = "\n\n" + formatUrlSummaryForPrompt(summary);
          }
        }
      } catch { /* fetch is best-effort — fall back to text only */ }

      const taskHint = input.taskLabel || input.taskId;
      const qHint = input.primaryQuestion ? `（這個任務問用戶的問題是：「${input.primaryQuestion}」）` : "";
      const urlRule = fetchedUrl
        ? `7. 用戶主要只給了一個連結；系統已抓取該頁內容（見下方【已抓取參考連結】）。請以「該頁實際內容」為素材主體整理出 brief，並保留原始連結；不要寫成通用模板，要呼應這篇的具體訊息。仍然只能用頁面上或用戶寫的事實，不可自行新增。\n`
        : "";
      // 提案模式：素材太短代表使用者還沒有想法，這時「整理」沒有意義。
      const proposeSystem =
        `你是資深行銷企劃。用戶點開了任務「${taskHint}」${qHint}，但還沒有具體想法，想先看你的方向建議。
` +
        `請提出 3 個具體、可以直接執行的選題。

` +
        `每個建議照這個格式：
` +
        `【建議 N】<一句話的題目>
` +
        `　對應標準：<從下方任務知識裡挑一項，用它的正式名稱>
` +
        `　切角：<2 句。從什麼生活情境或身體感受切入，要具體到看得到畫面>
` +
        `　為什麼適合：<1 句>

` +
        `規則：
` +
        `1. 專有名詞只能用下方品牌資料與任務知識裡確實有的，絕對不可自己造（標準名稱、建案名、認證、獎項、數據一律不得杜撰）。
` +
        `2. 三個建議要用不同的標準、不同的切入角度，不要三個都在講同一件事。
` +
        `3. 不要綁特定節慶，除非用戶自己提到。
` +
        `4. 全文正向直述，嚴禁「不是⋯而是⋯」「不只是⋯而是⋯」「而不是⋯」等否定轉折句型。
` +
        `5. 第一行先寫：「以下是三個方向建議，不是既定事實 —— 選一個改寫，或直接覆蓋成你自己的想法。」
` +
        `6. 只輸出建議本身，不要前言、不要 markdown 圍欄。
` +
        hintBlock +
        brandPrefix;
      const system =
        `你是資深行銷企劃，負責把用戶填寫的任務素材「潤飾整理」成一份清楚、可直接交給執行 agent 的 brief。\n` +
        `這份素材會被用在任務：「${taskHint}」${qHint}。\n` +
        `嚴格規則：\n` +
        `1. 只整理與澄清用戶寫的內容，**絕對不可以新增、捏造任何事實**（數字、日期、獎項、客戶名、成效都不可自己生）。\n` +
        `2. 用戶提供的具體事實（數字/名稱/時間/連結）**逐字保留**，不要改寫。\n` +
        `3. 把內容整理成有結構、重點清楚、執行 agent 一看就懂的敘述；可分段、可條列。\n` +
        `4. 若缺少這個任務明顯需要的關鍵資訊，用「[請補充：XXX]」標出來，不要自己填。\n` +
        `5. 保持用戶原本的語言（繁體中文）與意圖，不要過度擴寫、不要換掉語氣。\n` +
        `6. 只輸出整理後的素材本身，不要前言、不要解釋、不要 markdown 圍欄。\n` +
        urlRule +
        hintBlock +
        brandPrefix;

      try {
        const r = await callModel(
          [
            { role: "system", content: proposeMode ? proposeSystem : system },
            { role: "user", content: input.text + urlBlock },
          ],
          undefined,
          "anthropic",
        );
        let polished = (r.content ?? "").trim();
        if (!polished) return { polished: "", ok: false, error: "empty" };

        // 2026-09-01：潤稿走的是 callModel，不經過 orchestra 的 caption 迴圈，
        // 所以 wuganVoiceContract 管不到它 —— 實測提案產出仍有 1 處禁用句型。
        //
        // 這裡只做確定性修補、不重試：潤稿是使用者按下去等著看的動作，
        // 多跑一輪模型會讓他多等一倍時間。
        //
        // 提案模式的文字完全由模型生成，一律修。
        // 潤稿模式是在重組使用者自己寫的東西 —— 只有在「使用者原文乾淨、
        // 是模型自己加上去」時才修，否則等於偷改使用者的句子。
        if (polishTemplate && isWuganVoiceTemplate(polishTemplate)) {
          const userHadIssue = validateWuganVoice(input.text) !== null;
          if (proposeMode || !userHadIssue) {
            const before = validateWuganVoice(polished);
            if (before) {
              polished = repairWuganVoice(polished);
              console.warn(
                `[polishInput] wugan-voice ${before.pattern} x${before.count} in ${proposeMode ? "propose" : "polish"} output for ${input.taskId} — repaired`,
              );
            }
          }
        }
        return { polished, ok: true, mode: proposeMode ? "propose" as const : "polish" as const };
      } catch (e: any) {
        return { polished: "", ok: false, error: e?.message ?? String(e) };
      }
    }),

  // 2026-09-16（CJ「要讓用戶可以有地方，輸入原文後改寫就好」）：不用先挑任務卡、
  // 不用先示範三則貼文——貼上一整段既有文案，直接改寫成品牌調性版本。
  // 邏輯在 server/content/core/engine/rewriteDraft.ts（診斷→改寫→CTA 三段內部接力，
  // 只回最終結果，不需要前端驅動多次呼叫）。
  rewriteDraft: protectedProcedure
    .input(z.object({
      material: z.string().min(20).max(8000),
      audience: z.string().max(120).optional(),
      brandId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { rewriteDraft: run } = await import("../../core/engine/rewriteDraft");
      try {
        const result = await run(input);
        return { ...result, ok: true as const };
      } catch (e: any) {
        return { rewritten: "", cta: "", whatChanged: "", ok: false as const, error: e?.message ?? String(e) };
      }
    }),

  // 2026-05-19 (CJ「想對某個影片 title 產出腳本或分鏡」): inline script
  // generation for a specific YT video title. User picks a title from the
  // yt-99-quarterly-strategy "12 影片 title" tab → modal calls this to
  // get a full shooting script without leaving the RunPage.
  generateVideoScript: protectedProcedure
    .input(z.object({
      /** The chosen video title (e.g. "AI 品牌聲音的 3 大指標") */
      videoTitle: z.string().min(1).max(300),
      /** Full text of the "12 影片 title" tab — provides channel context. */
      titleContext: z.string().max(4000).optional(),
      brandId: z.number().optional(),
      productId: z.number().optional(),
      eventId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      try {
        const { preflightCostCheck } = await import("../../../platform/core/llm/llmWithBilling");
        const g = await preflightCostCheck(userId);
        if (!g.ok) throw new TRPCError({ code: "FORBIDDEN", message: g.reason });
      } catch (e) { if (e instanceof TRPCError) throw e; }

      const { callModel } = await import("../../../platform/core/llm/multiModelRouter");

      const contextBlock = input.titleContext
        ? `\n\n【頻道本季其他影片方向（供參考，勿直接複製）】\n${input.titleContext}`
        : "";

      // 2026-09-29（CJ「生文前都要讀取策略層的內容」）：這裡一直收 brandId 卻沒用，
      // 腳本完全不認得品牌。現在讀同一份品牌大腦，語言與市場也照大腦的設定。
      const brandPrefix = await buildBrandContext(input.brandId, input.productId ?? null, input.eventId ?? null).catch(() => "");

      const system = `${brandPrefix ? `# 品牌大腦（腳本的觀點、用詞、語氣都要符合）${brandPrefix}\n\n` : ""}你是資深 YouTube 內容策略師兼腳本撰稿人。
請為以下影片標題撰寫一份完整的拍攝腳本。

【腳本格式】
## 開場 Hook（0–15 秒）
[直接切入，用一句觀察句或反問句抓住注意力；禁止「大家好，歡迎來到…」類介紹腔]

## 主體內容
### 論點 1：[小標題]
[120–200 字完整腳本文字，可直接照念]

### 論點 2：[小標題]
[120–200 字]

### 論點 3：[小標題]
[120–200 字]

（視題目需要可增至 4–5 個論點）

## 收尾（最後 30–45 秒）
[有記憶點的結尾觀點 + 自然的訂閱/留言 CTA，不要爆料腔「快來訂閱」]

【品牌聲音規則】
- 語言與市場照品牌大腦的市場設定（沒有設定時用台灣繁體中文），口語自然但具專業感
- 驚嘆號→句號；無 emoji；無主題標籤
- 所有數字必須有來源邏輯（不捏造統計數字）
- 總字數：800–1400 字`;

      const userMsg = `影片標題：${input.videoTitle}${contextBlock}\n\n請產出這支影片的完整拍攝腳本。`;

      try {
        const r = await callModel(
          [
            { role: "system", content: system },
            { role: "user", content: userMsg },
          ],
          undefined,
          "anthropic",
        );
        const raw = (r.content ?? "").trim();
        if (!raw) return { script: "", ok: false, error: "empty response" };
        // 2026-09-30：腳本也是會被發出去的字——禁用詞＋法規合規檢查。
        const { enforceBrandAndRegulations } = await import("../../core/engine/regulationCompliance");
        const checked = await enforceBrandAndRegulations(input.brandId, raw).catch(() => ({ text: raw, record: null }));
        return { script: checked.text, ok: true, regulationCompliance: checked.record };
      } catch (e: any) {
        return { script: "", ok: false, error: e?.message ?? String(e) };
      }
    }),
};
